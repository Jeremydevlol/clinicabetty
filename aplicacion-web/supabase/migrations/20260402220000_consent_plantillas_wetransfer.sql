-- Plantillas desde WeTransfer (textos legales de la clínica para el catálogo consentimiento_plantillas).
-- No son datos de pacientes: son modelos; al firmar en la app se guarda la copia en consentimientos_firmados.
-- Generado con scripts/generate_consent_plantillas_sql.py — no editar a mano salvo urgencia.
-- Ejecutar después de 20260402210000_consentimientos_firmados.sql

insert into public.consentimiento_plantillas (slug, titulo, categoria, cuerpo_texto) values
  ('acido-hialuronico', 'ACIDO HIALURÓNICO', 'inyectable', $c0$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO	                                
NOMBRE:	                     APELLIDOS:
NIF/NIE:                                                                                     E-MAIL FECHA NACIMIENTO:                                                              TFNO:
DATOS DEL CENTRO                                                                 Nº COLEGIADO
ACIDO HIALURONICO
TECNICA: El objetivo de la técnica es conseguir un relleno dérmico en el tratamiento de arrugas, cicatrices, deformidades del contorno o aumento de labios.  El ácido hialurónico es una sustancia producida naturalmente por el cuerpo humano, aumenta la lubricación y la hidratación y reduce el desgaste del cartílago.  El tratamiento consiste en inyectar en la piel una sustancia sintética para producir un relleno dérmico.  La duración del efecto obtenido es variable dependiendo de las características propias de la persona y su capacidad regeneradora.  Se podrá realizar retoques tras su absorción completa o parcial para mantener el efecto deseado bajo el criterio y valoración sanitaria. Puede ser necesaria la aplicación de anestesia tópica o local bajo criterio sanitario.
RIESGOS: Sera necesario informar sobre alergias, alteraciones o enfermedades que puedan afectar al procedimiento. Se producirán pequeños puntos de inserción que serán tratados como heridas y por lo tanto cualquier riesgo derivado de ello o de un mal cuidado: hinchazón, enrojecimiento, dolor, escozor, reacciones alérgicas, hematomas o infección, deberás informarnos de ello.  Si existe herpes deberá ser tratado previamente y posteriormente al tratamiento bajo indicación sanitaria.  Estos síntomas desaparecerán espontáneamente tras varios días habitualmente. Excepcionalmente pueden aparecer reacciones tardías, abscesos o necrosis.
INDICACIONES: Tras el procedimiento es conveniente que realice los cuidados necesarios para conseguir los resultados óptimos del tratamiento.
-No realizar deporte o ejercicio en las 48 horas siguientes
-No realizar actividades que produzcan sudoración en la zona en 48horas.
-No aplicar calor a la zona en 48 horas.
-No exposición solar en 48 horas.
-Evitar reposar o aplicar presión sobre la zona infiltrada.
-No manipular la zona infiltrada en los próximos 7 días.
-No aplicar cremas ni maquillajes sobre la zona en 48 horas.
-Aplicar tratamiento indicado para inflamación o dolor en la zona.
CONTRAINDICACIONES: Embarazo, alergia severa al ácido hialurónico o manitol, avisar en caso de alergia a lidocaína.
Se me ha facilitado esta informativa, habiendo comprendido el significado del procedimiento y los riesgos inherentes al mismo y declaro estar debidamente informada, habiendo tenido la oportunidad de aclarar mis dudas en entrevista personal con el personal sanitario. Asimismo, he recibido respuesta a todas mis preguntas, habiendo tomado la decisión de manera libre y voluntaria.
INFORMACION BASICA SOBRE PROTECCION DE DATOS: Se me ha informado de que BEATRIZ ELIANA SALAZAR OSORIO es Responsable del tratamiento de mis datos personales y se me informa de que estos datos serán tratados de conformidad con lo dispuesto en el reglamento (UE) 2016/679, de 27 de abril (GDPR) y la ley orgánica 3/2008 de 5 de diciembre (LOPDGDD), con la finalidad de mantener una relación de servicios ( en base a una relación contractual, obligación legal o interés legítimo) y serán conservados durante no mas tiempo del necesario para mantener el fin del tratamiento o mientras exista prescripciones legales que dictaminen su custodia.  No se comunicará los datos a terceros, salvo obligación legal.  Asimismo, se me informa de que puedo ejercer los derechos de acceso, rectificación, portabilidad, y supresión de mis datos y los de limitación y oposición a su tratamiento dirigiéndome a BEATRIZ ELIANA SALAZAR OSORIO, en Calle San Antonio de Padua, 10 Madrid, E-mail: bettystetik3@gmail.com
En___________________ a____________ de__________________ de_____________________
Fdo Paciente:                                                               Fdo Madre, Padre o Tutor                                           Fdo Sanitario:$c0$),
  ('acido-polilactico', 'ACIDO POLILÁCTICO', 'inyectable', $c1$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO SOBRE EL TRATAMIENTO CON ÁCIDO POLILÁCTICO
Es utilizado en el colagenización en forma de microesferas suspendidas en un gel infiltrable.
El ácido poliláctico que aplicamos en Bettystetik consiste en un producto biocompatible (es reabsorbible) y no alérgico y cuyo efecto es de larga duración.
La lista de sus usos más comunes:
	•	Restauración de homogeneidad plano sub-cutánea.
	•	Colagenización.
	•	Depresiones por cicatrices y otras atrofias cutáneas.
	•	Restructuración dinámica facial.
	•	Líneas de marioneta. -	Surco nasogeniano.
VENTAJAS:
El tratamiento con ácido poliláctico es mínimamente invasivo, muy rápido y consigue efectos inmediatos.
El ácido poliláctico tendrá una duración aproximada de 20 a 25 meses con efecto evidente a partir de los 4 a 6 meses.
El paciente puede volver a su domicilio tras la aplicación del tratamiento, ya que únicamente se utiliza una anestesia tópica localizada en el punto de inyección.
Los resultados de un tratamiento con ácido poliláctico son muy naturales.
Con las ventajas adicionales de que el producto es biocompatible, reabsorbible y no alérgico.
EFECTOS SECUNDARIOS:
Un tratamiento con ácido poliláctico puede presentar algunos efectos secundarios, que desaparecen en unas 12 horas. Los efectos secundarios más frecuentes son los siguientes: Enrojecimiento, hematomas, inflamación de la zona.
Habiendo leído, y comprendido en su totalidad este documento, autorizo al 
Dr.___________________________________________________________ para comenzar el tratamiento con Ácido Poliláctico en la zona de ______________________________
En____________________ a _____ de ______________ de __________
EL PACIENTE.
INFORMACION BASICA SOBRE PROTECCION DE DATOS
Se me ha informado de que BEATRIZ ELIANA SALAZAR OSORIO S.L.U. es responsable del tratamiento de mis datos personales y se me informa de que estos datos serás tratados de conformidad con lo dispuesto en el reglamento (UE) 2016/679, de 27 de 
abril (GDPR), y la ley Orgánica 3/2018, de 5 de diciembre, con la finalidad de mantener una relación de servicio (en base a una relación contractual, obligación legal o interés legítimo) y serán conservados durante no mas tiempo del necesario para mantener el fin del tratamiento o mientras existan prescripciones legales que dictaminen su custodia. No se comunicarán los datos a terceros, salvo obligación legal. Así mismo, se me informa de que puedo ejercer los derechos de acceso, rectificación, portabilidad y supresión de mis datos y los de limitación y oposición a 
EL MEDICO.
Fdo.______________________________ Fdo._____________________________ 
D.N.I nº ___________________________ Nº COLEGIADO: ___________________$c1$),
  ('carboxi', 'CARBOXI', 'inyectable', $c2$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CARBOXITERAPIA
Procedimiento realizado a través de inyección de gas carbónico con fines terapéuticos.
Mecanismo de acción: 
	•	Vasodilatación arterial: aumento de diámetro basal, aumento de flujo sanguíneo e hiperemia (Efecto inmediato).
	•	Angiogénesis: efecto tardío (10 a 12 sesiones).
	•	Potenciación de efeto Bohr: Aumenta intercambio O2-CO2 por la hemoglobina al interior del eritrocito.
	•	Estimulación de receptores B3 adrenérgicos: Aumento de adenilatociclasa, aumento de AmpC, aumento de protein kinasa (pKa) que estimula LHS (hormona lipasa sensible) lo que traduce en lipolisis de adipocitos.
	•	Aumento de recambio 1:1 de 02-CO2 (entre más CO2 como producto de desecho más O2 como producto incremental. 
Indicaciones:
	•	Medicas: insuficiencia venosa, ulceras en miembros inferiores, lipomatosis múltiple simétrica, psoriasis, artritis, disfunción eréctil, entre otras.
	•	Estéticas:
	•	PEFE – Paniculopatia edemato fibro esclerótica (celulitis): Aumento de oxigenación, aumento de irrigación, disminución de acumulo intersticial.
	•	Estrías/flacidez, aumento de la estimulación de fibroblastos, aumento de colágeno y del grosor dérmico.
	•	Grasa localizada
	•	Alopecia
	•	Pre y posquirúrgico
Contraindicaciones:
	•	Hipertensión arterial severa
	•	EPOC.
	•	Embarazo
	•	Insuficiencia renal
	•	Insuficiencia hepática
	•	Expectativas irreales
Prospecto de seguridad:
	•	Dosis fisiológicas basales de expiración de CO2: 200ml/min
	•	Dosis fisiológicas en ejercicio: más de 2000ml/min
Efectos adversos:
	•	Dolor, que aumenta por flujos altos y despegamiento epidérmico (flujo ideal menos a 50ml) -	Aumento de temperatura. -	Hematomas de origen mecánico -	Enfisema subcutáneo.
Protocolo:
	•	Temporalidad: 10-12 sesiones (1,2 o 3 por semana).
	•	Volumen$c2$),
  ('consentimiento-informado-acido-hialuronico-aesthetic', 'CONSENTIMIENTO INFORMADO ACIDO HIALURONICO AESTHETIC', 'inyectable', $c3$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO

NOMBRE:				                     APELLIDOS:
NIF/NIE:                                                                                     E-MAIL
FECHA NACIMIENTO:                                                              TFNO:

DATOS DEL CENTRO                                                                 Nº COLEGIADO

ACIDO HIALURÓNICO
TECNICA: El objetivo de la técnica es conseguir un relleno dérmico en el tratamiento de arrugas, cicatrices, deformidades del contorno o aumento de labios.  El ácido hialurónico es una sustancia producida naturalmente por el cuerpo humano, aumenta la lubricación y la hidratación y reduce el desgaste del cartílago.  El tratamiento consiste en inyectar en la piel una sustancia sintética para producir un relleno dérmico.  La duración del efecto obtenido es variable dependiendo de las características propias de la persona y su capacidad regeneradora.  Se podrá realizar retoques tras su absorción completa o parcial para mantener el efecto deseado bajo el criterio y valoración sanitaria. Puede ser necesaria la aplicación de anestesia tópica o local bajo criterio sanitario.
RIESGOS: Sera necesario informar sobre alergias, alteraciones o enfermedades que puedan afectar al procedimiento. Se producirán pequeños puntos de inserción que serán tratados como heridas y por lo tanto cualquier riesgo derivado de ello o de un mal cuidado: hinchazón, enrojecimiento, dolor, escozor, reacciones alérgicas, hematomas o infección, deberás informarnos de ello.  Si existe herpes deberá ser tratado previamente y posteriormente al tratamiento bajo indicación sanitaria.  Estos síntomas desaparecerán espontáneamente tras varios días habitualmente. Excepcionalmente pueden aparecer reacciones tardías, abscesos o necrosis.
INDICACIONES: Tras el procedimiento es conveniente que realice los cuidados necesarios para conseguir los resultados óptimos del tratamiento.
-No realizar deporte o ejercicio en las 48 horas siguientes
-No realizar actividades que produzcan sudoración en la zona en 48horas.
-No aplicar calor a la zona en 48 horas.
-No exposición solar en 48 horas.
-Evitar reposar o aplicar presión sobre la zona infiltrada.
-No manipular la zona infiltrada en los próximos 7 días.
-No aplicar cremas ni maquillajes sobre la zona en 48 horas.
-Aplicar tratamiento indicado para inflamación o dolor en la zona.
CONTRAINDICACIONES: Embarazo, alergia severa al ácido hialurónico o manitol, avisar en caso de alergia a lidocaína.
Se me ha facilitado esta informativa, habiendo comprendido el significado del procedimiento y los riesgos inherentes al mismo y declaro estar debidamente informada, habiendo tenido la oportunidad de aclarar mis dudas en entrevista personal con el personal sanitario. Asimismo, he recibido respuesta a todas mis preguntas, habiendo tomado la decisión de manera libre y voluntaria.

INFORMACION BASICA SOBRE PROTECCION DE DATOS: Se me ha informado de que BEATRIZ ELIANA SALAZAR OSORIO es Responsable del tratamiento de mis datos personales y se me informa de que estos datos serán tratados de conformidad con lo dispuesto en el reglamento (UE) 2016/679, de 27 de abril (GDPR) y la ley orgánica 3/2008 de 5 de diciembre (LOPDGDD), con la finalidad de mantener una relación de servicios ( en base a una relación contractual, obligación legal o interés legítimo) y serán conservados durante no mas tiempo del necesario para mantener el fin del tratamiento o mientras exista prescripciones legales que dictaminen su custodia.  No se comunicará los datos a terceros, salvo obligación legal.  Asimismo, se me informa de que puedo ejercer los derechos de acceso, rectificación, portabilidad, y supresión de mis datos y los de limitación y oposición a su tratamiento dirigiéndome a BEATRIZ ELIANA SALAZAR OSORIO, en Calle San Antonio de Padua, 10 Madrid, E-mail: bettystetik3@gmail.com

En___________________ a____________ de__________________ de_____________________
Fdo Paciente:                                                               Fdo Madre, Padre o Tutor                                           Fdo Sanitario:$c3$),
  ('corposhape', 'CORPOSHAPE', 'corporal', $c4$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO – TRATAMIENTO CON MÁQUINA CORPOSHAPE

Clínica Aesthetic Goya
Consentimiento informado para tratamiento corporal con equipo CorpoShape

Nombre del paciente: _______________
Fecha de nacimiento: ________
DNI / Identificación: ________

1. Descripción del procedimiento

El tratamiento CorpoShape consiste en la aplicación de tecnología avanzada para remodelación corporal no invasiva, que combina radiofrecuencia, cavitación y vacío (según el programa seleccionado).
El objetivo del tratamiento es reducir la grasa localizada, mejorar la flacidez y estimular la producción de colágeno, favoreciendo la firmeza y tonicidad de la piel.

Se aplica mediante un cabezal que emite energía controlada sobre la superficie cutánea, generando un calentamiento profundo y uniforme en el tejido adiposo y dérmico.

⸻

2. Objetivos del tratamiento
	•	Reducir el volumen y la grasa localizada.
	•	Mejorar la apariencia de la celulitis.
	•	Favorecer la firmeza y elasticidad cutánea.
	•	Estimular la circulación y el drenaje linfático.

⸻

3. Posibles efectos secundarios y riesgos

El tratamiento es seguro y no invasivo; sin embargo, pueden presentarse efectos leves y transitorios como:
	•	Enrojecimiento o calor local.
	•	Ligera inflamación o sensibilidad al tacto.
	•	En raras ocasiones: pequeños hematomas, sensación de hormigueo o molestias leves.

El paciente entiende que los resultados pueden variar según la zona tratada, la cantidad de sesiones, el tipo de piel y los hábitos de vida.

⸻

4. Contraindicaciones
	•	Embarazo o lactancia.
	•	Marcapasos o prótesis metálicas en la zona tratada.
	•	Enfermedades cardíacas, renales o hepáticas graves.
	•	Infecciones o heridas cutáneas activas.
	•	Trastornos circulatorios severos o cáncer activo.

⸻

5. Cuidados posteriores
	•	Mantener una adecuada hidratación antes y después del tratamiento.
	•	Evitar comidas copiosas, alcohol o cafeína el mismo día de la sesión.
	•	No exponer la zona al calor directo (sol, sauna, etc.) durante 24 horas.
	•	Seguir el plan de alimentación y ejercicio recomendado por el profesional.

⸻

6. Consentimiento

Declaro que he sido informado/a de forma clara sobre el tratamiento CorpoShape, sus beneficios, posibles riesgos y cuidados posteriores.
He tenido oportunidad de hacer preguntas y todas han sido respondidas satisfactoriamente.
Autorizo voluntariamente la realización del tratamiento en la Clínica Aesthetic Goya.

Firma del paciente: __________   Fecha: __ / _ / ___
Firma del profesional: _________  Colegiado nº: _____$c4$),
  ('ems', 'EMS', 'corporal', $c5$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO – TRATAMIENTO CON TECNOLOGÍA EMS

Clínica Aesthetic Goya
Consentimiento informado para tratamiento con tecnología EMS (Electro Muscle Stimulation)

Nombre del paciente: ___________________________________________
Fecha de nacimiento: ______________________
DNI / Identificación: ______________________

⸻

1. Descripción del procedimiento

El tratamiento con tecnología EMS utiliza impulsos eléctricos controlados para estimular las fibras musculares, generando contracciones similares a las que se producen durante el ejercicio físico.
El objetivo es fortalecer, tonificar y reafirmar la musculatura, ayudando a mejorar el contorno corporal y la circulación sanguínea.

El procedimiento es no invasivo y se realiza con un equipo médico-estético especializado bajo supervisión profesional.

⸻

2. Objetivos del tratamiento
	•	Aumentar la tonicidad y fuerza muscular.
	•	Reafirmar y remodelar zonas corporales.
	•	Reducir grasa localizada y mejorar la apariencia de la piel.
	•	Favorecer la circulación y el drenaje linfático.

⸻

3. Posibles efectos secundarios y riesgos
	•	Enrojecimiento o calor local leve.
	•	Sensación de fatiga muscular temporal.
	•	Molestias similares a las de un entrenamiento físico.
	•	En casos raros: irritación cutánea o contracturas pasajeras.

Los resultados pueden variar según la condición física y número de sesiones realizadas.

⸻$c5$),
  ('exoxomas-dermapen-e-inyectado', 'Exoxomas dermapen e inyectado', 'inyectable', $c6$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

TRATAMIENTO CON EXOSOMAS + DERMAPEN / INYECTADO

Nombre del paciente: _____________
Documento de identidad: ____________
Fecha de nacimiento: ____________
Teléfono: _______________

Nombre del profesional: ____________
Registro profesional (si aplica): ________
Clínica / Centro estético: ___________
Fecha: _________________

⸻

1. DESCRIPCIÓN DEL TRATAMIENTO

Se me ha explicado que el tratamiento consiste en la aplicación y/o inyección de exosomas, combinados con microneedling (Dermapen), con el objetivo de mejorar la calidad de la piel, estimular la regeneración celular, favorecer la producción de colágeno y mejorar textura, tono, cicatrices, líneas finas u otros fines estéticos.

⸻

2. BENEFICIOS ESPERADOS

Entiendo que los posibles beneficios incluyen, pero no se limitan a:
	•	Mejora en la textura y luminosidad de la piel
	•	Estimulación de la regeneración celular
	•	Apariencia más uniforme
	•	Mejora progresiva con sesiones repetidas

Reconozco que los resultados pueden variar según el tipo de piel, edad, hábitos y respuesta individual.

⸻

3. RIESGOS Y POSIBLES EFECTOS ADVERSOS

Se me ha informado que este procedimiento puede presentar los siguientes riesgos o efectos secundarios:
	•	Enrojecimiento, inflamación o sensibilidad temporal
	•	Dolor o molestia durante o después del procedimiento
	•	Pequeños sangrados o hematomas
	•	Riesgo de infección si la piel no cicatriza adecuadamente
	•	Reacciones alérgicas o inflamatorias
	•	Hiperpigmentación postinflamatoria
	•	Formación de nódulos o irregularidades (en caso de inyección)
	•	Resultados no satisfactorios o diferentes a los esperados

Entiendo que los exosomas son una terapia biológica emergente y que, aunque existen estudios y experiencia clínica, no hay garantía absoluta de seguridad o resultados.

⸻

4. CONTRAINDICACIONES

Declaro que NO presento, o he informado previamente si presento:
	•	Embarazo o lactancia
	•	Infecciones cutáneas activas
	•	Enfermedades autoinmunes no controladas
	•	Tendencia a cicatrices queloides
	•	Uso reciente de isotretinoína (Accutane)
	•	Alergias conocidas no informadas

⸻

5. CUIDADOS POST-TRATAMIENTO

Entiendo que debo:
	•	Evitar exposición solar directa
	•	Usar protector solar
	•	No aplicar maquillaje o productos irritantes según indicación
	•	Seguir estrictamente las recomendaciones del profesional

El incumplimiento puede afectar los resultados y aumentar riesgos.

⸻

6. CONSENTIMIENTO

Declaro que:
	•	He recibido información clara y comprensible
	•	He podido hacer preguntas y todas han sido respondidas
	•	Comprendo los riesgos, beneficios y alternativas
	•	Acepto voluntariamente realizarme el tratamiento

Autorizo al profesional a realizar el procedimiento descrito.

⸻

Firma del paciente: _________
Nombre: _____________
Fecha: ______________

Firma del profesional: _________
Fecha: ______________$c6$),
  ('fhos-consentimiento-informado-vs-corta', 'FHOS Consentimiento informado vs corta', 'inyectable', $c7$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO TRATAMIENTO FHOS & PROCYON
En (Lugar/Fecha):
D/Dña: 	con DNI: 	 	 
Domicilio 
CP
,
 
Ciudad
 
 
CP
,
 
Ciudad
 
Que por el presente SOLICITO Y AUTORIZO que me realicen tratamientos con la cosmética FHOS bioluminiscente y la plataforma lumínica PROCYON en el Centro de
. 	Declaro 	que 	previamente 	al 
tratamiento se me ha explicado verbalmente siendo de mi total satisfacción y comprensión tanto la información recibida respecto al procedimiento, la tecnología utilizada, mi compromiso a seguir las pautas recibidas, instrucciones del uso, características y contraindicaciones del tratamiento. He sido informad@ del tratamiento estético que deseo recibir y sobre su porcentaje de éxito, el uso de pautas y/o cosméticos previos y posteriores que debo realizar y que para cualquier duda sobre mi salud o sobre el tratamiento debo consultar a mi médico previamente, siendo informada/o que es un tratamiento idóneo para personas sanas exclusivamente.
Declaro que se me ha informado clara y detalladamente de la naturaleza del procedimiento estético con FHOS bioluminiscente y PROCYON utilizado en cuyos fines estéticos son:
	 	Realizar tratamientos faciales y corporales estéticos.
PROCYON es una plataforma lumínica multidisciplinar que emite luz pulsada de última generación. El principio empleado es la emisión de un haz luminoso con un espectro de onda entre 420 – 1200nm. que penetra en la piel.
	•	El tratamiento FHOS bioluminiscente consta de la aplicación de una cosmética de última generación, la cual es activada por la energía lumínica emitida por la plataforma PROCYON. Cabe mencionar, que, pese a no ser un procedimiento centrado en realizar termólisis en la piel, sí puede darse un ligero aumento de la temperatura del área tratada.
	•	Me han informado de la necesidad de realizar varias sesiones por zona que realizaré cada semana hasta completar los fines deseados.
Se me han aclarado los pasos que se seguirán e instrucciones en el uso que se hará con FHOS & PROCYON sobre la zona contratada de forma sencilla y comprensible para mí y que acepto.
Soy consciente por todo lo anterior de que los resultados pueden variar, según factores individuales, por lo que estoy informada/o de las instrucciones del tratamiento y de sus contraindicaciones. Especificaciones y consecuencias entre otras de la tecnología utilizada con FHOS & PROCYON y en especial lo que yo solicito y autorizo que se me practiquen sobre zona acordada.
PROCEDIMIENTO
El mecanismo de actuación de la Luz es triple, actúa sobre la dermis superficial, con el objetivo de ayudar a la penetración de los activos aplicados, mejorar la textura y apariencia de la piel, inducir remodelamiento del colágeno, y conseguir una piel más regular, luminosa y suave. A diferencia de los tratamientos estéticos faciales y corporales ablativos, la epidermis no resulta vaporizada, por lo que la recuperación es rápida, y el número de efectos adversos y complicaciones recogidos en la literatura, es mínimo.
PRECAUCIONES
Debo evitar medicamentos con ácidos frutales (por ejemplo, ácidos azeláico, ascórbico, vitamina A y sus derivados, Roa-cutan), no debe utilizarse conjuntamente con corticoides, cremas depilatorias, ceras, peelings químicos ni, en general, otros productos cosméticos distintos a los aconsejados en los tratamientos, puesto que pueden interferir en el resultado perseguido. No exponerse al sol entre sesiones de tratamientos estéticos faciales ni corporales. Es imprescindible el uso de protección solar, mínimo SPF 30, tras la realización de los tratamientos. No acudir a saunas, piscinas ni gimnasios en las 24horas siguientes
CONTRAINDICACIONES:
El tratamiento no debe realizarse en los siguientes casos:
Exposición al sol o rayos UVA entre sesiones en tratamientos estéticos faciales y corporales. la aplicación de lociones autobronceadoras o activadores solares. No seguir estas precauciones puede provocar un hipo/hiperpigmentación transitoria que pudiese durar una media de 1 año.
Embarazadas, o aquellas mujeres que tienen la creencia de poder estarlo.
Tratamientos con fármacos fotosensibles (Accutane, Tetraciclina, Retin A..) o anticoagulantes. 
Medicamentos fotosensibles.
Epilepsia (por la sensibilidad al destello del flash).
Migraña con aura (salvo autorización previa de su médico). 
Diabetes (sólo con consentimiento médico).
Hemofilia
Personas con propensión a tener infecciones con herpes simple en el lado superior. Tampoco en patologías de la piel como psoriasis, eczema, acné...
Desarreglos o problemas hormonales (hirsutismo...) Manchas en la piel no identificadas.
Personas con marcapasos.
Cáncer o tumores en fase acitva (menos de 5 años, sin alta médica
Por precaución se evitará cualquier tipo de estimulación mecánica previa sobre la zona.
Es imprescindible una protección adecuada de los ojos durante el tratamiento (gafas especiales).
Está contraindicado en áreas micro pigmentadas y tatuajes. De realizar el tratamiento en zonas cercanas, procederemos a cubrir la zona pigmentada con lápiz blanco y esparadrapo de papel.
Deberá consultar a un médico en cualquier caso de duda previamente a contratar al tratamiento. Sólo se permite el tratamiento en personas sanas con la piel completamente sana y libre de enfermedades.
CONSECUENCIAS Y EFECTOS SECUNDARIOS:
En la mayoría de los casos no se observan efectos secundarios indeseables. Ocasionalmente, pudiera producirse una lesión superficial (grado I), similar a una pequeña lesión solar, qué tratada adecuadamente con los productos aconsejados (bajo supervisión médica) remitirá.
Aun realizando una valoración inicial y una aplicación correcta, es posible que durante o al final del tratamiento puedan aparecer sensaciones de ligero dolor, escozor o picor. La piel puede mostrar signos de ligera irritación o sequedad, eritema (enrojecimiento) transitorio. Menos frecuentemente y con carácter transitorio, signos de hipo o hiperpigmentación, , erosiones, lesiones, eritema, erupciones. Descamación de la epidermis, inflamación de la zona trabajada.
Se me ha explicado los cuidados que debo seguir para evitar estos efectos secundarios graves, como el consumo de alcohol, drogas y o realizar grandes ingestas.
He leído y comprendido dicho consentimiento, declaro haber manifestado total veracidad sobre mi salud al exponer mi historial, pues es de mi absoluta responsabilidad.
CONFIRMO, que, tras la realización de las exploraciones y la elaboración de un diagnóstico personalizado, se me ha informado detalladamente y de forma comprensible del efecto (sesiones aproximadas) y la naturaleza del procedimiento a realizar, así como de los riesgos y las posibles alteraciones que pudieran conducir a una no efectividad del tratamiento. Doy fe asimismo de no haber omitido ni alterado ninguno de los datos de la ficha de diagnóstico ni de mi historial médico y clínico quirúrgico; En especial, aquellos que pudieran afectar de un modo directo o indirecto al tratamiento. Del mismo modo, asumo personalmente todos y cada uno de los posibles riesgos derivados del tratamiento de los cuales he sido informado, otorgando el consentimiento para que se me efectúe el tratamiento con la Plataforma Lumínica Procyon. 

Firmado por el cliente	                                      Firmado por el o la técnico$c7$),
  ('hidrolipoclasia', 'HIDROLIPOCLASIA', 'corporal', $c8$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

Clínica Aesthetic Goya
Consentimiento informado para tratamiento de hidrolipoclasia

Nombre del paciente: ___________________________________________
Fecha de nacimiento: ______________________
DNI / Identificación: ______________________

⸻

1. Descripción del procedimiento

La hidrolipoclasia es un procedimiento médico-estético destinado a reducir el tejido graso localizado.
Consiste en la infiltración de una solución acuosa (suero fisiológico u otras sustancias compatibles) en el tejido adiposo, seguida de la aplicación de ultrasonido o radiofrecuencia, lo que provoca la ruptura de los adipocitos y su eliminación progresiva a través del sistema linfático y urinario.

⸻

2. Objetivos del tratamiento
	•	Reducir el volumen de grasa localizada en zonas específicas.
	•	Mejorar el contorno corporal y la apariencia de la piel.
	•	Favorecer el drenaje y la eliminación de grasa.

⸻

3. Posibles efectos secundarios y riesgos

Pueden presentarse reacciones leves y transitorias como:
	•	Dolor, , ardor o inflamación local.
	•	Hematomas, enrojecimiento o sensibilidad.
	•	En raros casos: infección, fibrosis local o irregularidades cutáneas.

El paciente entiende que los resultados pueden variar y que el procedimiento no sustituye una liposucción quirúrgica.

⸻

4. Contraindicaciones
	•	Embarazo o lactancia.
	•	Infecciones cutáneas activas en la zona tratada.
	•	Enfermedades hepáticas, renales o cardiovasculares graves.
	•	Diabetes no controlada o alteraciones de la coagulación.
	•	Uso de anticoagulantes o corticoides sistémicos.

⸻

5. Cuidados posteriores
	•	Beber abundante agua después del tratamiento.
	•	Evitar ejercicio intenso o exposición al calor el mismo día.
	•	No masajear la zona a menos que lo indique el profesional.
	•	Mantener una dieta equilibrada y realizar actividad física regular.

⸻

6. Consentimiento

Declaro que he sido informado/a sobre la hidrolipoclasia, su naturaleza, beneficios, riesgos y alternativas.
He comprendido las indicaciones y cuidados posteriores, y consiento de forma libre y voluntaria la realización del tratamiento en la Clínica Aesthetic Goya.

Firma del paciente: _____________________________   Fecha: ___ / ___ / _____
Firma del profesional: __________________________  Colegiado nº: ______________$c8$),
  ('hidroxiapatita-calcica', 'HIDROXIAPATITA CALCICA', 'inyectable', $c9$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO SOBRE EL TRATAMIENDO CON HIDROXIAPATITA CALCICA
Es utilizado en el relleno facial en forma de microesferas de fosfato de calcio suspendidas en un gel infiltrable.
La hidroxiapatita cálcica que aplicamos en Bettystetik consiste en un producto biocompatible (es reabsorbible) y no alérgico y cuyo efecto es de larga duración.
La lista de sus usos más comunes:
	•	Arrugas en la barbilla.
	•	Arrugas peribucales (código de barras).
	•	Defectos en nariz.
	•	Depresiones por cicatrices y otras atrofias cutáneas.
	•	Falta de volumen en manos.
	•	Líneas de marioneta. -	Surco nasogeniano.
VENTAJAS:
El tratamiento con hidroxiapatita cálcica es mínimamente invasivo, muy rápido y consigue efectos inmediatos.
El paciente puede volver a su domicilio tras la aplicación del tratamiento, ya que únicamente se utiliza una anestesia tópica localizada en el punto de inyección.
Los resultados de un tratamiento con hidroxiapatita cálcica son muy naturales.
Con las ventajas adicionales de que el producto es biocompatible, reabsorbible y no alérgico.
EFECTOS SECUNDARIOS:
Un tratamiento con hidroxiapatita cálcica puede presentar algunos efectos secundarios, que desaparecen en unas 12 horas. Los efectos secundarios más frecuentes son los siguientes: Enrojecimiento, hematomas, inflamación de la zona.
INFORMACION BASICA SOBRE PROTECCION DE DATOS
Se me ha informado de que BEATRIZ ELIANA SALAZAR OSORIO S.L.U. es responsable del tratamiento de mis datos personales y se me informa de que estos datos serás tratados de conformidad con lo dispuesto en el reglamento (UE) 2016/679, de 27 de 
abril (GDPR), y la ley Orgánica 3/2018, de 5 de diciembre, con la finalidad de mantener una relación de servicio (en base a una relación contractual, obligación legal o interés legítimo) y serán conservados durante no mas tiempo del necesario para mantener el fin del tratamiento o mientras existan prescripciones legales que dictaminen su custodia. No se comunicarán los datos a terceros, salvo obligación legal. Así mismo, se me informa de que puedo ejercer los derechos de acceso, rectificación, portabilidad y supresión de mis datos y los de limitación y oposición a 
Habiendo leído, y comprendido en su totalidad este documento, autorizo al 
Dr.___________________________________________________________ para comenzar el tratamiento con Hidroxiapatita Cálcica en la zona de ______________________________
En____________________ a _____ de ______________ de __________
EL PACIENTE.	EL MEDICO.
Fdo.______________________________	Fdo._____________________________
D.N.I nº ___________________________	Nº COLEGIADO: ___________________$c9$),
  ('hifu-corporal', 'HIFU CORPORAL', 'corporal', $c10$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO PARA TRATAMIENTO HIFU FACIAL Y CORPORAL

Centro / Clínica: __________
Paciente: ___________
DNI/NIE: ___________
Fecha: __ / __ / ___

⸻

1. ¿En qué consiste el tratamiento HIFU corporal?

El tratamiento HIFU corporal (Ultrasonido Focalizado de Alta Intensidad) es un procedimiento no invasivo que utiliza energía ultrasónica para generar calor en capas profundas de la piel y tejido subcutáneo, con el fin de mejorar la firmeza, reducir adiposidad localizada y estimular la producción de colágeno.

⸻

2. Objetivo del tratamiento

El objetivo es mejorar:
	•	La flacidez corporal.
	•	La firmeza del tejido.
	•	El contorno corporal.
	•	La calidad de la piel.

El paciente entiende que los resultados pueden variar, y no están garantizados.

⸻

3. Indicaciones y número de sesiones

El número de sesiones recomendadas dependerá de la evaluación profesional y de la zona tratada. El paciente ha sido informado de que los resultados son progresivos y pueden observarse entre 8 y 12 semanas después.

⸻

4. Procedimiento

Durante el tratamiento, el dispositivo de HIFU se aplica sobre la piel con un gel conductor. Puede generar sensación de calor o leves molestias controladas.

⸻

5. Contraindicaciones

El paciente declara que *NO presenta ninguna de las siguientes condiciones:
	•	Embarazo o lactancia.
	•	Marcapasos u otros dispositivos electrónicos implantados.
	•	Enfermedades autoinmunes activas.
	•	Infecciones, heridas o lesiones en la zona a tratar.
	•	Problemas de coagulación o toma de anticoagulantes.
	•	Implantes metálicos en la zona de tratamiento.
	•	Historial de queloides severos.
	•	Neuropatías o alteraciones de sensibilidad en la zona.

(El paciente debe informar de cualquier medicación o condición médica relevante.)

⸻

6. Posibles efectos secundarios

El paciente ha sido informado de que pueden aparecer:
	•	Enrojecimiento temporal.
	•	Hormigueo, tirantez o calor en la zona.
	•	Leve inflamación.
	•	Sensibilidad al tacto.
	•	Raros casos de pequeños hematomas o molestias musculares.
	•	Cambios temporales en la sensibilidad.

Estos efectos suelen ser leves y transitorios.

⸻

7. Riesgos poco frecuentes
	•	Quemaduras leves.
	•	Alteraciones nerviosas temporales.
	•	Dolor prolongado.
	•	Resultados insuficientes o asimetrías.

⸻

8. Cuidados posteriores

El paciente se compromete a seguir las recomendaciones dadas por la clínica, como:
	•	Evitar calor excesivo (saunas, solarium) durante 48–72 h.
	•	Hidratación adecuada.
	•	Evitar ejercicio muy intenso las primeras 24 h.
	•	No aplicar productos irritantes en la zona durante 48 h.

⸻

9. Alternativas al tratamiento

El paciente ha sido informado de alternativas como radiofrecuencia, aparatología reductora, cirugía estética (liposucción), o no realizar ningún tratamiento.

⸻

10. Consentimiento del paciente

Declaro que:
	•	He recibido información clara del procedimiento, beneficios, riesgos y alternativas.
	•	He podido hacer todas las preguntas necesarias y han sido respondidas satisfactoriamente.
	•	Entiendo que los resultados no están garantizados y dependen de factores individuales.
	•	Acepto voluntariamente realizarme el tratamiento HIFU corporal.

⸻

Firma del paciente: ___________

Firma del profesional: _________

Fecha: __ / __ / ___$c10$),
  ('hilos', 'HILOS', 'inyectable', $c11$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO SOBRE HILOS TENSORES
TÉCNICA:  Se trata de una técnica invasiva con introducción subcutánea de hilos compuestos por polidioxanona (PDO), un componente reabsorbible y antialérgico.
Los hilos tensores ayudan a tensar y recolocar la piel que se ha descolgado por la edad. De ese modo, proporciona a la dermis una mayor firmeza y tersura, elevando los tejidos faciales. Por su efectividad, es uno de los tratamientos antiaging más demandados. La acción de los hilos tensores trabaja a nivel subcutáneo. En este sentido, hay que tener en cuenta que la polidioxanona estimula la producción natural de elastina y colágeno alrededor de las hebras insertadas. El resultado es un lifting facial sin cirugía, con lo que se logra disminuir la flacidez y recuperar la firmeza y elasticidad de la piel. Estará mucho más suave y luminosa, visiblemente rejuvenecida. El tratamiento con hilos tensores está especialmente recomendado para hombres y mujeres que deseen revertir los primeros signos de la edad en la piel, como las arrugas o los surcos demasiado profundos. Hay que señalar que esta técnica no es aconsejable para pieles maduras, con flacidez excesiva o arrugas muy pronunciadas. Si bien los primeros efectos son visibles al cabo de una hora, el resultado óptimo se consigue 3 meses después de la implantación de los hilos mágicos. A pesar de que el organismo los reabsorbe en un plazo de 6 a 8 meses, su efecto reafirmante se mantendrá durante un año o año y medio, dado que la envoltura de colágeno subcutánea que se ha generado permanece. En algunos casos, la duración puede prolongarse hasta los 2 años.
POSIBLES COMPLICACIONES:  Será necesario informar sobre alergias, alteraciones o enfermedades que puedan afectar al procedimiento. Se producen infiltraciones y aplicación de cosméticos, y por lo tanto cualquier riesgo derivado de ello o de un mal cuidado posterior puede producir: hinchazón, enrojecimiento, dolor, escozor, reacciones alérgicas, hematomas o infección. Si existe herpes deberá ser tratado previamente y posteriormente al tratamiento bajo indicación sanitaria. Estos síntomas desaparecerán espontáneamente tras varios días habitualmente.
INDICACIONES:  Tras el procedimiento es conveniente que realice los cuidados necesarios para conseguir los resultados óptimos del tratamiento.
	•	No realizar deporte o ejercicio en las 24h siguientes.
	•	No realizar actividades que puedan someter a golpes la zona tratada en el primer mes.
	•	No realizar actividades que produzcan sudoración en la zona en 24h.
	•	No aplicar calor en la zona en 24h.
	•	No exposición solar en 24h y aplicación de protección solar continua.
	•	No manipular la zona tratada en 48h.
	•	No aplicar cremas ni maquillaje sobre la zona tratada en 24h.
	•	Aplicar tratamiento indicado por profesional sanitario en caso necesario (frio local y/o analgesia)
CONTRAINDICACIONES:
	•	Embarazo.
	•	Heridas abiertas en la zona del tratamiento.
	•	Infecciones activas en la zona del tratamiento.
Se me ha facilitado esta hoja informativa, habiendo comprendido el significado del procedimiento y los riesgos inherentes al mismo y declaro estar debidamente informado/a, habiendo tenido la oportunidad de aclarar mis dudas en entrevista personal con el personal sanitario. Asimismo, he recibido respuesta a todas mis preguntas, habiendo tomado la decisión de manera libre y voluntaria.
INFORMACIÓN BASICA SOBRE PROTECCION DE DATOS: Se me ha informado de que BEATRIZ ELIANA SALAZAR 
OSORIO S.L.U. es responsable del tratamiento de mis datos personales y se me informa de que estos serán tratados de conformidad con lo dispuesto en el Reglamento (UE) 2016/679, de 27 de abril (GDPR), y la ley Orgánica 3/2018, de 5 de diciembre (LOPDGDD), con la finalidad de mantener una relación de servicios (en base a una relación contractual, obligación legal o interés legítimo) y serán conservados durante no mas del tiempo necesario para mantener el fin del tratamiento o mientras existan prescripciones legales que dictaminen su custodia. No se comunicarán los datos a terceros, salvo obligación legal. Asimismo, se me informa de que puedo ejercer los derechos de acceso, rectificación, portabilidad y supresión de mis datos y los de limitación y oposición a su tratamiento dirigiéndome a BEATRIZ ELIANA SALAZAR OSORIO S.L.U en Calle San Antonio de Padua, 10 – 28026 Madrid – España. Email: bettystetik3@gmail.com

En____________________________ a __________ de _____________________ del_______________
	Fdo. Paciente: 	Fdo. Padre, Madre o Tutor:	Fdo Sanitario:$c11$),
  ('ley-de-proteccion-de-datos-bs', 'LEY DE PROTECCIÓN DE DATOS BS', 'legal', $c12$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

• 16110/?5, 12:51	Cláusula información Contrato 
Cláusula información Contrato I Documento I Grupo Átic034
Estimado cliente por medio de la presente y de acuerdo al Reglamento General de Protección de Datos relativo a la protección de las personas fisicas en lo que respecta al tratamiento de datos personales y a la libre circulación de estos datos (RGPD), le facilitamos la siguiente información detallada del tratamiento de datos personales:
Responsable del tratamiento:
Sus datos pasarán a formar parte de un fichero titularidad de BETTYSTETIK, S.LaU, con CIF/NIF no : B 16360604 y domicilio social en: C/ Calle San Antonio De Padua, IO. , 28026 - Madrid (Madrid).
Finalidad del tratamiento:
Desarrollar y cumplir con las obligaciones previstas en el contrato, o relación jurídico-negocial, que le vincula con BETTYSTETIK, S.L.U.
Conservación de datos:
Sus datos serán conservados durante el plazo legalmente establecido.
Legitimación:
La legitimación para la recogida de sus datos se basa en el contrato suscrito o en su relación jurídico-negocial con BETTYSTETIK, S.L.U.
Destinatarios:
Sus datos no serán cedidos para ofras finalidades distintas a las anteriormente descritas, salvo obligación legal, si bien podrán ser transmitidos a los proveedores de servicios que estén vinculados por contrato encargo de tratamiento con BETTYSTETIK, S.L.U.
Derechos:
Puede ejercer sus derechos de acceso, rectificación, cancelación, limitación, portabilidad y oposición al tratamiento de sus datos cuando se den determinadas circunstancias, en cuyo caso únicamente serán conservados para el cumplimiento de las obligaciones legalmente previstas.
Para ejercer los derechos anteriormente descritos deberá dirigirse a BETTYSTETIK, S.L.U, con CIF/NIF no : B 16360604 y domicilio social en: C/ Calle San Antonio De Padua, IO. , 28026 - Madrid (Madrid).
De igual modo, le informamos de que la Agencia Española de Protección de Datos es el órgano competente destinado a la tutela de estos derechos.
Con la finalidad de mantener actualizados los datos, el cliente deberá comunicar cualquier cambio que se produzca sobre los mismos.
Compromiso de confidencialidad:
De igual modo, de acuerdo al artículo 32 del RGPD, relativo al deber de secreto profesional,
BETTYSTETIK, S.L.U se compromete a guardar la confidencialidad de los datos de carácter personal, subsistiendo esta obligación con posterioridad a la finalización, por cualquier causa, de la relación entre Usted y BETTYSTETIK, S.L.U
	16/10/25, 12:51	Cláusula información Contrato 
ACEPTO que BETTYSTETIK, S.L.U me remita comunicaciones a través de e-mail, SMS, 0 sistemas de mensajería instantánea como Whatsapp, con el objetivo de mantenerme informado/a del desarrollo de las actividades propias del servicio contratado.
a ACEPTO Y SOLICITO EXPRESAMENTE, la recepción de comunicaciones comerciales por vía electrónica (e-mail, Whatsapp, bluetooth, por parte BETTYSTETIK, s.L.U, productos, servicios, promociones y ofertas de mi interés.
	Ena	dede 20

Cliente (nombre, apellidos y firma):

	25. 12:55	Consentimiento Pacientes 
Consentimiento - Pacientes I Documento I Grupo Átic034
En aras a dar cumplimiento al Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo, de 27 de abril de 2016 y siguiendo las Recomendaciones emitidas por la Agencia Española de Protección de Datos (A.E.P.D.),
	•	Los datos de carácter personal solicitados y facilitados por Usted, son incorporados a un fichero de titularidad privada cuyo responsable y único destinatario es BETTYSTETIK, S.L.U.
	•	Solo serán solicitados aquellos datos estrictamente necesarios para prestar adecuadamente el servicio sanitario, pudiendo ser necesario recoger datos de contacto de terceros, tales como representantes legales, tutores, o personas a cargo designadas por los mismos.
	•	Como profesionales de la sanidad, garantizamos que todos los datos recogidos cuentan con el compromiso de confidencialidad y cumplen con las medidas de seguridad establecidas legalmente. Bajo ningún concepto susodichos datos serán cedidos o tratados por terceras personas -fisicas o jurídicas- sin el previo consentimiento del paciente, tutor o representante legal, salvo en aquellos casos en los que fuere imprescindible para la correcta prestación del servicio. 
	•	Una vez finalizada la relación entre la empresa y el paciente, los datos serán archivados y conservados durante un periodo de tiempo mínimo de 5 años desde la última visita, tras lo cual, podrán continuar archivados, o en su defecto, serán devueltos íntegramente al' paciente o autorizado l'egal, o destruidos por procedimientos seguros que garanticen la confidencialidad de la información sensible.
	•	Los datos facilitados serán incluidos en el tratamiento denominado Pacientes de BETTYSTETIK, S.L.U, con la finalidad de gestionar el tratamiento médico, emitir facturas, gestiones relacionadas con el paciente, contacto, manifiestos de consentimiento, etc.
Puede ejercitar los, derechos, de acceso, rectificación, cancelación, limitación, oposición y portabilidad, indicándolo por escrito a BETTYSTETIK, S.L.U, con domicilio en: C/ Calle San Antonio De Padua, 10. , 28026 - Madrid (Madrid).
	•	Los datos personales facilitados podrán ser cedidos por BETTYSTETIK, S.L.U a las entidades que prestan servicios a la misma.
Además de las cláusulas anteriores le solicitamos el consentimiento para:
a ACEPTO que BETTYSTETIK, S.L.U me remita comunicaciones informativas a través de e-mail, SMS, o sistemas de mensajería instantánea como Whatsapp, con el objetivo de mantenerme informado/a del desarrollo de las actividades propias del servicio contratado, enviarme recordatorios de mis citas, así como remitirme infonnes relativos a la prestación asistencial acordada entre ambas partes.
a ACEPTO Y SOLICITO EXPRESAMENTE, la recepción de comunicaciones comerciales por vía electrónica (e-mail, Whatsapp, bluetooth, SMS), por parte de BETTYSTETIK, S.L.U, sobre productos, servicios, promociones y ofertas de mi interés.
	En	a	de	de 20

	Nombre y apellidos (paciente):	-DNI:

	Representante legal (menores de edad):	-DNI:

1/2

16/10/25, 12:53	Consentimiento - Publicación de imágenes en redes sociales, sitios web, etc. 
Consentimiento - Publicación de imágenes en redes sociales, sitios web, etc. I Documento I Grupo
034
Con la inclusión de las nuevas tecnologías dentro de las comunicaciones, publicaciones y acciones comerciales que puede realizar BETTYSTETIK, S.L.U y la posibilidad de que en estas puedan aparecer los datos personales y/o imágenes que ha proporcionado a nuestra empresa dentro del vínculo comercial existente;
Y dado que el derecho a la propia imagen está reconocido en el artículo 18 de la Constitución y regulado por la Ley 1/1982, de 5 de mayo, sobre el derecho al honor, a la intimidad personal y familiar y a la propia imagen y el Reglamento General de Protección de Datos relativo a la protección de las personas fisicas en lo referente al tratamiento de datos personales y a la libre circulación de estos datos (RGPD),
BETTYSTETIK, S.L.U, pide el consentimiento a los clientes para poder publicar las imágenes en las cuales aparezcan individualmente o en grupo que con carácter comercial se puedan realizar a los clientes, en las diferentes secuencias y actividades realizadas -en nuestras instalaciones y fuera de las mismas- en actividades contratadas con nuestra empresa.
Don / Doña:, con DNI no autorizo a BETTYSTETIK, S.L.U a un uso de las imágenes realizadas en servicios contratados con vuestra empresa y publicadas en:
• La página web y perfiles en redes SOcia1es de la empresa.
	•	Filmaciones destinadas a la difusión comercial.
	•	Fotografias para' revistas y/o publicaciones de ámbito relacionado con el sector.
Ende	de 20
Firmado (clientela):

1/1$c12$),
  ('mesoterapia', 'MESOTERAPIA', 'inyectable', $c13$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO DE MESOTERAPIA
TÉCNICA: 
Es una técnica poco invasiva, cuyo objetivo es una mejoría del estado de la piel, mediante la infiltración subdérmica de principios activos específicos, indicados para su diagnóstico.
Los resultados son duraderos bajo los criterios e indicaciones sanitarias. Se recomienda un mínimo de 10 sesiones para obtener resultados ante el diagnostico con una frecuencia de 1 sesión semanal.
POSIBLES RIESGOS:
Sera necesario informar sobre alergias, alteraciones o enfermedades que puedan afectar al procedimiento.  Puede haber alteraciones derivadas de un mal cuidado posterior: hinchazón, enrojecimiento, dolor, escozor, reacciones alérgicas, hematomas o infección. Si existe herpes deberá ser tratado previamente y posteriormente al tratamiento bajo indicación sanitaria. Estos síntomas desaparecerán espontáneamente tras varios días.
INDICACIONES:
Tras el procedimiento es conveniente que realice los cuidados necesarios para conseguir los resultados óptimos del tratamiento:
	•	-No realizar deporte o ejercicio en las 24 horas siguientes.
	•	-No realizar actividades que produzcan sudoración en la zona en 24 horas.
	•	-No aplicar calor en la zona en 24 horas
	•	-No exposición solar en 48 horas y aplicación de protección solar continua.
	•	-No manipular la zona tratada en 48h.
	•	-No aplicar cremas ni maquillaje sobre la zona tratada en 24h.
	•	-Aplicar tratamiento indicado por profesional sanitario en caso necesario.
CONTRAINDICACIONES:
	•	-Embarazo y lactancia.
	•	-Heridas abiertas en la zona del tratamiento.
	•	-Infecciones activas en la zona del tratamiento.  -Enfermedades autoinmunes.
Se me ha facilitado esta hoja informativa, habiendo comprendido el significado del procedimiento y los riesgos inherentes al mismo y declaro estar debidamente informado/a, habiendo tenido la oportunidad de aclarar mis dudas en entrevista personal con el personal sanitario. Asimismo, he recibido respuesta a todas mis preguntas, habiendo tomado la decisión de manera libre y voluntaria.

INFORMACIÓN BASICA SOBRE PROTECCION DE DATOS: Se me ha informado de que BEATRIZ ELIANA SALAZAR OSORIO S.L.U. es responsable del tratamiento de mis datos personales y se me informa de que estos serán tratados de conformidad con lo dispuesto en el Reglamento (UE) 2016/679, de 27 de abril (GDPR), y la ley Orgánica 3/2018, de 5 de diciembre (LOPDGDD), con la finalidad de mantener una relación de servicios (en base a una relación contractual, obligación legal o interés legítimo) y serán conservados durante no mas del tiempo necesario para mantener el fin del tratamiento o mientras existan prescripciones legales que dictaminen su custodia. No se comunicarán los datos a terceros, salvo obligación legal. Asimismo, se me informa de que puedo ejercer los derechos de acceso, rectificación, portabilidad y supresión de mis datos y los de limitación y oposición a su tratamiento dirigiéndome a BEATRIZ ELIANA SALAZAR OSORIO S.L.U en Calle San Antonio de Padua, 10 – 28026 Madrid – España. Email: bettystetik3@gmail.com

En____________________________ a __________ de _____________________ del_______________
Fdo. Paciente: 	Fdo. Padre, Madre o Tutor:	Fdo Sanitario:$c13$),
  ('radiesse', 'RADIESSE', 'inyectable', $c14$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO PARA TRATAMIENTO CON RADIESSE®

Nombre del paciente: __________________________________________
Fecha: ____ / ____ / ______

1. Descripción del tratamiento

El tratamiento con Radiesse® consiste en la aplicación de un relleno dérmico a base de hidroxiapatita cálcica, utilizado para mejorar arrugas, surcos, pérdida de volumen facial y estimulación de colágeno. Se realiza mediante infiltraciones con aguja o cánula en las áreas acordadas.

2. Objetivo del tratamiento
	•	Mejorar la apariencia de arrugas y surcos.
	•	Restaurar o aumentar el volumen facial.
	•	Estimular la producción de colágeno.
	•	Mejorar la definición facial (pómulos, mentón, mandíbula, etc.).

3. Beneficios esperados
	•	Resultados visibles de forma inmediata.
	•	Mejora progresiva gracias a la producción de colágeno.
	•	Efecto de duración prolongada (aprox. 12–18 meses, variable según paciente).

4. Posibles efectos secundarios

El paciente declara haber sido informado de que pueden aparecer efectos temporales, como:
	•	Enrojecimiento, inflamación, dolor o sensibilidad en la zona tratada
	•	Hematomas
	•	Asimetrías transitorias
	•	Picor o sensación de presión
	•	Pequeños bultos o nódulos
	•	Reacciones alérgicas (raras)

5. Riesgos poco frecuentes pero posibles
	•	Infección
	•	Migración del producto
	•	Granulomas
	•	Necrosis cutánea por inyección intravascular
	•	Lesiones nerviosas
	•	Resultados insuficientes o no satisfactorios

6. Contraindicaciones

El paciente declara no presentar:
	•	Embarazo o lactancia
	•	Enfermedades autoinmunes activas
	•	Alergia conocida a algún componente del producto
	•	Trastornos de coagulación
	•	Infección activa en la zona a tratar

7. Cuidados posteriores

El paciente ha sido informado de:
	•	No masajear la zona sin indicación médica.
	•	Evitar ejercicio intenso durante 24–48 h.
	•	Evitar calor extremo (saunas, vapor, sol intenso) 48 h.
	•	No consumir alcohol el mismo día del tratamiento.
	•	Acudir a control si se presentan síntomas anormales o persistentes.

8. Alternativas al tratamiento

Se han explicado otras opciones estéticas como ácido hialurónico, hilos tensores, láseres o no realizar ningún tratamiento.

9. Aceptación

Declaro que:
	•	He sido informado/a de forma clara y suficiente sobre el tratamiento con Radiesse®.
	•	He podido hacer preguntas y han sido respondidas satisfactoriamente.
	•	Entiendo los beneficios, riesgos y alternativas.
	•	Autorizo voluntariamente la realización del procedimiento.

Firma del paciente: _______________________________

Firma del profesional: ____________________________

Nombre del profesional: __________________________$c14$),
  ('radiofrecuencia-fraccionada', 'RADIOFRECUENCIA FRACCIONADA', 'corporal', $c15$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO INFORMADO – RADIOFRECUENCIA FRACCIONADA
Nombre del paciente: ______________
DNI / Identificación: ______________
Fecha de nacimiento: ______________
Teléfono: ______________
Fecha: ______________

1. Información del procedimiento

La radiofrecuencia fraccionada es un tratamiento estético no quirúrgico que utiliza energía de radiofrecuencia para generar microcolumnas de calor en la piel, estimulando la producción de colágeno y mejorando la textura, firmeza, cicatrices, arrugas y apariencia general de la piel.

2. Objetivo del tratamiento

El objetivo es lograr una mejora progresiva de la calidad de la piel. El resultado puede variar según el tipo de piel, edad, estilo de vida y condiciones particulares del paciente. No se garantiza un resultado específico.

3. Beneficios esperados
	•	Reducción de líneas finas y arrugas.
	•	Mejora de cicatrices y marcas de acné.
	•	Tensado y reafirmación de la piel.
	•	Reducción de poros dilatados.
	•	Mejora de textura y uniformidad.

4. Riesgos y efectos secundarios

Pueden presentarse, aunque no exclusivamente, los siguientes efectos:
	•	Enrojecimiento, inflamación o sensación de calor temporal.
	•	Pequeños puntos o costras que desaparecen en días.
	•	Cambios temporales en la pigmentación.
	•	Infección (poco frecuente).
	•	Reacción alérgica a productos aplicados.
	•	En casos muy raros: quemaduras o cicatrices.
El paciente declara haber sido informado de que todo procedimiento médico-estético conlleva riesgos, aunque sean mínimos.

5. Cuidados posteriores

El paciente se compromete a:
	•	Evitar exposición solar directa durante al menos 7 días.
	•	Utilizar protector solar FPS 50.
	•	No manipular costras ni áreas tratadas.
	•	Evitar ejercicio intenso, sauna o calor excesivo por 48 horas.
	•	Seguir las recomendaciones entregadas por el especialista.

6. Contraindicaciones

El paciente declara haber informado si presenta o ha presentado:
	•	Embarazo o lactancia.
	•	Enfermedades dermatológicas activas en la zona a tratar.
	•	Implantes metálicos o dispositivos electrónicos en la zona.
	•	Tratamientos recientes con retinoides, peelings o láser.
	•	Antecedentes de cicatrización anómala.
	•	Uso de medicación fotosensibilizante.

7. Número de sesiones

El paciente entiende que se recomiendan varias sesiones para obtener resultados óptimos y que los resultados pueden variar de una persona a otra.

8. Declaración del paciente

Declaro que:
	•	He recibido información clara, suficiente y comprensible sobre el procedimiento.
	•	He tenido oportunidad de realizar preguntas y estas han sido respondidas.
	•	Autorizo al profesional a realizar el tratamiento.
	•	Entiendo que puedo retirar mi consentimiento en cualquier momento.

9. Uso de fotografías

( ) Autorizo / ( ) No autorizo
el uso de fotografías con fines clínicos, comparativos o educativos, garantizando la protección de mi identidad según la normativa vigente de protección de datos.

⸻

Firma del paciente: ____________

Firma del profesional: ____________

Nombre y número de colegiado: _________$c15$),
  ('toxina-botulinica', 'TOXINA BUTOLÍNICA', 'inyectable', $c16$Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---

CONSENTIMIENTO PARA TOXINA BOTULINICA
En__________________, a________ de ________________ de_________
DEJO CONSTACIA que se me ha explicado que cuando se inyectan pequeñas cantidades de toxina botulínica purificada en un musculo se produce el debilitamiento o parálisis del mismo.
-Que este efecto aparece entre el tercero y el séptimo día de la inyección y perdura habitualmente de cuatro a seis meses.
-Que, dado que numerosas alteraciones estéticas aparecen o empeoran con la contracción de determinados músculos faciales, como las “patas de gallo” y las arrugas del entrecejo, el efecto de parálisis local reversible que produce la toxina botulínica mejora el aspecto estético de muchas personas con este tipo de arrugas.  Se que no podre fruncir el ceño, mientras dure los efectos de la inyección. -Que dichos efectos persistirán entre cuatro y seis meses antes de que desaparezcan y en ese momento podre optar por tratarme nuevamente.
Comprendo que debo permanecer con la cabeza erguida y no tocar las zonas tratadas durante un periodo de 4 horas luego del procedimiento.
-Comprendo que el tratamiento con toxina botulínica de las arrugas faciales del entrecejo puede causar una caída parcial y temporal de un parpado en un pequeño número de casos, que habitualmente dura entre 2 y 3 semanas y que ocasionalmente pueden aparecer sensación de adormecimiento en la frente y dolor de cabeza transitorios.  Se que en un escaso numero de personas, la inyección no produce el efecto con el grado esperado (parálisis muscular) o por el periodo de tiempo antes mencionado. -Autorizo a tomar fotografías clínicas de control para su uso posterior con fines exclusivamente científicos, publicaciones o presentaciones científicas, sabiendo que mi identidad será protegida en todo momento.
-Declaro no estar embarazada ni padecer enfermedad neurológica alguna ( por ejemplo, parálisis facial, espasmos, debilidad de movimiento, etc)
Se que este procedimiento es cosmético y que el pago del mismo no esta cubierto por los seguros médicos, obras sociales, etc.
-He leído y comprendido los párrafos precedentes.  Mis preguntas fueron respondidas satisfactoriamente por el especialista y sus colaboradores.
-Acepto los riesgos y complicaciones potenciales del procedimiento.
INFORMACION BASICA SOBRE PROTECCION DE DATOS: Se me ha informado de que BEATRIZ ELIANA SALAZAR OSORIO, es la responsable del tratamiento de mis datos personales y se me informa de que estos datos serán tratados de conformidad con lo dispuesto en el Reglamento (UE) 2016/679, de 27 de abril (GDPR) y la Ley Orgánica 3/2018, de 5 de diciembre (LOPDGDD), con la finalidad de mantener una relación de servicios y serán conservados durante no mas tiempo necesario para mantener el fin del tratamiento o mientras exista prescripciones legales que dictaminen sus custodia.  No se comunicarán los datos a terceros, salvo obligación legal.  Asimismo, se me informa de que puedo ejercer los derechos de acceso, rectificación y supresión de mis datos dirigiéndome a BEATRIZ ELIANA SALAZAR OSORIO en calle San Antonio de Padua, 10 Madrid, E-mail bettystetik3@gmail.com
Nombre Completo Paciente:
                                                                                                                 


         DNI/NIE:                                                                                                  

Firma Paciente:                                                                                                                                                                                    
                                                                                                                       
 
Nombre Completo Medico:
Número de MATRICULA:    
Firma Médico:$c16$)
on conflict (slug) do update set
  titulo = excluded.titulo,
  categoria = excluded.categoria,
  cuerpo_texto = excluded.cuerpo_texto,
  activo = true;
