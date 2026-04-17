-- Bucket para imágenes de pacientes, empleados y evidencia.
-- Público para lectura (URL directa en app). Escritura vía API server-side.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-media',
  'erp-media',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;
