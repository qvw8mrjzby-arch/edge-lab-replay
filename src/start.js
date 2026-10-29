/* Edge Lab Replay — Übersicht, Einführung, Erklärungen, Installation/Update, Fehler-Netz, Bottom-Sheet */
'use strict';
const APP_VERSION = '4.0';

/* ---------- Begriffe (kurze Erklärungen für das „i“) ---------- */
const GLOSSARY = {
  vwap: ['VWAP', 'Volumengewichteter Durchschnittspreis seit Session-Beginn. Liegt der Kurs darüber, haben Käufer im Schnitt Gewinn – viele Profis nutzen ihn als fairen Preis des Tages.'],
  poc: ['POC (Point of Control)', 'Der Preis mit dem meisten gehandelten Volumen im Profil. Wirkt oft wie ein Magnet oder eine Unterstützung/Widerstand.'],
  va: ['Value Area', 'Preisbereich, in dem ein Großteil (Standard 70 %) des Volumens gehandelt wurde. VAH/VAL sind Ober- und Unterkante.'],
  delta: ['Delta', 'Käufer-Aggressor-Volumen minus Verkäufer-Aggressor-Volumen je Kerze. Ohne Trade-Daten wird es aus der Kerzenform geschätzt.'],
  r: ['R (Risiko-Vielfaches)', '1R ist der Betrag, den du riskierst (Abstand zum Stop × Menge). +2R heißt: doppelt so viel gewonnen wie riskiert. Alle R-Werte hier sind netto, also nach Gebühren und Slippage.'],
  pf: ['Profit-Faktor', 'Summe aller Gewinne geteilt durch Summe aller Verluste. Über 1 verdient die Strategie Geld, ab etwa 1,5 gilt sie als robust.'],
  mae: ['MAE / MFE', 'MAE: wie weit ein Trade maximal gegen dich lief. MFE: wie weit er maximal für dich lief. Zeigt, ob Stops zu eng oder Ziele zu nah sind.'],
  blind: ['Blind-Modus', 'Datum und Wochentag bleiben verborgen, bis die Session endet. So handelst du nicht mit dem Wissen, was an diesem Tag in den Nachrichten war.'],
  winrate: ['Trefferquote', 'Anteil der Gewinner an allen Trades. Allein wenig aussagekräftig – erst zusammen mit Ø R ergibt sich, ob eine Strategie Geld verdient.']
};
const Tips = {
  cur: null,
  init() {
    this.decorate(document);
    const pop = $('#tipPop');
    const show = (b) => {
      const g = GLOSSARY[b.dataset.tip]; if (!g) return;
      if (this.cur && this.cur !== b) this.cur.setAttribute('aria-expanded', 'false');
      this.cur = b; b.setAttribute('aria-expanded', 'true');
      pop.innerHTML = '<b>' + esc(g[0]) + '</b>' + esc(g[1]);
      pop.hidden = false;
      const r = b.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      let x = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      let y = r.bottom + 8; if (y + h > innerHeight - 12) y = Math.max(12, r.top - h - 8);
      pop.style.left = x + 'px'; pop.style.top = y + 'px';
    };
    const hide = () => { this.hovered = false; pop.hidden = true; if (this.cur) this.cur.setAttribute('aria-expanded', 'false'); this.cur = null; };
    this.hide = hide;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.infotip');
      /* per Maus schon eingeblendet → Klick hält es offen statt es wieder zu schließen */
      if (b) { e.preventDefault(); e.stopPropagation(); if (this.cur === b && !pop.hidden && !this.hovered) hide(); else { show(b); this.hovered = false; } return; }
      if (!pop.hidden) hide();
    }, true);
    document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('.infotip'); if (b && b !== this.cur && matchMedia('(hover: hover)').matches) { show(b); this.hovered = true; } });
    document.addEventListener('mouseout', (e) => { const b = e.target.closest && e.target.closest('.infotip'); if (b && b === this.cur && !b.contains(e.relatedTarget)) hide(); });
    document.addEventListener('focusin', (e) => { if (e.target.classList && e.target.classList.contains('infotip')) show(e.target); });
    document.addEventListener('focusout', (e) => { if (e.target === this.cur) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { hide(); } }, true);
    window.addEventListener('scroll', () => { if (!pop.hidden) hide(); }, true);
  },
  /* aria-label/title nachtragen (auch für dynamisch erzeugte Knöpfe) */
  decorate(root) {
    for (const b of (root || document).querySelectorAll('.infotip:not([aria-label])')) {
      const g = GLOSSARY[b.dataset.tip]; if (!g) continue;
      b.setAttribute('aria-label', 'Was ist ' + g[0] + '?'); b.title = g[0] + ': ' + g[1];
      b.setAttribute('aria-describedby', 'tipPop'); b.setAttribute('aria-expanded', 'false');
    }
  },
  btn(k) { return '<button type="button" class="infotip" data-tip="' + k + '"></button>'; }
};

/* ---------- Leere Zustände: eigene, schlichte Strichgrafiken ---------- */
const EMPTY_ART = {
  journal: '<svg viewBox="0 0 88 64"><rect x="20" y="6" width="48" height="52" rx="4"/><path d="M30 20h28M30 30h28M30 40h18"/><path class="acc" d="M54 44l5 5 9-11"/></svg>',
  backtests: '<svg viewBox="0 0 88 64"><path d="M14 50h60"/><path d="M22 44V30M32 44V22M42 44V34M52 44V18M62 44V26"/><circle class="acc" cx="66" cy="14" r="8"/><path class="acc" d="M66 10v4l3 2"/></svg>',
  stats: '<svg viewBox="0 0 88 64"><path d="M14 52h60M14 52V10"/><path class="acc" d="M18 44l14-10 10 6 14-16 14-8"/><circle cx="32" cy="34" r="2"/><circle cx="42" cy="40" r="2"/><circle cx="56" cy="24" r="2"/></svg>',
  strat: '<svg viewBox="0 0 88 64"><circle cx="44" cy="32" r="22"/><circle cx="44" cy="32" r="12"/><circle class="acc" cx="44" cy="32" r="3"/><path class="acc" d="M62 14l-14 14"/></svg>'
};
function emptyState(art, title, text, btnHtml) {
  return '<div class="empty-state">' + (EMPTY_ART[art] || '') + '<h3>' + esc(title) + '</h3><p>' + text + '</p>' + (btnHtml || '') + '</div>';
}
function skeleton(n, cls) { return '<div class="skel ' + (cls || '') + '" aria-hidden="true">' + '<i></i>'.repeat(n) + '</div>'; }
function setBusy(btn, on) { if (!btn) return; btn.classList.toggle('is-loading', !!on); btn.disabled = !!on; btn.setAttribute('aria-busy', String(!!on)); }

/* ---------- Übersicht ---------- */
Object.assign(App, {
  lastBackup() { return store.get('elr.backup', { t: 0, n: 0 }); },
  markBackup() { store.set('elr.backup', { t: Date.now(), n: this.journal.length }); },
  /* Sicherungs-Erinnerung: letzte Sicherung > 7 Tage und > 10 neue Trades */
  needsBackup() { const b = this.lastBackup(); return Date.now() - (b.t || 0) > 7 * 86400000 && this.journal.length - (b.n || 0) > 10; },
  renderStart() {
    const st = this.pendingResume();
    this.renderResumeCard($('#stResume'), st, false);
    this.renderResumeCard($('#resumeBar'), this.replay.active ? null : st, true);
    const bk = $('#stBackup');
    bk.hidden = !this.needsBackup();
    if (!bk.hidden) {
      const b = this.lastBackup();
      bk.innerHTML = '<b>Zeit für eine Sicherung.</b> ' + (this.journal.length - (b.n || 0)) + ' neue Trades seit ' + (b.t ? 'der letzten Sicherung am ' + this.fmtDate(b.t / 1000) : 'Beginn') + '. Deine Daten liegen nur in diesem Browser. <button type="button" class="linkbtn" id="stBackupBtn" style="color:var(--accent)">Jetzt sichern</button>';
    }
    const body = $('#stBody');
    const J = this.visibleJournal().filter((j) => j.status === 'closed' || j.status == null);
    const sessions = this.sessions.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
    $('#stSub').textContent = J.length ? J.length + ' Trades in ' + sessions.length + ' Sessions' + (this.isBlind() ? ' · laufende Blind-Session ausgeblendet' : '') : 'Dein Backtesting auf einen Blick.';
    if (!J.length && !sessions.length) { body.innerHTML = this.startGuide(); return; }
    const s = Core.stats(J, this.settings.account.start);
    const pf = s.pf === Infinity ? '∞' : s.n ? this.fmtN(s.pf, 2) : '–';
    const kpi = (lbl, val, cls, tip, big) => '<div class="hk' + (big ? ' big' : '') + '"><span>' + lbl + (tip ? ' ' + Tips.btn(tip) : '') + '</span><b class="' + (cls || '') + '">' + val + '</b></div>';
    let h = '<section class="hero" aria-label="Kennzahlen"><div class="hero-kpis">' +
      kpi('Kontostand', this.fmtMoney(this.balance()), '', null, true) +
      kpi('Netto', this.fmtMoney(s.net, true), s.net >= 0 ? 'up' : 'dn') +
      kpi('Trefferquote', s.n ? this.fmtPct(s.winRate) : '–', '', 'winrate') +
      kpi('Ø R', s.avgR == null ? '–' : this.fmtR(s.avgR), s.avgR >= 0 ? 'up' : 'dn', 'r') +
      kpi('Profit-Faktor', pf, s.pf >= 1 ? 'up' : s.n ? 'dn' : '', 'pf') +
      '</div><div class="hero-eq"><canvas id="stEq" aria-label="Kontokurve"></canvas></div>' +
      '<div class="hero-act"><button class="btn primary lg" id="stNew">Neue Backtest-Session</button>' +
      (st ? '<button class="btn lg" id="stContinue">Weiter, wo du aufgehört hast</button>' : '<a class="btn lg" href="#charts">Zum Chart</a>') +
      '<p class="hint">' + (st ? esc(st.sym) + ' · ' + esc(this.resumeWhen(st)) : 'Zufälliger historischer Tag, ohne Blick in die Zukunft.') + '</p></div></section>';
    /* Letzte Sessions */
    const recent = sessions.slice(0, 5);
    let left = '<section class="card"><div class="card-h"><h3>Letzte Sessions</h3><a href="#backtests">Alle ansehen</a></div>';
    left += recent.length ? '<div class="srows">' + recent.map((e) => {
      const res = this.sessionResult(e), running = res === 'läuft';
      const cls = running ? 'run' : res === 'Profit' ? 'up' : res === 'Verlust' ? 'dn' : '';
      const date = running && e.blind ? 'Datum verborgen' : e.realDay || this.fmtDate(e.from || e.created);
      const dots = [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= e.discipline ? 'on' : '') + '"></i>').join('');
      return '<button type="button" class="srow" data-sess="' + esc(e.id) + '"><span class="sess-res ' + cls + '">' + esc(res) + '</span>' +
        '<span class="sr-main"><b>' + esc(e.strategy || '(ohne Strategie)') + '</b><small>' + esc((e.sym || '–') + ' · ' + date) + '</small></span>' +
        '<span class="disc" title="Disziplin ' + (e.discipline || 0) + '/5">' + dots + '</span>' +
        '<span class="sr-num"><b class="' + (cls === 'run' ? '' : cls) + '">' + (e.net != null ? this.fmtMoney(e.net, true) : '–') + '</b><small>' + (e.r != null ? this.fmtR(e.r) : '') + '</small></span></button>';
    }).join('') + '</div>' : emptyState('backtests', 'Noch keine Session', 'Starte deine erste Backtest-Session.', '');
    left += '</section>';
    /* Strategien: bester / schlechtester Ø R */
    const g = Core.groupStats(J.filter((j) => j.setup), (x) => x.setup).filter((e) => e.nR > 0).map((e) => Object.assign(e, { avg: e.sumR / e.nR })).sort((a, b) => b.avg - a.avg);
    let right = '<section class="card"><div class="card-h"><h3>Strategien</h3><a href="#strategien">Verwalten</a></div>';
    if (g.length) {
      const item = (lbl, e) => '<div class="sr-item"><em>' + lbl + '</em><b title="' + esc(e.k) + '">' + esc(e.k) + '</b><span class="num ' + (e.avg >= 0 ? 'up' : 'dn') + '">Ø ' + this.fmtR(e.avg) + ' · ' + e.n + '</span></div>';
      right += '<div class="strat-rank">' + item('Beste', g[0]) + (g.length > 1 ? item('Schwächste', g[g.length - 1]) : '') + '</div>';
    } else right += '<p class="hint">Ordne Trades einer Strategie zu, um sie hier zu vergleichen.</p>';
    right += '</section>';
    /* Disziplin der letzten 10 Sessions */
    const done = sessions.filter((e) => !this.isRunning(e)).slice(0, 10).reverse();
    right += '<section class="card"><div class="card-h"><h3>Disziplin</h3><span class="hint">letzte ' + done.length + ' Sessions</span></div>';
    right += done.length ? '<div class="disc-bars" role="img" aria-label="Disziplin der letzten Sessions">' + done.map((e) => {
      const d = e.discipline || 0;
      return '<div title="' + esc((e.strategy || 'Session') + ': ' + (d ? d + '/5' : 'nicht bewertet')) + '"><i class="' + (!d ? 'none' : d <= 2 ? 'lo' : '') + '" style="height:' + (d ? d * 10 : 3) + 'px"></i><span>' + (d || '–') + '</span></div>';
    }).join('') + '</div>' : '<p class="hint">Bewerte nach jeder Session, wie gut du deine Regeln eingehalten hast.</p>';
    right += '</section>';
    /* Häufigste Fehler */
    const mk = new Map();
    for (const e of sessions) for (const m of e.mistakes || []) mk.set(m, (mk.get(m) || 0) + 1);
    const top = [...mk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    right += '<section class="card"><div class="card-h"><h3>Häufigste Fehler</h3></div>';
    right += top.length ? '<div class="mk-list">' + top.map(([m, n]) => '<div class="mk-row"><span>' + esc(m) + '</span><span class="meter"><i style="width:' + (n / top[0][1] * 100).toFixed(0) + '%"></i></span><b>' + n + '</b></div>').join('') + '</div>' : '<p class="hint">Noch keine Fehler markiert – gut so, oder noch keine Session ausgewertet.</p>';
    right += '</section>';
    body.innerHTML = h + '<div class="dash"><div class="dash-col">' + left + '</div><div class="dash-col">' + this.bigIssueCard(J) + right + '</div></div>';
    Tips.decorate(body);
    this.drawMiniEquity($('#stEq'), s.equity);
  },
  startGuide() {
    const custom = this.strategies.some((x) => x.id !== 's1');
    const step = (n, done, title, text, btn) => '<div class="step' + (done ? ' done' : '') + '"><span class="no">' + (done ? '✓' : n) + '</span><h3>' + title + '</h3><p>' + text + '</p>' + btn + '</div>';
    return '<section class="welcome"><div><h2>In drei Schritten zum ersten Backtest</h2></div><p>Edge Lab Replay spielt echte historische Tage Kerze für Kerze ab – du handelst, als wäre es live, und siehst danach schwarz auf weiß, ob deine Strategie funktioniert.</p>' +
      '<div class="steps">' +
      step(1, custom, 'Strategie anlegen', 'Schreib deine Regeln als Checkliste auf. Sie erscheinen vor jedem Einstieg im Order-Ticket.', '<button class="btn" data-go="strat">Strategie anlegen</button>') +
      step(2, this.sessions.length > 0, 'Session starten', 'Markt wählen – die App sucht einen zufälligen Tag aus dem Archiv, auf Wunsch ohne Datum.', '<button class="btn primary" data-go="session">Session starten</button>') +
      step(3, this.journal.length > 0, 'Auswerten', 'Journal mit Fotos, Disziplin-Notizen und Statistik bis zur Monte-Carlo-Simulation.', '<button class="btn" data-go="stats">Statistik ansehen</button>') +
      '</div><p class="hint">Erst umsehen? <a class="linkbtn" href="#charts" style="color:var(--accent)">Demo-Chart öffnen</a> · <button type="button" class="linkbtn" data-go="onboard" style="color:var(--accent)">Einführung ansehen</button> · <label class="linkbtn filebtn" style="color:var(--accent)">Sicherung importieren<input type="file" accept=".json,application/json" data-import></label></p></section>';
  },
  resumeWhen(st) {
    const t = st.t;
    if (st.replay.blind) { const p = Core.localParts(t, this.settings.tz); return 'Replay-Zeit ' + this.hm(p) + ' (Blind-Modus)'; }
    return this.fmtDate(t) + ' ' + this.hm(Core.localParts(t, this.settings.tz));
  },
  renderResumeCard(el, st, compact) {
    if (!el) return;
    el.hidden = !st;
    if (!st) { el.innerHTML = ''; return; }
    const o = st.engine.orders || [];
    const open = o.filter((x) => x.status === 'open').length, pend = o.filter((x) => x.status === 'pending').length;
    const parts = [st.sym, this.resumeWhen(st)];
    if (open) parts.push(open === 1 ? '1 offene Position' : open + ' offene Positionen');
    if (pend) parts.push(pend === 1 ? '1 wartende Order' : pend + ' wartende Orders');
    const csv = st.src && st.src.kind === 'csv';
    const ago = Math.max(1, Math.round((Date.now() - st.savedAt) / 60000));
    el.innerHTML = '<div class="rc-txt"><b>Laufende Session fortsetzen?</b><small>' + esc(parts.join(' · ')) + (compact ? '' : ' · gespeichert vor ' + (ago < 60 ? ago + ' min' : Math.round(ago / 60) + ' h')) +
      (csv ? ' · Die CSV-Datei „' + esc(st.src.name || '') + '“ muss neu gewählt werden.' : '') + '</small></div>' +
      '<div class="rc-btns"><button class="btn sm ghost" data-resume="discard">Verwerfen</button><button class="btn sm primary" data-resume="go">' + (csv ? 'CSV wählen' : 'Fortsetzen') + '</button></div>';
  },
  drawMiniEquity(cv, eq) {
    if (!cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(100, r.width), H = 84;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!eq || eq.length < 2) { ctx.fillStyle = COL.faint; ctx.font = '12px ' + FONT_UI; ctx.fillText('Kontokurve erscheint ab zwei Trades.', 0, H / 2); return; }
    let lo = Infinity, hi = -Infinity; for (const p of eq) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
    if (hi === lo) { hi += 1; lo -= 1; }
    const x = (i) => i / (eq.length - 1) * (W - 6) + 3, y = (v) => 6 + (hi - v) / (hi - lo) * (H - 12);
    const col = eq[eq.length - 1].v >= eq[0].v ? COL.bull : COL.bear;
    ctx.strokeStyle = COL.line; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, y(eq[0].v)); ctx.lineTo(W, y(eq[0].v)); ctx.stroke(); ctx.setLineDash([]);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, alpha(col, 0.22)); g.addColorStop(1, alpha(col, 0));
    ctx.beginPath(); eq.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v)))); ctx.lineTo(x(eq.length - 1), H); ctx.lineTo(x(0), H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); eq.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v)))); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
  }
});

const Start = {
  bind() {
    const host = $('#view-start');
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button, a'); if (!b) return;
      if (b.id === 'stNew') NewSess.open();
      else if (b.id === 'stContinue') this.resume();
      else if (b.id === 'stBackupBtn') UI.backupFile();
      else if (b.id === 'stInstall') Install.prompt();
      else if (b.dataset.sess) App.openSession({ id: b.dataset.sess });
      else if (b.dataset.go === 'strat') { location.hash = '#strategien'; setTimeout(() => App.addStrategy(), 60); }
      else if (b.dataset.go === 'session') NewSess.open();
      else if (b.dataset.go === 'stats') location.hash = '#stats';
      else if (b.dataset.go === 'onboard') Onboard.open();
    });
    host.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-import]')) return;
      const f = e.target.files[0]; if (!f) return;
      try { const n = await UI.importBackup(JSON.parse(await Loader.readFile(f))); App.toast(n.t + ' Trades importiert.', 'good'); App.renderStart(); }
      catch (err) { App.toast('Import fehlgeschlagen: Die Datei ist keine gültige Edge-Lab-Sicherung (.json).', 'bad'); }
      e.target.value = '';
    });
    for (const el of [$('#stResume'), $('#resumeBar')]) el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-resume]'); if (!b) return;
      if (b.dataset.resume === 'discard') { App.discardResume(); App.renderStart(); App.toast('Gespeicherte Session verworfen.'); }
      else this.resume(b);
    });
  },
  async resume(btn) {
    const st = App.pendingResume(); if (!st) return;
    if (location.hash !== '#charts') location.hash = '#charts';
    for (const el of [$('#stResume'), $('#resumeBar')]) el.hidden = true;
    setBusy(btn, true);
    try {
      const r = await App.resumeSession(st);
      if (r === 'csv') {
        UI.fillDataModal(); openModal('#dataModal'); $('#dataTabs [data-p="csv"]').click();
        $('#csvSym').value = st.sym;
        $('#csvStatus').textContent = 'Bitte die Datei „' + (st.src.name || 'CSV') + '“ wählen – danach geht die Session an derselben Stelle weiter.'; $('#csvStatus').className = 'status warn';
      } else App.toast('Session fortgesetzt.', 'good');
    } catch (err) {
      App.toast('Fortsetzen nicht möglich: ' + (err.message || err) + ' Du kannst den Stand verwerfen und eine neue Session starten.', 'bad');
      App.renderStart();
    } finally { setBusy(btn, false); }
  }
};

/* ---------- Einführung beim ersten Start (3 Schritte) ---------- */
const Onboard = {
  i: 0,
  PAGES: [
    { art: '<svg viewBox="0 0 120 100"><path d="M10 86h100"/><path class="bu" d="M24 70V40M22 46h4M22 64h4"/><path class="be" d="M40 62V30M38 36h4M38 56h4"/><path class="bu" d="M56 52V18M54 24h4M54 46h4"/><path class="acc" d="M72 10v80" stroke-dasharray="3 4"/><path d="M84 30v40M100 30v40" opacity=".25"/></svg>',
      h: 'Willkommen bei Edge Lab Replay', p: 'Trainiere und prüfe deine Strategie an echten historischen Tagen – Kerze für Kerze, ohne Blick in die Zukunft.',
      li: ['<b>Archiv</b>: Nasdaq, S&amp;P, Dow, Gold, DAX in 1-Minuten-Kerzen', '<b>Krypto</b> von Binance mit echtem Orderflow', 'Alles bleibt <b>in deinem Browser</b> – kein Konto nötig'] },
    { art: '<svg viewBox="0 0 120 100"><rect x="14" y="16" width="92" height="62" rx="6"/><path class="acc" d="M50 36v26l22-13z"/><path d="M14 88h92"/><circle class="acc" cx="40" cy="88" r="4"/></svg>',
      h: 'Session starten und handeln', p: 'Wähle einen Markt – die App sucht einen zufälligen Tag aus und startet das Replay, auf Wunsch im Blind-Modus ohne Datum.',
      li: ['<b>Abspielen</b> mit Leertaste, <b>Schritt</b> mit →', 'Order-Ticket mit Stop in Punkten und Ziel in <b>R</b>', 'Oder Long/Short direkt im Chart platzieren und Linien ziehen'] },
    { art: '<svg viewBox="0 0 120 100"><path d="M14 84h92M14 84V14"/><path class="acc" d="M20 72l20-14 14 8 20-24 22-12"/><path class="bu" d="M28 92h0"/></svg>',
      h: 'Auswerten und besser werden', p: 'Nach jeder Session hältst du Disziplin, Fehler und Learnings fest. Die Statistik zeigt, ob deine Strategie wirklich trägt.',
      li: ['<b>Journal</b> mit automatischen Chart-Fotos', '<b>Statistik</b> mit Kontokurve, R-Verteilung und Monte-Carlo', 'Hilfe und Tastenkürzel jederzeit über <b>?</b>'] }
  ],
  open() { this.i = 0; this.show(); openModal('#onboardModal'); setTimeout(() => $('#obNext').focus({ preventScroll: true }), 40); },
  show() {
    const P = this.PAGES[this.i];
    $('#obBody').innerHTML = '<div class="ob-page">' + P.art + '<div><h3 id="obTitle">' + P.h + '</h3><p>' + P.p + '</p><ul>' + P.li.map((x) => '<li>' + x + '</li>').join('') + '</ul></div></div>';
    $$('#obSteps i').forEach((e, k) => e.classList.toggle('on', k <= this.i));
    $('#obCount').textContent = 'Schritt ' + (this.i + 1) + ' von ' + this.PAGES.length;
    $('#obBack').hidden = this.i === 0;
    $('#obNext').textContent = this.i === this.PAGES.length - 1 ? 'Los geht’s' : 'Weiter';
    $('#obSkip').hidden = this.i === this.PAGES.length - 1;
  },
  done() { store.set('elr.onboarded', 1); closeModal('#onboardModal'); },
  bind() {
    $('#obNext').addEventListener('click', () => { if (this.i < this.PAGES.length - 1) { this.i++; this.show(); } else this.done(); });
    $('#obBack').addEventListener('click', () => { if (this.i > 0) { this.i--; this.show(); } });
    $('#obSkip').addEventListener('click', () => this.done());
    $('#onboardModal [data-close]').addEventListener('click', () => store.set('elr.onboarded', 1));
    $('#onboardModal').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') $('#obNext').click(); if (e.key === 'ArrowLeft' && this.i > 0) $('#obBack').click(); });
  }
};

/* ---------- Reiter (Hilfe, Einstellungen) ---------- */
function bindTabs(list, onShow) {
  const host = list.closest('.dlg-b');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    selectTab(list, b.dataset.t); if (onShow) onShow(b.dataset.t);
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const bs = $$('[data-t]', list), k = bs.findIndex((x) => x.getAttribute('aria-selected') === 'true');
    const n = bs[(k + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length]; n.focus(); n.click();
  });
  return host;
}
function selectTab(list, t) {
  const host = list.closest('.dlg-b');
  $$('[data-t]', list).forEach((x) => { x.setAttribute('aria-selected', String(x.dataset.t === t)); x.tabIndex = x.dataset.t === t ? 0 : -1; });
  $$('[data-panel]', host).forEach((p) => { p.hidden = p.dataset.panel !== t; });
}

/* ---------- Installieren (PWA) und Update-Hinweis ---------- */
const Install = {
  evt: null,
  ios() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; },
  standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; },
  init() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.evt = e; this.sync(); });
    window.addEventListener('appinstalled', () => { this.evt = null; this.sync(); App.toast('Als App installiert.', 'good'); });
    this.sync();
  },
  sync() {
    const can = !!this.evt && !this.standalone();
    for (const id of ['#stInstall', '#setInstall']) { const b = $(id); if (b) b.hidden = !can; }
    const ios = this.ios() && !this.standalone();
    for (const id of ['#stIos', '#setIos']) { const n = $(id); if (n) n.hidden = !ios; }
  },
  async prompt() {
    if (!this.evt) return;
    const e = this.evt; this.evt = null; this.sync();
    try { e.prompt(); await e.userChoice; } catch (_) { /* abgelehnt */ }
  }
};
const Update = {
  worker: null,
  /* wird vom Service-Worker-Code (build.py) aufgerufen, wenn eine neue Version wartet */
  show(worker) {
    this.worker = worker;
    $('#updBanner').hidden = false;
  },
  init() {
    window.addEventListener('elr-update', (e) => this.show(e.detail));
    $('#updReload').addEventListener('click', () => {
      App.saveResume();
      setBusy($('#updReload'), true);
      if (this.worker && this.worker.postMessage) this.worker.postMessage('skipWaiting');
      else location.reload();
      setTimeout(() => location.reload(), 3000);
    });
    $('#updLater').addEventListener('click', () => { $('#updBanner').hidden = true; });
    if (window.__elrUpdate) this.show(window.__elrUpdate);
  }
};

/* ---------- Fehler nie still schlucken ---------- */
const Guard = {
  last: 0,
  init() {
    const report = (msg, err) => {
      if (/ResizeObserver loop/.test(msg) || msg === 'Script error.') return;
      console.error('[Edge Lab]', msg, err || '');
      const now = Date.now();
      if (now - this.last > 4000) { this.last = now; App.toast('Etwas ist schiefgelaufen: ' + String(msg).slice(0, 120) + '. Deine Daten sind gespeichert – bei Problemen die Seite neu laden.', 'bad'); }
      this.recover();
    };
    window.addEventListener('error', (e) => report(e.message || 'Unbekannter Fehler', e.error));
    window.addEventListener('unhandledrejection', (e) => { const r = e.reason; report((r && r.message) || String(r || 'Unbekannter Fehler'), r); });
  },
  /* App aus halbfertigen Zuständen holen */
  recover() {
    try {
      $('#boot') && $('#boot').classList.add('out');
      if (App.replay && App.replay.playing) App.pause();
      $$('button.is-loading').forEach((b) => setBusy(b, false));
      App.setChartsLoading(null);
      App.dragChart = null;
    } catch (_) { /* nichts mehr zu retten */ }
  }
};

/* ---------- Handy: Order-Ticket als Bottom-Sheet ---------- */
const Sheet = {
  isSheet() { return App.isMobile() && !document.body.classList.contains('fs'); },
  set(open) {
    const side = $('#side');
    document.body.classList.toggle('sheet-open', !!open);
    $('#sheetH').setAttribute('aria-expanded', String(!!open));
    side.style.transform = '';
    if (!open) side.scrollTop = 0;
  },
  toggle() { this.set(!document.body.classList.contains('sheet-open')); },
  bind() {
    const h = $('#sheetH'), side = $('#side');
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(); } });
    $('#mTicket').addEventListener('click', () => this.toggle());
    $('#sheetBackdrop').addEventListener('click', () => this.set(false));
    /* Ziehen am Griff: nachführen, dann einrasten */
    let drag = null;
    h.addEventListener('pointerdown', (e) => { drag = { y0: e.clientY, open: document.body.classList.contains('sheet-open'), moved: false, h: side.offsetHeight }; try { h.setPointerCapture(e.pointerId); } catch (_) { /* egal */ } });
    h.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y0; if (Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      const peek = drag.h - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheetPeek') || 52);
      const off = Math.max(0, Math.min(peek, (drag.open ? 0 : peek) + dy));
      side.style.transition = 'none'; side.style.transform = 'translateY(' + off + 'px)';
    });
    const end = (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y0, d = drag; drag = null;
      side.style.transition = '';
      if (!d.moved) { this.toggle(); return; }
      this.set(d.open ? dy < 60 : dy < -60);
    };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  }
};
