-- Sustituye erp_media_delete_own_files: en la app cualquier empleado activo puede
-- borrar en erp-media (igual que /api/admin/delete-image con service role), no solo quien subió.

DROP POLICY IF EXISTS "erp_media_delete_own_files" ON storage.objects;

CREATE POLICY "erp_media_delete_staff"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'erp-media'
  AND public.auth_empleado_id() IS NOT NULL
);
