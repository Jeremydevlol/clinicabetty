#!/usr/bin/env python3
"""
Sirve esta carpeta en el puerto PORT (default 8765) y expone:
  POST /api/ocr       — JPEG base64 → OpenAI (OCR)

Uso:
  export OPENAI_API_KEY="sk-..."   # solo para /api/ocr
  python3 face_overlay_server.py

Abre: http://127.0.0.1:8765/face_proportion_overlay.html
"""
from __future__ import annotations

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


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/api/ocr":
            self._post_ocr()
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
    httpd.serve_forever()


if __name__ == "__main__":
    main()
