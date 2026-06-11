/**
 * Baileys WhatsApp — sesión en .wa-auth, init/status/chats/send/SSE.
 */
import pino from "pino"
import { Boom } from "@hapi/boom"
import path from "path"
import fs from "fs"
import QRCodeLib from "qrcode"
import { agentReply, loadConfig, isAgentOpenAIAvailable } from "../agent/agentCore.js"
import { buildReceptionContext } from "../agent/receptionContext.js"

if (!process.env.WS_NO_BUFFER_UTIL) process.env.WS_NO_BUFFER_UTIL = "1"
if (!process.env.WS_NO_UTF_8_VALIDATE) process.env.WS_NO_UTF_8_VALIDATE = "1"

let BAILEYS = null
async function loadBaileys() {
  if (BAILEYS) return BAILEYS
  const mod = await import("@whiskeysockets/baileys")
  BAILEYS = {
    makeWASocket: mod.default,
    multiFileAuthState: mod.useMultiFileAuthState,
    fetchLatestBaileysVersion: mod.fetchLatestBaileysVersion,
    DisconnectReason: mod.DisconnectReason,
  }
  return BAILEYS
}

const ROOT = process.cwd()
const SESS_DIR = path.join(ROOT, ".wa-auth")

const g = globalThis
if (!g.__clinica_erp_wa__) {
  g.__clinica_erp_wa__ = {
    sock: null,
    status: "disconnected",
    qr: null,
    qrText: null,
    user: null,
    lastError: null,
    chats: new Map(),
    messages: new Map(),
    subscribers: new Set(),
    sessionId: "default",
    connectingAt: null,
    reconnectTimer: null,
    watchdogTimer: null,
    reconnectAttempts: 0,
    autoInitStarted: false,
    lastActivityAt: 0,
  }
}
const S = g.__clinica_erp_wa__

if (!g.__clinica_wa_agent_mids__) {
  g.__clinica_wa_agent_mids__ = new Map()
}
const WA_AGENT_SEEN = g.__clinica_wa_agent_mids__
const WA_AGENT_SEEN_TTL = 2 * 60 * 1000

function seenWaMsgRecently(id) {
  if (!id) return false
  const now = Date.now()
  if (WA_AGENT_SEEN.size > 800) {
    for (const [k, t] of WA_AGENT_SEEN) {
      if (now - t > WA_AGENT_SEEN_TTL) WA_AGENT_SEEN.delete(k)
    }
  }
  const prev = WA_AGENT_SEEN.get(id)
  if (prev && now - prev < WA_AGENT_SEEN_TTL) return true
  WA_AGENT_SEEN.set(id, now)
  return false
}

async function handleIncomingAgent({ jid, texto }) {
  const cfg = loadConfig()
  if (!cfg.enabledWa) return
  if (!isAgentOpenAIAvailable()) return

  const receptionContext = buildReceptionContext({ clinicId: 1 })
  const extra = [
    'Contexto operativo (sin agenda en vivo en este despliegue):',
    JSON.stringify(receptionContext),
  ].join('\n\n')

  const full = S.messages.get(jid) || []
  const historial = full.length > 1 ? full.slice(0, -1) : []

  let ai
  try {
    ai = await agentReply({ cfg, historial, textoUsuario: texto, extra, channel: 'wa' })
  } catch (aiErr) {
    console.error('[WA agent]', aiErr?.message || aiErr)
    try {
      await sendText(
        jid,
        'No pudimos procesar el mensaje ahora. Escribí de nuevo en unos segundos o llamá a la clínica; gracias.'
      )
    } catch {
      /* ignore */
    }
    return
  }

  const out = String(ai?.texto || '').trim()
  if (out.length >= 2) {
    await sendText(jid, out)
  }
}

function clearReconnectTimer() {
  if (!S.reconnectTimer) return
  try {
    clearTimeout(S.reconnectTimer)
  } catch {
    /* ignore */
  }
  S.reconnectTimer = null
}

function scheduleReconnect(delayMs = 1500) {
  clearReconnectTimer()
  S.reconnectTimer = setTimeout(() => {
    init(true).catch(() => {})
  }, Math.max(250, Number(delayMs) || 1500))
}

function ensureWatchdogLoop() {
  if (S.watchdogTimer) return
  S.watchdogTimer = setInterval(() => {
    const now = Date.now()
    const connectingFor = S.connectingAt ? now - S.connectingAt : 0
    const inactiveFor = S.lastActivityAt ? now - S.lastActivityAt : Infinity
    if (S.status === "connecting" && connectingFor > 25_000) {
      scheduleReconnect(500)
      return
    }
    if (S.status === "disconnected" && !S.sock) {
      scheduleReconnect(800)
      return
    }
    if (S.status === "connected" && S.sock && inactiveFor > 10 * 60 * 1000) {
      scheduleReconnect(1200)
    }
  }, 15_000)
}

function publish(evt, payload) {
  S.lastActivityAt = Date.now()
  for (const cb of S.subscribers) {
    try {
      cb(evt, payload)
    } catch {
      /* ignore */
    }
  }
}

export function subscribe(cb) {
  S.subscribers.add(cb)
  return () => S.subscribers.delete(cb)
}

export function getStatus() {
  return {
    status: S.status,
    qr: S.qr,
    qrText: S.qrText,
    user: S.user,
    lastError: S.lastError,
  }
}

export function getChats() {
  return [...S.chats.values()]
    .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
    .slice(0, 100)
}

export function getMessages(jid) {
  return S.messages.get(jid) || []
}

function normalizeJid(input) {
  let x = String(input || "").trim()
  if (!x) return null
  if (x.includes("@")) return x
  x = x.replace(/[^\d]/g, "")
  if (!x) return null
  return `${x}@s.whatsapp.net`
}

export async function sendText(jidOrPhone, texto) {
  if (!S.sock || S.status !== "connected") {
    await init(true)
  }
  if (!S.sock || S.status !== "connected") throw new Error("WhatsApp no conectado")
  const jid = normalizeJid(jidOrPhone)
  if (!jid) throw new Error("Destino inválido")
  let res
  try {
    res = await S.sock.sendMessage(jid, { text: String(texto || "") })
  } catch (err) {
    await init(true)
    if (!S.sock || S.status !== "connected") throw err
    res = await S.sock.sendMessage(jid, { text: String(texto || "") })
  }
  const arr = S.messages.get(jid) || []
  const msg = { id: res?.key?.id || String(Date.now()), fromMe: true, texto, ts: Date.now(), autor: "clinica" }
  arr.push(msg)
  S.messages.set(jid, arr.slice(-200))
  const chat = S.chats.get(jid) || { jid, nombre: jid.split("@")[0], unread: 0 }
  S.chats.set(jid, { ...chat, lastTs: msg.ts, lastText: texto })
  publish("message", { jid, message: msg })
  return res
}

export async function logout() {
  try {
    await S.sock?.logout()
  } catch {
    /* ignore */
  }
  S.sock = null
  S.status = "disconnected"
  S.qr = null
  S.qrText = null
  S.user = null
  try {
    fs.rmSync(path.join(SESS_DIR, S.sessionId), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  publish("status", getStatus())
}

export async function init(force = false) {
  if (S.sock && S.status === "connected") return getStatus()
  if (S.status === "qr") return getStatus()
  if (S.status === "connecting") {
    const elapsed = S.connectingAt ? Date.now() - S.connectingAt : 0
    if (!force && elapsed > 0 && elapsed < 20_000) return getStatus()
    try {
      S.sock?.end?.(new Error("reinit-timeout"))
    } catch {
      /* ignore */
    }
    S.sock = null
    S.status = "disconnected"
  }

  S.status = "connecting"
  S.connectingAt = Date.now()
  S.lastActivityAt = Date.now()
  S.lastError = null
  publish("status", getStatus())

  const sessionPath = path.join(SESS_DIR, S.sessionId)
  fs.mkdirSync(sessionPath, { recursive: true })

  const { makeWASocket, multiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = await loadBaileys()
  const { state, saveCreds } = await multiFileAuthState(sessionPath)
  let version
  try {
    ;({ version } = await fetchLatestBaileysVersion())
  } catch {
    version = [2, 3000, 1015901307]
  }

  const logger = pino({ level: "silent" })
  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Clinica ERP", "Chrome", "1.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })
  S.sock = sock

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update
    S.lastActivityAt = Date.now()
    if (qr) {
      S.qrText = qr
      try {
        S.qr = await QRCodeLib.toDataURL(qr, { margin: 1, width: 260 })
      } catch {
        S.qr = null
      }
      S.status = "qr"
      publish("status", getStatus())
    }
    if (connection === "open") {
      clearReconnectTimer()
      S.reconnectAttempts = 0
      S.status = "connected"
      S.connectingAt = null
      S.qr = null
      S.qrText = null
      S.user = sock.user
        ? { id: sock.user.id, name: sock.user.name || sock.user.verifiedName || sock.user.id }
        : null
      publish("status", getStatus())
      ensureWatchdogLoop()
    }
    if (connection === "close") {
      const reason = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : lastDisconnect?.error?.output?.statusCode
      const loggedOut = reason === DisconnectReason.loggedOut
      const errMsg = String(lastDisconnect?.error?.message || "")
      const restartRequired = reason === DisconnectReason.restartRequired || /restart required/i.test(errMsg)
      S.status = loggedOut ? "disconnected" : "connecting"
      S.connectingAt = loggedOut ? null : Date.now()
      S.reconnectAttempts = loggedOut ? 0 : S.reconnectAttempts + 1
      S.sock = null
      S.user = null
      S.lastError = loggedOut
        ? "Sesión cerrada desde el dispositivo"
        : restartRequired
          ? null
          : (lastDisconnect?.error?.message || "Desconectado")
      if (restartRequired) {
        S.qr = null
        S.qrText = null
      }
      publish("status", getStatus())
      if (!loggedOut) {
        const backoff = restartRequired ? 400 : Math.min(10_000, 1200 + S.reconnectAttempts * 600)
        scheduleReconnect(backoff)
      } else {
        clearReconnectTimer()
        S.connectingAt = null
        try {
          fs.rmSync(sessionPath, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    S.lastActivityAt = Date.now()
    if (type !== "notify" && type !== "append") return
    for (const m of messages || []) {
      if (!m?.message) continue
      const jid = m.key.remoteJid
      if (!jid || jid.endsWith("@broadcast")) continue
      const fromMe = !!m.key.fromMe
      const texto = extractText(m.message)
      if (!texto) continue
      const ts = Number(m.messageTimestamp) * 1000 || Date.now()
      const autor = fromMe ? "clinica" : "contacto"
      const entry = { id: m.key.id, fromMe, texto, ts, autor }
      const arr = S.messages.get(jid) || []
      arr.push(entry)
      S.messages.set(jid, arr.slice(-200))
      const existing = S.chats.get(jid) || { jid, nombre: m.pushName || jid.split("@")[0], unread: 0 }
      S.chats.set(jid, {
        ...existing,
        nombre: m.pushName || existing.nombre,
        lastTs: ts,
        lastText: texto,
        unread: fromMe ? existing.unread : (existing.unread || 0) + 1,
      })
      publish("message", { jid, message: entry })
      if (!fromMe) {
        if (seenWaMsgRecently(m.key.id)) continue
        handleIncomingAgent({ jid, texto }).catch((e) => {
          console.warn("[WA agent]", e?.message || e)
        })
      }
    }
  })

  ensureWatchdogLoop()
  return getStatus()
}

function extractText(message) {
  if (!message) return ""
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ""
  )
}

export function markChatRead(jid) {
  const chat = S.chats.get(jid)
  if (chat) S.chats.set(jid, { ...chat, unread: 0 })
}

if (!S.autoInitStarted) {
  S.autoInitStarted = true
  ensureWatchdogLoop()
  setTimeout(() => {
    init(false).catch(() => {})
  }, 250)
}
