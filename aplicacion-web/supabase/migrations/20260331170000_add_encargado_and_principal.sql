-- Jerarquía de gestión:
-- - gerente principal: alcance global (puede crear clínicas y encargados)
-- - encargado: alcance por clínica (puede crear médicos/recepcionistas de su clínica)

alter table public.empleados
  add column if not exists es_principal boolean not null default false;

-- Si existe al menos un gerente sin principal definido, marca como principal al más antiguo.
with first_manager as (
  select id
  from public.empleados
  where rol = 'gerente'
  order by id
  limit 1
)
update public.empleados
set es_principal = true
where id in (select id from first_manager)
  and not exists (select 1 from public.empleados e2 where e2.rol = 'gerente' and e2.es_principal = true);

alter table public.empleados drop constraint if exists empleados_clinic_rol;

alter table public.empleados
  add constraint empleados_clinic_rol check (
    (rol = 'gerente')
    or (rol in ('encargado', 'medico', 'recepcionista') and clinic_id is not null)
  );

alter table public.empleados drop constraint if exists empleados_rol_check;

alter table public.empleados
  add constraint empleados_rol_check check (rol in ('medico', 'recepcionista', 'encargado', 'gerente'));
