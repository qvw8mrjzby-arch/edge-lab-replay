/* Edge Lab Replay — Backtest-Sessions und Strategien */
'use strict';
const MISTAKES = ['Zu früh rein', 'Zu spät rein', 'SL verschoben', 'TP zu früh', 'Overtrading', 'Gegen den Trend', 'FOMO', 'Ohne Setup gehandelt', 'Revenge-Trade', 'Größe zu groß'];
Object.assign(App, {
  sessions: [], strategies: [], /* werden in UI.init geladen */
  defaultStrategies: () => [{
    id: 's1', name: 'Beispiel: VWAP-Rückeroberung', desc: 'Rückeroberung des Session-VWAP nach einem Fehlausbruch nach unten.',
    rules: 'Kurs war unter dem VWAP und schließt wieder darüber\nDelta der Signalkerze positiv\nStop unter das Tief der Signalkerze\nZiel: ±1σ-Band oder 2R\nNur 15:30–18:00 Uhr (NY-Eröffnung)'
  }],
  saveSessions() { return Store.save('sessions', this.sessions); },
  saveStrategies() { const p = Store.save('strategies', this.strategies); this.renderStratSelects(); return p; },
  renderStratSelects() {
    const opts = '<option value="">(keine Strategie)</option>' + this.strategies.map((s) => '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>').join('');
    for (const sel of $$('select[data-strat]')) { const v = sel.value; sel.innerHTML = opts; sel.value = this.strategies.some((s) => s.name === v) ? v : ''; }
    const tk = $('#tkStrat'); if (tk) tk.value = this.strategies.some((s) => s.name === this.settings.ticket.setup) ? this.settings.ticket.setup : '';
    this.renderRuleCheck();
  },
  renderRuleCheck() {
    const el = $('#tkRules'); if (!el) return;
    const s = this.strategies.find((x) => x.name === this.settings.ticket.setup);
    const rules = s ? s.rules.split('\n').map((r) => r.trim()).filter(Boolean) : [];
    el.hidden = !rules.length;
    el.innerHTML = rules.length ? '<p class="mini-h">Regel-Check vor dem Einstieg</p>' + rules.map((r, i) => '<label class="chk"><input type="checkbox" id="rule' + i + '"><span>' + esc(r) + '</span></label>').join('') : '';
  },
  resetRuleCheck() { $$('#tkRules input').forEach((c) => { c.checked = false; }); },
  sessionAuto(rid) {
    const tr = this.journal.filter((j) => j.replay === rid);
    const s = Core.stats(tr, 0);
    const strat = {};
    tr.forEach((t) => { if (t.setup) strat[t.setup] = (strat[t.setup] || 0) + 1; });
    const top = Object.entries(strat).sort((a, b) => b[1] - a[1])[0];
    return { trades: s.n, wins: s.wins, losses: s.losses, net: s.net, sumR: s.nR ? s.sumR : null, strategy: top ? top[0] : '', sym: tr.length ? tr[0].sym : '' };
  },
  resultOf(net) { return net > 0.005 ? 'Profit' : net < -0.005 ? 'Verlust' : 'Break-even'; },
  /* Session-Eintrag sofort beim Start einer neuen Backtest-Session anlegen */
  createRunningSession(o) {
    const e = { id: 'n' + Date.now(), created: Math.floor(Date.now() / 1000), replayId: o.replayId, strategy: o.strategy || '', sym: o.sym, market: o.market, from: o.from, realDay: o.realDay, blind: !!o.blind, running: true, discipline: 0, mistakes: [], good: '', bad: '', note: '', result: 'auto', manual: false };
    this.sessions.push(e); this.saveSessions();
    return e;
  },
  isRunning(e) { return !!(e.running && this.replay.active && e.replayId === this.replay.id); },
  openSession(opt) {
    opt = opt || {};
    let e = opt.id ? this.sessions.find((x) => x.id === opt.id) : (opt.replayId ? this.sessions.find((x) => x.replayId === opt.replayId) : null);
    const isNew = !e;
    if (!e) {
      e = { id: 'n' + Date.now(), created: Math.floor(Date.now() / 1000), replayId: opt.replayId || null, discipline: 0, mistakes: [], good: '', bad: '', note: '', result: 'auto', manual: !opt.replayId };
      if (opt.meta) { e.sym = opt.meta.sym; e.from = opt.meta.startT; e.to = opt.meta.endT; }
      else { e.sym = this.symbol || ''; }
    }
    if (opt.meta && !e.to) e.to = opt.meta.endT;
    this._sess = { e, isNew };
    const running = this.isRunning(e);
    const hideDate = running && e.blind;
    const auto = e.replayId ? this.sessionAuto(e.replayId) : null;
    const f = $('#sessForm');
    $('#sessTitle').textContent = e.replayId ? (running ? 'Backtest-Session (läuft)' : 'Backtest-Session festhalten') : (isNew ? 'Neuer Backtest-Eintrag' : 'Eintrag bearbeiten');
    const rv = $('#sessReveal');
    rv.hidden = !(e.blind && !running && e.realDay);
    if (!rv.hidden) rv.textContent = 'Das war der ' + e.realDay + '.';
    const want = e.strategy != null && e.strategy !== '' ? e.strategy : (auto ? auto.strategy : this.settings.ticket.setup || '');
    /* unbekannte (gelöschte/umbenannte) Namen als Option behalten, damit Speichern sie nicht löscht */
    if (want && !this.strategies.some((s) => s.name === want)) f.strategy.insertAdjacentHTML('beforeend', '<option value="' + esc(want) + '">' + esc(want) + ' (gelöscht)</option>');
    f.strategy.value = want;
    f.sym.value = e.sym || (auto ? auto.sym : '');
    $('#sessDateFld').hidden = hideDate;
    f.date.value = hideDate ? '' : new Date(((e.from || e.created) + Core.tzOffset(e.from || e.created, this.settings.tz) * 60) * 1000).toISOString().slice(0, 10);
    f.trades.value = auto ? auto.trades : (e.trades != null ? e.trades : '');
    f.net.value = auto ? auto.net.toFixed(2) : (e.net != null ? e.net : '');
    f.r.value = auto ? (auto.sumR != null ? auto.sumR.toFixed(2) : '') : (e.r != null ? e.r : '');
    const lock = !!auto;
    [f.trades, f.net, f.r].forEach((x) => { x.readOnly = lock; x.classList.toggle('ro', lock); });
    $('#sessAutoHint').hidden = !lock;
    if (auto) $('#sessAutoHint').textContent = 'Aus ' + auto.trades + ' Trades dieses Replays berechnet (' + auto.wins + ' Gewinner, ' + auto.losses + ' Verlierer)' + (e.from && !hideDate ? ', ' + this.fmtT(e.from, 60) + ' bis ' + this.fmtT(e.to || e.from, 60) : '') + '.';
    f.result.value = e.result || 'auto';
    $$('#sessDisc input').forEach((r) => { r.checked = +r.value === (e.discipline || 0); });
    $('#sessMistakes').innerHTML = MISTAKES.map((m, i) => '<label class="chip"><input type="checkbox" value="' + esc(m) + '" id="mk' + i + '"' + ((e.mistakes || []).includes(m) ? ' checked' : '') + '><span>' + esc(m) + '</span></label>').join('');
    f.good.value = e.good || ''; f.bad.value = e.bad || ''; f.note.value = e.note || '';
    const tr = e.replayId ? this.journal.filter((j) => j.replay === e.replayId) : [];
    $('#sessTradesBox').hidden = !tr.length;
    $('#sessTrades').innerHTML = tr.map((j) => '<div><span>' + (j.side > 0 ? 'Long' : 'Short') + ' ' + esc(j.setup || '') + ' · ' + this.fmtT(j.entryT, 60) + '</span><span class="' + (j.pnl >= 0 ? 'up' : 'dn') + '">' + this.fmtMoney(j.pnl, true) + ' · ' + this.fmtR(j.r) + '</span></div>').join('');
    $('#sessDelete').hidden = isNew;
    this.renderSessFindings(e);
    openModal('#sessModal');
    Gallery.render($('#sessPhotos'), 'sess:' + e.id);
  },
  saveSessionForm() {
    const { e, isNew } = this._sess; const f = $('#sessForm');
    e.strategy = f.strategy.value; e.sym = f.sym.value.trim().toUpperCase();
    const d = f.date.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d && !e.replayId) e.from = Core.zonedToUtc(+d[1], +d[2], +d[3], 12, 0, 0, this.settings.tz);
    if (e.replayId) { const a = this.sessionAuto(e.replayId); e.trades = a.trades; e.net = a.net; e.r = a.sumR; }
    else {
      const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
      e.trades = num(f.trades.value); e.net = num(f.net.value); e.r = num(f.r.value);
    }
    e.result = f.result.value;
    const disc = $$('#sessDisc input').find((r) => r.checked); e.discipline = disc ? +disc.value : 0;
    e.mistakes = $$('#sessMistakes input').filter((c) => c.checked).map((c) => c.value);
    e.good = f.good.value.trim(); e.bad = f.bad.value.trim(); e.note = f.note.value.trim();
    e.updated = Math.floor(Date.now() / 1000);
    if (isNew) this.sessions.push(e);
    this.saveSessions(); closeModal('#sessModal');
    this.toast('Session gespeichert.', 'good');
    if (this.view === 'start') this.renderStart();
    this.renderNotes();
  },
  /* Löschen mit „Rückgängig“ statt Bestätigung; Fotos werden erst nach Ablauf entfernt */
  deleteSession() {
    const { e } = this._sess;
    const pos = this.sessions.indexOf(e);
    if (pos < 0) { closeModal('#sessModal'); return; }
    this.sessions.splice(pos, 1); this.saveSessions();
    closeModal('#sessModal'); this.renderNotes();
    this.undoToast('Session gelöscht.', () => {
      this.sessions.splice(Math.min(pos, this.sessions.length), 0, e); this.saveSessions(); this.renderNotes();
      this.toast('Session wiederhergestellt.', 'good');
    }, () => { Photos.delOwner('sess:' + e.id).catch(() => {}); });
  },
  sessionResult(e) {
    if (this.isRunning(e)) return 'läuft';
    if (e.replayId) { const a = this.sessionAuto(e.replayId); if (a.trades) e.net = a.net, e.r = a.sumR, e.trades = a.trades; }
    return e.result && e.result !== 'auto' ? e.result : (e.net != null ? this.resultOf(e.net) : '–');
  },
  async renderNotes() {
    const el = $('#notesBody'); if (!el) return;
    const fSel = $('#nFilter');
    const cur = fSel.value;
    fSel.innerHTML = '<option value="">Alle Strategien</option>' + this.strategies.map((s) => '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>').join('') + '<option value="-">(ohne Strategie)</option>';
    fSel.value = [...fSel.options].some((o) => o.value === cur) ? cur : '';
    const flt = fSel.value;
    const list = this.sessions.filter((e) => !flt || (flt === '-' ? !e.strategy : e.strategy === flt)).slice().sort((a, b) => (b.created || 0) - (a.created || 0));
    if (!list.length) {
      el.innerHTML = this.sessions.length ? emptyState('backtests', 'Keine Sessions mit dieser Strategie', 'Wähle oben „Alle Strategien“.', '')
        : emptyState('backtests', 'Noch keine Backtest-Sessions', 'Eine Session ist ein zufälliger historischer Handelstag, den du Kerze für Kerze durchspielst. Danach hältst du hier Disziplin, Fehler und Learnings fest.', '<button class="btn primary" data-empty="session">Session starten</button>');
      return;
    }
    if (!el.querySelector('.sess')) el.innerHTML = skeleton(3, 'cards');
    Gallery.revoke();
    const thumbs = Photos.ok ? await Photos.owners() : new Map();
    el.innerHTML = list.map((e) => {
      const res = this.sessionResult(e);
      const running = res === 'läuft';
      const cls = running ? 'run' : res === 'Profit' ? 'up' : res === 'Verlust' ? 'dn' : '';
      const dots = [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= e.discipline ? 'on' : '') + '"></i>').join('');
      const txt = [e.note, e.good && 'Gut: ' + e.good, e.bad && 'Learning: ' + e.bad].filter(Boolean).join(' · ');
      const date = running && e.blind ? 'Datum verborgen' : e.realDay || this.fmtDate(e.from || e.created);
      const ph = thumbs.get('sess:' + e.id);
      return '<article class="sess" data-id="' + esc(e.id) + '" tabindex="0"><div class="sess-top"><span class="sess-res ' + cls + '">' + esc(res) + '</span>' +
        '<span class="sess-date">' + esc(date) + '</span><span class="sess-sym">' + esc(e.sym || '') + '</span></div>' +
        '<div class="sess-strat">' + esc(e.strategy || '(ohne Strategie)') + '</div>' +
        '<div class="sess-nums"><span class="num ' + (cls === 'run' ? '' : cls) + '">' + (e.net != null ? this.fmtMoney(e.net, true) : '–') + '</span><span class="num">' + (e.r != null ? this.fmtR(e.r) : '–') + '</span><span>' + (e.trades != null ? e.trades + ' Trades' : '') + '</span>' +
        '<span class="disc" title="Disziplin ' + (e.discipline || 0) + '/5">' + dots + '</span></div>' +
        ((e.mistakes || []).length ? '<div class="sess-mk">' + e.mistakes.map((m) => '<span class="tag bad">' + esc(m) + '</span>').join('') + '</div>' : '') +
        (txt ? '<p class="sess-txt">' + esc(txt) + '</p>' : '') +
        (ph ? '<div class="sess-ph"><img alt="" src="' + Gallery.url(ph.blob) + '"></div>' : '') + '</article>';
    }).join('');
  },

  /* ---------- Strategien (eigener Bereich) ---------- */
  stratStats(name) {
    const tr = this.visibleJournal().filter((j) => j.setup === name);
    const st = Core.stats(tr, 0);
    return { st, ses: this.sessions.filter((x) => x.strategy === name).length };
  },
  renderStrategies() {
    const el = $('#stratList');
    if (!this.strategies.length) { el.innerHTML = emptyState('strat', 'Noch keine Strategie', 'Schreib deine Regeln als Checkliste auf – vor jedem Einstieg erscheinen sie im Order-Ticket, und hier siehst du, wie gut jede Strategie läuft.', '<button class="btn primary" data-empty="strat">Strategie anlegen</button>'); return; }
    el.innerHTML = this.strategies.map((s) => {
      const { st, ses } = this.stratStats(s.name);
      return '<article class="strat-card" data-id="' + esc(s.id) + '"><div class="sc-main">' +
        '<label class="fld"><span>Name</span><input data-k="name" value="' + esc(s.name) + '" maxlength="40"></label>' +
        '<label class="fld"><span>Beschreibung</span><textarea data-k="desc" rows="2" maxlength="1200">' + esc(s.desc || '') + '</textarea></label>' +
        '<label class="fld"><span>Regeln (eine pro Zeile – erscheinen als Checkliste im Order-Ticket)</span><textarea data-k="rules" rows="5" maxlength="2000">' + esc(s.rules || '') + '</textarea></label>' +
        '<div class="fld"><span>Bild-Beispiele</span><div class="ph-drop" data-strat-photos="' + esc(s.id) + '"></div></div>' +
        '</div><div class="sc-side"><div class="sc-kpi">' +
        '<div><span>Trades</span><b>' + st.n + '</b></div><div><span>Sessions</span><b>' + ses + '</b></div>' +
        '<div><span>Trefferquote</span><b>' + (st.n ? this.fmtPct(st.winRate) : '–') + '</b></div><div><span>Ø R</span><b class="' + (st.avgR == null ? '' : st.avgR >= 0 ? 'up' : 'dn') + '">' + (st.avgR == null ? '–' : this.fmtR(st.avgR)) + '</b></div>' +
        '<div style="grid-column:1/-1"><span>Netto</span><b class="' + (!st.n ? '' : st.net >= 0 ? 'up' : 'dn') + '">' + (st.n ? this.fmtMoney(st.net, true) : '–') + '</b></div></div>' +
        '<button type="button" class="btn sm ghost danger" data-act="del">Strategie löschen</button></div></article>';
    }).join('');
    for (const host of $$('[data-strat-photos]')) Gallery.render(host, 'strat:' + host.dataset.stratPhotos);
  },
  addStrategy() {
    let n = 1; while (this.strategies.some((s) => s.name === 'Neue Strategie ' + n)) n++;
    this.strategies.unshift({ id: 's' + Date.now(), name: 'Neue Strategie ' + n, desc: '', rules: '' });
    this.saveStrategies(); this.renderStrategies();
    const inp = $('#stratList [data-k="name"]'); if (inp) { inp.focus(); inp.select(); }
  },
  /* Änderung eines Feldes sofort speichern; Umbenennen in Journal und Sessions nachziehen */
  editStrategy(id, k, v) {
    const s = this.strategies.find((x) => x.id === id); if (!s) return;
    if (k === 'name') {
      v = v.trim();
      if (!v || this.strategies.some((x) => x !== s && x.name === v)) { this.toast('Name leer oder schon vergeben.', 'warn'); this.renderStrategies(); return; }
      const old = s.name;
      if (old !== v) {
        this.journal.forEach((j) => { if (j.setup === old) j.setup = v; });
        this.sessions.forEach((e) => { if (e.strategy === old) e.strategy = v; });
        if (this.settings.ticket.setup === old) this.settings.ticket.setup = v;
        this.saveJournal(); this.saveSessions(); this.saveSettings();
      }
    }
    s[k] = v; this.saveStrategies();
  },
  async deleteStrategy(id) {
    const s = this.strategies.find((x) => x.id === id); if (!s) return;
    if (!(await this.confirm('Strategie löschen?', '„' + s.name + '“ wird entfernt. Trades und Sessions behalten den Namen als Text.', 'Strategie löschen'))) return;
    this.strategies = this.strategies.filter((x) => x !== s);
    if (this.settings.ticket.setup === s.name) { this.settings.ticket.setup = ''; this.saveSettings(); }
    this.saveStrategies();
    try { await Photos.delOwner('strat:' + id); } catch (_) { /* egal */ }
    this.renderStrategies();
  }
});
