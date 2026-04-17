# Clínica ERP

Estructura del repositorio:

```
clinica-erp/
├── aplicacion-web/     ← Aplicación Vite + React (código fuente, dependencias, build)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
└── README.md           ← Este archivo
```

**Cómo arrancar:** entrá a `aplicacion-web`, instalá dependencias si hace falta y levantá el servidor de desarrollo.

```bash
cd aplicacion-web
npm install
npm run dev
```

Los archivos de entorno (`.env`, `.env.local`) viven en `aplicacion-web/` junto al `package.json`.
