/* Edge Lab Replay — Bedienung, Bereiche, Routing */
'use strict';
let lastFocus = null;
function openModal(sel) {
  lastFocus = document.activeElement;
  const m = $(sel); m.hidden = false; syncModalState();
  const f = m.querySelector('[autofocus], input:not([type=hidden]):not([readonly]):not([type=file]), select, textarea, button.btn');
  if (f && !App.isMobile()) setTimeout(() => f.focus({ preventScroll: true }), 30);
}
function closeModal(sel) {
  const m = $(sel); if (!m || m.hidden) return;
  m.hidden = true; syncModalState();
  if (sel === '#lightbox') Lightbox.close();
  if (sel === '#onboardModal') store.set('elr.onboarded', 1);
  if (sel === '#tradeModal' || sel === '#sessModal') Gallery.revoke();
  if (lastFocus && lastFocus.focus && document.body.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
}
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; }
const VIEWS = ['start', 'charts', 'journal', 'backtests', 'stats', 'analyse', 'strategien', 'handbuch', 'tradingview'];
const MORE_VIEWS = ['strategien', 'handbuch', 'tradingview'];

const UI = {
  async init() {
    const t0 = performance.now();
    Guard.init();
    readColors();
    this.wasMobile = App.isMobile();
    App.buildCharts();
    this.bindHeader(); this.bindTools(); this.bindTicket(); this.bindSide(); this.bindReplay(); this.bindPages(); this.bindModals(); this.bindKeys();
    Tips.init(); Start.bind(); Onboard.bind(); Sheet.bind(); Install.init(); Update.init(); Analysis.bind(); Handbook.bind();
    this.fillTicket();
    App.onPhotosChanged = () => { if (App.view === 'journal') this.renderJournal(); };
    /* Daten aus IndexedDB (mit einmaliger Migration aus dem localStorage) */
    const bt = $('#bootTxt');
    if (bt) bt.textContent = 'Lade deine Daten …';
    try {
      await Store.init();
      App.journal = (await Store.load('journal', [])) || [];
      App.sessions = (await Store.load('sessions', [])) || [];
      const st = await Store.load('strategies', null);
      App.strategies = Array.isArray(st) ? st : App.defaultStrategies();
      App.dataOk = true;
    } catch (e) { console.error(e); App.toast('Gespeicherte Daten konnten nicht geladen werden: ' + e.message, 'bad'); }
    if (Store.migrated.length) console.info('Daten in IndexedDB übernommen:', Store.migrated.join(', '));
    App.renderStratSelects();
    /* erst ein Bild zeigen, dann die Demo-Daten erzeugen (blockiert sonst ~0,3 s) */
    if (bt) bt.textContent = 'Bereite Demo-Daten vor …';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try { Loader.demo(true); } catch (e) { console.error(e); App.toast('Demo-Daten konnten nicht erzeugt werden: ' + e.message, 'bad'); }
    App.updateHeader(); App.updateToolbar(); App.updateReplayBar(); App.updatePanels();
    window.addEventListener('hashchange', () => this.route());
    window.addEventListener('resize', () => {
      const mob = App.isMobile();
      if (mob !== this.wasMobile) { this.wasMobile = mob; App.buildCharts(); App.requestRender(); if (!mob) Sheet.set(false); }
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && App.isFs() && !App.isMobile()) App.setFullscreen(false); });
    /* laufende Session: beim Schließen/Wegwechseln sofort sichern */
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') App.saveResume(); });
    window.addEventListener('pagehide', () => App.saveResume());
    window.addEventListener('beforeunload', (e) => {
      App.saveResume();
      if (App.replay.active && App.engine && (App.engine.open().length || App.engine.pending().length) && !App.noUnloadWarn) { e.preventDefault(); e.returnValue = ''; }
    });
    /* verwaiste Sessions (running ohne gespeicherten Stand) sauber schließen */
    const pend = App.pendingResume();
    let fixed = 0;
    for (const s of App.sessions) if (s.running && (!pend || pend.replay.id !== s.replayId)) { s.running = false; s.to = s.to || s.from; fixed++; }
    if (fixed) App.saveSessions();
    this.route();
    /* Sync nur, wenn die lokalen Daten sicher geladen sind (sonst würden fehlende Einträge als gelöscht gelten) */
    if (App.dataOk && typeof Sync !== 'undefined') Sync.init().catch((e) => console.warn('[Sync]', e));
    else if (typeof Sync !== 'undefined') Sync.setState('err', 'Lokale Daten nicht geladen – Sync pausiert');
    const boot = $('#boot');
    if (boot) { boot.classList.add('out'); setTimeout(() => boot.remove(), 250); }
    App.bootMs = Math.round(performance.now() - t0);
    /* Schriften kommen nicht-blockierend nach → Canvas-Texte neu messen und zeichnen */
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { TW.clear(); App.requestRender(); if (App.view === 'start') App.renderStart(); });
    if (!store.get('elr.onboarded', 0) && !store.get('elr.seen', false)) setTimeout(() => Onboard.open(), 250);
    else store.set('elr.onboarded', 1);
    App.requestRender();
    Photos.init().then((ok) => { if (!ok) console.warn(Photos.err); if (App.view === 'journal') this.renderJournal(); });
  },

  /* ---------- Bereiche ---------- */
  route() {
    if (Tips.hide) Tips.hide();
    let v = (location.hash || '#start').slice(1), sub = null;
    /* Deep-Link ins Handbuch: #handbuch-<kapitel oder abschnitt> (nur Buchstaben, Ziffern, Bindestrich) */
    const m = v.match(/^handbuch-([A-Za-z0-9-]{1,60})$/);
    if (m) { v = 'handbuch'; sub = m[1].toLowerCase(); }
    if (!VIEWS.includes(v)) v = 'start';
    this.showView(v, sub);
  },
  showView(v, sub) {
    if (v !== 'journal') this.idFilter = null;
    const mb = $('#navMore'); if (mb) mb.classList.toggle('cur', MORE_VIEWS.includes(v));
    App.view = v;
    if (v !== 'charts' && App.isFs()) App.setFullscreen(false);
    for (const n of VIEWS) $('#view-' + n).hidden = n !== v;
    $$('#mainNav a').forEach((a) => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.classList.toggle('view-charts', v === 'charts');
    $('#indMenu').hidden = true;
    if (Tips.hide) Tips.hide();
    if (v !== 'charts') Sheet.set(false);
    if (v === 'start') App.renderStart();
    if (v === 'charts') { App.charts.forEach((c) => c.resize()); App.requestRender(); App.renderResumeCard($('#resumeBar'), App.replay.active ? null : App.pendingResume(), true); }
    if (v === 'journal') this.renderJournal();
    if (v === 'backtests') App.renderNotes();
    if (v === 'stats') this.renderStats();
    if (v === 'strategien') App.renderStrategies();
    if (v === 'tradingview') TV.open();
    if (v === 'analyse') App.renderAnalysis();
    if (v !== 'charts') window.scrollTo(0, 0);
    if (v === 'handbuch') Handbook.open(sub);
  },

  bindHeader() {
    $('#btnData').addEventListener('click', () => { this.fillDataModal(); openModal('#dataModal'); });
    $('#layoutSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      App.settings.layout = +b.dataset.l; App.saveSettings(); App.buildCharts(); App.requestRender();
    });
    $('#chartBar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'btnInd') { const m = $('#indMenu'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); return; }
      if (b.dataset.ind) { const k = b.dataset.ind; App.settings.ind[k] = !App.settings.ind[k]; }
      else if (b.dataset.ema != null) { const em = App.settings.emas[+b.dataset.ema]; em.on = !em.on; }
      else return;
      App.saveSettings(); App.updateHeader(); App.requestRender();
    });
    document.addEventListener('pointerdown', (e) => {
      const m = $('#indMenu');
      if (!m.hidden && !e.target.closest('#indMenu') && !e.target.closest('#btnInd')) { m.hidden = true; $('#btnInd').setAttribute('aria-expanded', 'false'); }
    });
    $('#lowerSel').addEventListener('change', (e) => { App.settings.ind.lower = e.target.value; App.saveSettings(); App.requestRender(); });
    $('#btnSettings').addEventListener('click', () => this.openSettings());
    $('#btnSync').addEventListener('click', () => this.openSettings('sync'));
    $('#stSyncGo').addEventListener('click', () => this.openSettings('sync'));
    $('#stSyncOff').addEventListener('click', () => { store.set('elr.sync.hintOff', true); $('#stSync').hidden = true; });
    $('#btnHelp').addEventListener('click', () => this.openHelp());
    $('#btnFs').addEventListener('click', () => App.setFullscreen());
  },
  bindTools() {
    $('#tools').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) App.setTool(App.tool === b.dataset.tool ? 'cursor' : b.dataset.tool);
      else if (b.id === 'btnMagnet') { App.settings.magnet = !App.settings.magnet; App.saveSettings(); App.updateToolbar(); }
      else if (b.id === 'btnClearDraw') {
        if (!App.drawings.length && !App.avwap) { App.toast('Keine Zeichnungen vorhanden.'); return; }
        const keep = { d: App.drawings, a: App.avwap, sym: App.symbol };
        App.drawings = []; App.selDrawing = null; App.avwap = null; App.avwapArr = null; App.saveDrawings(); App.updateToolbar(); App.requestRender();
        App.undoToast('Alle Zeichnungen gelöscht.', () => {
          if (App.symbol !== keep.sym) return;
          App.drawings = keep.d; App.avwap = keep.a; App.avwapArr = null; App.saveDrawings(); App.updateToolbar(); App.requestRender();
        });
      }
    });
    $('#tools [data-tool="avwap"]').addEventListener('contextmenu', (e) => { e.preventDefault(); App.avwap = null; App.avwapArr = null; App.updateToolbar(); App.requestRender(); App.setStatus('Anchored VWAP entfernt.'); });
  },
  fillTicket() {
    const T = App.settings.ticket;
    $$('#tkType button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === T.type)));
    $('#tkPriceRow').hidden = T.type !== 'pending';
    $('#tkPrice').value = T.price ? App.fmtP(+T.price) : '';
    $('#tkSl').value = T.slPts; $('#tkTp').value = T.tpR; $('#tkRisk').value = T.risk; $('#tkRiskMode').value = T.riskMode;
    $$('#tkQtyMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === T.qtyMode)));
    $('#tkQtyRow').hidden = T.qtyMode !== 'fixed';
    $('#tkQty').value = T.qty; $('#tkNote').value = T.note || '';
    $('#mgTp1R').value = +T.tp1R || ''; $('#mgTp1Pct').value = T.tp1Pct; $('#mgBeR').value = +T.beR || ''; $('#mgTrail').value = +T.trail || '';
    App.renderStratSelects();
  },
  bindTicket() {
    const T = () => App.settings.ticket;
    const upd = () => { App.saveSettings(); App.updateTicketPreview(); App.updatePosDraft(); };
    $('#tkType').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      T().type = b.dataset.v;
      /* Limit/Stop-Feld mit aktuellem Kurs vorbelegen */
      if (b.dataset.v === 'pending' && App.base) T().price = App.price();
      this.fillTicket(); upd();
      if (b.dataset.v === 'pending') { const p = $('#tkPrice'); p.focus(); p.select(); }
    });
    $('#tkQtyMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; T().qtyMode = b.dataset.v; this.fillTicket(); upd(); });
    const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : 0; };
    const bindNum = (id, key) => $(id).addEventListener('input', (e) => { T()[key] = num(e.target.value); upd(); });
    bindNum('#tkPrice', 'price'); bindNum('#tkSl', 'slPts'); bindNum('#tkTp', 'tpR'); bindNum('#tkRisk', 'risk'); bindNum('#tkQty', 'qty');
    bindNum('#mgTp1R', 'tp1R'); bindNum('#mgTp1Pct', 'tp1Pct'); bindNum('#mgBeR', 'beR'); bindNum('#mgTrail', 'trail');
    $('#tkRiskMode').addEventListener('change', (e) => { T().riskMode = e.target.value; upd(); });
    $('#tkStrat').addEventListener('change', (e) => { T().setup = e.target.value; App.renderRuleCheck(); upd(); });
    $('#tkNote').addEventListener('input', (e) => { T().note = e.target.value; App.saveSettings(); });
    $('#tkAtrBtn').addEventListener('click', () => {
      const tf = (App.activeChart || App.charts[0]).tf;
      const atr = App.atrNow(tf);
      if (!isFinite(atr)) { App.toast('Zu wenig Kerzen für den ATR.', 'warn'); return; }
      T().slPts = Core.roundTick(atr * 1.5, App.tick); $('#tkSl').value = T().slPts; upd();
      App.setStatus('Stop = 1,5 × ATR(14) auf ' + Core.tfLabel(tf) + ' = ' + App.fmtP(T().slPts) + ' Punkte');
    });
    $('#btnBuy').addEventListener('click', () => this.submit(1));
    $('#btnSell').addEventListener('click', () => this.submit(-1));
    $('#btnCloseAll').addEventListener('click', () => { if (Date.now() >= (App.clickLockUntil || 0)) App.closeAll(); });
    /* Kauf-/Verkaufsknöpfe nach dem Klick kurz sperren (sichtbar) */
    for (const id of ['#btnBuy', '#btnSell', '#mBuy', '#mSell', '#fsBuy', '#fsSell']) $(id).addEventListener('click', () => { const lock = Math.max(0, (App.clickLockUntil || 0) - Date.now()); if (lock) { for (const x of ['#btnBuy', '#btnSell', '#mBuy', '#mSell']) $(x).classList.add('locked'); setTimeout(() => $$('.locked').forEach((x) => x.classList.remove('locked')), lock); } });
    const posClick = (e) => {
      const b = e.target.closest('button'); if (!b || !App.engine) return;
      const id = +b.closest('.pos').dataset.id;
      const o = App.engine.orders.find((x) => x.id === id); if (!o) return;
      /* Doppelklick auf Kaufen: die gerade eingeblendete Karte rutscht unter den Zeiger – diesen Klick ignorieren */
      if (Date.now() - (o._shownAt || 0) < 450) return;
      const a = b.dataset.act;
      if (a === 'close') App.closePos(o); else if (a === 'be') App.breakeven(o);
      else if (/^(sl|tp)[+-]$/.test(a)) {
        const f = a.slice(0, 2), plus = a[2] === '+';
        /* „+“ = weiter vom Einstieg weg, „−“ = näher heran */
        const away = f === 'sl' ? -o.side : o.side;
        App.nudge(o, f, plus ? away : -away);
      }
    };
    $('#posList').addEventListener('click', posClick);
    $('#fsPos').addEventListener('click', posClick);
  },
  submit(side) {
    if (App.posDraft) { App.toast('Erst den Entwurf im Chart platzieren oder abbrechen (Esc).', 'warn'); return; }
    if (Date.now() < (App.clickLockUntil || 0)) return;
    const boxes = $$('#tkRules input');
    if (App.replay.active && boxes.length && boxes.some((c) => !c.checked)) App.toast('Hinweis: Nicht alle Regeln deiner Strategie sind abgehakt.', 'warn');
    App.placeOrder(side);
    App.resetRuleCheck();
  },
  bindSide() {
    $('#fsBuy').addEventListener('click', () => this.submit(1));
    $('#fsSell').addEventListener('click', () => this.submit(-1));
    $('#fsRisk').addEventListener('input', (e) => { const x = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(x)) { App.settings.ticket.risk = x; $('#tkRisk').value = x; App.saveSettings(); App.updateTicketPreview(); } });
    $('#fsMin').addEventListener('click', () => { const p = $('#fsPanel'); p.classList.toggle('min'); $('#fsMin').setAttribute('aria-label', p.classList.contains('min') ? 'Panel aufklappen' : 'Panel einklappen'); });
    $('#fsExit').addEventListener('click', () => App.setFullscreen(false));
    $('#mBuy').addEventListener('click', () => this.submit(1));
    $('#mSell').addEventListener('click', () => this.submit(-1));
    $('#mPlay').addEventListener('click', () => App.togglePlay());
    $('#mStep').addEventListener('click', () => App.stepOnce());
    $('#mNew').addEventListener('click', () => NewSess.open());
    $('#mRandom').addEventListener('click', () => { if (!App.replay.active && App.base) App.randomStart(); });
  },
  showTrade(j) {
    if (j.sym !== App.symbol) { App.toast('Dieser Trade gehört zu ' + j.sym + '. Lade erst diese Daten.', 'warn'); return; }
    const tNow = App.nowT();
    if (j.entryT > tNow || j.entryT < App.base[0].t) { App.toast(j.entryT > tNow ? 'Liegt nach der aktuellen Replay-Position.' : 'Liegt außerhalb der geladenen Daten.', 'warn'); return; }
    location.hash = '#charts';
    for (const c of App.charts) {
      const agg = App.getAgg(c.tf); const k = agg.map[App.cursor];
      let lo = 0, hi = k; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (agg.bars[m].t <= j.entryT) lo = m; else hi = m - 1; }
      c.view.rightIdx = Math.min(k + 3, lo + c.plotW() * 0.45 / c.view.barW); c.view.auto = true;
    }
    App.requestRender();
  },
  bindReplay() {
    $('#btnNewSessBar').addEventListener('click', () => NewSess.open());
    $('#btnReplay').addEventListener('click', () => App.togglePick());
    $('#btnRandom').addEventListener('click', () => { if (!App.replay.active) App.randomStart(); });
    $('#btnPlay').addEventListener('click', () => App.togglePlay());
    $('#btnStep').addEventListener('click', () => App.stepOnce());
    $('#btnStop').addEventListener('click', () => App.stopReplay());
    $('#btnPickCancel').addEventListener('click', () => App.togglePick());
    $('#btnTrades').addEventListener('click', () => { $('#trStatus').textContent = App.live ? '' : 'Nur für Binance-Daten verfügbar. Für andere Märkte eine Trade-CSV über „Daten“ importieren.'; openModal('#tradesModal'); });
    $('#btnSessNote').addEventListener('click', () => App.openSession({ replayId: App.replay.id, meta: { sym: App.symbol, startT: App.replay.startT, endT: App.nowT() } }));
    /* immer App.settings.replay lesen – nach „Zurücksetzen“ ist das ein neues Objekt */
    this.fillReplayControls();
    $('#rpUnit').addEventListener('change', (e) => { App.settings.replay.unit = e.target.value; App.saveSettings(); });
    $('#rpSpeed').addEventListener('input', (e) => { App.settings.replay.speed = +e.target.value; $('#rpSpeedVal').textContent = App.settings.replay.speed + '/s'; App.saveSettings(); });
    $('#rpPause').addEventListener('change', (e) => { App.settings.replay.pauseOnFill = e.target.checked; App.saveSettings(); });
    $('#btnJump').addEventListener('click', () => { App.jumpToInput(); $('#jumpBox').hidden = true; $('#btnJumpOpen').setAttribute('aria-expanded', 'false'); });
    $('#btnJumpOpen').addEventListener('click', () => {
      const box = $('#jumpBox'); box.hidden = !box.hidden; $('#btnJumpOpen').setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) {
        const p = Core.localParts(App.nowT() + 3600, App.settings.tz), z = (x) => String(x).padStart(2, '0');
        $('#jumpTime').value = App.isBlind() ? z(p.h) + ':' + z(p.mi) : p.y + '-' + z(p.m) + '-' + z(p.d) + 'T' + z(p.h) + ':' + z(p.mi);
        $('#jumpTime').focus();
      }
    });
    $('#jumpTime').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnJump').click(); });
  },

  fillReplayControls() {
    const R = App.settings.replay;
    $('#rpUnit').value = R.unit; $('#rpSpeed').value = R.speed; $('#rpSpeedVal').textContent = R.speed + '/s'; $('#rpPause').checked = R.pauseOnFill;
  },
  /* ---------- Journal ---------- */
  /* „Betroffene Trades“ aus der Analyse: Journal auf genau diese Trades filtern */
  showTradeIds(ids, label) {
    this.idFilter = { ids: new Set(ids), label };
    if (location.hash === '#journal') this.renderJournal(); else location.hash = '#journal';
  },
  journalList() {
    if (this.idFilter) { const s = this.idFilter.ids; return App.visibleJournal().filter((j) => s.has(j.id)); }
    const F = App.settings.jf;
    return App.visibleJournal().filter((j) => (!F.sym || j.sym === F.sym) && (!F.strat || (F.strat === '-' ? !j.setup : j.setup === F.strat)) &&
      (!F.res || (F.res === 'win' ? j.pnl > 0 : j.pnl <= 0)) && (!F.sess || String(j.replay) === F.sess));
  },
  sessLabel(rid) {
    const s = App.sessions.find((x) => x.replayId === rid);
    if (s && App.isRunning(s)) return 'Laufende Session';
    const j = App.journal.find((x) => x.replay === rid);
    return (s && s.realDay ? s.realDay : j ? App.fmtDate(j.entryT) : 'Session') + (j ? ' · ' + j.sym : '');
  },
  fillJournalFilters() {
    const F = App.settings.jf, all = App.visibleJournal();
    const opt = (v, l) => '<option value="' + esc(v) + '">' + esc(l) + '</option>';
    const syms = [...new Set(all.map((j) => j.sym))].sort();
    $('#jfSym').innerHTML = opt('', 'Alle Märkte') + syms.map((s) => opt(s, s)).join('');
    const st = [...new Set(all.map((j) => j.setup).filter(Boolean))].sort();
    $('#jfStrat').innerHTML = opt('', 'Alle Strategien') + st.map((s) => opt(s, s)).join('') + opt('-', '(ohne Strategie)');
    const rs = [...new Set(all.map((j) => j.replay))].reverse();
    $('#jfSess').innerHTML = opt('', 'Alle Sessions') + rs.map((r) => opt(String(r), this.sessLabel(r))).join('');
    for (const [id, k] of [['#jfSym', 'sym'], ['#jfStrat', 'strat'], ['#jfRes', 'res'], ['#jfSess', 'sess']]) {
      const el = $(id); el.value = F[k] || ''; if (el.value !== (F[k] || '')) { F[k] = ''; el.value = ''; }
    }
  },
  fmtTs(t) { if (App.isBlind() && App.inData(t)) return App.fmtT(t, 60); const p = Core.localParts(t, App.settings.tz); return String(p.d).padStart(2, '0') + '.' + String(p.m).padStart(2, '0') + '.' + String(p.y).slice(2) + ' ' + App.hm(p); },
  async renderJournal() {
    this.fillJournalFilters();
    const chip = $('#jIdFilter');
    chip.hidden = !this.idFilter;
    if (this.idFilter) chip.innerHTML = '<span>Aus der Analyse: <b>' + esc(this.idFilter.label) + '</b></span><button type="button" class="btn sm ghost" id="jIdClear">Filter aufheben</button>';
    const list = this.journalList().slice().sort((a, b) => b.entryT - a.entryT);
    const el = $('#jTable');
    const st = Core.stats(list, 0);
    $('#jSummary').textContent = list.length ? list.length + ' Trades · ' + st.wins + ' Gewinner · Netto ' + App.fmtMoney(st.net, true) + (st.avgR != null ? ' · Ø ' + App.fmtR(st.avgR) : '') : '';
    if (!list.length) {
      el.innerHTML = App.journal.length ? emptyState('journal', 'Keine Trades für diese Auswahl', 'Ändere die Filter oben, um mehr Trades zu sehen.', '<button class="btn" data-empty="reset">Filter zurücksetzen</button>')
        : emptyState('journal', 'Noch keine Trades', 'Jeder abgeschlossene Trade landet hier – mit Einstieg, Ausstieg, R, Notiz und automatischen Chart-Fotos.', '<button class="btn primary" data-empty="session">Session starten</button>');
      return;
    }
    if (!el.querySelector('.jt')) el.innerHTML = skeleton(6);
    Gallery.revoke();
    const thumbs = Photos.ok ? await Photos.owners() : new Map();
    const shown = list.slice(0, 500);
    el.innerHTML = '<table class="jt"><thead><tr><th></th><th>Datum</th><th>Markt</th><th>Richtung</th><th>Strategie</th><th class="n">Einstieg</th><th class="n">Ausstieg</th><th class="n">R</th><th class="n">$</th><th>Grund</th></tr></thead><tbody>' +
      shown.map((j) => {
        const dec = Core.decimalsOf(j.tick || App.tick), f = (p) => p == null ? '–' : (+p).toFixed(dec);
        const ph = thumbs.get(j.id);
        const img = ph ? '<img class="thumb" alt="" src="' + Gallery.url(ph.blob) + '">' : '<span class="thumb none">kein Foto</span>';
        const dir = j.side > 0 ? '<b class="up">Long</b>' : '<b class="dn">Short</b>';
        const why = j.note || (j.reason ? 'Ausstieg: ' + j.reason : '');
        return '<tr class="jrow" data-id="' + esc(j.id) + '" tabindex="0"><td class="c-ph">' + img + '</td>' +
          '<td class="t c-sub">' + this.fmtTs(j.entryT) + '<span class="jcard-lbl"> · ' + esc(j.setup || 'ohne Strategie') + '</span></td>' +
          '<td class="c-sum"><span class="num">' + esc(j.sym) + '</span> <span class="jcard-lbl">' + dir + ' ' + f(j.entryPrice) + ' → ' + f(j.avgExit || j.exitPrice) + '</span></td>' +
          '<td>' + dir + '</td><td>' + esc(j.setup || '–') + '</td><td class="n">' + f(j.entryPrice) + '</td><td class="n">' + f(j.avgExit || j.exitPrice) + (j.partials ? ' <span class="tag">' + j.partials.length + ' Teile</span>' : '') + '</td>' +
          '<td class="n c-r ' + (j.r > 0 ? 'up' : j.r < 0 ? 'dn' : '') + '">' + App.fmtR(j.r) + '</td><td class="n c-m ' + (j.pnl >= 0 ? 'up' : 'dn') + '">' + App.fmtMoney(j.pnl, true) + '</td>' +
          '<td class="why" title="' + esc(why) + '">' + esc(why) + '</td></tr>';
      }).join('') + '</tbody></table>' + (list.length > shown.length ? '<p class="hint">Es werden die neuesten 500 von ' + list.length + ' Trades gezeigt. Filter nutzen.</p>' : '');
  },
  async openTrade(id) {
    const j = App.journal.find((x) => x.id === id); if (!j) return;
    this._trade = j;
    const dec = Core.decimalsOf(j.tick || App.tick), f = (p) => p == null ? '–' : (+p).toFixed(dec);
    $('#tdTitle').textContent = (j.side > 0 ? 'Long ' : 'Short ') + j.sym + ' · ' + this.fmtTs(j.entryT);
    const row = (k, v) => '<dt>' + k + '</dt><dd>' + v + '</dd>';
    const parts = j.partials ? '<div class="fld"><span>Teilausstiege</span><div class="mini-list">' + j.partials.map((p) => '<div><span>' + esc(p.reason) + ' · ' + App.fmtQ(p.qty) + ' @ ' + f(p.price) + '</span><span class="' + (p.pnl >= 0 ? 'up' : 'dn') + '">' + App.fmtMoney(p.pnl, true) + '</span></div>').join('') + '</div></div>' : '';
    $('#tdBody').innerHTML =
      '<div class="kpis" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">' +
      '<div class="kpi"><span>Ergebnis</span><b class="num ' + (j.pnl >= 0 ? 'up' : 'dn') + '">' + App.fmtMoney(j.pnl, true) + '</b></div>' +
      '<div class="kpi"><span>R (netto)</span><b class="num ' + (j.r >= 0 ? 'up' : 'dn') + '">' + App.fmtR(j.r) + '</b></div>' +
      '<div class="kpi"><span>Risiko</span><b class="num">' + App.fmtMoney(j.risk) + '</b></div>' +
      '<div class="kpi"><span>Dauer</span><b>' + App.fmtDur(j.exitT - j.entryT) + '</b></div></div>' +
      '<dl class="keys" style="grid-template-columns:auto 1fr">' +
      row('Einstieg', '<span class="num">' + f(j.entryPrice) + '</span> · ' + this.fmtTs(j.entryT)) +
      row('Ausstieg', '<span class="num">' + f(j.avgExit || j.exitPrice) + '</span> · ' + this.fmtTs(j.exitT) + ' · ' + esc(j.reason)) +
      row('SL / TP', '<span class="num">' + f(j.sl) + (j.slFinal != null && j.slFinal !== j.sl ? ' → ' + f(j.slFinal) : '') + ' / ' + f(j.tp) + '</span>') +
      row('Menge', App.fmtQ(j.qty)) +
      row('Punkte', '<span class="num">' + (j.points >= 0 ? '+' : '') + App.fmtN(j.points, dec) + '</span> · Gebühren ' + App.fmtMoney(j.fees)) +
      row('MAE / MFE', '<span class="num">' + f(j.mae) + ' / ' + f(j.mfe) + '</span>' + (j.maeR != null ? ' (' + App.fmtN(j.maeR, 2) + 'R / ' + App.fmtN(j.mfeR, 2) + 'R)' : '')) +
      '</dl>' + parts +
      '<div class="grid2"><label class="fld"><span>Strategie</span><select data-f="setup" data-strat></select></label><label class="fld"><span>Grund / Notiz</span><input data-f="note" maxlength="600" value="' + esc(j.note) + '"></label></div>' +
      '<div class="fld"><span>Fotos</span><div class="ph-drop" id="tdPhotos"></div></div>';
    App.renderStratSelects();
    const ss = $('#tdBody [data-f="setup"]');
    if (j.setup && !App.strategies.some((s) => s.name === j.setup)) ss.insertAdjacentHTML('beforeend', '<option value="' + esc(j.setup) + '">' + esc(j.setup) + '</option>');
    ss.value = j.setup || '';
    openModal('#tradeModal');
    await Gallery.render($('#tdPhotos'), j.id);
  },

  /* ---------- Statistik ---------- */
  statsList() {
    const f = App.settings.statsFilter, J = App.visibleJournal();
    return J.filter((j) => f === 'all' || (f === 'sym' && j.sym === App.symbol) || (f === 'replay' && j.replay === App.replay.id) || (f.startsWith('setup:') && j.setup === f.slice(6)) || (f.startsWith('sess:') && String(j.replay) === f.slice(5)));
  },
  fillStatsFilter() {
    const sel = $('#sFilter'), J = App.visibleJournal();
    const setups = [...new Set(J.map((j) => j.setup).filter(Boolean))];
    const rs = [...new Set(J.map((j) => j.replay))].reverse().slice(0, 40);
    const opts = [['all', 'Alle Trades'], ['sym', 'Nur ' + (App.symbol || 'Symbol')]].concat(App.replay.active ? [['replay', 'Laufende Session']] : []).concat(setups.map((s) => ['setup:' + s, 'Strategie: ' + s])).concat(rs.map((r) => ['sess:' + r, 'Session: ' + this.sessLabel(r)]));
    sel.innerHTML = opts.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('');
    if (!opts.some((o) => o[0] === App.settings.statsFilter)) App.settings.statsFilter = 'all';
    sel.value = App.settings.statsFilter;
  },
  renderStats() {
    this.fillStatsFilter();
    const list = this.statsList();
    const s = Core.stats(list, App.settings.account.start);
    const el = $('#statsBody');
    if (this._mc) this._mc.cancel = true;
    if (!s.n) {
      el.innerHTML = App.journal.length ? emptyState('stats', 'Keine Trades für diese Auswahl', 'Wähle oben „Alle Trades“ oder eine andere Session.', '')
        : emptyState('stats', 'Noch nichts auszuwerten', 'Nach ein paar Trades siehst du hier Kontokurve, Trefferquote, Profit-Faktor, R-Verteilung, MAE/MFE, Kalender und eine Monte-Carlo-Simulation für Prop-Challenges.', '<button class="btn primary" data-empty="session">Session starten</button>');
      return;
    }
    const pf = s.pf === Infinity ? '∞' : App.fmtN(s.pf, 2);
    const kpi = (l, v, cls, hint) => '<div class="kpi"' + (hint ? ' title="' + esc(hint) + '"' : '') + '><span>' + l + '</span><b class="num ' + (cls || '') + '">' + v + '</b></div>';
    let html = '<div class="kpis">' +
      kpi('Netto', App.fmtMoney(s.net, true), s.net >= 0 ? 'up' : 'dn') +
      kpi('Trades', s.n + ' <small>' + s.wins + ' G / ' + s.losses + ' V' + (s.be ? ' / ' + s.be + ' BE' : '') + '</small>') +
      kpi('Trefferquote ' + Tips.btn('winrate'), App.fmtPct(s.winRate)) +
      kpi('Profit-Faktor ' + Tips.btn('pf'), pf, s.pf >= 1 ? 'up' : 'dn') +
      kpi('Ø R ' + Tips.btn('r'), s.avgR == null ? '–' : App.fmtR(s.avgR), s.avgR >= 0 ? 'up' : 'dn') +
      kpi('Erwartung', App.fmtMoney(s.expectancy, true), s.expectancy >= 0 ? 'up' : 'dn', 'Netto-Ergebnis pro Trade') +
      kpi('Max. Drawdown', App.fmtMoney(-s.maxDD) + ' <small>' + App.fmtPct(s.maxDDPct) + '</small>', 'dn', 'Größter Rückgang vom Hoch der Kontokurve (abgeschlossene Trades)') +
      kpi('Ø Gewinn / Verlust', App.fmtMoney(s.avgWin) + ' / ' + App.fmtMoney(s.avgLoss)) +
      kpi('Payoff', s.payoff == null ? '–' : App.fmtN(s.payoff, 2), '', 'Ø Gewinn ÷ Ø Verlust') +
      kpi('Verlustserie', s.maxLossStreak + ' <small>max.</small>') +
      kpi('Gebühren', App.fmtMoney(-s.fees)) +
      kpi('Ø Haltedauer', App.fmtDur(s.avgHold)) + '</div>';
    html += '<div class="st-grid">';
    html += '<div class="card" style="grid-column:1/-1"><h3>Kontokurve</h3><canvas id="eqCanvas" height="200" aria-label="Kontokurve"></canvas></div>';
    html += '<div class="card"><h3>Monte-Carlo: Prop-Challenge</h3><p class="hint">2.000 Durchläufe, Trades zufällig neu gezogen (mit Zurücklegen), gleiche Anzahl Trades pro Tag wie im Original. Regeln aus den Einstellungen.</p><div class="mc-out" id="mcOut"><div><span>Rechne …</span><b>–</b></div></div><canvas id="mcCanvas" height="130" aria-label="Verteilung Max-Drawdown"></canvas></div>';
    html += '<div class="card"><h3>R-Verteilung</h3><p class="hint">Ergebnis je Trade in R (netto).</p><canvas id="rCanvas" height="170" aria-label="R-Histogramm"></canvas></div>';
    html += '<div class="card"><h3>MAE / MFE ' + Tips.btn('mae') + '</h3><p class="hint">Wie weit lief jeder Trade gegen dich (MAE) und für dich (MFE), in R. Grün = Gewinner.</p><canvas id="maeCanvas" height="220" aria-label="MAE-MFE-Streudiagramm"></canvas></div>';
    html += '<div class="card"><h3>Kalender</h3><p class="hint">Tagesergebnis nach Ausstiegstag' + (App.isBlind() ? ' – die laufende Blind-Session ist ausgeblendet' : '') + '.</p><div class="cal" id="calBox"></div></div>';
    const pct = (w, n) => n ? App.fmtPct(w / n * 100, 0) : '–';
    const grp = (title, fn, sort) => {
      const g = Core.groupStats(list, fn); if (!g.length) return '';
      g.sort(sort || ((a, b) => b.net - a.net));
      return '<div class="card"><h3>' + title + '</h3><div class="tbl-wrap"><table class="tbl"><tr><th></th><th>Trades</th><th>Treffer</th><th>Ø R</th><th>Netto</th></tr>' + g.map((e) => '<tr><td>' + esc(e.k) + '</td><td>' + e.n + '</td><td>' + pct(e.w, e.n) + '</td><td class="' + (e.sumR >= 0 ? 'up' : 'dn') + '">' + (e.nR ? App.fmtR(e.sumR / e.nR) : '–') + '</td><td class="' + (e.net >= 0 ? 'up' : 'dn') + '">' + App.fmtMoney(e.net, true) + '</td></tr>').join('') + '</table></div></div>';
    };
    html += '<div class="card"><h3>Long vs. Short</h3><table class="tbl"><tr><th></th><th>Trades</th><th>Treffer</th></tr><tr><td class="up">Long</td><td>' + s.longN + '</td><td>' + pct(s.longW, s.longN) + '</td></tr><tr><td class="dn">Short</td><td>' + s.shortN + '</td><td>' + pct(s.shortW, s.shortN) + '</td></tr></table></div>';
    html += grp('Nach Strategie', (x) => x.setup || '(ohne)');
    html += grp('Nach Uhrzeit (' + App.settings.tz.split('/').pop().replace('_', ' ') + ')', (x) => String(Core.localParts(x.entryT, App.settings.tz).h).padStart(2, '0') + ':00', (a, b) => a.k < b.k ? -1 : 1);
    const blindR = App.isBlind() ? App.replay.id : null;
    html += grp('Nach Wochentag', (x) => x.replay === blindR ? 'verborgen' : WD[Core.localParts(x.entryT, App.settings.tz).wd], (a, b) => ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So', 'verborgen'].indexOf(a.k) - ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So', 'verborgen'].indexOf(b.k));
    html += grp('Nach Markt', (x) => x.sym);
    if (App.settings.prop.on) {
      const ps = Core.propBySession(list, App.propCfg(), App.sess).reverse().slice(0, 30);
      html += '<div class="card"><h3>Prop-Regeln je Session</h3><p class="hint">Jede Session als eigenes Konto geprüft.</p><div class="tbl-wrap"><table class="tbl"><tr><th>Session</th><th>Trades</th><th>Netto</th><th>Status</th></tr>' +
        ps.map((p) => '<tr><td>' + esc(this.sessLabel(p.replay)) + '</td><td>' + p.n + '</td><td class="' + (p.net >= 0 ? 'up' : 'dn') + '">' + App.fmtMoney(p.net, true) + '</td><td class="' + (p.breaches.length ? 'dn' : p.passed ? 'up' : '') + '">' + (p.breaches.length ? esc(p.breaches[0].type) : p.passed ? 'Ziel erreicht' : 'offen') + '</td></tr>').join('') + '</table></div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
    Tips.decorate(el);
    this.drawEquity($('#eqCanvas'), s.equity);
    this.drawRHist($('#rCanvas'), list);
    this.drawMae($('#maeCanvas'), list);
    this.renderCalendar($('#calBox'), list.filter((j) => j.replay !== blindR));
    this.runMonteCarlo(list);
  },
  canvasCtx(cv, H) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(100, r.width);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.panel; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  },
  drawEquity(cv, eq) {
    const { ctx, W, H } = this.canvasCtx(cv, 200);
    if (eq.length < 2) return;
    let lo = Infinity, hi = -Infinity; for (const p of eq) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
    if (hi === lo) { hi += 1; lo -= 1; }
    const padL = 92, pad = 10, x = (i) => padL + i / (eq.length - 1) * (W - padL - pad), y = (v) => pad + (hi - v) / (hi - lo) * (H - pad * 2);
    const start = eq[0].v;
    ctx.strokeStyle = COL.line; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(padL, y(start)); ctx.lineTo(W - pad, y(start)); ctx.stroke(); ctx.setLineDash([]);
    const col = eq[eq.length - 1].v >= start ? COL.bull : COL.bear;
    ctx.beginPath(); eq.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v))));
    ctx.lineTo(x(eq.length - 1), H - pad); ctx.lineTo(x(0), H - pad); ctx.closePath();
    ctx.fillStyle = alpha(col, 0.12); ctx.fill();
    ctx.beginPath(); eq.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v))));
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x(eq.length - 1), y(eq[eq.length - 1].v), 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.muted; ctx.font = '11px ' + FONT_MONO; ctx.textBaseline = 'middle';
    ctx.fillText(App.fmtMoney(hi), 6, y(hi)); ctx.fillText(App.fmtMoney(lo), 6, y(lo));
    if (Math.abs(y(start) - y(hi)) > 16 && Math.abs(y(start) - y(lo)) > 16) ctx.fillText(App.fmtMoney(start), 6, y(start));
    ctx.textBaseline = 'alphabetic';
  },
  hist(cv, H, counts, labels, colors, hiIdx) {
    const { ctx, W } = this.canvasCtx(cv, H);
    const mx = Math.max(1, ...counts), n = counts.length, pb = 18, pt = 8;
    const bw = (W - 16) / n;
    counts.forEach((c, i) => {
      const h = c / mx * (H - pb - pt);
      ctx.fillStyle = colors(i); ctx.fillRect(8 + i * bw + 1, H - pb - h, Math.max(1, bw - 2), h);
    });
    ctx.fillStyle = COL.muted; ctx.font = '10.5px ' + FONT_MONO; ctx.textAlign = 'center';
    let lastX = -1e9;
    labels.forEach((l, i) => { if (l == null) return; const x = 8 + i * bw; if (x - lastX < 40) return; lastX = x; ctx.fillText(l, x, H - 5); });
    ctx.fillStyle = COL.faint; ctx.textAlign = 'right'; ctx.fillText(String(mx), W - 6, pt + 8);
    if (hiIdx != null) { ctx.strokeStyle = COL.accent; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(8 + hiIdx * bw, pt); ctx.lineTo(8 + hiIdx * bw, H - pb); ctx.stroke(); ctx.setLineDash([]); }
    ctx.textAlign = 'left';
  },
  drawRHist(cv, list) {
    const rs = list.map((j) => j.r).filter((r) => r != null && isFinite(r));
    if (!rs.length) { this.canvasCtx(cv, 170); return; }
    const lo = Math.max(-4, Math.floor(Math.min(...rs) * 2) / 2), hi = Math.min(8, Math.ceil(Math.max(...rs) * 2) / 2 + 0.5);
    const bins = []; for (let b = lo; b < hi - 1e-9; b += 0.5) bins.push(b);
    const counts = bins.map(() => 0);
    for (const r of rs) { const k = Math.max(0, Math.min(bins.length - 1, Math.floor((Math.max(lo, Math.min(hi - 0.01, r)) - lo) / 0.5))); counts[k]++; }
    this.hist(cv, 170, counts, bins.map((b) => (Number.isInteger(b) ? (b > 0 ? '+' : b < 0 ? '−' : '') + Math.abs(b) + 'R' : null)), (i) => alpha(bins[i] >= 0 ? COL.bull : COL.bear, 0.75));
  },
  drawMae(cv, list) {
    const { ctx, W, H } = this.canvasCtx(cv, 220);
    const pts = list.filter((j) => j.maeR != null && j.mfeR != null);
    const pad = 34;
    const mxX = Math.max(1.5, ...pts.map((j) => Math.min(5, j.maeR))), mxY = Math.max(2, ...pts.map((j) => Math.min(10, j.mfeR)));
    const x = (v) => pad + Math.min(v, mxX) / mxX * (W - pad - 10), y = (v) => H - pad + 10 - Math.min(v, mxY) / mxY * (H - pad - 10);
    ctx.strokeStyle = COL.line; ctx.beginPath(); ctx.moveTo(pad, 6); ctx.lineTo(pad, H - pad + 10); ctx.lineTo(W - 6, H - pad + 10); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = alpha(COL.bear, 0.6); ctx.beginPath(); ctx.moveTo(x(1), 6); ctx.lineTo(x(1), H - pad + 10); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.muted; ctx.font = '10.5px ' + FONT_MONO;
    ctx.fillText('MAE (R) →', W - 80, H - 6); ctx.save(); ctx.translate(11, 70); ctx.rotate(-Math.PI / 2); ctx.fillText('MFE (R) →', 0, 0); ctx.restore();
    ctx.fillText('1R', x(1) + 3, 16);
    for (const j of pts) { ctx.fillStyle = alpha(j.pnl > 0 ? COL.bull : COL.bear, 0.8); ctx.beginPath(); ctx.arc(x(j.maeR), y(j.mfeR), 3.5, 0, Math.PI * 2); ctx.fill(); }
  },
  renderCalendar(el, list) {
    const m = Core.dailyPnl(list, App.settings.tz);
    if (!m.size) { el.innerHTML = '<p class="empty">Keine Tage.</p>'; return; }
    const keys = [...m.keys()].sort();
    const months = [...new Set(keys.map((k) => k.slice(0, 7)))].slice(-3).reverse();
    const mx = Math.max(1, ...[...m.values()].map((e) => Math.abs(e.pnl)));
    const MN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    el.innerHTML = months.map((ym) => {
      const y = +ym.slice(0, 4), mo = +ym.slice(5, 7);
      const first = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7, dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      let cells = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => '<span>' + d + '</span>').join('');
      for (let i = 0; i < first; i++) cells += '<i class="e"></i>';
      for (let d = 1; d <= dim; d++) {
        const e = m.get(ym + '-' + String(d).padStart(2, '0'));
        if (!e) { cells += '<i>' + d + '</i>'; continue; }
        const a = 0.18 + 0.62 * Math.min(1, Math.abs(e.pnl) / mx);
        cells += '<i style="background:' + alpha(e.pnl >= 0 ? COL.bull : COL.bear, a) + ';color:#fff" title="' + esc(d + '.' + mo + '.: ' + App.fmtMoney(e.pnl, true) + ' · ' + e.n + ' Trades') + '">' + d + '</i>';
      }
      return '<div class="cal-m"><h4>' + MN[mo - 1] + ' ' + y + '</h4><div class="cal-g">' + cells + '</div></div>';
    }).join('');
  },
  /* Monte-Carlo in Häppchen, damit die Oberfläche flüssig bleibt */
  runMonteCarlo(list) {
    const P = App.settings.prop;
    const cl = list.filter((j) => j.status === 'closed');
    const pnls = cl.slice().sort((a, b) => a.exitT - b.exitT).map((j) => j.pnl);
    const out = $('#mcOut'), cv = $('#mcCanvas');
    if (pnls.length < 5) { out.innerHTML = '<p class="hint">Mindestens 5 Trades nötig.</p>'; cv.hidden = true; return; }
    const sess = cl[0].sess || App.sess;
    const days = Core.dayCounts(cl, sess);
    const st = Core.mcInit(pnls, days, { start: App.settings.account.start, maxDD: +P.maxDD || 0, dailyLoss: +P.dailyLoss || 0, target: +P.target || 0 }, 2000);
    const job = { cancel: false }; this._mc = job;
    const step = () => {
      if (job.cancel) return;
      const done = Core.mcStep(st, 250);
      const r = Core.mcResult(st);
      out.innerHTML = '<div><span>Ziel vor Max-DD</span><b class="' + (r.pPass >= 0.5 ? 'up' : 'dn') + '">' + App.fmtPct(r.pPass * 100) + '</b></div>' +
        '<div><span>Regel verletzt</span><b class="dn">' + App.fmtPct(r.pFail * 100) + '</b></div>' +
        '<div><span>Max-DD Median</span><b>' + App.fmtMoney(-r.ddMedian) + '</b></div>' +
        '<div><span>Max-DD 95 %</span><b class="dn">' + App.fmtMoney(-r.dd95) + '</b></div>' +
        '<div><span>Verlustserie 95 %</span><b>' + App.fmtN(r.streak95, 0) + '</b></div>' +
        '<div><span>Läufe</span><b>' + r.runs.toLocaleString('de-DE') + '</b></div>';
      const bins = r.hist.length, w = r.histMax / bins;
      const k95 = Math.min(bins - 1, Math.floor(r.dd95 / r.histMax * bins));
      this.hist(cv, 130, r.hist, r.hist.map((_, i) => '−' + App.fmtN(i * w / 1000, 1) + 'k'), (i) => alpha(i >= k95 ? COL.bear : COL.info, 0.7), k95);
      if (!done) setTimeout(step, 0);
    };
    step();
  },

  /* ---------- Seiten-Bindungen ---------- */
  bindPages() {
    const jf = (id, k) => $(id).addEventListener('change', (e) => { this.idFilter = null; App.settings.jf[k] = e.target.value; App.saveSettings(); this.renderJournal(); });
    $('#jIdFilter').addEventListener('click', (e) => { if (e.target.closest('#jIdClear')) { this.idFilter = null; this.renderJournal(); } });
    jf('#jfSym', 'sym'); jf('#jfStrat', 'strat'); jf('#jfRes', 'res'); jf('#jfSess', 'sess');
    $('#jTable').addEventListener('click', (e) => { const r = e.target.closest('.jrow'); if (r) this.openTrade(r.dataset.id); });
    /* Knöpfe in leeren Zuständen */
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-empty]'); if (!b) return;
      const a = b.dataset.empty;
      if (a === 'session') NewSess.open();
      else if (a === 'strat') App.addStrategy();
      else if (a === 'reset') { App.settings.jf = { sym: '', strat: '', res: '', sess: '' }; App.saveSettings(); this.renderJournal(); }
    });
    $('#jTable').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = e.target.closest('.jrow'); if (r) this.openTrade(r.dataset.id); } });
    $('#tdBody').addEventListener('change', (e) => {
      const f = e.target.dataset.f; const j = this._trade; if (!f || !j) return;
      j[f] = e.target.value.trim(); App.saveJournal();
      if (App.view === 'journal') this.renderJournal();
    });
    $('#tdShow').addEventListener('click', () => { const j = this._trade; closeModal('#tradeModal'); if (j) this.showTrade(j); });
    $('#tdDel').addEventListener('click', () => {
      const j = this._trade; if (!j) return;
      const pos = App.journal.indexOf(j); if (pos < 0) return;
      App.journal.splice(pos, 1); App.saveJournal();
      closeModal('#tradeModal'); this.refreshAfterJournal();
      /* Fotos erst endgültig löschen, wenn „Rückgängig“ abgelaufen ist */
      App.undoToast('Trade gelöscht.', () => {
        App.journal.splice(Math.min(pos, App.journal.length), 0, j); App.saveJournal(); this.refreshAfterJournal();
        App.toast('Trade wiederhergestellt.', 'good');
      }, () => { Photos.delOwner(j.id).catch(() => {}); });
    });
    $('#jBackupBtn').addEventListener('click', (e) => { const m = $('#jBackupMenu'); m.hidden = !m.hidden; e.currentTarget.setAttribute('aria-expanded', String(!m.hidden)); });
    document.addEventListener('pointerdown', (e) => { const m = $('#jBackupMenu'); if (!m.hidden && !e.target.closest('#jBackupMenu') && !e.target.closest('#jBackupBtn')) { m.hidden = true; $('#jBackupBtn').setAttribute('aria-expanded', 'false'); } });
    $('#jBackupMenu').addEventListener('click', (e) => { if (e.target.closest('button.mi')) { $('#jBackupMenu').hidden = true; $('#jBackupBtn').setAttribute('aria-expanded', 'false'); } });
    $('#jCsv').addEventListener('click', () => { if (!App.blindExportBlocked()) App.download('edge-lab-trades.csv', App.journalCSV(this.journalList()), 'text/csv'); });
    $('#jCopy').addEventListener('click', () => { if (!App.blindExportBlocked()) { App.copy(JSON.stringify(this.backup(), null, 1)); App.markBackup(); } });
    $('#jFile').addEventListener('click', (e) => this.backupFile(e.currentTarget));
    const imp = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const n = await this.importBackup(JSON.parse(await Loader.readFile(f))); App.toast(n.t + ' Trades' + (n.p ? ', ' + n.p + ' Fotos' : '') + ' importiert.', 'good'); }
      catch (err) { App.toast('Import fehlgeschlagen: Die Datei ist keine gültige Edge-Lab-Sicherung (.json).', 'bad'); }
      e.target.value = '';
    };
    $('#jImport').addEventListener('change', imp);
    $('#setImport').addEventListener('change', imp);
    $('#setBackup').addEventListener('click', (e) => this.backupFile(e.currentTarget));
    $('#jClear').addEventListener('click', async () => {
      if (!App.journal.length) return;
      if (await App.confirm('Ganzes Journal löschen?', 'Alle ' + App.journal.length + ' Trades werden entfernt. Mache vorher am besten eine Sicherung.', 'Alles löschen')) {
        for (const j of App.journal) { try { await Photos.delOwner(j.id); } catch (_) { /* egal */ } }
        App.journal = []; App.saveJournal(); this.renderJournal(); App.updatePanels(); App.requestRender();
      }
    });
    $('#btnNewSess').addEventListener('click', () => NewSess.open());
    $('#nNew').addEventListener('click', () => App.openSession({}));
    $('#nFilter').addEventListener('change', () => App.renderNotes());
    $('#notesBody').addEventListener('click', (e) => { const a = e.target.closest('.sess'); if (a) App.openSession({ id: a.dataset.id }); });
    $('#notesBody').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const a = e.target.closest('.sess'); if (a) App.openSession({ id: a.dataset.id }); } });
    $('#sFilter').addEventListener('change', (e) => { App.settings.statsFilter = e.target.value; App.saveSettings(); this.renderStats(); });
    $('#stratAdd').addEventListener('click', () => App.addStrategy());
    $('#stratList').addEventListener('change', (e) => { const k = e.target.dataset.k; const c = e.target.closest('.strat-card'); if (k && c) App.editStrategy(c.dataset.id, k, e.target.value); });
    $('#stratList').addEventListener('click', (e) => { const b = e.target.closest('[data-act="del"]'); if (b) App.deleteStrategy(b.closest('.strat-card').dataset.id); });
    $('#tvSyms').addEventListener('click', (e) => { const b = e.target.closest('[data-sym]'); if (b) { $('#tvSym').value = b.dataset.sym; TV.load(); } });
    $('#tvGo').addEventListener('click', () => TV.load());
    $('#tvSym').addEventListener('keydown', (e) => { if (e.key === 'Enter') TV.load(); });
    $('#tvInt').addEventListener('change', () => TV.load());
  },
  backup() { return { app: 'edge-lab-replay', v: 3, trades: App.journal, sessions: App.sessions, strategies: App.strategies }; },
  async backupFile(btn) {
    if (App.blindExportBlocked()) return;
    setBusy(btn, true);
    try {
      const b = this.backup();
      try { b.photos = await Photos.exportAll(); } catch (_) { b.photos = []; }
      App.download('edge-lab-sicherung-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(b), 'application/json');
      App.markBackup();
      App.toast('Sicherung mit ' + b.trades.length + ' Trades und ' + b.photos.length + ' Fotos erstellt.', 'good');
      if (App.view === 'start') App.renderStart();
      this.fillStorage();
    } finally { setBusy(btn, false); }
  },
  refreshAfterJournal() {
    if (App.view === 'journal') this.renderJournal();
    if (App.view === 'start') App.renderStart();
    if (App.view === 'stats') this.renderStats();
    App.updatePanels(); App.requestRender();
  },
  openHelp(tab) {
    const gl = $('#glossList');
    if (!gl.children.length) gl.innerHTML = Object.values(GLOSSARY).map((g) => '<dt>' + esc(g[0]) + '</dt><dd>' + esc(g[1]) + '</dd>').join('');
    selectTab($('#helpTabs'), tab || (matchMedia('(pointer: coarse)').matches ? 'touch' : 'ablauf'));
    openModal('#helpModal');
  },
  async fillStorage() {
    $('#storMode').textContent = Store.mode === 'idb' ? 'Browser-Datenbank (IndexedDB)' : 'localStorage (Rückfall – max. ca. 5 MB)';
    const b = App.lastBackup();
    $('#storBackup').textContent = b.t ? App.fmtDate(b.t / 1000) + ' · ' + b.n + ' Trades' : 'noch nie';
    const per = await Store.persisted();
    $('#storPersist').textContent = per == null ? 'nicht unterstützt' : per ? 'ja – der Browser löscht die Daten nicht automatisch' : 'nein – bei Speichermangel könnte der Browser aufräumen';
    const est = await Store.estimate();
    if (est && est.quota) {
      const mb = (x) => App.fmtN(x / 1048576, x < 10485760 ? 1 : 0) + ' MB';
      $('#storBar').style.width = Math.max(1, Math.min(100, est.usage / est.quota * 100)).toFixed(1) + '%';
      $('#storTxt').textContent = mb(est.usage || 0) + ' von ' + (est.quota > 1073741824 ? App.fmtN(est.quota / 1073741824, 1) + ' GB' : mb(est.quota)) + ' genutzt · ' + App.journal.length + ' Trades, ' + App.sessions.length + ' Sessions';
    } else $('#storTxt').textContent = 'Speicherangabe in diesem Browser nicht verfügbar · ' + App.journal.length + ' Trades';
  },
  /* Import mit Prüfung: ungültige Einträge werden verworfen (mit Hinweis) */
  async importBackup(d) {
    if (!d || typeof d !== 'object') throw new Error('keine Sicherung');
    const tr = Array.isArray(d) ? d : Array.isArray(d.trades) ? d.trades : [];
    const fin = (x) => typeof x === 'number' && isFinite(x);
    const okTrade = (t) => t && typeof t === 'object' && t.id != null && fin(t.entryT) && fin(t.exitT) && (t.side === 1 || t.side === -1) && fin(t.pnl) && fin(t.entryPrice) && typeof t.sym === 'string';
    const okSess = (s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id && (s.created == null || fin(s.created)) && (s.from == null || fin(s.from)) && (s.to == null || fin(s.to));
    const have = new Set(App.journal.map((x) => x.id));
    let n = 0, bad = 0;
    for (const t of tr) { if (!okTrade(t)) { bad++; continue; } if (!have.has(t.id)) { App.journal.push(t); have.add(t.id); n++; } }
    if (Array.isArray(d.sessions)) {
      const hs = new Set(App.sessions.map((x) => x.id));
      for (const s of d.sessions) {
        if (!okSess(s)) { bad++; continue; }
        if (hs.has(s.id)) continue;
        App.sessions.push(Object.assign({ created: Math.floor(Date.now() / 1000), discipline: 0, mistakes: [], result: 'auto' }, s, { running: false, mistakes: Array.isArray(s.mistakes) ? s.mistakes.filter((m) => typeof m === 'string') : [], discipline: Math.max(0, Math.min(5, +s.discipline || 0)) }));
        hs.add(s.id);
      }
      App.saveSessions();
    }
    if (Array.isArray(d.strategies)) {
      for (const s of d.strategies) {
        if (!s || typeof s.name !== 'string' || !s.name.trim()) { bad++; continue; }
        if (App.strategies.some((x) => x.name === s.name)) continue;
        /* eigene ID vergeben, falls sie schon belegt ist (z. B. „s1“ nach Umbenennen) */
        const id = s.id && !App.strategies.some((x) => x.id === s.id) ? s.id : 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        App.strategies.push(Object.assign({}, s, { id, desc: String(s.desc || ''), rules: String(s.rules || '') }));
      }
      App.saveStrategies();
    }
    if (bad) App.toast(bad + ' ungültige Einträge in der Sicherung wurden übersprungen.', 'warn');
    let p = 0;
    if (d.photos && Photos.ok) p = await Photos.importAll(d.photos);
    App.saveJournal(); this.refreshAfterJournal();
    return { t: n, p };
  },

  fillDataModal() {
    const B = App.settings.binance;
    $('#bnMarket').value = B.market; $('#bnSymbol').value = B.symbol; $('#bnInterval').value = B.interval; $('#bnDays').value = B.days;
    $('#csvInst').innerHTML = Object.entries(Core.INSTRUMENTS).map(([k, v]) => '<option value="' + k + '">' + esc(v.name) + '</option>').join('');
    $('#csvInst').value = App.settings.inst || 'NQ';
    this.instHint();
    const ar = $('#arInst');
    const fill = () => {
      const list = Archive.index ? Archive.index.instruments : Archive.DEFAULT;
      ar.innerHTML = list.map((i) => '<option value="' + esc(i.id) + '">' + esc(i.id + ' – ' + i.name) + '</option>').join('');
      const inst = Archive.inst(ar.value);
      if (inst && inst.months && inst.months.length && !$('#arFrom').value) {
        const last = inst.months[inst.months.length - 1];
        $('#arFrom').value = last + '-01'; $('#arTo').value = last + '-07';
      }
    };
    fill();
    $('#arStatus').textContent = ''; $('#arStatus').className = 'status';
    Archive.loadIndex().then(fill).catch((e) => { $('#arStatus').textContent = e.message; $('#arStatus').className = 'status warn'; });
  },
  instHint() {
    const i = Core.INSTRUMENTS[$('#csvInst').value];
    $('#csvInstHint').textContent = 'Tick ' + App.fmtN(i.tick, Core.decimalsOf(i.tick)) + ' · ' + App.fmtN(i.pv, i.pv % 1 ? 1 : 0) + ' $ pro Punkt · Session-Start ' + String(i.sess.hour).padStart(2, '0') + ':00 ' + i.sess.tz.replace('America/New_York', 'New York');
  },
  bindModals() {
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]'); if (c) { closeModal('#' + c.closest('.modal').id); return; }
      if (e.target.classList && e.target.classList.contains('modal') && e.target.id !== 'confirmModal') closeModal('#' + e.target.id);
    });
    $('#dataTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#dataTabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $$('.dpanel').forEach((p) => { p.hidden = p.id !== 'dp-' + b.dataset.p; });
    });
    $('#arLoad').addEventListener('click', () => Loader.archive());
    $('#arCancel').addEventListener('click', () => Loader.cancel());
    $('#bnLoad').addEventListener('click', () => Loader.binance());
    $('#dlCancel').addEventListener('click', () => Loader.cancel());
    $('#csvLoad').addEventListener('click', () => Loader.csv());
    $('#csvInst').addEventListener('change', () => this.instHint());
    $('#demoLoad').addEventListener('click', () => Loader.demo(false));
    $('#trLoad').addEventListener('click', () => Loader.binanceTrades());
    $('#trCancel').addEventListener('click', () => Loader.cancel());
    $('#nsMarket').addEventListener('change', () => NewSess.onMarket());
    $('#nsBnMarket').addEventListener('change', () => NewSess.onMarket());
    $('#nsDate').addEventListener('change', () => { $$('input[name="nsWhen"]').forEach((r) => { r.checked = r.value === 'date'; }); });
    $('#nsGo').addEventListener('click', () => NewSess.go());
    $('#nsCancel').addEventListener('click', () => NewSess.cancel());
    $('#setSave').addEventListener('click', () => this.saveSettingsForm());
    $('#setReset').addEventListener('click', async () => {
      if (await App.confirm('Einstellungen zurücksetzen?', 'Alle Einstellungen gehen auf Standard. Journal, Notizen, Fotos und Zeichnungen bleiben.', 'Zurücksetzen')) {
        App.settings = freshDefaults(); App.saveSettings(); closeModal('#settingsModal');
        this.fillTicket(); this.fillReplayControls(); App.buildCharts(); App.recompute(); App.applyCostProfile(); App.updateHeader(); App.updateReplayBar(); App.updatePanels(); App.requestRender();
        App.toast('Einstellungen zurückgesetzt.', 'good');
      }
    });
    $('#sessForm').addEventListener('submit', (e) => { e.preventDefault(); App.saveSessionForm(); });
    $('#sessDelete').addEventListener('click', () => App.deleteSession());
    $('#lbPrev').addEventListener('click', () => Lightbox.step(-1));
    $('#lbNext').addEventListener('click', () => Lightbox.step(1));
    $('#lbDel').addEventListener('click', () => Lightbox.del());
    bindTabs($('#setTabs'), (t) => { if (t === 'daten') this.fillStorage(); if (t === 'sync' && typeof Sync !== 'undefined') Sync.renderPanel(); });
    bindTabs($('#helpTabs'));
    $('#setInstall').addEventListener('click', () => Install.prompt());
    $('#setOnboard').addEventListener('click', () => { closeModal('#settingsModal'); Onboard.open(); });
    $('#setHelp').addEventListener('click', () => { closeModal('#settingsModal'); this.openHelp(); });
    $('#helpOnboard').addEventListener('click', () => { closeModal('#helpModal'); Onboard.open(); });
  },
  openSettings(tab) {
    this.fillSettings(); selectTab($('#setTabs'), tab || 'konto'); this.fillStorage(); Install.sync(); if (typeof Sync !== 'undefined') Sync.renderPanel(); openModal('#settingsModal');
    const st = $('#setTabs [aria-selected="true"]'); if (st && st.scrollIntoView) st.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  fillSettings() {
    for (const el of $$('#settingsModal [data-s]')) {
      const v = getPath(App.settings, el.dataset.s);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    }
    $('#setBands').value = App.settings.vwapBands.join(', ');
  },
  saveSettingsForm() {
    const S = App.settings;
    const before = { cvd: S.cvdReset, tz: S.tz, va: S.vaPct };
    for (const el of $$('#settingsModal [data-s]')) {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') { v = parseFloat(el.value); if (!isFinite(v)) continue; if (el.min !== '' && v < +el.min) v = +el.min; if (el.max !== '' && v > +el.max) v = +el.max; }
      else v = el.value;
      setPath(S, el.dataset.s, v);
    }
    S.vwapBands = $('#setBands').value.split(/[;\s]+|,\s+/).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => x > 0 && x <= 5).slice(0, 3);
    S.emas.forEach((e) => { e.p = Math.max(1, Math.min(500, Math.round(e.p))); });
    App.saveSettings(); this.fillTicket(); this.fillReplayControls();
    if (before.cvd !== S.cvdReset) App.recompute();
    if (before.va !== S.vaPct) { App.profCache.clear(); App.prevCache.clear(); }
    App.emaCache.clear();
    App.applyCostProfile();
    closeModal('#settingsModal'); App.updateHeader(); App.updateReplayBar(); App.requestRender();
    App.toast('Einstellungen gespeichert.', 'good');
  },
  bindKeys() {
    document.addEventListener('keydown', (e) => {
      const t = e.target, tag = (t.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
      /* Zahlenfelder im Ticket: Enter/Esc verlassen das Feld, Buchstaben werden abgefangen */
      if (typing && t.hasAttribute && t.hasAttribute('data-num')) {
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); t.blur(); return; }
        if (e.key.length === 1 && /[a-zA-Z]/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); return; }
      }
      if (e.key === 'Escape') {
        const open = $$('.modal').filter((m) => !m.hidden);
        if (open.length) { const top = open[open.length - 1]; if (top.id === 'confirmModal') $('#cfCancel').click(); else closeModal('#' + top.id); return; }
        if (!$('#indMenu').hidden) { $('#indMenu').hidden = true; return; }
        if (!$('#jBackupMenu').hidden) { $('#jBackupMenu').hidden = true; $('#jBackupBtn').focus(); return; }
        if (document.body.classList.contains('sheet-open')) { Sheet.set(false); return; }
        if (App.posDraft) { App.cancelPosDraft(); return; }
        if (App.tool !== 'cursor') { App.draft = null; App.setTool('cursor'); return; }
        if (App.isFs()) { App.setFullscreen(false); return; }
        if (App.replay.picking) { App.togglePick(); return; }
        App.draft = null; App.selDrawing = null; App.requestRender(); return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if ($$('.modal').some((m) => !m.hidden)) {
        if (!$('#lightbox').hidden) { if (e.key === 'ArrowLeft') Lightbox.step(-1); if (e.key === 'ArrowRight') Lightbox.step(1); }
        return;
      }
      if (App.view !== 'charts') return;
      const k = e.key.toLowerCase();
      if (e.key === 'Enter' && App.posDraft) { e.preventDefault(); App.confirmPosDraft(); return; }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && App.selLine) { if (App.nudgeLine(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)) { e.preventDefault(); return; } }
      if (e.key === 'ArrowRight') { e.preventDefault(); if (e.shiftKey) App.advanceTo(App.cursor + 10); else App.stepOnce(); }
      else if (e.key === ' ') { e.preventDefault(); App.togglePlay(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (App.deleteSelected()) e.preventDefault(); }
      else if (k === 'b' && e.shiftKey) App.setTool('long');
      else if (k === 's' && e.shiftKey) App.setTool('short');
      else if (k === 'b') this.submit(1);
      else if (k === 's') this.submit(-1);
      else if (k === 'x') App.closeAll();
      else if (k === 'g') App.setFullscreen();
      else if (k === 'r') { if (!App.replay.active) App.togglePick(); }
      else if (k === 'h') App.setTool('hline');
      else if (k === 't') App.setTool('trend');
      else if (k === 'z') App.setTool('rect');
      else if (k === 'f') App.setTool('fib');
      else if (k === 'm') App.setTool('measure');
      else if (k === 'v') App.setTool('avwap');
      else if (k === 'p') App.setTool('price');
      else if (k === 'n' && App.replay.active) $('#btnSessNote').click();
      else if (k === '?') this.openHelp();
    });
  }
};

/* ---------- TradingView-Widget (wird erst beim Öffnen des Bereichs geladen) ---------- */
const TV = {
  loaded: false, timer: null,
  SRC: 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',
  open() { if (!this.loaded) { if (!$('#tvSym').value) $('#tvSym').value = 'CME_MINI:NQ1!'; this.load(); } },
  load() {
    const sym = ($('#tvSym').value.trim() || 'CME_MINI:NQ1!').toUpperCase();
    $('#tvSym').value = sym;
    $$('#tvSyms [data-sym]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sym === sym)));
    this.loaded = true;
    const host = $('#tvHost');
    host.innerHTML = '';
    clearTimeout(this.timer);
    const c = document.createElement('div');
    c.className = 'tradingview-widget-container';
    const w = document.createElement('div'); w.className = 'tradingview-widget-container__widget'; c.appendChild(w);
    const s = document.createElement('script');
    s.type = 'text/javascript'; s.async = true; s.src = this.SRC;
    s.textContent = JSON.stringify({ autosize: true, symbol: sym, interval: $('#tvInt').value, timezone: App.settings.tz, theme: 'dark', style: '1', locale: 'de_DE', backgroundColor: '#0b1018', gridColor: 'rgba(34, 48, 70, 0.6)', allow_symbol_change: true, calendar: false, support_host: 'https://www.tradingview.com' });
    s.onerror = () => this.fallback(sym);
    c.appendChild(s);
    host.appendChild(c);
    this.timer = setTimeout(() => { if (!host.querySelector('iframe')) this.fallback(sym); }, 9000);
  },
  fallback(sym) {
    clearTimeout(this.timer);
    const url = 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(sym);
    $('#tvHost').innerHTML = '<div class="tv-fallback" id="tvFallback"><h3>TradingView lässt sich hier nicht laden</h3><p class="help-p">In der Claude-Vorschau blockiert eine Sicherheitsregel externe Skripte. Auf deiner GitHub-Seite oder als heruntergeladene Datei erscheint der Chart hier direkt.</p><p><a class="btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(sym) + ' auf tradingview.com öffnen</a></p></div>';
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => UI.init()); else UI.init();

/* iOS/Android: Pinch-Zoom der ganzen Seite verhindern. Im Chart übernimmt die eigene Zwei-Finger-Geste. */
(function () {
  const stop = (e) => { e.preventDefault(); };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, stop, { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  /* Trackpad-Pinch (Strg+Mausrad) zoomt nie die Seite */
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
})();
