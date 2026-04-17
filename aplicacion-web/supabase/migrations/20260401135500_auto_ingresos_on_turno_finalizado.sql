-- Automatización completa:
-- Cuando un turno pasa a estado "finalizado", se crean automáticamente
-- los ingresos en TPV y contabilidad clínica (sin depender del frontend).
-- Incluye backfill idempotente de históricos.

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

  if tg_op = 'UPDATE' and old.estado = 'finalizado' then
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

-- Backfill inmediato de turnos ya finalizados (idempotente)
update public.turnos
set estado = estado
where estado = 'finalizado';
