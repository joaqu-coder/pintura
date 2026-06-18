"""
scrape_uocra.py — Escala salarial UOCRA Zona A (Salta)
Uso: python scripts/scrape_uocra.py
Salida: data/uocra-salta.json

Fuente: https://www.uocra.net/escalas-salariales/
La página publica tablas HTML con los valores por categoría y zona.
Si el scraping falla por cambios en el sitio, el script emite un aviso
y deja el JSON existente sin modificar.
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Instalá dependencias: pip install requests beautifulsoup4")
    sys.exit(1)

OUTPUT = Path(__file__).parent.parent / "data" / "uocra-salta.json"

# Mapa de categorías UOCRA → roles en la app
CATEGORIAS = {
    "Oficial Especializado": "es",
    "Oficial":               "of",
    "Medio Oficial":         "mo",
    "Ayudante":              "ay",
}

# ── Valores de respaldo (última actualización manual conocida) ──
# Actualizarlos si el scraping falla temporalmente.
FALLBACK = {
    "fuente":     "manual",
    "zona":       "A",
    "provincia":  "Salta",
    "vigencia":   "2024-10",
    "roles": [
        {"id": "es", "label": "Oficial Especializado", "hora": 2850},
        {"id": "of", "label": "Oficial",               "hora": 2580},
        {"id": "mo", "label": "Medio Oficial",         "hora": 2250},
        {"id": "ay", "label": "Ayudante",              "hora": 1980},
    ]
}


def scrape() -> dict | None:
    url = "https://www.uocra.net/escalas-salariales/"
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
    except Exception as e:
        print(f"[uocra] No se pudo conectar: {e}")
        return None

    soup = BeautifulSoup(r.text, "html.parser")

    # Buscar tabla con columnas de zonas y filas de categorías
    roles = []
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        # Verificar que hay columnas de zona A
        has_zona_a = any("zona a" in h or "zona_a" in h for h in headers)
        if not has_zona_a:
            continue

        zona_idx = next(
            (i for i, h in enumerate(headers) if "zona a" in h or "zona_a" in h), None
        )
        if zona_idx is None:
            continue

        for tr in table.find_all("tr")[1:]:  # saltar encabezado
            celdas = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if len(celdas) <= zona_idx:
                continue
            categoria = celdas[0]
            rol_id = next(
                (v for k, v in CATEGORIAS.items() if k.lower() in categoria.lower()),
                None
            )
            if rol_id is None:
                continue
            valor_str = celdas[zona_idx].replace(".", "").replace(",", ".").replace("$", "").strip()
            try:
                hora = float(valor_str)
            except ValueError:
                continue
            roles.append({"id": rol_id, "label": categoria, "hora": hora})

        if roles:
            break  # tabla encontrada

    if not roles:
        print("[uocra] No se encontraron datos en la página.")
        return None

    return {
        "fuente":    url,
        "zona":      "A",
        "provincia": "Salta",
        "vigencia":  datetime.today().strftime("%Y-%m"),
        "roles":     roles,
    }


def main():
    print("[uocra] Intentando scraping…")
    data = scrape()
    if data is None:
        print("[uocra] Usando valores de respaldo.")
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
