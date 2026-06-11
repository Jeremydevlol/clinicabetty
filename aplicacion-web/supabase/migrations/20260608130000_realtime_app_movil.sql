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
