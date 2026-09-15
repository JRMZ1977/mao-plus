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

    def test_camino_zhang_reproduce_opencv(self):
        """
        Gate de exactitud (no de «diferencia»): el desplazamiento relativo del camino
        Zhang debe coincidir con el modelo de distorsión de OpenCV (cv2.projectPoints)
        con los mismos intrínsecos, incluidos punto principal descentrado y tangencial.
        """
        import cv2
        import numpy as np
        fx = fy = 3600.0
        cxp, cyp = 3012.0, 1990.0
        perfil = _perfil_zhang(k1=-0.14, k2=0.02, p1=0.0004, p2=-0.0003)
        perfil["parametros_intrinsicos"].update({"fx": fx, "fy": fy, "cx": cxp, "cy": cyp})
        d = perfil["distorsion"]
        K = np.array([[fx, 0, cxp], [0, fy, cyp], [0, 0, 1]])
        D = np.array([d["k1"], d["k2"], d["p1"], d["p2"], d["k3"]])
        for (u, v) in [(4500, 3000), (5600, 3700), (800, 400), (1500, 3500)]:
            pn = np.array([[(u - cxp) / fx, (v - cyp) / fy, 1.0]])
            proj, _ = cv2.projectPoints(pn, np.zeros(3), np.zeros(3), K, D)
            verdad = math.hypot(proj[0, 0, 0] - u, proj[0, 0, 1] - v) / math.hypot(u - cxp, v - cyp) * 100
            r = self._calcular(cx=u, cy=v, perfil=perfil)
            assert r["error_distorsion_percent"] == pytest.approx(verdad, abs=0.01), (u, v, verdad, r)
            assert "zhang_intrinsics" in r["nota_error_optico"]

    def test_perfil_sin_normalizacion_declarada_no_usa_su_k1(self):
        """
        Sin intrínsecos, un k₁ sólo tiene sentido con su normalización. El método
        «línea recta» de calibracion_lente.html v1.0 exporta k₁ = −4δ/r² con δ y r en
        píxeles (px⁻¹): leído como adimensional daba 0,011 % donde la distorsión real
        era 5,3 %. Sin declaración → tabla FOV, y se dice.
        """
        from python.modules.scale import _estimar_error_optico
        cx, cy = self.IMG_W * 0.93, self.IMG_H * 0.92
        perfil = _perfil_plumb(k1=-1.02e-4)          # lo que exporta la herramienta real
        r = self._calcular(cx=cx, cy=cy, perfil=perfil)
        fov = _estimar_error_optico(cx, cy, self.IMG_W, self.IMG_H, self.FOCAL_MM, self.SENSOR_W, self.SENSOR_H)
        assert r["k1_perfil_usado"] is False
        assert r["metodo_calibracion"] == "tabla_fov"
        assert r["error_distorsion_percent"] == pytest.approx(fov["error_distorsion_percent"], abs=1e-9)
        assert "±30%" in r["incertidumbre_calibracion"]
        assert "no declara normalización" in r["nota_error_optico"]

    def test_normalizaciones_declaradas_se_aplican_con_su_convencion(self):
        """«semiancho» → k1·(r/(W/2))²; «focal» → k1·(r/fx)² con fx = f·W/sensor."""
        k1 = -0.14
        cx, cy = self.IMG_W / 2 + 1800, self.IMG_H / 2
        p_semi = _perfil_plumb(k1=k1); p_semi["distorsion"]["k1_normalizacion"] = "semiancho"
        p_foc = _perfil_plumb(k1=k1); p_foc["distorsion"]["k1_normalizacion"] = "focal"
        r_semi = self._calcular(cx=cx, cy=cy, perfil=p_semi)
        r_foc = self._calcular(cx=cx, cy=cy, perfil=p_foc)
        assert r_semi["error_distorsion_percent"] == pytest.approx(abs(k1) * (1800 / 3000) ** 2 * 100, abs=1e-3)
        fx_eq = self.FOCAL_MM * self.IMG_W / self.SENSOR_W
        assert r_foc["error_distorsion_percent"] == pytest.approx(abs(k1) * (1800 / fx_eq) ** 2 * 100, abs=1e-3)
        assert r_semi["k1_perfil_usado"] and r_foc["k1_perfil_usado"]

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
        p_plumb = _perfil_plumb()
        p_plumb["distorsion"]["k1_normalizacion"] = "semiancho"
        r_plumb = self._calcular(
            cx=self.IMG_W / 2 + 500, cy=self.IMG_H / 2,
            perfil=p_plumb
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


def test_perfiles_se_guardan_en_el_directorio_de_datos_del_usuario(monkeypatch, tmp_path):
    """En la app empaquetada `python/` está dentro del bundle: los perfiles deben ir al
    directorio de datos del usuario que pasa main.js (MAO_DATA_DIR)."""
    import importlib
    from python.modules import optical_calibration as oc
    monkeypatch.setenv("MAO_DATA_DIR", str(tmp_path))
    assert oc._directorio_perfiles() == tmp_path / "lens_profiles"
    monkeypatch.delenv("MAO_DATA_DIR")
    assert "python" not in oc._directorio_perfiles().parts[-3:]
