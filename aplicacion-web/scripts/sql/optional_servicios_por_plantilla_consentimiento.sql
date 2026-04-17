-- OPCIONAL: crea un registro en public.servicios por cada plantilla de consentimiento.
-- La mayoría de clínicas NO lo necesita: las plantillas (consentimiento_plantillas) bastan para firmar;
-- en agenda/cobro podés usar un solo servicio genérico y escribir el detalle en el consentimiento.
-- Solo ejecutá esto en el SQL Editor si explícitamente querés un tratamiento en catálogo por cada documento legal.

insert into public.servicios (nombre, cat, duracion, precio, sesiones, descripcion)
select
  case
    when exists (
      select 1
      from public.servicios s
      where lower(trim(s.nombre)) = lower(trim(p.titulo))
        and coalesce(s.descripcion, '') not like '%consent_plantilla_slug=%'
    )
    then left(trim(p.titulo), 170) || ' — consentimiento'
    else left(trim(p.titulo), 200)
  end,
  case coalesce(p.categoria, 'general')
    when 'inyectable' then 'facial'
    when 'corporal' then 'corporal'
    when 'legal' then 'clinico'
    when 'tratamiento' then 'clinico'
    else 'clinico'
  end,
  45,
  0::numeric,
  1,
  'Catálogo vinculado a plantilla de consentimiento informado. consent_plantilla_slug=' || p.slug
from public.consentimiento_plantillas p
where coalesce(p.activo, true)
  and not exists (
    select 1
    from public.servicios s
    where coalesce(s.descripcion, '') like '%consent_plantilla_slug=' || p.slug || '%'
  );
