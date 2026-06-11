import { init, getStatus } from "../../../../lib/wa/baileysService.js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  try {
    await init()
    return Response.json(getStatus())
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  return Response.json(getStatus())
}
