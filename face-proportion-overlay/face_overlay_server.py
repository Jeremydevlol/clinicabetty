#!/usr/bin/env python3
"""
Sirve esta carpeta en el puerto PORT (default 8765) y expone:
  POST /api/ocr       — JPEG base64 → OpenAI (OCR)
  POST /api/deepface  — JPEG base64 → DeepFace (edad, género, emoción, etnia aprox.)

Uso:
  export OPENAI_API_KEY="sk-..."   # solo para /api/ocr
  python3 face_overlay_server.py

DeepFace (opcional, solo /api/deepface):
  pip install deepface opencv-python-headless tensorflow tf-keras

Abre: http://127.0.0.1:8765/face_proportion_overlay.html
"""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8765"))
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")


def openai_ocr(image_b64: str) -> str:
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extrae todo el texto visible en la imagen (OCR). "
                            "Transcribe letras y números con fidelidad. "
                            "Si no hay texto legible, responde exactamente: (sin texto visible). "
                            "Responde solo con el texto extraído, sin markdown ni comillas."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                    },
                ],
            }
        ],
        "max_tokens": 4096,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=data,
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            err = json.loads(body)
            detail = err.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            detail = body or str(e.code)
        raise RuntimeError(detail) from None
    return out["choices"][0]["message"]["content"].strip()


def deepface_analyze(image_b64: str) -> dict:
    """Decodifica JPEG y devuelve atributos faciales (estimaciones de modelo)."""
    try:
        import numpy as np
    except ImportError as e:
        raise RuntimeError("Instala dependencias: pip install numpy opencv-python-headless") from e
    try:
        import cv2
    except ImportError as e:
        raise RuntimeError("Instala: pip install opencv-python-headless") from e
    try:
        from deepface import DeepFace
    except ImportError as e:
        raise RuntimeError(
            "DeepFace no está instalado. Ejecuta: python3 -m pip install deepface tensorflow tf-keras"
        ) from e

    raw = base64.b64decode(image_b64)
    nparr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar el JPEG")

    objs = DeepFace.analyze(
        img_path=img,
        actions=("age", "gender", "emotion", "race"),
        enforce_detection=False,
        detector_backend="opencv",
        silent=True,
    )
    if isinstance(objs, list):
        if not objs:
            raise ValueError(
                "No se detectó rostro (acércate, luz frontal o mira a la cámara)."
            )
        o = objs[0]
    else:
        o = objs

    def _num(x):
        if x is None:
            return None
        try:
            return int(round(float(x)))
        except (TypeError, ValueError):
            return x

    def _scrub(x):
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

    g = o.get("gender") if isinstance(o.get("gender"), dict) else {}
    dom_g = o.get("dominant_gender")
    if dom_g is None and g:
        dom_g = max(g, key=lambda k: float(g[k]) if hasattr(g[k], "item") else g[k])

    out: dict = {
        "age": _num(o.get("age")),
        "dominant_gender": dom_g,
        "gender": g,
        "dominant_emotion": o.get("dominant_emotion"),
        "emotion": o.get("emotion") if isinstance(o.get("emotion"), dict) else {},
        "dominant_race": o.get("dominant_race"),
        "race": o.get("race") if isinstance(o.get("race"), dict) else {},
    }
    return _scrub(out)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/api/ocr":
            self._post_ocr()
        elif path == "/api/deepface":
            self._post_deepface()
        else:
            self.send_error(404)

    def _post_ocr(self) -> None:
        if not OPENAI_KEY:
            self._json(500, {"error": "Falta OPENAI_API_KEY en el entorno del servidor."})
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body.decode("utf-8"))
            b64 = (data.get("image_base64") or "").strip()
            if not b64:
                raise ValueError("image_base64 vacío")
            text = openai_ocr(b64)
            self._json(200, {"text": text})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _post_deepface(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body.decode("utf-8"))
            b64 = (data.get("image_base64") or "").strip()
            if not b64:
                raise ValueError("image_base64 vacío")
            result = deepface_analyze(b64)
            self._json(200, {"ok": True, **result})
        except Exception as e:
            self._json(500, {"ok": False, "error": str(e)})

    def _json(self, code: int, obj: dict) -> None:
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> None:
    httpd = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Sirviendo {ROOT}")
    print(f"  http://127.0.0.1:{PORT}/face_proportion_overlay.html")
    print(f"  OCR: POST /api/ocr  (requiere OPENAI_API_KEY)")
    print(f"  DeepFace: POST /api/deepface  (pip install … tensorflow tf-keras)")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
