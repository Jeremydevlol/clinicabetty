import {
  recordIncoming,
  fetchIgUserName,
  getConversation,
  sendIgMessage,
  setHandoffTelefono,
  setAgenteActivo,
} from '../../../../lib/ig/igService.js'
import { agentReply, loadConfig, transcribe, isAgentOpenAIAvailable } from '../../../../lib/agent/agentCore.js'
import { sendText as sendWaText } from '../../../../lib/wa/baileysService.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Verificación del webhook (Meta envía GET con hub.challenge) */
export async function GET(req) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const chal = url.searchParams.get('hub.challenge')
  const expected = process.env.IG_VERIFY_TOKEN || 'bs-cliniq-verify'
  if (mode === 'subscribe' && token === expected) {
    return new Response(chal, { status: 200 })
  }
  return new Response('forbidden', { status: 403 })
}

async function fetchBufferFromUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

const g = globalThis
if (!g.__clinica_ig_seen_mids__) {
  g.__clinica_ig_seen_mids__ = new Map()
}
const SEEN_MIDS = g.__clinica_ig_seen_mids__
const SEEN_TTL_MS = 10 * 60 * 1000

function seenRecently(mid) {
  if (!mid) return false
  const now = Date.now()
  if (SEEN_MIDS.size > 500) {
    for (const [k, t] of SEEN_MIDS) {
      if (now - t > SEEN_TTL_MS) SEEN_MIDS.delete(k)
    }
  }
  const prev = SEEN_MIDS.get(mid)
  if (prev && now - prev < SEEN_TTL_MS) return true
  SEEN_MIDS.set(mid, now)
  return false
}

/** Recepción de eventos (mensajes entrantes IG) */
export async function POST(req) {
  try {
    const body = await req.json()
    const cfg = loadConfig()
    const entries = body.entry || []
    for (const entry of entries) {
      const messaging = entry.messaging || []
      for (const evt of messaging) {
        if (evt.message?.is_echo) continue
        if (evt.read || evt.delivery || evt.reaction) continue
        if (!evt.message) continue
        const senderId = evt.sender?.id
        if (!senderId) continue

        const mid = evt.message?.mid || null
        if (seenRecently(mid)) {
          console.log(`[IG] mid duplicado ignorado: ${mid}`)
          continue
        }

        const ts = Number(evt.timestamp) || Date.now()
        const texto = evt.message?.text || ''
        const attachments = evt.message?.attachments || []

        const tieneAudio = attachments.some(a => a.type === 'audio' && a.payload?.url)
        const tieneImagen = attachments.some(a => a.type === 'image' && a.payload?.url)
        if (!texto && !tieneAudio && !tieneImagen) {
          console.log('[IG] evento sin contenido procesable — ignorado')
          continue
        }

        const imagenes = attachments.filter(a => a.type === 'image' && a.payload?.url).map(a => a.payload.url)
        const audios = attachments.filter(a => a.type === 'audio' && a.payload?.url).map(a => a.payload.url)

        let audioTexto = ''
        for (const u of audios) {
          try {
            const buf = await fetchBufferFromUrl(u)
            const t = await transcribe({ fileBuffer: buf, filename: 'ig-audio.m4a', mime: 'audio/mp4' })
            if (t) audioTexto += (audioTexto ? '\n' : '') + t
          } catch (e) {
            console.warn('[IG audio]', e.message)
          }
        }

        const textoFinal = [texto, audioTexto].filter(Boolean).join('\n').trim()
        const resumenEntrada = textoFinal || (imagenes.length ? '[imagen enviada]' : '[mensaje sin texto]')

        const igUsername = await fetchIgUserName(senderId).catch(() => null)
        const nombre = igUsername || `IG ${String(senderId).slice(-5)}`
        console.log(`[IG] mensaje de: ${nombre} | username=${igUsername || 'N/A'} | id=${senderId}`)
        recordIncoming(senderId, nombre, resumenEntrada, ts)

        const allowedRaw = process.env.IG_ALLOWED_USERS || ''
        if (allowedRaw.trim()) {
          const allowed = allowedRaw.split(',').map(u => u.trim().toLowerCase()).filter(Boolean)
          const usernameMatch = igUsername && allowed.includes(igUsername.toLowerCase())
          const idMatch = allowed.includes(senderId)
          if (!usernameMatch && !idMatch) {
            console.log(`[IG] usuario no permitido: ${nombre} (${senderId}) — ignorado`)
            continue
          }
          setAgenteActivo(senderId, true)
        }

        const conv = getConversation(senderId)
        const igHabilitado = cfg.enabledIg && conv && conv.agenteActivo !== false
        if (!igHabilitado) continue

        if (!isAgentOpenAIAvailable()) {
          console.warn('[IG] Sin acceso a la API de IA (NEXT_API_PROXY u OPENAI_API_KEY) — no se responde con agente')
          continue
        }

        try {
          const msgs = conv.mensajes || []
          const historialAgente = msgs.length > 0 ? msgs.slice(0, -1) : []
          const { texto: respuesta, meta } = await agentReply({
            cfg,
            historial: historialAgente,
            textoUsuario: textoFinal,
            imagenes,
          })
          const respuestaLimpia = String(respuesta || '').trim()
          if (respuestaLimpia && respuestaLimpia.length >= 2) {
            await sendIgMessage(senderId, respuestaLimpia)
          } else {
            console.log(`[IG] respuesta vacía/residual ignorada (len=${respuestaLimpia.length})`)
          }

          if (meta?.handoff && meta?.telefono) {
            setHandoffTelefono(senderId, meta.telefono)
            const historialTxt = (conv.mensajes || [])
              .slice(-6)
              .map(m => `${m.autor === 'clinica' ? 'Clínica' : 'Paciente'}: ${m.texto}`)
              .join('\n')
            const handoffMsg = `Hola ${conv.nombre || ''}, soy de la clínica. Seguimos por acá el chat que empezamos en Instagram.\n\nResumen:\n${historialTxt}\n\n¿En qué te ayudamos?`
            try {
              await sendWaText(meta.telefono, handoffMsg)
            } catch (e) {
              console.warn('[IG→WA handoff] WA no conectado:', e.message)
            }
          }
        } catch (e) {
          console.error('[IG agent]', e.message)
        }
      }
    }
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
