-- Alinear RLS de bonos con leads/tpv/alertas: cualquier gerente o staff de la clínica.
drop policy if exists "bonos_packs_select" on public.bonos_packs;
drop policy if exists "bonos_packs_write" on public.bonos_packs;
create policy "bonos_packs_select" on public.bonos_packs for select to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());
create policy "bonos_packs_write" on public.bonos_packs for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

drop policy if exists "bonos_pagos_select" on public.bonos_pagos;
drop policy if exists "bonos_pagos_write" on public.bonos_pagos;
create policy "bonos_pagos_select" on public.bonos_pagos for select to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());
create policy "bonos_pagos_write" on public.bonos_pagos for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

drop policy if exists "bonos_sesiones_select" on public.bonos_sesiones_uso;
drop policy if exists "bonos_sesiones_write" on public.bonos_sesiones_uso;
create policy "bonos_sesiones_select" on public.bonos_sesiones_uso for select to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());
create policy "bonos_sesiones_write" on public.bonos_sesiones_uso for all to authenticated
  using (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff())
  with check (public.auth_es_gerente() or clinic_id = public.auth_clinic_id_staff());

notify pgrst, 'reload schema';
