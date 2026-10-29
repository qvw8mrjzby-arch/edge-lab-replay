/* Edge Lab Replay — App-Zustand, Replay, Orders, Journal-Daten */
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
};
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DEFAULTS = {
  layout: 2,
  charts: [{ tf: 900 }, { tf: 60 }, { tf: 300 }, { tf: 3600 }],
  tz: 'Europe/Berlin',
  ind: { vwap: true, bands: true, vp: true, fp: true, sessions: true, prev: true, rth: false, volume: true, econ: true, lower: 'delta' },
  emas: [{ p: 9, on: false }, { p: 21, on: true }, { p: 50, on: false }, { p: 200, on: true }],
  vwapBands: [1, 2],
  vaPct: 70,
  cvdReset: true,
  magnet: true,
  photos: true,
  fp: { ratio: 3, minVol: 1, rowMult: 1 },
  account: { start: 50000 },
  cost: { futures: { slipTicks: 1, feeFix: 2.5, feePct: 0 }, crypto: { slipTicks: 1, feeFix: 0, feePct: 0.04 }, forex: { slipTicks: 1, feeLot: 3.5, feePct: 0 } },
  intrabar: 'conservative',
  prop: { on: true, maxDD: 2000, dailyLoss: 1000, target: 3000 },
  ticket: { type: 'market', slPts: 10, tpR: 2, riskMode: 'money', risk: 500, qtyMode: 'risk', qty: 1, setup: '', note: '', price: '', tp1R: 0, tp1Pct: 50, beR: 0, trail: 0 },
  replay: { speed: 4, unit: 'base', pauseOnFill: true },
  statsFilter: 'all',
  aFilter: 'all',
  jf: { sym: '', strat: '', res: '', sess: '' },
  binance: { market: 'spot', symbol: 'BTCUSDT', interval: '1m', days: 7 },
  newSess: { market: 'ar:NAS100', when: 'random', y0: 2021, y1: 2024, start: 'ny', blind: true, sym: 'BTCUSDT', bnMarket: 'spot' },
  inst: 'NQ'
};
/* Frische Kopie – deepMerge darf nie Referenzen in DEFAULTS verändern */
const freshDefaults = () => JSON.parse(JSON.stringify(DEFAULTS));
function deepMerge(a, b) {
  const o = Array.isArray(a) ? a.slice() : Object.assign({}, a);
  for (const k in b) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) o[k] = deepMerge(a[k], b[k]);
    else if (b[k] !== undefined) o[k] = b[k];
  }
  return o;
}
const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const App = {
  settings: deepMerge(freshDefaults(), store.get('elr.settings', {})),
  base: null, baseTf: 60, tick: 0.25, pv: 1, qtyStep: 1, sess: { tz: 'UTC', hour: 0 }, symbol: '', source: '',
  trades: null, tidx: null, cov: [], covPref: null, series: null, baseEst: false,
  aggCache: new Map(), emaCache: new Map(), atrCache: new Map(), fpCache: new Map(), profCache: new Map(), prevCache: new Map(),
  cursor: 0,
  replay: { active: false, picking: false, playing: false, id: null, blind: false },
  engine: null,
  journal: [], /* wird in UI.init aus IndexedDB geladen (Store) */
  drawingsAll: store.get('elr.drawings', {}),
  drawings: [], selDrawing: null, draft: null, tool: 'cursor', avwap: null, avwapArr: null,
  hoverT: null, charts: [], activeChart: null, preview: null, posDraft: null, view: 'charts',

  /* ---------- Formatierung ---------- */
  dec() { return Core.decimalsOf(this.tick); },
  fmtP(p) { return isFinite(p) ? (+p).toFixed(this.dec()) : '–'; },
  fmtQ(q) { if (q == null || !isFinite(q)) return '–'; return (+q).toLocaleString('de-DE', { maximumFractionDigits: Core.decimalsOf(this.qtyStep) }); },
  fmtMoney(v, sign) { return Core.fmtMoney(v, sign); },
  fmtR(r) { return Core.fmtR(r); },
  fmtPct(v, d) { return Core.fmtPct(v, d); },
  fmtN(v, d) { return Core.fmtNum(v, d); },
  hm(p) { return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'); },
  /* Blind-Modus: Datum und Wochentag sind versteckt, solange die Session läuft */
  isBlind() { return !!(this.replay.active && this.replay.blind); },
  dayNo(t) {
    const ss = this.series && this.series.sessions; if (!ss || !ss.length) return 1;
    let lo = 0, hi = ss.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ss[m].start <= t) lo = m; else hi = m - 1; }
    return lo + 1;
  },
  inData(t) { return this.base && t >= this.base[0].t - 86400 && t <= this.base[this.base.length - 1].t + 86400; },
  fmtT(t, tf) {
    if (!isFinite(t)) return '–';
    const p = Core.localParts(t, this.settings.tz);
    if (this.isBlind() && this.inData(t)) return 'Tag ' + this.dayNo(t) + (tf >= 86400 ? '' : ' ' + this.hm(p));
    const d = String(p.d).padStart(2, '0') + '.' + String(p.m).padStart(2, '0') + '.';
    if (tf >= 86400) return WD[p.wd] + ' ' + d + String(p.y).slice(2);
    return WD[p.wd] + ' ' + d + ' ' + this.hm(p);
  },
  fmtDate(t, tz) { if (!isFinite(t)) return '–'; const p = Core.localParts(t, tz || this.settings.tz); return WD[p.wd] + ', ' + String(p.d).padStart(2, '0') + '.' + String(p.m).padStart(2, '0') + '.' + p.y; },
  fmtDur(s) { if (!(s > 0)) return '–'; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? h + ' h ' + m + ' min' : m + ' min'; },
  price() { return this.base ? this.base[this.cursor].c : NaN; },
  nowT() { return this.base ? this.base[this.cursor].t : Infinity; },
  saveSettings() { store.set('elr.settings', this.settings); },
  saveJournal() {
    if (this.journal.length && typeof Store !== 'undefined') Store.persist();
    const p = typeof Store !== 'undefined' ? Store.save('journal', this.journal) : Promise.resolve(store.set('elr.journal', this.journal));
    return p.then((ok) => { if (!ok) this.toast('Journal konnte nicht gespeichert werden. Browser-Speicher ist voll oder blockiert – bitte eine Sicherung als Datei erstellen.', 'bad'); return ok; });
  },
  saveDrawings() { this.drawingsAll[this.symbol] = this.drawings.filter((d) => d.type !== 'measure'); store.set('elr.drawings', this.drawingsAll); },
  /* Handy: schmal (Hochformat) oder niedrig im Querformat */
  isMobile() { return window.matchMedia('(max-width: 860px), (orientation: landscape) and (max-height: 500px)').matches; },
  isLandscapePhone() { return window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches; },

  /* ---------- Kein Blick in die Zukunft über das Journal ---------- */
  seen(j) {
    if (!this.replay.active || !this.base || j.sym !== this.symbol) return true;
    /* Blind-Modus: Trades desselben Markts aus anderen Replays verraten über ihr Ein-/Ausblenden das Datum → ganz ausblenden */
    if (this.replay.blind && j.replay !== this.replay.id) return false;
    return j.exitT <= this.nowT();
  },
  visibleJournal() { return this.journal.filter((j) => this.seen(j)); },
  visibleDrawings() {
    if (!this.replay.active) return this.drawings;
    const tNow = this.nowT(), blind = this.replay.blind, rid = this.replay.id;
    return this.drawings.filter((d) => d.type === 'hline' || d === this.draft || (blind ? d.rid === rid : Math.min(d.a.t, d.b ? d.b.t : d.a.t) <= tNow));
  },

  /* ---------- Daten ---------- */
  loadDataset(ds) {
    const prep = Core.prepareBase(ds.bars);
    if (prep.bars.length < 30) throw new Error('Zu wenige Kerzen (' + prep.bars.length + '). Mindestens 30 nötig.');
    if (this.replay.active) this.forceStopReplay();
    this.cancelPosDraft();
    this.base = prep.bars;
    this.baseTf = ds.baseTf || Core.detectTf(this.base);
    this.tick = ds.tick || Core.inferTick(this.base);
    this.pv = ds.pv || 1; this.qtyStep = ds.qtyStep || 1;
    this.sess = ds.sess || { tz: 'UTC', hour: 0 };
    this.symbol = ds.symbol; this.source = ds.source;
    this.instKey = ds.instKey || null;
    this.dsSrc = ds.src || null; /* Ladeparameter – für „Session fortsetzen“ nach Neuladen */
    this.trades = ds.trades && ds.trades.n ? ds.trades : null;
    this.cov = ds.cov || [];
    this.live = ds.live || null;
    document.body.classList.toggle('has-live', !!this.live);
    this.avwap = null; this.avwapArr = null; this.selDrawing = null; this.draft = null;
    this.drawings = (this.drawingsAll[this.symbol] || []).slice();
    this.reindexTrades();
    this.recompute();
    this.cursor = this.base.length - 1;
    this.charts.forEach((c) => c.resetView());
    this.updateHeader(); this.updatePanels(); this.updateReplayBar();
    const notes = [];
    if (prep.fixed) notes.push(prep.fixed + ' Kerzen mit unlogischem High/Low korrigiert');
    if (prep.dropped) notes.push(prep.dropped + ' doppelte/ungültige Zeilen entfernt');
    return notes;
  },
  reindexTrades() {
    this.tidx = null; this.covPref = null;
    if (!this.trades || !this.base) return;
    this.tidx = Core.indexTrades(this.base, this.baseTf, this.trades, this.cov);
    const n = this.base.length, pref = new Int32Array(n + 1);
    let changed = false;
    for (let i = 0; i < n; i++) {
      pref[i + 1] = pref[i] + this.tidx.cov[i];
      /* Fehlt Taker-Volumen, aber Trades decken die Kerze ab → echtes Delta */
      const b = this.base[i];
      if (b.est && this.tidx.cov[i]) {
        let bv = 0, v = 0;
        for (let j = this.tidx.ts[i]; j <= this.tidx.te[i]; j++) { v += this.trades.q[j]; if (this.trades.b[j]) bv += this.trades.q[j]; }
        if (v > 0) { b.bv = Math.min(bv, b.v || v); if (!b.v) b.v = v; Core.setDelta(b); changed = true; }
      }
    }
    this.covPref = pref;
    return changed;
  },
  recompute() {
    this.series = Core.computeBaseSeries(this.base, this.sess, this.settings.cvdReset);
    this.baseEst = this.base.some((b) => b.est);
    this.aggCache.clear(); this.emaCache.clear(); this.atrCache.clear(); this.fpCache.clear(); this.profCache.clear(); this.prevCache.clear();
    this.avwapArr = null; this.rthCache = null;
  },
  getAgg(tf) {
    let a = this.aggCache.get(tf);
    if (!a) { a = Core.aggregate(this.base, tf, this.sess); this.aggCache.set(tf, a); }
    return a;
  },
  getEma(tf, p) {
    const k = tf + '|' + p;
    let a = this.emaCache.get(k);
    if (!a) { a = Core.emaArray(this.getAgg(tf).bars, p); this.emaCache.set(k, a); }
    return a;
  },
  atrNow(tf) {
    let a = this.atrCache.get(tf);
    const agg = this.getAgg(tf);
    if (!a) { a = Core.atrArray(agg.bars, 14); this.atrCache.set(tf, a); }
    const k = agg.map[this.cursor];
    if (k < 1) return NaN;
    const last = Core.partialBar(this.base, agg.bars[k], this.cursor);
    return last.partial ? a[k - 1] : a[k];
  },
  /* RTH-Levels nur für Märkte mit New-York-Session, immer nur bis zum Cursor */
  rthNow() {
    if (!this.base || !this.sess || this.sess.tz !== 'America/New_York' || this.baseTf > 900) return null;
    const k = this.cursor;
    if (this.rthCache && this.rthCache.k === k) return this.rthCache.v;
    const v = Core.rthLevels(this.base, k, this.baseTf);
    this.rthCache = { k, v };
    return v;
  },
  tradeRange(i0, i1) {
    if (!this.tidx || !this.covPref) return null;
    if (this.covPref[i1 + 1] - this.covPref[i0] !== i1 - i0 + 1) return null;
    const a = this.tidx.ts[i0], e = this.tidx.te[i1];
    return a <= e ? [a, e] : null;
  },
  fpRow(pxPerPrice) { return Core.rowSizeFor(14 / pxPerPrice * (this.settings.fp.rowMult || 1), this.tick); },
  footprintFor(a, e, row) {
    const k = a + '|' + e + '|' + row;
    let f = this.fpCache.get(k);
    if (!f) { if (this.fpCache.size > 3000) this.fpCache.clear(); f = Core.footprint(this.trades, a, e, row); this.fpCache.set(k, f); }
    return f;
  },
  profileFor(a, e, row) {
    const rng = this.tradeRange(a, e);
    const k = a + '|' + e + '|' + row + '|' + (rng ? 1 : 0);
    if (this.profCache.has(k)) return this.profCache.get(k);
    if (this.profCache.size > 400) this.profCache.clear();
    const p = rng ? Core.profileFromTrades(this.trades, rng[0], rng[1], row) : Core.profileFromBars(this.base, a, e, row);
    this.profCache.set(k, p);
    return p;
  },
  prevLevels(si) {
    if (this.prevCache.has(si)) return this.prevCache.get(si);
    const s = this.series.sessions[si];
    const row = Core.rowSizeFor((s.h - s.l) / 150, this.tick);
    const prof = this.profileFor(s.i0, s.i1, row);
    const out = { h: s.h, l: s.l, c: s.c, va: Core.valueArea(prof, this.settings.vaPct / 100) };
    this.prevCache.set(si, out);
    return out;
  },
  setAvwap(idx) { this.avwap = { idx }; this.avwapArr = null; this.setStatus('Anchored VWAP ab ' + this.fmtT(this.base[idx].t, 60) + ' gesetzt. Rechtsklick auf den Knopf entfernt ihn.'); this.updateToolbar(); this.requestRender(); },
  getAvwap() {
    if (!this.avwapArr) this.avwapArr = Core.anchoredVwap(this.base, this.avwap.idx, this.base.length - 1);
    return this.avwapArr;
  },
  chartTrades() {
    const out = [];
    const tNow = this.nowT();
    for (const j of this.journal) if (j.sym === this.symbol && j.entryT <= tNow && this.seen(j)) out.push(j);
    if (this.engine) for (const o of this.engine.orders) if (o.status === 'open') out.push(o);
    return out;
  },

  /* ---------- Rendering ---------- */
  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      /* Beim Ziehen nur den betroffenen Chart neu zeichnen – das hält es flüssig */
      const list = this.dragChart ? [this.dragChart] : this.charts;
      if (this.view === 'charts') for (const c of list) { try { c.render(); } catch (err) { console.error(err); } }
      this.updateLive();
    });
  },
  /* Nur Fadenkreuz-Ebenen neu zeichnen (Mausbewegung ohne Ziehen) */
  requestOverlay() {
    if (this._raf || this._rafO) return;
    this._rafO = requestAnimationFrame(() => {
      this._rafO = 0;
      if (this._raf || this.view !== 'charts') return;
      for (const c of this.charts) { try { c.renderOverlay(); } catch (err) { console.error(err); } }
    });
  },
  setHoverT(t, src, overlayOnly) { this.hoverT = t; for (const c of this.charts) if (c !== src) c.hover = null; if (overlayOnly) this.requestOverlay(); else this.requestRender(); },
  effLayout() { return this.isMobile() ? 1 : this.settings.layout; },
  buildCharts() {
    const host = $('#charts');
    const keep = this.charts.length && this.activeChart ? this.activeChart.slot : 0;
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
    const L = this.effLayout();
    host.dataset.layout = String(L);
    for (let i = 0; i < L; i++) this.charts.push(new Chart(this, host, i));
    this.setActiveChart(this.charts[Math.min(keep, L - 1)] || this.charts[0]);
    $$('#layoutSeg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.l === this.settings.layout)));
  },
  setActiveChart(c) {
    if (!c) return;
    this.activeChart = c;
    this.charts.forEach((x) => x.el.classList.toggle('active', x === c));
  },

  /* ---------- Werkzeuge & Zeichnungen ---------- */
  setTool(t) {
    if ((t === 'long' || t === 'short') && !this.replay.active) { this.toast('Positionen platzierst du im Replay. Erst eine Session starten.', 'warn'); t = 'cursor'; }
    this.tool = t; if (t !== 'cursor') this.selDrawing = null;
    this.updateToolbar(); this.requestRender();
  },
  updateToolbar() {
    $$('#tools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
    const mg = $('#btnMagnet'); if (mg) mg.setAttribute('aria-pressed', String(!!this.settings.magnet));
    const av = $('#tools [data-tool="avwap"]'); if (av) av.classList.toggle('has', !!this.avwap);
  },
  addDrawing(d) { d.id = Date.now() + Math.random(); if (this.replay.active) d.rid = this.replay.id; this.drawings.push(d); this.selDrawing = d; this.saveDrawings(); },
  /* Export sperren, solange eine Blind-Session läuft (Datei würde das echte Datum enthalten) */
  blindExportBlocked() {
    if (!this.isBlind()) return false;
    this.toast('Während einer Blind-Session ist der Export gesperrt – er würde das Datum verraten. Beende erst die Session.', 'warn');
    return true;
  },
  deleteSelected() {
    const d = this.selDrawing; if (!d) return false;
    const pos = this.drawings.indexOf(d), sym = this.symbol;
    this.drawings = this.drawings.filter((x) => x !== d); this.selDrawing = null; this.saveDrawings(); this.requestRender();
    this.undoToast('Zeichnung gelöscht.', () => { if (this.symbol !== sym) return; this.drawings.splice(Math.max(0, pos), 0, d); this.saveDrawings(); this.requestRender(); });
    return true;
  },

  /* ---------- Replay ---------- */
  togglePick() {
    if (!this.base || this.replay.active) return;
    this.replay.picking = !this.replay.picking;
    this.updateReplayBar(); this.requestRender();
  },
  startReplayAt(idx, opt) {
    opt = opt || {};
    idx = Math.max(1, Math.min(this.base.length - 2, idx));
    this.replay.active = true; this.replay.picking = false; this.replay.playing = false;
    this.replay.id = Date.now();
    this.replay.startT = this.base[idx].t; this.replay.sym = this.symbol;
    this.replay.blind = !!opt.blind; this.replay.sessionId = opt.sessionId || null;
    this.cursor = idx;
    this.engine = new Core.Engine(this.costCfg());
    this.charts.forEach((c) => { c.view.rightIdx = null; c.view.auto = true; c.lastN = 0; });
    this.updateReplayBar(); this.updateHeader(); this.updatePanels(); this.requestRender();
    this.setStatus('Replay läuft – alles rechts vom Cursor ist ausgeblendet.');
    this.saveResume();
    return this.replay.id;
  },
  randomStart() {
    const ss = this.series.sessions.filter((s, i) => i >= 1 && s.i1 - s.i0 > 20 && s.i1 < this.base.length - 5);
    if (!ss.length) { this.startReplayAt(Math.floor(this.base.length * (0.2 + Math.random() * 0.6))); return; }
    const s = ss[Math.floor(Math.random() * ss.length)];
    this.startReplayAt(s.i0 + Math.floor(Math.random() * (s.i1 - s.i0) * 0.5));
  },
  costKey() { return Core.costKeyFor(this.instKey, this.pv, this.qtyStep); },
  cost() { return this.settings.cost[this.costKey()]; },
  applyCostProfile() { if (this.engine) Object.assign(this.engine.cfg, this.costCfg()); this.updatePanels(); },
  costCfg() { return Core.costCfgFor(this.costKey(), this.cost(), this.tick, this.pv, this.settings.intrabar, this.qtyStep); },
  advanceTo(target) {
    if (!this.replay.active) return;
    target = Math.min(target, this.base.length - 1);
    let stopped = false;
    while (this.cursor < target) {
      this.cursor++;
      const ev = this.engine.onBar(this.base[this.cursor], this.cursor);
      if (ev.length) {
        this.handleEvents(ev);
        if (this.settings.replay.pauseOnFill && this.replay.playing && ev.some((e) => e.type !== 'be')) { this.pause(); stopped = true; break; }
      }
    }
    if (this.cursor >= this.base.length - 1) { this.pause(); if (!stopped) this.setStatus('Ende der Daten erreicht.'); }
    this.updatePanels(); this.updateReplayBar(); this.requestRender();
  },
  stepOnce() {
    if (!this.replay.active) return;
    const u = this.settings.replay.unit;
    if (u === 'base') { this.advanceTo(this.cursor + 1); return; }
    const tf = u === 'chart' ? (this.activeChart || this.charts[0]).tf : +u;
    const agg = this.getAgg(tf);
    const next = Math.min(this.base.length - 1, this.cursor + 1);
    this.advanceTo(agg.bars[agg.map[next]].i1);
  },
  play() {
    if (!this.replay.active || this.replay.playing) return;
    this.replay.playing = true; this.updateReplayBar();
    let last = performance.now(), acc = 0;
    const loop = (now) => {
      if (!this.replay.playing) return;
      acc += (now - last) / 1000 * this.settings.replay.speed; last = now;
      if (acc >= 1) { const n = Math.floor(acc); acc -= n; this.advanceTo(this.cursor + n); }
      if (this.replay.playing) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  pause() { this.replay.playing = false; this.updateReplayBar(); },
  togglePlay() { if (this.replay.active) (this.replay.playing ? this.pause() : this.play()); },
  async stopReplay() {
    if (!this.replay.active) { this.replay.picking = false; this.updateReplayBar(); this.requestRender(); return; }
    const open = this.engine.open().length, pend = this.engine.pending().length;
    if (open || pend) {
      const parts = [];
      if (open) parts.push(open === 1 ? '1 offene Position wird zum aktuellen Kurs geschlossen.' : open + ' offene Positionen werden zum aktuellen Kurs geschlossen.');
      if (pend) parts.push(pend === 1 ? '1 wartende Order wird gelöscht.' : pend + ' wartende Orders werden gelöscht.');
      const ok = await this.confirm('Replay beenden?', parts.join(' '), 'Beenden');
      if (!ok) return;
    }
    const rid = this.replay.id, meta = { sym: this.replay.sym, startT: this.replay.startT, endT: this.nowT() };
    const hasSess = this.sessions && this.sessions.some((s) => s.replayId === rid);
    this.forceStopReplay();
    if (hasSess || this.journal.some((j) => j.replay === rid)) this.openSession({ replayId: rid, meta, ended: true });
  },
  forceStopReplay() {
    if (this.engine) {
      const bar = this.base[this.cursor];
      for (const o of this.engine.open()) { this.engine.closeAtMarket(o, bar, this.cursor, 'Replay beendet'); this.recordClosed(o); }
      for (const o of this.engine.pending()) this.engine.cancel(o);
    }
    if (this.sessions) { const s = this.sessions.find((x) => x.replayId === this.replay.id); if (s && s.running) { s.running = false; s.to = this.nowT(); this.saveSessions(); } }
    this.pause();
    this.cancelPosDraft();
    const endedRid = this.replay.id;
    this.replay.active = false; this.replay.picking = false; this.replay.blind = false; this.engine = null; this.preview = null;
    this.clearResume();
    try { this.runPostChecks(endedRid); } catch (e) { console.warn('Nachlauf-Prüfung fehlgeschlagen', e); }
    if (this.tool === 'long' || this.tool === 'short') this.tool = 'cursor';
    this.cursor = this.base.length - 1;
    this.charts.forEach((c) => { c.view.rightIdx = null; c.lastN = 0; });
    this.setStatus('');
    this.updateReplayBar(); this.updateHeader(); this.updatePanels(); this.updateToolbar(); this.requestRender();
  },
  /* Vorspulen: im Blind-Modus nur Uhrzeit (nächstes Vorkommen nach dem Cursor) */
  jumpToInput() {
    const val = $('#jumpTime').value;
    if (!val || !this.replay.active) return;
    let t;
    const tz = this.settings.tz;
    let m = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) t = Core.zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], 0, tz);
    else if ((m = val.match(/^(\d{2}):(\d{2})/))) {
      const p = Core.localParts(this.nowT(), tz);
      t = Core.zonedToUtc(p.y, p.m, p.d, +m[1], +m[2], 0, tz);
      if (t <= this.nowT()) t = Core.zonedToUtc(p.y, p.m, p.d + 1, +m[1], +m[2], 0, tz);
    } else return;
    const idx = Core.lowerBound(this.base.map((b) => b.t), t + 1) - 1;
    if (idx <= this.cursor) { this.toast('Im Replay geht es nur vorwärts. Für einen früheren Zeitpunkt das Replay beenden und neu starten.', 'warn'); return; }
    this.advanceTo(idx);
  },

  /* ---------- Orders ---------- */
  handleEvents(ev) {
    for (const e of ev) {
      const o = e.o;
      if (e.type === 'fill') { this.setStatus((o.side > 0 ? 'Long' : 'Short') + ' gefüllt @ ' + this.fmtP(o.entryPrice)); this.autoPhoto(o, 'auto-entry'); }
      if (e.type === 'partial') this.setStatus('TP1: ' + this.fmtQ(e.p.qty) + ' geschlossen @ ' + this.fmtP(e.p.price) + ' (' + this.fmtMoney(e.p.pnl, true) + ')');
      if (e.type === 'be') this.setStatus('Stop auf Einstand nachgezogen.');
      if (e.type === 'exit') {
        this.recordClosed(o);
        this.toast((o.reason === 'TP' ? 'Take-Profit' : o.reason === 'SL' ? 'Stop-Loss' : o.reason) + ': ' + this.fmtMoney(o.pnl, true) + (o.r != null ? ' (' + this.fmtR(o.r) + ')' : ''), o.pnl >= 0 ? 'good' : 'bad');
      }
    }
  },
  tradeId(o) { return this.replay.id + '-' + o.id; },
  recordClosed(o) {
    if (o._recorded) return; o._recorded = true;
    this.journal.push({
      id: this.tradeId(o), sym: this.symbol, src: this.source, replay: this.replay.id, session: this.replay.sessionId || null, blind: this.replay.blind || undefined,
      side: o.side, type: o.type, qty: o.qtyInit || o.qty, entryT: o.entryT, entryPrice: o.entryPrice, exitT: o.exitT, exitPrice: o.exitPrice, avgExit: o.avgExit,
      sl: o.slInit != null ? o.slInit : o.sl, slFinal: o.sl, tp: o.tp, reason: o.reason, pnl: o.pnl, gross: o.gross, fees: o.fees, r: o.r, risk: o.risk,
      points: o.points, mae: o.mae, mfe: o.mfe, maeR: o.maeR, mfeR: o.mfeR, plannedR: o.plannedR,
      partials: o.partials && o.partials.length > 1 ? o.partials.map((p) => ({ qty: p.qty, price: p.price, t: p.t, reason: p.reason, pnl: p.pnl })) : undefined,
      setup: o.setup || '', note: o.note || '', pv: this.pv, tick: this.tick, sess: this.sess, status: 'closed',
      riskTarget: o.riskTarget || undefined, rulesTotal: o.rulesTotal || undefined, rulesChecked: o.rulesTotal ? o.rulesChecked : undefined, rulesOk: o.rulesTotal ? o.rulesOk : undefined, ctx: o.ctx || undefined
    });
    this.saveJournal();
    this.autoPhoto(o, 'auto-exit');
  },
  /* Automatisches Chart-Foto (Einstieg/Ausstieg) – nach dem nächsten Rendern */
  /* Das Bild wird sofort (synchron) am aktuellen Cursor gezeichnet – nie nach einem Sprung ans Datenende */
  async autoPhoto(o, kind) {
    if (!this.settings.photos || typeof Photos === 'undefined' || !Photos.ok) return;
    const owner = this.tradeId(o);
    try {
      const c = this.activeChart || this.charts[0]; if (!c || !c.W) return;
      this.photoCursor = this.cursor;
      const p = c.snapshot(1400, 0.7);
      const blob = await p;
      if (blob) await Photos.add(owner, kind, blob);
    } catch (e) { console.warn('Foto fehlgeschlagen', e); }
  },
  ticketVals() {
    const T = this.settings.ticket;
    return { type: T.type, slPts: +T.slPts, tpR: +T.tpR, risk: +T.risk, riskMode: T.riskMode, qtyMode: T.qtyMode, qty: +T.qty, price: +T.price };
  },
  mgmt() {
    const T = this.settings.ticket;
    const m = { tp1R: +T.tp1R || 0, tp1Pct: +T.tp1Pct || 0, beR: +T.beR || 0, trail: +T.trail || 0 };
    return m.tp1R > 0 || m.beR > 0 || m.trail > 0 ? m : null;
  },
  balance() { return this.settings.account.start + this.journal.reduce((s, j) => s + (this.seen(j) ? (j.pnl || 0) : 0), 0); },
  riskMoney() { const T = this.ticketVals(); return T.riskMode === 'pct' ? this.balance() * T.risk / 100 : T.risk; },
  /* Netto-Ergebnis einer (geplanten) Order bei Ausstieg zu price */
  netFor(side, entry, price, qty, isStop) {
    const c = this.costCfg();
    const px = isStop ? price - side * c.slipTicks * c.tick : price;
    const gross = side * (px - entry) * qty * this.pv;
    const fees = qty * c.feeFix * 2 + (entry + px) * qty * this.pv * c.feePct / 100;
    return gross - fees;
  },
  /* berechnet Order aus Ticket (oder aus festen Preisen des Positions-Werkzeugs) */
  buildOrder(side, fixed) {
    const T = this.ticketVals(), px = this.price(), tick = this.tick;
    let entry, type = 'market', sl, tp;
    if (fixed) {
      entry = Core.roundTick(fixed.entry, tick);
      if (Math.abs(entry - px) >= tick / 2) type = side > 0 ? (entry < px ? 'limit' : 'stop') : (entry > px ? 'limit' : 'stop');
      sl = fixed.sl != null ? Core.roundTick(fixed.sl, tick) : null; tp = fixed.tp != null ? Core.roundTick(fixed.tp, tick) : null;
    } else {
      const isPend = T.type === 'pending';
      if (isPend && !(T.price > 0)) return { err: 'Bitte einen Einstiegspreis eingeben (oder Shift+Klick in den Chart).' };
      entry = isPend ? Core.roundTick(T.price, tick) : px;
      if (isPend) {
        if (Math.abs(entry - px) < tick / 2) return { err: 'Einstieg liegt genau am Kurs – nimm Market.' };
        type = side > 0 ? (entry < px ? 'limit' : 'stop') : (entry > px ? 'limit' : 'stop');
      }
      const slD = T.slPts > 0 ? Core.roundTick(T.slPts, tick) : 0;
      sl = slD > 0 ? Core.roundTick(entry - side * slD, tick) : null;
      tp = slD > 0 && T.tpR > 0 ? Core.roundTick(entry + side * slD * T.tpR, tick) : null;
    }
    const slipP = (+this.cost().slipTicks || 0) * tick;
    const estEntry = type === 'market' ? px + side * slipP : type === 'stop' ? entry + side * slipP : entry;
    if (sl != null && side * (estEntry - sl) <= 0) return { err: 'Stop-Loss liegt auf der falschen Seite des Einstiegs.' };
    if (tp != null && side * (tp - estEntry) <= 0) return { err: 'Ziel liegt auf der Verlustseite.' };
    let qty, over = false;
    const riskMoney = this.riskMoney();
    if (T.qtyMode === 'risk') {
      if (sl == null) return { err: 'Für Größe nach Risiko wird ein Stop-Loss gebraucht.' };
      qty = Core.sizeFromRisk(riskMoney, estEntry, sl, this.pv, this.qtyStep);
      /* Knapp zu wenig Risiko für die kleinste Größe (z. B. wegen Slippage): bis 10 % drüber erlauben, mit Hinweis */
      if (!(qty > 0) && Math.abs(estEntry - sl) * this.pv * this.qtyStep <= riskMoney * 1.1) { qty = this.qtyStep; over = true; }
      if (!(qty > 0)) return { err: 'Risiko zu klein für 1 ' + (this.qtyStep >= 1 ? 'Kontrakt' : 'Einheit') + ' bei diesem Stop. Mind. ' + this.fmtMoney(Math.abs(estEntry - sl) * this.pv * this.qtyStep) + ' nötig.' };
    } else qty = Core.floorStep(T.qty, this.qtyStep);
    if (!(qty > 0)) return { err: 'Menge muss größer als 0 sein.' };
    const riskReal = sl != null ? Math.abs(estEntry - sl) * qty * this.pv : null;
    const slNet = sl != null ? this.netFor(side, estEntry, sl, qty, true) : null;
    const tpNet = tp != null ? this.netFor(side, estEntry, tp, qty, false) : null;
    return { side, type, price: entry, sl, tp, qty, riskReal, riskMoney, estEntry, slNet, tpNet, tpR: tpNet != null && riskReal ? tpNet / riskReal : null, over };
  },
  placeOrder(side, fixed) {
    if (!this.replay.active) { this.toast('Starte zuerst ein Replay (unten „Neue Session“), dann kannst du handeln.', 'warn'); return null; }
    const b = this.buildOrder(side, fixed);
    if (b.err) { this.toast(b.err, 'warn'); return null; }
    const T = this.settings.ticket;
    /* Doppelklick-Schutz: Klicks kurz nach dem Platzieren treffen sonst die neu eingeblendete Positionskarte */
    this.clickLockUntil = Date.now() + 450;
    /* Für die Fehler-Analyse: Ziel-Risiko, Regel-Check und Markt-Kontext beim Platzieren (nur Werte bis zum Cursor) */
    const boxes = T.setup ? $$('#tkRules input') : [];
    const extra = { riskTarget: b.riskMoney > 0 ? +b.riskMoney.toFixed(2) : undefined, ctx: this.entryCtx(b.type === 'market' ? b.estEntry : b.price) };
    if (boxes.length) Object.assign(extra, { rulesTotal: boxes.length, rulesChecked: boxes.filter((c) => c.checked).length, rulesOk: boxes.every((c) => c.checked) });
    const o = this.engine.place(Object.assign({ side, type: b.type, price: b.price, qty: b.qty, sl: b.sl, tp: b.tp, setup: T.setup, note: T.note, mgmt: this.mgmt() }, extra), this.base[this.cursor], this.cursor);
    o.slInit = o.sl;
    if (b.type === 'market') { this.setStatus((side > 0 ? 'Long' : 'Short') + ' ' + this.fmtQ(o.qty) + ' @ ' + this.fmtP(o.entryPrice) + (o.risk ? ' · Risiko ' + this.fmtMoney(o.risk) : '')); this.autoPhoto(o, 'auto-entry'); }
    else this.setStatus((side > 0 ? 'Buy ' : 'Sell ') + (b.type === 'limit' ? 'Limit' : 'Stop') + ' ' + this.fmtQ(o.qty) + ' @ ' + this.fmtP(o.price) + ' platziert');
    this.updatePanels(); this.requestRender();
    return o;
  },
  /* Kontext am Cursor: Seite/Abstand zum Session-VWAP, ATR, Delta der letzten Kerze, CVD-Steigung (10 Kerzen) */
  entryCtx(px) {
    const s = this.series, i = this.cursor; if (!s || !this.base || !isFinite(px)) return undefined;
    const vw = s.vwap[i], sd = s.sd[i], d = this.dec() + 1, atr = this.atrNow(this.baseTf);
    return { vwapSide: Math.abs(px - vw) < this.tick / 2 ? 0 : px > vw ? 1 : -1, vwapDist: +(px - vw).toFixed(d), vwapSd: sd > 0 ? +((px - vw) / sd).toFixed(2) : null,
      atr: isFinite(atr) ? +atr.toFixed(d) : null, deltaLast: Math.round(this.base[i].d), cvdSlope: i >= 10 ? Math.round(s.cvd[i] - s.cvd[i - 10]) : null,
      news: this.econOn() ? Econ.ctxAt(this.econNow()) || undefined : undefined };
  },
  /* Wirtschaftstermine: nur Märkte mit US-Bezug; „jetzt“ = Ende der zuletzt sichtbaren Basis-Kerze */
  econOn() { return typeof Econ !== 'undefined' && !!this.base && Econ.relevant(this.instKey); },
  econNow() { return this.nowT() + this.baseTf; },
  /* Nachlauf-Prüfung erst NACH dem Ende der Session (Daten liegen vor, Replay ist aus) – während des Replays nie */
  runPostChecks(rid) {
    if (this.replay.active || !this.base || rid == null) return 0;
    let n = 0;
    for (const j of this.journal) {
      if (j.replay !== rid || j.sym !== this.symbol || j.post) continue;
      const p = Core.postCheck(this.base, this.baseTf, j, { bars: Core.ANALYSE.postBars });
      if (p) { j.post = p; n++; }
    }
    if (n) this.saveJournal();
    return n;
  },
  linePrice(o, f, def) { return this.preview && this.preview.o === o && this.preview.f === f ? this.preview.price : def; },
  previewOrderLine(o, f, price) { this.preview = { o, f, price }; },
  /* Risiko-Kennzahlen für einen Stop-Preis: aktuelles R gegenüber dem Ursprungsrisiko */
  slInfo(o, sl) {
    const ent = o.status === 'open' ? o.entryPrice : o.price;
    const q = o.qtyOpen != null ? o.qtyOpen : o.qty;
    const risk0 = o.risk || (o.slInit != null ? Math.abs(ent - o.slInit) * o.qty * this.pv : null);
    const net = o.status === 'open' ? this.engine.netAt(o, sl, q, true) : this.netFor(o.side, ent, sl, q, true);
    const r0 = risk0 ? -1 : null;
    return { net, r: risk0 ? net / risk0 : null, r0, risk0, ptsRisk: o.side * (ent - sl) };
  },
  modifyOrder(o, f, price) {
    this.preview = null;
    const px = this.price();
    const ent = o.status === 'open' ? o.entryPrice : o.price;
    if (f === 'sl') {
      if (o.status === 'open' && (o.side > 0 ? price >= px : price <= px)) this.toast('Achtung: Stop liegt auf der falschen Seite des Kurses und löst bei der nächsten Kerze aus.', 'warn');
      if (o.status === 'pending' && o.side * (ent - price) <= 0) { this.toast('Stop muss auf der Verlustseite des Einstiegs liegen – zurückgesetzt.', 'warn'); this.requestRender(); return false; }
      const oldPts = o.slInit != null ? Math.abs(ent - o.slInit) : null;
      const newPts = o.side * (ent - price);
      o.sl = price; if (o.status === 'pending') o.slInit = price;
      if (o.status === 'open' && oldPts && newPts > oldPts * 1.5) {
        const inf = this.slInfo(o, price);
        this.toast('Stop vergrößert: Risiko jetzt ' + this.fmtR(inf.r) + ' statt −1,00R. Bewusst so?', 'warn');
      }
    } else if (f === 'tp') {
      if (o.side * (price - ent) <= 0) { this.toast('Ziel auf der Verlustseite des Einstiegs ist nicht möglich – zurückgesetzt.', 'warn'); this.requestRender(); return false; }
      o.tp = price;
    } else if (f === 'price' && o.status === 'pending') {
      const d = price - o.price;
      o.price = price;
      if (o.sl != null) o.sl = Core.roundTick(o.sl + d, this.tick);
      if (o.tp != null) o.tp = Core.roundTick(o.tp + d, this.tick);
      o.slInit = o.sl;
      o.type = o.side > 0 ? (price < px ? 'limit' : 'stop') : (price > px ? 'limit' : 'stop');
    }
    this.updatePanels(); this.requestRender();
    return true;
  },
  nudge(o, f, ticks) {
    const cur = f === 'sl' ? o.sl : o.tp; if (cur == null) return;
    this.modifyOrder(o, f, Core.roundTick(cur + ticks * this.tick, this.tick));
  },
  closePos(o) {
    if (o.status === 'pending') { this.engine.cancel(o); this.setStatus('Order gelöscht.'); }
    else if (o.status === 'open') {
      this.engine.closeAtMarket(o, this.base[this.cursor], this.cursor, 'Manuell');
      this.recordClosed(o);
      this.toast('Geschlossen: ' + this.fmtMoney(o.pnl, true) + (o.r != null ? ' (' + this.fmtR(o.r) + ')' : ''), o.pnl >= 0 ? 'good' : 'bad');
    }
    this.updatePanels(); this.requestRender();
  },
  closeAll() {
    if (!this.engine) return;
    for (const o of this.engine.orders.slice()) if (o.status === 'open' || o.status === 'pending') this.closePos(o);
  },
  breakeven(o) {
    if (o.status !== 'open') return;
    const px = this.price();
    if (o.side > 0 ? px <= o.entryPrice : px >= o.entryPrice) { this.toast('Break-even geht erst, wenn der Trade im Plus ist.', 'warn'); return; }
    o.sl = o.entryPrice; o.beDone = true; this.setStatus('Stop auf Einstand gesetzt.'); this.updatePanels(); this.requestRender();
  },
  setTicketPrice(p) {
    this.settings.ticket.price = p; this.settings.ticket.type = 'pending';
    $('#tkPrice').value = this.fmtP(p);
    $$('#tkType button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === 'pending')));
    $('#tkPriceRow').hidden = false;
    this.saveSettings(); this.updateTicketPreview();
    this.setStatus('Einstiegspreis ' + this.fmtP(p) + ' übernommen.');
  },

  /* ---------- Positions-Werkzeug (Long/Short direkt im Chart) ---------- */
  startPosDraft(side, price) {
    if (!this.replay.active) return;
    const T = this.settings.ticket, tick = this.tick;
    const entry = Core.roundTick(price, tick);
    const slD = Core.roundTick(+T.slPts > 0 ? +T.slPts : tick * 20, tick);
    const tpR = +T.tpR > 0 ? +T.tpR : 2;
    this.posDraft = { side, entry, sl: Core.roundTick(entry - side * slD, tick), tp: Core.roundTick(entry + side * slD * tpR, tick) };
    this.setTool('cursor');
    this.updatePosDraft();
  },
  draftInfo() {
    const d = this.posDraft; if (!d) return null;
    const b = this.buildOrder(d.side, d);
    return b;
  },
  movePosDraft(f, price) {
    const d = this.posDraft; if (!d) return;
    price = Core.roundTick(price, this.tick);
    if (f === 'entry') { const dlt = price - d.entry; d.entry = price; d.sl = Core.roundTick(d.sl + dlt, this.tick); d.tp = Core.roundTick(d.tp + dlt, this.tick); }
    else if (f === 'sl') { if (d.side * (d.entry - price) > 0) d.sl = price; }
    else if (f === 'tp') { if (d.side * (price - d.entry) > 0) d.tp = price; }
    this.requestRender();
  },
  /* Während eines Entwurfs ist die Aktionsleiste gesperrt (sonst trifft „Platzieren“ auf dem Handy „Verkaufen“) */
  updatePosDraft() {
    const on = !!this.posDraft;
    document.body.classList.toggle('has-draft', on);
    for (const id of ['#mBuy', '#mSell', '#mPlay', '#mStep', '#fsBuy', '#fsSell']) { const b = $(id); if (b) b.disabled = on; }
    this.charts.forEach((c) => c.updateConfirm()); this.requestRender();
  },
  confirmPosDraft() {
    const d = this.posDraft; if (!d) return;
    const o = this.placeOrder(d.side, d);
    if (o) { this.posDraft = null; this.updatePosDraft(); }
  },
  cancelPosDraft() { if (!this.posDraft) return; this.posDraft = null; this.selLine = null; this.updatePosDraft(); },
  /* Ausgewählte SL/TP/Einstiegs-Linie per Pfeiltaste verschieben */
  nudgeLine(dir, big) {
    const s = this.selLine; if (!s || !this.replay.active) return false;
    const step = this.tick * (big ? 10 : 1) * dir;
    if (s.draft) {
      const d = this.posDraft; if (!d) { this.selLine = null; return false; }
      const cur = s.f === 'entry' ? d.entry : s.f === 'sl' ? d.sl : d.tp;
      this.movePosDraft(s.f, cur + step); return true;
    }
    const o = s.o; if (!o || (o.status !== 'open' && o.status !== 'pending')) { this.selLine = null; return false; }
    const cur = s.f === 'price' ? o.price : s.f === 'sl' ? o.sl : o.tp;
    if (cur == null) return false;
    this.modifyOrder(o, s.f, Core.roundTick(cur + step, this.tick)); return true;
  },

  /* ---------- Session fortsetzen nach Neuladen/Schließen ---------- */
  resumeState() {
    if (!this.replay.active || !this.base || !this.engine) return null;
    const keep = (o) => o.status === 'open' || o.status === 'pending';
    return {
      v: 1, savedAt: Date.now(), src: this.dsSrc, sym: this.symbol, source: this.source, t: this.nowT(),
      replay: { id: this.replay.id, blind: !!this.replay.blind, sessionId: this.replay.sessionId || null, startT: this.replay.startT, sym: this.replay.sym },
      engine: { nextId: this.engine.nextId, orders: JSON.parse(JSON.stringify(this.engine.orders.filter(keep))) },
      drawings: this.drawings.filter((d) => d.type !== 'measure'),
      avwap: this.avwap ? this.base[this.avwap.idx].t : null
    };
  },
  saveResume() {
    clearTimeout(this._resT); this._resT = 0;
    const st = this.resumeState();
    if (st) store.set('elr.resume', st);
  },
  scheduleResume() { if (this.replay.active && !this._resT) this._resT = setTimeout(() => { this._resT = 0; this.saveResume(); }, 2000); },
  clearResume() { clearTimeout(this._resT); this._resT = 0; try { localStorage.removeItem('elr.resume'); } catch (_) { /* egal */ } },
  pendingResume() { const st = store.get('elr.resume', null); return st && st.v === 1 && st.replay && st.engine ? st : null; },
  /* Gespeicherten Stand verwerfen: Session als beendet markieren, offene Orders verfallen */
  discardResume() {
    const st = this.pendingResume(); this.clearResume();
    if (st && this.sessions) { const s = this.sessions.find((x) => x.replayId === st.replay.id); if (s && s.running) { s.running = false; s.to = st.t; this.saveSessions(); } }
    if (this.onPanels) this.onPanels();
  },
  /* Daten neu laden und Replay am gespeicherten Punkt fortsetzen */
  async resumeSession(st) {
    st = st || this.pendingResume(); if (!st) return false;
    const src = st.src || {};
    if (src.kind === 'csv' || !src.kind) {
      this.resumeWait = st;
      return 'csv';
    }
    const prog = (p, txt) => this.setChartsLoading(txt || 'Lade Daten der Session …', p);
    prog(0);
    try {
      if (src.kind === 'demo') { await raf2(); Loader.demo(true); }
      else if (src.kind === 'archive') {
        await Archive.loadIndex();
        const inst = Archive.inst(src.id); if (!inst) throw new Error('Markt ' + src.id + ' ist nicht mehr im Archiv.');
        const bars = await Archive.range(src.id, src.fromT, src.toT, (p) => prog(p));
        this.loadDataset(Object.assign(Archive.dataset(inst, bars), { src })); this.applyCostProfile();
      } else if (src.kind === 'binance') {
        const info = await Binance.info(src.market, src.symbol);
        const bars = await Binance.klines(src.market, src.symbol, src.interval, src.fromMs, src.toMs, (p) => prog(p));
        this.loadDataset(Loader.binanceDataset(src, bars, info)); this.applyCostProfile();
      }
      this.restoreReplay(st);
      return true;
    } finally { this.setChartsLoading(null); }
  },
  restoreReplay(st) {
    const idx = Core.lowerBound(this.base.map((b) => b.t), st.t + 1) - 1;
    if (idx < 1) throw new Error('Der gespeicherte Zeitpunkt liegt nicht in den Daten.');
    this.startReplayAt(idx, { blind: st.replay.blind, sessionId: st.replay.sessionId });
    Object.assign(this.replay, { id: st.replay.id, startT: st.replay.startT, sym: st.replay.sym || this.symbol });
    this.engine.nextId = st.engine.nextId || 1;
    this.engine.orders = (st.engine.orders || []).map((o) => Object.assign({}, o));
    if (Array.isArray(st.drawings) && st.sym === this.symbol) { this.drawings = st.drawings; this.saveDrawings(); }
    if (st.avwap != null) { const a = Core.lowerBound(this.base.map((b) => b.t), st.avwap); if (a < this.base.length) this.avwap = { idx: a }; }
    this.resumeWait = null;
    this.updateReplayBar(); this.updateHeader(); this.updatePanels(); this.updateToolbar(); this.requestRender();
    this.saveResume();
    this.setStatus('Session fortgesetzt' + (st.replay.blind ? ' (Blind-Modus)' : '') + '.');
  },

  /* ---------- Vollbild ---------- */
  setFullscreen(on) {
    on = on == null ? !document.body.classList.contains('fs') : !!on;
    if (on && this.view !== 'charts') location.hash = '#charts';
    document.body.classList.toggle('fs', on);
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } catch (_) { /* nicht erlaubt – CSS-Vollbild reicht */ }
    $('#btnFs').setAttribute('aria-pressed', String(on));
    this.updateFsPanel();
    setTimeout(() => { this.charts.forEach((c) => c.resize()); this.requestRender(); }, 60);
  },
  isFs() { return document.body.classList.contains('fs'); },

  /* ---------- UI: Panels ---------- */
  updateHeader() {
    $('#dsLabel').textContent = this.symbol || 'Keine Daten';
    $('#dsSub').textContent = this.base ? this.source + ' · Basis ' + Core.tfLabel(this.baseTf) : '';
    const bd = $('#dsBadge');
    if (this.base) { bd.hidden = false; bd.textContent = 'Tick ' + this.fmtN(this.tick, Core.decimalsOf(this.tick)) + (this.pv !== 1 ? ' · ' + this.fmtN(this.pv, this.pv % 1 ? 1 : 0) + ' $/Punkt' : ''); }
    else bd.hidden = true;
    $$('#chartBar [data-ind]').forEach((b) => b.setAttribute('aria-pressed', String(!!this.settings.ind[b.dataset.ind])));
    $('#lowerSel').value = this.settings.ind.lower;
    $$('#emaBar [data-ema]').forEach((b) => { const e = this.settings.emas[+b.dataset.ema]; b.textContent = 'EMA ' + e.p; b.setAttribute('aria-pressed', String(e.on)); });
    $('#blindBadge').hidden = !this.isBlind();
    this.charts.forEach((c) => c.fillTfSelect());
    this.updateTicketUnits();
  },
  updateTicketUnits() {
    $('#tkQtyLbl').textContent = this.qtyStep >= 1 && this.pv !== 1 ? 'Kontrakte' : 'Menge';
  },
  updateTicketPreview() {
    const el = $('#tkPreview');
    if (!this.base) { el.textContent = ''; return; }
    const L = this.buildOrder(1), S = this.buildOrder(-1);
    const T = this.settings.ticket;
    const one = (b, nm) => b.err ? '<div class="pv-err">' + nm + ': ' + esc(b.err) + '</div>' :
      '<div class="pv-row"><b class="' + (b.side > 0 ? 'up' : 'dn') + '">' + nm + ' ' + this.fmtQ(b.qty) + '</b><span>' + (b.type === 'market' ? 'Market' : b.type === 'limit' ? 'Limit' : 'Stop') + ' @ ' + this.fmtP(b.type === 'market' ? b.estEntry : b.price) + '</span></div>' +
      '<div class="pv-row sub"><span>SL ' + (b.slNet != null ? this.fmtMoney(b.slNet, true) : '–') + '</span><span>TP ' + (b.tpNet != null ? this.fmtMoney(b.tpNet, true) + ' · ' + this.fmtR(b.tpR) : '–') + ' netto</span></div>';
    el.innerHTML = (L.err && S.err && L.err === S.err) ? '<div class="pv-err">' + esc(L.err) + '</div>' : one(L, 'Long') + one(S, 'Short');
    const rh = $('#tkRiskHint');
    rh.hidden = T.riskMode !== 'pct'; rh.textContent = T.riskMode === 'pct' ? '= ' + this.fmtMoney(this.riskMoney()) : '';
    const atr = this.atrNow((this.activeChart || this.charts[0] || { tf: this.baseTf }).tf);
    $('#tkAtr').textContent = isFinite(atr) ? 'ATR ' + this.fmtP(atr) : '';
    const mg = this.mgmt();
    $('#tkMgmtOn').textContent = mg ? [mg.tp1R > 0 ? 'TP1' : '', mg.beR > 0 ? 'Einstand' : '', mg.trail > 0 ? 'Trailing' : ''].filter(Boolean).join(' · ') : '';
  },
  openPnl() { return this.engine ? this.engine.unrealized(this.price()) : 0; },
  updateLive() {
    if (!this.base) return;
    const px = this.price();
    const u = this.openPnl();
    const bal = this.balance();
    $('#accBal').textContent = this.fmtMoney(bal);
    const cls = 'num ' + (u > 0 ? 'up' : u < 0 ? 'dn' : '');
    const ue = $('#accUnr'); ue.textContent = this.fmtMoney(u, true); ue.className = cls;
    $('#shBal').textContent = this.fmtMoney(bal); const su = $('#shUnr'); su.textContent = this.fmtMoney(u, true); su.className = cls;
    const mp = $('#mPnl'); mp.textContent = this.fmtMoney(u, true); mp.className = 'act-only ' + cls;
    const fp = $('#fsPnl'); if (fp) { fp.textContent = this.engine && (this.engine.open().length) ? this.fmtMoney(u, true) : ''; fp.className = cls; }
    $('#accPx').textContent = this.fmtP(px);
    if (this.engine) for (const o of this.engine.open()) {
      const v = this.engine.netAt(o, px, null, false);
      for (const el of $$('[data-pnl="' + o.id + '"]')) { el.textContent = this.fmtMoney(v, true) + (o.risk ? ' · ' + this.fmtR(v / o.risk) : ''); el.className = 'num ' + (v >= 0 ? 'up' : 'dn'); }
    }
  },
  updatePanels() {
    this.scheduleResume();
    this.updateTicketPreview();
    this.renderPositions();
    this.updateLive();
    this.renderProp();
    this.updateFsPanel();
    if (this.onPanels) this.onPanels();
  },
  posHtml(compact) {
    if (!this.engine) return '<p class="empty">' + (this.replay.active ? '' : 'Handeln geht im Replay. Unten <b>Neue Session</b> oder <b>Startpunkt wählen</b>.') + '</p>';
    const act = this.engine.orders.filter((o) => o.status === 'open' || o.status === 'pending');
    if (!act.length) return '<p class="empty">Keine offenen Positionen oder Orders.</p>';
    const now = Date.now();
    return act.map((o) => {
      if (!o._shownAt) o._shownAt = now; /* für den Doppelklick-Schutz */
      const dir = o.side > 0 ? '<b class="up">Long</b>' : '<b class="dn">Short</b>';
      const q = o.qtyOpen != null ? o.qtyOpen : o.qty;
      const head = o.status === 'open' ? dir + ' ' + this.fmtQ(q) + ' @ ' + this.fmtP(o.entryPrice) : dir + ' ' + (o.type === 'limit' ? 'Limit' : 'Stop') + ' ' + this.fmtQ(o.qty) + ' @ ' + this.fmtP(o.price) + ' <span class="tag">wartet</span>';
      const adj = (f, lbl, v) => v == null ? '<div class="adj"><span><em>' + lbl + '</em>–</span></div>' : '<div class="adj"><button data-act="' + f + '-" aria-label="' + lbl + ' einen Tick enger">−</button><span><em>' + lbl + '</em>' + this.fmtP(v) + '</span><button data-act="' + f + '+" aria-label="' + lbl + ' einen Tick weiter">+</button></div>';
      return '<div class="pos ' + (o.status === 'pending' ? 'pend' : o.side > 0 ? 'long' : 'short') + '" data-id="' + o.id + '"><div class="pos-top"><span>' + head + '</span>' +
        (o.status === 'open' ? '<span data-pnl="' + o.id + '" class="num"></span>' : '') + '</div>' +
        (compact ? '' : '<div class="pos-adj">' + adj('sl', 'SL', o.sl) + adj('tp', 'TP', o.tp) + '</div>') +
        (o.tp1 != null && !o.tp1Done && !compact ? '<div class="hint">TP1 ' + this.fmtP(o.tp1) + ' schließt ' + this.fmtQ(o.tp1Qty) + '</div>' : '') +
        '<div class="pos-btns">' + (o.status === 'open' ? '<button class="btn sm" data-act="be">Break-even</button>' : '') +
        '<button class="btn sm" data-act="close">' + (o.status === 'open' ? 'Schließen' : 'Löschen') + '</button></div></div>';
    }).join('');
  },
  renderPositions() {
    $('#posList').innerHTML = this.posHtml(false);
    const n = this.engine ? this.engine.orders.filter((o) => o.status === 'open' || o.status === 'pending').length : 0;
    $('#posHead').textContent = 'Positionen & Orders' + (n ? ' (' + n + ')' : '');
    $('#btnCloseAll').hidden = !n;
  },
  updateFsPanel() {
    if (!this.isFs()) return;
    $('#fsPos').innerHTML = this.posHtml(true);
    const r = $('#fsRisk'); if (document.activeElement !== r) r.value = this.settings.ticket.risk;
    this.updateLive();
  },
  /* Prop-Regeln: im Replay nur Trades dieser Session (eigenes Konto je Session) */
  propCfg() { const P = this.settings.prop; return { start: this.settings.account.start, maxDD: +P.maxDD || 0, dailyLoss: +P.dailyLoss || 0, target: +P.target || 0 }; },
  renderProp() {
    const el = $('#propBox');
    const P = this.settings.prop;
    if (!P.on) { el.hidden = true; return; }
    el.hidden = false;
    const wasOpen = el.open;
    if (!this.replay.active) {
      const all = Core.propBySession(this.journal, this.propCfg(), this.sess);
      const ok = all.filter((x) => x.passed).length, br = all.filter((x) => x.breaches.length).length;
      el.innerHTML = '<summary><span>Prop-Regeln</span><span class="meter" style="visibility:hidden"></span><b>' + (all.length ? ok + ' bestanden · ' + br + ' verletzt' : 'je Session') + '</b></summary>' +
        '<div class="pb-body"><p class="hint">Jede Backtest-Session wird als eigenes Prop-Konto geprüft (Start ' + this.fmtMoney(this.settings.account.start) + ', Max. Drawdown ' + this.fmtMoney(+P.maxDD) + ', Tagesverlust ' + this.fmtMoney(+P.dailyLoss) + ', Ziel ' + this.fmtMoney(+P.target) + '). Details in der Statistik.</p></div>';
      el.open = wasOpen; return;
    }
    const list = this.journal.filter((j) => j.replay === this.replay.id);
    const res = Core.propCheck(list, this.propCfg(), this.sess);
    const u = this.openPnl();
    const bal = res.balance + u;
    const room = bal - res.floor;
    const pct = P.maxDD > 0 ? Math.max(0, Math.min(1, room / P.maxDD)) : 1;
    const toTarget = res.target ? res.target - res.balance : null;
    el.innerHTML = '<summary><span>Prop</span><span class="meter" role="meter" aria-valuenow="' + Math.round(pct * 100) + '" aria-valuemin="0" aria-valuemax="100" aria-label="Abstand zum Max-Drawdown"><i style="width:' + (pct * 100).toFixed(1) + '%" class="' + (pct < 0.25 ? 'crit' : pct < 0.5 ? 'warn' : '') + '"></i></span>' +
      (res.breaches.length ? '<b class="dn">verletzt</b>' : '<b class="up">Puffer ' + this.fmtMoney(room, false) + '</b>') + '</summary>' +
      '<div class="pb-body"><div class="pb-grid"><span>Verlust-Grenze</span><b>' + this.fmtMoney(res.floor) + '</b>' +
      '<span>Puffer</span><b>' + this.fmtMoney(room) + '</b>' +
      (P.dailyLoss > 0 ? '<span>Heute</span><b>' + this.fmtMoney(res.dayPnl + u, true) + ' / −' + this.fmtMoney(+P.dailyLoss) + '</b>' : '') +
      (toTarget != null ? '<span>Bis Ziel</span><b>' + (toTarget <= 0 ? 'erreicht' : this.fmtMoney(toTarget)) + '</b>' : '') + '</div>' +
      (res.breaches.length ? '<p class="pb-br">' + esc(res.breaches[res.breaches.length - 1].type) + ' am ' + this.fmtT(res.breaches[res.breaches.length - 1].t, 60) + '</p>' : '') + '</div>';
    el.open = wasOpen;
  },
  updateReplayBar() {
    const R = this.replay, bar = $('#replayBar');
    bar.dataset.state = R.active ? 'active' : R.picking ? 'picking' : 'idle';
    const ic = R.playing ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>' : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z"/></svg>';
    for (const b of [$('#btnPlay'), $('#mPlay')]) { b.setAttribute('aria-label', R.playing ? 'Pause' : 'Abspielen'); b.innerHTML = ic; }
    $('#rpTime').textContent = this.base && !this.hideData ? this.fmtT(this.nowT(), 60) : '';
    const pct = this.base ? this.cursor / (this.base.length - 1) * 100 : 0;
    $('#rpProg').style.width = (R.blind ? 0 : pct).toFixed(2) + '%';
    document.body.classList.toggle('is-replay', R.active);
    const jt = $('#jumpTime'); if (jt) jt.type = R.blind ? 'time' : 'datetime-local';
    $('#blindBadge').hidden = !this.isBlind();
  },
  /* Ladeanzeige im Chart selbst (alle sichtbaren Charts) */
  setChartsLoading(txt, p) { for (const c of this.charts) c.setLoading(txt, p); },
  setStatus(msg) { const el = $('#rpStatus'); if (el) { el.textContent = msg || ''; el.title = msg || ''; } },

  /* ---------- Hilfen ---------- */
  toast(msg, kind, opt) {
    opt = opt || {};
    const host = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '') + (opt.action ? ' has-act' : '');
    t.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
    const span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
    let done = false;
    const remove = () => { if (t.isConnected) { t.classList.add('out'); setTimeout(() => t.remove(), 200); } };
    const expire = () => { if (done) return; done = true; remove(); if (opt.onExpire) opt.onExpire(); };
    if (opt.action) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = opt.action;
      b.addEventListener('click', () => { if (done) return; done = true; remove(); if (opt.onAction) opt.onAction(); });
      t.appendChild(b);
    }
    host.appendChild(t);
    /* max. 2 Toasts; verdrängte Rückgängig-Toasts gelten als abgelaufen */
    while (host.children.length > 2) { const f = host.firstChild; if (f._expire) f._expire(); f.remove(); }
    t._expire = expire;
    setTimeout(expire, opt.ms || (opt.action ? 6000 : kind === 'bad' || kind === 'warn' ? 5200 : 3200));
    return t;
  },
  /* „Gelöscht · Rückgängig“: undo() stellt wieder her, commit() löscht endgültig (nach 6 s) */
  undoToast(msg, undo, commit) {
    return this.toast(msg, 'info undo', { action: 'Rückgängig', onAction: undo, onExpire: commit, ms: 6000 });
  },
  confirm(title, text, okLabel) {
    return new Promise((res) => {
      const m = $('#confirmModal');
      $('#cfTitle').textContent = title; $('#cfText').textContent = text; $('#cfOk').textContent = okLabel || 'OK';
      m.hidden = false; syncModalState(); $('#cfOk').focus();
      const done = (v) => { m.hidden = true; syncModalState(); $('#cfOk').onclick = null; $('#cfCancel').onclick = null; res(v); };
      $('#cfOk').onclick = () => done(true); $('#cfCancel').onclick = () => done(false);
    });
  },
  download(name, data, mime) {
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (_) { /* Sandbox */ }
  },
  async copy(text) {
    try { await navigator.clipboard.writeText(text); this.toast('In die Zwischenablage kopiert.', 'good'); }
    catch (_) { const ta = $('#copyFallback'); ta.hidden = false; ta.value = text; ta.select(); this.toast('Kopieren blockiert – Text ist markiert, mit Strg+C kopieren.', 'warn'); }
  },
  journalCSV(list) {
    const cols = ['sym', 'side', 'qty', 'entryT', 'entryPrice', 'exitT', 'exitPrice', 'sl', 'tp', 'reason', 'pnl', 'fees', 'r', 'mae', 'mfe', 'setup', 'note'];
    const iso = (t) => new Date(t * 1000).toISOString();
    const rows = (list || this.journal).map((j) => cols.map((c) => {
      let v = j[c]; if (c === 'entryT' || c === 'exitT') v = iso(v); if (c === 'side') v = j.side > 0 ? 'long' : 'short';
      if (typeof v === 'number') v = +v.toFixed(6);
      v = v == null ? '' : String(v);
      return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(','));
    return cols.join(',') + '\n' + rows.join('\n');
  }
};
/* Toasts ausblenden, solange ein Dialog offen ist */
function syncModalState() { document.body.classList.toggle('modal-open', $$('.modal').some((m) => !m.hidden)); }
