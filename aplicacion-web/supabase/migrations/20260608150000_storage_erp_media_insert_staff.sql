-- Permite a empleados activos subir imágenes (fotos clínicas antes/durante/después,
-- evidencias, etc.) al bucket `erp-media` directamente desde la app móvil con su JWT.
-- Hasta ahora la subida se hacía solo vía API server-side (service role).

DROP POLICY IF EXISTS "erp_media_insert_staff" ON storage.objects;

CREATE POLICY "erp_media_insert_staff"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'erp-media'
  AND public.auth_empleado_id() IS NOT NULL
);
