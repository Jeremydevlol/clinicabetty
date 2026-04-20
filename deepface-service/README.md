# DeepFace Service

Microservicio HTTP en Python (FastAPI + Docker) que expone `DeepFace.analyze`
como API REST. Pensado para correr en **Render** como Web Service y ser llamado
desde el backend Node del ERP (en lugar de hacer `child_process.spawn` local).

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/`        | Ping rápido. |
| `GET`  | `/health`  | Liveness (responde sin tocar el modelo). |
| `GET`  | `/status`  | Readiness: indica si el modelo terminó de calentarse. |
| `POST` | `/analyze` | Análisis facial. Body JSON: `{ "image_base64": "...", "actions": ["age","gender","emotion","race"] }`. |

### Ejemplo de request

```bash
curl -X POST https://TU-SERVICIO.onrender.com/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"image_base64":"<JPEG_BASE64_SIN_PREFIJO>"}'
```

### Respuesta típica

```json
{
  "ok": true,
  "face_found": true,
  "age": 32,
  "dominant_gender": "Woman",
  "gender": { "Man": 4.2, "Woman": 95.8 },
  "dominant_emotion": "neutral",
  "emotion": { "angry": 0.1, "happy": 12.3, "neutral": 80.4, ... },
  "dominant_race": "latino hispanic",
  "race": { ... },
  "face_confidence": 0.91,
  "region": { "x": 120, "y": 80, "w": 220, "h": 220 }
}
```

## Variables de entorno

| Variable | Default | Para qué |
|----------|---------|----------|
| `PORT`             | `8000` | Puerto HTTP (Render lo inyecta). |
| `API_TOKEN`        | _(vacío)_ | Si está, exige `Authorization: Bearer <token>`. **Recomendado.** |
| `ALLOWED_ORIGIN`   | `*`    | CORS allow-origin. En prod, poné el dominio del frontend. |

## Deploy en Render — paso a paso

### Opción A · Manual (Web Service)

1. Pushea este repo a GitHub (incluyendo la carpeta `deepface-service/`).
2. En Render: **New +** → **Web Service**.
3. Conectá el repo `clinica-erp`.
4. Configurá:
   - **Name**: `deepface-service`
   - **Root Directory**: `deepface-service`
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `./Dockerfile` (relativo al root directory).
   - **Plan**: `Starter` (mínimo recomendado; el modelo ocupa ~1 GB en RAM).
   - **Region**: la más cercana a tu Vercel (ej. Frankfurt).
   - **Health Check Path**: `/health`
5. En **Environment** agregá:
   - `API_TOKEN` = generá uno largo aleatorio (ej. `openssl rand -hex 32`).
   - `ALLOWED_ORIGIN` = `https://tu-frontend.vercel.app` (en prod).
6. **Create Web Service**. El primer build tarda 6-10 min (TensorFlow es pesado).
7. Cuando termine, vas a tener una URL tipo `https://deepface-service-xxxx.onrender.com`.

### Opción B · Blueprint

Subí también `render.yaml` (ya incluido). En Render:
**New +** → **Blueprint** → seleccioná el repo. Render lee el YAML y crea el
servicio automáticamente. Después solo te pide los secrets (`API_TOKEN`).

## Conectar desde el backend Node (vite.config.js)

Una vez tengas la URL, en tu plugin `deepfaceBridgePlugin` reemplazá la lógica
de `spawn` por un `fetch` HTTP. Resumen del cambio:

```js
const DEEPFACE_URL   = process.env.DEEPFACE_URL || 'http://localhost:8000'
const DEEPFACE_TOKEN = process.env.DEEPFACE_TOKEN || ''

async function analyze(imageBase64) {
  const r = await fetch(`${DEEPFACE_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(DEEPFACE_TOKEN ? { Authorization: `Bearer ${DEEPFACE_TOKEN}` } : {}),
    },
    body: JSON.stringify({ image_base64: imageBase64 }),
  })
  if (!r.ok) throw new Error(`DeepFace ${r.status}`)
  return r.json()
}

async function status() {
  const r = await fetch(`${DEEPFACE_URL}/status`)
  return r.json()
}
```

Después en Vercel (o donde corra el backend Node) configurás:

- `DEEPFACE_URL=https://deepface-service-xxxx.onrender.com`
- `DEEPFACE_TOKEN=<el mismo API_TOKEN que pusiste en Render>`

## Probar localmente con Docker

```bash
cd deepface-service
docker build -t deepface-service .
docker run -p 8000:8000 -e API_TOKEN=devtoken deepface-service

# en otra terminal:
curl http://127.0.0.1:8000/status
```

## Probar localmente sin Docker

```bash
cd deepface-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Notas de rendimiento

- El primer request tras un cold start tarda ~5-15 s mientras se cargan los
  pesos. Después responde en 200-700 ms (CPU).
- En Render Free el servicio se duerme tras 15 min sin tráfico → primer hit
  vuelve a tardar. Para producción, plan **Starter** o superior.
- Si necesitás mucho throughput, escalá a un plan con más RAM/CPU o cambiá
  `--workers 1` por más workers en el `CMD` del Dockerfile.
