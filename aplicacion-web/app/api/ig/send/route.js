import { sendIgMessage } from '../../../../lib/ig/igService.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const { igUserId, texto } = await req.json()
    if (!igUserId || !texto) return Response.json({ error: 'Faltan igUserId/texto' }, { status: 400 })
    const r = await sendIgMessage(igUserId, texto)
    return Response.json({ ok: true, result: r })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
