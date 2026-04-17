-- Disponibilidad horaria del personal por clínica para agenda.

create table if not exists public.agenda_disponibilidad (
  id          serial primary key,
  clinic_id   smallint not null references public.clinics (id) on delete cascade,
  empleado_id int not null references public.empleados (id) on delete cascade,
  dia_semana  smallint not null check (dia_semana between 0 and 6), -- 0=Dom ... 6=Sab
  hora_desde  time not null,
  hora_hasta  time not null,
  nota        text not null default '',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint agenda_disponibilidad_horas check (hora_desde < hora_hasta)
);

create index if not exists idx_agenda_disp_clinic_dia on public.agenda_disponibilidad (clinic_id, dia_semana, hora_desde);
create index if not exists idx_agenda_disp_empleado on public.agenda_disponibilidad (empleado_id, dia_semana, hora_desde);

alter table public.agenda_disponibilidad enable row level security;

drop policy if exists "agenda_disp_select" on public.agenda_disponibilidad;
create policy "agenda_disp_select"
  on public.agenda_disponibilidad for select to authenticated
  using (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  );

drop policy if exists "agenda_disp_insert" on public.agenda_disponibilidad;
create policy "agenda_disp_insert"
  on public.agenda_disponibilidad for insert to authenticated
  with check (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  );

drop policy if exists "agenda_disp_update" on public.agenda_disponibilidad;
create policy "agenda_disp_update"
  on public.agenda_disponibilidad for update to authenticated
  using (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  )
  with check (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  );

drop policy if exists "agenda_disp_delete" on public.agenda_disponibilidad;
create policy "agenda_disp_delete"
  on public.agenda_disponibilidad for delete to authenticated
  using (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  );
