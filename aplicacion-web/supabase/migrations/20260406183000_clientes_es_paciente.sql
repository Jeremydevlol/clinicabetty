-- Cliente = agenda / ficha CRM; Paciente = ya inició atención en área médica.
alter table public.clientes add column if not exists es_paciente boolean not null default false;

comment on column public.clientes.es_paciente is 'True cuando ya inició sesión clínica (área médica). Agenda sola = false.';

-- Datos existentes: quienes ya tuvieron turno en curso / cobro / finalizado cuentan como paciente.
update public.clientes c
set es_paciente = true
where exists (
  select 1
  from public.turnos t
  where t.cliente_id = c.id
    and t.estado in ('en_curso', 'listo_cobrar', 'finalizado')
);
