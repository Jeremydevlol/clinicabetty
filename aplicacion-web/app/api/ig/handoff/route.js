import { getConversation, setHandoffTelefono, sendIgMessage } from '../../../../lib/ig/igService.js'
import { sendText as sendWaText } from '../../../../lib/wa/baileysService.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Handoff manual: el operador pasa un IG→WA dando el teléfono. */
export async function POST(req) {
  try {
    const { igUserId, telefono, mensajeIg, mensajeWa } = await req.json()
    if (!igUserId || !telefono) return Response.json({ error: 'Faltan igUserId/telefono' }, { status: 400 })
    setHandoffTelefono(igUserId, telefono)
    const conv = getConversation(igUserId)
    const historialTxt = (conv?.mensajes || [])
      .slice(-6)
      .map(m => `${m.autor === 'clinica' ? 'Clínica' : 'Paciente'}: ${m.texto}`)
      .join('\n')

    const textoIg = mensajeIg || `Te escribimos ahora por WhatsApp al ${telefono} para continuar ahí.`
    try {
      await sendIgMessage(igUserId, textoIg)
    } catch {
      /* continuar */
    }

    const textoWa =
      mensajeWa ||
      `Hola ${conv?.nombre || ''}, soy de la clínica, seguimos por acá el chat de Instagram.\n\nResumen del chat:\n${historialTxt || '(sin historial previo)'}\n\n¿En qué te ayudamos?`
    try {
      await sendWaText(telefono, textoWa)
    } catch (e) {
      return Response.json({ ok: true, warning: 'WhatsApp no conectado: ' + e.message })
    }
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
