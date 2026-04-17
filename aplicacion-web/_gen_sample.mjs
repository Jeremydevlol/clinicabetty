import fs from "node:fs"
import { jsPDF } from "jspdf"

/* ===== INLINE: copia del nuevo consentimientoPdf.js (solo lo necesario) ===== */
const COLORS = {
  brand: [37, 99, 235],
  brandSoft: [219, 234, 254],
  ink: [15, 23, 42],
  inkSoft: [71, 85, 105],
  hair: [203, 213, 225],
  hairSoft: [226, 232, 240],
  warn: [180, 83, 9],
}
const setFill = (d, c) => d.setFillColor(c[0], c[1], c[2])
const setStroke = (d, c) => d.setDrawColor(c[0], c[1], c[2])
const setText = (d, c) => d.setTextColor(c[0], c[1], c[2])
const val = s => { const t = String(s ?? "").trim(); return t || "—" }
function partirNombreApellidos(n) {
  const s = String(n||"").trim()
  if (!s) return { nombre:"—", apellidos:"—" }
  const p = s.split(/\s+/)
  if (p.length === 1) return { nombre:p[0], apellidos:"—" }
  return { nombre:p[0], apellidos:p.slice(1).join(" ") }
}
function detectSection(line) {
  const t = line.trim()
  const m = t.match(/^([A-ZÁÉÍÓÚÜÑ0-9 .,()/-]{3,40}):\s*(.*)$/)
  if (m && m[1] === m[1].toUpperCase()) return { type:"section", label:m[1].trim(), rest:m[2].trim() }
  if (/^[A-ZÁÉÍÓÚÜÑ0-9 .,()/-]{4,80}$/.test(t) && /[A-ZÁÉÍÓÚÜÑ]/.test(t)) return { type:"heading", label:t }
  return { type:"para", text:line }
}

async function buildPDF(opts) {
  const {
    titulo, cuerpoTexto,
    nombrePaciente="", pacienteDni, pacienteEmail, pacienteTelefono, pacienteFechaNacimiento,
    datosCentro, numeroColegiado, nombreProfesional, fechaStr, logoDataUrl,
  } = opts
  const doc = new jsPDF({ unit:"mm", format:"a4" })
  const pageW=210, pageH=297, margin=14, maxW=pageW-margin*2

  setFill(doc, COLORS.brand); doc.rect(0,0,pageW,22,"F")
  setFill(doc, COLORS.brandSoft); doc.rect(0,22,pageW,4,"F")
  if (logoDataUrl) { try { doc.addImage(logoDataUrl,"PNG",pageW-margin-22,3,22,22) } catch {} }
  setText(doc,[255,255,255])
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.text("CONSENTIMIENTO INFORMADO", margin, 13)
  doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.text(String(titulo||"Tratamiento estético"), margin, 19)
  setText(doc,COLORS.ink)
  let y = 34

  const parted = partirNombreApellidos(nombrePaciente)
  const dni=val(pacienteDni), email=val(pacienteEmail), tel=val(pacienteTelefono), fn=val(pacienteFechaNacimiento)
  const centro=val(datosCentro), nCol=val(numeroColegiado)
  const boxX=margin, boxW=maxW, boxY=y, boxH=36
  setFill(doc,COLORS.hairSoft); setStroke(doc,COLORS.hair); doc.setLineWidth(0.2)
  doc.roundedRect(boxX,boxY,boxW,boxH,2,2,"FD")
  setFill(doc,COLORS.brand); doc.roundedRect(boxX,boxY,50,5.5,1,1,"F")
  setText(doc,[255,255,255]); doc.setFont("helvetica","bold"); doc.setFontSize(7)
  doc.text("DATOS DEL PACIENTE", boxX+2.5, boxY+3.9)
  setText(doc,COLORS.ink)
  const padX=4, innerY=boxY+9
  const colW=(boxW-padX*2-6)/2, colLx=boxX+padX, colRx=boxX+padX+colW+6, labelW=30
  const drawField=(x,yy,label,value)=>{
    doc.setFont("helvetica","bold"); doc.setFontSize(7); setText(doc,COLORS.inkSoft)
    doc.text(label.toUpperCase(), x, yy)
    doc.setFont("helvetica","normal"); doc.setFontSize(9); setText(doc,COLORS.ink)
    const lines = doc.splitTextToSize(String(value), colW-labelW)
    doc.text(lines, x+labelW, yy)
  }
  drawField(colLx,innerY,"Nombre",parted.nombre)
  drawField(colRx,innerY,"Apellidos",parted.apellidos)
  drawField(colLx,innerY+6,"NIF / NIE",dni)
  drawField(colRx,innerY+6,"E-mail",email)
  drawField(colLx,innerY+12,"F. nacimiento",fn)
  drawField(colRx,innerY+12,"Teléfono",tel)
  drawField(colLx,innerY+18,"Centro",centro)
  drawField(colRx,innerY+18,"Nº colegiado",nCol)
  y = boxY+boxH+8

  const tituloTrat = String(titulo||"Tratamiento").trim().toUpperCase().slice(0,120)
  setText(doc,COLORS.brand); doc.setFont("helvetica","bold"); doc.setFontSize(12)
  doc.text(tituloTrat, pageW/2, y, { align:"center" })
  setStroke(doc,COLORS.brand); doc.setLineWidth(0.6)
  const tw = Math.min(maxW, doc.getTextWidth(tituloTrat)+14)
  doc.line(pageW/2-tw/2, y+2, pageW/2+tw/2, y+2)
  setText(doc,COLORS.ink); y += 8

  const lineH=4.2, sectionGapTop=2, sectionGapBot=1.5
  const drawFooter=(pn,total)=>{
    setStroke(doc,COLORS.hair); doc.setLineWidth(0.2)
    doc.line(margin,pageH-14,pageW-margin,pageH-14)
    setText(doc,COLORS.inkSoft); doc.setFont("helvetica","normal"); doc.setFontSize(7.5)
    doc.text(String(centro).slice(0,80), margin, pageH-9)
    doc.text(total?`Página ${pn} de ${total}`:`Página ${pn}`, pageW-margin, pageH-9, { align:"right" })
    doc.text("Consentimiento informado", pageW/2, pageH-9, { align:"center" })
    setText(doc,COLORS.ink)
  }
  const ensureSpace = need => {
    if (y+need > pageH-22) {
      drawFooter(doc.internal.getNumberOfPages())
      doc.addPage()
      setFill(doc,COLORS.brand); doc.rect(0,0,pageW,6,"F")
      setText(doc,COLORS.ink); y = 16
    }
  }

  for (const raw of String(cuerpoTexto||"").replace(/\r\n/g,"\n").split(/\n/)) {
    if (!raw.trim()) { y += lineH*0.6; continue }
    const sec = detectSection(raw)
    if (sec.type === "heading") {
      ensureSpace(lineH*2+sectionGapTop); y += sectionGapTop
      setText(doc,COLORS.brand); doc.setFont("helvetica","bold"); doc.setFontSize(10.5)
      for (const ln of doc.splitTextToSize(sec.label, maxW)) {
        ensureSpace(lineH+1); doc.text(ln, margin, y); y += lineH+1
      }
      setText(doc,COLORS.ink); y += sectionGapBot; continue
    }
    if (sec.type === "section") {
      ensureSpace(lineH*2+sectionGapTop); y += sectionGapTop
      doc.setFont("helvetica","bold"); doc.setFontSize(8)
      const labelText = sec.label
      const lblW = doc.getTextWidth(labelText)+4
      const isRiesgo = /RIESGO|EFECTO|CONTRAINDIC|ADVERT/i.test(labelText)
      setFill(doc,isRiesgo?[254,226,226]:COLORS.brandSoft)
      setStroke(doc,isRiesgo?[248,113,113]:COLORS.brand); doc.setLineWidth(0.2)
      doc.roundedRect(margin, y-3.4, lblW, 5, 1, 1, "FD")
      setText(doc,isRiesgo?COLORS.warn:COLORS.brand)
      doc.text(labelText, margin+2, y); setText(doc,COLORS.ink); y += 5.5
      doc.setFont("helvetica","normal"); doc.setFontSize(9)
      if (sec.rest) {
        for (const ln of doc.splitTextToSize(sec.rest, maxW)) {
          ensureSpace(lineH); doc.text(ln, margin, y); y += lineH
        }
      }
      y += sectionGapBot; continue
    }
    doc.setFont("helvetica","normal"); doc.setFontSize(9)
    for (const ln of doc.splitTextToSize(raw, maxW)) {
      ensureSpace(lineH); doc.text(ln, margin, y); y += lineH
    }
  }

  ensureSpace(46); y += 6
  setStroke(doc,COLORS.hair); doc.setLineWidth(0.3)
  doc.line(margin,y,pageW-margin,y); y += 6
  doc.setFont("helvetica","normal"); doc.setFontSize(9); setText(doc,COLORS.ink)
  doc.text(`En ${centro}, a ${fechaStr}`, margin, y); y += 8

  const wBox=(maxW-12)/3, gap=6, hBox=22
  const x1=margin, x2=margin+wBox+gap, x3=margin+2*(wBox+gap)
  setStroke(doc,COLORS.hair); setFill(doc,[252,252,253])
  doc.roundedRect(x1,y,wBox,hBox,1.5,1.5,"FD")
  doc.roundedRect(x2,y,wBox,hBox,1.5,1.5,"FD")
  doc.roundedRect(x3,y,wBox,hBox,1.5,1.5,"FD")

  setText(doc,COLORS.inkSoft); doc.setFont("helvetica","bold"); doc.setFontSize(7.5)
  doc.text("Fdo. Paciente", x1+wBox/2, y+hBox+4, { align:"center" })
  doc.text("Fdo. Madre / Padre / Tutor", x2+wBox/2, y+hBox+4, { align:"center" })
  doc.text("Fdo. Profesional sanitario", x3+wBox/2, y+hBox+4, { align:"center" })
  doc.setFont("helvetica","normal"); doc.setFontSize(7); setText(doc,COLORS.ink)
  doc.text(String(parted.nombre+" "+parted.apellidos).slice(0,38), x1+wBox/2, y+hBox+8, { align:"center" })
  if (nombreProfesional) {
    doc.text(String(nombreProfesional).slice(0,38), x3+wBox/2, y+hBox+8, { align:"center" })
    if (nCol && nCol!=="—") doc.text(`Nº col. ${nCol}`, x3+wBox/2, y+hBox+11, { align:"center" })
  }

  const total = doc.internal.getNumberOfPages()
  for (let i=1;i<=total;i++) { doc.setPage(i); drawFooter(i,total) }
  return doc.output("dataurlstring")
}

/* ===== DATOS DE EJEMPLO ===== */
const logoBuf = fs.readFileSync("public/consentimiento-logo-bs.png")
const logoDataUrl = "data:image/png;base64," + logoBuf.toString("base64")

const cuerpo = `MASOTERAPIA

TECNICA: La masoterapia consiste en la aplicación manual y/o instrumental de maniobras de masaje terapéutico sobre los tejidos blandos (piel, fascia, músculo) con fines de relajación, drenaje, descontracturante, circulatorio o de recuperación funcional. El profesional valorará la zona a tratar y combinará técnicas (effleurage, amasamiento, fricción, percusión, drenaje linfático manual o presoterapia complementaria) según el objetivo del tratamiento. La sesión puede incluir el uso de aceites, cremas conductoras, calor local o frío localizado.

OBJETIVOS: Reducir tensión muscular, mejorar la circulación sanguínea y linfática, aliviar contracturas y dolor miofascial, favorecer la relajación general, mejorar la movilidad articular y complementar protocolos estéticos corporales (reductores, anticelulíticos, posquirúrgicos no recientes).

RIESGOS: Aunque la masoterapia es una técnica segura, pueden aparecer molestias leves y transitorias: enrojecimiento de la piel, sensibilidad o dolor muscular en las 24-48 h posteriores, hematomas puntuales en pieles delicadas, sensación de cansancio o ligera somnolencia tras la sesión y, excepcionalmente, reacción cutánea al producto cosmético utilizado. Es importante informar al profesional sobre alergias, lesiones recientes o cualquier patología antes de comenzar.

CONTRAINDICACIONES: No se realizará la sesión, total o parcialmente, en caso de fiebre o procesos infecciosos activos, trombosis venosa profunda o sospecha de la misma, flebitis, heridas abiertas, quemaduras recientes, dermatitis o infecciones cutáneas en la zona, fracturas no consolidadas, tumores no diagnosticados en la zona a tratar, primer trimestre de embarazo (salvo indicación expresa), alteraciones graves de la coagulación o tratamiento anticoagulante sin valoración médica previa.

CUIDADOS POSTERIORES: Se recomienda hidratarse abundantemente tras la sesión, evitar comidas copiosas en la hora siguiente, no realizar ejercicio físico intenso el mismo día, evitar exposición directa al sol o fuentes de calor intenso (sauna, jacuzzi muy caliente) durante las 6 h posteriores y comunicar al centro cualquier reacción inusual.

DECLARACIÓN: He leído y comprendido la información facilitada sobre la técnica de masoterapia, sus objetivos, riesgos, contraindicaciones y cuidados. He podido formular todas las preguntas que he considerado oportunas y han sido respondidas satisfactoriamente. Declaro haber informado verazmente sobre mi estado de salud, alergias y tratamientos en curso.

Por todo ello, autorizo a Dr./Dra. Lucía Martín Bauzá (Nº col. 28-CFP-04812) y al equipo del centro a realizar el tratamiento de masoterapia descrito, entendiendo que podré revocar este consentimiento en cualquier momento antes o durante la sesión sin que ello suponga perjuicio alguno en mi atención.

DATOS DEL ACTO (autocompletados al firmar)
Paciente: María Fernanda Rivas Soler
DNI/NIE: 47.812.339-K · E-mail: mf.rivas@correo.es · Tel.: +34 612 884 217
Fecha de nacimiento: 14 de julio de 1989
Centro: Bettystetik — Centro de estética avanzada
Tratamiento: Masoterapia descontracturante (60 min)
Fecha: ${new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}`

const dataUrl = await buildPDF({
  titulo: "Masoterapia descontracturante",
  cuerpoTexto: cuerpo,
  nombrePaciente: "María Fernanda Rivas Soler",
  pacienteDni: "47.812.339-K",
  pacienteEmail: "mf.rivas@correo.es",
  pacienteTelefono: "+34 612 884 217",
  pacienteFechaNacimiento: "14 de julio de 1989",
  datosCentro: "Bettystetik — Centro de estética avanzada",
  numeroColegiado: "28-CFP-04812",
  nombreProfesional: "Lucía Martín Bauzá",
  fechaStr: new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"}),
  logoDataUrl,
})

const b64 = dataUrl.split(",")[1]
const out = "/sessions/determined-wonderful-mccarthy/mnt/clinica-erp/consentimiento-masoterapia-MUESTRA.pdf"
fs.writeFileSync(out, Buffer.from(b64,"base64"))
console.log("OK", out, fs.statSync(out).size, "bytes")
