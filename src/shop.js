/* Edge Lab Replay — Shop: Payouts aus bestandenen Prop-Sessions → Coins → Designs und mehr.
   Ein Payout gibt es nur für saubere Konten (Ziel erreicht, kein Regelverstoß, Stop-Loss bei jedem Trade,
   Konsistenzregel wie bei echten Funded-Accounts) – nie für Zocken. Der Pass (XP) bleibt davon getrennt.
   Gespeichert wird in App.settings.shop (wird mit synchronisiert): ausgezahlte Sessions (claims) und Käufe (owned).
   Das Guthaben wird immer daraus berechnet: Auszahlungen minus Preise der gekauften Dinge. */
'use strict';

/* ---------- Kern: reine Rechenlogik (ohne Browser, im Node-Test prüfbar) ---------- */
const ShopCore = (() => {
  const RULES = {
    split: 0.8,          /* Anteil des Gewinns, der ausgezahlt wird */
    cap: 2,              /* ausgezahlt wird höchstens der Gewinn bis zum 2-fachen Ziel */
    consistency: 0.5,    /* größter Gewinn-Trade höchstens 50 % des Gesamtgewinns */
    minTrades: 3,
    minTargetPct: 0.03,  /* Gewinnziel mindestens 3 % des Startkapitals */
    maxDDPct: 0.08,      /* Max. Drawdown höchstens 8 % des Startkapitals */
    coinsPerPct: 1       /* 1 Coin je 1 % des Gewinnziels, das ausgezahlt wird */
  };

  /* Alles, was es im Shop gibt. price 0 = gehört jedem (Standard). */
  const DEFS = {
    theme: {
      rubin: { name: 'Rubin', price: 180, c: ['#140a0c', '#1c0f12', '#ff5d6c'] },
      ozean: { name: 'Ozean', price: 180, c: ['#07121a', '#0b1b26', '#36c5e0'] },
      sakura: { name: 'Sakura', price: 200, c: ['#130d11', '#1b1217', '#ffa8c5'] },
      eis: { name: 'Eis', price: 200, c: ['#0a0f14', '#0f171e', '#bfe3ff'] },
      limette: { name: 'Limette', price: 220, c: ['#0b1007', '#11190b', '#b9f03c'] },
      neon: { name: 'Neon', price: 260, c: ['#0a0a14', '#10101e', '#ff4fd8'] }
    },
    avatar: {
      blitz: { name: 'Blitz', price: 70, svg: '<path d="M18 3L7 18h8l-2 11 12-15h-8z"/>' },
      stern: { name: 'Stern', price: 80, svg: '<path d="M16 3l3.9 8.1 8.9 1.2-6.4 6.2 1.6 8.8L16 23l-8 4.3 1.6-8.8-6.4-6.2 8.9-1.2z"/>' },
      flamme: { name: 'Flamme', price: 90, svg: '<path d="M16 3c1 5 7 8 7 15a7 7 0 01-14 0c0-3 2-5 3-7 1 2 2 3 3 3 0-4 0-7 1-11z"/>' },
      tresor: { name: 'Tresor', price: 100, svg: '<rect x="5" y="6" width="22" height="20" rx="2"/><circle cx="16" cy="16" r="5"/><path d="M16 11v10M11 16h10M9 26v2M23 26v2"/>' },
      muenze: { name: 'Münze', price: 110, svg: '<circle cx="16" cy="16" r="12"/><path d="M16 8.5v15M19.8 12.2c-.9-1.7-7.6-2-7.6 1.6 0 3.8 7.6 1.9 7.6 5.7 0 3.4-6.7 3.2-7.6 1.3"/>' },
      pokal: { name: 'Pokal', price: 120, svg: '<path d="M10 5h12v7a6 6 0 01-12 0zM10 8H5c0 4 2 6 5 6M22 8h5c0 4-2 6-5 6M16 18v5M11 27h10M13 23h6"/>' }
    },
    frame: {
      punkte: { name: 'Gepunktet', price: 100 },
      gold: { name: 'Goldring', price: 120 },
      glow: { name: 'Leuchtend', price: 140 }
    },
    title: {
      auszahler: { name: 'Auszahler', price: 60 },
      verlaesslich: { name: 'Verlässlich', price: 70 },
      funded: { name: 'Funded Trader', price: 80 },
      risikomanager: { name: 'Risikomanager', price: 90 }
    },
    candles: {
      standard: { name: 'Standard', price: 0, c: ['#2bb38a', '#e5534b'] },
      blauorange: { name: 'Blau und Orange', price: 100, c: ['#3b9eff', '#ff9a3c'] },
      mono: { name: 'Hell und Dunkel', price: 100, c: ['#e8e8ea', '#6b6b74'] },
      gold: { name: 'Gold und Violett', price: 120, c: ['#f4d35e', '#9a6cf5'] },
      neon: { name: 'Neon', price: 120, c: ['#22f5b0', '#ff3d71'] }
    }
  };
  const TYPES = ['theme', 'avatar', 'frame', 'title', 'candles'];
  const TYPE_LABEL = { theme: 'Designs', avatar: 'Avatare', frame: 'Rahmen', title: 'Titel', candles: 'Kerzenfarben' };
  const TYPE_ONE = { theme: 'Design', avatar: 'Avatar', frame: 'Rahmen', title: 'Titel', candles: 'Kerzenfarben' };

  const def = (type, id) => (DEFS[type] && Object.prototype.hasOwnProperty.call(DEFS[type], id) ? DEFS[type][id] : null);
  const isShopItem = (type, id) => { const d = def(type, id); return !!(d && d.price > 0); };
  const keyOf = (type, id) => type + ':' + id;
  const parseKey = (k) => { const i = String(k).indexOf(':'); return i < 0 ? null : [k.slice(0, i), k.slice(i + 1)]; };

  /* Eingelesenen Stand glätten: nur bekannte, sinnvolle Einträge bleiben */
  function sanitize(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const claims = {}, owned = {};
    for (const [k, v] of Object.entries(o.claims && typeof o.claims === 'object' ? o.claims : {})) {
      const c = v && +v.c;
      if (c > 0 && c <= 1000 && isFinite(c)) claims[k] = { t: +v.t || 0, c: Math.round(c), n: isFinite(+v.n) ? +v.n : 0 };
    }
    for (const [k, v] of Object.entries(o.owned && typeof o.owned === 'object' ? o.owned : {})) {
      const pk = parseKey(k);
      if (!pk || !isShopItem(pk[0], pk[1])) continue;
      const p = v && isFinite(+v.p) && +v.p >= 0 ? Math.round(+v.p) : def(pk[0], pk[1]).price;
      owned[k] = { t: (v && +v.t) || 0, p };
    }
    return { claims, owned, candles: def('candles', o.candles) ? o.candles : 'standard' };
  }
  const owns = (sh, type, id) => !!def(type, id) && (!isShopItem(type, id) || !!(sh.owned && sh.owned[keyOf(type, id)]));

  function wallet(sh) {
    let earned = 0, spent = 0, payouts = 0;
    for (const c of Object.values(sh.claims || {})) { earned += c.c; payouts++; }
    for (const o of Object.values(sh.owned || {})) spent += o.p;
    return { earned, spent, payouts, raw: earned - spent, balance: Math.max(0, earned - spent) };
  }

  /* Grenzen der Challenge: sonst wäre ein Ziel von 1 $ ein Freifahrtschein */
  function limits(cfg) {
    const out = [], s = cfg.start || 0, pc = (x) => Math.round(x * 100) + ' %';
    if (!(cfg.target >= RULES.minTargetPct * s && cfg.target > 0)) out.push('Das Gewinnziel muss mindestens ' + pc(RULES.minTargetPct) + ' des Startkapitals betragen.');
    if (!(cfg.maxDD > 0 && cfg.maxDD <= RULES.maxDDPct * s)) out.push('Der Max. Drawdown muss gesetzt sein und darf höchstens ' + pc(RULES.maxDDPct) + ' des Startkapitals betragen.');
    if (!(cfg.dailyLoss > 0)) out.push('Ein Tagesverlust-Limit muss gesetzt sein.');
    return out;
  }

  /* Auszahlung in Coins: 80 % des Gewinns (höchstens bis zum 2-fachen Ziel), 1 Coin je 1 % des Ziels */
  function payoutOf(net, target) {
    if (!(net > 0) || !(target > 0)) return { usd: 0, coins: 0 };
    const usd = RULES.split * Math.min(net, RULES.cap * target);
    return { usd, coins: Math.round(usd / target * 100 * RULES.coinsPerPct) };
  }

  /* p: Eintrag aus Core.propBySession, list: die geschlossenen Trades dieser Session.
     ctx: { running, fmt } – running = Session noch nicht beendet, fmt = Geldformat. */
  function assess(p, list, cfg, claims, ctx) {
    ctx = ctx || {};
    const fmt = ctx.fmt || ((v) => String(Math.round(v)));
    const key = String(p.replay);
    const out = { key, state: 'open', reached: false, reasons: [], coins: 0, usd: 0 };
    const claim = claims && claims[key];
    out.reached = p.res && p.res.target != null && p.res.balance >= p.res.target;
    const pay = payoutOf(p.net, cfg.target);
    out.usd = pay.usd; out.coins = pay.coins;
    if (claim) { out.state = 'claimed'; out.coins = claim.c; out.claim = claim; return out; }
    if (!out.reached) return out;
    if (p.breaches && p.breaches.length) { out.state = 'breach'; out.breach = p.breaches[0].type; return out; }
    const why = out.reasons;
    why.push(...limits(cfg));
    if (ctx.running) why.push('Die Session läuft noch. Beende sie, dann kannst du das Payout holen.');
    if (list.length < RULES.minTrades) why.push('Mindestens ' + RULES.minTrades + ' Trades nötig (hier ' + list.length + ').');
    const noStop = list.filter((j) => j.sl == null || !isFinite(j.sl)).length;
    if (noStop) why.push(noStop + (noStop === 1 ? ' Trade ohne' : ' Trades ohne') + ' Stop-Loss. Jeder Trade braucht einen Stop.');
    const best = list.reduce((m, j) => Math.max(m, j.pnl || 0), 0);
    if (p.net > 0 && best / p.net > RULES.consistency) {
      why.push('Konsistenzregel: Dein größter Trade (' + fmt(best) + ') macht ' + Math.round(best / p.net * 100) + ' % des Gewinns aus, erlaubt sind ' + Math.round(RULES.consistency * 100) + ' %.');
    }
    out.state = why.length ? 'blocked' : 'ready';
    return out;
  }

  /* Alle Sessions bewerten. ctx: { Core, sess, activeId, runningIds:Set, fmt } */
  function plan(journal, cfg, claims, ctx) {
    const closed = (journal || []).filter((j) => j && j.status === 'closed');
    const by = new Map();
    for (const j of closed) { const k = j.replay != null ? j.replay : 'ohne'; if (!by.has(k)) by.set(k, []); by.get(k).push(j); }
    const ps = ctx.Core.propBySession(closed, cfg, ctx.sess).filter((p) => p.replay !== 'ohne' && p.replay !== ctx.activeId);
    return ps.map((p) => ({ p, a: assess(p, by.get(p.replay) || [], cfg, claims, { running: !!(ctx.runningIds && ctx.runningIds.has(p.replay)), fmt: ctx.fmt }) }));
  }

  /* Neue Kataloge in den Pass einhängen, damit Anzeige und Auswahl dort funktionieren */
  function register(P) {
    if (!P || P._shop) return;
    P._shop = true;
    for (const [id, d] of Object.entries(DEFS.theme)) P.THEMES[id] = { name: d.name, c: d.c };
    for (const [id, d] of Object.entries(DEFS.avatar)) P.AVATARS[id] = [d.name, d.svg];
    for (const [id, d] of Object.entries(DEFS.frame)) P.FRAMES[id] = d.name;
    for (const [id, d] of Object.entries(DEFS.title)) P.TITLES[id] = d.name;
  }
  if (typeof PassCore !== 'undefined') register(PassCore);

  return { RULES, DEFS, TYPES, TYPE_LABEL, TYPE_ONE, def, isShopItem, keyOf, parseKey, sanitize, owns, wallet, limits, payoutOf, assess, plan, register };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ShopCore;

/* ---------- Oberfläche ---------- */
const Shop = {
  _data: null,
  /* Stand aus den Einstellungen, immer geglättet */
  state() {
    const raw = App.settings.shop, n = ShopCore.sanitize(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(n)) App.settings.shop = n;
    return App.settings.shop;
  },
  owns(type, id) { return ShopCore.owns(this.state(), type, id); },
  /* Gekaufte Dinge, die es nicht (mehr) gibt oder nicht gehören, werden im Pass zurückgesetzt */
  guard(s) {
    const sh = this.state(), dflt = { theme: 'standard', avatar: 'kerze', frame: 'keiner', title: 'auto' };
    for (const t of Object.keys(dflt)) if (s[t] && ShopCore.isShopItem(t, s[t]) && !ShopCore.owns(sh, t, s[t])) s[t] = dflt[t];
  },
  applyCandles() {
    const sh = this.state(), root = document.documentElement;
    if (!ShopCore.owns(sh, 'candles', sh.candles)) sh.candles = 'standard'; /* nicht gekaufte Kerzenfarben gibt es nicht */
    const id = sh.candles;
    if (id === 'standard') root.removeAttribute('data-candles'); else root.setAttribute('data-candles', id);
  },

  /* Sessions mit Payout-Stand. Die laufende Session bleibt außen vor (Blind-Modus). */
  data() {
    const running = new Set((App.sessions || []).filter((s) => s && s.replayId != null && App.isRunning(s)).map((s) => s.replayId));
    const rows = ShopCore.plan(App.journal || [], App.propCfg(), this.state().claims, {
      Core, sess: App.sess, activeId: App.replay && App.replay.active ? App.replay.id : null, runningIds: running, fmt: (v) => App.fmtMoney(v)
    });
    return { rows, on: !!App.settings.prop.on, cfg: App.propCfg() };
  },
  readyRows() { const d = this.data(); return d.on ? d.rows.filter((r) => r.a.state === 'ready') : []; },

  claim(key) {
    const d = this.data(), row = d.rows.find((r) => r.a.key === String(key));
    if (!d.on || !row || row.a.state !== 'ready') { App.toast('Dieses Payout ist nicht verfügbar.', 'warn'); this.render(); return; }
    this.state().claims[row.a.key] = { t: Math.floor(Date.now() / 1000), c: row.a.coins, n: Math.round(row.p.net * 100) / 100 };
    App.saveSettings();
    App.toast('Payout: ' + App.fmtMoney(row.a.usd) + ' ausgezahlt, +' + row.a.coins + ' Coins.', 'good');
    this.render();
  },

  equip(type, id) {
    if (!this.owns(type, id)) return;
    if (type === 'candles') { this.state().candles = id; this.applyCandles(); if (typeof readColors === 'function') readColors(); App.requestRender(); }
    else Pass.equip(type, id);
    App.saveSettings();
  },
  async buy(type, id) {
    const d = ShopCore.def(type, id); if (!d) return;
    const sh = this.state();
    if (this.owns(type, id)) { this.equip(type, id); this.render(); return; }
    const w = ShopCore.wallet(sh);
    if (w.raw < d.price) { App.toast('Dir fehlen noch ' + (d.price - w.raw) + ' Coins. Coins gibt es für saubere Payouts.', 'warn'); return; }
    if (!(await App.confirm(ShopCore.TYPE_ONE[type] + ' „' + d.name + '“ kaufen?', 'Das kostet ' + d.price + ' Coins. Du hast danach ' + (w.raw - d.price) + ' Coins.', 'Kaufen'))) return;
    sh.owned[ShopCore.keyOf(type, id)] = { t: Math.floor(Date.now() / 1000), p: d.price };
    this.equip(type, id);
    App.toast('Gekauft und aktiviert: ' + d.name + '.', 'good');
    this.render();
  },

  /* Hinweis, sobald ein Payout bereitsteht – einmal je Session */
  notify() {
    try {
      const seen = new Set(store.get('elr.shop.seen', []) || []);
      const fresh = this.readyRows().filter((r) => !seen.has(r.a.key));
      if (!fresh.length) return;
      fresh.forEach((r) => seen.add(r.a.key));
      store.set('elr.shop.seen', [...seen].slice(-200));
      App.toast('Payout bereit: Ziel erreicht, Regeln eingehalten. Im Shop abholen.', 'good', { action: 'Zum Shop', onAction: () => { location.hash = '#shop'; } });
    } catch (_) { /* egal */ }
  },

  /* Kleine Karte für die Übersicht – nur wenn es etwas zu zeigen gibt */
  chip() {
    try {
      const sh = this.state(), w = ShopCore.wallet(sh), ready = this.readyRows().length;
      if (!ready && !w.payouts && !Object.keys(sh.owned).length) return '';
      return '<a class="pass-chip shop-chip" href="#shop" aria-label="Shop öffnen"><span class="pav pav-s fr-keiner">' + this.coinSvg() + '</span>' +
        '<span class="pc-main"><b>' + App.fmtN(w.balance, 0) + ' Coins</b><small>' + (ready ? ready + (ready === 1 ? ' Payout bereit' : ' Payouts bereit') + ' · im Shop abholen' : 'Shop: Designs und mehr') + '</small></span>' +
        (ready ? '<span class="pc-streak num">Payout bereit</span>' : '') + '</a>';
    } catch (_) { return ''; }
  },

  coinSvg() { return '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12"/><path d="M16 8.5v15M19.8 12.2c-.9-1.7-7.6-2-7.6 1.6 0 3.8 7.6 1.9 7.6 5.7 0 3.4-6.7 3.2-7.6 1.3"/></svg>'; },
  candleSvg(c) {
    const k = (x, top, h, col) => '<path d="M' + (x + 3) + ' ' + (top - 4) + 'v' + (h + 8) + '" stroke="' + col + '"/><rect x="' + x + '" y="' + top + '" width="6" height="' + h + '" fill="' + col + '" stroke="' + col + '"/>';
    return '<svg viewBox="0 0 50 36" width="56" height="40" aria-hidden="true" stroke-width="1.4">' + k(6, 14, 12, c[1]) + k(18, 8, 14, c[0]) + k(30, 12, 10, c[1]) + k(42 - 2, 6, 16, c[0]) + '</svg>';
  },
  vis(type, id) {
    if (type === 'candles') return this.candleSvg(ShopCore.DEFS.candles[id].c);
    if (type === 'title') return '<span class="ttl si-ttl">' + esc(ShopCore.DEFS.title[id].name) + '</span>';
    return Pass.rewardVis({ type, id }, type !== 'theme');
  },
  isOn(type, id) {
    if (type === 'candles') return this.state().candles === id;
    const s = Pass.state();
    return type === 'title' ? s.title === id : s[type] === id;
  },

  onClick(e) {
    const c = e.target.closest('[data-claim]');
    if (c) { this.claim(c.dataset.claim); return; }
    const b = e.target.closest('[data-buy]');
    if (b) { const [t, ...r] = b.dataset.buy.split(':'); this.buy(t, r.join(':')); }
  },

  render() {
    const el = $('#shopBody'); if (!el) return;
    if (!el._bound) { el._bound = true; el.addEventListener('click', (e) => this.onClick(e)); }
    const sh = this.state(), w = ShopCore.wallet(sh), d = this.data(), R = ShopCore.RULES, fmt = (v) => App.fmtN(v, 0);
    const reached = d.rows.filter((r) => r.a.state !== 'open');
    const ready = reached.filter((r) => r.a.state === 'ready').length;
    let h = '<div class="st-head"><div><h1>Shop</h1><p class="page-sub">Payouts aus sauber gehandelten Challenges. Coins gibt es nur für Konten, die die Regeln einhalten.</p></div></div>';
    /* Wallet */
    h += '<section class="card pass-hero"><span class="pav pav-l fr-keiner">' + this.coinSvg() + '</span>' +
      '<div class="ph-main"><div class="ph-top"><span class="ph-lvl num" id="shopBal">' + fmt(w.balance) + ' Coins</span><span class="ph-title">Wallet</span></div>' +
      '<div class="ph-sub"><span>' + (ready ? '<b class="coin">' + ready + (ready === 1 ? ' Payout' : ' Payouts') + ' bereit</b>' : 'Kein Payout offen') + '</span></div></div>' +
      '<div class="ph-stats"><div><b class="num">' + w.payouts + '</b><span>Payouts</span></div><div><b class="num">' + fmt(w.earned) + '</b><span>Verdient</span></div><div><b class="num">' + fmt(w.spent) + '</b><span>Ausgegeben</span></div></div></section>';
    /* Payouts */
    h += '<section class="card"><div class="card-h"><h3>Payouts</h3><span class="hint">Jede Session ist ein eigenes Konto und wird einmal ausgezahlt.</span></div>';
    if (!d.on) h += '<p class="hint">Die Prop-Regeln sind in den Einstellungen ausgeschaltet. Schalte sie ein, dann zählen Sessions als Challenge.</p>';
    else if (!reached.length) h += '<p class="hint">Noch keine Session hat das Gewinnziel (' + App.fmtMoney(d.cfg.target) + ') erreicht. Starte eine Backtest-Session, setze bei jedem Trade einen Stop und halte die Prop-Regeln ein.</p>';
    else {
      const order = { ready: 0, blocked: 1, claimed: 2, breach: 3 };
      const rows = reached.slice().sort((a, b) => order[a.a.state] - order[b.a.state] || b.p.t - a.p.t).slice(0, 30);
      h += '<div class="tbl-wrap"><table class="tbl pay-tbl"><tr><th>Session</th><th>Trades</th><th>Netto</th><th>Payout</th></tr>' + rows.map(({ p, a }) => {
        let cell;
        if (a.state === 'ready') cell = '<button type="button" class="btn sm primary" data-claim="' + esc(a.key) + '">Payout anfordern</button><small class="pay-note">' + esc(App.fmtMoney(a.usd)) + ' · +' + a.coins + ' Coins</small>';
        else if (a.state === 'claimed') cell = '<span class="up">Ausgezahlt · +' + a.coins + ' Coins</span><small class="pay-note">' + esc(App.fmtDate(a.claim.t)) + '</small>';
        else if (a.state === 'breach') cell = '<span class="dn">Kein Payout</span><small class="pay-note">Regelverstoß: ' + esc(a.breach) + '</small>';
        else cell = '<span class="dn">Noch nicht möglich</span><small class="pay-note">' + a.reasons.map(esc).join('<br>') + '</small>';
        return '<tr><td>' + esc(UI.sessLabel(p.replay)) + '</td><td>' + p.n + '</td><td class="' + (p.net >= 0 ? 'up' : 'dn') + '">' + App.fmtMoney(p.net, true) + '</td><td class="pay-cell">' + cell + '</td></tr>';
      }).join('') + '</table></div>';
    }
    h += '</section>';
    /* Regeln */
    const lim = ShopCore.limits(d.cfg), pc = (x) => Math.round(x * 100);
    h += '<section class="card"><div class="card-h"><h3>So klappt das Payout</h3></div><ul class="prules">' +
      '<li><span>Gewinnziel erreicht, kein Regelverstoß<small>Max. Drawdown und Tagesverlust-Limit, wie in den Einstellungen</small></span><b>Pflicht</b></li>' +
      '<li><span>Session beendet, mindestens ' + R.minTrades + ' Trades, jeder mit Stop-Loss</span><b>Pflicht</b></li>' +
      '<li><span>Konsistenzregel<small>Dein größter Trade darf höchstens ' + pc(R.consistency) + ' % des Gewinns ausmachen, wie bei echten Funded-Accounts</small></span><b class="num">' + pc(R.consistency) + ' %</b></li>' +
      '<li><span>Fairer Rahmen<small>Ziel mindestens ' + pc(R.minTargetPct) + ' %, Max. Drawdown höchstens ' + pc(R.maxDDPct) + ' % des Startkapitals, Tagesverlust-Limit gesetzt</small></span><b class="' + (lim.length ? 'dn' : 'up') + '">' + (lim.length ? 'nicht erfüllt' : 'erfüllt') + '</b></li>' +
      '<li><span>Auszahlung<small>' + pc(R.split) + ' % des Gewinns, höchstens bis zum ' + R.cap + '-fachen Ziel. 1 Coin je 1 % des Ziels, also ' + Math.round(R.split * 100) + ' bis ' + Math.round(R.split * R.cap * 100) + ' Coins</small></span><b class="num">' + pc(R.split) + ' %</b></li></ul>' +
      (lim.length && d.on ? '<p class="hint dn">' + lim.map(esc).join(' ') + ' Passe das in den Einstellungen an, sonst gibt es kein Payout.</p>' : '') +
      '<p class="hint">Der Pass bleibt davon getrennt: XP gibt es weiter nur für Prozess. Coins sind nur für den Shop.</p></section>';
    /* Shop */
    for (const type of ShopCore.TYPES) {
      const items = Object.entries(ShopCore.DEFS[type]).sort((a, b) => a[1].price - b[1].price);
      h += '<section class="card"><div class="card-h"><h3>' + ShopCore.TYPE_LABEL[type] + '</h3></div><div class="shop-grid">' + items.map(([id, it]) => {
        const own = ShopCore.owns(sh, type, id), on = own && this.isOn(type, id), afford = w.raw >= it.price;
        const btn = on ? '<button type="button" class="btn sm" disabled>Aktiv</button>'
          : own ? '<button type="button" class="btn sm" data-buy="' + type + ':' + id + '">Tragen</button>'
            : '<button type="button" class="btn sm' + (afford ? ' primary' : '') + '" data-buy="' + type + ':' + id + '"' + (afford ? '' : ' aria-disabled="true"') + '>Kaufen · ' + it.price + '</button>';
        return '<div class="si' + (on ? ' on' : '') + (own ? ' own' : '') + '"><div class="si-vis">' + this.vis(type, id) + '</div><b>' + esc(it.name) + '</b><small>' + (own ? (it.price ? 'Gekauft' : 'Standard') : it.price + ' Coins') + '</small>' + btn + '</div>';
      }).join('') + '</div></section>';
    }
    el.innerHTML = h;
  }
};
