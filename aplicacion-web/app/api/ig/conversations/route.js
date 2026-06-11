import { getConversations, setAgenteActivo } from '../../../../lib/ig/igService.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ conversations: getConversations() })
}

export async function POST(req) {
  try {
    const { igUserId, agenteActivo } = await req.json()
    if (!igUserId) return Response.json({ error: 'Falta igUserId' }, { status: 400 })
    setAgenteActivo(igUserId, !!agenteActivo)
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
