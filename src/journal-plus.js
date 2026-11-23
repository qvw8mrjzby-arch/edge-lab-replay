/* Journal+ (Nov 2026): Kennzahlen zur Auswahl, Ansichten Tage/Tabelle/Kalender/Tagebuch, Suche, Long/Short,
   Emotionen, Fehler & Bewertung je Trade, Tagebuch (Plan & Rückblick) und neue Statistik-Karten. */
'use strict';
const JX = (() => {
  const EMO = ['Ruhig', 'Selbstsicher', 'Geduldig', 'Ungeduldig', 'FOMO', 'Angst', 'Gier', 'Rache', 'Müde', 'Gelangweilt'];
  const EXEC = ['Nach Plan', 'Zu früh rein', 'Zu spät rein', 'Zu früh raus', 'Zu lange gehalten', 'Stop verschoben', 'Gegen den Plan', 'Zu groß', 'Kein Setup', 'Overtrading'];
  const GOOD = new Set(['Ruhig', 'Selbstsicher', 'Geduldig', 'Nach Plan']);
  const WDN = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const S = { q: '', side: '', tag: '', day: null, month: null, diaryDay: null };
  let view = (() => { try { return localStorage.getItem('elr.jview') || 'days'; } catch { return 'days'; } })();
  const setView = (v) => { view = v; try { localStorage.setItem('elr.jview', v); } catch { } };
  const tz = () => App.settings.tz;
  const key = (t) => { const p = Core.localParts(t, tz()); return p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); };
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const money = (v) => App.fmtMoney(v, true);
  const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
  const tagsOf = (j) => (Array.isArray(j.tags) ? j.tags : []);

  /* ---------- Filter: Suche, Richtung, Tag, Merkmal ---------- */
  const baseList = UI.journalList.bind(UI);
  UI.journalList = function () {
    let L = baseList();
    if (this.idFilter) return L;
    const q = S.q.trim().toLowerCase();
    if (q) L = L.filter((j) => [j.sym, j.setup, j.note, j.reason, ...tagsOf(j)].join(' ').toLowerCase().includes(q));
    if (S.side) L = L.filter((j) => (S.side === 'long' ? j.side > 0 : j.side < 0));
    if (S.tag) L = L.filter((j) => tagsOf(j).includes(S.tag));
    if (S.day) L = L.filter((j) => key(j.entryT) === S.day);
    return L;
  };

  /* ---------- Kopf: Suche, Long/Short, Ansichten + Kennzahlen ---------- */
  function ensureBar() {
    if (document.getElementById('jxBar')) return;
    const sum = document.getElementById('jSummary'); if (!sum) return;
    sum.insertAdjacentHTML('beforebegin', '<div class="jx-bar" id="jxBar">' +
      '<div class="seg jx-views" role="tablist" aria-label="Ansicht">' + [['days', 'Tage'], ['table', 'Tabelle'], ['cal', 'Kalender'], ['diary', 'Tagebuch']].map(([v, l]) => '<button type="button" data-jv="' + v + '">' + l + '</button>').join('') + '</div>' +
      '<label class="jx-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/></svg><input id="jxQ" type="search" placeholder="Suchen: Markt, Strategie, Notiz, Merkmal …" autocomplete="off"></label>' +
      '<div class="seg jx-side" aria-label="Richtung"><button type="button" data-js="">Alle</button><button type="button" data-js="long">Long</button><button type="button" data-js="short">Short</button></div>' +
      '<select class="sel" id="jxTag" aria-label="Merkmal"></select></div>' +
      '<div class="jx-active" id="jxActive" hidden></div><div class="jx-kpis" id="jxKpis"></div>');
    const bar = document.getElementById('jxBar');
    let t = 0;
    document.getElementById('jxQ').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; UI.renderJournal(); }, 160); });
    bar.addEventListener('click', (e) => {
      const v = e.target.closest('[data-jv]'); if (v) { setView(v.dataset.jv); UI.renderJournal(); return; }
      const s = e.target.closest('[data-js]'); if (s) { S.side = s.dataset.js; UI.renderJournal(); }
    });
    document.getElementById('jxTag').addEventListener('change', (e) => { S.tag = e.target.value; UI.renderJournal(); });
    document.getElementById('jxActive').addEventListener('click', (e) => { if (e.target.closest('[data-clear-day]')) { S.day = null; UI.renderJournal(); } });
  }
  function syncBar() {
    document.querySelectorAll('#jxBar [data-jv]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.jv === view)));
    document.querySelectorAll('#jxBar [data-js]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.js === S.side)));
    const used = new Set(); App.visibleJournal().forEach((j) => tagsOf(j).forEach((x) => used.add(x)));
    const sel = document.getElementById('jxTag');
    sel.innerHTML = '<option value="">Alle Merkmale</option>' + [...used].sort().map((x) => '<option' + (x === S.tag ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    if (S.tag && !used.has(S.tag)) S.tag = '';
    const a = document.getElementById('jxActive');
    a.hidden = !S.day; if (S.day) { const [y, m, d] = S.day.split('-'); a.innerHTML = '<span>Nur Trades vom <b>' + d + '.' + m + '.' + y + '</b></span><button type="button" class="btn sm ghost" data-clear-day>Alle Tage zeigen</button>'; }
    const diary = view === 'diary';
    document.getElementById('view-journal').classList.toggle('jx-diary', diary);
  }
  function kpis(list) {
    const el = document.getElementById('jxKpis'); if (!el) return;
    if (!list.length || view === 'diary') { el.innerHTML = ''; return; }
    const s = Core.stats(list, 0);
    const wins = list.filter((j) => j.pnl > 0), loss = list.filter((j) => j.pnl <= 0);
    const avgW = wins.length ? wins.reduce((a, j) => a + j.pnl, 0) / wins.length : 0, avgL = loss.length ? loss.reduce((a, j) => a + j.pnl, 0) / loss.length : 0;
    const days = new Map(); list.forEach((j) => { const k = key(j.entryT); days.set(k, (days.get(k) || 0) + j.pnl); });
    const best = Math.max(...days.values()), worst = Math.min(...days.values());
    const pf = s.pf === Infinity ? '∞' : s.n ? App.fmtN(s.pf, 2) : '–';
    const k = (l, v, c, sub) => '<div class="jx-k"><span>' + l + '</span><b class="' + (c || '') + '">' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    el.innerHTML = k('Netto', money(s.net), cls(s.net), list.length + ' Trades · ' + days.size + ' Tage') +
      k('Trefferquote', App.fmtPct(s.winRate), '', s.wins + ' G / ' + (s.n - s.wins) + ' V') +
      k('Ø R', s.avgR == null ? '–' : App.fmtR(s.avgR), cls(s.avgR)) +
      k('Profit-Faktor', pf, s.pf >= 1 ? 'up' : 'dn') +
      k('Ø Gewinn / Verlust', '<span class="up">' + App.fmtMoney(avgW) + '</span> / <span class="dn">' + App.fmtMoney(avgL) + '</span>', '', avgL ? 'Payoff ' + App.fmtN(Math.abs(avgW / avgL), 2) : '') +
      k('Bester / schlechtester Tag', '<span class="up">' + money(best) + '</span> / <span class="dn">' + money(worst) + '</span>', '');
  }

  /* ---------- Ansicht „Tage“: Trades nach Handelstag gruppiert ---------- */
  async function daysView(list, el) {
    const thumbs = Photos.ok ? await Photos.owners() : new Map();
    const groups = new Map();
    list.slice().sort((a, b) => b.entryT - a.entryT).slice(0, 500).forEach((j) => { const k = key(j.entryT); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); });
    el.innerHTML = '<div class="jx-days">' + [...groups.entries()].map(([k, L]) => {
      const net = L.reduce((a, j) => a + j.pnl, 0), w = L.filter((j) => j.pnl > 0).length, r = L.reduce((a, j) => a + (j.r || 0), 0);
      const mx = Math.max(...L.map((j) => Math.abs(j.r || 0)), .5);
      return '<section class="jx-day"><header><div><b>' + esc(App.fmtDate(L[0].entryT)) + '</b><small>' + L.length + ' Trade' + (L.length > 1 ? 's' : '') + ' · ' + w + ' Gewinner · ' + App.fmtR(r) + '</small></div>' +
        '<span class="jx-mini" aria-hidden="true">' + L.slice().reverse().map((j) => '<i class="' + cls(j.r || j.pnl) + '" style="height:' + Math.max(12, Math.abs(j.r || 0) / mx * 100) + '%"></i>').join('') + '</span>' +
        '<b class="jx-net ' + cls(net) + '">' + money(net) + '</b></header>' +
        L.map((j) => {
          const ph = thumbs.get(j.id);
          const img = ph ? '<img class="jx-th" alt="" src="' + Gallery.url(ph.blob) + '">' : '<span class="jx-th none ' + (j.side > 0 ? 'd-long' : 'd-short') + '"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="' + (j.side > 0 ? 'M5 14L14 5M7 5h7v7' : 'M5 6l9 9M14 8v7H7') + '"/></svg></span>';
          const tg = tagsOf(j).slice(0, 4).map((x) => '<span class="jx-tag' + (GOOD.has(x) ? ' good' : EMO.includes(x) ? ' emo' : ' bad') + '">' + esc(x) + '</span>').join('');
          const stars = j.grade ? '<span class="jx-stars" title="Ausführung ' + j.grade + '/5">' + '★'.repeat(j.grade) + '<em>' + '★'.repeat(5 - j.grade) + '</em></span>' : '';
          return '<div class="jrow jx-row" data-id="' + esc(j.id) + '" tabindex="0" role="button">' + img +
            '<span class="jx-time">' + App.hm(Core.localParts(j.entryT, tz())) + '</span>' +
            '<span class="jx-sym"><b>' + esc(j.sym) + '</b><span class="jx-dir ' + (j.side > 0 ? 'long' : 'short') + '">' + (j.side > 0 ? 'Long' : 'Short') + '</span></span>' +
            '<span class="jx-mid"><b>' + esc(j.setup || 'ohne Strategie') + '</b><small>' + (esc(j.note || (j.reason ? 'Ausstieg: ' + j.reason : '')) || '&nbsp;') + '</small><span class="jx-tags">' + tg + stars + '</span></span>' +
            '<span class="jx-res"><b class="' + cls(j.pnl) + '">' + money(j.pnl) + '</b><small class="' + cls(j.r) + '">' + App.fmtR(j.r) + '</small></span></div>';
        }).join('') + '</section>';
    }).join('') + '</div>' + (list.length > 500 ? '<p class="hint">Es werden die neuesten 500 von ' + list.length + ' Trades gezeigt.</p>' : '');
  }

  /* ---------- Ansicht „Kalender“: Monat mit Tages- und Wochenergebnis ---------- */
  function calView(list, el) {
    const m = new Map(); list.forEach((j) => { const k = key(j.entryT); const e = m.get(k) || { pnl: 0, n: 0, w: 0 }; e.pnl += j.pnl; e.n++; if (j.pnl > 0) e.w++; m.set(k, e); });
    if (!S.month) { const last = list.reduce((a, j) => Math.max(a, j.entryT), 0); const p = Core.localParts(last || Date.now() / 1000, tz()); S.month = [p.y, p.m]; }
    const [y, mo] = S.month;
    const first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;
    const mx = Math.max(1, ...[...m.values()].map((e) => Math.abs(e.pnl)));
    let monthNet = 0, monthN = 0, cells = '', week = 0, weekN = 0, col = 0;
    const flushWeek = () => { cells += '<div class="jx-wk"><span>Woche</span><b class="' + cls(week) + '">' + (weekN ? money(week) : '–') + '</b><small>' + (weekN ? weekN + ' Trades' : '') + '</small></div>'; week = 0; weekN = 0; col = 0; };
    for (let i = 0; i < lead; i++) { cells += '<div class="jx-c empty"></div>'; col++; }
    for (let d = 1; d <= days; d++) {
      const k = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'), e = m.get(k);
      if (e) { monthNet += e.pnl; monthN += e.n; week += e.pnl; weekN += e.n; }
      const a = e ? (.12 + .5 * Math.abs(e.pnl) / mx).toFixed(2) : 0;
      cells += '<button type="button" class="jx-c' + (e ? ' has ' + (e.pnl >= 0 ? 'jp' : 'jn') : '') + '"' + (e ? ' data-day="' + k + '" style="--a:' + a + '"' : ' disabled') + '><span class="jx-d">' + d + '</span>' +
        (e ? '<b>' + App.fmtMoney(e.pnl, true) + '</b><small>' + e.n + ' T · ' + Math.round(e.w / e.n * 100) + ' %</small>' : '') + '</button>';
      if (++col === 7) flushWeek();
    }
    if (col) { while (col < 7) { cells += '<div class="jx-c empty"></div>'; col++; } flushWeek(); }
    const name = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    el.innerHTML = '<section class="card jx-cal"><div class="jx-cal-h"><button type="button" class="btn sm" data-mo="-1" aria-label="Vormonat">‹</button><h3>' + name + '</h3><button type="button" class="btn sm" data-mo="1" aria-label="Nächster Monat">›</button><span class="hspace"></span><span>Monat: <b class="' + cls(monthNet) + '">' + (monthN ? money(monthNet) : '–') + '</b> · ' + monthN + ' Trades</span></div>' +
      '<div class="jx-grid">' + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So', ''].map((x) => '<div class="jx-h">' + x + '</div>').join('') + cells + '</div>' +
      '<p class="hint">Tippe einen Tag an, um seine Trades zu sehen. Datum = Handelstag im Replay.</p></section>';
    el.querySelectorAll('[data-mo]').forEach((b) => b.onclick = () => { let [yy, mm] = S.month; mm += +b.dataset.mo; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } S.month = [yy, mm]; UI.renderJournal(); });
    el.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { S.day = b.dataset.day; setView('days'); UI.renderJournal(); });
  }

  /* ---------- Ansicht „Tagebuch“: Plan vor dem Handel, Rückblick danach ---------- */
  function diaryView(el) {
    const D = App.settings.diary = App.settings.diary || {};
    const k = S.diaryDay || todayKey(); S.diaryDay = k;
    const e = D[k] || {};
    const [y, m, d] = k.split('-');
    const seg = (f, opts) => '<div class="seg" data-df="' + f + '">' + opts.map(([v, l]) => '<button type="button" data-v="' + v + '" aria-pressed="' + (e[f] === v) + '">' + l + '</button>').join('') + '</div>';
    const ta = (f, ph, rows) => '<textarea data-df="' + f + '" rows="' + (rows || 4) + '" placeholder="' + ph + '">' + esc(e[f] || '') + '</textarea>';
    const created = new Map((App.sessions || []).map((s) => [s.replayId, s.created]));
    const done = App.visibleJournal().filter((j) => { const t = j.src === 'desk' ? j.exitT : created.get(j.replay); return t && key(t) === k; });
    const net = done.reduce((a, j) => a + j.pnl, 0);
    const past = Object.keys(D).filter((x) => x !== k && Object.values(D[x] || {}).some((v) => v)).sort().reverse().slice(0, 12);
    el.innerHTML = '<div class="jx-diary-wrap"><section class="card jx-dy">' +
      '<div class="jx-cal-h"><button type="button" class="btn sm" data-dd="-1" aria-label="Tag zurück">‹</button><h3>' + new Date(Date.UTC(+y, +m - 1, +d)).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + '</h3><button type="button" class="btn sm" data-dd="1" aria-label="Tag vor">›</button>' +
      (k !== todayKey() ? '<button type="button" class="btn sm ghost" data-dd="0">Heute</button>' : '') + '<span class="hspace"></span><span class="hint" id="jxSaved">Wird automatisch gespeichert</span></div>' +
      '<h4>Vor dem Handel</h4><div class="jx-form"><label class="fld"><span>Markt-Bias</span>' + seg('bias', [['long', 'Bullisch'], ['neutral', 'Neutral'], ['short', 'Bärisch']]) + '</label>' +
      '<label class="fld"><span>Verfassung</span>' + seg('mood', [['1', '😣'], ['2', '😕'], ['3', '😐'], ['4', '🙂'], ['5', '😄']]) + '</label></div>' +
      '<label class="fld"><span>Plan für heute – welche Setups, wo steige ich ein, wann höre ich auf?</span>' + ta('plan', 'z. B. Nur ORB auf NAS100, max. 2 Trades, Stopp nach −1R am Tag') + '</label>' +
      '<label class="fld"><span>Wichtige Level & Termine</span>' + ta('levels', 'Vortageshoch/-tief, VWAP, CPI 14:30 …', 2) + '</label>' +
      '<h4>Nach dem Handel</h4><div class="jx-form"><label class="fld"><span>Regeln eingehalten?</span>' + seg('rules', [['ja', 'Ja'], ['teils', 'Teilweise'], ['nein', 'Nein']]) + '</label>' +
      '<label class="fld"><span>Tag bewerten</span>' + seg('grade', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']]) + '</label></div>' +
      '<label class="fld"><span>Was lief gut, was nicht?</span>' + ta('review', 'Ehrlich und kurz – Fakten statt Gefühle') + '</label>' +
      '<label class="fld"><span>Lektion für morgen</span>' + ta('lesson', 'Eine Sache, die ich morgen anders mache', 2) + '</label></section>' +
      '<aside class="jx-side-col"><section class="card"><h3>Heute gehandelt</h3>' + (done.length ? '<p class="jx-dnet ' + cls(net) + '">' + money(net) + '</p><div class="jx-list">' + done.map((j) => '<button type="button" class="jx-li jrow" data-id="' + esc(j.id) + '"><span>' + esc(j.sym) + ' ' + (j.side > 0 ? 'Long' : 'Short') + '</span><b class="' + cls(j.pnl) + '">' + money(j.pnl) + '</b></button>').join('') + '</div>' : '<p class="hint">An diesem Tag noch keine Trades oder Sessions.</p>') + '</section>' +
      '<section class="card"><h3>Frühere Einträge</h3>' + (past.length ? '<div class="jx-list">' + past.map((x) => { const p = D[x]; const [a, b, c] = x.split('-'); return '<button type="button" class="jx-li" data-goday="' + x + '"><span>' + c + '.' + b + '.' + a + '</span><small>' + esc((p.lesson || p.review || p.plan || '').slice(0, 60)) + '</small></button>'; }).join('') + '</div>' : '<p class="hint">Dein Tagebuch füllt sich, sobald du Einträge schreibst.</p>') + '</section></aside></div>';
    const save = () => { D[k] = e; App.saveSettings(); const s = document.getElementById('jxSaved'); if (s) { s.textContent = 'Gespeichert ✓'; clearTimeout(save.t); save.t = setTimeout(() => { s.textContent = 'Wird automatisch gespeichert'; }, 1400); } };
    let t = 0;
    el.querySelectorAll('textarea[data-df]').forEach((x) => x.addEventListener('input', () => { e[x.dataset.df] = x.value; clearTimeout(t); t = setTimeout(save, 400); }));
    el.querySelectorAll('.seg[data-df]').forEach((g) => g.addEventListener('click', (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; const f = g.dataset.df; e[f] = e[f] === b.dataset.v ? '' : b.dataset.v; g.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === e[f]))); save(); }));
    el.querySelectorAll('[data-dd]').forEach((b) => b.onclick = () => { const n = +b.dataset.dd; if (!n) S.diaryDay = todayKey(); else { const dt = new Date(Date.UTC(+y, +m - 1, +d + n)); S.diaryDay = dt.toISOString().slice(0, 10); } UI.renderJournal(); });
    el.querySelectorAll('[data-goday]').forEach((b) => b.onclick = () => { S.diaryDay = b.dataset.goday; UI.renderJournal(); });
  }

  /* ---------- Journal-Rendering ---------- */
  const baseRender = UI.renderJournal.bind(UI);
  UI.renderJournal = async function () {
    ensureBar(); syncBar();
    const el = document.getElementById('jTable');
    if (view === 'diary') { this.fillJournalFilters(); kpis([]); diaryView(el); return; }
    const list = this.journalList();
    kpis(list);
    if (view === 'table' || !list.length || this.idFilter) return baseRender();
    this.fillJournalFilters();
    const chip = document.getElementById('jIdFilter'); chip.hidden = true;
    if (typeof Gallery !== 'undefined') Gallery.revoke();
    if (view === 'cal') calView(list, el); else await daysView(list, el);
  };

  /* ---------- Trade-Fenster: Bewertung, Emotionen, Ausführung ---------- */
  const baseOpen = UI.openTrade.bind(UI);
  UI.openTrade = async function (id) {
    const p = baseOpen(id);
    const j = this._trade;
    const box = document.getElementById('tdBody');
    if (j && box && !box.querySelector('.jx-psy')) {
      const ph = box.querySelector('#tdPhotos'); const anchor = ph ? ph.closest('.fld') : null;
      const chips = (arr) => arr.map((x) => '<button type="button" class="jx-chip' + (GOOD.has(x) ? ' good' : '') + '" data-tag="' + esc(x) + '" aria-pressed="' + tagsOf(j).includes(x) + '">' + esc(x) + '</button>').join('');
      const html = '<div class="jx-psy"><div class="fld"><span>Ausführung bewerten</span><div class="jx-rate" role="radiogroup" aria-label="Ausführung 1 bis 5">' + [1, 2, 3, 4, 5].map((n) => '<button type="button" data-grade="' + n + '" aria-pressed="' + ((j.grade || 0) >= n) + '" aria-label="' + n + ' von 5">★</button>').join('') + '<small>' + (j.grade ? ['', 'schwach', 'mäßig', 'okay', 'gut', 'perfekt'][j.grade] : 'nicht bewertet') + '</small></div></div>' +
        '<div class="fld"><span>Gefühl beim Trade</span><div class="jx-chips">' + chips(EMO) + '</div></div>' +
        '<div class="fld"><span>Ausführung & Fehler</span><div class="jx-chips">' + chips(EXEC) + '</div></div></div>';
      if (anchor) anchor.insertAdjacentHTML('beforebegin', html); else box.insertAdjacentHTML('beforeend', html);
    }
    return p;
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#tdBody .jx-chip, #tdBody [data-grade]'); if (!t) return;
    const j = UI._trade; if (!j) return;
    if (t.dataset.grade) {
      const g = +t.dataset.grade; j.grade = j.grade === g ? 0 : g;
      t.parentElement.querySelectorAll('[data-grade]').forEach((b) => b.setAttribute('aria-pressed', String((j.grade || 0) >= +b.dataset.grade)));
      t.parentElement.querySelector('small').textContent = j.grade ? ['', 'schwach', 'mäßig', 'okay', 'gut', 'perfekt'][j.grade] : 'nicht bewertet';
    } else {
      const x = t.dataset.tag, L = tagsOf(j).slice(), i = L.indexOf(x);
      if (i >= 0) L.splice(i, 1); else L.push(x);
      j.tags = L; t.setAttribute('aria-pressed', String(i < 0));
    }
    App.saveJournal();
    if (App.view === 'journal') UI.renderJournal();
  });

  /* ---------- Statistik: Emotionen & Fehler, Bewertung, Wochentag × Uhrzeit ---------- */
  const baseStats = UI.renderStats.bind(UI);
  UI.renderStats = function () {
    const r = baseStats();
    try { statsCards(this.statsList()); } catch (err) { console.warn('Journal+ Statistik', err); }
    return r;
  };
  function statsCards(list) {
    const host = document.getElementById('statsBody'); if (!host || !list.length) return;
    host.querySelectorAll('.jx-stats').forEach((x) => x.remove());
    /* Merkmale */
    const g = new Map(); list.forEach((j) => tagsOf(j).forEach((x) => { const e = g.get(x) || { n: 0, w: 0, pnl: 0, r: 0 }; e.n++; if (j.pnl > 0) e.w++; e.pnl += j.pnl; e.r += j.r || 0; g.set(x, e); }));
    const rows = [...g.entries()].sort((a, b) => a[1].pnl - b[1].pnl);
    const mx = Math.max(1, ...rows.map(([, e]) => Math.abs(e.pnl)));
    const tagCard = '<div class="card jx-stat"><h3>Gefühle & Ausführung</h3><p class="hint">Was dich welche Merkmale kosten – im Trade-Fenster vergibst du sie per Antippen.</p>' +
      (rows.length ? '<div class="jx-bars">' + rows.map(([k, e]) => '<div class="jx-br"><span class="jx-tag' + (GOOD.has(k) ? ' good' : EMO.includes(k) ? ' emo' : ' bad') + '">' + esc(k) + '</span><span class="jx-track"><i class="' + (e.pnl >= 0 ? 'jp' : 'jn') + '" style="width:' + (Math.abs(e.pnl) / mx * 100).toFixed(0) + '%"></i></span><b class="' + cls(e.pnl) + '">' + money(e.pnl) + '</b><small>' + e.n + ' · ' + Math.round(e.w / e.n * 100) + ' % · Ø ' + App.fmtR(e.r / e.n) + '</small></div>').join('') + '</div>'
        : '<p class="empty">Noch keine Merkmale vergeben. Öffne einen Trade im Journal und tippe an, wie du dich gefühlt hast und was gut oder schlecht lief.</p>') + '</div>';
    /* Bewertung */
    const gr = [1, 2, 3, 4, 5].map((n) => { const L = list.filter((j) => j.grade === n); return { n, c: L.length, pnl: L.reduce((a, j) => a + j.pnl, 0), r: L.length ? L.reduce((a, j) => a + (j.r || 0), 0) / L.length : 0 }; });
    const gradeCard = '<div class="card jx-stat"><h3>Nach Ausführungs-Bewertung</h3><p class="hint">Saubere Trades (4–5 ★) sollten sich langfristig auszahlen – auch wenn einzelne verlieren.</p>' +
      (gr.some((x) => x.c) ? '<table class="tbl"><tr><th>Bewertung</th><th>Trades</th><th>Netto</th><th>Ø R</th></tr>' + gr.map((x) => '<tr><td>' + '★'.repeat(x.n) + '</td><td>' + x.c + '</td><td class="' + cls(x.pnl) + '">' + (x.c ? money(x.pnl) : '–') + '</td><td class="' + cls(x.r) + '">' + (x.c ? App.fmtR(x.r) : '–') + '</td></tr>').join('') + '</table>' : '<p class="empty">Noch keine Trades bewertet.</p>') + '</div>';
    /* Wochentag × Uhrzeit */
    const cell = new Map(); const hours = new Set();
    list.forEach((j) => { const p = Core.localParts(j.entryT, tz()); hours.add(p.h); const k = p.wd + '-' + p.h; const e = cell.get(k) || { pnl: 0, n: 0 }; e.pnl += j.pnl; e.n++; cell.set(k, e); });
    const H = [...hours].sort((a, b) => a - b), wds = [1, 2, 3, 4, 5, 6, 0].filter((w) => H.some((h) => cell.has(w + '-' + h)));
    const cm = Math.max(1, ...[...cell.values()].map((e) => Math.abs(e.pnl)));
    const heat = '<div class="card jx-stat jx-wide"><h3>Wochentag × Uhrzeit</h3><p class="hint">Netto je Einstiegsstunde (' + esc(tz()) + '). Grün = hier verdienst du, Rot = hier verlierst du.</p><div class="jx-heat" style="grid-template-columns:34px repeat(' + H.length + ',minmax(34px,1fr))"><span></span>' +
      H.map((h) => '<span class="jx-hh">' + h + '</span>').join('') +
      wds.map((w) => '<span class="jx-hd">' + WDN[w] + '</span>' + H.map((h) => { const e = cell.get(w + '-' + h); return e ? '<i class="' + (e.pnl >= 0 ? 'jp' : 'jn') + '" style="--a:' + (.15 + .7 * Math.abs(e.pnl) / cm).toFixed(2) + '" title="' + WDN[w] + ' ' + h + ' Uhr: ' + App.fmtMoney(e.pnl, true) + ' · ' + e.n + ' Trades"></i>' : '<i></i>'; }).join('')).join('') + '</div></div>';
    host.insertAdjacentHTML('beforeend', '<div class="jx-stats">' + heat + tagCard + gradeCard + '</div>');
  }

  return { S, EMO, EXEC };
})();
