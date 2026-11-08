"""Tests that need the store run against a database of their own, made fresh for
each test session, never the store's real one (t-bee1ba60cb). They need the
store's container up (docker compose up -d)."""
import os

import psycopg
import pytest

ADMIN = "postgresql://automatu:automatu@127.0.0.1:5433/automatu"
TEST_DB = "automatu_test"


@pytest.fixture(scope="session")
def store():
    with psycopg.connect(ADMIN, autocommit=True) as admin:
        admin.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
        admin.execute(f"CREATE DATABASE {TEST_DB}")
    os.environ["AUTOMATU_DB_URL"] = f"postgresql://automatu:automatu@127.0.0.1:5433/{TEST_DB}"
    from automatu import store as s
    s.close()
    s.migrate()
    yield s
    s.close()
