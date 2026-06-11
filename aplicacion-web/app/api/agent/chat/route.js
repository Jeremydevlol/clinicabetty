import { agentReply, loadConfig } from '../../../../lib/agent/agentCore.js'
import { buildReceptionContext } from '../../../../lib/agent/receptionContext.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const body = await req.json()
    const { historial = [], textoUsuario = '', imagenes = [], extra = '', clinicId = 1 } = body
    const cfg = loadConfig()
    const receptionContext = buildReceptionContext({ clinicId: +clinicId || 1 })
    const mergedExtra = [
      extra ? String(extra) : '',
      'Contexto operativo (sin agenda en vivo en este despliegue):',
      JSON.stringify(receptionContext),
    ]
      .filter(Boolean)
      .join('\n\n')
    const r = await agentReply({ cfg, historial, textoUsuario, imagenes, extra: mergedExtra })

    return Response.json({
      ok: true,
      texto: r.texto,
      meta: r.meta,
      modeloUsado: r.modeloUsado,
      turnoCreado: null,
      bookingError: null,
      readyToBook: false,
      confirmacion: null,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
