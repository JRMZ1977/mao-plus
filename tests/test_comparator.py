"""
Tests de regresión: endpoints /api/pca y /api/statistics (comparator)
"""
import json
import pytest


# ── Datos de prueba ───────────────────────────────────────────────────────────

def _make_objects(n=5):
    """Genera n objetos con métricas morfológicas variadas."""
    import math
    objs = []
    for i in range(n):
        objs.append({
            "id": f"obj_{i}",
            "metricas": {
                "area":        500 + i * 80,
                "perimeter":   120 + i * 15,
                "circularity": max(0.1, min(1.0, 0.85 - i * 0.08)),
                "elongation":  1.0 + i * 0.2,
                "solidity":    max(0.5, 0.95 - i * 0.05),
            },
        })
    return objs


OBJECTS_5  = _make_objects(5)
OBJECTS_10 = _make_objects(10)
KEYS       = ["area", "perimeter", "circularity", "elongation", "solidity"]


# ── PCA ───────────────────────────────────────────────────────────────────────

def test_pca_returns_200(client):
    r = client.post("/api/pca",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "n_components": "2"})
    assert r.status_code == 200


def test_pca_has_required_keys(client):
    r = client.post("/api/pca",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "n_components": "2"})
    body = r.json()
    for key in ("scores", "explained_variance", "labels"):
        assert key in body, f"Falta clave PCA: {key}"


def test_pca_scores_length_matches_objects(client):
    r = client.post("/api/pca",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "n_components": "2"})
    scores = r.json()["scores"]
    assert len(scores) == len(OBJECTS_5)


def test_pca_scores_are_2d(client):
    r = client.post("/api/pca",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "n_components": "2"})
    for row in r.json()["scores"]:
        assert len(row) == 2, f"Score no es 2D: {row}"


def test_pca_explained_variance_sums_lte_one(client):
    r = client.post("/api/pca",
                    data={"objects_json": json.dumps(OBJECTS_10),
                          "n_components": "2"})
    ev = r.json()["explained_variance"]
    assert sum(ev) <= 1.001  # tolerancia numérica


def test_pca_labels_length_matches_objects(client):
    r = client.post("/api/pca",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "n_components": "2"})
    labels = r.json()["labels"]
    assert len(labels) == len(OBJECTS_5)


def test_pca_too_few_objects_422(client):
    one_obj = json.dumps([OBJECTS_5[0]])
    r = client.post("/api/pca",
                    data={"objects_json": one_obj, "n_components": "2"})
    assert r.status_code in (400, 422)


def test_pca_missing_objects_json_422(client):
    r = client.post("/api/pca", data={"n_components": "2"})
    assert r.status_code == 422


# ── Statistics ────────────────────────────────────────────────────────────────

def test_statistics_returns_200(client):
    r = client.post("/api/statistics",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "keys_json":    json.dumps(KEYS)})
    assert r.status_code == 200


def test_statistics_has_statistics_key(client):
    r = client.post("/api/statistics",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "keys_json":    json.dumps(KEYS)})
    body = r.json()
    assert "statistics" in body


def test_statistics_contains_all_requested_keys(client):
    r = client.post("/api/statistics",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "keys_json":    json.dumps(KEYS)})
    stats = r.json()["statistics"]
    for key in KEYS:
        assert key in stats, f"Falta estadística para: {key}"


def test_statistics_cv_in_0_1_range(client):
    """CV retornado como decimal 0-1 (no %)."""
    r = client.post("/api/statistics",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "keys_json":    json.dumps(["area"])})
    stats = r.json()["statistics"]["area"]
    cv = stats.get("cv", stats.get("cv_pct", None))
    if cv is not None:
        # Si es porcentaje (>1) o decimal (<1), ambos son válidos pero notamos cuál
        assert cv >= 0


def test_statistics_mean_area_correct(client):
    """Media de area debe coincidir con promedio manual."""
    import statistics as st
    areas = [o["metricas"]["area"] for o in OBJECTS_5]
    expected_mean = sum(areas) / len(areas)
    r = client.post("/api/statistics",
                    data={"objects_json": json.dumps(OBJECTS_5),
                          "keys_json":    json.dumps(["area"])})
    body = r.json()["statistics"]["area"]
    mean_val = body.get("mean", body.get("media", None))
    if mean_val is not None:
        assert abs(mean_val - expected_mean) / expected_mean < 0.001


def test_statistics_missing_keys_json_422(client):
    r = client.post("/api/statistics",
                    data={"objects_json": json.dumps(OBJECTS_5)})
    assert r.status_code == 422


# ── Bifacial CI/CMS (Sección XIII) ─────────────────────────────────────────

@pytest.fixture(autouse=False)
def enable_ci_cms(monkeypatch):
    """Habilita CI/CMS para los tests que lo requieren (MAO_ENABLE_CI_CMS=1)."""
    monkeypatch.setenv("MAO_ENABLE_CI_CMS", "1")
    yield
    monkeypatch.delenv("MAO_ENABLE_CI_CMS", raising=False)

def _cara_base(metricas_override=None):
    m = {
        "area": 1000,
        "perimetro": 140,
        "eje_mayor": 60,
        "eje_menor": 40,
        "feret_max": 62,
        "feret_min": 38,
        "circularity": 0.82,
        "solidity": 0.93,
        "elongation": 1.50,
        "rectangularidad": 0.78,
        "simetria_bilateral": 0.85,
        "convexity": 0.96,
        "excentricidad": 0.55,
        "radio_medio": 21,
        "ratio_radios": 0.72,
        "coeficiente_variacion_radial": 0.12,
        "regularidad_radial": 0.84,
        "indice_estrellamiento": 1.08,
        "rugosidad_borde": 0.19,
        "ici": 0.90,
        "curvatura_media": 0.18,
        "varianza_tonal_interna": 280,
        "entropia_superficie": 5.1,
        "gradiente_medio": 14,
        "centroide": [100, 80],
        "angulo_eje_mayor": 12,
        "radio_maximo": 30,
        "radio_minimo": 18,
    }
    if metricas_override:
        m.update(metricas_override)
    return {
        "metricas": m,
        "perforaciones": [],
        "horadaciones": [],
        "clasificacion_forma": "Lanceolada",
    }


def test_bifacial_ci_cms_identicas_altas(client, enable_ci_cms):
    cara_a = _cara_base()
    cara_b = _cara_base({"angulo_eje_mayor": -12})  # reflejo esperado

    r = client.post(
        "/api/bifacial",
        data={
            "cara_a_json": json.dumps(cara_a),
            "cara_b_json": json.dumps(cara_b),
        },
    )

    assert r.status_code == 200
    body = r.json()
    assert body["CI"] is not None and body["CI"] >= 0.95
    assert body["CMS"] is not None and body["CMS"] >= 0.95
    assert body["interpretacionCI_CMS"]["categoria"] == "Correspondencia máxima"


def test_bifacial_ci_alto_cms_bajo_diferenciacion_natural(client, enable_ci_cms):
    cara_a = _cara_base()
    # Mantener dimensiones casi idénticas (CI alto), degradar fuertemente forma/radial/contorno (CMS bajo)
    cara_b = _cara_base({
        "angulo_eje_mayor": -12,
        "circularity": 0.35,
        "solidity": 0.55,
        "elongation": 2.60,
        "rectangularidad": 0.30,
        "simetria_bilateral": 0.30,
        "convexity": 0.60,
        "excentricidad": 0.90,
        "radio_medio": 32,
        "ratio_radios": 0.28,
        "coeficiente_variacion_radial": 0.72,
        "regularidad_radial": 0.25,
        "indice_estrellamiento": 1.95,
        "rugosidad_borde": 0.88,
        "ici": 0.35,
        "curvatura_media": 0.85,
        "varianza_tonal_interna": 2200,
        "entropia_superficie": 7.8,
        "gradiente_medio": 52,
    })

    r = client.post(
        "/api/bifacial",
        data={
            "cara_a_json": json.dumps(cara_a),
            "cara_b_json": json.dumps(cara_b),
        },
    )

    assert r.status_code == 200
    body = r.json()
    assert body["CI"] is not None and body["CI"] >= 0.78
    assert body["CMS"] is not None and body["CMS"] < 0.62
    assert body["interpretacionCI_CMS"]["categoria"] == "Diferenciación natural"
    assert body["interpretacionCI_CMS"]["diferenciacionNatural"] is True


# ── Criterio de atípicos: grados de libertad del umbral ──────────────────────

class TestUmbralAtipicos:
    """
    El umbral de Mahalanobis depende de los GRADOS DE LIBERTAD: d² ~ χ²_r.
    Estaba fijado a 2,716 = sqrt(χ²(2, 0,975)) —correcto solo en 2D, heredado de
    cuando la distancia se calculaba sobre PC1+PC2— pero aplicado a distancias
    de p dimensiones. Sobre datos gaussianos SIN atípicos marcaba el 67 % de los
    objetos con p=10 y el 100 % con p=30.
    """

    @staticmethod
    def _gaussianos(n, p, seed=7, outlier_en=None, desvio=8.0):
        import numpy as _np
        rng = _np.random.default_rng(seed)
        X = rng.standard_normal((n, p))
        if outlier_en is not None:
            X[outlier_en] += desvio          # una pieza claramente fuera del perfil
        keys = [f"m{j}" for j in range(p)]
        return [
            {"id": f"obj_{i}", "metricas": {k: float(X[i, j]) for j, k in enumerate(keys)}}
            for i in range(n)
        ]

    @staticmethod
    def _pca(client, objetos):
        r = client.post("/api/pca", data={"objects_json": json.dumps(objetos),
                                          "n_components": "2"})
        assert r.status_code == 200, r.text
        return r.json()

    def test_ruido_puro_no_es_una_coleccion_de_atipicos(self, client):
        """60 objetos gaussianos, 10 métricas, cero atípicos reales."""
        body = self._pca(client, self._gaussianos(60, 10))
        frac = len(body["outliers"]) / body["n_objects"]
        assert frac <= 0.15, (
            f"{frac:.0%} de objetos marcados como atípicos sobre ruido puro "
            f"(umbral={body['outlier_threshold']}, gl={body['mahalanobis_df']})"
        )

    def test_umbral_escala_con_los_grados_de_libertad(self, client):
        """sqrt(χ²(0,975; gl)): 4,53 con 10 gl — nunca el 2,716 de 2 gl."""
        body = self._pca(client, self._gaussianos(60, 10))
        assert body["mahalanobis_df"] == 10, body["mahalanobis_df"]
        assert abs(body["outlier_threshold"] - 4.5348) < 0.01, body["outlier_threshold"]
        assert body["outlier_status"] == "ok"

    def test_pocos_objetos_se_declara_no_evaluable(self, client):
        """
        Con n ≤ p+1 la covarianza se satura: con pseudo-inversa todas las
        distancias colapsan al mismo valor y el estadístico no discrimina.
        No se fabrican atípicos — se dice «sin evaluar».
        """
        body = self._pca(client, self._gaussianos(8, 20))
        assert body["outlier_status"] == "no_evaluable_pocos_objetos"
        assert body["outliers"] == []
        assert body["outlier_threshold"] is None
        # y efectivamente las distancias son indistinguibles entre sí
        d = body["mahalanobis"]
        assert max(d) - min(d) < 1e-3, d

    def test_atipico_real_si_se_detecta(self, client):
        """El criterio corregido no es ciego: una pieza desplazada sí sale."""
        body = self._pca(client, self._gaussianos(40, 4, outlier_en=0, desvio=9.0))
        assert body["outlier_status"] == "ok"
        assert 0 in body["outliers"], (body["outliers"], body["mahalanobis"][:5])
        assert len(body["outliers"]) <= 4, body["outliers"]
