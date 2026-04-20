import { useState, useEffect, useMemo, useRef, useCallback, useId } from "react"
import { createPortal } from "react-dom"
import * as XLSX from "xlsx"
import QRCode from "qrcode"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import {
  LayoutDashboard, Calendar, Package, DollarSign, Sparkles,
  Users, AlertTriangle, Plus, X, Trash2, TrendingUp, Search,
  ArrowUpRight, ArrowDownRight, Phone, FileText, ClipboardList,
  UserCog, Download, LogOut, Lock, MessageCircle, Stethoscope,
  CreditCard, Gift, Globe, BarChart3, ShoppingCart, Bell, MonitorPlay, QrCode, Copy, Menu, Smartphone,
  Banknote, Wallet, Delete, Minus, Mic, Loader2, Camera, ScanLine, Square,
  CheckCircle2, Building2, Settings, UserPlus, Pencil, Eraser, Undo2, RotateCcw, Link2, ImagePlus,
  ChevronRight, ChevronLeft, ClipboardCheck, Activity,
} from "lucide-react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from "recharts"
import { supabase } from "./utils/supabase"
import { textoAHtmlParrafos, armarCuerpoConsentimiento, rellenarPlantilla, varsDesdePaciente, cuerpoConsentimientoParaPdf } from "./consentimientos/rellenarPlantilla.js"
import { buildConsentimientoPdfDataUrl, uploadConsentPdfDataUrl, downloadPdfFromArchivedHtml } from "./consentimientos/consentimientoPdf.js"
import { getPlantillasConsentLocales, mergePlantillasConsent } from "./consentimientos/plantillasLocales.js"
import { SignaturePad } from "./consentimientos/SignaturePad.jsx"
import {
  startFaceProportionOverlay,
  detectFaceMeshOnImage,
  drawMediaPipeGuideOnStillCanvas,
  setFaceOverlayOptions,
  setFaceOverlayLiveMirror,
  exportMediapipeCaptureBundle,
} from "./lib/faceProportionOverlay.js"
// ─── CONSTANTS & HELPERS ─────────────────────────────────────
const TODAY = new Date().toISOString().split("T")[0]

/**
 * DeepFace endpoints.
 *
 * - En dev local (npm run dev) usamos los middlewares de Vite: `/api/deepface*`.
 * - En producción (Vercel) no existen esos middlewares. Si VITE_DEEPFACE_URL está
 *   definida (p. ej. https://clinicabetty.onrender.com), el frontend llama directo
 *   a ese servicio HTTP.
 *
 * El análisis clínico-estético combinado (DeepFace + OpenAI Vision) solo funciona
 * con el middleware local. En producción se devuelve solo el resultado de DeepFace
 * y `clinicoError` avisa que se necesita un backend con la key de OpenAI.
 */
const FACE_REMOTE_URL = String(import.meta.env?.VITE_DEEPFACE_URL || "").replace(/\/+$/, "")
const FACE_REMOTE_TOKEN = String(import.meta.env?.VITE_DEEPFACE_TOKEN || "")
const FACE_ANALYZE_URL = FACE_REMOTE_URL ? `${FACE_REMOTE_URL}/analyze` : "/api/deepface"
const FACE_STATUS_URL = FACE_REMOTE_URL ? `${FACE_REMOTE_URL}/status` : "/api/deepface/status"

/** Headers comunes para el servicio DeepFace remoto. */
function faceRemoteHeaders() {
  const h = { "Content-Type": "application/json" }
  if (FACE_REMOTE_TOKEN) h["Authorization"] = `Bearer ${FACE_REMOTE_TOKEN}`
  return h
}

/**
 * Llama al análisis facial "full" (DeepFace + comentario clínico IA).
 * En dev va al middleware /api/face-analysis/full; en prod hace fallback a
 * DeepFace-only contra el servicio remoto.
 *
 * Devuelve { ok, face_found, deepface, clinico, clinicoError, error? }.
 */
async function callFaceAnalysisFull(imageB64, opts = {}) {
  const includeAi = opts.includeAi !== false
  if (!FACE_REMOTE_URL) {
    try {
      const r = await fetch("/api/face-analysis/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageB64, includeAi }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) {
        return { ok: false, error: j?.error || `Error ${r.status}`, status: r.status }
      }
      return j
    } catch (e) {
      return { ok: false, error: String(e?.message || e) }
    }
  }
  try {
    const r = await fetch(`${FACE_REMOTE_URL}/analyze`, {
      method: "POST",
      headers: faceRemoteHeaders(),
      body: JSON.stringify({ image_base64: imageB64 }),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j?.ok) {
      return { ok: false, error: j?.error || j?.detail || `Error ${r.status}`, status: r.status }
    }
    return {
      ok: true,
      face_found: j.face_found !== false,
      deepface: j,
      clinico: null,
      clinicoError: "Análisis clínico-estético con IA deshabilitado en producción (falta proxy de OpenAI). DeepFace OK.",
    }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** Importes en EUR (referencia mercado UE; sustituir por vuestra tarifa). */
const fmt = n => {
  const x = Number(n)
  if (Number.isNaN(x)) return "—"
  return x.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
const fmtDate = d => { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}` }
const catLabel = { valoracion:"Valoración", clinico:"Clínico", facial:"Facial", corporal:"Corporal", laser:"Láser", botox:"Bótox", general:"General", servicios:"Servicios", insumos:"Insumos", salarios:"Salarios", alquiler:"Alquiler", equipos:"Equipos", otros:"Otros" }
const estadoLabel = {
  pendiente:"Pendiente", confirmado:"Confirmado", en_sala:"En sala", en_curso:"En curso",
  listo_cobrar:"Listo p/ cobrar", finalizado:"Finalizado", cancelado:"Cancelado",
}

/** iPhone/iPad (incl. iPadOS con userAgent de Mac). */
function isIOSDevice() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

function isAndroidPhone() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "")
}

/** iPad (incl. iPadOS con UA tipo escritorio). */
function isIPad() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  if (/iPad/i.test(ua)) return true
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
}

/** Mic/cámara: HTTPS o localhost; en móvil por IP en HTTP el navegador bloquea getUserMedia. */
function mediaInsecureContextHint() {
  if (typeof window === "undefined") return ""
  if (window.isSecureContext) return ""
  const h = window.location?.hostname || ""
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return ""
  return " En el móvil, si abrís la app por http://IP (Wi‑Fi), el micrófono suele estar bloqueado: usá https (p. ej. VITE_DEV_HTTPS=true en .env.local), un túnel (ngrok, Cloudflare) o accedé por https desde producción. En PC podés usar http://localhost:5173."
}

/** HTTP por IP (p. ej. http://192.168.x.x) no es contexto seguro: el navegador oculta el micrófono. */
function getUserMediaCompat(constraints) {
  if (typeof navigator === "undefined") {
    return Promise.reject(new Error("NO_GET_USER_MEDIA"))
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    const h = window.location?.hostname || ""
    if (h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]") {
      return Promise.reject(new Error("INSECURE_CONTEXT_MIC"))
    }
  }
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints)
  }
  const legacy =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia
  if (!legacy) {
    return Promise.reject(new Error("NO_GET_USER_MEDIA"))
  }
  return new Promise((resolve, reject) => {
    legacy.call(navigator, constraints, resolve, reject)
  })
}

/**
 * Cámara área médica (rostro paciente): siempre priorizar la trasera (iPad suele ignorar `ideal`).
 * No hace fallback a la frontal; si falla todo, lanza el último error.
 */
async function getMedicalAreaCameraStream() {
  const tries = [
    () =>
      getUserMediaCompat({
        video: {
          facingMode: { exact: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      }),
    () =>
      getUserMediaCompat({
        video: { facingMode: { exact: "environment" } },
        audio: false,
      }),
    () =>
      getUserMediaCompat({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      }),
    () =>
      getUserMediaCompat({
        video: { facingMode: "environment" },
        audio: false,
      }),
  ]
  let lastErr
  for (const run of tries) {
    try {
      return await run()
    } catch (e) {
      lastErr = e
    }
  }
  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    const videos = list.filter((d) => d.kind === "videoinput" && d.deviceId)
    const rank = (label) => {
      const s = String(label || "").toLowerCase()
      if (/back|rear|trasera|environment|wide|ultra/.test(s)) return 4
      if (/front|user|selfie|facetime|true\s*depth/.test(s)) return 0
      return 2
    }
    const byLabel = [...videos].sort((a, b) => rank(b.label) - rank(a.label))
    for (const d of byLabel) {
      try {
        return await getUserMediaCompat({
          video: { deviceId: { exact: d.deviceId } },
          audio: false,
        })
      } catch (e) {
        lastErr = e
      }
    }
    if (videos.length >= 2) {
      for (const idx of [videos.length - 1, 0]) {
        try {
          return await getUserMediaCompat({
            video: { deviceId: { exact: videos[idx].deviceId } },
            audio: false,
          })
        } catch (e) {
          lastErr = e
        }
      }
    }
  } catch (e) {
    lastErr = e
  }
  throw lastErr || new Error("NO_REAR_CAMERA")
}

/** Safari/iOS prioriza MP4/AAC; Chrome/Firefox/Android suelen preferir WebM/Opus. */
function pickAudioRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return ""
  const webkitFirst = [
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ]
  const defaultFirst = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ]
  const candidates = isIOSDevice() ? webkitFirst : defaultFirst
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ""
}

/** Restricciones de audio que suelen funcionar mejor en móviles (Chrome/Safari/Firefox). */
function buildMicAudioConstraints() {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
  }
}

/** Crea MediaRecorder: la API usa `mimeType`. Prueba varias rutas (iOS/Android varían). */
function createAudioMediaRecorder(stream, mimeType) {
  if (typeof MediaRecorder === "undefined") throw new Error("NO_MEDIA_RECORDER")
  const attempts = []
  if (mimeType && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(mimeType)) {
    attempts.push(() => new MediaRecorder(stream, { mimeType }))
  }
  attempts.push(() => new MediaRecorder(stream))
  for (const fn of attempts) {
    try {
      return fn()
    } catch {
      /* siguiente */
    }
  }
  throw new Error("MR_CREATE_FAIL")
}

/** Flujo orden de servicio: pendiente → confirmado → en_sala → en_curso → listo_cobrar → finalizado */

// ─── AUTH & ROLES (configurable según cliente) ───────────────
const SESSION_KEY = "clinica-erp-session"
const ROLE_LABEL = { recepcionista:"Recepcionista", especialista:"Especialista", encargado:"Encargado/a", gerente:"Gerente" }

/** Compat: filas antiguas con rol `medico` en caché. */
function normalizeRol(rol) {
  const r = String(rol || "").trim().toLowerCase()
  return r === "medico" ? "especialista" : r
}

/** Agenda / reservas: especialistas + gerentes que también atienden (especialidad cargada). */
function esEmpleadoAtiendeAgenda(e) {
  if (!e || e.activo === false) return false
  const rol = normalizeRol(e.cargo || e.rol)
  if (rol === "especialista") return true
  if (rol === "gerente" && String(e.especialidad || "").trim() !== "") return true
  return false
}
const DEMO_USERS = [
  { id:1, user:"recepcion", pass:"demo", role:"recepcionista", nombre:"Lucía — Recepción" },
  { id:2, user:"especialista", pass:"demo", role:"especialista", nombre:"Dra. Ana López" },
  { id:3, user:"gerente",   pass:"demo", role:"gerente",       nombre:"Carlos Gómez" },
]
/** Qué rol puede ver cada sección del menú */
const SECTION_ROLES = {
  dashboard:     ["recepcionista","especialista","encargado","gerente"],
  agenda:        ["recepcionista","especialista","encargado","gerente"],
  pacientes:     ["recepcionista","especialista","encargado","gerente"],
  clientes:      ["recepcionista","especialista","encargado","gerente"],
  stock:         ["recepcionista","especialista","encargado","gerente"],
  contabilidad:  ["encargado","gerente"],
  servicios:     ["encargado","gerente","especialista"],
  personal:      ["encargado","gerente"],
  bonos:         ["recepcionista","especialista","encargado","gerente"],
  tpv:           ["recepcionista","encargado","gerente"],
  marketing:     ["recepcionista","especialista","encargado","gerente"],
  reportes:      ["recepcionista","especialista","encargado","gerente"],
  analytics:     ["encargado","gerente","especialista"],
  reservas:      ["recepcionista","especialista","encargado","gerente"],
  sala:          ["especialista","encargado","gerente"],
  doctor_area:   ["especialista","encargado","gerente"],
  configuracion: ["encargado","gerente"],
  documentos:    ["recepcionista","especialista","encargado","gerente"],
}
function canAccess(role, section) {
  const r = normalizeRol(role)
  return SECTION_ROLES[section]?.includes(r)
}
function loadSession() {
  try {
    const j = sessionStorage.getItem(SESSION_KEY)
    if (!j) return null
    const s = JSON.parse(j)
    if (s?.role === "medico") s.role = "especialista"
    return s
  } catch { return null }
}
function saveSession(s) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

const tipoHistoriaLabel = { consulta:"Consulta", tratamiento:"Tratamiento", evolucion:"Evolución", admin:"Administrativo" }
const DIA_SEMANA = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]

function waUrl(tel, text) {
  const n = String(tel || "").replace(/\D/g, "")
  const num = n.length >= 10 && !n.startsWith("54") ? "54" + n : n
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}
function buildWaMessage(plantilla, { nombre, fecha, hora }) {
  return plantilla
    .replace(/\{nombre\}/g, nombre || "")
    .replace(/\{fecha\}/g, fecha || "")
    .replace(/\{hora\}/g, hora || "")
}

/** Si `clinicId` se pasa, solo busca en fichas de esa sede (evita homónimos entre clínicas). */
function findPacienteIdByNombre(data, nombre, clinicId) {
  if (!nombre) return null
  const n = nombre.trim().toLowerCase()
  const list = (data.pacientes || []).filter(x => {
    if (!x?.nombre) return false
    if (clinicId == null || clinicId === "") return true
    return x.clinicId != null && +x.clinicId === +clinicId
  })
  const p = list.find(x => x.nombre.trim().toLowerCase() === n)
  return p?.id ?? null
}

/** Nombres en turnos de la clínica sin ficha vinculada (ni paciente_id válido ni mismo nombre en maestro). */
function agendaSinFichaPorClinica(data, clinicId) {
  const turnos = data.clinics[clinicId]?.turnos || []
  const pacientesClinica = (data.pacientes || []).filter(p => +p.clinicId === +clinicId)
  const nombreSet = new Set(pacientesClinica.map(p => String(p.nombre || "").trim().toLowerCase()).filter(Boolean))
  const idsValidos = new Set(pacientesClinica.map(p => +p.id))
  const agg = new Map()
  for (const t of turnos) {
    const nombreTurno = String(t.cliente || "").trim()
    if (!nombreTurno) continue
    const key = nombreTurno.toLowerCase()
    const pid = t.pacienteId != null && t.pacienteId !== "" ? +t.pacienteId : null
    if (pid && idsValidos.has(pid)) continue
    if (nombreSet.has(key)) continue
    const cur = agg.get(key) || { nombre: nombreTurno, turnos: 0, ultimaFecha: "" }
    cur.turnos += 1
    const f = String(t.fecha || "")
    if (f && (!cur.ultimaFecha || f > cur.ultimaFecha)) cur.ultimaFecha = f
    agg.set(key, cur)
  }
  return [...agg.values()].sort((a, b) => b.turnos - a.turnos)
}

/** Fichas del maestro de la clínica que no aparecen en ningún turno (ni por id ni por nombre). */
function pacientesMaestroSinAgendaClinica(data, clinicId) {
  const turnos = data.clinics[clinicId]?.turnos || []
  const nombresEnTurnos = new Set()
  const idsEnTurnos = new Set()
  for (const t of turnos) {
    const n = String(t.cliente || "").trim().toLowerCase()
    if (n) nombresEnTurnos.add(n)
    if (t.pacienteId != null && t.pacienteId !== "") idsEnTurnos.add(+t.pacienteId)
  }
  return (data.pacientes || []).filter(p => {
    if (+p.clinicId !== +clinicId) return false
    if (idsEnTurnos.has(+p.id)) return false
    const nk = String(p.nombre || "").trim().toLowerCase()
    if (nk && nombresEnTurnos.has(nk)) return false
    return true
  })
}

/** Sugiere slug de plantilla según servicio/protocolo (Área médica → consentimiento). */
function sugerirPlantillaConsentDesdeTexto(plantillas, servicioNombre, protocolo) {
  const list = plantillas || []
  const has = slug => list.some(p => p.slug === slug)
  const text = `${servicioNombre || ""} ${protocolo || ""}`.toLowerCase()
  const trySlug = slug => (has(slug) ? slug : "")
  if (/toxina|botul|azzalure|neuromodulador|b[oó]tox/.test(text)) return trySlug("toxina-botulinica") || ""
  /** Mesoterapia (incl. typo «masoterapia») antes que «hialur» si el texto mezcla tratamientos. */
  if (/m[ae]soterapia/.test(text)) {
    const m = trySlug("mesoterapia")
    if (m) return m
  }
  if (/hialur|hyal|juvederm|restylane|ácido hialur|acido hialur|a\.?\s*h\.?\s*/i.test(text) && /aesthetic/.test(text)) return trySlug("consentimiento-informado-acido-hialuronico-aesthetic") || trySlug("acido-hialuronico") || ""
  if (/hialur|hyal|juvederm|restylane|ácido hialur|acido hialur/.test(text)) return trySlug("acido-hialuronico") || ""
  if (/polil[aá]ct|sculptra/.test(text)) return trySlug("acido-polilactico") || ""
  if (/carboxi|carb[oó]n\s*session|^carbo\b/.test(text)) return trySlug("carboxi") || ""
  if (/corposhape/.test(text)) return trySlug("corposhape") || ""
  if (/emsculpt|(^|\s)ems(\s|$)/.test(text)) return trySlug("ems") || ""
  if (/exosoma|exoxoma|dermapen/.test(text)) return trySlug("exoxomas-dermapen-e-inyectado") || ""
  if (/fhos|vs\s*corta/.test(text)) return trySlug("fhos-consentimiento-informado-vs-corta") || ""
  if (/hidrolipo/.test(text)) return trySlug("hidrolipoclasia") || ""
  if (/radiesse/.test(text)) return trySlug("radiesse") || ""
  if (/hidroxiapatita|hidroxiapatita/.test(text)) return trySlug("hidroxiapatita-calcica") || ""
  if (/hifu.*corporal|hifu\s+corporal/.test(text)) return trySlug("hifu-corporal") || ""
  if (/^hifu\b|\shifu\s/.test(text)) return trySlug("hifu-corporal") || ""
  if (/hilo|pdo|espicul/.test(text)) return trySlug("hilos") || ""
  if (/protecci[oó]n de datos|lopd|rgpd|ley.*datos/.test(text)) return trySlug("ley-de-proteccion-de-datos-bs") || ""
  if (/radiofrec|fracci[oó]n/.test(text)) return trySlug("radiofrecuencia-fraccionada") || ""
  return trySlug("generico-tratamiento") || (list[0]?.slug ?? "")
}

/**
 * Sugiere plantilla solo por nombre del servicio (sin protocolo de sesión).
 * Así, si el protocolo menciona varios tratamientos, no se fuerza la misma plantilla en todos.
 */
function sugerirPlantillaConsentDesdeNombreServicio(plantillas, nombreServicio) {
  return sugerirPlantillaConsentDesdeTexto(plantillas, nombreServicio, "")
}

/** Normaliza nombre de servicio para comparar consentimientos (mayúsculas, tildes, espacios). */
function normalizarNombreServicioConsent(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * ¿Ya hay PDF firmado para este servicio en el turno?
 * Compara el primer tramo del detalle guardado (antes de " — ") con el nombre del servicio en la orden,
 * para no marcar por error si otro texto menciona la palabra en el protocolo.
 */
function consentimientoFirmadoParaServicioNombre(consents, nombreServicio) {
  const key = normalizarNombreServicioConsent(nombreServicio)
  if (!key) return false
  return (consents || []).some(c => {
    const raw = String(c.servicioOProducto || "").trim()
    const primera = raw.split(/\s*[—–-]\s*/)[0].trim()
    return normalizarNombreServicioConsent(primera) === key
  })
}

/** Turno más reciente para la demo de Área médica (QR): hoy primero, prioriza en sala / en curso, luego mayor id. */
function pickDemoTurnoForDoctorArea(turnos) {
  const list = Array.isArray(turnos) ? turnos.filter(Boolean) : []
  if (list.length === 0) return null
  const todayList = list.filter(t => t.fecha === TODAY)
  const base = todayList.length ? todayList : list
  const enSala = base.filter(t => t.estado === "en_sala" || t.estado === "en_curso")
  const pool = enSala.length ? enSala : base
  const sorted = [...pool].sort((a, b) => {
    const ida = +a.id || 0
    const idb = +b.id || 0
    if (idb !== ida) return idb - ida
    return String(b.hora || "").localeCompare(String(a.hora || ""))
  })
  return sorted[0] ?? null
}

/** Token URL-safe para ?ctx= (sesión área médica por turno) */
function encodeDoctorSessionCtx({ clinicId, turnoId }) {
  const raw = JSON.stringify({ v: 1, clinicId, turnoId })
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function decodeDoctorSessionCtx(s) {
  if (!s || typeof s !== "string") return null
  try {
    const pad = "=".repeat((4 - (s.length % 4)) % 4)
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad
    const raw = decodeURIComponent(escape(atob(b64)))
    const o = JSON.parse(raw)
    if (o.v !== 1 || o.clinicId == null || o.turnoId == null) return null
    return { clinicId: +o.clinicId, turnoId: +o.turnoId }
  } catch {
    return null
  }
}

/** sessionStorage: URL pública para QR (ej. http://192.168.0.197:5173) cuando el PC no es localhost del teléfono */
const STORAGE_QR_BASE = "clinica_erp_qr_base"

function getAppBaseUrl() {
  if (typeof window === "undefined") return ""
  try {
    const saved = sessionStorage.getItem(STORAGE_QR_BASE)
    if (saved && saved.trim()) return saved.trim().replace(/\/$/, "")
  } catch { /* ignore */ }

  const env = import.meta.env?.VITE_PUBLIC_APP_URL
  const envTrim = env && String(env).trim() ? String(env).trim().replace(/\/$/, "") : ""
  const curHost = window.location.hostname
  const isLocalHost = curHost === "localhost" || curHost === "127.0.0.1" || curHost === "[::1]"
  const isLanIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(curHost) && !isLocalHost

  if (import.meta.env.DEV && envTrim && isLanIPv4) {
    try {
      const envHost = new URL(envTrim).hostname
      if (curHost !== envHost) {
        const { origin, pathname } = window.location
        const path = pathname === "/" ? "" : pathname.replace(/\/$/, "")
        return `${origin}${path}`
      }
    } catch { /* ignore */ }
  }

  if (envTrim) return envTrim

  const { origin, pathname } = window.location
  const path = pathname === "/" ? "" : pathname.replace(/\/$/, "")
  return `${origin}${path}`
}

function buildDoctorSessionUrl(ctxObj) {
  const ctx = encodeDoctorSessionCtx(ctxObj)
  const base = getAppBaseUrl()
  if (!base) return `?ctx=${encodeURIComponent(ctx)}`
  const q = base.includes("?") ? "&" : "?"
  return `${base}${q}ctx=${encodeURIComponent(ctx)}`
}

async function uploadImageDataUrl(dataUrl, folder = "general") {
  if (!import.meta.env.VITE_SUPABASE_URL) return dataUrl
  if (!String(dataUrl || "").startsWith("data:image/")) return dataUrl
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return dataUrl
  const r = await fetch("/api/admin/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ dataUrl, folder }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.url) throw new Error(j.error || `Error ${r.status}`)
  return j.url
}

function storagePathFromPublicUrl(url) {
  const raw = String(url || "").trim()
  if (!raw) return ""
  const noQuery = raw.split("?")[0] || raw
  const marker = "/storage/v1/object/public/erp-media/"
  const ix = noQuery.indexOf(marker)
  if (ix < 0) return ""
  try {
    return decodeURIComponent(noQuery.slice(ix + marker.length))
  } catch {
    return noQuery.slice(ix + marker.length)
  }
}

async function deleteStorageImageByUrl(url) {
  if (!import.meta.env.VITE_SUPABASE_URL) return
  const path = storagePathFromPublicUrl(url)
  if (!path) return
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return
  const { error: rmErr } = await supabase.storage.from("erp-media").remove([path])
  if (!rmErr) return
  try {
    const r = await fetch("/api/admin/delete-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path }),
    })
    if (r.ok) return
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || rmErr.message || `Error ${r.status}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(rmErr.message || msg)
  }
}

async function compressImageFileToDataUrl(file) {
  if (!file) return ""
  if (typeof window === "undefined") return ""
  if (!String(file.type || "").startsWith("image/")) return ""
  const maxWidth = 1600
  const maxHeight = 1600
  const quality = 0.82
  const bitmap = await createImageBitmap(file)
  let w = bitmap.width || 0
  let h = bitmap.height || 0
  if (!w || !h) return ""
  const ratio = Math.min(maxWidth / w, maxHeight / h, 1)
  w = Math.max(1, Math.round(w * ratio))
  h = Math.max(1, Math.round(h * ratio))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  ctx.drawImage(bitmap, 0, 0, w, h)
  const outType = file.type === "image/png" ? "image/png" : "image/jpeg"
  return canvas.toDataURL(outType, quality)
}
function getDoctorCtxFromUrl() {
  if (typeof window === "undefined") return null
  return decodeDoctorSessionCtx(new URLSearchParams(window.location.search).get("ctx"))
}

/** Cierra orden de servicio: stock, historial, alerta cobro (compartido Sala + Área médica QR) */
function cerrarOrdenServicioEnEstado(d, { clinic, turno, servicioId, servicioIds, protocolo, notas, qty, qtyDescontar, nombreProfesional, evaluacionPrevia, motivoConsultaIA, alergiasIA, tratamientosIA, resultadoSesion }) {
  const idsRaw = Array.isArray(servicioIds) && servicioIds.length
    ? [...new Set(servicioIds.map(id => +id).filter(id => id > 0))]
    : (servicioId != null && servicioId !== "" ? [+servicioId] : [])
  if (!turno || !String(protocolo || "").trim() || idsRaw.length === 0) return d
  const srvs = idsRaw.map(id => d.servicios.find(s => s.id === id)).filter(Boolean)
  if (srvs.length === 0) return d
  const primarySrv = srvs[0]
  const qtyRegistrar = qty || {}
  const qtyDescuento = qtyDescontar || qtyRegistrar
  const lines = Object.entries(qtyRegistrar).filter(([, c]) => c > 0).map(([stockId, cantidad]) => ({ stockId: +stockId, cantidad }))
  const linesDescuento = Object.entries(qtyDescuento).filter(([, c]) => c > 0).map(([stockId, cantidad]) => ({ stockId: +stockId, cantidad }))
  const cd = d.clinics[clinic]
  if (!cd) return d
  let stockN = cd.stock.map(p => ({ ...p }))
  for (const line of linesDescuento) {
    const ix = stockN.findIndex(s => s.id === line.stockId)
    if (ix >= 0) stockN[ix] = { ...stockN[ix], stock: Math.max(0, stockN[ix].stock - line.cantidad) }
  }
  const detalleInsumos = lines.map(line => {
    const st = cd.stock.find(s => s.id === line.stockId)
    const sub = (st?.costo || 0) * line.cantidad
    return { nombre: st?.nombre || "Item", cantidad: line.cantidad, costoUnit: st?.costo || 0, subtotal: sub, unidad: st?.unidad || "" }
  })
  const montoInsumos = detalleInsumos.reduce((a, x) => a + x.subtotal, 0)
  const precioServ = srvs.reduce((a, s) => a + (s.precio ?? 0), 0)
  const nombresServicios = srvs.map(s => s.nombre).join(" · ")
  const pacienteId = turno.pacienteId ?? findPacienteIdByNombre(d, turno.cliente, clinic)
  const histId = d.historialClinico.length ? Math.max(...d.historialClinico.map(h => h.id)) + 1 : 1
  const alertId = (d.alertasCobro?.length || 0) ? Math.max(...d.alertasCobro.map(a => a.id)) + 1 : 1
  const textoInsumos = detalleInsumos.length ? detalleInsumos.map(x => `${x.nombre} ×${x.cantidad} ${x.unidad}`).join("; ") : "Sin consumibles registrados"
  const ev = evaluacionPrevia?.trim() ? `Evaluación: ${evaluacionPrevia.trim()}. ` : ""
  const resPost = String(resultadoSesion || "").trim()
  const detalleHist = `${ev}${resPost ? `Resultado inmediato: ${resPost}. ` : ""}Servicios facturados: ${nombresServicios}. Orden de servicio. Protocolo: ${String(protocolo).trim()}. ${textoInsumos}. Notas: ${String(notas || "").trim() || "—"}`
  const textoClinico = `${String(motivoConsultaIA || "")}\n${String(evaluacionPrevia || "")}\n${String(protocolo || "")}\n${resPost ? `Resultado sesión: ${resPost}\n` : ""}\n${String(notas || "")}`.trim()
  const alergiasDetectadas = (() => {
    if (!textoClinico) return []
    const out = []
    const lines = textoClinico.split(/\n+/)
    for (const line of lines) {
      const m = line.match(/alergias?\s*:\s*(.+)/i)
      if (!m?.[1]) continue
      for (const item of m[1].split(/[;,]/)) {
        const x = item.trim()
        if (x) out.push(x)
      }
    }
    return [...new Set(out)]
  })()

  const nuevoHist = pacienteId ? [...d.historialClinico, {
    id: histId, pacienteId, fecha: TODAY, tipo: "tratamiento", titulo: `${nombresServicios} — sesión`,
    detalle: detalleHist, profesional: nombreProfesional || "Especialista",
  }] : d.historialClinico
  const pacientesN = pacienteId ? (d.pacientes || []).map(p => {
    if (+p.id !== +pacienteId) return p
    const prevVisitas = Array.isArray(p.visitas) ? p.visitas : []
    const nextVisitaId = prevVisitas.length ? Math.max(...prevVisitas.map(v => +v.id || 0)) + 1 : 1
    const visita = {
      id: nextVisitaId,
      fecha: TODAY,
      motivo: nombresServicios || turno.servicio || "Consulta",
      profesionalId: turno.profesionalId || null,
      estado: "realizado",
      notas: String(notas || "").trim(),
      protocolo: String(protocolo || "").trim(),
      turnoId: turno.id,
    }
    const prevTx = Array.isArray(p.tratamientosActivos) ? p.tratamientosActivos : []
    const iaTx = Array.isArray(tratamientosIA) ? tratamientosIA.map(x => String(x || "").trim()).filter(Boolean) : []
    const nextTx = [...new Set([...prevTx, ...srvs.map(s => s.nombre), ...iaTx])]
    const prevAlergias = Array.isArray(p.alergias) ? p.alergias : []
    const iaAler = Array.isArray(alergiasIA) ? alergiasIA.map(x => String(x || "").trim()).filter(Boolean) : []
    const nextAlergias = [...new Set([...prevAlergias, ...alergiasDetectadas, ...iaAler])]
    const resumen = [`[${TODAY}] ${nombresServicios}`]
    if (String(motivoConsultaIA || "").trim()) resumen.push(`Motivo: ${String(motivoConsultaIA).trim()}`)
    if (String(protocolo || "").trim()) resumen.push(`Protocolo: ${String(protocolo).trim()}`)
    if (String(notas || "").trim()) resumen.push(`Notas: ${String(notas).trim()}`)
    return {
      ...p,
      tratamientosActivos: nextTx,
      visitas: [...prevVisitas, visita],
      alergias: nextAlergias,
      notasClinicas: [String(p.notasClinicas || "").trim(), resumen.join(" · ")].filter(Boolean).join("\n"),
    }
  }) : d.pacientes

  return {
    ...d,
    clinics: {
      ...d.clinics,
      [clinic]: {
        ...cd,
        stock: stockN,
        turnos: cd.turnos.map(t => t.id === turno.id ? {
          ...t,
          pacienteId: turno.pacienteId != null ? turno.pacienteId : t.pacienteId,
          estado: "listo_cobrar",
          servicio: nombresServicios,
          servicioFacturadoId: primarySrv.id,
          // Al pasar a cobro, la orden deja de estar asignada al especialista.
          profesionalId: null,
          asignadoCobro: "recepcionista",
        } : t),
      },
    },
    historialClinico: nuevoHist,
    pacientes: pacientesN,
    alertasCobro: [...(d.alertasCobro || []), {
      id: alertId,
      clinicId: clinic,
      turnoId: turno.id,
      paciente: turno.cliente,
      servicio: nombresServicios,
      servicioId: primarySrv.id,
      servicioIds: idsRaw,
      montoServicio: precioServ,
      insumos: detalleInsumos,
      montoInsumos,
      montoTotal: precioServ + montoInsumos,
      estado: "pendiente",
      creado: new Date().toISOString(),
    }],
  }
}

function downloadXlsx(sheetName, rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}
function downloadXlsxMulti(sheets, filename) {
  const wb = XLSX.utils.book_new()
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, String(name || "Hoja").slice(0, 31))
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`)
}
function downloadPdf(title, columns, rows, filename) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(title, 14, 18)
  autoTable(doc, { startY: 26, head: [columns], body: rows, styles: { fontSize: 9 } })
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`)
}

/** IDs de ítems de stock sugeridos por servicio (configurables en catálogo Servicios). */
function materialesStockIdsDelServicio(servicio) {
  if (!servicio) return []
  // Prefer materialesCantidades
  if (Array.isArray(servicio.materialesCantidades) && servicio.materialesCantidades.length > 0) {
    return [...new Set(servicio.materialesCantidades.map(x => +x.id).filter(n => n > 0))]
  }
  const raw = servicio.materialesStockIds
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map(id => +id).filter(n => n > 0))]
}

function qtyMapFromMaterialesServicio(servicio) {
  if (!servicio) return {}
  const out = {}
  // Use materialesCantidades if available (has qty per material)
  if (Array.isArray(servicio.materialesCantidades) && servicio.materialesCantidades.length > 0) {
    for (const item of servicio.materialesCantidades) {
      const id = +item.id
      const qty = Math.max(1, +item.qty || 1)
      if (id > 0) out[id] = qty
    }
    return out
  }
  // Fallback to IDs with qty=1
  const ids = materialesStockIdsDelServicio(servicio)
  for (const id of ids) out[id] = 1
  return out
}

function mergeQtyMaps(base, extra) {
  const out = { ...(base || {}) }
  for (const [k, v] of Object.entries(extra || {})) {
    const sid = +k
    const n = Math.max(0, parseInt(v, 10) || 0)
    if (!sid || n <= 0) continue
    out[sid] = (out[sid] || 0) + n
  }
  return out
}

/** Mapea respuesta de /api/erp/... (cliente en camelCase) al modelo local de pacientes. */
function mapClienteRowFromErpApi(c) {
  if (!c) return null
  return {
    id: c.id,
    clinicId: c.clinicId,
    nombre: c.nombre || "",
    tel: c.tel || "",
    email: c.email || "",
    dni: c.dni || "",
    fechaNacimiento: c.fechaNacimiento || "",
    notasClinicas: c.notasClinicas || "",
    alergias: Array.isArray(c.alergias) ? c.alergias : [],
    tratamientosActivos: Array.isArray(c.tratamientosActivos) ? c.tratamientosActivos : [],
    visitas: Array.isArray(c.visitas) ? c.visitas : [],
    fotos: Array.isArray(c.fotos) ? c.fotos : [],
    anamnesis: c.anamnesis && typeof c.anamnesis === "object" ? c.anamnesis : {},
    consentimientos: Array.isArray(c.consentimientos) ? c.consentimientos : [],
    created_at: c.created_at || null,
    esPaciente: c.esPaciente === true || c.es_paciente === true,
  }
}

/**
 * Tras la atención: crea o vincula ficha en `clientes` y actualiza `turnos.cliente_id` (service role).
 * Idempotente si el turno ya tenía cliente vinculado.
 */
async function ensureClienteFichaPorTurno(turnoId) {
  if (!import.meta.env.VITE_SUPABASE_URL) return { ok: true, clienteId: null, created: false, cliente: null }
  const { data: { session: sb } } = await supabase.auth.getSession()
  const token = sb?.access_token
  if (!token) return { ok: false, error: "Tu sesión expiró. Volvé a iniciar sesión." }
  const r = await fetch("/api/erp/turno/ensure-cliente", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ turnoId }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) return { ok: false, error: j?.error || "No se pudo registrar la ficha del paciente." }
  return { ok: true, clienteId: j.clienteId ?? null, created: !!j.created, cliente: j.cliente || null }
}

function getSalaTrabajoTurno(turno) {
  if (!turno) return ""
  const direct = String(turno.salaTrabajo || turno.sala || "").trim()
  if (direct) return direct
  const obs = String(turno.obs || "")
  const m = obs.match(/\[SALA:([^\]]+)\]/i)
  return m?.[1] ? String(m[1]).trim() : ""
}

function upsertSalaTrabajoEnObs(obsRaw, salaRaw) {
  const sala = String(salaRaw || "").trim()
  const obs = String(obsRaw || "")
  const clean = obs.replace(/\s*\[SALA:[^\]]+\]\s*/gi, " ").replace(/\s+/g, " ").trim()
  if (!sala) return clean
  return `[SALA:${sala}]${clean ? ` ${clean}` : ""}`
}

// ─── INITIAL DATA ────────────────────────────────────────────
function makeData() {
  return {
    servicios: [],
    proveedores: [],
    pedidosProveedor: [],
    incidenciasProveedor: [],
    trasladosInternos: [],
    profesionales: [],
    pacientes: [],
    historialClinico: [],
    empleados: [],
    turnosLaborales: [],
    recordatoriosWA: [],
    waConfig: {
      plantilla:"Hola {nombre}, te recordamos tu turno el {fecha} a las {hora} en Estética ERP. Respondé este mensaje si necesitás cambiarlo.",
      horasAntes:24,
      activo:true,
    },
    marketingAutomatizacion: {
      plantillaCumple:"¡Feliz cumple {nombre}! En Estética ERP tenés 10% extra en tratamientos este mes 🎂",
      cumpleActivo:true,
      reactivacionDias:30,
      plantillaReactivacion:"Hola {nombre}, hace un tiempo que no te vemos. ¿Te gustaría agendar una valoración sin cargo?",
      reactivacionActivo:true,
    },
    bonosPacks: [],
    suscripciones: [],
    tpv: { movimientos: [], cierres: [] },
    /** Firmas en BD (Supabase); ver también consentimientos JSON legacy en paciente */
    consentimientosFirmados: [],
    reservasOnlineConfig: { slug:"clinica", slotMinutos:30, anticipacionDias:60 },
    /** Cola recepción: órdenes listas para cobrar (notificación 🔔) */
    alertasCobro: [],
    clinics: {
      1: { turnos: [], stock: [], movimientos: [] },
      2: { turnos: [], stock: [], movimientos: [] },
      3: { turnos: [], stock: [], movimientos: [] },
    },
    /** Control de sincronización entre dispositivos (API /api/erp-state) */
    _meta: { rev: 0, updatedAt: "", seedVersion: 2 },
  }
}

const C = {
  // ── Liquid glass design system (indigo base + glass alphas) ──
  sidebar:      "linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(248,250,252,0.18) 100%)",
  sidebarBdr:   "rgba(226,232,240,0)",      // sin línea dura; el sidebar usa backdrop-filter
  violet:       "#6366F1", // Indigo 500 (se mantiene como acento principal)
  violetLight:  "#EEF2FF",
  violetDark:   "#4338CA",
  pink:         "#F43F5E", // Rose 500
  success:      "#10B981", // Emerald 500
  warning:      "#F59E0B", // Amber 500
  danger:       "#EF4444", // Red 500
  bg:           "#F1F5F9",
  card:         "rgba(255,255,255,0.72)",   // card translúcida (con backdrop-filter)
  cardSolid:    "#FFFFFF",                  // para casos donde necesitamos opacidad (inputs, dropdowns)
  text:         "#0F172A",
  muted:        "#64748B",
  border:       "rgba(226,232,240,0.6)",    // borde semi-transparente
  borderSolid:  "#E2E8F0",
  subtle:       "#F1F5F9",
  // Glass tokens
  glassBlur:    "blur(22px) saturate(200%)",
  glassShadow:  "0 1px 2px rgba(255,255,255,0.8) inset, 0 -1px 1px rgba(15,23,42,0.04) inset, 0 12px 32px -16px rgba(15,23,42,0.18), 0 1px 3px rgba(15,23,42,0.04)",
  glassBg:      "linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.58) 100%)",
  glassBgSoft:  "linear-gradient(135deg, rgba(255,255,255,0.52) 0%, rgba(248,250,252,0.32) 100%)",
  // Gradient hero (para botones primarios, active states)
  gradient:     "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)",
}

/** Texto de <code> sobre fondo claro: fuerza contraste aunque el SO use tema oscuro (evita `code{color:var(--text-h)}` en index.css). */
const codeStyle = (background = C.subtle) => ({
  fontFamily: "ui-monospace, Consolas, monospace",
  fontSize: 12,
  fontWeight: 600,
  color: C.text,
  background,
  padding: "3px 8px",
  borderRadius: 6,
  border: `1px solid ${C.border}`,
})

// ─── REUSABLE UI ─────────────────────────────────────────────

function Badge({ type, children }) {
  const map = {
    valoracion: { bg:"#FFFBEB", color:"#B45309",  bdr:"#FCD34D" },
    clinico:    { bg:"#ECFDF5", color:"#065F46",  bdr:"#A7F3D0" },
    facial:     { bg:"#EFF6FF", color:"#1D4ED8",  bdr:"#BFDBFE" },
    corporal:   { bg:"#F0FDFA", color:"#0F766E",  bdr:"#99F6E4" },
    laser:      { bg:"#EEF2FF", color:"#3730A3",  bdr:"#C7D2FE" },
    botox:      { bg:"#FDF4FF", color:"#6B21A8",  bdr:"#E9D5FF" },
    general:    { bg:"#F8FAFC", color:"#475569",  bdr:"#CBD5E1" },
    confirmado: { bg:"#ECFDF5", color:"#065F46",  bdr:"#A7F3D0" },
    en_sala:    { bg:"#E0E7FF", color:"#3730A3",  bdr:"#A5B4FC" },
    en_curso:   { bg:"#EFF6FF", color:"#1D4ED8",  bdr:"#BFDBFE" },
    listo_cobrar:{ bg:"#FEF3C7", color:"#B45309", bdr:"#FCD34D" },
    finalizado: { bg:"#F1F5F9", color:"#475569",  bdr:"#CBD5E1" },
    pendiente:  { bg:"#FFFBEB", color:"#92400E",  bdr:"#FDE68A" },
    cancelado:  { bg:"#FEF2F2", color:"#991B1B",  bdr:"#FECACA" },
    ingreso:    { bg:"#ECFDF5", color:"#065F46",  bdr:"#A7F3D0" },
    egreso:     { bg:"#FEF2F2", color:"#991B1B",  bdr:"#FECACA" },
    gray:       { bg:"#F8FAFC", color:"#475569",  bdr:"#E2E8F0" },
  }
  const s = map[type] || map.gray
  return (
    <span style={{
      background: `linear-gradient(135deg, ${s.bg} 0%, ${s.bg}D0 100%)`,
      color: s.color,
      border: `1px solid ${s.bdr}88`,
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
      display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
      letterSpacing: "-0.005em",
      boxShadow: "0 1px 0 rgba(255,255,255,0.4) inset",
    }}>
      {children}
    </span>
  )
}

function KpiCard({ title, value, sub, trend, up, icon: Icon, accent }) {
  return (
    <div style={{
      position: "relative",
      background: C.glassBg,
      backdropFilter: C.glassBlur,
      WebkitBackdropFilter: C.glassBlur,
      borderRadius: 18,
      padding: "18px 20px",
      border: "1px solid rgba(255,255,255,0.5)",
      boxShadow: C.glassShadow,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      overflow: "hidden",
      transition: "transform .2s, box-shadow .2s",
    }}>
      {/* Barra de acento superior (gradient sutil) */}
      <div aria-hidden style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accent} 0%, ${accent}CC 60%, ${accent}66 100%)`,
        borderRadius: "18px 18px 0 0",
      }}/>
      {/* Reflejo glass sutil */}
      <div aria-hidden style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "50%",
        background: "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)",
        pointerEvents: "none",
      }}/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position: "relative" }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".7px" }}>{title}</span>
        <div style={{
          background: `linear-gradient(135deg, ${accent}22 0%, ${accent}10 100%)`,
          padding: 9, borderRadius: 11,
          border: `1px solid ${accent}22`,
          boxShadow: `0 4px 12px -4px ${accent}30`,
        }}>
          <Icon size={17} color={accent} />
        </div>
      </div>
      <div style={{ fontSize:26, fontWeight:800, color:C.text, lineHeight:1, position: "relative" }}>{value}</div>
      <div style={{ display:"flex", alignItems:"center", gap:8, position: "relative" }}>
        <span style={{ fontSize:12, color:C.muted }}>{sub}</span>
        {trend && (
          <span style={{ fontSize:11, fontWeight:700, color:up?"#10B981":"#EF4444",
            display:"flex", alignItems:"center", gap:2 }}>
            {up ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
            {trend}
          </span>
        )}
      </div>
    </div>
  )
}

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

function Modal({ open, onClose, title, children, footer }) {
  const fullScreen = useMediaQuery("(max-width: 640px)")
  const tablet = useMediaQuery("(min-width: 641px) and (max-width: 1100px)")
  if (!open) return null
  return (
    <div
      className="erp-modal-backdrop"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:999,
        display:"flex", alignItems: fullScreen ? "stretch" : "center",
        justifyContent:"center",
        padding: fullScreen ? 0 : tablet ? 20 : 16,
        WebkitTapHighlightColor: "transparent" }}>
      <div
        className={fullScreen ? "erp-modal-panel erp-modal-surface erp-fadein" : "erp-modal-surface erp-fadein"}
        style={{
          borderRadius: fullScreen ? 0 : tablet ? 20 : 22,
          padding: fullScreen ? 16 : tablet ? 24 : 28,
          width: fullScreen ? "100%" : "min(560px, calc(100vw - 48px))",
          maxWidth: fullScreen ? "100%" : "min(95vw, 560px)",
          maxHeight: fullScreen ? "100dvh" : tablet ? "min(92dvh, 900px)" : "90vh",
          minHeight: fullScreen ? "100dvh" : undefined,
          overflowY: fullScreen ? "hidden" : "auto",
          boxShadow: fullScreen ? "none" : "0 32px 80px -20px rgba(15,23,42,0.35), 0 0 0 1px rgba(255,255,255,0.5)",
          display: fullScreen ? "flex" : "block",
          flexDirection: fullScreen ? "column" : undefined,
        }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: fullScreen ? 16 : 22, flexShrink:0 }}>
          <h3 style={{ fontSize: fullScreen ? 17 : 16, fontWeight:700, color:C.text, paddingRight:8, letterSpacing: "-0.015em" }}>{title}</h3>
          <button type="button" onClick={onClose} style={{
            background:"rgba(241,245,249,0.8)",
            border:"1px solid rgba(226,232,240,0.6)",
            borderRadius:10,
            width: fullScreen || tablet ? 44 : 32, height: fullScreen || tablet ? 44 : 32,
            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            color: C.muted,
          }}>
            <X size={fullScreen || tablet ? 18 : 15} />
          </button>
        </div>
        <div className={fullScreen ? "erp-modal-body" : undefined} style={fullScreen ? { minHeight: 0 } : undefined}>
          {children}
        </div>
        {footer && (
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:22,
            paddingTop:18, borderTop:`1px solid ${C.border}`, flexShrink:0, flexWrap:"wrap" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

const inp = { padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:10,
  fontSize:13, color:C.text, background:"#FFFFFF", outline:"none",
  fontFamily:"inherit", width:"100%", boxSizing:"border-box" }

function FG({ label, children, full }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5, gridColumn: full ? "1/-1" : undefined }}>
      <label style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".6px" }}>{label}</label>
      {children}
    </div>
  )
}

function Btn({ children, onClick, variant="primary", sm, disabled, style: styleProp, ...rest }) {
  const v = {
    primary: {
      bg: C.gradient,
      color: "#fff",
      bdr: "rgba(255,255,255,0.25)",
      shadow: "0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 20px -6px rgba(99,102,241,0.55), 0 1px 2px rgba(15,23,42,0.08)",
    },
    outline: {
      bg: "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.55) 100%)",
      color: C.violet,
      bdr: `${C.violet}55`,
      shadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px -4px rgba(99,102,241,0.15)",
      blur: true,
    },
    ghost: {
      bg: "transparent",
      color: C.muted,
      bdr: "transparent",
      shadow: "none",
    },
    danger: {
      bg: "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
      color: "#DC2626",
      bdr: "#FCA5A588",
      shadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 4px 12px -4px rgba(239,68,68,0.15)",
      blur: true,
    },
  }[variant] || {}
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{
      background: v.bg,
      color: v.color,
      border: `1.5px solid ${v.bdr}`,
      borderRadius: 10,
      padding: sm ? "5px 12px" : "9px 18px",
      fontSize: sm ? 12 : 13,
      fontWeight: 600,
      letterSpacing: "-0.005em",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      boxShadow: v.shadow,
      backdropFilter: v.blur ? "blur(10px) saturate(180%)" : undefined,
      WebkitBackdropFilter: v.blur ? "blur(10px) saturate(180%)" : undefined,
      transition: "transform .15s, box-shadow .15s, filter .15s",
      ...styleProp,
    }} {...rest}>
      {children}
    </button>
  )
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: "flex", gap: 3,
      background: "linear-gradient(135deg, rgba(241,245,249,0.75) 0%, rgba(226,232,240,0.55) 100%)",
      backdropFilter: "blur(14px) saturate(180%)",
      WebkitBackdropFilter: "blur(14px) saturate(180%)",
      borderRadius: 12,
      padding: 4,
      border: "1px solid rgba(255,255,255,0.5)",
      boxShadow: "0 1px 2px rgba(255,255,255,0.6) inset, 0 4px 12px -4px rgba(15,23,42,0.08)",
      width: "fit-content",
      marginBottom: 18,
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: "6px 16px",
          borderRadius: 9,
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          background: active === t.id
            ? "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 100%)"
            : "transparent",
          color: active === t.id ? C.violet : C.muted,
          boxShadow: active === t.id
            ? "0 1px 0 rgba(255,255,255,0.7) inset, 0 4px 10px -3px rgba(99,102,241,0.18), 0 1px 2px rgba(15,23,42,0.04)"
            : "none",
          transition: "all .2s",
          letterSpacing: "-0.005em",
        }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function StockBar({ stock, minimo }) {
  const max = Math.max(minimo * 2, stock, 1)
  const pct = Math.min(100, (stock / max) * 100)
  const color = stock === 0 ? C.danger : stock <= minimo ? C.warning : C.success
  return (
    <div style={{ height:5, background:"#F1F5F9", borderRadius:3, overflow:"hidden", marginTop:4, width:70 }}>
      <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:3 }} />
    </div>
  )
}

function THead({ cols }) {
  return (
    <thead>
      <tr style={{ background:C.subtle }}>
        {cols.map(c => (
          <th key={c} style={{ padding:"8px 14px", textAlign:"left", fontSize:11,
            fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:".5px", whiteSpace:"nowrap" }}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

// ─── SECTION: DASHBOARD ───────────────────────────────────────
function Dashboard({ data, clinic, setData, role, onOpenTurnoSession }) {
  const isEspecialista = normalizeRol(role) === "especialista"
  const cd = data.clinics[clinic]
  const todayT  = cd.turnos.filter(t => t.fecha === TODAY)
  const enCurso = todayT.filter(t => t.estado === "en_curso")
  const listosCobrarTurnos = todayT.filter(t => t.estado === "listo_cobrar")
  const pendCobro = (data.alertasCobro || []).filter(a => a.clinicId === clinic && a.estado === "pendiente")
  const [cobrandoId, setCobrandoId] = useState(null)
  const [cobroModal, setCobroModal] = useState(null)
  const [cobroMetodo, setCobroMetodo] = useState("efectivo")
  const ingresos = cd.movimientos.filter(m => m.tipo==="ingreso").reduce((a,m) => a+m.monto, 0)
  const egresos  = cd.movimientos.filter(m => m.tipo==="egreso").reduce((a,m) => a+m.monto, 0)
  const lowStock = cd.stock.filter(p => p.stock <= p.minimo).length
  const canOpenDoctorSession = normalizeRol(role) === "especialista" || role === "gerente"
  const finSemanaTurnos = (() => {
    const d = new Date(`${TODAY}T12:00:00`)
    d.setDate(d.getDate() + 6)
    return d.toISOString().slice(0, 10)
  })()
  const turnosProximos7 = (cd.turnos || []).filter(t => t.fecha >= TODAY && t.fecha <= finSemanaTurnos).length
  const estadosHoyData = [
    { n: "Pendiente", v: todayT.filter(t => t.estado === "pendiente").length, c: "#94A3B8" },
    { n: "En curso", v: todayT.filter(t => t.estado === "en_curso").length, c: C.violet },
    { n: "En recepción", v: todayT.filter(t => t.estado === "listo_cobrar").length, c: "#F59E0B" },
    { n: "Finalizado", v: todayT.filter(t => t.estado === "finalizado").length, c: "#10B981" },
  ]
  const pacientesDeSede = (data.pacientes || []).filter(p => p && p.clinicId != null && +p.clinicId === +clinic)
  const clientesActivos = pacientesDeSede.length
  const nuevosClientesMes = pacientesDeSede.filter(p => {
    if (!p?.created_at) return false
    const s = String(p.created_at)
    return s.length >= 7 && s.slice(0, 7) === TODAY.slice(0, 7)
  }).length

  const weekStart = (() => {
    const d = new Date()
    const dow = d.getDay() // 0 dom .. 6 sáb
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
    d.setHours(0, 0, 0, 0)
    return d
  })()
  const dayLabel = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
  const revenueData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const movsDia = cd.movimientos.filter(m => m.fecha === iso)
    return {
      d: iso === TODAY ? "Hoy" : dayLabel[i],
      i: movsDia.filter(m => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0),
      e: movsDia.filter(m => m.tipo === "egreso").reduce((a, m) => a + m.monto, 0),
    }
  })
  const apptData = [
    { n:"Valoración", v: cd.turnos.filter(t=>t.cat==="valoracion").length, c:"#F59E0B" },
    { n:"Clínico", v: cd.turnos.filter(t=>t.cat==="clinico").length, c:"#10B981" },
    { n:"Láser",   v: cd.turnos.filter(t=>t.cat==="laser").length,   c:"#3B82F6" },
    { n:"Bótox",   v: cd.turnos.filter(t=>t.cat==="botox").length,   c:"#8B5CF6" },
  ]

  const abrirCobroModal = (turnoId, alertCobro = null) => {
    const t = (cd.turnos || []).find(x => x.id === turnoId)
    if (!t) return
    const srv = (data.servicios || []).find(s => s.id === (t.servicioFacturadoId || -1)) || (data.servicios || []).find(s => s.nombre === t.servicio)
    const montoServicio = alertCobro?.montoServicio ?? (srv?.precio || 0)
    const montoInsumos = alertCobro?.montoInsumos ?? 0
    const montoTotal = alertCobro?.montoTotal ?? (montoServicio + montoInsumos)
    setCobroModal({ turnoId, alertCobro, turno: t, montoServicio, montoInsumos, montoTotal })
    setCobroMetodo("efectivo")
  }

  const registrarIngresoCobroRespaldo = async ({ turnoId, turno, montoTotal, metodo }) => {
    if (!turnoId || !(montoTotal > 0)) return
    const fecha = turno?.fecha || TODAY
    const cliente = turno?.cliente || "Paciente"
    const concepto = `Cobro turno #${turnoId} — ${cliente}`
    const comprobante = `AUTO-TURNO-${turnoId}`

    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        const { data: tpvExists } = await supabase
          .from("tpv_movimientos")
          .select("id")
          .eq("comprobante", comprobante)
          .limit(1)
        if (!tpvExists?.length) {
          await supabase.from("tpv_movimientos").insert({
            fecha,
            clinic_id: clinic,
            metodo: metodo || "efectivo",
            monto: montoTotal,
            concepto,
            comprobante,
          })
        }
      } catch {}
      try {
        const { data: clinicExists } = await supabase
          .from("clinic_movimientos")
          .select("id")
          .eq("clinic_id", clinic)
          .ilike("concepto", `%turno #${turnoId}%`)
          .limit(1)
        if (!clinicExists?.length) {
          await supabase.from("clinic_movimientos").insert({
            clinic_id: clinic,
            tipo: "ingreso",
            fecha,
            concepto,
            cat: "servicios",
            monto: montoTotal,
          })
        }
      } catch {}
    }

    setData(d => {
      const tpvMovs = d.tpv?.movimientos || []
      const clinicMovs = d.clinics[clinic]?.movimientos || []
      const hasTpv = tpvMovs.some(m => m.comprobante === comprobante)
      const hasClinic = clinicMovs.some(m => String(m.concepto || "").toLowerCase().includes(`turno #${turnoId}`))
      const nextTpvId = tpvMovs.length ? Math.max(...tpvMovs.map(m => m.id || 0)) + 1 : 1
      const nextClinicId = clinicMovs.length ? Math.max(...clinicMovs.map(m => m.id || 0)) + 1 : 1
      return {
        ...d,
        tpv: {
          ...d.tpv,
          movimientos: hasTpv
            ? tpvMovs
            : [...tpvMovs, { id: nextTpvId, fecha, clinicId: clinic, metodo: metodo || "efectivo", monto: montoTotal, concepto, comprobante }],
        },
        clinics: {
          ...d.clinics,
          [clinic]: {
            ...d.clinics[clinic],
            movimientos: hasClinic
              ? clinicMovs
              : [...clinicMovs, { id: nextClinicId, tipo: "ingreso", fecha, concepto, cat: "servicios", monto: montoTotal }],
          },
        },
      }
    })
  }

  const cobrarDirecto = async () => {
    if (!cobroModal) return
    const { turnoId, alertCobro, turno, montoTotal } = cobroModal
    setCobrandoId(turnoId)
    try {
      if (import.meta.env.VITE_SUPABASE_URL) {
        let { error: eTurno } = await supabase.from("turnos").update({ estado: "finalizado", metodo_pago: cobroMetodo }).eq("id", turnoId)
        if (eTurno?.message?.includes("metodo_pago")) {
          ({ error: eTurno } = await supabase.from("turnos").update({ estado: "finalizado" }).eq("id", turnoId))
        }
        if (eTurno) {
          alert(eTurno.message || "No se pudo cerrar el cobro.")
          return
        }
        if (alertCobro?.id && typeof alertCobro.id === "number") {
          await supabase.from("alertas_cobro").update({ estado: "cobrado", metodo_pago: cobroMetodo }).eq("id", alertCobro.id)
        }
      }
      await registrarIngresoCobroRespaldo({ turnoId, turno, montoTotal, metodo: cobroMetodo })
      setData(d => ({
        ...d,
        alertasCobro: (d.alertasCobro || []).map(a => a.turnoId === turnoId && a.estado === "pendiente" ? { ...a, estado: "cobrado", metodoPago: cobroMetodo } : a),
        clinics: {
          ...d.clinics,
          [clinic]: {
            ...d.clinics[clinic],
            turnos: (d.clinics[clinic]?.turnos || []).map(x => x.id === turnoId ? { ...x, estado: "finalizado" } : x),
          },
        },
      }))
      setCobroModal(null)
    } finally {
      setCobrandoId(null)
    }
  }

  return (
    <div>
      {/* Sesiones móvil / recepción */}
      {(enCurso.length > 0 || (!isEspecialista && (listosCobrarTurnos.length > 0 || pendCobro.length > 0))) && (
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",
          gap:14,
          marginBottom:22,
        }}>
          {enCurso.length > 0 && (
            <div style={{ background:"linear-gradient(135deg,#EEF2FF,#E0E7FF)", border:`1px solid ${C.violet}44`, borderRadius:16, padding:18, boxShadow:"0 2px 8px rgba(79,70,229,.12)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <Smartphone size={18} color={C.violet}/>
                <span style={{ fontSize:13, fontWeight:800, color:C.text }}>Sesión en curso</span>
                <Badge type="en_curso">{enCurso.length}</Badge>
              </div>
              <p style={{ fontSize:12, color:C.muted, marginBottom:12, lineHeight:1.45 }}>
                {isEspecialista
                  ? "Ya iniciaste o tu compañero inició la sesión desde sala o móvil. Al cerrar la atención, el turno sigue en recepción para lo administrativo."
                  : <>Quien atiende ya inició la sesión (desde sala o móvil). Cuando finalice en el área médica, pasará a <strong>listo para cobrar</strong>.</>}
              </p>
              <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:C.text }}>
                {enCurso.map(t => (
                  <li key={t.id} style={{ marginBottom:6 }}>
                    <strong>{t.cliente}</strong> · {t.hora} · {t.servicio}
                    {t.sesionIniciadaDesde === "movil" && (
                      <span style={{ marginLeft:8, fontSize:11, color:C.violet, fontWeight:700 }}>· iniciado en móvil</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!isEspecialista && (listosCobrarTurnos.length > 0 || pendCobro.length > 0) && (
            <div style={{ background:"linear-gradient(135deg,#FFFBEB,#FEF3C7)", border:`1px solid #F59E0B55`, borderRadius:16, padding:18, boxShadow:"0 2px 8px rgba(245,158,11,.15)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <ShoppingCart size={18} color="#B45309"/>
                <span style={{ fontSize:13, fontWeight:800, color:C.text }}>Listo para cobrar</span>
                <Badge type="listo_cobrar">{listosCobrarTurnos.length + pendCobro.length}</Badge>
              </div>
              <p style={{ fontSize:12, color:C.muted, marginBottom:12, lineHeight:1.45 }}>
                Cobrá en recepción (campana 🔔 o TPV). El paciente ya tiene servicio + insumos cargados.
              </p>
              <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:C.text }}>
                {pendCobro.map(a => (
                  <li key={`a-${a.id}`} style={{ marginBottom:6 }}>
                    <strong>{a.paciente}</strong> · {a.servicio} · <span style={{ color:C.violet, fontWeight:800 }}>{fmt(a.montoTotal)}</span>
                    <button
                      type="button"
                      onClick={() => abrirCobroModal(a.turnoId, a)}
                      style={{ marginLeft:8, border:`1px solid ${C.border}`, background:"#fff", color:C.violet, borderRadius:8, padding:"3px 8px", fontSize:11, fontWeight:700, cursor:"pointer" }}
                    >
                      Cobrar
                    </button>
                  </li>
                ))}
                {listosCobrarTurnos.filter(t => !pendCobro.some(a => a.turnoId === t.id)).map(t => (
                  <li key={t.id} style={{ marginBottom:6 }}>
                    <strong>{t.cliente}</strong> · {t.servicio} · <Badge type="listo_cobrar">pendiente en caja</Badge>
                    <button
                      type="button"
                      onClick={() => abrirCobroModal(t.id)}
                      style={{ marginLeft:8, border:`1px solid ${C.border}`, background:"#fff", color:C.violet, borderRadius:8, padding:"3px 8px", fontSize:11, fontWeight:700, cursor:"pointer" }}
                    >
                      Cobrar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:14, marginBottom:22 }}>
        <KpiCard title="Turnos Hoy"      value={todayT.length}       sub={`Pendientes: ${todayT.filter(t=>t.estado==="pendiente").length}`} icon={Calendar}      accent={C.violet}  />
        {isEspecialista ? (
          <>
            <KpiCard title="Citas (7 días)" value={turnosProximos7} sub="Incluye hoy · esta clínica" icon={Activity} accent="#0EA5E9" />
            <KpiCard title="Pacientes" value={clientesActivos} sub={`Nuevos este mes: ${nuevosClientesMes}`} icon={Users} accent="#06B6D4" />
            <KpiCard title="Sesiones activas" value={enCurso.length} sub={enCurso.length ? "Atención en curso ahora" : "Sin sesión abierta"} icon={Stethoscope} accent={C.violet} />
          </>
        ) : (
          <>
            <KpiCard title="Ingresos del Mes" value={fmt(ingresos)}      sub="Movimientos de la clínica actual" icon={TrendingUp}    accent={C.success} />
            <KpiCard title="Clientes Activos" value={clientesActivos}    sub={`Nuevos este mes: ${nuevosClientesMes}`} icon={Users}       accent="#06B6D4"   />
            <KpiCard title="Alertas Stock"    value={lowStock}           sub="Productos críticos" trend={lowStock>0?"⚠ Atención":undefined} icon={AlertTriangle} accent={C.warning} />
          </>
        )}
      </div>

      {/* Charts row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap:18, marginBottom:22 }}>
        {isEspecialista ? (
          <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
            <p style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Estados de hoy</p>
            <p style={{ fontSize:12, color:C.muted, marginBottom:18 }}>Flujo de pacientes · {fmtDate(TODAY)}</p>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={estadosHoyData} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                <XAxis dataKey="n" tick={{ fontSize:11, fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:10, fill:"#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip contentStyle={{ borderRadius:10, fontSize:12, border:`1px solid ${C.border}` }}/>
                <Bar dataKey="v" name="Turnos" radius={[6,6,0,0]}>
                  {estadosHoyData.map((d, i) => <Cell key={i} fill={d.c}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
            <p style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Flujo de Caja – Semana</p>
            <p style={{ fontSize:12, color:C.muted, marginBottom:18 }}>Ingresos vs Egresos</p>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={revenueData} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                <defs>
                  <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.violet} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={C.violet} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.danger} stopOpacity={0.15}/>
                    <stop offset="95%" stopColor={C.danger} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                <XAxis dataKey="d" tick={{ fontSize:11, fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:10, fill:"#94A3B8" }} axisLine={false} tickLine={false}
                  tickFormatter={v => (v >= 1000 ? `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })}k` : String(v)) + " €"}/>
                <Tooltip formatter={(v,n) => [fmt(v), n==="i"?"Ingresos":"Egresos"]}
                  contentStyle={{ borderRadius:10, fontSize:12, border:`1px solid ${C.border}` }}/>
                <Area type="monotone" dataKey="i" stroke={C.violet} strokeWidth={2.5} fill="url(#gi)"/>
                <Area type="monotone" dataKey="e" stroke={C.danger}  strokeWidth={2}   fill="url(#ge)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <p style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Turnos por categoría</p>
          <p style={{ fontSize:12, color:C.muted, marginBottom:18 }}>{isEspecialista ? "Tipos de acto en la agenda" : "Distribución actual"}</p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={apptData} margin={{ top:0, right:0, left:-20, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
              <XAxis dataKey="n" tick={{ fontSize:11, fill:"#94A3B8" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:10, fill:"#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip contentStyle={{ borderRadius:10, fontSize:12, border:`1px solid ${C.border}` }}/>
              <Bar dataKey="v" name="Turnos" radius={[6,6,0,0]}>
                {apptData.map((d,i) => <Cell key={i} fill={d.c}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Today appointments */}
      <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <div>
            <p style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Turnos de Hoy</p>
            <p style={{ fontSize:12, color:C.muted }}>{fmtDate(TODAY)} · Clínica {clinic}</p>
          </div>
        </div>
        {todayT.length === 0
          ? <div style={{ textAlign:"center", padding:"28px 0", color:"#94A3B8", fontSize:13 }}>Sin turnos para hoy</div>
          : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <THead cols={["Hora","Cliente","Servicio","Categoría","Estado"]}/>
                <tbody>
                  {todayT.map(t => (
                    <tr key={t.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                      <td style={{ padding:"11px 14px", fontWeight:700 }}>{t.hora}</td>
                      <td style={{ padding:"11px 14px", fontWeight:600, fontSize:13 }}>
                        {canOpenDoctorSession && !["listo_cobrar", "finalizado", "cancelado"].includes(t.estado)
                          ? (
                            <button
                              type="button"
                              onClick={() => onOpenTurnoSession?.(t)}
                              style={{ border:"none", background:"none", padding:0, margin:0, fontWeight:700, color:C.violet, cursor:"pointer", textAlign:"left" }}
                              title="Abrir sesión médica"
                            >
                              {t.cliente}
                            </button>
                            )
                          : t.cliente}
                      </td>
                      <td style={{ padding:"11px 14px", fontSize:13, color:C.muted }}>{t.servicio}</td>
                      <td style={{ padding:"11px 14px" }}><Badge type={t.cat}>{catLabel[t.cat] || t.cat}</Badge></td>
                      <td style={{ padding:"11px 14px" }}><Badge type={t.estado}>{estadoLabel[t.estado]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <Modal open={!!cobroModal} onClose={() => setCobroModal(null)} title="Cobrar — Método de pago"
        footer={<>
          <Btn variant="outline" onClick={() => setCobroModal(null)}>Cancelar</Btn>
          <Btn onClick={() => void cobrarDirecto()} disabled={cobrandoId === cobroModal?.turnoId}>{cobrandoId === cobroModal?.turnoId ? "Cobrando..." : "Confirmar cobro"}</Btn>
        </>}>
        {cobroModal && (
          <div style={{ fontSize:13 }}>
            <p style={{ marginBottom:12 }}><strong>{cobroModal.turno?.cliente}</strong> · {cobroModal.turno?.servicio}</p>
            <div style={{ background:C.subtle, borderRadius:10, padding:12, marginBottom:14, fontSize:12 }}>
              <div>Servicio: {fmt(cobroModal.montoServicio)}</div>
              <div>Consumibles: {fmt(cobroModal.montoInsumos)}</div>
              <div style={{ fontWeight:800, marginTop:6, fontSize:14, color:C.violet }}>Total: {fmt(cobroModal.montoTotal)}</div>
            </div>
            <FG label="Método de pago" full>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {[{id:"efectivo",label:"Efectivo"},{id:"tarjeta",label:"Tarjeta"},{id:"transferencia",label:"Transferencia"}].map(m => (
                  <button key={m.id} type="button" onClick={() => setCobroMetodo(m.id)}
                    style={{ flex:1, minWidth:90, padding:"10px 12px", borderRadius:10, border:`2px solid ${cobroMetodo===m.id ? C.violet : C.border}`, background:cobroMetodo===m.id ? C.violetLight : "#fff", color:cobroMetodo===m.id ? C.violet : C.text, fontWeight:700, fontSize:13, cursor:"pointer", transition:"all .15s" }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </FG>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── SECTION: AGENDA ─────────────────────────────────────────
function Agenda({ data, clinic, setData, onPersist, role, clinicOptions: clinicOptionsProp = [] }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const [view, setView] = useState("lista")
  const [profFilter, setProfFilter] = useState("all")
  const [open, setOpen] = useState(false)
  const [savingTurno, setSavingTurno] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrTurno, setQrTurno] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [qrBaseDraft, setQrBaseDraft] = useState(() => (typeof window !== "undefined" ? getAppBaseUrl() : ""))
  const [qrBaseTick, setQrBaseTick] = useState(0)
  const [dispRows, setDispRows] = useState([])
  const [savingDisp, setSavingDisp] = useState(false)
  const [dispForm, setDispForm] = useState({ empleadoId: "", diaSemana: 1, horaDesde: "09:00", horaHasta: "18:00", nota: "" })
  const profs = useMemo(() => {
    const fromEmpleados = (data.empleados || [])
      .filter(e => esEmpleadoAtiendeAgenda(e))
      .map(e => ({
        id: +e.id,
        clinicId: e.clinicId ?? e.clinic_id ?? null,
        nombre: e.nombre || "Profesional",
      }))
    if (fromEmpleados.length > 0) return fromEmpleados
    return (data.profesionales || []).map(p => ({
      id: +p.id,
      clinicId: p.clinicId ?? p.clinic_id ?? null,
      nombre: p.nombre || "Profesional",
    }))
  }, [data.empleados, data.profesionales])
  const allowCrossClinicAgenda = role === "gerente" || role === "encargado" || role === "recepcionista"
  const canEditDisponibilidad = role === "gerente" || role === "encargado" || role === "recepcionista"
  const [form, setForm] = useState({ clinicId: clinic, clienteSelId:"", cliente:"", tel:"", dni:"", fecha:TODAY, hora:"", cat:"valoracion", servicio:"", salaTrabajo:"", obs:"", profesionalId:"" })
  const profsForClinic = useMemo(() => {
    const targetClinic = allowCrossClinicAgenda ? (+form.clinicId || clinic) : clinic
    return profs.filter(p => p.clinicId == null || +p.clinicId === +targetClinic)
  }, [allowCrossClinicAgenda, form.clinicId, clinic, profs])
  const clientesForClinic = useMemo(() => {
    const targetClinic = allowCrossClinicAgenda ? (+form.clinicId || clinic) : clinic
    return (data.pacientes || [])
      .filter(p => p && +p.clinicId === +targetClinic)
      .slice()
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" }))
  }, [allowCrossClinicAgenda, form.clinicId, clinic, data.pacientes])
  const u = (k,v) => setForm(f => ({ ...f, [k]:v }))
  const turnosRaw = data.clinics[clinic].turnos
  const turnos = profFilter === "all" ? turnosRaw : turnosRaw.filter(t => (t.profesionalId || 1) === +profFilter)
  const profNombre = id => profs.find(p => p.id === id)?.nombre || "—"
  const canSaveTurno = Boolean(String(form.cliente || "").trim() && String(form.hora || "").trim() && String(form.servicio || "").trim())

  useEffect(() => {
    setForm(f => ({ ...f, clinicId: clinic }))
  }, [clinic])

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) return
    let cancelled = false
    ;(async () => {
      const { data: rows, error } = await supabase
        .from("agenda_disponibilidad")
        .select("id, clinic_id, empleado_id, dia_semana, hora_desde, hora_hasta, nota, activo")
        .eq("clinic_id", clinic)
        .order("dia_semana", { ascending: true })
        .order("hora_desde", { ascending: true })
      if (cancelled) return
      if (error) {
        console.warn(error)
        setDispRows([])
        return
      }
      setDispRows((rows || []).map(r => ({
        id: r.id,
        clinicId: r.clinic_id,
        empleadoId: r.empleado_id,
        diaSemana: r.dia_semana,
        horaDesde: r.hora_desde || "09:00",
        horaHasta: r.hora_hasta || "18:00",
        nota: r.nota || "",
        activo: r.activo !== false,
      })))
    })()
    return () => { cancelled = true }
  }, [clinic, onPersist])

  const saveDisponibilidad = async () => {
    if (!canEditDisponibilidad) return
    if (!dispForm.empleadoId) {
      alert("Seleccioná un profesional.")
      return
    }
    if (!dispForm.horaDesde || !dispForm.horaHasta || dispForm.horaDesde >= dispForm.horaHasta) {
      alert("Horario inválido: la hora desde debe ser menor que la hora hasta.")
      return
    }
    if (import.meta.env.VITE_SUPABASE_URL) {
      setSavingDisp(true)
      try {
        const payload = {
          clinic_id: clinic,
          empleado_id: +dispForm.empleadoId,
          dia_semana: +dispForm.diaSemana,
          hora_desde: dispForm.horaDesde,
          hora_hasta: dispForm.horaHasta,
          nota: String(dispForm.nota || "").trim(),
          activo: true,
        }
        const { data: ins, error } = await supabase
          .from("agenda_disponibilidad")
          .insert(payload)
          .select("id, clinic_id, empleado_id, dia_semana, hora_desde, hora_hasta, nota, activo")
          .single()
        if (error) {
          alert(error.message || "No se pudo guardar la disponibilidad.")
          return
        }
        setDispRows(prev => [...prev, {
          id: ins.id,
          clinicId: ins.clinic_id,
          empleadoId: ins.empleado_id,
          diaSemana: ins.dia_semana,
          horaDesde: ins.hora_desde,
          horaHasta: ins.hora_hasta,
          nota: ins.nota || "",
          activo: ins.activo !== false,
        }].sort((a, b) => (a.diaSemana - b.diaSemana) || String(a.horaDesde).localeCompare(String(b.horaDesde))))
      } finally {
        setSavingDisp(false)
      }
    } else {
      const id = dispRows.length ? Math.max(...dispRows.map(r => +r.id || 0)) + 1 : 1
      setDispRows(prev => [...prev, {
        id,
        clinicId: clinic,
        empleadoId: +dispForm.empleadoId,
        diaSemana: +dispForm.diaSemana,
        horaDesde: dispForm.horaDesde,
        horaHasta: dispForm.horaHasta,
        nota: String(dispForm.nota || "").trim(),
        activo: true,
      }])
    }
    setDispForm({ empleadoId: "", diaSemana: 1, horaDesde: "09:00", horaHasta: "18:00", nota: "" })
  }

  const delDisponibilidad = async id => {
    if (!canEditDisponibilidad) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("agenda_disponibilidad").delete().eq("id", id)
      if (error) {
        alert(error.message || "No se pudo borrar la disponibilidad.")
        return
      }
    }
    setDispRows(prev => prev.filter(r => r.id !== id))
  }

  const prevOpenRef = useRef(false)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (!justOpened) return
    setForm(f => {
      if (String(f.servicio || "").trim()) return f
      const list = (data.servicios || []).filter(s => s.cat === f.cat)
      const pick = list.length ? list[0].nombre : (f.cat === "valoracion" ? "Valoración (primera consulta)" : "")
      if (!pick) return f
      return { ...f, servicio: pick }
    })
  }, [open, data.servicios])

  const save = async () => {
    if (!canSaveTurno) {
      alert("Completá Cliente, Hora y Servicio para guardar el turno.")
      return
    }
    const targetClinic = allowCrossClinicAgenda ? (+form.clinicId || clinic) : clinic
    const targetTurnos = data.clinics[targetClinic]?.turnos || []
    const id = targetTurnos.length ? Math.max(...targetTurnos.map(t=>t.id))+1 : 1
    const pid = form.profesionalId === "" ? undefined : (+form.profesionalId || undefined)
    const pacienteId = findPacienteIdByNombre(data, form.cliente, targetClinic)
    const dniTrim = String(form.dni || "").trim()
    const obsConSala = upsertSalaTrabajoEnObs(form.obs, form.salaTrabajo)
    const applyDniToCliente = () => {
      if (!pacienteId || !dniTrim) return
      setData(d => ({
        ...d,
        pacientes: (d.pacientes || []).map(p => (p.id === pacienteId ? { ...p, dni: dniTrim } : p)),
      }))
    }
    if (import.meta.env.VITE_SUPABASE_URL) {
      setSavingTurno(true)
      try {
        const { data: { session: sb } } = await supabase.auth.getSession()
        const token = sb?.access_token
        if (!token) {
          alert("Tu sesión expiró. Volvé a iniciar sesión.")
          return
        }
        const r = await fetch("/api/erp/turno/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ clinicId: targetClinic, ...form, obs: obsConSala, profesionalId: pid, pacienteId, dni: dniTrim || undefined }),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => null)
          const insDirect = {
            clinic_id: +targetClinic,
            cliente: String(form.cliente || "").trim(),
            tel: String(form.tel || ""),
            fecha: String(form.fecha || ""),
            hora: String(form.hora || ""),
            cat: String(form.cat || "valoracion"),
            servicio: String(form.servicio || ""),
            obs: String(obsConSala || ""),
            estado: "pendiente",
            empleado_id: pid ?? null,
            cliente_id: pacienteId ?? null,
          }
          const { error: eTurno } = await supabase.from("turnos").insert(insDirect)
          if (eTurno) {
            alert(j?.error || eTurno.message || "No se pudo guardar el turno.")
            return
          }
        }
        if (pacienteId && dniTrim) {
          const { error: eDni } = await supabase.from("clientes").update({ dni: dniTrim }).eq("id", pacienteId)
          if (eDni) console.warn(eDni)
        }
        applyDniToCliente()
        await onPersist?.()
        setOpen(false)
        setForm({ clinicId: targetClinic, clienteSelId:"", cliente:"", tel:"", dni:"", fecha:TODAY, hora:"", cat:"valoracion", servicio:"", salaTrabajo:"", obs:"", profesionalId:"" })
      } finally {
        setSavingTurno(false)
      }
      return
    }
    applyDniToCliente()
    setData(d => ({ ...d, clinics: { ...d.clinics, [targetClinic]: {
      ...d.clinics[targetClinic], turnos: [...d.clinics[targetClinic].turnos, { ...form, obs: obsConSala, id, estado:"pendiente", profesionalId: pid, pacienteId: pacienteId ?? undefined }]
    }}}))
    setOpen(false)
    setForm({ clinicId: targetClinic, clienteSelId:"", cliente:"", tel:"", dni:"", fecha:TODAY, hora:"", cat:"valoracion", servicio:"", salaTrabajo:"", obs:"", profesionalId:"" })
  }
  const del = id => setData(d => ({ ...d, clinics: { ...d.clinics, [clinic]: {
    ...d.clinics[clinic], turnos: d.clinics[clinic].turnos.filter(t=>t.id!==id)
  }}}))
  const patchTurno = (id, patch) => setData(d => ({ ...d, clinics: { ...d.clinics, [clinic]: {
    ...d.clinics[clinic], turnos: d.clinics[clinic].turnos.map(t => t.id===id ? { ...t, ...patch } : t)
  }}}))
  const setTurnoEstado = async (turnoId, nextEstado) => {
    if (!turnoId || !nextEstado) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("turnos").update({ estado: nextEstado }).eq("id", turnoId)
      if (error) {
        alert(error.message || "No se pudo actualizar el estado del turno.")
        return
      }
    }
    patchTurno(turnoId, { estado: nextEstado })
  }
  const weekTurnos = profFilter === "all" ? data.clinics[clinic].turnos : data.clinics[clinic].turnos.filter(t => (t.profesionalId||1)===+profFilter)

  /* Calendar */
  const weekStart = (() => {
    const d = new Date(); const dow = d.getDay()
    d.setDate(d.getDate() - (dow===0?6:dow-1)); return d
  })()
  const week = Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d})
  const dayL = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]
  const catColor = { valoracion:"#FFFBEB", facial:"#EFF6FF", corporal:"#F0FDFA", laser:"#EEF2FF", botox:"#FDF4FF", clinico:"#ECFDF5" }
  const catText  = { valoracion:"#B45309", facial:"#1D4ED8", corporal:"#0F766E", laser:"#3730A3", botox:"#6B21A8", clinico:"#065F46" }
  const catSvcs = useMemo(() => {
    const list = (data.servicios || []).filter(s => s.cat === form.cat)
    if (form.cat === "valoracion" && list.length === 0) {
      return [{ id: "__valoracion_placeholder__", nombre: "Valoración (primera consulta)", cat: "valoracion", precio: 0, duracion: 45, sesiones: 1 }]
    }
    return list
  }, [data.servicios, form.cat])
  const noServiciosEnCategoria = catSvcs.length === 0
  const sedesParaSelect = useMemo(() => {
    if ((clinicOptionsProp || []).length)
      return clinicOptionsProp
    return Object.keys(data.clinics || {}).map(cid => ({ id: +cid, nombre: `Clínica ${cid}` }))
  }, [clinicOptionsProp, data.clinics])
  const nombreClinica = id =>
    clinicOptionsProp.find(c => +c.id === +id)?.nombre || `Clínica ${id}`
  const puedeQrAreaMedica = t => t && !["listo_cobrar", "finalizado"].includes(t.estado)

  const saveQrBase = () => {
    try {
      const v = qrBaseDraft.trim()
      if (v) sessionStorage.setItem(STORAGE_QR_BASE, v)
      else sessionStorage.removeItem(STORAGE_QR_BASE)
      setQrBaseTick(x => x + 1)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!qrOpen || !qrTurno) {
      setQrDataUrl("")
      return
    }
    const link = buildDoctorSessionUrl({ clinicId: clinic, turnoId: qrTurno.id })
    let cancelled = false
    const size = typeof window !== "undefined" && window.innerWidth < 480 ? 220 : 260
    QRCode.toDataURL(link, { margin: 2, width: size, color: { dark: "#312e81", light: "#ffffff" } })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl("") })
    return () => { cancelled = true }
  }, [qrOpen, qrTurno, clinic, qrBaseTick])

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700 }}>Agenda por profesional</h2>
          <p style={{ fontSize:13, color:C.muted, marginTop:2 }}>{nombreClinica(clinic)} · {turnos.length} turnos (filtrados)</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", width: compact ? "100%" : "auto" }}>
          <select style={{ ...inp, width: compact ? "100%" : 220, maxWidth:"100%", flex: compact ? "1 1 100%" : undefined }} value={profFilter} onChange={e => setProfFilter(e.target.value)}>
            <option value="all">Todos los profesionales</option>
            {profsForClinic.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <Btn onClick={() => setOpen(true)} style={{ width: compact ? "100%" : "auto", justifyContent:"center" }}><Plus size={14}/> Nuevo Turno</Btn>
        </div>
      </div>

      <div style={{ marginBottom:18, padding:14, background:C.subtle, borderRadius:12, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:12, fontWeight:700, marginBottom:6, display:"flex", alignItems:"center", gap:6 }}><QrCode size={16} color={C.violet}/> URL para escanear con el teléfono</div>
        <p style={{ fontSize:12, color:C.muted, marginBottom:10, lineHeight:1.45 }}>
          El QR debe coincidir con la IP que muestra Vite en <strong>Network</strong> (y con HTTPS si usás <code style={codeStyle(C.card)}>VITE_DEV_HTTPS=true</code>). Podés fijar la base en <code style={codeStyle(C.card)}>VITE_PUBLIC_APP_URL</code> o editá abajo y <strong>Guardar</strong> (tiene prioridad). Si abrís la app en el PC por la IP de la red, el QR usa esa misma URL aunque el <code style={codeStyle(C.card)}>.env</code> tenga otra IP antigua.
        </p>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"stretch", flexDirection: compact ? "column" : "row" }}>
          <input
            style={{ ...inp, flex:1, minWidth:0, width: compact ? "100%" : undefined }}
            value={qrBaseDraft}
            onChange={e => setQrBaseDraft(e.target.value)}
            placeholder={typeof window !== "undefined" ? window.location.origin : "http://…"}
          />
          <Btn type="button" onClick={saveQrBase} style={{ width: compact ? "100%" : "auto", justifyContent:"center" }}>Guardar</Btn>
        </div>
      </div>

      <div style={{ marginBottom:18, padding:14, background:C.card, borderRadius:12, border:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:10 }}>
          <div style={{ fontSize:14, fontWeight:700 }}>Disponibilidad del personal (clínica actual)</div>
          <div style={{ fontSize:12, color:C.muted }}>{DIA_SEMANA.length} días · {dispRows.length} franja(s)</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns: compact ? "1fr" : "repeat(6, minmax(0,1fr))", gap:8, marginBottom:10 }}>
          <select style={inp} value={dispForm.empleadoId} onChange={e => setDispForm(f => ({ ...f, empleadoId: e.target.value }))} disabled={!canEditDisponibilidad}>
            <option value="">Profesional…</option>
            {profsForClinic.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select style={inp} value={dispForm.diaSemana} onChange={e => setDispForm(f => ({ ...f, diaSemana: +e.target.value }))} disabled={!canEditDisponibilidad}>
            {[1,2,3,4,5,6,0].map(d => <option key={d} value={d}>{DIA_SEMANA[d]}</option>)}
          </select>
          <input type="time" style={inp} value={dispForm.horaDesde} onChange={e => setDispForm(f => ({ ...f, horaDesde: e.target.value }))} disabled={!canEditDisponibilidad}/>
          <input type="time" style={inp} value={dispForm.horaHasta} onChange={e => setDispForm(f => ({ ...f, horaHasta: e.target.value }))} disabled={!canEditDisponibilidad}/>
          <input style={{ ...inp, gridColumn: compact ? "auto" : "span 2" }} placeholder="Nota (opcional)" value={dispForm.nota} onChange={e => setDispForm(f => ({ ...f, nota: e.target.value }))} disabled={!canEditDisponibilidad}/>
        </div>
        {canEditDisponibilidad && <Btn sm onClick={() => void saveDisponibilidad()} disabled={savingDisp}>{savingDisp ? "Guardando..." : "Agregar disponibilidad"}</Btn>}
        <div style={{ marginTop:10, maxHeight:180, overflowY:"auto" }}>
          {dispRows.length === 0 ? <div style={{ fontSize:12, color:C.muted }}>Sin disponibilidades cargadas.</div> : dispRows.map(r => (
            <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, borderBottom:`1px solid ${C.subtle}`, padding:"7px 0" }}>
              <div style={{ fontSize:12 }}>
                <strong>{profsForClinic.find(p => +p.id === +r.empleadoId)?.nombre || `Profesional ${r.empleadoId}`}</strong>{" "}
                · {DIA_SEMANA[r.diaSemana] || r.diaSemana} · {r.horaDesde}–{r.horaHasta}
                {r.nota ? ` · ${r.nota}` : ""}
              </div>
              {canEditDisponibilidad && <Btn variant="danger" sm onClick={() => void delDisponibilidad(r.id)}><Trash2 size={11}/></Btn>}
            </div>
          ))}
        </div>
      </div>

      <TabBar tabs={[{id:"semana",label:"Semana"},{id:"lista",label:"Lista"}]} active={view} onChange={setView}/>

      {view==="semana" && (
        <div style={{ background:C.card, borderRadius:16, padding:18, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <div style={{ display:"grid", gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(7,1fr)", gap:8 }}>
            {week.map((d,i) => {
              const ds = d.toISOString().split("T")[0]
              const isToday = ds===TODAY
              const dt = weekTurnos.filter(t => t.fecha===ds)
              return (
                <div key={i} style={{ borderRadius:10, overflow:"hidden", border:`1px solid ${isToday?C.violet+"40":C.border}` }}>
                  <div style={{ textAlign:"center", padding:"7px 4px",
                    background: isToday ? C.violetLight : C.subtle,
                    color: isToday ? C.violet : C.muted,
                    fontSize:11, fontWeight:700, textTransform:"uppercase" }}>
                    {dayL[i]}<br/>
                    <span style={{ fontSize:15, fontWeight:isToday?800:600 }}>{d.getDate()}</span>
                  </div>
                  <div style={{ minHeight:72, padding:4 }}>
                    {dt.slice(0,3).map(t => (
                      <div key={t.id} style={{ background:catColor[t.cat] ?? catColor.clinico, color:catText[t.cat] ?? catText.clinico,
                        fontSize:10, fontWeight:600, padding:"3px 5px", borderRadius:5, marginBottom:2,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {t.hora} {t.cliente.split(" ")[0]}
                      </div>
                    ))}
                    {dt.length>3&&<div style={{fontSize:9,color:C.muted,padding:"2px 4px"}}>+{dt.length-3} más</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view==="lista" && (
        <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          {turnos.length===0
            ? <div style={{textAlign:"center",padding:"36px 0",color:"#94A3B8",fontSize:13}}>Sin turnos registrados</div>
            : <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <THead cols={["Fecha","Hora","Profesional","Cliente","Teléfono","Servicio","Cat.","Estado",""]}/>
                  <tbody>
                    {[...turnos].sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora.localeCompare(b.hora)).map(t=>(
                      <tr key={t.id} style={{borderBottom:`1px solid ${C.subtle}`}}>
                        <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>{fmtDate(t.fecha)}</td>
                        <td style={{padding:"11px 14px",fontWeight:700}}>{t.hora}</td>
                        <td style={{padding:"11px 14px",fontSize:12,maxWidth:120}}>
                          {t.estado === "listo_cobrar" ? "Recepción" : profNombre(t.profesionalId||1)}
                        </td>
                        <td style={{padding:"11px 14px",fontWeight:600,fontSize:13}}>{t.cliente}</td>
                        <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>{t.tel||"—"}</td>
                        <td style={{padding:"11px 14px",fontSize:13}}>{t.servicio}</td>
                        <td style={{padding:"11px 14px"}}><Badge type={t.cat}>{catLabel[t.cat] || t.cat}</Badge></td>
                        <td style={{padding:"11px 14px"}}><Badge type={t.estado}>{estadoLabel[t.estado]}</Badge></td>
                        <td style={{padding:"11px 14px"}}>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {t.estado==="pendiente" && <Btn variant="outline" sm onClick={() => void setTurnoEstado(t.id, "confirmado")}>Confirmar</Btn>}
                            {t.estado==="confirmado" && <Btn sm onClick={() => void setTurnoEstado(t.id, "en_sala")}>A sala</Btn>}
                            {puedeQrAreaMedica(t) && (
                              <Btn variant="outline" sm title="QR área médica" onClick={() => { setQrTurno(t); setQrOpen(true) }}><QrCode size={12}/></Btn>
                            )}
                            <Btn variant="danger"  sm onClick={()=>del(t.id)}><Trash2 size={11}/></Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      )}

      <Modal open={qrOpen} onClose={() => { setQrOpen(false); setQrTurno(null) }} title={qrTurno ? `QR área médica — ${qrTurno.cliente}` : "QR"}
        footer={<Btn variant="outline" onClick={() => { setQrOpen(false); setQrTurno(null) }}>Cerrar</Btn>}>
        {qrTurno && (
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:13, color:C.muted, marginBottom:14 }}>
              Quien atiende escanea el código con el celular (misma app). Debe iniciar sesión como <strong>especialista</strong> o <strong>gerente</strong>.
            </p>
            {qrDataUrl
              ? <img src={qrDataUrl} alt="Código QR sesión médica" style={{ width: "min(260px, 88vw)", height: "auto", maxWidth: "100%", margin: "0 auto", display: "block", borderRadius: 12, border: `1px solid ${C.border}` }} />
              : <div style={{ padding: 48, color: C.muted, fontSize: 13 }}>Generando código…</div>}
            <div style={{ marginTop: 16 }}>
              <Btn
                sm
                onClick={() => {
                  const link = buildDoctorSessionUrl({ clinicId: clinic, turnoId: qrTurno.id })
                  navigator.clipboard.writeText(link).catch(() => {})
                }}
              >
                <Copy size={12}/> Copiar enlace
              </Btn>
            </div>
            <p style={{ fontSize: 10, color: C.muted, marginTop: 12, wordBreak: "break-all", textAlign: "left" }}>
              {buildDoctorSessionUrl({ clinicId: clinic, turnoId: qrTurno.id })}
            </p>
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={()=>setOpen(false)} title="📅 Nuevo Turno"
        footer={<><Btn variant="outline" onClick={()=>setOpen(false)} disabled={savingTurno}>Cancelar</Btn><Btn onClick={() => void save()} disabled={savingTurno}>{savingTurno ? "Guardando..." : "Guardar Turno"}</Btn></>}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {allowCrossClinicAgenda && (
            <FG label="Sede">
              <select style={inp} value={form.clinicId} onChange={e=>u("clinicId", +e.target.value)}>
                {sedesParaSelect.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre || `Clínica ${c.id}`}</option>
                ))}
              </select>
            </FG>
          )}
          <FG label="Cliente existente (opcional)" full>
            <select
              style={inp}
              value={form.clienteSelId || ""}
              onChange={e => {
                const id = +e.target.value
                if (!id) {
                  setForm(f => ({ ...f, clienteSelId: "" }))
                  return
                }
                const hit = (data.pacientes || []).find(p => +p.id === id)
                if (!hit) return
                setForm(f => ({ ...f, clienteSelId: String(id), cliente: hit.nombre || "", tel: hit.tel || "", dni: hit.dni || "" }))
              }}
            >
              <option value="">Seleccionar cliente…</option>
              {clientesForClinic.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}{p.tel ? ` — ${p.tel}` : ""}</option>
              ))}
            </select>
          </FG>
          <FG label="Cliente"><input style={inp} value={form.cliente} onChange={e => {
            const nextNombre = e.target.value
            setForm(f => {
              if (!f.clienteSelId) return { ...f, cliente: nextNombre }
              const base = (data.pacientes || []).find(p => String(p.id) === String(f.clienteSelId))
              const same = String(base?.nombre || "").trim().toLowerCase() === String(nextNombre || "").trim().toLowerCase()
              if (same) return { ...f, cliente: nextNombre }
              // Si cambia el nombre tras seleccionar un cliente existente,
              // evitamos arrastrar teléfono/DNI de otra persona por error.
              return { ...f, clienteSelId: "", cliente: nextNombre, tel: "", dni: "" }
            })
          }} placeholder="Nombre del cliente"/></FG>
          <FG label="Teléfono"><input style={inp} value={form.tel} onChange={e=>u("tel",e.target.value)} placeholder="+54 9 ..."/></FG>
          <FG label="DNI" full><input style={inp} value={form.dni} onChange={e=>u("dni",e.target.value)} placeholder="Ej. 12345678"/></FG>
          <FG label="Fecha"><input type="date" style={inp} value={form.fecha} onChange={e=>u("fecha",e.target.value)}/></FG>
          <FG label="Hora"><input type="time" style={inp} value={form.hora} onChange={e=>u("hora",e.target.value)}/></FG>
          <FG label="Categoría">
            <select style={inp} value={form.cat} onChange={e=>{u("cat",e.target.value);u("servicio","")}}>
              <option value="valoracion">Valoración (primera consulta)</option>
              <option value="clinico">Clínico</option>
              <option value="facial">Facial</option>
              <option value="corporal">Corporal</option>
              <option value="laser">Láser</option>
              <option value="botox">Bótox</option>
            </select>
          </FG>
          <FG label="Servicio">
            <select style={inp} value={form.servicio} onChange={e=>u("servicio",e.target.value)}>
              <option value="">{noServiciosEnCategoria ? "No hay ítems en esta categoría" : "Seleccionar…"}</option>
              {catSvcs.map(s=><option key={s.id} value={s.nombre}>{s.nombre}</option>)}
            </select>
          </FG>
          <FG label="Centro / Sala de trabajo">
            <input style={inp} value={form.salaTrabajo} onChange={e=>u("salaTrabajo", e.target.value)} placeholder="Ej: Sala 2 / Box Láser"/>
          </FG>
          <FG label="Profesional">
            <select style={inp} value={form.profesionalId} onChange={e=>u("profesionalId", e.target.value)}>
              <option value="">Sin asignar</option>
              {profsForClinic.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </FG>
          <FG label="Observaciones" full>
            <textarea style={{...inp,resize:"vertical",minHeight:60}} value={form.obs} onChange={e=>u("obs",e.target.value)} placeholder="Notas…"/>
          </FG>
          {noServiciosEnCategoria && <div style={{ gridColumn:"1 / -1", fontSize:12, color:C.muted }}>No hay servicios en esta categoría. Cargalos en la sección Servicios (o ejecutá el SQL de valoración en Supabase).</div>}
          {form.cat === "valoracion" && <div style={{ gridColumn:"1 / -1", fontSize:12, color:C.muted, lineHeight:1.45 }}>
            En <strong>valoración</strong> no hace falta definir todavía el tratamiento a cobrar: quien atiende lo registra luego en sala / área médica.
          </div>}
        </div>
      </Modal>
    </div>
  )
}

// ─── SECTION: STOCK ──────────────────────────────────────────
function Stock({ data, clinic, setData, onPersist, role }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const [tab, setTab] = useState("articulos")
  const allowCrossClinicInventory = role === "gerente" || role === "encargado" || role === "recepcionista"
  const [open, setOpen] = useState(false)
  const [openProv, setOpenProv] = useState(false)
  const [openPedido, setOpenPedido] = useState(false)
  const [openRecepcion, setOpenRecepcion] = useState(false)
  const [openTraslado, setOpenTraslado] = useState(false)
  const [openScan, setOpenScan] = useState(false)
  const [search, setSearch] = useState("")
  const [catF, setCatF] = useState("")
  const [scanErr, setScanErr] = useState("")
  const [loadingBarcode, setLoadingBarcode] = useState(false)
  const [form, setForm] = useState({nombre:"",cat:"clinico",unidad:"unidades",stock:0,minimo:5,costo:0,proveedor:"",codigoBarras:"",fotoUrl:""})
  const [provForm, setProvForm] = useState({ nombre:"", contacto:"", tel:"", email:"", productosText:"" })
  const [pedidoForm, setPedidoForm] = useState({ proveedorId:"", fecha:TODAY, notas:"", items:[{ nombre:"", cantidad:1, costo:0 }] })
  const [recepcionForm, setRecepcionForm] = useState({ pedidoId:null, remito:"", observaciones:"", fotosText:"", items:[] })
  const [trasladoForm, setTrasladoForm] = useState({ origenClinicId:"", productoId:"", cantidad:1, nota:"" })
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanTimerRef = useRef(null)
  const u = (k,v) => setForm(f=>({...f,[k]:v}))
  const up = (k,v) => setProvForm(f=>({...f,[k]:v}))
  const proveedoresRaw = data.proveedores || []
  const proveedores = useMemo(() => {
    if (proveedoresRaw.length > 0) return proveedoresRaw
    // Fallback visual: si no hay tabla de proveedores cargada,
    // derivamos proveedores únicos desde el catálogo de stock.
    const byName = new Map()
    let nid = 1
    for (const c of Object.values(data.clinics || {})) {
      for (const p of (c?.stock || [])) {
        const nombre = String(p?.proveedor || "").trim()
        if (!nombre) continue
        const key = nombre.toLowerCase()
        if (!byName.has(key)) {
          byName.set(key, { id: nid++, nombre, contacto: "", tel: "", email: "", productos: [] })
        }
      }
    }
    return [...byName.values()]
  }, [proveedoresRaw, data.clinics])
  const pedidos = (data.pedidosProveedor || []).filter(p => +p.clinicId === +clinic)
  const incidencias = (data.incidenciasProveedor || []).filter(i => +i.clinicId === +clinic)
  const traslados = (data.trasladosInternos || []).filter(t => +t.origenClinicId === +clinic || +t.destinoClinicId === +clinic)
  const all = data.clinics[clinic].stock
  const list = all.filter(p=>p.nombre.toLowerCase().includes(search.toLowerCase())&&(!catF||p.cat===catF))
  const barcodeSoportado = typeof window !== "undefined" && "BarcodeDetector" in window
  const proveedorSel = proveedores.find(p => p.id === +pedidoForm.proveedorId)
  const apiPost = async (path, payload) => {
    const { data: { session: sb } } = await supabase.auth.getSession()
    const token = sb?.access_token
    if (!token) throw new Error("Sin sesión")
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload || {}),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
    return j
  }
  const createStockDirectSupabase = async () => {
    const nombre = String(form.nombre || "").trim()
    if (!nombre) throw new Error("Nombre requerido")
    const insArticulo = {
      nombre,
      cat: String(form.cat || "clinico"),
      unidad: String(form.unidad || "unidades"),
      minimo: +form.minimo || 0,
      costo: +form.costo || 0,
      proveedor: String(form.proveedor || ""),
      codigo_barras: String(form.codigoBarras || ""),
      foto_url: String(form.fotoUrl || ""),
    }
    const { data: art, error: eArt } = await supabase
      .from("articulos")
      .insert(insArticulo)
      .select("id")
      .single()
    if (eArt || !art?.id) throw new Error(eArt?.message || "No se pudo crear artículo")
    const { error: eApc } = await supabase
      .from("articulos_por_clinica")
      .upsert({ clinic_id: clinic, articulo_id: art.id, cantidad: +form.stock || 0 }, { onConflict: "clinic_id,articulo_id" })
    if (eApc) throw new Error(eApc.message || "No se pudo asignar stock por clínica")
  }
  const otherClinicIds = Object.keys(data.clinics || {}).map(n => +n).filter(n => n !== +clinic).sort((a,b) => a-b)
  const stockOrigenTraslado = trasladoForm.origenClinicId ? (data.clinics[+trasladoForm.origenClinicId]?.stock || []) : []
  const itemTraslado = stockOrigenTraslado.find(x => x.id === +trasladoForm.productoId)
  const stockHydratedRef = useRef(false)
  const opsHydratedRef = useRef(false)

  useEffect(() => {
    if (stockHydratedRef.current) return
    if (!import.meta.env.VITE_SUPABASE_URL) return
    if (!clinic) return
    if ((data.clinics?.[clinic]?.stock || []).length > 0) {
      stockHydratedRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: arts, error } = await supabase
        .from("articulos")
        .select("id, nombre, cat, unidad, minimo, costo, proveedor, codigo_barras, foto_url")
        .order("id")
      if (cancelled || error || !Array.isArray(arts) || arts.length === 0) return
      stockHydratedRef.current = true
      setData(d => {
        const cd = d.clinics?.[clinic] || { turnos: [], stock: [], movimientos: [] }
        if ((cd.stock || []).length > 0) return d
        return {
          ...d,
          clinics: {
            ...d.clinics,
            [clinic]: {
              ...cd,
              stock: arts.map(a => ({
                id: a.id,
                nombre: a.nombre || "",
                cat: a.cat || "general",
                unidad: a.unidad || "unidades",
                minimo: +a.minimo || 0,
                costo: +a.costo || 0,
                proveedor: a.proveedor || "",
                codigoBarras: a.codigo_barras || "",
                fotoUrl: a.foto_url || "",
                stock: 0,
              })),
            },
          },
        }
      })
    })()
    return () => { cancelled = true }
  }, [clinic, data.clinics, setData])

  useEffect(() => {
    if (opsHydratedRef.current) return
    if (!import.meta.env.VITE_SUPABASE_URL) return
    const needsOps =
      (data.proveedores || []).length === 0 ||
      (data.pedidosProveedor || []).length === 0 ||
      (data.incidenciasProveedor || []).length === 0 ||
      (data.trasladosInternos || []).length === 0
    if (!needsOps) {
      opsHydratedRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      const [provsRes, provProdRes, pedidosRes, incidRes, trasRes] = await Promise.all([
        supabase.from("proveedores").select("id, nombre, contacto, tel, email").order("id"),
        supabase.from("proveedor_productos").select("id, proveedor_id, nombre_producto, costo_ref").order("id"),
        supabase.from("pedidos_compra").select("id, clinic_id, proveedor_id, fecha, notas, estado, total_estimado").order("id"),
        supabase.from("incidencias_proveedor").select("id, clinic_id, proveedor_id, pedido_id, producto, esperado, recibido, faltante, malo, lote, nota, fotos_urls, estado, created_at").order("id"),
        supabase.from("traslados_internos").select("id, origen_clinic_id, destino_clinic_id, articulo_id, producto_nombre, cantidad, estado, nota, creado_at, enviado_at, recibido_at").order("id"),
      ])
      if (cancelled) return
      const pedidos = pedidosRes.data || []
      let pedidoItems = []
      if (pedidos.length) {
        const ids = pedidos.map(p => p.id)
        const pi = await supabase.from("pedido_compra_items").select("id, pedido_id, nombre_producto, cantidad_ordenada, costo_unit").in("pedido_id", ids)
        pedidoItems = pi.data || []
      }
      const provById = new Map()
      for (const p of (provsRes.data || [])) {
        provById.set(p.id, { id: p.id, nombre: p.nombre, contacto: p.contacto, tel: p.tel, email: p.email, productos: [] })
      }
      for (const pp of (provProdRes.data || [])) {
        const p = provById.get(pp.proveedor_id)
        if (p) p.productos.push({ id: pp.id, nombre: pp.nombre_producto, costo: +pp.costo_ref || 0 })
      }
      const itemsByPedido = new Map()
      for (const it of pedidoItems) {
        if (!itemsByPedido.has(it.pedido_id)) itemsByPedido.set(it.pedido_id, [])
        itemsByPedido.get(it.pedido_id).push({ nombre: it.nombre_producto, cantidad: +it.cantidad_ordenada || 0, costo: +it.costo_unit || 0 })
      }
      opsHydratedRef.current = true
      setData(d => ({
        ...d,
        proveedores: [...provById.values()],
        pedidosProveedor: pedidos.map(p => ({
          id: p.id,
          clinicId: p.clinic_id,
          proveedorId: p.proveedor_id,
          fecha: p.fecha,
          notas: p.notas || "",
          estado: p.estado,
          total: +p.total_estimado || 0,
          items: itemsByPedido.get(p.id) || [],
        })),
        incidenciasProveedor: (incidRes.data || []).map(i => ({
          id: i.id,
          clinicId: i.clinic_id,
          proveedorId: i.proveedor_id,
          pedidoId: i.pedido_id,
          producto: i.producto,
          esperado: +i.esperado || 0,
          recibido: +i.recibido || 0,
          faltante: +i.faltante || 0,
          malo: +i.malo || 0,
          lote: i.lote || "",
          nota: i.nota || "",
          fotos: i.fotos_urls || [],
          estado: i.estado,
          creadaAt: i.created_at,
        })),
        trasladosInternos: (trasRes.data || []).map(t => ({
          id: t.id,
          origenClinicId: t.origen_clinic_id,
          destinoClinicId: t.destino_clinic_id,
          productoId: t.articulo_id,
          productoNombre: t.producto_nombre,
          cantidad: +t.cantidad || 0,
          estado: t.estado,
          nota: t.nota || "",
          creadoAt: t.creado_at,
          enviadoAt: t.enviado_at,
          recibidoAt: t.recibido_at,
        })),
      }))
    })()
    return () => { cancelled = true }
  }, [data.proveedores, data.pedidosProveedor, data.incidenciasProveedor, data.trasladosInternos, setData])

  const adjust = (id,d) => setData(dd=>({...dd,clinics:{...dd.clinics,[clinic]:{...dd.clinics[clinic],
    stock:dd.clinics[clinic].stock.map(p=>p.id===id?{...p,stock:Math.max(0,p.stock+d)}:p)
  }}}))
  const del = id => {
    const enUso = (data.servicios || []).some(s => (s.materialesStockIds || []).includes(id))
    if (enUso) {
      alert("No podés eliminar este artículo: está asignado a uno o más servicios.")
      return
    }
    setData(d=>({...d,clinics:{...d.clinics,[clinic]:{...d.clinics[clinic],
      stock:d.clinics[clinic].stock.filter(p=>p.id!==id)
    }}}))
  }
  const save = async () => {
    if(!form.nombre) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        await apiPost("/api/erp/stock/create", { clinicId: clinic, ...form })
      } catch (e) {
        const msg = String(e?.message || e)
        if (msg.includes("404")) {
          try {
            await createStockDirectSupabase()
          } catch (e2) {
            alert(String(e2?.message || e2))
            return
          }
        } else {
          alert(msg)
          return
        }
      }
      await onPersist?.()
      setOpen(false)
      setForm({nombre:"",cat:"clinico",unidad:"unidades",stock:0,minimo:5,costo:0,proveedor:"",codigoBarras:"",fotoUrl:""})
      return
    }
    const id = all.length?Math.max(...all.map(p=>p.id))+1:1
    setData(d=>({...d,clinics:{...d.clinics,[clinic]:{...d.clinics[clinic],
      stock:[...d.clinics[clinic].stock,{...form,id,stock:+form.stock||0,minimo:+form.minimo||0}]
    }}}))
    setOpen(false)
    setForm({nombre:"",cat:"clinico",unidad:"unidades",stock:0,minimo:5,costo:0,proveedor:"",codigoBarras:"",fotoUrl:""})
  }

  const saveProveedor = async () => {
    if (!provForm.nombre.trim()) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        const productos = provForm.productosText.split("\n").map(x => x.trim()).filter(Boolean).map(line => {
          const [nombre, costo] = line.split("|").map(s => s.trim())
          return { nombre, costo: Number(costo || 0) || 0 }
        })
        await apiPost("/api/erp/provider/create", { ...provForm, productos })
        await onPersist?.()
        setProvForm({ nombre:"", contacto:"", tel:"", email:"", productosText:"" })
        setOpenProv(false)
      } catch (e) {
        alert(String(e?.message || e))
      }
      return
    }
    const id = proveedores.length ? Math.max(...proveedores.map(p => p.id)) + 1 : 1
    const productos = provForm.productosText
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean)
      .map(line => {
        const [nombre, costo] = line.split("|").map(s => s.trim())
        return { nombre, costo: Number(costo || 0) || 0 }
      })
    setData(d => ({ ...d, proveedores: [...(d.proveedores || []), {
      id,
      nombre: provForm.nombre.trim(),
      contacto: provForm.contacto.trim(),
      tel: provForm.tel.trim(),
      email: provForm.email.trim(),
      productos,
    }] }))
    setProvForm({ nombre:"", contacto:"", tel:"", email:"", productosText:"" })
    setOpenProv(false)
  }

  const setPedidoItem = (idx, patch) => {
    setPedidoForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }))
  }
  const addPedidoItem = () => setPedidoForm(f => ({ ...f, items: [...f.items, { nombre:"", cantidad:1, costo:0 }] }))
  const delPedidoItem = idx => setPedidoForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const savePedido = async () => {
    if (!pedidoForm.proveedorId || pedidoForm.items.length === 0) return
    const items = pedidoForm.items
      .map(it => ({ nombre: String(it.nombre || "").trim(), cantidad: +it.cantidad || 0, costo: +it.costo || 0 }))
      .filter(it => it.nombre && it.cantidad > 0)
    if (!items.length) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        await apiPost("/api/erp/pedido/create", {
          clinicId: clinic,
          proveedorId: +pedidoForm.proveedorId,
          fecha: pedidoForm.fecha || TODAY,
          notas: pedidoForm.notas || "",
          items,
        })
        await onPersist?.()
        setPedidoForm({ proveedorId:"", fecha:TODAY, notas:"", items:[{ nombre:"", cantidad:1, costo:0 }] })
        setOpenPedido(false)
      } catch (e) {
        alert(String(e?.message || e))
      }
      return
    }
    const id = (data.pedidosProveedor || []).length ? Math.max(...data.pedidosProveedor.map(p => p.id)) + 1 : 1
    const total = items.reduce((a, x) => a + x.cantidad * x.costo, 0)
    setData(d => ({ ...d, pedidosProveedor: [...(d.pedidosProveedor || []), {
      id,
      clinicId: clinic,
      proveedorId: +pedidoForm.proveedorId,
      fecha: pedidoForm.fecha || TODAY,
      notas: pedidoForm.notas || "",
      estado: "pendiente",
      items,
      total,
    }] }))
    setPedidoForm({ proveedorId:"", fecha:TODAY, notas:"", items:[{ nombre:"", cantidad:1, costo:0 }] })
    setOpenPedido(false)
  }

  const abrirRecepcionPedido = id => {
    const pedido = pedidos.find(p => p.id === id)
    if (!pedido) return
    setRecepcionForm({
      pedidoId: id,
      remito: "",
      observaciones: "",
      fotosText: "",
      items: (pedido.items || []).map(it => ({
        nombre: it.nombre,
        esperada: +it.cantidad || 0,
        recibida: +it.cantidad || 0,
        mala: 0,
        costo: +it.costo || 0,
        lote: "",
        nota: "",
      })),
    })
    setOpenRecepcion(true)
  }

  const setRecepcionItem = (idx, patch) => {
    setRecepcionForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }))
  }

  const confirmarRecepcionPedido = async () => {
    const id = recepcionForm.pedidoId
    if (!id) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        await apiPost("/api/erp/pedido/recepcionar", {
          pedidoId: id,
          remito: recepcionForm.remito,
          observaciones: recepcionForm.observaciones,
          fotos: String(recepcionForm.fotosText || "").split("\n").map(x => x.trim()).filter(Boolean),
          items: recepcionForm.items,
        })
        await onPersist?.()
        setOpenRecepcion(false)
        setRecepcionForm({ pedidoId:null, remito:"", observaciones:"", fotosText:"", items:[] })
      } catch (e) {
        alert(String(e?.message || e))
      }
      return
    }
    setData(d => {
      const pedido = (d.pedidosProveedor || []).find(p => p.id === id)
      if (!pedido || pedido.estado === "recibido") return d
      const cd = d.clinics[clinic]
      let stock = [...cd.stock]
      const nuevasInc = []
      for (const item of recepcionForm.items || []) {
        const recibida = Math.max(0, +item.recibida || 0)
        const mala = Math.max(0, Math.min(recibida, +item.mala || 0))
        const aceptada = Math.max(0, recibida - mala)
        const faltante = Math.max(0, (+item.esperada || 0) - recibida)
        const ix = stock.findIndex(s => s.nombre.toLowerCase() === String(item.nombre || "").toLowerCase())
        if (aceptada <= 0) {
          // solo incidencia
        } else if (ix >= 0) {
          stock[ix] = {
            ...stock[ix],
            stock: (+stock[ix].stock || 0) + aceptada,
            costo: item.costo || stock[ix].costo,
            lote: item.lote || stock[ix].lote || "",
            ultimoControlCalidadAt: new Date().toISOString(),
          }
        } else {
          const nid = stock.length ? Math.max(...stock.map(s => s.id)) + 1 : 1
          stock.push({
            id: nid,
            nombre: item.nombre,
            cat: "general",
            unidad: "unidades",
            stock: aceptada,
            minimo: 0,
            costo: +item.costo || 0,
            proveedor: proveedores.find(p => p.id === pedido.proveedorId)?.nombre || "",
            codigoBarras: "",
            fotoUrl: "",
            lote: item.lote || "",
            ultimoControlCalidadAt: new Date().toISOString(),
          })
        }
        if (faltante > 0 || mala > 0) {
          const incId = (d.incidenciasProveedor || []).length + nuevasInc.length + 1
          nuevasInc.push({
            id: incId,
            clinicId: clinic,
            pedidoId: id,
            proveedorId: pedido.proveedorId,
            producto: item.nombre,
            esperado: +item.esperada || 0,
            recibido: recibida,
            faltante,
            malo: mala,
            lote: item.lote || "",
            nota: item.nota || recepcionForm.observaciones || "",
            fotos: String(recepcionForm.fotosText || "").split("\n").map(x => x.trim()).filter(Boolean),
            estado: "abierta",
            creadaAt: new Date().toISOString(),
          })
        }
      }
      const huboIncidencia = nuevasInc.length > 0
      return {
        ...d,
        clinics: { ...d.clinics, [clinic]: { ...cd, stock } },
        incidenciasProveedor: [...(d.incidenciasProveedor || []), ...nuevasInc],
        pedidosProveedor: (d.pedidosProveedor || []).map(p => p.id === id ? {
          ...p,
          estado: huboIncidencia ? "recibido_con_incidencia" : "recibido",
          recibidoAt: new Date().toISOString(),
          recepcion: {
            remito: recepcionForm.remito || "",
            observaciones: recepcionForm.observaciones || "",
            fotos: String(recepcionForm.fotosText || "").split("\n").map(x => x.trim()).filter(Boolean),
          },
        } : p),
      }
    })
    setOpenRecepcion(false)
    setRecepcionForm({ pedidoId:null, remito:"", observaciones:"", fotosText:"", items:[] })
  }

  const crearTraslado = async () => {
    const origenClinicId = +trasladoForm.origenClinicId
    const productoId = +trasladoForm.productoId
    const cantidad = +trasladoForm.cantidad || 0
    if (!origenClinicId || !productoId || cantidad <= 0) return
    const prod = (data.clinics[origenClinicId]?.stock || []).find(s => s.id === productoId)
    if (!prod) return
    if ((prod.stock || 0) < cantidad) {
      alert("No hay stock suficiente en la clínica origen.")
      return
    }
    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        await apiPost("/api/erp/traslado/solicitar", {
          origenClinicId,
          destinoClinicId: clinic,
          productoId,
          productoNombre: prod.nombre,
          cantidad,
          nota: trasladoForm.nota || "",
        })
        await onPersist?.()
        setTrasladoForm({ origenClinicId:"", productoId:"", cantidad:1, nota:"" })
        setOpenTraslado(false)
      } catch (e) {
        alert(String(e?.message || e))
      }
      return
    }
    const id = (data.trasladosInternos || []).length ? Math.max(...data.trasladosInternos.map(t => t.id)) + 1 : 1
    setData(d => ({
      ...d,
      trasladosInternos: [...(d.trasladosInternos || []), {
        id,
        origenClinicId,
        destinoClinicId: clinic,
        productoId,
        productoNombre: prod.nombre,
        cantidad,
        estado: "solicitado",
        creadoAt: new Date().toISOString(),
        nota: trasladoForm.nota || "",
      }],
    }))
    setTrasladoForm({ origenClinicId:"", productoId:"", cantidad:1, nota:"" })
    setOpenTraslado(false)
  }

  const enviarTraslado = async id => {
    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        await apiPost("/api/erp/traslado/enviar", { id })
        await onPersist?.()
      } catch (e) {
        alert(String(e?.message || e))
      }
      return
    }
    setData(d => {
      const tr = (d.trasladosInternos || []).find(x => x.id === id)
      if (!tr || tr.estado !== "solicitado") return d
      const origen = d.clinics[tr.origenClinicId]
      if (!origen) return d
      const ix = origen.stock.findIndex(s => s.id === tr.productoId)
      if (ix < 0 || (origen.stock[ix].stock || 0) < tr.cantidad) return d
      const stockOrigen = [...origen.stock]
      stockOrigen[ix] = { ...stockOrigen[ix], stock: Math.max(0, (stockOrigen[ix].stock || 0) - tr.cantidad) }
      return {
        ...d,
        clinics: { ...d.clinics, [tr.origenClinicId]: { ...origen, stock: stockOrigen } },
        trasladosInternos: d.trasladosInternos.map(x => x.id === id ? { ...x, estado: "en_transito", enviadoAt: new Date().toISOString() } : x),
      }
    })
  }

  const recibirTraslado = async id => {
    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        await apiPost("/api/erp/traslado/recibir", { id })
        await onPersist?.()
      } catch (e) {
        alert(String(e?.message || e))
      }
      return
    }
    setData(d => {
      const tr = (d.trasladosInternos || []).find(x => x.id === id)
      if (!tr || tr.estado !== "en_transito") return d
      const destino = d.clinics[tr.destinoClinicId]
      if (!destino) return d
      const stockDestino = [...destino.stock]
      let ix = stockDestino.findIndex(s => s.nombre.toLowerCase() === String(tr.productoNombre || "").toLowerCase())
      if (ix >= 0) {
        stockDestino[ix] = { ...stockDestino[ix], stock: (stockDestino[ix].stock || 0) + tr.cantidad }
      } else {
        const nid = stockDestino.length ? Math.max(...stockDestino.map(s => s.id)) + 1 : 1
        stockDestino.push({
          id: nid,
          nombre: tr.productoNombre,
          cat: "general",
          unidad: "unidades",
          stock: tr.cantidad,
          minimo: 0,
          costo: 0,
          proveedor: "",
          codigoBarras: "",
          fotoUrl: "",
        })
      }
      return {
        ...d,
        clinics: { ...d.clinics, [tr.destinoClinicId]: { ...destino, stock: stockDestino } },
        trasladosInternos: d.trasladosInternos.map(x => x.id === id ? { ...x, estado: "recibido", recibidoAt: new Date().toISOString() } : x),
      }
    })
  }

  const buscarPorBarcode = async (codeRaw) => {
    const code = String(codeRaw || "").trim()
    if (!code) return
    setLoadingBarcode(true)
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`)
      const j = await r.json().catch(() => ({}))
      const p = j?.product || {}
      setForm(f => ({
        ...f,
        codigoBarras: code,
        nombre: f.nombre || p.product_name_es || p.product_name || f.nombre,
        fotoUrl: p.image_front_url || p.image_url || f.fotoUrl,
      }))
      if (!p.product_name && !p.product_name_es && !p.image_front_url && !p.image_url) {
        setScanErr("No se encontró info para ese código. Igual podés cargarlo manualmente.")
      } else setScanErr("")
    } catch {
      setScanErr("No se pudo consultar el catálogo por código de barras.")
    } finally {
      setLoadingBarcode(false)
    }
  }

  const stopScan = () => {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current)
    scanTimerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const startScan = async () => {
    setScanErr("")
    if (!barcodeSoportado) {
      setScanErr("Tu navegador no soporta escaneo nativo de barcode. Usá carga manual.")
      return
    }
    try {
      const stream = await getUserMediaCompat({ video: { facingMode: { ideal: "environment" } }, audio: false })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] })
      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current) return
        try {
          const res = await detector.detect(videoRef.current)
          const first = res?.[0]?.rawValue
          if (first) {
            setForm(f => ({ ...f, codigoBarras: first }))
            await buscarPorBarcode(first)
            stopScan()
            setOpenScan(false)
          }
        } catch { /* ignore frame */ }
      }, 450)
    } catch (ex) {
      setScanErr(String(ex?.message || "No se pudo iniciar cámara"))
    }
  }

  useEffect(() => {
    if (openScan) void startScan()
    else stopScan()
    return () => stopScan()
  }, [openScan])

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700}}>Gestión de Stock</h2>
          <p style={{fontSize:13,color:C.muted,marginTop:2}}>Clínica {clinic} · {all.length} productos</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {tab === "articulos" && <Btn onClick={()=>setOpen(true)}><Plus size={14}/> Agregar Producto</Btn>}
          {tab === "proveedores" && <Btn onClick={()=>setOpenProv(true)}><Plus size={14}/> Nuevo Proveedor</Btn>}
          {tab === "pedidos" && <Btn onClick={()=>setOpenPedido(true)}><Plus size={14}/> Nuevo Pedido</Btn>}
          {tab === "traslados" && <Btn onClick={()=>setOpenTraslado(true)}><Plus size={14}/> Solicitar traslado</Btn>}
          {tab === "incidencias" && <span style={{ fontSize:12, color:C.muted, alignSelf:"center" }}>{incidencias.length} abiertas</span>}
        </div>
      </div>

      <TabBar
        tabs={[
          { id:"articulos", label:"Artículos" },
          { id:"proveedores", label:"Proveedores" },
          { id:"pedidos", label:"Pedidos a proveedor" },
          ...(allowCrossClinicInventory ? [{ id:"traslados", label:"Traslado interno" }] : []),
          { id:"incidencias", label:"Incidencias proveedor" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "articulos" && (
      <div style={{display:"grid",gridTemplateColumns:compact?"1fr":"repeat(3,1fr)",gap:14,marginBottom:20}}>
        <KpiCard title="Total Productos" value={all.length} sub="En inventario"                             icon={Package}       accent={C.violet}  />
        <KpiCard title="Stock Bajo"      value={all.filter(p=>p.stock>0&&p.stock<=p.minimo).length} sub="Bajo mínimo" trend="Reponer" icon={AlertTriangle} accent={C.warning} />
        <KpiCard title="Sin Stock"       value={all.filter(p=>p.stock===0).length} sub="Agotados" trend={all.filter(p=>p.stock===0).length>0?"Urgente":undefined} icon={AlertTriangle} accent={C.danger} />
      </div>
      )}

      {tab === "articulos" && (
      <div style={{background:C.card,borderRadius:16,padding:22,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
        <div style={{display:"flex",gap:10,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"7px 12px",flex:1,maxWidth:270}}>
            <Search size={13} color="#94A3B8"/>
            <input style={{border:"none",background:"transparent",fontSize:13,color:C.text,outline:"none",width:"100%"}}
              placeholder="Buscar producto…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <select style={{...inp,width:155}} value={catF} onChange={e=>setCatF(e.target.value)}>
            <option value="">Todas las categorías</option>
            <option value="clinico">Clínico</option>
            <option value="laser">Láser</option>
            <option value="botox">Bótox</option>
            <option value="general">General</option>
          </select>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <THead cols={["Producto","Categoría","Stock","Mínimo","Estado","Ajustar"]}/>
            <tbody>
              {list.map(p=>{
                const bt = p.stock===0?"cancelado":p.stock<=p.minimo?"pendiente":"confirmado"
                const bl = p.stock===0?"Sin stock":p.stock<=p.minimo?"Stock bajo":"OK"
                return (
                  <tr key={p.id} style={{borderBottom:`1px solid ${C.subtle}`}}>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{fontWeight:600,fontSize:13}}>{p.nombre}</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>{p.proveedor}</div>
                    </td>
                    <td style={{padding:"12px 14px"}}><Badge type={p.cat==="general"?"gray":p.cat}>{catLabel[p.cat]}</Badge></td>
                    <td style={{padding:"12px 14px"}}>
                      <span style={{fontWeight:700,fontSize:13}}>{p.stock}</span>
                      <span style={{fontSize:11,color:"#94A3B8",marginLeft:4}}>{p.unidad}</span>
                      <StockBar stock={p.stock} minimo={p.minimo}/>
                    </td>
                    <td style={{padding:"12px 14px",fontSize:13,color:C.muted}}>{p.minimo} {p.unidad}</td>
                    <td style={{padding:"12px 14px"}}><Badge type={bt}>{bl}</Badge></td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",gap:4}}>
                        <Btn variant="outline" sm onClick={()=>adjust(p.id,1)}>+</Btn>
                        <Btn variant="outline" sm onClick={()=>adjust(p.id,-1)}>−</Btn>
                        <Btn variant="danger"  sm onClick={()=>del(p.id)}><Trash2 size={11}/></Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {list.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:"32px 0",color:"#94A3B8",fontSize:13}}>Sin productos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tab === "proveedores" && (
        <div style={{ background:C.card, borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          {proveedores.length === 0 ? (
            <div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:"20px 0" }}>No hay proveedores cargados.</div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:compact?"1fr":"repeat(2, minmax(260px, 1fr))", gap:12 }}>
              {proveedores.map(p => (
                <div key={p.id} style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
                  <div style={{ fontWeight:700 }}>{p.nombre}</div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{p.contacto || "—"} · {p.tel || "—"}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{p.email || "—"}</div>
                  <div style={{ fontSize:12, marginTop:8, color:C.text }}>Productos: {(p.productos || []).length}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "pedidos" && (
        <div style={{ background:C.card, borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          {pedidos.length === 0 ? (
            <div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:"20px 0" }}>No hay pedidos para esta clínica.</div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <THead cols={["Fecha","Proveedor","Ítems","Total","Estado",""]}/>
                <tbody>
                  {pedidos.map(p => (
                    <tr key={p.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                      <td style={{ padding:"10px 8px", fontSize:13 }}>{fmtDate(p.fecha)}</td>
                      <td style={{ padding:"10px 8px", fontSize:13, fontWeight:600 }}>{proveedores.find(x => x.id === p.proveedorId)?.nombre || `#${p.proveedorId}`}</td>
                      <td style={{ padding:"10px 8px", fontSize:12, color:C.muted }}>{(p.items || []).length}</td>
                      <td style={{ padding:"10px 8px", fontSize:13, fontWeight:700 }}>{fmt(p.total || 0)}</td>
                      <td style={{ padding:"10px 8px" }}>
                        <Badge type={p.estado === "recibido" ? "confirmado" : p.estado === "recibido_con_incidencia" ? "warning" : "pendiente"}>
                          {p.estado === "recibido" ? "Recibido" : p.estado === "recibido_con_incidencia" ? "Recibido c/incidencia" : "Pendiente"}
                        </Badge>
                      </td>
                      <td style={{ padding:"10px 8px" }}>
                        {p.estado === "pendiente" && <Btn sm onClick={() => abrirRecepcionPedido(p.id)}>Recepcionar</Btn>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "incidencias" && (
        <div style={{ background:C.card, borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          {incidencias.length === 0 ? (
            <div style={{ fontSize:13, color:C.muted }}>No hay incidencias registradas.</div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <THead cols={["Fecha","Proveedor","Producto","Faltante","Mal estado","Lote","Estado"]}/>
                <tbody>
                  {incidencias.map(i => (
                    <tr key={i.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                      <td style={{ padding:"10px 8px", fontSize:12 }}>{fmtDate((i.creadaAt || TODAY).slice(0,10))}</td>
                      <td style={{ padding:"10px 8px", fontSize:13, fontWeight:600 }}>{proveedores.find(p => p.id === i.proveedorId)?.nombre || `#${i.proveedorId}`}</td>
                      <td style={{ padding:"10px 8px", fontSize:13 }}>{i.producto}</td>
                      <td style={{ padding:"10px 8px", fontSize:13 }}>{i.faltante || 0}</td>
                      <td style={{ padding:"10px 8px", fontSize:13 }}>{i.malo || 0}</td>
                      <td style={{ padding:"10px 8px", fontSize:12, color:C.muted }}>{i.lote || "—"}</td>
                      <td style={{ padding:"10px 8px" }}><Badge type={i.estado === "resuelta" ? "confirmado" : "pendiente"}>{i.estado === "resuelta" ? "Resuelta" : "Abierta"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "traslados" && (
        <div style={{ display:"grid", gap:14 }}>
          <div style={{ background:C.card, borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Stock disponible en otras clínicas</div>
            {otherClinicIds.length === 0 ? (
              <div style={{ fontSize:13, color:C.muted }}>No hay otras clínicas conectadas.</div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <THead cols={["Clínica","Producto","Stock","Mínimo"]}/>
                  <tbody>
                    {otherClinicIds.flatMap(cid => (data.clinics[cid]?.stock || []).map(p => ({ cid, p }))).slice(0, 120).map(({ cid, p }, i) => (
                      <tr key={`${cid}-${p.id}-${i}`} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                        <td style={{ padding:"10px 8px", fontSize:13 }}>{`Clínica ${cid}`}</td>
                        <td style={{ padding:"10px 8px", fontSize:13, fontWeight:600 }}>{p.nombre}</td>
                        <td style={{ padding:"10px 8px", fontSize:13 }}>{p.stock} {p.unidad}</td>
                        <td style={{ padding:"10px 8px", fontSize:13, color:C.muted }}>{p.minimo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ background:C.card, borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Solicitudes de traslado (origen/destino de esta clínica)</div>
            {traslados.length === 0 ? (
              <div style={{ fontSize:13, color:C.muted }}>No hay traslados internos registrados.</div>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <THead cols={["Producto","Cantidad","Origen","Destino","Estado",""]}/>
                  <tbody>
                    {traslados.map(t => (
                      <tr key={t.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                        <td style={{ padding:"10px 8px", fontSize:13, fontWeight:600 }}>{t.productoNombre}</td>
                        <td style={{ padding:"10px 8px", fontSize:13 }}>{t.cantidad}</td>
                        <td style={{ padding:"10px 8px", fontSize:13 }}>{`Clínica ${t.origenClinicId}`}</td>
                        <td style={{ padding:"10px 8px", fontSize:13 }}>{`Clínica ${t.destinoClinicId}`}</td>
                        <td style={{ padding:"10px 8px" }}>
                          <Badge type={t.estado === "recibido" ? "confirmado" : t.estado === "en_transito" ? "en_curso" : "pendiente"}>
                            {t.estado === "solicitado" ? "Solicitado" : t.estado === "en_transito" ? "En tránsito" : "Recibido"}
                          </Badge>
                        </td>
                        <td style={{ padding:"10px 8px" }}>
                          {+t.origenClinicId === +clinic && t.estado === "solicitado" && <Btn sm onClick={() => enviarTraslado(t.id)}>Enviar</Btn>}
                          {+t.destinoClinicId === +clinic && t.estado === "en_transito" && <Btn sm onClick={() => recibirTraslado(t.id)}>Recibir</Btn>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="📦 Agregar Producto"
        footer={<><Btn variant="outline" onClick={()=>setOpen(false)}>Cancelar</Btn><Btn onClick={save}>Guardar</Btn></>}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <FG label="Nombre" full><input style={inp} value={form.nombre} onChange={e=>u("nombre",e.target.value)} placeholder="Nombre del producto"/></FG>
          <FG label="Código de barras" full>
            <div style={{ display:"flex", gap:8 }}>
              <input style={{...inp, marginBottom:0 }} value={form.codigoBarras} onChange={e=>u("codigoBarras",e.target.value)} placeholder="EAN/UPC/Code128"/>
              <Btn type="button" variant="outline" onClick={() => buscarPorBarcode(form.codigoBarras)} disabled={loadingBarcode}>{loadingBarcode ? "Buscando..." : "Autocompletar"}</Btn>
              <Btn type="button" variant="outline" onClick={() => setOpenScan(true)}><ScanLine size={14}/> Escanear</Btn>
            </div>
            {scanErr && <div style={{ fontSize:12, color:C.danger, marginTop:6 }}>{scanErr}</div>}
          </FG>
          {!!form.fotoUrl && (
            <FG label="Foto detectada" full>
              <img src={form.fotoUrl} alt="Producto detectado" style={{ width:100, height:100, objectFit:"cover", borderRadius:10, border:`1px solid ${C.border}` }} />
            </FG>
          )}
          <FG label="Categoría">
            <select style={inp} value={form.cat} onChange={e=>u("cat",e.target.value)}>
              {["clinico","laser","botox","general"].map(c=><option key={c} value={c}>{catLabel[c]}</option>)}
            </select>
          </FG>
          <FG label="Unidad">
            <select style={inp} value={form.unidad} onChange={e=>u("unidad",e.target.value)}>
              {["unidades","ml","gr","cajas","ampollas"].map(u=><option key={u}>{u}</option>)}
            </select>
          </FG>
          <FG label="Stock Actual"><input type="number" style={inp} value={form.stock} onChange={e=>u("stock",e.target.value)} min="0"/></FG>
          <FG label="Stock Mínimo"><input type="number" style={inp} value={form.minimo} onChange={e=>u("minimo",e.target.value)} min="0"/></FG>
          <FG label="Costo (€)"><input type="number" style={inp} value={form.costo} onChange={e=>u("costo",e.target.value)} min="0" step="any"/></FG>
          <FG label="Proveedor"><input style={inp} value={form.proveedor} onChange={e=>u("proveedor",e.target.value)} placeholder="Nombre proveedor"/></FG>
        </div>
      </Modal>

      <Modal open={openProv} onClose={()=>setOpenProv(false)} title="🏭 Nuevo proveedor"
        footer={<><Btn variant="outline" onClick={()=>setOpenProv(false)}>Cancelar</Btn><Btn onClick={saveProveedor}>Guardar</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FG label="Nombre"><input style={inp} value={provForm.nombre} onChange={e=>up("nombre", e.target.value)} /></FG>
          <FG label="Contacto"><input style={inp} value={provForm.contacto} onChange={e=>up("contacto", e.target.value)} /></FG>
          <FG label="Teléfono"><input style={inp} value={provForm.tel} onChange={e=>up("tel", e.target.value)} /></FG>
          <FG label="Email"><input style={inp} value={provForm.email} onChange={e=>up("email", e.target.value)} /></FG>
          <FG label="Productos que vende (uno por línea: nombre|costo)" full>
            <textarea style={{...inp, resize:"vertical", minHeight:96}} value={provForm.productosText} onChange={e=>up("productosText", e.target.value)} placeholder={"Guantes nitrilo|14\nGel conductor|0.09"} />
          </FG>
        </div>
      </Modal>

      <Modal open={openPedido} onClose={()=>setOpenPedido(false)} title="🧾 Nuevo pedido a proveedor"
        footer={<><Btn variant="outline" onClick={()=>setOpenPedido(false)}>Cancelar</Btn><Btn onClick={savePedido}>Guardar pedido</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FG label="Proveedor">
            <select style={inp} value={pedidoForm.proveedorId} onChange={e=>setPedidoForm(f=>({...f, proveedorId:e.target.value, items: f.items.map(it => ({ ...it, costo: it.costo || 0 })) }))}>
              <option value="">Seleccionar...</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </FG>
          <FG label="Fecha"><input type="date" style={inp} value={pedidoForm.fecha} onChange={e=>setPedidoForm(f=>({...f, fecha:e.target.value}))} /></FG>
          <FG label="Notas" full><input style={inp} value={pedidoForm.notas} onChange={e=>setPedidoForm(f=>({...f, notas:e.target.value}))} /></FG>
          <FG label="Ítems" full>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {pedidoForm.items.map((it, idx) => (
                <div key={idx} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr auto", gap:8 }}>
                  <input style={inp} value={it.nombre} onChange={e=>setPedidoItem(idx, { nombre:e.target.value })} placeholder="Producto" />
                  <input type="number" min="1" style={inp} value={it.cantidad} onChange={e=>setPedidoItem(idx, { cantidad:+e.target.value || 1 })} placeholder="Cant." />
                  <input type="number" min="0" step="any" style={inp} value={it.costo} onChange={e=>setPedidoItem(idx, { costo:+e.target.value || 0 })} placeholder="Costo" />
                  <Btn variant="danger" sm onClick={() => delPedidoItem(idx)}><Trash2 size={11}/></Btn>
                </div>
              ))}
              {proveedorSel?.productos?.length > 0 && (
                <div style={{ fontSize:12, color:C.muted }}>
                  Sugeridos: {proveedorSel.productos.slice(0, 5).map(p => `${p.nombre} (${fmt(p.costo)})`).join(" · ")}
                </div>
              )}
              <Btn variant="outline" sm onClick={addPedidoItem}><Plus size={12}/> Añadir ítem</Btn>
            </div>
          </FG>
        </div>
      </Modal>

      <Modal open={openRecepcion} onClose={()=>setOpenRecepcion(false)} title="📥 Recepción + control de calidad"
        footer={<><Btn variant="outline" onClick={()=>setOpenRecepcion(false)}>Cancelar</Btn><Btn onClick={confirmarRecepcionPedido}>Confirmar recepción</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FG label="N° remito / factura"><input style={inp} value={recepcionForm.remito} onChange={e=>setRecepcionForm(f=>({...f, remito:e.target.value}))} /></FG>
          <FG label="Fotos evidencia (URLs, una por línea)">
            <textarea style={{...inp, resize:"vertical", minHeight:64}} value={recepcionForm.fotosText} onChange={e=>setRecepcionForm(f=>({...f, fotosText:e.target.value}))} />
          </FG>
          <FG label="Observaciones generales" full>
            <textarea style={{...inp, resize:"vertical", minHeight:64}} value={recepcionForm.observaciones} onChange={e=>setRecepcionForm(f=>({...f, observaciones:e.target.value}))} />
          </FG>
          <FG label="Control por ítem" full>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {recepcionForm.items.map((it, idx) => (
                <div key={`${it.nombre}-${idx}`} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{it.nombre}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8 }}>
                    <input style={inp} value={it.esperada} readOnly />
                    <input type="number" min="0" style={inp} value={it.recibida} onChange={e=>setRecepcionItem(idx, { recibida:+e.target.value || 0 })} placeholder="Recibida" />
                    <input type="number" min="0" style={inp} value={it.mala} onChange={e=>setRecepcionItem(idx, { mala:+e.target.value || 0 })} placeholder="Mal estado" />
                    <input style={inp} value={it.lote} onChange={e=>setRecepcionItem(idx, { lote:e.target.value })} placeholder="Lote" />
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
                    <input style={inp} value={it.nota} onChange={e=>setRecepcionItem(idx, { nota:e.target.value })} placeholder="Nota de calidad por ítem" />
                    <div style={{ fontSize:12, color:C.muted, alignSelf:"center" }}>
                      Faltante: {Math.max(0, (+it.esperada || 0) - (+it.recibida || 0))} · Aceptada: {Math.max(0, (+it.recibida || 0) - (+it.mala || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </FG>
        </div>
      </Modal>

      <Modal open={openTraslado} onClose={()=>setOpenTraslado(false)} title="🔄 Solicitar traslado interno"
        footer={<><Btn variant="outline" onClick={()=>setOpenTraslado(false)}>Cancelar</Btn><Btn onClick={crearTraslado}>Solicitar</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FG label="Clínica origen">
            <select style={inp} value={trasladoForm.origenClinicId} onChange={e=>setTrasladoForm(f=>({...f, origenClinicId:e.target.value, productoId:""}))}>
              <option value="">Seleccionar...</option>
              {otherClinicIds.map(cid => <option key={cid} value={cid}>{`Clínica ${cid}`}</option>)}
            </select>
          </FG>
          <FG label="Artículo disponible en origen">
            <select style={inp} value={trasladoForm.productoId} onChange={e=>setTrasladoForm(f=>({...f, productoId:e.target.value}))}>
              <option value="">Seleccionar...</option>
              {stockOrigenTraslado.filter(p => (p.stock || 0) > 0).map(p => <option key={p.id} value={p.id}>{`${p.nombre} (${p.stock} ${p.unidad})`}</option>)}
            </select>
          </FG>
          <FG label="Cantidad"><input type="number" min="1" style={inp} value={trasladoForm.cantidad} onChange={e=>setTrasladoForm(f=>({...f, cantidad:+e.target.value || 1}))} /></FG>
          <FG label="Stock origen actual"><input style={inp} value={itemTraslado ? `${itemTraslado.stock} ${itemTraslado.unidad}` : "—"} readOnly /></FG>
          <FG label="Nota" full><input style={inp} value={trasladoForm.nota} onChange={e=>setTrasladoForm(f=>({...f, nota:e.target.value}))} placeholder="Motivo del traslado (opcional)" /></FG>
        </div>
      </Modal>

      <Modal open={openScan} onClose={()=>setOpenScan(false)} title="Escanear código de barras">
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width:"100%", borderRadius:12, background:"#000", minHeight:220 }} />
          {!barcodeSoportado && <div style={{ fontSize:12, color:C.danger }}>Este navegador no soporta BarcodeDetector. Usá ingreso manual.</div>}
          {scanErr && <div style={{ fontSize:12, color:C.danger }}>{scanErr}</div>}
          <div style={{ fontSize:12, color:C.muted }}>Apuntá al código. Se completará automáticamente al detectar.</div>
        </div>
      </Modal>
    </div>
  )
}

// ─── SECTION: CONTABILIDAD ────────────────────────────────────
function Contabilidad({ data, clinic, setData }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const [tab, setTab] = useState("resumen")
  const [open, setOpen] = useState(false)
  const [openDetalle, setOpenDetalle] = useState(false)
  const [movSel, setMovSel] = useState(null)
  const [form, setForm] = useState({tipo:"ingreso",fecha:TODAY,concepto:"",cat:"servicios",monto:"",notas:""})
  const u = (k,v)=>setForm(f=>({...f,[k]:v}))
  const movs = data.clinics[clinic].movimientos
  const turnos = data.clinics[clinic].turnos || []
  const empleados = data.empleados || []
  const servicios = data.servicios || []

  // Derived analytics
  const ing = movs.filter(m=>m.tipo==="ingreso").reduce((a,m)=>a+m.monto,0)
  const egr = movs.filter(m=>m.tipo==="egreso").reduce((a,m)=>a+m.monto,0)
  const alertasCobro = data.alertasCobro || []

  // Revenue by day (last 14 days)
  const last14Days = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split("T")[0]
      const dayMovs = movs.filter(m => m.tipo === "ingreso" && m.fecha === key)
      days.push({ fecha: key, label: `${d.getDate()}/${d.getMonth()+1}`, total: dayMovs.reduce((a,m)=>a+m.monto,0) })
    }
    return days
  }, [movs])

  // Revenue by service category
  const porServicio = useMemo(() => {
    const map = {}
    movs.filter(m=>m.tipo==="ingreso").forEach(m => {
      const cat = m.cat || "servicios"
      map[cat] = (map[cat] || 0) + m.monto
    })
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([cat, total]) => ({ cat, label: catLabel[cat]||cat, total }))
  }, [movs])

  // Alertas cobro pendientes / pagadas
  const cobrosPendientes = alertasCobro.filter(a => a.clinicId === +clinic && a.estado === "pendiente")
  const cobrosCobrados = alertasCobro.filter(a => a.clinicId === +clinic && a.estado !== "pendiente")

  // Revenue by doctor (from alertas cobro cobradas)
  const porDoctor = useMemo(() => {
    const map = {}
    turnos.filter(t => t.estado === "listo_cobrar" || t.estado === "finalizado").forEach(t => {
      const empId = t.empleadoId || t.profesionalId
      const emp = empleados.find(e => e.id === empId)
      const nombre = emp?.nombre || "Sin asignar"
      const srv = servicios.find(s => s.nombre === t.servicio || s.id === t.servicioFacturadoId)
      const monto = srv?.precio || 0
      map[nombre] = (map[nombre] || 0) + monto
    })
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([nombre, total]) => ({ nombre, total }))
  }, [turnos, empleados, servicios])

  // Pending turnos
  const turnosPendientes = turnos.filter(t => t.estado === "pendiente" || t.estado === "confirmado")
  const turnosHoy = turnosPendientes.filter(t => t.fecha === TODAY)

  const abrirDetalle = mov => { setMovSel(mov); setOpenDetalle(true) }
  const turnoIdSel = useMemo(() => {
    const m = String(movSel?.concepto || "").match(/turno\s*#\s*(\d+)/i)
    return m?.[1] ? +m[1] : null
  }, [movSel?.concepto])
  const turnoRel = useMemo(() => {
    if (!turnoIdSel) return null
    return (data.clinics?.[clinic]?.turnos || []).find(t => +t.id === +turnoIdSel) || null
  }, [turnoIdSel, data.clinics, clinic])
  const alertaRel = useMemo(() => {
    if (!turnoIdSel) return null
    return (data.alertasCobro || []).find(a => +a.turnoId === +turnoIdSel) || null
  }, [turnoIdSel, data.alertasCobro])

  const save = () => {
    if(!form.concepto||!form.monto) return
    const id = movs.length?Math.max(...movs.map(m=>m.id))+1:1
    setData(d=>({...d,clinics:{...d.clinics,[clinic]:{...d.clinics[clinic],
      movimientos:[...d.clinics[clinic].movimientos,{...form,id,monto:parseFloat(form.monto)||0}]
    }}}))
    setOpen(false)
    setForm({tipo:"ingreso",fecha:TODAY,concepto:"",cat:"servicios",monto:"",notas:""})
  }
  const del = id => setData(d=>({...d,clinics:{...d.clinics,[clinic]:{...d.clinics[clinic],
    movimientos:d.clinics[clinic].movimientos.filter(m=>m.id!==id)
  }}}))

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700}}>Contabilidad</h2>
          <p style={{fontSize:13,color:C.muted,marginTop:2}}>Clínica {clinic} · Panel financiero</p>
        </div>
        <Btn onClick={()=>setOpen(true)}><Plus size={14}/> Registrar Movimiento</Btn>
      </div>

      {/* KPI summary */}
      <div style={{display:"grid",gridTemplateColumns:compact?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:22}}>
        {[
          {label:"Ingresos totales", val:ing, color:"#10B981", bg:"linear-gradient(135deg,#ECFDF5,#D1FAE5)"},
          {label:"Egresos totales", val:egr, color:"#EF4444", bg:"linear-gradient(135deg,#FEF2F2,#FECACA)"},
          {label:"Balance neto", val:ing-egr, color:ing-egr>=0?C.violet:C.danger, bg:`linear-gradient(135deg,${C.violetLight},#DDD6FE)`},
          {label:"Cobros pendientes", val:cobrosPendientes.length, color:"#F59E0B", bg:"linear-gradient(135deg,#FFFBEB,#FEF3C7)", isCount:true},
        ].map(b=>(
          <div key={b.label} style={{borderRadius:14,padding:"16px 18px",background:b.bg}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",color:"rgba(0,0,0,.4)",marginBottom:4}}>{b.label}</div>
            <div style={{fontSize:b.isCount?28:22,fontWeight:800,color:b.color}}>{b.isCount?b.val:fmt(b.val)}</div>
          </div>
        ))}
      </div>

      <TabBar tabs={[{id:"resumen",label:"Resumen"},{id:"doctor",label:"Por doctor"},{id:"servicio",label:"Por servicio"},{id:"pendientes",label:`Pendientes (${turnosHoy.length})`},{id:"movimientos",label:"Movimientos"}]} active={tab} onChange={setTab}/>

      {tab === "resumen" && (
        <div style={{background:C.card,borderRadius:16,padding:22,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:16}}>Ingresos últimos 14 días</div>
          {last14Days.some(d=>d.total>0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={last14Days} margin={{top:0,right:0,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="label" tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)}/>
                <Tooltip formatter={v=>[fmt(v),"Ingresos"]} labelStyle={{fontSize:12}}/>
                <Bar dataKey="total" fill={C.violet} radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{textAlign:"center",padding:"32px 0",color:C.muted,fontSize:13}}>Sin ingresos registrados en los últimos 14 días</div>
          )}
        </div>
      )}

      {tab === "doctor" && (
        <div style={{background:C.card,borderRadius:16,padding:22,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Facturación por doctor (servicios realizados)</div>
          {porDoctor.length === 0 ? (
            <div style={{textAlign:"center",padding:"32px 0",color:C.muted,fontSize:13}}>Sin datos disponibles</div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <THead cols={["Doctor","Servicios realizados","Total estimado"]}/>
              <tbody>
                {porDoctor.map((row,i) => (
                  <tr key={row.nombre} style={{borderBottom:`1px solid ${C.subtle}`}}>
                    <td style={{padding:"11px 14px",fontWeight:600,fontSize:13}}>{row.nombre}</td>
                    <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>
                      {turnos.filter(t=>{const emp=empleados.find(e=>e.nombre===row.nombre);return emp && (t.empleadoId===emp.id||t.profesionalId===emp.id) && (t.estado==="listo_cobrar"||t.estado==="finalizado")}).length} turnos
                    </td>
                    <td style={{padding:"11px 14px",fontWeight:700,color:C.success}}>{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "servicio" && (
        <div style={{background:C.card,borderRadius:16,padding:22,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Facturación por categoría (movimientos)</div>
          {porServicio.length === 0 ? (
            <div style={{textAlign:"center",padding:"32px 0",color:C.muted,fontSize:13}}>Sin datos disponibles</div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <THead cols={["Categoría","Total","% del total"]}/>
              <tbody>
                {porServicio.map(row => (
                  <tr key={row.cat} style={{borderBottom:`1px solid ${C.subtle}`}}>
                    <td style={{padding:"11px 14px",fontWeight:600,fontSize:13}}>{row.label}</td>
                    <td style={{padding:"11px 14px",fontWeight:700,color:C.success}}>{fmt(row.total)}</td>
                    <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>{ing>0?Math.round(row.total/ing*100):0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "pendientes" && (
        <div style={{background:C.card,borderRadius:16,padding:22,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Citas pendientes de ejecutar — hoy ({TODAY})</div>
          {turnosHoy.length === 0 ? (
            <div style={{textAlign:"center",padding:"32px 0",color:C.muted,fontSize:13}}>No hay citas pendientes para hoy</div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <THead cols={["Hora","Paciente","Servicio","Estado"]}/>
              <tbody>
                {[...turnosHoy].sort((a,b)=>a.hora.localeCompare(b.hora)).map(t=>(
                  <tr key={t.id} style={{borderBottom:`1px solid ${C.subtle}`}}>
                    <td style={{padding:"11px 14px",fontWeight:700,fontSize:13}}>{t.hora}</td>
                    <td style={{padding:"11px 14px",fontSize:13}}>{t.cliente}</td>
                    <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>{t.servicio}</td>
                    <td style={{padding:"11px 14px"}}><Badge type={t.estado==="pendiente"?"gray":"green"}>{estadoLabel[t.estado]||t.estado}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cobrosPendientes.length > 0 && (
            <>
              <div style={{fontSize:13,fontWeight:700,margin:"24px 0 14px"}}>Cobros pendientes de recepción ({cobrosPendientes.length})</div>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <THead cols={["Paciente","Servicio","Total"]}/>
                <tbody>
                  {cobrosPendientes.map(a=>(
                    <tr key={a.id} style={{borderBottom:`1px solid ${C.subtle}`}}>
                      <td style={{padding:"11px 14px",fontWeight:600,fontSize:13}}>{a.paciente||a.cliente}</td>
                      <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>{a.servicio}</td>
                      <td style={{padding:"11px 14px",fontWeight:700,color:C.violet}}>{fmt(a.montoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === "movimientos" && (
        <div style={{background:C.card,borderRadius:16,padding:22,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <THead cols={["Fecha","Concepto","Categoría","Tipo","Monto",""]}/>
              <tbody>
                {[...movs].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(m=>(
                  <tr key={m.id} onClick={() => abrirDetalle(m)} style={{borderBottom:`1px solid ${C.subtle}`, cursor:"pointer"}}>
                    <td style={{padding:"11px 14px",fontSize:12,color:C.muted}}>{fmtDate(m.fecha)}</td>
                    <td style={{padding:"11px 14px",fontWeight:600,fontSize:13}}>{m.concepto}</td>
                    <td style={{padding:"11px 14px"}}><Badge type="gray">{catLabel[m.cat]||m.cat}</Badge></td>
                    <td style={{padding:"11px 14px"}}><Badge type={m.tipo}>{m.tipo==="ingreso"?"Ingreso":"Egreso"}</Badge></td>
                    <td style={{padding:"11px 14px",fontWeight:700,fontSize:13,color:m.tipo==="ingreso"?C.success:C.danger}}>
                      {m.tipo==="ingreso"?"+":"-"}{fmt(m.monto)}
                    </td>
                    <td style={{padding:"11px 14px"}}>
                      <Btn variant="danger" sm onClick={(e)=>{ e.stopPropagation(); del(m.id) }}><Trash2 size={11}/></Btn>
                    </td>
                  </tr>
                ))}
                {movs.length===0&&<tr><td colSpan={6} style={{textAlign:"center",padding:"32px 0",color:"#94A3B8",fontSize:13}}>Sin movimientos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={()=>setOpen(false)} title="💰 Registrar Movimiento"
        footer={<><Btn variant="outline" onClick={()=>setOpen(false)}>Cancelar</Btn><Btn onClick={save}>Registrar</Btn></>}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <FG label="Tipo">
            <select style={inp} value={form.tipo} onChange={e=>u("tipo",e.target.value)}>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
          </FG>
          <FG label="Fecha"><input type="date" style={inp} value={form.fecha} onChange={e=>u("fecha",e.target.value)}/></FG>
          <FG label="Concepto" full><input style={inp} value={form.concepto} onChange={e=>u("concepto",e.target.value)} placeholder="Descripción…"/></FG>
          <FG label="Categoría">
            <select style={inp} value={form.cat} onChange={e=>u("cat",e.target.value)}>
              {["servicios","insumos","salarios","alquiler","equipos","otros"].map(c=><option key={c} value={c}>{catLabel[c]}</option>)}
            </select>
          </FG>
          <FG label="Monto (€)"><input type="number" style={inp} value={form.monto} onChange={e=>u("monto",e.target.value)} placeholder="0,00" min="0" step="any"/></FG>
          <FG label="Notas" full>
            <textarea style={{...inp,resize:"vertical",minHeight:55}} value={form.notas} onChange={e=>u("notas",e.target.value)} placeholder="Observaciones…"/>
          </FG>
        </div>
      </Modal>
      <Modal
        open={openDetalle}
        onClose={() => setOpenDetalle(false)}
        title={movSel ? `Detalle movimiento #${movSel.id}` : "Detalle movimiento"}
        footer={<Btn variant="outline" onClick={() => setOpenDetalle(false)}>Cerrar</Btn>}
      >
        {movSel && (
          <div style={{ display:"grid", gap:10 }}>
            <div style={{ fontSize:13 }}><strong>Fecha:</strong> {fmtDate(movSel.fecha)}</div>
            <div style={{ fontSize:13 }}><strong>Concepto:</strong> {movSel.concepto}</div>
            <div style={{ fontSize:13 }}><strong>Tipo:</strong> {movSel.tipo === "ingreso" ? "Ingreso" : "Egreso"}</div>
            <div style={{ fontSize:13 }}><strong>Categoría:</strong> {catLabel[movSel.cat] || movSel.cat}</div>
            <div style={{ fontSize:13 }}><strong>Monto:</strong> {movSel.tipo === "ingreso" ? "+" : "-"}{fmt(movSel.monto)}</div>
            {turnoRel && (
              <div style={{ marginTop:6, padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:10, background:C.subtle, fontSize:12, lineHeight:1.5 }}>
                <div style={{ fontWeight:700, marginBottom:4 }}>Relacionado al turno #{turnoRel.id}</div>
                <div>{turnoRel.cliente} · {turnoRel.servicio} · {fmtDate(turnoRel.fecha)} {turnoRel.hora}</div>
                <div>Estado: {estadoLabel[turnoRel.estado] || turnoRel.estado}</div>
              </div>
            )}
            {alertaRel && (
              <div style={{ padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:10, background:"#FFFBEB", fontSize:12 }}>
                <strong>Orden de cobro asociada:</strong> {fmt(alertaRel.montoTotal)} ({alertaRel.estado})
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── SECTION: SERVICIOS ───────────────────────────────────────
function Servicios({ data, clinic, setData, onGoStock, onPersist }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [catFilter, setCatFilter] = useState("todos")
  const [searchSrv, setSearchSrv] = useState("")
  const [openEdit, setOpenEdit] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [materialSearch, setMaterialSearch] = useState("")
  const [materialSearchEdit, setMaterialSearchEdit] = useState("")
  const [openMaterialsModal, setOpenMaterialsModal] = useState(false)
  const [materialsModalMode, setMaterialsModalMode] = useState("create")
  const serviciosHydratedRef = useRef(false)
  const [form, setForm] = useState({ nombre:"", cat:"clinico", duracion:30, precio:"", sesiones:1, desc:"", materialesStockIds:[], materialesCantidades:[] })
  const [formEdit, setFormEdit] = useState({ nombre:"", cat:"clinico", duracion:30, precio:"", sesiones:1, desc:"", materialesStockIds:[], materialesCantidades:[] })
  const u = (k,v)=>setForm(f=>({...f,[k]:v}))
  const ue = (k,v)=>setFormEdit(f=>({...f,[k]:v}))
  const stockCatalog = data.clinics?.[clinic]?.stock ?? []
  const filteredMaterialsCreate = useMemo(() => {
    const q = String(materialSearch || "").trim().toLowerCase()
    const base = !q ? stockCatalog : stockCatalog.filter(p => String(p.nombre || "").toLowerCase().includes(q))
    return base.slice(0, 8)
  }, [stockCatalog, materialSearch])
  const filteredMaterialsEdit = useMemo(() => {
    const q = String(materialSearchEdit || "").trim().toLowerCase()
    const base = !q ? stockCatalog : stockCatalog.filter(p => String(p.nombre || "").toLowerCase().includes(q))
    return base.slice(0, 8)
  }, [stockCatalog, materialSearchEdit])
  const filteredMaterialsModal = useMemo(() => {
    const q = String(materialsModalMode === "create" ? materialSearch : materialSearchEdit).trim().toLowerCase()
    return !q ? stockCatalog : stockCatalog.filter(p => String(p.nombre || "").toLowerCase().includes(q))
  }, [stockCatalog, materialSearch, materialSearchEdit, materialsModalMode])
  const stockById = useMemo(() => {
    const map = new Map()
    for (const p of stockCatalog) map.set(+p.id, p)
    return map
  }, [stockCatalog])
  const toggleMaterial = id => setForm(f => {
    const set = new Set(f.materialesStockIds || [])
    if (set.has(id)) {
      set.delete(id)
      return { ...f, materialesStockIds: [...set].sort((a, b) => a - b), materialesCantidades: (f.materialesCantidades || []).filter(x => x.id !== id) }
    }
    set.add(id)
    const newCants = [...(f.materialesCantidades || []).filter(x => x.id !== id), { id, qty: 1 }]
    return { ...f, materialesStockIds: [...set].sort((a, b) => a - b), materialesCantidades: newCants }
  })
  const toggleMaterialEdit = id => setFormEdit(f => {
    const set = new Set(f.materialesStockIds || [])
    if (set.has(id)) {
      set.delete(id)
      return { ...f, materialesStockIds: [...set].sort((a, b) => a - b), materialesCantidades: (f.materialesCantidades || []).filter(x => x.id !== id) }
    }
    set.add(id)
    const newCants = [...(f.materialesCantidades || []).filter(x => x.id !== id), { id, qty: 1 }]
    return { ...f, materialesStockIds: [...set].sort((a, b) => a - b), materialesCantidades: newCants }
  })
  const setMaterialQty = (id, qty, isEdit = false) => {
    const n = Math.max(1, parseInt(qty, 10) || 1)
    if (isEdit) {
      setFormEdit(f => ({ ...f, materialesCantidades: (f.materialesCantidades || []).map(x => x.id === id ? { ...x, qty: n } : x) }))
    } else {
      setForm(f => ({ ...f, materialesCantidades: (f.materialesCantidades || []).map(x => x.id === id ? { ...x, qty: n } : x) }))
    }
  }

  const mapServicioRow = row => {
    const ids = Array.isArray(row.materiales_articulo_ids) ? row.materiales_articulo_ids : []
    const rawCants = Array.isArray(row.materiales_cantidades) ? row.materiales_cantidades : []
    // Build qtys map: {id: qty}
    const qtysMap = {}
    for (const item of rawCants) {
      if (item && typeof item === 'object' && item.id) qtysMap[+item.id] = Math.max(1, +item.qty || 1)
    }
    // If no cantidades data, fallback to ids with qty=1
    const materialesCantidades = ids.length > 0 && rawCants.length === 0
      ? ids.map(id => ({ id: +id, qty: 1 }))
      : rawCants.filter(x => x && x.id).map(x => ({ id: +x.id, qty: Math.max(1, +x.qty || 1) }))
    return {
      id: row.id,
      nombre: row.nombre || '',
      cat: String(row.cat || 'clinico').trim().toLowerCase() || 'clinico',
      duracion: +row.duracion || 30,
      precio: row.precio == null ? 0 : +row.precio,
      sesiones: +row.sesiones || 1,
      desc: row.descripcion || '',
      materialesStockIds: ids,
      materialesCantidades, // [{id, qty}]
    }
  }

  useEffect(() => {
    if (serviciosHydratedRef.current) return
    if (!import.meta.env.VITE_SUPABASE_URL) return
    if ((data.servicios || []).length > 0) {
      serviciosHydratedRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: rows, error } = await supabase
        .from("servicios")
        .select("id, nombre, cat, duracion, precio, sesiones, descripcion, materiales_articulo_ids, materiales_cantidades")
        .order("id")
      if (cancelled || error) return
      setData(d => ({ ...d, servicios: (rows || []).map(mapServicioRow) }))
      serviciosHydratedRef.current = true
    })()
    return () => { cancelled = true }
  }, [data.servicios, setData])

  const save = async () => {
    if (!form.nombre || form.precio === "" || form.precio == null) return
    if (!import.meta.env.VITE_SUPABASE_URL) {
      const id = data.servicios.length ? Math.max(...data.servicios.map(s => s.id)) + 1 : 1
      setData(d => ({ ...d, servicios: [...d.servicios, { ...form, id, precio: +form.precio, duracion: +form.duracion || 30, sesiones: +form.sesiones || 1, materialesStockIds: form.materialesStockIds || [] }] }))
      setOpen(false)
      setForm({ nombre: "", cat: "clinico", duracion: 30, precio: "", sesiones: 1, desc: "", materialesStockIds: [], materialesCantidades: [] })
      return
    }
    setSaving(true)
    try {
      const ins = {
        nombre: String(form.nombre).trim(),
        cat: String(form.cat || "clinico"),
        duracion: +form.duracion || 30,
        precio: +form.precio,
        sesiones: +form.sesiones || 1,
        descripcion: String(form.desc || ""),
        materiales_articulo_ids: form.materialesStockIds || [],
        materiales_cantidades: (form.materialesCantidades || []).filter(x => x && x.id),
      }
      const { data: row, error } = await supabase.from("servicios").insert(ins).select("id, nombre, cat, duracion, precio, sesiones, descripcion, materiales_articulo_ids, materiales_cantidades").single()
      if (error) {
        alert(error.message || "No se pudo guardar el servicio. Solo el rol gerente puede crear el catálogo.")
        return
      }
      const mapped = mapServicioRow(row)
      setData(d => {
        const rest = (d.servicios || []).filter(s => s.id !== mapped.id)
        return { ...d, servicios: [...rest, mapped].sort((a, b) => a.id - b.id) }
      })
      setOpen(false)
      setForm({ nombre: "", cat: "clinico", duracion: 30, precio: "", sesiones: 1, desc: "", materialesStockIds: [], materialesCantidades: [] })
      await onPersist?.()
    } finally {
      setSaving(false)
    }
  }
  const del = async id => {
    const srv = data.servicios.find(s => s.id === id)
    if (!srv) return
    const usadoEnTurnos = Object.values(data.clinics || {}).some(c =>
      (c.turnos || []).some(t => t.servicio === srv.nombre || t.servicioFacturadoId === id)
    )
    const usadoEnPacks = (data.bonosPacks || []).some(b => b.servicioId === id)
    if (usadoEnTurnos || usadoEnPacks) {
      alert("No podés eliminar este servicio: ya está siendo usado en turnos o packs.")
      return
    }
    if (!import.meta.env.VITE_SUPABASE_URL) {
      setData(d => ({ ...d, servicios: d.servicios.filter(s => s.id !== id) }))
      return
    }
    const { error } = await supabase.from("servicios").delete().eq("id", id)
    if (error) {
      alert(error.message || "No se pudo eliminar. Solo el rol gerente puede modificar el catálogo.")
      return
    }
    setData(d => ({ ...d, servicios: d.servicios.filter(s => s.id !== id) }))
    await onPersist?.()
  }
  const openEditor = srv => {
    if (!srv) return
    setEditingId(srv.id)
    setFormEdit({
      nombre: srv.nombre || "",
      cat: srv.cat || "clinico",
      duracion: +srv.duracion || 30,
      precio: srv.precio == null ? "" : String(srv.precio),
      sesiones: +srv.sesiones || 1,
      desc: srv.desc || "",
      materialesStockIds: Array.isArray(srv.materialesStockIds) ? srv.materialesStockIds : [],
      materialesCantidades: Array.isArray(srv.materialesCantidades) ? srv.materialesCantidades : (Array.isArray(srv.materialesStockIds) ? srv.materialesStockIds.map(id => ({ id, qty: 1 })) : []),
    })
    setOpenEdit(true)
  }
  const saveEdit = async () => {
    if (!editingId || !String(formEdit.nombre || "").trim()) return
    const upd = {
      nombre: String(formEdit.nombre || "").trim(),
      cat: String(formEdit.cat || "clinico"),
      duracion: +formEdit.duracion || 30,
      precio: +formEdit.precio || 0,
      sesiones: +formEdit.sesiones || 1,
      descripcion: String(formEdit.desc || ""),
      materiales_articulo_ids: formEdit.materialesStockIds || [],
      materiales_cantidades: (formEdit.materialesCantidades || []).filter(x => x && x.id),
    }
    if (!import.meta.env.VITE_SUPABASE_URL) {
      setData(d => ({
        ...d,
        servicios: (d.servicios || []).map(s => s.id === editingId ? {
          ...s,
          nombre: upd.nombre,
          cat: upd.cat,
          duracion: upd.duracion,
          precio: upd.precio,
          sesiones: upd.sesiones,
          desc: upd.descripcion,
          materialesStockIds: upd.materiales_articulo_ids,
        } : s),
      }))
      setOpenEdit(false)
      return
    }
    setSavingEdit(true)
    try {
      const { data: row, error } = await supabase
        .from("servicios")
        .update(upd)
        .eq("id", editingId)
        .select("id, nombre, cat, duracion, precio, sesiones, descripcion, materiales_articulo_ids, materiales_cantidades")
        .single()
      if (error || !row) {
        alert(error?.message || "No se pudo actualizar el servicio.")
        return
      }
      const mapped = mapServicioRow(row)
      setData(d => ({
        ...d,
        servicios: (d.servicios || []).map(s => s.id === editingId ? mapped : s),
      }))
      setOpenEdit(false)
      await onPersist?.()
    } finally {
      setSavingEdit(false)
    }
  }

  const cats = [
    {key:"valoracion",label:"Valoración",icon:"📋",accent:"#F59E0B",bg:"#FFFBEB",bdr:"#FCD34D",desc:"Primera consulta / evaluación antes de definir tratamiento y cobro"},
    {key:"clinico",label:"Clínico",  icon:"🩺", accent:"#10B981",bg:"#ECFDF5",bdr:"#A7F3D0",desc:"Consultas y tratamientos clínicos"},
    {key:"facial",label:"Facial",    icon:"✨", accent:"#1D4ED8",bg:"#EFF6FF",bdr:"#BFDBFE",desc:"Tratamientos orientados al rostro y cuello"},
    {key:"corporal",label:"Corporal",icon:"🧍", accent:"#0F766E",bg:"#F0FDFA",bdr:"#99F6E4",desc:"Tratamientos orientados al cuerpo"},
    {key:"laser",  label:"Láser",   icon:"⚡", accent:"#3730A3",bg:"#EEF2FF",bdr:"#C7D2FE",desc:"Tratamientos con tecnología láser"},
    {key:"botox",  label:"Bótox",   icon:"💉", accent:"#6B21A8",bg:"#FDF4FF",bdr:"#E9D5FF",desc:"Toxina botulínica y rellenos"},
  ]
  const filteredServicios = useMemo(() => {
    const q = String(searchSrv || "").trim().toLowerCase()
    return (data.servicios || []).filter(s => {
      if (catFilter !== "todos" && s.cat !== catFilter) return false
      if (!q) return true
      return String(s.nombre || "").toLowerCase().includes(q) || String(s.desc || "").toLowerCase().includes(q)
    })
  }, [data.servicios, catFilter, searchSrv])

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:10}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700}}>Catálogo de Servicios</h2>
          <p style={{fontSize:13,color:C.muted,marginTop:2}}>{data.servicios.length} servicios registrados</p>
        </div>
        <Btn onClick={()=>setOpen(true)}><Plus size={14}/> Nuevo Servicio</Btn>
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:12 }}>
        <button type="button" onClick={() => setCatFilter("todos")} style={{ border:`1px solid ${catFilter==="todos"?C.violet:C.border}`, background:catFilter==="todos"?C.violetLight:C.card, color:catFilter==="todos"?C.violet:C.text, borderRadius:999, padding:"7px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>Todos ({data.servicios.length})</button>
        {cats.map(cat => {
          const n = (data.servicios || []).filter(s => s.cat === cat.key).length
          return <button key={cat.key} type="button" onClick={() => setCatFilter(cat.key)} style={{ border:`1px solid ${catFilter===cat.key?cat.accent:cat.bdr}`, background:catFilter===cat.key?cat.bg:C.card, color:catFilter===cat.key?cat.accent:C.text, borderRadius:999, padding:"7px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>{cat.label} ({n})</button>
        })}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, background:C.subtle, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px", marginBottom:16, maxWidth:420 }}>
        <Search size={14} color="#94A3B8"/>
        <input style={{ border:"none", background:"transparent", outline:"none", width:"100%", fontSize:13 }} placeholder="Buscar servicio por nombre o descripción..." value={searchSrv} onChange={e => setSearchSrv(e.target.value)} />
      </div>
      {filteredServicios.length===0
        ? <div style={{background:C.subtle,borderRadius:12,padding:"18px",fontSize:13,color:"#94A3B8",textAlign:"center",border:`1.5px dashed ${C.border}`}}>
            Sin resultados para este filtro.
          </div>
        : <div style={{display:"grid",gridTemplateColumns:compact?"1fr":"repeat(3,1fr)",gap:12}}>
            {filteredServicios.map(s=>{
              const cat = cats.find(c => c.key === s.cat) || { accent:C.violet }
              return (
                <button key={s.id} type="button" onClick={() => openEditor(s)} style={{ textAlign:"left", background:C.card,borderRadius:14,padding:18, boxShadow:"0 1px 4px rgba(0,0,0,.07)",border:`1px solid ${C.border}`, borderLeft:`4px solid ${cat.accent}`, display:"flex",flexDirection:"column",gap:8, cursor:"pointer" }}>
                  <div style={{fontWeight:700,fontSize:14,color:C.text}}>{s.nombre}</div>
                  <div style={{fontSize:12,color:"#94A3B8"}}>{catLabel[s.cat] || s.cat} · ⏱ {s.duracion} min · {s.sesiones} sesión{s.sesiones>1?"es":""}</div>
                  <div style={{fontSize:20,fontWeight:800,color:cat.accent}}>{fmt(s.precio)}</div>
                  {s.desc&&<div style={{fontSize:11,color:"#94A3B8"}}>{s.desc}</div>}
                  {(Array.isArray(s.materialesCantidades) && s.materialesCantidades.length > 0 || Array.isArray(s.materialesStockIds) && s.materialesStockIds.length > 0) && (
                    <div style={{ fontSize:11, color:C.muted }}>
                      Artículos: {(Array.isArray(s.materialesCantidades) && s.materialesCantidades.length > 0
                        ? s.materialesCantidades.map(x => `${stockById.get(+x.id)?.nombre || `#${x.id}`}×${x.qty}`)
                        : s.materialesStockIds.map(id => stockById.get(+id)?.nombre || `#${id}`)
                      ).join(", ")}
                    </div>
                  )}
                  <div style={{ fontSize:11, color:C.violet, fontWeight:700, marginTop:2 }}>Tocar para editar</div>
                </button>
              )
            })}
          </div>}

      <Modal open={open} onClose={()=>setOpen(false)} title="✨ Nuevo Servicio"
        footer={<><Btn variant="outline" onClick={()=>setOpen(false)} disabled={saving}>Cancelar</Btn><Btn onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Btn></>}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <FG label="Nombre del Servicio" full>
            <input style={inp} value={form.nombre} onChange={e=>u("nombre",e.target.value)} placeholder="Ej: Depilación Láser Piernas"/>
          </FG>
          <FG label="Categoría">
            <select style={inp} value={form.cat} onChange={e=>u("cat",e.target.value)}>
              <option value="valoracion">Valoración</option>
              <option value="clinico">Clínico</option>
              <option value="facial">Facial</option>
              <option value="corporal">Corporal</option>
              <option value="laser">Láser</option>
              <option value="botox">Bótox</option>
            </select>
          </FG>
          <FG label="Precio (€)">
            <input type="number" style={inp} value={form.precio} onChange={e=>u("precio",e.target.value)} placeholder="0.00" min="0"/>
          </FG>
          <FG label="Duración (min)">
            <input type="number" style={inp} value={form.duracion} onChange={e=>u("duracion",e.target.value)} min="5"/>
          </FG>
          <FG label="Sesiones recomendadas">
            <input type="number" style={inp} value={form.sesiones} onChange={e=>u("sesiones",e.target.value)} min="1"/>
          </FG>
          <FG label="Descripción" full>
            <textarea style={{...inp,resize:"vertical",minHeight:55}} value={form.desc} onChange={e=>u("desc",e.target.value)} placeholder="Descripción…"/>
          </FG>
          <FG label="Lista de materiales (insumos) para esta sesión" full>
            <p style={{ fontSize:12, color:C.muted, marginBottom:8 }}>Marcá artículos de la clínica actual para consumir en cada sesión.</p>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", flex:1 }}>
                <Search size={13} color="#94A3B8" />
                <input style={{ border:"none", outline:"none", width:"100%", background:"transparent", fontSize:12 }} placeholder="Buscar artículo..." value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} />
              </div>
              <Btn sm variant="outline" onClick={() => { setMaterialsModalMode("create"); setOpenMaterialsModal(true) }}>Ver más</Btn>
            </div>
            <div style={{ maxHeight:160, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:10, padding:8, background:C.subtle }}>
              {stockCatalog.length === 0 ? (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <span style={{ fontSize:12, color:C.muted }}>No hay artículos cargados en Stock para la clínica {clinic}.</span>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onGoStock?.() }}
                    style={{ alignSelf:"flex-start", border:"none", background:"none", color:C.violet, fontWeight:700, cursor:"pointer", padding:0 }}
                  >
                    Crear artículos ahora →
                  </button>
                </div>
              ) : filteredMaterialsCreate.map(p => (
                <label key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 4px", fontSize:13, cursor:"pointer" }}>
                  <input type="checkbox" checked={(form.materialesStockIds || []).includes(p.id)} onChange={() => toggleMaterial(p.id)} />
                  <span>{p.nombre} <span style={{ color:C.muted, fontSize:11 }}>(id {p.id})</span></span>
                  {(form.materialesStockIds || []).includes(p.id) && (
                    <input
                      type="number"
                      min="1"
                      value={(form.materialesCantidades || []).find(x => x.id === p.id)?.qty ?? 1}
                      onChange={e => setMaterialQty(p.id, e.target.value, false)}
                      style={{ width:52, padding:"2px 6px", borderRadius:6, border:`1px solid ${C.border}`, fontSize:12, marginLeft:6 }}
                      title="Cantidad por sesión"
                    />
                  )}
                </label>
              ))}
              {stockCatalog.length > 0 && filteredMaterialsCreate.length === 0 && (
                <div style={{ fontSize:12, color:C.muted, padding:"6px 4px" }}>Sin resultados.</div>
              )}
            </div>
          </FG>
        </div>
      </Modal>
      <Modal open={openEdit} onClose={()=>setOpenEdit(false)} title="Editar servicio"
        footer={<><Btn variant="danger" onClick={() => editingId && del(editingId)} disabled={savingEdit}><Trash2 size={12}/> Eliminar</Btn><Btn variant="outline" onClick={()=>setOpenEdit(false)} disabled={savingEdit}>Cancelar</Btn><Btn onClick={() => void saveEdit()} disabled={savingEdit}>{savingEdit ? "Guardando…" : "Guardar cambios"}</Btn></>}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <FG label="Nombre del Servicio" full><input style={inp} value={formEdit.nombre} onChange={e=>ue("nombre",e.target.value)} /></FG>
          <FG label="Categoría">
            <select style={inp} value={formEdit.cat} onChange={e=>ue("cat",e.target.value)}>
              <option value="valoracion">Valoración</option><option value="clinico">Clínico</option><option value="facial">Facial</option><option value="corporal">Corporal</option><option value="laser">Láser</option><option value="botox">Bótox</option>
            </select>
          </FG>
          <FG label="Precio (€)"><input type="number" style={inp} value={formEdit.precio} onChange={e=>ue("precio",e.target.value)} min="0"/></FG>
          <FG label="Duración (min)"><input type="number" style={inp} value={formEdit.duracion} onChange={e=>ue("duracion",e.target.value)} min="5"/></FG>
          <FG label="Sesiones recomendadas"><input type="number" style={inp} value={formEdit.sesiones} onChange={e=>ue("sesiones",e.target.value)} min="1"/></FG>
          <FG label="Descripción" full><textarea style={{...inp,resize:"vertical",minHeight:55}} value={formEdit.desc} onChange={e=>ue("desc",e.target.value)} /></FG>
          <FG label="Artículos para consumir en sesión" full>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", flex:1 }}>
                <Search size={13} color="#94A3B8" />
                <input style={{ border:"none", outline:"none", width:"100%", background:"transparent", fontSize:12 }} placeholder="Buscar artículo..." value={materialSearchEdit} onChange={e => setMaterialSearchEdit(e.target.value)} />
              </div>
              <Btn sm variant="outline" onClick={() => { setMaterialsModalMode("edit"); setOpenMaterialsModal(true) }}>Ver más</Btn>
            </div>
            <div style={{ maxHeight:180, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:10, padding:8, background:C.subtle }}>
              {stockCatalog.length === 0 ? <span style={{ fontSize:12, color:C.muted }}>No hay artículos en Stock de esta clínica.</span> : filteredMaterialsEdit.map(p => (
                <label key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 4px", fontSize:13, cursor:"pointer" }}>
                  <input type="checkbox" checked={(formEdit.materialesStockIds || []).includes(p.id)} onChange={() => toggleMaterialEdit(p.id)} />
                  <span>{p.nombre} <span style={{ color:C.muted, fontSize:11 }}>(id {p.id})</span></span>
                  {(formEdit.materialesStockIds || []).includes(p.id) && (
                    <input
                      type="number"
                      min="1"
                      value={(formEdit.materialesCantidades || []).find(x => x.id === p.id)?.qty ?? 1}
                      onChange={e => setMaterialQty(p.id, e.target.value, true)}
                      style={{ width:52, padding:"2px 6px", borderRadius:6, border:`1px solid ${C.border}`, fontSize:12, marginLeft:6 }}
                      title="Cantidad por sesión"
                    />
                  )}
                </label>
              ))}
              {stockCatalog.length > 0 && filteredMaterialsEdit.length === 0 && (
                <div style={{ fontSize:12, color:C.muted, padding:"6px 4px" }}>Sin resultados.</div>
              )}
            </div>
          </FG>
        </div>
      </Modal>
      <Modal open={openMaterialsModal} onClose={() => setOpenMaterialsModal(false)} title="Todos los productos de stock"
        footer={<Btn onClick={() => setOpenMaterialsModal(false)}>Listo</Btn>}>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px" }}>
            <Search size={13} color="#94A3B8" />
            <input
              style={{ border:"none", outline:"none", width:"100%", background:"transparent", fontSize:12 }}
              placeholder="Buscar producto..."
              value={materialsModalMode === "create" ? materialSearch : materialSearchEdit}
              onChange={e => materialsModalMode === "create" ? setMaterialSearch(e.target.value) : setMaterialSearchEdit(e.target.value)}
            />
          </div>
          <div style={{ maxHeight:340, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:10, padding:8, background:C.subtle }}>
            {stockCatalog.length === 0 ? (
              <span style={{ fontSize:12, color:C.muted }}>No hay artículos en Stock de esta clínica.</span>
            ) : filteredMaterialsModal.map(p => (
              <label key={`mat-modal-${p.id}`} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 4px", fontSize:13, cursor:"pointer" }}>
                <input
                  type="checkbox"
                  checked={materialsModalMode === "create"
                    ? (form.materialesStockIds || []).includes(p.id)
                    : (formEdit.materialesStockIds || []).includes(p.id)}
                  onChange={() => materialsModalMode === "create" ? toggleMaterial(p.id) : toggleMaterialEdit(p.id)}
                />
                <span>{p.nombre} <span style={{ color:C.muted, fontSize:11 }}>(id {p.id})</span></span>
              </label>
            ))}
            {stockCatalog.length > 0 && filteredMaterialsModal.length === 0 && (
              <div style={{ fontSize:12, color:C.muted, padding:"6px 4px" }}>Sin resultados.</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── LOGIN ───────────────────────────────────────────────────
function Login({ onLogin }) {
  const useSupabaseAuth = Boolean(import.meta.env.VITE_SUPABASE_URL)
  const [vista, setVista] = useState("login")
  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)
  const [nomGerente, setNomGerente] = useState("")
  const [nomClinica, setNomClinica] = useState("")
  const [pass2, setPass2] = useState("")
  const [codigoRegistro, setCodigoRegistro] = useState("")

  const iniciarSesionEmp = async (emailTrim, password) => {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: emailTrim,
      password,
    })
    if (authErr) {
      const raw = authErr.message || ""
      const schemaBug =
        /database error querying schema/i.test(raw) ||
        /confirmation_token/i.test(raw)
      setErr(
        schemaBug
          ? "Error del servidor de autenticación (tabla auth.users). En Supabase → SQL Editor ejecutá la migración «auth_users_fix_token_nulls» (archivo 20260408160000…) o contactá al administrador."
          : raw || "No se pudo iniciar sesión",
      )
      return
    }
    const uid = authData.user?.id
    if (!uid) {
      setErr("Sesión inválida")
      await supabase.auth.signOut()
      return
    }
    const { data: emp, error: empErr } = await supabase
      .from("empleados")
      .select("id, nombre, rol, clinic_id, es_principal, activo")
      .eq("auth_user_id", uid)
      .maybeSingle()
    if (empErr) {
      setErr(empErr.message || "Error al cargar tu perfil")
      await supabase.auth.signOut()
      return
    }
    if (!emp) {
      setErr("Tu cuenta no está vinculada a un empleado. Contactá al administrador.")
      await supabase.auth.signOut()
      return
    }
    if (!emp.activo) {
      setErr("Usuario desactivado.")
      await supabase.auth.signOut()
      return
    }
    const session = {
      userId: emp.id,
      role: normalizeRol(emp.rol),
      nombre: emp.nombre,
      user: emailTrim,
      clinicId: emp.clinic_id ?? null,
      esPrincipal: Boolean(emp.es_principal),
      supabase: true,
    }
    saveSession(session)
    onLogin(session)
  }

  const submit = async e => {
    e.preventDefault()
    setErr("")
    if (!useSupabaseAuth) {
      const u = DEMO_USERS.find(x => x.user === user.trim() && x.pass === pass)
      if (!u) { setErr("Usuario o contraseña incorrectos"); return }
      const session = { userId: u.id, role: u.role, nombre: u.nombre, user: u.user, supabase: false }
      saveSession(session)
      onLogin(session)
      return
    }
    setLoading(true)
    try {
      await iniciarSesionEmp(user.trim(), pass)
    } finally {
      setLoading(false)
    }
  }

  const submitRegistroGerente = async e => {
    e.preventDefault()
    setErr("")
    if (!useSupabaseAuth) return
    const email = user.trim()
    if (!nomGerente.trim() || !email || !pass) {
      setErr("Completá nombre, email y contraseña.")
      return
    }
    if (pass !== pass2) {
      setErr("Las contraseñas no coinciden.")
      return
    }
    if (pass.length < 6) {
      setErr("La contraseña debe tener al menos 6 caracteres.")
      return
    }
    setLoading(true)
    try {
      const r = await fetch("/api/admin/bootstrap-gerente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: pass,
          nombre: nomGerente.trim(),
          nombre_clinica: nomClinica.trim() || "Mi clínica",
          secret: codigoRegistro.trim() || undefined,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        let msg = j.error || `Error ${r.status}`
        if (
          typeof msg === "string" &&
          (msg.includes("SUPABASE_SERVICE_ROLE_KEY") || msg.includes("VITE_SUPABASE_URL"))
        ) {
          msg =
            "Falta la configuración del entorno (URL de Supabase y clave de servicio en .env.local). Quien instaló la app debe completarlas y reiniciar npm run dev."
        }
        setErr(msg)
        return
      }
      await iniciarSesionEmp(email, pass)
    } catch (ex) {
      setErr(String(ex?.message || ex))
    } finally {
      setLoading(false)
    }
  }

  const cardStyle = {
    background: "linear-gradient(135deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.62) 100%)",
    backdropFilter: "blur(24px) saturate(200%)",
    WebkitBackdropFilter: "blur(24px) saturate(200%)",
    border: "1px solid rgba(255,255,255,0.55)",
    padding: "max(28px, env(safe-area-inset-left)) max(32px, env(safe-area-inset-right))",
    borderRadius: 24,
    width: 400,
    maxWidth: "100%",
    boxShadow: "0 1px 0 rgba(255,255,255,0.7) inset, 0 32px 80px -20px rgba(15,23,42,0.28), 0 1px 3px rgba(15,23,42,0.06)",
    position: "relative",
    zIndex: 2,
  }

  return (
    <div style={{ minHeight:"100dvh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      background:"transparent",
      position:"relative",
      padding:"max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))" }}>
      {/* ── ORBES ANIMADOS DE FONDO ── */}
      <div className="erp-orbs" aria-hidden>
        <span className="erp-orb erp-orb-1"/>
        <span className="erp-orb erp-orb-2"/>
        <span className="erp-orb erp-orb-3"/>
        <span className="erp-orb erp-orb-4"/>
      </div>
      {vista === "login" ? (
      <form onSubmit={submit} style={cardStyle}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
          <div style={{
            width:46, height:46, borderRadius:13,
            background: C.gradient,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:22,
            boxShadow: `0 10px 24px -8px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.45) inset`,
          }}><Sparkles size={24} color="#fff" strokeWidth={2.5} /></div>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:C.text, letterSpacing:"-0.02em" }}>Estética ERP</div>
            <div style={{ fontSize:12, color:C.muted }}>Ingresá con tu usuario institucional</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <FG label={useSupabaseAuth ? "Email" : "Usuario"}>
            <input style={inp} value={user} onChange={e=>setUser(e.target.value)} autoComplete={useSupabaseAuth ? "email" : "username"} placeholder={useSupabaseAuth ? "correo@clinica.com" : "recepcion, especialista o gerente"}/>
          </FG>
          <FG label="Contraseña">
            <input style={inp} type="password" value={pass} onChange={e=>setPass(e.target.value)} autoComplete="new-password" placeholder="••••••"/>
          </FG>
          {err && <div style={{ fontSize:12, color:C.danger, fontWeight:600 }}>{err}</div>}
          <button type="submit" disabled={loading} style={{
            marginTop:8,
            background: C.gradient,
            color:"#fff",
            border:"1px solid rgba(255,255,255,0.25)",
            borderRadius:12,
            padding:"12px 18px", fontSize:14, fontWeight:700,
            letterSpacing:"-0.01em",
            cursor: loading ? "wait" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            opacity: loading ? 0.85 : 1,
            boxShadow: `0 1px 0 rgba(255,255,255,0.35) inset, 0 10px 24px -8px ${C.violet}66`,
          }}>
            <Lock size={16}/> {loading ? "Entrando…" : "Entrar"}
          </button>
        </div>
        {!useSupabaseAuth && (
        <p style={{ fontSize:11, color:C.muted, marginTop:20, lineHeight:1.5 }}>
          <strong style={{ color:C.text }}>Demo:</strong> usuarios <code style={codeStyle()}>recepcion</code>,{" "}
          <code style={codeStyle()}>especialista</code>,{" "}
          <code style={codeStyle()}>gerente</code> — contraseña{" "}
          <code style={codeStyle()}>demo</code>
        </p>
        )}
      </form>
      ) : (
      <form onSubmit={submitRegistroGerente} style={cardStyle}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${C.violet},${C.pink})`,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <UserPlus size={22} color="#fff" strokeWidth={2.2} aria-hidden />
          </div>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:C.text }}>Nueva cuenta gerente</div>
            <div style={{ fontSize:12, color:C.muted }}>Solo si aún no hay un administrador en el sistema</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <FG label="Tu nombre completo">
            <input style={inp} value={nomGerente} onChange={e=>setNomGerente(e.target.value)} autoComplete="name" placeholder="Ej. Carlos Gómez"/>
          </FG>
          <FG label="Nombre de la clínica (primera sede)">
            <input style={inp} value={nomClinica} onChange={e=>setNomClinica(e.target.value)} placeholder="Mi clínica" />
          </FG>
          <FG label="Email (será tu usuario)">
            <input style={inp} type="email" value={user} onChange={e=>setUser(e.target.value)} autoComplete="email" placeholder="correo@clinica.com"/>
          </FG>
          <FG label="Contraseña">
            <input style={inp} type="password" value={pass} onChange={e=>setPass(e.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres"/>
          </FG>
          <FG label="Repetir contraseña">
            <input style={inp} type="password" value={pass2} onChange={e=>setPass2(e.target.value)} autoComplete="new-password" placeholder="••••••"/>
          </FG>
          <FG label="Código de invitación (opcional)">
            <input style={inp} value={codigoRegistro} onChange={e=>setCodigoRegistro(e.target.value)} placeholder="Solo si quien instaló el sistema te dio un código" />
          </FG>
          {err && <div style={{ fontSize:12, color:C.danger, fontWeight:600 }}>{err}</div>}
          <button type="submit" disabled={loading} style={{ marginTop:4, background:C.violet, color:"#fff", border:"none", borderRadius:10,
            padding:"12px 18px", fontSize:14, fontWeight:700, cursor: loading ? "wait" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <UserPlus size={16}/> {loading ? "Creando cuenta…" : "Crear cuenta y entrar"}
          </button>
        </div>
        <p style={{ fontSize:11, color:C.muted, marginTop:16, lineHeight:1.45 }}>
          No es un alta “solo en la base”: se crea tu usuario en Auth y tu perfil de gerente en la tabla de empleados. Eso lo hace un pequeño servidor con permisos de administración (configuración del entorno, no algo que escribas acá). Si ya hay un gerente, usá «Entrar» o pedí que te den acceso desde Cuentas y equipo.
        </p>
        <button type="button" onClick={() => { setVista("login"); setErr("") }}
          style={{ marginTop:12, width:"100%", background:"transparent", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"11px 14px", fontSize:13, fontWeight:600, color:C.muted, cursor:"pointer" }}>
          Volver al inicio de sesión
        </button>
      </form>
      )}
    </div>
  )
}

// ─── Consentimientos (Supabase) ───────────────────────────────
function mapConsentimientoFirmadoRow(r) {
  if (!r) return null
  return {
    id: r.id,
    clinicId: r.clinic_id,
    clienteId: r.cliente_id,
    turnoId: r.turno_id,
    plantillaSlug: r.plantilla_slug || "",
    titulo: r.titulo || "",
    servicioOProducto: r.servicio_o_producto || "",
    pacienteNombreSnapshot: r.paciente_nombre_snapshot || "",
    contenidoHtml: r.contenido_html || "",
    pdfStoragePath: r.pdf_storage_path || "",
    firmadoAt: r.firmado_at,
    firmadoPorEmpleadoId: r.firmado_por_empleado_id,
  }
}

/** Texto del desplegable: título + categoría + slug (coincide con BD, PDF y carpeta plantillas-consentimiento). */
function etiquetaPlantillaConsent(p) {
  if (!p) return ""
  const tit = String(p.titulo || "").trim()
  const cat = String(p.categoria || "general").trim()
  const slug = String(p.slug || "").trim()
  return [tit, cat, slug].filter(Boolean).join(" · ")
}

/** Enlace al .docx oficial (public/ o URL absoluta) cuando existe en consentimiento_plantillas.archivo_docx_url. */
function ConsentPlantillaDocxLink({ plantilla, C }) {
  const u = plantilla?.archivo_docx_url
  const ministerioToxinaPdf =
    plantilla?.slug === "toxina-botulinica" ? "/plantillas-consentimiento/hoja-sanidad-toxina-botulinica-ministerio.pdf" : null
  if (!u && !ministerioToxinaPdf) return null
  return (
    <div style={{ fontSize: 12, marginTop: 8, marginBottom: 0, lineHeight: 1.45 }}>
      {u && (
        <p style={{ margin: "0 0 0" }}>
          <a href={u} download target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: C.violet }}>
            Descargar modelo Word oficial (.docx)
          </a>
          <span style={{ color: C.muted, display: "block", fontSize: 11, marginTop: 4 }}>
            Archivo en <code style={codeStyle(C.subtle)}>public/plantillas-consentimiento/</code> (mismo que WeTransfer: logo y maquetación).
          </span>
        </p>
      )}
      {ministerioToxinaPdf && (
        <p style={{ margin: u ? "10px 0 0" : "0" }}>
          <a href={ministerioToxinaPdf} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: C.violet }}>
            Ficha de referencia Ministerio de Sanidad (PDF)
          </a>
          <span style={{ color: C.muted, display: "block", fontSize: 11, marginTop: 4 }}>
            Documento escaneado aparte; no sustituye el consentimiento firmado en el ERP.
          </span>
        </p>
      )}
    </div>
  )
}

/** Vista previa del consentimiento con datos de la paciente; debe verse antes de firmar. */
function ConsentimientoLecturaPanel({ html, C, subtitle }) {
  if (!html) return null
  return (
    <div style={{ marginTop: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 6 }}>
        Leé el documento completo antes de firmar
      </div>
      {subtitle && (
        <p style={{ fontSize: 11, color: C.muted, margin: "0 0 10px", lineHeight: 1.45 }}>{subtitle}</p>
      )}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          maxHeight: "min(44vh, 400px)",
          overflowY: "auto",
          padding: 14,
          borderRadius: 10,
          background: "#f8fafc",
          border: `1px solid ${C.border}`,
          color: C.text,
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

function DocumentosConsent({ data, setData, clinicId, clinicNombre, sessionEmail, onConsentSaved }) {
  const [ver, setVer] = useState(null)
  const [openNuevo, setOpenNuevo] = useState(false)
  const [plantillasDoc, setPlantillasDoc] = useState([])
  const [formDoc, setFormDoc] = useState({ pacienteId: "", plantillaSlug: "", servicioProducto: "" })
  const [savingDoc, setSavingDoc] = useState(false)
  const sigDocPacRef = useRef(null)
  const sigDocProfRef = useRef(null)

  const rows = useMemo(() => {
    const list = data.consentimientosFirmados || []
    const cid = +clinicId
    return list
      .filter(r => +r.clinicId === cid)
      .sort((a, b) => String(b.firmadoAt || "").localeCompare(String(a.firmadoAt || "")))
  }, [data.consentimientosFirmados, clinicId])
  const pacById = useMemo(() => Object.fromEntries((data.pacientes || []).map(p => [p.id, p])), [data.pacientes])
  const empById = useMemo(() => Object.fromEntries((data.empleados || []).map(e => [e.id, e])), [data.empleados])
  const pacientesClinica = useMemo(
    () => (data.pacientes || []).filter(p => +p.clinicId === +clinicId).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))),
    [data.pacientes, clinicId],
  )

  const consentPreviewHtmlDoc = useMemo(() => {
    const pl = plantillasDoc.find(p => p.slug === formDoc.plantillaSlug)
    const pid = +formDoc.pacienteId
    const pSel = (data.pacientes || []).find(p => +p.id === pid)
    if (!pl || !pSel) return ""
    const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    const servicio = String(formDoc.servicioProducto || "").trim() || "—"
    const cuerpo = armarCuerpoConsentimiento(pl.cuerpo_texto, pSel, {
      servicioOProducto: servicio,
      fechaStr,
      centroNombre: clinicNombre || `Clínica ${clinicId}`,
    })
    return textoAHtmlParrafos(cuerpo)
  }, [plantillasDoc, formDoc.plantillaSlug, formDoc.pacienteId, formDoc.servicioProducto, data.pacientes, clinicNombre, clinicId])

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) return
    let cancelled = false
    ;(async () => {
      const { data: pls, error } = await supabase
        .from("consentimiento_plantillas")
        .select("slug, titulo, categoria, cuerpo_texto, archivo_docx_url")
        .eq("activo", true)
        .order("categoria", { ascending: true })
        .order("titulo", { ascending: true })
      if (cancelled || error) return
      setPlantillasDoc(pls || [])
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!openNuevo) return
    const id = requestAnimationFrame(() => {
      sigDocPacRef.current?.clear?.()
      sigDocProfRef.current?.clear?.()
    })
    return () => cancelAnimationFrame(id)
  }, [openNuevo])

  const abrirNuevoDesdeDocumentos = () => {
    const first = pacientesClinica[0]?.id ?? ""
    setFormDoc({ pacienteId: first ? String(first) : "", plantillaSlug: "", servicioProducto: "" })
    setOpenNuevo(true)
  }

  const guardarNuevoDesdeDocumentos = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      alert("Configurá Supabase.")
      return
    }
    const pid = +formDoc.pacienteId
    const pSel = (data.pacientes || []).find(p => +p.id === pid)
    if (!pid || !pSel) {
      alert("Elegí una paciente.")
      return
    }
    const pl = plantillasDoc.find(p => p.slug === formDoc.plantillaSlug)
    if (!formDoc.plantillaSlug || !pl) {
      alert("Elegí una plantilla.")
      return
    }
    if (!String(formDoc.servicioProducto || "").trim()) {
      alert("Indicá servicio o producto.")
      return
    }
    if (sigDocPacRef.current?.isEmpty?.()) {
      alert("La paciente debe firmar en el recuadro.")
      return
    }
    setSavingDoc(true)
    try {
      const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
      const cuerpo = armarCuerpoConsentimiento(pl.cuerpo_texto, pSel, {
        servicioOProducto: formDoc.servicioProducto.trim(),
        fechaStr,
        centroNombre: clinicNombre || `Clínica ${clinicId}`,
      })
      const contenidoHtml = textoAHtmlParrafos(cuerpo)
      const firmadoPorId = (data.empleados || []).find(e => String(e.email || "").toLowerCase() === String(sessionEmail || "").toLowerCase())?.id ?? null
      const { data: { session: sb } } = await supabase.auth.getSession()
      const token = sb?.access_token
      if (!token) {
        alert("Sesión expirada.")
        return
      }
      let pdfPublicUrl = ""
      try {
        const varsPdf = varsDesdePaciente(pSel, {
          servicioOProducto: formDoc.servicioProducto.trim(),
          fecha: fechaStr,
          centro: clinicNombre || `Clínica ${clinicId}`,
        })
        const cuerpoPdf = cuerpoConsentimientoParaPdf(rellenarPlantilla(pl.cuerpo_texto, varsPdf))
        const empDoc = (data.empleados || []).find(e => String(e.email || "").toLowerCase() === String(sessionEmail || "").toLowerCase())
        const pdfDataUrl = await buildConsentimientoPdfDataUrl({
          titulo: pl.titulo,
          cuerpoTexto: cuerpoPdf,
          firmaPacienteDataUrl: sigDocPacRef.current.getDataURL(),
          firmaProfesionalDataUrl: sigDocProfRef.current && !sigDocProfRef.current.isEmpty()
            ? sigDocProfRef.current.getDataURL()
            : null,
          nombrePaciente: pSel.nombre || "",
          pacienteDni: pSel.dni,
          pacienteEmail: pSel.email,
          pacienteTelefono: pSel.tel,
          pacienteFechaNacimiento: varsPdf.pacienteFechaNacimiento,
          datosCentro: clinicNombre || `Clínica ${clinicId}`,
          numeroColegiado: empDoc?.documento || "—",
          nombreProfesional: empDoc?.nombre || "",
          fechaStr: fechaStr,
        })
        pdfPublicUrl = await uploadConsentPdfDataUrl(pdfDataUrl, {
          clinicId: pSel.clinicId,
          clienteId: pid,
          accessToken: token,
        })
      } catch (e) {
        alert(`PDF: ${String(e?.message || e)}`)
        return
      }
      const { data: ins, error } = await supabase
        .from("consentimientos_firmados")
        .insert({
          clinic_id: pSel.clinicId,
          cliente_id: pid,
          turno_id: null,
          plantilla_slug: pl.slug,
          titulo: pl.titulo,
          servicio_o_producto: formDoc.servicioProducto.trim(),
          paciente_nombre_snapshot: pSel.nombre || "",
          contenido_html: contenidoHtml,
          pdf_storage_path: pdfPublicUrl,
          firmado_por_empleado_id: firmadoPorId,
        })
        .select("*")
        .single()
      if (error) {
        alert(error.message || "No se pudo guardar.")
        return
      }
      const mapped = mapConsentimientoFirmadoRow(ins)
      setData(d => ({
        ...d,
        consentimientosFirmados: [...(d.consentimientosFirmados || []), mapped],
      }))
      onConsentSaved?.()
      setOpenNuevo(false)
      setFormDoc({ pacienteId: "", plantillaSlug: "", servicioProducto: "" })
    } finally {
      setSavingDoc(false)
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5, flex: "1 1 280px" }}>
          Registros en <code style={codeStyle(C.subtle)}>consentimientos_firmados</code>. Al dar de alta, si aparece <strong>Descargar modelo Word oficial (.docx)</strong>, ese es el documento de la clínica (como en WeTransfer). El <strong>PDF</strong> que genera la app al firmar es la copia con firmas para archivo digital.
        </p>
        {import.meta.env.VITE_SUPABASE_URL && (
          <Btn onClick={abrirNuevoDesdeDocumentos} disabled={pacientesClinica.length === 0}>
            <Plus size={14}/> Nuevo consentimiento
          </Btn>
        )}
      </div>
      {pacientesClinica.length === 0 && (
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>No hay pacientes en esta clínica; cargalas en Pacientes / Agenda primero.</p>
      )}
      <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 12, background: C.card }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <THead cols={["Fecha", "Paciente", "Documento", "Servicio / producto", "Registrado por", "Ver / PDF"]} />
          <tbody>
            {rows.map(r => {
              const p = pacById[r.clienteId]
              const fecha = r.firmadoAt ? new Date(r.firmadoAt).toLocaleString("es-ES") : "—"
              const emp = r.firmadoPorEmpleadoId ? empById[r.firmadoPorEmpleadoId] : null
              return (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.subtle}` }}>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: C.muted }}>{fecha}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{p?.nombre || r.pacienteNombreSnapshot}</td>
                  <td style={{ padding: "10px 12px" }}>{r.titulo}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.servicioOProducto || "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12 }}>{emp?.nombre || "—"}</td>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                    <Btn sm variant="outline" onClick={() => setVer(r)}>Ver</Btn>
                    {r.pdfStoragePath ? (
                      <a
                        href={r.pdfStoragePath}
                        target="_blank"
                        rel="noreferrer"
                        style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: C.violet }}
                      >
                        PDF
                      </a>
                    ) : (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "#94A3B8" }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "#94A3B8" }}>Aún no hay consentimientos registrados en esta clínica.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Modal open={!!ver} onClose={() => setVer(null)} title={ver?.pdfStoragePath ? "PDF — " + (ver?.titulo || "Consentimiento") : ver?.titulo || "Consentimiento"}
        footer={<Btn variant="outline" onClick={() => setVer(null)}>Cerrar</Btn>}>
        <div style={{ maxHeight: "min(78vh, 720px)", overflowY: "auto" }}>
          {ver?.pdfStoragePath ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: C.text }}>PDF generado al firmar (no es el .docx)</div>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.45, margin: "0 0 10px" }}>
                Este archivo es el PDF que creó la app con texto + firmas. No reemplaza ni adjunta el Word original; el contenido legal es el de la plantilla en Supabase.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <Btn
                  sm
                  onClick={() => window.open(ver.pdfStoragePath, "_blank", "noopener,noreferrer")}
                >
                  Abrir PDF en nueva pestaña
                </Btn>
              </div>
              <object
                data={ver.pdfStoragePath}
                type="application/pdf"
                style={{ width: "100%", minHeight: "min(52vh, 480px)", border: `1px solid ${C.border}`, borderRadius: 10, background: "#e2e8f0" }}
              >
                <p style={{ padding: 12, fontSize: 13 }}>
                  Tu navegador no muestra PDF embebido.{" "}
                  <a href={ver.pdfStoragePath} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: C.violet }}>Abrir el PDF</a>
                </p>
              </object>
            </div>
          ) : (
            <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: "#fffbeb", border: `1px solid #fcd34d` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>Sin PDF archivado — solo texto en el sistema</div>
              <p style={{ fontSize: 12, color: "#78350f", lineHeight: 1.5, margin: "0 0 12px" }}>
                Eso <strong>no es tu .docx</strong>: es el HTML guardado. El botón de abajo descarga un <strong>PDF generado por el ERP</strong> con ese texto (tampoco es Word). Los flujos nuevos con firma guardan un PDF con firmas en almacenamiento.
              </p>
              {ver?.contenidoHtml && (
                <Btn
                  onClick={() =>
                    void downloadPdfFromArchivedHtml({
                      titulo: ver.titulo,
                      contenidoHtml: ver.contenidoHtml,
                      filenameBase: `consentimiento-${ver.id}`,
                    })
                  }
                >
                  Descargar PDF de respaldo (texto del sistema, no Word)
                </Btn>
              )}
            </div>
          )}
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.muted, marginBottom: 8 }}>
              Vista previa del texto en pantalla (HTML)
            </summary>
            {ver?.contenidoHtml ? (
              <div style={{ fontSize: 13, lineHeight: 1.55, maxHeight: "36vh", overflowY: "auto", padding: 10, borderRadius: 8, background: "#f8fafc", border: `1px solid ${C.border}` }} dangerouslySetInnerHTML={{ __html: ver.contenidoHtml }} />
            ) : (
              <p style={{ color: C.muted, fontSize: 13 }}>No hay texto HTML para este registro.</p>
            )}
          </details>
        </div>
      </Modal>
      <Modal open={openNuevo} onClose={() => { if (!savingDoc) setOpenNuevo(false) }} title="Nuevo consentimiento — Documentos"
        footer={<><Btn variant="outline" disabled={savingDoc} onClick={() => setOpenNuevo(false)}>Cancelar</Btn><Btn disabled={savingDoc} onClick={() => void guardarNuevoDesdeDocumentos()}>{savingDoc ? "Guardando…" : "PDF + registrar"}</Btn></>}>
        <div style={{ maxHeight: "min(82vh, 680px)", overflowY: "auto", paddingRight: 4 }}>
          <FG label="Paciente" full>
            <select
              style={inp}
              value={formDoc.pacienteId}
              onChange={e => setFormDoc(f => ({ ...f, pacienteId: e.target.value }))}
            >
              <option value="">Seleccionar…</option>
              {pacientesClinica.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </FG>
          <FG label="Plantilla" full>
            <select
              style={inp}
              value={formDoc.plantillaSlug}
              onChange={e => setFormDoc(f => ({ ...f, plantillaSlug: e.target.value }))}
            >
              <option value="">Seleccionar…</option>
              {plantillasDoc.map(p => (
                <option key={p.slug} value={p.slug}>{etiquetaPlantillaConsent(p)}</option>
              ))}
            </select>
          </FG>
          <ConsentPlantillaDocxLink plantilla={plantillasDoc.find(p => p.slug === formDoc.plantillaSlug)} C={C} />
          <FG label="Servicio o producto" full>
            <input
              style={inp}
              value={formDoc.servicioProducto}
              onChange={e => setFormDoc(f => ({ ...f, servicioProducto: e.target.value }))}
              placeholder="Ej: Toxina — glabella"
            />
          </FG>
          <ConsentimientoLecturaPanel
            html={consentPreviewHtmlDoc}
            C={C}
            subtitle="Incluye nombre, DNI, contacto y fecha de nacimiento según la ficha. Mostrale la pantalla a la paciente o girá el dispositivo."
          />
          <SignaturePad
            ref={sigDocPacRef}
            width={320}
            height={130}
            label="Firma de la paciente (obligatoria)"
            hint="Firma con dedo o mouse."
          />
          <Btn type="button" variant="outline" sm style={{ marginTop: 6 }} onClick={() => sigDocPacRef.current?.clear?.()}>Limpiar firma paciente</Btn>
          <div style={{ marginTop: 12 }}>
            <SignaturePad
              ref={sigDocProfRef}
              width={320}
              height={110}
              label="Firma profesional (opcional)"
            />
            <Btn type="button" variant="outline" sm style={{ marginTop: 6 }} onClick={() => sigDocProfRef.current?.clear?.()}>Limpiar firma profesional</Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── SECTION: PACIENTES / CRM + HISTORIAL CLÍNICO ─────────────
function PacientesHistorial({ data, setData, role, nombreUsuario, mode = "pacientes", clinic, clinicNombre, onConsentSaved, sessionEmail }) {
  const [backfillLoading, setBackfillLoading] = useState(false)
  const compactLayout = useMediaQuery("(max-width: 980px)")
  const hydratedRef = useRef(false)
  const pacientesFromTurnos = useMemo(() => {
    if ((data.pacientes || []).length > 0) return []
    const byName = new Map()
    const cd = data.clinics?.[clinic]
    if (!cd) return []
    const clinicId = +clinic
    for (const t of (cd?.turnos || [])) {
        const nombre = String(t?.cliente || "").trim()
        if (!nombre) continue
        const key = nombre.toLowerCase()
        if (!byName.has(key)) {
          byName.set(key, {
            id: 1000000 + byName.size + 1,
            clinicId,
            nombre,
            tel: String(t?.tel || ""),
            email: "",
            dni: "",
            fechaNacimiento: "",
            notasClinicas: "",
            alergias: [],
            tratamientosActivos: [],
            visitas: [],
            fotos: [],
            anamnesis: {},
            consentimientos: [],
            created_at: null,
            esPaciente: ["en_curso", "listo_cobrar", "finalizado"].includes(String(t?.estado || "")),
          })
        }
    }
    return [...byName.values()]
  }, [data.pacientes, data.clinics, clinic])
  const pacientesView = useMemo(() => {
    const raw = (data.pacientes || []).length > 0 ? (data.pacientes || []) : pacientesFromTurnos
    return raw.filter(p => p && p.clinicId != null && +p.clinicId === +clinic)
  }, [data.pacientes, pacientesFromTurnos, clinic])
  const [sel, setSel] = useState(pacientesView[0]?.id ?? null)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState("crm")
  const [open, setOpen] = useState(false)
  const [openCons, setOpenCons] = useState(false)
  const [openFoto, setOpenFoto] = useState(false)
  const [openCliente, setOpenCliente] = useState(false)
  const [form, setForm] = useState({ tipo:"evolucion", titulo:"", detalle:"", fecha:TODAY })
  const [formCons, setFormCons] = useState({ plantillaSlug: "", servicioProducto: "" })
  const [plantillasConsent, setPlantillasConsent] = useState(() => getPlantillasConsentLocales())
  const [previewConsent, setPreviewConsent] = useState(null)
  const [formFoto, setFormFoto] = useState({ tipo:"antes", url:"", nota:"", angulo:"" })
  const fotoPacienteFileRef = useRef(null)
  const fotoPacienteCamRef = useRef(null)
  const [formCliente, setFormCliente] = useState({ nombre:"", tel:"", email:"", dni:"" })
  const u = (k,v) => setForm(f => ({ ...f, [k]:v }))
  useEffect(() => { setSel(null) }, [clinic])
  const pac = pacientesView.filter(p => String(p.nombre || "").toLowerCase().includes(search.toLowerCase()))
  const hist = data.historialClinico.filter(h => h.pacienteId === sel).sort((a,b)=>b.fecha.localeCompare(a.fecha))
  const pSel = pacientesView.find(p => p.id === sel)
  const consentPreviewOpenCons = useMemo(() => {
    const pl = plantillasConsent.find(p => p.slug === formCons.plantillaSlug)
    if (!pl || !pSel) return ""
    const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    const servicio = String(formCons.servicioProducto || "").trim() || "—"
    const cuerpo = armarCuerpoConsentimiento(pl.cuerpo_texto, pSel, {
      servicioOProducto: servicio,
      fechaStr,
      centroNombre: clinicNombre || (clinic ? `Clínica ${clinic}` : "—"),
    })
    return textoAHtmlParrafos(cuerpo)
  }, [plantillasConsent, formCons.plantillaSlug, formCons.servicioProducto, pSel, clinicNombre, clinic])
  const consentRowsSupa = useMemo(() => {
    if (!sel || !pSel) return []
    return (data.consentimientosFirmados || [])
      .filter(c => c.clienteId === sel && +c.clinicId === +pSel.clinicId)
      .sort((a, b) => String(b.firmadoAt || "").localeCompare(String(a.firmadoAt || "")))
  }, [data.consentimientosFirmados, sel, pSel])
  const empByIdConsent = useMemo(() => Object.fromEntries((data.empleados || []).map(e => [e.id, e])), [data.empleados])
  /** Turnos vinculados al paciente (id o nombre en agenda) — base para resumen y timeline. */
  const turnosDelPaciente = useMemo(() => {
    if (!pSel) return []
    const nombreSel = String(pSel.nombre || "").trim().toLowerCase()
    const cd = data.clinics?.[clinic]
    if (!cd) return []
    return (cd.turnos || []).filter(t => (
      (+t.pacienteId === +pSel.id) ||
      (nombreSel && String(t?.cliente || "").trim().toLowerCase() === nombreSel)
    ))
  }, [pSel, data.clinics, clinic])
  /** Visitas guardadas en clientes.visitas; si están vacías, se infieren desde turnos con fecha. */
  const visitasResumen = useMemo(() => {
    const db = Array.isArray(pSel?.visitas) ? pSel.visitas : []
    if (db.length > 0) return [...db].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
    return turnosDelPaciente
      .filter(t => t.fecha)
      .map(t => ({
        id: `agenda-${t.id}`,
        fecha: t.fecha,
        motivo: t.servicio || "Consulta",
        profesionalId: t.profesionalId ?? null,
      }))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .slice(0, 20)
  }, [pSel, turnosDelPaciente])
  /** Tratamientos en ficha + nombres de servicio deducidos de turnos (p. ej. «1 VIAL · Valoración»). */
  const tratamientosResumen = useMemo(() => {
    const db = (Array.isArray(pSel?.tratamientosActivos) ? pSel.tratamientosActivos : []).map(x => String(x || "").trim()).filter(Boolean)
    const fromTurnos = []
    for (const t of turnosDelPaciente) {
      if (!t.servicio) continue
      for (const part of String(t.servicio).split(/\s*·\s*/)) {
        const s = part.trim()
        if (s) fromTurnos.push(s)
      }
    }
    return [...new Set([...db, ...fromTurnos])]
  }, [pSel, turnosDelPaciente])
  const atencionesTimeline = useMemo(() => {
    if (!pSel) return []
    const turnosPaciente = turnosDelPaciente
    const eventosTurno = turnosPaciente.map(t => ({
      id: `t-${t.id}`,
      fecha: t.fecha || "",
      hora: t.hora || "",
      tipo: "turno",
      titulo: t.servicio || "Consulta",
      detalle: t.obs || "",
      profesional: (data.profesionales || []).find(pr => +pr.id === +(t.profesionalId || 0))?.nombre || "",
      estado: t.estado || "",
      cat: t.cat || "",
    }))
    const eventosHist = hist.map(h => ({
      id: `h-${h.id}`,
      fecha: h.fecha || "",
      hora: "",
      tipo: "historial",
      titulo: h.titulo || "Evolución",
      detalle: h.detalle || "",
      profesional: h.profesional || "",
      estado: "",
      cat: h.tipo || "",
    }))
    return [...eventosTurno, ...eventosHist]
      .filter(e => e.fecha)
      .sort((a, b) => {
        const ka = `${a.fecha} ${a.hora || "00:00"}`
        const kb = `${b.fecha} ${b.hora || "00:00"}`
        return kb.localeCompare(ka)
      })
  }, [pSel, turnosDelPaciente, data.profesionales, hist])
  const notas = pSel ? (pSel.notasClinicas ?? pSel.notas ?? "") : ""
  const patchPac = (id, patcher) => setData(d => ({ ...d, pacientes: d.pacientes.map(p => p.id === id ? patcher(p) : p) }))

  const persistAnamnesisCliente = async nextAnamnesis => {
    if (!import.meta.env.VITE_SUPABASE_URL || !sel) return
    const { error } = await supabase.from("clientes").update({ anamnesis: nextAnamnesis }).eq("id", sel)
    if (error) alert(`No se pudo guardar la anamnesis: ${error.message}`)
  }

  const addEv = async () => {
    if (!sel || !form.titulo.trim()) return
    const profesional = nombreUsuario || "Usuario"
    const row = {
      pacienteId: sel,
      fecha: form.fecha,
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      detalle: form.detalle.trim(),
      profesional,
    }
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { data: ins, error } = await supabase
        .from("historial_clinico")
        .insert({
          cliente_id: sel,
          fecha: form.fecha,
          tipo: form.tipo,
          titulo: row.titulo,
          detalle: row.detalle,
          profesional,
        })
        .select("id")
        .single()
      if (error) {
        alert(error.message || "No se pudo guardar la evolución.")
        return
      }
      setData(d => ({
        ...d,
        historialClinico: [...d.historialClinico, { id: ins.id, ...row }],
      }))
    } else {
      const id = data.historialClinico.length ? Math.max(...data.historialClinico.map(h => h.id)) + 1 : 1
      setData(d => ({
        ...d,
        historialClinico: [...d.historialClinico, { id, ...row }],
      }))
    }
    setOpen(false)
    setForm({ tipo:"evolucion", titulo:"", detalle:"", fecha:TODAY })
  }
  const delH = async id => {
    if (role === "recepcionista") return
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("historial_clinico").delete().eq("id", id)
      if (error) {
        alert(error.message || "No se pudo borrar la evolución.")
        return
      }
    }
    setData(d => ({ ...d, historialClinico: d.historialClinico.filter(h => h.id !== id) }))
  }
  const saveCliente = async () => {
    const nombre = String(formCliente.nombre || "").trim()
    if (!nombre) return
    const clinicIds = Object.keys(data.clinics || {}).map(Number).filter(Number.isFinite)
    const defaultClinicId =
      clinic != null && String(clinic).trim() !== "" && Number.isFinite(Number(clinic))
        ? Number(clinic)
        : clinicIds[0] || 1
    const payload = {
      clinic_id: defaultClinicId,
      nombre,
      tel: String(formCliente.tel || "").trim(),
      email: String(formCliente.email || "").trim(),
      dni: String(formCliente.dni || "").trim(),
    }
    const mapClienteRow = row => ({
      id: row.id,
      clinicId: row.clinic_id,
      nombre: row.nombre || "",
      tel: row.tel || "",
      email: row.email || "",
      dni: row.dni || "",
      fechaNacimiento: row.fecha_nacimiento || "",
      notasClinicas: row.notas_clinicas || "",
      alergias: Array.isArray(row.alergias) ? row.alergias : [],
      tratamientosActivos: Array.isArray(row.tratamientos_activos) ? row.tratamientos_activos : [],
      visitas: Array.isArray(row.visitas) ? row.visitas : [],
      fotos: Array.isArray(row.fotos) ? row.fotos : [],
      anamnesis: row.anamnesis && typeof row.anamnesis === "object" ? row.anamnesis : {},
      consentimientos: Array.isArray(row.consentimientos) ? row.consentimientos : [],
      created_at: row.created_at || null,
      esPaciente: row.es_paciente === true,
    })
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { data: { session: sb } } = await supabase.auth.getSession()
      const token = sb?.access_token
      if (!token) {
        alert("Tu sesión expiró. Volvé a iniciar sesión.")
        return
      }
      const r = await fetch("/api/erp/cliente/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clinicId: defaultClinicId,
          nombre: payload.nombre,
          tel: payload.tel,
          email: payload.email,
          dni: payload.dni,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.cliente) {
        alert(j?.error || "No se pudo crear el cliente en la base de datos.")
        return
      }
      const mapped = mapClienteRow(j.cliente)
      setData(d => ({ ...d, pacientes: [...(d.pacientes || []), mapped] }))
      setSel(mapped.id)
      setOpenCliente(false)
      setFormCliente({ nombre:"", tel:"", email:"", dni:"" })
      return
    }
    const nextId = (data.pacientes || []).length
      ? Math.max(...data.pacientes.map(p => +p.id || 0)) + 1
      : 1
    const nuevo = {
      id: nextId,
      clinicId: defaultClinicId,
      nombre,
      tel: payload.tel,
      email: payload.email,
      dni: payload.dni,
      fechaNacimiento: "",
      notasClinicas: "",
      alergias: [],
      tratamientosActivos: [],
      visitas: [],
      fotos: [],
      anamnesis: {},
      consentimientos: [],
      created_at: TODAY,
      esPaciente: false,
    }
    setData(d => ({ ...d, pacientes: [...(d.pacientes || []), nuevo] }))
    setSel(nextId)
    setOpenCliente(false)
    setFormCliente({ nombre:"", tel:"", email:"", dni:"" })
  }
  const backfillDesdeAgenda = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      alert("Conectá Supabase para usar esta acción.")
      return
    }
    if (!window.confirm(
      "Se crearán o enlazarán fichas de paciente/cliente para los turnos de agenda que tenían nombre pero no estaban vinculados a la base. " +
        "Solo se procesa la clínica que tenés seleccionada ahora. ¿Continuar?"
    )) return
    setBackfillLoading(true)
    try {
      const { data: { session: sb } } = await supabase.auth.getSession()
      const token = sb?.access_token
      if (!token) {
        alert("Tu sesión expiró. Volvé a iniciar sesión.")
        return
      }
      const r = await fetch("/api/erp/clientes/backfill-from-turnos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clinicId: clinic != null && clinic !== "" ? +clinic : undefined }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) {
        alert(j?.error || "No se pudo completar la reparación.")
        return
      }
      alert(
        `Listo.\n• Turnos vinculados a ficha: ${j.turnosVinculados ?? 0}\n• Fichas nuevas creadas: ${j.fichasCreadas ?? 0}\n• Turnos revisados (sin vínculo previo): ${j.revisados ?? 0}`
      )
      onConsentSaved?.()
    } finally {
      setBackfillLoading(false)
    }
  }
  const saveCons = async () => {
    if (!sel || !pSel) return
    const pl = plantillasConsent.find(p => p.slug === formCons.plantillaSlug)
    if (!formCons.plantillaSlug || !pl) {
      alert("Elegí una plantilla de consentimiento.")
      return
    }
    if (!String(formCons.servicioProducto || "").trim()) {
      alert("Indicá el servicio o producto que se aplicará.")
      return
    }
    const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    const cuerpo = armarCuerpoConsentimiento(pl.cuerpo_texto, pSel, {
      servicioOProducto: formCons.servicioProducto.trim(),
      fechaStr,
      centroNombre: clinicNombre || (clinic ? `Clínica ${clinic}` : ""),
    })
    const contenidoHtml = textoAHtmlParrafos(cuerpo)
    const firmadoPorId = (data.empleados || []).find(e => String(e.email || "").toLowerCase() === String(sessionEmail || "").toLowerCase())?.id ?? null

    if (import.meta.env.VITE_SUPABASE_URL) {
      const { data: ins, error } = await supabase
        .from("consentimientos_firmados")
        .insert({
          clinic_id: pSel.clinicId,
          cliente_id: sel,
          plantilla_slug: pl.slug,
          titulo: pl.titulo,
          servicio_o_producto: formCons.servicioProducto.trim(),
          paciente_nombre_snapshot: pSel.nombre || "",
          contenido_html: contenidoHtml,
          firmado_por_empleado_id: firmadoPorId,
        })
        .select("*")
        .single()
      if (error) {
        alert(error.message || "No se pudo guardar el consentimiento.")
        return
      }
      const mapped = mapConsentimientoFirmadoRow(ins)
      setData(d => ({
        ...d,
        consentimientosFirmados: [...(d.consentimientosFirmados || []), mapped],
      }))
      onConsentSaved?.()
      setOpenCons(false)
      setFormCons({ plantillaSlug: "", servicioProducto: "" })
      return
    }
    patchPac(sel, p => {
      const list = p.consentimientos || []
      const nid = list.length ? Math.max(...list.map(c => c.id)) + 1 : 1
      return { ...p, consentimientos: [...list, { id:nid, titulo: pl.titulo, fecha: TODAY, firmado: true, firmadoPor: nombreUsuario }] }
    })
    setOpenCons(false)
    setFormCons({ plantillaSlug: "", servicioProducto: "" })
  }
  const saveFoto = async () => {
    if (!sel || !String(formFoto.url || "").trim()) return
    let finalUrl = String(formFoto.url || "").trim()
    try {
      finalUrl = await uploadImageDataUrl(finalUrl, "pacientes")
    } catch (e) {
      alert(String(e?.message || e))
      return
    }
    const list = pSel?.fotos || []
    const nid = list.length ? Math.max(...list.map(f => f.id || 0)) + 1 : 1
    const row = { id:nid, tipo:formFoto.tipo || "antes", url:finalUrl, fecha:TODAY, nota:formFoto.nota || "" }
    const ang = String(formFoto.angulo || "").trim()
    if (ang && (formFoto.tipo === "antes" || formFoto.tipo === "despues")) row.angulo = ang
    const nuevasFotos = [...list, row]
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("clientes").update({ fotos: nuevasFotos }).eq("id", sel)
      if (error) {
        alert(`No se pudo guardar la foto en la ficha: ${error.message}`)
        return
      }
    }
    patchPac(sel, p => ({ ...p, fotos: nuevasFotos }))
    setOpenFoto(false)
    setFormFoto({ tipo:"antes", url:"", nota:"", angulo:"" })
  }
  const delFoto = async id => {
    if (!sel) return
    const foto = (pSel?.fotos || []).find(f => f.id === id)
    const nuevasFotos = (pSel?.fotos || []).filter(f => f.id !== id)
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("clientes").update({ fotos: nuevasFotos }).eq("id", sel)
      if (error) {
        alert(`No se pudo actualizar la ficha: ${error.message}`)
        return
      }
    }
    patchPac(sel, p => ({ ...p, fotos: nuevasFotos }))
    try {
      await deleteStorageImageByUrl(foto?.url || "")
    } catch (e) {
      alert(`La foto se quitó de la ficha, pero no se pudo borrar del storage: ${String(e?.message || e)}`)
    }
  }
  const loadFotoFile = async file => {
    if (!file) return
    try {
      const compressed = await compressImageFileToDataUrl(file)
      if (!compressed) throw new Error("No se pudo procesar la imagen.")
      setFormFoto(f => ({ ...f, url: compressed }))
    } catch (e) {
      alert(String(e?.message || e))
    }
  }

  const canEdit = role !== "recepcionista"
  const isClinica = mode === "pacientes"
  const puedeRegistrarConsent = canEdit || role === "recepcionista"

  const delConsentFirmado = async c => {
    if (!sel || !pSel || !c?.id) return
    if (!puedeRegistrarConsent) return
    if (!window.confirm("¿Eliminar este registro de consentimiento firmado? No se puede deshacer.")) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("consentimientos_firmados").delete().eq("id", c.id)
      if (error) {
        alert(error.message || "No se pudo borrar. Si sos especialista/recepcionista, aplicá la migración que amplía el DELETE en consentimientos_firmados.")
        return
      }
      setData(d => ({
        ...d,
        consentimientosFirmados: (d.consentimientosFirmados || []).filter(x => x.id !== c.id),
      }))
      onConsentSaved?.()
    }
  }
  const delConsentLegacy = async c => {
    if (!sel || !pSel || !canEdit) return
    if (!window.confirm("¿Quitar este registro histórico de la ficha?")) return
    const next = (pSel.consentimientos || []).filter(x => x.id !== c.id)
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("clientes").update({ consentimientos: next }).eq("id", sel)
      if (error) {
        alert(error.message)
        return
      }
    }
    patchPac(sel, p => ({ ...p, consentimientos: next }))
  }

  useEffect(() => {
    if (!isClinica) return
    // Las plantillas locales (extraídas del WeTransfer oficial) ya están cargadas
    // como valor inicial. Si hay Supabase, se mezclan con las remotas.
    if (!import.meta.env.VITE_SUPABASE_URL) {
      setPlantillasConsent(getPlantillasConsentLocales())
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: pls, error } = await supabase
        .from("consentimiento_plantillas")
        .select("slug, titulo, categoria, cuerpo_texto, archivo_docx_url")
        .eq("activo", true)
        .order("categoria", { ascending: true })
        .order("titulo", { ascending: true })
      if (cancelled) return
      setPlantillasConsent(mergePlantillasConsent(error ? [] : (pls || [])))
    })()
    return () => { cancelled = true }
  }, [isClinica])

  useEffect(() => {
    if (isClinica) return
    if (["anamnesis", "consent", "fotos"].includes(tab)) setTab("crm")
  }, [isClinica, tab])

  useEffect(() => {
    if (sel != null) return
    if ((pacientesView || []).length === 0) return
    setSel(pacientesView[0].id)
  }, [sel, pacientesView])

  useEffect(() => {
    if (hydratedRef.current) return
    if (!import.meta.env.VITE_SUPABASE_URL) return
    if ((data.pacientes || []).length > 0) {
      hydratedRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: pacs } = await supabase
        .from("clientes")
        .select("id, clinic_id, nombre, tel, email, dni, fecha_nacimiento, notas_clinicas, alergias, tratamientos_activos, visitas, fotos, anamnesis, consentimientos, created_at, es_paciente")
        .order("id")
      const pacIds = (pacs || []).map(p => p.id)
      const { data: hist } = pacIds.length
        ? await supabase.from("historial_clinico").select("id, cliente_id, fecha, tipo, titulo, detalle, profesional").in("cliente_id", pacIds).order("id")
        : { data: [] }
      if (cancelled) return
      const mappedPac = (pacs || []).map(p => ({
        id: p.id,
        clinicId: p.clinic_id,
        nombre: p.nombre || "",
        tel: p.tel || "",
        email: p.email || "",
        dni: p.dni || "",
        fechaNacimiento: p.fecha_nacimiento || "",
        notasClinicas: p.notas_clinicas || "",
        alergias: Array.isArray(p.alergias) ? p.alergias : [],
        tratamientosActivos: Array.isArray(p.tratamientos_activos) ? p.tratamientos_activos : [],
        visitas: Array.isArray(p.visitas) ? p.visitas : [],
        fotos: Array.isArray(p.fotos) ? p.fotos : [],
        anamnesis: p.anamnesis && typeof p.anamnesis === "object" ? p.anamnesis : {},
        consentimientos: Array.isArray(p.consentimientos) ? p.consentimientos : [],
        created_at: p.created_at || null,
        esPaciente: p.es_paciente === true,
      }))
      const mappedHist = (hist || []).map(h => ({
        id: h.id,
        pacienteId: h.cliente_id,
        fecha: h.fecha,
        tipo: h.tipo || "evolucion",
        titulo: h.titulo || "",
        detalle: h.detalle || "",
        profesional: h.profesional || "",
      }))
      setData(d => ({ ...d, pacientes: mappedPac, historialClinico: mappedHist }))
      if (!sel && mappedPac.length > 0) setSel(mappedPac[0].id)
      hydratedRef.current = true
    })()
    return () => { cancelled = true }
  }, [data.pacientes, setData, sel])

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:700 }}>{isClinica ? "Pacientes — historial clínico" : "Clientes — CRM"}</h2>
          <p style={{ fontSize:13, color:C.muted, marginTop:2 }}>
            {isClinica
              ? "Quien agenda es cliente (ficha en agenda); pasa a paciente clínico al iniciar sesión en el área médica. Anamnesis, consentimientos, fotos y evolución."
              : "Cliente = agenda / CRM. Paciente clínico = ya atendido en área médica. La vista detallada está en Pacientes."}
          </p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
          {!isClinica && (
            <Btn onClick={() => setOpenCliente(true)}><Plus size={14}/> Nuevo cliente</Btn>
          )}
          {import.meta.env.VITE_SUPABASE_URL && (
            <Btn
              type="button"
              variant="outline"
              disabled={backfillLoading}
              onClick={() => void backfillDesdeAgenda()}
              title="Para turnos viejos que solo tenían nombre en agenda y no ficha en la base"
            >
              {backfillLoading ? <Loader2 size={14} className="erp-spin"/> : <Link2 size={14}/>}
              {" "}Vincular fichas desde agenda
            </Btn>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:8, background:C.subtle, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"7px 12px", minWidth:200 }}>
            <Search size={13} color="#94A3B8"/>
            <input style={{ border:"none", background:"transparent", fontSize:13, color:C.text, outline:"none", width:"100%" }}
              placeholder={isClinica ? "Buscar paciente…" : "Buscar cliente…"} value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns: compactLayout ? "1fr" : "280px 1fr", gap:18, alignItems:"start" }}>
        <div style={{ background:C.card, borderRadius:16, padding:14, boxShadow:"0 1px 3px rgba(0,0,0,.06)", maxHeight:520, overflowY:"auto" }}>
          {pac.map(p => (
            <button key={p.id} onClick={()=>setSel(p.id)} style={{
              width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:10, border:"none", marginBottom:6, cursor:"pointer",
              background: sel===p.id ? C.violetLight : "transparent", color: sel===p.id ? C.violet : C.text, fontWeight: sel===p.id ? 700 : 500, fontSize:13 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                <span>{p.nombre}</span>
                {p.esPaciente
                  ? <span style={{ fontSize:10, fontWeight:700, color:"#065F46", background:"#D1FAE5", padding:"2px 6px", borderRadius:6, flexShrink:0 }}>Paciente</span>
                  : <span style={{ fontSize:10, fontWeight:700, color:"#92400E", background:"#FEF3C7", padding:"2px 6px", borderRadius:6, flexShrink:0 }}>Cliente</span>}
              </div>
              <div style={{ fontSize:11, color:C.muted }}>{p.tel}</div>
            </button>
          ))}
          {pac.length===0 && <div style={{ fontSize:13, color:"#94A3B8", padding:12 }}>Sin resultados</div>}
        </div>

        <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          {!pSel ? <div style={{ color:"#94A3B8", fontSize:13 }}>{isClinica ? "Seleccioná un paciente" : "Seleccioná un cliente"}</div> : (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"start", marginBottom:14, flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                    <span style={{ fontSize:18, fontWeight:800 }}>{pSel.nombre}</span>
                    {pSel.esPaciente
                      ? <span style={{ fontSize:11, fontWeight:700, color:"#065F46", background:"#D1FAE5", padding:"4px 8px", borderRadius:8 }}>Paciente</span>
                      : <span style={{ fontSize:11, fontWeight:700, color:"#92400E", background:"#FEF3C7", padding:"4px 8px", borderRadius:8 }}>Cliente</span>}
                  </div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>
                    <Phone size={12} style={{ display:"inline", verticalAlign:"middle" }}/> {pSel.tel} · {pSel.email || "—"} · DNI {pSel.dni || "—"}
                    {pSel.fechaNacimiento && <span> · Nac. {fmtDate(pSel.fechaNacimiento)}</span>}
                  </div>
                  {notas && <div style={{ fontSize:12, color:C.warning, marginTop:8, background:"#FFFBEB", padding:"8px 12px", borderRadius:8 }}>⚠ {notas}</div>}
                </div>
              </div>

              <TabBar tabs={isClinica
                ? [
                    { id:"crm", label:"Resumen clínico" },
                    { id:"evolucion", label:"Evolución" },
                    { id:"anamnesis", label:"Anamnesis" },
                    { id:"consent", label:"Consentimientos" },
                    { id:"fotos", label:"Fotos" },
                  ]
                : [
                    { id:"crm", label:"Ficha comercial" },
                    { id:"evolucion", label:"Historial / notas" },
                  ]} active={tab} onChange={setTab}/>

              {tab==="crm" && (
                <div style={{ marginTop:16 }}>
                  <p style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
                    {isClinica
                      ? "Alergias explícitas en la ficha; tratamientos y visitas incluyen lo deducido de la agenda (turnos) además de lo guardado en la ficha."
                      : "Datos de contacto, alergias relevantes para agenda, plan y visitas recientes."}
                  </p>
                  <div style={{ marginBottom:14 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>ALERGIAS</span>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
                      {(pSel.alergias || []).length === 0 ? <span style={{ fontSize:12, color:"#94A3B8" }}>Sin cargar (podés anotarlas en Anamnesis o al cerrar sesión con texto «alergias: …»)</span> :
                        pSel.alergias.map((a,i) => <Badge key={i} type="pendiente">{a}</Badge>)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>TRATAMIENTOS / PLAN</span>
                    <ul style={{ margin:"8px 0 0", paddingLeft:18, fontSize:13, color:C.text }}>
                      {(tratamientosResumen || []).length === 0 ? <li style={{ color:"#94A3B8" }}>Ninguno en ficha ni en turnos recientes</li> :
                        tratamientosResumen.map((t,i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                  <div style={{ marginTop:14 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>VISITAS RECIENTES</span>
                    <div style={{ marginTop:8, fontSize:12 }}>
                      {visitasResumen.slice().reverse().map(v => (
                        <div key={v.id} style={{ padding:"6px 0", borderBottom:`1px solid ${C.subtle}` }}>
                          {fmtDate(v.fecha)} — {v.motivo} · Prof. {(data.profesionales||[]).find(pr=>pr.id===v.profesionalId)?.nombre || "—"}
                        </div>
                      ))}
                      {visitasResumen.length === 0 && <span style={{ color:"#94A3B8" }}>Sin visitas en agenda vinculadas a esta ficha</span>}
                    </div>
                  </div>
                  <div style={{ marginTop:16 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>HISTORIAL DE ATENCIONES (TURNO + SERVICIO + EVOLUCIÓN)</span>
                    <div style={{ marginTop:8, fontSize:12 }}>
                      {atencionesTimeline.slice(0, 12).map(ev => (
                        <div key={ev.id} style={{ padding:"8px 0", borderBottom:`1px solid ${C.subtle}` }}>
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                            <span style={{ color:C.muted }}>{fmtDate(ev.fecha)}{ev.hora ? ` · ${ev.hora}` : ""}</span>
                            {ev.cat ? <Badge type={ev.cat === "turno" ? "gray" : ev.cat}>{tipoHistoriaLabel[ev.cat] || catLabel[ev.cat] || ev.cat}</Badge> : null}
                            {ev.estado ? <Badge type={ev.estado}>{estadoLabel[ev.estado] || ev.estado}</Badge> : null}
                          </div>
                          <div style={{ marginTop:4, fontWeight:600 }}>{ev.titulo || "Atención"}</div>
                          <div style={{ marginTop:2, color:C.muted }}>
                            {ev.detalle || "Sin detalle"}{ev.profesional ? ` · Prof. ${ev.profesional}` : ""}
                          </div>
                        </div>
                      ))}
                      {atencionesTimeline.length === 0 && <span style={{ color:"#94A3B8" }}>Sin historial aún para este cliente.</span>}
                    </div>
                  </div>
                </div>
              )}

              {tab==="evolucion" && (
                <div style={{ marginTop:16 }}>
                  <p style={{ fontSize:12, color:C.muted, marginBottom:12, lineHeight:1.5 }}>
                    Las <strong>evoluciones manuales</strong> son notas clínicas por sesión (texto libre). Pulsá «Nueva evolución», completá título y detalle y Guardar.
                    El <strong>historial de atenciones</strong> del resumen lista turnos y servicios de agenda; no sustituye una evolución escrita aquí.
                  </p>
                  <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
                    <Btn onClick={()=>setOpen(true)}><Plus size={14}/> Nueva evolución</Btn>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <THead cols={["Fecha","Tipo","Título","Profesional","Detalle",""]}/>
                      <tbody>
                        {hist.map(h => (
                          <tr key={h.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                            <td style={{ padding:"10px 12px", fontSize:12, color:C.muted }}>{fmtDate(h.fecha)}</td>
                            <td style={{ padding:"10px 12px" }}><Badge type="gray">{tipoHistoriaLabel[h.tipo]||h.tipo}</Badge></td>
                            <td style={{ padding:"10px 12px", fontWeight:600, fontSize:13 }}>{h.titulo}</td>
                            <td style={{ padding:"10px 12px", fontSize:12 }}>{h.profesional}</td>
                            <td style={{ padding:"10px 12px", fontSize:12, color:C.muted, maxWidth:220 }}>{h.detalle}</td>
                            <td style={{ padding:"10px 12px" }}>
                              {role !== "recepcionista" && <Btn variant="danger" sm onClick={() => void delH(h.id)}><Trash2 size={11}/></Btn>}
                            </td>
                          </tr>
                        ))}
                        {hist.length===0 && <tr><td colSpan={6} style={{ textAlign:"center", padding:"24px 0", color:"#94A3B8", fontSize:13 }}>Sin evoluciones</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {isClinica && tab==="anamnesis" && pSel && (
                <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  {["antecedentes","medicacion","fuma","embarazo","piel","observaciones"].map(key => (
                    <FG key={key} label={key.charAt(0).toUpperCase()+key.slice(1)} full={key==="antecedentes"||key==="observaciones"}>
                      <input style={inp} readOnly={!canEdit} value={(pSel.anamnesis || {})[key] || ""}
                        onChange={e => {
                          if (!canEdit) return
                          const next = { ...(pSel.anamnesis || {}), [key]: e.target.value }
                          patchPac(sel, p => ({ ...p, anamnesis: next }))
                          void persistAnamnesisCliente(next)
                        }}/>
                    </FG>
                  ))}
                  <p style={{ gridColumn:"1/-1", fontSize:11, color:C.muted }}>
                    Los datos se guardan en la columna <code style={{ fontSize:10 }}>clientes.anamnesis</code> (JSON) en Supabase al editar cada campo.
                    Firma digital / PDF en entorno productivo suele ir con auditoría aparte.
                  </p>
                </div>
              )}

              {isClinica && tab==="consent" && (
                <div style={{ marginTop:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12, flexWrap:"wrap", gap:8 }}>
                    <span style={{ fontSize:13, color:C.muted, lineHeight:1.45 }}>
                      {import.meta.env.VITE_SUPABASE_URL
                        ? "La plantilla es un texto legal reutilizable del catálogo; al registrar se guarda una copia con el nombre de la paciente, servicio/producto y fecha (auditoría por persona)."
                        : "Modo local: registro solo en la ficha (sin Supabase)."}
                    </span>
                    {puedeRegistrarConsent && <Btn sm onClick={()=>setOpenCons(true)}><Plus size={14}/> Nuevo consentimiento</Btn>}
                  </div>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <THead cols={["Documento","Fecha","Servicio / producto","Registrado por",""]}/>
                    <tbody>
                      {consentRowsSupa.map(c => {
                        const emp = c.firmadoPorEmpleadoId ? empByIdConsent[c.firmadoPorEmpleadoId] : null
                        const fecha = c.firmadoAt ? new Date(c.firmadoAt).toLocaleString("es-ES") : "—"
                        return (
                          <tr key={`supa-${c.id}`} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                            <td style={{ padding:"10px 12px", fontWeight:600 }}>{c.titulo}</td>
                            <td style={{ padding:"10px 12px", fontSize:12 }}>{fecha}</td>
                            <td style={{ padding:"10px 12px", fontSize:12 }}>{c.servicioOProducto || "—"}</td>
                            <td style={{ padding:"10px 12px", fontSize:12 }}>{emp?.nombre || "—"}</td>
                            <td style={{ padding:"10px 12px" }}>
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                                {c.contenidoHtml && <Btn sm variant="outline" onClick={()=>setPreviewConsent(c)}>Ver texto</Btn>}
                                {puedeRegistrarConsent && (
                                  <Btn sm variant="danger" onClick={() => void delConsentFirmado(c)} title="Eliminar registro"><Trash2 size={11}/></Btn>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {(pSel.consentimientos||[]).map(c => (
                        <tr key={`leg-${c.id}`} style={{ borderBottom:`1px solid ${C.subtle}`, opacity:0.92 }}>
                          <td style={{ padding:"10px 12px", fontWeight:600 }}>{c.titulo} <Badge type="gray">histórico</Badge></td>
                          <td style={{ padding:"10px 12px", fontSize:12 }}>{fmtDate(c.fecha)}</td>
                          <td style={{ padding:"10px 12px", fontSize:12 }}>—</td>
                          <td style={{ padding:"10px 12px", fontSize:12 }}>{c.firmadoPor||"—"}</td>
                          <td style={{ padding:"10px 12px" }}>
                            {canEdit && (
                              <Btn sm variant="danger" onClick={() => void delConsentLegacy(c)} title="Quitar de la ficha"><Trash2 size={11}/></Btn>
                            )}
                          </td>
                        </tr>
                      ))}
                      {consentRowsSupa.length === 0 && (!pSel.consentimientos || pSel.consentimientos.length === 0) && (
                        <tr><td colSpan={5} style={{ textAlign:"center", padding:20, color:"#94A3B8" }}>Sin consentimientos registrados.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {isClinica && tab==="fotos" && (
                <div style={{ marginTop:16 }}>
                  {canEdit && (
                    <div style={{ marginBottom:14 }}>
                      <Btn sm onClick={() => { setFormFoto({ tipo:"antes", url:"", nota:"", angulo:"" }); setOpenFoto(true) }}><Camera size={14}/> Cargar foto</Btn>
                    </div>
                  )}
                  {(!pSel.fotos || pSel.fotos.length===0) ? (
                    <div style={{ textAlign:"center", padding:"32px 0", color:"#94A3B8", fontSize:13 }}>Sin fotos cargadas</div>
                  ) : (() => {
                    const fotos = pSel.fotos || []
                    const antes = fotos.filter(f => f.tipo === "antes")
                    const despues = fotos.filter(f => f.tipo === "despues" || f.tipo === "después")
                    const planMarcados = fotos.filter(f => f.tipo === "plan_marcado")
                    const otros = fotos.filter(f => f.tipo !== "antes" && f.tipo !== "despues" && f.tipo !== "después" && f.tipo !== "plan_marcado")
                    const angOrder = ["frente", "perfil_derecho", "perfil_izquierdo"]
                    const angLabel = { frente: "Frente", perfil_derecho: "Perfil der.", perfil_izquierdo: "Perfil izq." }
                    const tieneAngulo = antes.some(f => f.angulo) || despues.some(f => f.angulo)
                    const comparativaRows = tieneAngulo
                      ? angOrder.map(ang => ({
                          key: ang,
                          angLabel: angLabel[ang] || ang,
                          a: antes.find(f => f.angulo === ang),
                          d: despues.find(f => f.angulo === ang),
                        }))
                      : Array.from({ length: Math.max(antes.length, despues.length) }).map((_, i) => ({
                          key: `idx-${i}`,
                          angLabel: null,
                          a: antes[i],
                          d: despues[i],
                        }))
                    const maxPairs = comparativaRows.length
                    return (
                      <div>
                        {maxPairs > 0 && (
                          <div style={{ marginBottom:18 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:".5px" }}>Comparativa antes / después</div>
                            <div style={{ display:"grid", gridTemplateColumns: compactLayout ? "1fr" : "repeat(auto-fill, minmax(360px, 1fr))", gap:16 }}>
                              {comparativaRows.map(({ key, angLabel: angL, a, d }) => (
                                  <div key={key} style={{ border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
                                    {angL && (
                                      <div style={{ padding:"6px 12px", fontSize:11, fontWeight:800, color:C.muted, background:C.card, borderBottom:`1px solid ${C.subtle}` }}>{angL}</div>
                                    )}
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
                                      <div style={{ position:"relative", background:"#f1f5f9" }}>
                                        {a ? (
                                          <>
                                            <img src={a.url} alt="Antes" style={{ width:"100%", height:160, objectFit:"cover" }}/>
                                            <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"4px 8px", background:"rgba(0,0,0,.55)", fontSize:11, color:"#fff", fontWeight:700 }}>Antes · {fmtDate(a.fecha)}</div>
                                          </>
                                        ) : (
                                          <div style={{ height:160, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.muted }}>Sin foto antes</div>
                                        )}
                                      </div>
                                      <div style={{ position:"relative", background:"#f0fdf4", borderLeft:`1px solid ${C.border}` }}>
                                        {d ? (
                                          <>
                                            <img src={d.url} alt="Después" style={{ width:"100%", height:160, objectFit:"cover" }}/>
                                            <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"4px 8px", background:"rgba(0,0,0,.55)", fontSize:11, color:"#fff", fontWeight:700 }}>Después · {fmtDate(d.fecha)}</div>
                                          </>
                                        ) : (
                                          <div style={{
                                            height:160,
                                            display:"flex",
                                            flexDirection:"column",
                                            alignItems:"center",
                                            justifyContent:"center",
                                            gap:10,
                                            padding:12,
                                            fontSize:11,
                                            color:C.muted,
                                            textAlign:"center",
                                          }}>
                                            <span>Sin foto después</span>
                                            {canEdit && (
                                              <Btn
                                                type="button"
                                                sm
                                                onClick={() => {
                                                  const ang = angL ? String(key) : ""
                                                  setFormFoto({ tipo:"despues", url:"", nota:"", angulo: ang && !ang.startsWith("idx-") ? ang : "" })
                                                  setOpenFoto(true)
                                                }}
                                              >
                                                <Camera size={12}/> Subir o tomar
                                              </Btn>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ padding:"8px 12px", display:"flex", gap:8, justifyContent:"flex-end", background:C.card }}>
                                      {a && canEdit && <Btn variant="danger" sm onClick={()=>delFoto(a.id)}><Trash2 size={11}/> Antes</Btn>}
                                      {d && canEdit && <Btn variant="danger" sm onClick={()=>delFoto(d.id)}><Trash2 size={11}/> Después</Btn>}
                                    </div>
                                    {(a?.nota||d?.nota) && (
                                      <div style={{ padding:"6px 12px", fontSize:11, color:C.muted, borderTop:`1px solid ${C.subtle}` }}>
                                        {a?.nota && <span>Antes: {a.nota} </span>}
                                        {d?.nota && <span>Después: {d.nota}</span>}
                                      </div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                        {planMarcados.length > 0 && (
                          <div style={{ marginBottom:18 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:".5px" }}>Plan marcado (sesión médica)</div>
                            <p style={{ fontSize:12, color:C.muted, marginBottom:12, lineHeight:1.45 }}>
                              Fotos con trazos sobre la vista de frente: lo que se acordó o se va a realizar, guardado desde el área médica.
                            </p>
                            <div style={{ display:"grid", gridTemplateColumns: compactLayout ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap:16 }}>
                              {planMarcados.map(f => (
                                <div key={f.id} style={{ border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", background:C.card }}>
                                  <div style={{ position:"relative", background:"#0f172a", minHeight:120 }}>
                                    <img src={f.url} alt="" style={{ width:"100%", maxHeight:280, objectFit:"contain", display:"block" }}/>
                                  </div>
                                  <div style={{ padding:"10px 12px" }}>
                                    <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>
                                      <Badge type="facial">plan marcado</Badge>
                                      {f.angulo && <span style={{ marginLeft:8 }}>{f.angulo === "frente" ? "Frente" : f.angulo}</span>}
                                      {" · "}{fmtDate(f.fecha)}
                                      {f.turnoId != null && <span style={{ marginLeft:6 }}>· Turno #{f.turnoId}</span>}
                                    </div>
                                    {f.nota && <div style={{ fontSize:13, color:C.text, lineHeight:1.45, marginBottom:6 }}>{f.nota}</div>}
                                    {f.protocoloSnapshot && (
                                      <div style={{ fontSize:11, color:C.muted, lineHeight:1.4, padding:8, background:C.subtle, borderRadius:8 }}>
                                        <strong>Protocolo (referencia):</strong> {f.protocoloSnapshot}
                                      </div>
                                    )}
                                    {canEdit && (
                                      <div style={{ marginTop:8 }}>
                                        <Btn variant="danger" sm onClick={()=>delFoto(f.id)}><Trash2 size={11}/> Quitar</Btn>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {otros.length > 0 && (
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:10, textTransform:"uppercase", letterSpacing:".5px" }}>Otras fotos (durante / seguimiento)</div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:14 }}>
                              {otros.map(f => (
                                <div key={f.id} style={{ textAlign:"center", width:160 }}>
                                  <img src={f.url} alt="" style={{ width:160, height:120, objectFit:"cover", borderRadius:10, border:`1px solid ${C.border}` }}/>
                                  <div style={{ fontSize:11, marginTop:5 }}><Badge type="gray">{f.tipo}</Badge> {fmtDate(f.fecha)}</div>
                                  {f.nota && <div style={{ fontSize:11, color:C.muted, marginTop:3, wordBreak:"break-word" }}>{f.nota}</div>}
                                  {canEdit && <div style={{ marginTop:5 }}><Btn variant="danger" sm onClick={()=>delFoto(f.id)}><Trash2 size={11}/></Btn></div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={open} onClose={()=>setOpen(false)} title="Nueva evolución / sesión"
        footer={<><Btn variant="outline" onClick={()=>setOpen(false)}>Cancelar</Btn><Btn onClick={() => void addEv()}>Guardar</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <FG label="Fecha"><input type="date" style={inp} value={form.fecha} onChange={e=>u("fecha",e.target.value)}/></FG>
          <FG label="Tipo">
            <select style={inp} value={form.tipo} onChange={e=>u("tipo",e.target.value)}>
              {Object.entries(tipoHistoriaLabel).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FG>
          <FG label="Título" full><input style={inp} value={form.titulo} onChange={e=>u("titulo",e.target.value)} placeholder="Ej: Sesión 4 láser"/></FG>
          <FG label="Detalle" full><textarea style={{ ...inp, minHeight:80, resize:"vertical" }} value={form.detalle} onChange={e=>u("detalle",e.target.value)} placeholder="Evolución clínica por sesión…"/></FG>
        </div>
      </Modal>

      <Modal open={openCons} onClose={()=>setOpenCons(false)} title="Nuevo consentimiento informado"
        footer={<><Btn variant="outline" onClick={()=>setOpenCons(false)}>Cancelar</Btn><Btn onClick={()=>void saveCons()}>Generar y registrar</Btn></>}>
        <div style={{ maxHeight: "min(82vh, 680px)", overflowY: "auto", paddingRight: 4 }}>
          <FG label="Plantilla" full>
            <select
              style={inp}
              value={formCons.plantillaSlug}
              onChange={e=>setFormCons(f=>({ ...f, plantillaSlug:e.target.value }))}
            >
              <option value="">Seleccionar…</option>
              {plantillasConsent.map(p => (
                <option key={p.slug} value={p.slug}>{etiquetaPlantillaConsent(p)}</option>
              ))}
            </select>
          </FG>
          <ConsentPlantillaDocxLink plantilla={plantillasConsent.find(p => p.slug === formCons.plantillaSlug)} C={C} />
          <FG label="Servicio o producto a aplicar" full>
            <input
              style={inp}
              value={formCons.servicioProducto}
              onChange={e=>setFormCons(f=>({ ...f, servicioProducto:e.target.value }))}
              placeholder="Ej: Toxina botulínica — glabella / Ácido hialurónico labios"
            />
          </FG>
          <ConsentimientoLecturaPanel
            html={consentPreviewOpenCons}
            C={C}
            subtitle="Datos de la paciente y texto legal. Mostrale esta pantalla antes de confirmar."
          />
          <p style={{ fontSize:11, color:C.muted, marginTop:12, lineHeight:1.5 }}>
            Si hay enlace <strong>Word oficial</strong> arriba, usalo para imprimir el modelo de la clínica. El registro en el ERP guarda además el texto con datos y la firma/PDF cuando corresponda.
          </p>
        </div>
      </Modal>
      <Modal open={!!previewConsent} onClose={()=>setPreviewConsent(null)} title={previewConsent?.pdfStoragePath ? "PDF — " + (previewConsent?.titulo || "Consentimiento") : previewConsent?.titulo || "Consentimiento"}
        footer={<Btn variant="outline" onClick={()=>setPreviewConsent(null)}>Cerrar</Btn>}>
        <div style={{ maxHeight: "min(78vh, 720px)", overflowY: "auto" }}>
          {previewConsent?.pdfStoragePath ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: C.text }}>PDF generado al firmar (no es el .docx)</div>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.45, margin: "0 0 10px" }}>
                Archivo creado por la app con texto + firmas. No es el Word original; el texto legal es el de la plantilla en Supabase.
              </p>
              <Btn sm style={{ marginBottom: 10 }} onClick={() => window.open(previewConsent.pdfStoragePath, "_blank", "noopener,noreferrer")}>Abrir PDF en nueva pestaña</Btn>
              <object data={previewConsent.pdfStoragePath} type="application/pdf" style={{ width: "100%", minHeight: "min(48vh, 420px)", border: `1px solid ${C.border}`, borderRadius: 10, background: "#e2e8f0" }}>
                <p style={{ padding: 12 }}><a href={previewConsent.pdfStoragePath} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: C.violet }}>Abrir PDF</a></p>
              </object>
            </div>
          ) : previewConsent?.contenidoHtml ? (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "#fffbeb", border: "1px solid #fcd34d", fontSize: 12, color: "#78350f" }}>
              <strong>Sin PDF archivado</strong> — solo texto en el sistema (no es tu .docx).{" "}
              <button type="button" style={{ fontWeight: 700, color: C.violet, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                onClick={() =>
                  void downloadPdfFromArchivedHtml({
                    titulo: previewConsent.titulo,
                    contenidoHtml: previewConsent.contenidoHtml,
                    filenameBase: `consentimiento-${previewConsent.id}`,
                  })
                }>
                Descargar PDF de respaldo (texto del sistema, no Word)
              </button>
            </div>
          ) : null}
          <details open={!previewConsent?.pdfStoragePath}>
            <summary style={{ fontSize: 12, fontWeight: 600, cursor: "pointer", color: C.muted, marginBottom: 8 }}>Vista HTML</summary>
            {previewConsent?.contenidoHtml ? (
              <div style={{ fontSize: 13, lineHeight: 1.55, maxHeight: "40vh", overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: previewConsent.contenidoHtml }} />
            ) : null}
          </details>
        </div>
      </Modal>
      <Modal open={openFoto} onClose={()=>setOpenFoto(false)} title="Agregar foto de paciente"
        footer={<><Btn variant="outline" onClick={()=>setOpenFoto(false)}>Cancelar</Btn><Btn onClick={() => void saveFoto()} disabled={!String(formFoto.url || "").trim()}>Guardar foto</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <FG label="Tipo">
            <select style={inp} value={formFoto.tipo} onChange={e=>setFormFoto(f=>({ ...f, tipo:e.target.value }))}>
              <option value="antes">Antes</option>
              <option value="durante">Durante</option>
              <option value="despues">Después</option>
              <option value="seguimiento">Seguimiento</option>
            </select>
          </FG>
          {(formFoto.tipo === "antes" || formFoto.tipo === "despues") && (
            <FG label="Ángulo (comparativa)">
              <select style={inp} value={formFoto.angulo || ""} onChange={e=>setFormFoto(f=>({ ...f, angulo:e.target.value }))}>
                <option value="">— Sin ángulo / pareja por orden —</option>
                <option value="frente">Frente</option>
                <option value="perfil_derecho">Perfil derecho</option>
                <option value="perfil_izquierdo">Perfil izquierdo</option>
              </select>
            </FG>
          )}
          <FG label="Desde dispositivo" full>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:8 }}>
              <Btn type="button" variant="outline" sm onClick={() => fotoPacienteFileRef.current?.click()}>Elegir archivo</Btn>
              <Btn type="button" sm onClick={() => fotoPacienteCamRef.current?.click()}><Camera size={14}/> Tomar foto</Btn>
            </div>
            <input ref={fotoPacienteFileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { loadFotoFile(e.target.files?.[0]); e.target.value = "" }} />
            <input ref={fotoPacienteCamRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e => { loadFotoFile(e.target.files?.[0]); e.target.value = "" }} />
          </FG>
          <FG label="URL / pegar imagen (opcional)" full>
            <input style={inp} value={formFoto.url} onChange={e=>setFormFoto(f=>({ ...f, url:e.target.value }))} placeholder="https://... o data:image/..."/>
          </FG>
          <FG label="Nota" full>
            <input style={inp} value={formFoto.nota} onChange={e=>setFormFoto(f=>({ ...f, nota:e.target.value }))} placeholder="Ej. Control semana 4"/>
          </FG>
          {!!formFoto.url && <img src={formFoto.url} alt="preview" style={{ width:180, height:130, objectFit:"cover", borderRadius:10, border:`1px solid ${C.border}` }}/>}
        </div>
      </Modal>
      <Modal open={openCliente} onClose={()=>setOpenCliente(false)} title="Nuevo cliente"
        footer={<><Btn variant="outline" onClick={()=>setOpenCliente(false)}>Cancelar</Btn><Btn onClick={saveCliente}>Crear cliente</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <FG label="Nombre y apellido" full>
            <input style={inp} value={formCliente.nombre} onChange={e=>setFormCliente(f => ({ ...f, nombre:e.target.value }))} placeholder="Ej: Ana Pérez"/>
          </FG>
          <FG label="Teléfono">
            <input style={inp} value={formCliente.tel} onChange={e=>setFormCliente(f => ({ ...f, tel:e.target.value }))} placeholder="+54..."/>
          </FG>
          <FG label="Email">
            <input style={inp} value={formCliente.email} onChange={e=>setFormCliente(f => ({ ...f, email:e.target.value }))} placeholder="cliente@email.com"/>
          </FG>
          <FG label="DNI">
            <input style={inp} value={formCliente.dni} onChange={e=>setFormCliente(f => ({ ...f, dni:e.target.value }))} placeholder="12345678"/>
          </FG>
        </div>
      </Modal>
    </div>
  )
}

// ─── SECTION: EMPLEADOS & TURNOS LABORALES ─────────────────────
function PersonalTurnos({ data, setData, role }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const [tab, setTab] = useState("empleados")
  const [openE, setOpenE] = useState(false)
  const [openT, setOpenT] = useState(false)
  const [openFicha, setOpenFicha] = useState(false)
  const [selEmp, setSelEmp] = useState(null)
  const [histForm, setHistForm] = useState({ titulo:"", detalle:"" })
  const [formE, setFormE] = useState({ nombre:"", cargo:"recepcionista", tel:"", email:"", activo:true })
  const [formT, setFormT] = useState({ empleadoId:"", diaSemana:1, entrada:"09:00", salida:"18:00" })
  const [empCamOpen, setEmpCamOpen] = useState(false)
  const [empCamErr, setEmpCamErr] = useState("")
  const empCamVideoRef = useRef(null)
  const empCamStreamRef = useRef(null)
  const ue = (k,v) => setFormE(f => ({ ...f, [k]:v }))
  const ut = (k,v) => setFormT(f => ({ ...f, [k]:v }))
  const readOnly = role !== "gerente"
  const hydratedFromDbRef = useRef(false)
  const TEAM_STORAGE_BY_NAME = {
    felipe: "https://heybobhlhjidrptgbklk.supabase.co/storage/v1/object/public/erp-media/empleados/c9ab5394-b788-486b-9857-5e20a9f9e58e/1775562186540-p19bxmc.jpg",
    betty: "https://heybobhlhjidrptgbklk.supabase.co/storage/v1/object/public/erp-media/empleados/c9ab5394-b788-486b-9857-5e20a9f9e58e/1775562367898-7giux3b.jpg",
    viviana: "https://heybobhlhjidrptgbklk.supabase.co/storage/v1/object/public/erp-media/empleados/c9ab5394-b788-486b-9857-5e20a9f9e58e/1775562380863-dccdi32.jpg",
    yadira: "https://heybobhlhjidrptgbklk.supabase.co/storage/v1/object/public/erp-media/empleados/c9ab5394-b788-486b-9857-5e20a9f9e58e/1775562392846-svf0h4f.jpg",
    yesenia: "https://heybobhlhjidrptgbklk.supabase.co/storage/v1/object/public/erp-media/empleados/c9ab5394-b788-486b-9857-5e20a9f9e58e/1775562403738-q48sm4k.jpg",
    natalia: "https://heybobhlhjidrptgbklk.supabase.co/storage/v1/object/public/erp-media/empleados/c9ab5394-b788-486b-9857-5e20a9f9e58e/1775562439125-998ac0d.jpg",
    yohana: "https://heybobhlhjidrptgbklk.supabase.co/storage/v1/object/public/erp-media/empleados/c9ab5394-b788-486b-9857-5e20a9f9e58e/1775563369084-06njvwz.jpg",
  }
  const TEAM_ALIASES = {
    felipe: ["felipe", "dr felipe", "doctor felipe"],
    betty: ["betty", "dra betty", "doctora betty"],
    viviana: ["viviana"],
    yadira: ["yadira"],
    yesenia: ["yesenia"],
    natalia: ["natalia"],
    yohana: ["yohana"],
  }
  const normTxt = t => String(t || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
  const teamPhotoFromName = (nombre, email = "") => {
    const n = normTxt(nombre)
    const em = normTxt(email)
    if (TEAM_STORAGE_BY_NAME[n]) return TEAM_STORAGE_BY_NAME[n]
    const byAlias = Object.entries(TEAM_ALIASES).find(([, aliases]) => aliases.some(a => n.includes(a)))
    if (byAlias?.[0] && TEAM_STORAGE_BY_NAME[byAlias[0]]) return TEAM_STORAGE_BY_NAME[byAlias[0]]
    const byEmail = Object.keys(TEAM_STORAGE_BY_NAME).find(k => em.includes(`${k}@`) || em.startsWith(`${k}.`) || em.startsWith(`${k}_`))
    if (byEmail) return TEAM_STORAGE_BY_NAME[byEmail]
    const hit = Object.entries(TEAM_STORAGE_BY_NAME).find(([k]) => n.includes(k))
    return hit?.[1] || ""
  }
  const empPhotoSrc = e => {
    const stored = String(e?.fotoUrl || "").trim()
    return stored || teamPhotoFromName(e?.nombre, e?.email) || "https://placehold.co/80x80/e2e8f0/64748b?text=Foto"
  }

  useEffect(() => {
    if (hydratedFromDbRef.current) return
    if (!import.meta.env.VITE_SUPABASE_URL) return
    if (Array.isArray(data.empleados) && data.empleados.length > 0) {
      hydratedFromDbRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token || cancelled) return
      const { data: emps, error } = await supabase
        .from("empleados")
        .select("id, clinic_id, nombre, email, tel, rol, activo, especialidad, comision_pct, color, foto_url, documento, fecha_nacimiento, direccion, fecha_ingreso, contacto_emergencia, tel_emergencia, notas, historial")
        .order("id")
      if (cancelled || error || !Array.isArray(emps)) return
      hydratedFromDbRef.current = true
      setData(d => ({
        ...d,
        empleados: emps.map(e => ({
          id: e.id,
          clinicId: e.clinic_id,
          nombre: e.nombre || "",
          email: e.email || "",
          tel: e.tel || "",
          cargo: normalizeRol(e.rol) || "recepcionista",
          activo: e.activo !== false,
          especialidad: e.especialidad || "",
          comision: e.comision_pct == null ? 0 : (+e.comision_pct || 0),
          color: e.color || C.violet,
          fotoUrl: e.foto_url || "",
          documento: e.documento || "",
          fechaNacimiento: e.fecha_nacimiento || "",
          direccion: e.direccion || "",
          fechaIngreso: e.fecha_ingreso || "",
          contactoEmergencia: e.contacto_emergencia || "",
          telEmergencia: e.tel_emergencia || "",
          notas: e.notas || "",
          historial: Array.isArray(e.historial) ? e.historial : [],
        })),
      }))
    })()
    return () => { cancelled = true }
  }, [data.empleados, setData])

  const saveE = () => {
    if (!formE.nombre.trim()) return
    const id = data.empleados.length ? Math.max(...data.empleados.map(e => e.id)) + 1 : 1
    setData(d => ({ ...d, empleados: [...d.empleados, { ...formE, id, fotoUrl:"", documento:"", fechaNacimiento:"", direccion:"", fechaIngreso:TODAY, contactoEmergencia:"", telEmergencia:"", notas:"", historial:[] }] }))
    setOpenE(false)
    setFormE({ nombre:"", cargo:"recepcionista", tel:"", email:"", activo:true })
  }
  const delE = id => setData(d => ({ ...d, empleados: d.empleados.filter(e => e.id !== id), turnosLaborales: d.turnosLaborales.filter(t => t.empleadoId !== id) }))
  const saveT = () => {
    if (!formT.empleadoId) return
    const id = data.turnosLaborales.length ? Math.max(...data.turnosLaborales.map(t => t.id)) + 1 : 1
    setData(d => ({ ...d, turnosLaborales: [...d.turnosLaborales, { ...formT, empleadoId:+formT.empleadoId, id, diaSemana:+formT.diaSemana }] }))
    setOpenT(false)
    setFormT({ empleadoId:"", diaSemana:1, entrada:"09:00", salida:"18:00" })
  }
  const delT = id => setData(d => ({ ...d, turnosLaborales: d.turnosLaborales.filter(t => t.id !== id) }))
  const patchEmp = (id, patcher) => setData(d => ({ ...d, empleados: d.empleados.map(e => e.id === id ? patcher(e) : e) }))
  const openFichaEmp = e => { setSelEmp(e); setOpenFicha(true) }
  const syncSelEmp = (id, patcher) => {
    patchEmp(id, patcher)
    setSelEmp(prev => (prev && prev.id === id ? patcher(prev) : prev))
  }
  const saveFichaEmp = async () => {
    if (!selEmp || !import.meta.env.VITE_SUPABASE_URL) return
    const payload = {
      foto_url: String(selEmp.fotoUrl || ""),
      documento: String(selEmp.documento || ""),
      fecha_nacimiento: selEmp.fechaNacimiento || null,
      direccion: String(selEmp.direccion || ""),
      fecha_ingreso: selEmp.fechaIngreso || null,
      contacto_emergencia: String(selEmp.contactoEmergencia || ""),
      tel_emergencia: String(selEmp.telEmergencia || ""),
      notas: String(selEmp.notas || ""),
      historial: Array.isArray(selEmp.historial) ? selEmp.historial : [],
    }
    const { error } = await supabase.from("empleados").update(payload).eq("id", selEmp.id)
    if (error) {
      alert(error.message || "No se pudo guardar la ficha del empleado.")
      return
    }
    alert("Ficha de empleado guardada.")
  }
  const addEmpHist = () => {
    if (!selEmp || !histForm.titulo.trim()) return
    syncSelEmp(selEmp.id, e => {
      const list = e.historial || []
      const nid = list.length ? Math.max(...list.map(x => x.id || 0)) + 1 : 1
      return { ...e, historial:[...list, { id:nid, fecha:TODAY, titulo:histForm.titulo.trim(), detalle:histForm.detalle.trim(), autor: role }] }
    })
    setHistForm({ titulo:"", detalle:"" })
  }
  const loadEmpPhotoFile = async file => {
    if (!file || !selEmp) return
    let finalUrl = ""
    try {
      const compressed = await compressImageFileToDataUrl(file)
      if (!compressed) throw new Error("No se pudo procesar la imagen.")
      finalUrl = await uploadImageDataUrl(compressed, "empleados")
    } catch (e) {
      alert(String(e?.message || e))
      return
    }
    const prevUrl = selEmp.fotoUrl || ""
    syncSelEmp(selEmp.id, e => ({ ...e, fotoUrl: finalUrl }))
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("empleados").update({ foto_url: finalUrl }).eq("id", selEmp.id)
      if (error) alert(error.message || "No se pudo guardar la foto.")
    }
    try {
      await deleteStorageImageByUrl(prevUrl)
    } catch {
      // No interrumpe el flujo si la foto anterior ya no existe.
    }
  }

  const stopEmpCamera = useCallback(() => {
    const stream = empCamStreamRef.current
    if (stream) {
      for (const t of stream.getTracks()) t.stop()
    }
    empCamStreamRef.current = null
    const v = empCamVideoRef.current
    if (v) v.srcObject = null
  }, [])

  const startEmpCamera = useCallback(async () => {
    setEmpCamErr("")
    try {
      const stream = await getUserMediaCompat({ video: { facingMode: "user" }, audio: false })
      empCamStreamRef.current = stream
      setEmpCamOpen(true)
      setTimeout(() => {
        const v = empCamVideoRef.current
        if (v) {
          v.srcObject = stream
          void v.play().catch(() => {})
        }
      }, 0)
    } catch (e) {
      setEmpCamErr(String(e?.message || e))
      alert(`No se pudo abrir la cámara.${mediaInsecureContextHint()}`)
    }
  }, [])

  const takeEmpCameraPhoto = async () => {
    if (!selEmp) return
    const v = empCamVideoRef.current
    if (!v) return
    const w = v.videoWidth || 1280
    const h = v.videoHeight || 720
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(v, 0, 0, w, h)
    let finalUrl = ""
    try {
      finalUrl = await uploadImageDataUrl(canvas.toDataURL("image/jpeg", 0.86), "empleados")
    } catch (e) {
      alert(String(e?.message || e))
      return
    }
    const prevUrl = selEmp.fotoUrl || ""
    syncSelEmp(selEmp.id, e => ({ ...e, fotoUrl: finalUrl }))
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("empleados").update({ foto_url: finalUrl }).eq("id", selEmp.id)
      if (error) alert(error.message || "No se pudo guardar la foto.")
    }
    try {
      await deleteStorageImageByUrl(prevUrl)
    } catch {
      // Ignorar si la foto anterior no existe.
    }
    stopEmpCamera()
    setEmpCamOpen(false)
  }

  useEffect(() => () => stopEmpCamera(), [stopEmpCamera])

  const byEmp = useMemo(() => {
    const m = {}
    data.turnosLaborales.forEach(t => {
      if (!m[t.empleadoId]) m[t.empleadoId] = []
      m[t.empleadoId].push(t)
    })
    return m
  }, [data.turnosLaborales])

  return (
    <div>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontSize:20, fontWeight:700 }}>Personal y turnos de trabajo</h2>
        <p style={{ fontSize:13, color:C.muted, marginTop:2 }}>
          {readOnly ? "Solo el perfil gerente puede editar esta sección." : "Alta de empleados y franjas horarias semanales."}
        </p>
      </div>
      <TabBar tabs={[{ id:"empleados", label:"Empleados" }, { id:"turnos", label:"Turnos laborales" }]} active={tab} onChange={setTab}/>

      {tab==="empleados" && (
        <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16, gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:14, fontWeight:700 }}>Equipo</span>
            {!readOnly && <Btn onClick={()=>setOpenE(true)} style={{ width: compact ? "100%" : "auto", justifyContent:"center" }}><Plus size={14}/> Nuevo empleado</Btn>}
          </div>
          <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth: compact ? 740 : undefined }}>
              <THead cols={["Nombre","Rol","Contacto","Estado",""]}/>
              <tbody>
                {data.empleados.map(e => (
                  <tr key={e.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                    <td style={{ padding:"11px 14px", fontWeight:600, minWidth:160 }}>
                      <button type="button" onClick={()=>openFichaEmp(e)} style={{ background:"none", border:"none", padding:0, color:C.violet, cursor:"pointer", fontWeight:700, textAlign:"left" }}>
                        {e.nombre}
                      </button>
                    </td>
                    <td style={{ padding:"11px 14px", minWidth:120 }}><Badge type="gray">{[ROLE_LABEL[e.cargo] || e.cargo, String(e.especialidad || "").trim()].filter(Boolean).join(" — ")}</Badge></td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:C.muted, minWidth:230 }}>{e.tel} · {e.email}</td>
                    <td style={{ padding:"11px 14px", minWidth:100 }}><Badge type={e.activo ? "confirmado" : "cancelado"}>{e.activo ? "Activo" : "Baja"}</Badge></td>
                    <td style={{ padding:"11px 14px", minWidth:70 }}>
                      {!readOnly && <Btn variant="danger" sm onClick={()=>delE(e.id)}><Trash2 size={11}/></Btn>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="turnos" && (
        <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
            <span style={{ fontSize:14, fontWeight:700 }}>Franjas por empleado</span>
            {!readOnly && <Btn onClick={()=>setOpenT(true)}><Plus size={14}/> Asignar turno</Btn>}
          </div>
          {data.empleados.map(e => (
            <div key={e.id} style={{ marginBottom:18, paddingBottom:18, borderBottom:`1px solid ${C.subtle}` }}>
              <div style={{ fontWeight:700, marginBottom:8 }}>{e.nombre}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {(byEmp[e.id]||[]).sort((a,b)=>a.diaSemana-b.diaSemana).map(t => (
                  <span key={t.id} style={{ background:C.subtle, padding:"6px 12px", borderRadius:8, fontSize:12, display:"inline-flex", alignItems:"center", gap:8 }}>
                    {DIA_SEMANA[t.diaSemana]} · {t.entrada}–{t.salida}
                    {!readOnly && <button type="button" onClick={()=>delT(t.id)} style={{ border:"none", background:"transparent", cursor:"pointer", color:C.danger }}><X size={12}/></button>}
                  </span>
                ))}
                {(!byEmp[e.id] || byEmp[e.id].length===0) && <span style={{ fontSize:12, color:"#94A3B8" }}>Sin franjas cargadas</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={openE} onClose={()=>setOpenE(false)} title="Nuevo empleado"
        footer={<><Btn variant="outline" onClick={()=>setOpenE(false)}>Cancelar</Btn><Btn onClick={saveE}>Guardar</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <FG label="Nombre" full><input style={inp} value={formE.nombre} onChange={e=>ue("nombre",e.target.value)}/></FG>
          <FG label="Rol en clínica">
            <select style={inp} value={formE.cargo} onChange={e=>ue("cargo",e.target.value)}>
              <option value="recepcionista">Recepcionista</option>
              <option value="especialista">Especialista</option>
              <option value="encargado">Encargado/a (admin. clínica / contable)</option>
              <option value="gerente">Gerente</option>
            </select>
          </FG>
          <FG label="Teléfono"><input style={inp} value={formE.tel} onChange={e=>ue("tel",e.target.value)}/></FG>
          <FG label="Email"><input style={inp} value={formE.email} onChange={e=>ue("email",e.target.value)}/></FG>
        </div>
      </Modal>

      <Modal open={openT} onClose={()=>setOpenT(false)} title="Turno laboral"
        footer={<><Btn variant="outline" onClick={()=>setOpenT(false)}>Cancelar</Btn><Btn onClick={saveT}>Guardar</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <FG label="Empleado" full>
            <select style={inp} value={formT.empleadoId} onChange={e=>ut("empleadoId",e.target.value)}>
              <option value="">Seleccionar…</option>
              {data.empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </FG>
          <FG label="Día">
            <select style={inp} value={formT.diaSemana} onChange={e=>ut("diaSemana",e.target.value)}>
              {[1,2,3,4,5,6,0].map(d => <option key={d} value={d}>{DIA_SEMANA[d]}</option>)}
            </select>
          </FG>
          <FG label="Entrada"><input type="time" style={inp} value={formT.entrada} onChange={e=>ut("entrada",e.target.value)}/></FG>
          <FG label="Salida"><input type="time" style={inp} value={formT.salida} onChange={e=>ut("salida",e.target.value)}/></FG>
        </div>
      </Modal>
      <Modal open={openFicha} onClose={()=>setOpenFicha(false)} title={selEmp ? `Ficha empleado · ${selEmp.nombre}` : "Ficha empleado"}
        footer={<>
          {!readOnly && <Btn onClick={() => void saveFichaEmp()}>Guardar cambios</Btn>}
          <Btn variant="outline" onClick={()=>setOpenFicha(false)}>Cerrar</Btn>
        </>}>
        {selEmp && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <FG label="Foto">
              <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                <img src={empPhotoSrc(selEmp)} alt="" style={{ width:80, height:80, objectFit:"cover", borderRadius:10, border:`1px solid ${C.border}` }}/>
                {!readOnly && (
                  <>
                    <input type="file" accept="image/*" capture="user" onChange={e=>loadEmpPhotoFile(e.target.files?.[0])}/>
                    <Btn variant="outline" sm onClick={startEmpCamera}><Camera size={12}/>Tomar foto</Btn>
                    {!String(selEmp.fotoUrl || "").trim() && !!teamPhotoFromName(selEmp.nombre, selEmp.email) && (
                      <Btn
                        variant="outline"
                        sm
                        onClick={async () => {
                          try {
                            const finalUrl = teamPhotoFromName(selEmp.nombre, selEmp.email)
                            syncSelEmp(selEmp.id, x => ({ ...x, fotoUrl: finalUrl }))
                            if (import.meta.env.VITE_SUPABASE_URL) {
                              const { error } = await supabase.from("empleados").update({ foto_url: finalUrl }).eq("id", selEmp.id)
                              if (error) throw new Error(error.message || "No se pudo guardar la foto en BD.")
                            }
                          } catch (e) {
                            alert(String(e?.message || e))
                          }
                        }}
                      >
                        Usar foto de team
                      </Btn>
                    )}
                  </>
                )}
                {!readOnly && empCamOpen && (
                  <div style={{ width:"100%", marginTop:8, border:`1px solid ${C.border}`, borderRadius:10, padding:8, background:C.subtle }}>
                    <video ref={empCamVideoRef} autoPlay playsInline muted style={{ width:"100%", maxWidth:320, borderRadius:8, background:"#000" }} />
                    {empCamErr && <div style={{ fontSize:12, color:C.danger, marginTop:6 }}>{empCamErr}</div>}
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <Btn sm onClick={takeEmpCameraPhoto}><Camera size={12}/>Capturar</Btn>
                      <Btn variant="outline" sm onClick={() => { stopEmpCamera(); setEmpCamOpen(false) }}>Cancelar</Btn>
                    </div>
                  </div>
                )}
              </div>
            </FG>
            <FG label="URL foto">
              <input style={inp} readOnly={readOnly} value={selEmp.fotoUrl||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, fotoUrl:e.target.value }))}/>
            </FG>
            <FG label="Documento"><input style={inp} readOnly={readOnly} value={selEmp.documento||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, documento:e.target.value }))}/></FG>
            <FG label="Fecha nacimiento"><input type="date" style={inp} readOnly={readOnly} value={selEmp.fechaNacimiento||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, fechaNacimiento:e.target.value }))}/></FG>
            <FG label="Dirección" full><input style={inp} readOnly={readOnly} value={selEmp.direccion||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, direccion:e.target.value }))}/></FG>
            <FG label="Fecha ingreso"><input type="date" style={inp} readOnly={readOnly} value={selEmp.fechaIngreso||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, fechaIngreso:e.target.value }))}/></FG>
            <FG label="Contacto emergencia"><input style={inp} readOnly={readOnly} value={selEmp.contactoEmergencia||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, contactoEmergencia:e.target.value }))}/></FG>
            <FG label="Tel emergencia"><input style={inp} readOnly={readOnly} value={selEmp.telEmergencia||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, telEmergencia:e.target.value }))}/></FG>
            <FG label="Notas" full><textarea style={{...inp, minHeight:70}} readOnly={readOnly} value={selEmp.notas||""} onChange={e=>syncSelEmp(selEmp.id, x => ({ ...x, notas:e.target.value }))}/></FG>
            <FG label="Historial interno" full>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(selEmp.historial||[]).slice().reverse().map(h => (
                  <div key={h.id} style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:8 }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>{h.titulo}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{fmtDate(h.fecha)} · {h.autor || "sistema"}</div>
                    {h.detalle && <div style={{ fontSize:12, marginTop:4 }}>{h.detalle}</div>}
                  </div>
                ))}
                {(selEmp.historial||[]).length===0 && <span style={{ fontSize:12, color:C.muted }}>Sin registros</span>}
                {!readOnly && (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:8 }}>
                    <input style={inp} value={histForm.titulo} onChange={e=>setHistForm(f=>({ ...f, titulo:e.target.value }))} placeholder="Evento"/>
                    <input style={inp} value={histForm.detalle} onChange={e=>setHistForm(f=>({ ...f, detalle:e.target.value }))} placeholder="Detalle"/>
                    <Btn sm onClick={addEmpHist}><Plus size={12}/>Agregar</Btn>
                  </div>
                )}
              </div>
            </FG>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── SECTION: REPORTES (Excel / PDF) ─────────────────────────
function ReportesExport({ data, clinic }) {
  const [tipo, setTipo] = useState("turnos")
  const cd = data.clinics[clinic]

  const rowsTurnos = useMemo(() => cd.turnos.map(t => ({
    Fecha: t.fecha, Hora: t.hora, Cliente: t.cliente, Teléfono: t.tel||"", Servicio: t.servicio, Estado: estadoLabel[t.estado]||t.estado,
  })), [cd.turnos])
  const rowsMovs = useMemo(() => cd.movimientos.map(m => ({
    Fecha: m.fecha, Concepto: m.concepto, Categoría: catLabel[m.cat]||m.cat, Tipo: m.tipo, Monto: m.monto,
  })), [cd.movimientos])
  const rowsPac = useMemo(() => (data.pacientes || []).filter(p => +p.clinicId === +clinic).map(p => ({
    Nombre: p.nombre, Teléfono: p.tel, Email: p.email||"", DNI: p.dni||"", Notas: p.notasClinicas ?? p.notas ?? "",
  })), [data.pacientes, clinic])
  const rowsStock = useMemo(() => cd.stock.map(p => ({
    Producto: p.nombre, Categoría: catLabel[p.cat]||p.cat, Stock: p.stock, Mínimo: p.minimo, Unidad: p.unidad,
  })), [cd.stock])

  const soloAgendaRows = useMemo(() => agendaSinFichaPorClinica(data, clinic).map(r => ({
    Nombre_en_agenda: r.nombre, Turnos: r.turnos, Ultima_fecha: r.ultimaFecha || "—",
  })), [data, clinic])
  const soloFichaRows = useMemo(() => pacientesMaestroSinAgendaClinica(data, clinic).map(p => ({
    Nombre: p.nombre, Teléfono: p.tel || "", Email: p.email || "", DNI: p.dni || "",
  })), [data, clinic])
  const pacientesClinicaCount = useMemo(
    () => (data.pacientes || []).filter(p => +p.clinicId === +clinic).length,
    [data.pacientes, clinic],
  )

  const exportExcel = () => {
    const base = `clinica${clinic}_${tipo}_${TODAY}`
    if (tipo==="turnos") downloadXlsx("Turnos", rowsTurnos, `${base}.xlsx`)
    if (tipo==="movimientos") downloadXlsx("Movimientos", rowsMovs, `${base}.xlsx`)
    if (tipo==="pacientes") downloadXlsx("Pacientes", rowsPac, `${base}.xlsx`)
    if (tipo==="stock") downloadXlsx("Stock", rowsStock, `${base}.xlsx`)
    if (tipo==="agenda_fichas") {
      downloadXlsxMulti([
        { name: "Solo_nombre_agenda", rows: soloAgendaRows },
        { name: "Solo_ficha_maestro", rows: soloFichaRows },
      ], `${base}.xlsx`)
    }
  }
  const exportPdf = () => {
    const base = `clinica${clinic}_${tipo}_${TODAY}`
    if (tipo==="turnos") downloadPdf(`Turnos — Clínica ${clinic}`, ["Fecha","Hora","Cliente","Teléfono","Servicio","Estado"], rowsTurnos.map(r => [r.Fecha,r.Hora,r.Cliente,r.Teléfono,r.Servicio,r.Estado]), `${base}.pdf`)
    if (tipo==="movimientos") downloadPdf(`Movimientos — Clínica ${clinic}`, ["Fecha","Concepto","Categoría","Tipo","Monto"], rowsMovs.map(r => [r.Fecha,r.Concepto,r.Categoría,r.Tipo,String(r.Monto)]), `${base}.pdf`)
    if (tipo==="pacientes") downloadPdf("Pacientes", ["Nombre","Teléfono","Email","DNI","Notas"], rowsPac.map(r => [r.Nombre,r.Teléfono,r.Email,r.DNI,r.Notas]), `${base}.pdf`)
    if (tipo==="stock") downloadPdf(`Stock — Clínica ${clinic}`, ["Producto","Categoría","Stock","Mínimo","Unidad"], rowsStock.map(r => [r.Producto,r.Categoría,String(r.Stock),String(r.Mínimo),r.Unidad]), `${base}.pdf`)
    if (tipo==="agenda_fichas") {
      const doc = new jsPDF()
      doc.setFontSize(13)
      doc.text(`Agenda vs fichas — Clínica ${clinic}`, 14, 16)
      autoTable(doc, {
        startY: 22,
        head: [["Nombre en agenda (sin ficha)", "Turnos", "Última fecha"]],
        body: soloAgendaRows.map(r => [r.Nombre_en_agenda, String(r.Turnos), r.Ultima_fecha]),
        styles: { fontSize: 8 },
      })
      const yAfter = doc.lastAutoTable?.finalY != null ? doc.lastAutoTable.finalY + 10 : 50
      doc.setFontSize(11)
      doc.text("Solo ficha en maestro (sin turnos en esta agenda)", 14, yAfter)
      autoTable(doc, {
        startY: yAfter + 4,
        head: [["Nombre", "Teléfono", "Email", "DNI"]],
        body: soloFichaRows.map(r => [r.Nombre, r.Teléfono, r.Email, r.DNI]),
        styles: { fontSize: 8 },
      })
      doc.save(`${base}.pdf`)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Reportes exportables</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:22 }}>
        La clínica activa es C{clinic}. El maestro de personas es único: <strong>Pacientes</strong> y <strong>Clientes (CRM)</strong> muestran los mismos registros por sede. La agenda puede tener <strong>nombres escritos a mano</strong> que aún no coinciden con una ficha.
      </p>

      <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)", maxWidth:560 }}>
        <FG label="Tipo de reporte">
          <select style={inp} value={tipo} onChange={e=>setTipo(e.target.value)}>
            <option value="turnos">Turnos (agenda actual)</option>
            <option value="movimientos">Contabilidad / movimientos</option>
            <option value="pacientes">Pacientes (maestro global)</option>
            <option value="stock">Stock de la clínica</option>
            <option value="agenda_fichas">Agenda vs fichas (esta clínica)</option>
          </select>
        </FG>
        <div style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap" }}>
          <Btn onClick={exportExcel}><Download size={14}/> Excel (.xlsx)</Btn>
          <Btn variant="outline" onClick={exportPdf}><FileText size={14}/> PDF</Btn>
        </div>
        <p style={{ fontSize:11, color:C.muted, marginTop:16, lineHeight:1.5 }}>
          Los archivos se generan en el navegador. Para envío automático por correo o FTP hace falta un backend; los permisos por rol limitan quién accede a esta pantalla.
        </p>
      </div>

      {tipo === "agenda_fichas" && (
        <div style={{ marginTop:22, display:"grid", gap:18, maxWidth:900 }}>
          <div style={{ background:C.card, borderRadius:16, padding:18, border:`1px solid ${C.border}` }}>
            <h3 style={{ fontSize:15, fontWeight:800, marginBottom:8 }}>Resumen</h3>
            <p style={{ fontSize:13, color:C.muted, lineHeight:1.55, margin:0 }}>
              Fichas en maestro para esta clínica: <strong>{pacientesClinicaCount}</strong>. Turnos en agenda: <strong>{cd.turnos.length}</strong>.
            </p>
          </div>
          <div style={{ background:"#fffbeb", borderRadius:16, padding:18, border:"1px solid #fcd34d" }}>
            <h3 style={{ fontSize:15, fontWeight:800, marginBottom:8, color:"#92400e" }}>Solo en agenda (sin ficha vinculada)</h3>
            <p style={{ fontSize:12, color:"#78350f", lineHeight:1.5, marginBottom:12 }}>
              Aparecieron en turnos con un nombre que <strong>no</strong> coincide con ningún paciente de esta clínica (ni por ID ni por nombre exacto, sin distinguir mayúsculas). Conviene crear la ficha en Pacientes o elegirla al cargar el turno.
            </p>
            {soloAgendaRows.length === 0 ? (
              <p style={{ fontSize:13, color:C.muted }}>Ninguno: todos los nombres de agenda coinciden con una ficha.</p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <THead cols={["Nombre en agenda","Turnos","Última fecha"]} />
                  <tbody>
                    {soloAgendaRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                        <td style={{ padding:"8px 10px", fontWeight:600 }}>{r.Nombre_en_agenda}</td>
                        <td style={{ padding:"8px 10px" }}>{r.Turnos}</td>
                        <td style={{ padding:"8px 10px", color:C.muted }}>{r.Ultima_fecha}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div style={{ background:"#f0fdf4", borderRadius:16, padding:18, border:"1px solid #86efac" }}>
            <h3 style={{ fontSize:15, fontWeight:800, marginBottom:8, color:"#166534" }}>Solo ficha en maestro (sin turnos en esta agenda)</h3>
            <p style={{ fontSize:12, color:"#15803d", lineHeight:1.5, marginBottom:12 }}>
              Pacientes dados de alta en el sistema para C{clinic} que <strong>no</strong> figuran en ningún turno de esta clínica (ni el nombre en el texto del turno ni <code style={codeStyle(C.subtle)}>paciente_id</code>). Pueden ser altas desde Pacientes/Clientes sin cita aún.
            </p>
            {soloFichaRows.length === 0 ? (
              <p style={{ fontSize:13, color:C.muted }}>Todos los del maestro aparecen al menos una vez en la agenda.</p>
            ) : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <THead cols={["Nombre","Teléfono","Email","DNI"]} />
                  <tbody>
                    {soloFichaRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                        <td style={{ padding:"8px 10px", fontWeight:600 }}>{r.Nombre}</td>
                        <td style={{ padding:"8px 10px" }}>{r.Teléfono}</td>
                        <td style={{ padding:"8px 10px", fontSize:12 }}>{r.Email}</td>
                        <td style={{ padding:"8px 10px", fontSize:12 }}>{r.DNI}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SECTION: BONOS, PACKS Y SUSCRIPCIONES ─────────────────────
function BonosPacks({ data, setData, clinic }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const packs = data.bonosPacks.filter(b => b.clinicId === clinic)
  const subs = (data.suscripciones || []).filter(s => s.clinicId === clinic)
  const pacNombre = id => data.pacientes.find(p => p.id === id)?.nombre || "—"
  const svcNombre = id => data.servicios.find(s => s.id === id)?.nombre || "—"

  const usarSesion = id => {
    setData(d => ({
      ...d,
      bonosPacks: d.bonosPacks.map(b => {
        if (b.id !== id || b.sesionesUsadas >= b.sesionesTotal) return b
        return { ...b, sesionesUsadas: b.sesionesUsadas + 1 }
      }),
    }))
  }

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Bonos, packs y suscripciones</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:22 }}>Pack de N sesiones: al atender, descontá una sesión; el paciente ve saldo restante (modelo Flowww).</p>
      <div style={{ background:C.card, borderRadius:16, padding:22, marginBottom:18, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
        <h3 style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Packs activos — Clínica {clinic}</h3>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth: compact ? 680 : undefined }}>
            <THead cols={["Paciente","Pack / servicio","Progreso","Vence","Acción"]}/>
            <tbody>
              {packs.map(b => {
                const rest = b.sesionesTotal - b.sesionesUsadas
                return (
                  <tr key={b.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                    <td style={{ padding:"11px 14px", fontWeight:600 }}>{pacNombre(b.pacienteId)}</td>
                    <td style={{ padding:"11px 14px", fontSize:13 }}>{b.nombre}<div style={{ fontSize:11, color:C.muted }}>{svcNombre(b.servicioId)}</div></td>
                    <td style={{ padding:"11px 14px" }}><Badge type={rest<=2?"pendiente":"confirmado"}>{b.sesionesUsadas}/{b.sesionesTotal} · quedan {rest}</Badge></td>
                    <td style={{ padding:"11px 14px", fontSize:12 }}>{fmtDate(b.vence)}</td>
                    <td style={{ padding:"11px 14px" }}>
                      <Btn sm variant="outline" disabled={rest<=0} onClick={()=>usarSesion(b.id)}>Usar 1 sesión</Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
        <h3 style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Suscripciones mensuales</h3>
        {subs.map(s => (
          <div key={s.id} style={{ padding:"12px 0", borderBottom:`1px solid ${C.subtle}`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <div><strong>{pacNombre(s.pacienteId)}</strong> — {s.nombre}</div>
            <div style={{ fontSize:13 }}>{fmt(s.precioMensual)}/mes · próx. cobro {fmtDate(s.proximoCobro)} · <Badge type={s.activo?"confirmado":"cancelado"}>{s.activo?"Activa":"Pausada"}</Badge></div>
          </div>
        ))}
        {subs.length===0 && <p style={{ fontSize:13, color:"#94A3B8" }}>Sin suscripciones en esta clínica.</p>}
      </div>
    </div>
  )
}

/** Dictado o texto → JSON para TPV vía proxy en Vite (clave solo en servidor; ver .env.local). */
async function procesarCobroConOpenAI(texto, servicios) {
  const catalogo = servicios.map(s => ({ id: s.id, nombre: s.nombre, precio: s.precio, cat: s.cat }))
  const res = await fetch("/api/openai/tpv-cobro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto: texto.trim(), catalogo }),
  })
  const rawText = await res.text()
  if (!res.ok) {
    let msg = rawText
    try {
      const j = JSON.parse(rawText)
      msg = j.error?.message || j.error || msg
    } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : `Error HTTP ${res.status}`)
  }
  const payload = JSON.parse(rawText)
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error("Respuesta vacía del modelo")
  return JSON.parse(content)
}

/** Dictado del especialista → rellenar evaluación, servicio, protocolo, notas, insumos y anamnesis (proxy /api/openai/doctor-session). */
async function procesarSesionDoctorConOpenAI(texto, servicios, stockItems, anamnesisActual) {
  const res = await fetch("/api/openai/doctor-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texto: texto.trim(),
      servicios: servicios.map(s => ({ id: s.id, nombre: s.nombre, precio: s.precio, cat: s.cat })),
      stock: stockItems.map(s => ({ id: s.id, nombre: s.nombre })),
      anamnesisActual: anamnesisActual && typeof anamnesisActual === "object" ? anamnesisActual : {},
    }),
  })
  const rawText = await res.text()
  if (!res.ok) {
    let msg = rawText
    try {
      const j = JSON.parse(rawText)
      msg = j.error?.message || j.error || msg
    } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : `Error HTTP ${res.status}`)
  }
  const payload = JSON.parse(rawText)
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error("Respuesta vacía del modelo")
  return JSON.parse(content)
}

/** Audio (base64) → transcripción + misma extracción JSON (proxy /api/openai/doctor-audio). */
async function procesarSesionDoctorDesdeAudio(audioBase64, mimeType, servicios, stockItems, anamnesisActual) {
  const res = await fetch("/api/openai/doctor-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType: mimeType || "audio/webm",
      servicios: servicios.map(s => ({ id: s.id, nombre: s.nombre, precio: s.precio, cat: s.cat })),
      stock: stockItems.map(s => ({ id: s.id, nombre: s.nombre })),
      anamnesisActual: anamnesisActual && typeof anamnesisActual === "object" ? anamnesisActual : {},
    }),
  })
  const rawText = await res.text()
  if (!res.ok) {
    let msg = rawText
    try {
      const j = JSON.parse(rawText)
      msg = j.error?.message || j.error || msg
    } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : `Error HTTP ${res.status}`)
  }
  return JSON.parse(rawText)
}

/** Resultado post-tratamiento (fase Resultado) → JSON { resultado }. */
async function procesarResultadoSesionConOpenAI(texto, protocoloSnippet) {
  const res = await fetch("/api/openai/resultado-sesion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texto: texto.trim(),
      protocolo: String(protocoloSnippet || "").trim(),
    }),
  })
  const rawText = await res.text()
  if (!res.ok) {
    let msg = rawText
    try {
      const j = JSON.parse(rawText)
      msg = j.error?.message || j.error || msg
    } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : `Error HTTP ${res.status}`)
  }
  const payload = JSON.parse(rawText)
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error("Respuesta vacía del modelo")
  return JSON.parse(content)
}

async function procesarResultadoDesdeAudio(audioBase64, mimeType, protocoloSnippet) {
  const res = await fetch("/api/openai/resultado-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mimeType: mimeType || "audio/webm",
      protocolo: String(protocoloSnippet || "").trim(),
    }),
  })
  const rawText = await res.text()
  if (!res.ok) {
    let msg = rawText
    try {
      const j = JSON.parse(rawText)
      msg = j.error?.message || j.error || msg
    } catch { /* ignore */ }
    throw new Error(typeof msg === "string" ? msg : `Error HTTP ${res.status}`)
  }
  return JSON.parse(rawText)
}

// ─── SECTION: TPV VIRTUAL ───────────────────────────────────────
function PuntoVenta({ data, setData, clinic }) {
  const narrow = useMediaQuery("(max-width: 900px)")
  const lineIdRef = useRef(0)
  const [carrito, setCarrito] = useState([])
  const [display, setDisplay] = useState("")
  const [detalleManual, setDetalleManual] = useState("")
  const [metodo, setMetodo] = useState("efectivo")
  const [comprobanteExtra, setComprobanteExtra] = useState("")
  const [tab, setTab] = useState("caja")
  const [iaTexto, setIaTexto] = useState("")
  const [iaLoading, setIaLoading] = useState(false)
  const [iaError, setIaError] = useState("")
  const [escuchando, setEscuchando] = useState(false)
  const dictadoAccRef = useRef("")

  const movs = (data.tpv?.movimientos || []).filter(m => m.clinicId === clinic).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
  const cierre = (data.tpv?.cierres || []).find(c => c.fecha === TODAY && c.clinicId === clinic)
  const hoyMovs = movs.filter(m => m.fecha === TODAY)

  const totalCarrito = useMemo(
    () => carrito.reduce((a, x) => a + x.montoUnit * x.cantidad, 0),
    [carrito],
  )

  const resumenHoy = useMemo(() => ({
    efectivo: hoyMovs.filter(m => m.metodo === "efectivo").reduce((a, m) => a + m.monto, 0),
    tarjeta: hoyMovs.filter(m => m.metodo === "tarjeta").reduce((a, m) => a + m.monto, 0),
    transferencia: hoyMovs.filter(m => m.metodo === "transferencia").reduce((a, m) => a + m.monto, 0),
    total: hoyMovs.reduce((a, m) => a + m.monto, 0),
  }), [hoyMovs])

  const appendDigit = ch => {
    setDisplay(prev => {
      if (ch === "." && prev.includes(".")) return prev
      if (prev === "0" && ch !== ".") return ch
      if (!prev && ch === ".") return "0."
      return prev + ch
    })
  }

  const keypadClear = () => { setDisplay("") }
  const keypadBack = () => { setDisplay(prev => prev.slice(0, -1)) }

  const addLineManual = () => {
    const v = parseFloat(display.replace(",", "."))
    if (!v || v <= 0) return
    const nombre = detalleManual.trim() || "Cobro manual"
    lineIdRef.current += 1
    setCarrito(c => [...c, { id: `l-${lineIdRef.current}`, nombre, montoUnit: v, cantidad: 1, servicioId: null }])
    setDisplay("")
    setDetalleManual("")
  }

  const addServicio = s => {
    lineIdRef.current += 1
    setCarrito(c => [...c, { id: `l-${lineIdRef.current}`, nombre: s.nombre, montoUnit: s.precio ?? 0, cantidad: 1, servicioId: s.id }])
  }

  const setCant = (id, delta) => {
    setCarrito(c => c.map(x => {
      if (x.id !== id) return x
      const n = Math.max(1, x.cantidad + delta)
      return { ...x, cantidad: n }
    }))
  }

  const removeLine = id => setCarrito(c => c.filter(x => x.id !== id))

  const registrarCobro = async () => {
    if (totalCarrito <= 0) return
    const concepto = carrito.length === 1
      ? `${carrito[0].nombre}${carrito[0].cantidad > 1 ? ` ×${carrito[0].cantidad}` : ""}`
      : `Ticket (${carrito.length} ítems): ` + carrito.map(x => `${x.nombre}×${x.cantidad}`).join(" · ")
    const comp = comprobanteExtra.trim() || `VTPV-${Date.now()}`
    if (import.meta.env.VITE_SUPABASE_URL) {
      await supabase.from("tpv_movimientos").insert({
        fecha: TODAY,
        clinic_id: clinic,
        metodo,
        monto: totalCarrito,
        concepto,
        comprobante: comp,
      })
      await supabase.from("clinic_movimientos").insert({
        clinic_id: clinic,
        tipo: "ingreso",
        fecha: TODAY,
        concepto,
        cat: "servicios",
        monto: totalCarrito,
      })
    }
    setData(d => {
      const tid = d.tpv?.movimientos?.length ? Math.max(...d.tpv.movimientos.map(x => x.id)) + 1 : 1
      const row = {
        id: tid,
        fecha: TODAY,
        clinicId: clinic,
        metodo,
        monto: totalCarrito,
        concepto,
        comprobante: comp,
      }
      const cm = d.clinics[clinic].movimientos
      const mid = cm.length ? Math.max(...cm.map(m => m.id)) + 1 : 1
      return {
        ...d,
        tpv: { ...d.tpv, movimientos: [...(d.tpv?.movimientos || []), row] },
        clinics: {
          ...d.clinics,
          [clinic]: {
            ...d.clinics[clinic],
            movimientos: [...cm, { id: mid, tipo: "ingreso", fecha: TODAY, concepto, cat: "servicios", monto: totalCarrito }],
          },
        },
      }
    })
    setCarrito([])
    setComprobanteExtra("")
  }

  const cerrarCaja = () => {
    setData(d => ({
      ...d,
      tpv: {
        ...d.tpv,
        cierres: [
          ...(d.tpv?.cierres || []).filter(c => !(c.fecha === TODAY && c.clinicId === clinic)),
          { fecha: TODAY, clinicId: clinic, efectivo: resumenHoy.efectivo, tarjeta: resumenHoy.tarjeta, transferencia: resumenHoy.transferencia },
        ],
      },
    }))
  }

  const aplicarIAConTexto = async textoRaw => {
    const texto = String(textoRaw || "").trim()
    if (!texto) {
      setIaError("Escribí o dictá qué cobrar.")
      return
    }
    setIaLoading(true)
    setIaError("")
    try {
      const parsed = await procesarCobroConOpenAI(texto, data.servicios)
      const met = parsed.metodo
      if (met === "efectivo" || met === "tarjeta" || met === "transferencia") setMetodo(met)
      if (typeof parsed.comprobante === "string" && parsed.comprobante.trim()) {
        setComprobanteExtra(parsed.comprobante.trim())
      }
      const lineas = Array.isArray(parsed.lineas) ? parsed.lineas : []
      const nuevas = []
      for (const L of lineas) {
        const monto = Number(L.monto)
        if (!monto || monto <= 0) continue
        lineIdRef.current += 1
        nuevas.push({
          id: `l-${lineIdRef.current}`,
          nombre: String(L.nombre || "Ítem").slice(0, 120),
          montoUnit: monto,
          cantidad: Math.max(1, Math.min(99, parseInt(L.cantidad, 10) || 1)),
          servicioId: null,
        })
      }
      if (nuevas.length === 0) {
        setIaError("La IA no devolvió líneas con importe. Describí servicios o montos (ej: bótox en efectivo 280 €).")
        return
      }
      setCarrito(nuevas)
      setIaTexto("")
    } catch (e) {
      setIaError(e.message || "No se pudo procesar")
    } finally {
      setIaLoading(false)
    }
  }

  const aplicarIA = () => { void aplicarIAConTexto(iaTexto) }

  const iniciarDictado = () => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) {
      setIaError("Dictado por voz no disponible en este navegador (frecuente en iPhone/iPad). Escribí el cobro o abrí en Chrome para Android.")
      return
    }
    setIaError("")
    dictadoAccRef.current = iaTexto.trim()
    setIaTexto(dictadoAccRef.current)
    const r = new SR()
    r.lang = "es-ES"
    r.interimResults = false
    r.continuous = true
    r.maxAlternatives = 1
    r.onresult = ev => {
      let chunk = ""
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) chunk += ev.results[i][0].transcript
      }
      if (!chunk.trim()) return
      dictadoAccRef.current = dictadoAccRef.current ? `${dictadoAccRef.current} ${chunk}`.trim() : chunk.trim()
      setIaTexto(dictadoAccRef.current)
    }
    r.onerror = () => {
      setEscuchando(false)
      setIaError("Error de micrófono. Revisá permisos del navegador.")
    }
    r.onend = () => {
      setEscuchando(false)
      const t = dictadoAccRef.current.trim()
      if (t) void aplicarIAConTexto(t)
    }
    try {
      setEscuchando(true)
      r.start()
    } catch {
      setEscuchando(false)
      setIaError("No se pudo iniciar el dictado.")
    }
  }

  const keys = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "⌫"]]

  const metodos = [
    { id: "efectivo", label: "Efectivo", icon: Banknote, color: "#059669" },
    { id: "tarjeta", label: "Tarjeta", icon: CreditCard, color: "#4F46E5" },
    { id: "transferencia", label: "Transferencia", icon: Wallet, color: "#0891B2" },
  ]

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>TPV Virtual</h2>
          <p style={{ fontSize: 13, color: C.muted, maxWidth: 560 }}>
            Terminal táctil: armá el ticket con servicios rápidos o teclado, elegí medio de pago y cobrá. Sincroniza con contabilidad de la clínica {clinic}.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, width: narrow ? "100%" : "auto" }}>
          <Btn variant={tab === "caja" ? "primary" : "outline"} sm onClick={() => setTab("caja")} style={{ flex: narrow ? 1 : undefined, justifyContent:"center" }}>Caja</Btn>
          <Btn variant={tab === "historial" ? "primary" : "outline"} sm onClick={() => setTab("historial")} style={{ flex: narrow ? 1 : undefined, justifyContent:"center" }}>Movimientos</Btn>
        </div>
      </div>

      {tab === "caja" && (
        <div style={{
          marginBottom: 18,
          padding: narrow ? 14 : 18,
          borderRadius: 16,
          background: "linear-gradient(135deg,#F5F3FF 0%,#EDE9FE 50%,#FAF5FF 100%)",
          border: `1px solid ${C.violet}33`,
          boxShadow: "0 4px 20px rgba(124,58,237,.08)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <Sparkles size={20} color={C.violet} />
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Asistente IA (móvil)</span>
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.45 }}>
            <strong>Dictar:</strong> tocá el micrófono, hablá el cobro y cuando el navegador deje de escuchar se envía solo a la IA y se rellenan ticket y medio de pago.
            También podés escribir y usar <strong>Rellenar con IA</strong>. Clave en <code style={codeStyle(C.card)}>.env.local</code> (reiniciá Vite si la cambiás).
          </p>
          <textarea
            value={iaTexto}
            onChange={e => setIaTexto(e.target.value)}
            placeholder='Ej: "Consulta estética y un bótox facial, dos sesiones de depilación axilas, todo con tarjeta, unos 620 € en total"'
            style={{
              width: "100%",
              minHeight: narrow ? 88 : 72,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              fontSize: 16,
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
              marginBottom: 10,
            }}
          />
          {iaError && (
            <div style={{ fontSize: 12, color: C.danger, fontWeight: 600, marginBottom: 10 }}>{iaError}</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <Btn type="button" onClick={aplicarIA} disabled={iaLoading || !iaTexto.trim()} style={{ minHeight: 44, width: narrow ? "100%" : "auto", justifyContent:"center" }}>
              {iaLoading ? <Loader2 size={16} className="erp-spin" /> : <Sparkles size={16} />}
              {iaLoading ? " Procesando…" : " Rellenar con IA"}
            </Btn>
            <Btn type="button" variant="outline" onClick={iniciarDictado} disabled={iaLoading || escuchando} style={{ minHeight: 44, width: narrow ? "100%" : "auto", justifyContent:"center" }}>
              <Mic size={16} color={escuchando ? C.danger : C.violet} />
              {escuchando ? " Escuchando… soltá / terminá para rellenar" : " Dictar y rellenar solo"}
            </Btn>
          </div>
        </div>
      )}

      {tab === "caja" && (
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 380px", gap: 18, alignItems: "start" }}>
          {/* Terminal oscuro */}
          <div style={{
            background: "linear-gradient(165deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)",
            borderRadius: 20,
            padding: narrow ? 16 : 24,
            boxShadow: "0 20px 50px rgba(15,23,42,.35)",
            border: "1px solid rgba(148,163,184,.15)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "#64748b", textTransform: "uppercase" }}>Estética ERP · C{clinic}</span>
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>● En línea</span>
            </div>

            <div style={{
              background: "rgba(0,0,0,.35)",
              borderRadius: 14,
              padding: "18px 20px",
              marginBottom: 18,
              border: "1px solid rgba(255,255,255,.06)",
              textAlign: "right",
            }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>Total a cobrar</div>
              <div style={{ fontSize: narrow ? 36 : 44, fontWeight: 800, color: "#f8fafc", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                {fmt(totalCarrito)}
              </div>
              {carrito.length > 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, textAlign: "left", maxHeight: 72, overflowY: "auto" }}>
                  {carrito.map(x => (
                    <div key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nombre} ×{x.cantidad}</span>
                      <span style={{ color: "#cbd5e1" }}>{fmt(x.montoUnit * x.cantidad)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 10 }}>Medio de pago</div>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
              {metodos.map(({ id, label, icon: Icon, color }) => {
                const on = metodo === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMetodo(id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "14px 8px",
                      borderRadius: 12,
                      border: on ? `2px solid ${color}` : "1px solid rgba(148,163,184,.25)",
                      background: on ? `${color}22` : "rgba(255,255,255,.04)",
                      cursor: "pointer",
                      color: on ? "#f8fafc" : "#94a3b8",
                    }}
                  >
                    <Icon size={22} color={on ? color : "#64748b"} />
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{label}</span>
                  </button>
                )
              })}
            </div>

            <Btn
              onClick={() => void registrarCobro()}
              disabled={totalCarrito <= 0}
              style={{
                width: "100%",
                minHeight: 52,
                fontSize: 16,
                fontWeight: 800,
                background: totalCarrito > 0 ? "linear-gradient(135deg,#059669,#10b981)" : "#334155",
                border: "none",
                boxShadow: totalCarrito > 0 ? "0 8px 24px rgba(16,185,129,.35)" : "none",
              }}
            >
              <ShoppingCart size={18} /> COBRAR {totalCarrito > 0 ? fmt(totalCarrito) : ""}
            </Btn>
            <input
              type="text"
              placeholder="N° comprobante (opcional)"
              value={comprobanteExtra}
              onChange={e => setComprobanteExtra(e.target.value)}
              style={{
                width: "100%",
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,.2)",
                background: "rgba(255,255,255,.06)",
                color: "#e2e8f0",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Teclado + servicios + líneas */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.card, borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>Teclado importe</div>
              <div style={{
                fontSize: 28,
                fontWeight: 800,
                textAlign: "right",
                padding: "12px 14px",
                background: C.subtle,
                borderRadius: 10,
                marginBottom: 10,
                color: C.text,
                fontVariantNumeric: "tabular-nums",
                minHeight: 48,
              }}>
                {display || "0"}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {keys.map((row, ri) => (
                  <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {row.map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => (k === "⌫" ? keypadBack() : appendDigit(k))}
                        style={{
                          padding: "14px 0",
                          fontSize: 18,
                          fontWeight: 700,
                          borderRadius: 10,
                          border: `1px solid ${C.border}`,
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button type="button" onClick={keypadClear} style={{ padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.subtle, fontWeight: 700, cursor: "pointer" }}>C</button>
                  <button type="button" onClick={() => appendDigit("00")} style={{ padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff", fontWeight: 700, cursor: "pointer" }}>00</button>
                </div>
              </div>
              <FG label="Detalle (opcional)" full>
                <input style={{ ...inp, marginTop: 8 }} value={detalleManual} onChange={e => setDetalleManual(e.target.value)} placeholder="Ej: Producto de mostrador" />
              </FG>
              <Btn variant="outline" style={{ width: "100%", marginTop: 10 }} onClick={addLineManual} disabled={!display || parseFloat(display.replace(",", ".")) <= 0}>
                <Plus size={14} /> Añadir al ticket
              </Btn>
            </div>

            <div style={{ background: C.card, borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 10 }}>Servicios rápidos</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                {data.servicios.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addServicio(s)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: `1px solid ${C.border}`,
                      background: C.subtle,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {s.nombre} · {fmt(s.precio)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: C.card, borderRadius: 16, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>Líneas del ticket</span>
                {carrito.length > 0 && (
                  <button type="button" onClick={() => setCarrito([])} style={{ fontSize: 12, color: C.danger, fontWeight: 600, border: "none", background: "none", cursor: "pointer" }}>Vaciar</button>
                )}
              </div>
              {carrito.length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8", padding: "12px 0" }}>Agregá importe o tocá un servicio.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {carrito.map(x => (
                    <div
                      key={x.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: narrow ? "wrap" : "nowrap",
                        padding: "10px 12px",
                        background: C.subtle,
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{x.nombre}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>{fmt(x.montoUnit)} c/u</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: narrow ? 0 : undefined }}>
                        <button type="button" onClick={() => setCant(x.id, -1)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer" }}><Minus size={14} /></button>
                        <span style={{ fontWeight: 800, minWidth: 24, textAlign: "center" }}>{x.cantidad}</span>
                        <button type="button" onClick={() => setCant(x.id, 1)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer" }}><Plus size={14} /></button>
                      </div>
                      <div style={{ fontWeight: 800, minWidth: 72, textAlign: "right", marginLeft: narrow ? "auto" : 0 }}>{fmt(x.montoUnit * x.cantidad)}</div>
                      <button type="button" title="Quitar" onClick={() => removeLine(x.id)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: C.muted }}>
                        <Delete size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: C.violetLight, borderRadius: 14, padding: 14, border: `1px solid ${C.violet}33` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.violet, marginBottom: 8 }}>Resumen de hoy (TPV)</div>
              <div style={{ fontSize: 13, color: C.text, display: "grid", gap: 4 }}>
                <span>Efectivo: <strong>{fmt(resumenHoy.efectivo)}</strong></span>
                <span>Tarjeta: <strong>{fmt(resumenHoy.tarjeta)}</strong></span>
                <span>Transferencia: <strong>{fmt(resumenHoy.transferencia)}</strong></span>
                <span style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.violet}33` }}>Total: <strong>{fmt(resumenHoy.total)}</strong></span>
              </div>
              <Btn variant="outline" style={{ width: "100%", marginTop: 12 }} onClick={cerrarCaja}>
                Registrar cierre de caja hoy
              </Btn>
            </div>
          </div>
        </div>
      )}

      {tab === "historial" && (
        <div style={{ background: C.card, borderRadius: 16, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Movimientos TPV · Clínica {clinic}</h3>
          {cierre && (
            <div style={{ fontSize: 12, marginBottom: 14, padding: 12, background: C.subtle, borderRadius: 10 }}>
              Último cierre hoy: Efectivo {fmt(cierre.efectivo)} · Tarjeta {fmt(cierre.tarjeta)} · Transferencia {fmt(cierre.transferencia)}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <THead cols={["Fecha", "Concepto", "Medio", "Monto", "Comprobante"]} />
              <tbody>
                {movs.slice(0, 40).map(m => (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${C.subtle}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{fmtDate(m.fecha)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{m.concepto}</td>
                    <td style={{ padding: "10px 12px" }}><Badge type="gray">{m.metodo}</Badge></td>
                    <td style={{ padding: "10px 12px", fontWeight: 800 }}>{fmt(m.monto)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: C.muted }}>{m.comprobante}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SECTION: MARKETING (WhatsApp + cumple + reactivación) ─────
function MarketingHub({ data, setData, clinic }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const [sub, setSub] = useState("wa")
  const cfg = data.waConfig
  const mk = data.marketingAutomatizacion || {}
  const setCfg = patch => setData(d => ({ ...d, waConfig: { ...d.waConfig, ...patch } }))
  const setMk = patch => setData(d => ({ ...d, marketingAutomatizacion: { ...d.marketingAutomatizacion, ...patch } }))

  const pacientesClinica = useMemo(
    () => (data.pacientes || []).filter(p => p && p.clinicId != null && +p.clinicId === +clinic),
    [data.pacientes, clinic],
  )
  const pacById = useMemo(() => Object.fromEntries(pacientesClinica.map(p => [p.id, p])), [pacientesClinica])

  const mensajePara = r => {
    const p = pacById[r.pacienteId]
    const nombre = p?.nombre || "Paciente"
    return buildWaMessage(cfg.plantilla, { nombre, fecha: fmtDate(r.fechaTurno), hora: r.horaTurno })
  }

  const generarDesdeAgenda = () => {
    const turnos = data.clinics[clinic].turnos
    let nextId = data.recordatoriosWA.length ? Math.max(...data.recordatoriosWA.map(x => x.id)) + 1 : 1
    const exist = new Set(data.recordatoriosWA.map(x => `${x.pacienteId}|${x.fechaTurno}|${x.horaTurno}`))
    const nuevos = []
    turnos.forEach(t => {
      const paciente = pacientesClinica.find(p => p.nombre.trim().toLowerCase() === t.cliente.trim().toLowerCase())
      if (!paciente) return
      const key = `${paciente.id}|${t.fecha}|${t.hora}`
      if (exist.has(key)) return
      exist.add(key)
      nuevos.push({ id: nextId++, pacienteId: paciente.id, tel: t.tel || paciente.tel, fechaTurno: t.fecha, horaTurno: t.hora, estado: "pendiente", creado: TODAY })
    })
    if (nuevos.length) setData(d => ({ ...d, recordatoriosWA: [...d.recordatoriosWA, ...nuevos] }))
  }

  const marcarEnviado = id => {
    setData(d => ({ ...d, recordatoriosWA: d.recordatoriosWA.map(r => r.id === id ? { ...r, estado: "enviado" } : r) }))
  }

  const cumpleHoy = useMemo(() => {
    const mmdd = TODAY.slice(5)
    return pacientesClinica.filter(p => p.fechaNacimiento && p.fechaNacimiento.slice(5) === mmdd)
  }, [pacientesClinica])

  const reactivar = useMemo(() => {
    const dias = mk.reactivacionDias || 30
    const lim = new Date(); lim.setDate(lim.getDate() - dias)
    const limStr = lim.toISOString().split("T")[0]
    return pacientesClinica.filter(p => {
      const vis = (p.visitas || []).map(v => v.fecha).sort().pop()
      return vis && vis < limStr
    })
  }, [pacientesClinica, mk.reactivacionDias])

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Marketing automatizado</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:18 }}>Cola WhatsApp, cumpleaños y reactivación. Automático 24/7 requiere workers + API (Meta / email).</p>
      <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch", paddingBottom:2 }}>
        <div style={{ minWidth: compact ? 420 : undefined }}>
          <TabBar tabs={[{ id:"wa", label:"WhatsApp turnos" }, { id:"cumple", label:"Cumpleaños" }, { id:"react", label:"Reactivación" }]} active={sub} onChange={setSub}/>
        </div>
      </div>

      {sub==="wa" && (
        <div style={{ display:"grid", gridTemplateColumns:compact?"1fr":"1fr 1.2fr", gap:18, marginTop:18, alignItems:"start" }}>
          <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
            <h3 style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Plantilla recordatorio</h3>
            <FG label="Plantilla ({nombre}, {fecha}, {hora})" full>
              <textarea style={{ ...inp, minHeight:100 }} value={cfg.plantilla} onChange={e=>setCfg({ plantilla: e.target.value })}/>
            </FG>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginTop:14 }}>
              <FG label="Horas antes"><input type="number" style={inp} min={1} value={cfg.horasAntes} onChange={e=>setCfg({ horasAntes:+e.target.value||24 })}/></FG>
              <FG label="Activo"><label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}><input type="checkbox" checked={cfg.activo} onChange={e=>setCfg({ activo: e.target.checked })}/> Habilitado</label></FG>
            </div>
          </div>
          <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
              <h3 style={{ fontSize:14, fontWeight:700 }}>Cola</h3>
              <Btn variant="outline" sm onClick={generarDesdeAgenda} style={{ width: compact ? "100%" : "auto", justifyContent:"center" }}><MessageCircle size={14}/> Desde agenda</Btn>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", minWidth: compact ? 620 : undefined }}>
                <THead cols={["Paciente","Turno","Estado","Acción"]}/>
                <tbody>
                  {data.recordatoriosWA.filter(r => pacById[r.pacienteId]).map(r => {
                    const p = pacById[r.pacienteId]
                    const msg = mensajePara(r)
                    return (
                      <tr key={r.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                        <td style={{ padding:"10px 12px", fontWeight:600 }}>{p?.nombre}</td>
                        <td style={{ padding:"10px 12px", fontSize:12 }}>{fmtDate(r.fechaTurno)} {r.horaTurno}</td>
                        <td style={{ padding:"10px 12px" }}><Badge type={r.estado==="enviado"?"confirmado":"pendiente"}>{r.estado==="enviado"?"Enviado":"Pendiente"}</Badge></td>
                        <td style={{ padding:"10px 12px" }}>
                          <a href={waUrl(r.tel || p?.tel, msg)} target="_blank" rel="noreferrer" style={{ fontSize:12, fontWeight:600, color:C.violet }}>WA</a>
                          {r.estado !== "enviado" && <Btn sm variant="outline" onClick={()=>marcarEnviado(r.id)} style={{ marginLeft:8 }}>OK</Btn>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {data.recordatoriosWA.filter(r => pacById[r.pacienteId]).length===0 && <p style={{ fontSize:12, color:C.muted, marginTop:10 }}>Sin recordatorios aún. Tocá "Desde agenda" para generar la cola.</p>}
          </div>
        </div>
      )}

      {sub==="cumple" && (
        <div style={{ marginTop:18, background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <FG label="Plantilla cumpleaños" full>
            <textarea style={{ ...inp, minHeight:70 }} value={mk.plantillaCumple||""} onChange={e=>setMk({ plantillaCumple: e.target.value })}/>
          </FG>
          <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:12, fontSize:13 }}><input type="checkbox" checked={!!mk.cumpleActivo} onChange={e=>setMk({ cumpleActivo: e.target.checked })}/> Activo (scheduler en backend)</label>
          <h4 style={{ marginTop:20, fontSize:13 }}>Cumplen hoy ({fmtDate(TODAY)})</h4>
          {cumpleHoy.map(p => (
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.subtle}` }}>
              <span>{p.nombre}</span>
              <a href={waUrl(p.tel, buildWaMessage(mk.plantillaCumple||"Feliz cumple {nombre}", { nombre:p.nombre, fecha:"", hora:"" }))} target="_blank" rel="noreferrer" style={{ fontWeight:600, color:C.violet }}>WhatsApp</a>
            </div>
          ))}
          {cumpleHoy.length===0 && <p style={{ color:"#94A3B8", fontSize:13 }}>Nadie cumple hoy (demo).</p>}
        </div>
      )}

      {sub==="react" && (
        <div style={{ marginTop:18, background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <div style={{ display:"grid", gridTemplateColumns:compact?"1fr":"1fr 1fr", gap:14 }}>
            <FG label="Días sin visita (umbral)">
              <input type="number" style={inp} min={7} value={mk.reactivacionDias||30} onChange={e=>setMk({ reactivacionDias:+e.target.value||30 })}/>
            </FG>
            <FG label="Activo"><label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginTop:22 }}><input type="checkbox" checked={!!mk.reactivacionActivo} onChange={e=>setMk({ reactivacionActivo: e.target.checked })}/> Campaña reactivación</label></FG>
          </div>
          <FG label="Mensaje" full>
            <textarea style={{ ...inp, minHeight:70 }} value={mk.plantillaReactivacion||""} onChange={e=>setMk({ plantillaReactivacion: e.target.value })}/>
          </FG>
          <h4 style={{ marginTop:16, fontSize:13 }}>Candidatos (&gt;{mk.reactivacionDias||30} días sin visita)</h4>
          {reactivar.map(p => (
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.subtle}` }}>
              <span>{p.nombre}</span>
              <a href={waUrl(p.tel, buildWaMessage(mk.plantillaReactivacion||"", { nombre:p.nombre, fecha:"", hora:"" }))} target="_blank" rel="noreferrer" style={{ color:C.violet, fontWeight:600 }}>Contactar</a>
            </div>
          ))}
          {reactivar.length===0 && <p style={{ color:"#94A3B8", fontSize:13 }}>Nadie en umbral (o faltan fechas de visita).</p>}
        </div>
      )}
    </div>
  )
}

// ─── SECTION: REPORTES AVANZADOS ───────────────────────────────
function ReportesAvanzados({ data, clinic }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const cd = data.clinics[clinic]
  const profs = data.profesionales || []

  const facturacionMes = useMemo(() => cd.movimientos.filter(m => m.tipo==="ingreso").reduce((a,m)=>a+m.monto,0), [cd.movimientos])
  const rankingServicios = useMemo(() => {
    const map = {}
    cd.turnos.forEach(t => { map[t.servicio] = (map[t.servicio]||0) + 1 })
    return Object.entries(map).sort((a,b)=>b[1]-a[1])
  }, [cd.turnos])
  const porProf = useMemo(() => profs.map(pr => {
    const n = cd.turnos.filter(t => (t.profesionalId||1) === pr.id).length
    const fact = cd.turnos.filter(t => (t.profesionalId||1) === pr.id).length * 195
    const com = Math.round(fact * (pr.comisionPct/100))
    return { ...pr, turnos:n, comisionEstimada:com }
  }), [cd.turnos, profs])

  const ocupacion = useMemo(() => {
    const slots = 14
    const usados = cd.turnos.filter(t=>t.fecha===TODAY).length
    return Math.min(100, Math.round((usados/slots)*100))
  }, [cd.turnos])

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Reportes avanzados</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:22 }}>Facturación del período cargado, ranking, comisiones estimadas y ocupación (demo sobre datos locales).</p>
      <div style={{ display:"grid", gridTemplateColumns:compact?"1fr":"repeat(3,1fr)", gap:14, marginBottom:18 }}>
        <KpiCard title="Facturación (ingresos)" value={fmt(facturacionMes)} sub="Movimientos actuales clínica" icon={DollarSign} accent={C.success} />
        <KpiCard title="Ocupación agenda hoy" value={`${ocupacion}%`} sub="Turnos hoy vs capacidad demo" icon={Calendar} accent={C.violet} />
        <KpiCard title="Retención (proxy)" value="—" sub="Requiere cohortes en backend" icon={Users} accent="#06B6D4" />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:compact?"1fr":"1fr 1fr", gap:18 }}>
        <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Servicios más solicitados</h3>
          {rankingServicios.map(([s,c]) => (
            <div key={s} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.subtle}`, fontSize:13 }}><span>{s}</span><strong>{c}</strong></div>
          ))}
        </div>
        <div style={{ background:C.card, borderRadius:16, padding:22, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Rendimiento y comisiones (estimado)</h3>
          {porProf.map(p => (
            <div key={p.id} style={{ padding:"10px 0", borderBottom:`1px solid ${C.subtle}`, fontSize:13 }}>
              <div style={{ fontWeight:700 }}>{p.nombre} <span style={{ color:C.muted, fontWeight:500 }}>{p.comisionPct}%</span></div>
              <div style={{ fontSize:12, color:C.muted }}>Turnos: {p.turnos} · Comisión aprox. {fmt(p.comisionEstimada)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── SECTION: RESERVAS ONLINE ─────────────────────────────────
function ReservasOnline({ data, clinic }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const [proId, setProId] = useState("")
  const base = typeof window !== "undefined" ? `${window.location.origin}/?reserva=1&clinic=${clinic}` : ""
  const link = proId ? `${base}&pro=${proId}` : base
  const profs = (data.empleados || []).filter(e => esEmpleadoAtiendeAgenda(e) && (+e.clinicId === +clinic || e.clinicId == null))

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Reserva online (link público)</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:18 }}>
        Publicá este enlace en Instagram/WhatsApp/web. El paciente elige especialista y horario disponible y el turno se crea en la agenda de esta clínica.
      </p>
      <div style={{ background:C.card, borderRadius:16, padding:18, boxShadow:"0 1px 3px rgba(0,0,0,.08)", maxWidth:920 }}>
        <div style={{ display:"grid", gridTemplateColumns: compact ? "1fr" : "280px 1fr auto", gap:10, alignItems:"end" }}>
          <FG label="Especialista (opcional, para link directo)">
            <select style={inp} value={proId} onChange={e => setProId(e.target.value)}>
              <option value="">Todos los especialistas</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </FG>
          <FG label="Link público">
            <input style={inp} readOnly value={link} />
          </FG>
          <Btn onClick={() => navigator.clipboard.writeText(link).catch(() => {})}><Copy size={13}/> Copiar</Btn>
        </div>
        <p style={{ fontSize:12, color:C.muted, marginTop:10 }}>
          Requisito: tener disponibilidad cargada en Agenda. El formulario público usa esas franjas para habilitar turnos.
        </p>
      </div>
    </div>
  )
}

function PublicBookingView() {
  const compact = useMediaQuery("(max-width: 980px)")
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const clinicId = +(q.get("clinic") || 0)
  const preProId = +(q.get("pro") || 0)
  const [loading, setLoading] = useState(true)
  const [opts, setOpts] = useState({ profesionales: [], servicios: [], disponibilidades: [] })
  const [okMsg, setOkMsg] = useState("")
  const [form, setForm] = useState({ nombre: "", tel: "", profesionalId: preProId || "", servicioId: "", fecha: TODAY, hora: "" })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/erp/public-booking/options?clinicId=${clinicId}`)
        const j = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok || !j?.ok) {
          setOpts({ profesionales: [], servicios: [], disponibilidades: [] })
          return
        }
        setOpts({
          profesionales: j.profesionales || [],
          servicios: j.servicios || [],
          disponibilidades: j.disponibilidades || [],
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [clinicId])

  const slots = useMemo(() => {
    const proId = +form.profesionalId
    if (!proId || !form.fecha) return []
    const dow = new Date(`${form.fecha}T12:00:00`).getDay()
    const rows = (opts.disponibilidades || []).filter(r => +r.empleadoId === proId && +r.diaSemana === dow && r.activo !== false)
    const out = []
    for (const r of rows) {
      let cur = String(r.horaDesde || "09:00").slice(0, 5)
      const end = String(r.horaHasta || "18:00").slice(0, 5)
      while (cur < end) {
        out.push(cur)
        const [h, m] = cur.split(":").map(Number)
        const d = new Date(2000, 0, 1, h || 0, m || 0)
        d.setMinutes(d.getMinutes() + 30)
        cur = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      }
    }
    return [...new Set(out)].sort()
  }, [opts.disponibilidades, form.profesionalId, form.fecha])
  const selectedDow = useMemo(() => (form.fecha ? new Date(`${form.fecha}T12:00:00`).getDay() : null), [form.fecha])
  const diasDisponiblesTxt = useMemo(() => {
    const proId = +form.profesionalId
    if (!proId) return ""
    const ds = [...new Set(
      (opts.disponibilidades || [])
        .filter(r => +r.empleadoId === proId && r.activo !== false)
        .map(r => +r.diaSemana)
    )].sort((a, b) => a - b)
    return ds.map(d => DIA_SEMANA[d] || d).join(", ")
  }, [opts.disponibilidades, form.profesionalId])

  useEffect(() => {
    if (!Array.isArray(slots) || slots.length === 0) return
    if (slots.includes(form.hora)) return
    setForm(f => ({ ...f, hora: slots[0] }))
  }, [slots, form.hora])

  const reservar = async () => {
    setOkMsg("")
    if (!form.nombre.trim() || !form.tel.trim() || !form.profesionalId || !form.servicioId || !form.fecha || !form.hora) {
      alert("Completá todos los campos.")
      return
    }
    const r = await fetch("/api/erp/public-booking/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinicId,
        nombre: form.nombre.trim(),
        tel: form.tel.trim(),
        profesionalId: +form.profesionalId,
        servicioId: +form.servicioId,
        fecha: form.fecha,
        hora: form.hora,
      }),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j?.ok) {
      alert(j?.error || "No se pudo registrar la reserva.")
      return
    }
    setOkMsg("Reserva confirmada. Te esperamos en clínica.")
    setForm(f => ({ ...f, hora: "" }))
  }

  return (
    <div style={{ minHeight:"100dvh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ width:"100%", maxWidth:560, background:C.card, borderRadius:16, padding:22, boxShadow:"0 8px 30px rgba(0,0,0,.08)" }}>
        <h2 style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>Reservá tu turno</h2>
        <p style={{ fontSize:13, color:C.muted, marginBottom:14 }}>Elegí especialista y horario disponible. Tu turno queda agendado en clínica automáticamente.</p>
        {loading ? <div style={{ fontSize:13, color:C.muted }}>Cargando disponibilidad…</div> : (
          <>
            <div style={{ display:"grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap:10 }}>
              <FG label="Nombre y apellido" full><input style={inp} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}/></FG>
              <FG label="Teléfono" full><input style={inp} value={form.tel} onChange={e => setForm(f => ({ ...f, tel: e.target.value }))}/></FG>
              <FG label="Especialista">
                <select style={inp} value={form.profesionalId} onChange={e => setForm(f => ({ ...f, profesionalId: e.target.value, hora: "" }))}>
                  <option value="">Seleccionar…</option>
                  {opts.profesionales.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </FG>
              <FG label="Servicio">
                <select style={inp} value={form.servicioId} onChange={e => setForm(f => ({ ...f, servicioId: e.target.value }))}>
                  <option value="">Seleccionar…</option>
                  {opts.servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </FG>
              <FG label="Fecha"><input type="date" style={inp} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value, hora: "" }))}/></FG>
              <FG label="Hora">
                <select style={inp} value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}>
                  <option value="">{slots.length ? "Seleccionar…" : "Sin disponibilidad este día"}</option>
                  {slots.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </FG>
            </div>
            {form.profesionalId && slots.length === 0 && (
              <p style={{ fontSize:12, color:C.muted, marginTop:8 }}>
                Sin cupos para {selectedDow != null ? (DIA_SEMANA[selectedDow] || selectedDow) : "ese día"}.
                {diasDisponiblesTxt ? ` Este especialista atiende: ${diasDisponiblesTxt}.` : ""}
              </p>
            )}
            <div style={{ marginTop:12, display:"flex", gap:8, flexWrap:"wrap" }}>
              <Btn onClick={() => void reservar()}>Confirmar reserva</Btn>
              {okMsg && <span style={{ fontSize:12, color:"#065f46", background:"#d1fae5", borderRadius:8, padding:"8px 10px" }}>{okMsg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const MENSAJES_ANALISIS_IA_AUDIO = [
  "Transcribiendo y analizando el audio…",
  "Extrayendo hallazgos clínicos…",
  "Redactando evaluación detallada…",
  "Generando protocolo y notas…",
  "Sincronizando con catálogo e insumos…",
]
const MENSAJES_ANALISIS_IA_TEXTO = [
  "Analizando la consulta…",
  "Estructurando la evaluación clínica…",
  "Desarrollando protocolo profesional…",
  "Alineando servicio e insumos…",
]

/** Croquis frontal estilo dibujo técnico (proporciones clásicas: eje vertical + líneas de construcción). viewBox 0–100. */
function FaceCroquisTechnicalSvg({ withDimmedMask = false, bottomHint = null, stroke = "#a78bfa" }) {
  const uid = useId()
  const maskId = `faceCroquisMask-${uid.replace(/:/g, "")}`
  const facePath =
    "M50 24 C72 24 79 38 79 53 C79 69 68 80 50 83 C32 80 21 69 21 53 C21 38 28 24 50 24 Z"
  const hx = [24, 76]
  const ys = [32, 38, 45, 56, 64]
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none" }}>
      {withDimmedMask && (
        <>
          <defs>
            <mask id={maskId}>
              <rect width="100" height="100" fill="white" />
              <path d={facePath} fill="black" />
            </mask>
          </defs>
          <rect width="100" height="100" fill="rgba(0,0,0,0.38)" mask={`url(#${maskId})`} />
        </>
      )}
      <path d={facePath} fill="none" stroke={stroke} strokeWidth="0.45" opacity={withDimmedMask ? 0.95 : 0.85} />
      <line x1="50" y1="28" x2="50" y2="82" stroke={stroke} strokeWidth="0.22" opacity={0.55} />
      {ys.map((y, i) => (
        <line
          key={i}
          x1={hx[0]}
          y1={y}
          x2={hx[1]}
          y2={y}
          stroke={stroke}
          strokeWidth="0.18"
          opacity={0.45 + i * 0.04}
          strokeDasharray={i === 0 || i === 4 ? "1.2 0.8" : undefined}
        />
      ))}
      <path d="M22 46 C20 50 20 54 22 58" fill="none" stroke={stroke} strokeWidth="0.28" opacity={0.55} />
      <path d="M78 46 C80 50 80 54 78 58" fill="none" stroke={stroke} strokeWidth="0.28" opacity={0.55} />
      <path d="M38 80 L36 92 M62 80 L64 92" stroke={stroke} strokeWidth="0.22" opacity={0.45} />
      {bottomHint && (
        <text x="50" y="96" fill="#c4b5fd" fontSize="3.2" fontWeight="700" textAnchor="middle" fontFamily="system-ui">
          {bottomHint}
        </text>
      )}
    </svg>
  )
}

// ─── ÁREA MÉDICA — sesión vía QR (?ctx=) ───────────────────────
/**
 * Croquis MediaPipe en vivo: aparcado (retomar más adelante).
 * En false la cámara es solo vídeo + captura; en true se reactivan overlay, capas y panel.
 */
const SHOW_FACE_CROQUIS_LIVE = false

function DoctorSessionView({ data, setData, ctx, nombreProfesional, onExit, clinicNombre, sessionEmail, onConsentSaved }) {
  const narrow = useMediaQuery("(max-width: 640px)")
  const { clinicId, turnoId } = ctx
  const bumped = useRef(false)
  const [evaluacion, setEvaluacion] = useState("")
  /** Servicios a facturar en esta sesión (uno o varios). */
  const [serviciosOrdenIds, setServiciosOrdenIds] = useState([])
  const [protocolo, setProtocolo] = useState("")
  const [notas, setNotas] = useState("")
  const [motivoConsultaIA, setMotivoConsultaIA] = useState("")
  const [alergiasIA, setAlergiasIA] = useState([])
  const [tratamientosIA, setTratamientosIA] = useState([])
  const [openNuevoServicio, setOpenNuevoServicio] = useState(false)
  const [savingNuevoServicio, setSavingNuevoServicio] = useState(false)
  const [formNuevoServicio, setFormNuevoServicio] = useState({ nombre:"", cat:"clinico", precio:"", duracion:"30" })
  const [qty, setQty] = useState({})
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fotoInputRef = useRef(null)
  const [facePreview, setFacePreview] = useState(null)
  /** iPad: tres tomas (frente + perfiles) para mostrar al paciente; el análisis usa solo la de frente. */
  const [faceTripleShot, setFaceTripleShot] = useState({ front: null, profileLeft: null, profileRight: null })
  const faceTripleRef = useRef({ front: null, profileLeft: null, profileRight: null })
  /** 0–2 = siguiente captura; 3 = sesión de fotos cerrada en iPad. */
  const [faceShotIndex, setFaceShotIndex] = useState(0)
  const [faceRearCamera, setFaceRearCamera] = useState(false)
  const [faceAnalyzing, setFaceAnalyzing] = useState(false)
  const [faceResult, setFaceResult] = useState(null)
  const [faceError, setFaceError] = useState("")
  const [camaraEncendida, setCamaraEncendida] = useState(false)
  /** MediaPipe Face Mesh en vivo (face-proportion-overlay). */
  const [faceMeshStatus, setFaceMeshStatus] = useState("idle")
  const faceMeshCanvasRef = useRef(null)
  const faceMeshStopRef = useRef(null)
  const annotCanvasRef = useRef(null)
  const annotDrawing = useRef(false)
  const annotHistory = useRef([])
  const [annotColor, setAnnotColor] = useState("#FF3B30")
  const [annotSize, setAnnotSize] = useState(3)
  const [annotMode, setAnnotMode] = useState("pencil")
  const [annotActive, setAnnotActive] = useState(false)
  const [annotShowGuide, setAnnotShowGuide] = useState(true)
  const [faceLandmarks, setFaceLandmarks] = useState(null)
  const [faceLandmarksLoading, setFaceLandmarksLoading] = useState(false)
  /** Landmarks MediaPipe sobre la foto fija (captura/archivo) para el modal Anotar — sin guía estática. */
  const [mpAnnotLandmarks, setMpAnnotLandmarks] = useState(null)
  const [mpAnnotDims, setMpAnnotDims] = useState(null)
  const [mpAnnotStatus, setMpAnnotStatus] = useState("idle")
  const mpGuideCanvasRef = useRef(null)
  /** Ajustes croquis MediaPipe (cámara en vivo + foto en anotar). */
  const [faceOvZones, setFaceOvZones] = useState({
    oval: true,
    brows: true,
    eyes: true,
    nose: true,
    lips: true,
    jaw: true,
    forehead: true,
    papada: true,
    guides: true,
  })
  const [faceOvGrosor, setFaceOvGrosor] = useState(100)
  const [faceOvOpacidad, setFaceOvOpacidad] = useState(88)
  const [faceOvMalla, setFaceOvMalla] = useState(false)
  const [faceOcrLoading, setFaceOcrLoading] = useState(false)
  const [faceOcrText, setFaceOcrText] = useState("")
  const [faceOcrErr, setFaceOcrErr] = useState("")
  const [faceDfLoading, setFaceDfLoading] = useState(false)
  const [faceDfResult, setFaceDfResult] = useState(null)
  const [faceDfErr, setFaceDfErr] = useState("")
  const [faceDfLiveEnabled, setFaceDfLiveEnabled] = useState(false)
  const [faceDfLiveTick, setFaceDfLiveTick] = useState(0)
  const [faceDfWorkerStatus, setFaceDfWorkerStatus] = useState({ polling: false })
  const faceDfLiveBusyRef = useRef(false)
  const faceDfLiveTimerRef = useRef(0)
  const runFaceDeepfaceRef = useRef(null)
  const [docDictadoTexto, setDocDictadoTexto] = useState("")
  const [docEscuchando, setDocEscuchando] = useState(false)
  const [docGrabando, setDocGrabando] = useState(false)
  const [docIaLoading, setDocIaLoading] = useState(false)
  const [docIaError, setDocIaError] = useState("")
  const docDictadoRef = useRef("")
  const docSpeechRef = useRef(null)
  const docAudioStreamRef = useRef(null)
  const docMediaRecorderRef = useRef(null)
  const docAudioChunksRef = useRef([])
  const [verStockCompleto, setVerStockCompleto] = useState(false)
  /** Sesión triple: vista cámara a pantalla completa para encuadre. */
  const [camaraFullscreen, setCamaraFullscreen] = useState(false)
  const [docIaModo, setDocIaModo] = useState(null)
  const [analisisMsgIdx, setAnalisisMsgIdx] = useState(0)
  /** Asistente por fases: veredicto → IA → fotos antes → resultado (texto+IA + fotos después) → evaluación → orden (sesion_medica_borrador). */
  const [wizardFase, setWizardFase] = useState("veredicto")
  const borradorSesionListoRef = useRef(false)
  const [finalizando, setFinalizando] = useState(false)
  const [askExtrasOpen, setAskExtrasOpen] = useState(false)
  const [allowFinalizeWithoutExtras, setAllowFinalizeWithoutExtras] = useState(false)
  const [textoResultado, setTextoResultado] = useState("")
  const resultadoDictadoRef = useRef("")
  const resSpeechRef = useRef(null)
  const [resEscuchando, setResEscuchando] = useState(false)
  const [resultadoIaLoading, setResultadoIaLoading] = useState(false)
  const [resGrabando, setResGrabando] = useState(false)
  const resAudioStreamRef = useRef(null)
  const resMediaRecorderRef = useRef(null)
  const resAudioChunksRef = useRef([])
  const [modalGuiaDespuesOpen, setModalGuiaDespuesOpen] = useState(false)
  const [confirmSinDespuesOpen, setConfirmSinDespuesOpen] = useState(false)
  const allowFinalizeSinDespuesRef = useRef(false)
  const [medSessionModal, setMedSessionModal] = useState({ open: false, title: "", body: "" })
  const [plantillasConsentArea, setPlantillasConsentArea] = useState(() => getPlantillasConsentLocales())
  const [openConsArea, setOpenConsArea] = useState(false)
  const [formConsArea, setFormConsArea] = useState({ plantillaSlug: "", servicioProducto: "" })
  const [savingConsArea, setSavingConsArea] = useState(false)
  /** Tras «PDF + registrar» exitoso: datos para vista previa; `mostrarPdf` tras pulsar «Vista previa». */
  const [consentAreaVistaPrevia, setConsentAreaVistaPrevia] = useState(null)
  const sigPacienteRef = useRef(null)
  const sigProfesionalRef = useRef(null)
  const [savingFotoFicha, setSavingFotoFicha] = useState(false)
  const [fotoFichaTipo, setFotoFichaTipo] = useState("antes")
  const [fotoFichaGuardada, setFotoFichaGuardada] = useState(false)
  /** En sesión médica: 3 fotos antes + 3 después (frente → perfil der. → perfil izq.). */
  const usarTripleSesionMedica = true
  const [fotoSesionFase, setFotoSesionFase] = useState("antes")
  const [despuesTripleCompleto, setDespuesTripleCompleto] = useState(false)
  const [guardandoTripleFicha, setGuardandoTripleFicha] = useState(false)
  const [notaPlanMarcado, setNotaPlanMarcado] = useState("")
  const [savingPlanMarcado, setSavingPlanMarcado] = useState(false)

  const cd = data.clinics[clinicId]
  const turno = cd?.turnos?.find(t => t.id === turnoId) ?? null
  const profs = data.profesionales || []
  const stock = cd?.stock || []
  const pacienteIdSesion = turno ? (turno.pacienteId ?? findPacienteIdByNombre(data, turno.cliente, clinicId)) : null
  const pacienteSesion = pacienteIdSesion ? data.pacientes?.find(p => +p.id === +pacienteIdSesion) : null

  useEffect(() => {
    setFotoSesionFase("antes")
    setDespuesTripleCompleto(false)
    setFaceShotIndex(0)
    faceTripleRef.current = { front: null, profileLeft: null, profileRight: null }
    setFaceTripleShot({ front: null, profileLeft: null, profileRight: null })
    setFacePreview(null)
    setFotoFichaGuardada(false)
    setWizardFase("veredicto")
    setTextoResultado("")
    resultadoDictadoRef.current = ""
    borradorSesionListoRef.current = false
  }, [turnoId])

  useEffect(() => {
    if (!turno || borradorSesionListoRef.current) return
    const b = turno.sesionMedicaBorrador
    if (b && typeof b === "object" && b.v === 1) {
      if (typeof b.docDictadoTexto === "string") {
        setDocDictadoTexto(b.docDictadoTexto)
        docDictadoRef.current = b.docDictadoTexto
      }
      if (typeof b.evaluacion === "string") setEvaluacion(b.evaluacion)
      if (typeof b.protocolo === "string") setProtocolo(b.protocolo)
      if (typeof b.notas === "string") setNotas(b.notas)
      if (typeof b.motivoConsultaIA === "string") setMotivoConsultaIA(b.motivoConsultaIA)
      if (Array.isArray(b.alergiasIA)) setAlergiasIA(b.alergiasIA)
      if (Array.isArray(b.tratamientosIA)) setTratamientosIA(b.tratamientosIA)
      if (Array.isArray(b.serviciosOrdenIds) && b.serviciosOrdenIds.length) {
        const ids = b.serviciosOrdenIds.map(id => +id).filter(id => (data.servicios || []).some(s => s.id === id))
        if (ids.length) setServiciosOrdenIds(ids)
      } else if (b.servicioSel != null && (data.servicios || []).some(s => s.id === +b.servicioSel)) {
        setServiciosOrdenIds([+b.servicioSel])
      }
      if (b.qty && typeof b.qty === "object") setQty(b.qty)
      if (b.fotoSesionFase === "antes" || b.fotoSesionFase === "despues") setFotoSesionFase(b.fotoSesionFase)
      if (typeof b.despuesTripleCompleto === "boolean") setDespuesTripleCompleto(b.despuesTripleCompleto)
      if (typeof b.textoResultado === "string") setTextoResultado(b.textoResultado)
      const validF = ["veredicto", "propuesta_ia", "registro", "resultado", "evaluacion", "orden"]
      if (typeof b.wizardFase === "string" && validF.includes(b.wizardFase)) setWizardFase(b.wizardFase)
    }
    borradorSesionListoRef.current = true
  }, [turno, turnoId, data.servicios])

  useEffect(() => {
    if (!usarTripleSesionMedica) return
    if (wizardFase === "registro") setFotoSesionFase("antes")
    if (wizardFase === "resultado") setFotoSesionFase("despues")
  }, [wizardFase, usarTripleSesionMedica])

  useEffect(() => {
    if (!annotActive) return
    setNotaPlanMarcado(protocolo.trim().slice(0, 800))
  }, [annotActive])

  useEffect(() => {
    // Plantillas locales (WeTransfer oficial) ya están cargadas como valor
    // inicial. Si hay Supabase, las remotas tienen prioridad por slug.
    if (!import.meta.env.VITE_SUPABASE_URL) {
      setPlantillasConsentArea(getPlantillasConsentLocales())
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: pls, error } = await supabase
        .from("consentimiento_plantillas")
        .select("slug, titulo, categoria, cuerpo_texto, archivo_docx_url")
        .eq("activo", true)
        .order("categoria", { ascending: true })
        .order("titulo", { ascending: true })
      if (cancelled) return
      setPlantillasConsentArea(mergePlantillasConsent(error ? [] : (pls || [])))
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!openConsArea) return
    const id = requestAnimationFrame(() => {
      sigPacienteRef.current?.clear?.()
      sigProfesionalRef.current?.clear?.()
    })
    return () => cancelAnimationFrame(id)
  }, [openConsArea])

  useEffect(() => { setVerStockCompleto(false) }, [serviciosOrdenIds])
  // Resetear el estado "foto guardada" al cambiar de foto
  useEffect(() => {
    if (despuesTripleCompleto && usarTripleSesionMedica) {
      setFotoFichaGuardada(true)
      return
    }
    setFotoFichaGuardada(false)
  }, [facePreview, despuesTripleCompleto, usarTripleSesionMedica])

  useEffect(() => {
    if (!docIaLoading && !resultadoIaLoading) {
      setAnalisisMsgIdx(0)
      return
    }
    setAnalisisMsgIdx(0)
    const lista = docIaModo === "audio" ? MENSAJES_ANALISIS_IA_AUDIO : MENSAJES_ANALISIS_IA_TEXTO
    const t = setInterval(() => {
      setAnalisisMsgIdx(i => (i + 1) % lista.length)
    }, 2400)
    return () => clearInterval(t)
  }, [docIaLoading, resultadoIaLoading, docIaModo])

  useEffect(() => {
    if (!camaraFullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [camaraFullscreen])

  useEffect(() => {
    if (!usarTripleSesionMedica || !camaraEncendida || !camaraFullscreen) return
    const id = requestAnimationFrame(() => {
      const v = videoRef.current
      const s = streamRef.current
      if (!v || !s) return
      v.srcObject = s
      void v.play().catch(() => {})
    })
    return () => cancelAnimationFrame(id)
  }, [usarTripleSesionMedica, camaraEncendida, camaraFullscreen])

  const mapServicioRow = row => ({
    id: row.id,
    nombre: row.nombre || "",
    cat: row.cat || "clinico",
    duracion: +row.duracion || 30,
    precio: +row.precio || 0,
    sesiones: +row.sesiones || 1,
    desc: row.descripcion || "",
    materialesStockIds: Array.isArray(row.materiales_articulo_ids) ? row.materiales_articulo_ids.map(n => +n).filter(n => n > 0) : [],
  })
  const normalizeServicioCat = raw => {
    const x = String(raw || "").trim().toLowerCase()
    return ["valoracion", "clinico", "facial", "corporal", "laser", "botox"].includes(x) ? x : "clinico"
  }
  const crearServicioRapido = async ({ nombre, cat, precio, duracion }) => {
    const nombreTrim = String(nombre || "").trim()
    if (!nombreTrim) return null
    const dup = (data.servicios || []).find(s => String(s.nombre || "").trim().toLowerCase() === nombreTrim.toLowerCase())
    if (dup) return dup
    const payload = {
      nombre: nombreTrim,
      cat: normalizeServicioCat(cat),
      precio: +precio || 0,
      duracion: +duracion || 30,
      sesiones: 1,
      descripcion: "Alta rápida desde sesión médica",
      materialesStockIds: [],
    }
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { data: { session: sb } } = await supabase.auth.getSession()
      const token = sb?.access_token
      if (!token) throw new Error("Tu sesión expiró. Volvé a iniciar sesión.")
      const r = await fetch("/api/erp/servicio/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.servicio) throw new Error(j?.error || "No se pudo crear el servicio.")
      const mapped = mapServicioRow(j.servicio)
      setData(d => ({ ...d, servicios: [...(d.servicios || []), mapped].sort((a, b) => (+a.id || 0) - (+b.id || 0)) }))
      return mapped
    }
    const nextId = (data.servicios || []).length ? Math.max(...data.servicios.map(s => +s.id || 0)) + 1 : 1
    const local = { id: nextId, ...payload, desc: payload.descripcion, materialesStockIds: [] }
    setData(d => ({ ...d, servicios: [...(d.servicios || []), local] }))
    return local
  }

  const defaultServicioId = t => {
    if (!t) return data.servicios[0]?.id ?? null
    const m = data.servicios.find(s => s.nombre === t.servicio)
    if (m) return m.id
    const c = data.servicios.find(s => s.cat === t.cat)
    return c?.id ?? data.servicios[0]?.id
  }

  useEffect(() => {
    if (!turno) return
    const d = defaultServicioId(turno)
    setServiciosOrdenIds(d != null ? [d] : [])
  }, [turno?.id])

  useEffect(() => {
    if (bumped.current || !turno || turno.estado !== "en_sala") return
    bumped.current = true
    const sid = defaultServicioId(turno)
    const srv = data.servicios.find(s => s.id === sid)
    const qtyBase = qtyMapFromMaterialesServicio(srv)
    const desde = narrow ? "movil" : "qr_escritorio"
    if (import.meta.env.VITE_SUPABASE_URL) {
      ;(async () => {
        const { error } = await supabase.from("turnos").update({
          estado: "en_curso",
          sesion_iniciada_desde: desde,
        }).eq("id", turnoId)
        if (error) {
          console.error("No se pudo persistir en_curso:", error.message)
          return
        }
        const { data: { session: sb } } = await supabase.auth.getSession()
        const token = sb?.access_token
        if (!token) return
        const r = await fetch("/api/erp/turno/marcar-paciente-area-medica", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ turnoId }),
        })
        if (r.ok) onConsentSaved?.()
        else {
          const j = await r.json().catch(() => null)
          console.warn("marcar-paciente-area-medica:", j?.error || r.status)
        }
      })()
    }
    setData(d => ({
      ...d,
      clinics: {
        ...d.clinics,
        [clinicId]: {
          ...d.clinics[clinicId],
          stock: d.clinics[clinicId].stock.map(p => {
            const c = qtyBase[p.id] || 0
            if (c <= 0) return p
            return { ...p, stock: Math.max(0, (+p.stock || 0) - c) }
          }),
          turnos: d.clinics[clinicId].turnos.map(t => (t.id === turnoId ? {
            ...t,
            estado: "en_curso",
            sesionIniciadaDesde: desde,
            sesionIniciadaAt: new Date().toISOString(),
            consumoBaseStock: qtyBase,
          } : t)),
        },
      },
    }))
  }, [turno?.id, turno?.estado, clinicId, turnoId, setData, narrow, data.servicios, onConsentSaved])

  const detenerCamara = (opts = {}) => {
    const preserveTriple = opts.preserveTriple === true
    try {
      faceMeshStopRef.current?.()
    } catch { /* ignore */ }
    faceMeshStopRef.current = null
    setFaceMeshStatus("idle")
    try {
      streamRef.current?.getTracks?.().forEach(t => t.stop())
    } catch { /* ignore */ }
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamaraEncendida(false)
    setCamaraFullscreen(false)
    setFaceRearCamera(false)
    setFaceDfLiveEnabled(false)
    setFaceOverlayLiveMirror(true)
    if (!preserveTriple && usarTripleSesionMedica && faceShotIndex < 3) {
      faceTripleRef.current = { front: null, profileLeft: null, profileRight: null }
      setFaceTripleShot({ front: null, profileLeft: null, profileRight: null })
      setFaceShotIndex(0)
    }
  }

  useEffect(() => () => { detenerCamara() }, [])

  useEffect(() => {
    if (!camaraEncendida || !SHOW_FACE_CROQUIS_LIVE) return
    const v = videoRef.current
    const c = faceMeshCanvasRef.current
    if (!v || !c) return
    let cancelled = false
    const boot = async () => {
      await new Promise(resolve => {
        if (v.videoWidth > 0) {
          resolve()
          return
        }
        const done = () => resolve()
        v.addEventListener("loadedmetadata", done, { once: true })
        window.setTimeout(done, 2500)
      })
      if (cancelled) return
      setFaceMeshStatus("loading")
      try {
        const { stop } = startFaceProportionOverlay({
          video: v,
          canvas: c,
          onStatus: (st) => {
            if (st === "error") setFaceMeshStatus("error")
            else if (typeof st === "string") setFaceMeshStatus(st)
          },
        })
        faceMeshStopRef.current = stop
      } catch {
        setFaceMeshStatus("error")
      }
    }
    void boot()
    return () => {
      cancelled = true
      try {
        faceMeshStopRef.current?.()
      } catch { /* ignore */ }
      faceMeshStopRef.current = null
      setFaceMeshStatus("idle")
    }
  }, [camaraEncendida])

  useEffect(() => () => {
    const mr = docMediaRecorderRef.current
    if (mr?.state === "recording") {
      try { mr.requestData?.() } catch { /* ignore */ }
      try { mr.stop() } catch { /* ignore */ }
    }
    try {
      docAudioStreamRef.current?.getTracks?.().forEach(t => t.stop())
    } catch { /* ignore */ }
  }, [])

  /**
   * Análisis combinado real: DeepFace (local) + OpenAI Vision (clínico-estético).
   * Llama /api/face-analysis/full y guarda el JSON crudo en faceResult.
   */
  const ejecutarAnalisisReal = useCallback(async (opts = {}) => {
    const background = opts.background === true
    const b64 = await grabFaceFrameBase64Async(
      background ? { maxWidth: 720, quality: 0.82 } : { maxWidth: 1200, quality: 0.9 },
    )
    if (!b64) {
      if (!background) setFaceError("No hay imagen: abrí la cámara o elegí una foto.")
      return null
    }
    if (!background) {
      setFaceAnalyzing(true)
      setFaceError("")
    }
    try {
      const j = await callFaceAnalysisFull(b64, { includeAi: true })
      if (!j?.ok) {
        const msg = j?.error || "Error de análisis"
        if (!background) setFaceError(msg)
        return null
      }
      if (j.face_found === false) {
        if (!background) setFaceError("No se detectó rostro en la imagen.")
        return j
      }
      setFaceResult({
        _real: true,
        _ts: Date.now(),
        deepface: j.deepface || null,
        clinico: j.clinico || null,
        clinicoError: j.clinicoError || null,
      })
      return j
    } catch (e) {
      if (!background) setFaceError(String(e?.message || e))
      return null
    } finally {
      if (!background) setFaceAnalyzing(false)
    }
  }, [])

  const ejecutarAnalisisRealRef = useRef(null)
  useEffect(() => { ejecutarAnalisisRealRef.current = ejecutarAnalisisReal }, [ejecutarAnalisisReal])

  // Mantener nombre legacy para no romper call sites existentes (captura, archivo, triple).
  const ejecutarAnalisisSimulado = () => {
    void ejecutarAnalisisReal({ background: false })
  }

  /** Loop en vivo combinado: OpenAI cada ~12 s mientras DeepFace en vivo esté activo. */
  const faceFullLiveTimerRef = useRef(0)
  const faceFullLiveBusyRef = useRef(false)
  useEffect(() => {
    if (!faceDfLiveEnabled || !camaraEncendida) {
      if (faceFullLiveTimerRef.current) {
        window.clearTimeout(faceFullLiveTimerRef.current)
        faceFullLiveTimerRef.current = 0
      }
      return
    }
    let cancelled = false
    const loop = async () => {
      if (cancelled || !faceDfLiveEnabled || !camaraEncendida) return
      if (!faceFullLiveBusyRef.current) {
        faceFullLiveBusyRef.current = true
        try { await ejecutarAnalisisRealRef.current?.({ background: true }) }
        catch { /* tolerado */ }
        finally { faceFullLiveBusyRef.current = false }
      }
      if (cancelled || !faceDfLiveEnabled || !camaraEncendida) return
      faceFullLiveTimerRef.current = window.setTimeout(loop, 12000)
    }
    faceFullLiveTimerRef.current = window.setTimeout(loop, 5000)
    return () => {
      cancelled = true
      if (faceFullLiveTimerRef.current) {
        window.clearTimeout(faceFullLiveTimerRef.current)
        faceFullLiveTimerRef.current = 0
      }
    }
  }, [faceDfLiveEnabled, camaraEncendida])

  /** Volcado automático del último análisis IA al protocolo de la sesión (idempotente por marca). */
  const lastAutoInsertRef = useRef("")
  useEffect(() => {
    if (!faceResult?._real || !faceResult?.clinico) return
    const c = faceResult.clinico
    const df = faceResult.deepface || {}
    const recs = Array.isArray(c.recomendaciones) ? c.recomendaciones.filter(Boolean) : []
    const arrugas = Array.isArray(c.arrugas) ? c.arrugas.filter(Boolean) : []
    const alertas = Array.isArray(c.alertas) ? c.alertas.filter(Boolean) : []
    const texto =
      `\n\n[Análisis IA rostro — ${new Date(faceResult._ts || Date.now()).toLocaleString("es-ES")}]\n` +
      `DeepFace: edad ~${df.age ?? "—"}, ${df.dominant_gender ?? "—"}, ${df.dominant_emotion ?? "—"}${df.dominant_race ? `, ${df.dominant_race}` : ""}.\n` +
      `Piel: ${c.tipoPiel || "—"} · fototipo ${c.fototipo || "—"} · hidratación ${c.hidratacion || "—"} · luminosidad ${c.luminosidad || "—"}.\n` +
      (c.simetria ? `Simetría: ${c.simetria}.\n` : "") +
      (arrugas.length ? `Arrugas: ${arrugas.join(", ")}.\n` : "") +
      (c.manchas ? `Manchas: ${c.manchas}.\n` : "") +
      (c.porosYTextura ? `Poros/textura: ${c.porosYTextura}.\n` : "") +
      (c.ojeras ? `Ojeras: ${c.ojeras}.\n` : "") +
      (c.flacidez ? `Flacidez: ${c.flacidez}.\n` : "") +
      (c.observacionesClinicas ? `Observaciones: ${c.observacionesClinicas}.\n` : "") +
      (recs.length ? `Recomendaciones: ${recs.join("; ")}.\n` : "") +
      (alertas.length ? `Alertas: ${alertas.join("; ")}.\n` : "") +
      (c.disclaimer ? `${c.disclaimer}` : "")
    if (texto === lastAutoInsertRef.current) return
    lastAutoInsertRef.current = texto
    setProtocolo(prev => {
      const marker = "[Análisis IA rostro"
      const idx = prev.indexOf(marker)
      if (idx < 0) return (prev || "") + texto
      const before = prev.slice(0, idx).replace(/\n+$/, "")
      return `${before}${texto}`
    })
  }, [faceResult])

  const abrirCamara = async () => {
    setFaceError("")
    setFaceResult(null)
    setFacePreview(null)
    faceTripleRef.current = { front: null, profileLeft: null, profileRight: null }
    setFaceTripleShot({ front: null, profileLeft: null, profileRight: null })
    setFaceShotIndex(0)
    setMpAnnotLandmarks(null)
    setMpAnnotDims(null)
    setMpAnnotStatus("idle")
    setFaceOvZones({
      oval: true,
      brows: true,
      eyes: true,
      nose: true,
      lips: true,
      jaw: true,
      forehead: true,
      papada: true,
      guides: true,
    })
    const hint = mediaInsecureContextHint()
    try {
      detenerCamara({ preserveTriple: true })
      let stream
      const pad = usarTripleSesionMedica || isIPad()
      if (pad) {
        stream = await getMedicalAreaCameraStream()
      } else {
        try {
          stream = await getUserMediaCompat({
            video: { facingMode: { ideal: "user" }, width: { ideal: 720 } },
            audio: false,
          })
        } catch {
          try {
            stream = await getUserMediaCompat({
              video: { facingMode: "user" },
              audio: false,
            })
          } catch {
            stream = await getUserMediaCompat({ video: true, audio: false })
          }
        }
      }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      const fm = track?.getSettings?.()?.facingMode
      const rear = fm === "environment" || (pad && fm !== "user")
      setFaceRearCamera(!!rear)
      setFaceOverlayLiveMirror(!rear)
      if (videoRef.current) {
        const v = videoRef.current
        v.setAttribute("playsinline", "true")
        v.playsInline = true
        v.muted = true
        v.srcObject = stream
        await v.play()
      }
      setCamaraEncendida(true)
      if (usarTripleSesionMedica) setCamaraFullscreen(true)
    } catch (e) {
      const name = e?.name || ""
      const msg =
        e?.message === "NO_GET_USER_MEDIA"
          ? "Este entorno no permite abrir la cámara desde esta página."
          : name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "La cámara fue bloqueada. Permití el acceso en Ajustes → Safari → Cámara, o tocá el candado en la barra de direcciones."
            : name === "NotFoundError" || name === "DevicesNotFoundError"
              ? "No se detectó cámara."
              : name === "NotReadableError" || name === "TrackStartError"
                ? "La cámara está en uso por otra aplicación."
                : "No se pudo abrir la cámara. Podés usar «Elegir foto del rostro»."
      setFaceError(msg + hint)
    }
  }

  const grabFaceFrameBase64Async = async (opts = {}) => {
    const maxW = typeof opts.maxWidth === "number" ? opts.maxWidth : 0
    const quality = typeof opts.quality === "number" ? opts.quality : 0.88
    const drawToScaled = (srcW, srcH, drawer) => {
      let w = srcW
      let h = srcH
      if (maxW > 0 && w > maxW) {
        const ratio = maxW / w
        w = maxW
        h = Math.round(srcH * ratio)
      }
      const c = document.createElement("canvas")
      c.width = w
      c.height = h
      drawer(c.getContext("2d"), w, h)
      return c.toDataURL("image/jpeg", quality).split(",")[1]
    }
    const v = videoRef.current
    if (camaraEncendida && v?.videoWidth) {
      return drawToScaled(v.videoWidth, v.videoHeight, (ctx2, w, h) => {
        ctx2.drawImage(v, 0, 0, w, h)
      })
    }
    if (facePreview?.startsWith("data:") && !maxW) return facePreview.split(",")[1]
    if (facePreview?.startsWith("data:") || facePreview?.startsWith("blob:")) {
      // blob: URLs son same-origin: NO usar crossOrigin = "anonymous" (causa tainted canvas)
      const img = await new Promise((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error("No se pudo leer la imagen"))
        i.src = facePreview
      })
      return drawToScaled(img.naturalWidth, img.naturalHeight, (ctx2, w, h) => {
        ctx2.drawImage(img, 0, 0, w, h)
      })
    }
    return null
  }

  const runFaceOcr = async () => {
    setFaceOcrErr("")
    setFaceOcrText("")
    setFaceOcrLoading(true)
    try {
      const b64 = await grabFaceFrameBase64Async()
      if (!b64) {
        setFaceOcrErr("No hay imagen: abrí la cámara o elegí una foto.")
        return
      }
      const r = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: b64 }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || "Error OCR")
      setFaceOcrText(j?.text || "")
    } catch (e) {
      setFaceOcrErr(String(e?.message || e))
    } finally {
      setFaceOcrLoading(false)
    }
  }

  const runFaceDeepface = async (opts = {}) => {
    const background = opts.background === true
    if (faceDfLiveBusyRef.current) return false
    faceDfLiveBusyRef.current = true
    if (!background) {
      setFaceDfErr("")
      setFaceDfResult(null)
    }
    setFaceDfLoading(true)
    try {
      const b64 = await grabFaceFrameBase64Async(
        background ? { maxWidth: 512, quality: 0.78 } : {},
      )
      if (!b64) {
        setFaceDfErr("No hay imagen: abrí la cámara o elegí una foto.")
        return false
      }
      const r = await fetch(FACE_ANALYZE_URL, {
        method: "POST",
        headers: faceRemoteHeaders(),
        body: JSON.stringify({ image_base64: b64 }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        const msg = j?.error || "Error DeepFace"
        if (background) {
          setFaceDfErr(msg)
        } else {
          throw new Error(msg)
        }
        return false
      }
      if (j && j.ok && j.face_found === false) {
        // en vivo: no es error, sólo "no hay cara ahora"
        if (background) {
          setFaceDfErr("Buscando rostro… acercate y mirá a la cámara")
        } else {
          setFaceDfErr("No se detectó rostro (acercate, luz frontal o mirá a la cámara).")
        }
        if (background) setFaceDfLiveTick(t => t + 1)
        return true
      }
      setFaceDfErr("")
      setFaceDfResult(j)
      if (background) setFaceDfLiveTick(t => t + 1)
      return true
    } catch (e) {
      setFaceDfErr(String(e?.message || e))
      return false
    } finally {
      setFaceDfLoading(false)
      faceDfLiveBusyRef.current = false
    }
  }

  useEffect(() => {
    runFaceDeepfaceRef.current = runFaceDeepface
  }, [runFaceDeepface])

  useEffect(() => {
    let cancelled = false
    if (!faceDfLiveEnabled) {
      setFaceDfWorkerStatus(s => ({ ...s, polling: false }))
      return () => {}
    }
    setFaceDfWorkerStatus(s => ({ ...s, polling: true }))
    const poll = async () => {
      if (cancelled) return
      try {
        const r = await fetch(FACE_STATUS_URL)
        if (r.ok) {
          const j = await r.json()
          setFaceDfWorkerStatus({ polling: true, ...j })
        }
      } catch { /* silencioso: el endpoint puede no existir en producción */ }
      if (!cancelled) window.setTimeout(poll, 1500)
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [faceDfLiveEnabled])

  useEffect(() => {
    if (!faceDfLiveEnabled || !camaraEncendida) {
      if (faceDfLiveTimerRef.current) {
        window.clearTimeout(faceDfLiveTimerRef.current)
        faceDfLiveTimerRef.current = 0
      }
      return
    }
    let cancelled = false
    const loop = async () => {
      if (cancelled || !faceDfLiveEnabled || !camaraEncendida) return
      await runFaceDeepfaceRef.current?.({ background: true })
      if (cancelled || !faceDfLiveEnabled || !camaraEncendida) return
      faceDfLiveTimerRef.current = window.setTimeout(loop, 900)
    }
    loop()
    return () => {
      cancelled = true
      if (faceDfLiveTimerRef.current) {
        window.clearTimeout(faceDfLiveTimerRef.current)
        faceDfLiveTimerRef.current = 0
      }
    }
  }, [faceDfLiveEnabled, camaraEncendida])

  const analizarRostroConIA = async (dataUrl) => {
    setFaceLandmarksLoading(true)
    setFaceLandmarks(null)
    try {
      const r = await fetch("/api/openai/face-landmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl }),
      })
      const j = await r.json()
      if (j?.found && j?.landmarks) {
        setFaceLandmarks(j.landmarks)
      }
    } catch { /* silently fail — guide just won't appear */ }
    finally { setFaceLandmarksLoading(false) }
  }

  const runMediaPipeOnStillPreview = async (dataUrlOrBlobUrl) => {
    if (!dataUrlOrBlobUrl) return
    setMpAnnotStatus("loading")
    setMpAnnotLandmarks(null)
    setMpAnnotDims(null)
    const img = new Image()
    img.crossOrigin = "anonymous"
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = dataUrlOrBlobUrl
      })
    } catch {
      setMpAnnotStatus("fail")
      return
    }
    try {
      const lm = await detectFaceMeshOnImage(img)
      if (lm?.length) {
        setMpAnnotLandmarks(lm)
        setMpAnnotDims({ w: img.naturalWidth, h: img.naturalHeight })
        setMpAnnotStatus("ok")
      } else {
        setMpAnnotStatus("fail")
      }
    } catch {
      setMpAnnotStatus("fail")
    }
  }

  const capturarFotogramaYAnalizar = () => {
    const v = videoRef.current
    if (!v?.videoWidth) {
      setFaceError("Encendé la cámara y esperá la imagen.")
      return
    }
    let dataUrl = null
    try {
      const c = document.createElement("canvas")
      c.width = v.videoWidth
      c.height = v.videoHeight
      c.getContext("2d").drawImage(v, 0, 0)
      dataUrl = c.toDataURL("image/jpeg", 0.82)
    } catch {
      setFacePreview(null)
      setFaceError("No se pudo capturar el fotograma.")
      return
    }

    if (!usarTripleSesionMedica) {
      setFacePreview(dataUrl)
      setAnnotActive(false)
      setFaceLandmarks(null)
      annotHistory.current = []
      detenerCamara()
      ejecutarAnalisisSimulado()
      if (dataUrl) {
        void analizarRostroConIA(dataUrl)
        void runMediaPipeOnStillPreview(dataUrl)
      }
      return
    }

    const step = faceShotIndex
    if (step === 0) {
      faceTripleRef.current = { ...faceTripleRef.current, front: dataUrl }
      setFaceTripleShot({ ...faceTripleRef.current })
      setFaceShotIndex(1)
      return
    }
    if (step === 1) {
      faceTripleRef.current = { ...faceTripleRef.current, profileRight: dataUrl }
      setFaceTripleShot({ ...faceTripleRef.current })
      setFaceShotIndex(2)
      return
    }
    faceTripleRef.current = { ...faceTripleRef.current, profileLeft: dataUrl }
    setFaceTripleShot({ ...faceTripleRef.current })
    setFaceShotIndex(3)
    const tipoFase = fotoSesionFase
    detenerCamara({ preserveTriple: true })
    void (async () => {
      const ok = await guardarTripleEnFichaPaciente(tipoFase)
      if (!ok) return
      if (tipoFase === "antes") {
        // No avanzamos automáticamente al paso "Resultado": el médico decide
        // cuándo continuar tocando «Continuar a resultado».
        const frontUrlAntes = faceTripleRef.current.front
        setFotoFichaGuardada(true)
        setFaceError("")
        setAnnotActive(false)
        setFaceLandmarks(null)
        annotHistory.current = []
        if (frontUrlAntes) {
          setFacePreview(frontUrlAntes)
          void analizarRostroConIA(frontUrlAntes)
          void runMediaPipeOnStillPreview(frontUrlAntes)
        }
        return
      }
      setDespuesTripleCompleto(true)
      setFotoFichaGuardada(true)
      const frontUrl = faceTripleRef.current.front
      setFacePreview(frontUrl)
      setAnnotActive(false)
      setFaceLandmarks(null)
      annotHistory.current = []
      ejecutarAnalisisSimulado()
      if (frontUrl) {
        void analizarRostroConIA(frontUrl)
        void runMediaPipeOnStillPreview(frontUrl)
      }
    })()
  }

  /** Vuelve un paso en la secuencia triple para repetir la foto (borra capturas de ese paso en adelante). */
  const tripleVolverFotoAnterior = () => {
    if (!usarTripleSesionMedica || faceShotIndex <= 0) return
    const idx = faceShotIndex - 1
    setFaceShotIndex(idx)
    const ref = { ...faceTripleRef.current }
    if (idx === 0) {
      ref.front = null
      ref.profileRight = null
      ref.profileLeft = null
    } else if (idx === 1) {
      ref.profileRight = null
      ref.profileLeft = null
    }
    faceTripleRef.current = ref
    setFaceTripleShot({ ...ref })
  }

  const onFotoArchivo = e => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ""
    // Convertimos a data: URL directamente para evitar blob: URLs
    // que causan problemas de CORS al dibujar en canvas y expiran al cerrar la pestaña.
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || "")
      if (!dataUrl.startsWith("data:image/")) {
        setFaceError("Formato de imagen no soportado.")
        return
      }
      // Comprimir si el tamaño es grande (máx 1600px)
      const imgEl = new Image()
      imgEl.onload = () => {
        const maxDim = 1600
        let w = imgEl.naturalWidth
        let h = imgEl.naturalHeight
        const ratio = Math.min(maxDim / w, maxDim / h, 1)
        w = Math.max(1, Math.round(w * ratio))
        h = Math.max(1, Math.round(h * ratio))
        const cv = document.createElement("canvas")
        cv.width = w
        cv.height = h
        cv.getContext("2d").drawImage(imgEl, 0, 0, w, h)
        const compressed = cv.toDataURL("image/jpeg", 0.82)
        setFacePreview(compressed)
        if (usarTripleSesionMedica) {
          faceTripleRef.current = { front: compressed, profileLeft: null, profileRight: null }
          setFaceTripleShot({ ...faceTripleRef.current })
          setFaceShotIndex(3)
        }
        setAnnotActive(false)
        setFaceLandmarks(null)
        annotHistory.current = []
        ejecutarAnalisisSimulado()
        void analizarRostroConIA(compressed)
        void runMediaPipeOnStillPreview(compressed)
      }
      imgEl.onerror = () => {
        // Fallback: usar la data URL sin comprimir
        setFacePreview(dataUrl)
        if (usarTripleSesionMedica) {
          faceTripleRef.current = { front: dataUrl, profileLeft: null, profileRight: null }
          setFaceTripleShot({ ...faceTripleRef.current })
          setFaceShotIndex(3)
        }
        setAnnotActive(false)
        setFaceLandmarks(null)
        annotHistory.current = []
        ejecutarAnalisisSimulado()
        void analizarRostroConIA(dataUrl)
        void runMediaPipeOnStillPreview(dataUrl)
      }
      imgEl.src = dataUrl
    }
    reader.onerror = () => setFaceError("No se pudo leer el archivo de imagen.")
    reader.readAsDataURL(f)
  }

  const initAnnotCanvas = useCallback(() => {
    const cv = annotCanvasRef.current
    if (!cv) return
    const parent = cv.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    cv.width = rect.width * dpr
    cv.height = rect.height * dpr
    cv.style.width = `${rect.width}px`
    cv.style.height = `${rect.height}px`
    const ctx = cv.getContext("2d")
    ctx.scale(dpr, dpr)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    annotHistory.current = []
  }, [])

  useEffect(() => {
    if (facePreview && annotActive) {
      requestAnimationFrame(() => requestAnimationFrame(initAnnotCanvas))
    }
  }, [facePreview, annotActive, initAnnotCanvas])

  useEffect(() => {
    if (!annotActive) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [annotActive])

  useEffect(() => {
    setFaceOverlayOptions({
      alpha: Math.max(0.15, Math.min(1, faceOvOpacidad / 100)),
      strokeScale: Math.max(0.5, Math.min(2.5, faceOvGrosor / 100)),
      showMesh: faceOvMalla,
      zones: { ...faceOvZones },
    })
  }, [faceOvZones, faceOvGrosor, faceOvOpacidad, faceOvMalla])

  useEffect(() => {
    if (!annotActive || !facePreview || !mpAnnotLandmarks || !mpAnnotDims) return
    const el = mpGuideCanvasRef.current
    if (!el) return
    const draw = () => {
      drawMediaPipeGuideOnStillCanvas(el, mpAnnotLandmarks, mpAnnotDims.w, mpAnnotDims.h, false)
    }
    const id = requestAnimationFrame(draw)
    const onResize = () => { requestAnimationFrame(draw) }
    window.addEventListener("resize", onResize)
    let ro
    try {
      ro = new ResizeObserver(() => { requestAnimationFrame(draw) })
      ro.observe(el.parentElement || el)
    } catch { /* ignore */ }
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener("resize", onResize)
      try { ro?.disconnect() } catch { /* ignore */ }
    }
  }, [annotActive, facePreview, mpAnnotLandmarks, mpAnnotDims, faceOvZones, faceOvGrosor, faceOvOpacidad, faceOvMalla])

  const getAnnotPos = e => {
    const cv = annotCanvasRef.current
    if (!cv) return null
    const rect = cv.getBoundingClientRect()
    const touch = e.touches?.[0]
    const x = (touch ? touch.clientX : e.clientX) - rect.left
    const y = (touch ? touch.clientY : e.clientY) - rect.top
    return { x, y }
  }

  const annotStartDraw = e => {
    e.preventDefault()
    const pos = getAnnotPos(e)
    if (!pos) return
    annotDrawing.current = true
    const cv = annotCanvasRef.current
    const ctx = cv.getContext("2d")
    annotHistory.current.push(cv.toDataURL())
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    if (annotMode === "eraser") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.lineWidth = annotSize * 4
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = annotColor
      ctx.lineWidth = annotSize
    }
  }

  const annotDraw = e => {
    e.preventDefault()
    if (!annotDrawing.current) return
    const pos = getAnnotPos(e)
    if (!pos) return
    const ctx = annotCanvasRef.current.getContext("2d")
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const annotEndDraw = e => {
    e.preventDefault()
    annotDrawing.current = false
  }

  const annotUndo = () => {
    const cv = annotCanvasRef.current
    if (!cv || !annotHistory.current.length) return
    const last = annotHistory.current.pop()
    const img = new Image()
    img.onload = () => {
      const ctx = cv.getContext("2d")
      ctx.globalCompositeOperation = "source-over"
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.drawImage(img, 0, 0)
    }
    img.src = last
  }

  const annotClear = () => {
    const cv = annotCanvasRef.current
    if (!cv) return
    annotHistory.current.push(cv.toDataURL())
    const ctx = cv.getContext("2d")
    ctx.globalCompositeOperation = "source-over"
    ctx.clearRect(0, 0, cv.width, cv.height)
  }

  /** Fondo + lienzo de trazos en las mismas dimensiones del modal (alineado con la vista). */
  const mergeAnnotCanvasOntoImage = imgBg => {
    const cv = annotCanvasRef.current
    if (!cv || !imgBg) return null
    const out = document.createElement("canvas")
    out.width = cv.width
    out.height = cv.height
    const ctx2 = out.getContext("2d")
    ctx2.drawImage(imgBg, 0, 0, out.width, out.height)
    ctx2.drawImage(cv, 0, 0)
    return out.toDataURL("image/jpeg", 0.88)
  }

  const mergeAnnotacionADataUrl = () =>
    new Promise((resolve, reject) => {
      const cv = annotCanvasRef.current
      if (!cv || !facePreview) {
        reject(new Error("No hay foto o trazos para fusionar."))
        return
      }
      const imgBg = new Image()
      if (!facePreview.startsWith("data:") && !facePreview.startsWith("blob:")) {
        imgBg.crossOrigin = "anonymous"
      }
      imgBg.onload = () => {
        try {
          const merged = mergeAnnotCanvasOntoImage(imgBg)
          if (!merged) reject(new Error("No se pudo fusionar la imagen."))
          else resolve(merged)
        } catch (e) {
          reject(e)
        }
      }
      imgBg.onerror = () => reject(new Error("No se pudo cargar la imagen de fondo."))
      imgBg.src = facePreview
    })

  const annotSaveToEval = () => {
    const cv = annotCanvasRef.current
    if (!cv || !facePreview) return
    const imgBg = new Image()
    // NO poner crossOrigin para data: y blob: URLs (mismo origen).
    // crossOrigin = "anonymous" en URLs locales tainta el canvas y rompe toDataURL().
    if (!facePreview.startsWith("data:") && !facePreview.startsWith("blob:")) {
      imgBg.crossOrigin = "anonymous"
    }
    imgBg.onload = () => {
      const ts = Date.now()
      if (mpAnnotLandmarks?.length) {
        const bundle = exportMediapipeCaptureBundle(imgBg, mpAnnotLandmarks, false)
        if (bundle) {
          const dl = (dataUrl, name) => {
            const a = document.createElement("a")
            a.href = dataUrl
            a.download = name
            a.rel = "noopener"
            document.body.appendChild(a)
            a.click()
            a.remove()
          }
          if (bundle.croquis) dl(bundle.croquis, `rostro-croquis-${ts}.png`)
          if (bundle.malla) dl(bundle.malla, `rostro-malla-${ts}.png`)
          if (bundle.guias) dl(bundle.guias, `rostro-guias-${ts}.png`)
        }
      }

      const merged = mergeAnnotCanvasOntoImage(imgBg)
      if (!merged) return
      setFacePreview(merged)
      setAnnotActive(false)
      setEvaluacion(ev => (ev ? ev + "\n[Foto anotada; si había MediaPipe se descargaron 3 PNG: croquis, malla, guías]" : "[Foto anotada; si había MediaPipe se descargaron 3 PNG: croquis, malla, guías]"))
    }
    imgBg.src = facePreview
  }

  const aplicarPayloadDoctorIA = async out => {
    if (typeof out.evaluacion === "string" && out.evaluacion.trim()) setEvaluacion(out.evaluacion.trim())
    if (Array.isArray(out.serviciosIds) && out.serviciosIds.length) {
      const ids = [...new Set(out.serviciosIds.map(x => +x).filter(id => data.servicios.some(s => s.id === id)))]
      if (ids.length) setServiciosOrdenIds(ids)
    } else if (out.servicioId != null && data.servicios.some(s => s.id === +out.servicioId)) {
      setServiciosOrdenIds([+out.servicioId])
    }
    if (typeof out.motivoConsulta === "string") setMotivoConsultaIA(out.motivoConsulta.trim())
    if (typeof out.protocolo === "string") setProtocolo(out.protocolo.trim())
    if (typeof out.notas === "string") setNotas(out.notas.trim())
    if (Array.isArray(out.alergias)) setAlergiasIA(out.alergias.map(x => String(x || "").trim()).filter(Boolean))
    if (Array.isArray(out.tratamientos)) setTratamientosIA(out.tratamientos.map(x => String(x || "").trim()).filter(Boolean))
    if (out.anamnesis && typeof out.anamnesis === "object" && pacienteIdSesion) {
      const keys = ["antecedentes", "medicacion", "fuma", "embarazo", "piel", "observaciones"]
      const prev = pacienteSesion?.anamnesis && typeof pacienteSesion.anamnesis === "object" ? { ...pacienteSesion.anamnesis } : {}
      let changed = false
      for (const k of keys) {
        const v = out.anamnesis[k]
        if (typeof v === "string" && v.trim()) {
          prev[k] = v.trim()
          changed = true
        }
      }
      if (changed) {
        if (import.meta.env.VITE_SUPABASE_URL) {
          const { error } = await supabase.from("clientes").update({ anamnesis: prev }).eq("id", pacienteIdSesion)
          if (error) setDocIaError(prev => (prev ? `${prev} · ` : "") + `Anamnesis: ${error.message}`)
        }
        setData(d => ({
          ...d,
          pacientes: (d.pacientes || []).map(p =>
            +p.id === +pacienteIdSesion ? { ...p, anamnesis: prev } : p
          ),
        }))
      }
    }
    if (!out.servicioId && out.nuevoServicio && typeof out.nuevoServicio === "object" && String(out.nuevoServicio.nombre || "").trim()) {
      try {
        const creado = await crearServicioRapido({
          nombre: out.nuevoServicio.nombre,
          cat: out.nuevoServicio.cat,
          precio: out.nuevoServicio.precio,
          duracion: out.nuevoServicio.duracion,
        })
        if (creado?.id) setServiciosOrdenIds([+creado.id])
      } catch (e) {
        setDocIaError(String(e?.message || e))
      }
    }
    if (Array.isArray(out.insumos) && out.insumos.length) {
      setQty(prev => {
        const next = { ...prev }
        for (const row of out.insumos) {
          const sid = +row.stockId
          const c = Math.max(0, parseInt(row.cantidad, 10) || 0)
          if (stock.some(s => s.id === sid) && c > 0) next[sid] = c
        }
        return next
      })
    }
  }

  const aplicarDoctorIA = async textoRaw => {
    const texto = String(textoRaw || "").trim()
    if (!texto) {
      setDocIaError("Dictá o escribí la consulta primero.")
      return
    }
    setDocIaModo("texto")
    setDocIaLoading(true)
    setDocIaError("")
    try {
      const anam = pacienteSesion?.anamnesis && typeof pacienteSesion.anamnesis === "object" ? pacienteSesion.anamnesis : {}
      const out = await procesarSesionDoctorConOpenAI(texto, data.servicios, stock, anam)
      await aplicarPayloadDoctorIA(out)
      setDocDictadoTexto("")
      docDictadoRef.current = ""
      setWizardFase("propuesta_ia")
    } catch (e) {
      setDocIaError(e.message || "Error al procesar con IA")
    } finally {
      setDocIaLoading(false)
      setDocIaModo(null)
    }
  }

  const enviarGrabacionDoctorIA = async (base64, mime) => {
    setDocIaModo("audio")
    setDocIaLoading(true)
    setDocIaError("")
    try {
      const anam = pacienteSesion?.anamnesis && typeof pacienteSesion.anamnesis === "object" ? pacienteSesion.anamnesis : {}
      const out = await procesarSesionDoctorDesdeAudio(base64, mime, data.servicios, stock, anam)
      await aplicarPayloadDoctorIA(out)
      setWizardFase("propuesta_ia")
      const tr = typeof out.transcript === "string" ? out.transcript.trim() : ""
      if (tr) {
        setDocDictadoTexto(tr)
        docDictadoRef.current = tr
      }
    } catch (e) {
      setDocIaError(e.message || "Error al procesar el audio")
    } finally {
      setDocIaLoading(false)
      setDocIaModo(null)
    }
  }

  const iniciarGrabacionDoctor = async () => {
    if (typeof MediaRecorder === "undefined") {
      setDocIaError("Este dispositivo no expone grabación de audio (probá Safari o Chrome actualizado, o escribí el texto)." + mediaInsecureContextHint())
      return
    }
    const hint = mediaInsecureContextHint()
    setDocIaError("")
    let stream = null
    try {
      try {
        stream = await getUserMediaCompat({ audio: buildMicAudioConstraints() })
      } catch {
        try {
          stream = await getUserMediaCompat({ audio: true })
        } catch {
          stream = await getUserMediaCompat({
            audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
          })
        }
      }
      docAudioStreamRef.current = stream
      docAudioChunksRef.current = []
      const mime = pickAudioRecorderMimeType()
      let mr
      try {
        mr = createAudioMediaRecorder(stream, mime)
      } catch {
        try { stream.getTracks().forEach(t => t.stop()) } catch { /* ignore */ }
        docAudioStreamRef.current = null
        setDocIaError("No se pudo iniciar la grabación en este navegador. Actualizá la app del sistema o probá Chrome/Safari." + hint)
        return
      }
      docMediaRecorderRef.current = mr
      mr.ondataavailable = e => {
        if (e.data?.size > 0) docAudioChunksRef.current.push(e.data)
      }
      mr.onerror = () => {
        setDocGrabando(false)
        setDocIaError("Error al grabar.")
        try { stream.getTracks().forEach(t => t.stop()) } catch { /* ignore */ }
      }
      mr.onstop = () => {
        try { stream.getTracks().forEach(t => t.stop()) } catch { /* ignore */ }
        docAudioStreamRef.current = null
        docMediaRecorderRef.current = null
        const chunks = docAudioChunksRef.current
        docAudioChunksRef.current = []
        const blobType =
          (mr.mimeType && mr.mimeType !== "")
            ? mr.mimeType
            : (mime || (isIOSDevice() ? "audio/mp4" : "audio/webm"))
        const blob = new Blob(chunks, { type: blobType })
        if (blob.size < 64) {
          setDocIaError("Grabación demasiado corta o vacía. En iPhone/Android mantené pulsado hasta terminar y soltá «Detener».")
          return
        }
        const reader = new FileReader()
        reader.onloadend = () => {
          const dataUrl = String(reader.result || "")
          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : ""
          if (!base64) {
            setDocIaError("No se pudo leer el audio.")
            return
          }
          void enviarGrabacionDoctorIA(base64, blob.type || blobType)
        }
        reader.onerror = () => setDocIaError("No se pudo leer el audio.")
        reader.readAsDataURL(blob)
      }
      const timesliceMs = isIOSDevice() || isAndroidPhone() ? 250 : 1000
      mr.start(timesliceMs)
      setDocGrabando(true)
    } catch (e) {
      try { stream?.getTracks?.().forEach(t => t.stop()) } catch { /* ignore */ }
      docAudioStreamRef.current = null
      const name = e?.name || ""
      const msg =
        e?.message === "INSECURE_CONTEXT_MIC"
          ? "Estás en HTTP por IP: el teléfono bloquea el micrófono. Activá VITE_DEV_HTTPS=true en .env, reiniciá npm run dev y abrí https://TU_IP:5173 (aceptá el certificado en el móvil)."
          : e?.message === "NO_GET_USER_MEDIA"
            ? "No se puede usar el micrófono desde esta página."
            : name === "NotAllowedError" || name === "PermissionDeniedError"
              ? "Micrófono bloqueado. En el móvil: Ajustes del navegador o del sistema → permitir micrófono para este sitio."
              : name === "NotFoundError" || name === "DevicesNotFoundError"
                ? "No se detectó micrófono."
                : "No se pudo grabar."
      setDocIaError(msg + (e?.message === "INSECURE_CONTEXT_MIC" ? "" : hint))
    }
  }

  const detenerGrabacionDoctor = () => {
    const mr = docMediaRecorderRef.current
    setDocGrabando(false)
    if (!mr || mr.state !== "recording") return
    try {
      if (typeof mr.requestData === "function") mr.requestData()
    } catch { /* ignore */ }
    try {
      mr.stop()
    } catch { /* ignore */ }
  }

  const detenerDictadoDoctor = () => {
    const r = docSpeechRef.current
    if (!r) return
    try { r.stop() } catch { /* ignore */ }
  }

  const iniciarDictadoDoctor = () => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) {
      setDocIaError("En iPhone/iPad el dictado del navegador no está disponible: usá «Grabar voz» (recomendado en móvil) o escribí el texto.")
      return
    }
    setDocIaError("")
    docDictadoRef.current = docDictadoTexto.trim()
    setDocDictadoTexto(docDictadoRef.current)
    const r = new SR()
    docSpeechRef.current = r
    r.lang = "es-ES"
    r.interimResults = false
    r.continuous = true
    r.maxAlternatives = 1
    r.onresult = ev => {
      let chunk = ""
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) chunk += ev.results[i][0].transcript
      }
      if (!chunk.trim()) return
      docDictadoRef.current = docDictadoRef.current ? `${docDictadoRef.current} ${chunk}`.trim() : chunk.trim()
      setDocDictadoTexto(docDictadoRef.current)
    }
    r.onerror = () => {
      docSpeechRef.current = null
      setDocEscuchando(false)
      setDocIaError("Error de micrófono. Revisá permisos.")
    }
    r.onend = () => {
      docSpeechRef.current = null
      setDocEscuchando(false)
      const t = docDictadoRef.current.trim()
      if (t) void aplicarDoctorIA(t)
    }
    try {
      setDocEscuchando(true)
      r.start()
    } catch {
      docSpeechRef.current = null
      setDocEscuchando(false)
      setDocIaError("No se pudo iniciar el micrófono.")
    }
  }

  const detenerDictadoResultado = () => {
    const r = resSpeechRef.current
    if (!r) return
    try { r.stop() } catch { /* ignore */ }
  }

  const iniciarDictadoResultado = () => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) {
      setMedSessionModal({ open: true, title: "Dictado", body: "En este dispositivo el dictado del navegador no está disponible: usá «Grabar voz» o escribí el texto." })
      return
    }
    resultadoDictadoRef.current = textoResultado.trim()
    const r = new SR()
    resSpeechRef.current = r
    r.lang = "es-ES"
    r.interimResults = false
    r.continuous = true
    r.maxAlternatives = 1
    r.onresult = ev => {
      let chunk = ""
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) chunk += ev.results[i][0].transcript
      }
      if (!chunk.trim()) return
      resultadoDictadoRef.current = resultadoDictadoRef.current
        ? `${resultadoDictadoRef.current} ${chunk}`.trim()
        : chunk.trim()
      setTextoResultado(resultadoDictadoRef.current)
    }
    r.onerror = () => {
      resSpeechRef.current = null
      setResEscuchando(false)
    }
    r.onend = () => {
      resSpeechRef.current = null
      setResEscuchando(false)
    }
    try {
      setResEscuchando(true)
      r.start()
    } catch {
      resSpeechRef.current = null
      setResEscuchando(false)
    }
  }

  const aplicarResultadoIA = async raw => {
    const t = String(raw || "").trim()
    if (!t) return
    setResultadoIaLoading(true)
    try {
      const out = await procesarResultadoSesionConOpenAI(t, protocolo)
      if (typeof out.resultado === "string" && out.resultado.trim()) setTextoResultado(out.resultado.trim())
    } catch (e) {
      setMedSessionModal({ open: true, title: "Resultado (IA)", body: String(e?.message || e) })
    } finally {
      setResultadoIaLoading(false)
    }
  }

  const enviarGrabacionResultadoIA = async (base64, mime) => {
    setResultadoIaLoading(true)
    try {
      const out = await procesarResultadoDesdeAudio(base64, mime, protocolo)
      if (typeof out.resultado === "string" && out.resultado.trim()) {
        setTextoResultado(out.resultado.trim())
      } else if (typeof out.transcript === "string" && out.transcript.trim()) {
        setTextoResultado(out.transcript.trim())
      }
    } catch (e) {
      setMedSessionModal({ open: true, title: "Resultado (IA)", body: String(e?.message || e) })
    } finally {
      setResultadoIaLoading(false)
    }
  }

  const iniciarGrabacionResultado = async () => {
    if (typeof MediaRecorder === "undefined") {
      setMedSessionModal({ open: true, title: "Grabación", body: "Este dispositivo no permite grabar audio. Escribí el resultado o usá dictado del navegador." })
      return
    }
    const hint = mediaInsecureContextHint()
    let stream = null
    try {
      try {
        stream = await getUserMediaCompat({ audio: buildMicAudioConstraints() })
      } catch {
        try {
          stream = await getUserMediaCompat({ audio: true })
        } catch {
          stream = await getUserMediaCompat({
            audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
          })
        }
      }
      resAudioStreamRef.current = stream
      resAudioChunksRef.current = []
      const mime = pickAudioRecorderMimeType()
      let mr
      try {
        mr = createAudioMediaRecorder(stream, mime)
      } catch {
        try { stream.getTracks().forEach(t => t.stop()) } catch { /* ignore */ }
        resAudioStreamRef.current = null
        setMedSessionModal({ open: true, title: "Grabación", body: "No se pudo iniciar la grabación en este navegador." + hint })
        return
      }
      resMediaRecorderRef.current = mr
      mr.ondataavailable = e => {
        if (e.data?.size > 0) resAudioChunksRef.current.push(e.data)
      }
      mr.onerror = () => {
        setResGrabando(false)
        try { stream.getTracks().forEach(t => t.stop()) } catch { /* ignore */ }
      }
      mr.onstop = () => {
        try { stream.getTracks().forEach(t => t.stop()) } catch { /* ignore */ }
        resAudioStreamRef.current = null
        resMediaRecorderRef.current = null
        const chunks = resAudioChunksRef.current
        resAudioChunksRef.current = []
        const blobType =
          (mr.mimeType && mr.mimeType !== "")
            ? mr.mimeType
            : (mime || (isIOSDevice() ? "audio/mp4" : "audio/webm"))
        const blob = new Blob(chunks, { type: blobType })
        if (blob.size < 64) {
          setMedSessionModal({ open: true, title: "Grabación", body: "Grabación demasiado corta." })
          return
        }
        const reader = new FileReader()
        reader.onloadend = () => {
          const dataUrl = String(reader.result || "")
          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : ""
          if (!base64) {
            setMedSessionModal({ open: true, title: "Grabación", body: "No se pudo leer el audio." })
            return
          }
          void enviarGrabacionResultadoIA(base64, blob.type || blobType)
        }
        reader.onerror = () => setMedSessionModal({ open: true, title: "Grabación", body: "No se pudo leer el audio." })
        reader.readAsDataURL(blob)
      }
      const timesliceMs = isIOSDevice() || isAndroidPhone() ? 250 : 1000
      mr.start(timesliceMs)
      setResGrabando(true)
    } catch (e) {
      try { stream?.getTracks?.().forEach(t => t.stop()) } catch { /* ignore */ }
      resAudioStreamRef.current = null
      setMedSessionModal({ open: true, title: "Grabación", body: String(e?.message || e) + hint })
    }
  }

  const detenerGrabacionResultado = () => {
    const mr = resMediaRecorderRef.current
    setResGrabando(false)
    if (!mr || mr.state !== "recording") return
    try {
      if (typeof mr.requestData === "function") mr.requestData()
    } catch { /* ignore */ }
    try { mr.stop() } catch { /* ignore */ }
  }

  const setQ = (stockId, v) => {
    const n = Math.max(0, parseInt(v, 10) || 0)
    setQty(q => ({ ...q, [stockId]: n }))
  }

  /**
   * Sube las 3 capturas (frente, perfil der., perfil izq.) a Storage y las registra en la ficha.
   */
  const guardarTripleEnFichaPaciente = async tipoSesion => {
    const ref = faceTripleRef.current
    if (!ref.front || !ref.profileRight || !ref.profileLeft) {
      setMedSessionModal({ open: true, title: "Fotos", body: "Faltan las tres capturas (frente, perfil derecho, perfil izquierdo)." })
      return false
    }
    if (!pacienteIdSesion) {
      setMedSessionModal({ open: true, title: "Paciente", body: "No hay paciente vinculado a este turno. Las fotos no se pueden guardar en la ficha." })
      return false
    }
    setGuardandoTripleFicha(true)
    try {
      const rows = [
        { angulo: "frente", url: ref.front, nota: `Frente (${tipoSesion})` },
        { angulo: "perfil_derecho", url: ref.profileRight, nota: `Perfil derecho (${tipoSesion})` },
        { angulo: "perfil_izquierdo", url: ref.profileLeft, nota: `Perfil izquierdo (${tipoSesion})` },
      ]
      const finalUrls = []
      for (const row of rows) {
        let u = row.url
        if (import.meta.env.VITE_SUPABASE_URL && typeof u === "string" && u.startsWith("data:image/")) {
          u = await uploadImageDataUrl(u, "pacientes")
        }
        finalUrls.push({ ...row, url: u })
      }
      const pacienteActual = (data.pacientes || []).find(p => +p.id === +pacienteIdSesion)
      if (!pacienteActual) throw new Error("No se encontró el paciente en el registro local.")
      const prevFotos = Array.isArray(pacienteActual.fotos) ? pacienteActual.fotos : []
      let nid = prevFotos.length ? Math.max(...prevFotos.map(f => f.id || 0)) + 1 : 1
      const notaBase = protocolo.trim() ? `Sesión: ${protocolo.trim().slice(0, 80)}` : "Captura sesión médica"
      const nuevas = finalUrls.map(({ angulo, url, nota }) => ({
        id: nid++,
        tipo: tipoSesion,
        angulo,
        url,
        fecha: TODAY,
        nota: `${nota}. ${notaBase}`,
      }))
      const nuevasFotos = [...prevFotos, ...nuevas]
      if (import.meta.env.VITE_SUPABASE_URL) {
        const { error } = await supabase.from("clientes").update({ fotos: nuevasFotos }).eq("id", pacienteIdSesion)
        if (error) throw new Error(error.message || "Error al guardar en Supabase.")
      }
      setData(d => ({
        ...d,
        pacientes: (d.pacientes || []).map(p =>
          +p.id === +pacienteIdSesion ? { ...p, fotos: nuevasFotos } : p
        ),
      }))
      return true
    } catch (e) {
      setMedSessionModal({ open: true, title: "Fotos", body: `No se pudieron guardar las fotos en la ficha: ${String(e?.message || e)}` })
      return false
    } finally {
      setGuardandoTripleFicha(false)
    }
  }

  /**
   * Sube la foto actual (facePreview) a Supabase Storage y la registra
   * en la ficha del paciente vinculado al turno.
   */
  const guardarFotoEnFichaAsync = async (tipo = fotoFichaTipo) => {
    if (!facePreview) return false
    if (!pacienteIdSesion) {
      alert("No hay paciente vinculado a este turno. La foto no se puede guardar en ninguna ficha.")
      return false
    }
    setSavingFotoFicha(true)
    try {
      let finalUrl = facePreview
      if (import.meta.env.VITE_SUPABASE_URL && facePreview.startsWith("data:image/")) {
        finalUrl = await uploadImageDataUrl(facePreview, "pacientes")
      }
      const pacienteActual = (data.pacientes || []).find(p => +p.id === +pacienteIdSesion)
      if (!pacienteActual) throw new Error("No se encontró el paciente en el registro local.")
      const prevFotos = Array.isArray(pacienteActual.fotos) ? pacienteActual.fotos : []
      const nid = prevFotos.length ? Math.max(...prevFotos.map(f => f.id || 0)) + 1 : 1
      const notaAuto = protocolo.trim() ? `Sesión: ${protocolo.trim().slice(0, 80)}` : "Captura sesión médica"
      const nuevaFoto = { id: nid, tipo, url: finalUrl, fecha: TODAY, nota: notaAuto }
      const nuevasFotos = [...prevFotos, nuevaFoto]
      if (import.meta.env.VITE_SUPABASE_URL) {
        const { error } = await supabase
          .from("clientes")
          .update({ fotos: nuevasFotos })
          .eq("id", pacienteIdSesion)
        if (error) throw new Error(error.message || "Error al guardar en Supabase.")
      }
      setData(d => ({
        ...d,
        pacientes: (d.pacientes || []).map(p =>
          +p.id === +pacienteIdSesion ? { ...p, fotos: nuevasFotos } : p
        ),
      }))
      setFotoFichaGuardada(true)
      return true
    } catch (e) {
      alert(`No se pudo guardar la foto en la ficha: ${String(e?.message || e)}`)
      return false
    } finally {
      setSavingFotoFicha(false)
    }
  }

  /** Imagen fusionada (foto + trazos) en la ficha, con texto del plan. */
  const guardarPlanMarcadoEnFichaAsync = async () => {
    if (!pacienteIdSesion) {
      alert("No hay paciente vinculado a este turno.")
      return
    }
    setSavingPlanMarcado(true)
    try {
      const merged = await mergeAnnotacionADataUrl()
      let finalUrl = merged
      if (import.meta.env.VITE_SUPABASE_URL && merged.startsWith("data:image/")) {
        finalUrl = await uploadImageDataUrl(merged, "pacientes")
      }
      const pacienteActual = (data.pacientes || []).find(p => +p.id === +pacienteIdSesion)
      if (!pacienteActual) throw new Error("No se encontró el paciente en el registro local.")
      const prevFotos = Array.isArray(pacienteActual.fotos) ? pacienteActual.fotos : []
      const nid = prevFotos.length ? Math.max(...prevFotos.map(f => f.id || 0)) + 1 : 1
      const notaTexto = String(notaPlanMarcado || "").trim() || (protocolo.trim() ? `Plan: ${protocolo.trim().slice(0, 220)}` : "Plan facial marcado en sesión")
      const nuevaFoto = {
        id: nid,
        tipo: "plan_marcado",
        angulo: "frente",
        url: finalUrl,
        fecha: TODAY,
        nota: notaTexto,
        turnoId: turnoId ?? null,
        protocoloSnapshot: protocolo.trim().slice(0, 400) || null,
      }
      const nuevasFotos = [...prevFotos, nuevaFoto]
      if (import.meta.env.VITE_SUPABASE_URL) {
        const { error } = await supabase.from("clientes").update({ fotos: nuevasFotos }).eq("id", pacienteIdSesion)
        if (error) throw new Error(error.message || "Error al guardar en Supabase.")
      }
      setData(d => ({
        ...d,
        pacientes: (d.pacientes || []).map(p =>
          +p.id === +pacienteIdSesion ? { ...p, fotos: nuevasFotos } : p
        ),
      }))
      alert("Plan marcado guardado en la ficha del paciente (Pacientes → Fotos).")
    } catch (e) {
      alert(`No se pudo guardar el plan en la ficha: ${String(e?.message || e)}`)
    } finally {
      setSavingPlanMarcado(false)
    }
  }

  const buildSesionMedicaBorradorPayload = useCallback(
    () => ({
      v: 1,
      wizardFase,
      docDictadoTexto,
      evaluacion,
      protocolo,
      notas,
      motivoConsultaIA,
      serviciosOrdenIds,
      alergiasIA,
      tratamientosIA,
      qty,
      fotoSesionFase,
      despuesTripleCompleto,
      textoResultado,
      updatedAt: new Date().toISOString(),
    }),
    [
      wizardFase,
      docDictadoTexto,
      evaluacion,
      protocolo,
      notas,
      motivoConsultaIA,
      serviciosOrdenIds,
      alergiasIA,
      tratamientosIA,
      qty,
      fotoSesionFase,
      despuesTripleCompleto,
      textoResultado,
    ]
  )

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL || !turnoId || !borradorSesionListoRef.current) return
    const t = setTimeout(() => {
      const payload = buildSesionMedicaBorradorPayload()
      void supabase.from("turnos").update({ sesion_medica_borrador: payload }).eq("id", turnoId)
      setData(d => {
        const clinic = d.clinics[clinicId]
        if (!clinic?.turnos) return d
        return {
          ...d,
          clinics: {
            ...d.clinics,
            [clinicId]: {
              ...clinic,
              turnos: clinic.turnos.map(tt => (tt.id === turnoId ? { ...tt, sesionMedicaBorrador: payload } : tt)),
            },
          },
        }
      })
    }, 1200)
    return () => clearTimeout(t)
  }, [buildSesionMedicaBorradorPayload, turnoId, clinicId, setData])

  const finalizar = async () => {
    const idsOrdenValidos = [...new Set(serviciosOrdenIds.filter(id => data.servicios.some(s => s.id === id)))]
    if (!turno || !protocolo.trim() || idsOrdenValidos.length === 0) return
    if (turno.estado === "listo_cobrar" || turno.estado === "finalizado") return
    if (
      pacienteIdSesion &&
      usarTripleSesionMedica &&
      !despuesTripleCompleto &&
      !allowFinalizeSinDespuesRef.current
    ) {
      setConfirmSinDespuesOpen(true)
      return
    }
    allowFinalizeSinDespuesRef.current = false
    const extrasTotal = Object.values(qty || {}).reduce((a, n) => a + (Math.max(0, +n || 0)), 0)
    if (extrasTotal <= 0 && !allowFinalizeWithoutExtras) {
      setAskExtrasOpen(true)
      return
    }
    setFinalizando(true)
    try {
      const srvsFact = idsOrdenValidos.map(id => data.servicios.find(s => s.id === id)).filter(Boolean)
      const nombresFact = srvsFact.map(s => s.nombre).join(" · ")
      const montoServiciosSum = srvsFact.reduce((a, s) => a + (s.precio ?? 0), 0)
      let ensPostAtencion = { ok: true, clienteId: null, created: false, cliente: null }
      if (import.meta.env.VITE_SUPABASE_URL) {
        const ens = await ensureClienteFichaPorTurno(turno.id)
        if (!ens.ok) {
          alert(ens.error)
          return
        }
        ensPostAtencion = ens
        const { error } = await supabase
          .from("turnos")
          .update({
            estado: "listo_cobrar",
            servicio: nombresFact || turno.servicio || "",
            servicio_facturado_id: idsOrdenValidos[0],
            empleado_id: null,
          })
          .eq("id", turno.id)
        if (error) {
          alert(error.message || "No se pudo enviar a recepción.")
          return
        }
        const turnoActualDb = data.clinics[clinicId].turnos.find(t => t.id === turnoId) || turno
        const qtyBaseDb = turnoActualDb?.consumoBaseStock || {}
        const qtyTotalDb = mergeQtyMaps(qtyBaseDb, qty)
        const detalleInsumos = Object.entries(qtyTotalDb).map(([k, v]) => {
          const s = (data.clinics[clinicId]?.stock || []).find(x => x.id === +k)
          return { stockId: +k, nombre: s?.nombre || "", qty: v, costoUnit: +(s?.costo || 0) }
        }).filter(x => x.qty > 0)
        const montoInsumos = detalleInsumos.reduce((a, x) => a + x.costoUnit * x.qty, 0)
        await supabase.from("alertas_cobro").update({
          monto_servicio: montoServiciosSum,
          monto_insumos: montoInsumos,
          monto_total: montoServiciosSum + montoInsumos,
          insumos: detalleInsumos,
        }).eq("turno_id", turno.id)
      }
      const turnoActual = data.clinics[clinicId].turnos.find(t => t.id === turnoId) || turno
      const qtyBase = turnoActual?.consumoBaseStock || {}
      const qtyTotal = mergeQtyMaps(qtyBase, qty)
      const turnoParaCerrar = ensPostAtencion.clienteId
        ? { ...turno, pacienteId: ensPostAtencion.clienteId }
        : turno
      setData(d => {
        let d2 = d
        if (ensPostAtencion.clienteId && ensPostAtencion.created && ensPostAtencion.cliente) {
          const pl = mapClienteRowFromErpApi(ensPostAtencion.cliente)
          if (pl && !(d.pacientes || []).some(p => +p.id === +pl.id)) {
            d2 = { ...d, pacientes: [...(d.pacientes || []), pl] }
          }
        }
        return cerrarOrdenServicioEnEstado(d2, {
          clinic: clinicId,
          turno: turnoParaCerrar,
          servicioIds: idsOrdenValidos,
          protocolo,
          notas,
          qty: qtyTotal,
          qtyDescontar: qty,
          nombreProfesional,
          evaluacionPrevia: evaluacion,
          motivoConsultaIA,
          alergiasIA,
          tratamientosIA,
          resultadoSesion: textoResultado,
        })
      })
      // Auto-guardar foto en ficha si hay foto capturada y no fue guardada manualmente
      if (facePreview && !fotoFichaGuardada && pacienteIdSesion) {
        void guardarFotoEnFichaAsync("durante")
      }
      if (import.meta.env.VITE_SUPABASE_URL) {
        const cerrado = { v: 1, wizardFase: "veredicto", cerradaAt: new Date().toISOString() }
        await supabase.from("turnos").update({ sesion_medica_borrador: cerrado }).eq("id", turno.id)
        setData(d => {
          const clinic = d.clinics[clinicId]
          if (!clinic?.turnos) return d
          return {
            ...d,
            clinics: {
              ...d.clinics,
              [clinicId]: {
                ...clinic,
                turnos: clinic.turnos.map(tt => (tt.id === turnoId ? { ...tt, sesionMedicaBorrador: cerrado } : tt)),
              },
            },
          }
        })
      }
      onExit()
    } finally {
      setAllowFinalizeWithoutExtras(false)
      setFinalizando(false)
    }
  }

  const srvsOrden = serviciosOrdenIds.map(id => data.servicios.find(s => s.id === id)).filter(Boolean)
  const totalPrecioServiciosOrden = srvsOrden.reduce((a, s) => a + (s.precio ?? 0), 0)

  const consentPreviewHtmlArea = useMemo(() => {
    const pl = plantillasConsentArea.find(p => p.slug === formConsArea.plantillaSlug)
    if (!pl || !pacienteSesion) return ""
    const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
    const servicio = String(formConsArea.servicioProducto || "").trim() || "—"
    const cuerpo = armarCuerpoConsentimiento(pl.cuerpo_texto, pacienteSesion, {
      servicioOProducto: servicio,
      fechaStr,
      centroNombre: clinicNombre || `Clínica ${clinicId}`,
    })
    return textoAHtmlParrafos(cuerpo)
  }, [plantillasConsentArea, formConsArea.plantillaSlug, formConsArea.servicioProducto, pacienteSesion, clinicNombre, clinicId])

  /** Consentimientos ya guardados para este turno (misma sesión). */
  const consentimientosTurnoActual = useMemo(
    () => (data.consentimientosFirmados || []).filter(c => c.turnoId != null && +c.turnoId === +turnoId),
    [data.consentimientosFirmados, turnoId],
  )

  const abrirModalConsentAreaParaServicio = srv => {
    if (!srv) return
    const srvNombre = srv.nombre || ""
    const sug = sugerirPlantillaConsentDesdeNombreServicio(plantillasConsentArea, srvNombre)
    const detalle = [srvNombre, protocolo].filter(Boolean).join(" — ").slice(0, 500)
    setFormConsArea({ plantillaSlug: sug || "", servicioProducto: detalle || srvNombre })
    setOpenConsArea(true)
  }

  const guardarConsentArea = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL) {
      alert("Configurá Supabase para registrar consentimientos.")
      return
    }
    if (!pacienteIdSesion || !pacienteSesion) {
      alert("No se encontró la paciente vinculada al turno.")
      return
    }
    const pl = plantillasConsentArea.find(p => p.slug === formConsArea.plantillaSlug)
    if (!formConsArea.plantillaSlug || !pl) {
      alert("Elegí una plantilla de consentimiento.")
      return
    }
    if (!String(formConsArea.servicioProducto || "").trim()) {
      alert("Indicá el servicio o producto que se aplicará.")
      return
    }
    if (sigPacienteRef.current?.isEmpty?.()) {
      alert("La paciente debe firmar en el recuadro (con el dedo o el mouse).")
      return
    }
    setSavingConsArea(true)
    try {
      const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
      const cuerpo = armarCuerpoConsentimiento(pl.cuerpo_texto, pacienteSesion, {
        servicioOProducto: formConsArea.servicioProducto.trim(),
        fechaStr,
        centroNombre: clinicNombre || `Clínica ${clinicId}`,
      })
      const contenidoHtml = textoAHtmlParrafos(cuerpo)
      const firmadoPorId = (data.empleados || []).find(e => String(e.email || "").toLowerCase() === String(sessionEmail || "").toLowerCase())?.id ?? null
      const varsPdf = varsDesdePaciente(pacienteSesion, {
        servicioOProducto: formConsArea.servicioProducto.trim(),
        fecha: fechaStr,
        centro: clinicNombre || `Clínica ${clinicId}`,
      })
      const cuerpoPdf = cuerpoConsentimientoParaPdf(rellenarPlantilla(pl.cuerpo_texto, varsPdf))
      const empArea = (data.empleados || []).find(e => String(e.email || "").toLowerCase() === String(sessionEmail || "").toLowerCase())

      const { data: { session: sb } } = await supabase.auth.getSession()
      const token = sb?.access_token
      if (!token) {
        alert("Tu sesión expiró. Volvé a iniciar sesión.")
        return
      }

      let pdfPublicUrl = ""
      try {
        const pdfDataUrl = await buildConsentimientoPdfDataUrl({
          titulo: pl.titulo,
          cuerpoTexto: cuerpoPdf,
          firmaPacienteDataUrl: sigPacienteRef.current.getDataURL(),
          firmaProfesionalDataUrl: sigProfesionalRef.current && !sigProfesionalRef.current.isEmpty()
            ? sigProfesionalRef.current.getDataURL()
            : null,
          nombrePaciente: pacienteSesion.nombre || "",
          pacienteDni: pacienteSesion.dni,
          pacienteEmail: pacienteSesion.email,
          pacienteTelefono: pacienteSesion.tel,
          pacienteFechaNacimiento: varsPdf.pacienteFechaNacimiento,
          datosCentro: clinicNombre || `Clínica ${clinicId}`,
          numeroColegiado: empArea?.documento || "—",
          nombreProfesional: nombreProfesional || "",
          fechaStr,
        })
        pdfPublicUrl = await uploadConsentPdfDataUrl(pdfDataUrl, {
          clinicId: pacienteSesion.clinicId,
          clienteId: pacienteIdSesion,
          accessToken: token,
        })
      } catch (e) {
        alert(`No se pudo generar o subir el PDF: ${String(e?.message || e)}`)
        return
      }

      const { data: ins, error } = await supabase
        .from("consentimientos_firmados")
        .insert({
          clinic_id: pacienteSesion.clinicId,
          cliente_id: pacienteIdSesion,
          turno_id: turnoId,
          plantilla_slug: pl.slug,
          titulo: pl.titulo,
          servicio_o_producto: formConsArea.servicioProducto.trim(),
          paciente_nombre_snapshot: pacienteSesion.nombre || "",
          contenido_html: contenidoHtml,
          pdf_storage_path: pdfPublicUrl,
          firmado_por_empleado_id: firmadoPorId,
        })
        .select("*")
        .single()
      if (error) {
        alert(error.message || "No se pudo guardar el consentimiento.")
        return
      }
      const mapped = mapConsentimientoFirmadoRow(ins)
      setData(d => ({
        ...d,
        consentimientosFirmados: [...(d.consentimientosFirmados || []), mapped],
      }))
      onConsentSaved?.()
      const servicioSnap = formConsArea.servicioProducto.trim()
      sigPacienteRef.current?.clear?.()
      sigProfesionalRef.current?.clear?.()
      setOpenConsArea(false)
      setFormConsArea({ plantillaSlug: "", servicioProducto: "" })
      setConsentAreaVistaPrevia({
        pdfUrl: pdfPublicUrl,
        contenidoHtml,
        titulo: pl.titulo,
        pacienteNombre: pacienteSesion.nombre || "",
        servicioProducto: servicioSnap,
        mostrarPdf: false,
      })
    } finally {
      setSavingConsArea(false)
    }
  }

  const idsMaterialesSrv = srvsOrden.length
    ? [...new Set(srvsOrden.flatMap(s => materialesStockIdsDelServicio(s)))]
    : []
  const stockMaterialesServicio = idsMaterialesSrv.length ? stock.filter(s => idsMaterialesSrv.includes(s.id)) : stock
  const stockOtrosInsumos = idsMaterialesSrv.length ? stock.filter(s => !idsMaterialesSrv.includes(s.id)) : []
  const profNombre = profs.find(p => p.id === (turno?.profesionalId || 1))?.nombre || "—"
  const noServicios = (data.servicios || []).length === 0

  const filaInsumo = s => (
    <div
      key={s.id}
      style={{
        display:"flex",
        flexDirection: narrow ? "column" : "row",
        alignItems: narrow ? "stretch" : "flex-start",
        justifyContent:"space-between",
        gap: narrow ? 10 : 12,
        padding:"12px 6px",
        borderBottom:`1px solid ${C.subtle}`,
        fontSize:13,
        color:C.text,
      }}
    >
      <div style={{ flex:1, minWidth:0, paddingRight: narrow ? 0 : 8 }}>
        <strong style={{ display:"block", lineHeight:1.35, wordBreak:"break-word" }}>{s.nombre}</strong>
        <span style={{ color:C.muted, fontSize:11, display:"block", marginTop:6, lineHeight:1.35 }}>
          Stock {s.stock} {s.unidad} · {fmt(s.costo)} c/u
        </span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0, width: narrow ? "100%" : "auto", justifyContent: narrow ? "flex-end" : "flex-end" }}>
        <span style={{ fontSize:11, color:C.muted, whiteSpace:"nowrap" }}>Cant.</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          style={{
            ...inp,
            width: 88,
            maxWidth: "100%",
            flex: "0 0 auto",
            padding: "10px 8px",
            fontSize: 16,
            minHeight: 44,
          }}
          value={qty[s.id] ?? 0}
          onChange={e => setQ(s.id, e.target.value)}
        />
      </div>
    </div>
  )

  const faceCroquisControls = (
    <div style={{
      padding: narrow ? 10 : 12,
      borderRadius: 10,
      background: "rgba(15,23,42,.72)",
      border: "1px solid rgba(167,139,250,.28)",
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em" }}>Croquis MediaPipe — capas</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setFaceOvZones({
              oval: true, brows: true, eyes: true, nose: true, lips: true, jaw: true,
              forehead: true, papada: true, guides: true,
            })}
            style={{ fontSize: 11, fontWeight: 600, color: "#a78bfa", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px" }}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setFaceOvZones({
              oval: false, brows: false, eyes: false, nose: false, lips: false, jaw: false,
              forehead: false, papada: false, guides: false,
            })}
            style={{ fontSize: 11, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px" }}
          >
            Ninguna
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
        {[
          ["oval", "Óvalo"],
          ["forehead", "Frente"],
          ["brows", "Cejas"],
          ["eyes", "Ojos"],
          ["nose", "Nariz"],
          ["lips", "Labios"],
          ["jaw", "Mandíbula"],
          ["papada", "Papada"],
          ["guides", "Guías"],
        ].map(([key, label]) => (
          <Btn
            key={key}
            type="button"
            variant="outline"
            sm
            onClick={() => setFaceOvZones(z => ({ ...z, [key]: !z[key] }))}
            style={{
              borderColor: faceOvZones[key] ? "rgba(167,139,250,.55)" : "rgba(255,255,255,.2)",
              color: faceOvZones[key] ? "#e9d5ff" : "#94a3b8",
              minHeight: 34,
            }}
          >
            {label}
          </Btn>
        ))}
        <Btn
          type="button"
          variant="outline"
          sm
          onClick={() => setFaceOvMalla(m => !m)}
          style={{
            borderColor: faceOvMalla ? "rgba(52,211,153,.45)" : "rgba(255,255,255,.2)",
            color: faceOvMalla ? "#a7f3d0" : "#94a3b8",
            minHeight: 34,
            borderStyle: "dashed",
          }}
        >
          Malla 468
        </Btn>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#94a3b8", width: 68, flexShrink: 0 }}>Grosor</span>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          value={faceOvGrosor}
          onChange={e => setFaceOvGrosor(+e.target.value)}
          style={{ flex: 1, minWidth: 100, accentColor: "#a78bfa", height: 26 }}
        />
        <span style={{ fontSize: 11, color: "#64748b", width: 40, textAlign: "right" }}>{faceOvGrosor}%</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#94a3b8", width: 68, flexShrink: 0 }}>Opacidad</span>
        <input
          type="range"
          min={20}
          max={100}
          value={faceOvOpacidad}
          onChange={e => setFaceOvOpacidad(+e.target.value)}
          style={{ flex: 1, minWidth: 100, accentColor: "#a78bfa", height: 26 }}
        />
        <span style={{ fontSize: 11, color: "#64748b", width: 40, textAlign: "right" }}>{faceOvOpacidad}%</span>
      </div>
    </div>
  )

  if (!cd || !turno) {
    return (
      <div style={{ minHeight:"100dvh", background:"linear-gradient(160deg,#1e1b4b 0%,#312e81 40%,#0f172a 100%)", color:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))", textAlign:"center" }}>
        <p style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Turno no encontrado</p>
        <p style={{ fontSize:14, opacity:0.85, maxWidth:400 }}>El enlace o QR no coincide con un turno activo de esta clínica.</p>
        <Btn style={{ marginTop:20, minHeight:48, width:narrow ? "100%" : "auto", maxWidth:320 }} onClick={onExit}>Volver al sistema</Btn>
      </div>
    )
  }

  if (turno.estado === "listo_cobrar" || turno.estado === "finalizado") {
    return (
      <div style={{ minHeight:"100dvh", background:"linear-gradient(160deg,#1e1b4b 0%,#312e81 40%,#0f172a 100%)", color:"#fff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))", textAlign:"center" }}>
        <p style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Esta sesión ya fue cerrada</p>
        <p style={{ fontSize:14, opacity:0.85 }}>El turno está en estado «{estadoLabel[turno.estado] || turno.estado}».</p>
        <Btn style={{ marginTop:20, minHeight:48, width:narrow ? "100%" : "auto", maxWidth:320 }} onClick={onExit}>Volver al sistema</Btn>
      </div>
    )
  }

  const listaAnalisisActual = docIaModo === "audio" ? MENSAJES_ANALISIS_IA_AUDIO : MENSAJES_ANALISIS_IA_TEXTO
  const mensajeAnalisis = resultadoIaLoading
    ? "Redactando resultado clínico de la sesión…"
    : (listaAnalisisActual[analisisMsgIdx] ?? listaAnalisisActual[0])
  const wizardDefs = [
    { id: "veredicto", label: "Veredicto" },
    { id: "propuesta_ia", label: "Propuesta IA" },
    { id: "registro", label: "Fotos antes" },
    { id: "resultado", label: "Resultado" },
    { id: "evaluacion", label: "Evaluación" },
    { id: "orden", label: "Orden" },
  ]
  const stepIndex = wizardDefs.findIndex(s => s.id === wizardFase)
  const goPrevStep = () => setWizardFase(wizardDefs[Math.max(0, stepIndex - 1)]?.id || "veredicto")
  const goNextStep = () => setWizardFase(wizardDefs[Math.min(wizardDefs.length - 1, stepIndex + 1)]?.id || "orden")

  const medCard = {
    background: "linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.68) 100%)",
    backdropFilter: "blur(22px) saturate(200%)",
    WebkitBackdropFilter: "blur(22px) saturate(200%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.55)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 40px -22px rgba(15,23,42,.22), 0 1px 3px rgba(15,23,42,.05)",
    padding: narrow ? 18 : 22,
    marginBottom: 18,
    position: "relative",
    zIndex: 2,
  }
  const medCardDark = {
    background:
      "radial-gradient(120% 80% at 0% 0%, rgba(124,58,237,0.22) 0%, rgba(17,24,39,0) 55%), " +
      "radial-gradient(100% 70% at 100% 100%, rgba(99,102,241,0.18) 0%, rgba(15,23,42,0) 60%), " +
      "linear-gradient(160deg, rgba(30,27,75,0.78) 0%, rgba(15,23,42,0.82) 55%, rgba(17,24,39,0.85) 100%)",
    backdropFilter: "blur(26px) saturate(190%)",
    WebkitBackdropFilter: "blur(26px) saturate(190%)",
    borderRadius: 20,
    border: "1px solid rgba(167,139,250,0.28)",
    boxShadow:
      "0 1px 0 rgba(255,255,255,0.12) inset, " +
      "0 24px 60px -28px rgba(124,58,237,.45), " +
      "0 12px 28px -16px rgba(2,6,23,.7), " +
      "0 0 0 1px rgba(255,255,255,0.04)",
    padding: narrow ? 18 : 22,
    marginBottom: 18,
    color: "#e2e8f0",
    position: "relative",
    zIndex: 2,
    overflow: "hidden",
  }
  const wizardIcons = {
    veredicto: Mic,
    propuesta_ia: ClipboardCheck,
    registro: Camera,
    resultado: ScanLine,
    evaluacion: FileText,
    orden: CheckCircle2,
  }

  const tripleVideoEnPantallaCompleta = usarTripleSesionMedica && camaraEncendida && camaraFullscreen
  const videoTripleEnPanel = camaraEncendida && (!usarTripleSesionMedica || !camaraFullscreen)

  return (
    <div style={{ minHeight:"100dvh", background:"linear-gradient(135deg,#EEF2FF 0%,#F4F6FB 45%,#FDF4FF 100%)", color:C.text, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",
      paddingBottom:"env(safe-area-inset-bottom)", position:"relative", overflowX:"hidden" }}>
      <div className="erp-orbs" aria-hidden>
        <span className="erp-orb erp-orb-1"/>
        <span className="erp-orb erp-orb-2"/>
        <span className="erp-orb erp-orb-3"/>
        <span className="erp-orb erp-orb-4"/>
      </div>
      {(docIaLoading || resultadoIaLoading) && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            position:"fixed",
            inset:0,
            zIndex:10000,
            background:"rgba(15,23,42,.78)",
            backdropFilter:"blur(8px)",
            WebkitBackdropFilter:"blur(8px)",
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            padding:"max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
          }}
        >
          <div style={{
            width:"100%",
            maxWidth:400,
            textAlign:"center",
            padding:"28px 24px",
            borderRadius:20,
            background:"linear-gradient(160deg, rgba(49,46,129,.92), rgba(30,27,75,.88))",
            border:"1px solid rgba(167,139,250,.4)",
            boxShadow:"0 24px 48px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.06) inset",
          }}>
            <div className="erp-analyzing-ring" style={{ margin:"0 auto" }}>
              <Loader2 size={36} className="erp-spin" color="#c4b5fd" aria-hidden />
            </div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"#a5b4fc", marginTop:22 }}>
              Análisis clínico asistido
            </div>
            <p style={{ fontSize:17, fontWeight:700, color:"#fff", marginTop:10, lineHeight:1.35, minHeight:"2.6em" }}>
              {mensajeAnalisis}
            </p>
            <div className="erp-analyzing-track" style={{ margin:"0 auto" }} />
            <p style={{ fontSize:12, color:"#94a3b8", marginTop:18, lineHeight:1.45 }}>
              Redacción profesional para historia clínica · podés demorar unos segundos según la longitud del contenido
            </p>
          </div>
        </div>
      )}
      <header style={{
        padding:"max(14px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) 16px max(18px, env(safe-area-inset-left))",
        background:"linear-gradient(135deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.58) 100%)",
        backdropFilter:"blur(22px) saturate(200%)",
        WebkitBackdropFilter:"blur(22px) saturate(200%)",
        borderBottom:"1px solid rgba(255,255,255,0.55)",
        boxShadow:"0 1px 0 rgba(255,255,255,0.7) inset, 0 10px 28px -20px rgba(15,23,42,.22)",
        display:"flex", alignItems: narrow ? "flex-start" : "center", justifyContent:"space-between", flexWrap:"wrap", gap:12,
        flexDirection: narrow ? "column" : "row",
        position:"relative", zIndex:5,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, minWidth:0, width: narrow ? "100%" : undefined }}>
          <div style={{
            width:48, height:48, borderRadius:14,
            background:C.gradient,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            boxShadow:`0 10px 24px -8px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.45) inset`,
          }}>
            <Stethoscope size={22} color="#fff" strokeWidth={2.4}/>
          </div>
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", color:C.violet, fontWeight:800 }}>Sesión médica · Clínica {clinicId}</div>
            <div style={{ fontSize: narrow ? 19 : 22, fontWeight:800, color:C.text, wordBreak:"break-word", letterSpacing:"-0.02em" }}>{turno.cliente}</div>
            <div style={{ fontSize:13, color:C.muted, marginTop:3, lineHeight:1.4 }}>{turno.hora} · {turno.servicio} · {profNombre}</div>
            <div style={{ fontSize:12, color:C.violet, marginTop:4, fontWeight:700 }}>Sala: {getSalaTrabajoTurno(turno) || "—"}</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, width: narrow ? "100%" : undefined, justifyContent: narrow ? "space-between" : "flex-end" }}>
          <Badge type={turno.estado}>{estadoLabel[turno.estado] || turno.estado}</Badge>
          <Btn variant="outline" onClick={onExit} style={{
            borderColor:"rgba(255,255,255,0.6)", color:C.text, minHeight:44, minWidth:44,
            background:"linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7))",
            backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
          }}>Salir</Btn>
        </div>
      </header>

      <div style={{ maxWidth:680, margin:"0 auto", padding:`22px max(14px, env(safe-area-inset-left)) ${narrow ? "100px" : "36px"} max(14px, env(safe-area-inset-right))`, position:"relative", zIndex:2 }}>
        <div style={{
          ...medCard,
          padding: narrow ? 16 : 20,
          marginBottom: 22,
        }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, gap:12, flexWrap:"wrap" }}>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:C.violet, letterSpacing:"0.08em", textTransform:"uppercase" }}>Progreso</div>
              <div style={{ fontSize:15, fontWeight:800, color:C.text, letterSpacing:"-0.01em", marginTop:2 }}>
                Paso {stepIndex + 1} de {wizardDefs.length} · {wizardDefs[stepIndex]?.label || ""}
              </div>
            </div>
            <div style={{
              display:"inline-flex", alignItems:"center", gap:6,
              padding:"6px 12px", borderRadius:999,
              background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.25)",
              fontSize:11, fontWeight:700, color:C.violet,
            }}>
              {Math.round(((stepIndex + 1) / wizardDefs.length) * 100)}%
            </div>
          </div>
          <div style={{
            position:"relative",
            padding: narrow ? "6px 4px 2px" : "8px 8px 4px",
          }}>
            <div style={{
              position:"absolute",
              left: narrow ? 22 : 26,
              right: narrow ? 22 : 26,
              top: narrow ? 22 : 24,
              height:3,
              borderRadius:2,
              background:"rgba(226,232,240,0.8)",
              zIndex:0,
            }}/>
            <div style={{
              position:"absolute",
              left: narrow ? 22 : 26,
              top: narrow ? 22 : 24,
              height:3,
              borderRadius:2,
              width: `calc((100% - ${narrow ? 44 : 52}px) * ${stepIndex / Math.max(1, wizardDefs.length - 1)})`,
              background: C.gradient,
              transition:"width .4s cubic-bezier(.4,0,.2,1)",
              zIndex:1,
            }}/>
            <div style={{ position:"relative", zIndex:2, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:4 }}>
              {wizardDefs.map((s, i) => {
                const active = wizardFase === s.id
                const past = stepIndex > i
                const Icon = wizardIcons[s.id] || ClipboardCheck
                const disabled = i > stepIndex
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { if (!disabled) setWizardFase(s.id) }}
                    disabled={disabled}
                    style={{
                      all:"unset",
                      display:"flex", flexDirection:"column", alignItems:"center", gap:6,
                      cursor: disabled ? "not-allowed" : "pointer",
                      flex:1, minWidth:0,
                      opacity: disabled ? 0.45 : 1,
                    }}
                    aria-current={active ? "step" : undefined}
                    aria-label={`Paso ${i + 1}: ${s.label}`}
                  >
                    <div style={{
                      width: narrow ? 36 : 44, height: narrow ? 36 : 44, borderRadius:"50%",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      background: active
                        ? C.gradient
                        : past
                          ? "linear-gradient(135deg,#a5b4fc,#c4b5fd)"
                          : "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,255,255,0.7))",
                      border: active
                        ? "2px solid #fff"
                        : past
                          ? "2px solid rgba(255,255,255,0.9)"
                          : "2px solid rgba(226,232,240,0.9)",
                      color: (active || past) ? "#fff" : C.muted,
                      boxShadow: active
                        ? `0 8px 22px -6px ${C.violet}80, 0 1px 0 rgba(255,255,255,0.45) inset`
                        : past
                          ? "0 4px 10px -4px rgba(99,102,241,.35)"
                          : "0 1px 2px rgba(15,23,42,.06)",
                      transition:"all .3s cubic-bezier(.4,0,.2,1)",
                      transform: active ? "scale(1.08)" : "scale(1)",
                    }}>
                      {past ? <CheckCircle2 size={narrow ? 18 : 22} strokeWidth={2.4}/> : <Icon size={narrow ? 16 : 20} strokeWidth={2.2}/>}
                    </div>
                    <span style={{
                      fontSize: narrow ? 9 : 10,
                      fontWeight: active ? 800 : 700,
                      color: active ? C.violet : past ? C.text : C.muted,
                      textAlign:"center",
                      lineHeight:1.2,
                      letterSpacing:"-0.005em",
                      display:"block",
                      maxWidth: "100%",
                      whiteSpace: narrow ? "nowrap" : "normal",
                      overflow: narrow ? "hidden" : "visible",
                      textOverflow: narrow ? "ellipsis" : "clip",
                    }}>
                      {s.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <p style={{ fontSize:12, color:C.muted, marginTop:14, lineHeight:1.5, marginBottom:0, display:"flex", alignItems:"center", gap:6 }}>
            <CheckCircle2 size={13} color={C.success}/> El avance se guarda automáticamente · podés reanudar en la misma fase.
          </p>
        </div>

        {wizardFase === "veredicto" && <div key="wiz-veredicto" className="erp-fadein" style={medCard}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
            <div style={{
              width:38, height:38, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
              background:C.gradient, color:"#fff",
              boxShadow:`0 8px 18px -6px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.4) inset`,
            }}>
              <Mic size={18} strokeWidth={2.4}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:C.violet, letterSpacing:"0.08em", textTransform:"uppercase" }}>Paso 1</div>
              <div style={{ fontSize:17, fontWeight:800, color:C.text, letterSpacing:"-0.01em" }}>Veredicto clínico</div>
            </div>
          </div>
          <p style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.5 }}>
            Describí hallazgos y plan en voz o texto. Luego <strong>procesamos con IA</strong> para rellenar evaluación, servicio y protocolo.
          </p>
          {typeof window !== "undefined" && !window.isSecureContext && (
            <div style={{
              marginBottom:12,
              padding:"12px 14px",
              borderRadius:12,
              background:"#fef2f2",
              border:"1px solid #fecaca",
              fontSize:13,
              color:"#991b1b",
              lineHeight:1.5,
            }}>
              <strong>Micrófono no disponible:</strong> usá HTTPS en el móvil (véase <code style={codeStyle()}>.env</code> y <code style={codeStyle()}>VITE_DEV_HTTPS</code>).
            </div>
          )}
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", marginBottom:12 }}>
            <Btn
              type="button"
              onClick={docGrabando ? detenerGrabacionDoctor : iniciarGrabacionDoctor}
              disabled={docIaLoading || docEscuchando}
              style={{
                minHeight:46,
                background: docGrabando ? "linear-gradient(135deg,#b91c1c,#991b1b)" : "linear-gradient(135deg,#0d9488,#0f766e)",
                border:"none",
                width: narrow ? "100%" : "auto",
                justifyContent:"center",
              }}
            >
              {docIaLoading && !docGrabando ? <Loader2 size={16} className="erp-spin" /> : docGrabando ? <Square size={16} fill="currentColor" /> : <Mic size={16} />}
              {docGrabando ? " Detener y analizar" : docIaLoading ? " Procesando…" : " Grabar voz (audio → IA)"}
            </Btn>
            {docGrabando && (
              <span style={{ fontSize:12, color:"#fca5a5", fontWeight:600 }}>Grabando… tocá «Detener» cuando termines.</span>
            )}
          </div>
          <textarea
            value={docDictadoTexto}
            onChange={e => { setDocDictadoTexto(e.target.value); docDictadoRef.current = e.target.value }}
            onBlur={() => {
              const t = (docDictadoRef.current || "").trim()
              if (!t || docIaLoading || docEscuchando || docGrabando) return
              void aplicarDoctorIA(t)
            }}
            placeholder="Motivo de consulta, hallazgos, plan tentativo…"
            style={{
              width:"100%",
              minHeight: narrow ? 120 : 100,
              padding:14,
              borderRadius:12,
              border:`1px solid ${C.border}`,
              background:"#fafafa",
              color:C.text,
              fontSize:16,
              fontFamily:"inherit",
              resize:"vertical",
              boxSizing:"border-box",
              marginBottom:12,
            }}
          />
          {docIaError && <div style={{ fontSize:12, color:C.danger, marginBottom:10 }}>{docIaError}</div>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"stretch" }}>
            <Btn
              type="button"
              onClick={docEscuchando ? detenerDictadoDoctor : iniciarDictadoDoctor}
              disabled={docIaLoading || docGrabando}
              style={{ minHeight:46, background: docEscuchando ? "linear-gradient(135deg,#b91c1c,#991b1b)" : C.violet, border:"none", flex: narrow ? "1 1 100%" : "0 1 auto", justifyContent:"center" }}
            >
              {docEscuchando ? <Square size={16} fill="currentColor" /> : docIaLoading ? <Loader2 size={16} className="erp-spin" /> : <Mic size={16} />}
              {docEscuchando ? " Detener y analizar" : docIaLoading ? " Procesando…" : " Dictar (navegador)"}
            </Btn>
            <Btn
              type="button"
              onClick={() => void aplicarDoctorIA(docDictadoRef.current || docDictadoTexto)}
              disabled={docIaLoading || docGrabando || docEscuchando || !(docDictadoRef.current || docDictadoTexto).trim()}
              style={{ minHeight:46, background: `linear-gradient(135deg,${C.violet},#6366f1)`, border:"none", flex: narrow ? "1 1 100%" : "1 1 200px", justifyContent:"center", fontWeight:800 }}
            >
              {docIaLoading ? <Loader2 size={16} className="erp-spin" /> : <ClipboardCheck size={16} />}
              {docIaLoading ? " Procesando…" : " Procesar con IA"}
            </Btn>
          </div>
        </div>}

        {wizardFase === "propuesta_ia" && (
          <div key="wiz-propuesta" className="erp-fadein" style={medCard}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
              <div style={{
                width:38, height:38, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
                background:C.gradient, color:"#fff",
                boxShadow:`0 8px 18px -6px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.4) inset`,
              }}>
                <ClipboardCheck size={18} strokeWidth={2.4}/>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:C.violet, letterSpacing:"0.08em", textTransform:"uppercase" }}>Paso 2</div>
                <div style={{ fontSize:17, fontWeight:800, color:C.text, letterSpacing:"-0.01em" }}>Propuesta generada por IA</div>
              </div>
            </div>
            <p style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.5 }}>
              Revisá los campos que completó el sistema. Podés volver al veredicto para ajustar el texto y reprocesar.
            </p>
            <div style={{ display:"grid", gap:10, marginBottom:16 }}>
              {srvsOrden.length > 0 && (
                <div style={{ padding:12, borderRadius:10, background:C.subtle, border:`1px solid ${C.border}`, fontSize:13 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>Servicio(s) sugerido(s)</span>
                  <div style={{ fontWeight:700, marginTop:4 }}>{srvsOrden.map(s => s.nombre).join(" · ") || "—"}</div>
                </div>
              )}
              {protocolo.trim() && (
                <div style={{ padding:12, borderRadius:10, background:C.subtle, border:`1px solid ${C.border}`, fontSize:13 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>Protocolo</span>
                  <div style={{ marginTop:6, maxHeight:320, overflowY:"auto", lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{protocolo}</div>
                </div>
              )}
              {evaluacion.trim() && (
                <div style={{ padding:12, borderRadius:10, background:C.subtle, border:`1px solid ${C.border}`, fontSize:13 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>Evaluación</span>
                  <div style={{ marginTop:6, maxHeight:360, overflowY:"auto", lineHeight:1.5, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{evaluacion}</div>
                </div>
              )}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
              <Btn type="button" variant="outline" onClick={() => setWizardFase("veredicto")} style={{ borderColor:C.border, color:C.text, minHeight:44 }}>
                <ChevronLeft size={16}/> Volver al veredicto
              </Btn>
              <Btn type="button" onClick={() => setWizardFase("registro")} style={{ minHeight:44, background:C.violet, border:"none", flex:1, justifyContent:"center" }}>
                Continuar a registro fotográfico <ChevronRight size={16}/>
              </Btn>
            </div>
          </div>
        )}

        {wizardFase === "resultado" && (
          <div key="wiz-resultado" className="erp-fadein" style={medCard}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
              <div style={{
                width:38, height:38, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
                background:C.gradient, color:"#fff",
                boxShadow:`0 8px 18px -6px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.4) inset`,
              }}>
                <ScanLine size={18} strokeWidth={2.4}/>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:C.violet, letterSpacing:"0.08em", textTransform:"uppercase" }}>Paso 4</div>
                <div style={{ fontSize:17, fontWeight:800, color:C.text, letterSpacing:"-0.01em" }}>Resultado de la sesión</div>
              </div>
            </div>
            <p style={{ fontSize:13, color:C.muted, marginBottom:12, lineHeight:1.5 }}>
              Dictá o escribí cómo quedó la paciente tras el tratamiento; la IA redacta el <strong>resultado clínico</strong> para historia / seguimiento. Podés tomar abajo las tres fotos de <strong>después</strong> si aún no las completaste.
            </p>
            <textarea
              value={textoResultado}
              onChange={e => { setTextoResultado(e.target.value); resultadoDictadoRef.current = e.target.value }}
              placeholder="Ej.: buena tolerancia, leve eritema que cede en minutos, paciente conforme…"
              style={{
                width:"100%",
                minHeight: narrow ? 100 : 88,
                padding:14,
                borderRadius:12,
                border:`1px solid ${C.border}`,
                background:"#fafafa",
                color:C.text,
                fontSize:16,
                fontFamily:"inherit",
                resize:"vertical",
                boxSizing:"border-box",
                marginBottom:12,
              }}
            />
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"stretch" }}>
              <Btn
                type="button"
                onClick={resGrabando ? detenerGrabacionResultado : iniciarGrabacionResultado}
                disabled={resultadoIaLoading || resEscuchando}
                style={{
                  minHeight:44,
                  background: resGrabando ? "linear-gradient(135deg,#b91c1c,#991b1b)" : "linear-gradient(135deg,#0d9488,#0f766e)",
                  border:"none",
                  flex: narrow ? "1 1 100%" : "0 1 auto",
                  justifyContent:"center",
                }}
              >
                {resultadoIaLoading && !resGrabando ? <Loader2 size={16} className="erp-spin" /> : resGrabando ? <Square size={16} fill="currentColor" /> : <Mic size={16} />}
                {resGrabando ? " Detener y analizar" : resultadoIaLoading ? " Procesando…" : " Grabar voz (audio → IA)"}
              </Btn>
              <Btn
                type="button"
                onClick={resEscuchando ? detenerDictadoResultado : iniciarDictadoResultado}
                disabled={resultadoIaLoading || resGrabando}
                style={{ minHeight:44, background: resEscuchando ? "linear-gradient(135deg,#b91c1c,#991b1b)" : C.violet, border:"none", flex: narrow ? "1 1 100%" : "0 1 auto", justifyContent:"center" }}
              >
                {resEscuchando ? <Square size={16} fill="currentColor" /> : resultadoIaLoading ? <Loader2 size={16} className="erp-spin" /> : <Mic size={16} />}
                {resEscuchando ? " Detener dictado" : resultadoIaLoading ? " Procesando…" : " Dictar (navegador)"}
              </Btn>
              <Btn
                type="button"
                onClick={() => void aplicarResultadoIA(resultadoDictadoRef.current || textoResultado)}
                disabled={resultadoIaLoading || resGrabando || resEscuchando || !(resultadoDictadoRef.current || textoResultado).trim()}
                style={{ minHeight:44, background: `linear-gradient(135deg,${C.violet},#6366f1)`, border:"none", flex: narrow ? "1 1 100%" : "1 1 200px", justifyContent:"center", fontWeight:800 }}
              >
                {resultadoIaLoading ? <Loader2 size={16} className="erp-spin" /> : <ClipboardCheck size={16} />}
                {resultadoIaLoading ? " Procesando…" : " Procesar resultado con IA"}
              </Btn>
            </div>
          </div>
        )}

        {(wizardFase === "registro" || wizardFase === "resultado") && <div key={`wiz-foto-${wizardFase}`} className="erp-fadein" style={medCardDark}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
            <div className="erp-icon-badge" style={{
              width:42, height:42, borderRadius:13, display:"flex", alignItems:"center", justifyContent:"center",
              background:"linear-gradient(135deg, rgba(167,139,250,.35), rgba(99,102,241,.30))",
              border:"1px solid rgba(167,139,250,.55)",
              color:"#e9d5ff",
            }}>
              <Camera size={20} strokeWidth={2.4}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:10, fontWeight:800, color:"#a78bfa", letterSpacing:"0.08em", textTransform:"uppercase" }}>
                {wizardFase === "registro" ? "Paso 3" : "Paso 4 · Captura"}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:"#fff", letterSpacing:"-0.01em" }}>
                {wizardFase === "registro" ? "Fotos antes" : "Fotos después"}
              </div>
            </div>
            <Badge type="general">Demo</Badge>
          </div>
          <p style={{ fontSize:12, color:"#94a3b8", marginBottom:12, lineHeight:1.45 }}>
            {wizardFase === "registro" ? (
              usarTripleSesionMedica ? (
                <>En esta fase solo las <strong style={{ color:"#e9d5ff" }}>tres fotos de antes</strong> (frente, perfil derecho, perfil izquierdo). Las de después las tomás en la siguiente fase <strong style={{ color:"#e9d5ff" }}>Resultado</strong>.</>
              ) : (
                <>Encendé la cámara frontal, encuadrá el rostro y tocá capturar: se muestra un <strong style={{ color:"#e9d5ff" }}>análisis ficticio</strong> para acompañar la consulta (no es diagnóstico ni dispositivo médico).</>
              )
            ) : (
              usarTripleSesionMedica ? (
                <>Tres capturas <strong style={{ color:"#e9d5ff" }}>nuevas</strong> de <strong style={{ color:"#e9d5ff" }}>después</strong> del tratamiento (mismo orden que en «Fotos antes»). Las de antes ya quedaron guardadas; acá solo registrás el post-tratamiento.</>
              ) : (
                <>Encendé la cámara y completá la captura para archivo.</>
              )
            )}
          </p>
          {usarTripleSesionMedica && (
            <div style={{ fontSize:12, fontWeight:800, color:"#c4b5fd", marginBottom:10, padding:"8px 10px", borderRadius:10, background:"rgba(124,58,237,.15)", border:"1px solid rgba(167,139,250,.3)" }}>
              Fase actual: <strong style={{ color:"#fff" }}>{fotoSesionFase === "antes" ? "Antes (3 fotos)" : "Después (3 fotos)"}</strong>
              {despuesTripleCompleto && " · Después completo"}
            </div>
          )}
          {wizardFase === "registro"
            && usarTripleSesionMedica
            && fotoSesionFase === "antes"
            && faceTripleShot.front
            && faceTripleShot.profileRight
            && faceTripleShot.profileLeft
            && (
              <div style={{
                marginBottom:12,
                padding:"10px 12px",
                borderRadius:12,
                background:"linear-gradient(135deg, rgba(16,185,129,.18), rgba(34,197,94,.10))",
                border:"1px solid rgba(16,185,129,.45)",
                display:"flex",
                alignItems:"center",
                gap:10,
                color:"#a7f3d0",
                fontSize:13,
                fontWeight:700,
                lineHeight:1.4,
              }}>
                <CheckCircle2 size={18} style={{ flexShrink:0, color:"#34d399" }}/>
                <span>
                  ¡Las 3 fotos de <strong style={{ color:"#d1fae5" }}>antes</strong> ya están guardadas en la ficha! Cuando quieras, tocá <strong style={{ color:"#d1fae5" }}>«Continuar a resultado»</strong>.
                </span>
              </div>
            )}
          {wizardFase === "resultado" && usarTripleSesionMedica && despuesTripleCompleto && (
            <div style={{ marginBottom:12 }}>
              <Btn
                type="button"
                variant="outline"
                onClick={() => {
                  setDespuesTripleCompleto(false)
                  setFotoFichaGuardada(false)
                  setFaceShotIndex(0)
                  faceTripleRef.current = { front: null, profileLeft: null, profileRight: null }
                  setFaceTripleShot({ front: null, profileLeft: null, profileRight: null })
                  setFacePreview(null)
                  setFaceResult(null)
                  setFaceError("")
                  detenerCamara({ preserveTriple: true })
                }}
                style={{ borderColor:"rgba(167,139,250,.5)", color:"#e9d5ff", minHeight:40, width: narrow ? "100%" : "auto", justifyContent:"center" }}
              >
                Volver a tomar las 3 fotos después
              </Btn>
            </div>
          )}
          <div style={{
            position:"relative",
            borderRadius:14,
            overflow:"hidden",
            background:"#000",
            aspectRatio:"4/3",
            maxHeight: narrow ? 260 : 220,
            marginBottom:12,
            border:"1px solid rgba(255,255,255,.12)",
          }}>
            {tripleVideoEnPantallaCompleta && (
              <div style={{
                position:"absolute", inset:0, zIndex:6, display:"flex", alignItems:"center", justifyContent:"center",
                flexDirection:"column", gap:10, padding:20, textAlign:"center", background:"rgba(15,23,42,.88)",
              }}>
                <Camera size={36} color="#a78bfa" />
                <span style={{ color:"#f1f5f9", fontSize:14, fontWeight:800 }}>Cámara en pantalla completa</span>
                <span style={{ color:"#94a3b8", fontSize:12, lineHeight:1.45 }}>Encuadrá y capturá desde la vista ampliada. Tocá «Cerrar» allí para volver a esta tarjeta.</span>
              </div>
            )}
            {videoTripleEnPanel && (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  style={{
                    width:"100%",
                    height:"100%",
                    objectFit:"cover",
                    display: camaraEncendida ? "block" : "none",
                    transform: camaraEncendida && !faceRearCamera ? "scaleX(-1)" : undefined,
                    transformOrigin: "center center",
                  }}
                />
                {camaraEncendida && SHOW_FACE_CROQUIS_LIVE && (
                  <canvas
                    ref={faceMeshCanvasRef}
                    aria-hidden
                    style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:3 }}
                  />
                )}
                {camaraEncendida && SHOW_FACE_CROQUIS_LIVE && (faceMeshStatus === "error" || faceMeshStatus === "loading" || faceMeshStatus === "idle") && (
                  <div style={{ position:"absolute", inset:0, zIndex:2 }}>
                    <FaceCroquisTechnicalSvg withDimmedMask bottomHint={faceMeshStatus === "loading" ? "Cargando modelo facial…" : "Encuadrá el rostro"} />
                  </div>
                )}
              </>
            )}
            {!camaraEncendida && !facePreview && (
              <div className="erp-cam-empty">
                <div className="erp-cam-icon">
                  <ScanLine size={28} strokeWidth={1.8} />
                </div>
                <div>Vista previa de cámara</div>
                <div className="erp-cam-hint">Tocá «Abrir cámara» para empezar</div>
              </div>
            )}
            {facePreview && !camaraEncendida && (
              <>
                <img src={facePreview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                {usarTripleSesionMedica && faceTripleShot.profileLeft && faceTripleShot.profileRight && (
                  <div
                    style={{
                      position:"absolute",
                      bottom:0,
                      left:0,
                      right:0,
                      display:"flex",
                      gap:6,
                      padding:8,
                      background:"linear-gradient(transparent, rgba(0,0,0,.75))",
                    }}
                  >
                    {[
                      { src: faceTripleShot.front, label:"Frente" },
                      { src: faceTripleShot.profileRight, label:"Der." },
                      { src: faceTripleShot.profileLeft, label:"Izq." },
                    ].map(({ src, label }) => (
                      <div key={label} style={{ flex:1, minWidth:0, textAlign:"center" }}>
                        <img src={src} alt="" style={{ width:"100%", height:52, objectFit:"cover", borderRadius:6, border:"1px solid rgba(255,255,255,.25)" }} />
                        <div style={{ fontSize:10, color:"#e2e8f0", marginTop:4, fontWeight:700 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {faceAnalyzing && (
              <div style={{
                position:"absolute", inset:0, background:"rgba(15,23,42,.72)", display:"flex",
                alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10, color:"#e2e8f0",
              }}>
                <Loader2 size={32} className="erp-spin" color="#a78bfa" />
                <span style={{ fontSize:13, fontWeight:700 }}>Procesando escaneo…</span>
                <span style={{ fontSize:11, color:"#94a3b8" }}>Mapa simulado · texturas · proporciones</span>
              </div>
            )}
          </div>
          {camaraEncendida && usarTripleSesionMedica && !tripleVideoEnPantallaCompleta && (
            <div
              style={{
                marginBottom:10,
                padding:"10px 12px",
                borderRadius:10,
                background:"rgba(124,58,237,.2)",
                border:"1px solid rgba(167,139,250,.35)",
                fontSize:13,
                fontWeight:800,
                color:"#e9d5ff",
                lineHeight:1.4,
              }}
            >
              {faceShotIndex === 0 && "1/3 — De frente: encuadrá el rostro del paciente."}
              {faceShotIndex === 1 && "2/3 — Perfil derecho: girá la cabeza hacia su derecha (vista lateral)."}
              {faceShotIndex === 2 && "3/3 — Perfil izquierdo: girá la cabeza hacia su izquierda (vista lateral)."}
            </div>
          )}
          {camaraEncendida && SHOW_FACE_CROQUIS_LIVE && !tripleVideoEnPantallaCompleta && (
            <div style={{ marginBottom: 10 }}>
              {faceCroquisControls}
            </div>
          )}
          {camaraEncendida && SHOW_FACE_CROQUIS_LIVE && !tripleVideoEnPantallaCompleta && (
            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:10, minHeight:18 }}>
              {faceMeshStatus === "tracking" && "● Rostro detectado — croquis MediaPipe en vivo"}
              {faceMeshStatus === "searching" && "○ Buscando rostro…"}
              {faceMeshStatus === "profile" && "◐ Vista lateral / perfil"}
              {faceMeshStatus === "loading" && "Cargando modelo facial (MediaPipe)…"}
              {faceMeshStatus === "error" && "MediaPipe no disponible — guía de proporción estática."}
              {faceMeshStatus === "ready" && "Iniciando captura…"}
            </div>
          )}
          {faceError && <div style={{ fontSize:12, color:"#fca5a5", marginBottom:10 }}>{faceError}</div>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {!camaraEncendida ? (
              <Btn className="erp-glass-btn" type="button" onClick={abrirCamara} style={{ minHeight:44, background:"linear-gradient(135deg,#a855f7,#7c3aed)", border:"none", width: narrow ? "100%" : "auto", justifyContent:"center", boxShadow:"0 10px 24px -10px rgba(124,58,237,.7), 0 1px 0 rgba(255,255,255,.2) inset" }}>
                <Camera size={16} /> Abrir cámara
              </Btn>
            ) : (
              <>
                {(!usarTripleSesionMedica || !tripleVideoEnPantallaCompleta) && (
                  <>
                    <Btn className="erp-glass-btn" type="button" variant="outline" onClick={detenerCamara} style={{ background:"rgba(255,255,255,.06)", borderColor:"rgba(255,255,255,.4)", color:"#e2e8f0", minHeight:44, width: narrow ? "100%" : "auto", justifyContent:"center" }}>Cerrar cámara</Btn>
                    <Btn className="erp-glass-btn" type="button" onClick={capturarFotogramaYAnalizar} disabled={faceAnalyzing || guardandoTripleFicha} style={{ minHeight:44, background:"linear-gradient(135deg,#a855f7,#6366f1)", border:"none", width: narrow ? "100%" : "auto", justifyContent:"center", boxShadow:"0 10px 24px -10px rgba(124,58,237,.7)" }}>
                      <ScanLine size={16} />{" "}
                      {usarTripleSesionMedica
                        ? ["Capturar frente (1/3)", "Capturar perfil derecho (2/3)", "Capturar perfil izquierdo (3/3)"][faceShotIndex] ?? "Capturar"
                        : "Capturar y analizar"}
                    </Btn>
                  </>
                )}
              </>
            )}
            <Btn
              className="erp-glass-btn"
              type="button"
              variant="outline"
              onClick={() => fotoInputRef.current?.click()}
              disabled={faceAnalyzing}
              style={{ background:"rgba(255,255,255,.06)", borderColor:"rgba(255,255,255,.35)", color:"#e2e8f0", minHeight:44, width: narrow ? "100%" : "auto", justifyContent:"center" }}
            >
              Elegir foto del rostro
            </Btn>
            <input ref={fotoInputRef} type="file" accept="image/*" capture={usarTripleSesionMedica || isIPad() ? "environment" : "user"} style={{ display:"none" }} onChange={onFotoArchivo} />
          </div>

          {/* ── Guardar foto en ficha del paciente ── */}
          {facePreview && !camaraEncendida && pacienteIdSesion && (
            <div style={{
              marginTop:12,
              padding:"12px 14px",
              borderRadius:12,
              background: fotoFichaGuardada ? "rgba(16,185,129,.15)" : "rgba(124,58,237,.12)",
              border: `1px solid ${fotoFichaGuardada ? "rgba(16,185,129,.4)" : "rgba(167,139,250,.3)"}`,
              display:"flex",
              flexDirection: narrow ? "column" : "row",
              alignItems: narrow ? "stretch" : "center",
              gap:10,
            }}>
              {fotoFichaGuardada ? (
                <div style={{ display:"flex", alignItems:"center", gap:8, color:"#6ee7b7", fontSize:13, fontWeight:700 }}>
                  <CheckCircle2 size={16}/> Foto guardada en la ficha del paciente
                </div>
              ) : (
                <>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#c4b5fd", marginBottom:6 }}>Guardar foto en ficha del paciente</div>
                    <select
                      value={fotoFichaTipo}
                      onChange={e => setFotoFichaTipo(e.target.value)}
                      style={{ fontSize:12, padding:"5px 8px", borderRadius:8, border:"1px solid rgba(167,139,250,.4)", background:"rgba(0,0,0,.35)", color:"#e2e8f0", width: narrow ? "100%" : "auto" }}
                    >
                      <option value="antes">Antes</option>
                      <option value="durante">Durante</option>
                      <option value="despues">Después</option>
                      <option value="seguimiento">Seguimiento</option>
                    </select>
                  </div>
                  <Btn
                    type="button"
                    disabled={savingFotoFicha}
                    onClick={() => void guardarFotoEnFichaAsync(fotoFichaTipo)}
                    style={{ background:"linear-gradient(135deg,#7c3aed,#6366f1)", border:"none", minHeight:40, justifyContent:"center", flexShrink:0 }}
                  >
                    {savingFotoFicha ? <Loader2 size={14} className="erp-spin" /> : <Camera size={14}/>}
                    {savingFotoFicha ? " Guardando…" : " Guardar en ficha"}
                  </Btn>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid rgba(255,255,255,.12)" }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#a78bfa", marginBottom:8, letterSpacing:"0.06em", textTransform:"uppercase" }}>Texto en imagen (OCR) · atributos faciales (DeepFace)</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              <Btn
                className="erp-glass-btn"
                type="button"
                variant="outline"
                onClick={runFaceOcr}
                disabled={faceOcrLoading || faceDfLoading || (!camaraEncendida && !facePreview)}
                style={{ background:"linear-gradient(135deg, rgba(167,139,250,.18), rgba(99,102,241,.10))", borderColor:"rgba(167,139,250,.55)", color:"#e9d5ff", minHeight:42, flex: narrow ? "1 1 100%" : "0 1 auto", justifyContent:"center" }}
              >
                {faceOcrLoading ? <Loader2 size={16} className="erp-spin" /> : <FileText size={16} />} OCR (OpenAI)
              </Btn>
              <Btn
                className="erp-glass-btn"
                type="button"
                variant="outline"
                onClick={runFaceDeepface}
                disabled={faceOcrLoading || faceDfLoading || (!camaraEncendida && !facePreview)}
                style={{ background:"linear-gradient(135deg, rgba(52,211,153,.18), rgba(16,185,129,.10))", borderColor:"rgba(52,211,153,.55)", color:"#a7f3d0", minHeight:42, flex: narrow ? "1 1 100%" : "0 1 auto", justifyContent:"center" }}
              >
                {faceDfLoading ? <Loader2 size={16} className="erp-spin" /> : <ScanLine size={16} />} DeepFace (Python)
              </Btn>
              <Btn
                className="erp-glass-btn"
                type="button"
                variant="outline"
                onClick={() => {
                  setFaceDfErr("")
                  setFaceDfLiveTick(0)
                  setFaceDfLiveEnabled(v => !v)
                }}
                disabled={!camaraEncendida}
                style={{
                  background: faceDfLiveEnabled
                    ? "linear-gradient(135deg, rgba(16,185,129,.30), rgba(34,197,94,.18))"
                    : "linear-gradient(135deg, rgba(148,163,184,.16), rgba(100,116,139,.10))",
                  borderColor: faceDfLiveEnabled ? "rgba(16,185,129,.75)" : "rgba(148,163,184,.45)",
                  color: faceDfLiveEnabled ? "#6ee7b7" : "#cbd5e1",
                  minHeight:42,
                  flex: narrow ? "1 1 100%" : "0 1 auto",
                  justifyContent:"center",
                  boxShadow: faceDfLiveEnabled ? "0 0 18px -4px rgba(16,185,129,.55)" : undefined,
                }}
              >
                {faceDfLiveEnabled ? "Detener DeepFace en vivo" : "DeepFace en vivo"}
              </Btn>
            </div>
            {!camaraEncendida && !facePreview && (
              <div style={{
                marginTop:10,
                padding:"10px 12px",
                borderRadius:10,
                background:"rgba(167,139,250,.10)",
                border:"1px dashed rgba(167,139,250,.45)",
                fontSize:12,
                color:"#c4b5fd",
                lineHeight:1.45,
                display:"flex",
                alignItems:"center",
                gap:8,
              }}>
                <Camera size={14} style={{ flexShrink:0 }} />
                <span>
                  Activá <strong style={{ color:"#e9d5ff" }}>«Abrir cámara»</strong> o <strong style={{ color:"#e9d5ff" }}>«Elegir foto del rostro»</strong> para habilitar el análisis.
                </span>
              </div>
            )}
            {camaraEncendida && (
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:8, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                <span>
                  Estado DeepFace en vivo: <strong style={{ color: faceDfLiveEnabled ? "#6ee7b7" : "#cbd5e1" }}>{faceDfLiveEnabled ? "activo" : "detenido"}</strong>
                </span>
                {faceDfLiveEnabled && faceDfWorkerStatus.warming && (
                  <span style={{ color:"#fbbf24", display:"inline-flex", alignItems:"center", gap:4 }}>
                    <Loader2 size={11} className="erp-spin" /> calentando modelo…
                  </span>
                )}
                {faceDfLiveEnabled && !faceDfWorkerStatus.warming && faceDfWorkerStatus.ready && (
                  <span style={{ color:"#86efac" }}>· modelo listo</span>
                )}
                {faceDfLiveEnabled && ` · frames: ${faceDfLiveTick}`}
              </div>
            )}
            {faceOcrErr && <div style={{ fontSize:12, color:"#fca5a5", marginTop:8 }}>{faceOcrErr}</div>}
            {faceOcrText && (
              <div style={{ marginTop:10, padding:10, borderRadius:10, background:"rgba(0,0,0,.35)", fontSize:12, color:"#e2e8f0", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
                <strong style={{ color:"#c4b5fd" }}>OCR:</strong> {faceOcrText}
              </div>
            )}
            {faceDfErr && <div style={{ fontSize:12, color:"#fca5a5", marginTop:8 }}>{faceDfErr}</div>}
            {faceDfResult?.ok && (
              <div style={{ marginTop:10, padding:10, borderRadius:10, background:"rgba(0,0,0,.35)", fontSize:12, color:"#e2e8f0", fontFamily:"ui-monospace, monospace" }}>
                <strong style={{ color:"#6ee7b7" }}>DeepFace:</strong>{" "}
                edad ~{faceDfResult.age ?? "—"}, {String(faceDfResult.dominant_gender ?? "")}, {String(faceDfResult.dominant_emotion ?? "")}
                {faceDfResult.dominant_race != null ? `, ${String(faceDfResult.dominant_race)}` : ""}
                <pre style={{ margin:"8px 0 0", fontSize:11, overflow:"auto", maxHeight:160 }}>{JSON.stringify(faceDfResult, null, 2)}</pre>
              </div>
            )}
          </div>

          {facePreview && !camaraEncendida && !faceAnalyzing && (
            <div style={{ marginTop:10 }}>
              <Btn type="button" variant="outline" onClick={() => setAnnotActive(true)}
                style={{ width:"100%", borderColor:"rgba(167,139,250,.4)", color:"#c4b5fd", minHeight:42, justifyContent:"center" }}>
                <Pencil size={15}/> Anotar / marcar zonas del rostro
              </Btn>
            </div>
          )}

          {faceResult && !faceAnalyzing && faceResult._real && (
            <div style={{
              marginTop:14,
              padding:14,
              borderRadius:12,
              background:"rgba(0,0,0,.35)",
              border:"1px solid rgba(167,139,250,.25)",
              fontSize:13,
              color:"#e2e8f0",
              lineHeight:1.5,
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:8 }}>
                <div style={{ fontWeight:800, color:"#c4b5fd" }}>Análisis IA del rostro (DeepFace + OpenAI)</div>
                {faceResult._ts && (
                  <div style={{ fontSize:11, color:"#64748b" }}>
                    actualizado {new Date(faceResult._ts).toLocaleTimeString("es-ES")}
                  </div>
                )}
              </div>

              {faceResult.deepface && (
                <div style={{ marginBottom:10, padding:"8px 10px", borderRadius:8, background:"rgba(16,185,129,.1)", border:"1px solid rgba(16,185,129,.28)" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#6ee7b7", marginBottom:4 }}>DeepFace (local)</div>
                  <div>Edad estimada: <strong>{faceResult.deepface.age ?? "—"}</strong> · Género: <strong>{String(faceResult.deepface.dominant_gender ?? "—")}</strong></div>
                  <div>Emoción: <strong>{String(faceResult.deepface.dominant_emotion ?? "—")}</strong>{faceResult.deepface.dominant_race ? <> · Etnia aprox.: <strong>{String(faceResult.deepface.dominant_race)}</strong></> : null}</div>
                  {typeof faceResult.deepface.face_confidence === "number" && (
                    <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Confianza detección: {(faceResult.deepface.face_confidence * 100).toFixed(0)}%</div>
                  )}
                </div>
              )}

              {faceResult.clinico ? (
                <div style={{ padding:"8px 10px", borderRadius:8, background:"rgba(167,139,250,.1)", border:"1px solid rgba(167,139,250,.28)" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#c4b5fd", marginBottom:4 }}>Evaluación clínico-estética (OpenAI Vision)</div>
                  <div>Tipo de piel: <strong>{faceResult.clinico.tipoPiel || "—"}</strong> · Fototipo: <strong>{faceResult.clinico.fototipo || "—"}</strong></div>
                  <div>Hidratación: <strong>{faceResult.clinico.hidratacion || "—"}</strong> · Luminosidad: <strong>{faceResult.clinico.luminosidad || "—"}</strong></div>
                  {faceResult.clinico.simetria && <div>Simetría: {faceResult.clinico.simetria}</div>}
                  {Array.isArray(faceResult.clinico.arrugas) && faceResult.clinico.arrugas.length > 0 && (
                    <div>Arrugas: {faceResult.clinico.arrugas.join(", ")}</div>
                  )}
                  {faceResult.clinico.manchas && <div>Manchas: {faceResult.clinico.manchas}</div>}
                  {faceResult.clinico.porosYTextura && <div>Poros/textura: {faceResult.clinico.porosYTextura}</div>}
                  {faceResult.clinico.ojeras && <div>Ojeras: {faceResult.clinico.ojeras}</div>}
                  {faceResult.clinico.flacidez && <div>Flacidez: {faceResult.clinico.flacidez}</div>}
                  {faceResult.clinico.observacionesClinicas && (
                    <div style={{ marginTop:6, fontStyle:"italic", color:"#cbd5e1" }}>{faceResult.clinico.observacionesClinicas}</div>
                  )}
                  {Array.isArray(faceResult.clinico.recomendaciones) && faceResult.clinico.recomendaciones.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#c4b5fd" }}>Recomendaciones</div>
                      <ul style={{ margin:"4px 0 0 18px", padding:0 }}>
                        {faceResult.clinico.recomendaciones.map((x, i) => <li key={i} style={{ marginBottom:2 }}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(faceResult.clinico.alertas) && faceResult.clinico.alertas.length > 0 && (
                    <div style={{ marginTop:8, padding:"6px 8px", borderRadius:6, background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.35)" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#fca5a5" }}>⚠ Alertas</div>
                      <ul style={{ margin:"4px 0 0 18px", padding:0, color:"#fecaca" }}>
                        {faceResult.clinico.alertas.map((x, i) => <li key={i}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                  <div style={{ fontSize:11, color:"#64748b", marginTop:8 }}>{faceResult.clinico.disclaimer || "Análisis asistido por IA; no reemplaza valoración presencial."}</div>
                </div>
              ) : faceResult.clinicoError ? (
                <div style={{ padding:"8px 10px", borderRadius:8, background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.28)", fontSize:12, color:"#fca5a5" }}>
                  No se pudo obtener el análisis clínico (OpenAI): {faceResult.clinicoError}
                </div>
              ) : null}

              <div style={{ fontSize:11, color:"#6ee7b7", marginTop:10 }}>
                ✓ Volcado automático al protocolo de la sesión
              </div>
            </div>
          )}
          <div style={{ marginTop:18, paddingTop:16, borderTop:"1px solid #334155", display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
            {wizardFase === "registro" ? (
              <>
                <Btn type="button" variant="outline" onClick={() => setWizardFase("propuesta_ia")} style={{ borderColor:"#64748b", color:"#e2e8f0", minHeight:44 }}>
                  <ChevronLeft size={16}/> Propuesta IA
                </Btn>
                <Btn
                  type="button"
                  onClick={() => {
                    if (usarTripleSesionMedica) {
                      setFotoSesionFase("despues")
                      if (!despuesTripleCompleto) {
                        setFaceShotIndex(0)
                        faceTripleRef.current = { front: null, profileLeft: null, profileRight: null }
                        setFaceTripleShot({ front: null, profileLeft: null, profileRight: null })
                        setFacePreview(null)
                        setFaceResult(null)
                        setFaceError("")
                        setAnnotActive(false)
                        setFaceLandmarks(null)
                        annotHistory.current = []
                        setModalGuiaDespuesOpen(true)
                      }
                    }
                    setWizardFase("resultado")
                  }}
                  style={{ minHeight:44, background:"linear-gradient(135deg,#7c3aed,#6366f1)", border:"none", flex:1, justifyContent:"center" }}
                >
                  Continuar a resultado <ChevronRight size={16}/>
                </Btn>
              </>
            ) : (
              <>
                <Btn type="button" variant="outline" onClick={() => setWizardFase("registro")} style={{ borderColor:"#64748b", color:"#e2e8f0", minHeight:44 }}>
                  <ChevronLeft size={16}/> Fotos antes
                </Btn>
                <Btn type="button" onClick={() => setWizardFase("evaluacion")} style={{ minHeight:44, background:"linear-gradient(135deg,#7c3aed,#6366f1)", border:"none", flex:1, justifyContent:"center" }}>
                  Continuar a evaluación <ChevronRight size={16}/>
                </Btn>
              </>
            )}
          </div>
        </div>}

        {wizardFase === "evaluacion" && <div key="wiz-evaluacion" className="erp-fadein" style={medCard}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
            <div style={{
              width:38, height:38, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
              background:C.gradient, color:"#fff",
              boxShadow:`0 8px 18px -6px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.4) inset`,
            }}>
              <FileText size={18} strokeWidth={2.4}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:C.violet, letterSpacing:"0.08em", textTransform:"uppercase" }}>Paso 5</div>
              <div style={{ fontSize:17, fontWeight:800, color:C.text, letterSpacing:"-0.01em" }}>Evaluación clínica</div>
            </div>
          </div>
          <p style={{ fontSize:13, color:C.muted, marginBottom:12, lineHeight:1.45 }}>Ajustá o ampliá el texto; se guarda con el protocolo al cerrar la sesión.</p>
          <textarea
            style={{ width:"100%", minHeight: narrow ? 100 : 120, borderRadius:10, border:`1px solid ${C.border}`, background:"#fafafa", color:C.text, padding:14, fontSize:16, resize:"vertical", boxSizing:"border-box" }}
            value={evaluacion}
            onChange={e => setEvaluacion(e.target.value)}
            placeholder="Motivo, hallazgos, plan…"
          />
          <div style={{ display:"flex", gap:10, marginTop:14, flexWrap:"wrap" }}>
            <Btn type="button" variant="outline" onClick={() => setWizardFase("resultado")} style={{ borderColor:C.border, color:C.text, minHeight:44 }}>
              <ChevronLeft size={16}/> Resultado
            </Btn>
            <Btn type="button" onClick={() => setWizardFase("orden")} style={{ minHeight:44, background:C.violet, border:"none", flex:1, justifyContent:"center" }}>
              Ir a orden y cierre <ChevronRight size={16}/>
            </Btn>
          </div>
        </div>}

        {wizardFase === "orden" && <div key="wiz-orden" className="erp-fadein" style={{ ...medCard, display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div style={{
              width:38, height:38, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
              background:C.gradient, color:"#fff",
              boxShadow:`0 8px 18px -6px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.4) inset`,
            }}>
              <CheckCircle2 size={18} strokeWidth={2.4}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:C.violet, letterSpacing:"0.08em", textTransform:"uppercase" }}>Paso 6 · Final</div>
              <div style={{ fontSize:17, fontWeight:800, color:C.text, letterSpacing:"-0.01em" }}>Orden, insumos y envío</div>
            </div>
          </div>
          <p style={{ fontSize:13, color:C.muted, lineHeight:1.45, margin:0 }}>Confirmá uno o varios servicios a facturar y el protocolo; al finalizar se descuenta stock y se envía el cobro a recepción.</p>
          <FG label="Servicios a facturar (suman en recepción)" full>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {serviciosOrdenIds.map((sid, idx) => (
                <div key={`srv-ord-${idx}-${sid}`} style={{ display:"flex", gap:8, alignItems:"stretch", flexWrap:"wrap" }}>
                  <select
                    style={{ ...inp, flex:1, minWidth:200, background:"#fff", color:C.text, fontSize:16, minHeight:48 }}
                    value={sid ?? ""}
                    onChange={e => {
                      const v = +e.target.value
                      setServiciosOrdenIds(prev => prev.map((p, i) => (i === idx ? v : p)))
                    }}
                  >
                    {noServicios && <option value="">No hay servicios cargados</option>}
                    {data.servicios.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre} — {fmt(s.precio)} · {catLabel[s.cat]}</option>
                    ))}
                  </select>
                  {serviciosOrdenIds.length > 1 && (
                    <Btn
                      type="button"
                      variant="outline"
                      onClick={() => setServiciosOrdenIds(prev => prev.filter((_, i) => i !== idx))}
                      style={{ borderColor:C.border, color:C.text, minHeight:48 }}
                    >
                      Quitar
                    </Btn>
                  )}
                </div>
              ))}
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"flex-end" }}>
                <Btn
                  type="button"
                  variant="outline"
                  sm
                  disabled={noServicios || !data.servicios.some(s => !serviciosOrdenIds.includes(s.id))}
                  onClick={() => {
                    const next = data.servicios.find(s => !serviciosOrdenIds.includes(s.id))
                    if (next) setServiciosOrdenIds(prev => [...prev, next.id])
                  }}
                >
                  <Plus size={12}/> Añadir otro servicio
                </Btn>
                <Btn variant="outline" sm onClick={() => setOpenNuevoServicio(true)}><Plus size={12}/> Nuevo servicio (manual)</Btn>
              </div>
            </div>
          </FG>
          {noServicios && <div style={{ fontSize:12, color:"#cbd5e1" }}>Cargá servicios desde `Servicios` para poder enviar la sesión a recepción.</div>}
          {srvsOrden.length > 0 && (
            <div style={{ fontSize:13, padding:"10px 12px", background:"rgba(124,58,237,.15)", borderRadius:10, border:"1px solid rgba(167,139,250,.35)" }}>
              <strong>Total servicios ({srvsOrden.length}):</strong> {fmt(totalPrecioServiciosOrden)} · Se sumarán consumibles para el total a cobrar.
            </div>
          )}
          <FG label="Protocolo aplicado" full>
            <textarea style={{ ...inp, minHeight:72, background:"#fff", fontSize:16 }} value={protocolo} onChange={e => setProtocolo(e.target.value)} placeholder="Ej: Bótox glabela + patas de gallo — 12 U" />
          </FG>
          {plantillasConsentArea.length > 0 && (
            <div style={{
              padding:"12px 14px",
              borderRadius:12,
              border:"1px solid #6ee7b7",
              background:"#ecfdf5",
              boxShadow:"0 1px 2px rgba(15,23,42,.06)",
            }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#047857", marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
                <FileText size={16} color="#047857"/> Consentimiento informado
              </div>
              <p style={{ fontSize:12, color:"#334155", lineHeight:1.45, margin:"0 0 10px" }}>
                Hay <strong>un consentimiento por cada servicio</strong> a facturar que lo requiera (p. ej. mesoterapía y ácido hialurónico → dos registros). La <strong>plantilla sugerida</strong> se infiere del <strong>nombre del servicio</strong>; el protocolo se añade al texto al guardar. Revisá la plantilla antes de firmar.
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {srvsOrden.map(s => {
                  const sug = sugerirPlantillaConsentDesdeNombreServicio(plantillasConsentArea, s.nombre)
                  const plSug = plantillasConsentArea.find(p => p.slug === sug)
                  const yaRegistrado = consentimientoFirmadoParaServicioNombre(consentimientosTurnoActual, s.nombre)
                  return (
                    <Btn
                      key={`cons-srv-${s.id}`}
                      type="button"
                      variant="outline"
                      onClick={() => abrirModalConsentAreaParaServicio(s)}
                      disabled={!pacienteSesion}
                      style={{
                        borderColor:"#34d399",
                        color:"#064e3b",
                        background:"#fff",
                        width:"100%",
                        minHeight:48,
                        justifyContent:"center",
                        flexDirection:"column",
                        alignItems:"stretch",
                        gap:4,
                        padding:"10px 12px",
                      }}
                    >
                      <span style={{ fontWeight:700, fontSize:14, textAlign:"left", color:"#064e3b" }}>
                        Registrar consentimiento — {s.nombre}
                        {yaRegistrado ? (
                          <span style={{ fontWeight:600, fontSize:11, marginLeft:8, color:"#059669" }}>(ya registrado)</span>
                        ) : null}
                      </span>
                      {plSug ? (
                        <span style={{ fontSize:11, color:"#475569", textAlign:"left", fontWeight:500 }}>
                          Plantilla sugerida: {String(plSug.titulo || plSug.slug).trim()}
                        </span>
                      ) : (
                        <span style={{ fontSize:11, color:"#64748b", textAlign:"left" }}>Elegí plantilla en el siguiente paso</span>
                      )}
                    </Btn>
                  )
                })}
              </div>
              {consentimientosTurnoActual.length > 0 && (
                <p style={{ fontSize:11, color:"#047857", margin:"8px 0 0", lineHeight:1.4 }}>
                  Esta sesión ya tiene {consentimientosTurnoActual.length} consentimiento(s) guardado(s). Podés abrir otro para un servicio distinto o repetir si hace falta.
                </p>
              )}
              {!pacienteSesion && turno && (
                <p style={{ fontSize:11, color:"#b91c1c", margin:"8px 0 0" }}>Este turno no tiene paciente vinculada en el sistema. Revisá que el turno tenga cliente/paciente en Agenda.</p>
              )}
            </div>
          )}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:8 }}>
              {idsMaterialesSrv.length ? `Productos extra sobre materiales base (${srvsOrden.map(s => s.nombre).join(" · ") || "—"})` : `Productos extra (stock C${clinicId})`}
            </div>
            <div style={{ maxHeight: narrow ? 200 : 220, overflowY:"auto", WebkitOverflowScrolling:"touch", border:`1px solid ${C.border}`, borderRadius:10, padding:10, background:"#fff" }}>
              {stockMaterialesServicio.map(filaInsumo)}
            </div>
            {idsMaterialesSrv.length > 0 && stockOtrosInsumos.length > 0 && (
              <>
                <Btn type="button" variant="outline" onClick={() => setVerStockCompleto(v => !v)} style={{ marginTop:10, width:"100%", borderColor:C.border, color:C.text, minHeight:40 }}>
                  {verStockCompleto ? "Ocultar resto del catálogo" : "Ver catálogo completo de insumos"}
                </Btn>
                {verStockCompleto && (
                  <div style={{ marginTop:10, maxHeight: narrow ? 180 : 200, overflowY:"auto", WebkitOverflowScrolling:"touch", border:`1px solid ${C.border}`, borderRadius:10, padding:10, background:"#fafafa" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8 }}>Otros ítems de stock</div>
                    {stockOtrosInsumos.map(filaInsumo)}
                  </div>
                )}
              </>
            )}
          </div>
          <FG label="Notas clínicas" full>
            <textarea style={{ ...inp, minHeight:64, background:"#fff", fontSize:16 }} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Evolución, observaciones…" />
          </FG>
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center", marginTop:8 }}>
            <Btn type="button" variant="outline" onClick={() => setWizardFase("evaluacion")} style={{ borderColor:C.border, color:C.text, minHeight:44 }}>
              <ChevronLeft size={16}/> Evaluación
            </Btn>
          </div>
          {!narrow && <div style={{ display:"flex", justifyContent:"flex-end", flexDirection:"row", gap:10, flexWrap:"wrap", marginTop:12 }}>
            <Btn variant="outline" onClick={onExit} style={{ borderColor:C.border, color:C.text, minHeight:48, background:"#fff" }}>Salir sin enviar</Btn>
            <Btn onClick={finalizar} disabled={srvsOrden.length === 0 || !protocolo.trim()} style={{ minHeight:48 }}>Finalizar y enviar a recepción</Btn>
          </div>}
        </div>}
        {narrow && (
          <div style={{
            position:"fixed",
            left:0,
            right:0,
            bottom:0,
            zIndex:1200,
            padding:"12px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))",
            background:"linear-gradient(135deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.72) 100%)",
            backdropFilter:"blur(22px) saturate(200%)",
            WebkitBackdropFilter:"blur(22px) saturate(200%)",
            borderTop:"1px solid rgba(255,255,255,0.55)",
            boxShadow:"0 -10px 28px -12px rgba(15,23,42,.2), 0 -1px 0 rgba(255,255,255,0.7) inset",
            display:"grid",
            gridTemplateColumns:"auto auto 1fr",
            gap:10,
            alignItems:"center",
          }}>
            <Btn variant="outline" sm onClick={goPrevStep} disabled={stepIndex <= 0} style={{ borderColor:"rgba(255,255,255,0.6)", color:C.text, minHeight:44, background:"rgba(255,255,255,0.72)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)" }}>
              <ChevronLeft size={14}/> Atrás
            </Btn>
            <Btn variant="outline" sm onClick={goNextStep} disabled={stepIndex >= wizardDefs.length - 1} style={{ borderColor:"rgba(255,255,255,0.6)", color:C.text, minHeight:44, background:"rgba(255,255,255,0.72)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)" }}>
              Sig. <ChevronRight size={14}/>
            </Btn>
            <Btn onClick={() => void finalizar()} disabled={finalizando || noServicios || srvsOrden.length === 0 || !protocolo.trim() || wizardFase !== "orden"} style={{ minHeight:44, justifyContent:"center", background:C.gradient, border:"none", fontWeight:800 }}>{finalizando ? "Enviando…" : "Enviar"}</Btn>
          </div>
        )}
      </div>
      <Modal open={openConsArea} onClose={() => { if (!savingConsArea) setOpenConsArea(false) }} title="Consentimiento — Área médica"
        footer={<><Btn variant="outline" disabled={savingConsArea} onClick={() => setOpenConsArea(false)}>Cancelar</Btn><Btn disabled={savingConsArea} onClick={() => void guardarConsentArea()}>{savingConsArea ? "Guardando…" : "PDF + registrar"}</Btn></>}>
        <div style={{ maxHeight: "min(82vh, 680px)", overflowY: "auto", paddingRight: 4 }}>
          <FG label="Plantilla" full>
            <select
              style={inp}
              value={formConsArea.plantillaSlug}
              onChange={e => setFormConsArea(f => ({ ...f, plantillaSlug: e.target.value }))}
            >
              <option value="">Seleccionar…</option>
              {plantillasConsentArea.map(p => (
                <option key={p.slug} value={p.slug}>{etiquetaPlantillaConsent(p)}</option>
              ))}
            </select>
          </FG>
          <ConsentPlantillaDocxLink plantilla={plantillasConsentArea.find(p => p.slug === formConsArea.plantillaSlug)} C={C} />
          <FG label="Servicio o producto a aplicar" full>
            <input
              style={inp}
              value={formConsArea.servicioProducto}
              onChange={e => setFormConsArea(f => ({ ...f, servicioProducto: e.target.value }))}
              placeholder="Servicio y protocolo de esta sesión"
            />
          </FG>
          <ConsentimientoLecturaPanel
            html={consentPreviewHtmlArea}
            C={C}
            subtitle={`Texto completo con los datos de ${pacienteSesion?.nombre || "la paciente"}. Debe leerlo antes de firmar.`}
          />
          <p style={{ fontSize:11, color:C.muted, marginTop:8, lineHeight:1.5 }}>
            El <strong>PDF</strong> lo genera la app (mismo texto + firmas) y se sube vinculado al turno. Para el <strong>Word con logo</strong>, usá el enlace de arriba si existe.
          </p>
          <div style={{ marginTop:14, borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
            <SignaturePad
              ref={sigPacienteRef}
              width={Math.min(340, typeof window !== "undefined" ? Math.min(340, window.innerWidth - 80) : 340)}
              height={130}
              label="Firma de la paciente (obligatoria)"
              hint="Pedile que firme con el dedo en la tablet o teléfono."
            />
            <Btn type="button" variant="outline" sm style={{ marginTop:6 }} onClick={() => sigPacienteRef.current?.clear?.()}>Limpiar firma paciente</Btn>
          </div>
          <div style={{ marginTop:14 }}>
            <SignaturePad
              ref={sigProfesionalRef}
              width={Math.min(340, typeof window !== "undefined" ? Math.min(340, window.innerWidth - 80) : 340)}
              height={110}
              label="Firma del / la profesional (opcional)"
              hint="Si no firmás acá, el PDF incluye tu nombre como texto."
            />
            <Btn type="button" variant="outline" sm style={{ marginTop:6 }} onClick={() => sigProfesionalRef.current?.clear?.()}>Limpiar firma profesional</Btn>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!consentAreaVistaPrevia}
        onClose={() => setConsentAreaVistaPrevia(null)}
        title={
          consentAreaVistaPrevia?.mostrarPdf && consentAreaVistaPrevia?.titulo
            ? `Vista previa — ${consentAreaVistaPrevia.titulo}`
            : "Consentimiento registrado"
        }
        footer={
          <>
            {consentAreaVistaPrevia?.mostrarPdf ? (
              <Btn variant="outline" onClick={() => setConsentAreaVistaPrevia(v => (v ? { ...v, mostrarPdf: false } : null))}>
                Volver al resumen
              </Btn>
            ) : null}
            <Btn onClick={() => setConsentAreaVistaPrevia(null)}>Cerrar</Btn>
          </>
        }
      >
        {consentAreaVistaPrevia && (
          <div style={{ maxHeight: "min(82vh, 720px)", overflowY: "auto" }}>
            <div
              style={{
                marginBottom: 14,
                padding: 12,
                borderRadius: 10,
                background: "#f0fdf4",
                border: `1px solid #86efac`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: "#166534", marginBottom: 6 }}>Listo — quedó guardado</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>
                {consentAreaVistaPrevia.pacienteNombre || "Paciente"}
              </div>
              {consentAreaVistaPrevia.servicioProducto ? (
                <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.45 }}>
                  <strong>Servicio / producto:</strong> {consentAreaVistaPrevia.servicioProducto}
                </p>
              ) : null}
              <p style={{ fontSize: 11, color: C.muted, margin: "8px 0 0", lineHeight: 1.45 }}>
                Podés revisar el PDF con el texto completo y las firmas, o el texto archivado debajo.
              </p>
            </div>
            {!consentAreaVistaPrevia.mostrarPdf && consentAreaVistaPrevia.pdfUrl ? (
              <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <Btn onClick={() => setConsentAreaVistaPrevia(v => (v ? { ...v, mostrarPdf: true } : null))}>Vista previa del PDF firmado</Btn>
                <Btn variant="outline" sm onClick={() => window.open(consentAreaVistaPrevia.pdfUrl, "_blank", "noopener,noreferrer")}>
                  Abrir PDF en nueva pestaña
                </Btn>
              </div>
            ) : null}
            {consentAreaVistaPrevia.mostrarPdf && consentAreaVistaPrevia.pdfUrl ? (
              <div style={{ marginBottom: 14 }}>
                <object
                  data={consentAreaVistaPrevia.pdfUrl}
                  type="application/pdf"
                  style={{
                    width: "100%",
                    minHeight: "min(52vh, 480px)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    background: "#e2e8f0",
                  }}
                >
                  <p style={{ padding: 12, fontSize: 13 }}>
                    Tu navegador no muestra PDF embebido.{" "}
                    <a
                      href={consentAreaVistaPrevia.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 700, color: C.violet }}
                    >
                      Abrir el PDF
                    </a>
                  </p>
                </object>
              </div>
            ) : null}
            <details style={{ marginTop: 8 }} open={!consentAreaVistaPrevia.mostrarPdf}>
              <summary style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", color: C.muted, marginBottom: 8 }}>
                Texto del consentimiento (datos de la paciente)
              </summary>
              {consentAreaVistaPrevia.contenidoHtml ? (
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    maxHeight: "36vh",
                    overflowY: "auto",
                    padding: 10,
                    borderRadius: 8,
                    background: "#f8fafc",
                    border: `1px solid ${C.border}`,
                  }}
                  dangerouslySetInnerHTML={{ __html: consentAreaVistaPrevia.contenidoHtml }}
                />
              ) : (
                <p style={{ color: C.muted, fontSize: 13 }}>No hay texto HTML para mostrar.</p>
              )}
            </details>
          </div>
        )}
      </Modal>
      <Modal open={openNuevoServicio} onClose={() => setOpenNuevoServicio(false)} title="Crear servicio rápido"
        footer={<><Btn variant="outline" onClick={() => setOpenNuevoServicio(false)} disabled={savingNuevoServicio}>Cancelar</Btn><Btn disabled={savingNuevoServicio} onClick={async () => {
          try {
            setSavingNuevoServicio(true)
            const srv = await crearServicioRapido({
              nombre: formNuevoServicio.nombre,
              cat: formNuevoServicio.cat,
              precio: formNuevoServicio.precio,
              duracion: formNuevoServicio.duracion,
            })
            if (srv?.id) {
              setServiciosOrdenIds([+srv.id])
              setOpenNuevoServicio(false)
              setFormNuevoServicio({ nombre:"", cat:"clinico", precio:"", duracion:"30" })
            }
          } catch (e) {
            alert(String(e?.message || e))
          } finally {
            setSavingNuevoServicio(false)
          }
        }}>Guardar servicio</Btn></>}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <FG label="Nombre" full><input style={inp} value={formNuevoServicio.nombre} onChange={e => setFormNuevoServicio(f => ({ ...f, nombre:e.target.value }))} placeholder="Ej: Limpieza facial profunda"/></FG>
          <FG label="Categoría">
            <select style={inp} value={formNuevoServicio.cat} onChange={e => setFormNuevoServicio(f => ({ ...f, cat:e.target.value }))}>
              <option value="valoracion">Valoración</option>
              <option value="clinico">Clínico</option>
              <option value="facial">Facial</option>
              <option value="corporal">Corporal</option>
              <option value="laser">Láser</option>
              <option value="botox">Bótox</option>
            </select>
          </FG>
          <FG label="Precio"><input type="number" min="0" style={inp} value={formNuevoServicio.precio} onChange={e => setFormNuevoServicio(f => ({ ...f, precio:e.target.value }))} placeholder="0"/></FG>
          <FG label="Duración (min)"><input type="number" min="5" style={inp} value={formNuevoServicio.duracion} onChange={e => setFormNuevoServicio(f => ({ ...f, duracion:e.target.value }))}/></FG>
        </div>
      </Modal>
      <Modal
        open={askExtrasOpen}
        onClose={() => setAskExtrasOpen(false)}
        title="¿Usaste productos extra?"
        footer={
          <>
            <Btn variant="outline" onClick={() => setAskExtrasOpen(false)}>Sí, voy a cargarlos</Btn>
            <Btn onClick={() => { setAskExtrasOpen(false); setAllowFinalizeWithoutExtras(true); void finalizar() }}>No, finalizar igual</Btn>
          </>
        }
      >
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.45 }}>
          Los materiales base del servicio ya se descontaron al iniciar la sesión. Si utilizaste algo adicional, cargalo antes de finalizar.
        </p>
      </Modal>
      <Modal
        open={modalGuiaDespuesOpen}
        onClose={() => setModalGuiaDespuesOpen(false)}
        title="Fotos de «antes» guardadas"
        footer={<Btn onClick={() => setModalGuiaDespuesOpen(false)}>Entendido</Btn>}
      >
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.45 }}>
          Las tres fotos de «antes» quedaron en la ficha. Se muestra la de frente: podés «Anotar / marcar zonas» para explicar el plan al paciente y guardarlo en ficha.
          En la fase <strong>Resultado</strong> podés dictar el resultado clínico con IA y tomar las tres fotos de «después» (frente, perfil derecho, perfil izquierdo).
        </p>
      </Modal>
      <Modal
        open={confirmSinDespuesOpen}
        onClose={() => setConfirmSinDespuesOpen(false)}
        title="Fotos de «después» incompletas"
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirmSinDespuesOpen(false)}>Cancelar</Btn>
            <Btn onClick={() => { setConfirmSinDespuesOpen(false); allowFinalizeSinDespuesRef.current = true; void finalizar() }}>Finalizar igual y enviar</Btn>
          </>
        }
      >
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.45 }}>
          No completaste las tres fotos de «después» (frente, perfil derecho e izquierdo) en esta sesión. ¿Finalizar igual y enviar a recepción?
        </p>
      </Modal>
      <Modal
        open={medSessionModal.open}
        onClose={() => setMedSessionModal(m => ({ ...m, open: false }))}
        title={medSessionModal.title || "Aviso"}
        footer={<Btn onClick={() => setMedSessionModal(m => ({ ...m, open: false }))}>Cerrar</Btn>}
      >
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.45, whiteSpace:"pre-wrap" }}>{medSessionModal.body}</p>
      </Modal>

      {annotActive && facePreview && (
        <div style={{
          position:"fixed", inset:0, zIndex:9999,
          background:"#0f172a",
          display:"flex", flexDirection:"column",
          touchAction:"none",
          userSelect:"none", WebkitUserSelect:"none",
        }}>
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"8px 12px",
            background:"rgba(15,23,42,.95)",
            borderBottom:"1px solid rgba(167,139,250,.2)",
            flexShrink:0,
          }}>
            <span style={{ fontSize:14, fontWeight:800, color:"#e2e8f0", display:"flex", alignItems:"center", gap:8 }}>
              <Pencil size={16} color="#a78bfa"/> Anotar foto
            </span>
            <div style={{ display:"flex", gap:6 }}>
              <button type="button" onClick={() => setAnnotShowGuide(g => !g)} title={annotShowGuide ? "Ocultar guía facial" : "Mostrar guía facial"}
                style={{ width:36, height:36, borderRadius:8, border: annotShowGuide ? "2px solid #a78bfa" : "1px solid rgba(255,255,255,.2)", background: annotShowGuide ? "rgba(167,139,250,.2)" : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ScanLine size={16} color={annotShowGuide ? "#c4b5fd" : "#64748b"}/>
              </button>
              <button type="button" onClick={annotUndo}
                style={{ width:36, height:36, borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Undo2 size={16} color="#e2e8f0"/>
              </button>
              <button type="button" onClick={annotClear}
                style={{ width:36, height:36, borderRadius:8, border:"1px solid rgba(255,255,255,.2)", background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <RotateCcw size={16} color="#e2e8f0"/>
              </button>
            </div>
          </div>

          {facePreview && (
            <div style={{ flexShrink: 0, padding: "0 12px 10px", borderBottom: "1px solid rgba(167,139,250,.15)" }}>
              {faceCroquisControls}
            </div>
          )}

          <div style={{ flex:1, position:"relative", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", background:"#000" }}>
            <img src={facePreview} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"contain" }} />
            <canvas
              ref={mpGuideCanvasRef}
              aria-hidden
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:2 }}
            />
            {annotShowGuide && faceLandmarks && !mpAnnotLandmarks && (() => {
              const L = faceLandmarks
              const p = (pt) => (pt && typeof pt.x === "number" && typeof pt.y === "number" ? { x: pt.x, y: pt.y } : null)
              const el = p(L.eyeLeft), er = p(L.eyeRight)
              const nt = p(L.noseTip), nb = p(L.noseBridge)
              const nla = p(L.noseLeftAla), nra = p(L.noseRightAla)
              const ml = p(L.mouthLeft), mr2 = p(L.mouthRight), mt2 = p(L.mouthTop), mb = p(L.mouthBottom)
              const chin = p(L.chinTip), fc = p(L.foreheadCenter)
              const blo = p(L.eyebrowLeftOuter), bli = p(L.eyebrowLeftInner)
              const bri = p(L.eyebrowRightInner), bro = p(L.eyebrowRightOuter)
              const jl = p(L.jawLeft), jr = p(L.jawRight)
              const earL = p(L.earLeft), earR = p(L.earRight)
              const cx = el && er ? (el.x + er.x) / 2 : (fc?.x ?? chin?.x ?? 50)
              const yEye = el && er ? (el.y + er.y) / 2 : 45
              const yBrow = blo && bli && bri && bro ? (blo.y + bli.y + bri.y + bro.y) / 4 : yEye - 5
              const yHair = fc ? Math.min(fc.y - 4, yBrow - 5) : yBrow - 6
              const yNose = nla && nra ? (nla.y + nra.y) / 2 : (nt?.y ?? yEye + 12)
              const yMouth = mt2 && mb ? (mt2.y + mb.y) / 2 : (ml && mr2 ? (ml.y + mr2.y) / 2 : yNose + 6)
              const xL = jl ? jl.x - 1 : cx - 26
              const xR = jr ? jr.x + 1 : cx + 26
              const yTop = fc ? fc.y - 1 : yHair
              const yBot = chin ? chin.y + 1 : yMouth + 10
              const ys = [yHair, yBrow, yEye, yNose, yMouth].filter(y => y >= 0 && y <= 100)
              const eyeRx = el && er ? Math.abs(er.x - el.x) * 0.2 : 2.8
              const eyeRy = eyeRx * 0.55
              return (
                <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:2, opacity:0.88 }}>
                  {fc && jl && chin && jr && (
                    <path
                      d={`M${fc.x},${fc.y} Q${jl.x - 2},${(fc.y + jl.y) / 2} ${jl.x},${jl.y} Q${(jl.x + chin.x) / 2},${(jl.y + chin.y) / 2 + 1.5} ${chin.x},${chin.y} Q${(jr.x + chin.x) / 2},${(jr.y + chin.y) / 2 + 1.5} ${jr.x},${jr.y} Q${jr.x + 2},${(fc.y + jr.y) / 2} ${fc.x},${fc.y}`}
                      fill="none"
                      stroke="#a78bfa"
                      strokeWidth="0.42"
                    />
                  )}
                  <line x1={cx} y1={yTop} x2={cx} y2={yBot} stroke="#a78bfa" strokeWidth="0.22" opacity={0.55} />
                  {ys.map((y, i) => (
                    <line key={i} x1={xL} y1={y} x2={xR} y2={y} stroke="#a78bfa" strokeWidth="0.18" opacity={0.42 + i * 0.03} strokeDasharray={i === 0 || i === 4 ? "1.1 0.7" : undefined} />
                  ))}
                  {el && <ellipse cx={el.x} cy={el.y} rx={eyeRx} ry={eyeRy} fill="none" stroke="#a78bfa" strokeWidth="0.22" opacity={0.75} />}
                  {er && <ellipse cx={er.x} cy={er.y} rx={eyeRx} ry={eyeRy} fill="none" stroke="#a78bfa" strokeWidth="0.22" opacity={0.75} />}
                  {nb && nt && <line x1={nb.x} y1={nb.y} x2={nt.x} y2={nt.y} stroke="#a78bfa" strokeWidth="0.2" opacity={0.55} />}
                  {nla && nt && nra && (
                    <path d={`M${nla.x},${nla.y} Q${nt.x},${nt.y + 1} ${nra.x},${nra.y}`} fill="none" stroke="#a78bfa" strokeWidth="0.24" opacity={0.65} />
                  )}
                  {ml && mt2 && mr2 && <path d={`M${ml.x},${ml.y} Q${mt2.x},${mt2.y - 0.8} ${mr2.x},${mr2.y}`} fill="none" stroke="#a78bfa" strokeWidth="0.22" opacity={0.65} />}
                  {ml && mb && mr2 && <path d={`M${ml.x},${ml.y} Q${mb.x},${mb.y + 0.4} ${mr2.x},${mr2.y}`} fill="none" stroke="#a78bfa" strokeWidth="0.22" opacity={0.65} />}
                  {earL && (
                    <path d={`M${earL.x + 1.2} ${earL.y - 3} Q${earL.x - 1.5} ${earL.y} ${earL.x + 1.2} ${earL.y + 3}`} fill="none" stroke="#a78bfa" strokeWidth="0.2" opacity={0.55} />
                  )}
                  {earR && (
                    <path d={`M${earR.x - 1.2} ${earR.y - 3} Q${earR.x + 1.5} ${earR.y} ${earR.x - 1.2} ${earR.y + 3}`} fill="none" stroke="#a78bfa" strokeWidth="0.2" opacity={0.55} />
                  )}
                </svg>
              )
            })()}
            {annotShowGuide && mpAnnotStatus === "loading" && !mpAnnotLandmarks && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:2, pointerEvents:"none" }}>
                <div style={{ background:"rgba(0,0,0,.6)", borderRadius:12, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
                  <Loader2 size={18} className="erp-spin" color="#a78bfa"/>
                  <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:700 }}>Detectando rostro (MediaPipe)…</span>
                </div>
              </div>
            )}
            {annotShowGuide && faceLandmarksLoading && mpAnnotStatus !== "loading" && !mpAnnotLandmarks && (
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:2, pointerEvents:"none" }}>
                <div style={{ background:"rgba(0,0,0,.6)", borderRadius:12, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
                  <Loader2 size={18} className="erp-spin" color="#a78bfa"/>
                  <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:700 }}>Analizando rostro (IA)…</span>
                </div>
              </div>
            )}
            {annotShowGuide && !mpAnnotLandmarks && mpAnnotStatus !== "loading" && !faceLandmarks && !faceLandmarksLoading && (
              <div style={{ position:"absolute", inset:0, zIndex:2, pointerEvents:"none" }}>
                <FaceCroquisTechnicalSvg />
              </div>
            )}
            {annotShowGuide && (
              <div style={{ position:"absolute", bottom:8, left:0, right:0, textAlign:"center", zIndex:4, pointerEvents:"none" }}>
                <span style={{ background:"rgba(0,0,0,.5)", borderRadius:8, padding:"4px 10px", fontSize:11, color:"#94a3b8" }}>
                  {mpAnnotLandmarks
                    ? "MediaPipe — croquis sobre la foto (misma vista que en vivo)"
                    : mpAnnotStatus === "loading"
                      ? "Detectando puntos faciales…"
                      : "Guía de proporción (respaldo) · mejor luz frontal si no hay rostro"}
                </span>
              </div>
            )}
            <canvas
              ref={annotCanvasRef}
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", cursor:"crosshair", touchAction:"none", zIndex:3 }}
              onMouseDown={annotStartDraw}
              onMouseMove={annotDraw}
              onMouseUp={annotEndDraw}
              onMouseLeave={annotEndDraw}
              onTouchStart={annotStartDraw}
              onTouchMove={annotDraw}
              onTouchEnd={annotEndDraw}
            />
          </div>

          <div style={{
            flexShrink:0,
            background:"rgba(15,23,42,.95)",
            borderTop:"1px solid rgba(167,139,250,.2)",
            padding:"10px 12px",
          }}>
            {mpAnnotLandmarks && (
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 10px", lineHeight: 1.4 }}>
                <strong style={{ color: "#c4b5fd" }}>Guardar:</strong> descarga 3 PNG a resolución de foto — <strong>croquis</strong> (solo las capas que tengas activas: frente, cejas, labios, papada…), <strong>malla</strong> (puntos 468 si la malla está activa en el panel) y <strong>guías</strong>. La foto con tus dibujos se incorpora a la evaluación.
              </p>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, overflowX:"auto" }}>
              <button type="button" onClick={() => setAnnotMode("pencil")}
                style={{ width:38, height:38, flexShrink:0, borderRadius:10, border: annotMode==="pencil" ? "2px solid #a78bfa" : "1px solid rgba(255,255,255,.2)", background: annotMode==="pencil" ? "rgba(167,139,250,.25)" : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Pencil size={18} color={annotMode==="pencil" ? "#c4b5fd" : "#94a3b8"}/>
              </button>
              <button type="button" onClick={() => setAnnotMode("eraser")}
                style={{ width:38, height:38, flexShrink:0, borderRadius:10, border: annotMode==="eraser" ? "2px solid #a78bfa" : "1px solid rgba(255,255,255,.2)", background: annotMode==="eraser" ? "rgba(167,139,250,.25)" : "transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Eraser size={18} color={annotMode==="eraser" ? "#c4b5fd" : "#94a3b8"}/>
              </button>
              <div style={{ width:1, height:28, background:"rgba(255,255,255,.12)", margin:"0 2px", flexShrink:0 }}/>
              {["#FF3B30","#FF9500","#FFCC00","#34C759","#007AFF","#AF52DE","#FFFFFF"].map(c => (
                <button key={c} type="button" onClick={() => { setAnnotColor(c); setAnnotMode("pencil") }}
                  style={{ width:30, height:30, flexShrink:0, borderRadius:99, border: annotColor===c && annotMode==="pencil" ? "3px solid #fff" : "2px solid rgba(255,255,255,.2)", background:c, cursor:"pointer", boxShadow: annotColor===c ? `0 0 10px ${c}88` : "none", transition:"all .15s" }}/>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ fontSize:11, color:"#94a3b8", fontWeight:700, flexShrink:0 }}>Grosor</span>
              <input type="range" min="1" max="12" value={annotSize} onChange={e => setAnnotSize(+e.target.value)}
                style={{ flex:1, accentColor:"#a78bfa", height:28 }}/>
              <div style={{ width:annotSize*2+8, height:annotSize*2+8, borderRadius:99, background:annotMode==="eraser"?"#94a3b8":annotColor, flexShrink:0, border:"1px solid rgba(255,255,255,.3)" }}/>
            </div>
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, color:"#94a3b8", fontWeight:700, display:"block", marginBottom:6 }}>Qué se realizará (queda en la ficha junto a la imagen marcada)</label>
              <textarea
                value={notaPlanMarcado}
                onChange={e => setNotaPlanMarcado(e.target.value)}
                placeholder="Ej: Bótox glabela, relleno surcos, volumen pómulos…"
                rows={3}
                style={{
                  width:"100%",
                  resize:"vertical",
                  borderRadius:10,
                  border:"1px solid rgba(167,139,250,.35)",
                  background:"rgba(0,0,0,.35)",
                  color:"#e2e8f0",
                  padding:10,
                  fontSize:13,
                  boxSizing:"border-box",
                  fontFamily:"inherit",
                }}
              />
              {!pacienteIdSesion && (
                <p style={{ fontSize:11, color:"#fca5a5", margin:"6px 0 0" }}>Sin paciente vinculado al turno no se puede guardar en ficha.</p>
              )}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <Btn
                type="button"
                onClick={() => void guardarPlanMarcadoEnFichaAsync()}
                disabled={savingPlanMarcado || !pacienteIdSesion}
                style={{ width:"100%", background:"linear-gradient(135deg,#059669,#047857)", border:"none", minHeight:46, justifyContent:"center" }}
              >
                {savingPlanMarcado ? <Loader2 size={16} className="erp-spin" /> : <ImagePlus size={16}/>}
                {savingPlanMarcado ? " Guardando en ficha…" : " Guardar plan marcado en ficha del paciente"}
              </Btn>
              <div style={{ display:"flex", gap:8 }}>
                <Btn type="button" variant="outline" onClick={() => setAnnotActive(false)}
                  style={{ flex:1, borderColor:"rgba(255,255,255,.25)", color:"#e2e8f0", minHeight:44, justifyContent:"center" }}>
                  <X size={15}/> Cancelar
                </Btn>
                <Btn type="button" onClick={annotSaveToEval}
                  style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#6366f1)", border:"none", minHeight:44, justifyContent:"center" }}>
                  <CheckCircle2 size={15}/> Aplicar a vista previa
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
      {typeof document !== "undefined" && tripleVideoEnPantallaCompleta && createPortal(
        <div
          style={{
            position:"fixed",
            inset:0,
            zIndex:9900,
            background:"#000",
            display:"flex",
            flexDirection:"column",
            paddingTop:"max(10px, env(safe-area-inset-top))",
            paddingBottom:"max(10px, env(safe-area-inset-bottom))",
            paddingLeft:"max(12px, env(safe-area-inset-left))",
            paddingRight:"max(12px, env(safe-area-inset-right))",
          }}
        >
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:10, flexShrink:0 }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>
              Foto {Math.min(faceShotIndex + 1, 3)}/3
              <span style={{ display:"block", fontSize:12, fontWeight:600, color:"#94a3b8", marginTop:4 }}>
                {faceShotIndex === 0 && "De frente"}
                {faceShotIndex === 1 && "Perfil derecho"}
                {faceShotIndex >= 2 && "Perfil izquierdo"}
              </span>
            </div>
            <Btn type="button" variant="outline" onClick={detenerCamara} style={{ borderColor:"rgba(255,255,255,.45)", color:"#e2e8f0", minHeight:44, flexShrink:0 }}>
              Cerrar cámara
            </Btn>
          </div>
          <div style={{ flex:1, minHeight:0, position:"relative", borderRadius:12, overflow:"hidden", background:"#0f172a" }}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                width:"100%",
                height:"100%",
                objectFit:"cover",
                display:"block",
                transform: !faceRearCamera ? "scaleX(-1)" : undefined,
                transformOrigin: "center center",
              }}
            />
            {SHOW_FACE_CROQUIS_LIVE && (
              <canvas
                ref={faceMeshCanvasRef}
                aria-hidden
                style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", zIndex:3 }}
              />
            )}
            {SHOW_FACE_CROQUIS_LIVE && (faceMeshStatus === "error" || faceMeshStatus === "loading" || faceMeshStatus === "idle") && (
              <div style={{ position:"absolute", inset:0, zIndex:2 }}>
                <FaceCroquisTechnicalSvg withDimmedMask bottomHint={faceMeshStatus === "loading" ? "Cargando modelo facial…" : "Encuadrá el rostro"} />
              </div>
            )}
          </div>
          <div
            style={{
              marginTop:10,
              padding:"12px 14px",
              borderRadius:12,
              background:"rgba(124,58,237,.25)",
              border:"1px solid rgba(167,139,250,.4)",
              fontSize:14,
              fontWeight:800,
              color:"#e9d5ff",
              lineHeight:1.45,
              flexShrink:0,
            }}
          >
            {faceShotIndex === 0 && "1/3 — De frente: encuadrá el rostro del paciente."}
            {faceShotIndex === 1 && "2/3 — Perfil derecho: girá la cabeza hacia su derecha (vista lateral)."}
            {faceShotIndex === 2 && "3/3 — Perfil izquierdo: girá la cabeza hacia su izquierda (vista lateral)."}
          </div>
          {SHOW_FACE_CROQUIS_LIVE && (
            <div style={{ marginTop:8, maxHeight:120, overflowY:"auto", flexShrink:0 }}>{faceCroquisControls}</div>
          )}
          {SHOW_FACE_CROQUIS_LIVE && (
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:6, minHeight:18, flexShrink:0 }}>
              {faceMeshStatus === "tracking" && "● Rostro detectado — croquis MediaPipe en vivo"}
              {faceMeshStatus === "searching" && "○ Buscando rostro…"}
              {faceMeshStatus === "profile" && "◐ Vista lateral / perfil"}
              {faceMeshStatus === "loading" && "Cargando modelo facial (MediaPipe)…"}
              {faceMeshStatus === "error" && "MediaPipe no disponible — guía de proporción estática."}
              {faceMeshStatus === "ready" && "Iniciando captura…"}
            </div>
          )}
          {faceError && <div style={{ fontSize:12, color:"#fca5a5", marginTop:8, flexShrink:0 }}>{faceError}</div>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:12, flexShrink:0 }}>
            <Btn
              type="button"
              variant="outline"
              onClick={tripleVolverFotoAnterior}
              disabled={faceShotIndex <= 0 || faceAnalyzing || guardandoTripleFicha}
              style={{ flex: narrow ? "1 1 100%" : "0 1 auto", minHeight:48, borderColor:"rgba(255,255,255,.4)", color:"#e2e8f0", justifyContent:"center" }}
            >
              <Undo2 size={16} /> Repetir foto anterior
            </Btn>
            <Btn
              type="button"
              onClick={capturarFotogramaYAnalizar}
              disabled={faceAnalyzing || guardandoTripleFicha}
              style={{
                flex:1,
                minWidth:200,
                minHeight:52,
                background:"linear-gradient(135deg,#7c3aed,#6366f1)",
                border:"none",
                justifyContent:"center",
                fontWeight:800,
                fontSize:15,
              }}
            >
              <ScanLine size={18} />{" "}
              {["Capturar frente (1/3)", "Capturar perfil derecho (2/3)", "Capturar perfil izquierdo (3/3)"][faceShotIndex] ?? "Capturar"}
            </Btn>
          </div>
          <p style={{ fontSize:11, color:"#64748b", marginTop:10, textAlign:"center", lineHeight:1.4, flexShrink:0 }}>
            Tras cada captura pasás al siguiente ángulo. «Repetir foto anterior» vuelve al paso previo para retomar esa foto.
          </p>
        </div>,
        document.body
      )}
    </div>
  )
}

function DoctorAreaLanding({ clinic, onOpenDemo, demoTurno }) {
  const linkDemo = demoTurno && typeof window !== "undefined" ? buildDoctorSessionUrl({ clinicId: clinic, turnoId: demoTurno.id }) : ""
  const glassCard = {
    background: "linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.66) 100%)",
    backdropFilter: "blur(22px) saturate(200%)",
    WebkitBackdropFilter: "blur(22px) saturate(200%)",
    border: "1px solid rgba(255,255,255,0.55)",
    borderRadius: 18,
    boxShadow: "0 1px 0 rgba(255,255,255,0.7) inset, 0 18px 40px -22px rgba(15,23,42,.22), 0 1px 3px rgba(15,23,42,.05)",
  }
  const flow = [
    { icon: QrCode, label: "Escanear QR del turno" },
    { icon: Stethoscope, label: "Veredicto y propuesta IA" },
    { icon: Camera, label: "Fotos antes / después" },
    { icon: CheckCircle2, label: "Orden y envío a recepción" },
  ]
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:10, flexWrap:"wrap" }}>
        <div style={{
          width:52, height:52, borderRadius:16,
          background:C.gradient, display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow:`0 12px 28px -8px ${C.violet}66, 0 1px 0 rgba(255,255,255,0.45) inset`,
        }}>
          <Stethoscope size={26} color="#fff" strokeWidth={2.4}/>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:800, color:C.violet, letterSpacing:"0.08em", textTransform:"uppercase" }}>Módulo clínico</div>
          <h2 style={{ fontSize:24, fontWeight:800, margin:0, color:C.text, letterSpacing:"-0.02em" }}>Área médica</h2>
        </div>
      </div>
      <p style={{ fontSize:14, color:C.muted, marginBottom:20, maxWidth:680, lineHeight:1.55 }}>
        Acceso por <strong>código QR</strong> del turno: quien atiende lo escanea con el móvil (misma URL de esta app) e inicia sesión con usuario <strong>especialista</strong>. Se abre el asistente guiado por fases para evaluar, registrar fotos y emitir la orden de servicio.
      </p>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:12, marginBottom:20, maxWidth:860 }}>
        {flow.map((s, i) => {
          const Icon = s.icon
          return (
            <div key={i} style={{ ...glassCard, padding:16, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{
                width:38, height:38, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center",
                background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.25)", color:C.violet,
                flexShrink:0,
              }}>
                <Icon size={18} strokeWidth={2.2}/>
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:10, fontWeight:800, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>Paso {i + 1}</div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text, lineHeight:1.3 }}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ ...glassCard, padding:22, maxWidth:620 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
          <div style={{
            width:36, height:36, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center",
            background:C.gradient, color:"#fff",
          }}>
            <QrCode size={18} strokeWidth={2.4}/>
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:C.text, letterSpacing:"-0.01em" }}>Demo rápida sin QR</div>
        </div>
        {demoTurno ? (
          <p style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.5 }}>
            Paciente de ejemplo en sala: <strong style={{ color:C.text }}>{demoTurno.cliente}</strong> (turno #{demoTurno.id}). Abrí la sesión médica sin escanear.
          </p>
        ) : (
          <p style={{ fontSize:13, color:C.muted, marginBottom:14 }}>No hay turnos demo en esta clínica.</p>
        )}
        <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
          <Btn disabled={!demoTurno} onClick={() => demoTurno && onOpenDemo(demoTurno)} style={{ background:C.gradient, border:"none", minHeight:44 }}>
            <Stethoscope size={14}/> Abrir sesión demo
          </Btn>
        </div>
        {linkDemo && (
          <p style={{ fontSize:11, color:C.muted, marginTop:14, wordBreak:"break-all", lineHeight:1.5 }}>
            Enlace equivalente: <code style={codeStyle()}>{linkDemo}</code>
          </p>
        )}
      </div>
    </div>
  )
}

// ─── ORDEN DE SERVICIO — SALA (especialista) ──────────────────
function SalaOrdenServicio({ data, setData, clinic, nombreProfesional, profFiltro }) {
  const [activo, setActivo] = useState(null)
  const [servicioSel, setServicioSel] = useState(null)
  const [protocolo, setProtocolo] = useState("")
  const [notas, setNotas] = useState("")
  const [qty, setQty] = useState({})
  const [finalizando, setFinalizando] = useState(false)
  const [askExtrasOpen, setAskExtrasOpen] = useState(false)
  const [allowFinalizeWithoutExtras, setAllowFinalizeWithoutExtras] = useState(false)
  const [salaTrabajoActiva, setSalaTrabajoActiva] = useState("")

  const stock = data.clinics[clinic]?.stock || []
  const turnos = (data.clinics[clinic]?.turnos || []).filter(t => t.fecha === TODAY && (t.estado === "en_sala" || t.estado === "en_curso"))
  const lista = profFiltro == null ? turnos : turnos.filter(t => (t.profesionalId || 1) === profFiltro)
  const profs = data.profesionales || []
  const noServicios = (data.servicios || []).length === 0

  const defaultServicioId = turno => {
    const m = data.servicios.find(s => s.nombre === turno.servicio)
    if (m) return m.id
    const c = data.servicios.find(s => s.cat === turno.cat)
    return c?.id ?? data.servicios[0]?.id
  }

  const srvPreview = servicioSel ? data.servicios.find(s => s.id === servicioSel) : null

  const iniciar = async turno => {
    const sid = defaultServicioId(turno)
    const srv = data.servicios.find(s => s.id === sid)
    const qtyBase = qtyMapFromMaterialesServicio(srv)
    const salaAsignada = getSalaTrabajoTurno(turno) || "Sala 1"
    if (import.meta.env.VITE_SUPABASE_URL) {
      const { error } = await supabase.from("turnos").update({
        estado: "en_curso",
        sesion_iniciada_desde: "sala",
        obs: upsertSalaTrabajoEnObs(turno.obs, salaAsignada),
      }).eq("id", turno.id)
      if (error) {
        alert(error.message || "No se pudo iniciar la sesión.")
        return
      }
    }
    setData(d => ({
      ...d,
      clinics: {
        ...d.clinics,
        [clinic]: {
          ...d.clinics[clinic],
          stock: d.clinics[clinic].stock.map(p => {
            const c = qtyBase[p.id] || 0
            if (c <= 0) return p
            return { ...p, stock: Math.max(0, (+p.stock || 0) - c) }
          }),
          turnos: d.clinics[clinic].turnos.map(t => t.id === turno.id ? {
            ...t,
            estado: "en_curso",
            sesionIniciadaDesde: "sala",
            sesionIniciadaAt: new Date().toISOString(),
            consumoBaseStock: qtyBase,
            salaTrabajo: salaAsignada,
            obs: upsertSalaTrabajoEnObs(t.obs, salaAsignada),
          } : t),
        },
      },
    }))
    setActivo({ ...turno, estado: "en_curso", salaTrabajo: salaAsignada, obs: upsertSalaTrabajoEnObs(turno.obs, salaAsignada) })
    setSalaTrabajoActiva(salaAsignada)
    setServicioSel(sid)
    setProtocolo("")
    setNotas("")
    setQty({})
  }

  const setQ = (stockId, v) => {
    const n = Math.max(0, parseInt(v, 10) || 0)
    setQty(q => ({ ...q, [stockId]: n }))
  }

  const finalizar = async () => {
    if (!activo || !protocolo.trim() || !servicioSel) return
    const turno = activo
    const sid = servicioSel
    const extrasTotal = Object.values(qty || {}).reduce((a, n) => a + (Math.max(0, +n || 0)), 0)
    if (extrasTotal <= 0 && !allowFinalizeWithoutExtras) {
      setAskExtrasOpen(true)
      return
    }
    setFinalizando(true)
    try {
      const srv = data.servicios.find(s => s.id === sid)
      let ensPostAtencion = { ok: true, clienteId: null, created: false, cliente: null }
      if (import.meta.env.VITE_SUPABASE_URL) {
        const ens = await ensureClienteFichaPorTurno(turno.id)
        if (!ens.ok) {
          alert(ens.error)
          return
        }
        ensPostAtencion = ens
        const { error } = await supabase
          .from("turnos")
          .update({
            estado: "listo_cobrar",
            servicio: srv?.nombre || turno.servicio || "",
            servicio_facturado_id: sid,
            empleado_id: null,
          })
          .eq("id", turno.id)
        if (error) {
          alert(error.message || "No se pudo enviar a recepción.")
          return
        }
        const turnoActualDb = data.clinics[clinic].turnos.find(t => t.id === turno.id) || turno
        const qtyBaseDb = turnoActualDb?.consumoBaseStock || {}
        const qtyTotalDb = mergeQtyMaps(qtyBaseDb, qty)
        const detalleInsumos = Object.entries(qtyTotalDb).map(([k, v]) => {
          const s = (data.clinics[clinic]?.stock || []).find(x => x.id === +k)
          return { stockId: +k, nombre: s?.nombre || "", qty: v, costoUnit: +(s?.costo || 0) }
        }).filter(x => x.qty > 0)
        const montoInsumos = detalleInsumos.reduce((a, x) => a + x.costoUnit * x.qty, 0)
        const montoServicio = srv?.precio || 0
        await supabase.from("alertas_cobro").update({
          monto_servicio: montoServicio,
          monto_insumos: montoInsumos,
          monto_total: montoServicio + montoInsumos,
          insumos: detalleInsumos,
        }).eq("turno_id", turno.id)
      }
      const turnoActual = data.clinics[clinic].turnos.find(t => t.id === turno.id) || turno
      const qtyBase = turnoActual?.consumoBaseStock || {}
      const qtyTotal = mergeQtyMaps(qtyBase, qty)
      const turnoParaCerrar = ensPostAtencion.clienteId
        ? { ...turno, pacienteId: ensPostAtencion.clienteId }
        : turno
      setData(d => {
        let d2 = d
        if (ensPostAtencion.clienteId && ensPostAtencion.created && ensPostAtencion.cliente) {
          const pl = mapClienteRowFromErpApi(ensPostAtencion.cliente)
          if (pl && !(d.pacientes || []).some(p => +p.id === +pl.id)) {
            d2 = { ...d, pacientes: [...(d.pacientes || []), pl] }
          }
        }
        return cerrarOrdenServicioEnEstado(d2, {
          clinic, turno: turnoParaCerrar, servicioId: sid, protocolo, notas, qty: qtyTotal, qtyDescontar: qty, nombreProfesional,
        })
      })
      setActivo(null)
      setServicioSel(null)
      setProtocolo("")
      setNotas("")
      setQty({})
    } finally {
      setAllowFinalizeWithoutExtras(false)
      setFinalizando(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>Sala — Orden de servicio</h2>
      <p style={{ fontSize:13, color:C.muted, marginBottom:14 }}>
        Elegí el <strong>servicio a facturar</strong> (puede diferir del turno agendado), cargá insumos y finalizá: la recepción recibe el ticket con ese importe + consumibles.
      </p>
      {lista.length > 0 && (
        <div style={{ background:"linear-gradient(135deg,#EDE9FE,#FDF4FF)", border:`1px solid ${C.violet}33`, borderRadius:12, padding:"12px 16px", marginBottom:18, fontSize:13, color:C.text }}>
          <strong>Datos de ejemplo:</strong> <em>María González</em> (consulta) y <em>Valentina Ruiz</em> (bótox) están <strong>en sala</strong> para Dra. Ana · Iniciá sesión, cambiá el servicio si querés, cargá p. ej. toxina 1 ampolla + guantes, y finalizá → entrá como recepción y mirá la campana 🔔.
        </div>
      )}

      {lista.length === 0 ? (
        <div style={{ background:C.card, borderRadius:16, padding:36, textAlign:"center", color:"#94A3B8", fontSize:14 }}>No hay pacientes en sala para esta clínica{profFiltro ? " / tu agenda" : ""}. Desde Agenda, pasá el turno a «A sala».</div>
      ) : (
        <div style={{ display:"grid", gap:14 }}>
          {lista.map(t => (
            <div key={t.id} style={{ background:C.card, borderRadius:16, padding:20, boxShadow:"0 1px 3px rgba(0,0,0,.06)", borderLeft:`4px solid ${profs.find(p=>p.id===t.profesionalId)?.color || C.violet}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontSize:17, fontWeight:800 }}>{t.cliente}</div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{t.hora} · {t.servicio} · {profs.find(p=>p.id===t.profesionalId)?.nombre || "—"}</div>
                  <div style={{ fontSize:12, color:C.violet, marginTop:4, fontWeight:700 }}>Centro/Sala: {getSalaTrabajoTurno(t) || "Sin definir"}</div>
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <Badge type={t.estado}>{estadoLabel[t.estado] || t.estado}</Badge>
                  {t.estado === "en_sala" && <Btn onClick={() => void iniciar(t)}><MonitorPlay size={14}/> Iniciar servicio</Btn>}
                  {t.estado === "en_curso" && (!activo || activo.id !== t.id) && <Btn variant="outline" onClick={() => {
                    setActivo(t)
                    setSalaTrabajoActiva(getSalaTrabajoTurno(t) || "Sala 1")
                    setServicioSel(defaultServicioId(t))
                    setProtocolo("")
                    setNotas("")
                    setQty({})
                  }}>Continuar sesión</Btn>}
                  {t.estado === "en_curso" && activo?.id === t.id && <Badge type="en_curso">Sesión abierta</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!activo} onClose={() => { setActivo(null); setServicioSel(null) }} title={activo ? `Ficha de sesión — ${activo.cliente}` : ""}
        footer={<>
          <Btn variant="outline" onClick={() => { setActivo(null); setServicioSel(null) }}>Cancelar</Btn>
          <Btn onClick={() => void finalizar()} disabled={finalizando || noServicios || !servicioSel}>{finalizando ? "Enviando..." : "Finalizar sesión"}</Btn>
        </>}>
        {activo && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <FG label="Servicio a facturar (va a recepción)" full>
              <select style={inp} value={servicioSel ?? ""} onChange={e => setServicioSel(+e.target.value)}>
                {noServicios && <option value="">No hay servicios cargados</option>}
                {data.servicios.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre} — {fmt(s.precio)} · {catLabel[s.cat]}</option>
                ))}
              </select>
            </FG>
            <FG label="Centro / sala de trabajo" full>
              <input
                style={inp}
                value={salaTrabajoActiva}
                onChange={e => {
                  const next = e.target.value
                  setSalaTrabajoActiva(next)
                  setActivo(a => a ? ({ ...a, salaTrabajo: next }) : a)
                  setData(d => ({
                    ...d,
                    clinics: {
                      ...d.clinics,
                      [clinic]: {
                        ...d.clinics[clinic],
                        turnos: d.clinics[clinic].turnos.map(t => t.id === activo.id ? {
                          ...t,
                          salaTrabajo: next,
                          obs: upsertSalaTrabajoEnObs(t.obs, next),
                        } : t),
                      },
                    },
                  }))
                }}
                placeholder="Ej: Sala 2, Box Láser, Consultorio A"
              />
            </FG>
            {noServicios && <div style={{ fontSize:12, color:C.muted }}>Cargá servicios en `Servicios` para finalizar la sesión.</div>}
            {srvPreview && (
              <div style={{ fontSize:13, padding:"10px 12px", background:C.subtle, borderRadius:10, border:`1px solid ${C.border}` }}>
                <strong>Total servicio (lista):</strong> {fmt(srvPreview.precio)} · Se sumarán los consumibles abajo para el total a cobrar.
              </div>
            )}
            <FG label="Protocolo aplicado" full>
              <textarea style={{ ...inp, minHeight:72 }} value={protocolo} onChange={e => setProtocolo(e.target.value)} placeholder="Ej: Bótox glabela + patas de gallo — 12 U" />
            </FG>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8 }}>PRODUCTOS EXTRA (stock C{clinic})</div>
              <div style={{ maxHeight:220, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
                {stock.map(s => (
                  <div key={s.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 4px", borderBottom:`1px solid ${C.subtle}`, fontSize:13 }}>
                    <div>
                      <strong>{s.nombre}</strong>
                      <span style={{ color:C.muted, fontSize:11, marginLeft:8 }}>Stock {s.stock} {s.unidad} · {fmt(s.costo)} c/u</span>
                    </div>
                    <input type="number" min={0} style={{ width:72, ...inp, padding:"6px 8px" }} value={qty[s.id] ?? 0} onChange={e => setQ(s.id, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
            <FG label="Notas clínicas" full>
              <textarea style={{ ...inp, minHeight:64 }} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Evolución, observaciones…" />
            </FG>
            <p style={{ fontSize:11, color:C.muted }}>Centro actual: {salaTrabajoActiva || "Sin definir"} · los materiales base se descuentan al iniciar; acá cargás solo extras.</p>
          </div>
        )}
      </Modal>
      <Modal
        open={askExtrasOpen}
        onClose={() => setAskExtrasOpen(false)}
        title="¿Utilizaste algún producto extra?"
        footer={
          <>
            <Btn variant="outline" onClick={() => setAskExtrasOpen(false)}>Sí, cargaré extras</Btn>
            <Btn onClick={() => { setAskExtrasOpen(false); setAllowFinalizeWithoutExtras(true); void finalizar() }}>No, finalizar igual</Btn>
          </>
        }
      >
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.45 }}>
          El sistema ya descontó los materiales base del servicio al iniciar. Si usaste algo adicional, cargalo ahora antes de finalizar.
        </p>
      </Modal>
    </div>
  )
}

// ─── CAMPANA RECEPCIÓN — COBRO ORDEN ───────────────────────────
const METODO_TPV_LABEL = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" }

function TpvVirtualAnimacion({ metodo }) {
  if (metodo === "tarjeta") {
    return (
      <div style={{ position:"relative", height:148, display:"flex", alignItems:"flex-end", justifyContent:"center", paddingBottom:8 }}>
        <div
          style={{
            position:"absolute",
            bottom:18,
            left:"50%",
            marginLeft:-56,
            width:112,
            height:14,
            borderRadius:6,
            background:"linear-gradient(180deg,#1e1b4b,#312e81)",
            boxShadow:"0 8px 20px rgba(49,46,129,.35)",
          }}
        />
        <div style={{ position:"relative", width:100, height:100, marginBottom:26 }}>
          <div className="erp-tpv-nfc-ring" />
          <div className="erp-tpv-nfc-ring" />
          <div className="erp-tpv-nfc-ring" />
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ScanLine size={28} color="#7c3aed" style={{ opacity:0.9 }} aria-hidden />
          </div>
        </div>
        <div
          className="erp-tpv-card-anim"
          style={{
            position:"absolute",
            bottom:36,
            left:"50%",
            marginLeft:-44,
            width:88,
            height:54,
            borderRadius:8,
            background:"linear-gradient(145deg,#faf5ff 0%,#e9d5ff 40%,#c4b5fd 100%)",
            boxShadow:"0 12px 28px rgba(91,33,182,.25), 0 0 0 1px rgba(255,255,255,.6) inset",
          }}
        >
          <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:4 }}>
            <div style={{ height:4, borderRadius:2, background:"rgba(91,33,182,.25)", width:"72%" }} />
            <div style={{ height:3, borderRadius:2, background:"rgba(91,33,182,.15)", width:"45%" }} />
          </div>
        </div>
      </div>
    )
  }
  if (metodo === "efectivo") {
    return (
      <div style={{ height:148, display:"flex", alignItems:"center", justifyContent:"center", gap:20 }}>
        <div className="erp-tpv-cash-anim" style={{ filter:"drop-shadow(0 10px 18px rgba(16,185,129,.25))" }}>
          <Banknote size={72} color="#059669" strokeWidth={1.25} aria-hidden />
        </div>
        <div style={{ textAlign:"left", fontSize:11, color:C.muted, lineHeight:1.5, maxWidth:140 }}>
          Registrando ingreso en caja…
        </div>
      </div>
    )
  }
  return (
    <div style={{ height:148, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
      <div className="erp-tpv-transfer-anim" style={{ display:"flex", alignItems:"center", gap:10 }}>
        <Building2 size={40} color="#6366f1" aria-hidden />
        <span style={{ fontSize:22, color:"#94a3b8" }}>→</span>
        <Wallet size={40} color="#7c3aed" aria-hidden />
      </div>
      <span style={{ fontSize:11, color:C.muted }}>Verificando transferencia…</span>
    </div>
  )
}

function AlertasCobroBell({ data, setData, clinic, role }) {
  const [open, setOpen] = useState(false)
  const [cobro, setCobro] = useState(null)
  const [metodo, setMetodo] = useState("tarjeta")
  const [cobroPhase, setCobroPhase] = useState("form")
  const cobroTimersRef = useRef([])
  const pend = (data.alertasCobro || []).filter(a => a.clinicId === clinic && a.estado === "pendiente")

  const clearCobroTimers = useCallback(() => {
    cobroTimersRef.current.forEach(id => clearTimeout(id))
    cobroTimersRef.current = []
  }, [])

  useEffect(() => {
    if (!cobro) {
      setCobroPhase("form")
      clearCobroTimers()
    }
  }, [cobro, clearCobroTimers])

  useEffect(() => () => clearCobroTimers(), [clearCobroTimers])

  if (role !== "recepcionista" && role !== "gerente") return null

  const registrarIngresoCobroRespaldo = async ({ turnoId, montoTotal, metodoPago, paciente }) => {
    if (!turnoId || !(montoTotal > 0)) return
    const fecha = TODAY
    const cliente = paciente || "Paciente"
    const concepto = `Cobro turno #${turnoId} — ${cliente}`
    const comprobante = `AUTO-TURNO-${turnoId}`

    if (import.meta.env.VITE_SUPABASE_URL) {
      try {
        const { data: tpvExists } = await supabase
          .from("tpv_movimientos")
          .select("id")
          .eq("comprobante", comprobante)
          .limit(1)
        if (!tpvExists?.length) {
          await supabase.from("tpv_movimientos").insert({
            fecha,
            clinic_id: clinic,
            metodo: metodoPago || "efectivo",
            monto: montoTotal,
            concepto,
            comprobante,
          })
        }
      } catch {}
      try {
        const { data: clinicExists } = await supabase
          .from("clinic_movimientos")
          .select("id")
          .eq("clinic_id", clinic)
          .ilike("concepto", `%turno #${turnoId}%`)
          .limit(1)
        if (!clinicExists?.length) {
          await supabase.from("clinic_movimientos").insert({
            clinic_id: clinic,
            tipo: "ingreso",
            fecha,
            concepto,
            cat: "servicios",
            monto: montoTotal,
          })
        }
      } catch {}
    }

    setData(d => {
      const tpvMovs = d.tpv?.movimientos || []
      const clinicMovs = d.clinics[clinic]?.movimientos || []
      const hasTpv = tpvMovs.some(m => m.comprobante === comprobante)
      const hasClinic = clinicMovs.some(m => String(m.concepto || "").toLowerCase().includes(`turno #${turnoId}`))
      const nextTpvId = tpvMovs.length ? Math.max(...tpvMovs.map(m => m.id || 0)) + 1 : 1
      const nextClinicId = clinicMovs.length ? Math.max(...clinicMovs.map(m => m.id || 0)) + 1 : 1
      return {
        ...d,
        tpv: {
          ...d.tpv,
          movimientos: hasTpv
            ? tpvMovs
            : [...tpvMovs, { id: nextTpvId, fecha, clinicId: clinic, metodo: metodoPago || "efectivo", monto: montoTotal, concepto, comprobante }],
        },
        clinics: {
          ...d.clinics,
          [clinic]: {
            ...d.clinics[clinic],
            movimientos: hasClinic
              ? clinicMovs
              : [...clinicMovs, { id: nextClinicId, tipo: "ingreso", fecha, concepto, cat: "servicios", monto: montoTotal }],
          },
        },
      }
    })
  }

  const aplicarCobroEnEstado = async () => {
    if (!cobro) return
    if (import.meta.env.VITE_SUPABASE_URL) {
      let { error: eTurno } = await supabase
        .from("turnos")
        .update({ estado: "finalizado", metodo_pago: metodo })
        .eq("id", cobro.turnoId)
      if (eTurno?.message?.includes("metodo_pago")) {
        ({ error: eTurno } = await supabase.from("turnos").update({ estado: "finalizado" }).eq("id", cobro.turnoId))
      }
      if (eTurno) {
        alert(eTurno.message || "No se pudo cerrar el turno.")
        return
      }
      if (cobro.id && typeof cobro.id === "number") {
        await supabase.from("alertas_cobro").update({ estado: "cobrado", metodo_pago: metodo }).eq("id", cobro.id)
      }
    }
    await registrarIngresoCobroRespaldo({
      turnoId: cobro.turnoId,
      montoTotal: cobro.montoTotal || 0,
      metodoPago: metodo,
      paciente: cobro.paciente,
    })
    setData(d => ({
      ...d,
      alertasCobro: (d.alertasCobro || []).map(a => a.id === cobro.id ? { ...a, estado: "cobrado", metodoPago: metodo } : a),
      clinics: {
        ...d.clinics,
        [clinic]: {
          ...d.clinics[clinic],
          turnos: d.clinics[clinic].turnos.map(t => t.id === cobro.turnoId ? { ...t, estado: "finalizado" } : t),
        },
      },
    }))
  }

  const cerrarModalCobro = () => {
    clearCobroTimers()
    setCobro(null)
    setCobroPhase("form")
  }

  const iniciarCobroTpv = () => {
    if (!cobro) return
    setCobroPhase("processing")
    const t1 = window.setTimeout(() => {
      void (async () => {
        await aplicarCobroEnEstado()
        setCobroPhase("success")
        const t2 = window.setTimeout(() => {
          setCobro(null)
          setCobroPhase("form")
        }, 1900)
        cobroTimersRef.current.push(t2)
      })()
    }, 2800)
    cobroTimersRef.current.push(t1)
  }

  const modalTitle =
    cobroPhase === "processing" ? "TPV virtual" : cobroPhase === "success" ? "Cobro completado" : "Cobrar orden de servicio"

  return (
    <>
      <div style={{ position:"relative" }}>
        <button type="button" onClick={() => setOpen(o => !o)} title="Órdenes listas para cobrar"
          style={{ width:40, height:40, borderRadius:12, border:`1.5px solid ${C.border}`, background: pend.length ? C.violetLight : C.subtle, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
          <Bell size={18} color={pend.length ? C.violet : C.muted} />
          {pend.length > 0 && <span style={{ position:"absolute", top:-4, right:-4, background:C.danger, color:"#fff", fontSize:10, fontWeight:800, minWidth:18, height:18, borderRadius:99, display:"flex", alignItems:"center", justifyContent:"center" }}>{pend.length}</span>}
        </button>
        {open && (
          <div style={{ position:"absolute", right:0, top:46, width:360, maxWidth:"90vw", background:"#fff", borderRadius:14, boxShadow:"0 20px 50px rgba(0,0,0,.15)", border:`1px solid ${C.border}`, zIndex:1000, textAlign:"left", overflow:"hidden" }}>
            <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}`, fontWeight:700, fontSize:13, display:"flex", alignItems:"center", gap:6 }}><Bell size={16}/> Listos para cobrar</div>
            <div style={{ maxHeight:320, overflowY:"auto" }}>
              {pend.length === 0 ? <div style={{ padding:20, fontSize:13, color:"#94A3B8" }}>Sin alertas</div> : pend.map(a => (
                <button key={a.id} type="button" onClick={() => { setCobro(a); setOpen(false); setCobroPhase("form") }} style={{ width:"100%", textAlign:"left", padding:"12px 14px", border:"none", borderBottom:`1px solid ${C.subtle}`, background:"#fff", cursor:"pointer" }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{a.paciente}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{a.servicio}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:C.violet, marginTop:6 }}>{fmt(a.montoTotal)} <span style={{ fontSize:11, fontWeight:500, color:C.muted }}>servicio + consumibles</span></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal open={!!cobro} onClose={() => { if (cobroPhase !== "processing") cerrarModalCobro() }} title={modalTitle}
        footer={cobroPhase === "form"
          ? <><Btn variant="outline" onClick={cerrarModalCobro}>Cancelar</Btn><Btn onClick={iniciarCobroTpv}>Cobrar y cerrar</Btn></>
          : cobroPhase === "success"
            ? <Btn onClick={cerrarModalCobro}>Cerrar</Btn>
            : null}>
        {cobro && cobroPhase === "form" && (
          <div style={{ fontSize:13 }}>
            <p style={{ marginBottom:12 }}><strong>{cobro.paciente}</strong> · {cobro.servicio}</p>
            <div style={{ background:C.subtle, borderRadius:10, padding:12, marginBottom:12, fontSize:12 }}>
              <div>Servicio: {fmt(cobro.montoServicio)}</div>
              <div>Consumibles: {fmt(cobro.montoInsumos)}</div>
              {cobro.insumos?.length > 0 && <ul style={{ margin:"8px 0 0", paddingLeft:16 }}>{cobro.insumos.map((x,i) => <li key={i}>{x.nombre} ×{x.cantidad} → {fmt(x.subtotal)}</li>)}</ul>}
              <div style={{ marginTop:10, fontWeight:800, fontSize:16 }}>Total: {fmt(cobro.montoTotal)}</div>
            </div>
            <FG label="Medio de pago">
              <select style={inp} value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </FG>
            <p style={{ fontSize:11, color:C.muted, marginTop:12 }}>Se registra en TPV, contabilidad y el turno pasa a finalizado.</p>
          </div>
        )}
        {cobro && cobroPhase === "processing" && (
          <div style={{ textAlign:"center", padding:"4px 0 8px" }}>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.2em", color:"#94a3b8", marginBottom:6 }}>CLÍNICA · TPV</div>
            <div style={{ fontSize:13, color:C.text, marginBottom:4 }}>{cobro.paciente}</div>
            <div style={{ fontSize:30, fontWeight:800, color:C.violet, letterSpacing:"-0.02em", marginBottom:6 }}>{fmt(cobro.montoTotal)}</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>{METODO_TPV_LABEL[metodo] || metodo}</div>
            <div style={{ height:6, borderRadius:999, overflow:"hidden", marginBottom:20, background:C.subtle }}>
              <div className="erp-tpv-bar-shimmer" style={{ height:"100%", width:"100%", borderRadius:999 }} />
            </div>
            <TpvVirtualAnimacion metodo={metodo} />
            <p style={{ fontSize:13, color:C.muted, marginTop:8, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <Loader2 size={16} className="erp-spin" color={C.violet} aria-hidden />
              Procesando cobro…
            </p>
          </div>
        )}
        {cobro && cobroPhase === "success" && (
          <div style={{ textAlign:"center", padding:"24px 8px 16px" }}>
            <div className="erp-tpv-success-anim" style={{ display:"inline-flex", marginBottom:16 }}>
              <CheckCircle2 size={64} color="#059669" strokeWidth={1.75} aria-hidden />
            </div>
            <p style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:8 }}>Pago registrado</p>
            <p style={{ fontSize:14, color:C.muted, lineHeight:1.5, marginBottom:6 }}>
              {fmt(cobro.montoTotal)} · {METODO_TPV_LABEL[metodo] || metodo}
            </p>
            <p style={{ fontSize:12, color:"#94a3b8" }}>TPV, contabilidad y turno actualizados.</p>
          </div>
        )}
      </Modal>
    </>
  )
}

// ─── CONFIGURACIÓN — cuentas (solo gerente, Supabase Auth) ─────
function ConfiguracionCuentas({ onClinicsChanged }) {
  const compact = useMediaQuery("(max-width: 980px)")
  const useSb = Boolean(import.meta.env.VITE_SUPABASE_URL)
  const [clinics, setClinics] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingClinic, setSavingClinic] = useState(false)
  const [err, setErr] = useState("")
  const [ok, setOk] = useState("")
  const [okClinic, setOkClinic] = useState("")
  const [me, setMe] = useState(null)
  const [form, setForm] = useState({
    email: "",
    password: "",
    nombre: "",
    rol: "recepcionista",
    clinic_id: "",
  })
  const [clinicForm, setClinicForm] = useState({
    nombre: "",
    modalidad_negocio: "sucursal",
    clinic_matriz_id: "",
  })

  const load = useCallback(async () => {
    if (!useSb) {
      setLoading(false)
      return
    }
    setLoading(true)
    setErr("")
    const cRes = await supabase.from("clinics").select("id, nombre, modalidad_negocio, clinic_matriz_id").order("id")
    const eRes = await supabase.from("empleados").select("id, nombre, email, rol, clinic_id, activo, es_principal").order("id")
    const { data: { session: sb } } = await supabase.auth.getSession()
    const myUid = sb?.user?.id
    let myEmp = null
    if (myUid) {
      const myRes = await supabase
        .from("empleados")
        .select("id, rol, clinic_id, es_principal")
        .eq("auth_user_id", myUid)
        .maybeSingle()
      if (!myRes.error) myEmp = myRes.data || null
    }
    if (cRes.error) setErr(cRes.error.message)
    else setClinics(cRes.data || [])
    if (eRes.error) setErr(prev => prev || eRes.error.message)
    else setStaff(eRes.data || [])
    setMe(myEmp)
    setLoading(false)
  }, [useSb])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!clinics.length) return
    setForm(f => (f.clinic_id !== "" ? f : { ...f, clinic_id: String(clinics[0].id) }))
  }, [clinics])

  useEffect(() => {
    if (!me || me.rol !== "encargado" || me.clinic_id == null) return
    setForm(f => ({ ...f, clinic_id: String(me.clinic_id), rol: f.rol === "encargado" ? "recepcionista" : f.rol }))
  }, [me])

  const submit = async e => {
    e.preventDefault()
    setErr("")
    setOk("")
    if (!useSb) return
    const clinicId = form.clinic_id === "" ? null : +form.clinic_id
    if (!form.email.trim() || !form.password || !form.nombre.trim() || clinicId == null || Number.isNaN(clinicId)) {
      setErr("Completá todos los campos y elegí una clínica.")
      return
    }
    const { data: { session: sb } } = await supabase.auth.getSession()
    const token = sb?.access_token
    if (!token) {
      setErr("No hay sesión. Volvé a iniciar sesión.")
      return
    }
    setSaving(true)
    try {
      const r = await fetch("/api/admin/create-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          nombre: form.nombre.trim(),
          rol: form.rol,
          clinic_id: clinicId,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErr(j.error || `Error ${r.status}`)
        return
      }
      setOk(`Cuenta creada: ${j.email} (${j.rol})`)
      setForm(f => ({ ...f, email: "", password: "", nombre: "" }))
      await load()
    } catch (ex) {
      setErr(String(ex?.message || ex))
    } finally {
      setSaving(false)
    }
  }

  const submitClinic = async e => {
    e.preventDefault()
    setErr("")
    setOk("")
    setOkClinic("")
    if (!useSb) return
    if (!clinicForm.nombre.trim()) {
      setErr("Completá el nombre de la clínica.")
      return
    }
    const matrizId = clinicForm.clinic_matriz_id === "" ? null : +clinicForm.clinic_matriz_id
    if (clinicForm.modalidad_negocio === "franquicia" && (matrizId == null || Number.isNaN(matrizId))) {
      setErr("Para franquicia seleccioná una clínica matriz.")
      return
    }
    const { data: { session: sb } } = await supabase.auth.getSession()
    const token = sb?.access_token
    if (!token) {
      setErr("No hay sesión. Volvé a iniciar sesión.")
      return
    }
    setSavingClinic(true)
    try {
      const r = await fetch("/api/admin/create-clinic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre: clinicForm.nombre.trim(),
          modalidad_negocio: clinicForm.modalidad_negocio,
          clinic_matriz_id: clinicForm.modalidad_negocio === "franquicia" ? matrizId : null,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErr(j.error || `Error ${r.status}`)
        return
      }
      setOkClinic(`Clínica creada: ${j?.clinic?.nombre || clinicForm.nombre.trim()}`)
      setClinicForm({ nombre: "", modalidad_negocio: "sucursal", clinic_matriz_id: "" })
      await load()
      onClinicsChanged?.()
    } catch (ex) {
      setErr(String(ex?.message || ex))
    } finally {
      setSavingClinic(false)
    }
  }

  if (!useSb) {
    return (
      <div style={{ background:C.card, borderRadius:16, padding:24, maxWidth:560 }}>
        <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Cuentas y equipo</h2>
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>Configurá <code style={codeStyle()}>VITE_SUPABASE_URL</code> y usá inicio de sesión con Supabase para gestionar cuentas desde aquí.</p>
      </div>
    )
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22, maxWidth: compact ? "100%" : 720 }}>
      <div>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:6 }}>Cuentas y equipo</h2>
        <p style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>
          Creá usuarios de <strong>acceso a la app</strong> (Auth). El gerente principal puede crear encargados; el encargado solo puede crear especialistas/recepcionistas de su clínica. Requiere{' '}
          <code style={codeStyle()}>SUPABASE_SERVICE_ROLE_KEY</code> en <code style={codeStyle()}>.env.local</code> del proyecto y reiniciar <code style={codeStyle()}>npm run dev</code>.
        </p>
      </div>

      <div style={{ background:C.card, borderRadius:16, padding:20, border:`1px solid ${C.border}`, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <UserPlus size={20} color={C.violet} />
          <span style={{ fontSize:16, fontWeight:700 }}>Nueva cuenta</span>
        </div>
        <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <FG label="Nombre completo">
            <input style={inp} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Dra. Ana López" autoComplete="off" />
          </FG>
          <FG label="Email (inicio de sesión)">
            <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@clinica.com" autoComplete="off" />
          </FG>
          <FG label="Contraseña inicial (mín. 6 caracteres)">
            <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
          </FG>
          <FG label="Rol">
            <select style={inp} value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
              <option value="recepcionista">Recepcionista</option>
              <option value="especialista">Especialista</option>
              {me?.rol === "gerente" && me?.es_principal && <option value="encargado">Encargado/a de clínica</option>}
            </select>
          </FG>
          <FG label="Clínica">
            <select
              style={inp}
              value={form.clinic_id}
              disabled={me?.rol === "encargado"}
              onChange={e => setForm(f => ({ ...f, clinic_id: e.target.value }))}
            >
              {clinics.length === 0 ? <option value="">— Creá una clínica en Supabase primero —</option>
                : clinics
                  .filter(c => me?.rol !== "encargado" || +c.id === +me?.clinic_id)
                  .map(c => <option key={c.id} value={String(c.id)}>{c.nombre} (id {c.id})</option>)}
            </select>
          </FG>
          {err && <div style={{ fontSize:13, color:C.danger, fontWeight:600 }}>{err}</div>}
          {ok && <div style={{ fontSize:13, color:"#059669", fontWeight:600 }}>{ok}</div>}
          <Btn type="submit" disabled={saving || loading || !clinics.length} style={{ alignSelf:"flex-start", minHeight:44 }}>
            {saving ? <><Loader2 size={16} className="erp-spin" /> Creando…</> : <><UserPlus size={16}/> Crear cuenta</>}
          </Btn>
        </form>
      </div>

      <div style={{ background:C.card, borderRadius:16, padding:20, border:`1px solid ${C.border}`, boxShadow:"0 1px 3px rgba(0,0,0,.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <Building2 size={20} color={C.violet} />
          <span style={{ fontSize:16, fontWeight:700 }}>Nueva clínica</span>
        </div>
        {!(me?.rol === "gerente" && me?.es_principal) && (
          <p style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
            Solo el gerente principal puede crear nuevas clínicas.
          </p>
        )}
        <form onSubmit={submitClinic} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <FG label="Nombre de la clínica">
            <input style={inp} value={clinicForm.nombre} onChange={e => setClinicForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Clínica Norte" autoComplete="off" />
          </FG>
          <FG label="Modelo">
            <select style={inp} value={clinicForm.modalidad_negocio} onChange={e => setClinicForm(f => ({ ...f, modalidad_negocio: e.target.value, clinic_matriz_id: e.target.value === "franquicia" ? f.clinic_matriz_id : "" }))}>
              <option value="sucursal">Sucursal propia</option>
              <option value="franquicia">Franquicia</option>
            </select>
          </FG>
          {clinicForm.modalidad_negocio === "franquicia" && (
            <FG label="Clínica matriz">
              <select style={inp} value={clinicForm.clinic_matriz_id} onChange={e => setClinicForm(f => ({ ...f, clinic_matriz_id: e.target.value }))}>
                <option value="">Seleccionar matriz…</option>
                {clinics.map(c => <option key={c.id} value={String(c.id)}>{c.nombre} (id {c.id})</option>)}
              </select>
            </FG>
          )}
          {okClinic && <div style={{ fontSize:13, color:"#059669", fontWeight:600 }}>{okClinic}</div>}
          <Btn type="submit" disabled={savingClinic || loading || !(me?.rol === "gerente" && me?.es_principal)} style={{ alignSelf:"flex-start", minHeight:44 }}>
            {savingClinic ? <><Loader2 size={16} className="erp-spin" /> Creando…</> : <><Building2 size={16}/> Crear clínica</>}
          </Btn>
        </form>
      </div>

      <div style={{ background:C.card, borderRadius:16, padding:20, border:`1px solid ${C.border}` }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Equipo registrado</div>
        {loading ? <div style={{ color:C.muted, fontSize:13 }}>Cargando…</div>
          : staff.length === 0 ? <div style={{ color:C.muted, fontSize:13 }}>No hay empleados en la base.</div>
            : (
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${C.border}`, textAlign:"left" }}>
                      <th style={{ padding:"8px 6px" }}>Nombre</th>
                      <th style={{ padding:"8px 6px" }}>Email</th>
                      <th style={{ padding:"8px 6px" }}>Rol</th>
                      <th style={{ padding:"8px 6px" }}>Clínica</th>
                      <th style={{ padding:"8px 6px" }}>Activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(row => (
                      <tr key={row.id} style={{ borderBottom:`1px solid ${C.subtle}` }}>
                        <td style={{ padding:"10px 6px", fontWeight:600 }}>{row.nombre}</td>
                        <td style={{ padding:"10px 6px", color:C.muted }}>{row.email || "—"}</td>
                        <td style={{ padding:"10px 6px" }}>
                          <Badge type={row.rol === "gerente" ? "confirmado" : "pendiente"}>
                            {row.rol === "gerente" && row.es_principal ? "Gerente principal" : (ROLE_LABEL[row.rol] || row.rol)}
                          </Badge>
                        </td>
                        <td style={{ padding:"10px 6px", color:C.muted }}>{clinics.find(c => c.id === row.clinic_id)?.nombre ?? (row.clinic_id != null ? `#${row.clinic_id}` : "—")}</td>
                        <td style={{ padding:"10px 6px" }}>{row.activo ? "Sí" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  )
}

// ─── SIDEBAR NAV ─────────────────────────────────────────────
const NAV = [
  { group:"Principal", items:[
    { id:"dashboard", label:"Dashboard", icon:LayoutDashboard },
  ]},
  { group:"Gestión", items:[
    { id:"agenda",       label:"Agenda",         icon:Calendar },
    { id:"sala",         label:"Sala (orden OS)",icon:MonitorPlay },
    { id:"doctor_area",  label:"Área médica (QR)", icon:QrCode },
    { id:"pacientes",    label:"Pacientes",      icon:Stethoscope },
    { id:"documentos",   label:"Documentos",     icon:FileText },
    { id:"clientes",     label:"Clientes",       icon:Users },
    { id:"stock",        label:"Stock",          icon:Package },
    { id:"contabilidad", label:"Contabilidad",   icon:DollarSign },
    { id:"servicios",    label:"Servicios",      icon:Sparkles },
    { id:"personal",     label:"Personal",       icon:UserCog },
  ]},
  { group:"Ventas", items:[
    { id:"bonos",      label:"Bonos y packs", icon:Gift },
    { id:"tpv",        label:"TPV Virtual",   icon:CreditCard },
  ]},
  { group:"Crecimiento", items:[
    { id:"marketing",  label:"Marketing",     icon:MessageCircle },
    { id:"reservas",   label:"Reserva online",icon:Globe },
  ]},
  { group:"Informes", items:[
    { id:"reportes",   label:"Reportes",      icon:ClipboardList },
    { id:"analytics",  label:"Analytics",     icon:BarChart3 },
  ]},
  { group:"Sistema", items:[
    { id:"configuracion", label:"Cuentas y equipo", icon:Settings },
  ]},
]

const SECTION_PATHS = {
  dashboard: "/dashboard",
  agenda: "/agenda",
  sala: "/sala",
  doctor_area: "/area-medica",
  pacientes: "/pacientes",
  documentos: "/documentos",
  clientes: "/clientes",
  stock: "/stock",
  contabilidad: "/contabilidad",
  servicios: "/servicios",
  personal: "/personal",
  bonos: "/bonos",
  tpv: "/tpv",
  marketing: "/marketing",
  analytics: "/analytics",
  reservas: "/reservas",
  reportes: "/reportes",
  configuracion: "/configuracion",
}

function normalizePathname(pathname) {
  const p = String(pathname || "/").trim() || "/"
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1)
  return p
}

function getSectionFromPathname(pathname) {
  const p = normalizePathname(pathname)
  const hit = Object.entries(SECTION_PATHS).find(([, path]) => path === p)
  return hit?.[0] || "dashboard"
}

function getPathnameFromSection(section) {
  return SECTION_PATHS[section] || SECTION_PATHS.dashboard
}

// ─── ROOT APP ─────────────────────────────────────────────────
export default function App() {
  const useSupabaseAuth = Boolean(import.meta.env.VITE_SUPABASE_URL)
  const [session, setSession] = useState(() => loadSession())
  const [section, setSection] = useState(() => {
    if (typeof window === "undefined") return "dashboard"
    return getSectionFromPathname(window.location.pathname)
  })
  const [clinic,  setClinic]  = useState(1)
  const [clinicOptions, setClinicOptions] = useState([
    { id: 1, nombre: "Clínica 1", modalidad_negocio: "sucursal" },
    { id: 2, nombre: "Clínica 2", modalidad_negocio: "sucursal" },
    { id: 3, nombre: "Clínica 3", modalidad_negocio: "sucursal" },
  ])
  const [data, setDataRaw] = useState(makeData)
  const skipNextPostRef = useRef(false)
  const postTimerRef = useRef(null)
  const refreshSeqRef = useRef(0)
  const postToServer = useCallback(payload => {
    fetch("/api/erp-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {})
  }, [])
  const setData = useCallback(updater => {
    setDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater
      if (skipNextPostRef.current) {
        skipNextPostRef.current = false
        return next
      }
      const rev = (prev._meta?.rev ?? 0) + 1
      const bumped = { ...next, _meta: { ...(next._meta || {}), rev, updatedAt: new Date().toISOString(), seedVersion: 2 } }
      if (postTimerRef.current) clearTimeout(postTimerRef.current)
      postTimerRef.current = setTimeout(() => postToServer(bumped), 350)
      return bumped
    })
  }, [postToServer])

  const refreshErpData = useCallback(async () => {
    if (!useSupabaseAuth) return
    const seq = ++refreshSeqRef.current
    const { data: { session: sb } } = await supabase.auth.getSession()
    if (seq !== refreshSeqRef.current) return
    const token = sb?.access_token
    if (!token) {
      clearSession()
      setSession(null)
      return
    }
    let r
    try {
      r = await fetch("/api/erp/bootstrap", { headers: { Authorization: `Bearer ${token}` } })
    } catch {
      /* Vite reiniciando, sin red, o proxy caído: no propagar rechazo (p. ej. setInterval cada 6s). */
      return
    }
    const j = r.ok ? await r.json().catch(() => null) : null
    if (seq !== refreshSeqRef.current) return
    const mapEmpleadoRow = e => ({
      id: e.id,
      clinicId: e.clinic_id,
      nombre: e.nombre || "",
      email: e.email || "",
      tel: e.tel || "",
      cargo: normalizeRol(e.rol) || "recepcionista",
      activo: e.activo !== false,
      especialidad: e.especialidad || "",
      comision: e.comision_pct == null ? 0 : (+e.comision_pct || 0),
      color: e.color || "#7C3AED",
      fotoUrl: e.foto_url || "",
      documento: e.documento || "",
      fechaNacimiento: e.fecha_nacimiento || "",
      direccion: e.direccion || "",
      fechaIngreso: e.fecha_ingreso || "",
      contactoEmergencia: e.contacto_emergencia || "",
      telEmergencia: e.tel_emergencia || "",
      notas: e.notas || "",
      historial: Array.isArray(e.historial) ? e.historial : [],
    })
    const mapServicioRow = s => ({
      id: s.id,
      nombre: s.nombre || "",
      cat: String(s.cat || "clinico").trim().toLowerCase() || "clinico",
      duracion: +s.duracion || 30,
      precio: s.precio == null ? 0 : +s.precio,
      sesiones: +s.sesiones || 1,
      desc: s.descripcion || "",
      materialesStockIds: Array.isArray(s.materiales_articulo_ids) ? s.materiales_articulo_ids : [],
    })
    const loadServiciosEmpleadosFallback = async () => {
      const [{ data: emps }, { data: srvs }, { data: cs }, { data: ts }, { data: pacs }, { data: arts }, { data: apc }, { data: movs }, { data: tpvMovs }, { data: alertasRows }] = await Promise.all([
        supabase
          .from("empleados")
          .select("id, clinic_id, nombre, email, tel, rol, activo, especialidad, comision_pct, color, foto_url, documento, fecha_nacimiento, direccion, fecha_ingreso, contacto_emergencia, tel_emergencia, notas, historial")
          .order("id"),
        supabase
          .from("servicios")
          .select("id, nombre, cat, duracion, precio, sesiones, descripcion, materiales_articulo_ids")
          .order("id"),
        supabase
          .from("clinics")
          .select("id, nombre, modalidad_negocio, clinic_matriz_id")
          .order("id"),
        supabase
          .from("turnos")
          .select("id, clinic_id, cliente_id, cliente, tel, fecha, hora, cat, servicio, obs, estado, empleado_id, servicio_facturado_id, sesion_medica_borrador")
          .order("id"),
        supabase
          .from("clientes")
          .select("id, clinic_id, nombre, tel, email, dni, fecha_nacimiento, notas_clinicas, alergias, tratamientos_activos, visitas, fotos, anamnesis, consentimientos, created_at, es_paciente")
          .order("id"),
        supabase
          .from("articulos")
          .select("id, nombre, cat, unidad, minimo, costo, proveedor, codigo_barras, foto_url")
          .order("id"),
        supabase
          .from("articulos_por_clinica")
          .select("clinic_id, articulo_id, cantidad")
          .order("clinic_id"),
        supabase
          .from("clinic_movimientos")
          .select("id, clinic_id, tipo, fecha, concepto, cat, monto")
          .order("id"),
        supabase
          .from("tpv_movimientos")
          .select("id, fecha, clinic_id, metodo, monto, concepto, comprobante")
          .order("id"),
        supabase
          .from("alertas_cobro")
          .select("id, clinic_id, turno_id, cliente, servicio, servicio_id, monto_servicio, monto_insumos, monto_total, insumos, estado, metodo_pago, creado")
          .order("id"),
      ])
      const pacIds = (pacs || []).map(p => p.id)
      const { data: hist } = pacIds.length
        ? await supabase.from("historial_clinico").select("id, cliente_id, fecha, tipo, titulo, detalle, profesional").in("cliente_id", pacIds).order("id")
        : { data: [] }
      const clinicIdsFromPacs = [...new Set((pacs || []).map(p => p.clinic_id).filter(Boolean))]
      const { data: consRows } = clinicIdsFromPacs.length
        ? await supabase
          .from("consentimientos_firmados")
          .select("id, clinic_id, cliente_id, turno_id, plantilla_slug, titulo, servicio_o_producto, paciente_nombre_snapshot, contenido_html, pdf_storage_path, firmado_at, firmado_por_empleado_id")
          .in("clinic_id", clinicIdsFromPacs)
          .order("firmado_at", { ascending: false })
        : { data: [] }
      if (seq !== refreshSeqRef.current) return
      const byClinic = {}
      for (const c of (cs || [])) byClinic[c.id] = { turnos: [], stock: [], movimientos: [] }
      for (const t of (ts || [])) {
        if (!byClinic[t.clinic_id]) byClinic[t.clinic_id] = { turnos: [], stock: [], movimientos: [] }
        byClinic[t.clinic_id].turnos.push({
          id: t.id,
          pacienteId: t.cliente_id,
          cliente: t.cliente,
          tel: t.tel,
          fecha: t.fecha,
          hora: t.hora,
          cat: t.cat,
          servicio: t.servicio,
          obs: t.obs,
          estado: t.estado,
          profesionalId: t.empleado_id,
          servicioFacturadoId: t.servicio_facturado_id,
          sesionIniciadaDesde: t.sesion_iniciada_desde || t.sesionIniciadaDesde || null,
          sesionMedicaBorrador: t.sesion_medica_borrador && typeof t.sesion_medica_borrador === "object" ? t.sesion_medica_borrador : null,
        })
      }
      for (const m of (movs || [])) {
        if (!byClinic[m.clinic_id]) byClinic[m.clinic_id] = { turnos: [], stock: [], movimientos: [] }
        byClinic[m.clinic_id].movimientos.push({
          id: m.id,
          tipo: m.tipo,
          fecha: m.fecha,
          concepto: m.concepto,
          cat: m.cat,
          monto: +m.monto || 0,
        })
      }
      const artMap = new Map((arts || []).map(a => [a.id, a]))
      const stockLinkSet = new Set()
      for (const row of (apc || [])) {
        if (!byClinic[row.clinic_id]) byClinic[row.clinic_id] = { turnos: [], stock: [], movimientos: [] }
        const cd = byClinic[row.clinic_id]
        const a = artMap.get(row.articulo_id)
        if (!cd || !a) continue
        stockLinkSet.add(`${row.clinic_id}:${row.articulo_id}`)
        cd.stock.push({
          id: a.id,
          nombre: a.nombre || "",
          cat: a.cat || "general",
          unidad: a.unidad || "unidades",
          minimo: +a.minimo || 0,
          costo: +a.costo || 0,
          proveedor: a.proveedor || "",
          codigoBarras: a.codigo_barras || "",
          fotoUrl: a.foto_url || "",
          stock: +row.cantidad || 0,
        })
      }
      for (const c of (cs || [])) {
        const cd = byClinic[c.id]
        if (!cd) continue
        for (const a of (arts || [])) {
          const key = `${c.id}:${a.id}`
          if (stockLinkSet.has(key)) continue
          cd.stock.push({
            id: a.id,
            nombre: a.nombre || "",
            cat: a.cat || "general",
            unidad: a.unidad || "unidades",
            minimo: +a.minimo || 0,
            costo: +a.costo || 0,
            proveedor: a.proveedor || "",
            codigoBarras: a.codigo_barras || "",
            fotoUrl: a.foto_url || "",
            stock: 0,
          })
        }
      }
      setDataRaw(prev => ({
        ...prev,
        clinics: { ...(prev.clinics || {}), ...byClinic },
        empleados: (emps || []).map(mapEmpleadoRow),
        servicios: (srvs || []).map(mapServicioRow),
        pacientes: (pacs || []).map(p => ({
          id: p.id,
          clinicId: p.clinic_id,
          nombre: p.nombre || "",
          tel: p.tel || "",
          email: p.email || "",
          dni: p.dni || "",
          fechaNacimiento: p.fecha_nacimiento || "",
          notasClinicas: p.notas_clinicas || "",
          alergias: Array.isArray(p.alergias) ? p.alergias : [],
          tratamientosActivos: Array.isArray(p.tratamientos_activos) ? p.tratamientos_activos : [],
          visitas: Array.isArray(p.visitas) ? p.visitas : [],
          fotos: Array.isArray(p.fotos) ? p.fotos : [],
          anamnesis: p.anamnesis && typeof p.anamnesis === "object" ? p.anamnesis : {},
          consentimientos: Array.isArray(p.consentimientos) ? p.consentimientos : [],
          created_at: p.created_at || null,
          esPaciente: p.es_paciente === true,
        })),
        historialClinico: (hist || []).map(h => ({
          id: h.id,
          pacienteId: h.cliente_id,
          fecha: h.fecha,
          tipo: h.tipo || "evolucion",
          titulo: h.titulo || "",
          detalle: h.detalle || "",
          profesional: h.profesional || "",
        })),
        tpv: {
          movimientos: (tpvMovs || []).map(m => ({
            id: m.id,
            fecha: m.fecha,
            clinicId: m.clinic_id,
            metodo: m.metodo || "efectivo",
            monto: +m.monto || 0,
            concepto: m.concepto || "",
            comprobante: m.comprobante || "",
          })),
          cierres: prev.tpv?.cierres || [],
        },
        alertasCobro: (alertasRows || []).map(a => ({
          id: a.id,
          clinicId: a.clinic_id,
          turnoId: a.turno_id,
          paciente: a.cliente || "",
          servicio: a.servicio || "",
          servicioId: a.servicio_id,
          montoServicio: +a.monto_servicio || 0,
          montoInsumos: +a.monto_insumos || 0,
          montoTotal: +a.monto_total || 0,
          insumos: Array.isArray(a.insumos) ? a.insumos : [],
          estado: a.estado || "pendiente",
          metodoPago: a.metodo_pago || null,
          creado: a.creado || null,
        })),
        consentimientosFirmados: (consRows || []).map(mapConsentimientoFirmadoRow).filter(Boolean),
      }))
      if (seq !== refreshSeqRef.current) return
      if (Array.isArray(cs) && cs.length) setClinicOptions(cs)
    }
    if (!j?.clinicsData) {
      await loadServiciosEmpleadosFallback()
      return
    }

    let empleadosBoot = Array.isArray(j.empleados) ? j.empleados : null
    if (empleadosBoot == null || empleadosBoot.length === 0) {
      const { data: emps } = await supabase
        .from("empleados")
        .select("id, clinic_id, nombre, email, tel, rol, activo, especialidad, comision_pct, color, foto_url, documento, fecha_nacimiento, direccion, fecha_ingreso, contacto_emergencia, tel_emergencia, notas, historial")
        .order("id")
      empleadosBoot = (emps || []).map(mapEmpleadoRow)
      if (seq !== refreshSeqRef.current) return
    }
    let serviciosBoot = Array.isArray(j.servicios) ? j.servicios : null
    if (serviciosBoot == null || serviciosBoot.length === 0) {
      const { data: srvs } = await supabase
        .from("servicios")
        .select("id, nombre, cat, duracion, precio, sesiones, descripcion, materiales_articulo_ids")
        .order("id")
      serviciosBoot = (srvs || []).map(mapServicioRow)
      if (seq !== refreshSeqRef.current) return
    }
    if (seq !== refreshSeqRef.current) return
    setDataRaw(prev => {
      const mergedClinics = { ...(prev.clinics || {}), ...(j.clinicsData || {}) }
      return {
        ...prev,
        clinics: mergedClinics,
        empleados: empleadosBoot || [],
        servicios: serviciosBoot || [],
        pacientes: Array.isArray(j.pacientes) ? j.pacientes : (prev.pacientes || []),
        historialClinico: Array.isArray(j.historialClinico) ? j.historialClinico : (prev.historialClinico || []),
        consentimientosFirmados: Array.isArray(j.consentimientosFirmados) ? j.consentimientosFirmados : (prev.consentimientosFirmados || []),
        proveedores: j.proveedores || [],
        pedidosProveedor: j.pedidosProveedor || [],
        incidenciasProveedor: j.incidenciasProveedor || [],
        trasladosInternos: j.trasladosInternos || [],
      }
    })
    if (seq !== refreshSeqRef.current) return
    if (Array.isArray(j.clinics) && j.clinics.length) setClinicOptions(j.clinics)
  }, [useSupabaseAuth])

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) return
    let cancelled = false
    ;(async () => {
      const { data: { session: sb } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!sb?.user) {
        clearSession()
        setSession(null)
        return
      }
      const local = loadSession()
      if (local?.supabase && local.userId) return
      const { data: emp } = await supabase.from("empleados").select("id, nombre, rol, clinic_id, es_principal, activo").eq("auth_user_id", sb.user.id).maybeSingle()
      if (cancelled || !emp?.activo) return
      const next = {
        userId: emp.id,
        role: normalizeRol(emp.rol),
        nombre: emp.nombre,
        user: sb.user.email ?? "",
        clinicId: emp.clinic_id ?? null,
        esPrincipal: Boolean(emp.es_principal),
        supabase: true,
      }
      saveSession(next)
      setSession(next)
    })()
    return () => { cancelled = true }
  }, [])

  const refreshClinics = useCallback(async () => {
    if (!import.meta.env.VITE_SUPABASE_URL) return
    const { data: cs, error } = await supabase
      .from("clinics")
      .select("id, nombre, modalidad_negocio, clinic_matriz_id")
      .order("id")
    if (error || !cs?.length) return
    setClinicOptions(cs)
  }, [])

  useEffect(() => { void refreshClinics() }, [refreshClinics])
  useEffect(() => { void refreshErpData() }, [refreshErpData])
  useEffect(() => {
    if (!useSupabaseAuth) return
    const id = setInterval(() => { void refreshErpData() }, 6000)
    return () => clearInterval(id)
  }, [refreshErpData, useSupabaseAuth])

  useEffect(() => {
    if (!clinicOptions.length) return
    if (!clinicOptions.some(c => c.id === clinic)) setClinic(clinicOptions[0].id)
    setDataRaw(prev => {
      let changed = false
      const nextClinics = { ...(prev.clinics || {}) }
      for (const c of clinicOptions) {
        if (!nextClinics[c.id]) {
          nextClinics[c.id] = { turnos: [], stock: [], movimientos: [] }
          changed = true
        }
      }
      return changed ? { ...prev, clinics: nextClinics } : prev
    })
  }, [clinicOptions, clinic])

  useEffect(() => {
    if (!session) return
    if (session.role === "gerente") return
    const ownClinic = session.clinicId == null ? null : +session.clinicId
    if (ownClinic != null && clinic !== ownClinic) setClinic(ownClinic)
  }, [session, clinic])

  useEffect(() => {
    if (!import.meta.env.VITE_SUPABASE_URL) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") {
        clearSession()
        setSession(null)
      }
    })
    return () => { subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!useSupabaseAuth) return
    const channel = supabase
      .channel("erp-live-servicios-empleados-turnos")
      .on("postgres_changes", { event: "*", schema: "public", table: "servicios" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "empleados" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "turnos" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "historial_clinico" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_movimientos" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "tpv_movimientos" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas_cobro" }, () => { void refreshErpData() })
      .on("postgres_changes", { event: "*", schema: "public", table: "consentimientos_firmados" }, () => { void refreshErpData() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [useSupabaseAuth, refreshErpData])

  useEffect(() => {
    if (useSupabaseAuth) return
    fetch("/api/erp-state")
      .then(r => r.json())
      .then(remote => {
        if (!remote || remote._empty || !remote.clinics) return
        if ((remote._meta?.seedVersion ?? 0) < 2) return
        setDataRaw(prev => {
          if ((remote._meta?.rev ?? 0) <= (prev._meta?.rev ?? 0)) return prev
          skipNextPostRef.current = true
          return remote
        })
      })
      .catch(() => {})
  }, [useSupabaseAuth])

  useEffect(() => {
    if (useSupabaseAuth) return
    const id = setInterval(() => {
      fetch("/api/erp-state")
        .then(r => r.json())
        .then(remote => {
          if (!remote || remote._empty || !remote.clinics) return
          if ((remote._meta?.seedVersion ?? 0) < 2) return
          setDataRaw(prev => {
            if ((remote._meta?.rev ?? 0) <= (prev._meta?.rev ?? 0)) return prev
            skipNextPostRef.current = true
            return remote
          })
        })
        .catch(() => {})
    }, 2200)
    return () => clearInterval(id)
  }, [useSupabaseAuth])
  const [urlDoctorCtx, setUrlDoctorCtx] = useState(() => getDoctorCtxFromUrl())
  const [manualDoctorCtx, setManualDoctorCtx] = useState(null)
  const narrowNav = useMediaQuery("(max-width: 899px)")
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const goToSection = useCallback((nextSection) => {
    setSection(nextSection)
    if (typeof window === "undefined") return
    const nextPath = getPathnameFromSection(nextSection)
    const currentPath = normalizePathname(window.location.pathname)
    if (currentPath === nextPath) return
    window.history.pushState({}, "", `${nextPath}${window.location.search}`)
  }, [])

  const role = session?.role
  const isGerente = role === "gerente"
  const ownClinicId = session?.clinicId == null ? clinic : +session.clinicId
  const effectiveDoctorCtx = manualDoctorCtx ?? urlDoctorCtx
  const titles = {
    dashboard:"Dashboard", agenda:"Agenda", stock:"Stock", contabilidad:"Contabilidad", servicios:"Servicios",
    pacientes:"Pacientes — historial clínico", documentos:"Documentos — consentimientos", clientes:"Clientes — CRM", personal:"Personal y turnos", reportes:"Reportes", marketing:"Marketing",
    bonos:"Bonos y packs", tpv:"TPV Virtual — Caja", analytics:"Reportes avanzados", reservas:"Reservas online",
    sala:"Sala — Orden de servicio",
    doctor_area:"Área médica (QR)",
    configuracion:"Cuentas y equipo",
  }

  const exitDoctorPortal = () => {
    setManualDoctorCtx(null)
    setUrlDoctorCtx(null)
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href)
      u.searchParams.delete("ctx")
      window.history.replaceState({}, "", `${u.pathname}${u.search}`)
    }
  }

  useEffect(() => {
    if (!session || !role) return
    if (!canAccess(role, section)) setSection("dashboard")
  }, [session, role, section])

  useEffect(() => {
    if (!narrowNav) setMobileNavOpen(false)
  }, [narrowNav])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onPop = () => setSection(getSectionFromPathname(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const nextPath = getPathnameFromSection(section)
    const currentPath = normalizePathname(window.location.pathname)
    if (currentPath === nextPath) return
    window.history.replaceState({}, "", `${nextPath}${window.location.search}`)
  }, [section])

  const navFiltered = useMemo(() => NAV.map(g => ({
    ...g,
    items: g.items.filter(it => canAccess(role, it.id)),
  })).filter(g => g.items.length > 0), [role])

  const logout = () => {
    clearSession()
    setSession(null)
    setSection("dashboard")
    setManualDoctorCtx(null)
    setUrlDoctorCtx(getDoctorCtxFromUrl())
    if (import.meta.env.VITE_SUPABASE_URL) void supabase.auth.signOut()
  }

  const isPublicReserva = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reserva") === "1"
  if (isPublicReserva) {
    return <PublicBookingView />
  }

  if (!session) {
    return <Login onLogin={setSession} />
  }

  if (effectiveDoctorCtx && (normalizeRol(role) === "especialista" || role === "gerente")) {
    return (
      <DoctorSessionView
        data={data}
        setData={setData}
        ctx={effectiveDoctorCtx}
        nombreProfesional={session.nombre}
        onExit={exitDoctorPortal}
        clinicNombre={clinicOptions.find(c => c.id === effectiveDoctorCtx?.clinicId)?.nombre}
        sessionEmail={session?.user}
        onConsentSaved={refreshErpData}
      />
    )
  }

  if (effectiveDoctorCtx && role === "recepcionista") {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        padding:"max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
        background:C.bg, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif" }}>
        <div style={{ background:C.card, borderRadius:16, padding:28, maxWidth:420, width:"100%", textAlign:"center", boxShadow:"0 4px 24px rgba(0,0,0,.08)" }}>
          <QrCode size={40} color={C.violet} style={{ marginBottom:12 }}/>
          <h2 style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Enlace de sesión médica</h2>
          <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Este enlace es para personal que atiende en sala. Iniciá sesión con usuario <strong>especialista</strong> o <strong>gerente</strong>, o cerrá para volver al escritorio.</p>
          <Btn onClick={exitDoctorPortal}>Entendido</Btn>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:"flex", width:"100%", height:"100dvh", fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",
      background:"transparent", overflow:"hidden", position:"relative" }}>

      {/* ── ORBES ANIMADOS DE FONDO (liquid glass) ── */}
      <div className="erp-orbs" aria-hidden>
        <span className="erp-orb erp-orb-1"/>
        <span className="erp-orb erp-orb-2"/>
        <span className="erp-orb erp-orb-3"/>
        <span className="erp-orb erp-orb-4"/>
      </div>

      {narrowNav && mobileNavOpen && (
        <button type="button" className="erp-nav-backdrop" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)}
          style={{ position:"fixed", inset:0, zIndex:199, border:"none", padding:0, margin:0, background:"rgba(15,23,42,0.5)", cursor:"pointer" }} />
      )}

      {/* ── SIDEBAR ── */}
      <aside className="erp-app-sidebar" style={{
        width: narrowNav ? 280 : 220,
        display:"flex",
        flexDirection:"column",
        flexShrink:0,
        position: "relative",
        zIndex: 10,
        ...(narrowNav ? {
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: 200,
          height: "100dvh",
          transform: mobileNavOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.22s ease",
          boxShadow: mobileNavOpen ? "8px 0 40px rgba(0,0,0,.35)" : "none",
        } : {}),
      }}>

        {/* Logo */}
        <div style={{ padding:"22px 20px 16px", borderBottom:"1px solid rgba(226,232,240,0.4)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36,
              background: C.gradient,
              borderRadius:10,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0,
              boxShadow: `0 8px 20px -6px ${C.violet}55, 0 1px 0 rgba(255,255,255,0.5) inset`,
            }}>
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <div style={{ color:C.text, fontWeight:800, fontSize:13, lineHeight:1.2, letterSpacing: "-0.015em" }}>Estética ERP</div>
              <div style={{ color:C.muted, fontSize:10, marginTop:2 }}>Sistema de Gestión</div>
            </div>
          </div>
        </div>

        {/* Nav groups */}
        <nav style={{ flex:1, overflowY:"auto", padding:"10px 0" }}>
          {navFiltered.map(g => (
            <div key={g.group}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted,
                letterSpacing:"1px", textTransform:"uppercase", padding:"10px 20px 4px" }}>
                {g.group}
              </div>
              {g.items.map(it => {
                const active = section === it.id
                const Icon = it.icon
                return (
                  <button key={it.id} type="button" onClick={() => { goToSection(it.id); if (narrowNav) setMobileNavOpen(false) }} style={{
                    width:"calc(100% - 12px)",
                    margin: "1px 6px",
                    display:"flex", alignItems:"center", gap:10,
                    padding:"11px 14px",
                    minHeight:44,
                    background: active
                      ? "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(168,85,247,0.12) 100%)"
                      : "transparent",
                    border: active ? "1px solid rgba(99,102,241,0.28)" : "1px solid transparent",
                    borderRadius: 10,
                    cursor:"pointer",
                    color: active ? C.violet : C.muted,
                    fontSize:13, fontWeight: active?700:500,
                    textAlign:"left",
                    boxShadow: active ? "0 1px 0 rgba(255,255,255,0.55) inset, 0 4px 12px -3px rgba(99,102,241,0.22)" : "none",
                    transition: "all .18s",
                    letterSpacing: "-0.005em",
                  }}>
                    <Icon size={16} strokeWidth={active ? 2.4 : 2}/> {it.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Active clinic */}
        <div style={{ padding:"14px 14px", borderTop:"1px solid rgba(226,232,240,0.4)" }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(241,245,249,0.35) 100%)",
            backdropFilter: "blur(10px) saturate(160%)",
            WebkitBackdropFilter: "blur(10px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.5)",
            borderRadius:12, padding:"10px 12px",
            display:"flex", alignItems:"center", gap:8,
            boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px -4px rgba(15,23,42,0.08)",
          }}>
            <div style={{
              width:8, height:8, borderRadius:"50%", background: C.success, flexShrink:0,
              boxShadow: `0 0 8px ${C.success}`,
            }}/>
            <div>
              <div style={{ color:C.text, fontWeight:700, fontSize:12 }}>{clinicOptions.find(c => c.id === clinic)?.nombre || `Clínica ${clinic}`}</div>
              <div style={{ color:C.muted, fontSize:10, marginTop:1 }}>Activa · Online</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0, marginLeft: narrowNav ? 0 : undefined, position:"relative", zIndex: 1 }}>

        {/* TOP BAR */}
        <header style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.32) 100%)",
          backdropFilter: "blur(22px) saturate(200%)",
          WebkitBackdropFilter: "blur(22px) saturate(200%)",
          borderBottom: "none",
          padding:`${narrowNav ? 8 : 0}px max(14px, env(safe-area-inset-right)) ${narrowNav ? 8 : 0}px max(14px, env(safe-area-inset-left))`,
          display:"flex", alignItems:"center", gap: narrowNav ? 10 : 14, minHeight:58, flexShrink:0, flexWrap:"wrap",
          position: "relative",
          zIndex: 5,
        }}>
          {narrowNav && (
            <button type="button" onClick={() => setMobileNavOpen(o => !o)} aria-label="Abrir menú"
              style={{
                width:44, height:44, borderRadius:10,
                border:"1px solid rgba(226,232,240,0.6)",
                background:"rgba(255,255,255,0.6)",
                backdropFilter:"blur(10px) saturate(160%)",
                WebkitBackdropFilter:"blur(10px) saturate(160%)",
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, order:1
              }}>
              <Menu size={20} color={C.text} />
            </button>
          )}
          <div style={{ flex:1, minWidth: narrowNav ? 150 : 0, order:2 }}>
            <div style={{ fontSize: narrowNav ? 15 : 16, fontWeight:800, color:C.text, letterSpacing: "-0.02em" }}>{titles[section]}</div>
            <div style={{ fontSize:11, color:"#94A3B8", marginTop:1 }}>{fmtDate(TODAY)} · {ROLE_LABEL[role]}</div>
          </div>

          <div style={{ order:3 }}>
            <AlertasCobroBell data={data} setData={setData} clinic={clinic} role={role} />
          </div>

          {/* Clinic pills */}
          <div style={{ display:"flex", gap:4, overflowX:"auto", maxWidth: narrowNav ? "100%" : "42vw", width: narrowNav ? "100%" : "auto", WebkitOverflowScrolling:"touch", paddingBottom:2, order: narrowNav ? 5 : 0 }}>
            {(isGerente ? clinicOptions : clinicOptions.filter(c => c.id === ownClinicId)).map(c => (
              <button
                key={c.id}
                onClick={() => { if (isGerente) setClinic(c.id) }}
                style={{
                  padding:"6px 14px", borderRadius:20,
                  border:"1.5px solid",
                  fontSize:12, fontWeight:600, cursor: isGerente ? "pointer" : "default",
                  background: clinic===c.id
                    ? C.gradient
                    : "linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.45) 100%)",
                  color: clinic===c.id ? "#fff" : C.muted,
                  borderColor: clinic===c.id ? "rgba(255,255,255,0.3)" : "rgba(226,232,240,0.6)",
                  opacity: isGerente ? 1 : 0.95,
                  backdropFilter: clinic===c.id ? undefined : "blur(10px) saturate(160%)",
                  WebkitBackdropFilter: clinic===c.id ? undefined : "blur(10px) saturate(160%)",
                  boxShadow: clinic===c.id
                    ? `0 1px 0 rgba(255,255,255,0.35) inset, 0 6px 16px -4px ${C.violet}55`
                    : "0 1px 0 rgba(255,255,255,0.5) inset",
                }}>
                {c.nombre}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10, marginLeft: narrowNav ? "auto" : 0, minWidth:0, order:4 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{session.nombre}</div>
              {!narrowNav && <div style={{ fontSize:10, color:C.muted }}>{session.user}</div>}
            </div>
            <button type="button" onClick={logout} title="Cerrar sesión"
              style={{
                width:36, height:36, borderRadius:"50%",
                border:"1.5px solid rgba(226,232,240,0.6)",
                background:"rgba(255,255,255,0.6)",
                backdropFilter:"blur(10px) saturate(160%)",
                WebkitBackdropFilter:"blur(10px) saturate(160%)",
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center"
              }}>
              <LogOut size={16} color={C.muted}/>
            </button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main style={{ flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))" }}>
          {section==="dashboard"     && <Dashboard     data={data} clinic={clinic} setData={setData} role={role} onOpenTurnoSession={t => setManualDoctorCtx({ clinicId: clinic, turnoId: t.id })}/>}
          {section==="agenda"        && <Agenda        data={data} clinic={clinic} setData={setData} onPersist={refreshErpData} role={role} clinicOptions={clinicOptions}/>}
          {section==="sala"          && <SalaOrdenServicio data={data} setData={setData} clinic={clinic} nombreProfesional={session.nombre} profFiltro={normalizeRol(role) === "especialista" ? 1 : null} />}
          {section==="doctor_area"   && <DoctorAreaLanding clinic={clinic} demoTurno={pickDemoTurnoForDoctorArea(data.clinics[clinic]?.turnos)} onOpenDemo={t => setManualDoctorCtx({ clinicId: clinic, turnoId: t.id })} />}
          {section==="pacientes"     && <PacientesHistorial data={data} setData={setData} role={role} nombreUsuario={session.nombre} mode="pacientes" clinic={clinic} clinicNombre={clinicOptions.find(c => c.id === clinic)?.nombre} onConsentSaved={refreshErpData} sessionEmail={session?.user}/>}
          {section==="clientes"      && <PacientesHistorial data={data} setData={setData} role={role} nombreUsuario={session.nombre} mode="clientes" clinic={clinic} clinicNombre={clinicOptions.find(c => c.id === clinic)?.nombre} onConsentSaved={refreshErpData} sessionEmail={session?.user}/>}
          {section==="documentos"     && <DocumentosConsent data={data} setData={setData} clinicId={clinic} clinicNombre={clinicOptions.find(c => c.id === clinic)?.nombre} sessionEmail={session?.user} onConsentSaved={refreshErpData} />}
          {section==="stock"         && <Stock         data={data} clinic={clinic} setData={setData} onPersist={refreshErpData} role={role}/>}
          {section==="contabilidad"  && <Contabilidad  data={data} clinic={clinic} setData={setData}/>}
          {section==="servicios"     && <Servicios     data={data} clinic={clinic} setData={setData} onGoStock={() => goToSection("stock")} onPersist={refreshErpData}/>}
          {section==="personal"      && <PersonalTurnos data={data} setData={setData} role={role}/>}
          {section==="reportes"      && <ReportesExport data={data} clinic={clinic}/>}
          {section==="bonos"         && <BonosPacks data={data} setData={setData} clinic={clinic}/>}
          {section==="tpv"           && <PuntoVenta data={data} setData={setData} clinic={clinic}/>}
          {section==="marketing"     && <MarketingHub data={data} setData={setData} clinic={clinic}/>}
          {section==="analytics"     && <ReportesAvanzados data={data} clinic={clinic}/>}
          {section==="reservas"      && <ReservasOnline data={data} setData={setData} clinic={clinic}/>}
          {section==="configuracion" && <ConfiguracionCuentas onClinicsChanged={refreshClinics} />}
        </main>
      </div>
    </div>
  )
}
