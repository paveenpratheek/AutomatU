/*
 * The Canvas tab: a bound canvas opened as the prototype's board
 * (t-fe66324005) - each totem a coloured frame, its own boxes in columns,
 * its sub-totems in dashed frames, every box a card with its notes and texts
 * and the boxes inside it. The canvas's links are drawn as wires routed
 * through the gaps, measured from the page so they meet the real boxes.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* An image on the canvas, at its own proportions so the board's layout (and
   the wires measured from it) is right before the picture arrives; a click
   opens it large. */
export function picHtml(c, cls) {
  return `<img class="${cls}" src="${esc(c.src)}" alt="${esc(c.name)}" title="Click to enlarge" draggable="false" loading="lazy" ` +
    `data-pic="${esc(c.src)}" data-picname="${esc(c.name)}"${c.ratio ? ` style="aspect-ratio:${esc(c.ratio)}"` : ''}>`;
}

/* The board's HTML for one canvas. hot(item) says whether an item holds a
   keyword switched on, so its box can be ringed. */
export function boardHtml(m, cid, palOf, hot, term) {
  const reg = m.reg;
  const itemV = (c) => {
    const note = c.type === 'note', file = c.type === 'file';
    const bg = note ? '#FFF8E1' : (file ? '#F1EFE8' : 'transparent'), border = note ? '1px solid #EEDFB0' : (file ? '1px solid #E2DED3' : '0'), pad = note || file ? '8px 10px' : '0';
    return `<div class="bitem" style="padding:${pad};background:${bg};border:${border}">` +
      (note || file ? `<div class="bhead"><span class="blab">${esc(c.label)}</span><span class="bname">${esc(c.name)}</span>${c.edited ? '<span class="bed">edited by you</span>' : ''}</div>` : '') +
      (c.src ? picHtml(c, 'bimg') : '') +
      (c.text ? `<div class="btext">${esc(c.text)}</div>` : '') + `</div>`;
  };
  const boxV = (id, depth) => {
    const x = reg[id], p = palOf(reg, id), h = x.content.filter(hot).length;
    const kids = depth < 3 ? x.children.map((c) => boxV(c, depth + 1)).join('') : '';
    const line = h ? '#E39B0B' : (depth === 1 ? '#E2DED3' : '#E6E2D8');
    return `<div class="bbox d${depth}" data-bid="${id}" style="border:${h ? 2 : 1}px solid ${line}">` +
      `<div class="btitle">${depth < 3 ? `<span class="bdot" style="background:${p.swatch}"></span>` : ''}<span>${esc(x.name)}</span>${h ? `<span class="bheat">${esc(term)} · ${h}</span>` : ''}</div>` +
      x.content.map(itemV).join('') + kids + `</div>`;
  };
  const groupV = (owner, own, p) => {
    const bx = reg[owner].children, cols = Math.max(1, Math.min(own ? 3 : 2, bx.length)), bw = cols * 300 + (cols - 1) * 20;
    const text = own ? '' : reg[owner].text;
    return { titled: !own, w: own ? bw : bw + 43,
      html: `<div class="bgroup${own ? ' own' : ''}" data-gid="${owner}" style="${own ? 'flex:0 0 100%' : `flex:0 0 auto;border:1.5px dashed ${p.ring}`}">` +
        (own ? '' : `<div class="bgt" data-obst="1"><span class="bgn" style="color:${p.ink}">${esc(reg[owner].name)}</span><span class="bkind">Sub-totem</span></div>`) +
        (text ? `<p class="bgtext" data-obst="1" style="width:${bw}px">${esc(text)}</p>` : '') +
        `<div class="bcols" style="column-count:${cols};width:${bw}px">${bx.map((b) => boxV(b, 1)).join('')}</div></div>` };
  };
  const totems = [];
  const html = reg[cid].children.map((t) => {
    const x = reg[t], p = palOf(reg, t), groups = [];
    if (x.children.length || x.content.length) groups.push(groupV(t, true, p));
    for (const s of x.subs) groups.push(groupV(s, false, p));
    const subWs = groups.filter((g) => g.titled).map((g) => g.w).slice(0, 3);
    const row = subWs.reduce((a, b) => a + b, 0) + Math.max(0, subWs.length - 1) * 32;
    const ownW = groups.length && !groups[0].titled ? groups[0].w : 0;
    totems.push({ id: t, name: x.name, swatch: p.swatch });
    const owner = x.owner ? (x.owner === 'user' ? 'yours' : 'written by ' + x.owner + ', an agent') : '';
    const plans = x.plans && x.plans.length ? 'the plan of ' + x.plans.join(', ') : '';
    return `<section class="btotem" data-tid="${t}" style="border-color:${p.ring};background:${p.soft}">` +
      `<div class="bth" data-obst="1"><span class="btn_" style="color:${p.ink}">${esc(x.name)}</span><span class="bkind">Totem</span>` +
      (owner ? `<span class="bowner">${esc(owner)}</span>` : '') + (plans ? `<span class="bowner plan">${esc(plans)}</span>` : '') + `</div>` +
      (x.text ? `<p class="bttext" data-obst="1">${esc(x.text)}</p>` : '') +
      (x.content.length && !x.children.length ? `<div class="bcols" style="width:640px">${x.content.map(itemV).join('')}</div>` : '') +
      `<div class="bgroups" style="width:${Math.max(ownW, row, 640)}px">${groups.map((g) => g.html).join('')}</div></section>`;
  }).join('');
  return { html, totems };
}

/* A box, totem or the whole board in the board's own unzoomed pixels. */
export function worldRect(world, z, sel) {
  if (!sel) return { l: 0, t: 0, w: world.offsetWidth, h: world.offsetHeight };
  const el = world.querySelector(sel);
  if (!el) return null;
  const wr = world.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { l: (r.left - wr.left) / z, t: (r.top - wr.top) / z, w: r.width / z, h: r.height / z };
}

/* An orthogonal route drawn with rounded corners, a dot where it leaves and an
   arrow where it arrives. */
export function polyWire(pts, color) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const L = Math.min(...xs) - 12, T = Math.min(...ys) - 12, W = Math.max(...xs) + 12 - L, H = Math.max(...ys) + 12 - T;
  const f = (p) => (p[0] - L).toFixed(1) + ' ' + (p[1] - T).toFixed(1);
  const n = pts.length, last = pts[n - 1], prev = pts[n - 2];
  let dx = last[0] - prev[0], dy = last[1] - prev[1];
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const endP = [last[0] - dx * 10, last[1] - dy * 10];
  let d = 'M ' + f(pts[0]);
  for (let i = 1; i < n - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = i === n - 2 ? endP : pts[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = Math.min(10, l1 / 2, l2 / 2);
    const u = [b[0] - (b[0] - a[0]) / (l1 || 1) * r, b[1] - (b[1] - a[1]) / (l1 || 1) * r];
    const v = [b[0] + (c[0] - b[0]) / (l2 || 1) * r, b[1] + (c[1] - b[1]) / (l2 || 1) * r];
    d += ' L ' + f(u) + ' Q ' + f(b) + ' ' + f(v);
  }
  d += ' L ' + f(endP);
  const tip = [last[0] - L, last[1] - T], back = [tip[0] - dx * 12, tip[1] - dy * 12];
  const arrow = [tip, [back[0] - dy * 6, back[1] + dx * 6], [back[0] + dy * 6, back[1] - dx * 6]].map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  return { l: L, t: T, w: W, h: H, d, sx: (pts[0][0] - L).toFixed(1), sy: (pts[0][1] - T).toFixed(1), arrow, color };
}

/* Links run through the gaps: a grid search around every box and heading,
   with a cost for each turn and for sharing a lane with a link already drawn,
   so links neither cross boxes nor stack on each other. pairs: [{ a, b:
   selectors of the two ends, color }]. */
export function routeWires(world, z, pairs, obstacleSel, C = 6) {
  const out = [];
  const all = worldRect(world, z, null), PAD = 3, M = 90;
  const GX = Math.ceil((all.w + 2 * M) / C), GY = Math.ceil((all.h + 2 * M) / C), N = GX * GY;
  const cx = (i) => -M + (i + 0.5) * C;
  const obs = [];
  const wr0 = world.getBoundingClientRect();
  /* One obstacle per fragment: a group that flows into the next column is two boxes. */
  for (const el of world.querySelectorAll(obstacleSel)) {
    for (const rr of el.getClientRects()) {
      if (rr.width < 1 || rr.height < 1) continue;
      obs.push({ l: (rr.left - wr0.left) / z, t: (rr.top - wr0.top) / z, w: rr.width / z, h: rr.height / z });
    }
  }
  const cnt = new Uint16Array(N), used = new Uint8Array(N);
  const span = (r) => ({ x0: Math.max(0, Math.floor((r.l - PAD + M) / C)), x1: Math.min(GX - 1, Math.floor((r.l + r.w + PAD + M) / C)),
    y0: Math.max(0, Math.floor((r.t - PAD + M) / C)), y1: Math.min(GY - 1, Math.floor((r.t + r.h + PAD + M) / C)) });
  const mark = (r, dv) => {
    const s = span(r);
    for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
      const px = cx(x), py = cx(y);
      if (px >= r.l - PAD && px <= r.l + r.w + PAD && py >= r.t - PAD && py <= r.t + r.h + PAD) cnt[y * GX + x] += dv;
    }
  };
  obs.forEach((o) => mark(o, 1));
  const inside = (a, b) => a.l <= b.l + 0.5 && a.t <= b.t + 0.5 && a.l + a.w >= b.l + b.w - 0.5 && a.t + a.h >= b.t + b.h - 0.5;
  const ports = (R, Tg) => {
    const s = span(R), list = [], mx = R.l + R.w / 2, my = R.t + R.h / 2, tx = Tg.l + Tg.w / 2, ty = Tg.t + Tg.h / 2;
    const away = [tx > R.l, tx < R.l + R.w, ty > R.t, ty < R.t + R.h];
    const push = (x, y, side) => {
      if (x < 0 || y < 0 || x >= GX || y >= GY) return;
      const i = y * GX + x; if (cnt[i]) return;
      const off = side < 2 ? Math.abs(cx(y) - Math.min(my, R.t + 40)) : Math.abs(cx(x) - mx);
      list.push({ i, side, cost: off / C * 0.35 + (away[side] ? 10 : 0) });
    };
    for (let y = s.y0; y <= s.y1; y++) { if (cx(y) < R.t || cx(y) > R.t + R.h) continue; push(s.x0 - 1, y, 0); push(s.x1 + 1, y, 1); }
    for (let x = s.x0; x <= s.x1; x++) { if (cx(x) < R.l || cx(x) > R.l + R.w) continue; push(x, s.y0 - 1, 2); push(x, s.y1 + 1, 3); }
    return list;
  };
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  const route = (A, B) => {
    const src = ports(A, B), dst = ports(B, A);
    if (!src.length || !dst.length) return null;
    const goal = new Uint8Array(N); dst.forEach((p) => { goal[p.i] = 1; });
    const bs = span(B), bx0 = bs.x0 - 1, bx1 = bs.x1 + 1, by0 = bs.y0 - 1, by1 = bs.y1 + 1;
    const h = (i) => { const x = i % GX, y = (i / GX) | 0; return Math.max(0, bx0 - x, x - bx1) + Math.max(0, by0 - y, y - by1); };
    const S = N * 5, g = new Float32Array(S).fill(Infinity), from = new Int32Array(S).fill(-1), closed = new Uint8Array(S);
    const hp = [], hf = [];
    const hpush = (st, fv) => {
      hp.push(st); hf.push(fv); let j = hp.length - 1;
      while (j > 0) { const pj = (j - 1) >> 1; if (hf[pj] <= hf[j]) break; [hp[pj], hp[j]] = [hp[j], hp[pj]]; [hf[pj], hf[j]] = [hf[j], hf[pj]]; j = pj; }
    };
    const hpop = () => {
      const top = hp[0], lf = hf.pop(), ls = hp.pop();
      if (hp.length) {
        hp[0] = ls; hf[0] = lf; let j = 0;
        for (;;) { const a = 2 * j + 1, b = a + 1; let mm = j; if (a < hp.length && hf[a] < hf[mm]) mm = a; if (b < hp.length && hf[b] < hf[mm]) mm = b; if (mm === j) break;
          [hp[mm], hp[j]] = [hp[j], hp[mm]]; [hf[mm], hf[j]] = [hf[j], hf[mm]]; j = mm; }
      }
      return top;
    };
    src.forEach((p) => { const st = p.i * 5 + 4; if (p.cost < g[st]) { g[st] = p.cost; hpush(st, p.cost + h(p.i)); } });
    let end = -1, guard = 0;
    while (hp.length && guard++ < 900000) {
      const st = hpop(), i = (st / 5) | 0, dir = st % 5;
      if (closed[st]) continue;
      closed[st] = 1;
      if (goal[i]) { end = st; break; }
      const x = i % GX, y = (i / GX) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= GX || ny >= GY) continue;
        const ni = ny * GX + nx; if (cnt[ni]) continue;
        const ng = g[st] + 1 + (dir !== 4 && dir !== k ? 6 : 0) + used[ni] * 3, ns = ni * 5 + k;
        if (ng < g[ns]) { g[ns] = ng; from[ns] = st; hpush(ns, ng + h(ni)); }
      }
    }
    if (end < 0) return null;
    const cells = [];
    for (let s2 = end; s2 >= 0; s2 = from[s2]) cells.unshift((s2 / 5) | 0);
    cells.forEach((c) => { used[c] = Math.min(used[c] + 1, 3); });
    const pts = cells.map((c) => [cx(c % GX), cx((c / GX) | 0)]);
    const clampTo = (p, R) => {
      const x = Math.max(R.l, Math.min(R.l + R.w, p[0])), y = Math.max(R.t, Math.min(R.t + R.h, p[1]));
      const dl = Math.abs(p[0] - R.l), dr = Math.abs(p[0] - R.l - R.w), dt = Math.abs(p[1] - R.t), db = Math.abs(p[1] - R.t - R.h), mn = Math.min(dl, dr, dt, db);
      return mn === dl ? [R.l, y] : mn === dr ? [R.l + R.w, y] : mn === dt ? [x, R.t] : [x, R.t + R.h];
    };
    pts.unshift(clampTo(pts[0], A)); pts.push(clampTo(pts[pts.length - 1], B));
    const simple = [pts[0]];
    for (let q = 1; q < pts.length - 1; q++) {
      const a0 = simple[simple.length - 1], b0 = pts[q], c0 = pts[q + 1];
      if (Math.abs((b0[0] - a0[0]) * (c0[1] - b0[1]) - (b0[1] - a0[1]) * (c0[0] - b0[0])) > 0.01) simple.push(b0);
    }
    simple.push(pts[pts.length - 1]);
    return simple;
  };
  const same = (a, b) => Math.abs(a.l - b.l) < 0.5 && Math.abs(a.t - b.t) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
  for (const l of pairs) {
    const A = worldRect(world, z, l.a), B = worldRect(world, z, l.b);
    if (!A || !B) continue;
    /* Whatever holds either end is open to this link; everything else is in its way. */
    const holders = obs.filter((o) => !same(o, A) && !same(o, B) && (inside(o, A) || inside(o, B)));
    holders.forEach((o) => mark(o, -1));
    const pts = route(A, B);
    holders.forEach((o) => mark(o, 1));
    if (pts && pts.length >= 2) out.push(polyWire(pts, l.color));
    else out.push(polyWire([[A.l + A.w, A.t + 20], [B.l, B.t + 20]], l.color));
  }
  return out;
}

export function wiresHtml(wires) {
  return wires.map((w) => `<svg class="bwire" aria-hidden="true" width="${w.w}" height="${w.h}" style="left:${w.l}px;top:${w.t}px">` +
    `<path d="${w.d}" fill="none" stroke="${w.color}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"></path>` +
    `<circle cx="${w.sx}" cy="${w.sy}" r="5" fill="#FFFFFF" stroke="${w.color}" stroke-width="2.5"></circle><polygon points="${w.arrow}" fill="${w.color}"></polygon></svg>`).join('');
}
