-- Backfill de ingresos faltantes para turnos ya finalizados.
-- Objetivo: que los turnos con estado = 'finalizado' tengan su reflejo en:
--   1) public.tpv_movimientos
--   2) public.clinic_movimientos
-- Es idempotente: no duplica gracias a comprobante/concepto específicos por turno.

with turnos_candidatos as (
  select
    t.id as turno_id,
    t.clinic_id,
    t.fecha,
    t.cliente,
    t.servicio,
    coalesce(
      ac.monto_total,
      s_id.precio,
      s_nom.precio,
      0
    )::numeric(12,2) as monto_total
  from public.turnos t
  left join public.alertas_cobro ac
    on ac.turno_id = t.id
   and ac.estado = 'cobrado'
  left join public.servicios s_id
    on s_id.id = t.servicio_facturado_id
  left join public.servicios s_nom
    on lower(trim(s_nom.nombre)) = lower(trim(t.servicio))
  where t.estado = 'finalizado'
),
turnos_validos as (
  select *
  from turnos_candidatos
  where monto_total > 0
)
insert into public.tpv_movimientos (fecha, clinic_id, metodo, monto, concepto, comprobante)
select
  tv.fecha,
  tv.clinic_id,
  'efectivo'::text,
  tv.monto_total,
  format('Backfill cobro turno #%s — %s', tv.turno_id, tv.cliente),
  format('BACKFILL-TURNO-%s', tv.turno_id)
from turnos_validos tv
where not exists (
  select 1
  from public.tpv_movimientos tm
  where tm.comprobante = format('BACKFILL-TURNO-%s', tv.turno_id)
);

with turnos_candidatos as (
  select
    t.id as turno_id,
    t.clinic_id,
    t.fecha,
    t.cliente,
    t.servicio,
    coalesce(
      ac.monto_total,
      s_id.precio,
      s_nom.precio,
      0
    )::numeric(12,2) as monto_total
  from public.turnos t
  left join public.alertas_cobro ac
    on ac.turno_id = t.id
   and ac.estado = 'cobrado'
  left join public.servicios s_id
    on s_id.id = t.servicio_facturado_id
  left join public.servicios s_nom
    on lower(trim(s_nom.nombre)) = lower(trim(t.servicio))
  where t.estado = 'finalizado'
),
turnos_validos as (
  select *
  from turnos_candidatos
  where monto_total > 0
)
insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
select
  tv.clinic_id,
  'ingreso'::text,
  tv.fecha,
  format('Backfill cobro turno #%s — %s', tv.turno_id, tv.cliente),
  'servicios'::text,
  tv.monto_total
from turnos_validos tv
where not exists (
  select 1
  from public.clinic_movimientos cm
  where cm.concepto = format('Backfill cobro turno #%s — %s', tv.turno_id, tv.cliente)
    and cm.clinic_id = tv.clinic_id
    and cm.fecha = tv.fecha
);
