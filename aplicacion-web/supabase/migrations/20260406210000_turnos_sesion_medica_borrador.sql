-- Borrador de sesión médica (wizard por fases): estado y campos para recuperar si se cierra el navegador.
alter table public.turnos
  add column if not exists sesion_medica_borrador jsonb not null default '{}'::jsonb;

comment on column public.turnos.sesion_medica_borrador is
  'Estado del asistente de sesión médica: { v, wizardFase, textos, servicioSel, qty, flags… }';
