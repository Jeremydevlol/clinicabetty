/** Sustituye placeholders en plantillas de consentimiento. */
export function rellenarPlantilla(cuerpo, vars) {
  let s = String(cuerpo || "")
  const {
    pacienteNombre = "—",
    servicioOProducto = "—",
    fecha = "—",
    centro = "—",
    pacienteDni = "—",
    pacienteEmail = "—",
    pacienteTelefono = "—",
    pacienteFechaNacimiento = "—",
  } = vars || {}
  s = s.replace(/\{\{paciente_nombre\}\}/g, pacienteNombre)
  s = s.replace(/\{\{servicio_o_producto\}\}/g, servicioOProducto)
  s = s.replace(/\{\{fecha\}\}/g, fecha)
  s = s.replace(/\{\{centro\}\}/g, centro)
  s = s.replace(/\{\{paciente_dni\}\}/g, pacienteDni)
  s = s.replace(/\{\{paciente_email\}\}/g, pacienteEmail)
  s = s.replace(/\{\{paciente_telefono\}\}/g, pacienteTelefono)
  s = s.replace(/\{\{paciente_fecha_nacimiento\}\}/g, pacienteFechaNacimiento)
  return s
}

function fmtFechaNacimientoLegible(fn) {
  if (!fn || !String(fn).trim()) return "—"
  const raw = String(fn).trim()
  try {
    const d = raw.length >= 10 ? new Date(raw.slice(0, 10) + "T12:00:00") : new Date(raw)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })
  } catch {
    return "—"
  }
}

/**
 * Tras rellenar placeholders, inserta DNI, email, teléfono y fecha de nacimiento
 * debajo de la línea "Paciente: …" del bloque estándar "Datos del acto".
 */
export function enriquecerBloqueDatosDelActo(textoRellenado, paciente) {
  const t = String(textoRellenado || "").replace(/\r\n/g, "\n")
  const nombre = String(paciente?.nombre || "").trim() || "—"
  const dni = String(paciente?.dni || "").trim() || "—"
  const email = String(paciente?.email || "").trim() || "—"
  const tel = String(paciente?.tel || "").trim() || "—"
  const fn = fmtFechaNacimientoLegible(paciente?.fechaNacimiento)
  const extra = `DNI/NIE: ${dni} · E-mail: ${email} · Tel.: ${tel}
Fecha de nacimiento: ${fn}
`
  const re = /^(Datos del acto[^\n]*\nPaciente:[^\n]+\n)/m
  if (re.test(t)) {
    return t.replace(re, m => m + extra)
  }
  if (!/Datos del acto/i.test(t)) {
    const cab = `Datos del acto (autocompletados al firmar)
Paciente: ${nombre}
${extra}`
    return `${cab}\n\n${t}`
  }
  return t
}

/** Primera palabra → nombre; resto → apellidos (layout PDF tipo consentimiento clínico). */
export function partirNombreApellidos(nombreCompleto) {
  const s = String(nombreCompleto || "").trim()
  if (!s) return { nombre: "—", apellidos: "—" }
  const parts = s.split(/\s+/)
  if (parts.length === 1) return { nombre: parts[0], apellidos: "—" }
  return { nombre: parts[0], apellidos: parts.slice(1).join(" ") }
}

/** Vars para rellenarPlantilla desde un objeto paciente del ERP. */
export function varsDesdePaciente(paciente, { servicioOProducto, fecha, centro }) {
  const p = paciente || {}
  return {
    pacienteNombre: String(p.nombre || "").trim() || "—",
    servicioOProducto: servicioOProducto || "—",
    fecha: fecha || "—",
    centro: centro || "—",
    pacienteDni: String(p.dni || "").trim() || "—",
    pacienteEmail: String(p.email || "").trim() || "—",
    pacienteTelefono: String(p.tel || "").trim() || "—",
    pacienteFechaNacimiento: fmtFechaNacimientoLegible(p.fechaNacimiento),
  }
}

/** Texto completo para pantalla, PDF y guardado (mismos datos que verá la paciente). */
export function armarCuerpoConsentimiento(cuerpoPlantilla, paciente, { servicioOProducto, fechaStr, centroNombre }) {
  const vars = varsDesdePaciente(paciente, {
    servicioOProducto,
    fecha: fechaStr,
    centro: centroNombre,
  })
  const base = rellenarPlantilla(cuerpoPlantilla, vars)
  return enriquecerBloqueDatosDelActo(base, paciente)
}

export function textoAHtmlParrafos(texto) {
  const esc = String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return esc.split("\n").map(line => `<p style="margin:0 0 8px">${line || " "}</p>`).join("")
}
