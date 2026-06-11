-- Materiales/consumibles por servicio (clínica GOYA) — borrador derivado del Excel.
-- Parte A: catálogo de consumibles (tabla articulos). Costo 0 y mínimo 1 → AJUSTAR luego.
-- Parte B: enlaza cada servicio inyectable con su consumible y cantidad
--          (materiales_cantidades + materiales_articulo_ids), resolviendo el id por nombre.
-- Idempotente: A deduplica por nombre; B es un UPDATE re-ejecutable.

-- ── Parte 0: asegurar columnas de materiales en servicios ─────
-- (en bases donde nunca se aplicó la migración 20260406120000)
alter table public.servicios add column if not exists materiales_articulo_ids int[] not null default '{}';
alter table public.servicios add column if not exists materiales_cantidades  jsonb not null default '[]';

-- ── Parte A: consumibles ──────────────────────────────────────
insert into public.articulos (nombre, cat, unidad, minimo, costo)
select *
from (
  values
    ('Toxina botulínica CROMA (vial)','inyectable','vial',1,0),
    ('Toxina botulínica AXALURE (vial)','inyectable','vial',1,0),
    ('Ácido hialurónico (vial)','inyectable','vial',1,0),
    ('Radiesse - hidroxiapatita de calcio (vial)','inyectable','vial',1,0),
    ('Sculptra (vial)','inyectable','vial',1,0),
    ('Hilos tensores espiculados (unidad)','consumible','unidad',1,0),
    ('NCTF (vial)','inyectable','vial',1,0),
    ('Polinucleótidos de salmón (vial)','inyectable','vial',1,0),
    ('Exosomas (vial)','inyectable','vial',1,0),
    ('Enzimas faciales (ampolla)','inyectable','ampolla',1,0),
    ('Esclerosante / polidocanol (vial)','inyectable','vial',1,0),
    ('Hialuronidasa (vial)','inyectable','vial',1,0),
    ('Vitaminas faciales (ampolla)','inyectable','ampolla',1,0),
    ('Tip de Dermapen (unidad)','consumible','unidad',1,0),
    ('Kit COSMELAN (casa)','consumible','kit',1,0),
    ('Kit Astaxantina (casa)','consumible','kit',1,0),
    ('Kit radiofrecuencia (casa)','consumible','kit',1,0),
    ('Vacuna obesidad (vial)','inyectable','vial',1,0)
) as v(nombre, cat, unidad, minimo, costo)
where not exists (
  select 1 from public.articulos a where lower(trim(a.nombre)) = lower(trim(v.nombre))
);

-- ── Parte B: enlaces servicio → material ──────────────────────
with bom(servicio, cat, material, qty) as (
  values
    ('Botox 1 (1 vial )','facial','Toxina botulínica CROMA (vial)',1),
    ('Botox 2 (1 vial)','facial','Toxina botulínica AXALURE (vial)',1),
    ('Baby Botox','facial','Toxina botulínica CROMA (vial)',1),
    ('Botox Bruxismo','facial','Toxina botulínica CROMA (vial)',1),
    ('Botox Hiperhidrosis','facial','Toxina botulínica CROMA (vial)',2),
    ('AH Pómulo (1 vial )','facial','Ácido hialurónico (vial)',1),
    ('Diseño de labios (1 vial)','facial','Ácido hialurónico (vial)',1),
    ('Diseño de labios (1/2 vial)','facial','Ácido hialurónico (vial)',1),
    ('Marcación mandibular (1 vial)','facial','Ácido hialurónico (vial)',1),
    ('Radiesse (1 vial )','facial','Radiesse - hidroxiapatita de calcio (vial)',1),
    ('Rinomodelación (1 vial )','facial','Ácido hialurónico (vial)',1),
    ('Sculptra (1 vial )','facial','Sculptra (vial)',1),
    ('Foxy Eyes (4 hilos y punto de botox)','facial','Hilos tensores espiculados (unidad)',4),
    ('Foxy Eyes (4 hilos y punto de botox)','facial','Toxina botulínica CROMA (vial)',1),
    ('Hilos tensores espiculados (4 hilos)','facial','Hilos tensores espiculados (unidad)',4),
    ('NCTF inyectado','facial','NCTF (vial)',1),
    ('NCTF dermapen','facial','NCTF (vial)',1),
    ('NCTF dermapen','facial','Tip de Dermapen (unidad)',1),
    ('Polinucleótidos salmón (Mesoterapia más dermapen)','facial','Polinucleótidos de salmón (vial)',1),
    ('Polinucleótidos salmón (Mesoterapia más dermapen)','facial','Tip de Dermapen (unidad)',1),
    ('EXOSOMAS','facial','Exosomas (vial)',1),
    ('EXOSOMAS','facial','Tip de Dermapen (unidad)',1),
    ('Enzimas facial','facial','Enzimas faciales (ampolla)',1),
    ('Escleoterapia (1 vial )','facial','Esclerosante / polidocanol (vial)',1),
    ('Escleoterapia (2 vial )','corporal','Esclerosante / polidocanol (vial)',2),
    ('VACUNA OBESIDAD','corporal','Vacuna obesidad (vial)',1),
    ('HIALURONIDASA','corporal','Hialuronidasa (vial)',1),
    ('ASTAXANTINA','facial','Kit Astaxantina (casa)',1),
    ('ASTAXANTINA','facial','Tip de Dermapen (unidad)',1),
    ('COSMELAN','facial','Kit COSMELAN (casa)',1),
    ('VITAMINAS','facial','Vitaminas faciales (ampolla)',1),
    ('VITAMINAS','facial','Tip de Dermapen (unidad)',1),
    ('Higiene más Vitaminas','facial','Vitaminas faciales (ampolla)',1),
    ('Higiene más Vitaminas','facial','Tip de Dermapen (unidad)',1),
    ('Radio frecuencia CC — Cara completa - cuello','facial','Kit radiofrecuencia (casa)',1),
    ('Radio frecuencia TI — CaraTercio inferior','facial','Kit radiofrecuencia (casa)',1)
),
resolved as (
  select b.servicio, b.cat, a.id as articulo_id, b.qty
  from bom b
  join public.articulos a on lower(trim(a.nombre)) = lower(trim(b.material))
),
agg as (
  select servicio, cat,
         jsonb_agg(jsonb_build_object('id', articulo_id, 'qty', qty)) as cants,
         array_agg(articulo_id) as ids
  from resolved
  group by servicio, cat
)
update public.servicios s
set materiales_cantidades = agg.cants,
    materiales_articulo_ids = agg.ids
from agg
where lower(trim(s.nombre)) = lower(trim(agg.servicio))
  and s.cat = agg.cat;
