"use client"

import App from "@/App.jsx"

/** Misma SPA en /, /dashboard, /agenda, etc. (antes Vite; App.jsx usa window.location). */
export default function SpaPage() {
  return <App />
}
