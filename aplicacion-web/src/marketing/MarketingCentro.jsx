import { useState, useEffect, useRef, createContext, useContext } from "react"
import {
  Upload, Eye, MessageCircle, Plus, ChevronLeft, ChevronRight, Mic, Square,
  CheckCircle2, AlertTriangle, ClipboardList, Bot, Download,
} from "lucide-react"

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setMatches(mq.matches)
    mq.addEventListener("change", fn)
    setMatches(mq.matches)
    return () => mq.removeEventListener("change", fn)
  }, [query])
  return matches
}

const MarketingCentroCtx = createContext(null)

// ─── SECTION: MARKETING CENTRO (Campañas + IG + WhatsApp) ──────
function CentroMarketingBody({ data, setData, clinic }) {
  const { C, inp, Btn, FG, TabBar, TODAY } = useContext(MarketingCentroCtx)

  const compact = useMediaQuery("(max-width: 1024px)")
  const phone   = useMediaQuery("(max-width: 640px)")
  const [sub, setSub] = useState("campanas")

  // Estado persistente
  const mc = data.marketingCentro || { campanas: [], ig: { cuenta: "", conversaciones: [] }, wa: { numero: "", conversaciones: [] } }
  const setMC = patch => setData(d => ({ ...d, marketingCentro: { ...(d.marketingCentro || mc), ...patch } }))

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, fontFamily: "'DM Serif Display', serif" }}>Marketing</h2>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Gestiona campañas y conversa con pacientes por Instagram y WhatsApp.</p>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginBottom: 16 }}>
        <div style={{ minWidth: phone ? 360 : undefined }}>
          <TabBar
            tabs={[
              { id: "campanas", label: "Campañas" },
              { id: "ig",       label: "Mensajes Instagram" },
              { id: "wa",       label: "Mensajes WhatsApp" },
              { id: "agente",   label: "Asistente" },
            ]}
            active={sub}
            onChange={setSub}
          />
        </div>
      </div>

      {sub === "campanas" && <MC_Campanas mc={mc} setMC={setMC} compact={compact} phone={phone} />}
      {sub === "ig"       && <MC_Mensajeria mc={mc} setMC={setMC} compact={compact} phone={phone} canal="ig"    label="Instagram" color="#E1306C" />}
      {sub === "wa"       && <MC_Mensajeria mc={mc} setMC={setMC} compact={compact} phone={phone} canal="wa"    label="WhatsApp"  color="#25D366" />}
      {sub === "agente"   && <MC_Agente compact={compact} phone={phone} clinic={clinic} />}
    </div>
  )
}

// ── Subsección: Campañas ────────────────────────────────────────
function MC_Campanas({ mc, setMC, compact, phone }) {
  const { C, inp, Btn, FG, TabBar, TODAY } = useContext(MarketingCentroCtx)

  const [form, setForm] = useState({ nombre: "", canal: "wa", mensaje: "", publico: "todos", fechaInicio: TODAY, fechaFin: "", estado: "borrador" })
  const [editId, setEditId] = useState(null)

  const campanas = mc.campanas || []

  const save = () => {
    if (!form.nombre.trim() || !form.mensaje.trim()) return alert("Nombre y mensaje son obligatorios")
    if (editId != null) {
      setMC({ campanas: campanas.map(c => c.id === editId ? { ...c, ...form } : c) })
    } else {
      const nextId = campanas.length ? Math.max(...campanas.map(c => c.id)) + 1 : 1
      setMC({ campanas: [...campanas, { id: nextId, ...form, creado: TODAY, metricas: { enviados: 0, leidos: 0, respuestas: 0 } }] })
    }
    setForm({ nombre: "", canal: "wa", mensaje: "", publico: "todos", fechaInicio: TODAY, fechaFin: "", estado: "borrador" })
    setEditId(null)
  }

  const remove = id => {
    if (!confirm("¿Eliminar campaña?")) return
    setMC({ campanas: campanas.filter(c => c.id !== id) })
  }

  const edit = c => {
    setEditId(c.id)
    setForm({ nombre: c.nombre, canal: c.canal, mensaje: c.mensaje, publico: c.publico, fechaInicio: c.fechaInicio, fechaFin: c.fechaFin || "", estado: c.estado })
  }

  const toggleEstado = c => {
    const next = c.estado === "activa" ? "pausada" : "activa"
    setMC({ campanas: campanas.map(x => x.id === c.id ? { ...x, estado: next } : x) })
  }

  const canalLbl = ca => ({ wa: "WhatsApp", ig: "Instagram", ambos: "Ambos" }[ca] || ca)
  const estadoColor = e => ({ borrador: "#8C8C8C", activa: "#22C55E", pausada: "#F59E0B", finalizada: "#64748B" }[e] || C.muted)

  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1.2fr", gap: 16, alignItems: "start" }}>
      {/* Formulario nueva/edit campaña */}
      <div style={{ background: C.card, borderRadius: 16, padding: phone ? 14 : 20, border: "1px solid #E8E0D6", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{editId ? "Editar campaña" : "Nueva campaña"}</h3>
        <FG label="Nombre" full>
          <input style={inp} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Promo limpieza dental agosto" />
        </FG>
        <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr", gap: 12, marginTop: 10 }}>
          <FG label="Canal">
            <select style={inp} value={form.canal} onChange={e => setForm({ ...form, canal: e.target.value })}>
              <option value="wa">WhatsApp</option>
              <option value="ig">Instagram</option>
              <option value="ambos">Ambos</option>
            </select>
          </FG>
          <FG label="Público">
            <select style={inp} value={form.publico} onChange={e => setForm({ ...form, publico: e.target.value })}>
              <option value="todos">Todos</option>
              <option value="activos">Pacientes activos</option>
              <option value="reactivacion">Reactivación (&gt;30d)</option>
              <option value="cumple">Cumpleañeros del mes</option>
            </select>
          </FG>
        </div>
        <FG label="Mensaje" full>
          <textarea style={{ ...inp, minHeight: 100 }} value={form.mensaje} onChange={e => setForm({ ...form, mensaje: e.target.value })} placeholder="Hola {nombre}, este mes…" />
        </FG>
        <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr", gap: 12, marginTop: 10 }}>
          <FG label="Fecha inicio">
            <input type="date" style={inp} value={form.fechaInicio} onChange={e => setForm({ ...form, fechaInicio: e.target.value })} />
          </FG>
          <FG label="Fecha fin">
            <input type="date" style={inp} value={form.fechaFin} onChange={e => setForm({ ...form, fechaFin: e.target.value })} />
          </FG>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <Btn onClick={save} style={{ flex: 1, minWidth: 120, justifyContent: "center" }}>{editId ? "Guardar cambios" : "Crear campaña"}</Btn>
          {editId && <Btn variant="outline" onClick={() => { setEditId(null); setForm({ nombre: "", canal: "wa", mensaje: "", publico: "todos", fechaInicio: TODAY, fechaFin: "", estado: "borrador" }) }}>Cancelar</Btn>}
        </div>
      </div>

      {/* Lista campañas */}
      <div style={{ background: C.card, borderRadius: 16, padding: phone ? 14 : 20, border: "1px solid #E8E0D6", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>Campañas ({campanas.length})</h3>
          <span style={{ fontSize: 11, color: C.muted }}>Tocá para editar · play/pause cambia estado</span>
        </div>
        {campanas.length === 0 && <p style={{ fontSize: 13, color: C.muted, padding: "22px 0", textAlign: "center" }}>Sin campañas todavía.</p>}
        {campanas.map(c => (
          <div key={c.id} style={{ border: `1px solid ${C.subtle}`, borderRadius: 12, padding: 12, marginBottom: 10, background: "#FAFAF7" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{c.nombre}</span>
                  <span style={{ fontSize: 10, background: "#EEF5F5", color: "#0C6A73", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{canalLbl(c.canal)}</span>
                  <span style={{ fontSize: 10, background: estadoColor(c.estado) + "20", color: estadoColor(c.estado), padding: "2px 8px", borderRadius: 6, fontWeight: 600, textTransform: "uppercase" }}>{c.estado}</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
                  {c.publico === "todos" ? "Todos" : c.publico === "activos" ? "Pacientes activos" : c.publico === "reactivacion" ? "Reactivación" : "Cumpleañeros"} · {c.fechaInicio}{c.fechaFin ? ` → ${c.fechaFin}` : ""}
                </div>
                <div style={{ fontSize: 12.5, color: "#1F2A2E", background: "#fff", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.subtle}`, whiteSpace: "pre-wrap" }}>{c.mensaje}</div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Upload size={11} strokeWidth={2.2}/> {c.metricas?.enviados || 0} enviados</span>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><Eye size={11} strokeWidth={2.2}/> {c.metricas?.leidos || 0} leídos</span>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><MessageCircle size={11} strokeWidth={2.2}/> {c.metricas?.respuestas || 0} respuestas</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Btn sm variant="outline" onClick={() => toggleEstado(c)}>{c.estado === "activa" ? "Pausar" : "Activar"}</Btn>
                <Btn sm variant="outline" onClick={() => edit(c)}>Editar</Btn>
                <Btn sm variant="outline" onClick={() => remove(c.id)} style={{ color: C.danger }}>✕</Btn>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Subsección: Mensajería (WhatsApp vía Baileys o Instagram vía Meta) ──
function MC_Mensajeria({ mc, setMC, compact, phone, canal, label, color }) {
  if (canal === "wa") return <MC_WhatsApp color={color} label={label} phone={phone} />
  return <MC_Instagram color={color} label={label} phone={phone} />
}

// ── WhatsApp con Baileys (QR pairing + SSE en tiempo real) ──────
function MC_WhatsApp({ color, label, phone }) {
  const { C, inp, Btn, FG, TabBar, TODAY } = useContext(MarketingCentroCtx)

  const [status, setStatus] = useState({ status: "disconnected", qr: null, user: null, lastError: null })
  const [chats, setChats] = useState([])
  const [selectedJid, setSelectedJid] = useState(null)
  const [messages, setMessages] = useState([])
  const [texto, setTexto] = useState("")
  const [mostrarLista, setMostrarLista] = useState(true)
  const esRef = useRef(null)
  const selectedJidRef = useRef(null)

  useEffect(() => {
    selectedJidRef.current = selectedJid
  }, [selectedJid])

  // SSE: eventos en vivo
  useEffect(() => {
    let poll = null
    const refreshSnapshot = () => {
      fetch("/api/wa/status").then(r => r.json()).then(setStatus).catch(() => {})
      fetch("/api/wa/chats").then(r => r.json()).then(j => setChats(j.chats || [])).catch(() => {})
    }
    refreshSnapshot()

    // auto-init al abrir la pestaña (siempre no-bloqueante)
    fetch("/api/wa/init", { method: "POST" }).catch(() => {})

    const es = new EventSource("/api/wa/events")
    esRef.current = es
    es.addEventListener("status", e => { try { setStatus(JSON.parse(e.data)) } catch {} })
    es.addEventListener("chats",  e => { try { setChats(JSON.parse(e.data).chats || []) } catch {} })
    es.addEventListener("message", e => {
      try {
        const { jid, message } = JSON.parse(e.data)
        setChats(cs => {
          const existing = cs.find(c => c.jid === jid)
          const upd = { jid, nombre: existing?.nombre || jid.split("@")[0], lastTs: message.ts, lastText: message.texto, unread: existing && !message.fromMe ? (existing.unread || 0) + 1 : existing?.unread || 0 }
          const rest = cs.filter(c => c.jid !== jid)
          return [upd, ...rest]
        })
        if (jid === selectedJidRef.current) {
          setMessages(ms => [...ms, message])
        }
      } catch {}
    })
    es.onerror = () => {
      // fallback tipo "socket reconnection": polling rápido si SSE cae
      if (!poll) poll = setInterval(refreshSnapshot, 2000)
    }
    es.onopen = () => {
      if (poll) {
        clearInterval(poll)
        poll = null
      }
    }
    return () => {
      if (poll) clearInterval(poll)
      es.close()
    }
  }, [])

  const conectar = async () => {
    await fetch("/api/wa/init", { method: "POST" })
  }
  const desconectar = async () => {
    if (!confirm("¿Desvincular este dispositivo de WhatsApp?")) return
    await fetch("/api/wa/logout", { method: "POST" })
    setChats([]); setMessages([]); setSelectedJid(null)
  }

  const abrirChat = async (jid) => {
    setSelectedJid(jid); setMostrarLista(false)
    const r = await fetch(`/api/wa/chats?jid=${encodeURIComponent(jid)}`)
    const j = await r.json()
    setMessages(j.messages || [])
  }

  const enviar = async () => {
    if (!texto.trim() || !selectedJid) return
    const t = texto.trim()
    setTexto("")
    try {
      await fetch("/api/wa/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid: selectedJid, texto: t }) })
    } catch (e) { alert("Error al enviar: " + e.message) }
  }

  const nuevoChat = async () => {
    if (status.status !== "connected") return alert("Primero conectá WhatsApp (escaneá el QR)")
    const tel = prompt("Teléfono del contacto (con código de país, sin +):")
    if (!tel) return
    const digits = tel.replace(/[^\d]/g, "")
    if (!digits) return
    const jid = `${digits}@s.whatsapp.net`
    await fetch("/api/wa/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jid, texto: "Hola" }) }).catch(() => {})
    abrirChat(jid)
  }

  const selected = chats.find(c => c.jid === selectedJid)
  const showLista = !phone || mostrarLista || !selected

  // ── Pantalla de pairing QR ─────────────────────────────────────
  if (status.status !== "connected") {
    return (
      <div style={{ background: C.card, borderRadius: 16, padding: phone ? 18 : 28, border: "1px solid #E8E0D6", textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: color + "20", display: "inline-flex", alignItems: "center", justifyContent: "center", color, fontWeight: 700, fontSize: 22, marginBottom: 10 }}>{label[0]}</div>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Conectar WhatsApp</h3>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
          Escaneá el código QR desde WhatsApp en tu teléfono: <b>Ajustes → Dispositivos vinculados → Vincular un dispositivo</b>.
        </p>
        {status.status === "disconnected" && (
          <Btn onClick={conectar} style={{ background: color, borderColor: color }}>Generar QR</Btn>
        )}
        {status.status === "connecting" && (
          <p style={{ fontSize: 13, color: C.muted }}>Conectando… aguardá unos segundos.</p>
        )}
        {status.status === "qr" && status.qr && (
          <div>
            <div style={{ display: "inline-block", padding: 12, background: "#fff", borderRadius: 14, border: "1px solid #E8E0D6", boxShadow: "0 6px 20px rgba(0,0,0,0.06)" }}>
              <img src={status.qr} alt="QR WhatsApp" style={{ width: 240, height: 240, display: "block" }} />
            </div>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>El QR se refresca solo. Si no enlaza, tocá «Regenerar».</p>
            <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <Btn variant="outline" sm onClick={conectar}>Regenerar</Btn>
              <Btn variant="outline" sm onClick={desconectar}>Cancelar</Btn>
            </div>
          </div>
        )}
        {status.lastError && <p style={{ marginTop: 12, fontSize: 11, color: C.danger }}>Error: {status.lastError}</p>}
      </div>
    )
  }

  return (
    <div>
      {/* Header status */}
      <div style={{ background: C.card, borderRadius: 12, padding: 12, border: "1px solid #E8E0D6", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "20", display: "flex", alignItems: "center", justifyContent: "center", color, fontWeight: 700, fontSize: 15 }}>{label[0]}</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{status.user?.name || "Conectado"}</div>
          <div style={{ fontSize: 11, color: "#22C55E", fontWeight: 600 }}>● Online · Baileys</div>
        </div>
        <Btn onClick={nuevoChat} sm><Plus size={14} /> Nuevo</Btn>
        <Btn variant="outline" sm onClick={desconectar} style={{ color: C.danger }}>Desvincular</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "300px 1fr", gap: 12, minHeight: 420 }}>
        {showLista && (
          <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.subtle}`, fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Chats ({chats.length})</div>
            <div style={{ flex: 1, overflowY: "auto", maxHeight: phone ? 440 : 560 }}>
              {chats.length === 0 && <p style={{ fontSize: 12, color: C.muted, padding: "20px 12px", textAlign: "center" }}>Sin chats aún. Los mensajes entrantes aparecerán acá en tiempo real.</p>}
              {chats.map(c => {
                const isSel = c.jid === selectedJid
                return (
                  <button key={c.jid} onClick={() => abrirChat(c.jid)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: `1px solid ${C.subtle}`, background: isSel ? "#F3F8F8" : "transparent", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
                      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{c.lastTs ? new Date(c.lastTs).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{c.jid.split("@")[0]}</div>
                    {c.lastText && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{c.lastText}</span>
                        {c.unread > 0 && <span style={{ fontSize: 10, background: color, color: "#fff", padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>{c.unread}</span>}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {(!phone || !mostrarLista) && selected && (
          <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.subtle}`, display: "flex", alignItems: "center", gap: 8 }}>
              {phone && <Btn sm variant="outline" onClick={() => setMostrarLista(true)}><ChevronLeft size={13} /></Btn>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.nombre}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{selected.jid.split("@")[0]}</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#FAFAF7", maxHeight: phone ? 340 : 460 }}>
              {messages.length === 0 && <p style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "20px 0" }}>Sin mensajes aún.</p>}
              {messages.map((m, i) => (
                <div key={m.id || i} style={{ display: "flex", justifyContent: m.fromMe ? "flex-end" : "flex-start", marginBottom: 8 }}>
                  <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: 12, background: m.fromMe ? color : "#fff", color: m.fromMe ? "#fff" : C.text, border: m.fromMe ? "none" : `1px solid ${C.subtle}`, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.texto}
                    <div style={{ fontSize: 9, opacity: 0.7, marginTop: 3, textAlign: "right" }}>{new Date(m.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 10, borderTop: `1px solid ${C.subtle}`, display: "flex", gap: 8 }}>
              <input style={{ ...inp, flex: 1 }} placeholder="Escribir mensaje…" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar() } }} />
              <Btn onClick={enviar} style={{ background: color, borderColor: color, flexShrink: 0 }}>Enviar</Btn>
            </div>
          </div>
        )}

        {!phone && !selected && (
          <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
            Seleccioná un chat
          </div>
        )}
      </div>
    </div>
  )
}

// ── Instagram con Meta Graph API (webhook + agente IA + handoff) ──
function MC_Instagram({ color, label, phone }) {
  const { C, inp, Btn, FG, TabBar, TODAY } = useContext(MarketingCentroCtx)

  const [convs, setConvs] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [texto, setTexto] = useState("")
  const [mostrarLista, setMostrarLista] = useState(true)
  const [error, setError] = useState("")

  const cargar = async () => {
    try {
      const r = await fetch("/api/ig/conversations")
      const j = await r.json()
      setConvs(j.conversations || [])
    } catch (e) { setError(e.message) }
  }

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 3500)
    return () => clearInterval(t)
  }, [])

  const selected = convs.find(c => c.igUserId === selectedId) || null

  const enviar = async () => {
    if (!texto.trim() || !selected) return
    const t = texto.trim()
    setTexto("")
    try {
      const r = await fetch("/api/ig/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ igUserId: selected.igUserId, texto: t }) })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      cargar()
    } catch (e) { alert("Error IG: " + e.message) }
  }

  const toggleAgente = async (c) => {
    try {
      await fetch("/api/ig/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ igUserId: c.igUserId, agenteActivo: !c.agenteActivo }) })
      cargar()
    } catch (e) { alert(e.message) }
  }

  const handoffManual = async (c) => {
    const tel = prompt(`Pasar chat de ${c.nombre} a WhatsApp. Teléfono (con código de país):`, c.handoffTelefono || "")
    if (!tel) return
    const r = await fetch("/api/ig/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ igUserId: c.igUserId, telefono: tel }) })
    const j = await r.json()
    if (j.error) return alert(j.error)
    if (j.warning) alert("Handoff parcial: " + j.warning)
    else alert("Handoff completado — seguí el chat en la pestaña WhatsApp")
    cargar()
  }

  const showLista = !phone || mostrarLista || !selected

  return (
    <div>
      <div style={{ background: "#FEF3F8", borderRadius: 12, padding: 12, border: "1px solid #F3D7E5", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "20", display: "flex", alignItems: "center", justifyContent: "center", color, fontWeight: 700, fontSize: 15 }}>{label[0]}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Instagram Direct · Meta Graph API</div>
          <div style={{ fontSize: 11, color: C.muted }}>Webhook entrante + agente IA + handoff a WhatsApp al detectar teléfono</div>
        </div>
      </div>
      {error && <p style={{ fontSize: 11, color: C.danger, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "300px 1fr", gap: 12, minHeight: 420 }}>
        {showLista && (
          <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.subtle}`, fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>DMs ({convs.length})</div>
            <div style={{ flex: 1, overflowY: "auto", maxHeight: phone ? 440 : 560 }}>
              {convs.length === 0 && <p style={{ fontSize: 12, color: C.muted, padding: "20px 12px", textAlign: "center" }}>Sin DMs todavía. Los mensajes entrantes por webhook aparecen acá.</p>}
              {convs.map(c => {
                const isSel = c.igUserId === selectedId
                const last = (c.mensajes || []).slice(-1)[0]
                return (
                  <button key={c.igUserId} onClick={() => { setSelectedId(c.igUserId); setMostrarLista(false) }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: `1px solid ${C.subtle}`, background: isSel ? "#FEF3F8" : "transparent", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</span>
                      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{c.ultimo ? new Date(c.ultimo).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                      {c.agenteActivo && <span style={{ fontSize: 9, background: "#EDE9FE", color: "#6D28D9", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>IA</span>}
                      {c.handoffTelefono && <span style={{ fontSize: 9, background: "#DCFCE7", color: "#166534", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>→ WA</span>}
                    </div>
                    {last && <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last.autor === "clinica" ? "Tú: " : ""}{last.texto}</div>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {(!phone || !mostrarLista) && selected && (
          <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.subtle}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {phone && <Btn sm variant="outline" onClick={() => setMostrarLista(true)}><ChevronLeft size={13} /></Btn>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.nombre}</div>
                <div style={{ fontSize: 11, color: C.muted }}>IG ID {selected.igUserId}</div>
              </div>
              <Btn sm variant={selected.agenteActivo ? "primary" : "outline"} onClick={() => toggleAgente(selected)} style={selected.agenteActivo ? { background: "#6D28D9", borderColor: "#6D28D9" } : {}}>
                {selected.agenteActivo ? "Agente IA ON" : "Agente IA OFF"}
              </Btn>
              <Btn sm variant="outline" onClick={() => handoffManual(selected)}>→ WhatsApp</Btn>
            </div>

            {selected.handoffTelefono && (
              <div style={{ padding: "6px 12px", background: "#F0FDF4", borderBottom: `1px solid ${C.subtle}`, fontSize: 11, color: "#166534" }}>
                ✓ Handoff a WhatsApp activo: {selected.handoffTelefono}
              </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#FAFAF7", maxHeight: phone ? 340 : 430 }}>
              {(selected.mensajes || []).length === 0 && <p style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "20px 0" }}>Sin mensajes.</p>}
              {(selected.mensajes || []).map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.autor === "clinica" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                  <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: 12, background: m.autor === "clinica" ? color : "#fff", color: m.autor === "clinica" ? "#fff" : C.text, border: m.autor === "clinica" ? "none" : `1px solid ${C.subtle}`, fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.texto}
                    <div style={{ fontSize: 9, opacity: 0.7, marginTop: 3, textAlign: "right" }}>{new Date(m.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 10, borderTop: `1px solid ${C.subtle}`, display: "flex", gap: 8 }}>
              <input style={{ ...inp, flex: 1 }} placeholder="Escribir mensaje…" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar() } }} />
              <Btn onClick={enviar} style={{ background: color, borderColor: color, flexShrink: 0 }}>Enviar</Btn>
            </div>
          </div>
        )}

        {!phone && !selected && (
          <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13 }}>
            Seleccioná un DM
          </div>
        )}
      </div>
    </div>
  )
}

// ── Asistente (entrenable: texto, audio, imagen) ───────────
function MC_Agente({ compact, phone, clinic }) {
  const { C, inp, Btn, FG, TabBar, TODAY } = useContext(MarketingCentroCtx)
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState("")
  const [playHistorial, setPlayHistorial] = useState([])
  const [playTexto, setPlayTexto] = useState("")
  const [playImg, setPlayImg] = useState("")
  const [playWaTo, setPlayWaTo] = useState("")
  const [playSendWa, setPlaySendWa] = useState(false)
  const [playBusy, setPlayBusy] = useState(false)
  const [rec, setRec] = useState(null)
  const [recording, setRecording] = useState(false)
  const [nuevoKb, setNuevoKb] = useState({ titulo: "", texto: "" })

  const cargar = async () => {
    try {
      const r = await fetch("/api/agent/config")
      const j = await r.json()
      setCfg(j.config)
    } catch (e) { setError(e.message) }
  }
  useEffect(() => { cargar() }, [])

  const guardar = async (patch) => {
    setSaving(true); setError("")
    try {
      const r = await fetch("/api/agent/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setCfg(j.config)
      setSavedAt(new Date())
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const addKb = async () => {
    if (!nuevoKb.titulo.trim() && !nuevoKb.texto.trim()) return
    const lista = [...(cfg.conocimiento || []), { id: "k" + Date.now(), titulo: nuevoKb.titulo.trim(), texto: nuevoKb.texto.trim() }]
    await guardar({ conocimiento: lista })
    setNuevoKb({ titulo: "", texto: "" })
  }
  const delKb = async (id) => {
    const lista = (cfg.conocimiento || []).filter(k => k.id !== id)
    await guardar({ conocimiento: lista })
  }
  const editKb = (id, campo, valor) => {
    setCfg(c => ({ ...c, conocimiento: (c.conocimiento || []).map(k => k.id === id ? { ...k, [campo]: valor } : k) }))
  }

  const enviarPlay = async () => {
    const img = playImg.trim()
    const txt = playTexto.trim()
    if (!txt && !img) return
    setPlayBusy(true); setError("")
    const userMsg = { autor: "paciente", texto: txt || "(imagen)", imagenes: img ? [img] : [], ts: new Date().toISOString() }
    const hist = [...playHistorial, userMsg]
    setPlayHistorial(hist)
    setPlayTexto(""); setPlayImg("")
    try {
      const r = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historial: hist.slice(0, -1), textoUsuario: txt || "Analizá esta imagen", imagenes: img ? [img] : [], clinicId: clinic }) })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      const bot = { autor: "clinica", texto: j.texto || "(sin respuesta)", meta: j.meta, modeloUsado: j.modeloUsado, ts: new Date().toISOString() }
      setPlayHistorial(h => [...h, bot])

      // Mostrar resultado de agenda si el agente creó un turno
      if (j.turnoCreado) {
        setPlayHistorial(h => [...h, {
          autor: "sistema",
          status: "ok",
          texto: `Turno agendado · ${j.turnoCreado.nombre} · ${j.turnoCreado.sector} · ${j.turnoCreado.fecha} ${j.turnoCreado.hora} · con ${j.turnoCreado.empleadoNombre || "especialista"}`,
          ts: new Date().toISOString(),
        }])
        if (j.confirmacion) {
          setPlayHistorial(h => [...h, {
            autor: "clinica",
            texto: j.confirmacion,
            ts: new Date().toISOString(),
          }])
        }
      }
      if (j.bookingError) {
        setPlayHistorial(h => [...h, {
          autor: "sistema",
          status: "warn",
          texto: `No se pudo agendar: ${j.bookingError}`,
          ts: new Date().toISOString(),
        }])
      }

      // Fallback de agenda desde Playground:
      // si el modelo devuelve intención de agendar con datos completos, creamos turno igual.
      const m = j?.meta || {}
      const d = m?.datos || {}
      const canBookByMeta = (
        (m.accion === "agendar" || m.intencion === "turno" || /\b(turno|cita|agendar|reservar)\b/i.test(txt || "")) &&
        (m.confirmar === true || /\b(confirmo|sí|si|ok|perfecto|dale)\b/i.test(txt || "")) &&
        d?.nombre && d?.telefono && d?.sector && d?.servicio && d?.fecha && d?.hora
      )
      if (!j.turnoCreado && canBookByMeta) {
        const bk = await fetch("/api/agent/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clinicId: clinic, datos: d }),
        })
        const bj = await bk.json().catch(() => ({}))
        if (!bk.ok || bj?.error) {
          setPlayHistorial(h => [...h, {
            autor: "sistema",
            status: "warn",
            texto: `No se pudo agendar: ${bj?.error || "error de agenda"}`,
            ts: new Date().toISOString(),
          }])
        } else if (bj?.turno) {
          setPlayHistorial(h => [...h, {
            autor: "sistema",
            status: "ok",
            texto: `Turno agendado · ${bj.turno.nombre} · ${bj.turno.sector} · ${bj.turno.fecha} ${bj.turno.hora} · con ${bj.turno.empleadoNombre || "especialista"}`,
            ts: new Date().toISOString(),
          }])
          if (bj?.confirmacion) {
            setPlayHistorial(h => [...h, {
              autor: "clinica",
              texto: bj.confirmacion,
              ts: new Date().toISOString(),
            }])
          }
        }
      }

      // Prueba end-to-end desde el playground:
      // 1) manual: checkbox + número destino
      // 2) automático: si el agente devuelve handoff con teléfono
      const autoWaByHandoff = !!(bot?.meta?.handoff && bot?.meta?.telefono)
      const waTargetRaw = autoWaByHandoff ? String(bot.meta.telefono || "") : String(playWaTo || "")
      if ((playSendWa || autoWaByHandoff) && waTargetRaw.trim()) {
        const digits = waTargetRaw.replace(/[^\d]/g, "")
        if (!digits) {
          throw new Error("Número de WhatsApp inválido para envío de prueba.")
        }
        await fetch("/api/wa/init", { method: "POST" }).catch(() => {})
        const waDest = `${digits}@s.whatsapp.net`
        const waRes = await fetch("/api/wa/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jid: waDest, texto: String(bot.texto || "").trim() || "Hola" }),
        })
        const waJson = await waRes.json().catch(() => ({}))
        if (!waRes.ok || waJson?.error) {
          throw new Error(waJson?.error || "No se pudo enviar el mensaje por WhatsApp")
        }
        setPlayHistorial(h => [...h, {
          autor: "clinica",
          texto: autoWaByHandoff
            ? `Autoenviado por handoff a WhatsApp: +${digits}`
            : `Enviado por WhatsApp a +${digits}`,
          ts: new Date().toISOString(),
        }])
      }
    } catch (e) {
      setError(e.message)
      setPlayHistorial(h => [...h, { autor: "clinica", texto: "[error] " + e.message, ts: new Date().toISOString() }])
    } finally { setPlayBusy(false) }
  }

  const grabarToggle = async () => {
    if (recording && rec) {
      rec.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      const chunks = []
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      mr.onstop = async () => {
        setRecording(false)
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" })
        const fd = new FormData()
        fd.append("file", blob, "voz.webm")
        try {
          const r = await fetch("/api/agent/transcribe", { method: "POST", body: fd })
          const j = await r.json()
          if (j.error) throw new Error(j.error)
          setPlayTexto(t => (t ? t + " " : "") + (j.texto || ""))
        } catch (e) { setError(e.message) }
      }
      mr.start()
      setRec(mr); setRecording(true)
    } catch (e) { setError("No pude acceder al micrófono: " + e.message) }
  }

  if (!cfg) return <p style={{ fontSize: 13, color: C.muted, padding: 20 }}>{error || "Cargando configuración…"}</p>

  const kb = cfg.conocimiento || []

  return (
    <div>
      <div style={{ background: "#F5F3FF", borderRadius: 12, padding: 12, border: "1px solid #DDD6FE", marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}><Bot size={18} strokeWidth={2.2}/></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Asistente · multimodal</div>
          <div style={{ fontSize: 11, color: C.muted }}>Texto, voz y visión; entrenable con base de conocimiento. Activo en Instagram y WhatsApp cuando lo habilitás.</div>
        </div>
        {savedAt && <div style={{ fontSize: 11, color: "#065f46" }}>✓ Guardado {savedAt.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</div>}
      </div>

      {error && <p style={{ fontSize: 11, color: C.danger, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: phone || compact ? "1fr" : "1.1fr 1fr", gap: 14 }}>
        {/* Config */}
        <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Identidad del agente</div>
          <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr", gap: 10 }}>
            <FG label="Nombre"><input value={cfg.nombre || ""} onChange={e => setCfg({ ...cfg, nombre: e.target.value })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13 }} /></FG>
            <FG label="Firma"><input value={cfg.firma || ""} onChange={e => setCfg({ ...cfg, firma: e.target.value })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13 }} /></FG>
          </div>
          <FG label="Descripción" full><textarea rows={2} value={cfg.descripcion || ""} onChange={e => setCfg({ ...cfg, descripcion: e.target.value })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} /></FG>
          <FG label="Personalidad (tono, estilo, reglas)" full><textarea rows={4} value={cfg.personalidad || ""} onChange={e => setCfg({ ...cfg, personalidad: e.target.value })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} /></FG>

          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 10 }}>Modelos</div>
          <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
            <FG label="Modelo · Chat"><input value={cfg.modelo || ""} onChange={e => setCfg({ ...cfg, modelo: e.target.value })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13 }} /></FG>
            <FG label="Modelo · Visión/OCR"><input value={cfg.modeloVision || ""} onChange={e => setCfg({ ...cfg, modeloVision: e.target.value })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13 }} /></FG>
            <FG label="Modelo · Audio"><input value={cfg.modeloAudio || ""} onChange={e => setCfg({ ...cfg, modeloAudio: e.target.value })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13 }} /></FG>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr 1fr", gap: 10 }}>
            <FG label={`Temperature (${cfg.temperature ?? 0.4})`}><input type="range" min="0" max="1" step="0.05" value={cfg.temperature ?? 0.4} onChange={e => setCfg({ ...cfg, temperature: parseFloat(e.target.value) })} style={{ width: "100%" }} /></FG>
            <FG label="Max tokens"><input type="number" value={cfg.maxTokens ?? 400} onChange={e => setCfg({ ...cfg, maxTokens: parseInt(e.target.value || "400", 10) })} style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13 }} /></FG>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 10 }}>Activo en canales</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}><input type="checkbox" checked={!!cfg.enabledIg} onChange={e => setCfg({ ...cfg, enabledIg: e.target.checked })} /> Instagram DM</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}><input type="checkbox" checked={!!cfg.enabledWa} onChange={e => setCfg({ ...cfg, enabledWa: e.target.checked })} /> WhatsApp (Baileys)</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={!!cfg.handoffAuto} onChange={e => setCfg({ ...cfg, handoffAuto: e.target.checked })} /> Handoff automático a WA al detectar teléfono</label>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <Btn onClick={() => guardar(cfg)} disabled={saving}>{saving ? "Guardando…" : "Guardar configuración"}</Btn>
            <Btn variant="outline" onClick={cargar}>Recargar</Btn>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 18, marginBottom: 10 }}>Base de conocimiento ({kb.length})</div>
          <p style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Agregá bloques con información clínica, precios, horarios, protocolos, FAQs. El agente los usa como contexto.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {kb.map(k => (
              <div key={k.id} style={{ border: `1px solid ${C.subtle}`, borderRadius: 8, padding: 8, background: "#FAFAF7" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input value={k.titulo} onChange={e => editKb(k.id, "titulo", e.target.value)} placeholder="Título" style={{ flex: 1, padding: 6, border: `1px solid ${C.subtle}`, borderRadius: 6, fontSize: 12, fontWeight: 600 }} />
                  <Btn sm variant="outline" onClick={() => guardar({ conocimiento: kb })} title="Guardar"><Download size={12} strokeWidth={2.2}/></Btn>
                  <Btn sm variant="outline" onClick={() => delKb(k.id)} style={{ color: C.danger, borderColor: C.danger }}>✕</Btn>
                </div>
                <textarea rows={3} value={k.texto} onChange={e => editKb(k.id, "texto", e.target.value)} placeholder="Contenido…" style={{ width: "100%", padding: 6, border: `1px solid ${C.subtle}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", resize: "vertical" }} />
              </div>
            ))}
            <div style={{ border: `1px dashed ${C.subtle}`, borderRadius: 8, padding: 8 }}>
              <input value={nuevoKb.titulo} onChange={e => setNuevoKb({ ...nuevoKb, titulo: e.target.value })} placeholder="Nuevo bloque · título (ej: Horarios, Precios 2026, Protocolo urgencia)" style={{ width: "100%", padding: 6, border: `1px solid ${C.subtle}`, borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 6 }} />
              <textarea rows={3} value={nuevoKb.texto} onChange={e => setNuevoKb({ ...nuevoKb, texto: e.target.value })} placeholder="Contenido del bloque…" style={{ width: "100%", padding: 6, border: `1px solid ${C.subtle}`, borderRadius: 6, fontSize: 12, fontFamily: "inherit", resize: "vertical", marginBottom: 6 }} />
              <Btn sm onClick={addKb}>+ Agregar al conocimiento</Btn>
            </div>
          </div>
        </div>

        {/* Playground */}
        <div style={{ background: C.card, borderRadius: 12, border: "1px solid #E8E0D6", padding: 14, display: "flex", flexDirection: "column", minHeight: 440 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Playground</div>
          <p style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Probá el asistente antes de activarlo: texto, voz e imagen (visión/OCR).</p>

          <div style={{ flex: 1, overflowY: "auto", background: "#FAFAF7", border: `1px solid ${C.subtle}`, borderRadius: 8, padding: 10, marginBottom: 10, maxHeight: 380 }}>
            {playHistorial.length === 0 && <p style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: 20 }}>Aún no chateaste con el agente.</p>}
            {playHistorial.map((m, i) => {
              const isSistema = m.autor === "sistema"
              const isClinica = m.autor === "clinica"
              return (
              <div key={i} style={{ marginBottom: 10, display: "flex", justifyContent: isSistema ? "center" : isClinica ? "flex-start" : "flex-end" }}>
                {isSistema ? (
                  <div style={{ maxWidth: "95%", padding: "7px 12px", borderRadius: 10,
                    background: m.status === "ok" ? "#DCFCE7" : "#FEF3C7",
                    border: m.status === "ok" ? "1px solid #86EFAC" : "1px solid #FCD34D",
                    fontSize: 12, fontWeight: 600,
                    color: m.status === "ok" ? "#15803D" : "#92400E",
                    textAlign: "center",
                    display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {m.status === "ok"
                      ? <CheckCircle2 size={13} strokeWidth={2.2} />
                      : <AlertTriangle size={13} strokeWidth={2.2} />}
                    <span>{m.texto}</span>
                  </div>
                ) : (
                  <div style={{ maxWidth: "85%", padding: "6px 10px", borderRadius: 10, background: isClinica ? "#EDE9FE" : "#E8E0D6", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                    {(m.imagenes || []).map((u, k) => <div key={k} style={{ marginBottom: 4 }}><img src={u} alt="" style={{ maxWidth: 160, borderRadius: 6 }} /></div>)}
                    {m.texto}
                    {m.meta?.handoff && <div style={{ fontSize: 10, color: "#166534", marginTop: 4 }}>&rsaquo; handoff: {m.meta.telefono} ({m.meta.intencion})</div>}
                    {m.meta?.accion === "agendar" && (
                      <div style={{ fontSize: 10, color: "#1D4ED8", marginTop: 4, display:"inline-flex", alignItems:"center", gap:4 }}>
                        <ClipboardList size={10} strokeWidth={2.2} /> intención: agendar {m.meta.confirmar ? "· confirmado" : "· pendiente datos"}
                      </div>
                    )}
                    {m.modeloUsado && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{m.modeloUsado}</div>}
                  </div>
                )}
              </div>
            )})}
            {playBusy && <p style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>Pensando…</p>}
          </div>

          <input value={playImg} onChange={e => setPlayImg(e.target.value)} placeholder="URL de imagen (opcional para visión/OCR)" style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 12, marginBottom: 6 }} />
          <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "1fr auto", gap: 8, marginBottom: 6 }}>
            <input
              value={playWaTo}
              onChange={e => setPlayWaTo(e.target.value)}
              placeholder="Número WhatsApp destino (ej: 34600111222)"
              style={{ width: "100%", padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 12 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text, padding: "0 4px", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={playSendWa} onChange={e => setPlaySendWa(e.target.checked)} />
              Enviar también por WhatsApp
            </label>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <textarea rows={2} value={playTexto} onChange={e => setPlayTexto(e.target.value)} placeholder="Escribí algo o grabá un audio…" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarPlay() } }} style={{ flex: 1, padding: 8, border: `1px solid ${C.subtle}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm variant={recording ? "primary" : "outline"} onClick={grabarToggle} style={recording ? { background: C.danger, borderColor: C.danger } : {}} title={recording ? "Detener" : "Grabar"}>{recording ? <Square size={12} strokeWidth={2.2}/> : <Mic size={12} strokeWidth={2.2}/>}</Btn>
              <Btn sm onClick={enviarPlay} disabled={playBusy} title="Enviar"><ChevronRight size={12} strokeWidth={2.2}/></Btn>
            </div>
          </div>
          {playHistorial.length > 0 && <Btn sm variant="outline" style={{ marginTop: 6 }} onClick={() => setPlayHistorial([])}>Limpiar chat</Btn>}
        </div>
      </div>
    </div>
  )
}

export function MarketingCentroPanel({ data, setData, clinic, C, inp, Btn, FG, TabBar, TODAY }) {
  const value = { C, inp, Btn, FG, TabBar, TODAY }
  return (
    <MarketingCentroCtx.Provider value={value}>
      <CentroMarketingBody data={data} setData={setData} clinic={clinic} />
    </MarketingCentroCtx.Provider>
  )
}
