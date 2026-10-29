/* Edge Lab Replay — Fehler-Analyse: Bereich #analyse, Kurzhinweise nach Session-Ende, Karte „Größte Baustelle“ in der Übersicht, „Mehr“-Menü */
'use strict';
EMPTY_ART.analyse = '<svg viewBox="0 0 88 64"><path d="M12 50h46"/><path d="M18 44V34M28 44V26M38 44V30"/><circle class="acc" cx="58" cy="26" r="12"/><path class="acc" d="M67 35l9 9"/><path class="acc" d="M53 26h10"/></svg>';
const SEV_LBL = { hoch: 'Hoch', mittel: 'Mittel', gering: 'Gering' };

Object.assign(App, {
  /* Ziel-Risiko aus dem Ticket (nur bei $-Risiko eindeutig), Wochentag der laufenden Blind-Session ausblenden */
  analysisOpts(extra) {
    const T = this.settings.ticket;
    return Object.assign({ tz: this.settings.tz, riskTarget: T.riskMode === 'money' && +T.risk > 0 ? +T.risk : null, hideWeekdayReplay: this.isBlind() ? this.replay.id : null }, extra || {});
  },
  analysisBase() { return this.visibleJournal().filter((j) => j.status === 'closed' || j.status == null); },
  /* Filter: alle / strat:<Name> / last:<N> (letzte N Sessions nach Zeit) */
  analysisList(f) {
    const J = this.analysisBase();
    if (!f || f === 'all') return J;
    if (f.startsWith('strat:')) { const n = f.slice(6); return J.filter((j) => (n === '-' ? !j.setup : j.setup === n)); }
    if (f.startsWith('last:')) {
      const last = new Map(); for (const j of J) last.set(j.replay, Math.max(last.get(j.replay) || 0, j.exitT));
      const keep = new Set([...last.entries()].sort((a, b) => b[1] - a[1]).slice(0, +f.slice(5) || 5).map((e) => e[0]));
      return J.filter((j) => keep.has(j.replay));
    }
    return J;
  },
  fillAnalysisFilter() {
    const sel = $('#aFilter'), J = this.analysisBase();
    const st = [...new Set(J.map((j) => j.setup).filter(Boolean))].sort();
    const opts = [['all', 'Alle Trades'], ['last:5', 'Letzte 5 Sessions'], ['last:10', 'Letzte 10 Sessions'], ['last:20', 'Letzte 20 Sessions']]
      .concat(st.map((s) => ['strat:' + s, 'Strategie: ' + s]), J.some((j) => !j.setup) && st.length ? [['strat:-', '(ohne Strategie)']] : []);
    sel.innerHTML = opts.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
    if (!opts.some((o) => o[0] === this.settings.aFilter)) this.settings.aFilter = 'all';
    sel.value = this.settings.aFilter;
  },
  costTxt(f) { return f.kostenUsd > 0 ? Core.fmtMoney(-f.kostenUsd, false, 0) : f.kostenR > 0 ? '−' + this.fmtN(f.kostenR, 2) + 'R' : 'keine Schätzung'; },
  renderAnalysis() {
    this.fillAnalysisFilter();
    const el = $('#aBody'), all = this.analysisBase();
    if (!all.length) {
      $('#aSub').textContent = 'Erkennt typische Fehler in deinen Trades und schätzt, was sie gekostet haben.';
      el.innerHTML = emptyState('analyse', 'Noch nichts zu analysieren', 'Nach deinen ersten Trades erkennt die Analyse typische Fehler – vergrößerte Stops, Revenge-Trades, Overtrading, schwache Zeitfenster – und schätzt, was sie dich gekostet haben.', '<button class="btn primary" data-empty="session">Session starten</button>');
      return;
    }
    const list = this.analysisList(this.settings.aFilter);
    const res = Core.analyzeMistakes(list, this.sessions, this.analysisOpts());
    this._an = res;
    $('#aSub').textContent = res.n + ' Trades in ' + res.sessions + (res.sessions === 1 ? ' Session' : ' Sessions') + ' ausgewertet' + (this.isBlind() ? ' · laufende Blind-Session ohne Datumsbezug' : '') + '. Kosten sind Schätzungen aus deinem Journal.';
    if (!res.n) { el.innerHTML = emptyState('analyse', 'Keine Trades für diese Auswahl', 'Wähle oben „Alle Trades“ oder eine andere Strategie.', ''); return; }
    const B = res.befunde, top = B[0];
    const cnt = (k) => B.filter((f) => f.schwere === k).length;
    let h = '<section class="an-hero" aria-label="Zusammenfassung"><div class="an-main">';
    if (top) {
      h += '<span class="an-kick">Größte Baustelle</span><h2>' + esc(top.titel) + '</h2><p class="an-cost">' + (top.kostenUsd > 0 || top.kostenR > 0 ? 'Geschätzt <b class="dn">' + this.costTxt(top) + '</b> in ' : 'Betrifft ') + top.anzahl + (top.anzahl === 1 ? ' Trade' : ' Trades') + '</p><p>' + esc(top.tipp) + '</p>' +
        '<div class="an-btns">' + this.anBtns(top, true) + '</div>';
    } else {
      h += '<span class="an-kick ok">Keine Baustelle gefunden</span><h2>Keine auffälligen Fehler-Muster</h2><p>In ' + res.n + ' Trades hat keine Regel angeschlagen. ' + (res.zuWenig.length ? 'Einige Prüfungen brauchen aber noch mehr Daten – siehe unten.' : 'Weiter so – und regelmäßig wieder hineinschauen.') + '</p>';
    }
    h += '</div><dl class="an-sum">' +
      '<div><dt>Geschätzte Kosten</dt><dd class="' + (res.kostenUsd > 0 ? 'dn' : '') + '">' + (res.kostenUsd > 0 ? Core.fmtMoney(-res.kostenUsd, false, 0) : '–') + '</dd><small>' + (res.kostenR > 0 ? '≈ ' + this.fmtN(res.kostenR, 1) + 'R · ' : '') + 'Befunde können sich überschneiden</small></div>' +
      '<div><dt>Befunde</dt><dd>' + B.length + '</dd><small>' + (B.length ? cnt('hoch') + ' hoch · ' + cnt('mittel') + ' mittel · ' + cnt('gering') + ' gering' : 'keine') + '</small></div>' +
      '<div><dt>Datenbasis</dt><dd>' + res.n + ' Trades</dd><small>' + res.sessions + (res.sessions === 1 ? ' Session' : ' Sessions') + '</small></div></dl></section>';
    if (B.length) h += '<div class="an-cards">' + B.map((f) => this.anCard(f)).join('') + '</div>';
    if (res.staerken.length) {
      h += '<section class="an-sec"><h3>Deine Stärken</h3><div class="an-good">' + res.staerken.map((s) => '<div class="an-g"><b>' + esc(s.titel) + '</b><span>' + esc(s.beschreibung) + '</span>' +
        (s.tradeIds.length ? '<button type="button" class="linkbtn" data-a-ids="' + esc(s.id) + '">Trades ansehen</button>' : '') + '</div>').join('') + '</div></section>';
    }
    if (res.zuWenig.length) {
      h += '<details class="an-low"><summary>Noch nicht auswertbar <span class="tag">' + res.zuWenig.length + '</span></summary><ul>' +
        res.zuWenig.map((z) => '<li><b>' + esc(z.titel) + '</b><span>' + esc(z.hinweis) + '</span></li>').join('') + '</ul></details>';
    }
    h += '<p class="hint an-method"><b>So rechnet die Analyse:</b> Alle Werte stammen aus deinem Journal und sind netto (nach Gebühren und Slippage). Die Kosten schätzen, was ein Muster ungefähr gekostet hat – nicht, was ohne den Fehler sicher passiert wäre. Die Nachlauf-Prüfung läuft erst nach dem Ende einer Session: Hätte der Kurs in den nächsten ' + Core.ANALYSE.postBars + ' Basis-Kerzen erst das Ziel oder erst Stop + 0,5R erreicht? Während des Replays gibt es keine Information aus der Zukunft.</p>';
    el.innerHTML = h;
  },
  anBtns(f, big) {
    return '<button type="button" class="btn ' + (big ? '' : 'sm') + '" data-a-trades="' + esc(f.id) + '">Betroffene Trades <span class="tag">' + f.tradeIds.length + '</span></button>' +
      '<button type="button" class="btn ghost ' + (big ? '' : 'sm') + '" data-a-hb="' + esc(f.handbuch) + '">Im Handbuch lesen</button>';
  },
  anCard(f) {
    const c = this.costTxt(f);
    return '<article class="an-card sev-' + f.schwere + '" data-id="' + esc(f.id) + '"><div class="an-top"><span class="sev ' + f.schwere + '">' + SEV_LBL[f.schwere] + '</span><h3>' + esc(f.titel) + '</h3></div>' +
      '<dl class="an-nums"><div><dt>Betroffen</dt><dd>' + f.anzahl + (f.anzahl === 1 ? ' Trade' : ' Trades') + '</dd></div><div><dt>Kosten</dt><dd class="' + (f.kostenUsd > 0 || f.kostenR > 0 ? 'dn' : 'muted') + '">' + c + '</dd></div>' +
      '<div><dt>in R</dt><dd class="' + (f.kostenR > 0 ? 'dn' : 'muted') + '">' + (f.kostenR > 0 ? '−' + this.fmtN(f.kostenR, 2) + 'R' : '–') + '</dd></div></dl>' +
      '<p class="an-desc">' + esc(f.beschreibung) + '</p><p class="an-tip"><b>Tipp</b>' + esc(f.tipp) + '</p><div class="an-btns">' + this.anBtns(f, false) + '</div></article>';
  },
  /* 1–3 Befunde einer beendeten Session (Kurzcheck) für den Session-Dialog */
  renderSessFindings(e) {
    const box = $('#sessFindings'); if (!box) return;
    const show = e && e.replayId && !this.isRunning(e);
    const tr = show ? this.journal.filter((j) => j.replay === e.replayId && (j.status === 'closed' || j.status == null)) : [];
    if (!tr.length) { box.hidden = true; box.innerHTML = ''; return; }
    const res = Core.analyzeMistakes(tr, [], this.analysisOpts({ kurz: true, hideWeekdayReplay: null }));
    const B = res.befunde.slice(0, 3);
    box.hidden = false;
    box.innerHTML = B.length ? '<b>Auffällig in dieser Session</b><ul>' + B.map((f) => '<li><span class="sev ' + f.schwere + '">' + SEV_LBL[f.schwere] + '</span><span><b>' + esc(f.titel) + '</b> – ' + f.anzahl + (f.anzahl === 1 ? ' Trade' : ' Trades') + (f.kostenUsd > 0 ? ', ' + Core.fmtMoney(-f.kostenUsd, false, 0) : '') + '. <button type="button" class="linkbtn" data-sf-hb="' + esc(f.handbuch) + '">Im Handbuch</button></span></li>').join('') + '</ul>' +
      '<button type="button" class="linkbtn" data-sf-an>Ganze Analyse öffnen</button>'
      : '<b>Sauber gespielt</b><p>In dieser Session hat keine der Verhaltens-Regeln angeschlagen (Stop, Ausstieg, Revenge, Risiko, Regeln).</p>';
  },
  /* Karte für die Übersicht */
  bigIssueCard(J) {
    if (!J || J.length < 3) return '';
    const res = Core.analyzeMistakes(J, this.sessions, this.analysisOpts());
    const f = res.befunde[0];
    let h = '<section class="card an-mini"><div class="card-h"><h3>Größte Baustelle</h3><a href="#analyse">Analyse öffnen</a></div>';
    if (!f) return h + '<p class="hint">Keine auffälligen Fehler-Muster in ' + res.n + ' Trades.</p></section>';
    return h + '<div class="an-mini-b"><span class="sev ' + f.schwere + '">' + SEV_LBL[f.schwere] + '</span><b>' + esc(f.titel) + '</b><span class="num ' + (f.kostenUsd > 0 ? 'dn' : 'muted') + '">' + this.costTxt(f) + '</span></div>' +
      '<p class="hint">' + esc(f.tipp) + '</p>' + (res.befunde.length > 1 ? '<p class="hint">+ ' + (res.befunde.length - 1) + ' weitere Befunde · zusammen ' + (res.kostenUsd > 0 ? Core.fmtMoney(-res.kostenUsd, false, 0) : '–') + '</p>' : '') + '</section>';
  }
});

const Analysis = {
  bind() {
    $('#aFilter').addEventListener('change', (e) => { App.settings.aFilter = e.target.value; App.saveSettings(); App.renderAnalysis(); });
    $('#view-analyse').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !App._an) return;
      if (b.dataset.aTrades) { const f = App._an.befunde.find((x) => x.id === b.dataset.aTrades); if (f) UI.showTradeIds(f.tradeIds, f.titel); }
      else if (b.dataset.aIds) { const s = App._an.staerken.find((x) => x.id === b.dataset.aIds); if (s) UI.showTradeIds(s.tradeIds, s.titel); }
      else if (b.dataset.aHb) location.hash = '#handbuch-' + b.dataset.aHb;
    });
    $('#sessFindings').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-sf-an')) { closeModal('#sessModal'); location.hash = '#analyse'; }
      else if (b.dataset.sfHb) { closeModal('#sessModal'); location.hash = '#handbuch-' + b.dataset.sfHb; }
    });
    /* Handy: „Mehr“ bündelt Strategien, Handbuch und TradingView */
    const more = $('#navMore'), menu = $('#moreMenu');
    const set = (on) => { menu.hidden = !on; more.setAttribute('aria-expanded', String(on)); };
    more.addEventListener('click', (e) => { e.preventDefault(); set(menu.hidden); if (!menu.hidden) { const a = menu.querySelector('a'); if (a) a.focus({ preventScroll: true }); } });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#moreMenu') && !e.target.closest('#navMore')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { set(false); more.focus(); } });
    window.addEventListener('hashchange', () => set(false));
  }
};
