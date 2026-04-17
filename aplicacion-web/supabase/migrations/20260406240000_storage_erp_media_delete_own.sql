-- Borrado de archivos propios en erp-media desde el cliente (Supabase JS).
-- Convención de path al subir: .../{auth_user_id}/{nombre_archivo} (penúltimo segmento = dueño).

CREATE OR REPLACE FUNCTION public.erp_media_owner_segment(object_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(array_length(string_to_array(trim(object_path, '/'), '/'), 1), 0) >= 3
    THEN (string_to_array(trim(object_path, '/'), '/'))[
      array_length(string_to_array(trim(object_path, '/'), '/'), 1) - 1
    ]
    ELSE NULL
  END;
$$;

CREATE POLICY "erp_media_delete_own_files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'erp-media'
  AND public.erp_media_owner_segment(name) = auth.uid()::text
);
