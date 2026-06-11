-- Alinear trigger de ingresos con el split servicio/insumos del frontend (evita doble contabilidad)

create or replace function public.sync_ingresos_turno_finalizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monto_total numeric(12,2);
  v_monto_servicio numeric(12,2);
  v_monto_insumos numeric(12,2);
  v_concepto_base text;
  v_concepto_srv text;
  v_concepto_ins text;
  v_comprobante text;
  v_metodo text;
begin
  if new.estado is distinct from 'finalizado' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.estado, '') = 'finalizado' then
    return new;
  end if;

  select
    coalesce(ac.monto_total, 0),
    coalesce(ac.monto_servicio, ac.monto_total, 0),
    coalesce(ac.monto_insumos, 0)
  into v_monto_total, v_monto_servicio, v_monto_insumos
  from public.alertas_cobro ac
  where ac.turno_id = new.id
  order by ac.id desc
  limit 1;

  if coalesce(v_monto_total, 0) <= 0 then
    v_monto_total := coalesce(
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
    v_monto_servicio := v_monto_total;
    v_monto_insumos := 0;
  end if;

  if coalesce(v_monto_total, 0) <= 0 then
    return new;
  end if;

  v_metodo := coalesce(nullif(trim(new.metodo_pago), ''), 'efectivo');
  v_concepto_base := format('Cobro turno #%s — %s', new.id, coalesce(new.cliente, 'Paciente'));
  v_concepto_srv := v_concepto_base || ' — servicio';
  v_concepto_ins := v_concepto_base || ' — insumos';
  v_comprobante := format('AUTO-TURNO-%s', new.id);

  insert into public.tpv_movimientos (fecha, clinic_id, metodo, monto, concepto, comprobante)
  select new.fecha, new.clinic_id, v_metodo, v_monto_total, v_concepto_base, v_comprobante
  where not exists (
    select 1 from public.tpv_movimientos tm where tm.comprobante = v_comprobante
  );

  if coalesce(v_monto_servicio, 0) > 0 then
    insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
    select new.clinic_id, 'ingreso', new.fecha, v_concepto_srv, 'servicios', v_monto_servicio
    where not exists (
      select 1
      from public.clinic_movimientos cm
      where cm.clinic_id = new.clinic_id
        and cm.concepto = v_concepto_srv
    );
  end if;

  if coalesce(v_monto_insumos, 0) > 0 then
    insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
    select new.clinic_id, 'ingreso', new.fecha, v_concepto_ins, 'materiales', v_monto_insumos
    where not exists (
      select 1
      from public.clinic_movimientos cm
      where cm.clinic_id = new.clinic_id
        and cm.concepto = v_concepto_ins
    );
  end if;

  if coalesce(v_monto_servicio, 0) <= 0 and coalesce(v_monto_insumos, 0) <= 0 then
    insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
    select new.clinic_id, 'ingreso', new.fecha, v_concepto_base, 'servicios', v_monto_total
    where not exists (
      select 1
      from public.clinic_movimientos cm
      where cm.clinic_id = new.clinic_id
        and (cm.concepto = v_concepto_base or cm.concepto ilike '%turno #' || new.id || '%')
    );
  end if;

  return new;
end;
$$;

-- Activar el trigger en turnos
drop trigger if exists trg_sync_ingresos_turno_finalizado on public.turnos;
create trigger trg_sync_ingresos_turno_finalizado
  after insert or update of estado
  on public.turnos
  for each row
  execute function public.sync_ingresos_turno_finalizado();
