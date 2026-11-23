/* Dashboard (Startseite): alles, was du gemacht hast, auf einen Blick – über den bisherigen Kennzahlen der Übersicht. */
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
    fund: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="1.4"/><circle cx="10" cy="10" r="4"/>'
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
    let h = '<section class="dz" aria-label="Was du gemacht hast"><div class="dz-tiles">' +
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
    const tl = '<section class="card dz-feed"><div class="card-h"><h3>Zuletzt gemacht</h3><a href="#journal">Journal</a></div>' +
      (feed.length ? '<div class="dz-list">' + feed.map((x) => '<button type="button" class="dz-row" data-go="' + x.go + '"><span class="dz-ic dz-' + x.k + '">' + ic(x.k) + '</span><span class="dz-m"><b>' + esc(x.txt) + '</b><small class="' + (x.cls || '') + '">' + esc(x.sub) + '</small></span><time>' + ago(x.t) + '</time></button>').join('') + '</div>'
        : '<p class="hint">Noch nichts passiert – starte eine Backtest-Session oder einen Trade im Handels-Desk. Alles, was du machst, erscheint hier.</p>') + '</section>';
    return h + '<div class="dz-two">' + act + tl + '</div></section>';
  }

  function render() {
    const body = document.getElementById('stBody'); if (!body) return;
    const old = body.querySelector('.dz'); if (old) old.remove();
    body.insertAdjacentHTML('afterbegin', html());
    body.querySelectorAll('.dz [data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = '#' + b.dataset.go; }));
    const name = (typeof J !== 'undefined' && J.S && J.S.settings && J.S.settings.name) || '';
    const h = new Date().getHours(), greet = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
    const t = document.querySelector('#view-start .st-head h1');
    if (t) t.textContent = name ? greet + ', ' + name : 'Dashboard';
  }
  const orig = App.renderStart;
  App.renderStart = function () { const r = orig.apply(this, arguments); try { render(); } catch (e) { console.warn('Dashboard', e); } return r; };
  return { render };
})();
