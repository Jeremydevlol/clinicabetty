-- Migration: fix all pilot test bugs
-- 1. Add metodo_pago to turnos (so trigger can use actual payment method)
-- 2. Update trigger to use metodo_pago instead of hardcoded 'efectivo'
-- 3. Auto-insert alertas_cobro when turno → listo_cobrar
-- 4. Clean up duplicate movimientos (Backfill + Auto)

-- ─── 1. Add metodo_pago column + alertas_cobro unique index ───

alter table public.turnos
  add column if not exists metodo_pago text default 'efectivo';

create unique index if not exists idx_alertas_cobro_turno_id
  on public.alertas_cobro (turno_id) where turno_id is not null;

-- ─── 2. Update trigger to use metodo_pago ─────────────────────

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
  v_metodo text;
begin
  if new.estado is distinct from 'finalizado' then
    return new;
  end if;

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

  v_metodo := coalesce(nullif(trim(new.metodo_pago), ''), 'efectivo');
  v_concepto := format('Cobro turno #%s — %s', new.id, coalesce(new.cliente, 'Paciente'));
  v_comprobante := format('AUTO-TURNO-%s', new.id);

  insert into public.tpv_movimientos (fecha, clinic_id, metodo, monto, concepto, comprobante)
  select new.fecha, new.clinic_id, v_metodo, v_monto, v_concepto, v_comprobante
  where not exists (
    select 1 from public.tpv_movimientos tm where tm.comprobante = v_comprobante
  );

  insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
  select new.clinic_id, 'ingreso', new.fecha, v_concepto, 'servicios', v_monto
  where not exists (
    select 1
    from public.clinic_movimientos cm
    where cm.clinic_id = new.clinic_id
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

-- ─── 3. Auto-insert alertas_cobro when turno → listo_cobrar ───

create or replace function public.sync_alerta_cobro_turno_listo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_srv record;
  v_monto_servicio numeric(12,2);
begin
  if new.estado is distinct from 'listo_cobrar' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.estado, '') = 'listo_cobrar' then
    return new;
  end if;

  if exists (
    select 1 from public.alertas_cobro ac where ac.turno_id = new.id
  ) then
    return new;
  end if;

  select s.id, s.nombre, s.precio
    into v_srv
    from public.servicios s
   where s.id = coalesce(new.servicio_facturado_id,
           (select s2.id from public.servicios s2
             where lower(trim(s2.nombre)) = lower(trim(new.servicio))
             limit 1))
   limit 1;

  v_monto_servicio := coalesce(v_srv.precio, 0)::numeric(12,2);

  insert into public.alertas_cobro
    (clinic_id, turno_id, cliente, servicio, servicio_id,
     monto_servicio, monto_insumos, monto_total, insumos, estado)
  values
    (new.clinic_id, new.id, coalesce(new.cliente, 'Paciente'),
     coalesce(v_srv.nombre, new.servicio, ''),
     v_srv.id,
     v_monto_servicio, 0, v_monto_servicio,
     '[]'::jsonb, 'pendiente');

  return new;
end;
$$;

drop trigger if exists trg_sync_alerta_cobro_turno_listo on public.turnos;
create trigger trg_sync_alerta_cobro_turno_listo
after insert or update of estado on public.turnos
for each row
execute function public.sync_alerta_cobro_turno_listo();

-- ─── 4. Clean up duplicate movimientos ────────────────────────

delete from public.tpv_movimientos
where id in (
  select tm.id
  from public.tpv_movimientos tm
  where tm.concepto like 'Backfill cobro turno #%'
    and exists (
      select 1 from public.tpv_movimientos t2
      where t2.comprobante = 'AUTO-TURNO-' || substring(tm.concepto from 'turno #(\d+)')
    )
);

delete from public.clinic_movimientos
where id in (
  select cm.id
  from public.clinic_movimientos cm
  where cm.concepto like 'Backfill cobro turno #%'
    and exists (
      select 1 from public.clinic_movimientos c2
      where c2.concepto like 'Auto cobro turno #' || substring(cm.concepto from 'turno #(\d+)') || ' —%'
    )
);

-- Also unify: rename 'Auto cobro' to 'Cobro' for cleanliness
update public.tpv_movimientos
  set concepto = replace(concepto, 'Auto cobro turno', 'Cobro turno')
where concepto like 'Auto cobro turno #%';

update public.clinic_movimientos
  set concepto = replace(concepto, 'Auto cobro turno', 'Cobro turno')
where concepto like 'Auto cobro turno #%';

-- Backfill alertas_cobro for existing listo_cobrar turnos
insert into public.alertas_cobro
  (clinic_id, turno_id, cliente, servicio, servicio_id,
   monto_servicio, monto_insumos, monto_total, insumos, estado)
select
  t.clinic_id,
  t.id,
  coalesce(t.cliente, 'Paciente'),
  coalesce(s.nombre, t.servicio, ''),
  s.id,
  coalesce(s.precio, 0)::numeric(12,2),
  0,
  coalesce(s.precio, 0)::numeric(12,2),
  '[]'::jsonb,
  case when t.estado = 'finalizado' then 'cobrado' else 'pendiente' end
from public.turnos t
left join public.servicios s
  on s.id = coalesce(t.servicio_facturado_id,
       (select s2.id from public.servicios s2
         where lower(trim(s2.nombre)) = lower(trim(t.servicio))
         limit 1))
where t.estado in ('listo_cobrar', 'finalizado')
  and not exists (
    select 1 from public.alertas_cobro ac where ac.turno_id = t.id
  );

-- Add realtime subscriptions for alertas_cobro
alter publication supabase_realtime add table public.alertas_cobro;
