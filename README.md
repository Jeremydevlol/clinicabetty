# Clínica ERP

Estructura del repositorio:

```
clinica-erp/
├── aplicacion-web/     ← Next.js + React (App Router, `src/` compartido)
│   ├── app/            ← layout, page, estilos globales
│   ├── src/            ← App.jsx y módulos
│   ├── public/
│   └── package.json
└── ...
```

**Cómo arrancar:**

```bash
cd aplicacion-web
npm install
npm run dev
```

Abre `http://localhost:3000`. Las variables de entorno van en `aplicacion-web/.env` o `.env.local` (pueden seguir usando nombres `VITE_*`; también se mapean a `NEXT_PUBLIC_*` en `next.config.mjs`).

**APIs:** en desarrollo, los middlewares que antes inyectaba Vite no existen. Usá `backend-node` o definí `NEXT_API_PROXY` en `.env.local` (URL del backend) para reescribir `/api/*` hacia ese servidor.
