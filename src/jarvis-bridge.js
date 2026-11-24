/* Jarvis-Brücke (24.11.2026, Claude): schickt eine kleine Zusammenfassung deiner letzten Backtests an das
   Jarvis-HUD auf diesem PC (http://127.0.0.1:8650/edgelab). Jarvis zeigt sie unter „Edge Lab“ an, ein Klick
   dort öffnet die Session wieder hier (#session-<id>).
   - Nur Kennzahlen (Datum, Markt, Strategie, Trades, Ergebnis, Disziplin) – keine Notizen, Fotos oder Keys.
   - Läuft nur am Computer; ist Jarvis aus, passiert einfach nichts. Der Browser fragt beim ersten Mal,
     ob Edge Lab auf Apps auf diesem Gerät zugreifen darf – „Zulassen“ wählen.
   - Abschalten: localStorage 'elr.jarvis' = '0'. */
'use strict';
const JarvisBridge = (() => {
  const URL = 'http://127.0.0.1:8650/edgelab';
  const APP = 'https://qvw8mrjzby-arch.github.io/edge-lab-replay/';
  const DAY = 86400, WEEK = 7 * DAY;
  let timer = null, lastSig = '', busy = false;

  const enabled = () => {
    try { if (localStorage.getItem('elr.jarvis') === '0') return false; } catch { }
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')) return false;
    return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  };
  const num = (v) => (v == null || !isFinite(+v) ? null : Math.round(+v * 100) / 100);
  const iso = (t) => { try { return new Date(t * 1000).toISOString().slice(0, 10); } catch { return null; } };

  function summary() {
    const sess = (App.sessions || []).filter((s) => s && s.created);
    const journal = (App.journal || []).filter((t) => t && t.status !== 'open' && isFinite(t.pnl));
    const created = new Map(sess.map((s) => [s.replayId, s.created]));
    const when = (t) => (t.src === 'desk' ? t.exitT : created.get(t.replay)) || null;
    const t0 = Date.now() / 1000;
    const span = (a, b) => {
      const T = journal.filter((t) => { const w = when(t); return w && w > a && w <= b; });
      const S = sess.filter((s) => s.created > a && s.created <= b);
      const wins = T.filter((t) => t.pnl > 0).length, disc = S.filter((s) => s.discipline).map((s) => s.discipline);
      return { sess: S.length, trades: T.length, r: num(T.reduce((x, t) => x + (isFinite(t.r) ? +t.r : 0), 0)), win: T.length ? num(wins / T.length) : null,
        disc: disc.length ? num(disc.reduce((a2, b2) => a2 + b2, 0) / disc.length) : null };
    };
    const allWins = journal.filter((t) => t.pnl > 0).length;
    const list = sess.slice().sort((a, b) => b.created - a.created).slice(0, 12).map((s) => {
      const a = s.replayId && App.sessionAuto ? App.sessionAuto(s.replayId) : null;
      const trades = a ? a.trades : s.trades, net = a ? a.net : s.net, r = a ? a.sumR : s.r;
      const hide = s.running && s.blind;   // Blind-Session läuft noch: Datum nicht verraten
      return {
        id: String(s.id || ''), created: s.created, day: hide ? null : (s.realDay || (s.from ? iso(s.from) : null)),
        sym: s.sym || (a && a.sym) || '', strat: s.strategy || (a && a.strategy) || '',
        trades: trades == null ? null : +trades, wins: a ? a.wins : null, net: num(net), netTxt: net == null ? '' : App.fmtMoney(+net, true),
        r: num(r), disc: s.discipline || 0, mistakes: (s.mistakes || []).length, running: !!s.running, blind: !!s.blind,
        result: net == null ? '' : (App.resultOf ? App.resultOf(+net) : '')
      };
    });
    let lv = null; try { lv = (typeof Pass !== 'undefined') ? (Pass.last || Pass.refresh()) : null; } catch { }
    return {
      v: 1, t: Date.now(), app: APP,
      total: { sess: sess.length, trades: journal.length, r: num(journal.reduce((x, t) => x + (isFinite(t.r) ? +t.r : 0), 0)), win: journal.length ? num(allWins / journal.length) : null },
      week: span(t0 - WEEK, t0), prev: span(t0 - 2 * WEEK, t0 - WEEK),
      level: lv ? { lv: lv.level, xp: lv.total, from: lv.from, to: lv.to == null ? null : lv.to, next: lv.to == null ? null : lv.to - lv.total } : null,
      goals: lv && lv.week && lv.week.goals ? lv.week.goals.map((g) => ({ label: String(g.label || ''), cur: g.cur, target: g.target, done: !!g.done })) : [],
      sessions: list
    };
  }

  async function push() {
    if (!enabled() || busy) return;
    let s; try { s = summary(); } catch (e) { console.warn('Jarvis-Brücke', e); return; }
    /* nur ASCII schicken (der Jarvis-Server liest Bytes 1:1) und unter 8 KB bleiben */
    const enc = (o) => JSON.stringify(o).replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    let body = enc(s);
    while (body.length > 7800 && s.sessions.length > 3) { s.sessions.pop(); body = enc(s); }
    const sig = body.replace(/"t":\d+,/, '');
    if (sig === lastSig) return;
    busy = true;
    try {
      const r = await fetch(URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' }, body, cache: 'no-store', targetAddressSpace: 'loopback' });
      if (r.ok) lastSig = sig;
    } catch { /* Jarvis aus oder nicht erlaubt – egal */ }
    busy = false;
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(push, ms == null ? 3000 : ms); }

  /* Auslöser: Dashboard öffnen, Sessions/Journal speichern, alle 5 Minuten, wenn der Tab wieder sichtbar wird */
  const wrap = (name) => { const o = App[name]; if (typeof o !== 'function') return; App[name] = function () { const r = o.apply(this, arguments); schedule(); return r; }; };
  wrap('saveSessions'); wrap('saveJournal'); wrap('renderStart');
  setInterval(() => schedule(0), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(500); });
  schedule(6000);
  return { summary, push, schedule };
})();
