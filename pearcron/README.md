# PearCron 🔔

**P2P Cron Broadcaster** — Schedule reminders on one device, receive them on all your devices. No server, no account, no setup. Pure peer-to-peer via Hyperswarm.

> 🏆 Submitted to the **Trac Systems Intercom Vibe Competition**
> Author: trac1x82xsta8850q7hgdt75zu9q5nje8t6f3dpdu0ysnyt0pqs3wughsavgpe8

---

## What Is PearCron?

PearCron lets you type a reminder command on your phone (Termux) and have it fire on your laptop at the same time — and vice versa. It works entirely peer-to-peer using [Hyperswarm](https://github.com/holepunchto/hyperswarm), the same networking layer that powers the Pear Runtime.

**Real-world use cases:**
- 📱→💻 Set a "deploy check" reminder on your phone, see it on your desktop
- 👥 Shared standups for a small team with no Slack/Telegram dependency
- ⏰ Recurring "drink water" / "take a break" reminders synced across devices
- 🤖 Trigger automation agents at scheduled intervals via P2P

---

## Features

- ✅ One-shot and repeating reminders
- ✅ Broadcasts to all peers on the same named channel
- ✅ Zero server, zero account, zero database
- ✅ Works on Termux (Android), Linux, macOS, Windows WSL
- ✅ Simple English-like CLI (`remind 10m "Check logs"`)
- ✅ Live peer connection status
- ✅ Noise-protocol encrypted transport (Hyperswarm default)
- ✅ Lightweight — under 300 lines of code

---

## Installation

### 🤖 Termux (Android)

```bash
# 1. Install Node.js
pkg update && pkg upgrade -y
pkg install nodejs git -y

# 2. Clone the repo
git clone 
cd pearcron

# 3. Install dependencies
npm install

# 4. Run
node index.js
```

### 💻 Desktop (Linux / macOS / WSL)

```bash
git clone
cd pearcron
npm install
node index.js
```

> **Requirement:** Node.js 18 or higher. Check with `node --version`.

---

## Usage

### Start the agent

```bash
# Default channel (named "default")
node index.js

# Custom named channel — MUST match on all your devices
node index.js --channel myteam
node index.js myteam
```

> 💡 All peers who join the **same channel name** receive each other's reminders.

---

### Commands

```
remind <time> "<message>"     Schedule a one-shot reminder
repeat <interval> "<message>" Schedule a repeating reminder
cancel <id>                   Cancel a job by its ID
list                          Show all active jobs on this peer
peers                         Show number of connected peers
ping                          Send a connectivity ping to all peers
help                          Show help
exit                          Graceful shutdown
```

### Time Format

| You type | Means |
|----------|-------|
| `30s` | 30 seconds |
| `5m` | 5 minutes |
| `2h` | 2 hours |
| `1d` | 1 day |

---

### Examples

```bash
# Remind yourself to check server logs in 10 minutes
remind 10m "Check server logs"

# Remind the whole team every hour to do a status update
repeat 1h "📢 Team status update — drop your update in the channel"

# Set a 30-second test reminder
remind 30s "Hello from PearCron!"

# Cancel job #2
cancel 2

# See what's scheduled
list

# Check how many peers are online
peers
```

---

## Multi-Device Setup (The Magic 🪄)

Open **two terminals** (or Termux + desktop) and run:

```bash
# Terminal 1 — your phone (Termux)
node index.js --channel mydevices

# Terminal 2 — your laptop
node index.js --channel mydevices
```

Now type in Terminal 1:
```
remind 15s "Hello from my phone!"
```

Both terminals will display the reminder when it fires in 15 seconds. ✅

---

## How It Works

```
Phone (Termux)                    Laptop
┌─────────────┐   Hyperswarm   ┌──────────────┐
│  PearCron   │◄──────────────►│   PearCron   │
│             │   P2P / UDP    │              │
│ remind 5m   │   (no server)  │ 🔔 REMINDER! │
│ "Stand up"  │──────────────► │  "Stand up"  │
└─────────────┘                └──────────────┘
```

1. Both peers join the same **Hyperswarm topic** (derived from the channel name via SHA-256).
2. Hyperswarm handles NAT traversal and peer discovery automatically.
3. When a reminder fires, the scheduling peer **broadcasts a JSON message** to all connected peers.
4. Each peer displays the reminder locally.

---

## Project Structure

```
pearcron/
├── index.js      ← Main application (all logic, ~280 lines)
├── package.json  ← Dependencies
├── SKILL.md      ← Agent instructions & P2P protocol spec
└── README.md     ← This file
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `hyperswarm` | P2P networking (peer discovery + encrypted transport) |
| `b4a` | Buffer ↔ Uint8Array utilities |

No databases. No heavy frameworks. No cloud services.



## License

MIT © [trac1x82xsta8850q7hgdt75zu9q5nje8t6f3dpdu0ysnyt0pqs3wughsavgpe8]

---

## Links

- 🔗 Trac Systems: https://trac.network
- 🔗 Hyperswarm: https://github.com/holepunchto/hyperswarm
- 🔗 Intercom Base Repo: https://github.com/Trac-Systems/intercom
- 🔗 Pear Runtime: https://pears.com
