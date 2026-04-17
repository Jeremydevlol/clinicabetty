-- Crea/asegura clientes + historial clínico y rellena desde turnos existentes.
--
-- Si esta BD no aplicó migraciones previas, pueden faltar las funciones RLS.
-- Las definimos aquí con CREATE OR REPLACE para que la migración sea autocontenida.

create or replace function public.auth_es_gerente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.empleados e
    where e.auth_user_id = auth.uid()
      and e.activo = true
      and e.rol = 'gerente'
  );
$$;

create or replace function public.auth_clinic_id_staff()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select e.clinic_id
  from public.empleados e
  where e.auth_user_id = auth.uid()
    and e.activo = true
    and e.rol in ('medico', 'recepcionista', 'encargado')
  limit 1;
$$;

create or replace function public.auth_empleado_id()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.empleados e
  where e.auth_user_id = auth.uid()
    and e.activo = true
  limit 1;
$$;

grant execute on function public.auth_es_gerente() to authenticated;
grant execute on function public.auth_clinic_id_staff() to authenticated;
grant execute on function public.auth_empleado_id() to authenticated;

create table if not exists public.clientes (
  id                   serial primary key,
  clinic_id            smallint not null references public.clinics (id) on delete cascade,
  nombre               text not null,
  tel                  text default '',
  email                text default '',
  dni                  text default '',
  fecha_nacimiento     date,
  notas_clinicas       text default '',
  alergias             jsonb not null default '[]',
  tratamientos_activos jsonb not null default '[]',
  visitas              jsonb not null default '[]',
  fotos                jsonb not null default '[]',
  anamnesis            jsonb not null default '{}',
  consentimientos      jsonb not null default '[]',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Compatibilidad: algunas instalaciones antiguas pueden tener clinica_id.
alter table public.clientes add column if not exists clinic_id smallint;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clientes'
      and column_name = 'clinica_id'
  ) then
    execute '
      update public.clientes
      set clinic_id = coalesce(clinic_id, clinica_id::smallint)
      where clinic_id is null
    ';
  end if;
end $$;

create index if not exists idx_clientes_clinic on public.clientes (clinic_id);
create index if not exists idx_clientes_nombre on public.clientes (lower(nombre));

create table if not exists public.historial_clinico (
  id           serial primary key,
  cliente_id   int not null references public.clientes (id) on delete cascade,
  fecha        date not null,
  tipo         text not null,
  titulo       text not null,
  detalle      text default '',
  profesional  text default ''
);

-- Compatibilidad: turnos también puede venir con clinica_id en instalaciones antiguas.
alter table public.turnos add column if not exists clinic_id smallint;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'turnos'
      and column_name = 'clinica_id'
  ) then
    execute '
      update public.turnos
      set clinic_id = coalesce(clinic_id, clinica_id::smallint)
      where clinic_id is null
    ';
  end if;
end $$;

create index if not exists idx_historial_cliente on public.historial_clinico (cliente_id);

alter table public.clientes enable row level security;
alter table public.historial_clinico enable row level security;

drop policy if exists "clientes_all" on public.clientes;
create policy "clientes_all"
  on public.clientes for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

drop policy if exists "historial_select" on public.historial_clinico;
create policy "historial_select"
  on public.historial_clinico for select to authenticated
  using (
    public.auth_es_gerente()
    or exists (
      select 1 from public.clientes c
      where c.id = historial_clinico.cliente_id
        and c.clinic_id = public.auth_clinic_id_staff()
    )
  );

drop policy if exists "historial_write" on public.historial_clinico;
create policy "historial_write"
  on public.historial_clinico for insert to authenticated
  with check (
    public.auth_es_gerente()
    or exists (
      select 1 from public.clientes c
      where c.id = cliente_id
        and c.clinic_id = public.auth_clinic_id_staff()
    )
  );

drop policy if exists "historial_update" on public.historial_clinico;
create policy "historial_update"
  on public.historial_clinico for update to authenticated
  using (
    public.auth_es_gerente()
    or exists (
      select 1 from public.clientes c
      where c.id = historial_clinico.cliente_id
        and c.clinic_id = public.auth_clinic_id_staff()
    )
  )
  with check (
    public.auth_es_gerente()
    or exists (
      select 1 from public.clientes c
      where c.id = cliente_id
        and c.clinic_id = public.auth_clinic_id_staff()
    )
  );

drop policy if exists "historial_delete" on public.historial_clinico;
create policy "historial_delete"
  on public.historial_clinico for delete to authenticated
  using (
    public.auth_es_gerente()
    or exists (
      select 1 from public.clientes c
      where c.id = historial_clinico.cliente_id
        and c.clinic_id = public.auth_clinic_id_staff()
    )
  );

-- Backfill: crea clientes desde turnos que no tengan cliente_id.
insert into public.clientes (clinic_id, nombre, tel, created_at, updated_at)
select
  t.clinic_id,
  trim(t.cliente) as nombre,
  coalesce(t.tel, '') as tel,
  now(),
  now()
from public.turnos t
where coalesce(trim(t.cliente), '') <> ''
  and t.cliente_id is null
  and not exists (
    select 1
    from public.clientes c
    where c.clinic_id = t.clinic_id
      and lower(trim(c.nombre)) = lower(trim(t.cliente))
  );

-- Vincula turnos con el cliente creado/encontrado por nombre+clínica.
update public.turnos t
set cliente_id = c.id
from public.clientes c
where t.cliente_id is null
  and c.clinic_id = t.clinic_id
  and lower(trim(c.nombre)) = lower(trim(t.cliente));
