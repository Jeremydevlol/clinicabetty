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
