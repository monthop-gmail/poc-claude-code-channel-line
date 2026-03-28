# Claude Code Channel: LINE

Claude Code channel plugin ที่เชื่อม LINE Bot เข้ากับ Claude Code session ตรงๆ — ไม่ต้องสร้าง server เอง

```
LINE App → LINE Webhook → Channel Plugin (MCP) → Claude Code Session
                                   ↑ reply tool
LINE App ← Push Message ← Channel Plugin ←──────┘
```

## Features

- ส่งข้อความจาก LINE เข้า Claude Code session ที่เปิดอยู่
- Claude ตอบกลับผ่าน LINE ได้ทันที (two-way)
- Permission relay — approve/deny tool use จาก LINE
- Sender allowlist + pairing flow
- ใช้ Claude Code Channels protocol (MCP)

## Setup

### 1. ติดตั้ง

```bash
git clone https://github.com/monthop-gmail/poc-claude-code-channel-line.git
cd poc-claude-code-channel-line
bun install
```

### 2. ตั้งค่า LINE Bot

สร้าง LINE Bot ที่ https://developers.line.biz/console/ แล้วตั้ง env:

```bash
export LINE_CHANNEL_ACCESS_TOKEN=your_token
export LINE_CHANNEL_SECRET=your_secret
```

หรือแก้ `.mcp.json` ใส่ค่าตรงๆ

### 3. รัน Claude Code กับ channel

```bash
claude --dangerously-load-development-channels server:line
```

### 4. ตั้ง Webhook URL

ที่ LINE Developer Console → Messaging API:
- Webhook URL: `http://localhost:3000/webhook` (หรือผ่าน Cloudflare Tunnel)
- เปิด **Use webhook** = ON

### 5. Pair sender

ส่งข้อความจาก LINE จะได้ pairing code กลับมา แล้วรันใน Claude Code:

```
/line:access pair <code>
```

จากนั้น lock ให้เฉพาะ user ที่ pair แล้ว:

```
/line:access policy allowlist
```

## Architecture

```
┌──────────┐     ┌─────────────────┐     ┌──────────────┐
│ LINE App │────▶│ line.ts          │────▶│ Claude Code  │
│          │◀────│ (MCP Channel)   │◀────│ Session      │
└──────────┘     │                 │     │              │
  webhook POST   │ • channel event │     │ • reads event│
  push message   │ • reply tool    │     │ • calls tool │
                 │ • permission    │     │ • works on   │
                 │   relay         │     │   your files │
                 └─────────────────┘     └──────────────┘
                   stdio transport
```

## LINE Commands (ใน Chat)

| พิมพ์ | ผลลัพธ์ |
|------|--------|
| ข้อความปกติ | ส่งเข้า Claude session |
| `yes <code>` | อนุมัติ permission request |
| `no <code>` | ปฏิเสธ permission request |

## vs เดิม (botforge server)

| | เดิม (botforge) | Channel plugin (ใหม่) |
|---|---|---|
| สถาปัตยกรรม | LINE → HTTP Server → Agent SDK → Claude | LINE → MCP Channel → Claude session ตรงๆ |
| ต้องสร้าง server | ✅ ต้องสร้าง agent-service | ❌ ไม่ต้อง |
| Docker | ✅ 4 containers | ❌ ไม่จำเป็น |
| Session management | สร้างเอง | ✅ ใช้ของ Claude Code |
| Permission relay | ❌ | ✅ approve/deny จาก LINE |
| ต้องรัน Claude Code | ❌ agent-service รันแทน | ✅ ต้องเปิด session |

## Requirements

- Claude Code v2.1.80+
- Bun runtime
- claude.ai login (OAuth)
- LINE Bot credentials
