-- Chats externos (WhatsApp, Instagram) + trazas para el agente BS CLINIQ.
-- Antes: Map en memoria (igService / Baileys). Aquí: persistencia y “memoria” (resumen + historial).
-- Escritura desde webhooks / servidor: usar SUPABASE_SERVICE_ROLE (bypass RLS) o service role en API routes.
-- Lectura: usuarios autenticados (misma lógica que leads_crm).

-- ─── Hilo (una fila por contacto+canal) ─────────────────────────

create table if not exists public.conversaciones_mensajeria (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          smallint references public.clinics (id) on delete set null,
  canal              text not null check (canal in ('whatsapp', 'instagram')),
  id_externo         text not null,
  nombre_display     text,
  -- UUID alineado con leads_crm.id (FK opcional al final del archivo si esa tabla existe)
  lead_id            uuid,
  cliente_id         int references public.clientes (id) on delete set null,
  agente_activo      boolean not null default true,
  -- Resumen en lenguaje natural (p. ej. último turno de un job que condensa N mensajes para el LLM)
  resumen_memoria    text,
  -- Metadatos: username IG, LID WA, handoff, etc.
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

-- ─── Mensajes (auditoría + contexto reciente) ─────────────────

create table if not exists public.mensajes_mensajeria (
  id                 bigserial primary key,
  conversacion_id    uuid not null references public.conversaciones_mensajeria (id) on delete cascade,
  -- contacto: paciente; clinica: humano; agente: BS CLINIQ; sistema: handoff, errores, etc.
  origen             text not null check (origen in ('contacto', 'clinica', 'agente', 'sistema')),
  cuerpo             text not null default '',
  -- p.ej. { "ig_mid", "wa_key_id", "modelo", "adjuntos" }
  meta               jsonb not null default '{}',
  created_at         timestamptz not null default now()
);

create index if not exists idx_men_conv_created on public.mensajes_mensajeria (conversacion_id, created_at desc);

-- Conocimiento entrenable del agente (alternativa/backup al JSON en disco; opcional vía app)
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

-- RLS: lectura y actualización (vínculo lead/cliente) para staff; altas desde servicio con service_role.
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

-- Mensajes: acceso vía conversación
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

-- Inserción: sin política = denegada para role authenticated; service_role hace bypass.

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

-- updated_at automático
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

-- Nota: política mensajes "insert" bloquea JWT; el servidor con service_role inserta sin pasar RLS.
comment on table public.conversaciones_mensajeria is 'Hilos WA/IG; resumen_memoria = memoria breve para el agente (además de mensajes en mensajes_mensajeria).';
comment on table public.mensajes_mensajeria is 'Log de mensajes; origen agente = BS CLINIQ. Escritura típica: service role.';
comment on table public.agente_conocimiento is 'Bloques de conocimiento por clínica (complementa .bs-cliniq-agent.json).';

-- Si ya aplicaste la migración de leads, añade la FK; si no, lead_id queda uuid suelto hasta entonces.
do $body$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'leads_crm'
  ) and not exists (
    select 1 from pg_constraint where conname = 'conversaciones_mensajeria_lead_id_fkey'
  ) then
    alter table public.conversaciones_mensajeria
      add constraint conversaciones_mensajeria_lead_id_fkey
      foreign key (lead_id) references public.leads_crm (id) on delete set null;
  end if;
end;
$body$;
