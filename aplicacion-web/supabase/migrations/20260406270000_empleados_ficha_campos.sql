-- Ficha de empleado: persistir foto y datos administrativos en BD.

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
