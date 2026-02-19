# SKILL.md — PearCron Agent

> **PearCron** is a P2P Cron Broadcaster built on Hyperswarm.
> It allows any peer on the same named channel to schedule, receive,
> and react to time-triggered reminder messages — with zero central server.

---

## Identity

| Field        | Value                                   |
|--------------|-----------------------------------------|
| Agent Name   | PearCron                                |
| Version      | 1.0.0                                   |
| Author       | [INSERT_YOUR_TRAC_ADDRESS_HERE]         |
| Runtime      | Node.js ≥ 18 (Termux compatible)        |
| Network      | Hyperswarm (Pear-compatible P2P)        |
| Channel Key  | SHA-256 of `pearcron::channel::<name>`  |

---

## What This Agent Does

PearCron lets peers:

1. **Schedule one-shot reminders** — fire once after a delay.
2. **Schedule repeating reminders** — fire on a recurring interval.
3. **Broadcast** scheduled and fired events to **all peers** on the same channel.
4. **Cancel** any active job by ID.
5. **Ping** peers to verify P2P connectivity and measure latency.

All state is **in-memory and ephemeral** — no files, no databases. When the process exits, all jobs are cleared.

---

## How to Start the Agent

```bash
# Join the default channel
node index.js

# Join a named channel (share this name with your peers)
node index.js --channel myteam
node index.js myteam
```

> All peers on the **same channel name** will receive each other's reminders.

---

## CLI Commands (Human Interface)

| Command | Description | Example |
|---|---|---|
| `remind <time> "<msg>"` | One-shot reminder | `remind 10m "Deploy done?"` |
| `repeat <interval> "<msg>"` | Repeating reminder | `repeat 1h "Drink water 💧"` |
| `cancel <id>` | Cancel a job by ID | `cancel 3` |
| `list` | List all active jobs on this peer | `list` |
| `peers` | Show how many peers are connected | `peers` |
| `ping` | Broadcast a ping to all peers | `ping` |
| `help` | Show help | `help` |
| `exit` | Graceful shutdown | `exit` |

### Time Format

| Input | Meaning |
|-------|---------|
| `30s` | 30 seconds |
| `5m`  | 5 minutes |
| `2h`  | 2 hours |
| `1d`  | 1 day |
| `90`  | 90 seconds (bare number = seconds) |

---

## Agent-to-Agent Message Protocol

PearCron peers communicate over raw Hyperswarm connections using newline-terminated JSON envelopes.

### Envelope Schema

```json
{
  "type":    "<event_type>",
  "peerId":  "<4-byte hex ID of sender>",
  "ts":      1234567890123,
  "payload": { }
}
```

### Event Types

#### `schedule`
Emitted when a peer schedules a new job.

```json
{
  "type": "schedule",
  "peerId": "A1B2C3D4",
  "ts": 1700000000000,
  "payload": {
    "jobId":      1,
    "message":    "Deploy done?",
    "delayMs":    600000,
    "repeat":     false,
    "intervalMs": null,
    "fireAt":     1700000600000
  }
}
```

#### `reminder`
Emitted when a job fires on the scheduling peer.

```json
{
  "type": "reminder",
  "peerId": "A1B2C3D4",
  "ts": 1700000600000,
  "payload": {
    "jobId":   1,
    "message": "Deploy done?"
  }
}
```

#### `cancel`
Emitted when a peer cancels a job.

```json
{
  "type": "cancel",
  "peerId": "A1B2C3D4",
  "ts": 1700000300000,
  "payload": {
    "jobId": 1
  }
}
```

#### `ping` / `pong`
Connectivity check. `ping` is sent automatically on peer connect.

```json
{ "type": "ping", "peerId": "A1B2C3D4", "ts": 1700000000000, "payload": {} }
```

---

## How Other Agents Should Interact

If you are building an automated agent that interacts with PearCron:

1. **Connect** to the same Hyperswarm topic: `sha256("pearcron::channel::<channelName>")`.
2. **Listen** for `reminder` events — these are the actionable triggers.
3. **Parse** the `payload.message` field to decide what action to take.
4. Optionally **send** a `schedule` envelope to have PearCron peers mirror your scheduled events.
5. You do **not** need to implement timers — just listen for `reminder` fires.

### Minimal Listener Pseudocode

```js
import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'

const topic = crypto.createHash('sha256')
  .update('pearcron::channel::myteam')
  .digest()

const swarm = new Hyperswarm()
swarm.join(topic, { server: false, client: true })

swarm.on('connection', (conn) => {
  conn.on('data', (data) => {
    const { type, payload } = JSON.parse(data.toString())
    if (type === 'reminder') {
      console.log('ACTION TRIGGERED:', payload.message)
      // your automation logic here
    }
  })
})
```

---

## Security & Privacy Notes

- **No encryption** is applied on top of Hyperswarm's default encrypted transport (Noise protocol). Connections between peers are encrypted at the transport layer.
- The channel name is the shared secret. Use an unguessable channel name for private groups.
- PearCron does **not** store any data to disk. All jobs are lost when the process exits.
- This agent is intended for **trusted peer groups only**.

---

## Limitations

| Constraint | Detail |
|---|---|
| Job persistence | None — in-memory only |
| Max message length | Recommended < 280 chars |
| Max peers | Practical limit ~50 (Hyperswarm default) |
| Platform | Node.js ≥ 18, Termux, Linux, macOS, Windows WSL |

---

## Extending This Agent

Possible extensions for future versions:

- **Persistent jobs** via a flat JSON file (`jobs.json`)
- **Webhook triggers** — fire an HTTP request when a reminder fires
- **Trac contract integration** — log reminder receipts on-chain
- **Encrypted channel names** — derive topic from a password + salt
- **Job sync on connect** — new peers receive current job list on join

---

*Built for the Trac Systems Intercom Vibe Competition.*
*Powered by Hyperswarm — serverless, censorship-resistant P2P networking.*
