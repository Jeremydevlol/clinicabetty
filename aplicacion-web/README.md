# Clínica ERP (web)

App React + Vite. Variables de entorno: ver `.env.example`.

## Consentimientos informados (qué es cada cosa)

| Qué | Para qué sirve |
|-----|----------------|
| **`consentimiento_plantillas`** (tabla Supabase) | **Catálogo de textos legales reutilizables** (toxina, ácido hialurónico, LOPD, etc.). Son modelos: al elegir uno en la app se rellenan `{{paciente_nombre}}`, `{{servicio_o_producto}}`, `{{fecha}}`, `{{centro}}`. El cuerpo puede incluir datos fijos de tu clínica (responsable del tratamiento, dirección de contacto RGPD, etc.) tal como vienen en tus documentos; **no son datos de pacientes del ERP**, son parte del modelo legal. |
| **`consentimientos_firmados`** | **Una fila por cada consentimiento ya generado y registrado** para un paciente concreto: copia del texto en ese momento, paciente, clínica, quién lo registró y cuándo. Es el **expediente / auditoría** por persona. |
| **Menú Documentos** | Vista transversal de todos los consentimientos firmados de la clínica seleccionada (recepción, encargado, etc.). |
| **Pacientes → pestaña Consentimientos** | Mismo tipo de registros, **filtrados a esa paciente**; desde ahí se da de alta un nuevo consentimiento. |
| **Filas con badge “histórico”** | Registros antiguos guardados solo en la ficha (`clientes.consentimientos` en JSON), antes de la tabla dedicada. |
| **`servicios` (agenda / cobro)** | **No** se crean solos por cada consentimiento. Podés tener **un solo servicio** en catálogo y, al firmar, completar “servicio o producto” en el consentimiento. Si algún día querés **un tratamiento en `servicios` por cada plantilla**, es opcional: `scripts/sql/optional_servicios_por_plantilla_consentimiento.sql` (ejecutar a mano en Supabase, no va en migraciones automáticas). |

Migraciones relacionadas: `supabase/migrations/*consent*`.

---

## React + Vite (plantilla)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

### React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

### Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
