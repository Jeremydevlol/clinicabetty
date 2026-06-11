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
