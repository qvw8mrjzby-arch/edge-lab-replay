'use strict';
/* Jarvis-Terminal — Indikatoren, Strategien, Backtest-Engine (Signal auf Schluss, Ausführung am nächsten Open, kein Lookahead) */
{
  const TA = window.TA = {};
  const N = NaN;
TA.closes = c => c.map(b => b.c);
TA.sma = (v, n) => { const o = new Array(v.length).fill(N); let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
TA.ema = (v, n) => { const o = new Array(v.length).fill(N); const k = 2 / (n + 1); let e = N, s = 0; for (let i = 0; i < v.length; i++) { if (i < n) { s += v[i]; if (i === n - 1) { e = s / n; o[i] = e; } continue; } e = v[i] * k + e * (1 - k); o[i] = e; } return o; };
TA.std = (v, n) => { const o = new Array(v.length).fill(N); for (let i = n - 1; i < v.length; i++) { let m = 0; for (let j = i - n + 1; j <= i; j++) m += v[j]; m /= n; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - m) ** 2; o[i] = Math.sqrt(s / n); } return o; };
TA.rsi = (v, n = 14) => { const o = new Array(v.length).fill(N); let g = 0, l = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; };
TA.tr = c => c.map((b, i) => i ? Math.max(b.h - b.l, Math.abs(b.h - c[i - 1].c), Math.abs(b.l - c[i - 1].c)) : b.h - b.l);
TA.atr = (c, n = 14) => { const t = TA.tr(c), o = new Array(c.length).fill(N); let a = 0; for (let i = 0; i < c.length; i++) { if (i < n) { a += t[i]; if (i === n - 1) { a /= n; o[i] = a; } } else { a = (a * (n - 1) + t[i]) / n; o[i] = a; } } return o; };
TA.bb = (v, n = 20, m = 2) => { const mid = TA.sma(v, n), sd = TA.std(v, n); return { mid, up: mid.map((x, i) => x + m * sd[i]), lo: mid.map((x, i) => x - m * sd[i]) }; };
TA.hh = (c, n) => c.map((b, i) => { if (i < n) return N; let m = -Infinity; for (let j = i - n; j < i; j++) m = Math.max(m, c[j].h); return m; });
TA.ll = (c, n) => c.map((b, i) => { if (i < n) return N; let m = Infinity; for (let j = i - n; j < i; j++) m = Math.min(m, c[j].l); return m; });
TA.day = (t, off = 0) => Math.floor((t / 1000 + off) / 86400);
TA.vwap = (c, off = 0) => { const o = []; let pv = 0, vv = 0, d = null; for (const b of c) { const k = TA.day(b.t, off); if (k !== d) { pv = 0; vv = 0; d = k; } const tp = (b.h + b.l + b.c) / 3, v = b.v || 1; pv += tp * v; vv += v; o.push(pv / vv); } return o; };
TA.adx = (c, n = 14) => {
  const len = c.length, o = new Array(len).fill(N); if (len < n * 2 + 2) return o;
  let tr = 0, pdm = 0, ndm = 0, adx = N, dxs = [];
  for (let i = 1; i < len; i++) {
    const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l;
    const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
    const t = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    if (i <= n) { tr += t; pdm += p; ndm += m; if (i < n) continue; }
    else { tr = tr - tr / n + t; pdm = pdm - pdm / n + p; ndm = ndm - ndm / n + m; }
    const pdi = tr ? 100 * pdm / tr : 0, ndi = tr ? 100 * ndm / tr : 0, dx = pdi + ndi ? 100 * Math.abs(pdi - ndi) / (pdi + ndi) : 0;
    if (isNaN(adx)) { dxs.push(dx); if (dxs.length === n) { adx = dxs.reduce((a, b) => a + b, 0) / n; o[i] = adx; } }
    else { adx = (adx * (n - 1) + dx) / n; o[i] = adx; }
  }
  return o;
};
  const xUp = (a, b, i) => a[i - 1] <= b[i - 1] && a[i] > b[i];
  const xDn = (a, b, i) => a[i - 1] >= b[i - 1] && a[i] < b[i];
  const cst = (n, v) => new Array(n).fill(v);

/* ---------- Strategien: Signale auf Schlusskurs, Ausführung am nächsten Open ---------- */
TA.STRATS = {
  ema: { name: 'EMA-Crossover', desc: 'Long, wenn die schnelle EMA über die langsame kreuzt; Short umgekehrt.', params: [['fast', 'Schnelle EMA', 9, 2, 100, 1], ['slow', 'Langsame EMA', 21, 5, 300, 1]],
    sig(c, p) { const v = TA.closes(c), f = TA.ema(v, p.fast), s = TA.ema(v, p.slow), n = c.length, S = { le: [], se: [], lx: [], sx: [] };
      for (let i = 0; i < n; i++) { const u = i > 0 && xUp(f, s, i), d = i > 0 && xDn(f, s, i); S.le[i] = u; S.sx[i] = u; S.se[i] = d; S.lx[i] = d; } S.lines = [[f, 'EMA ' + p.fast], [s, 'EMA ' + p.slow]]; return S; } },
  rsi: { name: 'RSI Mean Reversion', desc: 'Long, wenn der RSI aus der überverkauften Zone zurückkommt; Exit an der Mittellinie.', params: [['len', 'RSI-Länge', 14, 2, 50, 1], ['lo', 'Überverkauft', 30, 5, 50, 1], ['hi', 'Überkauft', 70, 50, 95, 1]],
    sig(c, p) { const r = TA.rsi(TA.closes(c), p.len), lo = cst(c.length, p.lo), hi = cst(c.length, p.hi), mid = cst(c.length, 50), S = { le: [], se: [], lx: [], sx: [] };
      for (let i = 0; i < c.length; i++) { S.le[i] = i > 0 && xUp(r, lo, i); S.se[i] = i > 0 && xDn(r, hi, i); S.lx[i] = i > 0 && xUp(r, mid, i); S.sx[i] = i > 0 && xDn(r, mid, i); } return S; } },
  donch: { name: 'Donchian-Breakout', desc: 'Ausbruch über das Hoch / unter das Tief der letzten N Kerzen (Turtle-Prinzip).', params: [['len', 'Ausbruch-Länge', 20, 5, 200, 1], ['exit', 'Exit-Länge', 10, 2, 100, 1]],
    sig(c, p) { const H = TA.hh(c, p.len), L = TA.ll(c, p.len), XH = TA.hh(c, p.exit), XL = TA.ll(c, p.exit), S = { le: [], se: [], lx: [], sx: [] };
      for (let i = 0; i < c.length; i++) { S.le[i] = c[i].c > H[i]; S.se[i] = c[i].c < L[i]; S.lx[i] = c[i].c < XL[i]; S.sx[i] = c[i].c > XH[i]; } S.lines = [[H, 'Hoch ' + p.len], [L, 'Tief ' + p.len]]; return S; } },
  vwap: { name: 'VWAP-Reclaim', desc: 'Intraday: Long, wenn der Kurs den Tages-VWAP zurückerobert und über der Trend-EMA liegt.', intraday: true, params: [['trend', 'Trend-EMA', 50, 5, 300, 1]],
    sig(c, p, off) { const v = TA.closes(c), w = TA.vwap(c, off), e = TA.ema(v, p.trend), S = { le: [], se: [], lx: [], sx: [] };
      for (let i = 0; i < c.length; i++) { const u = i > 0 && xUp(v, w, i), d = i > 0 && xDn(v, w, i); S.le[i] = u && v[i] > e[i]; S.se[i] = d && v[i] < e[i]; S.lx[i] = d; S.sx[i] = u; } S.lines = [[w, 'VWAP'], [e, 'EMA ' + p.trend]]; return S; } },
  bb: { name: 'Bollinger-Reversion', desc: 'Long, wenn der Kurs unter das untere Band fällt und wieder hineinschließt; Exit an der Mitte.', params: [['len', 'Länge', 20, 5, 100, 1], ['mult', 'Std.-Abw.', 2, 1, 4, 0.1]],
    sig(c, p) { const v = TA.closes(c), b = TA.bb(v, p.len, p.mult), S = { le: [], se: [], lx: [], sx: [] };
      for (let i = 0; i < c.length; i++) { S.le[i] = i > 0 && v[i - 1] < b.lo[i - 1] && v[i] >= b.lo[i]; S.se[i] = i > 0 && v[i - 1] > b.up[i - 1] && v[i] <= b.up[i]; S.lx[i] = v[i] >= b.mid[i]; S.sx[i] = v[i] <= b.mid[i]; } S.lines = [[b.up, 'BB oben'], [b.mid, 'BB Mitte'], [b.lo, 'BB unten']]; return S; } },
  orb: { name: 'Opening-Range-Breakout', desc: 'Intraday: Ausbruch aus der Spanne der ersten N Kerzen der Session; Exit zum Session-Ende.', intraday: true, params: [['bars', 'Range-Kerzen', 3, 1, 24, 1]],
    sig(c, p, off) { const S = { le: [], se: [], lx: [], sx: [] }; let d = null, k = 0, hi = -Infinity, lo = Infinity, done = false;
      for (let i = 0; i < c.length; i++) { const day = TA.day(c[i].t, off); if (day !== d) { d = day; k = 0; hi = -Infinity; lo = Infinity; done = false; } k++;
        const last = i === c.length - 1 || TA.day(c[i + 1].t, off) !== day;
        if (k <= p.bars) { hi = Math.max(hi, c[i].h); lo = Math.min(lo, c[i].l); S.le[i] = S.se[i] = false; }
        else { S.le[i] = !done && !last && c[i].c > hi; S.se[i] = !done && !last && c[i].c < lo; if (S.le[i] || S.se[i]) done = true; }
        S.lx[i] = last; S.sx[i] = last; } S.xc = true; return S; } }
};
TA.defParams = k => Object.fromEntries(TA.STRATS[k].params.map(p => [p[0], p[2]]));

/* ---------- Engine ---------- */
/* cfg: strat, params, dir ('both'|'long'|'short'), cap, riskPct, slAtr, tpAtr, fee (% je Seite), lev, from, to, off */
TA.backtest = (c, cfg) => {
  const S = TA.STRATS[cfg.strat]; const sg = S.sig(c, cfg.params, cfg.off || 0);
  const A = TA.atr(c, 14); const n = c.length;
  const from = Math.max(1, cfg.from ?? 1), to = Math.min(n - 1, cfg.to ?? n - 1);
  let eq = cfg.cap, pos = null, pend = null, pendX = false;
  const trades = [], curve = [], fee = (cfg.fee || 0) / 100, lev = cfg.lev || 5;
  const allowL = cfg.dir !== 'short', allowS = cfg.dir !== 'long';
  const close = (i, px, why) => {
    const gross = (px - pos.entry) * pos.units * pos.side, f = px * pos.units * fee;
    const pnl = gross - f - pos.fee; eq += gross - f;
    trades.push({ side: pos.side, ei: pos.i, xi: i, et: c[pos.i].t, xt: c[i].t, entry: pos.entry, exit: px, sl: pos.sl, tp: pos.tp, units: pos.units, pnl, ret: pnl / pos.eq0, r: pos.risk ? pnl / pos.risk : null, why, bars: i - pos.i + 1 });
    pos = null;
  };
  for (let i = from; i <= to; i++) {
    const b = c[i];
    if (pos && pendX) { close(i, b.o, 'Signal'); }
    pendX = false;
    if (pend && (!pos || pos.side !== pend)) {
      if (pos) close(i, b.o, 'Umkehr');
      const side = pend, entry = b.o, a = A[i - 1];
      const sl = cfg.slAtr > 0 && isFinite(a) ? entry - side * a * cfg.slAtr : null;
      const tp = cfg.tpAtr > 0 && isFinite(a) ? entry + side * a * cfg.tpAtr : null;
      const riskAmt = eq * (cfg.riskPct || 1) / 100;
      let units = sl != null ? riskAmt / Math.abs(entry - sl) : eq / entry;
      units = Math.min(units, eq * lev / entry);
      if (units > 0 && isFinite(units)) { const f = entry * units * fee; eq -= f; pos = { side, entry, sl, tp, units, i, fee: f, eq0: eq + f, risk: sl != null ? Math.abs(entry - sl) * units : null }; }
    }
    pend = null;
    if (pos) {
      const L = pos.side === 1;
      const hitSL = pos.sl != null && (L ? b.l <= pos.sl : b.h >= pos.sl);
      const hitTP = pos.tp != null && (L ? b.h >= pos.tp : b.l <= pos.tp);
      if (hitSL) close(i, L ? Math.min(b.o, pos.sl) : Math.max(b.o, pos.sl), 'Stop');
      else if (hitTP) close(i, L ? Math.max(b.o, pos.tp) : Math.min(b.o, pos.tp), 'Ziel');
    }
    if (i < to) {
      if (pos && ((pos.side === 1 && sg.lx[i]) || (pos.side === -1 && sg.sx[i]))) { if (sg.xc) close(i, b.c, 'Session-Ende'); else pendX = true; }
      if (allowL && sg.le[i] && (!pos || pos.side === -1)) pend = 1;
      else if (allowS && sg.se[i] && (!pos || pos.side === 1)) pend = -1;
    }
    curve.push({ t: b.t, i, eq: pos ? eq + (b.c - pos.entry) * pos.units * pos.side : eq });
  }
  if (pos) close(to, c[to].c, 'Ende');
  if (curve.length) curve[curve.length - 1].eq = eq;
  return { trades, curve, sig: sg, from, to, cap: cfg.cap, end: eq };
};

TA.metrics = (res, c) => {
  const T = res.trades, cap = res.cap, curve = res.curve;
  const wins = T.filter(t => t.pnl > 0), loss = T.filter(t => t.pnl <= 0);
  const gw = wins.reduce((a, t) => a + t.pnl, 0), gl = -loss.reduce((a, t) => a + t.pnl, 0);
  let peak = cap, mdd = 0; for (const p of curve) { peak = Math.max(peak, p.eq); mdd = Math.max(mdd, (peak - p.eq) / peak); }
  const rets = []; for (let i = 1; i < curve.length; i++) rets.push(curve[i].eq / curve[i - 1].eq - 1);
  const mu = rets.reduce((a, b) => a + b, 0) / (rets.length || 1), sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length || 1));
  const years = curve.length > 1 ? (curve[curve.length - 1].t - curve[0].t) / 31557600000 : 0;
  const bpy = years > 0 ? curve.length / years : 252;
  const rs = T.filter(t => t.r != null).map(t => t.r);
  let streak = 0, maxStreak = 0; for (const t of T) { if (t.pnl <= 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; }
  const inMkt = T.reduce((a, t) => a + t.bars, 0);
  const bh = c && res.to > res.from ? (c[res.to].c / c[res.from].o - 1) * 100 : null;
  return {
    trades: T.length, net: res.end - cap, netPct: (res.end / cap - 1) * 100, winRate: T.length ? wins.length / T.length * 100 : null,
    pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null), avgWin: wins.length ? gw / wins.length : null, avgLoss: loss.length ? -gl / loss.length : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, maxDD: mdd * 100, sharpe: sd > 0 ? mu / sd * Math.sqrt(bpy) : null,
    cagr: years > 0.2 ? ((res.end / cap) ** (1 / years) - 1) * 100 : null, bh, exposure: curve.length ? inMkt / curve.length * 100 : 0, maxLossStreak: maxStreak, years
  };
};

/* Parameter-Raster */
TA.optimize = (c, cfg, px, py, xs, ys, metric) => {
  const grid = [];
  for (const y of ys) { const row = []; for (const x of xs) { const p = { ...cfg.params, [px]: x, [py]: y }; const r = TA.backtest(c, { ...cfg, params: p }); const m = TA.metrics(r, c); row.push({ x, y, m, v: m.trades < 3 ? null : metric === 'pf' ? Math.min(m.pf ?? 0, 5) : metric === 'sharpe' ? m.sharpe : m.netPct }); } grid.push(row); }
  return grid;
};
TA.range = (min, max, steps, step) => { const out = []; for (let i = 0; i < steps; i++) { let v = min + (max - min) * i / Math.max(1, steps - 1); v = step < 1 ? Math.round(v / step) * step : Math.round(v); if (!out.includes(v)) out.push(+v.toFixed(2)); } return out; };

/* Monte Carlo (Bootstrap der Trade-Renditen) */
TA.monteCarlo = (trades, cap, runs = 1000) => {
  const R = trades.map(t => t.ret).filter(isFinite); if (R.length < 5) return null;
  const finals = [], dds = [], paths = [];
  for (let k = 0; k < runs; k++) {
    let e = cap, pk = cap, dd = 0; const path = k < 40 ? [cap] : null;
    for (let i = 0; i < R.length; i++) { e *= 1 + R[(Math.random() * R.length) | 0]; pk = Math.max(pk, e); dd = Math.max(dd, (pk - e) / pk); path && path.push(e); }
    finals.push(e); dds.push(dd * 100); path && paths.push(path);
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
  return { paths, f5: q(finals, .05), f50: q(finals, .5), f95: q(finals, .95), d50: q(dds, .5), d95: q(dds, .95), lossProb: finals.filter(f => f < cap).length / runs * 100 };
};

/* Marktregime */
TA.REG = { up: ['Trend aufwärts', '#2fcf9f'], down: ['Trend abwärts', '#ef5d78'], chop: ['Seitwärts volatil', '#f3b74f'], calm: ['Seitwärts ruhig', '#6f8dff'] };
TA.regime = c => {
  const v = TA.closes(c), adx = TA.adx(c, 14), e = TA.ema(v, 50), a = TA.atr(c, 14);
  const ap = a.map((x, i) => x / v[i]);
  return c.map((b, i) => {
    if (isNaN(adx[i]) || isNaN(e[i]) || i < 60) return null;
    const slope = (e[i] - e[i - 10]) / e[i - 10];
    if (adx[i] >= 22 && slope > 0) return 'up';
    if (adx[i] >= 22 && slope < 0) return 'down';
    const w = ap.slice(Math.max(60, i - 250), i + 1).filter(isFinite); const rank = w.filter(x => x <= ap[i]).length / w.length;
    return rank > 0.6 ? 'chop' : 'calm';
  });
};

/* Journal-Statistik (für Performance, Risk, Jarvis) */
TA.journalStats = trades => {
  const T = trades.filter(t => t.status !== 'offen' && t.status !== 'open' && isFinite(t.pnl)).map(t => (t.rules == null && t.rulesOk != null ? Object.assign({}, t, { rules: t.rulesOk }) : t));
  const w = T.filter(t => t.pnl > 0), l = T.filter(t => t.pnl < 0);
  const gw = w.reduce((a, t) => a + t.pnl, 0), gl = -l.reduce((a, t) => a + t.pnl, 0);
  const rs = T.map(t => t.r).filter(x => x != null && isFinite(x));
  let cum = 0, pk = 0, dd = 0; for (const t of T) { cum += t.pnl; pk = Math.max(pk, cum); dd = Math.max(dd, pk - cum); }
  let s = 0, ms = 0; for (const t of T) { if (t.pnl < 0) { s++; ms = Math.max(ms, s); } else s = 0; }
  const rules = T.filter(t => t.rules != null); const rulesOk = rules.filter(t => t.rules).length;
  return { n: T.length, net: gw - gl, winRate: T.length ? w.length / T.length * 100 : null, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null), avgWin: w.length ? gw / w.length : null, avgLoss: l.length ? -gl / l.length : null, avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, maxDD: dd, maxLossStreak: ms, rulePct: rules.length ? rulesOk / rules.length * 100 : null };
};
}
