#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { messagingApi } from "@line/bot-sdk"
import { z } from "zod"
import crypto from "crypto"
import fs from "fs"
import path from "path"

// --- Config ---
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || ""
const channelSecret = process.env.LINE_CHANNEL_SECRET || ""
const webhookPort = Number(process.env.LINE_WEBHOOK_PORT || 3000)
const configDir = path.join(process.env.HOME || "~", ".claude", "channels", "line")

// --- Sender allowlist ---
const allowlistPath = path.join(configDir, "access.json")
let allowlist: Set<string> = new Set()
let accessPolicy: "open" | "allowlist" = "open"

function loadAllowlist() {
  try {
    if (fs.existsSync(allowlistPath)) {
      const data = JSON.parse(fs.readFileSync(allowlistPath, "utf-8"))
      allowlist = new Set(data.allowed || [])
      accessPolicy = data.policy || "open"
    }
  } catch {}
}

function saveAllowlist() {
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(allowlistPath, JSON.stringify({
    policy: accessPolicy,
    allowed: [...allowlist],
  }, null, 2))
}

loadAllowlist()

// --- Pairing ---
const pendingPairs = new Map<string, string>() // code → userId

function generatePairCode(): string {
  const chars = "abcdefghjkmnopqrstuvwxyz" // no 'l'
  let code = ""
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// --- LINE Client ---
const lineClient = channelAccessToken
  ? new messagingApi.MessagingApiClient({ channelAccessToken })
  : null

function validateSignature(body: string, signature: string): boolean {
  return crypto.createHmac("sha256", channelSecret).update(body).digest("base64") === signature
}

// --- MCP Server ---
const mcp = new Server(
  { name: "line", version: "0.1.0" },
  {
    capabilities: {
      experimental: {
        "claude/channel": {},
        "claude/channel/permission": {},
      },
      tools: {},
    },
    instructions:
      "Messages from LINE arrive as <channel source=\"line\" user_id=\"...\" display_name=\"...\">. " +
      "Reply with the reply tool, passing the user_id from the tag. " +
      "Keep replies concise — LINE has a 5000 character limit.",
  },
)

// --- Reply tool ---
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "reply",
    description: "Send a reply message to a LINE user",
    inputSchema: {
      type: "object" as const,
      properties: {
        user_id: { type: "string", description: "LINE user ID to reply to" },
        text: { type: "string", description: "Message text to send" },
      },
      required: ["user_id", "text"],
    },
  }],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "reply") {
    const { user_id, text } = req.params.arguments as { user_id: string; text: string }
    if (!lineClient) {
      return { content: [{ type: "text" as const, text: "LINE client not configured" }] }
    }

    // Truncate for LINE limit
    const truncated = text.length > 5000
      ? text.substring(0, 4980) + "\n...(truncated)"
      : text

    try {
      await lineClient.pushMessage({ to: user_id, messages: [{ type: "text", text: truncated }] })
      return { content: [{ type: "text" as const, text: "sent" }] }
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Failed: ${err.message}` }] }
    }
  }
  throw new Error(`unknown tool: ${req.params.name}`)
})

// --- Permission relay ---
const PermissionRequestSchema = z.object({
  method: z.literal("notifications/claude/channel/permission_request"),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
})

mcp.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
  if (!lineClient) return

  const msg = `Claude wants to run ${params.tool_name}: ${params.description}\n\nReply "yes ${params.request_id}" or "no ${params.request_id}"`

  // Send to all allowlisted users
  for (const userId of allowlist) {
    try {
      await lineClient.pushMessage({ to: userId, messages: [{ type: "text", text: msg }] })
    } catch {}
  }
})

// --- Connect MCP ---
await mcp.connect(new StdioServerTransport())

// --- Permission verdict regex ---
const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i

// --- LINE Webhook Server ---
if (!channelAccessToken || !channelSecret) {
  console.error("[line-channel] LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET required")
  console.error("[line-channel] Run /line:configure <token> <secret> to set them")
} else {
  Bun.serve({
    port: webhookPort,
    hostname: "0.0.0.0",
    async fetch(req) {
      const url = new URL(req.url)

      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({ status: "ok", channel: "line" })
      }

      if (req.method === "POST" && url.pathname === "/webhook") {
        const body = await req.text()
        const signature = req.headers.get("x-line-signature") || ""

        if (!validateSignature(body, signature)) {
          return new Response("Invalid signature", { status: 403 })
        }

        const parsed = JSON.parse(body)
        for (const event of parsed.events) {
          if (event.type !== "message" || event.message.type !== "text") continue

          const userId = event.source.userId
          const text = event.message.text

          // Gate on sender
          if (accessPolicy === "allowlist" && !allowlist.has(userId)) {
            // Unpaired user — generate pairing code
            const code = generatePairCode()
            pendingPairs.set(code, userId)
            try {
              await lineClient!.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: "text", text: `Your pairing code: ${code}\n\nIn Claude Code, run:\n/line:access pair ${code}` }],
              })
            } catch {}
            continue
          }

          // Check for permission verdict
          const m = PERMISSION_REPLY_RE.exec(text)
          if (m) {
            await mcp.notification({
              method: "notifications/claude/channel/permission" as any,
              params: {
                request_id: m[2].toLowerCase(),
                behavior: m[1].toLowerCase().startsWith("y") ? "allow" : "deny",
              },
            })
            continue
          }

          // Forward to Claude as channel event
          let displayName = "Unknown"
          try {
            const profile = await lineClient!.getProfile(userId)
            displayName = profile.displayName
          } catch {}

          await mcp.notification({
            method: "notifications/claude/channel" as any,
            params: {
              content: text,
              meta: { user_id: userId, display_name: displayName },
            },
          })
        }

        return Response.json({ status: "ok" })
      }

      return new Response("Not Found", { status: 404 })
    },
  })

  console.error(`[line-channel] Webhook server on port ${webhookPort}`)
  console.error(`[line-channel] Webhook URL: http://localhost:${webhookPort}/webhook`)
}
