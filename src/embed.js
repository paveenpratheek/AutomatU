/*
 * Embeddings, made locally by Ollama (bge-m3, 1024 numbers) and kept in the
 * store by key and a hash of their text - never the text - so each commit
 * message, thought and section is embedded once, and again only when its
 * words change (t-b05ce583a1). Local, so no API key is needed (t-6124ec5728).
 */
import crypto from 'node:crypto';
import { db } from './store.js';

export const MODEL = process.env.AUTOMATU_EMBED_MODEL || 'bge-m3';
export const DIM = 1024;
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const BATCH = 16;

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);

/* Texts to vectors, in order, through Ollama. */
export async function embedTexts(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    let res;
    try {
      res = await fetch(OLLAMA + '/api/embed', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, input: texts.slice(i, i + BATCH), truncate: true }),
        signal: AbortSignal.timeout(300_000),
      });
    } catch (_) {
      throw new Error('Ollama is not answering at ' + OLLAMA + ': start it, with ' + MODEL + ' pulled');
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(j.embeddings)) throw new Error('Ollama could not embed: ' + (j.error || res.status));
    out.push(...j.embeddings);
  }
  return out;
}

const toSql = (v) => '[' + v.join(',') + ']';
const fromSql = (s) => (typeof s === 'string' ? JSON.parse(s) : s);

/* items: [{ key, text }] -> { vectors: Map key -> vector, made }. Cached by
   key and text hash; an empty text gets no vector. */
export async function embedCached(items) {
  const want = new Map();
  for (const it of items) if (it.text && it.text.trim()) want.set(it.key, { text: it.text, h: hash(it.text) });
  const keys = [...want.keys()];
  const have = new Map();
  for (let i = 0; i < keys.length; i += 1000) {
    const r = await db().query('SELECT key, text_hash, vec::text AS vec FROM embedding WHERE model = $1 AND key = ANY($2)', [MODEL, keys.slice(i, i + 1000)]);
    for (const row of r.rows) if (want.get(row.key).h === row.text_hash) have.set(row.key, fromSql(row.vec));
  }
  const missing = keys.filter((k) => !have.has(k));
  if (missing.length) {
    const vecs = await embedTexts(missing.map((k) => want.get(k).text));
    for (let i = 0; i < missing.length; i++) {
      const k = missing[i];
      await db().query(
        'INSERT INTO embedding (key, model, text_hash, vec) VALUES ($1, $2, $3, $4) ' +
        'ON CONFLICT (key, model) DO UPDATE SET text_hash = EXCLUDED.text_hash, vec = EXCLUDED.vec, made_at = now()',
        [k, MODEL, want.get(k).h, toSql(vecs[i])]);
      have.set(k, vecs[i]);
    }
  }
  return { vectors: have, made: missing.length };
}

export function normalise(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
}
