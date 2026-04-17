-- Consentimientos informados: plantillas + firmas por paciente (por clínica)
--
-- consentimiento_plantillas: catálogo de textos legales reutilizables (placeholders {{paciente_nombre}}, etc.).
-- consentimientos_firmados: una fila por documento ya generado/registrado para un cliente (auditoría).

create table if not exists public.consentimiento_plantillas (
  id          serial primary key,
  slug        text not null unique,
  titulo      text not null,
  categoria   text not null default 'tratamiento',
  cuerpo_texto text not null default '',
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.consentimiento_plantillas is 'Texto base con placeholders {{paciente_nombre}}, {{servicio_o_producto}}, {{fecha}}, {{centro}}';

create table if not exists public.consentimientos_firmados (
  id                        serial primary key,
  clinic_id                 smallint not null references public.clinics (id) on delete cascade,
  cliente_id                int not null references public.clientes (id) on delete cascade,
  turno_id                  int references public.turnos (id) on delete set null,
  plantilla_slug            text not null default '',
  titulo                    text not null,
  servicio_o_producto       text default '',
  paciente_nombre_snapshot  text not null,
  contenido_html            text default '',
  pdf_storage_path          text default '',
  firmado_at                timestamptz not null default now(),
  firmado_por_empleado_id   int references public.empleados (id) on delete set null,
  created_at                timestamptz not null default now()
);

comment on table public.consentimientos_firmados is 'Instancia firmada para un paciente; auditoría clínica';

create index if not exists idx_consent_firmados_clinic on public.consentimientos_firmados (clinic_id);
create index if not exists idx_consent_firmados_cliente on public.consentimientos_firmados (cliente_id);
create index if not exists idx_consent_firmados_fecha on public.consentimientos_firmados (firmado_at desc);

alter table public.consentimiento_plantillas enable row level security;
alter table public.consentimientos_firmados enable row level security;

-- Idempotente si se vuelve a ejecutar el script en el SQL editor
drop policy if exists "consent_plantillas_select" on public.consentimiento_plantillas;
drop policy if exists "consent_plantillas_write" on public.consentimiento_plantillas;
drop policy if exists "consent_firmados_select" on public.consentimientos_firmados;
drop policy if exists "consent_firmados_insert" on public.consentimientos_firmados;
drop policy if exists "consent_firmados_update" on public.consentimientos_firmados;
drop policy if exists "consent_firmados_delete" on public.consentimientos_firmados;

-- Lectura plantillas: todo personal autenticado (catálogo global)
create policy "consent_plantillas_select"
  on public.consentimiento_plantillas for select to authenticated
  using (true);

-- Solo gerente puede editar catálogo (MVP)
create policy "consent_plantillas_write"
  on public.consentimiento_plantillas for all to authenticated
  using (public.auth_es_gerente())
  with check (public.auth_es_gerente());

-- Firmados: gerente todo; resto vía cliente de su clínica
create policy "consent_firmados_select"
  on public.consentimientos_firmados for select to authenticated
  using (
    public.auth_es_gerente()
    or exists (
      select 1 from public.clientes c
      where c.id = consentimientos_firmados.cliente_id
        and c.clinic_id is not null
        and c.clinic_id = public.auth_clinic_id_staff()
    )
  );

create policy "consent_firmados_insert"
  on public.consentimientos_firmados for insert to authenticated
  with check (
    public.auth_es_gerente()
    or (
      clinic_id = public.auth_clinic_id_staff()
      and exists (
        select 1 from public.clientes c
        where c.id = cliente_id
          and c.clinic_id = consentimientos_firmados.clinic_id
      )
    )
  );

create policy "consent_firmados_update"
  on public.consentimientos_firmados for update to authenticated
  using (
    public.auth_es_gerente()
    or (
      clinic_id = public.auth_clinic_id_staff()
      and exists (
        select 1 from public.clientes c
        where c.id = consentimientos_firmados.cliente_id
          and c.clinic_id = public.auth_clinic_id_staff()
      )
    )
  )
  with check (
    public.auth_es_gerente()
    or (
      clinic_id = public.auth_clinic_id_staff()
      and exists (
        select 1 from public.clientes c
        where c.id = cliente_id
          and c.clinic_id = consentimientos_firmados.clinic_id
      )
    )
  );

create policy "consent_firmados_delete"
  on public.consentimientos_firmados for delete to authenticated
  using (public.auth_es_gerente());

-- Semilla mínima (ampliar desde la app o SQL)
insert into public.consentimiento_plantillas (slug, titulo, categoria, cuerpo_texto) values
(
  'toxina-botulinica',
  'Consentimiento — Toxina botulínica',
  'inyectable',
  E'CONSENTIMIENTO INFORMADO — TOXINA BOTULÍNICA\n\nPaciente: {{paciente_nombre}}\nTratamiento / zona: {{servicio_o_producto}}\nFecha: {{fecha}}\nCentro: {{centro}}\n\nDeclaro haber recibido información sobre el procedimiento, riesgos y alternativas, y firmo de forma libre y voluntaria.\n\nFirma paciente: __________________  Firma profesional: __________________\n'
),
(
  'acido-hialuronico',
  'Consentimiento — Ácido hialurónico',
  'inyectable',
  E'CONSENTIMIENTO INFORMADO — ÁCIDO HIALURÓNICO\n\nPaciente: {{paciente_nombre}}\nProcedimiento: {{servicio_o_producto}}\nFecha: {{fecha}}\nCentro: {{centro}}\n\nHe sido informado/a de riesgos, cuidados posteriores y contraindicaciones.\n\nFirma paciente: __________________  Firma profesional: __________________\n'
),
(
  'generico-tratamiento',
  'Consentimiento — Tratamiento (genérico)',
  'general',
  E'CONSENTIMIENTO INFORMADO\n\nPaciente: {{paciente_nombre}}\nServicio o producto: {{servicio_o_producto}}\nFecha: {{fecha}}\nCentro: {{centro}}\n\nDeclaro haber recibido la información necesaria y acepto el procedimiento.\n\nFirma paciente: __________________  Firma profesional: __________________\n'
)
on conflict (slug) do nothing;
