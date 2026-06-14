"""
Tests ADR-006 — Registro morfométrico canónico.

Tres clases:
  TestInvarianteRector   — el núcleo H cumple invariante + adimensional
  TestIntegridadHomologos — nivel P tiene homologo, y ese homologo existe
  TestContrato2D3D        — fuente_2d/3d coincide con claves reales del pipeline
"""
import json
import math
import pytest

from python.modules.morphometric_registry import (
    REGISTRY,
    MetricSpec,
    nucleo_canonico,
    pares_homologos,
    pares_homologos_coherencia,
)


# ─────────────────────────────────────────────────────────────────────────────
class TestInvarianteRector:
    """Nivel H: toda métrica del núcleo es invariante Y adimensional."""

    def test_nucleo_canonico_no_vacio(self):
        assert len(nucleo_canonico()) >= 5, "El núcleo H debe tener al menos 5 métricas"

    def test_nivel_h_implica_invariante_y_adimensional(self):
        fallos = [
            m.id for m in REGISTRY.values()
            if m.nivel == "H" and not (m.invariante and m.adimensional)
        ]
        assert fallos == [], f"Métricas H que no cumplen el invariante rector: {fallos}"

    def test_nivel_h_no_tiene_homologo(self):
        """Las H son el punto de referencia; no tienen homologo."""
        fallos = [m.id for m in REGISTRY.values() if m.nivel == "H" and m.homologo]
        assert fallos == [], f"Métricas H con homologo (no debería): {fallos}"

    def test_metricas_3d_y_2d_no_en_nucleo(self):
        """Los niveles 3D y 2D no son núcleo canónico (pueden ser adimensionales pero
        dependen de malla/píxel o son dimensionales)."""
        nucleo = set(nucleo_canonico())
        niveles_no_nucleo = {m.id for m in REGISTRY.values() if m.nivel in ("3D", "2D")}
        interseccion = nucleo & niveles_no_nucleo
        assert interseccion == set(), \
            f"IDs de nivel 3D/2D que aparecen en el núcleo H: {interseccion}"

    def test_circularity_en_nucleo(self):
        assert "circularity" in nucleo_canonico()

    def test_feret_ratio_en_nucleo(self):
        assert "feret_ratio" in nucleo_canonico()

    def test_efa_en_nucleo(self):
        assert "efa_coefficients" in nucleo_canonico()


# ─────────────────────────────────────────────────────────────────────────────
class TestIntegridadHomologos:
    """Nivel P: homologo declarado existe en el registro y es de nivel H."""

    def test_pares_homologos_no_vacios(self):
        assert len(pares_homologos()) >= 2, "Debe haber al menos 2 pares P→H"

    def test_homologo_existe_en_registry(self):
        fallos = [
            m.id for m in REGISTRY.values()
            if m.nivel == "P" and m.homologo and m.homologo not in REGISTRY
        ]
        assert fallos == [], f"Métricas P cuyo homologo no existe en el registro: {fallos}"

    def test_homologo_es_de_nivel_h(self):
        fallos = [
            (m.id, m.homologo) for m in REGISTRY.values()
            if m.nivel == "P" and m.homologo
            and REGISTRY.get(m.homologo, MetricSpec(
                id="", nombre="", formula="", nivel="X",
                modalidad=(), invariante=False, adimensional=False,
                homologo=None, unidad="", fuente_2d=None, fuente_3d=None,
            )).nivel != "H"
        ]
        assert fallos == [], f"Pares P cuyo homologo no es de nivel H: {fallos}"

    def test_nivel_p_tiene_fuente_3d(self):
        """Las métricas P son 3D-nativas; deben declarar fuente_3d."""
        fallos = [
            m.id for m in REGISTRY.values()
            if m.nivel == "P" and not m.fuente_3d
        ]
        assert fallos == [], f"Métricas P sin fuente_3d: {fallos}"

    def test_circularity_proxy_homologo(self):
        assert REGISTRY["circularity_proxy"].homologo == "circularity"

    def test_aspect_ratio_resting_homologo(self):
        assert REGISTRY["aspect_ratio_resting"].homologo == "aspect_ratio"

    def test_pares_coherencia_tienen_scale(self):
        specs = pares_homologos_coherencia()
        assert all(s.coherence_scale is not None and s.coherence_scale > 0 for s in specs)


# ─────────────────────────────────────────────────────────────────────────────
class TestContrato2D3D:
    """fuente_2d/fuente_3d coinciden con claves reales del pipeline."""

    def _metricas_reales_2d(self, client, png_bytes):
        """Obtiene las claves reales devueltas por /api/metrics."""
        import json as _json
        pts = [[200 + 100 * math.cos(2 * math.pi * i / 360),
                150 + 60  * math.sin(2 * math.pi * i / 360)] for i in range(360)]
        files = {"image": ("t.png", png_bytes, "image/png")}
        data  = {"contour_json": _json.dumps(pts), "scale_px_mm": "1.0"}
        r = client.post("/api/metrics", data=data, files=files)
        return set(r.json().get("metricas", {}).keys())

    def test_fuente_2d_existe_en_respuesta(self, client, png_bytes):
        """Toda fuente_2d declarada en el registro debe estar en la respuesta real."""
        claves_reales = self._metricas_reales_2d(client, png_bytes)
        fallos = [
            (m.id, m.fuente_2d) for m in REGISTRY.values()
            if m.fuente_2d
            and m.fuente_2d not in claves_reales
            # Excepciones documentadas:
            #   "efa.*"     → subestructura en un endpoint EFA separado (documental)
            #   "texture.*" → endpoint /api/texture separado, no /api/metrics
            and not m.fuente_2d.startswith("efa.")
            and not m.fuente_2d.startswith("texture.")
        ]
        assert fallos == [], (
            f"fuente_2d declaradas en el registro que no aparecen en /api/metrics: {fallos}\n"
            f"Claves disponibles: {sorted(claves_reales)}"
        )

    def test_nivel_2d_exclusivas_no_tienen_fuente_3d(self):
        fallos = [m.id for m in REGISTRY.values() if m.nivel == "2D" and m.fuente_3d]
        assert fallos == [], f"Métricas de nivel 2D con fuente_3d (no esperado): {fallos}"

    def test_nivel_3d_exclusivas_no_tienen_fuente_2d(self):
        fallos = [m.id for m in REGISTRY.values() if m.nivel == "3D" and m.fuente_2d]
        assert fallos == [], f"Métricas de nivel 3D con fuente_2d (no esperado): {fallos}"

    def test_ids_unicos(self):
        """Verificar que no haya colisiones de id en el registro."""
        from python.modules.morphometric_registry import _H, _P, _3D, _2D
        todos = _H + _P + _3D + _2D
        ids = [m.id for m in todos]
        assert len(ids) == len(set(ids)), "IDs duplicados en el registro"

    def test_registry_serializable(self):
        """El registro debe poder serializar a dict básico (para consumo JS/CSV)."""
        from dataclasses import asdict
        for spec in REGISTRY.values():
            d = asdict(spec)
            assert isinstance(d, dict)
            # modalidad es tuple; verificar que se pueda convertir a JSON
            d["modalidad"] = list(d["modalidad"])
            json.dumps(d)
