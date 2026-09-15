"""
MAO Plus — Módulo: Calibración óptica de lente (ADR-015 B1)
=============================================================
Importa, persiste y consume el perfil de lente generado por calibracion_lente.html.

Esquema JSON de entrada (exportado por calibracion_lente.html v1.0):
{
  "mao_calibracion": true,
  "version": "1.0",
  "camara": {
    "modelo": "Canon EOS R8",
    "focal_mm": 100.0,
    "sensor_ancho_mm": 35.9,
    "sensor_alto_mm": 23.9,
    "resolucion_px": [6000, 4000]
  },
  "calibracion": {
    "metodo": "zhang_tablero" | "plumb_line" | "manual",
    "imagenes_usadas": 15,
    "error_reproyeccion_px": 0.312,
    "incertidumbre_k1_pct": 2.5,
    "calidad": "ALTA"
  },
  "parametros_intrinsicos": {        # solo zhang_tablero
    "fx": 3520.1234, "fy": 3520.4567,
    "cx": 3000.0, "cy": 2000.0
  },
  "distorsion": {
    "k1": -0.142857, "k2": 0.012345,
    "p1": 0.0001, "p2": -0.0002,
    "k3": 0.0
  },
  "mao_plus": {
    "k1_estimado": -0.142857,
    "k1_fuente": "zhang_tablero",
    "incertidumbre_modelo_pct": 2.5,
    "listo_para_importar": true
  }
}

⚠ RECONCILIACIÓN DE CONVENCIÓN DE k₁ (crítico — ADR-015 B1):
  OpenCV: distorsión sobre r_n = r_px / fx  (coordenadas normalizadas por focal)
  _estimar_error_optico: usa r_norm = r_px / (W/2) — NO son intercambiables.
  Con método zhang_tablero (fx disponible): se usa el modelo Brown-Conrady real
    disp_pct = (k1·r_n² + k2·r_n⁴ + k3·r_n⁶ + 2·p1·x_n·y_n + p2·(r_n²+2·x_n²)) × 100
    (verificado contra cv2.projectPoints: ≤ 0,02 pp).
  Sin intrínsecos (plumb_line, manual): el k₁ SÓLO se usa si el perfil declara su
    normalización en `distorsion.k1_normalizacion`:
      "semiancho" → r = r_px / (W/2)           (convención de la tabla FOV de MAO)
      "focal"     → r = r_px / fx, fx = focal_mm · W / sensor_w_mm
    Sin esa declaración el término de distorsión cae a la tabla FOV y la respuesta lo
    dice (`k1_perfil_usado: False`). Motivo, medido en la integración v1.3: el método
    «línea recta» de calibracion_lente.html v1.0 exporta k₁ = −4δ/r² con δ y r en
    PÍXELES (unidades px⁻¹, ~1e-4). Leído como adimensional, MAO informaba 0,011 % de
    distorsión donde la real era 5,3 % — peor que no importar nada (tabla FOV: 10,7 %).
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any, Optional

def _directorio_perfiles() -> Path:
    """
    Perfiles de lente en el directorio de DATOS del usuario, nunca junto al código.

    En la app empaquetada `python/` vive dentro de «MAO Plus.app/Contents/Resources»:
    escribir ahí invalida la firma del bundle, falla si /Applications no es escribible
    y se pierde al actualizar. `main.js` pasa `MAO_DATA_DIR` = app.getPath('userData').
    """
    base = os.environ.get("MAO_DATA_DIR")
    if not base:
        base = str(Path.home() / "Library" / "Application Support" / "mao-plus")
    return Path(base) / "lens_profiles"


# Directorio de persistencia de perfiles (resuelto al importar; los tests lo sustituyen)
_PROFILES_DIR = _directorio_perfiles()

IMPLEMENTED = True


# ────────────────────────────────────────────────────────────────────────────
# I/O de perfiles
# ────────────────────────────────────────────────────────────────────────────

def _profile_key(modelo: str, focal_mm: float) -> str:
    """Clave de archivo: 'Canon_EOS_R8_100mm.json' (sans espacios/caracteres especiales)."""
    safe_model = "".join(c if c.isalnum() else "_" for c in (modelo or "desconocido"))
    focal_str = f"{int(round(focal_mm))}mm" if focal_mm else "focal_desc"
    return f"{safe_model}_{focal_str}.json"


def save_profile(calibration_json: dict) -> str:
    """
    Persiste un perfil de calibración en el directorio de perfiles.

    Retorna la ruta del archivo guardado.
    Lanza ValueError si el JSON no tiene la estructura mínima esperada.
    """
    _validate_json(calibration_json)
    _PROFILES_DIR.mkdir(parents=True, exist_ok=True)

    modelo = calibration_json["camara"].get("modelo", "desconocido")
    focal = calibration_json["camara"].get("focal_mm") or 0.0
    filename = _profile_key(modelo, focal)
    path = _PROFILES_DIR / filename

    with open(path, "w", encoding="utf-8") as f:
        json.dump(calibration_json, f, ensure_ascii=False, indent=2)
    return str(path)


def load_profile(modelo: str, focal_mm: float) -> Optional[dict]:
    """
    Carga el perfil de calibración para una cámara+focal específica.
    Retorna None si no existe.
    """
    key = _profile_key(modelo, focal_mm)
    path = _PROFILES_DIR / key
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_profile_from_file(path: str | Path) -> dict:
    """
    Carga un perfil de calibración desde un archivo JSON.
    Valida su estructura y lanza ValueError si no cumple.
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _validate_json(data)
    return data


def list_profiles() -> list[dict]:
    """
    Lista todos los perfiles guardados.
    Retorna [{modelo, focal_mm, metodo, calidad, path}, ...].
    """
    if not _PROFILES_DIR.exists():
        return []
    profiles = []
    for p in sorted(_PROFILES_DIR.glob("*.json")):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            profiles.append({
                "modelo": d["camara"].get("modelo"),
                "focal_mm": d["camara"].get("focal_mm"),
                "metodo": d["calibracion"].get("metodo"),
                "calidad": d["calibracion"].get("calidad"),
                "incertidumbre_pct": d["calibracion"].get("incertidumbre_k1_pct"),
                "path": str(p),
            })
        except (json.JSONDecodeError, KeyError):
            pass
    return profiles


def _validate_json(data: dict) -> None:
    if not data.get("mao_calibracion"):
        raise ValueError("El JSON no tiene la marca 'mao_calibracion: true'")
    for key in ("camara", "calibracion", "distorsion", "mao_plus"):
        if key not in data:
            raise ValueError(f"Campo requerido ausente: '{key}'")
    if "k1" not in data["distorsion"]:
        raise ValueError("Campo 'distorsion.k1' ausente")


# ────────────────────────────────────────────────────────────────────────────
# Cálculo de desplazamiento posicional con perfil calibrado
# ────────────────────────────────────────────────────────────────────────────

def calcular_error_optico_calibrado(
    cx: float,
    cy: float,
    img_w: int,
    img_h: int,
    focal_mm: float,
    sensor_w_mm: float,
    sensor_h_mm: Optional[float],
    perfil: dict,
) -> dict:
    """
    Calcula el error óptico posicional usando el perfil de calibración real.

    Reemplaza la tabla FOV de `_estimar_error_optico` cuando se dispone de perfil.

    ⚠ Reconciliación de convención de k₁:
      Zhang/OpenCV: disp = k1·r_n² + k2·r_n⁴ + k3·r_n⁶ + distorsión_tangencial
        donde r_n = sqrt((x-cx)²+(y-cy)²) / fx  (coordenadas normalizadas por focal)
      _estimar_error_optico: usa r_norm = r_px/(W/2) — 4× distinto con focal típica

    Parámetros
    ----------
    cx, cy      : centroide del objeto (px, coords absolutas de imagen)
    img_w, img_h: tamaño de la imagen (px)
    focal_mm    : focal del objetivo (mm)
    sensor_w_mm : ancho del sensor (mm)
    sensor_h_mm : alto del sensor (mm); si None, derivado por aspect ratio
    perfil      : JSON de calibración (formato calibracion_lente.html)

    Retorna
    -------
    dict con los mismos campos que `_estimar_error_optico` +
      "k1_fuente": metodo de calibración
      "metodo_calibracion": "calibrado" | "tabla_fov"
    """
    dist = perfil["distorsion"]
    intrinsics = perfil.get("parametros_intrinsicos")
    cal = perfil["calibracion"]
    metodo = cal.get("metodo", "manual")
    incertidumbre_pct = cal.get("incertidumbre_k1_pct", 7.5)

    k1 = dist["k1"]
    k2 = dist.get("k2", 0.0)
    k3 = dist.get("k3", 0.0)
    p1 = dist.get("p1", 0.0)
    p2 = dist.get("p2", 0.0)

    sh = sensor_h_mm if sensor_h_mm else sensor_w_mm * (img_h / img_w)

    # ── Posición radial del centroide ──
    dx = cx - img_w / 2
    dy = cy - img_h / 2

    # ── Error de perspectiva (igual que el camino FOV) ──
    x_sensor = dx * (sensor_w_mm / img_w)
    y_sensor = dy * (sh / img_h)
    r_sensor = math.sqrt(x_sensor ** 2 + y_sensor ** 2)
    theta = math.atan2(r_sensor, focal_mm)
    cos_theta = math.cos(theta)
    error_persp_pct = ((1.0 / (cos_theta * cos_theta)) - 1.0) * 100

    # ── Error de distorsión: camino Zhang o camino FOV ──
    if intrinsics and intrinsics.get("fx"):
        # Camino calibrado completo (Brown-Conrady sobre coords normalizadas OpenCV)
        fx = intrinsics["fx"]
        fy = intrinsics["fy"]
        cx_cal = intrinsics["cx"]
        cy_cal = intrinsics["cy"]

        # Coords normalizadas (r_n = r_px / fx, igual que OpenCV)
        x_n = (cx - cx_cal) / fx
        y_n = (cy - cy_cal) / fy
        r_n2 = x_n ** 2 + y_n ** 2
        r_n4 = r_n2 ** 2
        r_n6 = r_n2 ** 3

        # Radial
        radial = k1 * r_n2 + k2 * r_n4 + k3 * r_n6
        # Tangencial
        tang_x = 2 * p1 * x_n * y_n + p2 * (r_n2 + 2 * x_n ** 2)
        tang_y = p1 * (r_n2 + 2 * y_n ** 2) + 2 * p2 * x_n * y_n
        disp_n = math.sqrt((x_n * radial + tang_x) ** 2 +
                           (y_n * radial + tang_y) ** 2)

        # Desplazamiento relativo al radio medido desde el PUNTO PRINCIPAL (el mismo
        # origen que el modelo); dividir por la distancia al centro geométrico de la
        # imagen mezclaba dos orígenes.
        r_pp = math.hypot(cx - cx_cal, cy - cy_cal)
        disp_px = disp_n * fx
        error_distorsion_pct = (disp_px / r_pp * 100) if r_pp > 1e-9 else abs(radial) * 100
        camino = "zhang_intrinsics"
        k1_usado = True
    else:
        normalizacion = dist.get("k1_normalizacion")
        r_px = math.sqrt(dx ** 2 + dy ** 2)
        if normalizacion == "semiancho":
            r_norm = r_px / (img_w / 2)
            error_distorsion_pct = abs(k1) * r_norm ** 2 * 100
            camino = "fov_normalizado (k1 sobre r/(W/2))"
            k1_usado = True
        elif normalizacion == "focal" and focal_mm and sensor_w_mm:
            fx_eq = focal_mm * img_w / sensor_w_mm
            r_n = r_px / fx_eq
            error_distorsion_pct = abs(k1 * r_n ** 2 + k2 * r_n ** 4 + k3 * r_n ** 6) * 100
            camino = "focal_normalizado (k1 sobre r/fx)"
            k1_usado = True
        else:
            # Convención no declarada → el k₁ del perfil NO se usa (ver cabecera).
            from python.modules.scale import _estimar_error_optico
            fov = _estimar_error_optico(cx=cx, cy=cy, img_w=img_w, img_h=img_h,
                                        focal_mm=focal_mm, sensor_w_mm=sensor_w_mm,
                                        sensor_h_mm=sensor_h_mm)
            error_distorsion_pct = fov["error_distorsion_percent"]
            camino = "tabla_fov (k1 del perfil sin normalización declarada: descartado)"
            k1_usado = False

    # ── Errores combinados (RSS) ──
    error_lineal_pct = math.sqrt(error_distorsion_pct ** 2 + error_persp_pct ** 2)
    error_area_pct = math.sqrt(
        (2 * error_distorsion_pct) ** 2 + (2 * error_persp_pct) ** 2
    )

    # ── Categoría de confianza ──
    if error_lineal_pct < 0.5:
        confianza = "Muy Alta (< 0.5%)"
    elif error_lineal_pct < 1.5:
        confianza = "Alta (< 1.5%)"
    elif error_lineal_pct < 3.0:
        confianza = "Moderada (< 3%)"
    elif error_lineal_pct < 6.0:
        confianza = "Baja (< 6%)"
    else:
        confianza = "Muy Baja (> 6%)"

    # ── Escalera de incertidumbre (ADR-015 B1) ──
    # Zhang ±1–5% > plumb ±7.5% > manual (declarada) > FOV ±30%
    incertidumbre_metodo = {
        "zhang_tablero": f"±{incertidumbre_pct:.1f}% (Zhang/tablero)",
        "plumb_line": "±7.5% (plumb-line)",
        "manual": f"±{incertidumbre_pct:.1f}% (declarada)",
    }.get(metodo, f"±{incertidumbre_pct:.1f}%")
    if not k1_usado:
        incertidumbre_metodo = "±30% (tabla FOV — perfil sin convención de k₁)"

    fov_diag_deg = _fov_diagonal(sensor_w_mm, sh, focal_mm)

    return {
        # Modelo de lente
        "fov_diagonal_deg":          round(fov_diag_deg, 2),
        "k1_estimado":               round(k1, 6) if k1_usado else None,
        # Posición del objeto
        "posicion_radial_norm":      round(math.sqrt(dx**2+dy**2) / (img_w/2), 4),
        "posicion_radial_px":        round(math.sqrt(dx**2+dy**2), 1),
        "angulo_optico_deg":         round(math.degrees(theta), 3),
        # Errores individuales
        "error_distorsion_percent":  round(error_distorsion_pct, 4),
        "error_perspectiva_percent": round(error_persp_pct, 4),
        # Errores combinados
        "error_lineal_percent":      round(error_lineal_pct, 3),
        "error_area_percent":        round(error_area_pct, 3),
        # Clasificación
        "confianza_optica":          confianza,
        "nota_error_optico": (
            (f"k₁ calibrado ({metodo}), {incertidumbre_metodo}. " if k1_usado else
             f"Perfil {metodo} importado, pero su k₁ no declara normalización "
             f"(distorsion.k1_normalizacion): se usa la tabla FOV, {incertidumbre_metodo}. ")
            + f"Camino de cálculo: {camino}."
        ),
        # Procedencia (ADR-015 B1: propagar al CSV/PDF)
        "k1_fuente":                 metodo if k1_usado else "tabla_fov",
        "k1_perfil_usado":           k1_usado,
        "incertidumbre_calibracion": incertidumbre_metodo,
        "metodo_calibracion":        "calibrado" if k1_usado else "tabla_fov",
        "calidad_calibracion":       cal.get("calidad", "DESCONOCIDA"),
    }


def _fov_diagonal(sensor_w: float, sensor_h: float, focal: float) -> float:
    diag = math.sqrt(sensor_w ** 2 + sensor_h ** 2)
    return math.degrees(2 * math.atan(diag / (2 * focal)))
