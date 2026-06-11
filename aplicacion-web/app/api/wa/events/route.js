import { subscribe, getStatus, getChats } from "../../../../lib/wa/baileysService.js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const encoder = new TextEncoder()
  let close = () => {}
  const stream = new ReadableStream({
    start(controller) {
      const send = (evt, data) => {
        try {
          controller.enqueue(encoder.encode(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          /* ignore */
        }
      }
      send("status", getStatus())
      send("chats", { chats: getChats() })

      const off = subscribe((evt, payload) => send(evt, payload))
      const hb = setInterval(() => send("ping", { t: Date.now() }), 20000)
      close = () => {
        off()
        clearInterval(hb)
        try {
          controller.close()
        } catch {
          /* ignore */
        }
      }
    },
    cancel() {
      close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
