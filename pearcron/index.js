#!/usr/bin/env node
/**
 * PearCron — P2P Cron Broadcaster
 * A Trac Intercom Vibe Competition Submission
 *
 * Schedule reminders/triggers from any device and broadcast
 * them to all peers on the same channel — no server required.
 *
 * Author : [INSERT_YOUR_TRAC_ADDRESS_HERE]
 * License: MIT
 */

import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import crypto from 'crypto'
import readline from 'readline'
import { setTimeout as sleep } from 'timers/promises'

// ─── ANSI colour helpers (no external dep) ───────────────────────────────────
const c = {
  reset : '\x1b[0m',
  bold  : '\x1b[1m',
  dim   : '\x1b[2m',
  cyan  : '\x1b[36m',
  green : '\x1b[32m',
  yellow: '\x1b[33m',
  red   : '\x1b[31m',
  magenta: '\x1b[35m',
  blue  : '\x1b[34m',
  white : '\x1b[37m',
}
const paint = (color, text) => `${color}${text}${c.reset}`
const bold  = (t) => paint(c.bold, t)
const dim   = (t) => paint(c.dim, t)
const info  = (t) => console.log(paint(c.cyan,    `ℹ  ${t}`))
const ok    = (t) => console.log(paint(c.green,   `✔  ${t}`))
const warn  = (t) => console.log(paint(c.yellow,  `⚠  ${t}`))
const err   = (t) => console.log(paint(c.red,     `✖  ${t}`))
const bell  = (t) => console.log(paint(c.magenta, `🔔 ${t}`))

// ─── Parse human-readable duration string → milliseconds ─────────────────────
// Supports: 10s, 5m, 2h, 1d  (also plain numbers treated as seconds)
function parseDuration(str) {
  if (!str) return null
  const raw = str.trim().toLowerCase()
  const num = parseFloat(raw)
  if (isNaN(num) || num <= 0) return null

  if (raw.endsWith('d'))  return num * 86400_000
  if (raw.endsWith('h'))  return num * 3600_000
  if (raw.endsWith('m'))  return num * 60_000
  if (raw.endsWith('s'))  return num * 1_000
  // bare number → seconds
  return num * 1_000
}

// ─── Format ms → "2h 5m 10s" ─────────────────────────────────────────────────
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (h)   parts.push(`${h}h`)
  if (m)   parts.push(`${m}m`)
  if (sec || parts.length === 0) parts.push(`${sec}s`)
  return parts.join(' ')
}

// ─── Derive a deterministic Hyperswarm topic buffer from a channel name ───────
function channelTopic(name) {
  return crypto.createHash('sha256')
    .update(`pearcron::channel::${name}`)
    .digest()
}

// ─── Unique local ID for this peer session ────────────────────────────────────
const PEER_ID = crypto.randomBytes(4).toString('hex').toUpperCase()

// ─── In-memory job store ──────────────────────────────────────────────────────
let jobCounter = 0
const jobs = new Map()   // id → { id, message, fireAt, repeat, intervalMs, timerId }

// ─── Connected peer connections ───────────────────────────────────────────────
const peers = new Set()

// ─── Broadcast a JSON envelope to all connected peers ────────────────────────
function broadcast(type, payload) {
  const envelope = JSON.stringify({ type, peerId: PEER_ID, ts: Date.now(), payload })
  const buf = b4a.from(envelope)
  for (const conn of peers) {
    try { conn.write(buf) } catch (_) { /* peer gone */ }
  }
}

// ─── Fire a reminder: print locally + broadcast ───────────────────────────────
function fireReminder(job) {
  const now = new Date().toLocaleTimeString()
  bell(`[${now}] REMINDER #${job.id} — ${bold(job.message)}`)
  broadcast('reminder', { jobId: job.id, message: job.message })

  if (!job.repeat) {
    jobs.delete(job.id)
  }
}

// ─── Schedule a new job ───────────────────────────────────────────────────────
function scheduleJob({ message, delayMs, repeat = false, intervalMs = null }) {
  const id = ++jobCounter
  const fireAt = Date.now() + delayMs

  const timerId = repeat
    ? setInterval(() => fireReminder(jobs.get(id)), intervalMs)
    : setTimeout(() => fireReminder(jobs.get(id)), delayMs)

  const job = { id, message, fireAt, repeat, intervalMs, timerId }
  jobs.set(id, job)

  ok(`Job #${id} scheduled — fires in ${bold(fmtDuration(delayMs))}${repeat ? ` then every ${fmtDuration(intervalMs)}` : ''}`)
  ok(`Message: "${bold(message)}"`)

  // Tell peers about the new job
  broadcast('schedule', {
    jobId    : id,
    message,
    delayMs,
    repeat,
    intervalMs,
    fireAt,
  })

  return id
}

// ─── Cancel a job ─────────────────────────────────────────────────────────────
function cancelJob(id) {
  const job = jobs.get(id)
  if (!job) { warn(`No active job with ID #${id}`); return }
  job.repeat ? clearInterval(job.timerId) : clearTimeout(job.timerId)
  jobs.delete(id)
  ok(`Job #${id} cancelled.`)
  broadcast('cancel', { jobId: id })
}

// ─── List all pending jobs ────────────────────────────────────────────────────
function listJobs() {
  if (jobs.size === 0) { info('No active jobs.'); return }
  console.log(bold('\n  ID   Fires In          Repeat   Message'))
  console.log(dim('  ─────────────────────────────────────────────'))
  for (const job of jobs.values()) {
    const remaining = Math.max(0, job.fireAt - Date.now())
    const rep = job.repeat ? `every ${fmtDuration(job.intervalMs)}` : 'once'
    console.log(`  ${paint(c.cyan, `#${String(job.id).padEnd(4)}`)} ${paint(c.yellow, fmtDuration(remaining).padEnd(17))} ${paint(c.green, rep.padEnd(8))}  ${job.message}`)
  }
  console.log()
}

// ─── Handle an incoming message from a peer ───────────────────────────────────
function handlePeerMessage(raw) {
  let envelope
  try { envelope = JSON.parse(raw.toString()) } catch { return }

  const { type, peerId, ts, payload } = envelope
  const ago = Date.now() - ts
  const peer = dim(`[Peer ${peerId}]`)

  switch (type) {
    case 'schedule':
      info(`${peer} Scheduled broadcast — Job #${payload.jobId} fires in ${fmtDuration(Math.max(0, payload.fireAt - Date.now()))}: "${payload.message}"`)
      break

    case 'reminder':
      bell(`${peer} REMINDER FIRED — Job #${payload.jobId}: ${bold(payload.message)}`)
      break

    case 'cancel':
      info(`${peer} Cancelled Job #${payload.jobId}`)
      break

    case 'ping':
      info(`${peer} joined the channel (ping latency ~${ago}ms)`)
      break

    case 'pong':
      info(`${peer} acknowledged your ping (~${ago}ms)`)
      break

    default:
      break
  }
}

// ─── Print help ───────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${bold(paint(c.cyan, '  PearCron — P2P Cron Broadcaster'))} ${dim('(Trac Intercom Vibe)')}

  ${bold('Commands:')}

    ${paint(c.green, 'remind <time> "<message>"')}
      Schedule a one-shot reminder.
      Time examples: 30s, 5m, 2h, 1d
      Ex: remind 10m "Check deployment logs"

    ${paint(c.green, 'repeat <interval> "<message>"')}
      Schedule a repeating reminder.
      Ex: repeat 1h "Drink water 💧"

    ${paint(c.green, 'cancel <id>')}
      Cancel a scheduled job by ID.
      Ex: cancel 3

    ${paint(c.green, 'list')}
      Show all active jobs on this peer.

    ${paint(c.green, 'peers')}
      Show number of connected peers.

    ${paint(c.green, 'ping')}
      Broadcast a ping to all peers.

    ${paint(c.green, 'help')}
      Show this help message.

    ${paint(c.green, 'exit')}
      Gracefully shut down.
`)
}

// ─── Parse and dispatch CLI input ─────────────────────────────────────────────
function handleInput(line) {
  const input = line.trim()
  if (!input) return

  // remind <time> "<message>"
  if (input.startsWith('remind ')) {
    const match = input.match(/^remind\s+(\S+)\s+"(.+)"$/)
    if (!match) { warn('Usage: remind <time> "<message>"  —  e.g. remind 10m "Stand up"'); return }
    const [, timeStr, message] = match
    const delayMs = parseDuration(timeStr)
    if (!delayMs) { err(`Invalid time "${timeStr}". Use: 30s, 5m, 2h, 1d`); return }
    scheduleJob({ message, delayMs })
    return
  }

  // repeat <interval> "<message>"
  if (input.startsWith('repeat ')) {
    const match = input.match(/^repeat\s+(\S+)\s+"(.+)"$/)
    if (!match) { warn('Usage: repeat <interval> "<message>"  —  e.g. repeat 30m "Check server"'); return }
    const [, timeStr, message] = match
    const intervalMs = parseDuration(timeStr)
    if (!intervalMs) { err(`Invalid interval "${timeStr}". Use: 30s, 5m, 2h, 1d`); return }
    scheduleJob({ message, delayMs: intervalMs, repeat: true, intervalMs })
    return
  }

  // cancel <id>
  if (input.startsWith('cancel ')) {
    const idStr = input.slice(7).trim()
    const id = parseInt(idStr, 10)
    if (isNaN(id)) { err('Usage: cancel <id>  —  e.g. cancel 2'); return }
    cancelJob(id)
    return
  }

  switch (input) {
    case 'list':  listJobs(); break
    case 'peers': info(`Connected peers: ${bold(peers.size)}`); break
    case 'ping':  broadcast('ping', {}); info('Ping sent to all peers.'); break
    case 'help':  printHelp(); break
    case 'exit':
    case 'quit':
      ok('Shutting down PearCron. Goodbye! 👋')
      process.exit(0)
      break
    default:
      warn(`Unknown command: "${input}". Type ${bold('help')} for usage.`)
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  // Resolve channel name from argv or default
  const args = process.argv.slice(2)
  let channelName = 'default'
  const chanIdx = args.findIndex(a => a === '--channel' || a === '-c')
  if (chanIdx !== -1 && args[chanIdx + 1]) {
    channelName = args[chanIdx + 1]
  } else if (args[0] && !args[0].startsWith('-')) {
    channelName = args[0]
  }

  // ── Banner ──────────────────────────────────────────────────────────────────
  console.clear()
  console.log(paint(c.cyan, bold(`
  ██████╗ ███████╗ █████╗ ██████╗  ██████╗██████╗  ██████╗ ███╗   ██╗
  ██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔═══██╗████╗  ██║
  ██████╔╝█████╗  ███████║██████╔╝██║     ██████╔╝██║   ██║██╔██╗ ██║
  ██╔═══╝ ██╔══╝  ██╔══██║██╔══██╗██║     ██╔══██╗██║   ██║██║╚██╗██║
  ██║     ███████╗██║  ██║██║  ██║╚██████╗██║  ██║╚██████╔╝██║ ╚████║
  ╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝`)))
  console.log(dim('  P2P Cron Broadcaster — Trac Intercom Vibe Competition\n'))
  info(`Peer ID   : ${bold(PEER_ID)}`)
  info(`Channel   : ${bold(channelName)}`)
  info(`Joining P2P swarm …\n`)

  // ── Hyperswarm setup ────────────────────────────────────────────────────────
  const swarm = new Hyperswarm()
  const topic = channelTopic(channelName)

  swarm.on('connection', (conn, info) => {
    const remoteId = b4a.toString(info.publicKey, 'hex').slice(0, 8).toUpperCase()

    peers.add(conn)
    ok(`Peer connected: ${bold(remoteId)}  (total: ${peers.size})`)

    // Send hello ping
    try {
      conn.write(b4a.from(JSON.stringify({
        type: 'ping', peerId: PEER_ID, ts: Date.now(), payload: {}
      })))
    } catch (_) {}

    conn.on('data', (data) => handlePeerMessage(data))

    conn.on('close', () => {
      peers.delete(conn)
      warn(`Peer disconnected: ${remoteId}  (total: ${peers.size})`)
    })

    conn.on('error', (e) => {
      peers.delete(conn)
    })
  })

  // Join the topic (both as server and client)
  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()

  ok(`Joined channel "${bold(channelName)}" on P2P swarm ✓`)
  console.log(dim('  Type ') + bold('help') + dim(' to see available commands.\n'))
  process.stdout.write(paint(c.cyan, `  [${PEER_ID}] ➜ `))

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const cleanup = async () => {
    info('\nLeaving swarm …')
    for (const job of jobs.values()) {
      job.repeat ? clearInterval(job.timerId) : clearTimeout(job.timerId)
    }
    await swarm.destroy()
    process.exit(0)
  }
  process.on('SIGINT',  cleanup)
  process.on('SIGTERM', cleanup)

  // ── CLI readline interface ───────────────────────────────────────────────────
  const rl = readline.createInterface({
    input : process.stdin,
    output: process.stdout,
    prompt: '',
    terminal: true,
  })

  rl.on('line', (line) => {
    handleInput(line)
    process.stdout.write(paint(c.cyan, `  [${PEER_ID}] ➜ `))
  })

  rl.on('close', cleanup)
}

main().catch((e) => {
  err(`Fatal error: ${e.message}`)
  process.exit(1)
})
