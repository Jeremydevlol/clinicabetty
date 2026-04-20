#!/usr/bin/env python3
"""
Bridge DeepFace por stdin/stdout.

Modos:
- una sola petición (default): stdin JSON único -> stdout JSON único
- daemon (--serve): stdin NDJSON (1 JSON por línea) -> stdout NDJSON

En modo --serve:
- al iniciar emite {"event":"ready", "warming": true} y calienta los modelos
  enviando una imagen dummy por DeepFace.analyze; luego emite {"event":"ready","warming":false}.
- cada línea válida recibe una respuesta NDJSON en stdout.
- errores normales ("no face") se devuelven como {"ok": true, "face_found": false}
  para no romper un loop de streaming.

Requiere: pip install deepface opencv-python-headless tensorflow tf-keras numpy
"""
from __future__ import annotations

import argparse
import base64
import json
import sys


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _log(msg: str) -> None:
    sys.stderr.write(f"[deepface_bridge] {msg}\n")
    sys.stderr.flush()


# Módulos cacheados para evitar reimports por request.
_np = None
_cv2 = None
_DeepFace = None


def _ensure_modules():
    global _np, _cv2, _DeepFace
    if _np is None:
        import numpy as np  # type: ignore
        _np = np
    if _cv2 is None:
        import cv2  # type: ignore
        _cv2 = cv2
    if _DeepFace is None:
        from deepface import DeepFace  # type: ignore
        _DeepFace = DeepFace
    return _np, _cv2, _DeepFace


def _decode_jpeg(image_b64: str):
    np, cv2, _ = _ensure_modules()
    raw = base64.b64decode(image_b64)
    nparr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar el JPEG")
    return img


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


def _num(x):
    if x is None:
        return None
    try:
        return int(round(float(x)))
    except (TypeError, ValueError):
        return x


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
    """Analiza una imagen numpy ya decodificada."""
    _, _, DeepFace = _ensure_modules()
    objs = DeepFace.analyze(
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

    # umbral bajo (el modelo suele devolver ~0.85 con buen encuadre y 0 sin rostro)
    if conf_val is not None and conf_val < 0.05:
        return {"face_found": False, "face_confidence": conf_val}

    payload = _extract_payload(o)
    payload["face_found"] = True
    return _scrub(payload)


def deepface_analyze(image_b64: str, actions=("age", "gender", "emotion", "race")) -> dict:
    img = _decode_jpeg(image_b64)
    return deepface_analyze_image(img, actions=actions)


def _warmup() -> None:
    """Primer analyze con imagen dummy para cargar modelos y evitar la latencia del primer frame real."""
    try:
        np, _, _ = _ensure_modules()
        dummy = (np.random.rand(160, 160, 3) * 255).astype("uint8")
        deepface_analyze_image(dummy)
        _log("warmup ok")
    except Exception as e:
        _log(f"warmup error: {e}")


def _handle_payload(payload: dict) -> dict:
    b64 = (payload.get("image_base64") or "").strip()
    if not b64:
        return {"ok": False, "error": "image_base64 vacío"}
    actions = payload.get("actions") or ("age", "gender", "emotion", "race")
    if not isinstance(actions, (list, tuple)) or not actions:
        actions = ("age", "gender", "emotion", "race")
    result = deepface_analyze(b64, actions=actions)
    return {"ok": True, **result}


def run_once() -> None:
    try:
        raw = sys.stdin.read()
        data = json.loads(raw or "{}")
        out = _handle_payload(data)
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False) + "\n")


def run_serve() -> None:
    _emit({"event": "starting"})
    try:
        _ensure_modules()
    except Exception as e:
        _emit({"event": "fatal", "error": f"No se pudieron cargar las dependencias: {e}"})
        return
    _emit({"event": "ready", "warming": True})
    _warmup()
    _emit({"event": "ready", "warming": False})

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        req_id = None
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                req_id = data.get("id")
            out = _handle_payload(data)
        except Exception as e:
            out = {"ok": False, "error": str(e)}
        if req_id is not None:
            out["id"] = req_id
        _emit(out)


def main() -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--serve", action="store_true")
    args, _ = parser.parse_known_args()
    if args.serve:
        run_serve()
    else:
        run_once()


if __name__ == "__main__":
    main()
