import { loadConfig, saveConfig } from '../../../../lib/agent/agentCore.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ config: loadConfig() })
}

export async function POST(req) {
  try {
    const patch = await req.json()
    const next = saveConfig(patch || {})
    return Response.json({ ok: true, config: next })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
