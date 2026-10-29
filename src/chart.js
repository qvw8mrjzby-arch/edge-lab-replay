/* Edge Lab Replay — Canvas-Chart (Kerzen, Footprint, VWAP, Profile, Orders, Positions-Werkzeug, Zeichnungen) */
'use strict';
const COL = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  ['bg', 'panel', 'panel2', 'line', 'grid', 'text', 'muted', 'faint', 'bull', 'bear', 'buy', 'sell', 'vwap', 'band', 'accent', 'info', 'warn', 'ema1', 'ema2', 'ema3', 'ema4', 'poc', 'va', 'sessA', 'sessL', 'sessN', 'draw', 'sel', 'rth'].forEach((k) => { COL[k] = cs.getPropertyValue('--' + k).trim() || '#888'; });
}
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const FONT_UI = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
function alpha(hex, a) {
  if (!hex || hex[0] !== '#') return hex;
  let h = hex.slice(1); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function fmtVol(v) {
  const a = Math.abs(v);
  const de = (x, d) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return de(v / 1e9, 2) + ' Mrd';
  if (a >= 1e6) return de(v / 1e6, 2) + ' Mio';
  if (a >= 1e4) return de(v / 1e3, 1) + 'k';
  if (a >= 100) return String(Math.round(v));
  if (Number.isInteger(v)) return String(v);
  if (a >= 10) return de(v, 1);
  if (a >= 1) return de(v, 2);
  if (a === 0) return '0';
  return de(v, 3);
}
const RIGHT_PAD_BARS = 8;
const MIN_BAR_W = 0.2;
/* Session-Flags je Kerzenzeit – ohne Date-Objekte, mit Cache (heißer Pfad beim Zeichnen) */
const SESS_FLAGS = new Map();
function localMinute(t, tz) {
  const lt = t + Core.tzOffset(t, tz) * 60;
  const day = Math.floor(lt / 86400);
  return { min: Math.floor((lt - day * 86400) / 60), wd: ((day + 4) % 7 + 7) % 7 };
}
function sessionFlagBits(t) {
  let v = SESS_FLAGS.get(t);
  if (v !== undefined) return v;
  const tk = localMinute(t, 'Asia/Tokyo'), ld = localMinute(t, 'Europe/London'), ny = localMinute(t, 'America/New_York');
  const wk = (p) => p.wd >= 1 && p.wd <= 5;
  /* Tokio schließt seit 5.11.2024 um 15:30 */
  const tkEnd = t >= 1730764800 ? 930 : 900;
  v = (wk(tk) && tk.min >= 540 && tk.min < tkEnd ? 1 : 0) | (wk(ld) && ld.min >= 480 && ld.min < 990 ? 2 : 0) | (wk(ny) && ny.min >= 570 && ny.min < 960 ? 4 : 0);
  if (SESS_FLAGS.size > 400000) SESS_FLAGS.clear();
  SESS_FLAGS.set(t, v);
  return v;
}
/* Textbreiten-Cache je Schrift */
const TW = new Map();
function textW(ctx, s) {
  const k = ctx.font + '|' + s;
  let w = TW.get(k);
  if (w === undefined) { w = ctx.measureText(s).width; if (TW.size > 4000) TW.clear(); TW.set(k, w); }
  return w;
}

class Chart {
  constructor(app, host, slot) {
    this.app = app; this.slot = slot;
    this.el = document.createElement('div');
    this.el.className = 'chart';
    this.el.innerHTML =
      '<div class="chart-head"><select class="tf-sel" aria-label="Timeframe"></select>' +
      '<span class="chart-title"></span><span class="chart-badges"></span>' +
      '<span class="chart-btns"><button class="ib" data-z="out" title="Herauszoomen" aria-label="Herauszoomen">−</button>' +
      '<button class="ib" data-z="in" title="Hineinzoomen" aria-label="Hineinzoomen">+</button>' +
      '<button class="ib" data-z="fit" title="Zur letzten Kerze springen" aria-label="Zur letzten Kerze">⇥</button>' +
      '<button class="ib" data-z="fs" title="Vollbild (G)" aria-label="Vollbild"><svg viewBox="0 0 16 16"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg></button></span></div>' +
      '<div class="cv-wrap"><canvas tabindex="0" aria-label="Chart"></canvas><canvas class="ov" aria-hidden="true"></canvas>' +
      '<div class="econ-warn" hidden role="status"></div><div class="chart-load" hidden><div class="cl-box"><span class="cl-txt">Lade Daten …</span><div class="dl-prog"><i></i></div></div></div></div>' +
      '<div class="pos-confirm" hidden><span class="pc-txt num"></span><button class="btn sm primary" data-pc="ok">Platzieren<kbd>Enter</kbd></button><button class="btn sm" data-pc="no">Abbrechen</button></div>';
    host.appendChild(this.el);
    this.cv = this.el.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    /* Overlay-Ebene: Fadenkreuz, Hover-Preis/-Zeit, Legende – Mausbewegung zeichnet nur diese neu */
    this.ov = this.el.querySelector('canvas.ov');
    this.octx = this.ov.getContext('2d');
    this.loadEl = this.el.querySelector('.chart-load');
    this.sel = this.el.querySelector('.tf-sel');
    this.title = this.el.querySelector('.chart-title');
    this.badges = this.el.querySelector('.chart-badges');
    this.confirmEl = this.el.querySelector('.pos-confirm');
    this.econEl = this.el.querySelector('.econ-warn');
    this.tf = app.settings.charts[slot].tf;
    this.view = { rightIdx: null, barW: 9, auto: true, yMin: 0, yMax: 1 };
    this.lastN = 0;
    this.hover = null;
    this.mode = null;
    this.pointers = new Map();
    this.W = 300; this.H = 200;
    this.fillTfSelect();
    this.sel.addEventListener('change', () => { this.setTf(+this.sel.value); });
    this.el.querySelector('.chart-btns').addEventListener('click', (e) => {
      const z = e.target.closest('button'); if (!z) return;
      app.setActiveChart(this);
      if (z.dataset.z === 'in') this.zoomAt(this.plotW() * 0.7, 1.3);
      else if (z.dataset.z === 'out') this.zoomAt(this.plotW() * 0.7, 1 / 1.3);
      else if (z.dataset.z === 'fs') { app.setFullscreen(); return; }
      else { this.view.rightIdx = null; this.view.auto = true; }
      app.requestRender();
    });
    this.confirmEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pc]'); if (!b) return;
      if (b.dataset.pc === 'ok') app.confirmPosDraft(); else app.cancelPosDraft();
    });
    this.bindEvents();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.cv);
    this.resize();
  }
  destroy() { this.ro.disconnect(); this.el.remove(); }
  fillTfSelect() {
    const A = this.app, bt = A.baseTf || 60;
    this.sel.innerHTML = Core.TFS.filter((t) => t.s >= bt && t.s % bt === 0).map((t) => '<option value="' + t.s + '">' + t.l + '</option>').join('');
    if (!Core.TFS.some((t) => t.s === this.tf && t.s >= bt && t.s % bt === 0)) this.tf = Math.max(bt, Core.TFS.find((t) => t.s >= bt).s);
    this.sel.value = String(this.tf);
  }
  setTf(tf) {
    this.tf = tf; this.app.settings.charts[this.slot].tf = tf; this.app.saveSettings();
    this.view.rightIdx = null; this.view.auto = true; this.lastN = 0;
    this.sel.value = String(tf);
    this.app.requestRender();
  }
  resetView() { this.view.rightIdx = null; this.view.auto = true; this.view.barW = 9; this.lastN = 0; this.fillTfSelect(); }
  axisW() { return 70; }
  plotW() { return Math.max(10, this.W - this.axisW()); }
  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(50, Math.floor(r.width)); this.H = Math.max(50, Math.floor(r.height));
    const cw = Math.floor(this.W * dpr), ch = Math.floor(this.H * dpr);
    if (this.cv.width !== cw || this.cv.height !== ch) { this.cv.width = cw; this.cv.height = ch; this.ov.width = cw; this.ov.height = ch; }
    this.dpr = dpr;
    this.app.requestRender();
  }
  /* Ladeanzeige direkt im Chart (p = 0..1 oder null = unbestimmt) */
  setLoading(txt, p) {
    const el = this.loadEl; if (!el) return;
    if (txt == null) { el.hidden = true; return; }
    el.hidden = false;
    el.querySelector('.cl-txt').textContent = txt;
    const bar = el.querySelector('.dl-prog i');
    bar.parentElement.classList.toggle('indet', p == null);
    if (p != null) bar.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(0) + '%';
  }
  /* Foto des Charts als JPEG-Blob (ohne Fadenkreuz, mit Legende der letzten Kerze) */
  snapshot(maxW, q) {
    return new Promise((res) => {
      try {
        const hv = this.hover, ht = this.app.hoverT;
        this.hover = null; this.app.hoverT = null;
        this.render();
        this.hover = hv; this.app.hoverT = ht;
        const w = Math.min(maxW || 1400, this.cv.width), h = Math.round(this.cv.height * w / this.cv.width);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = COL.bg; x.fillRect(0, 0, w, h); x.drawImage(this.cv, 0, 0, w, h); x.drawImage(this.ov, 0, 0, w, h);
        this.renderOverlay();
        if (c.toBlob) c.toBlob((b) => res(b ? Object.assign(b, { w, h }) : null), 'image/jpeg', q || 0.7); else res(null);
      } catch (e) { res(null); }
    });
  }

  /* ---------- Modell ---------- */
  model() {
    const A = this.app;
    if (!A.base || !A.base.length) return null;
    const agg = A.getAgg(this.tf);
    const cur = A.cursor;
    const k = agg.map[cur];
    const last = Core.partialBar(A.base, agg.bars[k], cur);
    return {
      agg, k, n: k + 1, last,
      bar: (i) => (i === k ? last : agg.bars[i]),
      baseIdx: (i) => (i === k ? cur : agg.bars[i].i1)
    };
  }
  layout() {
    const axisW = this.axisW(), axisH = 22;
    const lowerOn = this.app.settings.ind.lower !== 'none';
    const avail = this.H - axisH;
    const lowerH = lowerOn ? Math.max(40, Math.round(avail * 0.18)) : 0;
    this.plot = { x: 0, y: 0, w: this.W - axisW, h: avail - lowerH - (lowerOn ? 6 : 0) };
    this.lower = lowerOn ? { x: 0, y: this.plot.h + 6, w: this.W - axisW, h: lowerH } : null;
    this.axisX = this.W - axisW; this.timeY = avail;
  }
  xOf(i) { return this.plot.w - (this.view.rightIdx - i + 0.5) * this.view.barW; }
  idxAt(x) { return Math.round(this.view.rightIdx + 0.5 - (this.plot.w - x) / this.view.barW - 0.5); }
  yOf(p) { const v = this.view; return this.plot.y + (v.yMax - p) / (v.yMax - v.yMin) * this.plot.h; }
  priceAt(y) { const v = this.view; return v.yMax - (y - this.plot.y) / this.plot.h * (v.yMax - v.yMin); }
  xOfTime(t) {
    const m = this.m; if (!m) return null;
    const bars = m.agg.bars, n = m.n;
    let lo = 0, hi = n - 1;
    if (t < bars[0].t) return this.xOf((t - bars[0].t) / this.tf);
    if (t >= bars[n - 1].t) return this.xOf(n - 1 + (t - bars[n - 1].t) / this.tf);
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid].t <= t) lo = mid; else hi = mid - 1; }
    const frac = Math.min(1, (t - bars[lo].t) / this.tf);
    return this.xOf(lo + frac);
  }
  timeAtX(x) {
    const m = this.m; if (!m) return null;
    const f = this.view.rightIdx + 0.5 - (this.plot.w - x) / this.view.barW - 0.5;
    const i = Math.floor(f), fr = f - i;
    if (i < 0) return m.agg.bars[0].t + f * this.tf;
    if (i >= m.n) return m.agg.bars[m.n - 1].t + (f - (m.n - 1)) * this.tf;
    return m.bar(i).t + fr * this.tf;
  }
  zoomAt(x, f) {
    const v = this.view;
    if (v.rightIdx == null) return;
    const idx = v.rightIdx + 0.5 - (this.plot.w - x) / v.barW;
    v.barW = Math.max(MIN_BAR_W, Math.min(220, v.barW * f));
    v.rightIdx = idx - 0.5 + (this.plot.w - x) / v.barW;
  }
  /* rechter Leerraum: ca. 8 Kerzen bzw. 12 % (Profil verdeckt sonst die neuesten Kerzen) */
  rightPad() { const vis = this.plot.w / this.view.barW; return Math.min(vis * 0.4, Math.max(RIGHT_PAD_BARS, vis * 0.12)); }

  /* ---------- Zeichnen ---------- */
  render() {
    const ctx = this.ctx, A = this.app, S = A.settings;
    if (!this.W || this.cv.width === 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, this.W, this.H);
    this.layout();
    const m = this.model(); this.m = m;
    this.title.textContent = A.symbol ? A.symbol + ' · ' + Core.tfLabel(this.tf) : '';
    this.tags = [];
    if (this.legendW == null) this.legendW = Math.min(this.W - 80, 520);
    if (!m || A.hideData) { if (this._ew) { this._ew = ''; this.econEl.hidden = true; } if (!m) { ctx.fillStyle = COL.muted; ctx.font = '13px ' + FONT_UI; ctx.fillText('Keine Daten geladen', 16, 30); } this.m = null; this.renderOverlay(); return; }
    const v = this.view;
    if (v.rightIdx == null) v.rightIdx = m.n - 1 + this.rightPad();
    else if (this.lastN && m.n !== this.lastN && v.rightIdx >= this.lastN - 1.5) v.rightIdx += m.n - this.lastN;
    this.lastN = m.n;
    let i0 = Math.max(0, Math.floor(v.rightIdx - this.plot.w / v.barW)), i1 = Math.min(m.n - 1, Math.ceil(v.rightIdx));
    if (i0 > i1) { v.rightIdx = Math.min(v.rightIdx, m.n - 1 + this.rightPad()); i0 = Math.max(0, Math.min(m.n - 1, Math.floor(v.rightIdx - this.plot.w / v.barW))); i1 = Math.max(i0, Math.min(m.n - 1, Math.ceil(v.rightIdx))); }
    this.vis = [i0, i1];
    const tick = A.tick;
    this.fpMode = !!(S.ind.fp && A.trades && v.barW >= 56);
    const volOn = S.ind.volume && !this.fpMode;
    if (v.auto && i1 >= i0) {
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i <= i1; i++) { const b = m.bar(i); if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
      if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
      /* Mindestspanne – auch relativ zum Preis, damit Gitter-Schleifen immer vorankommen */
      const minSpan = Math.max(tick * 4, Math.abs(hi) * 1e-9);
      if (hi - lo < minSpan) { hi += minSpan / 2; lo -= minSpan / 2; }
      const r = hi - lo;
      v.yMax = hi + r * 0.07;
      v.yMin = volOn ? lo - r * 0.3 : lo - r * (this.fpMode ? 0.12 : 0.07);
    }
    const P = this.plot;
    const dm = this.mode;
    if (dm && dm.type === 'order' && dm.edge) {
      const sh = (v.yMax - v.yMin) * 0.012 * dm.edge;
      v.yMin += sh; v.yMax += sh;
      this.dragTo(dm);
      this.app.requestRender();
    }
    ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
    this.drawGrid(P);
    if (S.ind.sessions && this.tf <= 1800) this.drawSessions(m, i0, i1, P);
    let vpInfo = null;
    if (S.ind.vp) vpInfo = this.drawProfile(m, i0, i1, P);
    if (volOn) this.drawVolume(m, i0, i1, P);
    if (S.ind.vwap && this.tf < 86400) this.drawVwap(m, i0, i1, P, true);
    this.drawPosZones(m, P);
    this.drawBars(m, i0, i1, P);
    if (S.ind.vwap && this.tf < 86400) this.drawVwap(m, i0, i1, P, false);
    this.drawEmas(m, i0, i1, P);
    if (A.avwap) this.drawAvwap(m, i0, i1, P);
    this.levelLabels = [];
    this.layoutOrderLines(P);
    if (S.ind.prev) this.drawPrevLevels(m, P);
    if (S.ind.rth && this.tf <= 3600) this.drawRth(m, P);
    this.flushLevelLabels(P);
    this.drawDrawings(P);
    this.drawTradeMarks(m, P);
    this.drawEcon(m, i0, i1, P);
    ctx.restore();
    this.drawOrderLines(P);
    if (this.lower) this.drawLower(m, i0, i1);
    this.drawPriceAxis(m, P, vpInfo);
    this.drawTimeAxis(m, i0, i1);
    if (A.replay.picking) {
      ctx.fillStyle = alpha(COL.accent, 0.14); ctx.fillRect(0, 0, P.w, 28);
      ctx.fillStyle = COL.accent; ctx.font = '600 12.5px ' + FONT_UI;
      ctx.fillText(A.isMobile && A.isMobile() ? 'Tippe auf die Startkerze' : 'Klicke auf die Kerze, ab der das Replay startet', 10, 18);
    }
    this.updateBadges(m);
    this.updateConfirm();
    this.renderOverlay();
  }
  /* Nur die Overlay-Ebene: Fadenkreuz, Hover-Preis/-Zeit, Legende. Billig – läuft bei jeder Mausbewegung. */
  renderOverlay() {
    const o = this.octx, m = this.m;
    if (!o || !this.ov.width) return;
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, this.ov.width, this.ov.height);
    if (!m || !this.plot) return;
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const main = this.ctx; this.ctx = o;
    try {
      this.drawCrosshair(m, this.plot);
      this.drawHoverTags(m, this.plot);
      this.drawLegend(m, this.plot);
    } finally { this.ctx = main; }
  }
  drawHoverTags(m, P) {
    const ctx = this.ctx, A = this.app;
    if (!this.hover) return;
    ctx.font = '11px ' + FONT_MONO;
    if (this.hover.y < P.h) {
      const y = Math.max(8, Math.min(P.h - 8, this.hover.y));
      ctx.fillStyle = COL.text; ctx.fillRect(this.axisX + 1, y - 8, this.W - this.axisX - 1, 16);
      ctx.fillStyle = COL.bg; ctx.textBaseline = 'middle'; ctx.fillText(A.fmtP(this.priceAt(this.hover.y)), this.axisX + 6, y); ctx.textBaseline = 'alphabetic';
    }
    const idx = this.idxAt(this.hover.x);
    if (idx >= 0 && idx < m.n) {
      const s = A.fmtT(m.bar(idx).t, this.tf);
      ctx.textAlign = 'center';
      const w = textW(ctx, s) + 12, x = Math.max(w / 2, Math.min(this.axisX - w / 2, this.xOf(idx)));
      ctx.fillStyle = COL.text; ctx.fillRect(x - w / 2, this.timeY + 2, w, 18);
      ctx.fillStyle = COL.bg; ctx.fillText(s, x, this.timeY + 15);
      ctx.textAlign = 'left';
    }
  }
  updateBadges(m) {
    const A = this.app, b = [];
    if (A.baseEst) b.push('<span class="badge warn" title="Kein Taker-Volumen in den Daten: Delta wird aus der Kerzenform geschätzt">Δ geschätzt</span>');
    else b.push('<span class="badge ok" title="Delta aus echtem Kauf-/Verkaufs-Aggressor-Volumen">Δ echt</span>');
    if (A.settings.ind.fp && A.trades && this.view.barW < 56) b.push('<span class="badge" title="Hineinzoomen, um den Footprint zu sehen">Footprint: zoomen</span>');
    const html = b.join('');
    if (html !== this._bh) { this.badges.innerHTML = html; this._bh = html; }
  }
  /* Wirtschaftstermine: gestrichelte Linie nur für Termine, die schon passiert sind (≤ jetzt); Vorwarnung als Banner.
     Blind-Modus: kein Kürzel, nur generischer Hinweis. */
  drawEcon(m, i0, i1, P) {
    const A = this.app, on = A.settings.ind.econ && A.econOn() && this.tf < 86400;
    let warn = null;
    if (!on) this.econLabs = [];
    if (on) {
      const now = A.econNow(), blind = A.isBlind();
      const t0 = m.bar(i0).t, t1 = Math.min(now, m.bar(i1).t + this.tf);
      const ctx = this.ctx, c = COL.warn;
      let lastT = null; this.econLabs = [];
      ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.font = '600 10px ' + FONT_MONO;
      for (const e of Econ.between(t0, t1)) {
        const x = Math.round(this.xOfTime(e.t)) + 0.5;
        if (x < -2 || x > P.w + 2) continue;
        if (e.t !== lastT) { ctx.strokeStyle = alpha(c, 0.7); ctx.beginPath(); ctx.moveTo(x, P.y + 38); ctx.lineTo(x, P.y + P.h); ctx.stroke(); }
        const lab = blind ? 'Termin' : Econ.KINDS[e.kind].abbr, w = textW(ctx, lab) + 8, k = e.t === lastT ? 1 : 0;
        ctx.fillStyle = alpha(c, 0.18); ctx.fillRect(x - w / 2, P.y + 24 + k * 15, w, 14);
        ctx.fillStyle = c; ctx.textAlign = 'center'; ctx.fillText(lab, x, P.y + 34.5 + k * 15); ctx.textAlign = 'left';
        lastT = e.t; this.econLabs.push(lab);
      }
      ctx.restore();
      warn = Econ.warning(now, blind);
    }
    const txt = warn ? warn.text : '';
    if (txt !== this._ew) { this._ew = txt; this.econEl.textContent = txt; this.econEl.hidden = !txt; }
  }
  drawGrid(P) {
    const ctx = this.ctx, v = this.view;
    const step = Core.niceStep((v.yMax - v.yMin) / Math.max(2, P.h / 60));
    this.yStep = step;
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1; ctx.beginPath();
    const p0 = Math.ceil(v.yMin / step) * step;
    for (let k = 0; k < 200; k++) { const p = p0 + k * step; if (!(p <= v.yMax)) break; const y = Math.round(this.yOf(p)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(P.w, y); }
    ctx.stroke();
  }
  sessionFlags(t) {
    const v = sessionFlagBits(t);
    return { A: !!(v & 1), L: !!(v & 2), N: !!(v & 4) };
  }
  drawSessions(m, i0, i1, P) {
    const ctx = this.ctx, bw = this.view.barW;
    const runs = [null, null, null];
    const colors = [COL.sessA, COL.sessL, COL.sessN], names = ['Asien', 'London', 'New York'];
    const legendY = 22;
    ctx.font = '10.5px ' + FONT_UI;
    const flush = (k, endX) => {
      const r = runs[k]; if (r == null) return;
      ctx.fillStyle = alpha(colors[k], 0.05); ctx.fillRect(r, 0, endX - r, P.h);
      ctx.fillStyle = alpha(colors[k], 0.55); ctx.fillRect(r, 0, endX - r, 2);
      /* Name links an den sichtbaren Bereich klemmen, unter der Legende */
      const lx = Math.max(4, r + 4);
      const w = textW(ctx, names[k]);
      if (P.w >= 520 && endX - lx > w + 6) { ctx.fillStyle = alpha(colors[k], 0.8); ctx.fillText(names[k], lx, legendY + 14 + k * 12); }
      runs[k] = null;
    };
    for (let i = i0; i <= i1; i++) {
      const f = sessionFlagBits(m.bar(i).t);
      const x = this.xOf(i) - bw / 2;
      for (let k = 0; k < 3; k++) {
        const on = f & (1 << k);
        if (on && runs[k] == null) runs[k] = x;
        else if (!on && runs[k] != null) flush(k, x);
      }
    }
    const xe = this.xOf(i1) + bw / 2;
    for (let k = 0; k < 3; k++) flush(k, xe);
  }
  /* Kerzen: ein Pfad je Farbe (Dochte + Körper). Unter 1 px je Kerze werden Kerzen je Pixelspalte zusammengefasst. */
  drawBars(m, i0, i1, P) {
    const ctx = this.ctx, A = this.app, bw = this.view.barW;
    const fpOn = A.settings.ind.fp && A.trades && bw >= 56;
    const body = Math.max(1, Math.min(bw * 0.72, bw - 1));
    const v = this.view, sc = P.h / (v.yMax - v.yMin), y0 = P.y + v.yMax * sc;
    const Y = (p) => y0 - p * sc;
    const wU = new Path2D(), wD = new Path2D(), bU = new Path2D(), bD = new Path2D();
    let partial = null;
    if (bw < 1.5 && !fpOn) {
      /* dichte Ansicht: je Pixelspalte Hoch/Tief, Farbe aus erstem Open und letztem Close */
      let col = null, hi = 0, lo = 0, op = 0, cl = 0;
      const flush = () => {
        if (col == null) return;
        const up = cl >= op, path = up ? wU : wD;
        const yh = Y(hi), yl = Y(lo);
        path.rect(col, yh, 1, Math.max(1, yl - yh));
      };
      for (let i = i0; i <= i1; i++) {
        const b = m.bar(i);
        const c = Math.floor(this.xOf(i));
        if (c !== col) { flush(); col = c; hi = b.h; lo = b.l; op = b.o; cl = b.c; }
        else { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; cl = b.c; }
      }
      flush();
      ctx.fillStyle = COL.bull; ctx.fill(wU);
      ctx.fillStyle = COL.bear; ctx.fill(wD);
      return;
    }
    const half = body / 2, rb = Math.round(body), thin = body <= 2;
    for (let i = i0; i <= i1; i++) {
      const b = m.bar(i);
      const x = this.xOf(i);
      if (fpOn && this.drawFootprint(m, i, b, x, P)) continue;
      const up = b.c >= b.o;
      const yo = Y(b.o), yc = Y(b.c), yh = Y(b.h), yl = Y(b.l);
      const xw = Math.round(x) + 0.5;
      const w = up ? wU : wD;
      w.moveTo(xw, yh); w.lineTo(xw, yl);
      const top = yo < yc ? yo : yc, h = Math.abs(yc - yo);
      const bp = up ? bU : bD;
      if (thin) bp.rect(Math.round(x - half), top, Math.max(1, body), Math.max(1, h));
      else bp.rect(Math.round(x - half), Math.round(top), rb, Math.max(1, Math.round(h)));
      if (b.partial) partial = { x, yh, yl };
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = COL.bull; ctx.stroke(wU); ctx.fillStyle = COL.bull; ctx.fill(bU);
    ctx.strokeStyle = COL.bear; ctx.stroke(wD); ctx.fillStyle = COL.bear; ctx.fill(bD);
    if (partial) { const { x, yh, yl } = partial; ctx.strokeStyle = alpha(COL.text, 0.5); ctx.setLineDash([2, 2]); ctx.strokeRect(Math.round(x - half) - 1.5, Math.round(yh) - 1.5, rb + 3, Math.round(yl - yh) + 3); ctx.setLineDash([]); }
  }
  drawFootprint(m, i, b, x, P) {
    const A = this.app, ctx = this.ctx, bw = this.view.barW;
    const bi = m.baseIdx(i);
    const rng = A.tradeRange(b.i0, bi);
    if (!rng) return false;
    const pxPerPrice = P.h / (this.view.yMax - this.view.yMin);
    const row = A.fpRow(pxPerPrice);
    const fp = A.footprintFor(rng[0], rng[1], row);
    if (!fp) return false;
    const imb = Core.imbalances(fp, A.settings.fp.ratio, A.settings.fp.minVol);
    const w = bw * 0.9, left = x - w / 2;
    const rowPx = row * pxPerPrice;
    const textOk = rowPx >= 10.5 && w >= 64;
    const up = b.c >= b.o;
    const cx = left + 3;
    ctx.strokeStyle = up ? COL.bull : COL.bear; ctx.fillStyle = up ? COL.bull : COL.bear;
    ctx.beginPath(); ctx.moveTo(cx + 0.5, this.yOf(b.h)); ctx.lineTo(cx + 0.5, this.yOf(b.l)); ctx.stroke();
    ctx.fillRect(cx - 1.5, Math.min(this.yOf(b.o), this.yOf(b.c)), 4, Math.max(1, Math.abs(this.yOf(b.c) - this.yOf(b.o))));
    const cl = left + 9, cw = w - 10;
    const fs = Math.max(8, Math.min(12, rowPx * 0.72));
    ctx.font = fs + 'px ' + FONT_MONO;
    ctx.textBaseline = 'middle';
    for (const [k, c] of fp.levels) {
      const yT = this.yOf((k + 1) * row), yB = this.yOf(k * row);
      if (yB < -20 || yT > P.h + 20) continue;
      const tot = c[0] + c[1];
      const inten = fp.maxV > 0 ? tot / fp.maxV : 0;
      const dom = c[1] >= c[0] ? COL.bull : COL.bear;
      ctx.fillStyle = alpha(dom, 0.08 + inten * 0.42);
      ctx.fillRect(cl, yT + 0.5, cw, Math.max(1, yB - yT - 1));
      if (k === fp.pocK) { ctx.strokeStyle = COL.poc; ctx.lineWidth = 1; ctx.strokeRect(cl + 0.5, yT + 0.5, cw - 1, Math.max(1, yB - yT - 1)); }
      if (textOk) {
        const im = imb.get(k);
        const ym = (yT + yB) / 2;
        ctx.textAlign = 'right';
        ctx.fillStyle = im && im.sell ? COL.bear : alpha(COL.text, 0.82);
        ctx.font = (im && im.sell ? '700 ' : '') + fs + 'px ' + FONT_MONO;
        ctx.fillText(fmtVol(c[0]), cl + cw / 2 - 4, ym);
        ctx.textAlign = 'left';
        ctx.fillStyle = im && im.buy ? COL.bull : alpha(COL.text, 0.82);
        ctx.font = (im && im.buy ? '700 ' : '') + fs + 'px ' + FONT_MONO;
        ctx.fillText(fmtVol(c[1]), cl + cw / 2 + 4, ym);
        ctx.fillStyle = alpha(COL.muted, 0.6); ctx.textAlign = 'center'; ctx.font = fs + 'px ' + FONT_MONO;
        ctx.fillText('×', cl + cw / 2, ym);
      }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const yl = this.yOf(b.l);
    ctx.font = '600 11px ' + FONT_MONO;
    ctx.fillStyle = fp.delta >= 0 ? COL.bull : COL.bear;
    ctx.fillText('Δ ' + (fp.delta >= 0 ? '+' : '') + fmtVol(fp.delta), x, yl + 15);
    ctx.fillStyle = COL.muted; ctx.font = '10.5px ' + FONT_MONO;
    ctx.fillText('V ' + fmtVol(fp.buy + fp.sell), x, yl + 28);
    ctx.textAlign = 'left';
    return true;
  }
  drawVolume(m, i0, i1, P) {
    const ctx = this.ctx, bw = this.view.barW;
    let mx = 0;
    for (let i = i0; i <= i1; i++) mx = Math.max(mx, m.bar(i).v);
    if (mx <= 0) return;
    const h = P.h * 0.18, base = P.h;
    const w = Math.max(1, Math.min(bw * 0.72, bw - 1));
    const pu = new Path2D(), pd = new Path2D();
    if (bw < 1.5) {
      /* je Pixelspalte die größte Kerze */
      let col = null, vv = 0, up = true;
      const flush = () => { if (col != null && vv > 0) (up ? pu : pd).rect(col, base - vv / mx * h, 1, vv / mx * h); };
      for (let i = i0; i <= i1; i++) {
        const b = m.bar(i), c = Math.floor(this.xOf(i));
        if (c !== col) { flush(); col = c; vv = b.v; up = b.c >= b.o; } else if (b.v > vv) { vv = b.v; up = b.c >= b.o; }
      }
      flush();
    } else {
      const rw = Math.max(1, Math.round(w));
      for (let i = i0; i <= i1; i++) {
        const b = m.bar(i), x = this.xOf(i);
        const hh = b.v / mx * h;
        (b.c >= b.o ? pu : pd).rect(Math.round(x - w / 2), base - hh, rw, hh);
      }
    }
    ctx.fillStyle = alpha(COL.bull, 0.3); ctx.fill(pu);
    ctx.fillStyle = alpha(COL.bear, 0.3); ctx.fill(pd);
  }
  drawEmas(m, i0, i1, P) {
    const A = this.app, ctx = this.ctx;
    const cols = [COL.ema1, COL.ema2, COL.ema3, COL.ema4];
    A.settings.emas.forEach((e, j) => {
      if (!e.on || !(e.p > 0)) return;
      const arr = A.getEma(this.tf, e.p);
      ctx.strokeStyle = cols[j % 4]; ctx.lineWidth = 1.4; ctx.beginPath();
      let started = false;
      for (let i = i0; i <= i1; i++) {
        const val = i < m.k ? arr[i] : (m.k > 0 ? Core.emaNext(arr[m.k - 1], m.last.c, e.p) : NaN);
        if (!isFinite(val)) { started = false; continue; }
        const x = this.xOf(i), y = this.yOf(val);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
  drawVwap(m, i0, i1, P, bandsPass) {
    const A = this.app, ctx = this.ctx, s = A.series;
    const mults = A.settings.vwapBands.filter((x) => x > 0);
    const seg = (fn) => {
      ctx.beginPath(); let started = false, prevS = -1;
      for (let i = i0; i <= i1; i++) {
        const bi = m.baseIdx(i); const si = s.sessIdx[bi];
        const val = fn(bi); const x = this.xOf(i), y = this.yOf(val);
        if (!started || si !== prevS) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        prevS = si;
      }
      ctx.stroke();
    };
    if (bandsPass) {
      if (!A.settings.ind.bands || !mults.length) return;
      const k = mults[0];
      ctx.fillStyle = alpha(COL.band, 0.06);
      let runStart = i0;
      const fillRun = (a, b) => {
        if (b < a) return;
        ctx.beginPath();
        for (let i = a; i <= b; i++) { const bi = m.baseIdx(i); ctx.lineTo(this.xOf(i), this.yOf(s.vwap[bi] + k * s.sd[bi])); }
        for (let i = b; i >= a; i--) { const bi = m.baseIdx(i); ctx.lineTo(this.xOf(i), this.yOf(s.vwap[bi] - k * s.sd[bi])); }
        ctx.closePath(); ctx.fill();
      };
      for (let i = i0 + 1; i <= i1 + 1; i++) {
        if (i > i1 || s.sessIdx[m.baseIdx(i)] !== s.sessIdx[m.baseIdx(i - 1)]) { fillRun(runStart, i - 1); runStart = i; }
      }
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      mults.forEach((mu, j) => {
        ctx.strokeStyle = alpha(COL.band, j === 0 ? 0.7 : 0.45);
        seg((bi) => s.vwap[bi] + mu * s.sd[bi]);
        seg((bi) => s.vwap[bi] - mu * s.sd[bi]);
      });
      ctx.setLineDash([]);
      return;
    }
    ctx.strokeStyle = COL.vwap; ctx.lineWidth = 1.8;
    seg((bi) => s.vwap[bi]);
  }
  drawAvwap(m, i0, i1, P) {
    const A = this.app, ctx = this.ctx, a = A.avwap;
    if (!a || a.idx > A.cursor) return;
    const arr = A.getAvwap();
    ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]); ctx.beginPath();
    let started = false;
    for (let i = i0; i <= i1; i++) {
      const bi = m.baseIdx(i); if (bi < a.idx) continue;
      const y = this.yOf(arr[bi - a.idx]), x = this.xOf(i);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  drawProfile(m, i0, i1, P) {
    const A = this.app, ctx = this.ctx, v = this.view;
    const a = m.bar(i0).i0, e = m.baseIdx(i1);
    const raw = (v.yMax - v.yMin) / Math.max(20, P.h / 4);
    const row = Core.rowSizeFor(raw, A.tick);
    const prof = A.profileFor(a, e, row);
    if (!prof) return null;
    const va = Core.valueArea(prof, A.settings.vaPct / 100);
    if (!va) return null;
    let mx = 0; for (let j = 0; j < prof.v.length; j++) mx = Math.max(mx, prof.v[j]);
    /* Profil nur im rechten Leerraum + etwas darüber hinaus, reduzierte Deckkraft */
    const width = Math.min(P.w * 0.18, Math.max(60, this.rightPad() * this.view.barW * 1.2)), right = P.w;
    this.profW = width;
    for (let j = 0; j < prof.v.length; j++) {
      const p0 = (prof.r0 + j) * row;
      const yT = this.yOf(p0 + row), yB = this.yOf(p0);
      if (yB < 0 || yT > P.h) continue;
      const len = prof.v[j] / mx * width;
      const inVa = j >= va.loIdx && j <= va.hiIdx;
      const bl = prof.v[j] > 0 ? prof.bv[j] / prof.v[j] : 0.5;
      const h = Math.max(1, yB - yT - (yB - yT > 3 ? 1 : 0));
      ctx.fillStyle = alpha(COL.bull, inVa ? 0.24 : 0.1);
      ctx.fillRect(right - len, yT, len * bl, h);
      ctx.fillStyle = alpha(COL.bear, inVa ? 0.24 : 0.1);
      ctx.fillRect(right - len + len * bl, yT, len * (1 - bl), h);
    }
    const yP = this.yOf(va.poc);
    ctx.strokeStyle = alpha(COL.poc, 0.85); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(0, yP); ctx.lineTo(P.w, yP); ctx.stroke();
    ctx.strokeStyle = alpha(COL.va, 0.5); ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (const p of [va.vah, va.val]) { const y = this.yOf(p); ctx.beginPath(); ctx.moveTo(right - width, y); ctx.lineTo(P.w, y); ctx.stroke(); }
    ctx.setLineDash([]);
    return { va, exact: prof.exact };
  }
  /* Horizontale Level mit Beschriftung links; Beschriftungen werden gesammelt und entzerrt */
  levelLine(name, p, col, x0, dash) {
    const ctx = this.ctx, P = this.plot;
    const y = Math.round(this.yOf(p)) + 0.5;
    if (y < 0 || y > P.h || x0 >= P.w) return;
    ctx.strokeStyle = alpha(col, 0.5); ctx.setLineDash(dash || [8, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(P.w, y); ctx.stroke(); ctx.setLineDash([]);
    this.levelLabels.push({ name, y, col, x0 });
  }
  flushLevelLabels(P) {
    const ctx = this.ctx; ctx.font = '10.5px ' + FONT_MONO;
    const L = this.levelLabels.sort((a, b) => a.y - b.y);
    /* Legende oben und Order-Labels freihalten */
    const placed = [{ x: 0, y: 6, w: this.legendW || P.w, h: 24 }];
    for (const o of this._lines || []) if (o.box) placed.push({ x: o.box.x - 4, y: o.box.y + 9, w: o.box.w + 8 });
    for (const l of L) {
      let x = Math.max(4, l.x0 + 4);
      const w = ctx.measureText(l.name).width + 6;
      let guard = 0;
      while (placed.some((u) => Math.abs(u.y - l.y) < (u.h || 12) && x < u.x + u.w && u.x < x + w) && guard++ < 40) x += 46;
      if (x + w > P.w - (this.profW || 0) - 4) continue; /* lieber weglassen als überlappen */
      placed.push({ x, y: l.y, w });
      ctx.fillStyle = alpha(COL.bg, 0.7); ctx.fillRect(x - 2, l.y - 13, w, 12);
      ctx.fillStyle = alpha(l.col, 0.95); ctx.fillText(l.name, x, l.y - 3);
    }
  }
  drawPrevLevels(m, P) {
    const A = this.app, s = A.series;
    const cur = s.sessIdx[A.cursor];
    if (cur < 1) return;
    const lv = A.prevLevels(cur - 1);
    const startT = s.sessions[cur].start;
    const x0 = Math.max(0, this.xOfTime(startT));
    this.levelLine('PDH', lv.h, COL.text, x0); this.levelLine('PDL', lv.l, COL.text, x0); this.levelLine('PDC', lv.c, COL.muted, x0);
    if (lv.va) { this.levelLine('pPOC', lv.va.poc, COL.poc, x0); this.levelLine('pVAH', lv.va.vah, COL.va, x0); this.levelLine('pVAL', lv.va.val, COL.va, x0); }
  }
  /* RTH-Levels (A4): nur aus Daten bis zum Cursor */
  drawRth(m, P) {
    const A = this.app, L = A.rthNow();
    if (!L) return;
    const c = COL.rth;
    const xs = Math.max(0, this.xOfTime(L.start)), xo = Math.max(0, this.xOfTime(L.open));
    if (L.onh != null) { this.levelLine('ON-H', L.onh, c, xs, [2, 3]); this.levelLine('ON-L', L.onl, c, xs, [2, 3]); }
    if (!L.rth) return;
    if (L.rthOpen != null) this.levelLine('RTH-Open', L.rthOpen, c, xo, [1, 3]);
    if (L.orDone && L.orh != null) { this.levelLine('OR-H', L.orh, c, xo, [6, 3]); this.levelLine('OR-L', L.orl, c, xo, [6, 3]); }
    if (L.ibDone && L.ibh != null) { this.levelLine('IB-H', L.ibh, c, xo, []); this.levelLine('IB-L', L.ibl, c, xo, []); }
    else if (L.ibh != null) {
      const ctx = this.ctx; const x = Math.max(4, xo + 4);
      ctx.fillStyle = alpha(c, 0.08); ctx.fillRect(xo, this.yOf(L.ibh), Math.max(0, this.xOf(m.n - 1) - xo), this.yOf(L.ibl) - this.yOf(L.ibh));
      ctx.font = '10.5px ' + FONT_UI; ctx.fillStyle = alpha(c, 0.9); ctx.fillText('IB läuft', x, Math.max(12, this.yOf(L.ibh) - 4));
    }
  }
  drawLower(m, i0, i1) {
    const ctx = this.ctx, A = this.app, L = this.lower, mode = A.settings.ind.lower, bw = this.view.barW;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, L.y - 6, this.W, L.h + 6);
    ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(0, L.y - 3.5); ctx.lineTo(this.W, L.y - 3.5); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(0, L.y, L.w, L.h); ctx.clip();
    let lo = Infinity, hi = -Infinity;
    const val = (i) => mode === 'delta' ? m.bar(i).d : A.series.cvd[m.baseIdx(i)];
    for (let i = i0; i <= i1; i++) { const x = val(i); if (x < lo) lo = x; if (x > hi) hi = x; }
    if (mode === 'delta') { const a = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -a; hi = a; }
    if (!isFinite(lo) || hi === lo) { hi = (hi || 0) + 1; lo = (lo || 0) - 1; }
    const pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
    const y = (x) => L.y + (hi - x) / (hi - lo) * L.h;
    const y0 = y(0);
    if (mode === 'delta') {
      const w = Math.max(1, Math.min(bw * 0.72, bw - 1)), rw = Math.max(1, Math.round(w));
      /* vier Pfade: positiv/negativ × echt/geschätzt */
      const ps = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const add = (x, d, est, ww) => { const yd = y(d); ps[(d >= 0 ? 0 : 1) + (est ? 2 : 0)].rect(x, Math.min(y0, yd), ww, Math.max(1, Math.abs(yd - y0))); };
      if (bw < 1.5) {
        let col = null, dd = 0, est = false;
        for (let i = i0; i <= i1; i++) {
          const b = m.bar(i), c = Math.floor(this.xOf(i));
          if (c !== col) { if (col != null) add(col, dd, est, 1); col = c; dd = b.d; est = b.est; }
          else if (Math.abs(b.d) > Math.abs(dd)) { dd = b.d; est = b.est; }
        }
        if (col != null) add(col, dd, est, 1);
      } else {
        for (let i = i0; i <= i1; i++) { const b = m.bar(i); add(Math.round(this.xOf(i) - w / 2), b.d, b.est, rw); }
      }
      ctx.fillStyle = alpha(COL.bull, 0.85); ctx.fill(ps[0]);
      ctx.fillStyle = alpha(COL.bear, 0.85); ctx.fill(ps[1]);
      ctx.fillStyle = alpha(COL.bull, 0.45); ctx.fill(ps[2]);
      ctx.fillStyle = alpha(COL.bear, 0.45); ctx.fill(ps[3]);
    } else {
      ctx.strokeStyle = COL.info; ctx.lineWidth = 1.5; ctx.beginPath();
      let prevS = -1;
      for (let i = i0; i <= i1; i++) {
        const bi = m.baseIdx(i), si = A.series.sessIdx[bi];
        const x = this.xOf(i), yy = y(A.series.cvd[bi]);
        if (i === i0 || (A.settings.cvdReset && si !== prevS)) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        prevS = si;
      }
      ctx.stroke();
    }
    if (y0 > L.y && y0 < L.y + L.h) { ctx.strokeStyle = alpha(COL.muted, 0.5); ctx.beginPath(); ctx.moveTo(0, Math.round(y0) + 0.5); ctx.lineTo(L.w, Math.round(y0) + 0.5); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = COL.muted; ctx.font = '10.5px ' + FONT_UI;
    const lbl = mode === 'delta' ? 'Delta' + (A.baseEst ? ' (geschätzt)' : '') : 'CVD' + (A.settings.cvdReset ? ' · Reset je Session' : '');
    ctx.fillText(lbl, 6, L.y + 12);
    ctx.font = '10.5px ' + FONT_MONO; ctx.textAlign = 'left';
    const lv = mode === 'delta' ? m.last.d : A.series.cvd[A.cursor];
    ctx.fillStyle = COL.panel; ctx.fillRect(this.axisX + 1, L.y - 6, this.W - this.axisX, L.h + 6);
    ctx.fillStyle = lv >= 0 ? COL.bull : COL.bear;
    ctx.fillText(fmtVol(lv), this.axisX + 6, Math.max(L.y + 10, Math.min(L.y + L.h - 2, y(lv) + 3)));
    this.lowerScale = { lo, hi };
  }
  /* Preis-Tags rechts: werden gesammelt (inkl. Order-Tags), Gitter-Beschriftungen nahe Tags entfallen */
  drawPriceAxis(m, P, vpInfo) {
    const ctx = this.ctx, A = this.app, v = this.view, ax = this.axisX;
    ctx.fillStyle = COL.panel; ctx.fillRect(ax, 0, this.W - ax, this.timeY);
    ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(ax + 0.5, 0); ctx.lineTo(ax + 0.5, this.timeY); ctx.stroke();
    ctx.font = '11px ' + FONT_MONO; ctx.textBaseline = 'middle';
    const tags = this.tags.slice();
    if (vpInfo) tags.push({ p: vpInfo.va.poc, bg: alpha(COL.poc, 0.9), fg: COL.bg, pr: 1 });
    const last = m.last;
    tags.push({ p: last.c, bg: last.c >= last.o ? COL.buy : COL.sell, fg: '#ffffff', pr: 3 });
    for (const t of tags) t.y = Math.max(8, Math.min(P.h - 8, this.yOf(t.p)));
    const step = this.yStep || 1;
    ctx.fillStyle = COL.muted;
    const p0 = Math.ceil(v.yMin / step) * step;
    for (let k = 0; k < 200; k++) {
      const p = p0 + k * step; if (!(p <= v.yMax)) break;
      const y = this.yOf(p); if (y < 8 || y > P.h - 6) continue;
      if (tags.some((t) => Math.abs(t.y - y) < 14)) continue;
      ctx.fillText(A.fmtP(p), ax + 6, y);
    }
    tags.sort((a, b) => b.pr - a.pr);
    const drawn = [];
    for (const t of tags) {
      if (t.pr < 4 && drawn.some((d) => d.pr < 4 && Math.abs(d.y - t.y) < 16)) continue;
      drawn.push(t);
    }
    drawn.reverse();
    for (const t of drawn) {
      ctx.fillStyle = t.bg; ctx.fillRect(ax + 1, t.y - 8, this.W - ax - 1, 16);
      ctx.fillStyle = t.fg; ctx.fillText(t.txt || A.fmtP(t.p), ax + 6, t.y);
    }
    ctx.textBaseline = 'alphabetic';
  }
  drawTimeAxis(m, i0, i1) {
    const ctx = this.ctx, A = this.app, tz = A.settings.tz, bw = this.view.barW;
    const blind = A.isBlind();
    ctx.fillStyle = COL.panel; ctx.fillRect(0, this.timeY, this.W, this.H - this.timeY);
    ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(0, this.timeY + 0.5); ctx.lineTo(this.W, this.timeY + 0.5); ctx.stroke();
    const every = Math.max(1, Math.ceil(84 / bw));
    const nice = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 24, 30, 48, 60, 96, 120, 180, 240, 288, 480, 720, 1440];
    const ev = nice.find((x) => x >= every) || every;
    ctx.font = '11px ' + FONT_MONO; ctx.textAlign = 'center';
    const cand = [];
    let prevDay = null;
    for (let i = Math.max(0, i0 - 1); i <= i1; i++) {
      const t = m.bar(i).t;
      /* Tag ohne Date-Objekt bestimmen; volle Datumsteile nur für Kandidaten */
      const day = Math.floor((t + Core.tzOffset(t, tz) * 60) / 86400);
      const newDay = prevDay !== null && day !== prevDay;
      prevDay = day;
      if (i < i0) continue;
      if (!newDay && i % ev !== 0 && this.tf < 86400) continue;
      const x = this.xOf(i); if (x < 24 || x > this.axisX - 24) continue;
      const lp = Core.localParts(t, tz);
      if (blind) {
        if (this.tf >= 86400) { if (i % ev === 0) cand.push({ x, s: 'Tag ' + A.dayNo(t), pr: 1 }); }
        else if (newDay) cand.push({ x, s: 'Tag ' + A.dayNo(t + 3600 * 6), pr: 1 });
        else if (i % ev === 0) cand.push({ x, s: A.hm(lp), pr: 0 });
        continue;
      }
      if (this.tf >= 86400) { if (i % ev === 0 || (lp.d === 1)) cand.push({ x, s: String(lp.d).padStart(2, '0') + '.' + String(lp.m).padStart(2, '0') + (lp.m === 1 && lp.d <= 7 ? '.' + String(lp.y).slice(2) : ''), pr: lp.d === 1 ? 1 : 0 }); }
      else if (newDay) cand.push({ x, s: WD[lp.wd] + ' ' + lp.d + '.' + lp.m + '.', pr: 1 });
      else if (i % ev === 0) cand.push({ x, s: A.hm(lp), pr: 0 });
    }
    cand.sort((a, b) => b.pr - a.pr);
    const placed = [];
    for (const L of cand) {
      const w = textW(ctx, L.s) + 14;
      if (placed.some((p) => Math.abs(p.x - L.x) < (p.w + w) / 2)) continue;
      placed.push({ x: L.x, w });
      ctx.fillStyle = L.pr ? COL.text : COL.muted;
      ctx.fillText(L.s, L.x, this.timeY + 15);
    }
    ctx.textAlign = 'left';
  }
  drawCrosshair(m, P) {
    const ctx = this.ctx, A = this.app;
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = alpha(COL.text, 0.4); ctx.lineWidth = 1;
    if (this.hover) {
      const idx = this.idxAt(this.hover.x);
      const x = Math.round(idx >= 0 && idx < m.n ? this.xOf(idx) : this.hover.x) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.timeY); ctx.stroke();
      if (this.hover.y < P.h) { const y = Math.round(this.hover.y) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.axisX, y); ctx.stroke(); }
    } else if (A.hoverT != null) {
      const x = this.xOfTime(A.hoverT);
      if (x != null && x >= 0 && x <= P.w) { ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, this.timeY); ctx.stroke(); }
    }
    ctx.restore();
  }
  /* Legende: kürzen statt abschneiden – unwichtigere Teile fallen zuerst weg */
  drawLegend(m, P) {
    const ctx = this.ctx, A = this.app;
    let i = m.k;
    if (this.hover) { const h = this.idxAt(this.hover.x); if (h >= 0 && h < m.n) i = h; }
    const b = m.bar(i);
    const bi = m.baseIdx(i);
    const parts = [['O', A.fmtP(b.o), 3], ['H', A.fmtP(b.h), 2], ['L', A.fmtP(b.l), 2], ['C', A.fmtP(b.c), 0], ['V', fmtVol(b.v), 4], ['Δ', (b.d >= 0 ? '+' : '') + fmtVol(b.d), 1]];
    if (A.settings.ind.vwap && this.tf < 86400) parts.push(['VWAP', A.fmtP(A.series.vwap[bi]), 5]);
    ctx.font = '11px ' + FONT_MONO;
    const maxW = P.w - 16;
    const width = (ps) => ps.reduce((s, p) => s + textW(ctx, p[0]) + 3 + textW(ctx, p[1]) + 10, 0) + (b.partial ? textW(ctx, 'läuft') : 0);
    let use = parts.slice();
    while (use.length > 1 && width(use) > maxW) { let k = 0; for (let j = 1; j < use.length; j++) if (use[j][2] > use[k][2]) k = j; use.splice(k, 1); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, P.w, P.h); ctx.clip();
    let x = 8; const y = A.replay.picking ? 44 : 16;
    const up = b.c >= b.o;
    this.legendW = Math.min(maxW + 4, width(use) + 8) + 8;
    ctx.fillStyle = alpha(COL.bg, 0.75); ctx.fillRect(4, y - 12, this.legendW - 8, 17);
    for (const [k, val] of use) {
      ctx.fillStyle = COL.muted; ctx.fillText(k, x, y); x += textW(ctx, k) + 3;
      ctx.fillStyle = k === 'Δ' ? (b.d >= 0 ? COL.bull : COL.bear) : k === 'VWAP' ? COL.vwap : (up ? COL.bull : COL.bear);
      ctx.fillText(val, x, y); x += textW(ctx, val) + 10;
    }
    if (b.partial) { ctx.fillStyle = COL.accent; ctx.fillText('läuft', x, y); }
    ctx.restore();
  }

  /* ---------- Trades & Orders ---------- */
  drawTradeMarks(m, P) {
    const A = this.app, ctx = this.ctx;
    const list = A.chartTrades();
    for (const o of list) {
      if (o.entryT == null) continue;
      const xe = this.xOfTime(o.entryT + 0.0001), ye = this.yOf(o.entryPrice);
      const col = o.side > 0 ? COL.bull : COL.bear;
      if (o.status === 'closed') {
        const xx = this.xOfTime(o.exitT + 0.0001), yx = this.yOf(o.exitPrice);
        ctx.strokeStyle = alpha(o.pnl >= 0 ? COL.bull : COL.bear, 0.8); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(xe, ye); ctx.lineTo(xx, yx); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = COL.text; ctx.beginPath(); ctx.arc(xx, yx, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = col; ctx.beginPath();
      if (o.side > 0) { ctx.moveTo(xe, ye); ctx.lineTo(xe - 6, ye + 9); ctx.lineTo(xe + 6, ye + 9); }
      else { ctx.moveTo(xe, ye); ctx.lineTo(xe - 6, ye - 9); ctx.lineTo(xe + 6, ye - 9); }
      ctx.closePath(); ctx.fill();
    }
  }
  /* Gewinn-/Verlustzonen für Entwurf, wartende Orders und offene Positionen.
     Zonen beginnen beim Einstieg (bzw. der aktuellen Kerze) und enden am rechten Rand – keine künftigen Kerzen. */
  zoneItems() {
    const A = this.app, out = [];
    if (A.posDraft) out.push({ draft: true, side: A.posDraft.side, entry: A.posDraft.entry, sl: A.posDraft.sl, tp: A.posDraft.tp, t0: A.nowT() });
    if (A.engine && A.replay.active) for (const o of A.engine.orders) {
      if (o.status !== 'open' && o.status !== 'pending') continue;
      const ent = o.status === 'open' ? o.entryPrice : A.linePrice(o, 'price', o.price);
      out.push({ o, side: o.side, entry: ent, sl: o.sl != null ? A.linePrice(o, 'sl', o.sl) : null, tp: o.tp != null ? A.linePrice(o, 'tp', o.tp) : null, t0: o.status === 'open' ? o.entryT : A.nowT() });
    }
    return out;
  }
  drawPosZones(m, P) {
    const ctx = this.ctx;
    for (const z of this.zoneItems()) {
      const x0 = Math.max(0, Math.min(P.w, this.xOfTime(z.t0) - this.view.barW / 2));
      const x1 = P.w;
      if (x1 - x0 < 2) continue;
      const ye = this.yOf(z.entry);
      const a = z.draft ? 0.16 : 0.1;
      if (z.tp != null) { const yt = this.yOf(z.tp); ctx.fillStyle = alpha(COL.bull, a); ctx.fillRect(x0, Math.min(ye, yt), x1 - x0, Math.abs(yt - ye)); }
      if (z.sl != null) { const ys = this.yOf(z.sl); ctx.fillStyle = alpha(COL.bear, a); ctx.fillRect(x0, Math.min(ye, ys), x1 - x0, Math.abs(ys - ye)); }
    }
  }
  /* Linien-Liste für Orders, Positionen und Entwurf. Labels stehen links vom Profil (nicht auf der aktuellen Kerze),
     Preise auf der Preisachse. Werte netto inkl. Gebühren/Slippage. */
  orderLines() {
    const A = this.app, out = [];
    const d = A.posDraft;
    if (d) {
      const b = A.draftInfo();
      const ok = b && !b.err;
      out.push({ draft: true, f: 'entry', p: d.entry, col: d.side > 0 ? COL.buy : COL.sell, label: (d.side > 0 ? 'Long ' : 'Short ') + (ok ? A.fmtQ(b.qty) + ' · ' + (b.type === 'market' ? 'Market' : b.type === 'limit' ? 'Limit' : 'Stop') : 'Entwurf') });
      out.push({ draft: true, f: 'sl', p: d.sl, col: COL.sell, label: 'SL ' + (ok ? A.fmtMoney(b.slNet, true) + ' · ' + A.fmtN(Math.abs(d.entry - d.sl), A.dec()) + ' Punkte' : '') });
      out.push({ draft: true, f: 'tp', p: d.tp, col: COL.buy, label: 'TP ' + (ok ? A.fmtMoney(b.tpNet, true) + ' · ' + A.fmtR(b.tpR) + ' netto' : '') });
    }
    if (!A.engine || !A.replay.active) return out;
    for (const o of A.engine.orders) {
      if (o.status === 'pending') {
        const ent = A.linePrice(o, 'price', o.price);
        out.push({ o, f: 'price', p: ent, col: COL.info, label: (o.side > 0 ? 'Buy ' : 'Sell ') + (o.type === 'limit' ? 'Limit ' : 'Stop ') + A.fmtQ(o.qty) });
        if (o.sl != null) { const sp = A.linePrice(o, 'sl', o.sl); out.push({ o, f: 'sl', p: sp, col: COL.sell, label: 'SL ' + A.fmtMoney(A.netFor(o.side, ent, sp, o.qty, true), true) }); }
        if (o.tp != null) { const tp = A.linePrice(o, 'tp', o.tp); const n = A.netFor(o.side, ent, tp, o.qty, false); const r0 = o.sl != null ? Math.abs(ent - o.sl) * o.qty * A.pv : null; out.push({ o, f: 'tp', p: tp, col: COL.buy, label: 'TP ' + A.fmtMoney(n, true) + (r0 ? ' · ' + A.fmtR(n / r0) : '') }); }
      } else if (o.status === 'open') {
        const u = A.engine.netAt(o, A.price(), null, false);
        out.push({ o, f: 'entry', p: o.entryPrice, col: o.side > 0 ? COL.buy : COL.sell, label: (o.side > 0 ? 'Long ' : 'Short ') + A.fmtQ(o.qtyOpen != null ? o.qtyOpen : o.qty) + '  ' + A.fmtMoney(u, true) });
        if (o.sl != null) {
          const sp = A.linePrice(o, 'sl', o.sl); const inf = A.slInfo(o, sp);
          const dragging = this.mode && this.mode.type === 'order' && this.mode.L.o === o && this.mode.L.f === 'sl';
          out.push({ o, f: 'sl', p: sp, col: COL.sell, label: 'SL ' + A.fmtMoney(inf.net, true) + (inf.r != null ? (dragging ? ' (−1,00R → ' + A.fmtR(inf.r) + ')' : ' · ' + A.fmtR(inf.r)) : '') });
        }
        if (o.tp1 != null && !o.tp1Done) out.push({ o, f: 'tp1', p: o.tp1, col: alpha(COL.buy, 0.8), label: 'TP1 ' + A.fmtQ(o.tp1Qty), fixed: true });
        if (o.tp != null) { const tp = A.linePrice(o, 'tp', o.tp); const n = A.engine.netAt(o, tp, null, false); out.push({ o, f: 'tp', p: tp, col: COL.buy, label: 'TP ' + A.fmtMoney(n, true) + (o.risk ? ' · ' + A.fmtR(n / o.risk) : '') }); }
      }
    }
    return out;
  }
  layoutOrderLines(P) {
    const ctx = this.ctx;
    const lines = this.orderLines();
    this._lines = lines;
    ctx.font = '600 11px ' + FONT_MONO;
    const vis = lines.filter((L) => { const y = this.yOf(L.p); return y >= 0 && y <= P.h; }).sort((a, b) => this.yOf(a.p) - this.yOf(b.p));
    let lastY = -1e9;
    for (const L of vis) { L.ly = Math.max(this.yOf(L.p), lastY + 20, 34); lastY = L.ly; }
    let nextY = P.h - 10 + 20;
    for (let k = vis.length - 1; k >= 0; k--) { vis[k].ly = Math.min(vis[k].ly, nextY - 20); nextY = vis[k].ly; }
    /* Labels rechtsbündig links vom Profil bzw. vom rechten Leerraum */
    const rightEdge = Math.max(120, P.w - Math.max(this.profW || 0, this.rightPad() * this.view.barW) - 8);
    for (const L of lines) {
      L.box = null;
      const y = this.yOf(L.p);
      if (y < 0 || y > P.h) continue;
      const w = ctx.measureText(L.label).width + 16;
      L.grab = (!L.fixed && L.f !== 'entry') || (L.draft && L.f === 'entry');
      L.box = { x: Math.max(4, rightEdge - w), y: Math.round(L.ly == null ? y : L.ly) - 9, w, h: 18 };
    }
  }
  drawOrderLines(P) {
    const ctx = this.ctx;
    const lines = this._lines || [];
    ctx.font = '600 11px ' + FONT_MONO; ctx.textBaseline = 'middle';
    for (const L of lines) {
      if (!L.box) continue;
      const y = Math.round(this.yOf(L.p)) + 0.5;
      const { x, w } = L.box, ly = L.box.y + 9;
      ctx.strokeStyle = L.col; ctx.lineWidth = L.f === 'entry' ? 1.5 : 1;
      ctx.setLineDash(L.f === 'price' ? [6, 4] : L.f === 'entry' ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(P.w, y); ctx.stroke(); ctx.setLineDash([]);
      if (Math.abs(ly - y) > 1) { ctx.strokeStyle = alpha(L.col, 0.6); ctx.beginPath(); ctx.moveTo(x + w, ly); ctx.lineTo(x + w + 10, y); ctx.stroke(); }
      ctx.fillStyle = L.col; ctx.fillRect(x, ly - 9, w, 18);
      if (L.grab) { ctx.fillStyle = alpha('#ffffff', 0.55); for (let k = 0; k < 3; k++) ctx.fillRect(x + 4, ly - 4 + k * 3, 3, 1.2); }
      ctx.fillStyle = '#ffffff'; ctx.fillText(L.label, x + (L.grab ? 10 : 7), ly);
      this.tags.push({ p: L.p, bg: L.col, fg: '#ffffff', pr: 2 });
    }
    ctx.textBaseline = 'alphabetic';
  }
  /* Trefferprüfung für Linien und Label-Griffe (Touch: 18–20 px, Maus: 8 px) */
  hitLine(p, touch) {
    if (!this._lines) return null;
    const tol = touch ? 20 : 8;
    let best = null, bd = Infinity;
    for (const L of this._lines) {
      if (L.fixed) continue;
      if (L.f === 'entry' && !L.draft) continue;
      if (L.box && p.x >= L.box.x - 4 && p.x <= L.box.x + L.box.w + 4 && p.y >= L.box.y - (touch ? 8 : 2) && p.y <= L.box.y + L.box.h + (touch ? 8 : 2)) return L;
      const d = Math.abs(p.y - this.yOf(L.p));
      if (d <= tol && p.x < this.plot.w && d < bd) { bd = d; best = L; }
    }
    return best;
  }
  dragTo(md) {
    const A = this.app, L = md.L;
    const price = Core.roundTick(this.priceAt(Math.max(0, Math.min(this.plot.h, md.lastY))) - md.grab, A.tick);
    if (price === md.price) return;
    md.price = price;
    if (L.draft) A.movePosDraft(L.f, price);
    else { L.p = price; A.previewOrderLine(L.o, L.f, price); }
  }
  /* Bestätigen-Leiste neben dem Positions-Entwurf */
  updateConfirm() {
    const A = this.app, d = A.posDraft, el = this.confirmEl;
    if (!d || A.activeChart !== this || !this.m || !this.plot) { if (!el.hidden) el.hidden = true; return; }
    const b = A.draftInfo();
    const txt = b && !b.err ? A.fmtQ(b.qty) + ' · Risiko ' + A.fmtMoney(-b.slNet) + (b.over ? ' (leicht über Budget)' : '') + ' · R:R ' + A.fmtN(b.tpR, 2) : (b ? b.err : '');
    if (txt !== this._pcTxt) { el.querySelector('.pc-txt').textContent = txt; this._pcTxt = txt; this._pcSize = null; }
    el.querySelector('[data-pc="ok"]').disabled = !(b && !b.err);
    if (el.hidden) { el.hidden = false; this._pcSize = null; }
    if (!this._pcSize) this._pcSize = { head: this.el.querySelector('.chart-head').offsetHeight, h: el.offsetHeight || 34, w: el.offsetWidth || 320 };
    const head = this._pcSize.head;
    const yTop = Math.min(this.yOf(d.sl), this.yOf(d.tp), this.yOf(d.entry));
    const yBot = Math.max(this.yOf(d.sl), this.yOf(d.tp), this.yOf(d.entry));
    const h = this._pcSize.h, w = this._pcSize.w;
    /* Sichtbarer Bereich des Charts im Fenster – ohne feste Leisten (Aktionsleiste, Navigation, Sheet) */
    const cr = this.cv.getBoundingClientRect();
    let vTop = 0, vBot = window.innerHeight;
    for (const sel of ['#mAct', '#mainNav', '.sheet-h']) {
      const el = document.querySelector(sel);
      if (!el || !el.offsetParent || getComputedStyle(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect(); if (r.height && r.top > window.innerHeight / 2) vBot = Math.min(vBot, r.top);
    }
    const hdr = document.querySelector('header.top'); if (hdr && getComputedStyle(hdr).position === 'sticky') vTop = Math.max(vTop, hdr.getBoundingClientRect().bottom);
    const yMin = Math.max(4, vTop - cr.top + 4), yMax = Math.min(this.plot.h, vBot - cr.top) - h - 4;
    const xMin = 4, xMax = this.plot.w - w - 4;
    /* Label-Griffe der Linien nicht verdecken */
    const boxes = (this._lines || []).filter((L) => L.box).map((L) => L.box);
    const hits = (x, y) => boxes.some((b) => x < b.x + b.w + 4 && b.x - 4 < x + w && y < b.y + b.h + 4 && b.y - 4 < y + h);
    const cx = this.plot.w * 0.55 - w / 2;
    const cand = [[cx, yBot + 8], [cx, yTop - h - 8], [xMin, yBot + 8], [xMin, yTop - h - 8], [cx, yMax], [xMin, yMax], [cx, yMin], [xMin, yMin]];
    let x = null, y = null;
    for (const [cxx, cyy] of cand) {
      const xx = Math.max(xMin, Math.min(xMax, cxx)), yy = Math.max(yMin, Math.min(yMax, cyy));
      if (yMax < yMin) break;
      if (!hits(xx, yy)) { x = xx; y = yy; break; }
    }
    if (x == null) { x = Math.max(xMin, Math.min(xMax, cx)); y = Math.max(yMin, Math.min(Math.max(yMin, yMax), yBot + 8)); }
    const pos = Math.round(head + y) + 'px|' + Math.round(x) + 'px';
    if (pos !== this._pcPos) { const [t, l] = pos.split('|'); el.style.top = t; el.style.left = l; this._pcPos = pos; }
  }

  /* ---------- Zeichnungen ---------- */
  drawDrawings(P) {
    const A = this.app, ctx = this.ctx;
    const list = A.visibleDrawings().concat(A.draft ? [A.draft] : []);
    for (const d of list) {
      const sel = A.selDrawing === d;
      const col = sel ? COL.sel : (d.color || COL.draw);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = sel ? 2 : 1.4;
      const ya = this.yOf(d.a.p);
      if (d.type === 'hline') {
        ctx.beginPath(); ctx.moveTo(0, Math.round(ya) + 0.5); ctx.lineTo(P.w, Math.round(ya) + 0.5); ctx.stroke();
        ctx.font = '10.5px ' + FONT_MONO; ctx.fillText(A.fmtP(d.a.p), 6, ya - 4);
        continue;
      }
      const xa = this.xOfTime(d.a.t), xb = this.xOfTime(d.b.t), yb = this.yOf(d.b.p);
      if (d.type === 'trend') {
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
      } else if (d.type === 'rect') {
        ctx.fillStyle = alpha(col, 0.12); ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
        ctx.strokeRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
      } else if (d.type === 'fib') {
        const lv = [0, 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 1];
        const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb, x0 + 60);
        ctx.font = '10.5px ' + FONT_MONO;
        for (const f of lv) {
          const p = d.b.p + (d.a.p - d.b.p) * f; const y = Math.round(this.yOf(p)) + 0.5;
          ctx.globalAlpha = f === 0.5 || f === 0.618 || f === 0.705 ? 1 : 0.65;
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
          ctx.fillText(A.fmtN(f, 3) + '  ' + A.fmtP(p), x1 + 4, y + 3);
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke(); ctx.setLineDash([]);
      } else if (d.type === 'measure') {
        ctx.fillStyle = alpha(d.b.p >= d.a.p ? COL.bull : COL.bear, 0.14);
        ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
        const dp = d.b.p - d.a.p, bars = Math.round((d.b.t - d.a.t) / this.tf);
        const txt = (dp >= 0 ? '+' : '') + A.fmtP(dp) + ' (' + A.fmtPct(dp / d.a.p * 100, 2) + ') · ' + Math.round(Math.abs(dp) / A.tick) + ' Ticks · ' + bars + ' Kerzen';
        ctx.font = '11px ' + FONT_MONO; const w = ctx.measureText(txt).width + 10;
        ctx.fillStyle = COL.panel; ctx.fillRect((xa + xb) / 2 - w / 2, Math.min(ya, yb) - 22, w, 18);
        ctx.fillStyle = COL.text; ctx.textAlign = 'center'; ctx.fillText(txt, (xa + xb) / 2, Math.min(ya, yb) - 9); ctx.textAlign = 'left';
      }
      if (sel) for (const [x, y] of [[xa, ya], [xb, yb]]) { ctx.fillStyle = COL.bg; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
  }
  hitDrawing(x, y) {
    const A = this.app, list = A.visibleDrawings();
    for (let j = list.length - 1; j >= 0; j--) {
      const d = list[j];
      const ya = this.yOf(d.a.p);
      if (d.type === 'hline') { if (Math.abs(y - ya) < 6) return { d, part: 'body' }; continue; }
      const xa = this.xOfTime(d.a.t), xb = this.xOfTime(d.b.t), yb = this.yOf(d.b.p);
      if (A.selDrawing === d) {
        if (Math.hypot(x - xa, y - ya) < 8) return { d, part: 'a' };
        if (Math.hypot(x - xb, y - yb) < 8) return { d, part: 'b' };
      }
      if (d.type === 'trend') {
        const L2 = (xb - xa) ** 2 + (yb - ya) ** 2;
        let t = L2 ? ((x - xa) * (xb - xa) + (y - ya) * (yb - ya)) / L2 : 0; t = Math.max(0, Math.min(1, t));
        if (Math.hypot(x - (xa + t * (xb - xa)), y - (ya + t * (yb - ya))) < 6) return { d, part: 'body' };
      } else {
        const x0 = Math.min(xa, xb) - 4, x1 = Math.max(xa, xb, d.type === 'fib' ? xa + 60 : 0) + 4, y0 = Math.min(ya, yb) - 4, y1 = Math.max(ya, yb) + 4;
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return { d, part: 'body' };
      }
    }
    return null;
  }
  snap(x, y) {
    const A = this.app, m = this.m;
    let t = this.timeAtX(x), p = this.priceAt(y);
    if (A.settings.magnet && m) {
      const i = this.idxAt(x);
      if (i >= 0 && i < m.n) {
        const b = m.bar(i); let best = null, bd = 14;
        for (const q of [b.o, b.h, b.l, b.c]) { const d = Math.abs(this.yOf(q) - y); if (d < bd) { bd = d; best = q; } }
        if (best != null) { p = best; t = b.t + this.tf / 2; }
      }
    }
    return { t, p: Core.roundTick(p, A.tick) };
  }

  /* ---------- Eingaben ---------- */
  local(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  bindEvents() {
    const cv = this.cv, A = this.app;
    cv.addEventListener('pointerdown', (e) => this.onDown(e));
    cv.addEventListener('pointermove', (e) => this.onMove(e));
    cv.addEventListener('pointerup', (e) => this.onUp(e));
    cv.addEventListener('pointercancel', (e) => this.onUp(e));
    cv.addEventListener('pointerleave', (e) => { if (!this.mode && e.pointerType !== 'touch') { this.hover = null; A.setHoverT(null, null, true); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.local(e);
      const v = this.view;
      if (p.x >= this.axisX && p.y < this.plot.h) {
        const f = Math.exp(e.deltaY * 0.0015);
        const c = this.priceAt(p.y);
        v.yMin = c - (c - v.yMin) * f; v.yMax = c + (v.yMax - c) * f; v.auto = false;
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        v.rightIdx += (e.deltaX || e.deltaY) / v.barW * 0.5;
      } else {
        this.zoomAt(Math.min(p.x, this.plot.w), Math.exp(-e.deltaY * 0.0015));
      }
      A.requestRender();
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => {
      const p = this.local(e);
      if (p.x >= this.axisX) this.view.auto = true;
      else { this.view.rightIdx = null; this.view.auto = true; }
      A.requestRender();
    });
    cv.addEventListener('contextmenu', (e) => { if (A.tool !== 'cursor' || A.draft || A.posDraft) { e.preventDefault(); A.draft = null; A.cancelPosDraft(); A.setTool('cursor'); } });
  }
  onDown(e) {
    const A = this.app, p = this.local(e), v = this.view;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    this.cv.focus({ preventScroll: true });
    this.pointers.set(e.pointerId, p);
    try { this.cv.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.mode = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), w0: v.barW, cx: (a.x + b.x) / 2 };
      return;
    }
    if (!this.m) return;
    if (A.activeChart !== this) { A.setActiveChart(this); A.updatePosDraft(); }
    if (p.x >= this.axisX && p.y < this.plot.h) { this.mode = { type: 'yscale', y0: p.y, a: v.yMin, b: v.yMax }; return; }
    if (A.replay.picking && p.y < this.plot.h) {
      const i = Math.max(0, Math.min(this.m.n - 1, this.idxAt(p.x)));
      A.startReplayAt(this.m.baseIdx(i));
      return;
    }
    if (p.y > this.plot.h) { this.mode = { type: 'pan', x0: p.x, y0: p.y, r0: v.rightIdx, a: v.yMin, b: v.yMax, noY: true }; return; }
    const price = Core.roundTick(this.priceAt(p.y), A.tick);
    if (A.tool === 'long' || A.tool === 'short') {
      /* Klick nahe am aktuellen Kurs → Market */
      const px = A.price(); const near = Math.abs(this.yOf(px) - p.y) <= (touch ? 14 : 6);
      A.startPosDraft(A.tool === 'long' ? 1 : -1, near ? px : price);
      return;
    }
    if (e.shiftKey || A.tool === 'price') { A.setTicketPrice(price); if (A.tool === 'price') A.setTool('cursor'); return; }
    if (A.tool === 'avwap') { const i = Math.max(0, Math.min(this.m.n - 1, this.idxAt(p.x))); A.setAvwap(this.m.bar(i).i0); A.setTool('cursor'); return; }
    if (A.tool === 'hline') { A.addDrawing({ type: 'hline', a: { t: 0, p: this.snap(p.x, p.y).p } }); A.setTool('cursor'); return; }
    if (['trend', 'rect', 'fib', 'measure'].includes(A.tool)) {
      const pt = A.tool === 'measure' ? { t: this.timeAtX(p.x), p: price } : this.snap(p.x, p.y);
      A.draft = { type: A.tool, a: pt, b: Object.assign({}, pt) };
      this.mode = { type: 'draw', x0: p.x, y0: p.y };
      A.requestRender(); return;
    }
    const L = this.hitLine(p, touch);
    if (L) {
      /* Abstand zwischen Griffpunkt und Linie merken, Preisskala während des Ziehens einfrieren */
      this.mode = { type: 'order', L, y0: p.y, moved: false, grab: this.priceAt(p.y) - L.p, wasAuto: v.auto, lastY: p.y };
      v.auto = false; A.dragChart = this;
      A.selLine = { o: L.o, f: L.f, draft: !!L.draft };
      this.cv.style.cursor = 'ns-resize'; A.requestRender(); return;
    }
    const hit = this.hitDrawing(p.x, p.y);
    if (hit) {
      A.selDrawing = hit.d;
      this.mode = { type: 'drag', hit, start: { t: this.timeAtX(p.x), p: this.priceAt(p.y) }, a0: Object.assign({}, hit.d.a), b0: hit.d.b ? Object.assign({}, hit.d.b) : null };
      A.requestRender(); return;
    }
    if (A.selDrawing) { A.selDrawing = null; A.requestRender(); }
    this.mode = { type: 'pan', x0: p.x, y0: p.y, r0: v.rightIdx, a: v.yMin, b: v.yMax };
  }
  onMove(e) {
    const A = this.app, p = this.local(e), v = this.view;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (e.pointerType !== 'touch' || this.mode) this.hover = p;
    const md = this.mode;
    if (md && md.type === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = Math.max(MIN_BAR_W, Math.min(220, md.w0 * d / Math.max(10, md.d0)));
      this.zoomAt(md.cx, target / v.barW);
      A.requestRender(); return;
    }
    if (this.m && p.x < this.plot.w && e.pointerType !== 'touch') A.setHoverT(this.timeAtX(p.x), this, !md);
    if (!md) {
      let cur = A.replay.picking ? 'pointer' : A.tool === 'cursor' ? 'crosshair' : 'copy';
      if (p.x >= this.axisX) cur = 'ns-resize';
      else if (A.tool === 'cursor' && this.hitLine(p, false)) cur = 'ns-resize';
      else if (A.tool === 'cursor' && this.m && this.hitDrawing(p.x, p.y)) cur = 'move';
      if (this.cv.style.cursor !== cur) this.cv.style.cursor = cur;
      /* reine Mausbewegung: nur die Fadenkreuz-Ebene neu zeichnen */
      A.requestOverlay(); return;
    }
    if (md.type === 'pan') {
      v.rightIdx = md.r0 - (p.x - md.x0) / v.barW;
      if (!v.auto && !md.noY) { const dy = (p.y - md.y0) / this.plot.h * (md.b - md.a); v.yMin = md.a + dy; v.yMax = md.b + dy; }
    } else if (md.type === 'yscale') {
      const f = Math.exp((p.y - md.y0) * 0.006);
      const c = (md.a + md.b) / 2, h = (md.b - md.a) / 2 * f;
      v.yMin = c - h; v.yMax = c + h; v.auto = false;
    } else if (md.type === 'draw' && A.draft) {
      A.draft.b = A.draft.type === 'measure' ? { t: this.timeAtX(p.x), p: Core.roundTick(this.priceAt(p.y), A.tick) } : this.snap(p.x, p.y);
    } else if (md.type === 'order') {
      if (Math.abs(p.y - md.y0) < 2 && !md.moved) return;
      md.moved = true;
      md.lastY = p.y;
      /* Rand erreicht → Skala sanft mitschieben (siehe render) */
      md.edge = p.y < 16 ? 1 : p.y > this.plot.h - 16 ? -1 : 0;
      this.dragTo(md);
    } else if (md.type === 'drag') {
      const d = md.hit.d, t = this.timeAtX(p.x), pr = this.priceAt(p.y);
      if (md.hit.part === 'a') d.a = this.snap(p.x, p.y);
      else if (md.hit.part === 'b') d.b = this.snap(p.x, p.y);
      else {
        const dt = t - md.start.t, dp = pr - md.start.p;
        d.a = { t: md.a0.t + dt, p: Core.roundTick(md.a0.p + dp, A.tick) };
        if (md.b0) d.b = { t: md.b0.t + dt, p: Core.roundTick(md.b0.p + dp, A.tick) };
      }
    }
    A.requestRender();
  }
  onUp(e) {
    const A = this.app, md = this.mode;
    this.pointers.delete(e.pointerId);
    try { this.cv.releasePointerCapture(e.pointerId); } catch (_) { /* egal */ }
    if (e.pointerType === 'touch') this.hover = null;
    if (this.pointers.size > 0 && md && md.type === 'pinch') { this.mode = null; return; }
    this.mode = null;
    if (!md) return;
    if (md.type === 'draw' && A.draft) {
      const p = this.local(e);
      if (Math.hypot(p.x - md.x0, p.y - md.y0) < 5) A.draft = null;
      else if (A.draft.type === 'measure') { A.measureKeep = A.draft; A.draft = null; A.drawings.push(A.measureKeep); A.selDrawing = A.measureKeep; A.saveDrawings(); }
      else { A.addDrawing(A.draft); A.draft = null; }
      A.setTool('cursor');
    } else if (md.type === 'order') {
      this.view.auto = md.wasAuto; A.dragChart = null;
      if (md.price != null && !md.L.draft) A.modifyOrder(md.L.o, md.L.f, md.price);
      else if (!md.moved) A.toast('Linie ausgewählt: mit ↑/↓ um einen Tick verschieben (Shift = 10 Ticks).');
    } else if (md.type === 'drag') {
      A.saveDrawings();
    }
    A.requestRender();
  }
}
