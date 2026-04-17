#!/usr/bin/env python3
"""
Lee JSON por stdin: {"image_base64": "..."} e imprime JSON en stdout (una línea).
Usado por Vite dev: POST /api/deepface → spawn python3 deepface_bridge.py
Requiere: pip install deepface opencv-python-headless tensorflow tf-keras numpy
"""
from __future__ import annotations

import base64
import json
import sys


def deepface_analyze(image_b64: str) -> dict:
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


def main() -> None:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw or "{}")
        b64 = (data.get("image_base64") or "").strip()
        if not b64:
            print(json.dumps({"ok": False, "error": "image_base64 vacío"}, ensure_ascii=False))
            return
        result = deepface_analyze(b64)
        print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
