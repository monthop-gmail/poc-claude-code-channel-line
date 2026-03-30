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
- รัน 24/7 ด้วย Docker + Cloudflare Tunnel

## Setup (Docker)

### 1. Clone และตั้งค่า

```bash
git clone https://github.com/monthop-gmail/poc-claude-code-channel-line.git
cd poc-claude-code-channel-line
cp .env.example .env
```

แก้ `.env` ใส่ค่าจริง:

```env
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
CLOUDFLARE_TUNNEL_TOKEN=...
```

### 2. Login Claude บน host (ครั้งแรกครั้งเดียว)

```bash
claude   # login แล้ว ctrl+c ออก
```

### 3. รัน

```bash
docker compose up -d
```

### 4. ตั้ง Webhook URL

ที่ LINE Developer Console → Messaging API:
- Webhook URL: `https://<your-tunnel-domain>/webhook`
- เปิด **Use webhook** = ON

## Architecture

```
┌──────────┐     ┌──────────────────┐     ┌──────────────┐
│ LINE App │────▶│ line.ts           │────▶│ Claude Code  │
│          │◀────│ (MCP Channel)    │◀────│ Session      │
└──────────┘     │                  │     │              │
  webhook POST   │ • channel event  │     │ • reads event│
  push message   │ • reply tool     │     │ • calls tool │
                 │ • permission     │     │ • works on   │
                 │   relay          │     │   your files │
                 └──────────────────┘     └──────────────┘
                    stdio transport

LINE App ──→ cowork-claudecode.sumana.online
               ↓ Cloudflare Tunnel
             cowork-claudecode-line-bot:3000 (Docker)
               ↓ MCP stdio
             Claude Code session
```

## LINE Commands (ใน Chat)

| พิมพ์ | ผลลัพธ์ |
|------|--------|
| ข้อความปกติ | ส่งเข้า Claude session |
| `yes <code>` | อนุมัติ permission request |
| `no <code>` | ปฏิเสธ permission request |

## ข้อจำกัด

- **1 session ต่อ bot** — ทุก LINE user คุยกับ Claude session เดียวกัน ไม่มี context แยกต่อ user
- **ต้องเปิด Claude session ไว้** — ถ้า container restart จะเริ่ม session ใหม่

## Claude Code CLI vs Channel Plugin vs botforge server

| Feature | Claude Code CLI | Channel Plugin (นี้) | botforge server |
|---------|:-:|:-:|:-:|
| เข้าถึง | Terminal เท่านั้น | LINE + Terminal | LINE + Web UI |
| ใช้จากมือถือ | ❌ | ✅ ส่ง LINE ได้ทันที | ✅ LINE + Web UI |
| สร้าง server เอง | ❌ ไม่ต้อง | ❌ ไม่ต้อง | ✅ ต้องสร้าง agent-service |
| Docker containers | 0 | 2 (Claude + Tunnel) | 4 ตัว |
| Permission relay | Terminal เท่านั้น | ✅ approve/deny จาก LINE | ❌ |
| Tool use (Read, Edit, Bash) | ✅ | ✅ | ✅ |
| Session management | ✅ built-in | ✅ ใช้ของ Claude Code | สร้างเอง |
| รัน 24/7 headless | ❌ | ✅ Docker | ✅ Docker |
| Web UI | ❌ | ❌ | ✅ |
| หลาย user (แยก session) | ❌ | ❌ | ✅ |
| Cost tracking | ❌ | ❌ | ✅ ต่อ session |

**Channel plugin** เหมาะกับ: ใช้คนเดียว รัน 24/7 ไม่ต้องการ Web UI

**botforge server** เหมาะกับ: deploy เป็น service + Web UI + หลาย user

## Roadmap

### ✅ Phase 1: 24/7 Headless (Docker)

รัน Claude Code + LINE channel ใน Docker container พร้อม Cloudflare Tunnel — **เสร็จแล้ว**

### Phase 2: Web UI

เพิ่มหน้าเว็บดู session + chat history

### Phase 3: Multi-user

รองรับหลาย user แยก session ต่อ LINE user

## Related Projects

- [poc-claude-code-plugin-line-bot](https://github.com/monthop-gmail/poc-claude-code-plugin-line-bot) — botforge server approach (LINE + Web UI + Docker)
- [poc-opencode-plugin-line-bot](https://github.com/monthop-gmail/poc-opencode-plugin-line-bot) — OpenCode plugin (LINE + `opencode serve`)
- [botforge](https://github.com/monthop-gmail/botforge) — shared agent service

## Requirements

- Docker + Docker Compose
- Claude Code (installed on host for initial login)
- claude.ai account (OAuth)
- LINE Bot credentials
- Cloudflare Tunnel token
