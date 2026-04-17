-- Add material quantities to services catalog
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS materiales_cantidades jsonb NOT NULL DEFAULT '[]';

-- Backfill: convert existing materiales_articulo_ids to quantities (qty=1 for each)
UPDATE public.servicios
SET materiales_cantidades = (
  SELECT jsonb_agg(jsonb_build_object('id', id_val, 'qty', 1))
  FROM unnest(materiales_articulo_ids) AS id_val
)
WHERE array_length(materiales_articulo_ids, 1) > 0
  AND (materiales_cantidades = '[]'::jsonb OR materiales_cantidades IS NULL);
