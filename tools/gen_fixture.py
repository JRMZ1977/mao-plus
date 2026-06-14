#!/usr/bin/env python3
"""
Genera fixtures PNG deterministas para el hook de verificación E2E (ADR-010).

Imágenes resultantes en assets/fixtures/:
  sintetico_escala_objeto_ph.png — escala blanca + objeto oscuro con hueco interior
  sintetico_caraA.png           — cara A bifacial (objeto simple)
  sintetico_caraB.png           — cara B bifacial (objeto simple, orientación distinta)

Geometría conocida → permite asertar área/P-H esperados desde la consola del renderer.
Ejecutar una vez: .venv/bin/python tools/gen_fixture.py
"""

import os
import sys
import numpy as np

try:
    import cv2
except ImportError:
    print("ERROR: cv2 no disponible. Activar .venv antes de ejecutar.", file=sys.stderr)
    sys.exit(1)

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fixtures')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Fixture 1: escala + objeto + hueco ───────────────────────────────────────
# Canvas 800×600, fondo gris medio (para que detect_holes vea contraste)
W, H = 800, 600
img = np.full((H, W, 3), 180, dtype=np.uint8)

# Cuadrado de escala blanco (20×20 px, esquina sup-izq 30,30)
# A 1 m con focal 100 mm y sensor 35.9 mm → 1 px ≈ 4.49 µm
# El backend mide el lado del cuadrado blanco más grande; aquí es 20 px.
SCALE_X, SCALE_Y, SCALE_SZ = 30, 30, 20
cv2.rectangle(img, (SCALE_X, SCALE_Y), (SCALE_X + SCALE_SZ, SCALE_Y + SCALE_SZ),
              (255, 255, 255), -1)

# Objeto oscuro: rectángulo 200×140 px centrado en (450, 320)
OBJ_CX, OBJ_CY, OBJ_W, OBJ_H = 450, 320, 200, 140
ox1, oy1 = OBJ_CX - OBJ_W // 2, OBJ_CY - OBJ_H // 2
ox2, oy2 = OBJ_CX + OBJ_W // 2, OBJ_CY + OBJ_H // 2
cv2.rectangle(img, (ox1, oy1), (ox2, oy2), (60, 55, 50), -1)

# Hueco interior: elipse blanca (simula perforación)
# Centro relativo al objeto; lo suficientemente interior para no tocar el borde del ROI
HOLE_CX, HOLE_CY = OBJ_CX, OBJ_CY
HOLE_RX, HOLE_RY = 22, 16
cv2.ellipse(img, (HOLE_CX, HOLE_CY), (HOLE_RX, HOLE_RY), 0, 0, 360, (255, 255, 255), -1)

path1 = os.path.join(OUT_DIR, 'sintetico_escala_objeto_ph.png')
cv2.imwrite(path1, img)
print(f"✅ {path1}")
print(f"   Escala: cuadrado blanco {SCALE_SZ}×{SCALE_SZ}px en ({SCALE_X},{SCALE_Y})")
print(f"   Objeto: rect {OBJ_W}×{OBJ_H}px, centrado ({OBJ_CX},{OBJ_CY})")
print(f"   Hueco:  elipse {HOLE_RX*2}×{HOLE_RY*2}px en ({HOLE_CX},{HOLE_CY})")

# ── Fixture 2 & 3: bifacial cara A y B ───────────────────────────────────────
for lado, flip_code, suffix in [('A', None, 'caraA'), ('B', 1, 'caraB')]:
    bif = np.full((H, W, 3), 180, dtype=np.uint8)
    # Escala
    cv2.rectangle(bif, (SCALE_X, SCALE_Y), (SCALE_X + SCALE_SZ, SCALE_Y + SCALE_SZ),
                  (255, 255, 255), -1)
    # Objeto asimétrico (trapecio como piedra tallada)
    pts = np.array([
        [350, 200], [500, 200], [530, 420], [320, 420]
    ], dtype=np.int32)
    if flip_code is not None:
        pts[:, 0] = W - pts[:, 0]
    cv2.fillPoly(bif, [pts], (60, 55, 50))
    path_bif = os.path.join(OUT_DIR, f'sintetico_{suffix}.png')
    cv2.imwrite(path_bif, bif)
    print(f"✅ {path_bif}  (cara {lado})")

print("\nFIXTURES LISTOS — commitear assets/fixtures/*.png")
