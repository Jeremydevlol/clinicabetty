-- Extiende clinics para soportar sucursal/franquicia.
-- No rompe datos existentes: todo lo actual queda como "sucursal".

alter table public.clinics
  add column if not exists modalidad_negocio text not null default 'sucursal';

alter table public.clinics
  add column if not exists clinic_matriz_id smallint references public.clinics (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinics_modalidad_negocio_check'
  ) then
    alter table public.clinics
      add constraint clinics_modalidad_negocio_check
      check (modalidad_negocio in ('sucursal', 'franquicia'));
  end if;
end $$;

create index if not exists idx_clinics_modalidad on public.clinics (modalidad_negocio);
create index if not exists idx_clinics_matriz on public.clinics (clinic_matriz_id);
