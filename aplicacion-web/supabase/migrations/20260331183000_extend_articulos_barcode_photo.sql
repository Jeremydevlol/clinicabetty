-- Campos extra para inventario moderno: código de barras y foto

alter table public.articulos
  add column if not exists codigo_barras text;

alter table public.articulos
  add column if not exists foto_url text default '';

alter table public.articulos
  add column if not exists proveedor text default '';
