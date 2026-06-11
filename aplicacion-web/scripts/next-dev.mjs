/**
 * Next dev con .env cargado antes del proceso (para VITE_DEV_HTTPS → --experimental-https).
 * Mic/cámara en móvil por IP de red requieren HTTPS (contexto seguro).
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, "utf8")
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) continue
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

loadEnvFile(resolve(root, ".env"))
loadEnvFile(resolve(root, ".env.local"))

const args = ["dev", "-p", process.env.PORT || "3000", "-H", "0.0.0.0"]
const httpsOn = String(process.env.VITE_DEV_HTTPS || "").toLowerCase() === "true"
if (httpsOn) {
  args.push("--experimental-https")
  console.log(
    "[dev] HTTPS activo (VITE_DEV_HTTPS=true). En el móvil abrí la URL «Network» con https:// y aceptá el certificado.",
  )
}

const nextBin = resolve(root, "node_modules", ".bin", "next")
const child = spawn(nextBin, args, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, WATCHPACK_POLLING: "true" },
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
