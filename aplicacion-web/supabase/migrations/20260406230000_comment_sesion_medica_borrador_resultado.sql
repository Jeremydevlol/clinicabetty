-- Sin columnas nuevas: textoResultado y fase "resultado" viven en el JSON sesion_medica_borrador.
comment on column public.turnos.sesion_medica_borrador is
  'Borrador sesión médica (JSON): wizardFase puede ser veredicto|propuesta_ia|registro|resultado|evaluacion|orden; incluye textoResultado, evaluacion, protocolo, fotos, etc.';
