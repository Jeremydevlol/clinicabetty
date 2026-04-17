import { jsPDF } from "jspdf"
import { partirNombreApellidos } from "./rellenarPlantilla.js"

/**
 * Carga imagen desde URL pública (p. ej. /consentimiento-logo-bs.png) a data URL.
 */
async function fetchImageAsDataUrl(url) {
  if (!url || typeof fetch === "undefined") return null
  try {
    const abs =
      typeof window !== "undefined" && url.startsWith("/")
        ? `${window.location.origin}${url}`
        : url
    const r = await fetch(abs)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = reject
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function val(s) {
  const t = String(s ?? "").trim()
  return t || "—"
}

/* ──────────────────────────────────────────────────────────────────────────
   Fondo blanco; sin tintes de color en tipografía ni trazos.
   Único color: el logo (PNG/JPEG). Líneas y textos en grises muy claros.
   ──────────────────────────────────────────────────────────────────────── */

const C = {
  ink:      [48, 48, 48],
  inkSoft:  [105, 105, 105],
  inkMuted: [165, 165, 165],
  hair:     [200, 200, 200],
  hairSoft: [228, 228, 228],
}

const setStroke = (d, c) => d.setDrawColor(c[0], c[1], c[2])
const setText = (d, c) => d.setTextColor(c[0], c[1], c[2])

function detectSection(line) {
  const trimmed = line.trim()
  const num = trimmed.match(/^(\d+)[.)]\s+(.+)$/)
  if (num) return { type: "numbered", number: num[1], label: num[2].trim() }
  const m = trimmed.match(/^([A-ZÁÉÍÓÚÜÑ0-9 .,()/-]{3,120}):\s*(.*)$/)
  if (m && m[1] === m[1].toUpperCase()) {
    return { type: "section", label: m[1].trim(), rest: m[2].trim() }
  }
  if (/^[A-ZÁÉÍÓÚÜÑ0-9 .,()/–-]{4,90}$/.test(trimmed) && /[A-ZÁÉÍÓÚÜÑ]/.test(trimmed)) {
    return { type: "heading", label: trimmed }
  }
  if (/^[•\-*·]\s+/.test(trimmed)) {
    return { type: "bullet", text: trimmed.replace(/^[•\-*·]\s+/, "") }
  }
  if (/^[⸻—_–-]{2,}$/.test(trimmed)) return { type: "rule" }
  return { type: "para", text: line }
}

/**
 * PDF de consentimiento — fondo blanco, grises suaves; solo el logo lleva color.
 *  - Logo a color arriba a la derecha
 *  - Tipografía y filetes en gris claro (sin azules ni acentos cromáticos)
 */
export async function buildConsentimientoPdfDataUrl({
  titulo,
  cuerpoTexto,
  firmaPacienteDataUrl,
  firmaProfesionalDataUrl,
  nombrePaciente = "",
  nombrePacienteNombre,
  nombrePacienteApellidos,
  pacienteDni,
  pacienteEmail,
  pacienteTelefono,
  pacienteFechaNacimiento,
  datosCentro,
  numeroColegiado,
  nombreProfesional,
  fechaStr,
  logoDataUrl: logoDataUrlParam = null,
  logoUrl = "/consentimiento-logo-bs.png",
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageW = 210
  const pageH = 297
  const margin = 18
  const maxW = pageW - margin * 2

  let logoDataUrl = logoDataUrlParam
  if (!logoDataUrl && logoUrl) {
    logoDataUrl = await fetchImageAsDataUrl(logoUrl)
  }

  /* ── Cabecera ───────────────────────────────────────────────────────── */
  const logoSize = 22
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", pageW - margin - logoSize, margin - 4, logoSize, logoSize)
    } catch {
      try { doc.addImage(logoDataUrl, "JPEG", pageW - margin - logoSize, margin - 4, logoSize, logoSize) }
      catch { /* sin logo */ }
    }
  }

  setText(doc, C.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("CONSENTIMIENTO INFORMADO", margin, margin + 2)

  setText(doc, C.inkSoft)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  const sub = String(titulo || "Tratamiento estético").trim().toUpperCase()
  doc.text(sub, margin, margin + 7)

  setStroke(doc, C.hair)
  doc.setLineWidth(0.4)
  doc.line(margin, margin + 14, pageW - margin, margin + 14)

  let y = margin + 22

  /* ── Datos del paciente — rejilla minimalista ───────────────────────── */
  setText(doc, C.inkSoft)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text("DATOS DEL PACIENTE", margin, y)
  y += 1
  setStroke(doc, C.hairSoft)
  doc.setLineWidth(0.2)
  doc.line(margin, y, pageW - margin, y)
  y += 5

  const parted =
    nombrePacienteNombre != null && nombrePacienteApellidos != null
      ? { nombre: val(nombrePacienteNombre), apellidos: val(nombrePacienteApellidos) }
      : partirNombreApellidos(nombrePaciente)

  const dni = val(pacienteDni)
  const email = val(pacienteEmail)
  const tel = val(pacienteTelefono)
  const fn = val(pacienteFechaNacimiento)
  const centro = val(datosCentro)
  const nCol = val(numeroColegiado)

  const colW = (maxW - 8) / 2
  const colLx = margin
  const colRx = margin + colW + 8
  const labelW = 30
  const rowH = 6.5

  const drawField = (x, yy, label, value) => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    setText(doc, C.inkSoft)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    setText(doc, C.ink)
    const lines = doc.splitTextToSize(String(value), colW - labelW - 1)
    doc.text(lines, x + labelW, yy)
    setStroke(doc, C.hairSoft)
    doc.setLineWidth(0.15)
    doc.line(x + labelW, yy + 1.6, x + colW, yy + 1.6)
  }

  drawField(colLx, y,           "Nombre",        parted.nombre)
  drawField(colRx, y,           "Apellidos",     parted.apellidos)
  drawField(colLx, y + rowH,    "NIF / NIE",     dni)
  drawField(colRx, y + rowH,    "E-mail",        email)
  drawField(colLx, y + rowH*2,  "F. nacimiento", fn)
  drawField(colRx, y + rowH*2,  "Teléfono",      tel)
  drawField(colLx, y + rowH*3,  "Centro",        centro)
  drawField(colRx, y + rowH*3,  "Nº colegiado",  nCol)

  y += rowH * 4 + 4

  /* ── Título del tratamiento ─────────────────────────────────────────── */
  setStroke(doc, C.hair)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  setText(doc, C.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  const tituloTrat = String(titulo || "Tratamiento").trim().toUpperCase().slice(0, 120)
  doc.text(tituloTrat, pageW / 2, y, { align: "center" })
  y += 4
  setStroke(doc, C.hair)
  doc.setLineWidth(0.25)
  const ruleW = 28
  doc.line(pageW / 2 - ruleW / 2, y, pageW / 2 + ruleW / 2, y)
  y += 8

  /* ── Cuerpo del consentimiento ──────────────────────────────────────── */
  const body = String(cuerpoTexto || "").replace(/\r\n/g, "\n").trim()
  const rawLines = body.split(/\n/).filter((ln, idx) => {
    if (idx > 6) return true
    const t = ln.trim().toUpperCase()
    return t !== tituloTrat
  })

  const lineH = 4.4
  const sectionGapTop = 3
  const sectionGapBot = 2

  const drawFooter = (pageNum, totalPages) => {
    setStroke(doc, C.hairSoft)
    doc.setLineWidth(0.15)
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14)
    setText(doc, C.inkMuted)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.text(String(centro).slice(0, 80), margin, pageH - 9)
    doc.text("Consentimiento informado", pageW / 2, pageH - 9, { align: "center" })
    const right = totalPages ? `Página ${pageNum} de ${totalPages}` : `Página ${pageNum}`
    doc.text(right, pageW - margin, pageH - 9, { align: "right" })
    setText(doc, C.ink)
  }

  const ensureSpace = (need) => {
    if (y + need > pageH - 22) {
      doc.addPage()
      setText(doc, C.inkSoft)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      doc.text("CONSENTIMIENTO INFORMADO", margin, margin)
      doc.text(tituloTrat, pageW - margin, margin, { align: "right" })
      setStroke(doc, C.hairSoft)
      doc.setLineWidth(0.2)
      doc.line(margin, margin + 2, pageW - margin, margin + 2)
      setText(doc, C.ink)
      y = margin + 8
    }
  }

  const drawWrappedText = (text, x, w, font = "normal", size = 9.5) => {
    doc.setFont("helvetica", font)
    doc.setFontSize(size)
    setText(doc, C.ink)
    const lines = doc.splitTextToSize(text, w)
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(lineH)
      doc.text(lines[i], x, y)
      y += lineH
    }
  }

  for (const raw of rawLines) {
    if (!raw.trim()) {
      y += lineH * 0.55
      continue
    }
    const sec = detectSection(raw)

    if (sec.type === "rule") {
      ensureSpace(6)
      y += 1.5
      setStroke(doc, C.hairSoft)
      doc.setLineWidth(0.2)
      const w = 36
      doc.line(pageW / 2 - w / 2, y, pageW / 2 + w / 2, y)
      y += 4
      continue
    }

    if (sec.type === "heading") {
      ensureSpace(lineH * 2 + sectionGapTop)
      y += sectionGapTop
      setText(doc, C.ink)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      const lines = doc.splitTextToSize(sec.label, maxW)
      for (const ln of lines) {
        ensureSpace(lineH + 1)
        doc.text(ln, margin, y)
        y += lineH + 0.5
      }
      setStroke(doc, C.hairSoft)
      doc.setLineWidth(0.15)
      doc.line(margin, y - 0.5, pageW - margin, y - 0.5)
      y += sectionGapBot
      continue
    }

    if (sec.type === "numbered") {
      ensureSpace(lineH * 2 + sectionGapTop)
      y += sectionGapTop
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      setText(doc, C.ink)
      const numStr = `${sec.number}.`
      doc.text(numStr, margin, y)
      const indent = 7
      const lines = doc.splitTextToSize(sec.label, maxW - indent)
      for (let i = 0; i < lines.length; i++) {
        ensureSpace(lineH + 1)
        doc.text(lines[i], margin + indent, y)
        y += lineH + 0.5
      }
      setStroke(doc, C.hairSoft)
      doc.setLineWidth(0.15)
      doc.line(margin, y - 0.5, pageW - margin, y - 0.5)
      y += sectionGapBot
      continue
    }

    if (sec.type === "section") {
      ensureSpace(lineH * 2 + sectionGapTop)
      y += sectionGapTop
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      setText(doc, C.ink)
      doc.text(sec.label, margin, y)
      const lblW = doc.getTextWidth(sec.label)
      setStroke(doc, C.hairSoft)
      doc.setLineWidth(0.15)
      doc.line(margin + lblW + 3, y - 0.8, pageW - margin, y - 0.8)
      y += lineH

      if (sec.rest) {
        drawWrappedText(sec.rest, margin, maxW, "normal", 9.5)
      }
      y += sectionGapBot
      continue
    }

    if (sec.type === "bullet") {
      ensureSpace(lineH)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9.5)
      setText(doc, C.ink)
      doc.text("•", margin + 1, y)
      const lines = doc.splitTextToSize(sec.text, maxW - 6)
      for (let i = 0; i < lines.length; i++) {
        ensureSpace(lineH)
        doc.text(lines[i], margin + 6, y)
        y += lineH
      }
      continue
    }

    drawWrappedText(raw, margin, maxW, "normal", 9.5)
  }

  /* ── Bloque de firma ────────────────────────────────────────────────── */
  ensureSpace(50)
  y += 8
  setStroke(doc, C.hair)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageW - margin, y)
  y += 7

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  setText(doc, C.ink)
  const fsRaw = fechaStr && String(fechaStr).trim()
  const fechaLine = fsRaw
    ? `En ${centro !== "—" ? centro + ", a " : ""}${fsRaw}.`
    : "En __________________ a _____ de _________________ de ________"
  const fechaLines = doc.splitTextToSize(fechaLine, maxW)
  doc.text(fechaLines, margin, y)
  y += 4.2 * fechaLines.length + 7.8

  const colsGap = 10
  const wBox = (maxW - colsGap * 2) / 3
  const x1 = margin
  const x2 = margin + wBox + colsGap
  const x3 = margin + 2 * (wBox + colsGap)
  const lineY = y + 14

  if (firmaPacienteDataUrl) {
    try { doc.addImage(firmaPacienteDataUrl, "PNG", x1 + 4, y, wBox - 8, 14) } catch { /* */ }
  }
  if (firmaProfesionalDataUrl) {
    try { doc.addImage(firmaProfesionalDataUrl, "PNG", x3 + 4, y, wBox - 8, 14) } catch { /* */ }
  }

  setStroke(doc, C.hair)
  doc.setLineWidth(0.3)
  doc.line(x1, lineY, x1 + wBox, lineY)
  doc.line(x2, lineY, x2 + wBox, lineY)
  doc.line(x3, lineY, x3 + wBox, lineY)

  setText(doc, C.inkSoft)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.text("FDO. PACIENTE",                x1 + wBox / 2, lineY + 4, { align: "center" })
  doc.text("FDO. MADRE / PADRE / TUTOR",   x2 + wBox / 2, lineY + 4, { align: "center" })
  doc.text("FDO. PROFESIONAL SANITARIO",   x3 + wBox / 2, lineY + 4, { align: "center" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  setText(doc, C.ink)
  doc.text(String(parted.nombre + " " + parted.apellidos).slice(0, 38), x1 + wBox / 2, lineY + 8, { align: "center" })
  if (nombreProfesional) {
    doc.text(String(nombreProfesional).slice(0, 38), x3 + wBox / 2, lineY + 8, { align: "center" })
    if (nCol && nCol !== "—") {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      setText(doc, C.inkSoft)
      doc.text(`Nº col. ${nCol}`, x3 + wBox / 2, lineY + 11.5, { align: "center" })
    }
  }

  /* ── Pies de página ─────────────────────────────────────────────────── */
  const total = doc.internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    drawFooter(i, total)
  }

  return doc.output("dataurlstring")
}

/** Pasa HTML archivado a texto plano para regenerar PDF. */
export function consentHtmlToPlainText(html) {
  if (typeof document === "undefined") {
    return String(html || "")
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }
  const d = document.createElement("div")
  d.innerHTML = html || ""
  return (d.textContent || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Descarga un PDF con el texto del consentimiento (sin firmas en imagen).
 */
export async function downloadPdfFromArchivedHtml({ titulo, contenidoHtml, filenameBase = "consentimiento" }) {
  const plain = consentHtmlToPlainText(contenidoHtml)
  const fechaArchivo = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
  const dataUrl = await buildConsentimientoPdfDataUrl({
    titulo: titulo || "Consentimiento informado",
    cuerpoTexto: plain || "(sin texto)",
    firmaPacienteDataUrl: null,
    firmaProfesionalDataUrl: null,
    nombrePaciente: "",
    nombrePacienteNombre: "—",
    nombrePacienteApellidos: "—",
    pacienteDni: "—",
    pacienteEmail: "—",
    pacienteTelefono: "—",
    pacienteFechaNacimiento: "—",
    datosCentro: "—",
    numeroColegiado: "—",
    nombreProfesional: "",
    fechaStr: fechaArchivo,
    logoUrl: "/consentimiento-logo-bs.png",
  })
  const safe = String(filenameBase).replace(/[^\w\-]+/g, "_").slice(0, 60) || "consentimiento"
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = `${safe}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Sube PDF a erp-media vía el mismo endpoint que imágenes (dev: Vite). */
export async function uploadConsentPdfDataUrl(dataUrl, { clinicId, clienteId, accessToken }) {
  const folder = `consentimientos/c${clinicId}/p${clienteId}`
  const r = await fetch("/api/admin/upload-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ dataUrl, folder }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.url) throw new Error(j?.error || "No se pudo subir el PDF")
  return j.url
}
