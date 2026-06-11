import { getStatus } from "../../../../lib/wa/baileysService.js"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET() {
  return Response.json(getStatus())
}
