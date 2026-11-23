/* Dashboard (Startseite): alles, was du gemacht hast, auf einen Blick – über den bisherigen Kennzahlen der Übersicht.
   23.11.2026 (Claude): größer und effizienter – Aktionsleiste (Backtest-Session starten, fortsetzen, Journal, Jarvis),
   „Wie läuft's“ (diese Woche vs. letzte Woche, Serie, Disziplin), Level + Wochenziele. Dasselbe Dashboard erscheint
   im Second Brain unter „Home“ (Dash.mount), dort über dem schwarzen Loch. */
'use strict';
const Dash = (() => {
  const DAY = 86400, WEEK = 7 * DAY;
  const now = () => Date.now() / 1000;
  const fmtN = (n) => Number(n || 0).toLocaleString('de-DE');
  const ago = (t) => {
    const d = now() - t;
    if (d < 90) return 'gerade eben'; if (d < 3600) return 'vor ' + Math.round(d / 60) + ' Min.';
    if (d < DAY) return 'vor ' + Math.round(d / 3600) + ' Std.'; if (d < 2 * DAY) return 'gestern';
    if (d < 7 * DAY) return 'vor ' + Math.round(d / DAY) + ' Tagen';
    return new Date(t * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };
  const weeks = (times, n = 8) => { const out = new Array(n).fill(0), t0 = now(); for (const t of times) { if (!t) continue; const k = Math.floor((t0 - t) / WEEK); if (k >= 0 && k < n) out[n - 1 - k]++; } return out; };
  const spark = (vals) => { const m = Math.max(1, ...vals); return '<span class="dz-spark" aria-hidden="true">' + vals.map((v) => '<i style="height:' + Math.max(8, v / m * 100) + '%"' + (v ? ' class="on"' : '') + '></i>').join('') + '</span>'; };
  const ICON = {
    trade: '<path d="M3 14l4-4 3 3 7-7"/><path d="M13 6h4v4"/>',
    sess: '<path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M3.5 3v3.5H7"/><path d="M10 6.5V10l2.5 2"/>',
    strat: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.5"/>',
    note: '<path d="M5 2.5h6.5l4 4v11H5z"/><path d="M7.5 10h6M7.5 13.5h6"/>',
    pass: '<path d="M10 2.5l6.5 3.75v7.5L10 17.5l-6.5-3.75v-7.5z"/>',
    fund: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="1.4"/><circle cx="10" cy="10" r="4"/>',
    play: '<path d="M6 3.5v13l10.5-6.5z"/>',
    resume: '<path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M3.5 3v3.5H7"/>',
    book: '<path d="M4 3.5h9.5a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2z"/><path d="M4 14.5a2 2 0 0 1 2-2h9.5"/>',
    chart: '<path d="M3 16.5h14"/><path d="M6 13V8M10 13V5M14 13v-3"/>',
    bot: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.2"/>',
    flame: '<path d="M10 2.5c1 3 4.5 4.6 4.5 8.6a4.5 4.5 0 0 1-9 0c0-2 1-3.2 2-4 .2 1.6 1 2.4 1.8 2.6C9 7.5 9 5 10 2.5z"/>'
  };
  const ic = (k) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + ICON[k] + '</svg>';

  function data() {
    const S = (typeof J !== 'undefined' && J.S) || {};
    const sess = App.sessions || [], strat = App.strategies || [];
    const journal = (App.journal || []).filter((t) => t && t.status !== 'open' && isFinite(t.pnl));
    const created = new Map(sess.map((s) => [s.replayId, s.created]));
    const when = (t) => (t.src === 'desk' ? t.exitT : created.get(t.replay)) || null; // Zeitpunkt, an dem DU gehandelt hast (nicht die Replay-Zeit)
    const notes = S.notes || [], briefs = S.briefings || [], funded = S.funded || [];
    return { sess, strat, journal, when, notes, briefs, funded };
  }

  /* ---------- Aktionsleiste: der wichtigste Knopf ganz oben ---------- */
  function actions() {
    let st = null; try { st = App.pendingResume(); } catch { }
    const b = (act, k, lbl, sub, cls) => '<button type="button" class="dz-act-btn ' + (cls || '') + '" data-act="' + act + '"><span class="dz-ab-ic">' + ic(k) + '</span><span class="dz-ab-t"><b>' + lbl + '</b><small>' + sub + '</small></span></button>';
    return '<section class="dz-actions" aria-label="Schnellstart">' +
      b('new', 'play', 'Backtest-Session starten', 'Zufälliger historischer Tag · ohne Blick in die Zukunft', 'pri') +
      (st ? b('resume', 'resume', 'Weitermachen', esc(st.sym || 'Laufende Session') + ' · da, wo du aufgehört hast', '') : b('charts', 'chart', 'Charts & Replay', 'Chart öffnen und frei üben', '')) +
      b('journal', 'book', 'Journal', 'Trades, Fotos, Tagebuch', '') +
      b('copilot', 'bot', 'Jarvis fragen', 'Coach, Analyse, Recherche', 'gold') +
      '</section>';
  }

  /* ---------- Wie läuft's: diese Woche vs. letzte Woche ---------- */
  function progress(d) {
    const t0 = now(), w0 = t0 - WEEK, w1 = t0 - 2 * WEEK;
    const inW = (t, a, b) => t && t > a && t <= b;
    const tr = d.journal.map((t) => ({ t: d.when(t), r: isFinite(t.r) ? +t.r : null, pnl: +t.pnl, sl: t.sl != null }));
    const wk = (a, b) => {
      const T = tr.filter((x) => inW(x.t, a, b)), S = d.sess.filter((s) => inW(s.created, a, b));
      const wins = T.filter((x) => x.pnl > 0).length, R = T.reduce((s, x) => s + (x.r || 0), 0);
      const disc = S.filter((s) => s.discipline).map((s) => s.discipline);
      return { n: T.length, s: S.length, win: T.length ? wins / T.length : null, R, disc: disc.length ? disc.reduce((a2, b2) => a2 + b2, 0) / disc.length : null, sl: T.length ? T.filter((x) => x.sl).length / T.length : null };
    };
    const cur = wk(w0, t0), prev = wk(w1, w0);
    /* Serie: aufeinanderfolgende Tage mit Aktivität bis heute (oder gestern) */
    const dayKey = (t) => Math.floor((t + new Date().getTimezoneOffset() * -60) / DAY);
    const act = new Set([...d.sess.map((s) => s.created), ...tr.map((x) => x.t), ...d.notes.map((n) => n.t / 1000)].filter(Boolean).map(dayKey));
    let streak = 0, k = dayKey(t0); if (!act.has(k)) k--; while (act.has(k)) { streak++; k--; }
    const delta = (a, b, fmt, inv) => { if (a == null || b == null) return ''; const df = a - b; if (Math.abs(df) < 1e-9) return '<em class="dz-dl">±0</em>'; const good = inv ? df < 0 : df > 0; return '<em class="dz-dl ' + (good ? 'up' : 'dn') + '">' + (df > 0 ? '+' : '−') + fmt(Math.abs(df)) + '</em>'; };
    const pct = (v) => v == null ? '–' : Math.round(v * 100) + ' %';
    const rr = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'R';
    const m = (lbl, val, dl, cls) => '<div class="dz-m2"><span>' + lbl + '</span><b class="' + (cls || '') + '">' + val + '</b>' + dl + '</div>';
    const prog = '<section class="card dz-prog2"><div class="card-h"><h3>Wie läuft\'s?</h3><span class="hint">letzte 7 Tage · Vergleich zur Woche davor</span></div><div class="dz-m2s">' +
      m('Sessions', fmtN(cur.s), delta(cur.s, prev.s, fmtN)) +
      m('Trades', fmtN(cur.n), delta(cur.n, prev.n, fmtN)) +
      m('Ergebnis', cur.n ? rr(cur.R) : '–', cur.n && prev.n ? delta(cur.R, prev.R, (v) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'R') : '', cur.R > 0 ? 'up' : cur.R < 0 ? 'dn' : '') +
      m('Trefferquote', pct(cur.win), delta(cur.win, prev.win, (v) => Math.round(v * 100) + ' %')) +
      m('Disziplin', cur.disc == null ? '–' : cur.disc.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + '/5', delta(cur.disc, prev.disc, (v) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 }))) +
      m('Mit Stop-Loss', pct(cur.sl), '') +
      '</div><div class="dz-streak"><span class="dz-ab-ic fl">' + ic('flame') + '</span><div><b>' + (streak ? streak + (streak === 1 ? ' Tag' : ' Tage') + ' in Folge aktiv' : 'Heute noch nichts gemacht') + '</b><small>' + (streak ? 'Bleib dran – eine kurze Session reicht, um die Serie zu halten.' : 'Eine kurze Backtest-Session startet deine Serie.') + '</small></div></div></section>';
    /* Level + Wochenziele (aus dem Pass) */
    let lv = null; try { lv = (typeof Pass !== 'undefined') ? (Pass.last || Pass.refresh()) : null; } catch { }
    let goals = '<section class="card dz-goals"><div class="card-h"><h3>Level & Wochenziele</h3><a href="#pass">Pass</a></div>';
    if (lv) {
      const span = lv.to == null ? 1 : Math.max(1, lv.to - lv.from), done = lv.to == null ? 1 : (lv.total - lv.from) / span;
      goals += '<div class="dz-lv"><b>Level ' + lv.level + '</b><small>' + (lv.to == null ? 'Höchstes Level erreicht' : fmtN(lv.to - lv.total) + ' XP bis Level ' + (lv.level + 1)) + '</small><span class="dz-bar"><i style="width:' + Math.round(Math.max(0, Math.min(1, done)) * 100) + '%"></i></span></div>';
      const G = (lv.week && lv.week.goals) || [];
      goals += G.length ? '<div class="dz-gl">' + G.map((g) => '<div class="dz-g' + (g.done ? ' done' : '') + '"><span class="dz-chk">' + (g.done ? '✓' : '') + '</span><span class="dz-gt"><b>' + esc(g.label) + '</b><small>' + (g.done ? 'geschafft' : g.cur + ' / ' + g.target) + '</small></span><span class="dz-bar sm"><i style="width:' + Math.round(g.cur / g.target * 100) + '%"></i></span></div>').join('') + '</div>' : '<p class="hint">Wochenziele erscheinen, sobald du loslegst.</p>';
    } else goals += '<p class="hint">Level und Wochenziele erscheinen nach deiner ersten Session.</p>';
    goals += '</section>';
    return '<div class="dz-two dz-two-a">' + prog + goals + '</div>';
  }

  function html() {
    const d = data(), t0 = now(), wk = t0 - WEEK;
    const tTimes = d.journal.map(d.when).filter(Boolean), sTimes = d.sess.map((s) => s.created).filter(Boolean);
    const nTimes = [...d.notes.map((n) => n.t / 1000), ...d.briefs.map((b) => b.t / 1000)];
    const lvl = (typeof Pass !== 'undefined' && Pass.last) ? Pass.last : null;
    const tile = (go, k, val, lbl, sub, times) => {
      const fresh = times ? times.filter((t) => t > wk).length : 0;
      return '<button type="button" class="dz-tile" data-go="' + go + '"><span class="dz-ic dz-' + k + '">' + ic(k) + '</span>' +
        '<span class="dz-v"><b>' + val + '</b><span class="dz-l">' + lbl + '</span></span><small>' + sub + (times ? ' · <em class="' + (fresh ? 'up' : '') + '">+' + fresh + ' diese Woche</em>' : '') + '</small>' + (times ? spark(weeks(times)) : '') + '</button>';
    };
    const ruled = d.strat.filter((s) => (s.rules || '').trim()).length;
    let h = '<section class="dz" aria-label="Was du gemacht hast">' + actions() + progress(d) + '<div class="dz-tiles">' +
      tile('journal', 'trade', fmtN(d.journal.length), 'Trades', 'im Journal', tTimes) +
      tile('backtests', 'sess', fmtN(d.sess.length), 'Backtest-Sessions', 'gesamt', sTimes) +
      tile('strategien', 'strat', fmtN(d.strat.length), 'Strategien', ruled + ' mit Regeln', null) +
      tile('research', 'note', fmtN(d.notes.length + d.briefs.length), 'Notizen & Briefings', 'Research Desk', nTimes) +
      tile('pass', 'pass', lvl ? 'Level ' + lvl.level : '–', 'Pass', lvl ? fmtN(lvl.total) + ' XP' : 'XP für saubere Arbeit', null) +
      tile('funded', 'fund', fmtN(d.funded.length), 'Funded-Konten', 'im Tracker', null) +
      '</div>';

    /* Aktivität der letzten 30 Tage */
    const days = new Array(30).fill(0);
    for (const t of [...sTimes, ...tTimes, ...nTimes]) { const k = Math.floor((t0 - t) / DAY); if (k >= 0 && k < 30) days[29 - k]++; }
    const dmax = Math.max(1, ...days), active = days.filter(Boolean).length;
    const lbl = (i) => new Date((t0 - (29 - i) * DAY) * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const act = '<section class="card dz-act"><div class="card-h"><h3>Aktivität</h3><span class="hint">' + active + ' von 30 Tagen aktiv</span></div>' +
      '<div class="dz-cols" role="img" aria-label="Aktivität pro Tag, letzte 30 Tage">' + days.map((v, i) => '<i title="' + lbl(i) + ': ' + v + '" style="height:' + (v ? Math.max(8, v / dmax * 100) : 3) + '%"' + (v ? ' class="on"' : '') + '></i>').join('') + '</div>' +
      '<div class="dz-axis"><span>' + lbl(0) + '</span><span>' + lbl(15) + '</span><span>heute</span></div></section>';

    /* Zeitleiste: zuletzt gemacht */
    const label = (t) => (t.sym || '') + ' ' + (t.side > 0 ? 'Long' : 'Short');
    const res = (t) => (t.r != null ? (t.r >= 0 ? '+' : '') + App.fmtN(t.r, 2) + 'R' : App.fmtMoney(t.pnl, true));
    const feed = [
      ...d.sess.map((s) => ({ t: s.created, k: 'sess', txt: 'Backtest-Session ' + (s.sym || ''), sub: (s.strategy || 'ohne Strategie') + (s.net != null ? ' · ' + App.fmtMoney(s.net, true) : ''), go: 'backtests' })),
      ...d.journal.filter(d.when).map((t) => ({ t: d.when(t), k: 'trade', txt: 'Trade ' + label(t), sub: (t.src === 'desk' ? 'Handels-Desk' : 'Replay') + ' · ' + res(t), cls: t.pnl >= 0 ? 'up' : 'dn', go: 'journal' })),
      ...d.notes.map((n) => ({ t: n.t / 1000, k: 'note', txt: n.title || 'Notiz', sub: 'Research Desk', go: 'research' })),
      ...d.briefs.map((b) => ({ t: b.t / 1000, k: 'note', txt: 'Morning Briefing', sub: 'Briefing', go: 'briefing' }))
    ].filter((x) => x.t).sort((a, b) => b.t - a.t).slice(0, 7);
    const tl = '<section class="card dz-feed"><div class="card-h"><h3>Zuletzt gemacht</h3><a href="#journal" data-go="journal">Journal</a></div>' +
      (feed.length ? '<div class="dz-list">' + feed.map((x) => '<button type="button" class="dz-row" data-go="' + x.go + '"><span class="dz-ic dz-' + x.k + '">' + ic(x.k) + '</span><span class="dz-m"><b>' + esc(x.txt) + '</b><small class="' + (x.cls || '') + '">' + esc(x.sub) + '</small></span><time>' + ago(x.t) + '</time></button>').join('') + '</div>'
        : '<p class="hint">Noch nichts passiert – starte eine Backtest-Session oder einen Trade im Handels-Desk. Alles, was du machst, erscheint hier.</p>') + '</section>';
    return h + '<section class="card dz-today"></section><div class="dz-two">' + act + tl + '</div></section>';
  }

  /* ---------- Heute: Börsenzeiten mit Countdown + wichtige Termine ---------- */
  const SESS = [
    { k: 'asia', n: 'Asien', tz: 'Asia/Tokyo', o: [9, 0], c: [15, 0], sub: 'Tokio' },
    { k: 'lon', n: 'London', tz: 'Europe/London', o: [8, 0], c: [16, 30], sub: 'Europa' },
    { k: 'ny', n: 'New York', tz: 'America/New_York', o: [9, 30], c: [16, 0], sub: 'US-Aktien' }
  ];
  const local = (tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { wd: p.weekday, m: (+p.hour % 24) * 60 + +p.minute }; };
  const dur = (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? h + ' Std. ' + m + ' Min.' : m + ' Min.'; };
  function sessState(s) {
    const L = local(s.tz), o = s.o[0] * 60 + s.o[1], c = s.c[0] * 60 + s.c[1];
    const wknd = L.wd === 'Sat' || L.wd === 'Sun';
    if (!wknd && L.m >= o && L.m < c) return { open: true, txt: 'offen · schließt in ' + dur(c - L.m), pct: (L.m - o) / (c - o) };
    const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], wi = W.indexOf(L.wd);
    let wait = 0;
    for (let d = 0; d < 4; d++) { const off = d * 1440 + o - L.m, wd = (wi + d) % 7; if (off > 0 && wd !== 0 && wd !== 6) { wait = off; break; } }
    return { open: false, txt: 'geschlossen · öffnet in ' + dur(wait), pct: 0 };
  }
  async function today(root) {
    const box = root && root.querySelector('.dz-today'); if (!box) return;
    const ses = SESS.map((s) => { const st = sessState(s); return '<div class="dz-ses ' + (st.open ? 'open' : '') + '"><span class="dz-dot"></span><div><b>' + s.n + '</b><small>' + st.txt + '</small></div>' + (st.open ? '<span class="dz-prog"><i style="width:' + Math.round(st.pct * 100) + '%"></i></span>' : '') + '</div>'; }).join('');
    let ev = '<p class="hint">Termine werden geladen …</p>';
    box.innerHTML = '<div class="card-h"><h3>Heute</h3><span class="hint">' + new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) + '</span></div><div class="dz-today-in"><div class="dz-mkts">' + ses + '</div><div class="dz-ev">' + ev + '</div></div>';
    try {
      const c = await J.getJSON('calendar.json'); const td = J.today();
      const L = (c.events || []).filter((e) => (e.impact === 'High' || e.impact === 'Medium') && J.dayOf(Date.parse(e.date) / 1000) === td).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      const t0 = Date.now();
      ev = L.length ? '<div class="dz-evl">' + L.slice(0, 6).map((e) => { const t = Date.parse(e.date), past = t < t0; return '<div class="dz-e' + (past ? ' past' : '') + '"><time>' + new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) + '</time><span class="dz-imp ' + (e.impact === 'High' ? 'hi' : 'md') + '" title="' + (e.impact === 'High' ? 'Hohe' : 'Mittlere') + ' Wirkung"></span><span class="dz-cc">' + esc(e.country) + '</span><span class="dz-et">' + esc(e.title) + '</span><small>' + (e.forecast ? 'Prognose ' + esc(e.forecast) : '') + (e.previous ? ' · vorher ' + esc(e.previous) : '') + '</small></div>'; }).join('') + '</div>' + (L.length > 6 ? '<a class="hint" href="#makro" data-go="makro">+' + (L.length - 6) + ' weitere in Makroökonomie</a>' : '')
        : '<p class="hint">Heute keine wichtigen Wirtschaftstermine. Ruhiger Tag für Backtesting.</p>';
    } catch { ev = '<p class="hint">Wirtschaftstermine sind gerade nicht erreichbar.</p>'; }
    const evb = box.querySelector('.dz-ev'); if (evb) evb.innerHTML = ev;
  }
  setInterval(() => { document.querySelectorAll('.dz-today').forEach((b) => { if (b.offsetParent) today(b.parentElement); }); }, 60000);

  /* Klicks: go = Bereich öffnen, act = Aktion. nav(go) bestimmt, wie navigiert wird (Terminal: Hash, Second Brain: eintauchen). */
  function bind(root, nav) {
    root.querySelectorAll('.dz [data-go]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); nav(b.dataset.go); }));
    root.querySelectorAll('.dz [data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'new') { if (nav.space) { nav('backtests'); setTimeout(() => NewSess.open(), 900); } else NewSess.open(); }
      else if (a === 'resume') { if (nav.space) { nav('charts'); setTimeout(() => Start.resume(), 900); } else Start.resume(); }
      else nav(a);
    }));
  }

  function render() {
    const body = document.getElementById('stBody'); if (!body) return;
    const old = body.querySelector('.dz'); if (old) old.remove();
    body.insertAdjacentHTML('afterbegin', html());
    today(body.querySelector('.dz'));
    bind(body, (go) => { location.hash = '#' + go; });
    const name = (typeof J !== 'undefined' && J.S && J.S.settings && J.S.settings.name) || '';
    const h = new Date().getHours(), greet = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
    const t = document.querySelector('#view-start .st-head h1');
    if (t) t.textContent = name ? greet + ', ' + name : 'Dashboard';
  }
  /* Für das Second Brain: Dashboard in ein beliebiges Element setzen. go(target) taucht dort ins Terminal ein. */
  function mount(el, go) {
    if (!el) return;
    el.innerHTML = html();
    const nav = (target) => go(target); nav.space = true;
    today(el.querySelector('.dz'));
    bind(el, nav);
  }
  const orig = App.renderStart;
  App.renderStart = function () { const r = orig.apply(this, arguments); try { render(); } catch (e) { console.warn('Dashboard', e); } return r; };
  return { render, mount, html };
})();
