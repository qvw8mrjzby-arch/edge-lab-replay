/* Demo-Trades — deine echten Demo-/Paper-Trades (z. B. TradingView Paper Trading) importieren, eintragen und auswerten.
   Daten: J.S.demo (über App.settings.jt synchronisiert). Getrennt von Journal/Backtests, damit Backtest-Statistik und Pass sauber bleiben. */
'use strict';
{
  const { esc } = J;
  const V = J.V;
  const val = (b, id) => b.querySelector('#' + id)?.value ?? '';
  const D = () => J.S.demo;
  const save = () => J.store.save('demo');
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const TAGS = ['Plan befolgt', 'Geduldig gewartet', 'A+ Setup', 'FOMO', 'Revenge', 'Zu früh raus', 'Zu spät rein', 'Stop verschoben', 'Kein Stop', 'Überhebelt', 'Gegen den Trend', 'News-Trade'];

  /* ---------- Zahlen & Zeiten ---------- */
  const fnum = (v, semi) => {
    if (v == null) return null; let s = String(v).trim().replace(/[\s$€£%]|USD|EUR/g, ''); if (!s || s === '-') return null;
    const neg = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, '');
    const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c >= 0 && d >= 0) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c >= 0) s = (!semi && /^-?\d{1,3}(,\d{3})+$/.test(s)) ? s.replace(/,/g, '') : s.replace(',', '.');
    const n = parseFloat(s); return isFinite(n) ? (neg ? -n : n) : null;
  };
  /* Wanduhrzeit in einer Zeitzone → Unix-ms */
  const offMs = (ms, tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms; };
  const MONTHS = { jan: 1, feb: 2, mär: 3, mrz: 3, mar: 3, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
  const parseTime = (s, tz) => {
    s = String(s || '').trim(); if (!s) return null;
    if (/^\d{10}$/.test(s)) return +s * 1000; if (/^\d{13}$/.test(s)) return +s;
    if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) { const t = Date.parse(s.replace(' ', 'T')); return isFinite(t) ? t : null; }
    let m = s.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d?):(\d\d)(?::(\d\d))?/) || null, Y, Mo, Dd, h, mi, se;
    if (m) [, Y, Mo, Dd, h, mi, se] = m;
    else if ((m = s.match(/^(\d\d?)\.(\d\d?)\.(\d{2,4})[ ,]+(\d\d?):(\d\d)(?::(\d\d))?/))) [, Dd, Mo, Y, h, mi, se] = m;
    else if ((m = s.match(/^(\d\d?)\/(\d\d?)\/(\d{4})[ ,]+(\d\d?):(\d\d)(?::(\d\d))?\s*(AM|PM)?/i))) { [, Mo, Dd, Y, h, mi, se] = m; if (m[7]) { h = +h % 12 + (/pm/i.test(m[7]) ? 12 : 0); } }
    else if ((m = s.match(/^(\d{4})-(\d\d)-(\d\d)$/))) { [, Y, Mo, Dd] = m; h = 12; mi = 0; }
    else if ((m = s.match(/^(\d{1,2})\.?\s*([A-Za-zÄäÖöÜü]{3,})\.?\s+(\d{4}),?\s+(\d\d?):(\d\d)(?::(\d\d))?/)) && MONTHS[m[2].slice(0, 3).toLowerCase()]) { [, Dd, , Y, h, mi, se] = m; Mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; }
    else if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d\d?):(\d\d)(?::(\d\d))?/)) && MONTHS[m[1].toLowerCase()]) { [, , Dd, Y, h, mi, se] = m; Mo = MONTHS[m[1].toLowerCase()]; }
    else { const t = Date.parse(s); return isFinite(t) ? t : null; }
    if (String(Y).length === 2) Y = '20' + Y;
    const wall = Date.UTC(+Y, +Mo - 1, +Dd, +h, +mi, +(se || 0));
    if (tz === 'local') return new Date(+Y, +Mo - 1, +Dd, +h, +mi, +(se || 0)).getTime();
    if (tz === 'UTC') return wall;
    let t = wall - offMs(wall, tz); t = wall - offMs(t, tz); return t;
  };
  const BER = (o) => new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: 'Europe/Berlin' }, o));
  const dayKey = ms => BER({}).format(new Date(ms));
  const HF = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Berlin' });
  const hourOf = ms => +HF.formatToParts(new Date(ms)).find(p => p.type === 'hour').value % 24;
  const wdOf = ms => (new Date(dayKey(ms) + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const dur = s => { if (!(s >= 0)) return '–'; const m = Math.round(s / 60000); return m < 60 ? m + ' Min' : m < 1440 ? Math.floor(m / 60) + ' Std ' + (m % 60) + ' Min' : (m / 1440).toFixed(1).replace('.', ',') + ' Tage'; };
  const toLocalInput = ms => { if (!ms) return ''; const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

  /* ---------- Punktwerte (Futures) ---------- */
  const PV = { NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, GC: 100, MGC: 10, SI: 5000, SIL: 1000, CL: 1000, MCL: 100, NG: 10000, HG: 25000, ZB: 1000, ZN: 1000, '6E': 125000, M6E: 12500, '6B': 62500, FDAX: 25, FDXM: 5, FDXS: 1 };
  const root = sym => { let s = String(sym || '').toUpperCase(); s = s.includes(':') ? s.split(':').pop() : s; return s.replace(/\d!$/, '').replace(/[FGHJKMNQUVXZ](20)?\d{2}$/, ''); };
  const short = sym => { const s = String(sym || ''); return s.includes(':') ? s.split(':').pop() : s; };
  const pvOf = sym => { const o = D().pv || {}; const r = root(sym); if (o[r] != null) return o[r]; if (o[short(sym)] != null) return o[short(sym)]; return PV[r] ?? 1; };

  /* ---------- CSV ---------- */
  const parseCSV = text => {
    text = String(text || '').replace(/^﻿/, '').trim(); if (!text) return { rows: [], semi: false };
    const first = text.split(/\r?\n/)[0]; const delim = (first.split(';').length > first.split(',').length) ? ';' : (first.split('\t').length > first.split(',').length ? '\t' : ',');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    row.push(cur); rows.push(row);
    return { rows: rows.filter(r => r.some(c => c.trim())), semi: delim === ';' };
  };
  const H = h => String(h || '').toLowerCase().replace(/[^a-z0-9äöü&]+/g, ' ').trim();
  const col = (hd, ...names) => { for (const n of names) { const i = hd.indexOf(n); if (i >= 0) return i; } for (const n of names) { const i = hd.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };

  /* Fills (Kauf/Verkauf) → abgeschlossene Trades: flach → Position → flach */
  const buildTrades = fills => {
    const bySym = {}; fills.forEach(f => (bySym[f.sym] = bySym[f.sym] || []).push(f));
    const out = [], open = [];
    for (const [sym, L] of Object.entries(bySym)) {
      L.sort((a, b) => a.t - b.t || a.i - b.i);
      let pos = 0, tr = null;
      const start = (t) => { tr = { sym, side: 0, fills: [], entryT: t, maxQ: 0 }; };
      for (const f of L) {
        let q = f.q, fee = f.fee || 0;
        while (Math.abs(q) > 1e-12) {
          if (!tr) start(f.t);
          if (!tr.side) tr.side = Math.sign(q);
          let part = q;
          if (pos && Math.sign(q) !== Math.sign(pos) && Math.abs(q) > Math.abs(pos)) part = -pos;
          const fp = fee * Math.abs(part / q); fee -= fp;
          tr.fills.push([f.t, +part.toPrecision(12), f.p, +fp.toFixed(4)]);
          pos = +(pos + part).toPrecision(12); q = +(q - part).toPrecision(12);
          tr.maxQ = Math.max(tr.maxQ, Math.abs(pos));
          if (Math.abs(pos) < 1e-9) { pos = 0; out.push(tr); tr = null; }
        }
      }
      if (tr) open.push({ sym, qty: pos });
    }
    return { trades: out.map(finish), open };
  };
  const finish = tr => {
    const pv = tr.pv != null ? tr.pv : pvOf(tr.sym); let eq = 0, ev = 0, xq = 0, xv = 0, cash = 0, fees = 0;
    for (const [t, q, p, fee] of tr.fills) { cash -= q * p; fees += fee || 0; if (Math.sign(q) === tr.side) { eq += Math.abs(q); ev += Math.abs(q) * p; } else { xq += Math.abs(q); xv += Math.abs(q) * p; } }
    const gross = cash * pv;
    const key = tr.sym + '|' + tr.fills[0][0] + '|' + tr.fills[tr.fills.length - 1][0] + '|' + eq;
    return Object.assign(tr, { id: tr.id || 'tv-' + hash(key), src: tr.src || 'tv', qty: tr.maxQ || eq, entry: eq ? ev / eq : null, exit: xq ? xv / xq : null, entryT: tr.fills[0][0], exitT: tr.fills[tr.fills.length - 1][0], gross: +gross.toFixed(2), fees: +fees.toFixed(2), pnl: +(gross - fees).toFixed(2), pvUsed: pv });
  };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  /* Datei/Text erkennen: TradingView History/Order History, Balance History oder einfache Trade-Liste */
  const parseImport = (text, tz) => {
    const { rows, semi } = parseCSV(text); if (rows.length < 2) return { err: 'Keine Tabelle erkannt.' };
    const hd = rows[0].map(H), body = rows.slice(1), n = v => fnum(v, semi);
    const cSym = col(hd, 'symbol', 'instrument', 'ticker', 'markt'), cSide = col(hd, 'side', 'seite', 'richtung', 'direction', 'action type');
    const cFill = col(hd, 'fill price', 'avg fill price', 'ausführungspreis', 'avg price', 'durchschnittspreis');
    const cAct = col(hd, 'action', 'aktion');
    // 0) Handelsverlauf / List of trades (Symbol, Trade-Nummer, Typ „Long-Einstieg/Short-Ausstieg“, Datum und Uhrzeit, Preis, Größe (Menge), Netto G&V)
    const cNr = col(hd, 'trade nummer', 'trade #', 'trade nr', 'trade number'), cTyp = col(hd, 'typ', 'type');
    if (cNr >= 0 && cTyp >= 0) {
      const cDt = col(hd, 'datum und uhrzeit', 'date time', 'date', 'datum'), cPr = col(hd, 'preis', 'price'), cQ = col(hd, 'größe menge', 'menge', 'quantity', 'contracts', 'qty'), cPn = col(hd, 'netto g&v', 'net p&l', 'net pnl', 'profit'), cFee = col(hd, 'provision', 'commission'), cOid = col(hd, 'order id');
      const G = new Map(); let skip = 0, openN = 0; const open = [];
      body.forEach(r => { const k = (r[cSym] || '') + '#' + r[cNr]; if (!G.has(k)) G.set(k, {}); const g = G.get(k); const ty = String(r[cTyp] || ''); if (/ausstieg|exit/i.test(ty)) g.x = r; else if (/einstieg|entry/i.test(ty)) g.e = r; });
      const trades = [];
      for (const g of G.values()) {
        if (!g.e) { skip++; continue; }
        const x = g.x, side = /short/i.test(g.e[cTyp]) ? -1 : 1, sym = String(g.e[cSym] || '').trim();
        const xt = x ? parseTime(x[cDt], tz) : null;
        if (!x || !xt || n(x[cPr]) == null) { open.push({ sym, qty: side * (n(g.e[cQ]) || 0) }); continue; }
        const qty = Math.abs(n(g.e[cQ]) || 0), en = n(g.e[cPr]), ex = n(x[cPr]), et = parseTime(g.e[cDt], tz), fee = Math.abs(n(x[cFee]) || 0);
        let pnl = n(x[cPn]); const gross = pnl != null ? pnl + fee : null;
        const pvG = gross != null && qty && en != null && ex != null && ex !== en ? Math.abs(gross / ((ex - en) * qty)) : null;
        if (pnl == null) { if (en == null || ex == null) { skip++; continue; } pnl = (ex - en) * side * qty * pvOf(sym) - fee; }
        trades.push({ id: 'tvh-' + hash(sym + '|' + (cOid >= 0 ? g.e[cOid] + '|' + x[cOid] : g.e[cDt] + '|' + x[cDt]) + '|' + qty), src: 'tv', sym, side, qty, entry: en, exit: ex, entryT: et, exitT: xt, gross: +((gross ?? pnl + fee)).toFixed(2), fees: fee, pnl: +pnl.toFixed(2), fills: null, pvUsed: pvG ? +pvG.toPrecision(4) : pvOf(sym), nr: g.e[cNr] });
      }
      if (trades.length) return { kind: 'Handelsverlauf', fills: body.length, skip, trades, open };
    }
    // 1) Order-Historie (TradingView Paper Trading: Symbol, Side, Type, Qty, Fill Price, Status, Commission, Placing/Closing Time, Order ID)
    if (cSym >= 0 && cSide >= 0 && cFill >= 0) {
      const cQ = col(hd, 'qty', 'quantity', 'menge', 'filled qty', 'stück'), cSt = col(hd, 'status'), cFee = col(hd, 'commission', 'kommission', 'gebühr', 'fee');
      const cT = col(hd, 'closing time', 'fill time', 'filled time', 'ausführungszeit', 'time', 'zeit', 'placing time', 'datum', 'date');
      const fills = []; let skip = 0;
      body.forEach((r, i) => {
        if (cSt >= 0 && r[cSt] && !/fill|ausgef|executed/i.test(r[cSt])) { skip++; return; }
        const side = String(r[cSide] || '').toLowerCase(); const s = /buy|kauf|long/.test(side) ? 1 : /sell|verkauf|short/.test(side) ? -1 : 0;
        const q = Math.abs(n(r[cQ]) || 0), p = n(r[cFill]), t = parseTime(r[cT], tz);
        if (!s || !q || p == null || !t || !r[cSym]) { skip++; return; }
        fills.push({ sym: r[cSym].trim(), q: s * q, p, t, fee: Math.abs(n(r[cFee]) || 0), i });
      });
      if (!fills.length) return { err: 'Keine ausgeführten Orders gefunden. Exportiere „History“ bzw. „Order History“ mit allen Spalten.' };
      const { trades, open } = buildTrades(fills);
      return { kind: 'Order-Historie', fills: fills.length, skip, trades, open };
    }
    // 2) Balance History (Time, Balance Before/After, Realized P&L, Action „Close long position for symbol … at price … for … units. Position AVG Price was …“)
    if (cAct >= 0) {
      const cT = col(hd, 'time', 'zeit', 'date'), cP = col(hd, 'realized p&l value', 'realized p&l', 'realisierter', 'p&l');
      const trades = []; let skip = 0;
      body.forEach(r => {
        const a = String(r[cAct] || ''); const m = a.match(/(long|short)\s+position\s+for\s+symbol\s+(\S+)\s+at\s+price\s+(\d[\d.,]*\d|\d)\s+for\s+(\d[\d.,]*\d|\d)\s+units?/i);
        const pnl = n(r[cP]); const t = parseTime(r[cT], tz);
        if (!m || pnl == null || !t) { skip++; return; }
        const avg = (a.match(/avg\.?\s*price\s+was\s+(\d[\d.,]*\d|\d)/i) || [])[1];
        const side = /long/i.test(m[1]) ? 1 : -1, qty = n(m[4]), exit = n(m[3]), entry = avg ? n(avg) : null;
        trades.push({ id: 'tvb-' + hash(m[2] + t + pnl + qty), src: 'tv', sym: m[2].replace(/[.,]$/, ''), side, qty, entry, exit, entryT: null, exitT: t, gross: pnl, fees: 0, pnl, fills: null });
      });
      if (!trades.length) return { err: 'Kontoverlauf erkannt, aber keine Schließungen gefunden.' };
      return { kind: 'Kontoverlauf', fills: trades.length, skip, trades, open: [] };
    }
    // 3) Einfache Trade-Liste (Symbol, Seite, Menge, Einstieg, Ausstieg, P&L, Zeiten)
    const cEn = col(hd, 'entry price', 'einstieg', 'entry', 'open price'), cEx = col(hd, 'exit price', 'ausstieg', 'exit', 'close price'), cPn = col(hd, 'p&l', 'pnl', 'profit', 'gewinn', 'net');
    if (cSym >= 0 && (cPn >= 0 || (cEn >= 0 && cEx >= 0))) {
      const cQ = col(hd, 'qty', 'quantity', 'menge', 'size', 'kontrakte'), cT1 = col(hd, 'entry time', 'einstiegszeit', 'open time', 'opened'), cT2 = col(hd, 'exit time', 'ausstiegszeit', 'close time', 'closed', 'datum', 'date', 'time');
      const cSl = col(hd, 'stop loss', 'stop', 'sl'), cTp = col(hd, 'take profit', 'ziel', 'tp'), cSt = col(hd, 'strategie', 'strategy', 'setup'), cNo = col(hd, 'notiz', 'note', 'kommentar');
      const trades = []; let skip = 0;
      body.forEach(r => {
        const sd = String(r[cSide] || '').toLowerCase(); const side = /sell|short|verkauf/.test(sd) ? -1 : 1;
        const qty = Math.abs(n(r[cQ]) || 1), en = n(r[cEn]), ex = n(r[cEx]), t2 = parseTime(r[cT2], tz), t1 = parseTime(r[cT1], tz) || null;
        let pnl = n(r[cPn]); if (pnl == null && en != null && ex != null) pnl = (ex - en) * side * qty * pvOf(r[cSym]);
        if (pnl == null || !t2) { skip++; return; }
        trades.push({ id: 'csv-' + hash(r.join('|')), src: 'csv', sym: r[cSym].trim(), side, qty, entry: en, exit: ex, entryT: t1, exitT: t2, gross: pnl, fees: 0, pnl: +pnl.toFixed(2), fills: null, pvUsed: pvOf(r[cSym]), sl: cSl >= 0 ? n(r[cSl]) : null, tp: cTp >= 0 ? n(r[cTp]) : null, strat: cSt >= 0 ? (r[cSt] || '').trim() : '', note: cNo >= 0 ? (r[cNo] || '').trim() : '' });
      });
      if (trades.length) return { kind: 'Trade-Liste', fills: trades.length, skip, trades, open: [] };
    }
    return { err: 'Format nicht erkannt. Erwartet: TradingView „History“/„Order History“ (Spalten Symbol, Side, Qty, Fill Price, Closing Time) oder „Balance History“.' };
  };

  /* ---------- Kennzahlen ---------- */
  const rOf = t => { if (t.r != null && isFinite(t.r)) return t.r; if (t.sl == null || t.entry == null || !t.qty) return null; const risk = Math.abs(t.entry - t.sl) * t.qty * (t.pvUsed || pvOf(t.sym)); return risk > 0 ? t.pnl / risk : null; };
  const stats = T => {
    const W = T.filter(t => t.pnl > 0), L = T.filter(t => t.pnl < 0);
    const gw = W.reduce((s, t) => s + t.pnl, 0), gl = -L.reduce((s, t) => s + t.pnl, 0), net = gw - gl;
    let eq = 0, pk = 0, dd = 0, cw = 0, cl = 0, mw = 0, ml = 0;
    [...T].sort((a, b) => a.exitT - b.exitT).forEach(t => { eq += t.pnl; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); if (t.pnl > 0) { cw++; cl = 0; } else if (t.pnl < 0) { cl++; cw = 0; } mw = Math.max(mw, cw); ml = Math.max(ml, cl); });
    const Rs = T.map(rOf).filter(x => x != null), hold = T.filter(t => t.entryT && t.exitT).map(t => t.exitT - t.entryT);
    return { n: T.length, w: W.length, l: L.length, wr: T.length ? W.length / T.length * 100 : null, net, gw, gl, pf: gl ? gw / gl : (gw ? Infinity : null), aw: W.length ? gw / W.length : null, al: L.length ? -gl / L.length : null, exp: T.length ? net / T.length : null, dd, mw, ml, best: T.length ? Math.max(...T.map(t => t.pnl)) : null, worst: T.length ? Math.min(...T.map(t => t.pnl)) : null, avgR: Rs.length ? Rs.reduce((a, b) => a + b, 0) / Rs.length : null, nR: Rs.length, hold: hold.length ? hold.reduce((a, b) => a + b, 0) / hold.length : null, fees: T.reduce((s, t) => s + (t.fees || 0), 0) };
  };
  /* Farben aus dem aktiven Pass-Design (für die Canvas-Kurven) */
  const tc = (v, fb) => { try { const c = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return /^#[0-9a-f]{6}$/i.test(c) ? c : fb; } catch { return fb; } };
  const UP = () => tc('--bull', '#2fcf9f'), DN = () => tc('--bear', '#ef5d78');
  const pfTxt = pf => pf == null ? '–' : pf === Infinity ? '∞' : J.num(pf, 2);
  const groupRows = (T, keyFn, order) => { const m = new Map(); T.forEach(t => { const k = keyFn(t); if (k == null || k === '') return; [].concat(k).forEach(kk => { if (!m.has(kk)) m.set(kk, []); m.get(kk).push(t); }); }); let e = [...m.entries()].map(([k, L]) => [k, stats(L)]); e = order ? e.sort((a, b) => order(a[0], b[0])) : e.sort((a, b) => b[1].net - a[1].net); return e; };

  /* ---------- Seite ---------- */
    const table = (title, rows) => `<div class="card"><h3>${title}</h3><table class="dm-tbl"><thead><tr><th></th><th class="r">Trades</th><th class="r">Treffer</th><th class="r">PF</th><th class="r">Netto</th></tr></thead><tbody>${rows.length ? rows.map(([k, s]) => `<tr><td><b>${esc(k)}</b></td><td class="r">${s.n}</td><td class="r">${J.num(s.wr, 0)} %</td><td class="r">${pfTxt(s.pf)}</td><td class="r ${J.cls(s.net)}">${J.money(s.net, 0)}</td></tr>`).join('') : '<tr><td colspan="5" class="mut">Keine Daten</td></tr>'}</tbody></table></div>`;
    const insights = (T, S) => {
      if (T.length < 5) return '';
      const L = []; const g = (f) => groupRows(T, f).filter(([, s]) => s.n >= 3);
      const hrs = g(t => t.entryT ? String(hourOf(t.entryT)).padStart(2, '0') + ':00' : null);
      if (hrs.length > 1) { const b = hrs[0], w = hrs[hrs.length - 1]; if (b[1].net > 0) L.push(`Beste Uhrzeit: <b>${b[0]}</b> (${b[1].n} Trades, ${J.money(b[1].net, 0)}).`); if (w[1].net < 0) L.push(`Teuerste Uhrzeit: <b>${w[0]}</b> (${w[1].n} Trades, <span class="dn">${J.money(w[1].net, 0)}</span>).`); }
      const sy = g(t => short(t.sym)); if (sy.length > 1 && sy[sy.length - 1][1].net < 0) L.push(`Schwächstes Symbol: <b>${esc(sy[sy.length - 1][0])}</b> mit ${J.money(sy[sy.length - 1][1].net, 0)}.`);
      const ls = g(t => t.side > 0 ? 'Long' : 'Short'); if (ls.length === 2 && Math.sign(ls[0][1].net) !== Math.sign(ls[1][1].net)) L.push(`<b>${ls[0][0]}</b> bringt Geld (${J.money(ls[0][1].net, 0)}), <b>${ls[1][0]}</b> kostet Geld (${J.money(ls[1][1].net, 0)}).`);
      if (S.aw && S.worst < 0 && -S.worst > 2 * S.aw) L.push(`Dein größter Verlust (${J.money(S.worst, 0)}) frisst ${J.num(-S.worst / S.aw, 1)} durchschnittliche Gewinne.`);
      if (S.wr != null && S.aw && S.al) { const be = -S.al / (S.aw - S.al) * 100; L.push(`Mit deinem Gewinn/Verlust-Verhältnis brauchst du mindestens <b>${J.num(be, 0)} %</b> Treffer – du hast ${J.num(S.wr, 0)} %.`); }
      const tg = g(t => t.tags && t.tags.length ? t.tags : null).filter(([, s]) => s.net < 0); if (tg.length) L.push(`Teuerstes Merkmal: <b>${esc(tg[tg.length - 1][0])}</b> (${J.money(tg[tg.length - 1][1].net, 0)}).`);
      const noSl = T.filter(t => t.sl == null).length; if (noSl) L.push(`${noSl} von ${T.length} Trades ohne eingetragenen Stop – trag ihn im Trade nach, dann siehst du dein R.`);
      return L.length ? `<div class="card" style="margin-bottom:16px"><h3>Was deine Zahlen sagen</h3><ul class="dm-ins">${L.map(x => `<li>${x}</li>`).join('')}</ul></div>` : '';
    };
    const ai = (T, S) => {
      const persona = () => { try { return Jarvis.persona(); } catch { return 'Du bist Jarvis, mein Trading-Coach. Antworte auf Deutsch, klar und knapp.'; } };
      const r2 = x => x == null || !isFinite(x) ? null : +(+x).toFixed(2);
      const g = f => Object.fromEntries(groupRows(T, f).map(([k, s]) => [k, { trades: s.n, treffer: r2(s.wr), netto: r2(s.net), pf: s.pf === Infinity ? 'inf' : r2(s.pf) }]));
      const data = { kennzahlen: { trades: S.n, netto: r2(S.net), trefferquote: r2(S.wr), profitFaktor: S.pf === Infinity ? 'inf' : r2(S.pf), avgGewinn: r2(S.aw), avgVerlust: r2(S.al), erwartung: r2(S.exp), maxDrawdown: r2(S.dd), avgR: r2(S.avgR), haltedauerMin: S.hold ? Math.round(S.hold / 60000) : null, verlustSerie: S.ml },
        nachSymbol: g(t => short(t.sym)), longShort: g(t => t.side > 0 ? 'Long' : 'Short'), nachStunde: g(t => t.entryT ? hourOf(t.entryT) + ' Uhr' : null), nachWochentag: g(t => WD[wdOf(t.entryT || t.exitT)]), nachStrategie: g(t => t.strat || null), nachMerkmal: g(t => t.tags && t.tags.length ? t.tags : null),
        letzte25: T.slice(0, 25).map(t => ({ zeit: J.dt(t.exitT), sym: short(t.sym), seite: t.side > 0 ? 'L' : 'S', pnl: r2(t.pnl), r: r2(rOf(t)), min: t.entryT ? Math.round((t.exitT - t.entryT) / 60000) : null, strat: t.strat || undefined, sterne: t.grade || undefined, merkmale: t.tags?.length ? t.tags : undefined, notiz: t.note ? t.note.slice(0, 140) : undefined })) };
      J.jvAsk('Jarvis wertet deine Demo-Trades aus', (on) => Jarvis.think(`${persona()}\n\nWerte meine Demo-Trades (TradingView Paper Trading, echte Ausführungen, aktuelle Filterauswahl) aus. Nur was die Daten zeigen, keine erfundenen Zahlen. Struktur: ### Kurzfazit (2 Sätze), ### Was funktioniert, ### Teuerste Muster (Uhrzeiten, Symbole, Seite, Merkmale – mit $), ### Risiko (Gewinn/Verlust-Verhältnis, Drawdown, Stops), ### 3 konkrete Regeln für die nächste Woche.\n\nDaten (JSON):\n${JSON.stringify(data)}`, { onText: ({ text }) => on(text) }), `${T.length} Trades in der Auswahl`);
    };

  V.demo = el => {
    const st = { per: 'all', sym: '', side: 0, strat: '', tag: '', mon: null, show: 40 };
    let cleans = [];
    const all = () => (D().trades || []).filter(t => isFinite(t.pnl) && t.exitT).sort((a, b) => b.exitT - a.exitT);
    const sel = () => {
      const now = Date.now(), today = J.today();
      const lim = { day: t => dayKey(t.exitT) === today, w: t => t.exitT >= now - 7 * 864e5, m30: t => t.exitT >= now - 30 * 864e5, mon: t => dayKey(t.exitT).slice(0, 7) === today.slice(0, 7), y: t => dayKey(t.exitT).slice(0, 4) === today.slice(0, 4) }[st.per];
      return all().filter(t => (!lim || lim(t)) && (!st.sym || short(t.sym) === st.sym) && (!st.side || t.side === st.side) && (!st.strat || (t.strat || '') === st.strat) && (!st.tag || (t.tags || []).includes(st.tag)));
    };
    const render = () => {
      cleans.forEach(f => { try { f(); } catch { } }); cleans = [];
      const A = all(), T = sel(), S = stats(T), SA = stats(A), d = D();
      const bal = (+d.start || 0) + SA.net;
      const syms = [...new Set(A.map(t => short(t.sym)))].sort(), strats = [...new Set(A.map(t => t.strat).filter(Boolean))].sort(), tags = [...new Set(A.flatMap(t => t.tags || []))].sort();
      const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const kpi = (l, v, c, s) => `<div class="kpi"><span>${l}</span><b class="${c || ''}">${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;
      el.innerHTML = `<div class="page-hd"><div><h1>Live-Trades</h1><p class="mut">Deine Demo-/Paper-Trades auf Live-Charts aus TradingView – importieren, notieren, auswerten</p></div></div>
      <div class="row" style="margin-bottom:16px;gap:8px"><button class="btn pri" id="dmImp">${J.icon('upload')}TradingView importieren</button><button class="btn" id="dmAdd">${J.icon('plus')}Trade eintragen</button><div class="sp"></div>${A.length ? `<button class="btn" id="dmAi">Jarvis auswerten</button>` : ''}<button class="btn ghost" id="dmSet">Konto & Punktwerte</button></div>
      ${!A.length ? empty() : `
      <div class="card" style="margin-bottom:16px"><div class="row" style="gap:8px">${seg('per', [['all', 'Alles'], ['day', 'Heute'], ['w', '7 Tage'], ['m30', '30 Tage'], ['mon', 'Monat'], ['y', 'Jahr']], st.per)}${seg('side', [[0, 'Beide'], [1, 'Long'], [-1, 'Short']], st.side)}
        <select id="dmSym" style="width:auto"><option value="">Alle Symbole</option>${syms.map(s => `<option ${s === st.sym ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        ${strats.length ? `<select id="dmStrat" style="width:auto"><option value="">Alle Strategien</option>${strats.map(s => `<option ${s === st.strat ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
        ${tags.length ? `<select id="dmTag" style="width:auto"><option value="">Alle Merkmale</option>${tags.map(s => `<option ${s === st.tag ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}</div></div>
      <div class="kpis" style="margin-bottom:16px">
        ${kpi('Netto P&amp;L', J.money(S.net), J.cls(S.net), `${S.n} Trades · Gebühren ${J.cash(S.fees)}`)}
        ${kpi('Kontostand', J.cash(bal), '', `Start ${J.cash(+d.start || 0, 0)} · ${J.pct(d.start ? SA.net / d.start * 100 : null)}`)}
        ${kpi('Trefferquote', S.wr == null ? '–' : J.num(S.wr, 1) + ' %', '', `${S.w} Gewinner · ${S.l} Verlierer`)}
        ${kpi('Profit-Faktor', pfTxt(S.pf), S.pf >= 1 ? 'up' : S.pf != null ? 'dn' : '', 'Gewinne ÷ Verluste')}
        ${kpi('Ø Gewinn / Ø Verlust', `${J.num(S.aw ?? NaN, 0)} / ${J.num(S.al ?? NaN, 0)}`, '', S.aw && S.al ? `Verhältnis ${J.num(S.aw / -S.al, 2)} : 1` : '')}
        ${kpi('Erwartung je Trade', J.money(S.exp), J.cls(S.exp), S.avgR != null ? `Ø ${J.num(S.avgR, 2)} R (${S.nR} mit Stop)` : 'Stop eintragen für R')}
        ${kpi('Max. Drawdown', J.cash(S.dd), S.dd ? 'dn' : '', `Serien: ${S.mw} Gewinne · ${S.ml} Verluste`)}
        ${kpi('Ø Haltedauer', dur(S.hold), '', `Bester ${J.money(S.best, 0)} · Schlechtester ${J.money(S.worst, 0)}`)}
      </div>
      <div class="grid g2" style="margin-bottom:16px"><div class="card"><h3>Kontokurve</h3><div id="dmEq" style="height:230px"></div></div><div class="card"><h3>Kalender<span class="sp"></span><button class="btn sm ghost" data-mon="-1">‹</button><span class="note" id="dmMon"></span><button class="btn sm ghost" data-mon="1">›</button></h3><div id="dmCal"></div></div></div>
      ${insights(T, S)}
      <a class="card dm-link" href="#livestats" style="margin-bottom:16px"><b>Alle Statistiken zu deinen Live-Trades</b><span class="mut">Symbole, Uhrzeiten, Sessions, Haltedauer, Verteilung, Monate und der Vergleich mit deinem Backtest</span><span class="dm-go">Live-Statistik →</span></a>
      <div class="card"><h3>Trades (${T.length})<span class="sp"></span><button class="btn sm ghost" id="dmCsv">Als CSV sichern</button></h3>
        <div class="scroll"><table class="dm-tbl"><thead><tr><th>Ausstieg</th><th>Symbol</th><th>Seite</th><th class="r">Menge</th><th class="r">Einstieg</th><th class="r">Ausstieg</th><th class="r">Dauer</th><th class="r">R</th><th class="r">P&amp;L</th><th>Strategie / Notiz</th></tr></thead><tbody>
        ${T.slice(0, st.show).map(t => { const r = rOf(t); return `<tr data-tr="${t.id}"><td>${J.dt(t.exitT)}</td><td><b>${esc(short(t.sym))}</b></td><td><span class="chip ${t.side > 0 ? 'up' : 'dn'}">${t.side > 0 ? 'Long' : 'Short'}</span></td><td class="r">${J.num(t.qty, t.qty % 1 ? 2 : 0)}</td><td class="r">${J.price(t.entry)}</td><td class="r">${J.price(t.exit)}</td><td class="r">${t.entryT ? dur(t.exitT - t.entryT) : '–'}</td><td class="r">${r == null ? '–' : J.num(r, 2)}</td><td class="r ${J.cls(t.pnl)}"><b>${J.money(t.pnl)}</b></td><td class="dm-note">${t.grade ? '<span class="gold">' + '★'.repeat(t.grade) + '</span> ' : ''}${esc(t.strat || '')}${t.note ? ' · <span class="mut">' + esc(t.note.slice(0, 60)) + '</span>' : ''}${t.shot ? ' 📷' : ''}</td></tr>`; }).join('')}
        </tbody></table></div>${T.length > st.show ? `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn sm" id="dmMore">Weitere ${Math.min(40, T.length - st.show)} zeigen</button></div>` : ''}</div>`}`;
      bind(T, S);
    };
    const empty = () => `<div class="card empty"><b>Noch keine Live-Trades</b><span>So holst du deine TradingView-Paper-Trades rein:</span>
      <ol class="dm-steps"><li>Auf TradingView einen Chart öffnen, unten <b>Paper Trading</b> öffnen.</li><li>Im Tab <b>History</b> (bzw. Order History) über die drei Punkte rechts alle Spalten anhaken (Side, Type, Qty, Fill Price, Status, Commission, Closing Time, Order ID).</li><li>Auf das Paper-Trading-Logo klicken → <b>Export data</b> → <b>Handelsverlauf</b> (bzw. History) → Export.</li><li>Hier auf <b>TradingView importieren</b> und die CSV wählen – fertig. Doppelte Trades werden beim nächsten Import erkannt.</li></ol>
      <span class="note">Kein Export zur Hand? Einzelne Trades kannst du auch mit „Trade eintragen“ von Hand erfassen.</span></div>`;
    const calendar = (T) => {
      const box = J.$('#dmCal', el); if (!box) return;
      const mon = st.mon || (T[0] ? dayKey(T[0].exitT).slice(0, 7) : J.today().slice(0, 7)); st.mon = mon;
      const [y, m] = mon.split('-').map(Number); J.$('#dmMon', el).textContent = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const days = {}; T.forEach(t => { const k = dayKey(t.exitT); if (k.slice(0, 7) !== mon) return; (days[k] = days[k] || { n: 0, p: 0 }); days[k].n++; days[k].p += t.pnl; });
      const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const max = Math.max(1, ...Object.values(days).map(x => Math.abs(x.p)));
      let h = `<div class="dm-cal">${WD.map(w => `<div class="dm-wd">${w}</div>`).join('')}<div class="dm-wd">Woche</div>`, wk = 0, cell = 0;
      const pushWeek = () => { h += `<div class="dm-wk ${J.cls(wk)}">${wk ? J.money(wk, 0) : ''}</div>`; wk = 0; };
      for (let i = 0; i < first; i++) { h += '<div></div>'; cell++; }
      for (let dd = 1; dd <= nd; dd++) {
        const k = `${mon}-${String(dd).padStart(2, '0')}`, x = days[k];
        const a = x ? (.3 + .7 * Math.abs(x.p) / max).toFixed(2) : 0;
        h += `<div class="dm-day ${x ? (x.p >= 0 ? 'win' : 'loss') : ''}" style="${x ? `--a:${a}` : ''}" ${x ? `data-day="${k}"` : ''}><i>${dd}</i>${x ? `<b>${J.money(x.p, 0)}</b><small>${x.n} T.</small>` : ''}</div>`;
        if (x) wk += x.p; cell++; if (cell % 7 === 0) pushWeek();
      }
      if (cell % 7) { while (cell % 7) { h += '<div></div>'; cell++; } pushWeek(); }
      box.innerHTML = h + '</div>';
      J.$$('[data-day]', box).forEach(c => c.onclick = () => { const k = c.dataset.day; J.modal('Trades am ' + J.date(k), `<table class="dm-tbl"><tbody>${T.filter(t => dayKey(t.exitT) === k).map(t => `<tr><td>${J.dt(t.exitT)}</td><td>${esc(short(t.sym))}</td><td>${t.side > 0 ? 'Long' : 'Short'}</td><td class="r ${J.cls(t.pnl)}">${J.money(t.pnl)}</td></tr>`).join('')}</tbody></table>`); });
    };
    const bind = (T, S) => {
      const $ = s => J.$(s, el);
      $('#dmImp').onclick = importDlg; $('#dmAdd').onclick = () => editDlg(); $('#dmSet').onclick = settingsDlg;
      if ($('#dmAi')) $('#dmAi').onclick = () => ai(T, S);
      J.$$('[data-seg]', el).forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { const k = g.dataset.seg; st[k] = k === 'side' ? +b.dataset.v : b.dataset.v; st.show = 40; render(); }));
      [['#dmSym', 'sym'], ['#dmStrat', 'strat'], ['#dmTag', 'tag']].forEach(([id, k]) => { const s = $(id); if (s) s.onchange = () => { st[k] = s.value; render(); }; });
      if (!T.length && !$('#dmEq')) return;
      const eqEl = $('#dmEq');
      if (eqEl) { const asc = [...T].reverse(); let c = 0; const v = [0, ...asc.map(t => (c += t.pnl))]; cleans.push(LineChart(eqEl, [{ v, color: c >= 0 ? UP() : DN(), w: 2, fill: (c >= 0 ? UP() : DN()) + '33' }], { zero: true, labels: ['', ...asc.map(t => J.date(t.exitT).slice(0, 6))], empty: 'Keine Trades in dieser Auswahl' })); }
      calendar(T);
      J.$$('[data-mon]', el).forEach(b => b.onclick = () => { const [y, m] = st.mon.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + +b.dataset.mon, 1)); st.mon = d.toISOString().slice(0, 7); calendar(T); });
      J.$$('[data-tr]', el).forEach(r => r.onclick = () => editDlg(D().trades.find(t => t.id === r.dataset.tr)));
      if ($('#dmMore')) $('#dmMore').onclick = () => { st.show += 40; render(); };
      if ($('#dmCsv')) $('#dmCsv').onclick = () => exportCSV(T);
    };

    /* ---------- Import ---------- */
    const importDlg = () => {
      let res = null;
      J.modal('TradingView-Trades importieren', `<p class="note">CSV aus TradingView: Paper Trading → History (oder Order History) mit allen Spalten → Export data. Auch „Balance History“ geht. Du kannst den Inhalt auch einfügen.</p>
        <div class="form"><label class="f w2">Datei(en)<input type="file" id="ifile" accept=".csv,.txt,text/csv" multiple></label>
        <label class="f">Zeitzone der Datei<select id="itz"><option value="local">Wie mein Gerät</option><option value="Europe/Berlin">Berlin</option><option value="UTC">UTC</option><option value="America/New_York">New York</option><option value="America/Chicago">Chicago</option></select></label>
        <label class="f w2">oder Text einfügen<textarea id="itxt" rows="4" placeholder="Symbol,Side,Type,Qty,Fill Price,Status,Commission,Closing Time,Order ID …"></textarea></label></div>
        <div id="iprev" style="margin-top:10px"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="icheck">Prüfen</button><button class="btn pri" id="igo" disabled>Übernehmen</button></div>`, (b, close) => {
        const tzSel = b.querySelector('#itz'); tzSel.value = D().tz || 'local';
        const check = async () => {
          const files = [...b.querySelector('#ifile').files]; let texts = await Promise.all(files.map(f => f.text())); const tx = val(b, 'itxt').trim(); if (tx) texts.push(tx);
          const out = b.querySelector('#iprev'); if (!texts.length) { out.innerHTML = '<p class="note">Wähle eine Datei oder füge Text ein.</p>'; return; }
          const trades = [], open = [], info = []; let errs = [];
          for (const t of texts) { const r = parseImport(t, tzSel.value); if (r.err) { errs.push(r.err); continue; } trades.push(...r.trades); open.push(...r.open); info.push(`${r.kind}: ${r.fills} Zeilen${r.skip ? `, ${r.skip} übersprungen (storniert/leer)` : ''}`); }
          const have = new Set((D().trades || []).map(t => t.id)); const neu = trades.filter(t => !have.has(t.id));
          res = { neu, upd: trades.filter(t => have.has(t.id)) };
          const net = neu.reduce((s, t) => s + t.pnl, 0);
          out.innerHTML = (errs.length ? `<p class="dn">${errs.map(esc).join('<br>')}</p>` : '') + (trades.length ? `<div class="dm-box"><b>${trades.length} Trades erkannt</b> – <b class="up">${neu.length} neu</b>, ${trades.length - neu.length} schon vorhanden. Netto der neuen: <b class="${J.cls(net)}">${J.money(net)}</b><br><span class="note">${info.map(esc).join(' · ')}${open.length ? ` · ${open.length} noch offene Position(en) nicht übernommen (${open.map(o => esc(short(o.sym)) + ' ' + o.qty).join(', ')})` : ''}</span><br><span class="note">Punktwerte: ${[...new Set(neu.map(t => short(t.sym) + ' = ' + J.num(pvOf(t.sym), pvOf(t.sym) % 1 ? 1 : 0)))].slice(0, 8).join(' · ')} – falsch? In „Konto & Punktwerte“ ändern.</span></div>` : '');
          b.querySelector('#igo').disabled = !neu.length;
        };
        b.querySelector('#icheck').onclick = check; b.querySelector('#ifile').onchange = check;
        b.querySelector('#igo').onclick = () => { if (!res) return; D().tz = tzSel.value; D().trades = (D().trades || []).concat(res.neu); save(); close(); render(); J.toast(`${res.neu.length} Demo-Trades übernommen`, 'good'); };
      });
    };

    /* ---------- Trade eintragen / bearbeiten ---------- */
    const editDlg = t0 => {
      const t = t0 || { id: 'man-' + J.uid(), src: 'manual', sym: '', side: 1, qty: 1, entry: null, exit: null, entryT: null, exitT: Date.now(), fees: 0, tags: [] };
      const man = t.src !== 'tv' || !t.fills; const strats = [...new Set(J.stratNames().concat((D().trades || []).map(x => x.strat).filter(Boolean)))];
      const r = rOf(t);
      J.modal(t0 ? `${short(t.sym)} · ${t.side > 0 ? 'Long' : 'Short'} · ${J.money(t.pnl)}` : 'Demo-Trade eintragen', `
        ${t0 && !man ? `<p class="note">Aus TradingView: ${J.num(t.qty, 2)} Stück · Einstieg ${J.price(t.entry)} (${J.dt(t.entryT)}) · Ausstieg ${J.price(t.exit)} (${J.dt(t.exitT)}) · Brutto ${J.money(t.gross)} · Gebühren ${J.cash(t.fees)} · Punktwert ${t.pvUsed}${r != null ? ` · <b>${J.num(r, 2)} R</b>` : ''}</p>` : ''}
        <div class="form">
          ${man ? `<label class="f">Symbol<input id="es" value="${esc(t.sym)}" placeholder="z. B. MNQ1!"></label><label class="f">Seite<select id="ed"><option value="1" ${t.side > 0 ? 'selected' : ''}>Long</option><option value="-1" ${t.side < 0 ? 'selected' : ''}>Short</option></select></label><label class="f">Menge<input id="eq" inputmode="decimal" value="${t.qty ?? ''}"></label><label class="f">Punktwert<input id="epv" inputmode="decimal" value="${t.pvUsed ?? ''}" placeholder="automatisch"></label>
          <label class="f">Einstieg<input id="een" inputmode="decimal" value="${t.entry ?? ''}"></label><label class="f">Ausstieg<input id="eex" inputmode="decimal" value="${t.exit ?? ''}"></label><label class="f">Einstiegszeit<input type="datetime-local" id="et1" value="${toLocalInput(t.entryT)}"></label><label class="f">Ausstiegszeit<input type="datetime-local" id="et2" value="${toLocalInput(t.exitT)}"></label>
          <label class="f">Gebühren<input id="efe" inputmode="decimal" value="${t.fees || ''}"></label><label class="f">P&amp;L (leer = berechnen)<input id="epn" inputmode="decimal" value="${t0 && t.manualPnl ? t.pnl : ''}"></label>` : ''}
          <label class="f">Stop-Loss (Preis)<input id="esl" inputmode="decimal" value="${t.sl ?? ''}"></label><label class="f">Ziel (Preis)<input id="etp" inputmode="decimal" value="${t.tp ?? ''}"></label>
          <label class="f w2">Strategie / Setup<input id="est" list="dmStr" value="${esc(t.strat || '')}"><datalist id="dmStr">${strats.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
          <label class="f w2">Ausführung<span class="dm-stars" id="egr">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-g="${i}" class="${(t.grade || 0) >= i ? 'on' : ''}">★</button>`).join('')}</span></label>
          <label class="f w2">Merkmale<span class="dm-tags" id="etg">${[...new Set(TAGS.concat(t.tags || []))].map(g => `<button type="button" class="chip ${(t.tags || []).includes(g) ? 'acc' : ''}" data-t="${esc(g)}">${esc(g)}</button>`).join('')}</span></label>
          <label class="f w2">Notiz<textarea id="eno" rows="3" placeholder="Warum rein, warum raus, was lerne ich?">${esc(t.note || '')}</textarea></label>
          <label class="f w2">Screenshot-Link (TradingView-Snapshot)<input id="esh" value="${esc(t.shot || '')}" placeholder="https://www.tradingview.com/x/…"></label>
        </div>${t.shot && /^https?:/.test(t.shot) ? `<p><a href="${esc(t.shot)}" target="_blank" rel="noopener">📷 Screenshot öffnen</a></p>` : ''}
        <div class="row" style="margin-top:12px">${t0 ? '<button class="btn ghost" id="edel" style="color:var(--bear)">Löschen</button>' : ''}<div class="sp"></div><button class="btn pri" id="esave">Speichern</button></div>`, (b, close) => {
        let grade = t.grade || 0; const tg = new Set(t.tags || []);
        b.querySelectorAll('[data-g]').forEach(x => x.onclick = () => { grade = grade === +x.dataset.g ? 0 : +x.dataset.g; b.querySelectorAll('[data-g]').forEach(y => y.classList.toggle('on', +y.dataset.g <= grade)); });
        b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { const g = x.dataset.t; tg.has(g) ? tg.delete(g) : tg.add(g); x.classList.toggle('acc', tg.has(g)); });
        b.querySelector('#esave').onclick = () => {
          const n = id => fnum(val(b, id));
          if (man) {
            const sym = val(b, 'es').trim(), side = +val(b, 'ed'), qty = n('eq'), en = n('een'), ex = n('eex'), t2 = val(b, 'et2') ? new Date(val(b, 'et2')).getTime() : null, t1 = val(b, 'et1') ? new Date(val(b, 'et1')).getTime() : null;
            if (!sym || !t2) return J.toast('Symbol und Ausstiegszeit angeben');
            const pv = n('epv') ?? pvOf(sym), fees = n('efe') || 0, pIn = n('epn');
            const gross = pIn != null ? pIn + fees : (en != null && ex != null && qty ? (ex - en) * side * qty * pv : null);
            if (gross == null) return J.toast('Einstieg, Ausstieg und Menge angeben – oder P&L direkt');
            Object.assign(t, { sym, side, qty: qty || 1, entry: en, exit: ex, entryT: t1, exitT: t2, pvUsed: pv, fees, gross: +gross.toFixed(2), pnl: +(gross - fees).toFixed(2), manualPnl: pIn != null });
          }
          Object.assign(t, { sl: n('esl'), tp: n('etp'), strat: val(b, 'est').trim(), grade, tags: [...tg], note: val(b, 'eno').trim(), shot: val(b, 'esh').trim() });
          if (!t0) D().trades.push(t); save(); close(); render(); J.toast('Gespeichert', 'good');
        };
        const del = b.querySelector('#edel'); if (del) del.onclick = async () => { close(); if (await J.confirm('Trade löschen?', `${short(t.sym)} ${J.money(t.pnl)} entfernen.`, 'Löschen')) { D().trades = D().trades.filter(x => x.id !== t.id); save(); render(); } };
      });
    };

    /* ---------- Konto & Punktwerte ---------- */
    const settingsDlg = () => {
      const d = D(); const roots = [...new Set((d.trades || []).filter(t => t.fills).map(t => root(t.sym)))].sort();
      J.modal('Konto & Punktwerte', `<div class="form"><label class="f">Startkapital Demo-Konto<input id="ss" inputmode="decimal" value="${d.start ?? ''}"></label></div>
        <h4 style="margin:14px 0 6px">Punktwerte (Geld pro 1 Punkt × 1 Kontrakt)</h4><p class="note">Für Futures nötig (TradingView exportiert keinen P&amp;L pro Order). Bekannte Werte sind vorbelegt, z. B. NQ 20, MNQ 2, ES 50, MES 5. Aktien/Krypto/CFDs: 1.</p>
        <div class="form">${roots.length ? roots.map(r => `<label class="f">${esc(r)}<input data-pv="${esc(r)}" inputmode="decimal" value="${(d.pv || {})[r] ?? PV[r] ?? 1}"></label>`).join('') : '<p class="note">Noch keine importierten Symbole.</p>'}</div>
        <div class="row" style="margin-top:14px"><button class="btn ghost" id="sclr" style="color:var(--bear)">Alle Demo-Trades löschen</button><div class="sp"></div><button class="btn pri" id="ssave">Speichern</button></div>`, (b, close) => {
        b.querySelector('#ssave').onclick = () => {
          d.start = fnum(b.querySelector('#ss').value) || 0; d.pv = d.pv || {};
          b.querySelectorAll('[data-pv]').forEach(i => { const v = fnum(i.value); if (v != null) d.pv[i.dataset.pv] = v; });
          d.trades = (d.trades || []).map(t => t.fills ? finish(Object.assign(t, { pv: null })) : t);
          save(); close(); render(); J.toast('Gespeichert – P&L neu berechnet', 'good');
        };
        b.querySelector('#sclr').onclick = async () => { close(); if (await J.confirm('Alle Demo-Trades löschen?', `${(d.trades || []).length} Trades werden entfernt. Sichere sie vorher als CSV.`, 'Alles löschen')) { d.trades = []; save(); render(); } };
      });
    };

    const exportCSV = T => {
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['Ausstieg', 'Einstieg', 'Symbol', 'Seite', 'Menge', 'Einstiegspreis', 'Ausstiegspreis', 'Stop', 'Brutto', 'Gebuehren', 'Netto', 'R', 'Strategie', 'Sterne', 'Merkmale', 'Notiz', 'Screenshot']].concat(T.map(t => [new Date(t.exitT).toISOString(), t.entryT ? new Date(t.entryT).toISOString() : '', short(t.sym), t.side > 0 ? 'Long' : 'Short', t.qty, t.entry, t.exit, t.sl, t.gross, t.fees, t.pnl, rOf(t)?.toFixed(2), t.strat, t.grade, (t.tags || []).join('|'), t.note, t.shot]));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\n')], { type: 'text/csv' })); a.download = `demo-trades-${J.today()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

    render();
    return () => { cleans.forEach(f => { try { f(); } catch { } }); };
  };

  /* ===================== Live-Statistik (eigener Tab, nur deine Live-/Demo-Trades) ===================== */
  const SESS = ms => { const h = hourOf(ms), m = +new Intl.DateTimeFormat('en-GB', { minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(ms)); const x = h + m / 60; return x >= 1 && x < 9 ? 'Asien (01–09 Uhr)' : x >= 9 && x < 15.5 ? 'London (09–15:30)' : x >= 15.5 && x < 22 ? 'New York (15:30–22)' : 'Nacht (22–01 Uhr)'; };
  const HOLD = ms => { const m = ms / 60000; return m < 2 ? 'unter 2 Min' : m < 10 ? '2–10 Min' : m < 30 ? '10–30 Min' : m < 120 ? '30 Min–2 Std' : 'über 2 Std'; };
  const HOLD_O = ['unter 2 Min', '2–10 Min', '10–30 Min', '30 Min–2 Std', 'über 2 Std'];
  V.livestats = el => {
    const st = { per: 'all', sym: '', side: 0 };
    let cleans = [];
    const all = () => (D().trades || []).filter(t => isFinite(t.pnl) && t.exitT).sort((a, b) => b.exitT - a.exitT);
    const sel = () => { const now = Date.now(), today = J.today(); const lim = { w: t => t.exitT >= now - 7 * 864e5, m30: t => t.exitT >= now - 30 * 864e5, mon: t => dayKey(t.exitT).slice(0, 7) === today.slice(0, 7), y: t => dayKey(t.exitT).slice(0, 4) === today.slice(0, 4) }[st.per]; return all().filter(t => (!lim || lim(t)) && (!st.sym || short(t.sym) === st.sym) && (!st.side || t.side === st.side)); };
    const kpi = (l, v, c, sm) => `<div class="kpi"><span>${l}</span><b class="${c || ''}">${v}</b>${sm ? `<small>${sm}</small>` : ''}</div>`;
    const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const btStats = () => { const J0 = (typeof J.journal === 'function' ? J.journal() : []).map(t => ({ pnl: t.pnl, exitT: (t.exitT || 0) * 1000, entryT: (t.entryT || 0) * 1000, r: t.r, side: t.side })); return J0.length ? stats(J0) : null; };
    const render = () => {
      cleans.forEach(f => { try { f(); } catch { } }); cleans = [];
      const A = all(), T = sel(), S = stats(T), d = D();
      const syms = [...new Set(A.map(t => short(t.sym)))].sort();
      if (!A.length) { el.innerHTML = `<div class="page-hd"><div><h1>Live-Statistik</h1><p class="mut">Nur deine Live-/Demo-Trades – getrennt von deinen Backtests</p></div></div><div class="card empty"><b>Noch keine Live-Trades</b><span>Importiere zuerst deinen TradingView-Handelsverlauf unter Live-Trades.</span><a class="btn pri" href="#demo">Zu den Live-Trades</a></div>`; return; }
      const asc = [...T].reverse();
      const days = {}; asc.forEach(t => { const k = dayKey(t.exitT); days[k] = (days[k] || 0) + t.pnl; });
      const dv = Object.values(days), dW = dv.filter(x => x > 0).length;
      const bestD = dv.length ? Math.max(...dv) : null, worstD = dv.length ? Math.min(...dv) : null;
      const W = T.filter(t => t.pnl > 0 && t.entryT), L = T.filter(t => t.pnl < 0 && t.entryT);
      const avgH = X => X.length ? X.reduce((s, t) => s + t.exitT - t.entryT, 0) / X.length : null;
      const start = +d.start || 0; let eq = start, pk = start, ddPct = 0; asc.forEach(t => { eq += t.pnl; pk = Math.max(pk, eq); if (pk > 0) ddPct = Math.max(ddPct, (pk - eq) / pk * 100); });
      const B = btStats();
      el.innerHTML = `<div class="page-hd"><div><h1>Live-Statistik</h1><p class="mut">Nur deine Live-/Demo-Trades aus TradingView – getrennt von deinen Backtests</p></div></div>
      <div class="row" style="margin-bottom:16px;gap:8px">${seg('per', [['all', 'Alles'], ['w', '7 Tage'], ['m30', '30 Tage'], ['mon', 'Monat'], ['y', 'Jahr']], st.per)}${seg('side', [[0, 'Beide'], [1, 'Long'], [-1, 'Short']], st.side)}<select id="lsSym" style="width:auto"><option value="">Alle Symbole</option>${syms.map(x => `<option ${x === st.sym ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><div class="sp"></div><button class="btn" id="lsAi">Jarvis auswerten</button><a class="btn ghost" href="#demo">Trades & Import</a></div>
      ${!T.length ? '<div class="card empty"><b>Keine Trades in dieser Auswahl</b></div>' : `
      <div class="kpis" style="margin-bottom:16px">
        ${kpi('Netto P&amp;L', J.money(S.net), J.cls(S.net), `${S.n} Trades an ${dv.length} Tagen`)}
        ${kpi('Trefferquote', J.num(S.wr, 1) + ' %', '', `${S.w} Gewinner · ${S.l} Verlierer`)}
        ${kpi('Profit-Faktor', pfTxt(S.pf), S.pf >= 1 ? 'up' : 'dn', `Gewinne ${J.cash(S.gw, 0)} · Verluste ${J.cash(S.gl, 0)}`)}
        ${kpi('Erwartung je Trade', J.money(S.exp), J.cls(S.exp), S.avgR != null ? `Ø ${J.num(S.avgR, 2)} R (${S.nR} Trades mit Stop)` : 'R: Stop im Trade eintragen')}
        ${kpi('Ø Gewinn / Ø Verlust', `${J.num(S.aw ?? NaN, 0)} / ${J.num(S.al ?? NaN, 0)}`, '', S.aw && S.al ? `Verhältnis ${J.num(S.aw / -S.al, 2)} : 1` : '')}
        ${kpi('Max. Drawdown', J.cash(S.dd), S.dd ? 'dn' : '', start ? `${J.num(ddPct, 2)} % vom Höchststand` : '')}
        ${kpi('Erholungsfaktor', S.dd ? J.num(S.net / S.dd, 2) : '–', '', 'Netto ÷ Max. Drawdown')}
        ${kpi('Grüne Tage', dv.length ? J.num(dW / dv.length * 100, 0) + ' %' : '–', '', `Bester ${J.money(bestD, 0)} · Schlechtester ${J.money(worstD, 0)}`)}
        ${kpi('Ø pro Tag', J.money(dv.length ? S.net / dv.length : null, 0), J.cls(S.net), `${J.num(S.n / (dv.length || 1), 1)} Trades pro Tag`)}
        ${kpi('Haltedauer', dur(S.hold), '', `Gewinner ${dur(avgH(W))} · Verlierer ${dur(avgH(L))}`)}
        ${kpi('Serien', `${S.mw} / ${S.ml}`, '', 'längste Gewinn- / Verlustserie')}
        ${kpi('Gebühren', J.cash(S.fees), '', `${S.gw ? J.num(S.fees / S.gw * 100, 1) : 0} % der Gewinne`)}
      </div>
      <div class="grid g2" style="margin-bottom:16px">
        <div class="card"><h3>Kontokurve</h3><div id="lsEq" style="height:220px"></div></div>
        <div class="card"><h3>Drawdown</h3><div id="lsDd" style="height:220px"></div></div>
        <div class="card"><h3>Tages-P&amp;L</h3>${dayBars(days)}</div>
        <div class="card"><h3>Verteilung der Trades (P&amp;L)</h3>${histo(T)}</div>
      </div>
      ${B ? compare(S, B) : ''}
      <div class="card" style="margin-bottom:16px"><h3>Wochentag × Uhrzeit (Einstieg, Berlin)</h3>${heat(T)}</div>
      ${insights(T, S)}
      <div class="grid g2" style="margin-bottom:16px">
        ${table('Nach Session', groupRows(T.filter(t => t.entryT), t => SESS(t.entryT), (a, b) => ['Asien (01–09 Uhr)', 'London (09–15:30)', 'New York (15:30–22)', 'Nacht (22–01 Uhr)'].indexOf(a) - ['Asien (01–09 Uhr)', 'London (09–15:30)', 'New York (15:30–22)', 'Nacht (22–01 Uhr)'].indexOf(b)))}
        ${table('Nach Symbol', groupRows(T, t => short(t.sym)))}
        ${table('Long / Short', groupRows(T, t => t.side > 0 ? 'Long' : 'Short'))}
        ${table('Nach Haltedauer', groupRows(T.filter(t => t.entryT), t => HOLD(t.exitT - t.entryT), (a, b) => HOLD_O.indexOf(a) - HOLD_O.indexOf(b)))}
        ${table('Nach Wochentag', groupRows(T, t => WD[wdOf(t.entryT || t.exitT)], (a, b) => WD.indexOf(a) - WD.indexOf(b)))}
        ${table('Nach Uhrzeit', groupRows(T.filter(t => t.entryT), t => String(hourOf(t.entryT)).padStart(2, '0') + ':00', (a, b) => a.localeCompare(b)))}
        ${table('Nach Monat', groupRows(T, t => dayKey(t.exitT).slice(0, 7), (a, b) => b.localeCompare(a)))}
        ${T.some(t => t.strat) ? table('Nach Strategie', groupRows(T, t => t.strat || 'ohne Strategie')) : ''}
        ${T.some(t => t.tags && t.tags.length) ? table('Nach Merkmal', groupRows(T, t => t.tags && t.tags.length ? t.tags : null)) : ''}
        ${T.some(t => t.grade) ? table('Nach Ausführung (★)', groupRows(T.filter(t => t.grade), t => '★'.repeat(t.grade), (a, b) => b.length - a.length)) : ''}
      </div>
      <div class="grid g2">${topList('Beste Trades', [...T].sort((a, b) => b.pnl - a.pnl).slice(0, 5))}${topList('Schlechteste Trades', [...T].sort((a, b) => a.pnl - b.pnl).slice(0, 5))}</div>`}`;
      J.$$('[data-seg]', el).forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => { const k = g.dataset.seg; st[k] = k === 'side' ? +b.dataset.v : b.dataset.v; render(); }));
      const ss = J.$('#lsSym', el); if (ss) ss.onchange = () => { st.sym = ss.value; render(); };
      J.$('#lsAi', el).onclick = () => ai(T, S);
      if (!T.length) return;
      let c = 0, p = 0; const v = [0, ...asc.map(t => (c += t.pnl))], dd = [0, ...asc.map((t, i) => { p = Math.max(p, v[i + 1]); return v[i + 1] - p; })];
      const labs = ['', ...asc.map(t => J.date(t.exitT).slice(0, 6))];
      cleans.push(LineChart(J.$('#lsEq', el), [{ v, color: c >= 0 ? UP() : DN(), w: 2, fill: (c >= 0 ? UP() : DN()) + '33' }], { zero: true, labels: labs }));
      cleans.push(LineChart(J.$('#lsDd', el), [{ v: dd, color: DN(), w: 1.8, fill: DN() + '2b' }], { zero: true, labels: labs }));
      J.$$('[data-tr]', el).forEach(r => r.onclick = () => { location.hash = '#demo'; });
    };
    const dayBars = days => { const E = Object.entries(days).slice(-30); if (!E.length) return '<p class="note">Keine Daten</p>'; const mx = Math.max(...E.map(e => Math.abs(e[1])), 1); return `<div class="dm-bars">${E.map(([k, x]) => `<div class="dm-bar" title="${J.date(k)}: ${J.money(x)}"><i class="${x >= 0 ? 'up' : 'dn'}" style="height:${(Math.abs(x) / mx * 50).toFixed(1)}%;${x >= 0 ? 'bottom:50%' : 'top:50%'}"></i></div>`).join('')}</div><div class="row nw note"><span>${J.date(E[0][0])}</span><div class="sp"></div><span>${J.date(E[E.length - 1][0])}</span></div>`; };
    const histo = T => { const v = T.map(t => t.pnl); const lo = Math.min(...v), hi = Math.max(...v); if (lo === hi) return '<p class="note">Zu wenig Streuung</p>'; const nb = Math.min(12, Math.max(5, Math.round(Math.sqrt(v.length)))); const w = (hi - lo) / nb; const B = Array.from({ length: nb }, (_, i) => ({ a: lo + i * w, n: 0 })); v.forEach(x => B[Math.min(nb - 1, Math.floor((x - lo) / w))].n++); const mx = Math.max(...B.map(b => b.n)); return `<div class="dm-hist">${B.map(b => `<div title="${J.num(b.a, 0)} bis ${J.num(b.a + w, 0)}: ${b.n} Trades"><span>${b.n || ''}</span><i class="${b.a + w / 2 >= 0 ? 'up' : 'dn'}" style="height:${(b.n / mx * 100).toFixed(1)}%"></i></div>`).join('')}</div><div class="row nw note"><span>${J.money(lo, 0)}</span><div class="sp"></div><span>${J.money(hi, 0)}</span></div>`; };
    const heat = T => { const hs = [...new Set(T.filter(t => t.entryT).map(t => hourOf(t.entryT)))].sort((a, b) => a - b); if (!hs.length) return '<p class="note">Keine Einstiegszeiten</p>'; const M = {}; T.forEach(t => { if (!t.entryT) return; const k = wdOf(t.entryT) + '|' + hourOf(t.entryT); (M[k] = M[k] || { n: 0, p: 0 }); M[k].n++; M[k].p += t.pnl; }); const mx = Math.max(...Object.values(M).map(x => Math.abs(x.p)), 1); const days = [0, 1, 2, 3, 4, 5, 6].filter(d => hs.some(h => M[d + '|' + h])); return `<div class="scroll"><table class="dm-heat"><thead><tr><th></th>${hs.map(h => `<th>${String(h).padStart(2, '0')}</th>`).join('')}</tr></thead><tbody>${days.map(d => `<tr><th>${WD[d]}</th>${hs.map(h => { const x = M[d + '|' + h]; return x ? `<td class="${x.p >= 0 ? 'up' : 'dn'}" style="--a:${(.25 + .75 * Math.abs(x.p) / mx).toFixed(2)}" title="${WD[d]} ${h}:00 · ${x.n} Trades · ${J.money(x.p)}">${J.num(x.p, 0)}</td>` : '<td></td>'; }).join('')}</tr>`).join('')}</tbody></table></div>`; };
    const compare = (S, B) => { const row = (l, a, b, f) => `<tr><td>${l}</td><td class="r"><b>${f(a)}</b></td><td class="r">${f(b)}</td></tr>`; const p1 = x => x == null ? '–' : J.num(x, 1) + ' %', m0 = x => J.money(x, 0), n2 = x => x == null ? '–' : x === Infinity ? '∞' : J.num(x, 2); return `<div class="card" style="margin-bottom:16px"><h3>Live vs. Backtest</h3><p class="note">Hält dein Edge aus dem Backtest auch auf Live-Charts? Backtest = dein Journal aus dem Replay.</p><table class="dm-tbl"><thead><tr><th></th><th class="r">Live</th><th class="r">Backtest</th></tr></thead><tbody>${row('Trades', S.n, B.n, x => x)}${row('Trefferquote', S.wr, B.wr, p1)}${row('Profit-Faktor', S.pf, B.pf, n2)}${row('Ø Gewinn', S.aw, B.aw, m0)}${row('Ø Verlust', S.al, B.al, m0)}${row('Erwartung je Trade', S.exp, B.exp, m0)}${row('Ø R', S.avgR, B.avgR, n2)}${row('Ø Haltedauer', S.hold, B.hold, dur)}</tbody></table></div>`; };
    const topList = (title, L) => `<div class="card"><h3>${title}</h3><table class="dm-tbl"><tbody>${L.map(t => `<tr><td>${J.dt(t.exitT)}</td><td><b>${esc(short(t.sym))}</b></td><td>${t.side > 0 ? 'Long' : 'Short'}</td><td class="r">${J.num(t.qty, t.qty % 1 ? 1 : 0)}</td><td class="r ${J.cls(t.pnl)}"><b>${J.money(t.pnl)}</b></td></tr>`).join('')}</tbody></table></div>`;
    render();
    return () => { cleans.forEach(f => { try { f(); } catch { } }); };
  };
  J.liveCtx = () => { const T = (D().trades || []).filter(t => isFinite(t.pnl) && t.exitT).sort((a, b) => b.exitT - a.exitT); if (!T.length) return { hinweis: 'Noch keine Live-Trades importiert' }; const S = stats(T), r2 = x => x == null || !isFinite(x) ? null : +(+x).toFixed(2); const g = f => Object.fromEntries(groupRows(T, f).map(([k, s]) => [k, { trades: s.n, treffer: r2(s.wr), netto: r2(s.net) }])); return { trades: S.n, netto: r2(S.net), trefferquote: r2(S.wr), profitFaktor: S.pf === Infinity ? 'inf' : r2(S.pf), avgGewinn: r2(S.aw), avgVerlust: r2(S.al), maxDrawdown: r2(S.dd), nachSymbol: g(t => short(t.sym)), nachSession: g(t => t.entryT ? SESS(t.entryT) : null), nachSeite: g(t => t.side > 0 ? 'Long' : 'Short'), letzte15: T.slice(0, 15).map(t => ({ zeit: J.dt(t.exitT), sym: short(t.sym), seite: t.side > 0 ? 'L' : 'S', menge: t.qty, einstieg: t.entry, ausstieg: t.exit, pnl: r2(t.pnl), notiz: t.note || undefined })) }; };
  J.demoParse = parseImport; /* für Tests */
}
