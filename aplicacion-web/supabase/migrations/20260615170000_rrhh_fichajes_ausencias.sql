-- RRHH / Control horario: fichajes (entrada, almuerzo, salida) y ausencias/vacaciones.
-- Permite monitorizar la asistencia y el rendimiento de los empleados.

-- Helper: ¿el usuario actual es gerente o encargado? (admin de RRHH)
create or replace function public.auth_es_admin_rrhh()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.empleados e
    where e.auth_user_id = auth.uid()
      and coalesce(e.activo, true)
      and e.rol in ('gerente', 'encargado')
  )
$$;
grant execute on function public.auth_es_admin_rrhh() to authenticated;

-- ── Fichajes: una fila por empleado y día ──
create table if not exists public.fichajes (
  id                  bigint generated always as identity primary key,
  clinic_id           smallint not null references public.clinics (id) on delete restrict,
  empleado_id         int not null references public.empleados (id) on delete cascade,
  fecha               date not null default (now() at time zone 'utc')::date,
  entrada_at          timestamptz,
  almuerzo_inicio_at  timestamptz,
  almuerzo_fin_at     timestamptz,
  salida_at           timestamptz,
  notas               text default '',
  created_at          timestamptz default now(),
  unique (empleado_id, fecha)
);
create index if not exists idx_fichajes_clinic_fecha on public.fichajes (clinic_id, fecha);
create index if not exists idx_fichajes_empleado on public.fichajes (empleado_id, fecha);

alter table public.fichajes enable row level security;

drop policy if exists fichajes_select on public.fichajes;
create policy fichajes_select on public.fichajes for select to authenticated
  using (
    empleado_id = public.auth_empleado_id()
    or public.auth_es_gerente()
    or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff())
  );

drop policy if exists fichajes_insert on public.fichajes;
create policy fichajes_insert on public.fichajes for insert to authenticated
  with check (
    empleado_id = public.auth_empleado_id()
    or public.auth_es_gerente()
    or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff())
  );

drop policy if exists fichajes_update on public.fichajes;
create policy fichajes_update on public.fichajes for update to authenticated
  using (
    empleado_id = public.auth_empleado_id()
    or public.auth_es_gerente()
    or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff())
  )
  with check (
    empleado_id = public.auth_empleado_id()
    or public.auth_es_gerente()
    or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff())
  );

drop policy if exists fichajes_delete on public.fichajes;
create policy fichajes_delete on public.fichajes for delete to authenticated
  using (public.auth_es_gerente() or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff()));

-- ── Ausencias / vacaciones ──
create table if not exists public.ausencias (
  id            bigint generated always as identity primary key,
  clinic_id     smallint not null references public.clinics (id) on delete restrict,
  empleado_id   int not null references public.empleados (id) on delete cascade,
  tipo          text not null default 'vacaciones',   -- vacaciones | enfermedad | permiso | falta | otro
  fecha_inicio  date not null,
  fecha_fin     date not null,
  estado        text not null default 'pendiente',    -- pendiente | aprobada | rechazada
  motivo        text default '',
  aprobado_por  int references public.empleados (id) on delete set null,
  created_at    timestamptz default now()
);
create index if not exists idx_ausencias_clinic on public.ausencias (clinic_id, fecha_inicio);
create index if not exists idx_ausencias_empleado on public.ausencias (empleado_id);

alter table public.ausencias enable row level security;

drop policy if exists ausencias_select on public.ausencias;
create policy ausencias_select on public.ausencias for select to authenticated
  using (
    empleado_id = public.auth_empleado_id()
    or public.auth_es_gerente()
    or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff())
  );

-- El empleado crea sus propias solicitudes; el admin puede crear para cualquiera de su clínica.
drop policy if exists ausencias_insert on public.ausencias;
create policy ausencias_insert on public.ausencias for insert to authenticated
  with check (
    empleado_id = public.auth_empleado_id()
    or public.auth_es_gerente()
    or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff())
  );

-- Solo el admin aprueba/rechaza/edita.
drop policy if exists ausencias_update on public.ausencias;
create policy ausencias_update on public.ausencias for update to authenticated
  using (public.auth_es_gerente() or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff()))
  with check (public.auth_es_gerente() or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff()));

drop policy if exists ausencias_delete on public.ausencias;
create policy ausencias_delete on public.ausencias for delete to authenticated
  using (
    public.auth_es_gerente()
    or (public.auth_es_admin_rrhh() and clinic_id = public.auth_clinic_id_staff())
    or (empleado_id = public.auth_empleado_id() and estado = 'pendiente')
  );
