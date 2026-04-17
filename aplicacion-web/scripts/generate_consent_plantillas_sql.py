#!/usr/bin/env python3
"""
Lee los .docx del paquete WeTransfer (textutil en macOS) y genera SQL de upsert
para consentimiento_plantillas.
"""
from __future__ import annotations

import re
import subprocess
import sys
import unicodedata
from pathlib import Path

HEADER = """Datos del acto (autocompletados al firmar)
Paciente: {{paciente_nombre}}
Servicio / detalle: {{servicio_o_producto}}
Fecha: {{fecha}}
Centro: {{centro}}

---
"""


# Unifica con slugs ya usados en el seed inicial (evita dos toxinas distintas).
SLUG_OVERRIDES = {
    "toxina-butolinica": "toxina-botulinica",
}


def slugify(name: str) -> str:
    base = Path(name).stem
    n = unicodedata.normalize("NFKD", base)
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = n.lower().strip()
    n = re.sub(r"[^a-z0-9]+", "-", n)
    slug = n.strip("-")[:100] or "plantilla"
    return SLUG_OVERRIDES.get(slug, slug)


def docx_to_text(path: Path) -> str:
    r = subprocess.run(
        ["textutil", "-convert", "txt", "-stdout", str(path)],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr or "textutil failed")
    return r.stdout.strip()


def guess_categoria(slug: str, titulo: str) -> str:
    t = (slug + " " + titulo).lower()
    if "ley" in t or "proteccion" in t or "datos" in t:
        return "legal"
    if any(x in t for x in ("corpo", "hifu", "hidrolipo", "ems", "radiofrecuencia")):
        return "corporal"
    if any(x in t for x in ("hilo", "meso", "toxina", "acido", "radiesse", "exoxoma", "carboxi", "hidroxiapatita", "fhos")):
        return "inyectable"
    return "general"


def esc_sql_literal(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def main() -> int:
    folder = Path(__file__).resolve().parent.parent.parent / "wetransfer_consentmientos_2026-04-02_1814"
    if not folder.is_dir():
        print(f"Carpeta no encontrada: {folder}", file=sys.stderr)
        return 1

    docxs = sorted(folder.glob("*.docx"))
    if not docxs:
        print("No hay .docx", file=sys.stderr)
        return 1

    rows: list[tuple[str, str, str, str]] = []
    for p in docxs:
        try:
            body = docx_to_text(p)
        except Exception as e:
            print(f"Omitido {p.name}: {e}", file=sys.stderr)
            continue
        slug = slugify(p.name)
        titulo = Path(p).stem.replace("_", " ").strip()
        if len(titulo) > 200:
            titulo = titulo[:197] + "..."
        cat = guess_categoria(slug, titulo)
        full = HEADER + "\n" + body
        rows.append((slug, titulo, cat, full))

    out_lines = [
        "-- Plantillas desde WeTransfer (consentimientos reales). Generado; no editar a mano.",
        "-- Ejecutar después de 20260402210000_consentimientos_firmados.sql",
        "",
        "insert into public.consentimiento_plantillas (slug, titulo, categoria, cuerpo_texto) values",
    ]
    for i, (slug, titulo, cat, full) in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        # Evitar conflicto con delimitadores dollar en cuerpos raros
        tag = f"c{i}"
        while f"${tag}$" in full:
            tag += "x"
        line = f"  ({esc_sql_literal(slug)}, {esc_sql_literal(titulo)}, {esc_sql_literal(cat)}, ${tag}${full}${tag}$){comma}"
        out_lines.append(line)
    out_lines.append("on conflict (slug) do update set")
    out_lines.append("  titulo = excluded.titulo,")
    out_lines.append("  categoria = excluded.categoria,")
    out_lines.append("  cuerpo_texto = excluded.cuerpo_texto,")
    out_lines.append("  activo = true;")

    out_path = Path(__file__).resolve().parent.parent / "supabase" / "migrations" / "20260402220000_consent_plantillas_wetransfer.sql"
    out_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    print(f"OK {len(rows)} plantillas -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
