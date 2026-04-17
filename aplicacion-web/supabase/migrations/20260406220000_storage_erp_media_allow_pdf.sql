-- Consentimientos firmados: PDF generado en cliente y subido a erp-media.
-- El bucket se creó solo con imágenes; Supabase rechaza application/pdf sin esto.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[],
  file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 15728640)
WHERE id = 'erp-media';
