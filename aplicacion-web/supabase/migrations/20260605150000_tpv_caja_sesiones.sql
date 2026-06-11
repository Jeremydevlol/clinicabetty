-- Apertura y cierre de caja TPV: fondo inicial, conteo de billetes/monedas, medios electrónicos.

create table if not exists public.tpv_caja_sesiones (
  id                        serial primary key,
  clinic_id                 smallint not null references public.clinics (id) on delete cascade,
  fecha                     date not null default current_date,
  estado                    text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  apertura_at               timestamptz not null default now(),
  cierre_at                 timestamptz,
  fondo_inicial             numeric(12, 2) not null default 0,
  conteo_apertura           jsonb not null default '{}',
  conteo_cierre_efectivo    jsonb not null default '{}',
  cierre_tarjeta            numeric(12, 2),
  cierre_transferencia      numeric(12, 2),
  cierre_banco              numeric(12, 2),
  teorico_efectivo          numeric(12, 2),
  teorico_tarjeta           numeric(12, 2),
  teorico_transferencia     numeric(12, 2),
  diferencia_efectivo       numeric(12, 2),
  diferencia_tarjeta        numeric(12, 2),
  diferencia_transferencia  numeric(12, 2),
  notas_cierre              text not null default '',
  abierto_por_empleado_id   int references public.empleados (id) on delete set null,
  cerrado_por_empleado_id   int references public.empleados (id) on delete set null,
  created_at                timestamptz not null default now()
);

create index if not exists idx_tpv_caja_clinic_fecha
  on public.tpv_caja_sesiones (clinic_id, fecha desc, apertura_at desc);

create unique index if not exists idx_tpv_caja_una_abierta_por_clinica
  on public.tpv_caja_sesiones (clinic_id)
  where estado = 'abierta';

alter table public.tpv_caja_sesiones enable row level security;

drop policy if exists "tpv_caja_all" on public.tpv_caja_sesiones;
create policy "tpv_caja_all"
  on public.tpv_caja_sesiones for all to authenticated
  using (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  )
  with check (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tpv_caja_sesiones;
  end if;
exception
  when duplicate_object then null;
end $$;
