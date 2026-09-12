"""
ADR-015 B1 — Calibración óptica de lente
==========================================
Tests de la integración del perfil de calibración de lente (calibracion_lente.html → MAO).

Gate ADR-015 B1:
  - Con perfil Zhang (fx disponible): desplazamiento posicional reproducido dentro de tolerancia
  - Sin perfil: cae al FOV sin romper
  - Test de reconciliación de convención k₁ (crítico: OpenCV normaliza por fx, no por W/2)
  - Persistencia y carga de perfiles: guardar, listar, recuperar
"""

from __future__ import annotations

import json
import math
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from python.modules.optical_calibration import (
    _validate_json,
    calcular_error_optico_calibrado,
    load_profile,
    load_profile_from_file,
    list_profiles,
    save_profile,
)


# ────────────────────────────────────────────────────────────────────────────
# Fixtures de perfiles JSON
# ────────────────────────────────────────────────────────────────────────────

def _perfil_zhang(k1=-0.14, k2=0.02, p1=0.0001, p2=-0.0001, rms=0.31):
    """Perfil completo Zhang (fx disponible): mayor precisión."""
    return {
        "mao_calibracion": True,
        "version": "1.0",
        "sesion_nombre": "test_sesion",
        "generado": "2026-09-12T10:00:00Z",
        "camara": {
            "modelo": "Canon EOS R8",
            "focal_mm": 100.0,
            "sensor_ancho_mm": 35.9,
            "sensor_alto_mm": 23.9,
            "resolucion_px": [6000, 4000]
        },
        "calibracion": {
            "metodo": "zhang_tablero",
            "imagenes_usadas": 15,
            "error_reproyeccion_px": rms,
            "incertidumbre_k1_pct": 2.5,
            "calidad": "ALTA"
        },
        "parametros_intrinsicos": {
            "fx": 3600.0,
            "fy": 3600.0,
            "cx": 3000.0,
            "cy": 2000.0
        },
        "distorsion": {
            "k1": k1, "k2": k2, "p1": p1, "p2": p2, "k3": 0.0
        },
        "mao_plus": {
            "k1_estimado": k1,
            "k1_fuente": "zhang_tablero",
            "incertidumbre_modelo_pct": 2.5,
            "listo_para_importar": True
        }
    }


def _perfil_plumb(k1=-0.08):
    """Perfil plumb-line: sin fx, mayor incertidumbre."""
    return {
        "mao_calibracion": True,
        "version": "1.0",
        "sesion_nombre": None,
        "generado": "2026-09-12T10:00:00Z",
        "camara": {
            "modelo": "Canon EOS R8",
            "focal_mm": 100.0,
            "sensor_ancho_mm": 35.9,
            "sensor_alto_mm": 23.9,
            "resolucion_px": [6000, 4000]
        },
        "calibracion": {
            "metodo": "plumb_line",
            "imagenes_usadas": None,
            "error_reproyeccion_px": None,
            "incertidumbre_k1_pct": 7.5,
            "calidad": "MEDIA"
        },
        "parametros_intrinsicos": None,
        "distorsion": {
            "k1": k1, "k2": 0.0, "p1": 0.0, "p2": 0.0, "k3": 0.0
        },
        "mao_plus": {
            "k1_estimado": k1,
            "k1_fuente": "plumb_line",
            "incertidumbre_modelo_pct": 7.5,
            "listo_para_importar": True
        }
    }


# ────────────────────────────────────────────────────────────────────────────
# Tests de validación del JSON
# ────────────────────────────────────────────────────────────────────────────

class TestValidacionJSON:

    def test_perfil_zhang_valido(self):
        _validate_json(_perfil_zhang())  # no debe lanzar

    def test_perfil_plumb_valido(self):
        _validate_json(_perfil_plumb())

    def test_sin_marca_mao_calibracion(self):
        p = _perfil_zhang()
        p["mao_calibracion"] = False
        with pytest.raises(ValueError, match="mao_calibracion"):
            _validate_json(p)

    def test_campo_requerido_ausente(self):
        p = _perfil_zhang()
        del p["distorsion"]
        with pytest.raises(ValueError):
            _validate_json(p)

    def test_k1_ausente(self):
        p = _perfil_zhang()
        del p["distorsion"]["k1"]
        with pytest.raises(ValueError, match="k1"):
            _validate_json(p)


# ────────────────────────────────────────────────────────────────────────────
# Tests de cálculo de error óptico calibrado
# ────────────────────────────────────────────────────────────────────────────

class TestErrorOpticoCalibradc:
    """Test de reconciliación de convención k₁ y cálculo de distorsión."""

    IMG_W, IMG_H = 6000, 4000
    FOCAL_MM = 100.0
    SENSOR_W = 35.9
    SENSOR_H = 23.9

    def _calcular(self, cx, cy, perfil):
        return calcular_error_optico_calibrado(
            cx=cx, cy=cy,
            img_w=self.IMG_W, img_h=self.IMG_H,
            focal_mm=self.FOCAL_MM,
            sensor_w_mm=self.SENSOR_W,
            sensor_h_mm=self.SENSOR_H,
            perfil=perfil,
        )

    def test_objeto_en_centro_error_cero(self):
        """Objeto en el centro de la imagen → error de distorsión ≈ 0."""
        result = self._calcular(
            cx=self.IMG_W / 2, cy=self.IMG_H / 2,
            perfil=_perfil_zhang(k1=-0.14)
        )
        assert result["error_distorsion_percent"] < 0.1
        assert result["error_perspectiva_percent"] < 0.1

    def test_objeto_en_esquina_error_mayor(self):
        """Objeto en esquina → mayor distorsión que en el centro."""
        result_centro = self._calcular(
            cx=self.IMG_W / 2, cy=self.IMG_H / 2,
            perfil=_perfil_zhang()
        )
        result_esquina = self._calcular(
            cx=self.IMG_W * 0.9, cy=self.IMG_H * 0.9,
            perfil=_perfil_zhang()
        )
        assert result_esquina["error_lineal_percent"] > result_centro["error_lineal_percent"]

    def test_reconciliacion_convencion_k1(self):
        """
        Crítico ADR-015 B1: k₁ de OpenCV usa r_n = r_px/fx, NO r_norm = r_px/(W/2).
        Verificar que el camino zhang_intrinsics produce un error DIFERENTE al
        camino fov_normalizado para el mismo k₁.

        En coords OpenCV: r_n = r_px / fx
        En coords FOV:    r_norm = r_px / (W/2)
        Con fx ≈ 3600 y W/2 = 3000 → r_n ≈ r_norm × (3000/3600) = r_norm × 0.833
        Por tanto: error_zhang = k1 × r_n² ≈ k1 × (0.833)² × r_norm² ≈ 0.694 × error_fov
        La diferencia es ~30% — exactamente el factor del ±30% que se quería eliminar.
        """
        k1 = -0.14
        # Objeto a r_px ≈ 1800 px (30% del radio horizontal)
        cx = self.IMG_W / 2 + 1800
        cy = self.IMG_H / 2

        # Camino Zhang (fx disponible)
        r_zhang = self._calcular(cx=cx, cy=cy, perfil=_perfil_zhang(k1=k1))

        # Camino plumb (sin fx → fallback r_norm)
        r_plumb = self._calcular(cx=cx, cy=cy, perfil=_perfil_plumb(k1=k1))

        # Los resultados DEBEN ser distintos (diferentes convenciones)
        assert r_zhang["error_distorsion_percent"] != r_plumb["error_distorsion_percent"], (
            "Los caminos zhang e plumb deben producir distorsiones distintas "
            "(convenciones de normalización distintas)"
        )

        # La nota debe indicar el camino usado
        assert "zhang_intrinsics" in r_zhang["nota_error_optico"]
        assert "fov_normalizado" in r_plumb["nota_error_optico"]

    def test_error_finito_siempre(self):
        """Los errores deben ser siempre finitos (sin NaN ni inf)."""
        for cx in [0, self.IMG_W // 2, self.IMG_W - 1]:
            for cy in [0, self.IMG_H // 2, self.IMG_H - 1]:
                r = self._calcular(cx=cx, cy=cy, perfil=_perfil_zhang())
                assert math.isfinite(r["error_lineal_percent"]), f"NaN/inf en cx={cx}, cy={cy}"
                assert math.isfinite(r["error_area_percent"])

    def test_campos_procedencia_presentes(self):
        """El error óptico calibrado debe incluir campos de procedencia."""
        r = self._calcular(
            cx=self.IMG_W / 2 + 500, cy=self.IMG_H / 2,
            perfil=_perfil_zhang()
        )
        assert "k1_fuente" in r
        assert "incertidumbre_calibracion" in r
        assert "metodo_calibracion" in r
        assert r["metodo_calibracion"] == "calibrado"
        assert "calidad_calibracion" in r

    def test_incertidumbre_zhang_menor_que_plumb(self):
        """Zhang debe reportar menor incertidumbre que plumb-line."""
        r_zhang = self._calcular(
            cx=self.IMG_W / 2 + 500, cy=self.IMG_H / 2,
            perfil=_perfil_zhang(rms=0.30)  # ALTA calidad
        )
        r_plumb = self._calcular(
            cx=self.IMG_W / 2 + 500, cy=self.IMG_H / 2,
            perfil=_perfil_plumb()
        )
        # Zhang: ±2.5%; plumb: ±7.5%
        assert "7.5" in r_plumb["incertidumbre_calibracion"]
        assert "2.5" in r_zhang["incertidumbre_calibracion"]


# ────────────────────────────────────────────────────────────────────────────
# Tests de integración con scale.calculate()
# ────────────────────────────────────────────────────────────────────────────

class TestScaleIntegracion:

    def test_sin_perfil_usa_tabla_fov(self):
        """Sin perfil → camino FOV, nota menciona '±30%'."""
        from python.modules.scale import calculate as scale_calc
        result = scale_calc(
            focal_mm=100.0,
            distancia_mm=500.0,
            sensor_w_mm=35.9,
            sensor_h_mm=23.9,
            img_w_px=6000,
            img_h_px=4000,
            obj_centroide_x=3500.0,
            obj_centroide_y=2000.0,
        )
        nota = result["error_optico"]["nota_error_optico"]
        assert "±30%" in nota or "incertidumbre" in nota.lower()

    def test_con_perfil_zhang_usa_calibrado(self):
        """Con perfil Zhang → nota menciona camino calibrado."""
        from python.modules.scale import calculate as scale_calc
        perfil = _perfil_zhang()
        result = scale_calc(
            focal_mm=100.0,
            distancia_mm=500.0,
            sensor_w_mm=35.9,
            sensor_h_mm=23.9,
            img_w_px=6000,
            img_h_px=4000,
            obj_centroide_x=3500.0,
            obj_centroide_y=2000.0,
            perfil_calibracion=perfil,
        )
        nota = result["error_optico"].get("nota_error_optico", "")
        assert "zhang" in nota.lower() or "calibrado" in nota.lower()

    def test_perfil_invalido_fallback_fov(self):
        """Perfil malformado → fallback silencioso al camino FOV."""
        from python.modules.scale import calculate as scale_calc
        perfil_roto = {"mao_calibracion": True, "distorsion": {"k1": -0.1}}
        # No debe lanzar excepción
        result = scale_calc(
            focal_mm=100.0,
            distancia_mm=500.0,
            sensor_w_mm=35.9,
            sensor_h_mm=23.9,
            img_w_px=6000,
            img_h_px=4000,
            perfil_calibracion=perfil_roto,
        )
        assert "error_optico" in result


# ────────────────────────────────────────────────────────────────────────────
# Tests de persistencia de perfiles
# ────────────────────────────────────────────────────────────────────────────

class TestPersistencia:

    def test_guardar_y_recuperar_perfil(self, tmp_path, monkeypatch):
        """save_profile + load_profile round-trip."""
        import python.modules.optical_calibration as oc
        monkeypatch.setattr(oc, "_PROFILES_DIR", tmp_path)
        perfil = _perfil_zhang()
        save_profile(perfil)
        recuperado = load_profile("Canon EOS R8", 100.0)
        assert recuperado is not None
        assert recuperado["distorsion"]["k1"] == perfil["distorsion"]["k1"]

    def test_cargar_perfil_inexistente_devuelve_none(self, tmp_path, monkeypatch):
        import python.modules.optical_calibration as oc
        monkeypatch.setattr(oc, "_PROFILES_DIR", tmp_path)
        assert load_profile("Nikon Z9", 200.0) is None

    def test_list_profiles(self, tmp_path, monkeypatch):
        import python.modules.optical_calibration as oc
        monkeypatch.setattr(oc, "_PROFILES_DIR", tmp_path)
        save_profile(_perfil_zhang())
        save_profile(_perfil_plumb())
        perfiles = list_profiles()
        assert len(perfiles) >= 1
        assert all("modelo" in p for p in perfiles)

    def test_load_profile_from_file(self, tmp_path):
        p = tmp_path / "test_perfil.json"
        perfil = _perfil_zhang()
        p.write_text(json.dumps(perfil), encoding="utf-8")
        cargado = load_profile_from_file(p)
        assert cargado["distorsion"]["k1"] == perfil["distorsion"]["k1"]

    def test_load_profile_from_file_invalido(self, tmp_path):
        p = tmp_path / "invalido.json"
        p.write_text('{"sin_marca": true}', encoding="utf-8")
        with pytest.raises(ValueError):
            load_profile_from_file(p)
