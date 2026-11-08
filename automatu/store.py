"""AutomatU's metadata store: Postgres with pgvector (docker-compose.yml), through
psycopg. It holds what AutomatU itself makes - bindings, embeddings, placements
and map snapshots - and never the code, commits, thoughts or canvas text they are
about, which stay in GitX and on the canvas (t-8e84306eed).

The schema is the files in migrations/, applied once each, in name order, so each
table arrives with the code that uses it (t-4f6e9e91e5).
"""
from __future__ import annotations

import os
import threading
from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"
DB_URL = os.environ.get("AUTOMATU_DB_URL", "postgresql://automatu:automatu@127.0.0.1:5433/automatu")

_local = threading.local()


def db() -> psycopg.Connection:
    """This thread's connection, made on first use, so FastAPI's request threads
    never share one. Autocommit: each statement stands alone unless a caller
    opens a transaction block (t-3d55dc2ad0)."""
    conn = getattr(_local, "conn", None)
    if conn is None or conn.closed:
        conn = psycopg.connect(os.environ.get("AUTOMATU_DB_URL", DB_URL), autocommit=True)
        try:
            register_vector(conn)
        except psycopg.ProgrammingError:
            pass  # the vector type is made by the first migration; registered again after it
        _local.conn = conn
    return conn


def close() -> None:
    conn = getattr(_local, "conn", None)
    if conn is not None and not conn.closed:
        conn.close()
    _local.conn = None


def migrate() -> list[str]:
    """Applies every migration not yet applied, each in its own transaction, and
    returns the names it applied."""
    conn = db()
    conn.execute("CREATE TABLE IF NOT EXISTS applied_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    done = {r[0] for r in conn.execute("SELECT name FROM applied_migrations")}
    applied = []
    for f in sorted(MIGRATIONS.glob("*.sql")):
        if f.name in done:
            continue
        try:
            with conn.transaction():
                conn.execute(f.read_text(encoding="utf-8"))
                conn.execute("INSERT INTO applied_migrations (name) VALUES (%s)", (f.name,))
        except psycopg.Error as e:
            raise RuntimeError("migration " + f.name + " failed: " + str(e)) from e
        applied.append(f.name)
    register_vector(conn)
    return applied
