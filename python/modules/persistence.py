"""
persistence.py — Capa de persistencia de archivos para modo navegador.

Estado: IMPLEMENTADO (IMPLEMENTED = True)

Reemplaza electronAPI.saveFile / ensureFolder / readFile / readdir cuando
la app se ejecuta en modo navegador (sin Electron). Todos los endpoints
operan únicamente sobre rutas absolutas locales del sistema que ejecuta el
servidor FastAPI (localhost:8765).

Métodos exportados:
  ensure_folder(path)               → mkdir -p
  save_file(path, content, enc)     → escribe texto o binario (base64)
  read_file(path, encoding)         → lee texto o devuelve base64
  list_folder(path)                 → listado de entradas del directorio
"""

import base64
import os
import pathlib

IMPLEMENTED = True

# Directorio base permitido: sólo rutas dentro del home del usuario
_BASE_DIR = pathlib.Path.home()


# ── Utilidades internas ─────────────────────────────────────────────────

def _safe_path(path: str) -> pathlib.Path:
    """
    Resuelve la ruta y la devuelve como pathlib.Path absoluto.
    Restringe al directorio de usuario (_BASE_DIR) para evitar path traversal.
    Lanza ValueError si la ruta está vacía o fuera del home del usuario.
    """
    if not path or not path.strip():
        raise ValueError("Ruta vacía")
    p = pathlib.Path(path).resolve()
    if str(p) != str(_BASE_DIR) and not str(p).startswith(str(_BASE_DIR) + os.sep):
        raise ValueError(f"Ruta '{p}' fuera del directorio de usuario permitido.")
    return p


# ── API pública ──────────────────────────────────────────────────────────────

def ensure_folder(path: str) -> dict:
    """
    Crea el directorio (y sus padres) si no existe.
    Equivale a electronAPI.ensureFolder(path).
    """
    try:
        p = _safe_path(path)
        p.mkdir(parents=True, exist_ok=True)
        return {"success": True, "path": str(p)}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def save_file(path: str, content: str, encoding: str = "text") -> dict:
    """
    Guarda contenido en disco.

    encoding='text'   → content es string UTF-8 (JSON, CSV, SVG…)
    encoding='base64' → content es data URL (data:…;base64,…) o base64 puro
                       Se escriben bytes decodificados (PNG, JPEG, PDF…)

    Equivale a electronAPI.saveFile(path, content).
    Crea los directorios padres automáticamente.
    """
    try:
        p = _safe_path(path)
        p.parent.mkdir(parents=True, exist_ok=True)

        if encoding == "base64":
            # Eliminar encabezado data URL si existe
            raw_b64 = content.split(",", 1)[1] if "," in content else content
            # Añadir padding si faltan caracteres
            missing = len(raw_b64) % 4
            if missing:
                raw_b64 += "=" * (4 - missing)
            raw_bytes = base64.b64decode(raw_b64)
            p.write_bytes(raw_bytes)
        else:
            p.write_text(content, encoding="utf-8")

        return {"success": True, "path": str(p), "size": p.stat().st_size}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def read_file(path: str, encoding: str = "text") -> dict:
    """
    Lee el contenido de un archivo.

    encoding='text'   → devuelve string UTF-8 en campo 'content'
    encoding='base64' → devuelve data URL en campo 'content'

    Equivale a electronAPI.readFile(path).
    """
    try:
        p = _safe_path(path)
        if not p.exists():
            return {"success": False, "error": f"Archivo no encontrado: {p}"}

        if encoding == "base64":
            mime = _mime_from_suffix(p.suffix)
            raw   = p.read_bytes()
            b64   = base64.b64encode(raw).decode("ascii")
            content = f"data:{mime};base64,{b64}"
        else:
            content = p.read_text(encoding="utf-8")

        return {"success": True, "content": content, "path": str(p),
                "size": p.stat().st_size}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def list_folder(path: str) -> dict:
    """
    Lista el contenido de un directorio.
    Devuelve entradas con: name, path, is_dir, size.
    """
    try:
        p = _safe_path(path)
        if not p.is_dir():
            return {"success": False, "error": f"No es un directorio: {p}"}

        entries = []
        for child in sorted(p.iterdir()):
            entries.append({
                "name":   child.name,
                "path":   str(child),
                "is_dir": child.is_dir(),
                "size":   child.stat().st_size if child.is_file() else 0,
            })

        return {"success": True, "path": str(p), "entries": entries}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ── Helpers internos ─────────────────────────────────────────────────────────

def _mime_from_suffix(suffix: str) -> str:
    _MAP = {
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".pdf":  "application/pdf",
        ".json": "application/json",
        ".csv":  "text/csv",
        ".svg":  "image/svg+xml",
    }
    return _MAP.get(suffix.lower(), "application/octet-stream")
