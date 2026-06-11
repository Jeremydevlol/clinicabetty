-- ═══════════════════════════════════════════════════════════════════
-- APLICAR TABLAS FALTANTES (BS CliniQ)
--
-- Pega TODO este archivo en: Supabase → SQL Editor → New query → Run.
-- Crea las tablas que faltan en la BD remota (CRM de leads + chat/mensajería)
-- y deja Realtime activo para la app móvil.
--
-- Es seguro re-ejecutarlo: todo usa `if not exists` / `drop ... if exists`.
-- Depende de funciones ya existentes: auth_es_gerente(), auth_clinic_id_staff().
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────
-- 1) LEADS CRM  (migración 20260421140000_leads_crm.sql)
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.leads_crm (
  id uuid primary key default gen_random_uuid(),
  clinic_id smallint not null references public.clinics (id) on delete cascade,
  name text,
  email text,
  phone text,
  company text,
  status text,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_crm_clinic on public.leads_crm (clinic_id);
create index if not exists idx_leads_crm_created_at on public.leads_crm (created_at desc);

alter table public.leads_crm enable row level security;

drop policy if exists "leads_crm_all" on public.leads_crm;
create policy "leads_crm_all"
  on public.leads_crm for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

-- ───────────────────────────────────────────────────────────────────
-- 2) MENSAJERÍA / CHAT  (migración 20260422120000_mensajeria_conversaciones.sql)
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.conversaciones_mensajeria (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          smallint references public.clinics (id) on delete set null,
  canal              text not null check (canal in ('whatsapp', 'instagram')),
  id_externo         text not null,
  nombre_display     text,
  lead_id            uuid,
  cliente_id         int references public.clientes (id) on delete set null,
  agente_activo      boolean not null default true,
  resumen_memoria    text,
  meta               jsonb not null default '{}',
  ultimo_mensaje_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (canal, id_externo)
);

create index if not exists idx_conv_men_clinic on public.conversaciones_mensajeria (clinic_id);
create index if not exists idx_conv_men_lead on public.conversaciones_mensajeria (lead_id);
create index if not exists idx_conv_men_cliente on public.conversaciones_mensajeria (cliente_id);
create index if not exists idx_conv_men_ultimo on public.conversaciones_mensajeria (ultimo_mensaje_at desc nulls last);

create table if not exists public.mensajes_mensajeria (
  id                 bigserial primary key,
  conversacion_id    uuid not null references public.conversaciones_mensajeria (id) on delete cascade,
  origen             text not null check (origen in ('contacto', 'clinica', 'agente', 'sistema')),
  cuerpo             text not null default '',
  meta               jsonb not null default '{}',
  created_at         timestamptz not null default now()
);

create index if not exists idx_men_conv_created on public.mensajes_mensajeria (conversacion_id, created_at desc);

create table if not exists public.agente_conocimiento (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     smallint references public.clinics (id) on delete cascade,
  titulo        text not null default '',
  texto         text not null,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_agente_conoc_clinic on public.agente_conocimiento (clinic_id) where activo = true;

alter table public.conversaciones_mensajeria enable row level security;
alter table public.mensajes_mensajeria enable row level security;
alter table public.agente_conocimiento enable row level security;

drop policy if exists "conv_men_all" on public.conversaciones_mensajeria;
drop policy if exists "conv_men_select" on public.conversaciones_mensajeria;
create policy "conv_men_select"
  on public.conversaciones_mensajeria for select to authenticated
  using (
    public.auth_es_gerente()
    or (clinic_id is not null and clinic_id = public.auth_clinic_id_staff())
  );

drop policy if exists "conv_men_update" on public.conversaciones_mensajeria;
create policy "conv_men_update"
  on public.conversaciones_mensajeria for update to authenticated
  using (
    public.auth_es_gerente()
    or (clinic_id is not null and clinic_id = public.auth_clinic_id_staff())
  )
  with check (
    public.auth_es_gerente()
    or (clinic_id is not null and clinic_id = public.auth_clinic_id_staff())
  );

drop policy if exists "men_men_select" on public.mensajes_mensajeria;
create policy "men_men_select"
  on public.mensajes_mensajeria for select to authenticated
  using (
    exists (
      select 1 from public.conversaciones_mensajeria c
      where c.id = mensajes_mensajeria.conversacion_id
        and (
          public.auth_es_gerente()
          or (c.clinic_id is not null and c.clinic_id = public.auth_clinic_id_staff())
        )
    )
  );

drop policy if exists "agente_conoc_all" on public.agente_conocimiento;
create policy "agente_conoc_all"
  on public.agente_conocimiento for all to authenticated
  using (
    public.auth_es_gerente()
    or (clinic_id is not null and clinic_id = public.auth_clinic_id_staff())
  )
  with check (
    public.auth_es_gerente()
    or (clinic_id is not null and clinic_id = public.auth_clinic_id_staff())
  );

create or replace function public.touch_conversacion_men_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_conv_men_updated on public.conversaciones_mensajeria;
create trigger trg_conv_men_updated
  before update on public.conversaciones_mensajeria
  for each row execute function public.touch_conversacion_men_updated_at();

create or replace function public.touch_mensajeria_ultimo()
returns trigger language plpgsql as $$
begin
  update public.conversaciones_mensajeria
  set ultimo_mensaje_at = new.created_at, updated_at = now()
  where id = new.conversacion_id;
  return new;
end;
$$;

drop trigger if exists trg_men_ultimo on public.mensajes_mensajeria;
create trigger trg_men_ultimo
  after insert on public.mensajes_mensajeria
  for each row execute function public.touch_mensajeria_ultimo();

-- FK conversaciones → leads_crm (ahora leads_crm ya existe).
do $body$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversaciones_mensajeria_lead_id_fkey'
  ) then
    alter table public.conversaciones_mensajeria
      add constraint conversaciones_mensajeria_lead_id_fkey
      foreign key (lead_id) references public.leads_crm (id) on delete set null;
  end if;
end;
$body$;

-- ───────────────────────────────────────────────────────────────────
-- 3) REALTIME para la app móvil (migración 20260608130000_realtime_app_movil.sql)
--    Añade a la publicación supabase_realtime + REPLICA IDENTITY FULL.
-- ───────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tablas text[] := array[
    'turnos',
    'clientes',
    'historial_clinico',
    'consentimientos_firmados',
    'articulos_por_clinica',
    'clinic_movimientos',
    'tpv_movimientos',
    'tpv_caja_sesiones',
    'conversaciones_mensajeria',
    'mensajes_mensajeria',
    'leads_crm'
  ];
begin
  foreach t in array tablas loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: permitir a empleados activos subir fotos clínicas (antes/durante/después)
-- al bucket `erp-media` desde la app móvil con su propio JWT.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from storage.buckets where id = 'erp-media') then
    drop policy if exists "erp_media_insert_staff" on storage.objects;
    create policy "erp_media_insert_staff"
      on storage.objects for insert
      to authenticated
      with check (
        bucket_id = 'erp-media'
        and public.auth_empleado_id() is not null
      );
  end if;
end $$;

-- Tras ejecutar: Supabase → Settings → API → "Reload schema" (o esperar ~30 s)
-- para que PostgREST refresque la caché y la app vea las tablas nuevas.
