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
