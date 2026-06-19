"""
scrape_uocra.py — Escala salarial UOCRA Zona A (Salta integra la Zona A)
Uso:    python scripts/scrape_uocra.py
Salida: data/uocra-salta.json

Fuente: CAMARCO (Cámara Argentina de la Construcción), sección Laboral.
        https://www.camarco.org.ar/laboral/

La escala salarial UOCRA es NACIONAL: surge de la paritaria del CCT 76/75
que firman UOCRA, CAMARCO y FAEC, y la homologa la Secretaría de Trabajo de
la Nación. NO la publica el Boletín Oficial de la provincia de Salta; Salta
sólo *pertenece* a la Zona A. Por eso la fuente correcta es CAMARCO, que
publica las tablas por zona y categoría de cada acuerdo.

Estrategia:
  1. Ubicar en la sección laboral de CAMARCO los acuerdos salariales UOCRA y
     ordenarlos del más nuevo al más viejo (según el mes/año del slug).
  2. Abrir cada acuerdo (del más reciente al más viejo) y parsear la tabla:
     ubicar la columna "Zona A" y las filas de cada categoría.
  3. Si nada parsea (cambió el sitio / sin red), conservar el JSON existente
     usando los valores de respaldo FALLBACK.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Instalá dependencias: pip install requests beautifulsoup4")
    sys.exit(1)

OUTPUT = Path(__file__).parent.parent / "data" / "uocra-salta.json"

BASE = "https://www.camarco.org.ar"
LABORAL_INDEX = f"{BASE}/laboral/"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; antigravity-uocra-bot/1.0)"}
TIMEOUT = 20

# Mapa de categorías UOCRA → roles en la app. Cada rol lista variantes de
# texto que pueden aparecer en la tabla (se comparan en minúsculas).
# Orden de MATCH: de más específico a más genérico, porque "oficial" es
# substring de "medio oficial" y "oficial especializado".
CATEGORIAS = [
    ("es", "Oficial Especializado", ["oficial especializado", "especializado"]),
    ("mo", "Medio Oficial",         ["medio oficial", "1/2 oficial", "½ oficial", "medio of"]),
    ("of", "Oficial",               ["oficial"]),
    ("ay", "Ayudante",              ["ayudante"]),
]
# Orden de SALIDA en el JSON (el que espera la app).
ORDEN_SALIDA = ["es", "of", "mo", "ay"]

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

# ── Valores de respaldo (última actualización manual conocida) ──
# Zona A · valor por hora · vigencia jun–ago 2026 (CCT 76/75).
# Se usan sólo si el scraping falla; el Action los refresca al correr.
FALLBACK = {
    "fuente":     "manual",
    "zona":       "A",
    "provincia":  "Salta",
    "vigencia":   "2026-06",
    "roles": [
        {"id": "es", "label": "Oficial Especializado", "hora": 6666},
        {"id": "of", "label": "Oficial",               "hora": 5703},
        {"id": "mo", "label": "Medio Oficial",         "hora": 5270},
        {"id": "ay", "label": "Ayudante",              "hora": 4851},
    ],
}


def _get(url: str) -> "BeautifulSoup | None":
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
    except Exception as e:
        print(f"[uocra] No se pudo abrir {url}: {e}")
        return None
    return BeautifulSoup(r.text, "html.parser")


def _slug_score(url: str) -> tuple:
    """Ordena acuerdos por (año, mes) leídos del slug. El último mes nombrado
    en el slug es la vigencia final del acuerdo (ej. '…abril-mayo-2026')."""
    low = url.lower()
    year = 0
    ym = re.search(r"(20\d{2})", low)
    if ym:
        year = int(ym.group(1))
    month = 0
    for nombre, num in MESES.items():
        if nombre in low:
            month = max(month, num)  # el más avanzado nombrado
    return (year, month)


def descubrir_acuerdos() -> list[str]:
    """Devuelve URLs de acuerdos salariales UOCRA, del más nuevo al más viejo."""
    soup = _get(LABORAL_INDEX)
    if soup is None:
        return []
    urls = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        low = href.lower()
        if "acuerdo" in low and "uocra" in low:
            urls.add(urljoin(BASE, href))
    return sorted(urls, key=_slug_score, reverse=True)


def _parse_monto(texto: str) -> "float | None":
    """'$ 6.666,00' / '6.666' / '6666,00' → 6666.0"""
    s = re.sub(r"[^\d.,]", "", texto)
    if not s:
        return None
    # Formato argentino: '.' miles, ',' decimales.
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(".", "")
    try:
        val = float(s)
    except ValueError:
        return None
    return val if val > 0 else None


def _match_categoria(texto: str) -> "tuple | None":
    low = texto.lower()
    for rid, label, variantes in CATEGORIAS:
        if any(v in low for v in variantes):
            return rid, label
    return None


def parsear_acuerdo(url: str) -> "list | None":
    """Extrae [{id,label,hora}] de la columna Zona A de la tabla del acuerdo."""
    soup = _get(url)
    if soup is None:
        return None

    for table in soup.find_all("table"):
        filas = table.find_all("tr")
        if not filas:
            continue

        # Buscar fila de encabezado que mencione "Zona A" y su columna.
        zona_idx = None
        for tr in filas[:3]:
            celdas = [c.get_text(" ", strip=True).lower()
                      for c in tr.find_all(["th", "td"])]
            for i, h in enumerate(celdas):
                if re.search(r"zona\s*a\b", h):
                    zona_idx = i
                    break
            if zona_idx is not None:
                break
        if zona_idx is None:
            continue

        roles, vistos = [], set()
        for tr in filas:
            celdas = tr.find_all(["td", "th"])
            if len(celdas) <= zona_idx:
                continue
            cat = _match_categoria(celdas[0].get_text(" ", strip=True))
            if cat is None or cat[0] in vistos:
                continue
            hora = _parse_monto(celdas[zona_idx].get_text(" ", strip=True))
            if hora is None:
                continue
            rid, label = cat
            roles.append({"id": rid, "label": label, "hora": round(hora, 2)})
            vistos.add(rid)

        # Exigir las 4 categorías para considerar la tabla válida.
        if len(roles) == len(CATEGORIAS):
            return sorted(roles, key=lambda r: ORDEN_SALIDA.index(r["id"]))

    print(f"[uocra] No se halló tabla Zona A válida en {url}")
    return None


def scrape() -> "dict | None":
    acuerdos = descubrir_acuerdos()
    if not acuerdos:
        print("[uocra] No se encontraron acuerdos en la sección laboral.")
        return None

    print(f"[uocra] {len(acuerdos)} acuerdo(s) candidato(s). Probando del más reciente…")
    for url in acuerdos:
        roles = parsear_acuerdo(url)
        if roles:
            return {
                "fuente":    url,
                "zona":      "A",
                "provincia": "Salta",
                "vigencia":  datetime.today().strftime("%Y-%m"),
                "roles":     roles,
            }
    return None


def main():
    print("[uocra] Intentando scraping desde CAMARCO…")
    data = scrape()
    if data is None:
        print("[uocra] Scraping fallido — usando valores de respaldo.")
        data = FALLBACK

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[uocra] Guardado en {OUTPUT}")
    print(f"        Vigencia : {data['vigencia']}")
    print(f"        Fuente   : {data['fuente']}")
    for r in data["roles"]:
        print(f"        {r['label']:25s}  ${r['hora']:,.0f}/h")


if __name__ == "__main__":
    main()
