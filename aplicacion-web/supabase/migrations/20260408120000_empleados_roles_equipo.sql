-- Roles del equipo (auth_user_id = Supabase Auth).
-- Modelo: recepcionista | especialista | encargado (ej. administración contable) | gerente (dueña, control total RLS).

-- Un solo marcador de gerente "principal" en UI (cuentas / alta de clínicas).
update public.empleados set es_principal = false where rol = 'gerente';

-- Gloria — administración contable (encargado: contabilidad + gestión de clínica).
update public.empleados
set
  rol = 'encargado',
  especialidad = 'Administración contable',
  updated_at = now()
where auth_user_id = 'a5b462cb-005b-4486-943b-43d4389154c3';

-- Viviana — recepción.
update public.empleados
set
  rol = 'recepcionista',
  especialidad = coalesce(nullif(trim(especialidad), ''), ''),
  updated_at = now()
where auth_user_id = '1e70feba-a2a4-461e-9b2e-fd84c7846ab1';

-- Natalia, Yohana, Yadira, Yesenia — especialistas (médico en sistema).
update public.empleados
set
  rol = 'especialista',
  updated_at = now()
where auth_user_id in (
  'a12bcc72-43e4-4203-901a-f74d72501cb5',
  'edeaa0eb-47b9-4fbd-abb4-e6c3f540ad74',
  '8ddc495a-e500-4376-8058-4bde1872bd59',
  '3232a13c-661d-434e-8f18-64f951c50738'
);

-- Betty — dueña: gerente (RLS: control total) + gerente principal (UI) + agenda/reserva pública si tiene especialidad y clinic_id de la sede.
-- Si no coincide por nombre, reemplazá el UUID o el id:
--   update public.empleados set rol = 'gerente', es_principal = true, especialidad = 'Directora · medicina estética' where auth_user_id = '…';
update public.empleados
set
  rol = 'gerente',
  es_principal = true,
  especialidad = 'Directora · medicina estética',
  updated_at = now()
where id = (
  select e.id
  from public.empleados e
  where lower(trim(e.nombre)) = 'betty'
  order by e.id
  limit 1
);

-- Gloria (encargado) debe tener clinic_id no nulo. Si el update falló por el check, asigná sede antes:
-- update public.empleados set clinic_id = 1 where auth_user_id = 'a5b462cb-005b-4486-943b-43d4389154c3' and clinic_id is null;
