-- Parche: error "column auth_user_id does not exist"
-- Ejecutá esto en SQL Editor si creaste `empleados` antes de añadir la vinculación a Supabase Auth.
-- Luego volvé a ejecutar desde "create or replace function public.auth_es_gerente" del archivo principal,
-- o ejecutá de nuevo el archivo 20260331120000_initial_clinica_erp.sql desde la sección de funciones.

alter table public.empleados
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

drop index if exists public.idx_empleados_auth;
create unique index if not exists idx_empleados_auth on public.empleados (auth_user_id);

alter table public.empleados alter column clinic_id drop not null;

-- Solo si ya tenés la tabla clientes sin clinic_id:
-- alter table public.clientes add column if not exists clinic_id smallint references public.clinics (id) on delete cascade;
