import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

const { loadEnvConfig } = nextEnv

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectDir = __dirname

// Cargar .env / .env.local ANTES de leer VITE_* (Next no pone VITE_ en el cliente; las usamos al mapear a NEXT_PUBLIC_* y DefinePlugin)
loadEnvConfig(projectDir)

const srcRoot = path.resolve(__dirname, "src")

/** En disco externo (/Volumes) el .next local acelera mucho el arranque y el HMR. */
const isDev = process.env.NODE_ENV !== "production"
const onExternalVolume = projectDir.startsWith("/Volumes/")
const useLocalNextCache =
  isDev && onExternalVolume && process.env.NEXT_LOCAL_CACHE !== "0"
const localNextDir = path.join(os.homedir(), "Library", "Caches", "clinica-erp-next", ".next")

/** Misma semántica que Vite: `import.meta.env` en el bundle del cliente. */
function viteImportMetaEnv() {
  return {
    MODE: process.env.NODE_ENV || "development",
    DEV: process.env.NODE_ENV === "development",
    PROD: process.env.NODE_ENV === "production",
    SSR: false,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
      process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    VITE_DEV_HTTPS: process.env.VITE_DEV_HTTPS || "",
    VITE_PUBLIC_APP_URL: process.env.VITE_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "",
  }
}

const publicSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
const publicAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  ""

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(useLocalNextCache ? { distDir: localNextDir } : {}),
  reactStrictMode: true,
  /** Inyecta en cliente y server (Next reemplaza process.env.NEXT_PUBLIC_* en el bundle). */
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicAnonKey,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicAnonKey,
  },
  webpack: (config, { dev, webpack: webpackCompiler }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": srcRoot,
    }
    if (dev && (useLocalNextCache || process.env.WATCHPACK_POLLING === "true")) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.git/**"],
      }
    }
    config.plugins.push(
      new webpackCompiler.DefinePlugin({
        "import.meta.env": JSON.stringify(viteImportMetaEnv()),
      })
    )
    return config
  },
  async rewrites() {
    const back = process.env.NEXT_API_PROXY
    if (!back || back === "0") return []
    // No reenviar /api/wa: Baileys corre en el mismo proceso Next.
    const b = back.replace(/\/$/, "")
    return [
      { source: "/api/erp-state", destination: `${b}/api/erp-state` },
      { source: "/api/erp/:path*", destination: `${b}/api/erp/:path*` },
      { source: "/api/openai/:path*", destination: `${b}/api/openai/:path*` },
      { source: "/api/ocr", destination: `${b}/api/ocr` },
      { source: "/api/face-analysis/:path*", destination: `${b}/api/face-analysis/:path*` },
      { source: "/api/treatment-preview", destination: `${b}/api/treatment-preview` },
      { source: "/api/admin/:path*", destination: `${b}/api/admin/:path*` },
    ]
  },
}

export default nextConfig
