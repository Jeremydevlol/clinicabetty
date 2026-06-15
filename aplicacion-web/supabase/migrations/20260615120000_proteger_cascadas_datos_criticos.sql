-- Protección contra pérdida de datos por ON DELETE CASCADE.
--
-- Incidente que motivó esta migración: al borrar un paciente (clientes), sus
-- consentimientos firmados se borraban en cascada (documento legal). El mismo
-- patrón afecta a historial clínico, movimientos contables/TPV y pagos de bonos:
-- todos colgaban de un padre con CASCADE, sin red de seguridad.
--
-- Esta migración cambia esas FK a ON DELETE RESTRICT: ya no se puede borrar un
-- paciente / clínica / bono si todavía tiene datos legales/clínicos/financieros
-- asociados. La app debe archivar (soft-delete) o exigir limpieza explícita antes.
--
-- Idempotente: localiza la FK existente sobre (tabla, columna) por catálogo,
-- la elimina y la recrea con RESTRICT. No depende del nombre del constraint.

do $$
declare
  fixes text[] := array[
    -- child_table | child_col | parent_table | parent_col
    'consentimientos_firmados|cliente_id|clientes|id',
    'consentimientos_firmados|clinic_id|clinics|id',
    'historial_clinico|cliente_id|clientes|id',
    'tpv_movimientos|clinic_id|clinics|id',
    'clinic_movimientos|clinic_id|clinics|id',
    'bonos_packs|clinic_id|clinics|id',
    'bonos_pagos|bono_id|bonos_packs|id',
    'bonos_pagos|clinic_id|clinics|id',
    'bonos_sesiones_uso|bono_id|bonos_packs|id',
    'bonos_sesiones_uso|clinic_id|clinics|id'
  ];
  spec text;
  parts text[];
  child_table text;
  child_col text;
  parent_table text;
  parent_col text;
  conname text;
begin
  foreach spec in array fixes loop
    parts := string_to_array(spec, '|');
    child_table := parts[1];
    child_col := parts[2];
    parent_table := parts[3];
    parent_col := parts[4];

    -- ¿existe la tabla hija? (si una migración previa no se aplicó, saltar)
    if to_regclass('public.' || child_table) is null then
      continue;
    end if;

    -- localizar el nombre real de la FK sobre child_table(child_col)
    select tc.constraint_name into conname
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = child_table
      and kcu.column_name = child_col
    limit 1;

    if conname is not null then
      execute format('alter table public.%I drop constraint %I', child_table, conname);
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%I(%I) on delete restrict',
      child_table, child_table || '_' || child_col || '_fkey', child_col, parent_table, parent_col
    );
  end loop;
end $$;
