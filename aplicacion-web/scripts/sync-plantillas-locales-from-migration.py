#!/usr/bin/env python3
"""
Regenera `src/consentimientos/plantillasLocales.js` desde:
  - supabase/migrations/20260402220000_consent_plantillas_wetransfer.sql (cuerpo_texto)
  - supabase/migrations/20260402240000_consent_plantillas_archivo_docx.sql (archivo_docx_url)

Uso (desde aplicacion-web):  python3 scripts/sync-plantillas-locales-from-migration.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    sql_path = ROOT / "supabase/migrations/20260402220000_consent_plantillas_wetransfer.sql"
    s = sql_path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\(\s*'(?P<slug>[^']+)'\s*,\s*'(?P<titulo>(?:[^'\\]|\\.)*)'\s*,\s*'(?P<cat>(?:[^'\\]|\\.)*)'\s*,\s*\$(?P<tag>[a-z0-9]+)\$(?P<body>.*?)\$(?P=tag)\$\s*\)",
        re.DOTALL,
    )
    rows = list(pattern.finditer(s))
    if len(rows) != 17:
        print(f"Se esperaban 17 plantillas, hay {len(rows)}", flush=True)
        return 1

    docx_s = (ROOT / "supabase/migrations/20260402240000_consent_plantillas_archivo_docx.sql").read_text(
        encoding="utf-8"
    )
    docx_map = {
        m.group(2): m.group(1)
        for m in re.finditer(
            r"archivo_docx_url = '([^']+)' where slug = '([^']+)'", docx_s
        )
    }

    out: list[dict] = []
    for m in rows:
        slug = m.group("slug")
        if slug not in docx_map:
            print(f"Falta archivo_docx para slug {slug}", flush=True)
            return 1
        out.append(
            {
                "slug": slug,
                "titulo": m.group("titulo").replace("\\'", "'"),
                "categoria": m.group("cat").replace("\\'", "'"),
                "cuerpo_texto": m.group("body"),
                "archivo_docx_url": docx_map[slug],
            }
        )

    header = """/* eslint-disable */
/**
 * Contenido alineado con la migración Supabase
 * `20260402220000_consent_plantillas_wetransfer.sql` (WeTransfer).
 * Regenerar con: `python3 scripts/sync-plantillas-locales-from-migration.py`
 * Sirve de base offline y se fusiona con `mergePlantillasConsent` cuando hay catálogo remoto.
 */
"""
    js_body = "const PLANTILLAS_LOCALES = " + json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    footer = """
export function getPlantillasConsentLocales() {
  return PLANTILLAS_LOCALES.map((p) => ({ ...p }))
}

/**
 * Une catálogo remoto con locales: por cada slug, el remoto sobrescribe campos
 * (siempre que traiga `cuerpo_texto` no vacío); las locales que no vienen del
 * servidor se mantienen.
 */
export function mergePlantillasConsent(remotas) {
  const local = getPlantillasConsentLocales()
  const map = new Map(local.map((p) => [p.slug, { ...p }]))
  for (const r of remotas || []) {
    if (!r?.slug) continue
    const prev = map.get(r.slug) || {}
    const cuerpo = (r.cuerpo_texto && String(r.cuerpo_texto).trim())
      ? r.cuerpo_texto
      : prev.cuerpo_texto
    map.set(r.slug, { ...prev, ...r, cuerpo_texto: cuerpo })
  }
  return [...map.values()].sort((a, b) => {
    const c = String(a.categoria || "").localeCompare(String(b.categoria || ""), "es")
    if (c !== 0) return c
    return String(a.titulo || "").localeCompare(String(b.titulo || ""), "es")
  })
}
"""
    target = ROOT / "src/consentimientos/plantillasLocales.js"
    target.write_text(header + js_body + footer, encoding="utf-8")
    print(f"OK → {target} ({len(out)} plantillas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
