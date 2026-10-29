/* Edge Lab Replay — Datenquellen: Binance (öffentliche API, kostenlos), CSV, Demo */
'use strict';
const Binance = {
  hosts: { spot: ['https://api.binance.com', 'https://data-api.binance.vision', 'https://api1.binance.com'], futures: ['https://fapi.binance.com'] },
  paths: { spot: { k: '/api/v3/klines', a: '/api/v3/aggTrades', x: '/api/v3/exchangeInfo' }, futures: { k: '/fapi/v1/klines', a: '/fapi/v1/aggTrades', x: '/fapi/v1/exchangeInfo' } },
  /* Abstand zwischen Anfragen (ms), damit die Gewichtslimits von Binance nicht greifen */
  gap: { spot: 130, futures: 560 },
  host: {},
  _next: { spot: 0, futures: 0 },
  async slot(market) {
    const now = Date.now();
    const at = Math.max(now, this._next[market]);
    this._next[market] = at + this.gap[market];
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  },
  async get(market, kind, params, signal) {
    const path = this.paths[market][kind];
    const qs = new URLSearchParams(params).toString();
    const hosts = this.host[market] ? [this.host[market]].concat(this.hosts[market].filter((h) => h !== this.host[market])) : this.hosts[market];
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      for (const h of hosts) {
        await this.slot(market);
        let r;
        try { r = await fetch(h + path + (qs ? '?' + qs : ''), { signal }); }
        catch (e) { if (e.name === 'AbortError') throw e; lastErr = e; continue; }
        if (r.status === 429 || r.status === 418) {
          const wait = Math.min(120, +(r.headers.get('Retry-After') || 20));
          if (this.onWait) this.onWait(wait);
          await new Promise((res) => setTimeout(res, wait * 1000));
          lastErr = new Error('Binance-Limit erreicht'); break;
        }
        if (!r.ok) {
          let msg = '';
          try { const j = await r.json(); msg = j.msg || ''; } catch (_) { /* leer */ }
          if (r.status === 451 || r.status === 403) { lastErr = new Error('Binance blockiert diesen Server für deine Region (' + r.status + ').'); continue; }
          throw new Error('Binance: ' + (msg || 'Fehler ' + r.status));
        }
        this.host[market] = h;
        return r.json();
      }
      if (lastErr && !/Limit/.test(lastErr.message)) break;
    }
    if (lastErr && lastErr.name === 'TypeError') throw new Error('Keine Verbindung zu Binance. In der Claude-Vorschau sind externe Server gesperrt – öffne die App über deine GitHub-Seite oder lade die HTML-Datei herunter und öffne sie im Browser.');
    throw lastErr || new Error('Binance nicht erreichbar.');
  },
  intervalMs: { '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '1h': 3600000 },
  async info(market, symbol, signal) {
    try {
      const j = await this.get(market, 'x', market === 'spot' ? { symbol } : {}, signal);
      const s = (j.symbols || []).find((x) => x.symbol === symbol);
      if (!s) return null;
      const pf = s.filters.find((f) => f.filterType === 'PRICE_FILTER');
      const lf = s.filters.find((f) => f.filterType === 'LOT_SIZE');
      return { tick: pf ? +pf.tickSize : null, step: lf ? +lf.stepSize : null };
    } catch (e) { if (e.name === 'AbortError') throw e; return null; }
  },
  async klines(market, symbol, interval, fromMs, toMs, onProg, signal) {
    const ms = this.intervalMs[interval], limit = market === 'spot' ? 1000 : 1500;
    const out = [];
    let start = fromMs;
    while (start < toMs) {
      const rows = await this.get(market, 'k', { symbol, interval, startTime: start, endTime: toMs - 1, limit }, signal);
      if (!Array.isArray(rows) || !rows.length) break;
      for (const r of rows) out.push(r);
      start = +rows[rows.length - 1][0] + ms;
      onProg(Math.min(1, (start - fromMs) / (toMs - fromMs)));
      if (out.length > 400000) throw new Error('Zu viele Kerzen (über 400.000). Bitte Zeitraum verkürzen oder größeres Intervall wählen.');
    }
    const now = Date.now();
    return Core.parseBinanceKlines(out.filter((r) => +r[6] < now)); /* laufende, unfertige Kerze weglassen */
  },
  async aggTrades(market, symbol, fromMs, toMs, onProg, signal) {
    const chunk = 10 * 60000;
    const jobs = [];
    for (let a = fromMs; a < toMs; a += chunk) jobs.push([a, Math.min(toMs, a + chunk)]);
    const all = [];
    let done = 0;
    const work = async (job) => {
      const [a, b] = job;
      let rows = await this.get(market, 'a', { symbol, startTime: a, endTime: b - 1, limit: 1000 }, signal);
      const got = rows.filter((r) => r.T >= a && r.T < b);
      while (rows.length === 1000 && rows[rows.length - 1].T < b) {
        rows = await this.get(market, 'a', { symbol, fromId: rows[rows.length - 1].a + 1, limit: 1000 }, signal);
        for (const r of rows) if (r.T < b) got.push(r);
        if (all.length + got.length > 4000000) throw new Error('Mehr als 4 Mio. Trades – bitte kürzeren Zeitraum wählen.');
      }
      for (const r of got) all.push(r);
      done++; onProg(done / jobs.length, all.length);
    };
    let idx = 0;
    const runners = [0, 1, 2].map(async () => { while (idx < jobs.length) { const j = jobs[idx++]; await work(j); } });
    await Promise.all(runners);
    const seen = new Set();
    const uniq = all.filter((r) => (seen.has(r.a) ? false : (seen.add(r.a), true)));
    return Core.makeTrades(Core.parseBinanceAggTrades(uniq));
  }
};

const Loader = {
  ctrl: null,
  setStatus(el, text, kind) { el.textContent = text; el.className = 'status ' + (kind || ''); },
  progress(p) { const b = $('#dlProg'); b.hidden = p == null; if (p != null) b.firstElementChild.style.width = (p * 100).toFixed(1) + '%'; },
  cancel() { if (this.ctrl) this.ctrl.abort(); },
  async binance() {
    const st = $('#bnStatus');
    const market = $('#bnMarket').value;
    const symbol = $('#bnSymbol').value.trim().toUpperCase();
    const interval = $('#bnInterval').value;
    const days = Math.max(1, Math.min(365, +$('#bnDays').value || 7));
    const endStr = $('#bnEnd').value;
    if (!/^[A-Z0-9]{4,20}$/.test(symbol)) { this.setStatus(st, 'Symbol ungültig, z. B. BTCUSDT.', 'bad'); return; }
    const toMs = endStr ? Date.parse(endStr + 'T00:00:00Z') + 86400000 : Math.floor(Date.now() / 60000) * 60000;
    const fromMs = toMs - days * 86400000;
    const est = days * 86400000 / Binance.intervalMs[interval];
    if (est > 400000) { this.setStatus(st, 'Das wären ~' + Math.round(est / 1000) + 'k Kerzen. Bitte weniger Tage oder größeres Intervall.', 'bad'); return; }
    Object.assign(App.settings.binance, { market, symbol, interval, days }); App.saveSettings();
    this.ctrl = new AbortController();
    $('#bnLoad').disabled = true; $('#dlCancel').hidden = false;
    try {
      this.setStatus(st, 'Lade Symbol-Infos …');
      const info = await Binance.info(market, symbol, this.ctrl.signal);
      this.setStatus(st, 'Lade Kerzen …'); this.progress(0); App.setChartsLoading('Lade ' + symbol + ' …', 0);
      const bars = await Binance.klines(market, symbol, interval, fromMs, toMs, (p) => { this.progress(p); App.setChartsLoading('Lade ' + symbol + ' …', p); this.setStatus(st, 'Lade Kerzen … ' + Math.round(p * 100) + ' %'); }, this.ctrl.signal);
      if (!bars.length) throw new Error('Keine Kerzen erhalten. Prüfe das Symbol – gibt es ' + symbol + ' auf Binance ' + (market === 'spot' ? 'Spot' : 'Futures') + '?');
      const notes = App.loadDataset(this.binanceDataset({ kind: 'binance', market, symbol, interval, fromMs, toMs }, bars, info));
      this.setStatus(st, bars.length.toLocaleString('de-DE') + ' Kerzen geladen.' + (notes.length ? ' ' + notes.join(', ') + '.' : ''), 'good');
      App.applyCostProfile();
      closeModal('#dataModal');
      App.toast(symbol + ' geladen. Für Footprint im Replay „Trades laden“ nutzen.', 'good');
    } catch (e) {
      this.setStatus(st, e.name === 'AbortError' ? 'Abgebrochen.' : e.message, 'bad');
    } finally { $('#bnLoad').disabled = false; $('#dlCancel').hidden = true; this.progress(null); this.ctrl = null; App.setChartsLoading(null); }
  },
  binanceDataset(src, bars, info) {
    return {
      bars, baseTf: Binance.intervalMs[src.interval] / 1000, tick: info && info.tick ? info.tick : null, pv: 1,
      qtyStep: info && info.step ? info.step : 0.001, sess: { tz: 'UTC', hour: 0 },
      symbol: src.symbol + (src.market === 'futures' ? '.P' : ''), source: 'Binance ' + (src.market === 'spot' ? 'Spot' : 'Futures'),
      instKey: 'CRYPTO', live: { market: src.market, symbol: src.symbol }, src
    };
  },
  /* Trades (für Footprint) rund um die aktuelle Position laden */
  async binanceTrades() {
    if (!App.live) { App.toast('Trades kann ich nur für Binance-Daten nachladen. Für andere Märkte eine Trade-CSV importieren.', 'warn'); return; }
    const hours = Math.max(0.25, Math.min(12, +$('#trHours').value || 2));
    const before = $('#trWhere').value;
    const curT = App.base[App.cursor].t * 1000;
    let a, b;
    if (before === 'around') { a = curT - hours * 1800000; b = curT + hours * 1800000; }
    else if (before === 'before') { a = curT - hours * 3600000; b = curT + 60000; }
    else { a = curT; b = curT + hours * 3600000; }
    const step = App.baseTf * 1000;
    a = Math.floor(a / step) * step; b = Math.ceil(b / step) * step;
    a = Math.max(a, App.base[0].t * 1000); b = Math.min(b, (App.base[App.base.length - 1].t + App.baseTf) * 1000);
    if (b <= a) return;
    const st = $('#trStatus');
    this.ctrl = new AbortController();
    $('#trLoad').disabled = true; $('#trCancel').hidden = false;
    Binance.onWait = (s) => this.setStatus(st, 'Binance-Limit – warte ' + s + ' s …', 'warn');
    try {
      const tr = await Binance.aggTrades(App.live.market, App.live.symbol, a, b, (p, n) => { this.setStatus(st, 'Lade Trades … ' + Math.round(p * 100) + ' % (' + n.toLocaleString('de-DE') + ')'); }, this.ctrl.signal);
      App.trades = Core.mergeTrades(App.trades, tr);
      App.cov.push([a, b]);
      App.reindexTrades(); App.recompute();
      this.setStatus(st, tr.n.toLocaleString('de-DE') + ' Trades geladen (' + App.fmtT(a / 1000, 60) + ' – ' + App.fmtT(b / 1000, 60) + ').', 'good');
      App.settings.ind.fp = true; App.updateHeader(); App.requestRender();
      closeModal('#tradesModal');
      App.toast('Footprint bereit. Hineinzoomen, bis die Zahlen erscheinen.', 'good');
    } catch (e) { this.setStatus(st, e.name === 'AbortError' ? 'Abgebrochen.' : e.message, 'bad'); }
    finally { $('#trLoad').disabled = false; $('#trCancel').hidden = true; this.ctrl = null; Binance.onWait = null; }
  },
  readFile(f) {
    return new Promise((res, rej) => {
      if (f.size > 400 * 1024 * 1024) { rej(new Error(f.name + ' ist größer als 400 MB. Bitte kleinere Datei (z. B. Tagesdatei) verwenden.')); return; }
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden.')); r.readAsText(f);
    });
  },
  async csv() {
    const st = $('#csvStatus');
    const fBars = $('#csvBars').files[0], fTr = $('#csvTrades').files[0];
    if (!fBars && !fTr) { this.setStatus(st, 'Bitte mindestens eine Datei wählen.', 'bad'); return; }
    if ((fBars && /\.zip$/i.test(fBars.name)) || (fTr && /\.zip$/i.test(fTr.name))) { this.setStatus(st, 'Bitte die ZIP-Datei zuerst entpacken und die CSV wählen.', 'bad'); return; }
    const instKey = $('#csvInst').value, inst = Core.INSTRUMENTS[instKey];
    const tz = $('#csvTz').value;
    const tickIn = parseFloat(String($('#csvTick').value).replace(',', '.'));
    const sym = ($('#csvSym').value.trim() || instKey).toUpperCase();
    App.settings.inst = instKey; App.saveSettings();
    try {
      this.setStatus(st, 'Lese Dateien …');
      let bars = null, trades = null, notes = [];
      if (fBars) {
        const p = Core.parseCSV(await this.readFile(fBars), tz, { sess: inst.sess });
        if (p.kind === 'trades') trades = Core.makeTrades(p.rows); else bars = p.rows;
        notes.push(fBars.name + ': ' + p.format + (p.bad ? ', ' + p.bad + ' Zeilen übersprungen' : ''));
      }
      if (fTr) {
        const p = Core.parseCSV(await this.readFile(fTr), tz, { sess: inst.sess });
        if (p.kind !== 'trades') throw new Error(fTr.name + ' enthält Kerzen, keine einzelnen Trades.');
        trades = trades ? Core.mergeTrades(trades, Core.makeTrades(p.rows)) : Core.makeTrades(p.rows);
        notes.push(fTr.name + ': ' + p.format + (p.bad ? ', ' + p.bad + ' Zeilen übersprungen' : ''));
      }
      let cov = [];
      if (!bars) bars = Core.barsFromTrades(trades, 60);
      if (trades) {
        /* Abdeckung auf Kerzengrenzen runden (Trade-Dateien decken normalerweise ganze Tage ab) */
        const bt = Core.detectTf(bars.slice().sort((a, b) => a.t - b.t)) || 60, s = bt * 1000;
        cov = [[Math.floor(trades.t[0] / s) * s, Math.ceil((trades.t[trades.n - 1] + 1) / s) * s]];
      }
      const fixNotes = App.loadDataset({
        bars, tick: tickIn > 0 ? tickIn : (instKey === 'CRYPTO' || instKey === 'FOREX' ? null : inst.tick), pv: inst.pv, qtyStep: inst.qtyStep,
        sess: inst.sess, symbol: sym, source: 'CSV', instKey, trades, cov, src: { kind: 'csv', name: (fBars || fTr).name }
      });
      App.applyCostProfile();
      /* Wartet eine CSV-Session auf ihre Datei? → dort fortsetzen */
      const wait = App.resumeWait;
      if (wait && wait.sym === sym) { try { App.restoreReplay(wait); } catch (err) { App.toast('Fortsetzen nicht möglich: ' + err.message, 'warn'); } }
      this.setStatus(st, 'Geladen. ' + notes.concat(fixNotes).join(' · '), 'good');
      closeModal('#dataModal');
      App.toast(sym + ' aus CSV geladen: ' + App.base.length.toLocaleString('de-DE') + ' Kerzen' + (trades ? ', ' + trades.n.toLocaleString('de-DE') + ' Trades' : '') + '.', 'good');
    } catch (e) { this.setStatus(st, e.message, 'bad'); }
  },
  demo(silent) {
    const d = Core.demoData(8, 7);
    App.loadDataset({ bars: d.bars, baseTf: 60, tick: 0.25, pv: 20, qtyStep: 1, sess: d.sess, symbol: 'DEMO-NQ', source: 'Demo (synthetische Daten)', instKey: 'NQ', trades: d.trades, cov: d.cov, src: { kind: 'demo' } });
    App.applyCostProfile();
    if (!silent) { closeModal('#dataModal'); App.toast('Demo-Daten geladen (künstlich erzeugt, kein echter Markt).'); }
  }
};

/* ---------- Daten-Archiv (GitHub Pages, Dukascopy-1-Minuten-Kerzen) ---------- */
const Archive = {
  bases: ['data/', 'https://raw.githubusercontent.com/qvw8mrjzby-arch/edge-lab-replay/main/data/'],
  base: null, index: null, cache: new Map(),
  DEFAULT: [
    { id: 'NAS100', name: 'Nasdaq 100', hint: 'wie NQ' }, { id: 'US500', name: 'S&P 500', hint: 'wie ES' }, { id: 'US30', name: 'Dow Jones', hint: 'wie YM' },
    { id: 'XAUUSD', name: 'Gold', hint: 'wie GC' }, { id: 'GER40', name: 'DAX', hint: 'GER40' }
  ],
  MISSING: 'Archiv wird noch aufgebaut – das passiert automatisch auf GitHub, in ein paar Stunden sind die Daten da. Bis dahin Krypto oder Demo nutzen.',
  async loadIndex(signal) {
    if (this.index) return this.index;
    let order = this.base ? [this.base].concat(this.bases.filter((b) => b !== this.base)) : this.bases;
    /* lokal geöffnete Datei: relative Adresse geht nicht → direkt GitHub */
    if (location.protocol === 'file:') order = order.filter((b) => /^https:/.test(b));
    for (const b of order) {
      try {
        const r = await fetch(b + 'index.json', { signal, cache: 'no-cache' });
        if (!r.ok) continue;
        const j = await r.json();
        if (!j || !Array.isArray(j.instruments) || !j.instruments.length) continue;
        this.base = b; this.index = j;
        return j;
      } catch (e) { if (e.name === 'AbortError') throw e; }
    }
    throw new Error(this.MISSING);
  },
  inst(id) { return this.index && this.index.instruments.find((x) => x.id === id); },
  async gunzipText(buf) {
    const u8 = new Uint8Array(buf);
    if (u8.length > 1 && u8[0] === 0x1f && u8[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann keine .gz-Dateien entpacken. Bitte aktuellen Chrome, Edge, Firefox oder Safari nutzen.');
      const ds = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(ds).text();
    }
    return new TextDecoder().decode(u8);
  },
  parseMonth(text) {
    const out = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]; if (!l || l.charCodeAt(0) > 57) continue; /* Kopfzeile / leer */
      const c = l.split(',');
      const t = +c[0], o = +c[1], h = +c[2], lo = +c[3], cl = +c[4];
      if (!(t > 0) || !isFinite(o) || !isFinite(h) || !isFinite(lo) || !isFinite(cl)) continue;
      out.push({ t, o, h, l: lo, c: cl, v: +c[5] || 0, bv: null });
    }
    return out;
  },
  async month(id, ym, signal) {
    const k = id + '/' + ym;
    if (this.cache.has(k)) return this.cache.get(k);
    const r = await fetch(this.base + id + '/' + ym + '.csv.gz', { signal });
    if (!r.ok) throw new Error('Archiv-Datei ' + id + ' ' + ym + ' fehlt (' + r.status + ').');
    const rows = this.parseMonth(await this.gunzipText(await r.arrayBuffer()));
    if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(k, rows);
    return rows;
  },
  /* Kerzen im Zeitraum [fromT, toT) (Unix-Sekunden) */
  async range(id, fromT, toT, onProg, signal) {
    const inst = this.inst(id); if (!inst) throw new Error('Unbekannter Archiv-Markt ' + id + '.');
    const have = new Set(inst.months || []);
    const months = Core.monthsBetween(fromT, toT - 1).filter((m) => have.has(m));
    if (!months.length) throw new Error('Für diesen Zeitraum gibt es im Archiv keine Daten.');
    /* Monate parallel laden (höchstens 3 gleichzeitig), Fortschritt je fertiger Datei */
    let done = 0, next = 0;
    const res = new Array(months.length);
    if (onProg) onProg(0, months[0]);
    const worker = async () => {
      while (next < months.length) {
        const k = next++;
        res[k] = await this.month(id, months[k], signal);
        done++; if (onProg) onProg(done / months.length, months[Math.min(next, months.length - 1)]);
      }
    };
    await Promise.all([0, 1, 2].slice(0, months.length).map(worker));
    const bars = [];
    for (const rows of res) for (const b of rows) if (b.t >= fromT && b.t < toT) bars.push(Object.assign({}, b));
    if (onProg) onProg(1);
    return bars;
  },
  dataset(inst, bars, fromT, toT) {
    return { bars, baseTf: 60, tick: inst.tick, pv: inst.pv, qtyStep: inst.qtyStep || 1, sess: inst.sess || { tz: 'UTC', hour: 0 }, symbol: inst.id, source: 'Archiv · ' + inst.name, instKey: 'ARCHIV', src: fromT != null ? { kind: 'archive', id: inst.id, fromT, toT } : null };
  }
};
Object.assign(Loader, {
  async archive() {
    const st = $('#arStatus');
    const id = $('#arInst').value;
    const f = $('#arFrom').value, t = $('#arTo').value;
    const pd = (s) => { const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : NaN; };
    const a = pd(f), e = pd(t) + 86400;
    if (!isFinite(a) || !isFinite(e) || e <= a) { this.setStatus(st, 'Bitte Von und Bis wählen.', 'bad'); return; }
    if ((e - a) / 86400 > 31) { this.setStatus(st, 'Höchstens 31 Tage auf einmal.', 'bad'); return; }
    this.ctrl = new AbortController();
    $('#arLoad').disabled = true; $('#arCancel').hidden = false;
    const prog = $('#arProg');
    try {
      await Archive.loadIndex(this.ctrl.signal);
      const inst = Archive.inst(id);
      prog.hidden = false;
      App.setChartsLoading('Lade ' + inst.name + ' …', 0);
      const bars = await Archive.range(id, a, e, (p, m) => { prog.firstElementChild.style.width = (p * 100).toFixed(0) + '%'; App.setChartsLoading('Lade ' + inst.name + ' …', p); if (m) this.setStatus(st, 'Lade ' + m + ' …'); }, this.ctrl.signal);
      if (bars.length < 30) throw new Error('Zu wenige Kerzen in diesem Zeitraum (Wochenende oder Feiertag?). Bitte einen anderen Zeitraum wählen.');
      const notes = App.loadDataset(Archive.dataset(inst, bars, a, e));
      App.applyCostProfile();
      this.setStatus(st, bars.length.toLocaleString('de-DE') + ' Kerzen geladen.' + (notes.length ? ' ' + notes.join(', ') + '.' : ''), 'good');
      closeModal('#dataModal');
      App.toast(inst.name + ' aus dem Archiv geladen.', 'good');
    } catch (err) { this.setStatus(st, err.name === 'AbortError' ? 'Abgebrochen.' : err.message, 'bad'); }
    finally { $('#arLoad').disabled = false; $('#arCancel').hidden = true; prog.hidden = true; this.ctrl = null; App.setChartsLoading(null); }
  }
});

/* ---------- Neue Backtest-Session (zufälliger historischer Tag) ---------- */
const CRYPTO_START = { spot: { BTCUSDT: '2017-08-17', ETHUSDT: '2017-08-17', SOLUSDT: '2020-08-11', '*': '2017-08-17' }, futures: { BTCUSDT: '2019-09-08', ETHUSDT: '2019-11-27', SOLUSDT: '2020-09-14', '*': '2019-09-08' } };
const NewSess = {
  ctrl: null,
  async open() {
    const S = App.settings.newSess;
    $('#nsArchHint').hidden = true;
    $('#nsStatus').textContent = ''; $('#nsStatus').className = 'status';
    this.fillMarkets();
    openModal('#newSessModal');
    App.renderStratSelects();
    $('#nsStrat').value = App.strategies.some((s) => s.name === App.settings.ticket.setup) ? App.settings.ticket.setup : '';
    $('#nsStart').value = S.start; $('#nsBlind').checked = S.blind !== false;
    $$('input[name="nsWhen"]').forEach((r) => { r.checked = r.value === S.when; });
    $('#nsSym').value = S.sym || 'BTCUSDT'; $('#nsBnMarket').value = S.bnMarket || 'spot';
    try { await Archive.loadIndex(); this.fillMarkets(); }
    catch (e) { const h = $('#nsArchHint'); h.hidden = false; h.textContent = e.message; }
  },
  fillMarkets() {
    const S = App.settings.newSess, sel = $('#nsMarket');
    const ar = Archive.index ? Archive.index.instruments : Archive.DEFAULT;
    let h = '<optgroup label="Archiv (Indizes & Gold, 1-Minute)">' + ar.map((i) => '<option value="ar:' + esc(i.id) + '"' + (Archive.index ? '' : ' disabled') + '>' + esc(i.id + ' – ' + i.name + (i.hint ? ' (' + i.hint + ')' : '')) + '</option>').join('') + '</optgroup>';
    h += '<optgroup label="Krypto (Binance, mit echtem Orderflow)">' + ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((s) => '<option value="bn:' + s + '">' + s + '</option>').join('') + '<option value="bn:*">Anderes Symbol …</option></optgroup>';
    if (App.base) h += '<optgroup label="Aktuell geladene Daten"><option value="cur">' + esc(App.symbol + ' · ' + App.source) + '</option></optgroup>';
    sel.innerHTML = h;
    const want = S.market;
    const opt = [...sel.options].find((o) => o.value === want && !o.disabled) || [...sel.options].find((o) => !o.disabled);
    sel.value = opt ? opt.value : '';
    this.onMarket();
  },
  /* Jahresauswahl je nach Markt begrenzen */
  onMarket() {
    const v = $('#nsMarket').value, S = App.settings.newSess;
    $('#nsCryptoBox').hidden = !v.startsWith('bn:');
    if (v === 'bn:*') $('#nsSym').focus();
    let y0 = 2017, y1 = new Date().getUTCFullYear();
    if (v.startsWith('ar:') && Archive.inst(v.slice(3))) {
      const ms = Archive.inst(v.slice(3)).months || [];
      if (ms.length) { y0 = +ms[0].slice(0, 4); y1 = +ms[ms.length - 1].slice(0, 4); }
    } else if (v.startsWith('bn:')) {
      const mk = $('#nsBnMarket').value, sym = v === 'bn:*' ? '*' : v.slice(3);
      y0 = +(CRYPTO_START[mk][sym] || CRYPTO_START[mk]['*']).slice(0, 4);
    } else if (v === 'cur' && App.base) {
      y0 = new Date(App.base[0].t * 1000).getUTCFullYear(); y1 = new Date(App.base[App.base.length - 1].t * 1000).getUTCFullYear();
    }
    const opts = []; for (let y = y0; y <= y1; y++) opts.push('<option value="' + y + '">' + y + '</option>');
    $('#nsY0').innerHTML = opts.join(''); $('#nsY1').innerHTML = opts.join('');
    $('#nsY0').value = String(Math.min(y1, Math.max(y0, S.y0 || 2021))); $('#nsY1').value = String(Math.max(+$('#nsY0').value, Math.min(y1, S.y1 || 2024)));
  },
  status(t, k) { const el = $('#nsStatus'); el.textContent = t; el.className = 'status ' + (k || ''); },
  prog(p) { const b = $('#nsProg'); b.hidden = p == null; if (p != null) b.firstElementChild.style.width = (p * 100).toFixed(0) + '%'; App.setChartsLoading(p == null ? null : 'Session wird vorbereitet …', p); },
  startTime(day, mode, tz) {
    const { y, m, d } = day;
    if (mode === 'ny') return Core.zonedToUtc(y, m, d, 9, 15, 0, 'America/New_York');
    if (mode === 'ldn') return Core.zonedToUtc(y, m, d, 8, 0, 0, 'Europe/London');
    if (mode === 'asia') return Core.zonedToUtc(y, m, d, 9, 0, 0, 'Asia/Tokyo');
    return null;
  },
  pickDay(days) { return days[Math.floor(Math.random() * days.length)]; },
  async go() {
    const v = $('#nsMarket').value, S = App.settings.newSess;
    const when = ($$('input[name="nsWhen"]').find((r) => r.checked) || {}).value || 'random';
    const y0 = +$('#nsY0').value, y1 = Math.max(y0, +$('#nsY1').value);
    const start = $('#nsStart').value, blind = $('#nsBlind').checked, strategy = $('#nsStrat').value;
    Object.assign(S, { market: v, when, y0, y1, start, blind, sym: $('#nsSym').value.trim().toUpperCase() || 'BTCUSDT', bnMarket: $('#nsBnMarket').value });
    App.saveSettings();
    let fixed = null;
    if (when === 'date') {
      const m = $('#nsDate').value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) { this.status('Bitte ein Datum wählen.', 'bad'); return; }
      fixed = { y: +m[1], m: +m[2], d: +m[3] };
    }
    if (App.replay.active) {
      if (!(await App.confirm('Laufendes Replay beenden?', 'Für die neue Session wird das aktuelle Replay beendet.', 'Beenden'))) return;
      App.forceStopReplay();
    }
    this.ctrl = new AbortController();
    const signal = this.ctrl.signal;
    setBusy($('#nsGo'), true); $('#nsCancel').hidden = false;
    /* Bis zum Start nichts vom geladenen Tag zeigen (sonst Datum/Ende sichtbar, v. a. im Blind-Modus) */
    App.hideData = true; App.updateReplayBar(); App.requestRender();
    try {
      let res;
      for (let attempt = 0; attempt < (fixed ? 1 : 6); attempt++) {
        res = await this.tryDay(v, fixed, y0, y1, start, signal);
        if (res.ok) break;
        if (fixed) throw new Error(res.msg);
        this.status(res.msg + ' – anderer Tag …', 'warn');
      }
      if (!res.ok) throw new Error(res.msg);
      App.hideData = false;
      const rid = App.startReplayAt(res.idx, { blind });
      const e = App.createRunningSession({ replayId: rid, strategy, sym: App.symbol, market: v, from: App.base[res.idx].t, realDay: res.realDay, blind });
      App.replay.sessionId = e.id;
      if (strategy) { App.settings.ticket.setup = strategy; App.saveSettings(); App.renderStratSelects(); }
      this.prog(null); this.status('');
      closeModal('#newSessModal');
      if (location.hash !== '#charts') location.hash = '#charts';
      App.setStatus('Session läuft' + (blind ? ' im Blind-Modus' : ' – ' + res.realDay) + '. Alles rechts vom Cursor ist ausgeblendet.');
    } catch (err) {
      this.status(err.name === 'AbortError' ? 'Abgebrochen.' : err.message, 'bad');
      /* Blind-Modus: den gescheiterten Tag nie zeigen – zurück zu den Demo-Daten */
      if (blind && !App.replay.active && App.symbol !== 'DEMO-NQ') { try { Loader.demo(true); } catch (_) { /* egal */ } }
    } finally {
      setBusy($('#nsGo'), false); $('#nsCancel').hidden = true; this.prog(null); this.ctrl = null;
      App.hideData = false; App.updateHeader(); App.updateReplayBar(); App.requestRender();
    }
  },
  /* Einen Tag laden und Startindex bestimmen */
  async tryDay(v, fixed, y0, y1, start, signal) {
    if (v === 'cur') {
      if (!App.base) return { ok: false, msg: 'Keine Daten geladen.' };
      const ss = App.series.sessions;
      let cand = ss.map((s, i) => ({ s, i })).filter(({ s, i }) => i >= Math.min(3, ss.length - 1) && s.i1 - s.i0 > 30);
      if (fixed) cand = cand.filter(({ s }) => { const p = Core.localParts(s.start + 12 * 3600, App.sess.tz); return p.y === fixed.y && p.m === fixed.m && p.d === fixed.d; });
      else cand = cand.filter(({ s }) => { const y = new Date((s.start + 12 * 3600) * 1000).getUTCFullYear(); return y >= y0 && y <= y1; });
      if (!cand.length) return { ok: false, msg: 'Kein passender Tag in den geladenen Daten.' };
      const { s } = cand[Math.floor(Math.random() * cand.length)];
      const lp = Core.localParts(s.start + 12 * 3600, App.sess.tz);
      const idx = this.startIndex(App.base, { y: lp.y, m: lp.m, d: lp.d }, start, s.i0, s.i1);
      if (idx < 0) return { ok: false, msg: 'Startzeit liegt nicht in den Daten.' };
      return { ok: true, idx, realDay: App.fmtDate(App.base[idx].t, App.sess.tz) };
    }
    if (v.startsWith('ar:')) {
      const id = v.slice(3);
      await Archive.loadIndex(signal);
      const inst = Archive.inst(id); if (!inst) return { ok: false, msg: 'Markt nicht im Archiv.' };
      const day = fixed || this.pickDay(Core.tradingDays(inst.months || [], y0, y1, true));
      if (!day) return { ok: false, msg: 'Keine Handelstage im gewählten Zeitraum.' };
      const a = Core.shiftTradingDays(day.y, day.m, day.d, -3, true), b = Core.shiftTradingDays(day.y, day.m, day.d, 2, true);
      const fromT = Date.UTC(a.y, a.m - 1, a.d) / 1000 - 12 * 3600, toT = Date.UTC(b.y, b.m - 1, b.d) / 1000 + 86400;
      this.status('Lade ' + inst.name + ' …'); this.prog(0);
      const bars = await Archive.range(id, fromT, toT, (p) => this.prog(p * 0.9), signal);
      if (bars.length < 200) return { ok: false, msg: 'Zu wenige Kerzen um diesen Tag (Feiertag?)' };
      App.loadDataset(Archive.dataset(inst, bars, fromT, toT)); App.applyCostProfile();
      const tz = (inst.sess && inst.sess.tz) || 'UTC';
      const idx = this.startIndex(App.base, day, start);
      if (idx < 0) return { ok: false, msg: 'An diesem Tag gibt es keine Kerzen zur Startzeit (Feiertag?)' };
      return { ok: true, idx, realDay: App.fmtDate(App.base[idx].t, tz) };
    }
    if (v.startsWith('bn:')) {
      const market = $('#nsBnMarket').value;
      const symbol = v === 'bn:*' ? ($('#nsSym').value.trim().toUpperCase()) : v.slice(3);
      if (!/^[A-Z0-9]{4,20}$/.test(symbol)) return { ok: false, msg: 'Symbol ungültig, z. B. BTCUSDT.' };
      const first = Date.parse((CRYPTO_START[market][symbol] || CRYPTO_START[market]['*']) + 'T00:00:00Z') / 1000 + 4 * 86400;
      const last = Math.floor(Date.now() / 1000 / 86400) * 86400 - 3 * 86400;
      let day = fixed;
      if (!day) {
        const lo = Math.max(first, Date.UTC(y0, 0, 1) / 1000), hi = Math.min(last, Date.UTC(y1, 11, 31) / 1000);
        if (hi < lo) return { ok: false, msg: 'Für diese Jahre gibt es auf Binance keine Daten.' };
        const t = lo + Math.floor(Math.random() * ((hi - lo) / 86400 + 1)) * 86400;
        const x = new Date(t * 1000); day = { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
      }
      const d0 = Date.UTC(day.y, day.m - 1, day.d) / 1000;
      const fromMs = (d0 - 3 * 86400) * 1000, toMs = (d0 + 3 * 86400) * 1000;
      this.status('Lade ' + symbol + ' von Binance …'); this.prog(0);
      const info = await Binance.info(market, symbol, signal);
      const bars = await Binance.klines(market, symbol, '1m', fromMs, toMs, (p) => this.prog(p * 0.9), signal);
      if (bars.length < 200) return { ok: false, msg: 'Binance hat für ' + symbol + ' an diesem Tag keine Daten.' };
      App.loadDataset(Loader.binanceDataset({ kind: 'binance', market, symbol, interval: '1m', fromMs, toMs }, bars, info));
      App.applyCostProfile();
      const idx = this.startIndex(App.base, day, start);
      if (idx < 0) return { ok: false, msg: 'Keine Kerzen zur Startzeit.' };
      return { ok: true, idx, realDay: App.fmtDate(App.base[idx].t, 'UTC') };
    }
    return { ok: false, msg: 'Bitte einen Markt wählen.' };
  },
  /* Startindex für einen Kalendertag: feste Eröffnungszeit oder zufällige Kerze des Tages */
  startIndex(base, day, mode, i0, i1) {
    const ts = this.startTime(day, mode);
    const n = base.length;
    const lower = (t) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (base[m].t < t) lo = m + 1; else hi = m; } return lo; };
    if (ts != null) {
      const i = lower(ts);
      if (i >= n - 30 || base[i].t - ts > 3 * 3600) return -1;
      return Math.max(1, i);
    }
    const a = i0 != null ? i0 : lower(Date.UTC(day.y, day.m - 1, day.d) / 1000);
    const b = i1 != null ? i1 : lower(Date.UTC(day.y, day.m - 1, day.d) / 1000 + 86400) - 1;
    const hi = Math.min(b - 30, n - 30);
    if (hi <= a) return -1;
    return Math.max(1, a + Math.floor(Math.random() * (hi - a)));
  },
  cancel() { if (this.ctrl) this.ctrl.abort(); }
};
