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
   PALETA Y AYUDAS DE DIBUJO
   Diseño tipo documento clínico moderno: cabecera con banda, rejilla
   de datos del paciente con etiquetas en gris, secciones tipográficas
   (TÉCNICA / RIESGOS / etc.) y firmas con caja.
   ──────────────────────────────────────────────────────────────────────── */

const COLORS = {
  brand: [37, 99, 235],        // azul corporativo (banda)
  brandSoft: [219, 234, 254],  // azul clarito para fondos
  ink: [15, 23, 42],           // texto principal
  inkSoft: [71, 85, 105],      // texto secundario
  hair: [203, 213, 225],       // líneas/separadores
  hairSoft: [226, 232, 240],   // fondos de tabla alterna
  warn: [180, 83, 9],          // riesgos / aviso
}

function setFill(doc, c) { doc.setFillColor(c[0], c[1], c[2]) }
function setStroke(doc, c) { doc.setDrawColor(c[0], c[1], c[2]) }
function setText(doc, c) { doc.setTextColor(c[0], c[1], c[2]) }

/** Detecta y formatea una "sección" en el cuerpo del consentimiento. */
function detectSection(line) {
  const trimmed = line.trim()
  // Mayúsculas seguidas de ":" o título corto (TECNICA:, RIESGOS:, etc.)
  const m = trimmed.match(/^([A-ZÁÉÍÓÚÜÑ0-9 .,()/-]{3,40}):\s*(.*)$/)
  if (m && m[1] === m[1].toUpperCase()) {
    return { type: "section", label: m[1].trim(), rest: m[2].trim() }
  }
  // Línea totalmente en mayúsculas (titular)
  if (/^[A-ZÁÉÍÓÚÜÑ0-9 .,()/-]{4,80}$/.test(trimmed) && /[A-ZÁÉÍÓÚÜÑ]/.test(trimmed)) {
    return { type: "heading", label: trimmed }
  }
  return { type: "para", text: line }
}

/**
 * Genera un PDF del consentimiento con un diseño cuidado:
 *  - Cabecera con banda de color, logo, título y subtítulo
 *  - Rejilla de datos del paciente (cajita con fondo suave)
 *  - Cuerpo con secciones (TÉCNICA, RIESGOS, …) realzadas
 *  - Bloque de firmas con cajas y leyendas
 *  - Pie con paginación y dato del centro
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
  /** Si se pasa (p. ej. PNG en base64 desde Node), se usa en lugar de cargar `logoUrl` por red. */
  logoDataUrl: logoDataUrlParam = null,
  logoUrl = "/consentimiento-logo-bs.png",
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageW = 210
  const pageH = 297
  const margin = 14
  const maxW = pageW - margin * 2

  /* ── Cabecera ───────────────────────────────────────────────────────── */
  let logoDataUrl = logoDataUrlParam
  if (!logoDataUrl && logoUrl) {
    logoDataUrl = await fetchImageAsDataUrl(logoUrl)
  }

  // Banda superior
  setFill(doc, COLORS.brand)
  doc.rect(0, 0, pageW, 22, "F")
  // Sub-banda clarita debajo
  setFill(doc, COLORS.brandSoft)
  doc.rect(0, 22, pageW, 4, "F")

  // Logo (sobre la banda blanca a la derecha)
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", pageW - margin - 22, 3, 22, 22)
    } catch {
      try { doc.addImage(logoDataUrl, "JPEG", pageW - margin - 22, 3, 22, 22) }
      catch { /* sin logo */ }
    }
  }

  // Título y subtítulo en la banda
  setText(doc, [255, 255, 255])
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("CONSENTIMIENTO INFORMADO", margin, 13)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const subt = String(titulo || "Tratamiento estético").trim()
  doc.text(subt, margin, 19)

  setText(doc, COLORS.ink)
  let y = 34

  /* ── Caja de datos del paciente ─────────────────────────────────────── */
  const parted =
    nombrePacienteNombre != null && nombrePacienteApellidos != null
      ? { nombre: val(nombrePacienteNombre), apellidos: val(nombrePacienteApellidos) }
      : partirNombreApellidos(nombrePaciente)

  const nomb = parted.nombre
  const ape = parted.apellidos
  const dni = val(pacienteDni)
  const email = val(pacienteEmail)
  const tel = val(pacienteTelefono)
  const fn = val(pacienteFechaNacimiento)
  const centro = val(datosCentro)
  const nCol = val(numeroColegiado)

  const boxX = margin
  const boxW = maxW
  const boxY = y
  const boxH = 36

  setFill(doc, COLORS.hairSoft)
  setStroke(doc, COLORS.hair)
  doc.setLineWidth(0.2)
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "FD")

  // Etiqueta de la caja
  setFill(doc, COLORS.brand)
  doc.roundedRect(boxX, boxY, 50, 5.5, 1, 1, "F")
  setText(doc, [255, 255, 255])
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text("DATOS DEL PACIENTE", boxX + 2.5, boxY + 3.9)

  // Rejilla 2 columnas dentro de la caja
  setText(doc, COLORS.ink)
  const padX = 4
  const innerY = boxY + 9
  const colW = (boxW - padX * 2 - 6) / 2
  const colLx = boxX + padX
  const colRx = boxX + padX + colW + 6
  const labelW = 30

  const drawField = (x, yy, label, value) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    setText(doc, COLORS.inkSoft)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    setText(doc, COLORS.ink)
    const lines = doc.splitTextToSize(String(value), colW - labelW)
    doc.text(lines, x + labelW, yy)
  }

  drawField(colLx, innerY,      "Nombre",          nomb)
  drawField(colRx, innerY,      "Apellidos",       ape)
  drawField(colLx, innerY + 6,  "NIF / NIE",       dni)
  drawField(colRx, innerY + 6,  "E-mail",          email)
  drawField(colLx, innerY + 12, "F. nacimiento",   fn)
  drawField(colRx, innerY + 12, "Teléfono",        tel)
  drawField(colLx, innerY + 18, "Centro",          centro)
  drawField(colRx, innerY + 18, "Nº colegiado",    nCol)

  y = boxY + boxH + 8

  /* ── Título del tratamiento ─────────────────────────────────────────── */
  const tituloTrat = String(titulo || "Tratamiento").trim().toUpperCase().slice(0, 120)
  setText(doc, COLORS.brand)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text(tituloTrat, pageW / 2, y, { align: "center" })
  // Subrayado decorativo
  setStroke(doc, COLORS.brand)
  doc.setLineWidth(0.6)
  const tw = Math.min(maxW, doc.getTextWidth(tituloTrat) + 14)
  doc.line(pageW / 2 - tw / 2, y + 2, pageW / 2 + tw / 2, y + 2)
  setText(doc, COLORS.ink)
  y += 8

  /* ── Cuerpo del consentimiento (con secciones realzadas) ────────────── */
  const body = String(cuerpoTexto || "").replace(/\r\n/g, "\n").trim()
  const rawLines = body.split(/\n/)

  const lineH = 4.2
  const sectionGapTop = 2
  const sectionGapBot = 1.5

  // Pie de página con número
  const drawFooter = (pageNum, totalPages) => {
    setStroke(doc, COLORS.hair)
    doc.setLineWidth(0.2)
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14)
    setText(doc, COLORS.inkSoft)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    const left = String(centro).slice(0, 80)
    doc.text(left, margin, pageH - 9)
    const right = totalPages
      ? `Página ${pageNum} de ${totalPages}`
      : `Página ${pageNum}`
    doc.text(right, pageW - margin, pageH - 9, { align: "right" })
    doc.text("Consentimiento informado", pageW / 2, pageH - 9, { align: "center" })
    setText(doc, COLORS.ink)
  }

  const ensureSpace = (need) => {
    if (y + need > pageH - 22) {
      drawFooter(doc.internal.getNumberOfPages())
      doc.addPage()
      // Banda fina superior en páginas siguientes
      setFill(doc, COLORS.brand)
      doc.rect(0, 0, pageW, 6, "F")
      setText(doc, COLORS.ink)
      y = 16
    }
  }

  for (const raw of rawLines) {
    if (!raw.trim()) {
      y += lineH * 0.6
      continue
    }
    const sec = detectSection(raw)

    if (sec.type === "heading") {
      ensureSpace(lineH * 2 + sectionGapTop)
      y += sectionGapTop
      setText(doc, COLORS.brand)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10.5)
      const lines = doc.splitTextToSize(sec.label, maxW)
      for (const ln of lines) {
        ensureSpace(lineH + 1)
        doc.text(ln, margin, y)
        y += lineH + 1
      }
      setText(doc, COLORS.ink)
      y += sectionGapBot
      continue
    }

    if (sec.type === "section") {
      // Etiqueta de sección + texto justificado a continuación
      ensureSpace(lineH * 2 + sectionGapTop)
      y += sectionGapTop
      // Pequeña pastilla con la etiqueta
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8)
      const labelText = sec.label
      const lblW = doc.getTextWidth(labelText) + 4
      const isRiesgo = /RIESGO|EFECTO|CONTRAINDIC|ADVERT/i.test(labelText)
      setFill(doc, isRiesgo ? [254, 226, 226] : COLORS.brandSoft)
      setStroke(doc, isRiesgo ? [248, 113, 113] : COLORS.brand)
      doc.setLineWidth(0.2)
      doc.roundedRect(margin, y - 3.4, lblW, 5, 1, 1, "FD")
      setText(doc, isRiesgo ? COLORS.warn : COLORS.brand)
      doc.text(labelText, margin + 2, y)
      setText(doc, COLORS.ink)
      y += 5.5

      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      const text = sec.rest
      if (text) {
        const lines = doc.splitTextToSize(text, maxW)
        for (const ln of lines) {
          ensureSpace(lineH)
          doc.text(ln, margin, y)
          y += lineH
        }
      }
      y += sectionGapBot
      continue
    }

    // Párrafo normal
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(raw, maxW)
    for (const ln of lines) {
      ensureSpace(lineH)
      doc.text(ln, margin, y)
      y += lineH
    }
  }

  /* ── Bloque de firma ────────────────────────────────────────────────── */
  ensureSpace(46)
  y += 6
  setStroke(doc, COLORS.hair)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)
  y += 6

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  setText(doc, COLORS.ink)
  const fsRaw = fechaStr && String(fechaStr).trim()
  const fechaLine = fsRaw
    ? `En ${centro !== "—" ? centro + ", a " : ""}${fsRaw}`
    : "En __________________ a _____ de _________________ de ________"
  doc.text(fechaLine, margin, y)
  y += 8

  // Tres cajas: paciente, tutor, profesional
  const wBox = (maxW - 12) / 3
  const gap = 6
  const x1 = margin
  const x2 = margin + wBox + gap
  const x3 = margin + 2 * (wBox + gap)
  const hBox = 22

  setStroke(doc, COLORS.hair)
  setFill(doc, [252, 252, 253])
  doc.roundedRect(x1, y, wBox, hBox, 1.5, 1.5, "FD")
  doc.roundedRect(x2, y, wBox, hBox, 1.5, 1.5, "FD")
  doc.roundedRect(x3, y, wBox, hBox, 1.5, 1.5, "FD")

  if (firmaPacienteDataUrl) {
    try { doc.addImage(firmaPacienteDataUrl, "PNG", x1 + 2, y + 2, wBox - 4, hBox - 7) } catch { /* */ }
  }
  if (firmaProfesionalDataUrl) {
    try { doc.addImage(firmaProfesionalDataUrl, "PNG", x3 + 2, y + 2, wBox - 4, hBox - 7) } catch { /* */ }
  }

  // Etiquetas debajo de las cajas
  setText(doc, COLORS.inkSoft)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.text("Fdo. Paciente", x1 + wBox / 2, y + hBox + 4, { align: "center" })
  doc.text("Fdo. Madre / Padre / Tutor", x2 + wBox / 2, y + hBox + 4, { align: "center" })
  doc.text("Fdo. Profesional sanitario", x3 + wBox / 2, y + hBox + 4, { align: "center" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  setText(doc, COLORS.ink)
  doc.text(String(nomb + " " + ape).slice(0, 38), x1 + wBox / 2, y + hBox + 8, { align: "center" })
  if (nombreProfesional) {
    doc.text(String(nombreProfesional).slice(0, 38), x3 + wBox / 2, y + hBox + 8, { align: "center" })
    if (nCol && nCol !== "—") {
      doc.text(`Nº col. ${nCol}`, x3 + wBox / 2, y + hBox + 11, { align: "center" })
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
 * Sirve para registros viejos que solo tienen HTML o si falló la subida del PDF firmado.
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
