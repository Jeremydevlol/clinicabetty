-- Asigna foto_url de equipo por nombre (entorno local dev con rutas @fs de Vite).
-- Incluye doctores y personal de recepción.

alter table public.empleados
  add column if not exists foto_url text default '',
  add column if not exists documento text default '',
  add column if not exists fecha_nacimiento date,
  add column if not exists direccion text default '',
  add column if not exists fecha_ingreso date,
  add column if not exists contacto_emergencia text default '',
  add column if not exists tel_emergencia text default '',
  add column if not exists notas text default '',
  add column if not exists historial jsonb not null default '[]';

update public.empleados
set foto_url = '/@fs/Users/jeremjeremydevy/clinica-erp/team/Felipe - Especialista.jpg'
where lower(trim(nombre)) = 'felipe';

update public.empleados
set foto_url = '/@fs/Users/jeremjeremydevy/clinica-erp/team/Betty - Especialista:Directora.jpg'
where lower(trim(nombre)) = 'betty';

update public.empleados
set foto_url = '/@fs/Users/jeremjeremydevy/clinica-erp/team/Viviana - Recepcio%CC%81n.jpg'
where lower(trim(nombre)) = 'viviana';

update public.empleados
set foto_url = '/@fs/Users/jeremjeremydevy/clinica-erp/team/Yadira - Especialista.jpg'
where lower(trim(nombre)) = 'yadira';

update public.empleados
set foto_url = '/@fs/Users/jeremjeremydevy/clinica-erp/team/Yesenia - Especialista.jpg'
where lower(trim(nombre)) = 'yesenia';

update public.empleados
set foto_url = '/@fs/Users/jeremjeremydevy/clinica-erp/team/Natalia - Especialista.HEIC'
where lower(trim(nombre)) = 'natalia';

update public.empleados
set foto_url = '/@fs/Users/jeremjeremydevy/clinica-erp/team/Yohana - Especialista.JPG'
where lower(trim(nombre)) = 'yohana';
