-- Permitir borrar consentimientos firmados al personal de la clínica del paciente (no solo gerente).

DROP POLICY IF EXISTS "consent_firmados_delete" ON public.consentimientos_firmados;

CREATE POLICY "consent_firmados_delete"
  ON public.consentimientos_firmados FOR DELETE TO authenticated
  USING (
    public.auth_es_gerente()
    OR (
      clinic_id = public.auth_clinic_id_staff()
      AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = consentimientos_firmados.cliente_id
          AND c.clinic_id = public.auth_clinic_id_staff()
      )
    )
  );
