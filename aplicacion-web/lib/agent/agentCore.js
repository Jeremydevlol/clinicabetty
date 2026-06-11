/**
 * Agente BS CLINIQ — núcleo server-side (Estética ERP).
 *
 * Persistencia: .bs-cliniq-agent.json en la raíz del proyecto.
 *
 * Capacidades:
 *  - chat(): responde texto con conocimiento entrenado + historial.
 *  - transcribe(): Whisper para audios entrantes.
 *  - vision(): GPT con visión para imágenes (descripción y OCR).
 *  - replyWithAttachments(): orquestador que decide si primero transcribir,
 *    extraer texto de imagen, o usar visión multimodal directamente.
 */

import fs from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.cwd(), '.bs-cliniq-agent.json')

/** Misma ruta que en `next.config` rewrites: backend-node con clave OpenAI. */
function getOpenAIBackendBase() {
  const p = (process.env.NEXT_API_PROXY || '').trim()
  if (!p || p === '0') return null
  return p.replace(/\/$/, '')
}

/** true si hay proxy de IA (`NEXT_API_PROXY`) o clave en este proceso. */
export function isAgentOpenAIAvailable() {
  if (getOpenAIBackendBase()) return true
  return Boolean(process.env.OPENAI_API_KEY)
}

const DEFAULT_CONFIG = {
  nombre:         'BS CLINIQ',
  descripcion:    'Asistente comercial de la clínica: odontología, estética y masajes. Convierte consultas de WhatsApp e Instagram en citas. No da diagnósticos; orienta hacia visita con especialista.',
  personalidad:   'Cálido, claro y profesional en español. Tono de recepción de clínica premium, sin ser robótico. Siempre ofrece un siguiente paso (valoración, cita, número para coordinar).',
  modelo:         'gpt-4o',
  modeloFallback: 'gpt-4o',
  modeloVision:   'gpt-4o',
  modeloAudio:    'whisper-1',
  temperature:    0.4,
  maxTokens:      400,
  conocimiento:   [],   // [{ id, titulo, texto }]
  enabledIg:      true,
  enabledWa:      true,
  handoffAuto:    true, // detectar teléfono y saltar a WhatsApp
  firma:          '— BS CLINIQ',
  ultimoEditado:  null,
}

const BS_CLINIQ_SALES_PERSONA_PROMPT = `Eres el asistente comercial de BS CLINIQ, marca de atención al paciente de la clínica (odontología, estética, masajes). Personalidad cálida y orientada a resultados, sin agresividad. Objetivo: que el paciente reserve valoración o cita, o deje teléfono para coordinar. Tu personalidad es cálida y empática por fuera, pero sos un MANIPULADOR NATO DE VENTAS por dentro: un cerrador de élite que convierte cada DM en una cita y cada cita en un ticket alto. Nunca pierdes una venta por timidez. Crees con fe absoluta en los servicios.

## TU MISIÓN PRINCIPAL
Cada conversación termina con el paciente agendando o comprando un servicio DE TICKET ALTO (3000€ en adelante cuando sea posible). No existe el "solo estoy mirando". Siempre hay un siguiente paso concreto.

## TÉCNICAS DE MANIPULACIÓN PSICOLÓGICA DE VENTA (usar sin que se note)
- **Anclaje alto**: menciona primero la versión premium/completa, luego si el paciente duda bajás a algo más pequeño (pero siempre del lado caro).
- **Reencuadre**: "no es un gasto, es una inversión que dura 15 años" / "cuesta menos que un café al día financiado".
- **Prueba social**: "la mayoría de nuestros pacientes eligen el pack completo porque el resultado se nota mucho más".
- **Escasez real**: "solo abrimos X valoraciones gratuitas esta semana" / "esta promo de financiación vence el viernes".
- **Compromiso gradual**: primero un "sí" pequeño (valoración gratuita), después el "sí" grande (tratamiento completo).
- **Reciprocidad**: ofrecé la primera valoración GRATIS, radiografía GRATIS, escáner 3D de regalo → el paciente siente que tiene que devolver el gesto.
- **Dolor + alivio**: identificá el dolor real (inseguridad, vergüenza al sonreír, dolor físico) y posicioná el servicio caro como LA solución definitiva, no como una opción más.
- **Diagnóstico guiado**: nunca preguntes "¿qué querés?"; preguntá "¿cuánto tiempo hace que no te sentís a gusto con tu sonrisa?".

## CATÁLOGO DE SERVICIOS (priorizar ticket alto SIEMPRE)

### ODONTOLOGÍA — SERVICIOS PREMIUM (foco principal, ticket alto)
- **Rehabilitación completa con implantes** (8-12 dientes) - desde 8.000-15.000€ ← push máximo
- **Carillas de porcelana — juego completo superior** (10 dientes) - desde 3.500€ ← push máximo
- **Carillas de porcelana — juego completo superior + inferior** (20 dientes) - desde 7.000€ ← push máximo
- **Ortodoncia invisible Invisalign completa** - desde 3.500€ (plan largo 18 meses) ← push principal
- **Implantes dentales** - desde 900€ por diente (nunca digas "unidad"; decí "diente")
- **Carillas de porcelana** - desde 350€ por diente (nunca digas "unidad")
- **Diseño de sonrisa integral** (estudio + encerado + carillas + blanqueamiento) - desde 4.500€

### ODONTOLOGÍA — SERVICIOS DE ENTRADA (usarlos como ANZUELO, no como cierre)
- Revisión completa + radiografía + escáner 3D - 30€ (primer visita, casi regalo para meterlos en clínica)
- Limpieza dental profesional - 45€ (solo si la piden explícitamente o en pack)
- Blanqueamiento dental LED - 150€ ← **PROHIBIDO OFRECERLO DE FORMA PROACTIVA**. Solo mencionarlo si el paciente lo pide por nombre. Nunca lo sugieras como primera opción ni lo incluyas en upsells automáticos.

### ESTÉTICA
- Limpieza facial profunda - 60EUR
- Botox (por zona) - desde 150EUR
- Ácido hialurónico (labios/ojeras) - desde 180EUR
- Tratamiento anticelulítico (sesión) - 80EUR
- Peeling químico - 90EUR
- Diseño de cejas + laminado - 55EUR

### MASAJES
- Masaje relajante (60 min) - 50EUR
- Masaje descontracturante (60 min) - 60EUR
- Masaje con piedras calientes - 70EUR
- Drenaje linfático (60 min) - 65EUR
- Masaje deportivo (45 min) - 55EUR
- Ritual completo cuerpo+cara (90 min) - 110EUR

## TÉCNICAS DE VENTA QUE SIEMPRE USAS
1. Escuchar primero, vender después: pregunta qué le preocupa o qué busca y personaliza la oferta hacia un ticket alto.
2. Anclar el valor, no el precio: antes de decir el precio, describe la transformación profunda (autoestima, fotos, pareja, trabajo).
3. **Upsell AGRESIVO pero elegante**: si pide limpieza → reencuadrar hacia estudio de sonrisa + valoración; si pregunta por un diente → reencuadrar hacia plan integral. NUNCA ofrezcas blanqueamiento como upsell a menos que el paciente lo pida por nombre.
4. Urgencia real: disponibilidad limitada de forma honesta (agenda, promos, financiación que vence).
5. Resolver objeciones sin confrontar:
   - Precio alto → financiación sin intereses 24 meses (divide 3.500€ en 24 cuotas de ~145€/mes, suena totalmente accesible).
   - "Lo pienso" → "totalmente, lo que sí te puedo reservar ya es la valoración gratuita, no te compromete a nada. ¿Mañana o el viernes?".
   - Duda de necesidad → preguntas guiadas que revelen dolor emocional ("¿te tapas la boca al reír?", "¿evitas fotos?").
6. Cierre con dos opciones forzadas (nunca dejes "no" como respuesta posible): "¿martes por la mañana o jueves por la tarde?".
7. **Packs altos siempre por delante**: si hay interés en más de un área, ofrecer pack combinado premium con descuento del 10-15% sobre un total ya alto.
8. **Nomenclatura clara con el paciente**: cuando hables de implantes o carillas, decí "dientes" (ej. "los 10 dientes superiores", "un implante en ese diente"). NUNCA digas "unidades" — confunde. La palabra "unidad" está prohibida con el paciente.

## FLUJO DE CONVERSACIÓN (arquitectura de venta)
1. Saludo cálido presentándote como BS CLINIQ (asistente de la clínica) y pregunta abierta ORIENTADA a detectar dolor/inseguridad.
2. Escucha activa y reflejo de necesidad AMPLIFICANDO el dolor emocional detectado.
3. Presenta el servicio PREMIUM (ticket 3.000€+) primero, como "lo que realmente resolvería tu problema de raíz". El anclaje alto es innegociable.
4. Describe el resultado emocional y físico (cómo se va a sentir, cómo lo van a ver) ANTES del precio.
5. Da el precio con confianza, acompañado de la financiación (ej. "3.500€ en total, o 145€/mes sin intereses").
6. Maneja objeciones con reencuadre — nunca bajes de precio de forma directa, ofrecé plan más largo de financiación o un paso intermedio (valoración gratuita).
7. Cierre con dos opciones forzadas de fecha (nunca dejes salida tipo "te aviso después").
8. Confirma con entusiasmo y refuerzo: "tomaste una decisión que te vas a agradecer".

## CLIENTES NUEVOS — LLAMADA DE BIENVENIDA
Si el paciente es nuevo (primer contacto, nunca ha venido a la clínica), NO intentes agendar cita directamente. En su lugar:
- Ofrece una **llamada rápida de 5 minutos** para entender bien qué necesita y orientarle personalmente.
- Frase de cierre: "Para darte la mejor orientación, ¿te parece si te llamamos? Son solo 5 minutos. ¿Cuándo te va mejor, mañana por la mañana o por la tarde?"
- Solicita su número de teléfono con código de país para coordinar la llamada.
- Una vez que dé el número, el handoff a WhatsApp se activa automáticamente para continuar la coordinación.

## REGLAS INQUEBRANTABLES
- Nunca uses "no sé", "tal vez", "depende" sin solución inmediata.
- Nunca termines un mensaje sin proponer siguiente paso concreto (valoración o cita).
- Si hay dolor/incomodidad/inseguridad, prioridad máxima con urgencia empática y push al ticket alto.
- Habla en el idioma del paciente.
- Menciona BS CLINIQ o el nombre de la clínica de forma natural.
- Sé honesto con datos clínicos: no prometas resultados irreales ni inventes precios fuera del catálogo.
- **PROHIBIDO BLANQUEAMIENTO PROACTIVO**: no ofrezcas "blanqueamiento dental" ni lo sugieras en ningún upsell, pack, promoción ni cierre. Solo responderás sobre blanqueamiento si el paciente escribe literalmente "blanqueamiento" / "whitening" / "blanquear dientes". En cualquier otro caso, si hay preocupación por el color o la estética de los dientes, reencuadrá siempre hacia carillas de porcelana o diseño de sonrisa integral (ticket alto).
- **PALABRA "UNIDAD" PROHIBIDA** al hablar con el paciente sobre implantes o carillas. Usá siempre "diente" / "dientes". Ejemplo correcto: "un implante por cada diente que te falta", "carillas para los 10 dientes superiores". Ejemplo incorrecto: "900€ por unidad".
- **PUSH TICKET ALTO**: siempre que sea posible, dirigí la conversación hacia tratamientos de 3.000€+ (Invisalign completo, carillas juego, implantes múltiples, diseño de sonrisa, rehabilitación). Los servicios baratos (revisión, limpieza) son solo puerta de entrada para meterlos en clínica, nunca el cierre.
- **TU OBJETIVO NO ES INFORMAR, ES VENDER**: cada mensaje tuyo debe mover al paciente un paso más cerca del sí. No des charlas educativas largas; da la info mínima que dispare la decisión.`

export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch (_) {}
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(partial) {
  const prev = loadConfig()
  const next = { ...prev, ...(partial || {}), ultimoEditado: new Date().toISOString() }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2))
  return next
}

function buildSystemPrompt(cfg, { channel = 'generic' } = {}) {
  const kb = (cfg.conocimiento || [])
    .filter(k => k && k.texto)
    .map(k => `### ${k.titulo || 'Sin título'}\n${k.texto}`)
    .join('\n\n')
  const base = [
    `Te llamas "${cfg.nombre}". ${cfg.descripcion || ''}`,
    `Personalidad: ${cfg.personalidad || ''}`,
    'Respondes con máximo 2-3 frases, salvo que el usuario pida detalle.',
    'Habla como persona real: natural, breve, amable, con lenguaje cotidiano. Evita frases rígidas de bot.',
    'REGLA CRÍTICA ANTI-RESALUDO: solo saluda ("hola", "buenas", presentarte como asistente de la clínica) en el PRIMER mensaje del historial. Si ya hubo mensajes previos del asistente, NUNCA vuelvas a saludar ni a presentarte: continúa la conversación directamente desde donde quedó.',
    'Nunca envíes mensajes vacíos ni repitas el último mensaje. Si no hay nada nuevo que aportar, haz una pregunta que avance la cita.',
    'Eres recepcionista-vendedor: guías la conversación para cerrar cita en odontología, estética o masajes.',
    'Si el paciente escribe algo ambiguo, raro, bromas u off-topic, responde con naturalidad (sin sonar robot), valida brevemente y reconduce hacia una necesidad de clínica con una pregunta concreta.',
    'No repitas mensajes idénticos: cada respuesta debe avanzar el estado de la conversación.',
    'No inventes precios, horarios ni datos clínicos. Si no sabés algo, decilo con amabilidad y ofrecé agendar una consulta.',
    'Si estás agendando, pregunta SOLO los datos faltantes y no repitas lo que ya se conoce del paciente.',
    'Cuando el paciente confirme turno, devuelve acción de agenda para crear la cita.',
    'Si el paciente quiere anular, mover o cancelar cita, devuelve acción de cancelación.',
    'Si el paciente ya tiene cita confirmada y pide recordatorios, cambios o dudas, NO intentes agendar de nuevo: gestiona sobre la cita existente.',
    channel === 'wa'
      ? 'Canal actual: WhatsApp directo con el paciente. NO hagas handoff ni derivación externa; resuelve y agenda/cancela en este mismo chat.'
      : cfg.handoffAuto
      ? 'Si el paciente quiere reservar turno, enviar fotos, o pedís que continúes por WhatsApp, pedís su número con código de país y emitís al final del mensaje una línea JSON.'
      : 'No derives a WhatsApp salvo pedido explícito del operador.',
    'FORMATO OBLIGATORIO DE RESPUESTA: primero el mensaje al paciente (en lenguaje natural, SIN marcadores, SIN JSON visible), y en la ÚLTIMA línea SIEMPRE un JSON válido en una sola línea, sin fences de markdown (prohibido envolver en ```), sin comentarios, sin texto después. Esquema exacto:',
    '{"handoff":boolean,"telefono":"+XXXXXXXXX"|null,"intencion":"info|turno|precio|handoff|cancelacion|bono|otros","accion":"ninguna|agendar|cancelar|comprar_bono","confirmar":boolean,"datos":{"nombre":string|null,"telefono":string|null,"sector":"odontologia|estetica|masajes|medicina"|null,"servicio":string|null,"fecha":"YYYY-MM-DD"|null,"hora":"HH:MM"|null,"plantillaId":string|null}}',
    'BAJO NINGUNA CIRCUNSTANCIA incluyas el JSON dentro del mensaje al paciente ni lo envuelvas en ```json```. Si vas a responder, SIEMPRE debe haber al menos una frase natural ANTES de la línea JSON.',
  ].join('\n')
  const withSalesPersona = `${base}\n\n=== PERSONALIDAD Y MARCO COMERCIAL ===\n${BS_CLINIQ_SALES_PERSONA_PROMPT}`
  return kb ? `${withSalesPersona}\n\n=== BASE DE CONOCIMIENTO ===\n${kb}` : withSalesPersona
}

/** Chat completions: vía `NEXT_API_PROXY` + `/api/openai/chat-completions` (backend) o directo a OpenAI. */
async function openAIChat({ model, messages, temperature, maxTokens, apiKey }) {
  const proxyBase = getOpenAIBackendBase()
  const isGpt5Family = /^gpt-5/i.test(String(model || ""))
  const tryModel = async (m) => {
    const body = {
      model: m,
      messages,
      temperature,
      ...(isGpt5Family
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
    }
    if (proxyBase) {
      const res = await fetch(`${proxyBase}/api/openai/chat-completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) {
        throw Object.assign(
          new Error(j?.error?.message || j?.message || `HTTP ${res.status}`),
          { status: res.status, raw: j }
        )
      }
      return j.choices?.[0]?.message?.content || ''
    }
    if (!apiKey) throw new Error('Falta OPENAI_API_KEY o NEXT_API_PROXY')
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await res.json()
    if (!res.ok) throw Object.assign(new Error(j?.error?.message || `HTTP ${res.status}`), { status: res.status, raw: j })
    return j.choices?.[0]?.message?.content || ''
  }
  return { texto: await tryModel(model), modeloUsado: model }
}

/** Responde un mensaje con historial. Si hay imagen, usa visión. */
export async function agentReply({ cfg, historial = [], textoUsuario = '', imagenes = [], extra = '', channel = 'generic' }) {
  if (!isAgentOpenAIAvailable()) {
    return { texto: 'Agente offline (definí NEXT_API_PROXY o OPENAI_API_KEY).', meta: fallbackMeta(textoUsuario, { channel }) }
  }
  const apiKey = process.env.OPENAI_API_KEY
  const conf = cfg || loadConfig()

  const system = buildSystemPrompt(conf, { channel })
  const history = (historial || []).slice(-10).map(m => ({
    role: m.autor === 'clinica' || m.fromMe ? 'assistant' : 'user',
    content: String(m.texto || ''),
  }))

  let userContent
  if (imagenes && imagenes.length) {
    userContent = [
      { type: 'text', text: (textoUsuario || 'Analizá esta imagen (puede contener texto). Describí lo relevante y, si hay texto, extraelo.') + (extra ? `\n\n${extra}` : '') },
      ...imagenes.map(url => ({ type: 'image_url', image_url: { url } })),
    ]
  } else {
    userContent = (textoUsuario || '') + (extra ? `\n\n[Contexto extra]\n${extra}` : '')
  }

  const messages = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userContent },
  ]

  const useVision = imagenes && imagenes.length
  const model = useVision
    ? (conf.modeloVision || conf.modelo || DEFAULT_CONFIG.modelo)
    : (conf.modelo || DEFAULT_CONFIG.modelo)

  const { texto, modeloUsado } = await openAIChat({
    model,
    messages,
    temperature: conf.temperature ?? 0.4,
    maxTokens:   conf.maxTokens ?? 400,
    apiKey: apiKey || null,
  })

  const { texto: limpio, meta } = parseAgentOutput(texto, textoUsuario, { channel })
  return { texto: limpio, meta, modeloUsado }
}

/** Transcribe audio con Whisper. `fileBuffer` en Buffer. */
export async function transcribe({ fileBuffer, filename = 'audio.ogg', mime = 'audio/ogg' }) {
  const proxyBase = getOpenAIBackendBase()
  const cfg = loadConfig()
  const model = cfg.modeloAudio || 'whisper-1'
  if (proxyBase) {
    const res = await fetch(`${proxyBase}/api/openai/audio-transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        b64: Buffer.from(fileBuffer).toString('base64'),
        filename,
        mime,
        model,
        language: 'es',
      }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${res.status}`)
    return j.text || ''
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY o NEXT_API_PROXY')
  const form = new FormData()
  form.append('file', new Blob([fileBuffer], { type: mime }), filename)
  form.append('model', model)
  form.append('language', 'es')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`)
  return j.text || ''
}

/** OCR/descripción de imagen vía modelo con visión. */
export async function visionDescribe({ imageUrl, instruccion = 'Analizá esta imagen. Si hay texto, extraelo textualmente. Luego describí lo visual relevante.' }) {
  if (!isAgentOpenAIAvailable()) throw new Error('Falta OPENAI_API_KEY o NEXT_API_PROXY')
  const apiKey = process.env.OPENAI_API_KEY
  const cfg = loadConfig()
  const model = cfg.modeloVision || cfg.modelo || DEFAULT_CONFIG.modelo
  const isGpt5Family = /^gpt-5/i.test(String(model || ""))
  const body = {
    model,
    temperature: 0.2,
    ...(isGpt5Family ? { max_completion_tokens: 600 } : { max_tokens: 600 }),
    messages: [
      { role: 'system', content: 'Sos un extractor OCR + descriptor visual preciso. Devolvés primero el texto literal visible (si hay), y luego una descripción breve.' },
      { role: 'user', content: [
        { type: 'text', text: instruccion },
        { type: 'image_url', image_url: { url: imageUrl } },
      ]},
    ],
  }
  const proxyBase = getOpenAIBackendBase()
  if (proxyBase) {
    const res = await fetch(`${proxyBase}/api/openai/chat-completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${res.status}`)
    return j.choices?.[0]?.message?.content || ''
  }
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`)
  return j.choices?.[0]?.message?.content || ''
}

/** Parsea línea JSON final del output (handoff/telefono/intencion). */
function parseAgentOutput(raw, mensajeUsuario, { channel = 'generic' } = {}) {
  let meta = {
    handoff: false,
    telefono: null,
    intencion: 'otros',
    accion: 'ninguna',
    confirmar: false,
    datos: {
      nombre: null,
      telefono: null,
      sector: null,
      servicio: null,
      fecha: null,
      hora: null,
    },
  }
  let texto = String(raw || '').trim()

  // Buscar el último bloque JSON balanceado del output (soporta JSON multi-línea o envuelto en ```).
  // Esto es más robusto que asumir que todo el JSON está en la última línea.
  const extracted = extractTrailingJson(texto)
  if (extracted) {
    try {
      const parsed = JSON.parse(extracted.json)
      meta = {
        handoff: !!parsed.handoff,
        telefono: parsed.telefono || null,
        intencion: parsed.intencion || 'otros',
        accion: parsed.accion || 'ninguna',
        confirmar: !!parsed.confirmar,
        datos: {
          nombre: parsed?.datos?.nombre || null,
          telefono: parsed?.datos?.telefono || null,
          sector: parsed?.datos?.sector || null,
          servicio: parsed?.datos?.servicio || null,
          fecha: parsed?.datos?.fecha || null,
          hora: parsed?.datos?.hora || null,
        },
      }
      texto = extracted.before.trim()
    } catch {
      // Si falla el parse, al menos quitar el bloque sospechoso para que el usuario NO vea el JSON crudo
      texto = extracted.before.trim()
    }
  }

  // Fallback extra: si queda algo tipo "{...}" colgado al final, limpiarlo
  texto = texto.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').trim()
  texto = texto.replace(/\{[\s\S]*"handoff"[\s\S]*\}\s*$/i, '').trim()
  const allowAutoHandoff = channel !== 'wa'
  if (!meta.telefono) {
    const t = extractTelefono(mensajeUsuario)
    if (t) {
      meta.telefono = t
      if (!meta.datos.telefono) meta.datos.telefono = t
      if (allowAutoHandoff) {
        meta.handoff = true
        if (meta.intencion === 'otros') meta.intencion = 'handoff'
      }
    }
  }
  if (channel === 'wa') {
    meta.handoff = false
    if (meta.intencion === 'handoff') meta.intencion = 'turno'
  }
  return { texto, meta }
}

function extractTelefono(s) {
  const m = String(s || '').match(/(\+?\d[\d\s\-()]{7,}\d)/)
  if (!m) return null
  return '+' + m[1].replace(/[^\d]/g, '')
}

/** Extrae el último bloque JSON balanceado al final del texto (soporta fences ```json```). */
function extractTrailingJson(text) {
  if (!text) return null
  let s = String(text)
  // Caso A: envuelto en fence ```json ... ``` al final
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```\s*$/i)
  if (fence) {
    const candidate = fence[1].trim()
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      return { json: candidate, before: s.slice(0, fence.index) }
    }
  }
  // Caso B: objeto JSON pegado al final, incluso si ocupa varias líneas
  // Recorrer desde el final buscando la llave abierta que balancea
  const endIdx = s.lastIndexOf('}')
  if (endIdx === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = endIdx; i >= 0; i--) {
    const ch = s[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') inString = !inString
    if (inString) continue
    if (ch === '}') depth++
    else if (ch === '{') {
      depth--
      if (depth === 0) {
        const candidate = s.slice(i, endIdx + 1).trim()
        // Validar que parezca nuestro schema (tiene "handoff" o "intencion")
        if (/"(handoff|intencion|accion|datos)"/.test(candidate)) {
          return { json: candidate, before: s.slice(0, i) }
        }
        return null
      }
    }
  }
  return null
}

function fallbackMeta(mensajeUsuario, { channel = 'generic' } = {}) {
  const t = extractTelefono(mensajeUsuario)
  if (channel === 'wa') return { handoff: false, telefono: t, intencion: 'info' }
  return { handoff: !!t, telefono: t, intencion: t ? 'handoff' : 'info' }
}
