import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Reserva pública vía agente: pendiente de integración con agenda ERP. */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'La reserva automática desde el agente no está conectada a la agenda en este despliegue. Usá el chat para recoger datos o agendá desde el panel.',
    },
    { status: 501 }
  )
}
