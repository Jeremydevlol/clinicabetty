import { sendText } from "../../../../lib/wa/baileysService.js"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req) {
  try {
    const body = await req.json()
    const { to, texto, jid } = body || {}
    const dest = jid || to
    if (!dest) return Response.json({ error: "Falta destino (to/jid)" }, { status: 400 })
    if (!texto) return Response.json({ error: "Falta texto" }, { status: 400 })
    const res = await sendText(dest, texto)
    return Response.json({ ok: true, id: res?.key?.id })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
