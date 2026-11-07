/* Edge Lab Replay — Pass: XP, Level, Belohnungen.
   XP gibt es nur für Prozess (Regeln, Notizen, Reflexion, Routine) – nie für Gewinn oder Verlust.
   Alles wird aus vorhandenen Daten berechnet; Journal, Sessions und Strategien bleiben unverändert.
   Gespeichert wird nur die Auswahl (Theme, Avatar, Titel) und der höchste erreichte Stand in App.settings.pass. */
'use strict';

/* ---------- Kern: reine Rechenlogik (ohne Browser, im Node-Test prüfbar) ---------- */
const PassCore = (() => {
  const XP = {
    trade: 4, tradeNote: 3, tradeSetup: 1, tradeStop: 1, tradesPerSession: 12,
    rulesMinTrades: 3, rulesAll: 40, rulesAllAt: 0.8, rulesHalf: 12, rulesHalfAt: 0.5,
    session: 30, discBase: 5, discStep: 2, good: 8, bad: 8, mistake: 3, mistakeMax: 2, sessNote: 4, blind: 5,
    day: 10, strategy: 15, strategyMax: 5, noteChars: 25, noteWords: 3
  };
  const STREAK_BONUS = [[3, 30], [7, 80], [14, 150], [30, 300]];
  /* Wochenziele: immer Prozess, nie „mehr Trades“. Jede Woche (Mo–So) kommen 3 davon, reihum und für alle Wochen gleich berechenbar. */
  const WEEK_XP = { goal: 40, all: 60 };
  const WEEK_POOL = [
    { id: 'checkliste', label: 'Checkliste ernst nehmen', desc: 'Sessions, in denen mindestens 80 % der Trades die Regel-Checkliste komplett erfüllen (ab 3 Trades)', target: 2, key: 'checklist' },
    { id: 'rueckblick', label: 'Ehrlich zurückblicken', desc: 'Sessions mit ausgefülltem „Was lief schlecht“', target: 2, key: 'review' },
    { id: 'disziplin', label: 'Disziplin bewerten', desc: 'Sessions mit eigener Disziplin-Bewertung', target: 3, key: 'disc' },
    { id: 'stopp', label: 'Stopp stehen lassen', desc: 'Sessions, in denen kein Stop weiter weggeschoben wurde', target: 2, key: 'stops' },
    { id: 'blind', label: 'Blind fliegen', desc: 'Eine Blind-Session auswerten', target: 1, key: 'blind' },
    { id: 'tage', label: 'Dranbleiben', desc: 'An verschiedenen Tagen gebacktestet – nicht am Stück nötig', target: 3, key: 'days' },
    { id: 'geduld', label: 'Geduld zahlt sich aus', desc: 'Eine Session mit 2 bis 6 Trades, alle mit komplett erfüllter Checkliste', target: 1, key: 'patience' }
  ];
  const weekOf = (dn) => Math.floor((dn + 3) / 7); /* Woche beginnt Montag */
  const goalsFor = (wk) => { const s = (wk * 3) % WEEK_POOL.length; return [0, 1, 2].map((i) => WEEK_POOL[(s + i) % WEEK_POOL.length]); };
  const LEVEL_MAX = 50, TRACK_MAX = 30;
  /* Gesamt-XP, die für Level n nötig sind (Level 30 ≈ 9.200 XP ≈ 42 gründliche Sessions) */
  const need = (n) => (n <= 1 ? 0 : Math.round(30 * Math.pow(n - 1, 1.7)));
  /* Text zählt nur, wenn er wirklich etwas sagt: Mindestlänge und mindestens 3 Wörter */
  const goodText = (s) => typeof s === 'string' && s.trim().length >= XP.noteChars && s.trim().split(/\s+/).length >= XP.noteWords;
  const levelOf = (xp) => { let n = 1; while (n < LEVEL_MAX && xp >= need(n + 1)) n++; return n; };

  const THEMES = {
    standard: { name: 'Standard', c: ['#0b1018', '#101722', '#e3ad3b'] },
    mitternacht: { name: 'Mitternacht', c: ['#080d1a', '#0d1424', '#5aa2ff'] },
    glut: { name: 'Glut', c: ['#130d0a', '#1a120e', '#f0913a'] },
    smaragd: { name: 'Smaragd', c: ['#08130f', '#0d1b16', '#3ec9a0'] },
    violett: { name: 'Violett', c: ['#0f0b18', '#151021', '#b48cff'] },
    graphit: { name: 'Graphit', c: ['#0c0c0d', '#131314', '#e8e8ea'] },
    nachtgold: { name: 'Nachtgold', c: ['#050505', '#0b0b0a', '#f4d35e'] }
  };
  /* Symbole auf 32×32, nur Linien – passend zum Rest der App */
  const AVATARS = {
    kerze: ['Kerze', '<path d="M16 4v6M16 21v7"/><rect x="11.5" y="10" width="9" height="11" rx="1"/>'],
    pfeil: ['Pfeil', '<path d="M9 23L23 9M12 9h11v11"/>'],
    welle: ['Welle', '<path d="M3 18c3-9 7-9 10 0s7 9 10 0 4-6 6-3"/>'],
    ziel: ['Ziel', '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5.5"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/>'],
    schild: ['Schild', '<path d="M16 4l10 4v8c0 6-5 10-10 12-5-2-10-6-10-12V8z"/>'],
    kompass: ['Kompass', '<circle cx="16" cy="16" r="11.5"/><path d="M16 8l3 8-3 8-3-8z"/>'],
    berg: ['Berg', '<path d="M3 26l10-16 5 8 3-4 8 12z"/>'],
    raute: ['Raute', '<path d="M16 3l13 13-13 13L3 16z"/><path d="M16 9l7 7-7 7-7-7z"/>'],
    anker: ['Anker', '<circle cx="16" cy="7" r="2.6"/><path d="M16 9.6V27M11 14h10M7 19c0 6 4 8 9 8s9-2 9-8"/>'],
    diamant: ['Diamant', '<path d="M9 6h14l6 8-13 14L3 14zM3 14h26M12 14l4 14 4-14M9 6l3 8 4-8 4 8 3-8"/>'],
    saeulen: ['Säulen', '<path d="M6 27V17M13 27V9M20 27V13M27 27V5"/>'],
    sechseck: ['Sechseck', '<path d="M16 3l11 6.5v13L16 29 5 22.5v-13z"/><path d="M16 10l5 3v6l-5 3-5-3v-6z"/>'],
    krone: ['Krone', '<path d="M5 24L7 11l6 6 3-9 3 9 6-6 2 13z"/><path d="M5 28h22"/>']
  };
  const FRAMES = { keiner: 'Ohne Rahmen', doppel: 'Doppelring', gestrichelt: 'Gestrichelt', kantig: 'Kantig' };
  const TITLES = {
    neuling: 'Neuling', beobachter: 'Beobachter', chartleser: 'Chartleser', konsequent: 'Konsequent', systemhaendler: 'Systemhändler',
    taktiker: 'Taktiker', routinier: 'Routinier', marktleser: 'Marktleser', architekt: 'Architekt', regelmeister: 'Regelmeister'
  };
  /* Belohnungs-Spur: Level 1–30, auf jedem Level etwas */
  const REWARDS = [
    [1, 'theme', 'standard'], [1, 'avatar', 'kerze'], [1, 'frame', 'keiner'], [1, 'title', 'neuling'],
    [2, 'avatar', 'pfeil'], [3, 'theme', 'mitternacht'], [4, 'title', 'beobachter'], [5, 'avatar', 'welle'],
    [6, 'frame', 'doppel'], [7, 'avatar', 'ziel'], [8, 'theme', 'glut'], [9, 'title', 'chartleser'],
    [10, 'avatar', 'schild'], [11, 'avatar', 'kompass'], [12, 'title', 'konsequent'], [13, 'frame', 'gestrichelt'],
    [14, 'theme', 'smaragd'], [15, 'avatar', 'berg'], [16, 'title', 'systemhaendler'], [17, 'avatar', 'raute'],
    [18, 'avatar', 'anker'], [19, 'frame', 'kantig'], [20, 'theme', 'violett'], [21, 'title', 'taktiker'],
    [22, 'avatar', 'diamant'], [23, 'avatar', 'saeulen'], [24, 'avatar', 'sechseck'], [25, 'title', 'routinier'],
    [26, 'theme', 'graphit'], [27, 'title', 'marktleser'], [28, 'avatar', 'krone'], [29, 'title', 'architekt'],
    [30, 'theme', 'nachtgold'], [30, 'title', 'regelmeister']
  ].map(([lvl, type, id]) => ({ lvl, type, id }));
  const catalog = (type) => (type === 'theme' ? THEMES : type === 'avatar' ? AVATARS : type === 'frame' ? FRAMES : TITLES);
  const nameOf = (r) => { const c = catalog(r.type)[r.id]; return Array.isArray(c) ? c[0] : (c && c.name) || c; };
  const typeLabel = { theme: 'Design', avatar: 'Avatar', frame: 'Rahmen', title: 'Titel' };
  const levelOfReward = (type, id) => { const r = REWARDS.find((x) => x.type === type && x.id === id); return r ? r.lvl : 99; };
  const highestTitle = (level) => REWARDS.filter((r) => r.type === 'title' && r.lvl <= level).pop().id;

  const utcDay = (t) => { const d = new Date(t * 1000); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
  const dayNo = (k) => Math.round(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100) / 86400000);

  /* journal, sessions, strategies → XP, Level, Serie, Abzeichen. opt: { dayKey(tSec), today(tSec) } */
  function calc(journal, sessions, strategies, opt) {
    opt = opt || {};
    const dayKey = opt.dayKey || utcDay;
    const cat = { trades: 0, rules: 0, reflexion: 0, routine: 0, weekly: 0 };
    const n = { trades: 0, notes: 0, rulesOk: 0, sessions: 0, blind: 0, bad: 0, strategies: 0, stopKept: 0 };

    const perSess = new Map(), notesSeen = new Map(), rulesBy = new Map(), bySess = new Map();
    for (const j of journal || []) {
      if (!j || (j.status && j.status !== 'closed')) continue;
      n.trades++;
      /* Trades ohne Session/Replay: Schlüssel aus dem Kalendertag, nicht ein gemeinsamer Topf */
      const t0 = j.exitT || j.entryT;
      const key = j.session || j.replay || ('d' + (t0 ? dayKey(t0) : '-'));
      if (j.session) { if (!bySess.has(j.session)) bySess.set(j.session, []); bySess.get(j.session).push(j); }
      /* Notiz zählt nur mit Substanz und nur, wenn sie in der Session nicht schon vorkam */
      let hasNote = false;
      if (goodText(j.note)) {
        const norm = j.note.trim().toLowerCase().replace(/\s+/g, ' ');
        const seen = notesSeen.get(key) || new Set();
        hasNote = !seen.has(norm); seen.add(norm); notesSeen.set(key, seen);
      }
      if (hasNote) n.notes++;
      if (j.rulesOk) n.rulesOk++;
      /* Schutz gegen Trade-Spam: je Session zählen höchstens 12 Trades für XP */
      const c = (perSess.get(key) || 0) + 1; perSess.set(key, c);
      if (c > XP.tradesPerSession) continue;
      cat.trades += XP.trade + (hasNote ? XP.tradeNote : 0) + (j.setup ? XP.tradeSetup : 0) + (j.sl != null ? XP.tradeStop : 0);
      if (j.rulesTotal > 0) { const r = rulesBy.get(key) || { n: 0, ok: 0 }; r.n++; if (j.rulesOk) r.ok++; rulesBy.set(key, r); }
    }
    /* Regel-XP je Session: Anteil der Trades mit komplett erfüllter Checkliste */
    for (const r of rulesBy.values()) {
      if (r.n < XP.rulesMinTrades) continue;
      const q = r.ok / r.n;
      cat.rules += q >= XP.rulesAllAt ? XP.rulesAll : q >= XP.rulesHalfAt ? XP.rulesHalf : 0;
    }

    const days = new Set(), weeks = new Map();
    for (const e of sessions || []) {
      if (!e || e.running) continue;
      const disc = +e.discipline || 0;
      const txt = goodText;
      const worked = disc > 0 || txt(e.good) || txt(e.bad) || txt(e.note) || (e.mistakes && e.mistakes.length) || e.trades > 0 || e.net != null;
      if (!worked) continue; /* nur gestartet und sofort wieder beendet → kein XP */
      n.sessions++;
      cat.reflexion += XP.session;
      if (disc > 0) cat.reflexion += XP.discBase + disc * XP.discStep;
      if (txt(e.good)) cat.reflexion += XP.good;
      if (txt(e.bad)) { cat.reflexion += XP.bad; n.bad++; }
      cat.reflexion += Math.min(XP.mistakeMax, (e.mistakes || []).length) * XP.mistake;
      if (txt(e.note)) cat.reflexion += XP.sessNote;
      if (e.blind) { cat.reflexion += XP.blind; n.blind++; }
      /* Importierte Sessions ohne eigenes Datum (created wurde beim Import auf „jetzt“ gesetzt) zählen nicht als aktiver Tag */
      const t = e.createdAuto ? e.updated : (e.created || e.updated); if (t) days.add(dayKey(t));
      /* Stopp gehalten: kein Stop wurde weiter vom Einstieg weggeschoben (side: 1 = Long, -1 = Short) */
      let kept = false;
      const withStop = (bySess.get(e.id) || []).filter((j) => j.sl != null && j.slFinal != null && isFinite(j.sl) && isFinite(j.slFinal) && (j.side === 1 || j.side === -1));
      if (withStop.length && withStop.every((j) => j.side * (j.sl - j.slFinal) <= (j.tick || 1e-9) / 2)) { n.stopKept++; kept = true; }
      /* Wochenziele: nach dem echten Kalendertag der Session einsortieren */
      if (t) {
        const dn = dayNo(dayKey(t)), wk = weekOf(dn);
        const w = weeks.get(wk) || { days: new Set(), checklist: 0, review: 0, disc: 0, stops: 0, blind: 0, patience: 0 };
        const r = rulesBy.get(e.id);
        w.days.add(dn);
        if (r && r.n >= XP.rulesMinTrades && r.ok / r.n >= XP.rulesAllAt) w.checklist++;
        if (txt(e.bad)) w.review++;
        if (disc > 0) w.disc++;
        if (kept) w.stops++;
        if (e.blind) w.blind++;
        if (r && r.n >= 2 && r.n <= 6 && r.ok === r.n) w.patience++;
        weeks.set(wk, w);
      }
    }

    /* Routine: aktive Tage und Serien (echte Kalendertage, nicht die Kurstage des Replays) */
    const nums = [...days].map(dayNo).sort((a, b) => a - b);
    let best = 0, run = 0, cur = 0;
    nums.forEach((d, i) => { run = i && d === nums[i - 1] + 1 ? run + 1 : 1; if (run > best) best = run; });
    if (nums.length) {
      const today = dayNo(dayKey(opt.today != null ? opt.today : Date.now() / 1000));
      const last = nums[nums.length - 1];
      if (today - last <= 1) { cur = 1; for (let i = nums.length - 1; i > 0 && nums[i] === nums[i - 1] + 1; i--) cur++; }
    }
    cat.routine += nums.length * XP.day;
    for (const [d, b] of STREAK_BONUS) if (best >= d) cat.routine += b;

    for (const s of strategies || []) if (s && (s.rules || '').split('\n').filter((x) => x.trim()).length >= 3) n.strategies++;
    cat.routine += Math.min(n.strategies, XP.strategyMax) * XP.strategy;

    /* Wochenziele: Fortschritt je Woche, abgeschlossene Wochen bringen Bonus-XP (rückwirkend aus den Daten) */
    const evalWeek = (wk) => {
      const w = weeks.get(wk);
      const goals = goalsFor(wk).map((g) => { const v = w ? (g.key === 'days' ? w.days.size : w[g.key]) : 0; return { id: g.id, label: g.label, desc: g.desc, target: g.target, cur: Math.min(v, g.target), done: v >= g.target }; });
      const done = goals.filter((g) => g.done).length;
      return { wk, goals, done, bonus: done * WEEK_XP.goal + (done === goals.length ? WEEK_XP.all : 0) };
    };
    cat.weekly = 0;
    for (const wk of weeks.keys()) cat.weekly += evalWeek(wk).bonus;
    const todayNo = dayNo(dayKey(opt.today != null ? opt.today : Date.now() / 1000));
    const week = evalWeek(weekOf(todayNo));
    week.daysLeft = 6 - ((todayNo + 3) % 7);

    const total = cat.trades + cat.rules + cat.reflexion + cat.routine + cat.weekly;
    const level = levelOf(total);
    const badges = [
      ['erster-trade', 'Erster Trade', 'Einen Trade im Journal haben', n.trades, 1],
      ['erste-session', 'Erste Session', 'Eine Session auswerten', n.sessions, 1],
      ['trades-100', '100 Trades', 'Trades im Journal', n.trades, 100],
      ['trades-500', '500 Trades', 'Trades im Journal', n.trades, 500],
      ['sessions-10', '10 Sessions', 'Ausgewertete Sessions', n.sessions, 10],
      ['sessions-50', '50 Sessions', 'Ausgewertete Sessions', n.sessions, 50],
      ['regelfest', 'Regelfest', 'Trades mit komplett erfüllter Regel-Checkliste', n.rulesOk, 25],
      ['ehrlich', 'Ehrlicher Rückblick', 'Sessions mit „Was lief schlecht“ ausgefüllt', n.bad, 10],
      ['blind', 'Blind geflogen', 'Blind-Sessions ausgewertet', n.blind, 10],
      ['notizen', 'Dokumentiert', 'Trades mit aussagekräftiger Notiz', n.notes, 50],
      ['stopp', 'Stopp gehalten', 'Sessions, in denen kein Stop weiter weggeschoben wurde', n.stopKept, 10],
      ['strategie', 'Auf dem Papier', 'Strategien mit mindestens 3 Regeln', n.strategies, 1],
      ['serie-3', 'Serie 3', 'Tage in Folge gebacktestet', best, 3],
      ['serie-7', 'Serie 7', 'Tage in Folge gebacktestet', best, 7],
      ['serie-30', 'Serie 30', 'Tage in Folge gebacktestet', best, 30]
    ].map(([id, label, desc, c, t]) => ({ id, label, desc, cur: Math.min(c, t), target: t, done: c >= t }));

    return {
      total, level, cat, n, badges, week, activeDays: nums.length, streak: { cur, best },
      from: need(level), to: level >= LEVEL_MAX ? null : need(level + 1)
    };
  }

  return { XP, WEEK_XP, WEEK_POOL, goalsFor, weekOf, STREAK_BONUS, LEVEL_MAX, TRACK_MAX, need, levelOf, calc, THEMES, AVATARS, FRAMES, TITLES, REWARDS, nameOf, typeLabel, levelOfReward, highestTitle, catalog };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PassCore;

/* ---------- Oberfläche ---------- */
const Pass = {
  last: null, _wrapped: false,
  state() {
    const s = App.settings.pass || (App.settings.pass = {});
    if (!PassCore.THEMES[s.theme]) s.theme = 'standard';
    if (!PassCore.AVATARS[s.avatar]) s.avatar = 'kerze';
    if (!PassCore.FRAMES[s.frame]) s.frame = 'keiner';
    if (s.title !== 'auto' && !PassCore.TITLES[s.title]) s.title = 'auto';
    /* alte Fassungen legten hw/seen in die (synchronisierten) Einstellungen – ins Gerät übernehmen und dort entfernen */
    if ('hw' in s || 'seen' in s) {
      const L = this.loc();
      L.hw = Math.max(L.hw, +s.hw || 0); L.seen = Math.max(L.seen, +s.seen || 0);
      if (+s.hw || +s.seen) L.fresh = false;
      delete s.hw; delete s.seen; this.saveLoc(); App.saveSettings();
    }
    return s;
  },
  /* Geräte-Stand (nicht synchronisiert): höchster Stand, zuletzt gemeldetes Level, XP-Stand vor der Session */
  loc() {
    if (!this._loc) {
      const raw = store.get('elr.pass', null), o = raw && typeof raw === 'object' ? raw : null;
      this._loc = { hw: +(o && o.hw) || 0, seen: +(o && o.seen) || 0, last: (o && o.last) || null, fresh: !o };
    }
    return this._loc;
  },
  saveLoc() { const L = this.loc(); store.set('elr.pass', { hw: L.hw, seen: L.seen, last: L.last }); },
  dayKey() { return (t) => { const p = Core.localParts(t, App.settings.tz); return p.y * 10000 + p.m * 100 + p.d; }; },
  /* Neu berechnen. Der höchste erreichte Stand bleibt erhalten, auch wenn später Trades gelöscht werden. */
  refresh() {
    this.state();
    const hw = this.loc().hw;
    const c = PassCore.calc(App.journal, App.sessions, App.strategies, { dayKey: this.dayKey() });
    c.legacy = Math.max(0, hw - c.total); /* Bestand aus inzwischen gelöschten Daten */
    if (c.total < hw) { c.total = hw; c.level = PassCore.levelOf(hw); c.from = PassCore.need(c.level); c.to = c.level >= PassCore.LEVEL_MAX ? null : PassCore.need(c.level + 1); }
    this.last = c;
    return c;
  },
  titleId() { const s = this.state(); return s.title === 'auto' ? PassCore.highestTitle(this.last ? this.last.level : 1) : s.title; },
  applyTheme() {
    const id = this.state().theme;
    if (id === 'standard') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', id);
  },
  avatarSvg(id, cls) {
    const a = PassCore.AVATARS[id] || PassCore.AVATARS.kerze;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + a[1] + '</svg>';
  },
  avatarHtml(size) {
    const s = this.state();
    return '<span class="pav pav-' + (size || 'm') + ' fr-' + s.frame + '">' + this.avatarSvg(s.avatar) + '</span>';
  },

  /* Nach jedem Speichern prüfen, ob ein neues Level erreicht wurde */
  init() {
    if (this._wrapped || typeof Store === 'undefined') return;
    this._wrapped = true;
    const save = Store.save.bind(Store);
    Store.save = function (k, v) {
      const p = save(k, v);
      if (k === 'journal' || k === 'sessions' || k === 'strategies') { clearTimeout(Pass._t); Pass._t = setTimeout(() => Pass.check(), 400); }
      return p;
    };
    $('#passBody').addEventListener('click', (e) => this.onClick(e));
    $('#puWear').addEventListener('click', () => this.wearUnlocked());
  },
  check(opt) {
    if (!App.journal) return;
    /* Mitten in einer Session nicht stören – die Meldung kommt danach */
    if (App.replay && App.replay.active) return;
    this.state();
    const ended = !!(this._ended || (opt && opt.ended)); this._ended = false;
    const L = this.loc(), prev = L.last;
    const c = this.refresh();
    const cat = c.cat, sum = (k) => Math.max(0, cat[k] - (prev ? prev[k] || 0 : 0));
    let dirty = false, card = null, intro = false;
    if (c.total > L.hw) { L.hw = c.total; dirty = true; }
    /* Frisches Gerät: Level erst still setzen, wenn Daten da sind (nicht vor dem ersten Sync-Pull) */
    const empty = !(App.journal.length || (App.sessions || []).length);
    if (!L.seen) {
      if (!empty) { intro = L.fresh && c.level > 1; L.seen = c.level; L.fresh = false; dirty = true; }
    } else if (c.level > L.seen) {
      card = { from: L.seen, to: c.level }; L.seen = c.level; dirty = true; this.pulse = c.level;
    }
    /* Abschluss einer Session: ruhige Zusammenfassung, nie mit Gewinn oder Verlust */
    let line = '';
    if (ended && prev) {
      const parts = [['Trades', sum('trades')], ['Regeln', sum('rules')], ['Rückblick', sum('reflexion')], ['Routine', sum('routine')], ['Wochenziele', sum('weekly')]].filter((x) => x[1] > 0);
      const tot = parts.reduce((a, x) => a + x[1], 0);
      if (tot > 0) line = '+' + tot + ' XP: ' + parts.map((x) => x[0] + ' ' + x[1]).join(', ');
    }
    const snap = { trades: cat.trades, rules: cat.rules, reflexion: cat.reflexion, routine: cat.routine, weekly: cat.weekly };
    if (!prev || JSON.stringify(prev) !== JSON.stringify(snap)) { L.last = snap; dirty = true; }
    if (dirty) this.saveLoc();
    if (intro) App.toast('Dein bisheriger Fortschritt zählt: Level ' + c.level + ' im Pass.', 'good');
    if (card) this.queueUnlock(card, line);
    else if (line) App.toast(line, 'info');
    if (App.view === 'pass') this.render();
    if (App.view === 'start') App.renderStart();
  },

  /* Freischalt-Karte: erscheint nie während einer Session oder über einem anderen Dialog */
  queueUnlock(card, line) {
    const q = this._q;
    this._q = q ? { from: Math.min(q.from, card.from), to: Math.max(q.to, card.to), line: line || q.line } : { from: card.from, to: card.to, line: line || '' };
    this.tryUnlock();
  },
  tryUnlock() {
    clearTimeout(this._qt);
    const q = this._q; if (!q) return;
    if ((App.replay && App.replay.active) || document.body.classList.contains('modal-open')) { this._qt = setTimeout(() => this.tryUnlock(), 1500); return; }
    this._q = null; this.showUnlock(q);
  },
  rewardVis(r, big) {
    if (r.type === 'theme') { const t = PassCore.THEMES[r.id].c; return '<span class="sw" style="background:' + t[0] + '"><i style="background:' + t[1] + '"></i><i style="background:' + t[2] + '"></i></span>'; }
    if (r.type === 'avatar') return '<span class="pav ' + (big ? 'pav-l' : 'pav-s') + ' fr-keiner">' + this.avatarSvg(r.id) + '</span>';
    if (r.type === 'frame') return '<span class="pav ' + (big ? 'pav-l' : 'pav-s') + ' fr-' + r.id + '">' + this.avatarSvg('kerze') + '</span>';
    return '<span class="ttl">Aa</span>';
  },
  showUnlock(q) {
    const got = PassCore.REWARDS.filter((r) => r.lvl > q.from && r.lvl <= q.to);
    this._got = got[0] || null;
    $('#puVis').innerHTML = got[0] ? this.rewardVis(got[0], true) : this.avatarHtml('l');
    $('#puTitle').textContent = 'Level ' + q.to;
    const multi = q.to - q.from > 1;
    $('#puList').innerHTML = got.length ? got.map((r) => '<li>' + (multi ? 'Level ' + r.lvl + ': ' : '') + PassCore.typeLabel[r.type] + ' <b>' + esc(PassCore.nameOf(r)) + '</b></li>').join('') : '<li>Weiter so.</li>';
    const x = $('#puXp'); x.textContent = q.line || ''; x.hidden = !q.line;
    $('#puWear').hidden = !got[0];
    openModal('#passUnlock');
  },
  wearUnlocked() {
    const r = this._got; closeModal('#passUnlock'); if (!r) return;
    this.equip(r.type, r.id); App.saveSettings(); if (App.view === 'pass') this.render();
  },
  equip(type, id) {
    const s = this.state();
    if (type === 'theme') { s.theme = id; this.applyTheme(); if (typeof readColors === 'function') readColors(); App.requestRender(); }
    else if (type === 'avatar') s.avatar = id;
    else if (type === 'frame') s.frame = id;
    else if (type === 'title') s.title = id;
  },

  /* Kompakte Karte für die Übersicht */
  chip() {
    const c = this.last || this.refresh();
    const pct = c.to == null ? 100 : Math.max(0, Math.min(100, (c.total - c.from) / (c.to - c.from) * 100));
    return '<a class="pass-chip" href="#pass" aria-label="Pass öffnen">' + this.avatarHtml('s') +
      '<span class="pc-main"><b>Level ' + c.level + ' · ' + esc(PassCore.TITLES[this.titleId()]) + '</b>' +
      '<span class="pbar" aria-hidden="true"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
      '<small>' + (c.to == null ? 'Höchstes Level erreicht' : App.fmtN(c.to - c.total, 0) + ' XP bis Level ' + (c.level + 1)) + ' · Wochenziele ' + c.week.done + '/' + c.week.goals.length + '</small></span>' +
      (c.streak.cur >= 2 ? '<span class="pc-streak num">' + c.streak.cur + ' Tage</span>' : '') + '</a>';
  },

  onClick(e) {
    const b = e.target.closest('[data-eq]'); if (!b) return;
    const [type, id] = b.dataset.eq.split(':');
    const lvl = PassCore.levelOfReward(type, id), c = this.last || this.refresh();
    if (lvl > c.level) { App.toast('Ab Level ' + lvl + ' freigeschaltet.'); return; }
    this.equip(type, id);
    App.saveSettings(); this.render();
  },

  render() {
    const el = $('#passBody'); if (!el) return;
    const c = this.refresh(), s = this.state(), X = PassCore.XP;
    const pct = c.to == null ? 100 : Math.max(0, Math.min(100, (c.total - c.from) / (c.to - c.from) * 100));
    const nextR = PassCore.REWARDS.filter((r) => r.lvl === c.level + 1);
    const fmt = (v) => App.fmtN(v, 0);
    /* Kopf */
    let h = '<div class="st-head"><div><h1>Pass</h1><p class="page-sub">XP gibt es für saubere Arbeit – nicht für Gewinn oder Verlust.</p></div></div>';
    h += '<section class="card pass-hero">' + this.avatarHtml('l') +
      '<div class="ph-main"><div class="ph-top"><span class="ph-lvl num">Level ' + c.level + '</span><span class="ph-title">' + esc(PassCore.TITLES[this.titleId()]) + '</span></div>' +
      '<div class="pbar big" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(pct) + '" aria-label="Fortschritt zum nächsten Level"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<div class="ph-sub"><span class="num">' + fmt(c.total) + (c.to == null ? '' : ' / ' + fmt(c.to)) + ' XP</span>' +
      (c.to == null ? '<span>Höchstes Level erreicht</span>' : '<span>noch ' + fmt(c.to - c.total) + ' XP bis Level ' + (c.level + 1) + (nextR.length ? ' · ' + esc(nextR.map((r) => PassCore.typeLabel[r.type] + ' ' + PassCore.nameOf(r)).join(', ')) : '') + '</span>') + '</div></div>' +
      '<div class="ph-stats"><div><b class="num">' + c.streak.cur + '</b><span>Tage in Serie</span></div><div><b class="num">' + c.streak.best + '</b><span>Beste Serie</span></div><div><b class="num">' + c.activeDays + '</b><span>Aktive Tage</span></div></div></section>';
    /* Wochenziele */
    const wk = c.week;
    h += '<section class="card"><div class="card-h"><h3>Wochenziele</h3><span class="hint">' + (wk.daysLeft === 0 ? 'Letzter Tag der Woche' : 'Noch ' + wk.daysLeft + ' Tage · Woche endet Sonntag') + ' · je +' + PassCore.WEEK_XP.goal + ' XP, alle drei +' + PassCore.WEEK_XP.all + '</span></div><div class="pgoals">' +
      wk.goals.map((g) => '<div class="pg' + (g.done ? ' done' : '') + '"><div class="pb-h"><b>' + esc(g.label) + '</b><span class="num">' + (g.done ? '✓' : g.cur + '/' + g.target) + '</span></div><small>' + esc(g.desc) + '</small><span class="pbar" aria-hidden="true"><i style="width:' + (g.cur / g.target * 100).toFixed(0) + '%"></i></span></div>').join('') +
      '</div><p class="hint">Ziele verlangen nie mehr Trades – nur sauberere Arbeit. Verpasste Wochen kosten nichts.</p></section>';
    /* Spur */
    h += '<section class="card"><div class="card-h"><h3>Belohnungen</h3><span class="hint">Tippe auf eine freigeschaltete Belohnung, um sie zu tragen.</span></div><div class="ptrack" id="pTrack">';
    for (let L = 1; L <= PassCore.TRACK_MAX; L++) {
      const rs = PassCore.REWARDS.filter((r) => r.lvl === L), open = L <= c.level, curr = L === c.level;
      h += '<div class="pnode' + (rs.length > 1 ? ' wide' : '') + (open ? ' open' : '') + (curr ? ' cur' : '') + (this.pulse === L ? ' pulse' : '') + '" style="--n:' + rs.length + '"' + (curr ? ' id="pCur"' : '') + '><div class="pn-l num">' + L + '</div><div class="pn-r">';
      for (const r of rs) {
        const on = (r.type === 'theme' && s.theme === r.id) || (r.type === 'avatar' && s.avatar === r.id) || (r.type === 'frame' && s.frame === r.id) || (r.type === 'title' && this.titleId() === r.id);
        const vis = this.rewardVis(r, false);
        h += '<button type="button" class="prw' + (on ? ' on' : '') + (L === c.level + 1 ? ' next' : '') + '" data-eq="' + r.type + ':' + r.id + '"' + (open ? '' : ' aria-disabled="true"') + ' title="' + esc(PassCore.typeLabel[r.type] + ': ' + PassCore.nameOf(r)) + '">' + vis + '<small>' + esc(PassCore.typeLabel[r.type]) + '</small><b>' + esc(PassCore.nameOf(r)) + '</b></button>';
      }
      h += '</div></div>';
    }
    h += '</div></section>';
    /* Woher kommt XP */
    const rows = [['Trades', c.cat.trades, 'Journal, Notizen, Stop gesetzt'], ['Regeln', c.cat.rules, 'Checkliste vor dem Einstieg'], ['Rückblick', c.cat.reflexion, 'Sessions auswerten, ehrlich bleiben'], ['Routine', c.cat.routine, 'Aktive Tage, Serien, Strategien'], ['Wochenziele', c.cat.weekly, 'Erfüllte Wochenziele']];
    if (c.legacy > 0) rows.push(['Bestand (gelöschte Daten)', c.legacy, 'Höchster erreichter Stand, auch wenn Trades oder Sessions gelöscht wurden']);
    const mx = Math.max(1, ...rows.map((r) => r[1]));
    h += '<div class="dash"><div class="dash-col"><section class="card"><div class="card-h"><h3>Woher dein XP kommt</h3><span class="hint num">' + fmt(c.total) + ' gesamt</span></div><div class="mk-list">' +
      rows.map((r) => '<div class="mk-row" title="' + esc(r[2]) + '"><span>' + r[0] + '</span><span class="meter"><i style="width:' + (r[1] / mx * 100).toFixed(0) + '%"></i></span><b>' + fmt(r[1]) + '</b></div>').join('') + '</div></section>' +
      '<section class="card"><div class="card-h"><h3>So sammelst du XP</h3></div><ul class="prules">' +
      '<li><span>Trade im Journal<small>höchstens ' + X.tradesPerSession + ' pro Session</small></span><b class="num">+' + X.trade + '</b></li>' +
      '<li><span>Aussagekräftige Notiz am Trade · Strategie gewählt · Stop gesetzt<small>Notiz: ab ' + X.noteChars + ' Zeichen und ' + X.noteWords + ' Wörtern, nicht doppelt</small></span><b class="num">+' + X.tradeNote + ' · +' + X.tradeSetup + ' · +' + X.tradeStop + '</b></li>' +
      '<li><span>Regeln eingehalten<small>je Session ab ' + X.rulesMinTrades + ' Trades mit Checkliste: ' + Math.round(X.rulesAllAt * 100) + ' % komplett erfüllt, ab ' + Math.round(X.rulesHalfAt * 100) + ' % +' + X.rulesHalf + '</small></span><b class="num">+' + X.rulesAll + '</b></li>' +
      '<li><span>Session ausgewertet</span><b class="num">+' + X.session + '</b></li>' +
      '<li><span>Disziplin bewertet</span><b class="num">bis +' + (X.discBase + 5 * X.discStep) + '</b></li>' +
      '<li><span>„Was lief gut“ · „Was lief schlecht“ ausgefüllt<small>ab ' + X.noteChars + ' Zeichen und ' + X.noteWords + ' Wörtern</small></span><b class="num">+' + X.good + ' · +' + X.bad + '</b></li>' +
      '<li><span>Fehler markiert<small>bis zu ' + X.mistakeMax + ' pro Session</small></span><b class="num">+' + X.mistake + ' je</b></li>' +
      '<li><span>Blind-Session</span><b class="num">+' + X.blind + '</b></li>' +
      '<li><span>Aktiver Tag</span><b class="num">+' + X.day + '</b></li>' +
      '<li><span>Serie von ' + PassCore.STREAK_BONUS.map((x) => x[0]).join(' / ') + ' Tagen</span><b class="num">+' + PassCore.STREAK_BONUS.map((x) => x[1]).join(' / ') + '</b></li>' +
      '<li><span>Strategie mit mindestens 3 Regeln<small>bis zu ' + X.strategyMax + '</small></span><b class="num">+' + X.strategy + '</b></li>' +
      '<li><span>Wochenziel geschafft<small>alle drei der Woche: zusätzlich +' + PassCore.WEEK_XP.all + '</small></span><b class="num">+' + PassCore.WEEK_XP.goal + '</b></li>' +
      '<li class="zero"><span>Gewinn oder Verlust</span><b class="num">0</b></li></ul>' +
      '<p class="hint">Die Regel-Checkliste beruht auf deiner Ehrlichkeit – schummeln bringt nur dir selbst falsche Daten.</p></section></div>';
    /* Abzeichen */
    h += '<div class="dash-col"><section class="card"><div class="card-h"><h3>Abzeichen</h3><span class="hint num">' + c.badges.filter((b) => b.done).length + ' / ' + c.badges.length + '</span></div><div class="pbadges">' +
      c.badges.map((b) => '<div class="pb' + (b.done ? ' done' : '') + '" title="' + esc(b.desc) + '"><div class="pb-h"><b>' + esc(b.label) + '</b><span class="num">' + (b.done ? '✓' : b.cur + '/' + b.target) + '</span></div><small>' + esc(b.desc) + '</small><span class="pbar" aria-hidden="true"><i style="width:' + (b.cur / b.target * 100).toFixed(0) + '%"></i></span></div>').join('') + '</div></section></div></div>';
    el.innerHTML = h;
    this.pulse = 0;
    const cur = $('#pCur'), tr = $('#pTrack');
    if (cur && tr) tr.scrollLeft = Math.max(0, cur.offsetLeft - tr.clientWidth / 2 + cur.offsetWidth / 2);
  }
};
