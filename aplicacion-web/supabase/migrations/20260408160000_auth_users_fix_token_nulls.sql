-- Evita error al iniciar sesión: "Database error querying schema"
-- Causa: GoTrue no puede escanear NULL en columnas de token de auth.users (ver supabase/auth#1940).
-- Tras UPDATE manual de emails o inserts incompletos en auth.users, rellená con cadena vacía.

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  recovery_token = coalesce(recovery_token, '')
where confirmation_token is null
   or email_change is null
   or email_change_token_new is null
   or recovery_token is null;
