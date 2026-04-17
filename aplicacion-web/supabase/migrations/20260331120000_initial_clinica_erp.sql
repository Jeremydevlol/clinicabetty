-- Clinica ERP — esquema + RLS por rol
-- Gerente = superadmin: ve todas las clínicas y puede crear médicos/recepcionistas (por clínica).
-- Médico / recepcionista: solo datos de su clinic_id.
-- Requiere Supabase Auth: cada fila en empleados con personal operativo debe tener auth_user_id = auth.users.id.
-- El primer gerente: insertar manualmente en SQL (o service role) empleados + auth.users, o flujo de registro aparte.
-- La clave anon del front ya NO pasa estas políticas: la app debe iniciar sesión (JWT authenticated).

-- ─── Clínicas ──────────────────────────────────────────────────

create table if not exists public.clinics (
  id          smallserial primary key,
  nombre      text not null,
  created_at  timestamptz not null default now()
);

-- Personal: gerente (multi-clínica) | médico | recepcionista (una clínica obligatoria)
-- clinic_id NULL solo permitido para gerente (sede “global” / corporativo).

create table if not exists public.empleados (
  id             serial primary key,
  clinic_id      smallint references public.clinics (id) on delete cascade,
  nombre         text not null,
  email          text default '',
  tel            text default '',
  rol            text not null check (rol in ('medico', 'recepcionista', 'gerente')),
  activo         boolean not null default true,
  especialidad   text default '',
  comision_pct   int,
  color          text default '#7C3AED',
  auth_user_id   uuid unique references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint empleados_clinic_rol check (
    (rol = 'gerente')
    or (rol in ('medico', 'recepcionista') and clinic_id is not null)
  )
);

create index if not exists idx_empleados_clinic_rol on public.empleados (clinic_id, rol);

-- ─── Clientes (por clínica) ────────────────────────────────────

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

create index if not exists idx_clientes_clinic on public.clientes (clinic_id);

-- ─── Catálogo de servicios (global; solo gerente modifica) ─────

create table if not exists public.servicios (
  id                       serial primary key,
  nombre                   text not null,
  cat                      text not null default 'clinico',
  duracion                 int not null default 30,
  precio                   numeric(12, 2) not null default 0,
  sesiones                 int not null default 1,
  descripcion              text default '',
  materiales_articulo_ids  int[] not null default '{}'
);

-- ─── Artículos ─────────────────────────────────────────────────

create table if not exists public.articulos (
  id          serial primary key,
  nombre      text not null,
  cat         text not null default 'general',
  unidad      text not null default 'unidades',
  minimo      numeric(12, 2) not null default 0,
  costo       numeric(12, 2) not null default 0,
  proveedor   text default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.articulos_por_clinica (
  clinic_id    smallint not null references public.clinics (id) on delete cascade,
  articulo_id  int not null references public.articulos (id) on delete cascade,
  cantidad     numeric(12, 2) not null default 0,
  primary key (clinic_id, articulo_id)
);

-- ─── Turnos ────────────────────────────────────────────────────

create table if not exists public.turnos (
  id                    serial primary key,
  clinic_id             smallint not null references public.clinics (id) on delete cascade,
  cliente_id            int references public.clientes (id) on delete set null,
  cliente               text not null,
  tel                   text default '',
  fecha                 date not null,
  hora                  text not null,
  cat                   text not null default 'clinico',
  servicio              text not null,
  obs                   text default '',
  estado                text not null default 'pendiente',
  empleado_id           int references public.empleados (id) on delete set null,
  servicio_facturado_id int references public.servicios (id) on delete set null,
  sesion_iniciada_desde text,
  sesion_iniciada_at    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_turnos_clinic_fecha on public.turnos (clinic_id, fecha);
create index if not exists idx_turnos_estado on public.turnos (estado);

-- ─── Historia clínica ──────────────────────────────────────────

create table if not exists public.historial_clinico (
  id           serial primary key,
  cliente_id   int not null references public.clientes (id) on delete cascade,
  fecha        date not null,
  tipo         text not null,
  titulo       text not null,
  detalle      text default '',
  profesional  text default ''
);

create index if not exists idx_historial_cliente on public.historial_clinico (cliente_id);

-- ─── Alertas cobro ───────────────────────────────────────────

create table if not exists public.alertas_cobro (
  id               serial primary key,
  clinic_id        smallint not null references public.clinics (id) on delete cascade,
  turno_id         int references public.turnos (id) on delete set null,
  cliente          text not null,
  servicio         text not null,
  servicio_id      int references public.servicios (id) on delete set null,
  monto_servicio   numeric(12, 2) not null default 0,
  monto_insumos    numeric(12, 2) not null default 0,
  monto_total      numeric(12, 2) not null default 0,
  insumos          jsonb not null default '[]',
  estado           text not null default 'pendiente',
  metodo_pago      text,
  creado           timestamptz not null default now()
);

create index if not exists idx_alertas_clinic_estado on public.alertas_cobro (clinic_id, estado);

-- ─── TPV / contabilidad ───────────────────────────────────────

create table if not exists public.tpv_movimientos (
  id            serial primary key,
  fecha         date not null,
  clinic_id     smallint not null references public.clinics (id) on delete cascade,
  metodo        text not null,
  monto         numeric(12, 2) not null,
  concepto      text not null default '',
  comprobante   text default ''
);

create table if not exists public.clinic_movimientos (
  id            serial primary key,
  clinic_id     smallint not null references public.clinics (id) on delete cascade,
  tipo          text not null,
  fecha         date not null,
  concepto      text not null,
  cat           text not null default 'servicios',
  monto         numeric(12, 2) not null
);

-- ─── Compatibilidad Supabase Auth ─────────────────────────────
-- Si `empleados` ya existía sin vincular a Auth, CREATE TABLE no añade columnas nuevas: esto lo corrige.
alter table public.empleados
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

drop index if exists public.idx_empleados_auth;
create unique index if not exists idx_empleados_auth on public.empleados (auth_user_id);

alter table public.empleados alter column clinic_id drop not null;

alter table public.clientes add column if not exists clinic_id smallint references public.clinics (id) on delete cascade;

-- ─── Helpers RLS (SECURITY DEFINER) ───────────────────────────

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
    and e.rol in ('medico', 'recepcionista')
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

-- ─── Row Level Security ───────────────────────────────────────

alter table public.clinics enable row level security;
alter table public.empleados enable row level security;
alter table public.clientes enable row level security;
alter table public.servicios enable row level security;
alter table public.articulos enable row level security;
alter table public.articulos_por_clinica enable row level security;
alter table public.turnos enable row level security;
alter table public.historial_clinico enable row level security;
alter table public.alertas_cobro enable row level security;
alter table public.tpv_movimientos enable row level security;
alter table public.clinic_movimientos enable row level security;

drop policy if exists "clinica_erp_dev_all" on public.clinics;
drop policy if exists "clinica_erp_dev_all" on public.empleados;
drop policy if exists "clinica_erp_dev_all" on public.clientes;
drop policy if exists "clinica_erp_dev_all" on public.servicios;
drop policy if exists "clinica_erp_dev_all" on public.articulos;
drop policy if exists "clinica_erp_dev_all" on public.articulos_por_clinica;
drop policy if exists "clinica_erp_dev_all" on public.turnos;
drop policy if exists "clinica_erp_dev_all" on public.historial_clinico;
drop policy if exists "clinica_erp_dev_all" on public.alertas_cobro;
drop policy if exists "clinica_erp_dev_all" on public.tpv_movimientos;
drop policy if exists "clinica_erp_dev_all" on public.clinic_movimientos;

-- clinics: ver todas si gerente; si no, solo la suya
create policy "clinics_select"
  on public.clinics for select to authenticated
  using (public.auth_es_gerente() or id = public.auth_clinic_id_staff());

create policy "clinics_insert"
  on public.clinics for insert to authenticated
  with check (public.auth_es_gerente());

create policy "clinics_update"
  on public.clinics for update to authenticated
  using (public.auth_es_gerente())
  with check (public.auth_es_gerente());

create policy "clinics_delete"
  on public.clinics for delete to authenticated
  using (public.auth_es_gerente());

-- empleados: gerente ve todos; resto ve compañeros de su clínica + su fila
create policy "empleados_select"
  on public.empleados for select to authenticated
  using (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
    or id = public.auth_empleado_id()
  );

-- Solo gerente crea personal operativo (médico / recepcionista) en una clínica concreta
create policy "empleados_insert_staff"
  on public.empleados for insert to authenticated
  with check (
    public.auth_es_gerente()
    and rol in ('medico', 'recepcionista')
    and clinic_id is not null
  );

-- Gerente puede crear otro gerente (opcional; sede opcional)
create policy "empleados_insert_gerente"
  on public.empleados for insert to authenticated
  with check (
    public.auth_es_gerente()
    and rol = 'gerente'
  );

create policy "empleados_update"
  on public.empleados for update to authenticated
  using (
    public.auth_es_gerente()
    or id = public.auth_empleado_id()
  )
  with check (
    public.auth_es_gerente()
    or id = public.auth_empleado_id()
  );

create policy "empleados_delete"
  on public.empleados for delete to authenticated
  using (public.auth_es_gerente());

-- clientes por clínica
create policy "clientes_all"
  on public.clientes for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

-- catálogo servicios: lectura todos; escritura gerente
create policy "servicios_select"
  on public.servicios for select to authenticated
  using (true);

create policy "servicios_write"
  on public.servicios for insert to authenticated
  with check (public.auth_es_gerente());

create policy "servicios_update"
  on public.servicios for update to authenticated
  using (public.auth_es_gerente())
  with check (public.auth_es_gerente());

create policy "servicios_delete"
  on public.servicios for delete to authenticated
  using (public.auth_es_gerente());

-- artículos catálogo global
create policy "articulos_select"
  on public.articulos for select to authenticated
  using (true);

create policy "articulos_write"
  on public.articulos for insert to authenticated
  with check (public.auth_es_gerente());

create policy "articulos_update"
  on public.articulos for update to authenticated
  using (public.auth_es_gerente())
  with check (public.auth_es_gerente());

create policy "articulos_delete"
  on public.articulos for delete to authenticated
  using (public.auth_es_gerente());

-- stock por clínica
create policy "articulos_por_clinica_all"
  on public.articulos_por_clinica for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

-- turnos
create policy "turnos_all"
  on public.turnos for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

-- historial: por cliente → misma clínica
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

-- alertas, tpv, movimientos
create policy "alertas_all"
  on public.alertas_cobro for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

create policy "tpv_all"
  on public.tpv_movimientos for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

create policy "clinic_mov_all"
  on public.clinic_movimientos for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

-- ═══ Primer gerente (manual; la API con anon no puede insertar por RLS) ═══
-- 1) Authentication → Users → crear usuario (email/contraseña).
-- 2) Copiar UUID del usuario (campo id en la tabla auth.users).
-- 3) insert into public.clinics (nombre) values ('Sede central') returning id;
-- 4) insert into public.empleados (clinic_id, nombre, email, rol, auth_user_id)
--      values (null, 'Nombre gerente', 'correo@ejemplo.com', 'gerente', 'UUID-DEL-PASO-2'::uuid);
--    (clinic_id null = gerente corporativo; podés poner 1 si preferís anclar a una sede.)
-- 5) Desde la app, con sesión de ese usuario: crear médicos/recepcionistas con insert en empleados
--    (rol medico|recepcionista, clinic_id obligatorio = clínica donde trabajan).
