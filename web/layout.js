/*
 * Hexagon layout for a map snapshot, with no DOM, so it can be tested in Node.
 *
 * One cluster per section. Clusters that share regions are placed next to
 * each other, and a shared region sits at the cell nearest the middle of
 * its sections' centres - where the clusters meet, like a Venn overlap.
 * Every other region takes the free cell nearest its section's centre, so
 * a cluster grows as a compact patch.
 *
 * Cells are axial hex coordinates {q, r}, pointy-top (t-98411b880e).
 */
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const key = (q, r) => q + ',' + r;
export const hexDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/* Cells by distance from a centre, nearest first (ring by ring). */
function* spiral(c) {
  yield { q: c.q, r: c.r };
  for (let k = 1; k < 400; k++) {
    let q = c.q + DIRS[4][0] * k, r = c.r + DIRS[4][1] * k;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) { yield { q, r }; q += DIRS[side][0]; r += DIRS[side][1]; }
    }
  }
}

function roundHex(q, r) {
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { q: rx, r: rz };
}

/* places: [{ region, sections: [...] }] - only placed ones are laid out.
   Returns { cells: [{ region, sections, q, r }], centres: { section: {q, r} } }. */
export function layout(places) {
  const placed = places.filter((p) => p.sections && p.sections.length);
  const size = {}, together = {};
  for (const p of placed) {
    for (const s of p.sections) size[s] = (size[s] || 0) + 1;
    for (const a of p.sections) for (const b of p.sections) if (a !== b) {
      together[a] = together[a] || {};
      together[a][b] = (together[a][b] || 0) + 1;
    }
  }
  const radius = (s) => Math.ceil(Math.sqrt((size[s] || 1) / 3)) + 1;
  const order = Object.keys(size).sort((a, b) => size[b] - size[a] || (a < b ? -1 : 1));

  /* Centres: each cluster next to the placed cluster it shares most with,
     or else as near the middle as it fits, so the map packs into a round
     shape instead of trailing off in a line. */
  const centres = {};
  for (const s of order) {
    if (!Object.keys(centres).length) { centres[s] = { q: 0, r: 0 }; continue; }
    const partners = Object.entries(together[s] || {}).filter(([o]) => centres[o]).sort((a, b) => b[1] - a[1]);
    const anchor = partners.length ? centres[partners[0][0]] : { q: 0, r: 0 };
    const fits = (c) => Object.entries(centres).every(([o, oc]) => hexDistance(c, oc) >= radius(s) + radius(o) - (together[s] && together[s][o] ? 1 : 0));
    for (const c of spiral(anchor)) if (fits(c)) { centres[s] = c; break; }
  }

  const taken = new Set();
  const cells = [];
  const seat = (p, target) => {
    for (const c of spiral(target)) {
      if (!taken.has(key(c.q, c.r))) { taken.add(key(c.q, c.r)); cells.push({ ...p, q: c.q, r: c.r }); return; }
    }
  };
  /* Shared regions first, so they hold the meeting points. */
  const shared = placed.filter((p) => p.sections.length > 1);
  for (const p of shared) {
    const cs = p.sections.map((s) => centres[s]);
    seat(p, roundHex(cs.reduce((a, c) => a + c.q, 0) / cs.length, cs.reduce((a, c) => a + c.r, 0) / cs.length));
  }
  for (const s of order) for (const p of placed) if (p.sections.length === 1 && p.sections[0] === s) seat(p, centres[s]);
  return { cells, centres };
}

/* Pixel position of a cell's centre for hexagons of the given size. */
export function toPixel({ q, r }, size) {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}
