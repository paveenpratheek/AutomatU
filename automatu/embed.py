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
    """items: (key, text) -> (key -> vector, how many had to be made). Vectors
    are kept by the text they came from, so a box's old and new words never
    push each other out and a text is embedded once, ever; the key only says
    which item a vector answers. An empty text gets no vector."""
    want = {k: (t, text_hash(t)) for k, t in items if t and t.strip()}
    by_hash = {h: t for t, h in want.values()}
    hashes = list(by_hash)
    found: dict[str, np.ndarray] = {}
    for i in range(0, len(hashes), 1000):
        rows = db().execute("SELECT text_hash, vec FROM vector_cache WHERE model = %s AND text_hash = ANY(%s)", (MODEL, hashes[i:i + 1000]))
        for h, vec in rows:
            found[h] = np.asarray(vec.to_numpy() if hasattr(vec, "to_numpy") else vec, dtype=np.float32)
    missing = [h for h in hashes if h not in found]
    if missing:
        vecs = embed_texts([by_hash[h] for h in missing])
        conn = db()
        with conn.transaction():
            for h, v in zip(missing, vecs):
                conn.execute("INSERT INTO vector_cache (model, text_hash, vec) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (MODEL, h, v))
                found[h] = v
    return {k: found[h] for k, (_, h) in want.items() if h in found}, len(missing)


def normalise(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    return v / n if n else v


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    d = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / d) if d else 0.0
