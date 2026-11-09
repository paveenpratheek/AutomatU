/*
 * One code region's thoughts as a graph (t-b2c1b5bfcc), laid out as the
 * SearchX prototype laid it out: the region a fixed square on the left, its
 * thoughts around a point to its right, pushed apart from each other, pulled
 * along GitX's links, settled by a cooling force simulation. Every start is a
 * fixed place, so the same region always draws the same way (t-d6eb35c57d).
 * No DOM, so it can be tested in Node.
 */
export const KCOL = { decision: '#2F5BD3', finding: '#1F7A6E', cost: '#C2571A', learned: '#6B4FBB' };

/* Positions for the region ('#') and each thought, inside a W x H area. */
export function layoutNet(order, edges, W, H) {
  const pos = { '#': { x: 120, y: H / 2, fixed: true } };
  const ownX = Math.max(260, Math.min(470, W * 0.5));
  order.forEach((id, i) => {
    const a = (i / Math.max(order.length, 1)) * Math.PI * 2;
    pos[id] = { x: ownX + Math.cos(a) * 140, y: H / 2 + Math.sin(a) * 180 };
  });
  const keys = Object.keys(pos);
  const live = edges.filter((e) => pos[e.a] && pos[e.b]);
  for (let it = 0; it < 320; it++) {
    const f = {};
    for (const k of keys) f[k] = [0, 0];
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const p = pos[keys[i]], q = pos[keys[j]], dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
      const rep = 5200 / d2;
      f[keys[i]][0] += rep * dx / d; f[keys[i]][1] += rep * dy / d;
      f[keys[j]][0] -= rep * dx / d; f[keys[j]][1] -= rep * dy / d;
    }
    for (const e of live) {
      const p = pos[e.a], q = pos[e.b], dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1, k = (d - 120) * 0.02;
      f[e.a][0] += k * dx / d; f[e.a][1] += k * dy / d;
      f[e.b][0] -= k * dx / d; f[e.b][1] -= k * dy / d;
    }
    for (const id of order) { const p = pos[id]; f[id][0] += (ownX - p.x) * 0.012; f[id][1] += (H / 2 - p.y) * 0.006; }
    const cool = 1 - it / 340;
    for (const k of keys) {
      const p = pos[k];
      if (p.fixed) continue;
      const fx = Math.max(-18, Math.min(18, f[k][0])), fy = Math.max(-18, Math.min(18, f[k][1]));
      p.x = Math.max(30, Math.min(W - 180, p.x + fx * cool));
      p.y = Math.max(70, Math.min(H - 30, p.y + fy * cool));
    }
  }
  return pos;
}

/* How an edge is drawn: a solid dark line where the code cites the thought,
   a thin grey one to a thought recorded on its commits, a mid grey for
   GitX's links between thoughts. */
export function edgeStyle(kind) {
  if (kind === 'cites') return { col: '#141413', sw: 2, op: 0.8 };
  if (kind === 'commit') return { col: '#B9B4A7', sw: 1, op: 0.7 };
  return { col: '#6B6F76', sw: 1.5, op: 0.8 };
}
