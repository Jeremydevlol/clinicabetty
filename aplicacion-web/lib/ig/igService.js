/**
 * Instagram Messaging vía Meta Graph API.
 *
 * Requiere en .env.local:
 *   IG_PAGE_ACCESS_TOKEN   → token de página Facebook con scope pages_messaging + instagram_manage_messages
 *   IG_VERIFY_TOKEN        → string que definís vos para verificar el webhook
 *   IG_BUSINESS_ID         → ID de la cuenta Instagram Business (opcional, para referencia)
 *
 * Almacena en memoria las conversaciones recibidas por webhook. Persistencia real
 * la maneja el front enviando los updates al localStorage del ERP.
 */

const g = globalThis
if (!g.__clinica_ig__) {
  g.__clinica_ig__ = {
    conversations: new Map(), // igUserId → { igUserId, nombre, mensajes:[{autor,texto,ts}], ultimo, agenteActivo, handoffTelefono }
    subscribers: new Set(),
  }
}
const S = g.__clinica_ig__

function publish(evt, payload) {
  for (const cb of S.subscribers) { try { cb(evt, payload) } catch {} }
}

export function subscribe(cb) {
  S.subscribers.add(cb)
  return () => S.subscribers.delete(cb)
}

export function getConversations() {
  return [...S.conversations.values()].sort((a, b) => (b.ultimo || 0) - (a.ultimo || 0))
}

export function getConversation(igUserId) {
  return S.conversations.get(String(igUserId)) || null
}

export function setAgenteActivo(igUserId, activo) {
  const c = S.conversations.get(String(igUserId))
  if (!c) return
  c.agenteActivo = !!activo
  S.conversations.set(String(igUserId), c)
  publish('conv', c)
}

export function setHandoffTelefono(igUserId, telefono) {
  const c = S.conversations.get(String(igUserId)) || { igUserId: String(igUserId), nombre: 'IG user', mensajes: [] }
  c.handoffTelefono = telefono
  c.ultimo = Date.now()
  S.conversations.set(String(igUserId), c)
  publish('conv', c)
}

export function recordIncoming(igUserId, nombre, texto, ts = Date.now()) {
  const id = String(igUserId)
  const existing = S.conversations.get(id) || { igUserId: id, nombre: nombre || 'IG user', mensajes: [], agenteActivo: true }
  existing.nombre = nombre || existing.nombre
  existing.mensajes = [...(existing.mensajes || []), { autor: 'contacto', texto, ts }]
  existing.ultimo = ts
  S.conversations.set(id, existing)
  publish('conv', existing)
  publish('message', { igUserId: id, message: { autor: 'contacto', texto, ts } })
  return existing
}

export function recordOutgoing(igUserId, texto, ts = Date.now()) {
  const id = String(igUserId)
  const existing = S.conversations.get(id) || { igUserId: id, nombre: 'IG user', mensajes: [], agenteActivo: false }
  existing.mensajes = [...(existing.mensajes || []), { autor: 'clinica', texto, ts }]
  existing.ultimo = ts
  S.conversations.set(id, existing)
  publish('conv', existing)
  publish('message', { igUserId: id, message: { autor: 'clinica', texto, ts } })
  return existing
}

/** Envía mensaje por Instagram Graph API Messaging */
export async function sendIgMessage(igUserId, texto) {
  const token = process.env.IG_PAGE_ACCESS_TOKEN
  if (!token) throw new Error('Falta IG_PAGE_ACCESS_TOKEN en .env.local')
  const businessId = process.env.IG_BUSINESS_ID
  if (!businessId) throw new Error('Falta IG_BUSINESS_ID en .env.local')
  const url = `https://graph.instagram.com/v25.0/${businessId}/messages`
  const body = {
    recipient: { id: String(igUserId) },
    message:   { text: String(texto || '') },
    messaging_type: 'RESPONSE',
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[IG sendMsg] error:', JSON.stringify(json?.error || json))
    throw new Error(json?.error?.message || `HTTP ${res.status}`)
  }
  recordOutgoing(igUserId, texto)
  return json
}

/** Intenta enriquecer con nombre real del IG user via Graph API */
export async function fetchIgUserName(igUserId) {
  const token = process.env.IG_PAGE_ACCESS_TOKEN
  if (!token) return null
  try {
    // Usar graph.instagram.com con token de Instagram
    const r = await fetch(`https://graph.instagram.com/v25.0/${encodeURIComponent(igUserId)}?fields=name,username&access_token=${encodeURIComponent(token)}`)
    const j = await r.json()
    if (j.error) console.warn('[IG] fetchIgUserName error:', j.error.message)
    return j.username || j.name || null
  } catch { return null }
}
