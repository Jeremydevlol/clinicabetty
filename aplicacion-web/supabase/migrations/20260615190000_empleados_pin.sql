-- PIN de fichaje por empleado (para el kiosko /fichar en el iPad de recepción).
-- Cada empleado ficha entrada/almuerzo/salida con su PIN en un dispositivo compartido.
alter table public.empleados add column if not exists pin text;

-- PIN único dentro de cada clínica (evita choques al identificar por PIN).
create unique index if not exists uq_empleados_pin_clinic
  on public.empleados (clinic_id, pin)
  where pin is not null and pin <> '';
