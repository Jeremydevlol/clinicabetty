-- Compras, recepción con control de calidad, incidencias a proveedor y traslados internos.
-- Compatible con el esquema actual de Clinica ERP.

-- ──────────────────────────────────────────────────────────────
-- Proveedores
-- ──────────────────────────────────────────────────────────────

create table if not exists public.proveedores (
  id           serial primary key,
  nombre       text not null,
  contacto     text default '',
  tel          text default '',
  email        text default '',
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_proveedores_nombre on public.proveedores (nombre);

-- Catálogo por proveedor (qué vende y costo de referencia)
create table if not exists public.proveedor_productos (
  id              serial primary key,
  proveedor_id    int not null references public.proveedores (id) on delete cascade,
  articulo_id     int references public.articulos (id) on delete set null,
  nombre_producto text not null,
  costo_ref       numeric(12,2) not null default 0,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists idx_proveedor_productos_proveedor on public.proveedor_productos (proveedor_id);
create index if not exists idx_proveedor_productos_articulo on public.proveedor_productos (articulo_id);

-- ──────────────────────────────────────────────────────────────
-- Pedido de compra
-- ──────────────────────────────────────────────────────────────

create table if not exists public.pedidos_compra (
  id                 serial primary key,
  clinic_id          smallint not null references public.clinics (id) on delete cascade,
  proveedor_id       int not null references public.proveedores (id) on delete restrict,
  fecha              date not null default current_date,
  notas              text default '',
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'recibido', 'recibido_con_incidencia', 'cancelado')),
  total_estimado     numeric(12,2) not null default 0,
  creado_por_emp_id  int references public.empleados (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_pedidos_compra_clinic_estado on public.pedidos_compra (clinic_id, estado);
create index if not exists idx_pedidos_compra_proveedor on public.pedidos_compra (proveedor_id);

create table if not exists public.pedido_compra_items (
  id                serial primary key,
  pedido_id         int not null references public.pedidos_compra (id) on delete cascade,
  articulo_id       int references public.articulos (id) on delete set null,
  nombre_producto   text not null,
  cantidad_ordenada numeric(12,2) not null default 0 check (cantidad_ordenada >= 0),
  costo_unit        numeric(12,2) not null default 0,
  subtotal          numeric(12,2) generated always as (cantidad_ordenada * costo_unit) stored
);

create index if not exists idx_pedido_items_pedido on public.pedido_compra_items (pedido_id);

-- ──────────────────────────────────────────────────────────────
-- Recepción y control de calidad
-- ──────────────────────────────────────────────────────────────

create table if not exists public.recepciones_compra (
  id                   serial primary key,
  pedido_id            int not null references public.pedidos_compra (id) on delete cascade,
  clinic_id            smallint not null references public.clinics (id) on delete cascade,
  remito               text default '',
  observaciones        text default '',
  fotos_urls           jsonb not null default '[]',
  recibido_por_emp_id  int references public.empleados (id) on delete set null,
  created_at           timestamptz not null default now()
);

create index if not exists idx_recepciones_compra_pedido on public.recepciones_compra (pedido_id);

create table if not exists public.recepcion_items (
  id                   serial primary key,
  recepcion_id         int not null references public.recepciones_compra (id) on delete cascade,
  pedido_item_id       int references public.pedido_compra_items (id) on delete set null,
  articulo_id          int references public.articulos (id) on delete set null,
  nombre_producto      text not null,
  cantidad_esperada    numeric(12,2) not null default 0 check (cantidad_esperada >= 0),
  cantidad_recibida    numeric(12,2) not null default 0 check (cantidad_recibida >= 0),
  cantidad_mal_estado  numeric(12,2) not null default 0 check (cantidad_mal_estado >= 0),
  cantidad_faltante    numeric(12,2) generated always as (greatest(cantidad_esperada - cantidad_recibida, 0)) stored,
  cantidad_aceptada    numeric(12,2) generated always as (greatest(cantidad_recibida - cantidad_mal_estado, 0)) stored,
  lote                 text default '',
  nota_calidad         text default ''
);

create index if not exists idx_recepcion_items_recepcion on public.recepcion_items (recepcion_id);

-- ──────────────────────────────────────────────────────────────
-- Incidencias al proveedor
-- ──────────────────────────────────────────────────────────────

create table if not exists public.incidencias_proveedor (
  id                    serial primary key,
  clinic_id             smallint not null references public.clinics (id) on delete cascade,
  proveedor_id          int not null references public.proveedores (id) on delete restrict,
  pedido_id             int references public.pedidos_compra (id) on delete set null,
  recepcion_id          int references public.recepciones_compra (id) on delete set null,
  producto              text not null,
  esperado              numeric(12,2) not null default 0,
  recibido              numeric(12,2) not null default 0,
  faltante              numeric(12,2) not null default 0,
  malo                  numeric(12,2) not null default 0,
  lote                  text default '',
  nota                  text default '',
  fotos_urls            jsonb not null default '[]',
  estado                text not null default 'abierta' check (estado in ('abierta', 'en_gestion', 'resuelta', 'rechazada')),
  resolucion            text default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_incidencias_proveedor_clinic_estado on public.incidencias_proveedor (clinic_id, estado);
create index if not exists idx_incidencias_proveedor_proveedor on public.incidencias_proveedor (proveedor_id);

-- ──────────────────────────────────────────────────────────────
-- Traslados internos entre clínicas
-- ──────────────────────────────────────────────────────────────

create table if not exists public.traslados_internos (
  id                    serial primary key,
  origen_clinic_id      smallint not null references public.clinics (id) on delete restrict,
  destino_clinic_id     smallint not null references public.clinics (id) on delete restrict,
  articulo_id           int references public.articulos (id) on delete set null,
  producto_nombre       text not null,
  cantidad              numeric(12,2) not null check (cantidad > 0),
  estado                text not null default 'solicitado' check (estado in ('solicitado', 'en_transito', 'recibido', 'rechazado', 'cancelado')),
  nota                  text default '',
  solicitado_por_emp_id int references public.empleados (id) on delete set null,
  enviado_por_emp_id    int references public.empleados (id) on delete set null,
  recibido_por_emp_id   int references public.empleados (id) on delete set null,
  creado_at             timestamptz not null default now(),
  enviado_at            timestamptz,
  recibido_at           timestamptz
);

create index if not exists idx_traslados_origen_estado on public.traslados_internos (origen_clinic_id, estado);
create index if not exists idx_traslados_destino_estado on public.traslados_internos (destino_clinic_id, estado);

-- Opcional: historial de cambios de estado / auditoría de traslado
create table if not exists public.traslado_eventos (
  id               serial primary key,
  traslado_id      int not null references public.traslados_internos (id) on delete cascade,
  evento           text not null,
  payload          jsonb not null default '{}',
  actor_emp_id     int references public.empleados (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_traslado_eventos_traslado on public.traslado_eventos (traslado_id);
