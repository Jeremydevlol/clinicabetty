import fs from "node:fs"
import { buildConsentimientoPdfDataUrl } from "./src/consentimientos/consentimientoPdf.js"
import { armarCuerpoConsentimiento } from "./src/consentimientos/rellenarPlantilla.js"
import { getPlantillasConsentLocales } from "./src/consentimientos/plantillasLocales.js"

// Polyfill mínimo de fetch que NO se usa porque pasamos logoDataUrl explícito
globalThis.fetch = globalThis.fetch || (() => Promise.reject(new Error("no fetch")))

const logoBuf = fs.readFileSync("public/consentimiento-logo-bs.png")
const logoDataUrl = "data:image/png;base64," + logoBuf.toString("base64")

const all = getPlantillasConsentLocales()
const pl = all.find(p => p.slug === "corposhape")
if (!pl) { console.error("no plantilla"); process.exit(1) }

const paciente = {
  nombre: "Carolina Pérez Mendoza",
  dni: "Y-3187420-N",
  email: "c.perez.mendoza@correo.es",
  tel: "+34 658 412 903",
  fechaNacimiento: "1992-03-21",
}

const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })

const cuerpo = armarCuerpoConsentimiento(pl.cuerpo_texto, paciente, {
  servicioOProducto: "CorpoShape — sesión de remodelación corporal",
  fechaStr,
  centroNombre: "Clínica Aesthetic Goya",
})

const dataUrl = await buildConsentimientoPdfDataUrl({
  titulo: "CorpoShape",
  cuerpoTexto: cuerpo,
  firmaPacienteDataUrl: null,
  firmaProfesionalDataUrl: null,
  nombrePaciente: paciente.nombre,
  pacienteDni: paciente.dni,
  pacienteEmail: paciente.email,
  pacienteTelefono: paciente.tel,
  pacienteFechaNacimiento: "21 de marzo de 1992",
  datosCentro: "Clínica Aesthetic Goya",
  numeroColegiado: "28-EC-19447",
  nombreProfesional: "Dra. Elena Vidal Ortega",
  fechaStr,
  logoDataUrl,
})

const out = "/sessions/determined-wonderful-mccarthy/mnt/clinica-erp/consentimiento-corposhape-MUESTRA.pdf"
fs.writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"))
console.log("OK", out, fs.statSync(out).size, "bytes")
