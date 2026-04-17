-- Fix: el backfill previo no insertaba históricos porque el trigger
-- ignoraba updates donde OLD.estado ya era 'finalizado'.
-- Esta migración:
-- 1) mantiene automatización para nuevos finalizados (solo transición a finalizado)
-- 2) ejecuta backfill explícito e idempotente para turnos ya finalizados.

create or replace function public.sync_ingresos_turno_finalizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monto numeric(12,2);
  v_concepto text;
  v_comprobante text;
begin
  if new.estado is distinct from 'finalizado' then
    return new;
  end if;

  -- Solo procesa cuando entra por primera vez a finalizado.
  if tg_op = 'UPDATE' and coalesce(old.estado, '') = 'finalizado' then
    return new;
  end if;

  v_monto := coalesce(
    (
      select ac.monto_total
      from public.alertas_cobro ac
      where ac.turno_id = new.id
      order by ac.id desc
      limit 1
    ),
    (
      select s.precio
      from public.servicios s
      where s.id = new.servicio_facturado_id
      limit 1
    ),
    (
      select s.precio
      from public.servicios s
      where lower(trim(s.nombre)) = lower(trim(new.servicio))
      limit 1
    ),
    0
  )::numeric(12,2);

  if v_monto <= 0 then
    return new;
  end if;

  v_concepto := format('Auto cobro turno #%s — %s', new.id, coalesce(new.cliente, 'Paciente'));
  v_comprobante := format('AUTO-TURNO-%s', new.id);

  insert into public.tpv_movimientos (fecha, clinic_id, metodo, monto, concepto, comprobante)
  select new.fecha, new.clinic_id, 'efectivo', v_monto, v_concepto, v_comprobante
  where not exists (
    select 1 from public.tpv_movimientos tm where tm.comprobante = v_comprobante
  );

  insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
  select new.clinic_id, 'ingreso', new.fecha, v_concepto, 'servicios', v_monto
  where not exists (
    select 1
    from public.clinic_movimientos cm
    where cm.clinic_id = new.clinic_id
      and cm.fecha = new.fecha
      and cm.concepto = v_concepto
  );

  return new;
end;
$$;

drop trigger if exists trg_sync_ingresos_turno_finalizado on public.turnos;
create trigger trg_sync_ingresos_turno_finalizado
after insert or update of estado on public.turnos
for each row
execute function public.sync_ingresos_turno_finalizado();

-- Backfill explícito e idempotente (sin depender del trigger)
with turnos_finalizados as (
  select
    t.id as turno_id,
    t.clinic_id,
    t.fecha,
    coalesce(t.cliente, 'Paciente') as cliente,
    coalesce(
      (
        select ac.monto_total
        from public.alertas_cobro ac
        where ac.turno_id = t.id
        order by ac.id desc
        limit 1
      ),
      (
        select s.precio
        from public.servicios s
        where s.id = t.servicio_facturado_id
        limit 1
      ),
      (
        select s.precio
        from public.servicios s
        where lower(trim(s.nombre)) = lower(trim(t.servicio))
        limit 1
      ),
      0
    )::numeric(12,2) as monto
  from public.turnos t
  where t.estado = 'finalizado'
),
rows_ok as (
  select * from turnos_finalizados where monto > 0
)
insert into public.tpv_movimientos (fecha, clinic_id, metodo, monto, concepto, comprobante)
select
  r.fecha,
  r.clinic_id,
  'efectivo',
  r.monto,
  format('Auto cobro turno #%s — %s', r.turno_id, r.cliente),
  format('AUTO-TURNO-%s', r.turno_id)
from rows_ok r
where not exists (
  select 1
  from public.tpv_movimientos tm
  where tm.comprobante = format('AUTO-TURNO-%s', r.turno_id)
);

with turnos_finalizados as (
  select
    t.id as turno_id,
    t.clinic_id,
    t.fecha,
    coalesce(t.cliente, 'Paciente') as cliente,
    coalesce(
      (
        select ac.monto_total
        from public.alertas_cobro ac
        where ac.turno_id = t.id
        order by ac.id desc
        limit 1
      ),
      (
        select s.precio
        from public.servicios s
        where s.id = t.servicio_facturado_id
        limit 1
      ),
      (
        select s.precio
        from public.servicios s
        where lower(trim(s.nombre)) = lower(trim(t.servicio))
        limit 1
      ),
      0
    )::numeric(12,2) as monto
  from public.turnos t
  where t.estado = 'finalizado'
),
rows_ok as (
  select * from turnos_finalizados where monto > 0
)
insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
select
  r.clinic_id,
  'ingreso',
  r.fecha,
  format('Auto cobro turno #%s — %s', r.turno_id, r.cliente),
  'servicios',
  r.monto
from rows_ok r
where not exists (
  select 1
  from public.clinic_movimientos cm
  where cm.clinic_id = r.clinic_id
    and cm.fecha = r.fecha
    and cm.concepto = format('Auto cobro turno #%s — %s', r.turno_id, r.cliente)
);
