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
