/* Shop: Payout-Regeln, Coins, Guthaben, Glättung. Reine Rechnung, ohne Browser. */
const C = require('./core.js'), S = require('./shop.js');
let fails = 0, passes = 0;
const eq = (n, g, e) => { if (JSON.stringify(g) === JSON.stringify(e)) passes++; else { fails++; console.log('FAIL', n, 'got', JSON.stringify(g), 'exp', JSON.stringify(e)); } };
const cfg = { start: 50000, maxDD: 2000, dailyLoss: 1000, target: 3000 };
const DAY = 86400, T0 = Date.UTC(2024, 4, 6, 14) / 1000;
const tr = (rid, i, pnl, o) => Object.assign({ id: rid + '-' + i, replay: rid, status: 'closed', sym: 'NQ', pnl, sl: 10, entryT: T0 + i * 600, exitT: T0 + i * 600 + 300, sess: { tz: 'UTC', hour: 0 } }, o || {});
const mk = (rid, pnls, o) => pnls.map((p, i) => tr(rid, i, p, o && o(i)));
const run = (journal, claims, ctx) => S.plan(journal, cfg, claims || {}, Object.assign({ Core: C, sess: { tz: 'UTC', hour: 0 } }, ctx));
const one = (journal, claims, ctx) => run(journal, claims, ctx)[0].a;

/* Auszahlung: 80 %, gedeckelt bei 2-fachem Ziel, 1 Coin je 1 % des Ziels */
eq('Payout genau Ziel', S.payoutOf(3000, 3000), { usd: 2400, coins: 80 });
eq('Payout 3300', S.payoutOf(3300, 3000), { usd: 2640, coins: 88 });
eq('Payout gedeckelt', S.payoutOf(9000, 3000), { usd: 4800, coins: 160 });
eq('Payout ohne Gewinn', S.payoutOf(-5, 3000), { usd: 0, coins: 0 });
eq('Payout ohne Ziel', S.payoutOf(500, 0), { usd: 0, coins: 0 });
eq('Coins hängen am Ziel, nicht an der Kontogröße', S.payoutOf(600, 500).coins, S.payoutOf(6000, 5000).coins);

/* Saubere Session: bereit */
let a = one(mk(1, [1000, 1000, 800, 500]));
eq('sauber → bereit', [a.state, a.reasons.length, a.coins], ['ready', 0, 88]);

/* Ziel nicht erreicht → offen */
a = one(mk(2, [500, 500, 400]));
eq('Ziel nicht erreicht → offen', a.state, 'open');

/* Regelverstoß (Tagesverlust) trotz Ziel → kein Payout */
a = one(mk(3, [-1100, 2000, 2000, 1500]));
eq('Tagesverlust → breach', [a.state, a.breach], ['breach', 'Tagesverlust-Limit']);

/* Konsistenzregel: ein Trade über 50 % */
a = one(mk(4, [2500, 400, 300]));
eq('Konsistenz verletzt → blocked', a.state, 'blocked');
eq('Konsistenz-Text nennt Anteil', /Konsistenzregel.*78 %/.test(a.reasons.join(' ')), true);
a = one(mk(4, [1500, 1000, 500]));
eq('genau 50 % ist erlaubt', a.state, 'ready');

/* Stop-Loss-Pflicht */
a = one(mk(5, [1000, 1000, 800, 500], (i) => (i === 2 ? { sl: null } : {})));
eq('Trade ohne Stop → blocked', [a.state, /1 Trade ohne Stop/.test(a.reasons.join(' '))], ['blocked', true]);

/* Mindestens 3 Trades */
a = one(mk(6, [1800, 1700]));
eq('zu wenig Trades → blocked', [a.state, /Mindestens 3 Trades/.test(a.reasons.join(' '))], ['blocked', true]);

/* Session läuft noch */
a = one(mk(7, [1000, 1000, 800, 500]), {}, { runningIds: new Set([7]) });
eq('laufende Session → blocked', [a.state, /läuft noch/.test(a.reasons.join(' '))], ['blocked', true]);

/* Aktive Session erscheint gar nicht (Blind-Modus) */
eq('aktive Session ausgeblendet', run(mk(8, [1000, 1000, 800, 500]), {}, { activeId: 8 }).length, 0);
eq('Trades ohne Session ausgeblendet', run(mk(null, [1000, 1000, 800, 500]).map((t) => Object.assign(t, { replay: undefined }))).length, 0);

/* Nur einmal einlösbar */
a = one(mk(9, [1000, 1000, 800, 500]), { 9: { t: 1, c: 88, n: 3300 } });
eq('bereits eingelöst', [a.state, a.coins], ['claimed', 88]);
a = one(mk(9, [1000, 1000, 800, 500]).concat(mk(9, [-3000]).map((t) => Object.assign(t, { id: 'x', exitT: T0 + 5000 }))), { 9: { t: 1, c: 88, n: 3300 } });
eq('eingelöst bleibt eingelöst, auch wenn danach Verluste kommen', a.state, 'claimed');

/* Mehrere Sessions getrennt */
const rows = run(mk(1, [1000, 1000, 800, 500]).concat(mk(2, [500, 500])));
eq('zwei Sessions getrennt', rows.map((r) => r.a.state).sort(), ['open', 'ready']);

/* Grenzen der Challenge: kein Freifahrtschein durch Mini-Ziel oder riesiges Drawdown */
const bad = (o) => S.limits(Object.assign({}, cfg, o)).length;
eq('Standard ist in Ordnung', bad({}), 0);
eq('Ziel 1 $ → nicht erlaubt', bad({ target: 1 }), 1);
eq('Ziel 3 % ist ok, 2 % nicht', [bad({ target: 1500 }), bad({ target: 1499 })], [0, 1]);
eq('Drawdown 8 % ok, 9 % nicht', [bad({ maxDD: 4000 }), bad({ maxDD: 4500 })], [0, 1]);
eq('ohne Drawdown nicht erlaubt', bad({ maxDD: 0 }), 1);
eq('ohne Tageslimit nicht erlaubt', bad({ dailyLoss: 0 }), 1);
const weak = S.plan(mk(1, [100, 100, 100, 100]), { start: 50000, maxDD: 20000, dailyLoss: 0, target: 50 }, {}, { Core: C, sess: { tz: 'UTC', hour: 0 } })[0].a;
eq('Mini-Challenge → blocked mit drei Gründen', [weak.state, weak.reasons.length], ['blocked', 3]);

/* Guthaben = Auszahlungen minus Käufe */
let sh = S.sanitize({ claims: { a: { t: 1, c: 80, n: 3000 }, b: { t: 2, c: 120, n: 4500 } }, owned: { 'theme:rubin': { t: 3, p: 180 } } });
eq('Wallet', S.wallet(sh), { earned: 200, spent: 180, payouts: 2, raw: 20, balance: 20 });
eq('Besitz erkannt', [S.owns(sh, 'theme', 'rubin'), S.owns(sh, 'theme', 'ozean'), S.owns(sh, 'theme', 'standard') /* kein Shop-Teil */, S.owns(sh, 'candles', 'standard'), S.owns(sh, 'avatar', 'gibtsnicht')], [true, false, false, true, false]);

/* Glättung: Unbekanntes, Negatives und Übergroßes fliegt raus */
sh = S.sanitize({ claims: { ok: { t: 1, c: 100 }, neg: { c: -5 }, huge: { c: 5000 }, nan: { c: 'x' }, leer: null }, owned: { 'theme:rubin': { t: 1, p: 180 }, 'theme:standard': { t: 1, p: 0 }, 'quatsch': { t: 1, p: 5 }, 'avatar:nix': { t: 1, p: 5 }, 'title:funded': { t: 1, p: -50 } }, candles: 'gibtsnicht' });
eq('claims geglättet', Object.keys(sh.claims), ['ok']);
eq('owned geglättet', Object.keys(sh.owned).sort(), ['theme:rubin', 'title:funded']);
eq('negativer Preis → Katalogpreis', sh.owned['title:funded'].p, 80);
eq('unbekannte Kerzenfarbe → Standard', sh.candles, 'standard');
eq('Leere Einstellungen', S.sanitize(undefined), { claims: {}, owned: {}, candles: 'standard' });
eq('Prototyp-Schlüssel kein Treffer', [S.def('theme', 'constructor'), S.def('theme', '__proto__'), S.owns({ owned: {} }, 'theme', 'toString')], [null, null, false]);

/* Katalog */
let items = 0, free = 0;
for (const t of S.TYPES) for (const [id, d] of Object.entries(S.DEFS[t])) { items++; if (!(d.price > 0)) free++; if (!(d.name && /^[a-z]+$/.test(id))) { fails++; console.log('FAIL Katalog', t, id); } }
eq('Katalog-Größe', [items, free], [24, 1]);
eq('nur die Standard-Kerzenfarbe ist kostenlos', S.DEFS.candles.standard.price, 0);
const cheapest = Math.min(...S.TYPES.flatMap((t) => Object.values(S.DEFS[t]).map((d) => d.price).filter((p) => p > 0)));
eq('günstigstes Teil kostet weniger als ein Mindest-Payout', cheapest < 80, true);

console.log(fails ? 'FEHLER: ' + fails : 'Alles ok (' + passes + ' Prüfungen)');
process.exit(fails ? 1 : 0);
