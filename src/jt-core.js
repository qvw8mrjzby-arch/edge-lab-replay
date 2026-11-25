/* Jarvis-Terminal — Kern: Helfer, Speicher (über App.settings.jt synchronisiert), Datenquellen (Archiv, Binance, Marktdateien, CSV) */
'use strict';
{
  const J = window.J = {};
J.root = null;
J.$ = (s, r) => (r || J.root || document).querySelector(s);
J.$$ = (s, r) => [...(r || J.root || document).querySelectorAll(s)];
J.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NF = {};
J.num = (n, d = 2) => { if (n == null || !isFinite(n)) return '–'; return (NF[d] || (NF[d] = new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(n); };
J.int = n => J.num(n, 0);
J.pct = (n, d = 2) => (n == null || !isFinite(n)) ? '–' : (n > 0 ? '+' : '') + J.num(n, d) + ' %';
J.cls = n => n > 0 ? 'up' : n < 0 ? 'dn' : 'mut';
J.price = v => { if (v == null || !isFinite(v)) return '–'; const a = Math.abs(v); return J.num(v, a >= 10 ? 2 : a >= 1 ? 4 : 6); };
J.cur = () => J.S.settings.cur || '$';
J.money = (n, d = 2) => (n == null || !isFinite(n)) ? '–' : (n > 0 ? '+' : '') + J.num(n, d) + ' ' + J.cur();
J.cash = (n, d = 2) => (n == null || !isFinite(n)) ? '–' : J.num(n, d) + ' ' + J.cur();
J.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
J.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
J.sleep = ms => new Promise(r => setTimeout(r, ms));
  const DF = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const DD = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
J.dt = t => t ? DF.format(new Date(t)) : '–';
J.date = t => t ? DD.format(new Date(typeof t === 'string' && /^\d{4}-\d\d-\d\d$/.test(t) ? t + 'T12:00:00' : t)) : '–';
J.today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
J.dayOf = tSec => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(tSec * 1000));
J.debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
  const EV = {};
J.on = (e, f) => { (EV[e] = EV[e] || new Set()).add(f); return () => EV[e].delete(f); };
J.emit = (e, d) => EV[e] && [...EV[e]].forEach(f => { try { f(d); } catch (x) { console.error(x); } });

/* ---------- Toast & Modal ---------- */
J.toast = (msg, kind) => { try { App.toast(msg, kind === 'bad' ? 'bad' : kind === 'good' ? 'good' : 'info'); } catch { console.log(msg); } };
J.modal = (title, html, mount) => {
  let m = document.getElementById('jtmodal'); if (!m) { m = document.createElement('div'); m.id = 'jtmodal'; m.className = 'jt'; document.body.append(m); }
  m.innerHTML = `<div class="bg"><div class="box" role="dialog" aria-modal="true"><div class="row nw"><h2>${J.esc(title)}</h2><div class="sp"></div><button class="btn ghost sm" data-x aria-label="Schließen">✕</button></div>${html}</div></div>`;
  const close = () => { m.innerHTML = ''; };
  m.querySelector('[data-x]').onclick = close;
  m.querySelector('.bg').addEventListener('mousedown', e => { if (e.target.classList.contains('bg')) close(); });
  mount && mount(m.querySelector('.box'), close);
  return close;
};
J.confirm = (title, text, okLabel = 'Ja') => new Promise(res => {
  J.modal(title, `<p class="mut">${J.esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-n>Abbrechen</button><button class="btn pri" data-y>${J.esc(okLabel)}</button></div>`, (b, close) => {
    b.querySelector('[data-n]').onclick = () => { close(); res(false); };
    b.querySelector('[data-y]').onclick = () => { close(); res(true); };
  });
});
J.addXP = () => { /* Fortschritt läuft über deinen Pass (XP aus Journal & Sessions) */ };

/* ---------- Zustand: kleine Daten in App.settings.jt (Sync über dein Supabase-Konto), große lokal ---------- */
  const DEF = {
  settings: { name: 'Eliano', cur: '$', sym: 'ar:NAS100', tf: '1T', speak: false, voice: '', rate: 1, ind: null, lines: {} },
  funded: [], notes: [], positions: [], brain: { areas: [] },
  demo: { trades: [], start: 100000, pv: {}, tz: 'local' },
  risk: { maxDayLoss: 0, maxTrades: 0, maxRiskPct: 1, maxLossStreak: 3, rules: '' },
  watch: ['ar:NAS100', 'ar:US500', 'ar:US30', 'ar:GER40', 'ar:XAUUSD', 'BTCUSDT', 'ETHUSDT', '^VIX', '^TNX', 'DX-Y.NYB', 'CL=F', 'EURUSD=X']
};
  const LOCAL = { briefings: [], chat: [] };
  const SYNCED = Object.keys(DEF);
J.S = {};
  const LS = { get(k) { try { const v = localStorage.getItem('jt.' + k); return v ? JSON.parse(v) : null; } catch { return null; } }, set(k, v) { try { localStorage.setItem('jt.' + k, JSON.stringify(v)); } catch { } } };
  const clone = x => JSON.parse(JSON.stringify(x));
J.loadState = () => {
  const src = (typeof App !== 'undefined' && App.settings && App.settings.jt) || {};
  for (const k of SYNCED) { const v = src[k]; J.S[k] = v == null ? clone(DEF[k]) : Array.isArray(DEF[k]) ? (Array.isArray(v) ? v : clone(DEF[k])) : Object.assign(clone(DEF[k]), v); }
  for (const k of Object.keys(LOCAL)) J.S[k] = LS.get(k) || clone(LOCAL[k]);
};
J.store = {
  save(k) {
    if (k in LOCAL) { LS.set(k, J.S[k]); return; }
    try { App.settings.jt = App.settings.jt || {}; App.settings.jt[k] = J.S[k]; App.saveSettings(); } catch (e) { LS.set(k, J.S[k]); }
  }
};
J.loadState();

/* ---------- Brücke zu deiner Backtest-App ---------- */
J.journal = () => (typeof App !== 'undefined' && Array.isArray(App.journal) ? App.journal : []).filter(t => t && t.status !== 'open' && isFinite(t.pnl));
J.stratNames = () => (typeof App !== 'undefined' && Array.isArray(App.strategies) ? App.strategies.map(s => s.name).filter(Boolean) : []);
/* Trade aus Desk/Replay in dein Journal schreiben (gleiches Format wie dein Replay) */
J.toJournal = (t) => {
  const e = { id: 'jt-' + J.uid(), sym: J.short(t.sym), src: 'desk', replay: null, session: null, side: t.side, type: 'market', qty: t.qty, entryT: Math.round(t.entryT), entryPrice: t.entry, exitT: Math.round(t.exitT), exitPrice: t.exit, avgExit: t.exit, sl: t.sl, slFinal: t.sl, tp: t.tp || null, reason: t.reason || 'Manuell', pnl: +t.pnl.toFixed(2), gross: +t.pnl.toFixed(2), fees: 0, r: t.r, risk: t.risk, points: (t.exit - t.entry) * t.side, setup: t.strat || '', note: t.note || '', pv: t.pv || 1, tick: 0.01, status: 'closed' };
  App.journal.push(e); App.saveJournal(); try { Pass.refresh(); } catch { }
  return e;
};

/* ---------- Symbole ---------- */
J.SYM = [
  ['ar:NAS100', 'Nasdaq 100 (wie NQ)', 'NAS100', 'Dein Archiv'], ['ar:US500', 'S&P 500 (wie ES)', 'US500', 'Dein Archiv'], ['ar:US30', 'Dow Jones (wie YM)', 'US30', 'Dein Archiv'], ['ar:GER40', 'DAX 40', 'GER40', 'Dein Archiv'], ['ar:XAUUSD', 'Gold (wie GC)', 'XAUUSD', 'Dein Archiv'],
  ['BTCUSDT', 'Bitcoin', 'BTC', 'Krypto (Binance)'], ['ETHUSDT', 'Ethereum', 'ETH', 'Krypto (Binance)'], ['SOLUSDT', 'Solana', 'SOL', 'Krypto (Binance)'],
  ['^GSPC', 'S&P 500 Index', 'SPX', 'Indizes'], ['^NDX', 'Nasdaq 100 Index', 'NDX', 'Indizes'], ['^DJI', 'Dow Jones Index', 'DJI', 'Indizes'], ['^GDAXI', 'DAX Index', 'DAX', 'Indizes'], ['^RUT', 'Russell 2000', 'RUT', 'Indizes'], ['^STOXX50E', 'Euro Stoxx 50', 'SX5E', 'Indizes'],
  ['ES=F', 'E-Mini S&P Future', 'ES', 'Futures'], ['NQ=F', 'E-Mini Nasdaq Future', 'NQ', 'Futures'], ['YM=F', 'E-Mini Dow Future', 'YM', 'Futures'], ['RTY=F', 'E-Mini Russell Future', 'RTY', 'Futures'], ['GC=F', 'Gold Future', 'GC', 'Futures'], ['SI=F', 'Silber Future', 'SI', 'Futures'], ['CL=F', 'WTI Rohöl', 'WTI', 'Futures'], ['HG=F', 'Kupfer', 'KUPFER', 'Futures'], ['NG=F', 'Erdgas', 'GAS', 'Futures'],
  ['EURUSD=X', 'EUR/USD', 'EURUSD', 'Devisen'], ['GBPUSD=X', 'GBP/USD', 'GBPUSD', 'Devisen'], ['USDJPY=X', 'USD/JPY', 'USDJPY', 'Devisen'],
  ['^VIX', 'VIX Volatilität', 'VIX', 'Makro'], ['^TNX', 'US-Rendite 10 J.', 'US10Y', 'Makro'], ['^FVX', 'US-Rendite 5 J.', 'US5Y', 'Makro'], ['^IRX', 'US-Rendite 3 M.', 'US3M', 'Makro'], ['^TYX', 'US-Rendite 30 J.', 'US30Y', 'Makro'], ['DX-Y.NYB', 'US-Dollar-Index', 'DXY', 'Makro'],
  ['NVDA', 'Nvidia', 'NVDA', 'Aktien'], ['AAPL', 'Apple', 'AAPL', 'Aktien'], ['MSFT', 'Microsoft', 'MSFT', 'Aktien'], ['AMZN', 'Amazon', 'AMZN', 'Aktien'], ['META', 'Meta', 'META', 'Aktien'], ['TSLA', 'Tesla', 'TSLA', 'Aktien'], ['GOOGL', 'Alphabet', 'GOOGL', 'Aktien'],
  ['SPY', 'SPDR S&P 500 ETF', 'SPY', 'ETFs'], ['QQQ', 'Invesco QQQ', 'QQQ', 'ETFs']
];
  const SYMMAP = Object.fromEntries(J.SYM.map(s => [s[0], s]));
J.name = s => s?.startsWith('CSV:') ? s.slice(4) : (SYMMAP[s]?.[1] || s);
J.short = s => s?.startsWith('CSV:') ? s.slice(4) : (SYMMAP[s]?.[2] || String(s).replace(/^ar:/, ''));
J.kind = s => s.startsWith('ar:') ? 'archive' : s.startsWith('CSV:') ? 'csv' : /USDT$|USDC$|BUSD$/.test(s) ? 'binance' : 'market';
J.symOptions = sel => {
  const groups = {};
  J.SYM.forEach(s => (groups[s[3]] = groups[s[3]] || []).push(s));
  const csv = Object.keys(J.data).filter(k => k.startsWith('CSV:') && !k.includes('|'));
  let h = Object.entries(groups).map(([g, l]) => `<optgroup label="${g}">${l.map(s => `<option value="${s[0]}"${s[0] === sel ? ' selected' : ''}>${s[2]} · ${s[1]}</option>`).join('')}</optgroup>`).join('');
  if (csv.length) h += `<optgroup label="Eigene CSV">${csv.map(k => `<option value="${J.esc(k)}"${k === sel ? ' selected' : ''}>${J.esc(k.slice(4))}</option>`).join('')}</optgroup>`;
  if (sel && !SYMMAP[sel] && !sel.startsWith('CSV:')) h += `<option value="${J.esc(sel)}" selected>${J.esc(sel)}</option>`;
  return h;
};
/* Punktwerte wie in deiner App (Futures/CFDs) */
J.PV = { 'ar:NAS100': 20, 'ar:US500': 50, 'ar:US30': 5, 'ar:XAUUSD': 100, 'ar:GER40': 5, 'NQ=F': 20, 'ES=F': 50, 'YM=F': 5, 'RTY=F': 50, 'GC=F': 100, 'SI=F': 5000, 'CL=F': 1000, 'HG=F': 25000, 'NG=F': 10000 };
J.MICRO = { 'ar:NAS100': 2, 'ar:US500': 5, 'ar:US30': 0.5, 'ar:XAUUSD': 10, 'ar:GER40': 1, 'NQ=F': 2, 'ES=F': 5, 'YM=F': 0.5, 'RTY=F': 5, 'GC=F': 10, 'CL=F': 100, 'SI=F': 1000 };
J.isFut = s => !!J.PV[s];
J.pv = (s, micro) => J.PV[s] ? (micro ? J.MICRO[s] : J.PV[s]) : 1;

/* ---------- Zeitrahmen ---------- */
J.TF = { '5m': { label: '5 Min', s: 300 }, '15m': { label: '15 Min', s: 900 }, '1h': { label: '1 Std', s: 3600 }, '4h': { label: '4 Std', s: 14400 }, '1T': { label: '1 Tag', s: 86400 }, '1W': { label: '1 Woche', s: 604800 } };

/* ---------- Datenquellen ---------- */
J.data = {};
J.src = { state: 'bereit', ms: null, at: null, err: null };
  const RAW = 'https://raw.githubusercontent.com/qvw8mrjzby-arch/edge-lab-replay/main/data/';
  let dataBase = null;
  const getJSON = async (rel, maxAge = 0) => {
  const bases = dataBase ? [dataBase] : (location.protocol === 'file:' ? [RAW] : ['data/', '../data/', RAW]);
  let last = null;
  for (const b of bases) {
    try { const t0 = performance.now(); const r = await fetch(b + rel, { cache: maxAge ? 'default' : 'no-cache' }); if (!r.ok) { last = { code: r.status === 404 ? 'missing' : 'http', status: r.status }; continue; } const j = await r.json(); dataBase = b; J.src.ms = Math.round(performance.now() - t0); J.src.at = Date.now(); return j; }
    catch (e) { last = { code: 'net', message: e.message }; }
  }
  throw last || { code: 'net' };
};
J.getJSON = getJSON;
  const toC = arr => arr.map(a => ({ t: a[0] * 1000, o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] || 0 }));
  const agg = (c, sec, offSec = 0) => { const out = []; let cur = null, key = null; for (const b of c) { const k = Math.floor((b.t / 1000 + offSec) / sec); if (k !== key) { cur && out.push(cur); cur = { ...b }; key = k; } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } } cur && out.push(cur); return out; };
  const weekly = c => { const out = []; let cur = null, key = null; for (const b of c) { const d = new Date(b.t); const k = Math.floor((b.t / 864e5 + 3) / 7); if (k !== key) { cur && out.push(cur); cur = { ...b }; key = k; } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } } cur && out.push(cur); return out; };
J.fileOf = sym => sym.replace(/[^A-Za-z0-9.-]/g, c => ({ '^': '_', '=': '~' }[c] || '-'));
J.errText = e => {
  const c = e?.code;
  const m = {
    missing: 'Für diesen Markt liegen noch keine Daten auf deiner Seite – die GitHub-Aktion „Marktdaten für Jarvis“ lädt sie stündlich automatisch.',
    net: 'Keine Verbindung zum Datenserver. Internet prüfen und erneut laden.',
    http: 'Datenserver hat einen Fehler gemeldet (' + (e?.status || '') + ').',
    binance: e?.message || 'Binance ist gerade nicht erreichbar.',
    tf: 'Diesen Zeitrahmen gibt es für diesen Markt nicht – nimm 1h, 4h, 1T oder 1W.',
    nodata: 'Keine Kursdaten erhalten.',
    csv: 'CSV nicht gefunden – bitte erneut importieren.'
  };
  return m[c] || (e?.message ? String(e.message) : 'Daten konnten nicht geladen werden.');
};
  const fresh = (k, ms) => J.data[k] && Date.now() - J.data[k].loaded < ms;
/* Lädt Kerzen: archive (dein Dukascopy-Archiv), binance (live), market (stündliche Yahoo-Dateien), csv */
J.load = async (sym, tf, force) => {
  const key = sym + '|' + tf;
  if (!force && fresh(key, tf === '5m' || tf === '15m' ? 6e4 : 3e5)) return J.data[key];
  const kind = J.kind(sym); let ds;
  if (kind === 'csv') { const d = J.data[sym]; if (!d) throw { code: 'csv' }; return d; }
  if (kind === 'archive') {
    const id = sym.slice(3); const file = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '1h', '1T': '1d', '1W': '1d' }[tf];
    const j = await getJSON(`agg/${id}-${file}.json`);
    let c = toC(j.c); if (tf === '4h') c = agg(c, 14400); if (tf === '1W') c = weekly(c);
    ds = { sym, tf, candles: c, meta: { name: j.name, tz: j.tz }, off: -new Date().getTimezoneOffset() * 60, src: 'Dein Archiv (Dukascopy, alle 3 Std. aktualisiert)', stand: j.built };
  } else if (kind === 'binance') {
    const iv = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1T': '1d', '1W': '1w' }[tf];
    const t0 = performance.now(); let raw;
    try { raw = typeof Binance !== 'undefined' ? await Binance.get('spot', 'k', { symbol: sym, interval: iv, limit: 1000 }) : await (await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${iv}&limit=1000`)).json(); }
    catch (e) { throw { code: 'binance', message: e.message }; }
    J.src.ms = Math.round(performance.now() - t0); J.src.at = Date.now();
    ds = { sym, tf, candles: raw.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })), meta: {}, off: 0, src: 'Binance live', stand: new Date().toISOString() };
  } else {
    if (tf === '5m' || tf === '15m') throw { code: 'tf' };
    const j = await getJSON(`markets/${J.fileOf(sym)}.json`);
    let c;
    if (tf === '1h' || tf === '4h') { if (!j.h1) throw { code: 'tf' }; c = toC(j.h1); if (tf === '4h') c = agg(c, 14400, j.meta?.gmtoffset || 0); }
    else { c = toC(j.d1); if (tf === '1W') c = weekly(c); }
    ds = { sym, tf, candles: c, meta: j.meta || {}, off: j.meta?.gmtoffset || 0, src: (j.source || 'Yahoo Finance') + ' (stündlich aktualisiert)', stand: j.at };
  }
  if (!ds.candles.length) throw { code: 'nodata' };
  ds.loaded = Date.now(); J.data[key] = ds; J.src.err = null; return ds;
};
J.quote = ds => {
  const c = ds?.candles; if (!c?.length) return null;
  const last = c[c.length - 1].c, prev = c.length > 1 ? c[c.length - 2].c : null;
  return { last, prev, ch: prev != null ? last - prev : null, chp: prev ? (last / prev - 1) * 100 : null, t: c[c.length - 1].t };
};
/* Mehrere Märkte als Tageskerzen (Watchlist, Explorer, Makro) */
J.loadDaily = async (syms, force) => {
  const out = {};
  await Promise.all(syms.map(async s => { try { out[s] = await J.load(s, '1T', force); } catch (e) { out[s] = null; } }));
  return out;
};

/* ---------- CSV-Import ---------- */
J.parseCSV = (text) => {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 3) throw new Error('Zu wenige Zeilen.');
  const d = [';', '\t', ','].map(x => [x, lines[0].split(x).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = lines[0].split(d).map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const find = (...ns) => { let i = head.findIndex(h => ns.includes(h)); if (i < 0) i = head.findIndex(h => ns.some(n => n.length > 1 && h.startsWith(n))); return i; };
  const it = find('time', 'date', 'datum', 'zeit', 'timestamp', 'open time'), io = find('open', 'eröffnung', 'o'), ih = find('high', 'hoch', 'h'), il = find('low', 'tief', 'l'), ic = find('close', 'schluss', 'c'), iv = find('volume', 'volumen', 'vol');
  if ([it, io, ih, il, ic].some(i => i < 0)) throw new Error('Spalten Zeit/Open/High/Low/Close nicht gefunden.');
  const de = d === ';';
  const pn = s => { s = String(s).replace(/"/g, '').trim(); if (de) s = s.replace(/\./g, '').replace(',', '.'); return parseFloat(s); };
  const pt = s => { s = String(s).replace(/"/g, '').trim(); if (/^\d{10}$/.test(s)) return +s * 1000; if (/^\d{13}$/.test(s)) return +s; const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})[ T]?(\d{1,2})?:?(\d{2})?/); if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return new Date(y, m[2] - 1, m[1], m[4] || 0, m[5] || 0).getTime(); } const t = Date.parse(s.replace(' ', 'T')); return isNaN(t) ? null : t; };
  const out = [];
  for (const ln of lines.slice(1)) { const p = ln.split(d); const t = pt(p[it]); const o = pn(p[io]), h = pn(p[ih]), l = pn(p[il]), c = pn(p[ic]); if (t == null || [o, h, l, c].some(v => !isFinite(v))) continue; out.push({ t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: iv >= 0 ? (pn(p[iv]) || 0) : 0 }); }
  out.sort((a, b) => a.t - b.t);
  if (out.length < 3) throw new Error('Keine gültigen Kerzen erkannt.');
  return out;
};
J.addCSV = (name, candles) => {
  const key = 'CSV:' + name.replace(/\.[a-z]+$/i, '').slice(0, 30);
  const dt = candles.length > 1 ? (candles[candles.length - 1].t - candles[0].t) / (candles.length - 1) : 864e5;
  J.data[key] = { sym: key, tf: dt < 864e5 * 0.9 ? 'csv' : '1T', candles, meta: {}, off: -new Date().getTimezoneOffset() * 60, src: 'CSV', loaded: Date.now() };
  return key;
};
J.pickCSV = () => new Promise(res => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.txt,text/csv';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return res(null); try { const c = J.parseCSV(await f.text()); const k = J.addCSV(f.name, c); J.toast(`${c.length} Kerzen aus ${f.name} geladen`, 'good'); res(k); } catch (e) { J.toast('CSV-Fehler: ' + e.message, 'bad'); res(null); } };
  inp.click();
});

/* ---------- Markdown light ---------- */
J.md = (src) => {
  const e = J.esc(src || '');
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null;
  for (const ln of e.split('\n')) {
    const t = ln.trim(); let m;
    if ((m = t.match(/^#{1,4}\s+(.*)/))) { list && out.push(`</${list}>`); list = null; out.push(`<h4>${inline(m[1])}</h4>`); }
    else if ((m = t.match(/^[-*•]\s+(.*)/))) { if (list !== 'ul') { list && out.push(`</${list}>`); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = t.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { list && out.push(`</${list}>`); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!t) { list && out.push(`</${list}>`); list = null; }
    else { list && out.push(`</${list}>`); list = null; out.push(`<p>${inline(t)}</p>`); }
  }
  list && out.push(`</${list}>`);
  return out.join('');
};

/* ---------- Icons ---------- */
  const P = {
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>', line: '<path d="M3 12h18"/><circle cx="7" cy="12" r="1.6"/>', plus: '<path d="M12 5v14M5 12h14"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'
};
J.icon = (n, extra = '') => `<svg class="i" viewBox="0 0 24 24" ${extra}>${P[n] || ''}</svg>`;

/* ---------- Einbindung in deine App: Bereiche anzeigen ---------- */
J.V = {};
  let cleanup = null, curView = null;
J.show = (v) => {
  if (curView === v) return;
  J.hide();
  const el = document.getElementById('jt-' + v); if (!el || !J.V[v]) return;
  J.loadState(); curView = v; J.root = el; el.innerHTML = '';
  try { cleanup = J.V[v](el) || null; } catch (e) { console.error(e); el.innerHTML = `<div class="card empty"><b>Bereich konnte nicht geladen werden</b><span>${J.esc(e.message)}</span></div>`; }
};
J.hide = () => { if (cleanup) { try { cleanup(); } catch { } } cleanup = null; if (curView) { const el = document.getElementById('jt-' + curView); if (el) el.innerHTML = ''; } J.root = null; curView = null; };
J.go = v => { location.hash = '#' + v; };
J.route = () => { const v = curView; if (!v) return; curView = null; J.show(v); };
}
