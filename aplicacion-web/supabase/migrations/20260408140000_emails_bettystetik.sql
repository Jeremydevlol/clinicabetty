-- Correos corporativos @bettystetik.com
-- Ejecutar en Supabase → SQL Editor (rol con acceso a auth).
-- Tras cambiar auth.users, conviene cerrar sesión y volver a entrar en la app.
--
-- Si el login muestra "Database error querying schema", ejecutá también la migración
-- 20260408160000_auth_users_fix_token_nulls.sql (columnas de token en auth.users no pueden ser NULL).

-- ─── 1) Betty: un usuario concreto (Auth + empleados + identidad email) ───
-- Email deseado: bettyceo@bettystetik.com  (si usás bettystik.com sin “e”, reemplazá el literal abajo)

update auth.users
set
  email = 'bettyceo@bettystetik.com',
  raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb),
  updated_at = now()
where id = '553911da-2dae-4f05-bc0a-7edccfbba188';

update auth.identities
set
  provider_id = 'bettyceo@bettystetik.com',
  identity_data = jsonb_set(
    coalesce(identity_data, '{}'::jsonb),
    '{email}',
    to_jsonb('bettyceo@bettystetik.com'::text),
    true
  ),
  updated_at = now()
where user_id = '553911da-2dae-4f05-bc0a-7edccfbba188'
  and provider = 'email';

update public.empleados
set
  email = 'bettyceo@bettystetik.com',
  updated_at = now()
where auth_user_id = '553911da-2dae-4f05-bc0a-7edccfbba188';

-- ─── 2) Todos los @gmail.com → @bettystetik.com (misma parte local) ───

-- Auth: usuarios
update auth.users
set
  email = regexp_replace(email, '@gmail\.com$', '@bettystetik.com', 'i'),
  updated_at = now()
where email ~* '@gmail\.com$';

-- Auth: identidades proveedor email (para que el login siga alineado)
update auth.identities
set
  provider_id = regexp_replace(provider_id, '@gmail\.com$', '@bettystetik.com', 'i'),
  identity_data = case
    when identity_data ? 'email' and (identity_data->>'email') ~* '@gmail\.com$' then
      jsonb_set(
        identity_data,
        '{email}',
        to_jsonb(regexp_replace(identity_data->>'email', '@gmail\.com$', '@bettystetik.com', 'i'))
      )
    else identity_data
  end,
  updated_at = now()
where provider = 'email'
  and (
    provider_id ~* '@gmail\.com$'
    or (identity_data->>'email') ~* '@gmail\.com$'
  );

-- Personal
update public.empleados
set
  email = regexp_replace(email, '@gmail\.com$', '@bettystetik.com', 'i'),
  updated_at = now()
where email ~* '@gmail\.com$';

-- Pacientes / fichas (opcional: descomentá si también querés unificar dominio en clientes)
-- update public.clientes
-- set email = regexp_replace(email, '@gmail\.com$', '@bettystetik.com', 'i')
-- where email ~* '@gmail\.com$';
