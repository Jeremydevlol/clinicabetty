-- RLS explícita para compras, recepción, incidencias y traslados.
-- Objetivo:
-- - Gerente principal: acceso global
-- - Encargado/recepcionista/médico: acceso por su clinic_id

-- ──────────────────────────────────────────────────────────────
-- Helpers de autorización
-- ──────────────────────────────────────────────────────────────

create or replace function public.auth_es_gerente_principal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.empleados e
    where e.auth_user_id = auth.uid()
      and e.activo = true
      and e.rol = 'gerente'
      and coalesce(e.es_principal, false) = true
  );
$$;

create or replace function public.auth_clinic_id_operativo()
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select e.clinic_id
  from public.empleados e
  where e.auth_user_id = auth.uid()
    and e.activo = true
    and e.rol in ('encargado', 'medico', 'recepcionista')
  limit 1;
$$;

grant execute on function public.auth_es_gerente_principal() to authenticated;
grant execute on function public.auth_clinic_id_operativo() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- Enable RLS
-- ──────────────────────────────────────────────────────────────

alter table public.proveedores enable row level security;
alter table public.proveedor_productos enable row level security;
alter table public.pedidos_compra enable row level security;
alter table public.pedido_compra_items enable row level security;
alter table public.recepciones_compra enable row level security;
alter table public.recepcion_items enable row level security;
alter table public.incidencias_proveedor enable row level security;
alter table public.traslados_internos enable row level security;
alter table public.traslado_eventos enable row level security;

-- ──────────────────────────────────────────────────────────────
-- Proveedores (global catálogo compartido)
-- ──────────────────────────────────────────────────────────────

drop policy if exists "proveedores_select" on public.proveedores;
drop policy if exists "proveedores_write" on public.proveedores;

create policy "proveedores_select"
  on public.proveedores for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or public.auth_clinic_id_operativo() is not null
  );

create policy "proveedores_write"
  on public.proveedores for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or public.auth_clinic_id_operativo() is not null
  )
  with check (
    public.auth_es_gerente_principal()
    or public.auth_clinic_id_operativo() is not null
  );

drop policy if exists "proveedor_productos_select" on public.proveedor_productos;
drop policy if exists "proveedor_productos_write" on public.proveedor_productos;

create policy "proveedor_productos_select"
  on public.proveedor_productos for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or public.auth_clinic_id_operativo() is not null
  );

create policy "proveedor_productos_write"
  on public.proveedor_productos for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or public.auth_clinic_id_operativo() is not null
  )
  with check (
    public.auth_es_gerente_principal()
    or public.auth_clinic_id_operativo() is not null
  );

-- ──────────────────────────────────────────────────────────────
-- Pedidos compra + items
-- ──────────────────────────────────────────────────────────────

drop policy if exists "pedidos_compra_select" on public.pedidos_compra;
drop policy if exists "pedidos_compra_write" on public.pedidos_compra;

create policy "pedidos_compra_select"
  on public.pedidos_compra for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

create policy "pedidos_compra_write"
  on public.pedidos_compra for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  )
  with check (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

drop policy if exists "pedido_items_select" on public.pedido_compra_items;
drop policy if exists "pedido_items_write" on public.pedido_compra_items;

create policy "pedido_items_select"
  on public.pedido_compra_items for select to authenticated
  using (
    exists (
      select 1
      from public.pedidos_compra p
      where p.id = pedido_id
        and (
          public.auth_es_gerente_principal()
          or p.clinic_id = public.auth_clinic_id_operativo()
        )
    )
  );

create policy "pedido_items_write"
  on public.pedido_compra_items for all to authenticated
  using (
    exists (
      select 1
      from public.pedidos_compra p
      where p.id = pedido_id
        and (
          public.auth_es_gerente_principal()
          or p.clinic_id = public.auth_clinic_id_operativo()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.pedidos_compra p
      where p.id = pedido_id
        and (
          public.auth_es_gerente_principal()
          or p.clinic_id = public.auth_clinic_id_operativo()
        )
    )
  );

-- ──────────────────────────────────────────────────────────────
-- Recepciones + items
-- ──────────────────────────────────────────────────────────────

drop policy if exists "recepciones_select" on public.recepciones_compra;
drop policy if exists "recepciones_write" on public.recepciones_compra;

create policy "recepciones_select"
  on public.recepciones_compra for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

create policy "recepciones_write"
  on public.recepciones_compra for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  )
  with check (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

drop policy if exists "recepcion_items_select" on public.recepcion_items;
drop policy if exists "recepcion_items_write" on public.recepcion_items;

create policy "recepcion_items_select"
  on public.recepcion_items for select to authenticated
  using (
    exists (
      select 1
      from public.recepciones_compra r
      where r.id = recepcion_id
        and (
          public.auth_es_gerente_principal()
          or r.clinic_id = public.auth_clinic_id_operativo()
        )
    )
  );

create policy "recepcion_items_write"
  on public.recepcion_items for all to authenticated
  using (
    exists (
      select 1
      from public.recepciones_compra r
      where r.id = recepcion_id
        and (
          public.auth_es_gerente_principal()
          or r.clinic_id = public.auth_clinic_id_operativo()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.recepciones_compra r
      where r.id = recepcion_id
        and (
          public.auth_es_gerente_principal()
          or r.clinic_id = public.auth_clinic_id_operativo()
        )
    )
  );

-- ──────────────────────────────────────────────────────────────
-- Incidencias proveedor
-- ──────────────────────────────────────────────────────────────

drop policy if exists "incidencias_select" on public.incidencias_proveedor;
drop policy if exists "incidencias_write" on public.incidencias_proveedor;

create policy "incidencias_select"
  on public.incidencias_proveedor for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

create policy "incidencias_write"
  on public.incidencias_proveedor for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  )
  with check (
    public.auth_es_gerente_principal()
    or clinic_id = public.auth_clinic_id_operativo()
  );

-- ──────────────────────────────────────────────────────────────
-- Traslados internos + eventos
-- ──────────────────────────────────────────────────────────────

drop policy if exists "traslados_select" on public.traslados_internos;
drop policy if exists "traslados_write" on public.traslados_internos;

create policy "traslados_select"
  on public.traslados_internos for select to authenticated
  using (
    public.auth_es_gerente_principal()
    or origen_clinic_id = public.auth_clinic_id_operativo()
    or destino_clinic_id = public.auth_clinic_id_operativo()
  );

create policy "traslados_write"
  on public.traslados_internos for all to authenticated
  using (
    public.auth_es_gerente_principal()
    or origen_clinic_id = public.auth_clinic_id_operativo()
    or destino_clinic_id = public.auth_clinic_id_operativo()
  )
  with check (
    public.auth_es_gerente_principal()
    or origen_clinic_id = public.auth_clinic_id_operativo()
    or destino_clinic_id = public.auth_clinic_id_operativo()
  );

drop policy if exists "traslado_eventos_select" on public.traslado_eventos;
drop policy if exists "traslado_eventos_write" on public.traslado_eventos;

create policy "traslado_eventos_select"
  on public.traslado_eventos for select to authenticated
  using (
    exists (
      select 1
      from public.traslados_internos t
      where t.id = traslado_id
        and (
          public.auth_es_gerente_principal()
          or t.origen_clinic_id = public.auth_clinic_id_operativo()
          or t.destino_clinic_id = public.auth_clinic_id_operativo()
        )
    )
  );

create policy "traslado_eventos_write"
  on public.traslado_eventos for all to authenticated
  using (
    exists (
      select 1
      from public.traslados_internos t
      where t.id = traslado_id
        and (
          public.auth_es_gerente_principal()
          or t.origen_clinic_id = public.auth_clinic_id_operativo()
          or t.destino_clinic_id = public.auth_clinic_id_operativo()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.traslados_internos t
      where t.id = traslado_id
        and (
          public.auth_es_gerente_principal()
          or t.origen_clinic_id = public.auth_clinic_id_operativo()
          or t.destino_clinic_id = public.auth_clinic_id_operativo()
        )
    )
  );
