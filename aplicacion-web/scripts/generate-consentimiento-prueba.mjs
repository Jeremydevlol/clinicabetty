#!/usr/bin/env node
/**
 * Genera PDF de prueba desde fixtures (misma lógica que la app).
 * Slugs: acido-hialuronico (default), mesoterapia, …
 * Alinear textos con 20260402220000_consent_plantillas_wetransfer.sql
 *
 * Uso (desde aplicacion-web):
 *   npm run consent:prueba
 *   npm run consent:mesoterapia
 *   node scripts/generate-consentimiento-prueba.mjs mesoterapia
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { buildConsentimientoPdfDataUrl } from "../src/consentimientos/consentimientoPdf.js"
import { rellenarPlantilla, varsDesdePaciente, cuerpoConsentimientoParaPdf } from "../src/consentimientos/rellenarPlantilla.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const outDir = path.join(__dirname, "generated")
const logoPath = path.join(root, "public", "consentimiento-logo-bs.png")

const PRESETS = {
  "acido-hialuronico": {
    fixture: "acido-hialuronico-cuerpo-texto.txt",
    titulo: "ACIDO HIALURONICO",
    out: "consentimiento-prueba.pdf",
    servicioDemo: "Relleno labial y surco nasogeniano — protocolo demostración PDF",
  },
  mesoterapia: {
    fixture: "mesoterapia-cuerpo-texto.txt",
    titulo: "MESOTERAPIA",
    out: "consentimiento-mesoterapia.pdf",
    servicioDemo: "Mesoterapia facial — protocolo demostración PDF",
  },
  "hidroxiapatita-calcica": {
    fixture: "hidroxiapatita-calcica-cuerpo-texto.txt",
    titulo: "HIDROXIAPATITA CALCICA",
    out: "consentimiento-hidroxiapatita-calcica.pdf",
    servicioDemo: "Relleno con hidroxiapatita cálcica — demostración PDF",
  },
}

const logoDataUrl = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`
  : null

/** PNG 1×1 transparente (marcador de firma en PDF de prueba). */
const firmaPngPrueba =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

async function main() {
  const slug = (process.argv[2] || "acido-hialuronico").trim().toLowerCase()
  const preset = PRESETS[slug]
  if (!preset) {
    console.error(`Slug desconocido: ${slug}. Válidos: ${Object.keys(PRESETS).join(", ")}`)
    process.exit(1)
  }
  const fixturePath = path.join(__dirname, "fixtures", preset.fixture)
  if (!fs.existsSync(fixturePath)) {
    console.error(`No se encuentra la plantilla: ${fixturePath}`)
    process.exit(1)
  }
  const plantillaRaw = fs.readFileSync(fixturePath, "utf8")

  const fechaStr = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })

  const pacienteFake = {
    nombre: "María Prueba Test",
    dni: "12345678Z",
    email: "paciente.prueba@example.com",
    tel: "600 000 000",
    fechaNacimiento: "1990-01-15",
  }

  const vars = varsDesdePaciente(pacienteFake, {
    servicioOProducto: preset.servicioDemo,
    fecha: fechaStr,
    centro: "Clínica Demo ERP · Calle Ficticia 1, 28001 Madrid",
  })

  const cuerpoPdf = cuerpoConsentimientoParaPdf(rellenarPlantilla(plantillaRaw, vars))

  const dataUrl = await buildConsentimientoPdfDataUrl({
    titulo: preset.titulo,
    cuerpoTexto: cuerpoPdf,
    firmaPacienteDataUrl: firmaPngPrueba,
    firmaProfesionalDataUrl: firmaPngPrueba,
    nombrePaciente: pacienteFake.nombre,
    pacienteDni: pacienteFake.dni,
    pacienteEmail: pacienteFake.email,
    pacienteTelefono: pacienteFake.tel,
    pacienteFechaNacimiento: vars.pacienteFechaNacimiento,
    datosCentro: "Clínica Demo ERP · Calle Ficticia 1, 28001 Madrid",
    numeroColegiado: "CO-12345",
    nombreProfesional: "Dra. Ejemplo Médico",
    fechaStr,
    logoUrl: null,
    logoDataUrl,
  })

  const base64 = String(dataUrl).split(",")[1]
  if (!base64) {
    console.error("No se pudo obtener base64 del PDF.")
    process.exit(1)
  }
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, preset.out)
  fs.writeFileSync(outFile, Buffer.from(base64, "base64"))
  console.log(`OK → ${outFile}`)
  console.log(`Plantilla: ${slug} (${preset.titulo})`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
