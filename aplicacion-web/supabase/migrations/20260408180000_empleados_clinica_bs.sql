-- Asignar sede BS a Gloria, Viviana, Yadira y Yesenia (auth_user_id).
-- La clínica se detecta por nombre (insensible a mayúsculas). Si no coincide, usá la variante comentada abajo.

do $$
declare
  bs_id smallint;
begin
  select c.id into bs_id
  from public.clinics c
  where
    lower(trim(c.nombre)) = 'bs'
    or lower(trim(c.nombre)) like 'bs %'
    or lower(trim(c.nombre)) like '% bs'
    or lower(trim(c.nombre)) like '%(bs)%'
  order by c.id
  limit 1;

  if bs_id is null then
    raise exception
      'No se encontró la clínica BS. Ejecutá: select id, nombre from public.clinics order by id; '
      'y editá este bloque para fijar bs_id (ver comentario al final del archivo).';
  end if;

  update public.empleados e
  set
    clinic_id = bs_id,
    updated_at = now()
  where e.auth_user_id in (
    'a5b462cb-005b-4486-943b-43d4389154c3', -- Gloria
    '1e70feba-a2a4-461e-9b2e-fd84c7846ab1', -- Viviana
    '8ddc495a-e500-4376-8058-4bde1872bd59', -- Yadira
    '3232a13c-661d-434e-8f18-64f951c50738'  -- Yesenia
  );

  -- Mantener disponibilidad de agenda alineada con la nueva sede (si usás la tabla).
  update public.agenda_disponibilidad d
  set clinic_id = bs_id
  where d.empleado_id in (
    select e.id
    from public.empleados e
    where e.auth_user_id in (
      'a5b462cb-005b-4486-943b-43d4389154c3',
      '1e70feba-a2a4-461e-9b2e-fd84c7846ab1',
      '8ddc495a-e500-4376-8058-4bde1872bd59',
      '3232a13c-661d-434e-8f18-64f951c50738'
    )
  );
end $$;

-- ─── Si el DO falla: fijá el id a mano (ej. BS = 2) y ejecutá solo esto ───
-- update public.empleados set clinic_id = 2, updated_at = now()
-- where auth_user_id in (
--   'a5b462cb-005b-4486-943b-43d4389154c3',
--   '1e70feba-a2a4-461e-9b2e-fd84c7846ab1',
--   '8ddc495a-e500-4376-8058-4bde1872bd59',
--   '3232a13c-661d-434e-8f18-64f951c50738'
-- );
-- update public.agenda_disponibilidad d
-- set clinic_id = 2
-- where empleado_id in (select id from public.empleados where auth_user_id in (
--   'a5b462cb-005b-4486-943b-43d4389154c3',
--   '1e70feba-a2a4-461e-9b2e-fd84c7846ab1',
--   '8ddc495a-e500-4376-8058-4bde1872bd59',
--   '3232a13c-661d-434e-8f18-64f951c50738'
-- ));
