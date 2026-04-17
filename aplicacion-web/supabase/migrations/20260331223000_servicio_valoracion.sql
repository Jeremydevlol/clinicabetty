-- Servicio de agenda: primera consulta / valoración (sin tratamiento definido aún).
-- El médico define tratamientos y cobros en sala o área médica.

insert into public.servicios (nombre, cat, duracion, precio, sesiones, descripcion)
select
  'Valoración (primera consulta)',
  'valoracion',
  45,
  0,
  1,
  'Primera cita para evaluación. El tratamiento y el importe se definen en la sesión con el médico.'
where not exists (
  select 1
  from public.servicios s
  where s.cat = 'valoracion'
    and lower(trim(s.nombre)) = lower(trim('Valoración (primera consulta)'))
);
