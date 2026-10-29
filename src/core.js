/* Edge Lab Replay — Kern-Logik (reine Funktionen, ohne DOM). */
(function (root) {
  'use strict';
  const C = {};

  C.TFS = [
    { s: 60, l: '1m' }, { s: 180, l: '3m' }, { s: 300, l: '5m' }, { s: 900, l: '15m' },
    { s: 1800, l: '30m' }, { s: 3600, l: '1h' }, { s: 14400, l: '4h' }, { s: 86400, l: '1D' }
  ];
  C.tfLabel = (s) => { const f = C.TFS.find((x) => x.s === s); return f ? f.l : (s % 3600 === 0 ? s / 3600 + 'h' : s % 60 === 0 ? s / 60 + 'm' : s + 's'); };

  /* ---------- Instrumente (offizielle Kontraktspezifikationen) ---------- */
  C.INSTRUMENTS = {
    NQ: { name: 'E-mini Nasdaq-100 (NQ)', tick: 0.25, pv: 20, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    MNQ: { name: 'Micro Nasdaq-100 (MNQ)', tick: 0.25, pv: 2, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    ES: { name: 'E-mini S&P 500 (ES)', tick: 0.25, pv: 50, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    MES: { name: 'Micro S&P 500 (MES)', tick: 0.25, pv: 5, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    YM: { name: 'E-mini Dow (YM)', tick: 1, pv: 5, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    MYM: { name: 'Micro Dow (MYM)', tick: 1, pv: 0.5, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    RTY: { name: 'E-mini Russell 2000 (RTY)', tick: 0.1, pv: 50, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    M2K: { name: 'Micro Russell 2000 (M2K)', tick: 0.1, pv: 5, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    GC: { name: 'Gold (GC)', tick: 0.1, pv: 100, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    MGC: { name: 'Micro Gold (MGC)', tick: 0.1, pv: 10, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    CL: { name: 'Crude Oil (CL)', tick: 0.01, pv: 1000, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    MCL: { name: 'Micro Crude Oil (MCL)', tick: 0.01, pv: 100, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
    CRYPTO: { name: 'Krypto (1 Einheit = 1 Coin)', tick: 0.01, pv: 1, qtyStep: 0.001, sess: { tz: 'UTC', hour: 0 } },
    FOREX: { name: 'Forex/CFD (1 Einheit)', tick: 0.00001, pv: 1, qtyStep: 1000, sess: { tz: 'America/New_York', hour: 17 } }
  };

  /* ---------- Zahlen ---------- */
  C.decimalsOf = function (tick) {
    if (!isFinite(tick) || tick <= 0) return 2;
    const s = String(tick);
    if (s.indexOf('e-') >= 0) return parseInt(s.split('e-')[1], 10);
    const i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(10, s.length - i - 1);
  };
  C.roundTick = function (p, tick) {
    if (!isFinite(p) || !tick) return p;
    const d = C.decimalsOf(tick);
    return +(Math.round(p / tick) * tick).toFixed(d);
  };
  C.floorStep = function (q, step) {
    if (!step) return q;
    const d = C.decimalsOf(step);
    return +(Math.floor(q / step + 1e-9) * step).toFixed(d);
  };
  /* Deutsche Zahlen: Komma als Dezimaltrennzeichen, Punkt als Tausender */
  C.fmtNum = function (v, d) {
    if (v == null || !isFinite(v)) return '–';
    return (+v).toLocaleString('de-DE', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  };
  C.fmtR = function (r) { return r == null || !isFinite(r) ? '–' : (r > 0.0049 ? '+' : r < -0.0049 ? '−' : '') + C.fmtNum(Math.abs(r), 2) + 'R'; };
  C.fmtPct = function (v, d) { return v == null || !isFinite(v) ? '–' : C.fmtNum(v, d == null ? 1 : d) + ' %'; };
  C.fmtMoney = function (v, sign, d) {
    if (v == null || !isFinite(v)) return '–';
    const dd = d == null ? 2 : d;
    const s = C.fmtNum(Math.abs(v), dd);
    const zero = Math.abs(v) < Math.pow(10, -dd) / 2;
    return (v < 0 && !zero ? '−' : sign && v > 0 && !zero ? '+' : '') + s + ' $';
  };
  C.niceStep = function (raw) {
    if (!(raw > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / e;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * e;
  };
  /* kleinste "schöne" Zeilengröße >= raw, als Vielfaches des Ticks */
  C.rowSizeFor = function (raw, tick) {
    if (!(tick > 0)) tick = 0.01;
    if (raw <= tick) return tick;
    const mult = [1, 2, 4, 5, 10, 20, 25, 40, 50, 100, 200, 250, 400, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
    for (const m of mult) if (tick * m >= raw) return C.roundTick(tick * m, tick);
    return C.roundTick(Math.ceil(raw / tick) * tick, tick);
  };

  /* ---------- Zeitzonen ---------- */
  const fmtCache = {};
  function getFmt(tz) {
    if (!fmtCache[tz]) {
      fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return fmtCache[tz];
  }
  const offCache = new Map();
  /* Minuten: lokale Zeit minus UTC zum Zeitpunkt tSec */
  C.tzOffset = function (tSec, tz) {
    if (!tz || tz === 'UTC' || !isFinite(tSec)) return 0;
    const b = Math.floor(tSec / 900);
    const key = tz + '|' + b;
    let v = offCache.get(key);
    if (v !== undefined) return v;
    const ms = b * 900 * 1000;
    const p = {};
    for (const part of getFmt(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
    let h = +p.hour; if (h === 24) h = 0;
    const loc = Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second);
    v = Math.round((loc - ms) / 60000);
    if (offCache.size > 200000) offCache.clear();
    offCache.set(key, v);
    return v;
  };
  C.localParts = function (tSec, tz) {
    const d = new Date((tSec + C.tzOffset(tSec, tz) * 60) * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
  };
  C.zonedToUtc = function (y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0) / 1000;
    if (!tz || tz === 'UTC') return guess;
    const o1 = C.tzOffset(guess, tz);
    let t = guess - o1 * 60;
    const o2 = C.tzOffset(t, tz);
    if (o2 !== o1) t = guess - o2 * 60;
    /* doppelte Stunde (Herbst): erstes Vorkommen (Sommerzeit) bevorzugen */
    const oB = C.tzOffset(t - 7200, tz), oT = C.tzOffset(t, tz);
    if (oB > oT) { const tb = guess - oB * 60; if (tb < t && C.tzOffset(tb, tz) === oB) t = tb; }
    return t;
  };
  const sessCache = new Map();
  /* Beginn (UTC-Sekunden) der Handels-Session, in der tSec liegt. sess = {tz, hour} */
  C.sessionStart = function (tSec, sess) {
    const tz = sess && sess.tz || 'UTC', hour = sess && sess.hour || 0;
    const key = tz + '|' + hour + '|' + Math.floor(tSec / 900);
    let v = sessCache.get(key);
    if (v !== undefined) return v;
    const t0 = Math.floor(tSec / 900) * 900;
    const off = C.tzOffset(t0, tz);
    const local = t0 + off * 60;
    const startLocal = Math.floor((local - hour * 3600) / 86400) * 86400 + hour * 3600;
    let s = startLocal - off * 60;
    const off2 = C.tzOffset(s, tz);
    if (off2 !== off) s = startLocal - off2 * 60;
    if (s > t0) s -= 86400; /* Sicherheitsnetz bei DST-Grenzen */
    if (sessCache.size > 200000) sessCache.clear();
    sessCache.set(key, s);
    return s;
  };
  C.bucketStart = function (t, tf, sess) {
    if (tf < 3600) return Math.floor(t / tf) * tf;
    const s = C.sessionStart(t, sess);
    if (tf >= 86400) return s;
    return s + Math.floor((t - s) / tf) * tf;
  };

  /* ---------- Basisdaten vorbereiten ---------- */
  /* bars: [{t,o,h,l,c,v,bv}] (bv = Taker-Buy-Volumen oder null). Ergänzt d (Delta) und est (geschätzt?). */
  C.prepareBase = function (bars) {
    bars.sort((a, b) => a.t - b.t);
    const out = [];
    let fixed = 0, dropped = 0;
    for (const b of bars) {
      if (![b.t, b.o, b.h, b.l, b.c].every(isFinite)) { dropped++; continue; }
      /* unrealistische Preise (Dateifehler) verwerfen – sonst entartet die Preisskala */
      if (Math.abs(b.h) > 1e9 || Math.abs(b.l) > 1e9 || Math.abs(b.o) > 1e9 || Math.abs(b.c) > 1e9) { dropped++; continue; }
      if (out.length && out[out.length - 1].t === b.t) { dropped++; continue; }
      const hi = Math.max(b.h, b.o, b.c), lo = Math.min(b.l, b.o, b.c);
      if (hi !== b.h || lo !== b.l) fixed++;
      const v = isFinite(b.v) && b.v > 0 ? b.v : 0;
      const bv = b.bv != null && isFinite(b.bv) ? Math.min(Math.max(b.bv, 0), v) : null;
      const bar = { t: b.t, o: b.o, h: hi, l: lo, c: b.c, v, bv, d: 0, est: false };
      C.setDelta(bar);
      out.push(bar);
    }
    return { bars: out, fixed, dropped };
  };
  /* Delta = Kauf-Aggressor-Volumen − Verkauf-Aggressor-Volumen */
  C.setDelta = function (bar) {
    if (bar.bv != null) { bar.d = 2 * bar.bv - bar.v; bar.est = false; }
    else {
      const r = bar.h - bar.l;
      bar.d = r > 0 ? bar.v * ((bar.c - bar.l) - (bar.h - bar.c)) / r : 0;
      bar.est = true;
    }
  };
  C.detectTf = function (bars) {
    const cnt = new Map();
    const n = Math.min(bars.length, 3000);
    for (let i = 1; i < n; i++) {
      const d = bars[i].t - bars[i - 1].t;
      if (d > 0) cnt.set(d, (cnt.get(d) || 0) + 1);
    }
    let best = 60, bc = -1;
    for (const [d, c] of cnt) if (c > bc || (c === bc && d < best)) { best = d; bc = c; }
    return best;
  };
  C.inferTick = function (bars) {
    let dec = 0;
    const n = Math.min(bars.length, 2000);
    for (let i = 0; i < n; i++) {
      for (const p of [bars[i].o, bars[i].h, bars[i].l, bars[i].c]) {
        const s = String(p);
        const k = s.indexOf('.');
        if (k >= 0) dec = Math.max(dec, Math.min(8, s.length - k - 1));
      }
    }
    return +Math.pow(10, -dec).toFixed(dec);
  };

  /* ---------- Kumulierte Basis-Indikatoren (nur Vergangenheit → kein Lookahead) ---------- */
  C.computeBaseSeries = function (base, sess, cvdReset) {
    const n = base.length;
    const vwap = new Float64Array(n), sd = new Float64Array(n), cvd = new Float64Array(n), sessIdx = new Int32Array(n);
    let pv = 0, pv2 = 0, vol = 0, cum = 0, cur = null, si = -1;
    const sessions = [];
    for (let i = 0; i < n; i++) {
      const b = base[i];
      const s = C.sessionStart(b.t, sess);
      if (s !== cur) {
        cur = s; si++; pv = 0; pv2 = 0; vol = 0;
        if (cvdReset) cum = 0;
        sessions.push({ start: s, i0: i, i1: i, h: b.h, l: b.l, o: b.o, c: b.c });
      }
      const ss = sessions[si];
      ss.i1 = i; if (b.h > ss.h) ss.h = b.h; if (b.l < ss.l) ss.l = b.l; ss.c = b.c;
      sessIdx[i] = si;
      const tp = (b.h + b.l + b.c) / 3;
      pv += tp * b.v; pv2 += tp * tp * b.v; vol += b.v;
      if (vol > 0) {
        const m = pv / vol;
        vwap[i] = m;
        sd[i] = Math.sqrt(Math.max(0, pv2 / vol - m * m));
      } else { vwap[i] = tp; sd[i] = 0; }
      cum += b.d; cvd[i] = cum;
    }
    return { vwap, sd, cvd, sessIdx, sessions };
  };
  /* Anchored VWAP ab Basis-Index a bis Index e */
  C.anchoredVwap = function (base, a, e) {
    const out = new Float64Array(Math.max(0, e - a + 1));
    let pv = 0, vol = 0;
    for (let i = a; i <= e; i++) {
      const b = base[i]; const tp = (b.h + b.l + b.c) / 3;
      pv += tp * b.v; vol += b.v;
      out[i - a] = vol > 0 ? pv / vol : tp;
    }
    return out;
  };

  /* ---------- Aggregation in höhere Timeframes ---------- */
  C.aggregate = function (base, tf, sess) {
    const bars = [];
    const map = new Int32Array(base.length);
    let cur = null;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      const k = C.bucketStart(b.t, tf, sess);
      if (!cur || cur.t !== k) {
        cur = { t: k, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, d: b.d, est: b.est, i0: i, i1: i };
        bars.push(cur);
      } else {
        if (b.h > cur.h) cur.h = b.h;
        if (b.l < cur.l) cur.l = b.l;
        cur.c = b.c; cur.v += b.v; cur.d += b.d; cur.est = cur.est || b.est; cur.i1 = i;
      }
      map[i] = bars.length - 1;
    }
    return { tf, bars, map };
  };
  /* Teil-Kerze aus Basisbars i0..cursor (für Replay ohne Blick in die Zukunft) */
  C.partialBar = function (base, full, cursor) {
    if (cursor >= full.i1) return full;
    const b0 = base[full.i0];
    const p = { t: full.t, o: b0.o, h: b0.h, l: b0.l, c: b0.c, v: 0, d: 0, est: false, i0: full.i0, i1: cursor, partial: true };
    for (let i = full.i0; i <= cursor; i++) {
      const b = base[i];
      if (b.h > p.h) p.h = b.h; if (b.l < p.l) p.l = b.l;
      p.c = b.c; p.v += b.v; p.d += b.d; p.est = p.est || b.est;
    }
    return p;
  };
  C.emaArray = function (bars, period) {
    const out = new Float64Array(bars.length);
    const a = 2 / (period + 1);
    let e = NaN;
    for (let i = 0; i < bars.length; i++) {
      const c = bars[i].c;
      if (i < period - 1) { out[i] = NaN; continue; }
      if (i === period - 1) { let s = 0; for (let j = 0; j < period; j++) s += bars[j].c; e = s / period; }
      else e = a * c + (1 - a) * e;
      out[i] = e;
    }
    return out;
  };
  C.emaNext = function (prev, c, period) { return isFinite(prev) ? (2 / (period + 1)) * c + (1 - 2 / (period + 1)) * prev : NaN; };
  /* ATR nach Wilder */
  C.atrArray = function (bars, period) {
    const out = new Float64Array(bars.length);
    let atr = NaN, sum = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
      if (i < period) { sum += tr; out[i] = i === period - 1 ? (atr = sum / period) : NaN; }
      else { atr = (atr * (period - 1) + tr) / period; out[i] = atr; }
    }
    return out;
  };
  C.atrNext = function (prevAtr, bar, prevClose, period) {
    const tr = Math.max(bar.h - bar.l, Math.abs(bar.h - prevClose), Math.abs(bar.l - prevClose));
    return isFinite(prevAtr) ? (prevAtr * (period - 1) + tr) / period : NaN;
  };

  /* ---------- Volume Profile ---------- */
  /* Aus Basisbars (gleichmäßige Verteilung über High-Low) oder exakt aus Trades. */
  C.profileFromBars = function (base, a, e, row) {
    if (a > e) return null;
    let lo = Infinity, hi = -Infinity;
    for (let i = a; i <= e; i++) { if (base[i].l < lo) lo = base[i].l; if (base[i].h > hi) hi = base[i].h; }
    const r0 = Math.floor(lo / row + 1e-9), r1 = Math.floor(hi / row + 1e-9);
    const n = r1 - r0 + 1;
    if (n > 20000 || n < 1) return null;
    const v = new Float64Array(n), bv = new Float64Array(n);
    for (let i = a; i <= e; i++) {
      const b = base[i];
      const s = Math.floor(b.l / row + 1e-9) - r0, t = Math.floor(b.h / row + 1e-9) - r0;
      const k = t - s + 1;
      const pv = b.v / k;
      const pb = (b.bv != null ? b.bv : (b.v + b.d) / 2) / k;
      for (let j = s; j <= t; j++) { v[j] += pv; bv[j] += pb; }
    }
    return { r0, row, v, bv, exact: false };
  };
  C.profileFromTrades = function (tr, ia, ie, row) {
    if (ia > ie) return null;
    let lo = Infinity, hi = -Infinity;
    for (let i = ia; i <= ie; i++) { const p = tr.p[i]; if (p < lo) lo = p; if (p > hi) hi = p; }
    const r0 = Math.floor(lo / row + 1e-9), r1 = Math.floor(hi / row + 1e-9);
    const n = r1 - r0 + 1;
    if (n > 20000 || n < 1) return null;
    const v = new Float64Array(n), bv = new Float64Array(n);
    for (let i = ia; i <= ie; i++) {
      const j = Math.floor(tr.p[i] / row + 1e-9) - r0;
      v[j] += tr.q[i]; if (tr.b[i]) bv[j] += tr.q[i];
    }
    return { r0, row, v, bv, exact: true };
  };
  /* Value Area nach CBOT-Methode (je zwei Zeilen vergleichen), Standard 70 % */
  C.valueArea = function (prof, pct) {
    if (!prof) return null;
    pct = pct || 0.7;
    const v = prof.v, n = v.length;
    let total = 0, poc = 0;
    for (let i = 0; i < n; i++) { total += v[i]; if (v[i] > v[poc]) poc = i; }
    if (total <= 0) return null;
    let lo = poc, hi = poc, acc = v[poc];
    while (acc < total * pct && (lo > 0 || hi < n - 1)) {
      const up = (hi + 1 < n ? v[hi + 1] : 0) + (hi + 2 < n ? v[hi + 2] : 0);
      const dn = (lo - 1 >= 0 ? v[lo - 1] : 0) + (lo - 2 >= 0 ? v[lo - 2] : 0);
      if ((up >= dn && hi < n - 1) || lo === 0) { acc += up; hi = Math.min(n - 1, hi + 2); }
      else { acc += dn; lo = Math.max(0, lo - 2); }
    }
    const row = prof.row;
    return {
      poc: (prof.r0 + poc) * row + row / 2,
      vah: (prof.r0 + hi + 1) * row,
      val: (prof.r0 + lo) * row,
      pocIdx: poc, hiIdx: hi, loIdx: lo, total
    };
  };

  /* ---------- Trades / Footprint ---------- */
  /* trades: {t (ms), p, q, b (1=Kauf-Aggressor)} als typisierte Arrays, nach Zeit sortiert */
  C.makeTrades = function (list) {
    list.sort((x, y) => x.t - y.t);
    const n = list.length;
    const tr = { n, t: new Float64Array(n), p: new Float64Array(n), q: new Float64Array(n), b: new Uint8Array(n) };
    for (let i = 0; i < n; i++) { const x = list[i]; tr.t[i] = x.t; tr.p[i] = x.p; tr.q[i] = x.q; tr.b[i] = x.b ? 1 : 0; }
    return tr;
  };
  C.mergeTrades = function (a, b) {
    if (!a || !a.n) return b; if (!b || !b.n) return a;
    const list = [];
    const seen = new Set();
    for (const tr of [a, b]) for (let i = 0; i < tr.n; i++) {
      const k = tr.t[i] + '|' + tr.p[i] + '|' + tr.q[i] + '|' + tr.b[i];
      if (tr === b && seen.has(k)) continue;
      if (tr === a) seen.add(k);
      list.push({ t: tr.t[i], p: tr.p[i], q: tr.q[i], b: tr.b[i] });
    }
    return C.makeTrades(list);
  };
  C.lowerBound = function (arr, x, n) {
    let lo = 0, hi = n === undefined ? arr.length : n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
    return lo;
  };
  /* Indexbereiche der Trades je Basisbar + Abdeckung */
  C.indexTrades = function (base, baseTf, tr, covRanges) {
    const n = base.length;
    const ts = new Int32Array(n).fill(-1), te = new Int32Array(n).fill(-2), cov = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = base[i].t * 1000, e = (base[i].t + baseTf) * 1000;
      const ia = C.lowerBound(tr.t, a, tr.n), ie = C.lowerBound(tr.t, e, tr.n) - 1;
      ts[i] = ia; te[i] = ie;
      let covered = false;
      for (const r of covRanges) { /* Liste von [startMs, endMs] */
        if (r[0] <= a && e <= r[1]) { covered = true; break; }
      }
      cov[i] = covered ? 1 : 0;
    }
    return { ts, te, cov };
  };
  C.footprint = function (tr, ia, ie, row) {
    const levels = new Map();
    let buy = 0, sell = 0;
    for (let i = ia; i <= ie; i++) {
      const k = Math.floor(tr.p[i] / row + 1e-9);
      let c = levels.get(k);
      if (!c) { c = [0, 0]; levels.set(k, c); }
      if (tr.b[i]) { c[1] += tr.q[i]; buy += tr.q[i]; } else { c[0] += tr.q[i]; sell += tr.q[i]; }
    }
    let maxV = 0, pocK = null;
    for (const [k, c] of levels) { const s = c[0] + c[1]; if (s > maxV) { maxV = s; pocK = k; } }
    return { levels, row, buy, sell, delta: buy - sell, maxV, pocK };
  };
  /* Diagonale Imbalance: Ask(P) vs. Bid(P−1 Zeile) und Bid(P) vs. Ask(P+1 Zeile) */
  C.imbalances = function (fp, ratio, minVol) {
    const out = new Map();
    for (const [k, c] of fp.levels) {
      const below = fp.levels.get(k - 1), above = fp.levels.get(k + 1);
      const bidBelow = below ? below[0] : 0, askAbove = above ? above[1] : 0;
      let buy = false, sell = false;
      if (c[1] >= minVol && (bidBelow === 0 ? c[1] > 0 && below !== undefined : c[1] >= ratio * bidBelow)) buy = true;
      if (c[0] >= minVol && (askAbove === 0 ? c[0] > 0 && above !== undefined : c[0] >= ratio * askAbove)) sell = true;
      if (buy || sell) out.set(k, { buy, sell });
    }
    return out;
  };

  /* ---------- Backtest-Engine ---------- */
  /* cfg: {tick, pv, slipTicks, feeFix (pro Kontrakt & Seite), feePct (% vom Nominal pro Seite), intrabar} */
  C.Engine = function (cfg) {
    this.cfg = Object.assign({ tick: 0.25, pv: 1, slipTicks: 0, feeFix: 0, feePct: 0, intrabar: 'conservative' }, cfg || {});
    this.orders = [];
    this.nextId = 1;
  };
  const EP = C.Engine.prototype;
  EP.slip = function () { return (this.cfg.slipTicks || 0) * this.cfg.tick; };
  EP.place = function (o, bar, idx) {
    const ord = Object.assign({
      id: this.nextId++, status: 'pending', qty: 1, sl: null, tp: null, mae: 0, mfe: 0, createdT: bar ? bar.t : null, createdIdx: idx
    }, o);
    const tick = this.cfg.tick;
    if (ord.sl != null) ord.sl = C.roundTick(ord.sl, tick);
    if (ord.tp != null) ord.tp = C.roundTick(ord.tp, tick);
    if (ord.type !== 'market') ord.price = C.roundTick(ord.price, tick);
    this.orders.push(ord);
    if (ord.type === 'market') this._fill(ord, C.roundTick(bar.c + ord.side * this.slip(), tick), bar, idx, true);
    return ord;
  };
  EP._fill = function (o, price, bar, idx, isMarket) {
    const tick = this.cfg.tick;
    o.status = 'open';
    o.entryPrice = price; o.entryT = bar.t; o.entryIdx = idx;
    o.filledAtClose = !!isMarket;
    o.extHi = price; o.extLo = price;
    if (o.slInit == null) o.slInit = o.sl;
    o.qtyInit = o.qty; o.qtyOpen = o.qty; o.partials = [];
    o.riskPts = o.sl != null ? Math.abs(price - o.sl) : null;
    o.risk = o.riskPts != null ? o.riskPts * o.qty * this.cfg.pv : null;
    o.plannedR = (o.tp != null && o.riskPts) ? Math.abs(o.tp - price) / o.riskPts : null;
    /* Trade-Management (A5): Teilausstieg, Break-even, Trailing */
    o.tp1 = null; o.tp1Qty = 0; o.beDone = false;
    const m = o.mgmt;
    if (m && m.tp1R > 0 && m.tp1Pct > 0 && o.riskPts) {
      const q1 = C.floorStep(o.qty * Math.min(100, m.tp1Pct) / 100, this.cfg.qtyStep || 0);
      const lvl = C.roundTick(price + o.side * m.tp1R * o.riskPts, tick);
      const beforeTp = o.tp == null || (o.side > 0 ? lvl < o.tp : lvl > o.tp);
      if (q1 > 0 && q1 < o.qty - 1e-12 && beforeTp) { o.tp1 = lvl; o.tp1Qty = q1; }
    }
  };
  /* Teilmenge q zum Preis px schließen; bei Restmenge 0 wird der Trade abgeschlossen */
  EP._exitPart = function (o, q, px, bar, idx, reason) {
    const cfg = this.cfg;
    px = C.roundTick(px, cfg.tick);
    q = Math.min(q, o.qtyOpen);
    const gross = o.side * (px - o.entryPrice) * q * cfg.pv;
    const fees = q * (cfg.feeFix || 0) * 2 + (o.entryPrice + px) * q * cfg.pv * (cfg.feePct || 0) / 100;
    o.partials.push({ qty: q, price: px, t: bar.t, idx, reason, gross, fees, pnl: gross - fees });
    o.qtyOpen = +(o.qtyOpen - q).toFixed(10);
    if (o.side > 0) { o.extHi = Math.max(o.extHi, px); o.extLo = Math.min(o.extLo, px); }
    else { o.extHi = Math.max(o.extHi, px); o.extLo = Math.min(o.extLo, px); }
    if (o.qtyOpen <= 1e-12) this._finish(o, bar, idx, reason);
    return o;
  };
  EP._finish = function (o, bar, idx, reason) {
    o.status = 'closed'; o.qtyOpen = 0;
    const last = o.partials[o.partials.length - 1];
    let gross = 0, fees = 0, qp = 0;
    for (const p of o.partials) { gross += p.gross; fees += p.fees; qp += p.qty * p.price; }
    o.exitPrice = last.price; o.exitT = bar.t; o.exitIdx = idx; o.reason = reason;
    o.avgExit = qp / o.qty;
    o.gross = gross; o.fees = fees; o.pnl = gross - fees;
    o.points = o.side * (o.avgExit - o.entryPrice);
    o.r = o.risk ? o.pnl / o.risk : null;
    o.mae = o.side > 0 ? o.entryPrice - o.extLo : o.extHi - o.entryPrice;
    o.mfe = o.side > 0 ? o.extHi - o.entryPrice : o.entryPrice - o.extLo;
    o.maeR = o.riskPts ? o.mae / o.riskPts : null;
    o.mfeR = o.riskPts ? o.mfe / o.riskPts : null;
  };
  /* Rest der Position schließen (alte Schnittstelle) */
  EP._close = function (o, price, bar, idx, reason) {
    if (o.qtyOpen == null) { o.qtyOpen = o.qty; o.partials = o.partials || []; }
    return this._exitPart(o, o.qtyOpen, price, bar, idx, reason);
  };
  /* Prüft Einstieg; gibt Füllpreis oder null zurück */
  EP._entryPrice = function (o, bar) {
    const s = this.slip(), t = this.cfg.tick;
    if (o.type === 'limit') {
      if (o.side > 0) { if (bar.o <= o.price) return bar.o; if (bar.l <= o.price) return o.price; }
      else { if (bar.o >= o.price) return bar.o; if (bar.h >= o.price) return o.price; }
    } else if (o.type === 'stop') {
      if (o.side > 0) { if (bar.o >= o.price) return C.roundTick(bar.o + s, t); if (bar.h >= o.price) return C.roundTick(o.price + s, t); }
      else { if (bar.o <= o.price) return C.roundTick(bar.o - s, t); if (bar.l <= o.price) return C.roundTick(o.price - s, t); }
    }
    return null;
  };
  /* Grund für einen Stop-Ausstieg (nachgezogener Stop wird kenntlich gemacht) */
  EP._slReason = function (o) {
    if (o.trailed) return 'Trailing';
    if (o.beDone && o.sl === o.entryPrice) return 'Einstand';
    return 'SL';
  };
  /* Verarbeitet Ausstiege einer offenen Position auf einer Kerze.
     entryBar = true auf der Kerze der Füllung (Reihenfolge innerhalb der Kerze unbekannt). */
  EP._process = function (o, bar, idx, entryBar, ev) {
    const s = this.slip(), long = o.side > 0, mode = this.cfg.intrabar, e = o.entryPrice;
    let sl = null;
    if (o.sl != null) {
      if (entryBar) {
        if (long ? (bar.l <= o.sl || e <= o.sl) : (bar.h >= o.sl || e >= o.sl)) sl = { px: long ? Math.min(o.sl, e) - s : Math.max(o.sl, e) + s, reason: this._slReason(o) };
      } else if (long) { if (bar.o <= o.sl) sl = { px: bar.o - s, gap: true }; else if (bar.l <= o.sl) sl = { px: o.sl - s }; }
      else { if (bar.o >= o.sl) sl = { px: bar.o + s, gap: true }; else if (bar.h >= o.sl) sl = { px: o.sl + s }; }
      if (sl && !sl.reason) sl.reason = this._slReason(o);
    }
    const favPx = (lvl) => {
      if (entryBar) return long ? (bar.h >= lvl ? Math.max(lvl, e) : null) : (bar.l <= lvl ? Math.min(lvl, e) : null);
      return long ? (bar.o >= lvl ? bar.o : bar.h >= lvl ? lvl : null) : (bar.o <= lvl ? bar.o : bar.l <= lvl ? lvl : null);
    };
    const fav = [];
    if (o.tp1 != null && !o.tp1Done) { const p = favPx(o.tp1); if (p != null) fav.push({ px: p, reason: 'TP1', part: true, gap: !entryBar && (long ? bar.o >= o.tp1 : bar.o <= o.tp1) }); }
    if (o.tp != null) { const p = favPx(o.tp); if (p != null) fav.push({ px: p, reason: 'TP', gap: !entryBar && (long ? bar.o >= o.tp : bar.o <= o.tp) }); }
    let order;
    if (entryBar) {
      const tpSure = o.type === 'stop' || e === bar.o;
      const favOk = fav.length && (tpSure || mode === 'optimistic');
      if (sl && fav.length) order = mode === 'optimistic' ? fav.concat([sl]) : [sl];
      else if (sl) order = [sl];
      else order = favOk ? fav : [];
    } else if (sl && fav.length) {
      let slFirst;
      if (sl.gap) slFirst = true;
      else if (fav[0].gap) slFirst = false;
      else if (mode === 'optimistic') slFirst = false;
      else if (mode === 'path') { const bull = bar.c >= bar.o; slFirst = long ? bull : !bull; }
      else slFirst = true;
      order = slFirst ? [sl] : fav.concat([sl]);
    } else order = sl ? [sl] : fav;
    for (const x of order) {
      if (o.status !== 'open') break;
      if (x.part) {
        this._exitPart(o, Math.min(o.tp1Qty, o.qtyOpen), x.px, bar, idx, 'TP1');
        o.tp1Done = true;
        if (ev) ev.push({ type: 'partial', o, p: o.partials[o.partials.length - 1] });
      } else {
        this._exitPart(o, o.qtyOpen, x.px, bar, idx, x.reason);
      }
    }
    if (o.status === 'closed') { if (ev) ev.push({ type: 'exit', o }); return; }
    /* Kerze überlebt: Extremwerte. Auf der Einstiegskerze die ungünstige Seite immer (konservativ für MAE),
       die günstige nur, wenn sie sicher nach der Füllung lag. */
    if (entryBar) {
      const tpSure = o.type === 'stop' || e === bar.o;
      if (long) { o.extLo = Math.min(o.extLo, bar.l); o.extHi = Math.max(o.extHi, tpSure ? bar.h : bar.c); }
      else { o.extHi = Math.max(o.extHi, bar.h); o.extLo = Math.min(o.extLo, tpSure ? bar.l : bar.c); }
    } else { if (bar.h > o.extHi) o.extHi = bar.h; if (bar.l < o.extLo) o.extLo = bar.l; }
    this._manage(o, ev);
  };
  /* Stop-Nachführung – wirkt erst ab der nächsten Kerze (kein Blick in die Kerze hinein) */
  EP._manage = function (o, ev) {
    const m = o.mgmt; if (!m || o.status !== 'open') return;
    const long = o.side > 0, e = o.entryPrice, tick = this.cfg.tick;
    const better = (p) => o.sl == null || (long ? p > o.sl : p < o.sl);
    if (m.beR > 0 && !o.beDone && o.riskPts) {
      const fe = long ? o.extHi - e : e - o.extLo;
      if (fe >= m.beR * o.riskPts - 1e-9) {
        o.beDone = true;
        if (better(e)) { o.sl = e; if (ev) ev.push({ type: 'be', o }); }
      }
    }
    if (m.trail > 0) {
      const p = C.roundTick(long ? o.extHi - m.trail : o.extLo + m.trail, tick);
      if (better(p) && (long ? p < o.extHi : p > o.extLo)) { o.sl = p; o.trailed = true; }
    }
  };
  /* Nächste Basiskerze verarbeiten. Gibt Ereignisse zurück. */
  EP.onBar = function (bar, idx) {
    const ev = [];
    for (const o of this.orders) {
      if (o.status === 'pending') {
        const px = this._entryPrice(o, bar);
        if (px != null) {
          this._fill(o, C.roundTick(px, this.cfg.tick), bar, idx, false);
          ev.push({ type: 'fill', o });
          this._process(o, bar, idx, true, ev);
        }
      } else if (o.status === 'open' && o.entryIdx < idx) {
        this._process(o, bar, idx, false, ev);
      }
    }
    return ev;
  };
  EP.closeAtMarket = function (o, bar, idx, reason) {
    if (o.status !== 'open') return null;
    return this._close(o, bar.c - o.side * this.slip(), bar, idx, reason || 'Manuell');
  };
  /* Netto-Ergebnis, wenn die offene Restmenge zu price geschlossen würde (inkl. bereits realisierter Teile) */
  EP.netAt = function (o, price, qty, isStop) {
    const cfg = this.cfg, q = qty != null ? qty : (o.qtyOpen != null ? o.qtyOpen : o.qty);
    const px = isStop ? price - o.side * this.slip() : price;
    const ent = o.entryPrice != null ? o.entryPrice : o.price;
    const gross = o.side * (px - ent) * q * cfg.pv;
    const fees = q * (cfg.feeFix || 0) * 2 + (ent + px) * q * cfg.pv * (cfg.feePct || 0) / 100;
    let real = 0; for (const p of o.partials || []) real += p.pnl;
    return gross - fees + real;
  };
  EP.cancel = function (o) { if (o.status === 'pending') o.status = 'cancelled'; };
  EP.open = function () { return this.orders.filter((o) => o.status === 'open'); };
  EP.pending = function () { return this.orders.filter((o) => o.status === 'pending'); };
  EP.unrealized = function (price) {
    let u = 0;
    for (const o of this.orders) if (o.status === 'open') {
      u += o.side * (price - o.entryPrice) * (o.qtyOpen != null ? o.qtyOpen : o.qty) * this.cfg.pv;
      for (const p of o.partials || []) u += p.pnl;
    }
    return u;
  };

  /* Kosten-Profil: futures (fix je Kontrakt), crypto (% vom Nominal), forex (fix je 100.000er-Lot) */
  C.costKeyFor = function (instKey, pv, qtyStep) {
    if (instKey === 'FOREX') return 'forex';
    if (instKey === 'ARCHIV') return 'futures';
    if (instKey === 'CRYPTO' || (pv === 1 && qtyStep < 1)) return 'crypto';
    return 'futures';
  };
  C.costCfgFor = function (key, c, tick, pv, intrabar, qtyStep) {
    const feeFix = key === 'forex' ? (+c.feeLot || 0) / 100000 : (+c.feeFix || 0);
    return { tick, pv, qtyStep: qtyStep || 0, slipTicks: +c.slipTicks || 0, feeFix, feePct: +c.feePct || 0, intrabar: intrabar || 'conservative' };
  };
  /* Positionsgröße aus Risiko */
  C.sizeFromRisk = function (riskMoney, entry, sl, pv, step) {
    const d = Math.abs(entry - sl);
    if (!(d > 0) || !(riskMoney > 0)) return 0;
    return C.floorStep(riskMoney / (d * pv), step || 1);
  };

  /* ---------- Statistik ---------- */
  C.stats = function (trades, startBal) {
    const t = trades.filter((x) => x.status === 'closed').sort((a, b) => a.exitT - b.exitT || a.id - b.id);
    const s = { n: t.length, wins: 0, losses: 0, be: 0, gp: 0, gl: 0, net: 0, fees: 0, sumR: 0, nR: 0, longN: 0, longW: 0, shortN: 0, shortW: 0, maxDD: 0, maxDDPct: 0, maxLossStreak: 0, maxWinStreak: 0, bestR: null, worstR: null, holdSum: 0, equity: [] };
    let bal = startBal || 0, peak = bal, ls = 0, ws = 0;
    s.equity.push({ t: t.length ? t[0].entryT : 0, v: bal });
    for (const x of t) {
      s.net += x.pnl; s.fees += x.fees;
      if (x.pnl > 0) { s.wins++; s.gp += x.pnl; ws++; ls = 0; }
      else if (x.pnl < 0) { s.losses++; s.gl += x.pnl; ls++; ws = 0; }
      else { s.be++; ls = 0; ws = 0; }
      s.maxLossStreak = Math.max(s.maxLossStreak, ls); s.maxWinStreak = Math.max(s.maxWinStreak, ws);
      if (x.r != null) { s.sumR += x.r; s.nR++; s.bestR = s.bestR == null ? x.r : Math.max(s.bestR, x.r); s.worstR = s.worstR == null ? x.r : Math.min(s.worstR, x.r); }
      if (x.side > 0) { s.longN++; if (x.pnl > 0) s.longW++; } else { s.shortN++; if (x.pnl > 0) s.shortW++; }
      s.holdSum += (x.exitT - x.entryT);
      bal += x.pnl;
      s.equity.push({ t: x.exitT, v: bal });
      if (bal > peak) peak = bal;
      const dd = peak - bal;
      if (dd > s.maxDD) { s.maxDD = dd; s.maxDDPct = peak > 0 ? dd / peak * 100 : 0; }
    }
    s.winRate = s.n ? s.wins / s.n * 100 : 0;
    s.pf = s.gl < 0 ? s.gp / -s.gl : (s.gp > 0 ? Infinity : 0);
    s.avgWin = s.wins ? s.gp / s.wins : 0;
    s.avgLoss = s.losses ? s.gl / s.losses : 0;
    s.expectancy = s.n ? s.net / s.n : 0;
    s.avgR = s.nR ? s.sumR / s.nR : null;
    s.payoff = s.avgLoss < 0 ? s.avgWin / -s.avgLoss : null;
    s.avgHold = s.n ? s.holdSum / s.n : 0;
    s.balance = bal;
    return s;
  };
  C.groupStats = function (trades, keyFn) {
    const g = new Map();
    for (const x of trades) {
      if (x.status !== 'closed') continue;
      const k = keyFn(x);
      let e = g.get(k); if (!e) { e = { k, n: 0, w: 0, net: 0, sumR: 0, nR: 0 }; g.set(k, e); }
      e.n++; if (x.pnl > 0) e.w++; e.net += x.pnl; if (x.r != null) { e.sumR += x.r; e.nR++; }
    }
    return [...g.values()];
  };
  /* Prop-Firm-Regeln (End-of-Day-Trailing wie bei TopStep) */
  C.propCheck = function (trades, cfg, sess) {
    const t = trades.filter((x) => x.status === 'closed').sort((a, b) => a.exitT - b.exitT || a.id - b.id);
    let bal = cfg.start, highEod = cfg.start, curDay = null, dayPnl = 0, dayStartBal = cfg.start;
    const res = { breaches: [], floor: cfg.start - cfg.maxDD, dayPnl: 0, balance: cfg.start };
    for (const x of t) {
      const day = C.sessionStart(x.exitT, sess);
      if (curDay !== null && day !== curDay) {
        highEod = Math.max(highEod, bal);
        dayPnl = 0; dayStartBal = bal;
      }
      curDay = day;
      const floor = Math.min(cfg.start, highEod - cfg.maxDD);
      bal += x.pnl; dayPnl += x.pnl;
      if (cfg.maxDD > 0 && bal <= floor) res.breaches.push({ type: 'Max. Drawdown', t: x.exitT, bal, floor });
      if (cfg.dailyLoss > 0 && dayPnl <= -cfg.dailyLoss) res.breaches.push({ type: 'Tagesverlust-Limit', t: x.exitT, bal, dayPnl });
    }
    res.floor = Math.min(cfg.start, highEod - cfg.maxDD);
    res.dayPnl = dayPnl; res.balance = bal; res.dayStartBal = dayStartBal;
    res.target = cfg.target > 0 ? cfg.start + cfg.target : null;
    return res;
  };

  /* Prop-Regeln getrennt je Backtest-Session (Replay) – jede Session ist ein eigenes "Konto" */
  C.propBySession = function (trades, cfg, defSess) {
    const g = new Map();
    for (const x of trades) {
      if (x.status !== 'closed') continue;
      const k = x.replay != null ? x.replay : 'ohne';
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(x);
    }
    const out = [];
    for (const [k, list] of g) {
      const res = C.propCheck(list, cfg, list[0].sess || defSess);
      const net = list.reduce((s, x) => s + x.pnl, 0);
      out.push({ replay: k, n: list.length, net, sym: list[0].sym, t: Math.min(...list.map((x) => x.entryT)), breaches: res.breaches, passed: res.target != null && res.balance >= res.target && !res.breaches.length, res });
    }
    return out.sort((a, b) => a.t - b.t);
  };

  /* ---------- Monte-Carlo (Bootstrap mit Zurücklegen) ---------- */
  /* pnls: Netto-Ergebnisse der Trades in Originalreihenfolge, dayCounts: Trades pro Handelstag im Original.
     cfg: {start, maxDD, dailyLoss, target}. Läuft in Häppchen (mcStep), damit die Oberfläche flüssig bleibt. */
  C.mcInit = function (pnls, dayCounts, cfg, runs, seed) {
    return { pnls: pnls.slice(), days: dayCounts.slice(), cfg, runs: runs || 2000, done: 0, rnd: C.rng(seed || 12345), dd: [], streak: [], pass: 0, fail: 0, open: 0, finals: [] };
  };
  C.mcStep = function (st, k) {
    const P = st.pnls, n = P.length, cfg = st.cfg, R = st.rnd;
    const end = Math.min(st.runs, st.done + k);
    for (; st.done < end; st.done++) {
      let bal = cfg.start, peak = bal, maxDD = 0, ls = 0, maxLs = 0, highEod = bal, i = 0, status = 0;
      for (let d = 0; d < st.days.length && i < n; d++) {
        let dayPnl = 0;
        const floor = Math.min(cfg.start, highEod - cfg.maxDD);
        for (let j = 0; j < st.days[d] && i < n; j++, i++) {
          const x = P[Math.floor(R() * n)];
          bal += x; dayPnl += x;
          if (x < 0) { ls++; if (ls > maxLs) maxLs = ls; } else if (x > 0) ls = 0;
          if (bal > peak) peak = bal;
          if (peak - bal > maxDD) maxDD = peak - bal;
          if (status === 0) {
            if (cfg.maxDD > 0 && bal <= floor) status = -1;
            else if (cfg.dailyLoss > 0 && dayPnl <= -cfg.dailyLoss) status = -1;
            else if (cfg.target > 0 && bal >= cfg.start + cfg.target) status = 1;
          }
        }
        highEod = Math.max(highEod, bal);
      }
      st.dd.push(maxDD); st.streak.push(maxLs); st.finals.push(bal - cfg.start);
      if (status === 1) st.pass++; else if (status === -1) st.fail++; else st.open++;
    }
    return st.done >= st.runs;
  };
  C.quantile = function (arr, q) {
    if (!arr.length) return NaN;
    const a = Float64Array.from(arr).sort();
    const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  };
  C.mcResult = function (st, bins) {
    bins = bins || 24;
    const dd = st.dd, mx = Math.max(1e-9, ...dd);
    const hist = new Array(bins).fill(0);
    for (const v of dd) hist[Math.min(bins - 1, Math.floor(v / mx * bins))]++;
    return {
      runs: st.done, ddMedian: C.quantile(dd, 0.5), dd95: C.quantile(dd, 0.95), streak95: C.quantile(st.streak, 0.95),
      finalMedian: C.quantile(st.finals, 0.5), pPass: st.done ? st.pass / st.done : 0, pFail: st.done ? st.fail / st.done : 0, pOpen: st.done ? st.open / st.done : 0,
      hist, histMax: mx
    };
  };
  /* Anzahl Trades je Handelstag (Original-Gruppierung) */
  C.dayCounts = function (trades, sess) {
    const t = trades.filter((x) => x.status === 'closed').sort((a, b) => a.exitT - b.exitT);
    const out = []; let cur = null;
    for (const x of t) { const d = C.sessionStart(x.exitT, sess || { tz: 'UTC', hour: 0 }); if (d !== cur) { out.push(0); cur = d; } out[out.length - 1]++; }
    return out;
  };
  /* Tages-PnL für den Kalender: Schlüssel JJJJ-MM-TT in Anzeige-Zeitzone */
  C.dailyPnl = function (trades, tz) {
    const m = new Map();
    for (const x of trades) {
      if (x.status !== 'closed') continue;
      const p = C.localParts(x.exitT, tz);
      const k = p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');
      const e = m.get(k) || { pnl: 0, n: 0, r: 0 };
      e.pnl += x.pnl; e.n++; e.r += x.r || 0; m.set(k, e);
    }
    return m;
  };

  /* ---------- RTH-Levels (New York) – nur aus Kerzen bis einschließlich cursor ---------- */
  const NY18 = { tz: 'America/New_York', hour: 18 };
  C.rthLevels = function (base, cursor, baseTf) {
    if (!base || !base.length || cursor < 0) return null;
    const tNow = base[cursor].t, tEnd = tNow + (baseTf || 60);
    const s0 = C.sessionStart(tNow, NY18);
    const lp = C.localParts(s0 + 7 * 3600, 'America/New_York'); /* Handelstag = Kalendertag nach 18:00-Start */
    const open = C.zonedToUtc(lp.y, lp.m, lp.d, 9, 30, 0, 'America/New_York');
    const or15 = open + 900, ib = open + 3600;
    let i = cursor;
    while (i > 0 && base[i - 1].t >= s0) i--;
    const r = { start: s0, open, onh: -Infinity, onl: Infinity, rthOpen: null, orh: -Infinity, orl: Infinity, ibh: -Infinity, ibl: Infinity, orDone: tEnd >= or15, ibDone: tEnd >= ib, rth: tEnd > open, orT: or15, ibT: ib };
    for (; i <= cursor; i++) {
      const b = base[i];
      if (b.t < open) { if (b.h > r.onh) r.onh = b.h; if (b.l < r.onl) r.onl = b.l; continue; }
      if (r.rthOpen == null) r.rthOpen = b.o;
      if (b.t < or15) { if (b.h > r.orh) r.orh = b.h; if (b.l < r.orl) r.orl = b.l; }
      if (b.t < ib) { if (b.h > r.ibh) r.ibh = b.h; if (b.l < r.ibl) r.ibl = b.l; }
    }
    if (!isFinite(r.onh)) { r.onh = null; r.onl = null; }
    if (!isFinite(r.orh)) { r.orh = null; r.orl = null; }
    if (!isFinite(r.ibh)) { r.ibh = null; r.ibl = null; }
    return r;
  };

  /* ---------- Archiv / Zufallsdatum ---------- */
  /* Handelstage (UTC-Mitternacht des Kalendertags) aus verfügbaren Monaten; weekdays: nur Mo–Fr */
  C.tradingDays = function (months, y0, y1, weekdays) {
    const out = [];
    for (const ym of months) {
      const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
      if (y < y0 || y > y1) continue;
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (let d = 1; d <= dim; d++) {
        const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        if (weekdays && (wd === 0 || wd === 6)) continue;
        out.push({ y, m, d });
      }
    }
    return out;
  };
  /* Monate (JJJJ-MM), die den Zeitraum [a, e] (Unix-Sekunden) überdecken */
  C.monthsBetween = function (a, e) {
    const out = [];
    let d = new Date(a * 1000); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    while (d.getTime() / 1000 <= e) { out.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }
    return out;
  };
  /* n Handelstage (Mo–Fr) vor/nach einem Kalendertag */
  C.shiftTradingDays = function (y, m, d, n, weekdays) {
    let t = Date.UTC(y, m - 1, d); const step = n < 0 ? -1 : 1; let k = Math.abs(n);
    while (k > 0) { t += step * 86400000; const wd = new Date(t).getUTCDay(); if (!weekdays || (wd !== 0 && wd !== 6)) k--; }
    const x = new Date(t); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
  };

  /* ---------- Parser ---------- */
  C.parseBinanceKlines = function (rows) {
    return rows.map((r) => ({ t: Math.floor(+r[0] / 1000), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], bv: +r[9] }));
  };
  C.parseBinanceAggTrades = function (rows) {
    /* m = true → Käufer war Maker → Aggressor hat verkauft */
    return rows.map((r) => ({ t: +r.T, p: +r.p, q: +r.q, b: !r.m, id: +r.a }));
  };
  C.normTime = function (x) {
    if (x > 1e17) return x / 1e9;
    if (x > 1e14) return x / 1e6;
    if (x > 1e11) return x / 1e3;
    return x;
  };
  function isNum(s) { return s !== '' && s != null && isFinite(+s); }
  function isBool(s) { const v = String(s).trim().toLowerCase(); return v === 'true' || v === 'false'; }
  /* Zahl aus CSV: versteht Dezimalkomma (1,5 / 1.234,5) und Dezimalpunkt (1,234.5 nur in Anführungszeichen) */
  C.parseNum = function (s, delim, dc) {
    if (s == null) return NaN;
    s = String(s).trim().replace(/^"|"$/g, '').replace(/\s/g, '');
    if (s === '') return NaN;
    if (dc) { s = s.replace(/\./g, '').replace(',', '.'); return isNum(s) ? +s : NaN; }
    if (isNum(s)) return +s;
    const hasC = s.indexOf(',') >= 0, hasD = s.indexOf('.') >= 0;
    if (hasC && hasD) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasC) {
      if (delim === ',' && /^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
      else if ((s.match(/,/g) || []).length === 1) s = s.replace(',', '.');
      else return NaN;
    } else if (hasD && /^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, '');
    return isNum(s) ? +s : NaN;
  };
  const validYmd = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1900 && y < 2200;
  /* dmy: true = Schrägstrich-Datum als TT/MM/JJJJ lesen */
  C.parseTimeStr = function (s, tz, dmy) {
    s = String(s).trim().replace(/^"|"$/g, '');
    let m;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/)) && validYmd(+m[1], +m[2], +m[3])) return C.zonedToUtc(+m[1], +m[2], +m[3], 0, 0, 0, tz);
    if (isNum(s)) return C.normTime(+s);
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/))) {
      const frac = m[7] ? +('0' + m[7]) : 0;
      if (m[8] && m[8] !== 'UTC') {
        let off = 0;
        if (m[8] !== 'Z') { const z = m[8].replace(':', ''); off = (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3, 5)); }
        return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000 - off * 60 + frac;
      }
      return C.zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), m[8] === 'UTC' ? 'UTC' : tz) + frac;
    }
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return C.zonedToUtc(+m[1], +m[2], +m[3], 0, 0, 0, tz);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):?(\d{2}):?(\d{2})?$/))) return C.zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), tz);
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?$/))) {
      if (!validYmd(+m[3], +m[2], +m[1])) return NaN;
      return C.zonedToUtc(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), tz) + (m[7] ? +('0' + m[7]) : 0);
    }
    if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))) {
      if (!validYmd(+m[1], +m[2], +m[3])) return NaN;
      return C.zonedToUtc(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), tz);
    }
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(AM|PM)?)?$/i))) {
      let a = +m[1], b = +m[2];
      if (dmy || a > 12) { const x = a; a = b; b = x; } /* a = Monat, b = Tag */
      if (!validYmd(+m[3], a, b)) return NaN;
      let h = +(m[4] || 0); const ap = (m[8] || '').toUpperCase();
      if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
      return C.zonedToUtc(+m[3], a, b, h, +(m[5] || 0), +(m[6] || 0), tz);
    }
    const d = Date.parse(s);
    return isFinite(d) ? d / 1000 : NaN;
  };
  function splitLine(line, delim) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { q = !q; continue; }
      if (ch === delim && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  const normHead = (h) => String(h).toLowerCase().replace(/[\s"<>()]/g, '').replace(/-/g, '_').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  /* Erkennt Kerzen- oder Trade-CSV (inkl. Binance-Dateien von data.binance.vision ohne Kopfzeile,
     TradingView-Export, Databento, deutsche Dateien mit Dezimalkomma).
     opts.sess: Session für "Kontrakt mit dem meisten Volumen je Tag" (Databento-Symbol-Spalte) */
  C.parseCSV = function (text, tz, opts) {
    opts = opts || {};
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) throw new Error('Die Datei ist leer.');
    const first = lines[0];
    const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const cells = splitLine(first, delim);
    const numLike = (c) => isFinite(C.parseNum(c, delim));
    const hasHeader = cells.some((c) => c && !numLike(c) && !isBool(c) && isNaN(Date.parse(c)) && !/^\d{1,2}[./]\d{1,2}[./]\d{4}/.test(c) && !/^\d{8}(\s+\d{4,6})?$/.test(c) && !/^\d{4}[-/]\d{2}[-/]\d{2}/.test(c));
    let idx = {}, kind = null, start = 0, format = '', dbn = false;
    const H = cells.map(normHead);
    const find = (names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
    if (hasHeader) {
      start = 1;
      idx.time = find(['ts_event', 'time', 'timestamp', 'datetime', 'date_time', 'open_time', 'opentime', 'unix', 'transact_time', 'gmttime', 'localtime', 'dateandtime', 'zeitstempel', 'ts_recv']);
      idx.date = find(['date', 'day', 'datum', 'tag']);
      idx.clock = find(['clock', 'hour', 'time_of_day', 'zeit', 'uhrzeit']);
      if (idx.time < 0 && idx.date >= 0) { idx.time = idx.date; idx.date = -1; }
      if (idx.time >= 0 && idx.date >= 0 && idx.time !== idx.date) { idx.clock = idx.time; idx.time = idx.date; }
      if (idx.clock === idx.time) idx.clock = -1;
      idx.o = find(['open', 'o', 'opn', 'eroeffnung', 'erster', 'eroeffnungskurs']);
      idx.h = find(['high', 'h', 'hi', 'hoch', 'hoechst', 'hoechstkurs']);
      idx.l = find(['low', 'l', 'lo', 'tief', 'tiefst', 'tiefstkurs']);
      idx.c = find(['close', 'c', 'last', 'cls', 'schluss', 'schlusskurs', 'letzter']);
      idx.v = find(['volume', 'vol', 'v', 'qty', 'quantity', 'size', 'amount', 'base_volume', 'volumen', 'umsatz', 'stueck']);
      idx.bv = find(['taker_buy_volume', 'taker_buy_base_asset_volume', 'buy_volume', 'buyvolume', 'askvolume', 'ask_volume', 'buy', 'buys']);
      idx.sv = find(['sell_volume', 'sellvolume', 'bidvolume', 'bid_volume', 'sell', 'sells']);
      idx.p = find(['price', 'p', 'trade_price', 'px', 'preis', 'kurs']);
      idx.side = find(['side', 'aggressor', 'is_buyer_maker', 'isbuyermaker', 'buyer_maker', 'direction', 'type', 'seite']);
      idx.sym = find(['symbol', 'raw_symbol']);
      idx.action = find(['action']);
      dbn = H.includes('ts_event') || H.includes('ts_recv') || idx.action >= 0;
      if (idx.o >= 0 && idx.h >= 0 && idx.l >= 0 && idx.c >= 0) { kind = 'bars'; format = dbn ? 'Databento OHLCV' : 'Kerzen-CSV mit Kopfzeile'; }
      else if (idx.p >= 0 && idx.v >= 0 && idx.time >= 0) { kind = 'trades'; format = dbn ? 'Databento Trades' : 'Trade-CSV mit Kopfzeile'; }
      else throw new Error('Spalten nicht erkannt. Nötig: time, open, high, low, close (optional volume) – oder für Trades: time, price, qty, side.');
      if (idx.time < 0) throw new Error('Keine Zeitspalte gefunden (z. B. "time" oder "date").');
    } else {
      const n = cells.length;
      if (n >= 11 && isNum(cells[0]) && +cells[0] > 1e11) { kind = 'bars'; idx = { time: 0, o: 1, h: 2, l: 3, c: 4, v: 5, bv: 9 }; format = 'Binance Klines (data.binance.vision)'; }
      else if ((n === 7 || n === 8) && isBool(cells[6]) && !isBool(cells[5])) { kind = 'trades'; idx = { p: 1, v: 2, time: 5, side: 6, maker: true }; format = 'Binance aggTrades (data.binance.vision)'; }
      else if (n === 7 && isBool(cells[5])) { kind = 'trades'; idx = { p: 1, v: 2, time: 4, side: 5, maker: true }; format = 'Binance Trades (data.binance.vision)'; }
      else if (n === 6 && isBool(cells[5])) { kind = 'trades'; idx = { p: 1, v: 2, time: 4, side: 5, maker: true }; format = 'Binance Futures-Trades (data.binance.vision)'; }
      else if (n >= 5) { kind = 'bars'; idx = { time: 0, o: 1, h: 2, l: 3, c: 4, v: n > 5 ? 5 : -1 }; format = 'Kerzen-CSV ohne Kopfzeile (time,o,h,l,c,v)'; }
      else throw new Error('Format nicht erkannt.');
    }
    const ok = (k) => idx[k] != null && idx[k] >= 0;
    const rowsRaw = [];
    for (let i = start; i < lines.length; i++) rowsRaw.push(splitLine(lines[i], delim));
    /* TT/MM/JJJJ erkennen: sobald irgendeine Zeile im ersten Teil > 12 hat, gilt die ganze Datei als TT/MM */
    let dmy = false;
    for (const r of rowsRaw) { const m = String(r[idx.time] || '').match(/^"?(\d{1,2})\/(\d{1,2})\/\d{4}/); if (m && +m[1] > 12) { dmy = true; break; } }
    /* Databento: Festkomma-Preise (×1e-9) */
    let pxScale = 1;
    if (dbn && rowsRaw.length) {
      const pc = kind === 'bars' ? idx.o : idx.p;
      const v0 = C.parseNum(rowsRaw[0][pc], delim);
      if (Number.isInteger(v0) && v0 > 1e9) pxScale = 1e-9;
    }
    /* Dezimalkomma-Datei: Trennzeichen ; oder Tab und Zahlen mit Komma → Punkte sind Tausender-Trennzeichen */
    let dc = false;
    if (delim !== ',') {
      const cols = ['o', 'h', 'l', 'c', 'p', 'v'].filter(ok).map((k) => idx[k]);
      outer: for (const r of rowsRaw.slice(0, 200)) for (const c of cols) if (/^-?[\d.]*\d,\d+$/.test(String(r[c] || '').trim())) { dc = true; break outer; }
    }
    const num = (r, k) => C.parseNum(r[idx[k]], delim, dc);
    const out = [];
    let bad = 0, skipped = 0, prevT = -Infinity;
    const local = tz && tz !== 'UTC';
    for (const r of rowsRaw) {
      const ts = ok('clock') ? r[idx.time] + ' ' + r[idx.clock] : r[idx.time];
      let t = C.parseTimeStr(ts, tz, dmy);
      if (!isFinite(t)) { bad++; continue; }
      /* Zeitumstellung im Herbst: doppelte Stunde in Ortszeit → zweites Vorkommen ist eine Stunde später */
      if (local && t < prevT && t + 3600 > prevT && C.tzOffset(t, tz) > C.tzOffset(t + 3600, tz)) t += 3600;
      prevT = t;
      const sym = ok('sym') ? r[idx.sym] : null;
      if (kind === 'bars') {
        const b = { t: Math.round(t), o: num(r, 'o') * pxScale, h: num(r, 'h') * pxScale, l: num(r, 'l') * pxScale, c: num(r, 'c') * pxScale, v: ok('v') ? num(r, 'v') : 0, bv: null };
        if (!isFinite(b.v)) b.v = 0;
        if (ok('bv') && isFinite(num(r, 'bv'))) b.bv = num(r, 'bv');
        else if (ok('sv') && isFinite(num(r, 'sv')) && ok('v')) b.bv = b.v - num(r, 'sv');
        if (![b.o, b.h, b.l, b.c].every(isFinite)) { bad++; continue; }
        if (sym != null) b.sym = sym;
        out.push(b);
      } else {
        if (dbn && ok('action')) { const a = String(r[idx.action]).trim().toUpperCase(); if (a && a !== 'T') { skipped++; continue; } }
        const sv = String(r[idx.side] == null ? '' : r[idx.side]).trim().toLowerCase();
        let buy;
        if (dbn) {
          /* Databento: side = Aggressor. A = Verkäufer-Aggressor, B = Käufer-Aggressor, N = unbekannt */
          if (sv === 'b') buy = true; else if (sv === 'a') buy = false; else { skipped++; continue; }
        } else {
          const makerCol = !!idx.maker || (hasHeader && /maker/.test(H[idx.side] || ''));
          if (sv === 'true' || sv === 'false') buy = makerCol ? sv === 'false' : sv === 'true';
          else if (/^(b|buy|ask|a|1|long|kauf)$/.test(sv)) buy = true;
          else if (/^(s|sell|bid|-1|0|short|verkauf)$/.test(sv)) buy = false;
          else { bad++; continue; }
        }
        const tr = { t: t * 1000, p: num(r, 'p') * pxScale, q: Math.abs(num(r, 'v')), b: buy };
        if (!isFinite(tr.p) || !isFinite(tr.q)) { bad++; continue; }
        if (sym != null) tr.sym = sym;
        out.push(tr);
      }
    }
    if (!out.length) throw new Error('Keine gültigen Zeilen gefunden.');
    /* Mehrere Kontrakte (Symbol-Spalte): je Tag nur den Kontrakt mit dem meisten Volumen behalten */
    let rows = out, symNote = '';
    if (ok('sym')) {
      const syms = new Set(out.map((x) => x.sym));
      if (syms.size > 1) {
        const sess = opts.sess || { tz: 'UTC', hour: 0 };
        const outright = [...syms].filter((s) => !/[-:]/.test(s));
        const allowed = new Set(outright.length ? outright : syms);
        const vol = new Map();
        const dayOf = (x) => C.sessionStart(kind === 'bars' ? x.t : x.t / 1000, sess);
        for (const x of out) {
          if (!allowed.has(x.sym)) continue;
          const k = dayOf(x) + '|' + x.sym;
          vol.set(k, (vol.get(k) || 0) + (kind === 'bars' ? x.v : x.q));
        }
        const best = new Map();
        for (const [k, v] of vol) { const [d, s] = k.split('|'); const b = best.get(d); if (!b || v > b.v) best.set(d, { s, v }); }
        rows = out.filter((x) => { const b = best.get(String(dayOf(x))); return b && b.s === x.sym; });
        skipped += out.length - rows.length;
        symNote = ', je Tag der Kontrakt mit dem meisten Volumen (' + [...new Set([...best.values()].map((b) => b.s))].join(', ') + ')';
      }
      for (const x of rows) delete x.sym;
    }
    return { kind, rows, bad, skipped, format: format + symNote + (pxScale !== 1 ? ', Festkomma-Preise umgerechnet' : ''), dmy };
  };
  C.barsFromTrades = function (tr, tf) {
    const bars = [];
    let cur = null;
    for (let i = 0; i < tr.n; i++) {
      const t = Math.floor(tr.t[i] / 1000 / tf) * tf;
      const p = tr.p[i], q = tr.q[i];
      if (!cur || cur.t !== t) { cur = { t, o: p, h: p, l: p, c: p, v: 0, bv: 0 }; bars.push(cur); }
      if (p > cur.h) cur.h = p; if (p < cur.l) cur.l = p; cur.c = p; cur.v += q; if (tr.b[i]) cur.bv += q;
    }
    return bars;
  };

  /* ---------- Demo-Daten (synthetisch, deterministisch) ---------- */
  C.rng = function (seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  C.demoData = function (days, seed) {
    const R = C.rng(seed || 7);
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const tick = 0.25, sess = { tz: 'America/New_York', hour: 18 };
    const list = [];
    let price = 21000, trend = 0;
    /* Letzter Handelstag: Freitag, 23.10.2026 */
    let endDay = C.zonedToUtc(2026, 10, 23, 17, 0, 0, 'America/New_York');
    const dayList = [];
    let d = endDay;
    while (dayList.length < days) {
      const lp = C.localParts(d - 3600, 'America/New_York');
      if (lp.wd >= 1 && lp.wd <= 5) dayList.unshift(d);
      d -= 86400;
    }
    for (const end of dayList) {
      const start = end - 23 * 3600; /* 18:00 Vortag bis 17:00 */
      for (let t = start; t < end; t += 60) {
        const lp = C.localParts(t, 'America/New_York');
        const mins = lp.h * 60 + lp.mi;
        const rth = mins >= 570 && mins < 960;
        const open = mins >= 570 && mins < 630;
        const lon = mins >= 180 && mins < 570;
        const sig = open ? 7 : rth ? 4.2 : lon ? 2.6 : 1.4;
        const nT = Math.max(4, Math.round((open ? 100 : rth ? 50 : lon ? 22 : 9) * (0.6 + R() * 0.8)));
        if (R() < 0.03) trend = gauss() * 0.18;
        trend *= 0.97;
        /* leichte Rückkehr zum Mittel, damit der Kurs realistisch bleibt */
        const pull = (21000 - price) / 21000 * 6;
        const step = sig / Math.sqrt(nT);
        for (let k = 0; k < nT; k++) {
          const ms = (t + (k + R()) * 60 / nT) * 1000;
          const mv = gauss() * step + (trend + pull * 0.02) * sig / nT;
          price += mv;
          const pr = Math.round(price / tick) * tick;
          const buy = R() < 0.5 + Math.max(-0.35, Math.min(0.35, mv / (step * 3)));
          let q = 1 + Math.floor(R() * R() * 12);
          if (R() < 0.01) q += 20 + Math.floor(R() * 60);
          list.push({ t: Math.floor(ms), p: pr, q, b: buy });
        }
      }
    }
    const tr = C.makeTrades(list);
    const bars = C.barsFromTrades(tr, 60);
    return { bars, trades: tr, tick, sess, cov: [[dayList[0] * 1000 - 23 * 3600 * 1000, endDay * 1000]] };
  };

  /* ---------- Fehler-Analyse (v4) ---------- */
  /* Schwellen und Mindest-Datenbasis je Regel (alle in einem Objekt, damit Tests und Bericht dieselben Zahlen nutzen) */
  C.ANALYSE = {
    revengeMin: 10, postBars: 120, postExtraR: 0.5, riskFactor: 1.25, cvMax: 0.5, holdFactor: 1.5, groupMin: 5, overAbs: 5,
    min: { sl: 5, frueh: 5, eng: 5, revenge: 3, over: 3, risiko: 5, schwankt: 8, halten: 5, zeit: 15, setup: 5, regeln: 5, vwap: 10, ziel: 8, news: 5 }
  };
  const avgOf = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const sumOf = (a) => a.reduce((s, x) => s + x, 0);
  const rOf = (x) => (x.r != null && isFinite(x.r) ? x.r : null);
  const riskOf = (x) => (x.risk > 0 ? x.risk : null);
  /* Kosten in $ aus Kosten in R (je Trade mit dessen Risiko) */
  const usdFromR = (x, cr) => (riskOf(x) ? cr * x.risk : 0);
  C.analyseSeverity = function (kostenR, anteil) {
    if (kostenR >= 3 || anteil >= 0.3) return 'hoch';
    if (kostenR >= 1 || anteil >= 0.15) return 'mittel';
    return 'gering';
  };
  /* Nachlauf-Prüfung NACH Session-Ende: hätte der Kurs innerhalb der nächsten N Basis-Kerzen erst das Ziel
     oder erst den (um extraR erweiterten) Stop erreicht? Gleiche Kerze → Stop zuerst (konservativ). */
  C.postCheck = function (base, baseTf, j, opts) {
    opts = opts || {};
    const N = opts.bars || C.ANALYSE.postBars, xr = opts.extraR == null ? C.ANALYSE.postExtraR : opts.extraR;
    if (!base || !base.length || !j || j.reason === 'TP' || j.sl == null || !isFinite(j.entryPrice) || !isFinite(j.exitT)) return null;
    const side = j.side, e = j.entryPrice, riskPts = Math.abs(e - j.sl);
    if (!(riskPts > 0)) return null;
    const tp = j.tp != null ? j.tp : (j.plannedR > 0 ? e + side * j.plannedR * riskPts : null);
    if (tp == null) return null;
    const slType = j.reason === 'SL' || j.reason === 'Trailing' || j.reason === 'Einstand';
    const stop = slType ? j.sl - side * xr * riskPts : (j.slFinal != null ? j.slFinal : j.sl);
    let lo = 0, hi = base.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (base[m].t <= j.exitT) lo = m + 1; else hi = m; }
    let k = 0;
    for (let i = lo; k < N && i < base.length; i++, k++) {
      const b = base[i];
      const hitS = side > 0 ? b.l <= stop : b.h >= stop;
      const hitT = side > 0 ? b.h >= tp : b.l <= tp;
      if (hitS) return { hitTp: false, minutes: null, n: k + 1, stopFirst: true };
      if (hitT) return { hitTp: true, minutes: Math.max(1, Math.round((b.t + (baseTf || 60) - j.exitT) / 60)), n: k + 1 };
    }
    return k ? { hitTp: false, minutes: null, n: k } : null;
  };
  /* trades: Journal-Einträge (geschlossen), sessions: Backtest-Sessions (optional).
     opts: {tz, riskTarget, hideWeekdayReplay, kurz (Session-Kurzcheck: nur Verhaltens-Regeln, Mindestbasis 1)}
     → {n, sessions, befunde[], staerken[], zuWenig[], kostenUsd, kostenR} */
  C.analyzeMistakes = function (trades, sessions, opts) {
    opts = Object.assign({}, C.ANALYSE, opts || {});
    const M = Object.assign({}, C.ANALYSE.min, opts.min || {});
    const kurz = !!opts.kurz;
    const T = (trades || []).filter((x) => x && (x.status === 'closed' || x.status == null) && isFinite(x.pnl) && isFinite(x.entryT) && isFinite(x.exitT))
      .slice().sort((a, b) => a.entryT - b.entryT || a.exitT - b.exitT);
    const befunde = [], staerken = [], zuWenig = [];
    const fR = C.fmtR, fM = (v, s) => C.fmtMoney(v, s, 0), fN = C.fmtNum, fP = (v) => C.fmtPct(v * 100, 0);
    const avgRStr = (list) => { const a = avgOf(list.map(rOf).filter((r) => r != null)); return a == null ? '–' : fR(a); };
    const need = (id, titel, have, min, was) => {
      if (have >= min) return true;
      zuWenig.push({ id, titel, have, min, hinweis: 'Braucht mindestens ' + min + ' ' + was + ' – bisher ' + have + '.' });
      return false;
    };
    const add = (f) => {
      f.kostenR = Math.max(0, +(f.kostenR || 0).toFixed(4)); f.kostenUsd = Math.max(0, +(f.kostenUsd || 0).toFixed(2));
      f.anzahl = f.anzahl != null ? f.anzahl : f.tradeIds.length;
      if (!f.schwere) f.schwere = C.analyseSeverity(f.kostenR, f.anteil || 0);
      befunde.push(f);
    };
    const keyOf = (x) => (x.replay != null ? 'r' + x.replay : x.session != null ? 's' + x.session : 'ohne');
    const groups = new Map();
    for (const x of T) { const k = keyOf(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    const ids = (list) => list.map((x) => x.id);

    /* 1 · Stop vergrößert */
    {
      const el = T.filter((x) => x.sl != null && x.slFinal != null && isFinite(x.entryPrice));
      if (need('sl-vergroessert', 'Stop vergrößert', el.length, kurz ? 1 : M.sl, 'Trades mit Stop')) {
        const hits = el.filter((x) => { const tol = (x.tick || 1e-9) / 2; return x.side * (x.entryPrice - x.slFinal) > x.side * (x.entryPrice - x.sl) + tol; });
        if (hits.length) {
          let cR = 0, cU = 0, worse = 0, saved = 0, sW = 0;
          for (const x of hits) { const r = rOf(x); if (r == null) continue; const c = Math.max(0, -1 - r); if (c > 0) { worse++; sW += r; } if (r > 0) saved++; cR += c; cU += usdFromR(x, c); }
          add({ id: 'sl-vergroessert', titel: 'Stop nach dem Einstieg vergrößert', anteil: hits.length / el.length, kostenR: cR, kostenUsd: cU, tradeIds: ids(hits), handbuch: 'sl-verschieben',
            schwere: cR >= 2 || hits.length / el.length >= 0.2 ? 'hoch' : cR > 0 ? 'mittel' : 'gering',
            beschreibung: hits.length + ' von ' + el.length + ' Trades: Stop nach dem Einstieg weiter vom Einstieg weggesetzt. ' + (worse ? worse + ' davon endeten mit mehr als −1R Verlust (zusammen ' + fR(sW) + ').' : 'Keiner endete schlechter als −1R.') +
              (saved ? ' ' + saved + ' drehten danach noch ins Plus – das Risiko war trotzdem größer als geplant.' : '') + ' Kostenschätzung: Verlust jenseits von −1R je Trade.',
            tipp: 'Stop vor dem Einstieg dorthin legen, wo die Idee widerlegt ist – danach nur noch Richtung Gewinn nachziehen. Willst du mehr Platz: Position verkleinern oder schließen, nicht das Risiko erhöhen.' });
        }
      }
    }
    /* 2 · Zu früh raus */
    {
      const el = T.filter((x) => x.plannedR > 0 && rOf(x) != null);
      if (need('zu-frueh-raus', 'Zu früh ausgestiegen', el.length, kurz ? 1 : M.frueh, 'Trades mit geplantem Ziel')) {
        const proof = (x) => (x.mfeR != null && x.mfeR >= x.plannedR - 1e-9) || !!(x.post && x.post.hitTp);
        const hits = el.filter((x) => x.reason === 'Manuell' && x.r < x.plannedR - 0.05 && (x.pnl >= 0 || proof(x)));
        if (hits.length >= (kurz ? 1 : 2)) {
          const ev = hits.filter(proof);
          const during = ev.filter((x) => x.mfeR != null && x.mfeR >= x.plannedR - 1e-9).length;
          let cR = 0, cU = 0; for (const x of ev) { const c = x.plannedR - x.r; cR += c; cU += usdFromR(x, c); }
          add({ id: 'zu-frueh-raus', titel: 'Zu früh ausgestiegen', anteil: hits.length / el.length, kostenR: cR, kostenUsd: cU, tradeIds: ids(hits), handbuch: 'zu-frueh-raus',
            beschreibung: hits.length + ' manuelle Ausstiege unter dem geplanten Ziel (realisiert Ø ' + avgRStr(hits) + ' statt geplant Ø ' + fR(avgOf(hits.map((x) => x.plannedR))) + '). ' +
              (ev.length ? 'Bei ' + ev.length + ' davon war das Ziel nachweislich erreichbar (' + during + ' schon während des Trades, ' + (ev.length - during) + ' laut Nachlauf-Prüfung nach dem Ausstieg). Kostenschätzung: geplantes R minus realisiertes R, nur für diese ' + ev.length + ' Trades.' : 'Ob das Ziel erreichbar war, zeigen die Daten (noch) nicht – daher keine Kostenschätzung.'),
            tipp: 'Vor dem Einstieg festlegen, wann du manuell aussteigst (z. B. nur bei Bruch der Struktur). Wer Gewinne sichern will: Teilausstieg oder Stop auf Einstand statt alles zu schließen.' });
        }
      }
    }
    /* 3 · Stop zu eng */
    {
      const el = T.filter((x) => x.reason === 'SL' && rOf(x) != null && x.r < 0);
      if (need('stop-zu-eng', 'Stop zu eng', el.length, kurz ? 1 : M.eng, 'Stop-Verluste')) {
        const a = el.filter((x) => x.mfeR != null && x.mfeR >= 1), b = el.filter((x) => x.post && x.post.hitTp);
        const hits = el.filter((x) => (x.mfeR != null && x.mfeR >= 1) || (x.post && x.post.hitTp));
        const withPost = el.filter((x) => x.post).length;
        if (hits.length >= (kurz ? 1 : 2)) {
          let cR = 0, cU = 0; for (const x of hits) { cR += -x.r; cU += usdFromR(x, -x.r); }
          add({ id: 'stop-zu-eng', titel: 'Stop zu eng oder ungeschützt', anteil: hits.length / el.length, kostenR: cR, kostenUsd: cU, tradeIds: ids(hits), handbuch: 'stopp-setzen',
            beschreibung: hits.length + ' von ' + el.length + ' Stop-Verlusten: ' + a.length + ' lagen vorher schon mindestens 1R im Plus, ' + b.length + ' liefen nach dem Stopp innerhalb von ' + opts.postBars + ' Kerzen noch ins Ziel' +
              (withPost < el.length ? ' (Nachlauf-Prüfung für ' + withPost + ' von ' + el.length + ' Trades vorhanden)' : '') + '. Kostenschätzung: der Verlust dieser Trades – mit mehr Platz oder Stop auf Einstand wäre er vermeidbar gewesen.',
            tipp: 'Stop hinter eine echte Struktur legen (Swing-Hoch/-Tief, Value-Area-Kante) plus Puffer und die Größe daraus berechnen. Liegt ein Trade 1R vorn, Stop auf Einstand oder Teilgewinn nehmen.' });
        }
      }
    }
    /* 4 · Revenge-Trades */
    {
      const hits = [], bigger = []; let basis = 0;
      for (const list of groups.values()) {
        for (let i = 1; i < list.length; i++) {
          const x = list[i]; let prev = null;
          for (let k = i - 1; k >= 0; k--) { const p = list[k]; if (p.exitT <= x.entryT && (!prev || p.exitT > prev.exitT)) prev = p; }
          if (!prev || !(prev.pnl < 0)) continue;
          basis++;
          if (x.entryT - prev.exitT <= opts.revengeMin * 60) { hits.push(x); if (riskOf(x) && riskOf(prev) && x.risk > prev.risk * 1.1) bigger.push(x); }
        }
      }
      if (need('revenge', 'Revenge-Trades', basis, kurz ? 1 : M.revenge, 'Trades nach einem Verlust')) {
        if (hits.length >= (kurz ? 1 : 2)) {
          const sP = sumOf(hits.map((x) => x.pnl)), sR = sumOf(hits.map((x) => rOf(x) || 0));
          const rest = T.filter((x) => !hits.includes(x));
          add({ id: 'revenge', titel: 'Revenge-Trades nach Verlusten', anteil: hits.length / Math.max(1, basis), kostenR: Math.max(0, -sR), kostenUsd: Math.max(0, -sP), tradeIds: ids(hits), handbuch: 'revenge',
            schwere: bigger.length && sP < 0 ? 'hoch' : undefined,
            beschreibung: hits.length + ' Trades innerhalb von ' + opts.revengeMin + ' Minuten nach einem Verlust eröffnet' + (bigger.length ? ', davon ' + bigger.length + ' mit größerem Risiko als der Verlust-Trade' : '') +
              '. Ergebnis zusammen ' + fM(sP, true) + ' (Ø ' + avgRStr(hits) + '; alle übrigen Trades Ø ' + avgRStr(rest) + '). Kostenschätzung: Summe dieser Trades, wenn negativ.',
            tipp: 'Nach jedem Verlust eine feste Pause (z. B. 10 Minuten oder bis zur nächsten 15-Minuten-Kerze) und das Risiko nie erhöhen, um etwas zurückzuholen. Nach zwei Verlusten in Folge: Session beenden.' });
        }
      }
    }
    /* 5 · Overtrading */
    if (!kurz) {
      const S = [...groups.values()].filter((l) => l.length);
      if (need('overtrading', 'Overtrading', S.length, M.over, 'Sessions')) {
        const cnt = S.map((l) => l.length), mean = avgOf(cnt), sd = Math.sqrt(avgOf(cnt.map((c) => (c - mean) * (c - mean))));
        const thr = Math.max(opts.overAbs, mean + sd);
        const over = S.filter((l) => l.length > thr + 1e-9);
        const early = [], later = [];
        for (const l of S) { const o = l.slice().sort((a, b) => a.entryT - b.entryT); o.forEach((x, i) => (i < 3 ? early : later).push(x)); }
        const aE = avgOf(early.map(rOf).filter((r) => r != null)), aL = avgOf(later.map(rOf).filter((r) => r != null));
        const laterBad = later.length >= 5 && aL != null && aL < 0 && (aE == null || aL < aE);
        if (over.length || laterBad) {
          const lo = over.length ? over.flatMap((l) => l.slice().sort((a, b) => a.entryT - b.entryT).slice(3)) : later;
          const sR = sumOf(lo.map((x) => rOf(x) || 0)), sP = sumOf(lo.map((x) => x.pnl));
          add({ id: 'overtrading', titel: 'Overtrading', anteil: over.length / S.length, kostenR: Math.max(0, -sR), kostenUsd: Math.max(0, -sP), tradeIds: ids(lo), handbuch: 'overtrading',
            beschreibung: (over.length ? over.length + ' von ' + S.length + ' Sessions mit mehr als ' + fN(thr, 1) + ' Trades (Ø ' + fN(mean, 1) + ' je Session). ' : 'Keine Session sticht bei der Anzahl heraus, aber ') +
              'Die ersten drei Trades je Session: Ø ' + (aE == null ? '–' : fR(aE)) + '; ab dem vierten: Ø ' + (aL == null ? '–' : fR(aL)) + ' (' + later.length + ' Trades). Kostenschätzung: Verlust der Trades ab Nr. 4 ' + (over.length ? 'in diesen Sessions' : 'je Session') + ', wenn negativ.',
            tipp: 'Feste Höchstzahl je Session festlegen (z. B. 3 Trades) und nach Erreichen das Replay beenden. Die besten Gelegenheiten kommen selten in Serie.' });
        }
      }
    }
    /* 6a · Risiko über Ziel */
    {
      const tgt = (x) => (x.riskTarget > 0 ? x.riskTarget : opts.riskTarget > 0 ? opts.riskTarget : null);
      const el = T.filter((x) => riskOf(x) && tgt(x));
      if (need('risiko-zu-gross', 'Risiko über Plan', el.length, kurz ? 1 : M.risiko, 'Trades mit Risiko-Angabe')) {
        const hits = el.filter((x) => x.risk > opts.riskFactor * tgt(x));
        if (hits.length) {
          let cU = 0, cR = 0;
          for (const x of hits) if (x.pnl < 0) { const part = -x.pnl * (1 - tgt(x) / x.risk); cU += part; cR += part / tgt(x); }
          add({ id: 'risiko-zu-gross', titel: 'Risiko größer als geplant', anteil: hits.length / el.length, kostenR: cR, kostenUsd: cU, tradeIds: ids(hits), handbuch: 'groesse',
            beschreibung: hits.length + ' von ' + el.length + ' Trades mit mehr als dem ' + fN(opts.riskFactor, 2) + '-Fachen deines Ziel-Risikos (Ø ' + fN(avgOf(hits.map((x) => x.risk / tgt(x))), 1) + '-fach). Kostenschätzung: der Teil der Verluste, der über das geplante Risiko hinausging.',
            tipp: 'Größe immer aus Risiko und Stop-Abstand rechnen lassen („Größe nach Risiko“) und das Risiko je Trade fest notieren. Eine einzelne zu große Position kann eine ganze Woche Arbeit kosten.' });
        }
      }
    }
    /* 6b · Schwankende Größe */
    if (!kurz) {
      const el = T.filter((x) => riskOf(x));
      if (need('risiko-schwankt', 'Schwankende Positionsgröße', el.length, M.schwankt, 'Trades mit Risiko-Angabe')) {
        const rs = el.map((x) => x.risk), m = avgOf(rs), sd = Math.sqrt(avgOf(rs.map((v) => (v - m) * (v - m)))), cv = m > 0 ? sd / m : 0;
        if (cv > opts.cvMax) {
          const big = el.filter((x) => x.risk > m), small = el.filter((x) => x.risk <= m);
          add({ id: 'risiko-schwankt', titel: 'Positionsgröße schwankt stark', anteil: 0, kostenR: 0, kostenUsd: 0, tradeIds: ids(big), handbuch: 'groesse', schwere: cv > 0.8 ? 'mittel' : 'gering',
            beschreibung: 'Dein Risiko je Trade schwankt stark (Variationskoeffizient ' + fN(cv, 2) + ', Ø ' + fM(m) + ', Spanne ' + fM(Math.min(...rs)) + ' bis ' + fM(Math.max(...rs)) + '). Trades mit überdurchschnittlichem Risiko: netto ' + fM(sumOf(big.map((x) => x.pnl)), true) + ', die übrigen: ' + fM(sumOf(small.map((x) => x.pnl)), true) + '. Keine Kostenschätzung – schwankende Größe verzerrt aber jede Statistik in $.',
            tipp: 'Ein festes Risiko je Trade (in $ oder % vom Konto) macht Ergebnisse vergleichbar. Größer erst, wenn die Stichprobe es rechtfertigt – nie aus dem Bauch.' });
        }
      }
    }
    /* 7 · Verlierer länger gehalten */
    if (!kurz) {
      const W = T.filter((x) => x.pnl > 0), L = T.filter((x) => x.pnl < 0);
      if (need('verlierer-gehalten', 'Verlierer zu lange gehalten', Math.min(W.length, L.length), M.halten, 'Gewinner und Verlierer')) {
        const hW = avgOf(W.map((x) => x.exitT - x.entryT)), hL = avgOf(L.map((x) => x.exitT - x.entryT));
        if (hW > 0 && hL > opts.holdFactor * hW) {
          const long = L.filter((x) => x.exitT - x.entryT > opts.holdFactor * hW), other = L.filter((x) => !long.includes(x));
          const aO = avgOf(other.map(rOf).filter((r) => r != null));
          let cR = 0, cU = 0; if (aO != null) for (const x of long) { const r = rOf(x); if (r == null) continue; const c = Math.max(0, aO - r); cR += c; cU += usdFromR(x, c); }
          const mm = (s) => Math.max(1, Math.round(s / 60)) + ' min';
          add({ id: 'verlierer-gehalten', titel: 'Verlierer länger gehalten als Gewinner', anteil: long.length / T.length, kostenR: cR, kostenUsd: cU, tradeIds: ids(long), handbuch: 'verlierer-halten',
            beschreibung: 'Verlierer hältst du im Schnitt ' + mm(hL) + ', Gewinner nur ' + mm(hW) + ' (' + fN(hL / hW, 1) + '-fach). ' + long.length + ' Verlierer liefen länger als das ' + fN(opts.holdFactor, 1) + '-Fache der Gewinner-Haltedauer (Ø ' + avgRStr(long) + (aO != null ? ', übrige Verlierer Ø ' + fR(aO) : '') + '). Kostenschätzung: Mehrverlust gegenüber deinen übrigen Verlierern.',
            tipp: 'Zeit-Stop festlegen: Läuft ein Trade nach X Kerzen nicht in deine Richtung, raus. Gewinner bekommen die Zeit, Verlierer nicht.' });
        }
      }
    }
    /* 8 · Schwache Uhrzeit / schwacher Wochentag */
    if (!kurz) {
      const WDN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
      const zeit = (id, titel, list, keyFn, labelFn, tipp) => {
        const el = list.filter((x) => rOf(x) != null);
        if (!need(id, titel, el.length, M.zeit, 'Trades')) return null;
        const g = new Map(); for (const x of el) { const k = keyFn(x); if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
        const bad = [...g.entries()].filter(([k, l]) => l.length >= opts.groupMin && avgOf(l.map(rOf)) < 0);
        if (!bad.length) return null;
        const badSet = new Set(bad.flatMap(([, l]) => l)); const rest = el.filter((x) => !badSet.has(x));
        const aRest = avgOf(rest.map(rOf));
        if (!(rest.length >= opts.groupMin && aRest > 0)) return null;
        bad.sort((a, b) => sumOf(a[1].map(rOf)) - sumOf(b[1].map(rOf)));
        const all = [...badSet], sR = sumOf(all.map(rOf)), sP = sumOf(all.map((x) => x.pnl));
        add({ id, titel, anteil: all.length / el.length, kostenR: Math.max(0, -sR), kostenUsd: Math.max(0, -sP), tradeIds: ids(all), handbuch: 'zeitfenster',
          beschreibung: bad.slice(0, 3).map(([k, l]) => labelFn(k) + ': ' + l.length + ' Trades, Ø ' + fR(avgOf(l.map(rOf)))).join(' · ') + '. Alle übrigen Trades: Ø ' + fR(aRest) + ' (' + rest.length + ' Trades). Kostenschätzung: Verlust in diesen Zeitfenstern.', tipp });
        return true;
      };
      const tz = opts.tz || 'UTC';
      zeit('uhrzeit', 'Schwaches Zeitfenster', T, (x) => C.localParts(x.entryT, tz).h, (h) => 'Einstiege ' + String(h).padStart(2, '0') + ':00–' + String(h).padStart(2, '0') + ':59 Uhr',
        'Prüfe, ob du dieses Zeitfenster meidest oder nur mit A-Setups handelst – aber bestätige das erst mit mehr Trades (Faustregel: mindestens 30 je Zeitfenster).');
      zeit('wochentag', 'Schwacher Wochentag', T.filter((x) => opts.hideWeekdayReplay == null || x.replay !== opts.hideWeekdayReplay), (x) => C.localParts(x.entryT, tz).wd, (d) => WDN[d],
        'Wochentags-Effekte sind oft Zufall oder hängen an Terminen (z. B. Arbeitsmarktdaten am Freitag). Erst mit größerer Stichprobe Regeln daraus machen.');
    }
    /* 9a · Ohne Strategie */
    {
      if (need('ohne-strategie', 'Trades ohne Strategie', T.length, kurz ? 1 : M.setup, 'Trades')) {
        const wo = T.filter((x) => !x.setup), wi = T.filter((x) => x.setup);
        if (wo.length >= (kurz ? 1 : 2)) {
          const sR = sumOf(wo.map((x) => rOf(x) || 0)), sP = sumOf(wo.map((x) => x.pnl));
          add({ id: 'ohne-strategie', titel: 'Trades ohne Strategie', anteil: wo.length / T.length, kostenR: Math.max(0, -sR), kostenUsd: Math.max(0, -sP), tradeIds: ids(wo), handbuch: 'checkliste',
            schwere: wo.length / T.length >= 0.5 ? (sR < 0 ? 'hoch' : 'mittel') : undefined,
            beschreibung: wo.length + ' von ' + T.length + ' Trades (' + fP(wo.length / T.length) + ') ohne zugeordnete Strategie: Ø ' + avgRStr(wo) + (wi.length ? ', mit Strategie Ø ' + avgRStr(wi) : '') + '. Kostenschätzung: Verlust der Trades ohne Strategie, wenn negativ.',
            tipp: 'Jeden Trade einer Strategie zuordnen – sonst lässt sich nicht messen, was funktioniert. Kein passendes Setup? Dann kein Trade.' });
        }
      }
    }
    /* 9b · Regel-Check nicht erfüllt */
    {
      const el = T.filter((x) => x.rulesTotal > 0 || x.rulesOk != null);
      if (need('regeln', 'Regel-Check nicht erfüllt', el.length, kurz ? 1 : M.regeln, 'Trades mit Regel-Check')) {
        const bad = el.filter((x) => x.rulesOk === false), good = el.filter((x) => x.rulesOk === true);
        if (bad.length) {
          const sR = sumOf(bad.map((x) => rOf(x) || 0)), sP = sumOf(bad.map((x) => x.pnl));
          add({ id: 'regeln', titel: 'Eingestiegen ohne alle Regeln', anteil: bad.length / el.length, kostenR: Math.max(0, -sR), kostenUsd: Math.max(0, -sP), tradeIds: ids(bad), handbuch: 'checkliste',
            beschreibung: bad.length + ' von ' + el.length + ' Trades mit Regel-Check wurden platziert, obwohl nicht alle Regeln abgehakt waren: Ø ' + avgRStr(bad) + (good.length ? ' – vollständig abgehakt: Ø ' + avgRStr(good) + ' (' + good.length + ' Trades)' : '') + '. Kostenschätzung: Verlust der unvollständigen Trades, wenn negativ.',
            tipp: 'Kaufen/Verkaufen erst, wenn jede Regel abgehakt ist. Fehlt eine, ist es kein Setup – auch wenn es sich so anfühlt.' });
        }
      }
    }
    /* 10 · Gegen den VWAP */
    {
      const el = T.filter((x) => x.ctx && (x.ctx.vwapSide === 1 || x.ctx.vwapSide === -1) && rOf(x) != null);
      if (need('gegen-vwap', 'Gegen den VWAP', el.length, kurz ? 1 : M.vwap, 'Trades mit Einstiegs-Kontext')) {
        const ag = el.filter((x) => x.side * x.ctx.vwapSide < 0), wi = el.filter((x) => x.side * x.ctx.vwapSide > 0);
        const aA = avgOf(ag.map(rOf)), aW = avgOf(wi.map(rOf)), sA = sumOf(ag.map(rOf));
        if (ag.length >= (kurz ? 1 : 3) && (sA < 0 && (aW == null || aA < aW))) {
          const sP = sumOf(ag.map((x) => x.pnl));
          add({ id: 'gegen-vwap', titel: 'Einstiege gegen den VWAP', anteil: ag.length / el.length, kostenR: Math.max(0, -sA), kostenUsd: Math.max(0, -sP), tradeIds: ids(ag), handbuch: 'vwap-fehler',
            beschreibung: ag.length + ' von ' + el.length + ' Trades gegen den Session-VWAP (Long darunter, Short darüber): Ø ' + fR(aA) + (wi.length ? '; mit dem VWAP: Ø ' + fR(aW) + ' (' + wi.length + ' Trades)' : '') + '. Kostenschätzung: Verlust der Trades gegen den VWAP.',
            tipp: 'Gegen den VWAP nur mit klarem Grund handeln (z. B. Fehlausbruch an einem Level mit Absorption). Sonst gilt: Long über dem VWAP, Short darunter.' });
        }
      }
    }
    /* 12 · News-Trades: Einstieg ≤ 15 Min vor bis ≤ 30 Min nach einem wichtigen US-Termin (ctx.news beim Platzieren) */
    if (!kurz) {
      const isN = (n) => !!n && ((n.minutesTo != null && n.minutesTo <= 15) || (n.minutesSince != null && n.minutesSince <= 30));
      const el = T.filter((x) => x.ctx && x.ctx.news && rOf(x) != null);
      const nw = el.filter((x) => isN(x.ctx.news)), rest = el.filter((x) => !isN(x.ctx.news));
      if (need('news-trades', 'News-Trades', nw.length, M.news, 'Trades rund um Wirtschaftstermine')) {
        const aN = avgOf(nw.map(rOf)), aR = avgOf(rest.map(rOf)), sN = sumOf(nw.map(rOf));
        const vgl = rest.length ? '; übrige Trades: Ø ' + fR(aR) + ' (' + rest.length + ')' : '';
        if (sN < 0 && (aR == null || aN < aR)) {
          const sP = sumOf(nw.map((x) => x.pnl));
          add({ id: 'news-trades', titel: 'Verluste rund um Wirtschaftsdaten', anteil: nw.length / el.length, kostenR: Math.max(0, -sN), kostenUsd: Math.max(0, -sP), tradeIds: ids(nw), handbuch: 'wichtige-zeiten',
            beschreibung: nw.length + ' Trades lagen zwischen 15 Minuten vor und 30 Minuten nach einem wichtigen US-Termin (CPI, Arbeitsmarktbericht, Fed): Ø ' + fR(aN) + vgl + '. Kostenschätzung: Verlust dieser News-Trades.',
            tipp: 'Vor Terminen flach sein oder das Risiko halbieren. Nach der Veröffentlichung die erste Bewegung abwarten (z. B. 15 Minuten) und erst handeln, wenn ein Level hält. Die Vorwarnung im Chart zeigt dir, wann es so weit ist.' });
        } else if (aN > 0 && (aR == null || aN >= aR)) {
          staerken.push({ id: 'news-stark', titel: 'Stark rund um Wirtschaftsdaten', beschreibung: nw.length + ' News-Trades, Ø ' + fR(aN) + vgl + '.', tradeIds: ids(nw) });
        }
      }
    }
    /* 11 · Ziel zu weit */
    if (!kurz) {
      const el = T.filter((x) => x.plannedR > 1 && x.mfeR != null && rOf(x) != null && !x.partials);
      if (need('ziel-zu-weit', 'Ziel zu weit', el.length, M.ziel, 'Trades mit Ziel über 1R')) {
        const missed = el.filter((x) => x.reason !== 'TP' && x.mfeR >= 1 && x.mfeR < x.plannedR - 1e-9);
        const reached = el.filter((x) => x.reason === 'TP');
        let net = 0, cU = 0;
        for (const x of missed) { const g = 0.5 * (1 - x.r); if (g > 0) { net += g; cU += usdFromR(x, g); } }
        for (const x of reached) { const l = 0.5 * Math.max(0, x.r - 1); net -= l; cU -= usdFromR(x, l); }
        const share = missed.length / el.length;
        if (missed.length >= 3 && share >= 0.2 && net > 0) {
          add({ id: 'ziel-zu-weit', titel: 'Ziel oft knapp verfehlt', anteil: share, kostenR: net, kostenUsd: cU, tradeIds: ids(missed), handbuch: 'ziele',
            beschreibung: missed.length + ' von ' + el.length + ' Trades (' + fP(share) + ') liefen mindestens 1R in deine Richtung, erreichten das Ziel (Ø ' + fR(avgOf(missed.map((x) => x.plannedR))) + ') aber nicht. Rechnung: Die Hälfte bei 1R zu schließen hätte netto ' + fR(net) + ' gebracht – die geringeren Gewinne der ' + reached.length + ' Ziel-Treffer sind schon abgezogen.',
            tipp: 'Teilausstieg testen (z. B. 50 % bei 1R, Rest mit Stop auf Einstand) oder das Ziel an das nächste Level legen statt an ein festes Vielfaches. Im Order-Ticket unter „Teilausstieg & Stop-Management“.' });
        }
      }
    }

    /* ---------- Stärken ---------- */
    {
      const grp = (list, fn) => { const g = new Map(); for (const x of list) { const r = rOf(x); if (r == null) continue; const k = fn(x); if (k == null || k === '') continue; if (!g.has(k)) g.set(k, []); g.get(k).push(x); } return [...g.entries()].map(([k, l]) => ({ k, l, a: avgOf(l.map(rOf)), w: l.filter((x) => x.pnl > 0).length })); };
      const best = (arr) => arr.filter((e) => e.l.length >= opts.groupMin && e.a > 0).sort((a, b) => b.a - a.a)[0];
      const s1 = best(grp(T, (x) => x.setup));
      if (s1) staerken.push({ id: 'beste-strategie', titel: 'Beste Strategie: ' + s1.k, beschreibung: s1.l.length + ' Trades, Ø ' + fR(s1.a) + ', Trefferquote ' + fP(s1.w / s1.l.length) + '.', tradeIds: ids(s1.l) });
      if (!kurz) {
        const tz = opts.tz || 'UTC';
        const s2 = best(grp(T, (x) => C.localParts(x.entryT, tz).h));
        if (s2) staerken.push({ id: 'beste-uhrzeit', titel: 'Bestes Zeitfenster: ' + String(s2.k).padStart(2, '0') + ':00–' + String(s2.k).padStart(2, '0') + ':59 Uhr', beschreibung: s2.l.length + ' Trades, Ø ' + fR(s2.a) + '.', tradeIds: ids(s2.l) });
      }
      const cond = [];
      const vw = T.filter((x) => x.ctx && x.side * x.ctx.vwapSide > 0 && rOf(x) != null);
      if (vw.length >= opts.groupMin && avgOf(vw.map(rOf)) > 0) cond.push({ id: 'mit-vwap', titel: 'Mit dem VWAP gehandelt', l: vw });
      const ok = T.filter((x) => x.rulesOk === true && rOf(x) != null);
      if (ok.length >= opts.groupMin && avgOf(ok.map(rOf)) > 0) cond.push({ id: 'regeln-ok', titel: 'Alle Regeln abgehakt', l: ok });
      cond.sort((a, b) => avgOf(b.l.map(rOf)) - avgOf(a.l.map(rOf)));
      if (cond[0]) staerken.push({ id: cond[0].id, titel: 'Beste Bedingung: ' + cond[0].titel, beschreibung: cond[0].l.length + ' Trades, Ø ' + fR(avgOf(cond[0].l.map(rOf))) + '.', tradeIds: ids(cond[0].l) });
      const slEl = T.filter((x) => x.sl != null && x.slFinal != null);
      if (!kurz && slEl.length >= 10 && !befunde.some((f) => f.id === 'sl-vergroessert')) staerken.push({ id: 'stop-disziplin', titel: 'Stop-Disziplin', beschreibung: 'In ' + slEl.length + ' Trades nie den Stop vergrößert.', tradeIds: [] });
    }
    const rank = { hoch: 0, mittel: 1, gering: 2 };
    befunde.sort((a, b) => b.kostenUsd - a.kostenUsd || b.kostenR - a.kostenR || rank[a.schwere] - rank[b.schwere] || b.anzahl - a.anzahl);
    return {
      n: T.length, sessions: groups.size, befunde, staerken, zuWenig,
      kostenUsd: +sumOf(befunde.map((f) => f.kostenUsd)).toFixed(2), kostenR: +sumOf(befunde.map((f) => f.kostenR)).toFixed(4)
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.Core = C;
})(typeof self !== 'undefined' ? self : this);
