"""Embeddings, made locally by Ollama (bge-m3, 1024 numbers) and kept in the store
by key and a hash of their text - never the text - so each commit message,
thought and section is embedded once, and again only when its words change
(t-b05ce583a1). Local, so no API key is needed (t-6124ec5728).
"""
from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request

import numpy as np

from .store import db

MODEL = os.environ.get("AUTOMATU_EMBED_MODEL", "bge-m3")
DIM = 1024
OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
BATCH = 16


def text_hash(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:32]


def embed_texts(texts: list[str]) -> list[np.ndarray]:
    """Texts to vectors, in order, through Ollama."""
    out: list[np.ndarray] = []
    for i in range(0, len(texts), BATCH):
        body = json.dumps({"model": MODEL, "input": texts[i:i + BATCH], "truncate": True}).encode("utf-8")
        req = urllib.request.Request(OLLAMA + "/api/embed", data=body, headers={"content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                j = json.loads(res.read().decode("utf-8"))
        except urllib.error.URLError as e:
            raise RuntimeError("Ollama is not answering at " + OLLAMA + ": start it, with " + MODEL + " pulled") from e
        if not isinstance(j.get("embeddings"), list):
            raise RuntimeError("Ollama could not embed: " + str(j.get("error")))
        out += [np.asarray(v, dtype=np.float32) for v in j["embeddings"]]
    return out


def embed_cached(items: list[tuple[str, str]]) -> tuple[dict[str, np.ndarray], int]:
    """items: (key, text) -> (key -> vector, how many had to be made). Cached by
    key and text hash; an empty text gets no vector."""
    want = {k: (t, text_hash(t)) for k, t in items if t and t.strip()}
    keys = list(want)
    have: dict[str, np.ndarray] = {}
    for i in range(0, len(keys), 1000):
        rows = db().execute("SELECT key, text_hash, vec FROM embedding WHERE model = %s AND key = ANY(%s)", (MODEL, keys[i:i + 1000]))
        for key, h, vec in rows:
            if want[key][1] == h:
                have[key] = np.asarray(vec.to_numpy() if hasattr(vec, "to_numpy") else vec, dtype=np.float32)
    missing = [k for k in keys if k not in have]
    if missing:
        vecs = embed_texts([want[k][0] for k in missing])
        conn = db()
        with conn.transaction():
            for k, v in zip(missing, vecs):
                conn.execute(
                    "INSERT INTO embedding (key, model, text_hash, vec) VALUES (%s, %s, %s, %s) "
                    "ON CONFLICT (key, model) DO UPDATE SET text_hash = EXCLUDED.text_hash, vec = EXCLUDED.vec, made_at = now()",
                    (k, MODEL, want[k][1], v))
                have[k] = v
    return have, len(missing)


def normalise(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n else v


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    d = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / d) if d else 0.0
