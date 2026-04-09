"""
Tests de regresión: endpoints /api/fs/* (persistence)
"""
import os
import json
import base64
import pytest


API = "/api/fs"


# ── ensureFolder / mkdir ───────────────────────────────────────────────────────

def test_mkdir_creates_directory(client, tmp_dir):
    path = os.path.join(tmp_dir, "nuevo_dir")
    r = client.post(f"{API}/mkdir", data={"path": path})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert os.path.isdir(path)


def test_mkdir_idempotent(client, tmp_dir):
    path = os.path.join(tmp_dir, "dir_doble")
    client.post(f"{API}/mkdir", data={"path": path})
    r = client.post(f"{API}/mkdir", data={"path": path})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_mkdir_nested(client, tmp_dir):
    path = os.path.join(tmp_dir, "a", "b", "c")
    r = client.post(f"{API}/mkdir", data={"path": path})
    assert r.status_code == 200
    assert os.path.isdir(path)


# ── write / saveFile ───────────────────────────────────────────────────────────

def test_write_text_file(client, tmp_dir):
    path = os.path.join(tmp_dir, "test.txt")
    r = client.post(f"{API}/write",
                    data={"path": path, "content": "hola mundo", "encoding": "text"})
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert open(path).read() == "hola mundo"


def test_write_json_file(client, tmp_dir):
    path = os.path.join(tmp_dir, "data.json")
    payload = json.dumps({"key": "val", "num": 42})
    r = client.post(f"{API}/write",
                    data={"path": path, "content": payload, "encoding": "text"})
    assert r.status_code == 200
    data = json.load(open(path))
    assert data["num"] == 42


def test_write_base64_file(client, tmp_dir):
    """Escribe un PNG sintético como data URL base64."""
    path = os.path.join(tmp_dir, "img.png")
    raw_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20   # header ficticio
    b64 = "data:image/png;base64," + base64.b64encode(raw_bytes).decode()
    r = client.post(f"{API}/write",
                    data={"path": path, "content": b64, "encoding": "base64"})
    assert r.status_code == 200
    saved = open(path, "rb").read()
    assert saved == raw_bytes


def test_write_overwrites_existing(client, tmp_dir):
    path = os.path.join(tmp_dir, "over.txt")
    client.post(f"{API}/write", data={"path": path, "content": "v1", "encoding": "text"})
    client.post(f"{API}/write", data={"path": path, "content": "v2", "encoding": "text"})
    assert open(path).read() == "v2"


def test_write_missing_path_422(client):
    r = client.post(f"{API}/write", data={"content": "x", "encoding": "text"})
    assert r.status_code == 422


# ── read / readFile ────────────────────────────────────────────────────────────

def test_read_text_file(client, tmp_dir):
    path = os.path.join(tmp_dir, "read_me.txt")
    open(path, "w").write("contenido de prueba")
    r = client.get(f"{API}/read", params={"path": path, "encoding": "text"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["content"] == "contenido de prueba"


def test_read_nonexistent_returns_error(client, tmp_dir):
    path = os.path.join(tmp_dir, "no_existe.txt")
    r = client.get(f"{API}/read", params={"path": path})
    assert r.status_code == 200
    assert r.json()["success"] is False


def test_read_base64_returns_data_url(client, tmp_dir):
    """Archivo binario leído en base64 debe retornar data URL."""
    path = os.path.join(tmp_dir, "img.png")
    raw = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
    open(path, "wb").write(raw)
    r = client.get(f"{API}/read", params={"path": path, "encoding": "base64"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    content = body["content"]
    assert content.startswith("data:") and ";base64," in content


# ── list / listFolder ──────────────────────────────────────────────────────────

def test_list_returns_items(client, tmp_dir):
    # Crear varios archivos
    for name in ("a.txt", "b.json", "c.csv"):
        open(os.path.join(tmp_dir, name), "w").write("x")
    r = client.get(f"{API}/list", params={"path": tmp_dir})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    # El servidor usa 'entries' como clave de la lista
    entries = body.get("entries", body.get("items", []))
    names = [item["name"] for item in entries]
    assert "a.txt" in names
    assert "b.json" in names


def test_list_distinguishes_files_and_dirs(client, tmp_dir):
    os.makedirs(os.path.join(tmp_dir, "sub_dir"), exist_ok=True)
    open(os.path.join(tmp_dir, "file.txt"), "w").write("x")
    r = client.get(f"{API}/list", params={"path": tmp_dir})
    body = r.json()
    entries = body.get("entries", body.get("items", []))
    # 'is_dir' (bool) o 'type' (str) según implementación
    def _is_dir(item):
        return item.get("is_dir") is True or item.get("type") == "directory"
    def _is_file(item):
        return item.get("is_dir") is False or item.get("type") == "file"
    by_name = {e["name"]: e for e in entries}
    assert "sub_dir" in by_name and _is_dir(by_name["sub_dir"])
    assert "file.txt" in by_name and _is_file(by_name["file.txt"])


def test_list_nonexistent_returns_error(client, tmp_dir):
    r = client.get(f"{API}/list", params={"path": os.path.join(tmp_dir, "phantomdir")})
    assert r.status_code == 200
    assert r.json()["success"] is False


def test_list_missing_path_422(client):
    r = client.get(f"{API}/list")
    assert r.status_code == 422
