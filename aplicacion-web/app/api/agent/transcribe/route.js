import { transcribe } from '../../../../lib/agent/agentCore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!file) return Response.json({ error: 'Falta file' }, { status: 400 })
    const ab = await file.arrayBuffer()
    const buf = Buffer.from(ab)
    const texto = await transcribe({
      fileBuffer: buf,
      filename: file.name || 'audio.ogg',
      mime: file.type || 'audio/ogg',
    })
    return Response.json({ ok: true, texto })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
