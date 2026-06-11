import { getChats, getMessages, markChatRead } from "../../../../lib/wa/baileysService.js"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req) {
  const url = new URL(req.url)
  const jid = url.searchParams.get("jid")
  if (jid) {
    markChatRead(jid)
    return Response.json({ jid, messages: getMessages(jid) })
  }
  return Response.json({ chats: getChats() })
}
