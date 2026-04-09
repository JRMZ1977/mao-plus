"""
MAO Plus — Módulo: Segmentación asistida por IA
================================================
Pipeline dual de segmentación de objetos:

  Nivel 1 — GrabCut AI (siempre disponible, sin descarga):
    GrabCut iterativo con seeds inteligentes derivados del bbox.
    BGD_SEGURO: franja exterior al bbox + bordes de imagen.
    FGD_SEGURO: 20% central del bbox.
    Sin dependencias adicionales — OpenCV puro.

  Nivel 2 — MobileSAM ONNX (opcional, ~54 MB descarga):
    Segment Anything Model variante mobile.
    Solo activo cuando los modelos .onnx están en python/models/.
    Para exportarlos: requiere torch + ultralytics (ver README.md).
    Automáticamente preferido sobre GrabCut si están disponibles.

Endpoints expuestos en server.py:
    GET  /api/sam/status    → estado del módulo
    POST /api/sam/download  → descarga .pt + genera instrucciones
    POST /api/sam-contour   → segmenta + extrae contorno

La función pública principal es segment() — usa el mejor método disponible.
"""

from __future__ import annotations

import logging
import urllib.request
from pathlib import Path

import cv2
import numpy as np

IMPLEMENTED = True
_log = logging.getLogger(__name__)


# ── Rutas de modelos ONNX (Nivel 2) ──────────────────────────────────────────
_MODELS_DIR   = Path(__file__).parent.parent / "models"
_ENCODER_PATH = _MODELS_DIR / "mobile_sam_encoder.onnx"
_DECODER_PATH = _MODELS_DIR / "mobile_sam_decoder.onnx"
_ENCODER_SIZE_MIN = 35_000_000   # ~37 MB
_DECODER_SIZE_MIN = 15_000_000   # ~17 MB

# Normalización SAM (ImageNet)
_SAM_MEAN     = np.array([123.675, 116.28, 103.53], dtype=np.float32)
_SAM_STD      = np.array([58.395,  57.12,  57.375],  dtype=np.float32)
_SAM_IMG_SIZE = 1024


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS DE ESTADO
# ══════════════════════════════════════════════════════════════════════════════

def onnxruntime_available() -> bool:
    try:
        import onnxruntime  # noqa: F401
        return True
    except ImportError:
        return False


def models_ready() -> bool:
    """Comprueba si los modelos ONNX están presentes y con tamaño mínimo."""
    try:
        enc_ok = _ENCODER_PATH.exists() and _ENCODER_PATH.stat().st_size >= _ENCODER_SIZE_MIN
        dec_ok = _DECODER_PATH.exists() and _DECODER_PATH.stat().st_size >= _DECODER_SIZE_MIN
        return enc_ok and dec_ok
    except OSError:
        return False


def status() -> dict:
    """Estado completo del módulo — responde a GET /api/sam/status."""
    ort_ok   = onnxruntime_available()
    enc_size = _ENCODER_PATH.stat().st_size if _ENCODER_PATH.exists() else 0
    dec_size = _DECODER_PATH.stat().st_size if _DECODER_PATH.exists() else 0
    sam_ready = models_ready() and ort_ok
    mode     = "mobilesam_onnx" if sam_ready else "grabcut_ai"

    return {
        "ready":              True,          # GrabCut AI siempre está listo
        "mode":               mode,
        "grabcut_available":  True,
        "onnxruntime":        ort_ok,
        "encoder_downloaded": enc_size >= _ENCODER_SIZE_MIN,
        "decoder_downloaded": dec_size >= _DECODER_SIZE_MIN,
        "encoder_size_mb":    round(enc_size / 1_048_576, 1),
        "decoder_size_mb":    round(dec_size / 1_048_576, 1),
        "models_dir":         str(_MODELS_DIR),
        "note": (
            "MobileSAM ONNX activo." if sam_ready
            else "GrabCut AI activo — no requiere descarga. "
                 "Para MobileSAM exporta los modelos .onnx (ver python/models/README.md)."
        ),
    }


def download_models(progress_cb=None) -> dict:
    """
    Intenta descargar el .pt de MobileSAM y genera instrucciones de exportación.

    Los modelos ONNX (.onnx) no están en URLs públicas; deben exportarse
    localmente desde el .pt con torch + ultralytics. Esto crea el README.
    """
    _MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Si los modelos ONNX ya existen, confirmamos
    if models_ready():
        return {"ok": True, "message": "Modelos SAM ONNX ya están disponibles.", "grabcut_active": True}

    # Intentar descargar el .pt de MobileSAM (el .pt sí está en HuggingFace)
    pt_path = _MODELS_DIR / "mobile_sam.pt"
    pt_downloaded = False
    if not pt_path.exists():
        try:
            if progress_cb: progress_cb("mobile_sam.pt", 0, 1)
            urllib.request.urlretrieve(
                "https://huggingface.co/dhkim2810/MobileSAM/resolve/main/mobile_sam.pt",
                pt_path,
                lambda c, b, t: progress_cb and t > 0 and progress_cb("mobile_sam.pt", c * b, t),
            )
            pt_downloaded = pt_path.exists() and pt_path.stat().st_size > 1_000_000
        except Exception as e:
            _log.warning(f"No se pudo descargar mobile_sam.pt: {e}")

    # Generar README con instrucciones
    readme = _MODELS_DIR / "README.md"
    readme.write_text(
        "# Modelos SAM para MAO Plus\n\n"
        "## GrabCut AI (activo, sin descarga)\n"
        "El botón 'Analizar con IA' ya funciona con GrabCut iterativo con\n"
        "seeds inteligentes. No requiere instalación adicional.\n\n"
        "## MobileSAM ONNX (opcional, mayor precisión en bordes)\n"
        "Requiere exportar los modelos desde el .pt oficial:\n\n"
        "```bash\n"
        "pip install torch torchvision ultralytics\n"
        "python - <<'EOF'\n"
        "from ultralytics import SAM\n"
        "m = SAM('python/models/mobile_sam.pt')\n"
        "m.export(format='onnx')\n"
        "# Mover mobile_sam_encoder.onnx y mobile_sam_decoder.onnx\n"
        "# a la carpeta python/models/\n"
        "EOF\n"
        "```\n"
    )

    return {
        "ok":             True,
        "grabcut_active": True,
        "pt_downloaded":  pt_downloaded,
        "sam_onnx_ready": False,
        "readme_path":    str(readme),
        "message": (
            "GrabCut AI activo — el análisis con IA ya funciona. "
            + ("mobile_sam.pt descargado. " if pt_downloaded else "")
            + "Para MobileSAM ONNX de mayor precisión, sigue python/models/README.md"
        ),
    }


# ══════════════════════════════════════════════════════════════════════════════
# NIVEL 1 — GrabCut AI con seeds inteligentes
# ══════════════════════════════════════════════════════════════════════════════

def _grabcut_ai(img_bgr: np.ndarray,
                bbox_x: int, bbox_y: int, bbox_w: int, bbox_h: int) -> np.ndarray:
    """
    Segmentación GrabCut con seeds inteligentes sobre un ROI de contexto.

    En vez de operar sobre la imagen completa (lento para imágenes de 4K),
    crea un ROI de contexto = bbox + 30% de margen por lado.
    Ventajas:
      - El GMM de color se construye solo con píxeles relevantes (fondo real local)
      - 10-50x más rápido que procesar la imagen completa
      - Mayor precisión: evita que colores lejanos contaminen el modelo

    Seeds en el ROI:
      GC_BGD:     bordes del ROI de contexto (fondo garantizado)
      GC_FGD:     20% central del bbox (núcleo seguro del objeto)
      GC_PR_FGD:  interior del bbox (probable objeto)
      GC_PR_BGD:  margen del ROI fuera del bbox (probablemente fondo)

    Si la primera pasada produce máscara trivial (coverage <3% o >97%),
    hace un segundo intento en modo GC_INIT_WITH_RECT.

    Retorna máscara uint8 (255=objeto, 0=fondo) del tamaño del bbox.
    """
    orig_h, orig_w = img_bgr.shape[:2]
    x1 = max(0, bbox_x);  y1 = max(0, bbox_y)
    x2 = min(orig_w, bbox_x + bbox_w)
    y2 = min(orig_h, bbox_y + bbox_h)
    bw = x2 - x1;  bh = y2 - y1

    if bw < 10 or bh < 10:
        return np.ones((bh, bw), dtype=np.uint8) * 255

    # ── ROI de contexto: bbox + 30% de margen ────────────────────────────────
    margin_x = max(10, int(bw * 0.30))
    margin_y = max(10, int(bh * 0.30))
    ctx_x1 = max(0, x1 - margin_x);  ctx_y1 = max(0, y1 - margin_y)
    ctx_x2 = min(orig_w, x2 + margin_x);  ctx_y2 = min(orig_h, y2 + margin_y)
    ctx_img = img_bgr[ctx_y1:ctx_y2, ctx_x1:ctx_x2]
    ctx_h, ctx_w = ctx_img.shape[:2]

    # Coordenadas del bbox relativas al ROI de contexto
    rx1 = x1 - ctx_x1;  ry1 = y1 - ctx_y1
    rx2 = x2 - ctx_x1;  ry2 = y2 - ctx_y1

    def _run_grabcut_mask(iters: int = 7) -> np.ndarray:
        """Primera pasada: GC_INIT_WITH_MASK con seeds inteligentes."""
        gc_mask = np.full((ctx_h, ctx_w), cv2.GC_PR_BGD, dtype=np.uint8)

        # Interior bbox → probable objeto
        gc_mask[ry1:ry2, rx1:rx2] = cv2.GC_PR_FGD

        # Núcleo 20% central del bbox → FGD seguro
        cx = max(1, int(round((rx2 - rx1) * 0.20)))
        cy = max(1, int(round((ry2 - ry1) * 0.20)))
        if (ry1 + cy) < (ry2 - cy) and (rx1 + cx) < (rx2 - cx):
            gc_mask[ry1 + cy: ry2 - cy, rx1 + cx: rx2 - cx] = cv2.GC_FGD

        # Bordes del ROI de contexto → BGD seguro
        brd = max(2, int(min(ctx_h, ctx_w) * 0.01))
        gc_mask[:brd, :]  = cv2.GC_BGD;  gc_mask[-brd:, :]  = cv2.GC_BGD
        gc_mask[:, :brd]  = cv2.GC_BGD;  gc_mask[:, -brd:]  = cv2.GC_BGD

        bgd = np.zeros((1, 65), np.float64)
        fgd = np.zeros((1, 65), np.float64)
        cv2.grabCut(ctx_img, gc_mask, (rx1, ry1, rx2 - rx1, ry2 - ry1),
                    bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
        return gc_mask

    def _run_grabcut_rect() -> np.ndarray:
        """Segunda pasada: GC_INIT_WITH_RECT (más agresivo, menos asunciones)."""
        gc_mask = np.zeros((ctx_h, ctx_w), dtype=np.uint8)
        bgd = np.zeros((1, 65), np.float64)
        fgd = np.zeros((1, 65), np.float64)
        cv2.grabCut(ctx_img, gc_mask, (rx1, ry1, rx2 - rx1, ry2 - ry1),
                    bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
        return gc_mask

    def _gc_to_binary(gc_mask: np.ndarray) -> np.ndarray:
        return np.where(
            (gc_mask == cv2.GC_BGD) | (gc_mask == cv2.GC_PR_BGD),
            np.uint8(0), np.uint8(255)
        )

    # ── Primera pasada (MASK mode) ────────────────────────────────────────────
    try:
        gc1 = _run_grabcut_mask(iters=7)
        mask_ctx = _gc_to_binary(gc1)
    except cv2.error as e:
        _log.warning(f"GrabCut MASK falló: {e} → bbox completo")
        return np.full((bh, bw), 255, dtype=np.uint8)

    mask_crop = mask_ctx[ry1:ry2, rx1:rx2].copy()
    coverage  = float((mask_crop > 0).sum()) / max(bw * bh, 1)

    # ── Segunda pasada si máscara trivial (RECT mode) ─────────────────────────
    if coverage > 0.97 or coverage < 0.03:
        _log.info(f"GrabCut MASK trivial (cov={coverage:.2f}) → reintento RECT")
        try:
            gc2 = _run_grabcut_rect()
            mask_ctx2 = _gc_to_binary(gc2)
            mask_crop2 = mask_ctx2[ry1:ry2, rx1:rx2].copy()
            cov2 = float((mask_crop2 > 0).sum()) / max(bw * bh, 1)
            if 0.03 <= cov2 <= 0.97:
                mask_crop = mask_crop2
                coverage  = cov2
                _log.info(f"GrabCut RECT exitoso (cov={cov2:.2f})")
            else:
                _log.warning(f"GrabCut RECT también trivial (cov={cov2:.2f}) → bbox completo")
                mask_crop = np.full((bh, bw), 255, dtype=np.uint8)
        except cv2.error as e:
            _log.warning(f"GrabCut RECT falló: {e} → bbox completo")
            mask_crop = np.full((bh, bw), 255, dtype=np.uint8)

    # ── Limpieza morfológica final ─────────────────────────────────────────────
    if coverage > 0.03 and coverage < 0.97:
        kernel    = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask_crop = cv2.morphologyEx(mask_crop, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask_crop = cv2.morphologyEx(mask_crop, cv2.MORPH_OPEN,  kernel, iterations=1)

    return mask_crop


# ══════════════════════════════════════════════════════════════════════════════
# NIVEL 2 — MobileSAM ONNX (carga lazy, solo si modelos presentes)
# ══════════════════════════════════════════════════════════════════════════════

class _SAMSegmenter:
    """Encapsula las sesiones ONNX de MobileSAM con carga lazy."""

    def __init__(self):
        self._encoder = None
        self._decoder = None

    def _load(self):
        if self._encoder is not None:
            return
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        providers = ["CPUExecutionProvider"]
        self._encoder = ort.InferenceSession(str(_ENCODER_PATH), opts, providers=providers)
        self._decoder = ort.InferenceSession(str(_DECODER_PATH), opts, providers=providers)

    @staticmethod
    def _preprocess(img_bgr: np.ndarray):
        orig_h, orig_w = img_bgr.shape[:2]
        scale  = _SAM_IMG_SIZE / max(orig_h, orig_w)
        new_h  = int(round(orig_h * scale));  new_w = int(round(orig_w * scale))
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)
        resized = cv2.resize(img_rgb, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        norm    = (resized - _SAM_MEAN) / _SAM_STD
        pad_h   = _SAM_IMG_SIZE - new_h;  pad_w = _SAM_IMG_SIZE - new_w
        padded  = np.pad(norm, ((0, pad_h), (0, pad_w), (0, 0)), mode="constant")
        tensor  = padded.transpose(2, 0, 1)[np.newaxis].astype(np.float32)
        return tensor, scale, orig_h, orig_w

    def segment(self, img_bgr: np.ndarray,
                bbox_x: int, bbox_y: int, bbox_w: int, bbox_h: int) -> np.ndarray:
        self._load()
        tensor, scale, orig_h, orig_w = self._preprocess(img_bgr)

        enc_name = self._encoder.get_inputs()[0].name   # type: ignore[union-attr]
        embedding = self._encoder.run(None, {enc_name: tensor})[0]  # type: ignore[union-attr]

        x1s = bbox_x * scale;  y1s = bbox_y * scale
        x2s = (bbox_x + bbox_w) * scale;  y2s = (bbox_y + bbox_h) * scale
        coords = np.array([[[x1s, y1s], [x2s, y2s]]], dtype=np.float32)
        labels = np.array([[2, 3]], dtype=np.float32)

        dec_feed = {
            "image_embeddings": embedding,
            "point_coords":     coords,
            "point_labels":     labels,
            "mask_input":       np.zeros((1, 1, 256, 256), dtype=np.float32),
            "has_mask_input":   np.array([0], dtype=np.float32),
            "orig_im_size":     np.array([orig_h, orig_w], dtype=np.float32),
        }
        dec_names = {inp.name for inp in self._decoder.get_inputs()}   # type: ignore[union-attr]
        dec_feed  = {k: v for k, v in dec_feed.items() if k in dec_names}

        logits    = self._decoder.run(None, dec_feed)[0].squeeze()     # type: ignore[union-attr]
        mask_full = (logits > 0.0).astype(np.uint8) * 255

        x = max(0, bbox_x);  y = max(0, bbox_y)
        x2 = min(orig_w, bbox_x + bbox_w);  y2 = min(orig_h, bbox_y + bbox_h)
        mask_crop = mask_full[y:y2, x:x2].copy()

        kernel    = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask_crop = cv2.morphologyEx(mask_crop, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask_crop = cv2.morphologyEx(mask_crop, cv2.MORPH_OPEN,  kernel, iterations=1)
        return mask_crop


_sam_instance: _SAMSegmenter | None = None


def _get_sam() -> _SAMSegmenter:
    global _sam_instance
    if _sam_instance is None:
        _sam_instance = _SAMSegmenter()
    return _sam_instance


# ══════════════════════════════════════════════════════════════════════════════
# API PÚBLICA
# ══════════════════════════════════════════════════════════════════════════════

def segment(img_bgr: np.ndarray,
            bbox_x: int, bbox_y: int, bbox_w: int, bbox_h: int,
            ) -> tuple[np.ndarray, str]:
    """
    Segmenta el objeto dentro del bbox.

    Preferencia: MobileSAM ONNX (si modelos disponibles) → GrabCut AI.
    Retorna (mask_uint8, method_str).
    mask: tamaño del bbox, objeto=255, fondo=0.
    """
    if models_ready() and onnxruntime_available():
        try:
            mask = _get_sam().segment(img_bgr, bbox_x, bbox_y, bbox_w, bbox_h)
            return mask, "mobilesam_onnx"
        except Exception as e:
            _log.warning(f"MobileSAM falló, usando GrabCut AI: {e}")

    mask = _grabcut_ai(img_bgr, bbox_x, bbox_y, bbox_w, bbox_h)
    return mask, "grabcut_ai"
