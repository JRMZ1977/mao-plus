"""
MAO Plus — Módulo: Clasificación Tipológica Arqueológica (Fase 2 IA)
=====================================================================
Clasifica objetos arqueológicos en tipos funcionales/morfológicos usando
los descriptores morfométricos ya calculados por metrics.py.

Principio: No requiere ML ni datos de entrenamiento.
Usa reglas fundamentadas en la teoría tipológica lítica estándar
(González Sainz 1989, Inizan et al. 1999, Andrefsky 2005, adaptadas al
contexto latinoamericano MAO).

Tipos detectados (categoría → subtipo):
  Puntas de proyectil → Lanceolada / Triangular / Foliácea
  Bifaces            → Amigdaloide / Lanceolado / Oval
  Láminas liticas    → Lámina regular / Lámina retocada
  Raspadores         → Raspador frontal / Raspador circular / Semicircular
  Perforadores       → Perforador / Buril
  Cuchillos          → Cuchillo de dorso / Hoja bifacial
  Lascas             → Lasca irregular / Lasca tabular / Lasca de decorticado
  Núcleos            → Núcleo discoide / Núcleo informal / Núcleo agotado
  Guijarros          → Canto rodado / Guijarro con marcas
  Microliticos       → Microlitico indiferenciado
  Indeterminado      → sin clasificación tipológica confiable

Endpoint: POST /api/classify
Input:    métricas dict (salida de metrics.py / /api/metrics)
Output:   {tipo, subtipo, confianza, descripcion, metodo, indicadores}
"""

IMPLEMENTED = True

# ── Paleta de colores por tipo (para badges UI) ───────────────────────────────
TIPO_COLORS = {
    "Punta de proyectil": {"bg": "#fff3e0", "border": "#e65100", "text": "#e65100"},
    "Bifaz":              {"bg": "#fce4ec", "border": "#c62828", "text": "#c62828"},
    "Lámina lítica":      {"bg": "#e8f5e9", "border": "#2e7d32", "text": "#2e7d32"},
    "Raspador":           {"bg": "#e3f2fd", "border": "#1565c0", "text": "#1565c0"},
    "Perforador":         {"bg": "#f3e5f5", "border": "#6a1b9a", "text": "#6a1b9a"},
    "Cuchillo lítico":    {"bg": "#fff8e1", "border": "#f57f17", "text": "#f57f17"},
    "Lasca":              {"bg": "#f5f5f5", "border": "#616161", "text": "#424242"},
    "Núcleo":             {"bg": "#efebe9", "border": "#4e342e", "text": "#3e2723"},
    "Guijarro":           {"bg": "#e0f7fa", "border": "#006064", "text": "#006064"},
    "Microlítico":        {"bg": "#f9fbe7", "border": "#827717", "text": "#827717"},
    "Indeterminado":      {"bg": "#fafafa", "border": "#9e9e9e", "text": "#757575"},
}

# ── Íconos arqueológicos por tipo (texto unicode) ─────────────────────────────
TIPO_ICONS = {
    "Punta de proyectil": "▲",
    "Bifaz":              "◆",
    "Lámina lítica":      "▬",
    "Raspador":           "◑",
    "Perforador":         "▾",
    "Cuchillo lítico":    "◈",
    "Lasca":              "◻",
    "Núcleo":             "⬡",
    "Guijarro":           "●",
    "Microlítico":        "·",
    "Indeterminado":      "?",
}


def classify(metrics: dict) -> dict:
    """
    Clasifica un objeto arqueológico a partir de sus métricas morfométricas.

    Parámetros (del dict de métricas de metrics.py):
      forma_detectada    — forma geométrica (Lanceolada, Triangular, etc.)
      circularity        — 0–1
      solidity           — 0–1
      aspect_ratio_tight — ratio elongación ≥ 1
      elongation         — 0–1 (complemento de la esfericidad)
      equivalent_diameter— diámetro equivalente del área (px o mm)
      rectangularity     — 0–1
      forma_confianza    — confianza de la clasificación geométrica (0–1)

    Retorna:
      {
        tipo:         str,    # tipo principal
        subtipo:      str,    # subtipo específico
        confianza:    float,  # 0–1
        descripcion:  str,    # descripción interpretativa
        metodo:       str,    # "morfometrico_reglas"
        color:        dict,   # {bg, border, text} para badge UI
        icono:        str,    # carácter unicode representativo
        indicadores:  dict,   # descriptores usados en la decisión
      }
    """
    # ── Extraer descriptores ──────────────────────────────────────────────────
    forma        = (metrics.get("forma_detectada") or "").strip()
    circ         = float(metrics.get("circularity") or 0.0)
    sol          = float(metrics.get("solidity") or 0.0)
    ar           = float(metrics.get("aspect_ratio_tight") or metrics.get("aspect_ratio_original") or 1.0)
    elon         = float(metrics.get("elongation") or 0.0)
    rec          = float(metrics.get("rectangularity") or 0.0)
    eq_diam      = float(metrics.get("equivalent_diameter") or 0.0)
    forma_conf   = float(metrics.get("forma_confianza") or 0.0)
    # Asegurar aspecto ≥ 1
    ar = max(ar, 1.0)

    indicadores = {
        "forma_detectada": forma,
        "circularity":     round(circ, 3),
        "solidity":        round(sol, 3),
        "aspect_ratio":    round(ar, 3),
        "elongation":      round(elon, 3),
        "rectangularity":  round(rec, 3),
        "equivalent_diameter": round(eq_diam, 1),
    }

    # ── Reglas de clasificación (orden de prioridad descendente) ─────────────

    # 1. MICROLÍTICO — objeto muy pequeño (< 15 px equivalente)
    if 0 < eq_diam < 15:
        return _resultado(
            tipo="Microlítico",
            subtipo="Microlítico indiferenciado",
            confianza=0.65,
            descripcion="Objeto de dimensiones muy reducidas. Puede tratarse de un microlito, lasca de retoque o fragmento pequeño.",
            indicadores=indicadores,
        )

    # 2. PUNTA DE PROYECTIL — forma puntiforme elongada
    if forma in {"Lanceolada", "Triangular"} and 1.5 <= ar <= 4.5 and sol >= 0.62:
        if forma == "Lanceolada":
            subtipo = "Punta lanceolada (foliácea/pedunculada)"
            conf = min(0.92, (sol * 0.5 + (1.0 - abs(ar - 2.5) / 3.0) * 0.3 + circ * 0.2))
            desc = (
                "Forma lanceolada elongada compatible con punta de proyectil. "
                "Contorno curvilíneo con buen volumen morfológico. "
                "Probable punta de lanza o flecha (pedunculada o foliácea)."
            )
        else:  # Triangular
            subtipo = "Punta triangular (punta de flecha)"
            conf = min(0.88, sol * 0.6 + 0.28)
            desc = (
                "Forma triangular con bordes convergentes. "
                "Morfología compatible con punta de flecha triangular, "
                "posiblemente con retoque bifacial en los bordes."
            )
        return _resultado("Punta de proyectil", subtipo, conf, desc, indicadores)

    # 3. BIFAZ — amigdaloide / lanceolada grande y robusta
    if forma in {"Amigdaloide", "Lanceolada"} and sol >= 0.76 and 1.2 <= ar <= 2.8 and circ > 0.52:
        if forma == "Amigdaloide":
            subtipo = "Bifaz amigdaloide (almendrado)"
            conf = min(0.90, (sol * 0.45 + circ * 0.30 + 0.15))
            desc = (
                "Forma almendrada característica del bifaz amigdaloide. "
                "Alta solidez y simetría bilateral. Compatible con bifaz Achelense "
                "o herramienta bifacial de talla uniforme."
            )
        else:
            subtipo = "Bifaz lanceolado"
            conf = min(0.85, (sol * 0.5 + 0.30))
            desc = (
                "Bifaz de forma lanceolada, más elongado que el amigdaloide. "
                "Posible hacha de mano o instrumento de trabajo bifacial."
            )
        return _resultado("Bifaz", subtipo, conf, desc, indicadores)

    # 4. LÁMINA LÍTICA — muy elongada, bordes paralelos
    if forma == "Laminar" or (ar > 2.5 and sol >= 0.75 and circ < 0.65):
        if ar > 4.0:
            subtipo = "Lámina larga"
            conf = min(0.88, sol * 0.6 + 0.25)
        else:
            subtipo = "Lámina corta / hojita"
            conf = min(0.82, sol * 0.55 + 0.22)
        desc = (
            "Forma laminar elongada con bordes subparalelos. "
            "Compatible con lámina lítica extraída de núcleo prismático. "
            "Puede presentar retoque en uno o ambos bordes."
        )
        return _resultado("Lámina lítica", subtipo, conf, desc, indicadores)

    # 5. RASPADOR — forma ancha, borde convexo retocado
    if circ >= 0.58 and ar <= 1.8 and sol >= 0.72 and forma in {
        "Circular", "Subcircular", "Amigdaloide", "Elipsoidal",
        "Irregular redondeado", "Lobulado"
    }:
        if circ >= 0.78:
            subtipo = "Raspador discoide / circular"
            conf = min(0.85, circ * 0.6 + sol * 0.25)
            desc = (
                "Forma circular o subcircular con alta convexidad. Compatible con "
                "raspador discoide de borde perimetral retocado."
            )
        else:
            subtipo = "Raspador frontal"
            conf = min(0.80, (circ * 0.5 + sol * 0.3))
            desc = (
                "Lasca o fragmento de forma redondeada con probable retoque frontal. "
                "Compatible con raspador simple sobre lasca."
            )
        return _resultado("Raspador", subtipo, conf, desc, indicadores)

    # 6. PERFORADOR / BURIL — extremadamente elongado y estrecho
    if ar > 3.0 and sol >= 0.58 and circ < 0.52:
        subtipo = "Perforador / Buril"
        conf = min(0.82, (ar / 6.0) * 0.5 + sol * 0.3)
        desc = (
            "Forma muy elongada y estrecha. Compatible con perforador, buril "
            "o punzón lítico de extremo activo aguzado."
        )
        return _resultado("Perforador", subtipo, conf, desc, indicadores)

    # 7. CUCHILLO LÍTICO — lanceolado + moderadamente elongado
    if forma == "Lanceolada" and 1.8 <= ar <= 3.5 and circ >= 0.50 and sol >= 0.68:
        subtipo = "Cuchillo / Hoja bifacial"
        conf = min(0.80, (sol * 0.45 + circ * 0.25 + 0.10))
        desc = (
            "Forma lanceolada alargada con buen acabado morfológico. "
            "Compatible con cuchillo de dorso natural o hoja bifacial "
            "de uso cortante."
        )
        return _resultado("Cuchillo lítico", subtipo, conf, desc, indicadores)

    # 8. GUIJARRO / CANTO RODADO
    if circ >= 0.72 and sol >= 0.88 and ar <= 1.6:
        subtipo = "Guijarro / Canto rodado con o sin marcas"
        conf = min(0.78, circ * 0.6 + sol * 0.2)
        desc = (
            "Morfología subcircular muy regular con alta solidez. "
            "Puede corresponder a un canto rodado, guijarro con percusión "
            "o artefacto sobre soporte natural sin talla."
        )
        return _resultado("Guijarro", subtipo, conf, desc, indicadores)

    # 9. LASCA TABULAR — rectangular, plana
    if (forma in {"Rectangular", "Cuadrangular", "Trapezoidal"} or rec >= 0.60) and sol >= 0.72:
        subtipo = "Lasca tabular / Lasca de decorticado"
        conf = min(0.75, (rec * 0.5 + sol * 0.25))
        desc = (
            "Forma tabular o rectangular. Compatible con lasca de decorticado, "
            "tableta de núcleo o lasca tabular con córtex conservado."
        )
        return _resultado("Lasca", subtipo, conf, desc, indicadores)

    # 10. NÚCLEO — compacto, bajo rellenado, múltiples negatives
    if sol < 0.70 and circ < 0.55 and ar <= 2.0:
        if eq_diam > 60:
            subtipo = "Núcleo de gran formato"
            conf = 0.72
        else:
            subtipo = "Núcleo discoide / informal"
            conf = 0.65
        desc = (
            "Objeto compacto con baja solidez indicativa de múltiples lascados. "
            "Compatible con núcleo del que se han extraído lascas o láminas."
        )
        return _resultado("Núcleo", subtipo, conf, desc, indicadores)

    # 11. LASCA IRREGULAR — fallback general
    if sol >= 0.55:
        subtipo = "Lasca irregular"
        conf = min(0.65, sol * 0.5 + 0.10)
        desc = (
            "Lasca de morfología irregular sin patrón tipológico dominante. "
            "Probablemente lasca de talla secundaria o retoque no estandarizado."
        )
        return _resultado("Lasca", subtipo, conf, desc, indicadores)

    # 12. INDETERMINADO
    return _resultado(
        tipo="Indeterminado",
        subtipo="Sin clasificación tipológica confiable",
        confianza=0.20,
        descripcion=(
            "Los indicadores morfométricos no permiten asignar una categoría "
            "tipológica con suficiente confianza. Se recomienda inspección visual."
        ),
        indicadores=indicadores,
    )


def _resultado(tipo, subtipo, confianza, descripcion, indicadores):
    color = TIPO_COLORS.get(tipo, TIPO_COLORS["Indeterminado"])
    icono = TIPO_ICONS.get(tipo, "?")
    return {
        "tipo":         tipo,
        "subtipo":      subtipo,
        "confianza":    round(float(confianza), 3),
        "descripcion":  descripcion,
        "metodo":       "morfometrico_reglas",
        "color":        color,
        "icono":        icono,
        "indicadores":  indicadores,
    }


async def classify_async(metrics: dict) -> dict:
    """Versión async del clasificador (permite integrarse en endpoints FastAPI)."""
    return classify(metrics)
