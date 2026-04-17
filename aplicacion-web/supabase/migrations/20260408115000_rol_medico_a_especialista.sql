-- Terminología: rol operativo `medico` -> `especialista` (sin cambiar permisos RLS).
-- Debe ejecutarse antes de 20260408120000_empleados_roles_equipo.sql (que ya usa `especialista`).

drop policy if exists "empleados_insert_staff" on public.empleados;

alter table public.empleados drop constraint if exists empleados_rol_check;
alter table public.empleados drop constraint if exists empleados_clinic_rol;

update public.empleados set rol = 'especialista', updated_at = now() where rol = 'medico';

alter table public.empleados
  add constraint empleados_rol_check check (rol in ('especialista', 'recepcionista', 'encargado', 'gerente'));

alter table public.empleados
  add constraint empleados_clinic_rol check (
    (rol = 'gerente')
    or (rol in ('encargado', 'especialista', 'recepcionista') and clinic_id is not null)
  );

create policy "empleados_insert_staff"
  on public.empleados for insert to authenticated
  with check (
    public.auth_es_gerente()
    and rol in ('especialista', 'recepcionista')
    and clinic_id is not null
  );

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
    and e.rol in ('especialista', 'recepcionista', 'encargado')
  limit 1;
$$;

grant execute on function public.auth_clinic_id_staff() to authenticated;

create or replace function public.auth_clinic_id_operativo()
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
    and e.rol in ('encargado', 'especialista', 'recepcionista')
  limit 1;
$$;

grant execute on function public.auth_clinic_id_operativo() to authenticated;
