#!/usr/bin/env python3
"""
DeepFace HTTP Service (FastAPI).

Servicio independiente para análisis facial con DeepFace.
Pensado para correr en contenedor (Render Web Service / Docker).

Endpoints:
  GET  /              → ping
  GET  /health        → liveness probe
  GET  /status        → readiness + estado del modelo
  POST /analyze       → análisis facial (recibe { image_base64, actions? })

Variables de entorno opcionales:
  PORT            puerto HTTP (Render lo inyecta automáticamente)
  API_TOKEN       si está definido, exige header `Authorization: Bearer <token>`
  ALLOWED_ORIGIN  CORS allow-origin (default: "*")

Dependencias en requirements.txt.
"""
from __future__ import annotations

import base64
import logging
import os
import threading
import time
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("deepface-service")

API_TOKEN = os.environ.get("API_TOKEN", "").strip()
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*").strip() or "*"

# ─── Carga perezosa de modelos pesados ──────────────────────────────
_DeepFace = None
_cv2 = None
_model_lock = threading.Lock()
_model_state: dict[str, Any] = {"ready": False, "warming": False, "error": None, "warm_started_at": None}


def _ensure_modules() -> None:
    """Importa cv2 + DeepFace una sola vez (lazy)."""
    global _DeepFace, _cv2
    if _DeepFace is not None and _cv2 is not None:
        return
    with _model_lock:
        if _cv2 is None:
            import cv2  # type: ignore
            _cv2 = cv2
        if _DeepFace is None:
            from deepface import DeepFace  # type: ignore
            _DeepFace = DeepFace


def _decode_jpeg(image_b64: str):
    _ensure_modules()
    raw = base64.b64decode(image_b64)
    nparr = np.frombuffer(raw, np.uint8)
    img = _cv2.imdecode(nparr, _cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar el JPEG")
    return img


def _scrub(x: Any) -> Any:
    """Convierte tipos numpy/tensorflow a JSON-serializables."""
    if isinstance(x, dict):
        return {str(k): _scrub(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_scrub(v) for v in x]
    if isinstance(x, (bool, str)) or x is None:
        return x
    if isinstance(x, (float, int)):
        return x
    try:
        if hasattr(x, "item"):
            return float(x.item())
        return float(x)
    except (TypeError, ValueError):
        return str(x)


def _num(x: Any) -> Optional[int]:
    if x is None:
        return None
    try:
        return int(round(float(x)))
    except (TypeError, ValueError):
        return x  # type: ignore[return-value]


def _extract_payload(o: dict) -> dict:
    g = o.get("gender") if isinstance(o.get("gender"), dict) else {}
    dom_g = o.get("dominant_gender")
    if dom_g is None and g:
        dom_g = max(g, key=lambda k: float(g[k]) if hasattr(g[k], "item") else g[k])
    return {
        "age": _num(o.get("age")),
        "dominant_gender": dom_g,
        "gender": g,
        "dominant_emotion": o.get("dominant_emotion"),
        "emotion": o.get("emotion") if isinstance(o.get("emotion"), dict) else {},
        "dominant_race": o.get("dominant_race"),
        "race": o.get("race") if isinstance(o.get("race"), dict) else {},
        "face_confidence": o.get("face_confidence"),
        "region": o.get("region"),
    }


def deepface_analyze_image(img, actions=("age", "gender", "emotion", "race")) -> dict:
    _ensure_modules()
    objs = _DeepFace.analyze(  # type: ignore[union-attr]
        img_path=img,
        actions=tuple(actions),
        enforce_detection=False,
        detector_backend="opencv",
        silent=True,
    )
    if isinstance(objs, list):
        if not objs:
            return {"face_found": False}
        o = objs[0]
    else:
        o = objs

    conf = o.get("face_confidence")
    try:
        conf_val = float(conf) if conf is not None else None
    except (TypeError, ValueError):
        conf_val = None

    if conf_val is not None and conf_val < 0.05:
        return {"face_found": False, "face_confidence": conf_val}

    payload = _extract_payload(o)
    payload["face_found"] = True
    return _scrub(payload)


def _warmup() -> None:
    """Precarga modelos en un hilo aparte para no bloquear el primer request."""
    if _model_state["ready"] or _model_state["warming"]:
        return
    _model_state["warming"] = True
    _model_state["warm_started_at"] = time.time()

    def _do() -> None:
        try:
            _ensure_modules()
            dummy = (np.random.rand(160, 160, 3) * 255).astype("uint8")
            deepface_analyze_image(dummy)
            _model_state["ready"] = True
            _model_state["error"] = None
            log.info("Warmup ok en %.1f s", time.time() - (_model_state["warm_started_at"] or time.time()))
        except Exception as e:  # noqa: BLE001
            _model_state["error"] = str(e)
            log.exception("Warmup falló: %s", e)
        finally:
            _model_state["warming"] = False

    threading.Thread(target=_do, daemon=True, name="deepface-warmup").start()


# ─── FastAPI app ────────────────────────────────────────────────────
app = FastAPI(
    title="DeepFace Service",
    description="Análisis facial DeepFace expuesto como API HTTP.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN] if ALLOWED_ORIGIN != "*" else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _on_startup() -> None:
    log.info("DeepFace service arrancando · API_TOKEN=%s · ALLOWED_ORIGIN=%s",
             "set" if API_TOKEN else "none", ALLOWED_ORIGIN)
    _warmup()


def _check_auth(authorization: Optional[str]) -> None:
    if not API_TOKEN:
        return
    expected = f"Bearer {API_TOKEN}"
    if not authorization or authorization.strip() != expected:
        raise HTTPException(status_code=401, detail="Token inválido o ausente")


class AnalyzeRequest(BaseModel):
    image_base64: str = Field(..., description="JPEG/PNG codificado en base64 (sin prefijo data:)")
    actions: Optional[list[str]] = Field(
        default=None,
        description="Subset de ['age','gender','emotion','race']. Default: todas.",
    )


@app.get("/")
def root() -> dict:
    return {
        "service": "deepface-service",
        "ok": True,
        "endpoints": ["/health", "/status", "/analyze"],
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/status")
def status() -> dict:
    return {
        "ok": True,
        "ready": bool(_model_state["ready"]),
        "warming": bool(_model_state["warming"]),
        "error": _model_state["error"],
        "modules_loaded": _DeepFace is not None and _cv2 is not None,
    }


@app.post("/analyze")
async def analyze(
    payload: AnalyzeRequest,
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> JSONResponse:
    _check_auth(authorization)
    b64 = (payload.image_base64 or "").strip()
    if not b64:
        raise HTTPException(status_code=400, detail="image_base64 vacío")
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]

    actions = payload.actions or ["age", "gender", "emotion", "race"]

    try:
        img = _decode_jpeg(b64)
        result = deepface_analyze_image(img, actions=actions)
        return JSONResponse({"ok": True, **result})
    except ValueError as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
    except Exception as e:  # noqa: BLE001
        log.exception("Error en /analyze")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, log_level="info")
