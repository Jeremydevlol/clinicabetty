/**
 * Contexto para el agente (agenda / sectores). Sin `lib/erp/store` en este
 * despliegue: datos mínimos + reglas para no inventar huecos hasta integrar agenda.
 */

const DEFAULT_TREATMENTS = {
  odontologia: ['Limpieza dental', 'Blanqueamiento dental', 'Consulta odontológica', 'Ortodoncia'],
  estetica: ['Limpieza facial', 'Valoración estética', 'Toxina botulínica', 'Relleno con ácido hialurónico'],
  masajes: ['Masaje relajante', 'Masaje descontracturante', 'Masaje deportivo'],
  medicina: ['Consulta médica general', 'Control clínico'],
}

export function buildReceptionContext({ clinicId = 1 } = {}) {
  return {
    clinicId: Number(clinicId) || 1,
    sectoresActivos: ['odontologia', 'estetica', 'masajes', 'medicina'],
    disponibilidades: [],
    agendaOcupada: [],
    tratamientosPorSector: DEFAULT_TREATMENTS,
    reglas: [
      'La agenda en vivo aún no está conectada en este servidor: no ofrezcas fechas/horas concretas como confirmadas.',
      'Recoge nombre y teléfono y ofrece que recepción confirme el hueco.',
      'Usa solo tratamientos coherentes con el sector.',
    ],
  }
}
