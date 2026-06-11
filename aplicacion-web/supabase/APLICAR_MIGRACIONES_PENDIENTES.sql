-- ═══════════════════════════════════════════════════════════════════
-- APLICAR MIGRACIONES PENDIENTES (BS CliniQ / app móvil ISOFT)
--
-- Pega TODO este archivo en: Supabase → SQL Editor → New query → Run.
-- Crea/alinea las tablas que faltan en la BD remota: TPV/Caja, cobros
-- pendientes, bonos, leads, mensajería, realtime y subida de fotos.
--
-- Es seguro re-ejecutarlo: todo usa `if not exists` / `drop ... if exists`
-- / `create or replace`. Depende de funciones ya existentes:
-- auth_es_gerente(), auth_clinic_id_staff().
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- 0) BASE TPV / COBROS / CONTABILIDAD (por si la tabla base no existe)
--    + columnas que el trigger de ingresos necesita en `turnos`.
-- ───────────────────────────────────────────────────────────────────

create table if not exists public.tpv_movimientos (
  id            serial primary key,
  fecha         date not null,
  clinic_id     smallint not null references public.clinics (id) on delete cascade,
  metodo        text not null,
  monto         numeric(12, 2) not null,
  concepto      text not null default '',
  comprobante   text default ''
);

create table if not exists public.clinic_movimientos (
  id            serial primary key,
  clinic_id     smallint not null references public.clinics (id) on delete cascade,
  tipo          text not null,
  fecha         date not null,
  concepto      text not null,
  cat           text not null default 'servicios',
  monto         numeric(12, 2) not null
);

create table if not exists public.alertas_cobro (
  id               serial primary key,
  clinic_id        smallint not null references public.clinics (id) on delete cascade,
  turno_id         int references public.turnos (id) on delete set null,
  cliente          text not null,
  servicio         text not null,
  servicio_id      int references public.servicios (id) on delete set null,
  monto_servicio   numeric(12, 2) not null default 0,
  monto_insumos    numeric(12, 2) not null default 0,
  monto_total      numeric(12, 2) not null default 0,
  insumos          jsonb not null default '[]',
  estado           text not null default 'pendiente',
  metodo_pago      text,
  creado           timestamptz not null default now()
);
create index if not exists idx_alertas_clinic_estado on public.alertas_cobro (clinic_id, estado);

-- Columnas que usa el trigger de ingresos al finalizar un turno
alter table public.turnos add column if not exists metodo_pago text default 'efectivo';
alter table public.turnos add column if not exists servicio_facturado_id int references public.servicios (id) on delete set null;

-- RLS de las tres tablas base
alter table public.tpv_movimientos  enable row level security;
alter table public.clinic_movimientos enable row level security;
alter table public.alertas_cobro     enable row level security;

drop policy if exists "tpv_all" on public.tpv_movimientos;
create policy "tpv_all" on public.tpv_movimientos for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

drop policy if exists "clinic_mov_all" on public.clinic_movimientos;
create policy "clinic_mov_all" on public.clinic_movimientos for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

drop policy if exists "alertas_all" on public.alertas_cobro;
create policy "alertas_all" on public.alertas_cobro for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());



-- ===================================================================
-- 20260421140000_leads_crm.sql
-- ===================================================================

-- Leads CRM (app móvil / integraciones). Misma jerarquía que `clientes`:
-- gerente ve todo; personal de clínica solo su `clinic_id`.

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


-- ===================================================================
-- 20260422120000_mensajeria_conversaciones.sql
-- ===================================================================

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


-- ===================================================================
-- 20260605120000_bonos_packs.sql
-- ===================================================================

-- Bonos / packs de sesiones por paciente.
-- Antes vivían solo en el estado local del front (data.bonosPacks) y se perdían
-- al recargar / reiniciar el backend. Esta tabla les da persistencia real.

create table if not exists public.bonos_packs (
  id              serial primary key,
  clinic_id       smallint not null references public.clinics (id) on delete cascade,
  paciente_id     integer references public.clientes (id) on delete set null,
  servicio_id     integer references public.servicios (id) on delete set null,
  nombre          text not null,
  sesiones_total  integer not null default 1 check (sesiones_total >= 1),
  sesiones_usadas integer not null default 0 check (sesiones_usadas >= 0),
  precio          numeric(12, 2) not null default 0,
  vence           date,
  obs             text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists idx_bonos_packs_clinic on public.bonos_packs (clinic_id);
create index if not exists idx_bonos_packs_paciente on public.bonos_packs (paciente_id);

alter table public.bonos_packs enable row level security;

-- Mismo modelo de acceso que compras/traslados:
--   gerente principal → global; resto → su clínica operativa.
drop policy if exists "bonos_packs_select" on public.bonos_packs;
drop policy if exists "bonos_packs_write" on public.bonos_packs;

create policy "bonos_packs_select"
  on public.bonos_packs for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

create policy "bonos_packs_write"
  on public.bonos_packs for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  )
  with check (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );


-- ===================================================================
-- 20260605180000_bonos_seguimiento.sql
-- ===================================================================

-- Seguimiento de bonos: pagos parciales + consumo por sesión.

alter table public.bonos_packs
  add column if not exists monto_pagado numeric(12, 2) not null default 0,
  add column if not exists estado text not null default 'activo';

alter table public.bonos_packs
  drop constraint if exists bonos_packs_estado_check;

alter table public.bonos_packs
  add constraint bonos_packs_estado_check
  check (estado in ('activo', 'agotado', 'vencido', 'cancelado'));

create table if not exists public.bonos_pagos (
  id           serial primary key,
  bono_id      integer not null references public.bonos_packs (id) on delete cascade,
  clinic_id    smallint not null references public.clinics (id) on delete cascade,
  monto        numeric(12, 2) not null default 0 check (monto >= 0),
  metodo_pago  text not null default 'efectivo',
  fecha        date not null default (current_date),
  notas        text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists idx_bonos_pagos_bono on public.bonos_pagos (bono_id);
create index if not exists idx_bonos_pagos_clinic on public.bonos_pagos (clinic_id);

create table if not exists public.bonos_sesiones_uso (
  id             serial primary key,
  bono_id        integer not null references public.bonos_packs (id) on delete cascade,
  clinic_id      smallint not null references public.clinics (id) on delete cascade,
  numero_sesion  integer not null check (numero_sesion >= 1),
  turno_id       integer references public.turnos (id) on delete set null,
  fecha          date not null default (current_date),
  cobro_monto    numeric(12, 2) not null default 0 check (cobro_monto >= 0),
  notas          text not null default '',
  created_at     timestamptz not null default now(),
  unique (bono_id, numero_sesion)
);

create index if not exists idx_bonos_sesiones_bono on public.bonos_sesiones_uso (bono_id);
create index if not exists idx_bonos_sesiones_turno on public.bonos_sesiones_uso (turno_id);

alter table public.turnos
  add column if not exists bono_id integer references public.bonos_packs (id) on delete set null;

-- Sincroniza monto_pagado desde la suma de abonos.
create or replace function public.bonos_sync_monto_pagado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bono_id integer;
begin
  v_bono_id := coalesce(new.bono_id, old.bono_id);
  update public.bonos_packs bp
  set monto_pagado = coalesce((
    select sum(p.monto) from public.bonos_pagos p where p.bono_id = v_bono_id
  ), 0)
  where bp.id = v_bono_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_bonos_sync_monto_pagado on public.bonos_pagos;
create trigger trg_bonos_sync_monto_pagado
after insert or update or delete on public.bonos_pagos
for each row execute function public.bonos_sync_monto_pagado();

-- Marca bono agotado al consumir todas las sesiones.
create or replace function public.bonos_sync_estado_sesiones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sesiones_usadas >= new.sesiones_total then
    new.estado := 'agotado';
  elsif new.estado = 'agotado' and new.sesiones_usadas < new.sesiones_total then
    new.estado := 'activo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bonos_sync_estado_sesiones on public.bonos_packs;
create trigger trg_bonos_sync_estado_sesiones
before update of sesiones_usadas on public.bonos_packs
for each row execute function public.bonos_sync_estado_sesiones();

alter table public.bonos_pagos enable row level security;
alter table public.bonos_sesiones_uso enable row level security;

drop policy if exists "bonos_pagos_select" on public.bonos_pagos;
drop policy if exists "bonos_pagos_write" on public.bonos_pagos;
drop policy if exists "bonos_sesiones_select" on public.bonos_sesiones_uso;
drop policy if exists "bonos_sesiones_write" on public.bonos_sesiones_uso;

create policy "bonos_pagos_select"
  on public.bonos_pagos for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

create policy "bonos_pagos_write"
  on public.bonos_pagos for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  )
  with check (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

create policy "bonos_sesiones_select"
  on public.bonos_sesiones_uso for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

create policy "bonos_sesiones_write"
  on public.bonos_sesiones_uso for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  )
  with check (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );


-- ===================================================================
-- 20260605150000_tpv_caja_sesiones.sql
-- ===================================================================

-- Apertura y cierre de caja TPV: fondo inicial, conteo de billetes/monedas, medios electrónicos.

create table if not exists public.tpv_caja_sesiones (
  id                        serial primary key,
  clinic_id                 smallint not null references public.clinics (id) on delete cascade,
  fecha                     date not null default current_date,
  estado                    text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  apertura_at               timestamptz not null default now(),
  cierre_at                 timestamptz,
  fondo_inicial             numeric(12, 2) not null default 0,
  conteo_apertura           jsonb not null default '{}',
  conteo_cierre_efectivo    jsonb not null default '{}',
  cierre_tarjeta            numeric(12, 2),
  cierre_transferencia      numeric(12, 2),
  cierre_banco              numeric(12, 2),
  teorico_efectivo          numeric(12, 2),
  teorico_tarjeta           numeric(12, 2),
  teorico_transferencia     numeric(12, 2),
  diferencia_efectivo       numeric(12, 2),
  diferencia_tarjeta        numeric(12, 2),
  diferencia_transferencia  numeric(12, 2),
  notas_cierre              text not null default '',
  abierto_por_empleado_id   int references public.empleados (id) on delete set null,
  cerrado_por_empleado_id   int references public.empleados (id) on delete set null,
  created_at                timestamptz not null default now()
);

create index if not exists idx_tpv_caja_clinic_fecha
  on public.tpv_caja_sesiones (clinic_id, fecha desc, apertura_at desc);

create unique index if not exists idx_tpv_caja_una_abierta_por_clinica
  on public.tpv_caja_sesiones (clinic_id)
  where estado = 'abierta';

alter table public.tpv_caja_sesiones enable row level security;

drop policy if exists "tpv_caja_all" on public.tpv_caja_sesiones;
create policy "tpv_caja_all"
  on public.tpv_caja_sesiones for all to authenticated
  using (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  )
  with check (
    public.auth_es_gerente()
    or clinic_id = public.auth_clinic_id_staff()
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tpv_caja_sesiones;
  end if;
exception
  when duplicate_object then null;
end $$;


-- ===================================================================
-- 20260605170000_tpv_movimientos_salidas.sql
-- ===================================================================

-- TPV: ingresos vs salidas de caja + categoría de salida

alter table public.tpv_movimientos
  add column if not exists tipo text not null default 'ingreso';

alter table public.tpv_movimientos
  add column if not exists cat_salida text not null default '';

alter table public.tpv_movimientos
  add column if not exists notas text not null default '';

alter table public.tpv_movimientos
  drop constraint if exists tpv_movimientos_tipo_check;

alter table public.tpv_movimientos
  add constraint tpv_movimientos_tipo_check
  check (tipo in ('ingreso', 'salida'));

create index if not exists idx_tpv_movimientos_clinic_fecha_tipo
  on public.tpv_movimientos (clinic_id, fecha desc, tipo);


-- ===================================================================
-- 20260605160000_sync_ingresos_split_contabilidad.sql
-- ===================================================================

-- Alinear trigger de ingresos con el split servicio/insumos del frontend (evita doble contabilidad)

create or replace function public.sync_ingresos_turno_finalizado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monto_total numeric(12,2);
  v_monto_servicio numeric(12,2);
  v_monto_insumos numeric(12,2);
  v_concepto_base text;
  v_concepto_srv text;
  v_concepto_ins text;
  v_comprobante text;
  v_metodo text;
begin
  if new.estado is distinct from 'finalizado' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.estado, '') = 'finalizado' then
    return new;
  end if;

  select
    coalesce(ac.monto_total, 0),
    coalesce(ac.monto_servicio, ac.monto_total, 0),
    coalesce(ac.monto_insumos, 0)
  into v_monto_total, v_monto_servicio, v_monto_insumos
  from public.alertas_cobro ac
  where ac.turno_id = new.id
  order by ac.id desc
  limit 1;

  if coalesce(v_monto_total, 0) <= 0 then
    v_monto_total := coalesce(
      (
        select s.precio
        from public.servicios s
        where s.id = new.servicio_facturado_id
        limit 1
      ),
      (
        select s.precio
        from public.servicios s
        where lower(trim(s.nombre)) = lower(trim(new.servicio))
        limit 1
      ),
      0
    )::numeric(12,2);
    v_monto_servicio := v_monto_total;
    v_monto_insumos := 0;
  end if;

  if coalesce(v_monto_total, 0) <= 0 then
    return new;
  end if;

  v_metodo := coalesce(nullif(trim(new.metodo_pago), ''), 'efectivo');
  v_concepto_base := format('Cobro turno #%s — %s', new.id, coalesce(new.cliente, 'Paciente'));
  v_concepto_srv := v_concepto_base || ' — servicio';
  v_concepto_ins := v_concepto_base || ' — insumos';
  v_comprobante := format('AUTO-TURNO-%s', new.id);

  insert into public.tpv_movimientos (fecha, clinic_id, metodo, monto, concepto, comprobante)
  select new.fecha, new.clinic_id, v_metodo, v_monto_total, v_concepto_base, v_comprobante
  where not exists (
    select 1 from public.tpv_movimientos tm where tm.comprobante = v_comprobante
  );

  if coalesce(v_monto_servicio, 0) > 0 then
    insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
    select new.clinic_id, 'ingreso', new.fecha, v_concepto_srv, 'servicios', v_monto_servicio
    where not exists (
      select 1
      from public.clinic_movimientos cm
      where cm.clinic_id = new.clinic_id
        and cm.concepto = v_concepto_srv
    );
  end if;

  if coalesce(v_monto_insumos, 0) > 0 then
    insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
    select new.clinic_id, 'ingreso', new.fecha, v_concepto_ins, 'materiales', v_monto_insumos
    where not exists (
      select 1
      from public.clinic_movimientos cm
      where cm.clinic_id = new.clinic_id
        and cm.concepto = v_concepto_ins
    );
  end if;

  if coalesce(v_monto_servicio, 0) <= 0 and coalesce(v_monto_insumos, 0) <= 0 then
    insert into public.clinic_movimientos (clinic_id, tipo, fecha, concepto, cat, monto)
    select new.clinic_id, 'ingreso', new.fecha, v_concepto_base, 'servicios', v_monto_total
    where not exists (
      select 1
      from public.clinic_movimientos cm
      where cm.clinic_id = new.clinic_id
        and (cm.concepto = v_concepto_base or cm.concepto ilike '%turno #' || new.id || '%')
    );
  end if;

  return new;
end;
$$;

-- Activar el trigger en turnos
drop trigger if exists trg_sync_ingresos_turno_finalizado on public.turnos;
create trigger trg_sync_ingresos_turno_finalizado
  after insert or update of estado
  on public.turnos
  for each row
  execute function public.sync_ingresos_turno_finalizado();


-- ===================================================================
-- 20260608130000_realtime_app_movil.sql
-- ===================================================================

-- ─────────────────────────────────────────────────────────────
-- Realtime para la app móvil (ISOFT / Doctor Fly)
-- Habilita la publicación `supabase_realtime` en las tablas que la app
-- observa para refrescar en vivo (citas, pacientes, historia, caja, chat…).
-- La RLS existente sigue aplicando: Realtime solo entrega filas que el
-- usuario autenticado puede ver (su clínica).
-- ─────────────────────────────────────────────────────────────

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
    'mensajes_mensajeria'
  ];
begin
  foreach t in array tablas loop
    -- Solo si la tabla existe en el esquema public.
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      -- Añadir a la publicación de Realtime si aún no está.
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;

      -- REPLICA IDENTITY FULL: que los eventos UPDATE/DELETE incluyan toda la fila
      -- (necesario para que la RLS de Realtime evalúe correctamente).
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;


-- ===================================================================
-- 20260608150000_storage_erp_media_insert_staff.sql
-- ===================================================================

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
