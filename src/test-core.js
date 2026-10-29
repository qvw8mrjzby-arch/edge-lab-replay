const C = require('./core.js');
let fails = 0, passes = 0;
function eq(name, got, exp, tol) {
  const ok = tol != null ? Math.abs(got - exp) <= tol : JSON.stringify(got) === JSON.stringify(exp);
  if (ok) passes++; else { fails++; console.log('FAIL', name, 'got', got, 'exp', exp); }
}
const iso = (t) => new Date(t * 1000).toISOString();
const NY = { tz: 'America/New_York', hour: 18 };

/* Zeitzonen / Sessions inkl. Sommerzeit-Wechsel (USA: 8.3.2026, 1.11.2026) */
eq('off winter', C.tzOffset(Date.UTC(2026, 0, 15, 12) / 1000, 'America/New_York'), -300);
eq('off summer', C.tzOffset(Date.UTC(2026, 6, 15, 12) / 1000, 'America/New_York'), -240);
eq('off berlin summer', C.tzOffset(Date.UTC(2026, 6, 15, 12) / 1000, 'Europe/Berlin'), 120);
eq('sess EST', iso(C.sessionStart(Date.UTC(2026, 2, 6, 15) / 1000, NY)), '2026-03-05T23:00:00.000Z');
eq('sess EDT', iso(C.sessionStart(Date.UTC(2026, 2, 9, 14) / 1000, NY)), '2026-03-08T22:00:00.000Z');
eq('sess DST-Sonntag', iso(C.sessionStart(Date.UTC(2026, 2, 8, 23) / 1000, NY)), '2026-03-08T22:00:00.000Z');
eq('sess 17:30 ET gehört zum Vortag-Start', iso(C.sessionStart(Date.UTC(2026, 6, 15, 21, 30) / 1000, NY)), '2026-07-14T22:00:00.000Z');
eq('sess 18:00 ET neue Session', iso(C.sessionStart(Date.UTC(2026, 6, 15, 22, 0) / 1000, NY)), '2026-07-15T22:00:00.000Z');
eq('sess Nov DST-Ende', iso(C.sessionStart(Date.UTC(2026, 10, 2, 15) / 1000, NY)), '2026-11-01T23:00:00.000Z');
eq('sess UTC', iso(C.sessionStart(Date.UTC(2026, 6, 15, 13, 7) / 1000, { tz: 'UTC', hour: 0 })), '2026-07-15T00:00:00.000Z');
eq('zonedToUtc', iso(C.zonedToUtc(2026, 7, 15, 9, 30, 0, 'America/New_York')), '2026-07-15T13:30:00.000Z');
eq('4h-Bucket ab Session', iso(C.bucketStart(Date.UTC(2026, 6, 15, 3, 10) / 1000, 14400, NY)), '2026-07-15T02:00:00.000Z');
eq('1D-Bucket', iso(C.bucketStart(Date.UTC(2026, 6, 15, 3, 10) / 1000, 86400, NY)), '2026-07-14T22:00:00.000Z');

/* Basisdaten + Delta */
const t0 = Date.UTC(2026, 6, 15, 13, 30) / 1000;
const raw = [
  { t: t0, o: 100, h: 102, l: 99, c: 101, v: 10, bv: 7 },
  { t: t0 + 60, o: 101, h: 103, l: 100, c: 102, v: 20, bv: 8 },
  { t: t0 + 120, o: 102, h: 102, l: 98, c: 99, v: 30, bv: null },
  { t: t0 + 180, o: 99, h: 100, l: 97, c: 98, v: 0, bv: null },
  { t: t0 + 240, o: 98, h: 101, l: 98, c: 100, v: 10, bv: 5 },
  { t: t0 + 300, o: 100, h: 101, l: 99.5, c: 100.5, v: 5, bv: 5 }
];
const prep = C.prepareBase(JSON.parse(JSON.stringify(raw)));
const base = prep.bars;
eq('delta echt', base[0].d, 4);
eq('delta echt 2', base[1].d, -4);
/* geschätzt: v*((c-l)-(h-c))/(h-l) = 30*((1)-(3))/4 = -15 */
eq('delta geschätzt', base[2].d, -15);
eq('delta est flag', base[2].est, true);

/* VWAP: tp = (h+l+c)/3 */
const s = C.computeBaseSeries(base, NY, true);
const tp = base.map((b) => (b.h + b.l + b.c) / 3);
const exp2 = (tp[0] * 10 + tp[1] * 20 + tp[2] * 30) / 60;
eq('vwap i2', s.vwap[2], exp2, 1e-9);
const var2 = (tp[0] ** 2 * 10 + tp[1] ** 2 * 20 + tp[2] ** 2 * 30) / 60 - exp2 ** 2;
eq('sd i2', s.sd[2], Math.sqrt(var2), 1e-9);
eq('vwap bei Volumen 0 unverändert', s.vwap[3], exp2, 1e-9);
eq('cvd', s.cvd[2], 4 - 4 - 15);

/* Aggregation 5m */
const ag = C.aggregate(base, 300, NY);
eq('agg anzahl', ag.bars.length, 2);
eq('agg ohlc', [ag.bars[0].o, ag.bars[0].h, ag.bars[0].l, ag.bars[0].c, ag.bars[0].v], [100, 103, 97, 100, 70]);
eq('agg i0 i1', [ag.bars[0].i0, ag.bars[0].i1, ag.bars[1].i0], [0, 4, 5]);
const part = C.partialBar(base, ag.bars[0], 2);
eq('teilkerze', [part.o, part.h, part.l, part.c, part.v], [100, 103, 98, 99, 60]);

/* EMA (Start mit SMA) */
const eb = [1, 2, 3, 4, 5].map((c) => ({ c }));
const e = C.emaArray(eb, 3);
eq('ema seed', e[2], 2);
eq('ema i3', e[3], 0.5 * 4 + 0.5 * 2);
eq('ema next', C.emaNext(e[3], 5, 3), e[4]);

/* Value Area */
const prof = { r0: 0, row: 1, v: Float64Array.from([1, 2, 10, 4, 3, 1]) };
const va = C.valueArea(prof, 0.7);
/* total 21, Ziel 14.7: POC 2 (10) → oben 4+3=7 vs unten 2+1=3 → +7 = 17 ≥ 14.7 */
eq('va poc', va.poc, 2.5);
eq('va vah', va.vah, 5);
eq('va val', va.val, 2);

/* Profil aus Bars: Volumen bleibt erhalten */
const pb = C.profileFromBars(base, 0, 5, 1);
eq('profil summe', Array.from(pb.v).reduce((a, b) => a + b, 0), 75, 1e-9);

/* Engine */
const cfg = { tick: 0.25, pv: 20, slipTicks: 1, feeFix: 2, feePct: 0, intrabar: 'conservative' };
let E = new C.Engine(cfg);
let bar = { t: 0, o: 100, h: 100, l: 100, c: 100 };
let o = E.place({ side: 1, type: 'limit', price: 99, qty: 2, sl: 98, tp: 102 }, bar, 0);
E.onBar({ t: 60, o: 100, h: 100.5, l: 99.5, c: 100 }, 1);
eq('limit nicht gefüllt', o.status, 'pending');
E.onBar({ t: 120, o: 100, h: 100.25, l: 98.75, c: 99.5 }, 2);
eq('limit gefüllt', [o.status, o.entryPrice], ['open', 99]);
E.onBar({ t: 180, o: 99.5, h: 102.5, l: 97.5, c: 101 }, 3);
/* beide getroffen, konservativ → SL mit 1 Tick Slippage */
eq('konservativ SL', [o.status, o.reason, o.exitPrice], ['closed', 'SL', 97.75]);
/* PnL: (97.75-99)*2*20 = -50, Gebühren 2*2*2 = 8 → -58; Risiko 1*2*20 = 40 → R = -1.45 */
eq('pnl', o.pnl, -58, 1e-9);
eq('r', o.r, -1.45, 1e-9);

E = new C.Engine(Object.assign({}, cfg, { intrabar: 'path' }));
o = E.place({ side: 1, type: 'market', qty: 1, sl: 98, tp: 102 }, bar, 0);
eq('market füllt mit Slippage', o.entryPrice, 100.25);
E.onBar({ t: 60, o: 100, h: 102.5, l: 97.5, c: 99 }, 1); /* bärisch: O→H→L → TP zuerst */
eq('pfad TP', [o.reason, o.exitPrice], ['TP', 102]);

E = new C.Engine(cfg);
o = E.place({ side: -1, type: 'market', qty: 1, sl: 101, tp: 95 }, bar, 0);
E.onBar({ t: 60, o: 102, h: 103, l: 101.5, c: 102.5 }, 1); /* Gap über SL → Ausstieg zum Open + Slippage */
eq('gap SL short', [o.reason, o.exitPrice], ['SL', 102.25]);

E = new C.Engine(cfg);
o = E.place({ side: 1, type: 'stop', price: 101, qty: 1, sl: 99, tp: 105 }, bar, 0);
E.onBar({ t: 60, o: 100, h: 101.5, l: 100, c: 101.25 }, 1);
eq('stop gefüllt + slip', [o.status, o.entryPrice], ['open', 101.25]);
E.onBar({ t: 120, o: 101.25, h: 106, l: 101, c: 105.5 }, 2);
eq('tp', [o.reason, o.exitPrice], ['TP', 105]);
eq('mfe gedeckelt bei Ausstieg', o.mfe, 105 - 101.25);

E = new C.Engine(cfg);
o = E.place({ side: 1, type: 'limit', price: 99, qty: 1, sl: 98.5, tp: 103 }, bar, 0);
E.onBar({ t: 60, o: 99.5, h: 99.75, l: 98, c: 99 }, 1); /* Füllung und SL in derselben Kerze */
eq('einstiegskerze SL konservativ', [o.status, o.reason, o.exitPrice], ['closed', 'SL', 98.25]);

E = new C.Engine(cfg);
o = E.place({ side: 1, type: 'limit', price: 99, qty: 1, sl: 98, tp: 103 }, bar, 0);
E.onBar({ t: 60, o: 98.5, h: 99, l: 98.25, c: 98.75 }, 1); /* Gap unter Limit → Füllung zum besseren Open */
eq('limit gap besserer Preis', o.entryPrice, 98.5);

eq('size from risk', C.sizeFromRisk(500, 100, 98, 20, 1), 12);
eq('size step', C.sizeFromRisk(100, 60000, 59500, 1, 0.001), 0.2);

/* Statistik */
const trades = [
  { status: 'closed', id: 1, side: 1, pnl: 100, fees: 4, r: 2, entryT: 0, exitT: 60 },
  { status: 'closed', id: 2, side: -1, pnl: -50, fees: 4, r: -1, entryT: 100, exitT: 200 },
  { status: 'closed', id: 3, side: 1, pnl: -50, fees: 4, r: -1, entryT: 300, exitT: 400 },
  { status: 'closed', id: 4, side: -1, pnl: 200, fees: 4, r: 4, entryT: 500, exitT: 600 }
];
const st = C.stats(trades, 1000);
eq('winrate', st.winRate, 50);
eq('pf', st.pf, 3);
eq('net', st.net, 200);
eq('maxdd', st.maxDD, 100);
eq('avgR', st.avgR, 1);
eq('streak', st.maxLossStreak, 2);

/* Prop-Check */
const pc = C.propCheck([
  { status: 'closed', id: 1, pnl: -600, exitT: Date.UTC(2026, 6, 15, 14) / 1000 },
  { status: 'closed', id: 2, pnl: -500, exitT: Date.UTC(2026, 6, 15, 15) / 1000 }
], { start: 50000, maxDD: 2000, dailyLoss: 1000 }, NY);
eq('daily loss breach', pc.breaches.map((b) => b.type), ['Tagesverlust-Limit']);
const pc2 = C.propCheck([
  { status: 'closed', id: 1, pnl: 1500, exitT: Date.UTC(2026, 6, 15, 14) / 1000 },
  { status: 'closed', id: 2, pnl: -1600, exitT: Date.UTC(2026, 6, 16, 14) / 1000 },
  { status: 'closed', id: 3, pnl: -400, exitT: Date.UTC(2026, 6, 17, 14) / 1000 }
], { start: 50000, maxDD: 2000, dailyLoss: 0 }, NY);
/* EOD-Hoch 51500 → Floor min(50000, 49500) = 49500; Saldo 49500 → Verletzung */
eq('trailing floor', pc2.floor, 49500);
eq('trailing breach', pc2.breaches.length, 1);

/* CSV */
let p = C.parseCSV('time,open,high,low,close,volume\n2026-07-15 09:30:00,1,2,0.5,1.5,10\n2026-07-15 09:31:00,1.5,2,1,1,5', 'America/New_York');
eq('csv header kind', p.kind, 'bars');
eq('csv tz', iso(p.rows[0].t), '2026-07-15T13:30:00.000Z');
p = C.parseCSV('Date;Time;Open;High;Low;Close;Volume\n15.07.2026;09:30;1;2;0.5;1.5;10', 'Europe/Berlin');
eq('csv deutsch getrennt', iso(p.rows[0].t), '2026-07-15T07:30:00.000Z');
p = C.parseCSV('1752586200000000,100,101,99,100.5,12.5,1752586259999999,1250,40,7.5,750,0\n', 'UTC');
eq('binance klines µs', [p.kind, p.rows[0].t, p.rows[0].bv], ['bars', 1752586200, 7.5]);
p = C.parseCSV('1,100.5,0.2,10,12,1752586200123,True,True\n2,100.6,0.3,13,13,1752586200456,False,True', 'UTC');
eq('binance aggTrades', [p.kind, p.rows[0].b, p.rows[1].b, p.rows[0].t], ['trades', false, true, 1752586200123]);
p = C.parseCSV('timestamp,price,size,side\n1752586200,100,3,buy\n1752586201,99.5,2,sell', 'UTC');
eq('trades header', [p.kind, p.rows[0].b, p.rows[1].b], ['trades', true, false]);
p = C.parseCSV('time,price,qty,is_buyer_maker\n1752586200000,100,1,true', 'UTC');
eq('maker spalte', p.rows[0].b, false);
p = C.parseCSV('Time,Open,High,Low,Close,Volume\n20260715 093000,1,2,0.5,1.5,10', 'America/New_York');
eq('ninja format', iso(p.rows[0].t), '2026-07-15T13:30:00.000Z');

/* Binance-API-Parser (Originalformat) */
const kl = C.parseBinanceKlines([[1752586200000, '100.10', '101.00', '99.50', '100.80', '12.345', 1752586259999, '1240.5', 321, '7.000', '702.1', '0']]);
eq('api klines', [kl[0].t, kl[0].o, kl[0].v, kl[0].bv], [1752586200, 100.1, 12.345, 7]);
const at = C.parseBinanceAggTrades([{ a: 26129, p: '0.01633102', q: '4.70443515', f: 27781, l: 27781, T: 1498793709153, m: true, M: true }]);
eq('api aggTrades', [at[0].b, at[0].t, at[0].p], [false, 1498793709153, 0.01633102]);

/* Footprint + Imbalance */
const tr = C.makeTrades([
  { t: 1, p: 100, q: 2, b: 0 }, { t: 2, p: 100, q: 1, b: 1 },
  { t: 3, p: 100.25, q: 9, b: 1 }, { t: 4, p: 100.25, q: 1, b: 0 },
  { t: 5, p: 100.5, q: 1, b: 1 }, { t: 6, p: 100.5, q: 6, b: 0 }
]);
const fp = C.footprint(tr, 0, 5, 0.25);
eq('fp delta', fp.delta, 11 - 9);
const im = C.imbalances(fp, 3, 1);
/* Ask 100.25 = 9 vs Bid 100 = 2 → 4.5x Kauf-Imbalance; Bid 100.25 = 1 vs Ask 100.5 = 1 → nein; Bid 100.5 = 6 vs Ask 100.75 (fehlt) → nein */
eq('imbalance kauf', !!(im.get(401) && im.get(401).buy), true);
eq('imbalance anzahl', im.size, 1);

/* Trades → Bars, Index */
const db = C.barsFromTrades(C.makeTrades([{ t: 60500, p: 10, q: 1, b: 1 }, { t: 61000, p: 11, q: 2, b: 0 }, { t: 125000, p: 9, q: 1, b: 1 }]), 60);
eq('bars from trades', db.map((b) => [b.t, b.o, b.h, b.c, b.v, b.bv]), [[60, 10, 11, 11, 3, 1], [120, 9, 9, 9, 1, 1]]);

/* Demo */
const t1 = Date.now();
const demo = C.demoData(8, 7);
const pd = C.prepareBase(demo.bars);
eq('demo ok', pd.bars.length > 8000 && demo.trades.n > 100000, true);
console.log('demo', pd.bars.length, 'bars', demo.trades.n, 'trades in', Date.now() - t1, 'ms', 'first', iso(pd.bars[0].t), 'last', iso(pd.bars[pd.bars.length - 1].t));
const it = C.indexTrades(pd.bars, 60, demo.trades, demo.cov);
eq('alle abgedeckt', it.cov.every((x) => x === 1), true);
let tsum = 0; for (let i = 0; i < pd.bars.length; i++) tsum += it.te[i] - it.ts[i] + 1;
eq('trades vollständig zugeordnet', tsum, demo.trades.n);

/* ===== Version 2: Funde der Mathe-Kontrolle ===== */
/* Fund 2: Einstiegskerze */
const cfg2 = { tick: 0.25, pv: 20, slipTicks: 1, feeFix: 0, feePct: 0, intrabar: 'conservative' };
/* (a) Gap über SL: Sell-Limit 100 (SL 101), Kerze öffnet 102 → Füllung 102 liegt schon über SL → Verlust */
E = new C.Engine(cfg2);
o = E.place({ side: -1, type: 'limit', price: 100, qty: 1, sl: 101, tp: 95 }, { t: 0, o: 99, h: 99, l: 99, c: 99 }, 0);
E.onBar({ t: 60, o: 102, h: 102.5, l: 101.5, c: 102 }, 1);
eq('F2a Gap über SL = Verlust', [o.status, o.reason, o.exitPrice, o.pnl < 0], ['closed', 'SL', 102.25, true]);
/* (b) optimistisch: TP-Gap (Füllung am Open jenseits des TP) darf kein Verlust werden */
E = new C.Engine(Object.assign({}, cfg2, { intrabar: 'optimistic', slipTicks: 0 }));
o = E.place({ side: 1, type: 'limit', price: 100, qty: 1, sl: 98, tp: 99 }, { t: 0, o: 101, h: 101, l: 101, c: 101 }, 0);
E.onBar({ t: 60, o: 100.5, h: 100.75, l: 99.5, c: 100 }, 1);
eq('F2b TP-Preis nie schlechter als Einstieg', o.status === 'closed' ? o.pnl >= 0 : true, true);
/* (c) optimistisch ignoriert sicheren SL nicht */
E = new C.Engine(Object.assign({}, cfg2, { intrabar: 'optimistic' }));
o = E.place({ side: 1, type: 'limit', price: 100, qty: 1, sl: 99, tp: 110 }, { t: 0, o: 101, h: 101, l: 101, c: 101 }, 0);
E.onBar({ t: 60, o: 100.5, h: 100.75, l: 98.5, c: 99 }, 1);
eq('F2c optimistisch: sicherer SL', [o.status, o.reason, o.exitPrice], ['closed', 'SL', 98.75]);
/* (d) konservativ: Stop-Einstieg → TP danach sicher erreicht */
E = new C.Engine(cfg2);
o = E.place({ side: 1, type: 'stop', price: 101, qty: 1, sl: 99, tp: 103 }, { t: 0, o: 100, h: 100, l: 100, c: 100 }, 0);
E.onBar({ t: 60, o: 100.5, h: 104, l: 100.25, c: 103.5 }, 1);
eq('F2d Stop-Einstieg: TP sicher', [o.status, o.reason, o.exitPrice], ['closed', 'TP', 103]);
/* (d2) Limit gefüllt am Open → TP sicher */
E = new C.Engine(cfg2);
o = E.place({ side: 1, type: 'limit', price: 100, qty: 1, sl: 98, tp: 101 }, { t: 0, o: 100.5, h: 100.5, l: 100.5, c: 100.5 }, 0);
E.onBar({ t: 60, o: 99.75, h: 101.5, l: 99.5, c: 101 }, 1);
eq('F2d2 Füllung am Open: TP sicher', [o.entryPrice, o.reason, o.exitPrice], [99.75, 'TP', 101]);
/* (d3) Limit innerhalb der Kerze, nur TP berührt → konservativ offen lassen */
E = new C.Engine(cfg2);
o = E.place({ side: 1, type: 'limit', price: 100, qty: 1, sl: 98, tp: 101 }, { t: 0, o: 100.5, h: 100.5, l: 100.5, c: 100.5 }, 0);
E.onBar({ t: 60, o: 100.5, h: 101.5, l: 99.75, c: 100.5 }, 1);
eq('F2d3 unklare Reihenfolge: offen', o.status, 'open');
eq('F2 MAE auf Einstiegskerze aus Tief', o.extLo, 99.75);
/* Fund 1: Forex-Gebühren je Lot statt je Einheit */
const fx = C.costCfgFor(C.costKeyFor('FOREX', 1, 1000), { slipTicks: 0, feeLot: 7, feePct: 0 }, 0.00001, 1);
E = new C.Engine(fx);
o = E.place({ side: 1, type: 'market', qty: C.sizeFromRisk(100, 1.1, 1.099, 1, 1000), sl: 1.099, tp: 1.102 }, { t: 0, o: 1.1, h: 1.1, l: 1.1, c: 1.1 }, 0);
E.closeAtMarket(o, { t: 60, o: 1.1, h: 1.1, l: 1.1, c: 1.1005 }, 1);
eq('F1 Forex-Menge', o.qty, 100000);
eq('F1 Forex-Gebühr 2×7 $ je Lot', o.fees, 14, 1e-9);
eq('F1 costKey Krypto', C.costKeyFor('CRYPTO', 1, 0.001), 'crypto');
/* Fund 6: TT/MM/JJJJ */
p = C.parseCSV('time,open,high,low,close\n03/07/2026 09:30,1,2,0.5,1.5\n15/07/2026 09:30,1,2,0.5,1.5', 'UTC');
eq('F6 ganze Datei TT/MM', [iso(p.rows[0].t), iso(p.rows[1].t)], ['2026-07-03T09:30:00.000Z', '2026-07-15T09:30:00.000Z']);
p = C.parseCSV('time,open,high,low,close\n07/03/2026 09:30,1,2,0.5,1.5', 'UTC');
eq('F6 US-Format bleibt', iso(p.rows[0].t), '2026-07-03T09:30:00.000Z');
eq('F6 ungültig = NaN', isNaN(C.parseTimeStr('13/13/2026', 'UTC')), true);
/* Fund 7: deutsche CSV mit Dezimalkomma */
p = C.parseCSV('Datum;Zeit;Eröffnung;Hoch;Tief;Schluss;Volumen\n15.07.2026;09:30;21.000,25;21.010,5;20.995;21.005,75;1.234\n15.07.2026;09:31;21005,75;21006;21001;21002;800', 'Europe/Berlin');
eq('F7 Dezimalkomma', [p.rows[0].o, p.rows[0].h, p.rows[0].c, p.rows[0].v, p.rows[1].o], [21000.25, 21010.5, 21005.75, 1234, 21005.75]);
eq('F7 Zeit', iso(p.rows[0].t), '2026-07-15T07:30:00.000Z');
/* Fund 8: Binance-Futures-Trades ohne Kopfzeile (6 Spalten) */
p = C.parseCSV('101,60000.1,0.5,30000.05,1752586200123,true\n102,60000.2,0.1,6000.02,1752586200200,false', 'UTC');
eq('F8 Futures-Trades', [p.kind, p.rows[0].b, p.rows[1].b, p.rows[0].p], ['trades', false, true, 60000.1]);
/* Fund 9: Millisekunden, 8-stelliges Datum */
eq('F9 ms', iso(C.parseTimeStr('15.07.2026 09:30:00.000', 'UTC')), '2026-07-15T09:30:00.000Z');
eq('F9 JJJJMMTT', iso(C.parseTimeStr('20260715', 'UTC')), '2026-07-15T00:00:00.000Z');
/* Fund 11: Zeitumstellung Herbst (Berlin 25.10.2026, 02:00–03:00 doppelt) */
p = C.parseCSV('time,open,high,low,close\n2026-10-25 02:30,1,1,1,1\n2026-10-25 02:45,1,1,1,1\n2026-10-25 02:00,1,1,1,1\n2026-10-25 02:15,1,1,1,1\n2026-10-25 03:00,1,1,1,1', 'Europe/Berlin');
const pp = C.prepareBase(p.rows);
eq('F11 doppelte Stunde nicht verworfen', [pp.bars.length, pp.dropped], [5, 0]);
eq('F11 Reihenfolge', pp.bars.map((b) => iso(b.t).slice(11, 16)), ['00:30', '00:45', '01:00', '01:15', '02:00']);

/* ===== A1: Databento ===== */
p = C.parseCSV('ts_recv,ts_event,rtype,publisher_id,instrument_id,action,side,depth,price,size,flags,ts_in_delta,sequence,symbol\n' +
  '2024-03-14T13:30:00.100000000Z,2024-03-14T13:30:00.000123456Z,0,1,42,T,B,0,18000250000000,2,0,0,1,NQH4\n' +
  '2024-03-14T13:30:00.200000000Z,2024-03-14T13:30:00.100000000Z,0,1,42,T,A,0,18000000000000,3,0,0,2,NQH4\n' +
  '2024-03-14T13:30:00.300000000Z,2024-03-14T13:30:00.200000000Z,0,1,42,T,N,0,18000000000000,1,0,0,3,NQH4\n' +
  '2024-03-14T13:30:00.300000000Z,2024-03-14T13:30:00.250000000Z,0,1,42,A,B,0,18000000000000,9,0,0,4,NQH4\n' +
  '2024-03-14T13:30:00.400000000Z,2024-03-14T13:30:00.300000000Z,0,1,43,T,B,0,18100000000000,1,0,0,5,NQM4', 'UTC', { sess: NY });
eq('A1 Databento Art', p.kind, 'trades');
eq('A1 Seiten B=Kauf A=Verkauf, N/Nicht-Trades raus, Kontrakt mit Volumen', p.rows.map((r) => [r.p, r.q, r.b]), [[18000.25, 2, true], [18000, 3, false]]);
eq('A1 ts_event mit Nanosekunden', p.rows[0].t, Date.UTC(2024, 2, 14, 13, 30, 0) + 0.123456, 1e-3);
p = C.parseCSV('ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol\n' +
  '2024-03-14T13:30:00.000000000Z,33,1,42,18000.25,18010.0,17990.5,18005.0,120,NQH4\n' +
  '2024-03-14T13:30:00.000000000Z,33,1,43,18100.25,18110.0,18090.5,18105.0,3,NQM4\n' +
  '2024-03-14T13:30:00.000000000Z,33,1,44,100,101,99,100,50,NQH4-NQM4\n' +
  '2024-03-14T13:31:00.000000000Z,33,1,42,18005.0,18012.0,18001.0,18011.0,90,NQH4', 'UTC', { sess: NY });
eq('A1 Databento OHLCV: nur Front-Kontrakt', p.rows.map((r) => r.o), [18000.25, 18005]);
/* Generische Trade-Datei: ask = Kauf (bisherige Logik) */
p = C.parseCSV('time,price,qty,side\n1752586200,100,1,ask\n1752586201,100,1,bid', 'UTC');
eq('A1 generisch ask=Kauf', [p.rows[0].b, p.rows[1].b], [true, false]);

/* ===== TradingView-Export ===== */
p = C.parseCSV('time,open,high,low,close,Volume,VWAP,Upper Band #1,EMA\n1710423000,18000.25,18010,17990.5,18005,1200,18001.2,18020,17999\n1710423060,18005,18012,18001,18011,900,18002,18021,18000', 'UTC');
eq('TV Unix-Sekunden', [p.kind, iso(p.rows[0].t), p.rows[0].v, p.rows[1].c], ['bars', '2024-03-14T13:30:00.000Z', 1200, 18011]);
p = C.parseCSV('time,open,high,low,close,Volume\n2024-03-14T09:30:00-04:00,1,2,0.5,1.5,10', 'Europe/Berlin');
eq('TV ISO mit Offset', iso(p.rows[0].t), '2024-03-14T13:30:00.000Z');

/* ===== A5: Teilausstieg, Break-even, Trailing ===== */
const cfg5 = { tick: 0.25, pv: 20, slipTicks: 0, feeFix: 2, feePct: 0, intrabar: 'conservative', qtyStep: 1 };
E = new C.Engine(cfg5);
o = E.place({ side: 1, type: 'market', qty: 4, sl: 90, tp: 120, mgmt: { tp1R: 1, tp1Pct: 50, beR: 1 } }, { t: 0, o: 100, h: 100, l: 100, c: 100 }, 0);
eq('A5 TP1-Level', [o.tp1, o.tp1Qty], [110, 2]);
let ev5 = E.onBar({ t: 60, o: 100, h: 111, l: 99, c: 108 }, 1);
eq('A5 Teilausstieg', [o.status, o.qtyOpen, o.partials.length, ev5.map((x) => x.type)], ['open', 2, 1, ['partial', 'be']]);
eq('A5 Stop auf Einstand', o.sl, 100);
E.onBar({ t: 120, o: 108, h: 108.5, l: 99.5, c: 100 }, 2);
eq('A5 Rest am Einstand', [o.status, o.reason, o.exitPrice], ['closed', 'Einstand', 100]);
/* PnL: 2×10×20 = 400 brutto + 0; Gebühren 4×2×2 = 16 → 384; Risiko 10×4×20 = 800 → R 0.48 */
eq('A5 gesamt-PnL', o.pnl, 384, 1e-9);
eq('A5 R gesamt', o.r, 0.48, 1e-9);
eq('A5 Durchschnitts-Ausstieg', o.avgExit, 105);
eq('A5 ein Trade', E.orders.length, 1);
/* Trailing 5 Punkte */
E = new C.Engine(Object.assign({}, cfg5, { feeFix: 0 }));
o = E.place({ side: -1, type: 'market', qty: 1, sl: 110, tp: null, mgmt: { trail: 5 } }, { t: 0, o: 100, h: 100, l: 100, c: 100 }, 0);
E.onBar({ t: 60, o: 100, h: 101, l: 96, c: 97 }, 1);
eq('A5 Trailing zieht nach', o.sl, 101);
E.onBar({ t: 120, o: 97, h: 98, l: 92, c: 93 }, 2);
eq('A5 Trailing weiter', o.sl, 97);
E.onBar({ t: 180, o: 93, h: 97.5, l: 92.5, c: 97 }, 3);
eq('A5 Trailing-Ausstieg', [o.status, o.reason, o.exitPrice], ['closed', 'Trailing', 97]);
/* Teilausstieg ist auf der Kerze nach dem Einstieg verarbeitet, nicht in der Einstiegskerze ohne Sicherheit */
E = new C.Engine(cfg5);
o = E.place({ side: 1, type: 'limit', price: 100, qty: 2, sl: 95, tp: 115, mgmt: { tp1R: 1, tp1Pct: 50 } }, { t: 0, o: 101, h: 101, l: 101, c: 101 }, 0);
E.onBar({ t: 60, o: 101, h: 106, l: 99.75, c: 102 }, 1);
eq('A5 kein TP1 bei unklarer Reihenfolge', [o.status, o.partials.length], ['open', 0]);

/* ===== A3: Monte-Carlo ===== */
const mcs = C.mcInit([100, -50, 100, -50], [2, 2], { start: 1000, maxDD: 10000, dailyLoss: 0, target: 100000 }, 500, 3);
while (!C.mcStep(mcs, 120));
const mr = C.mcResult(mcs);
eq('A3 Läufe', mr.runs, 500);
eq('A3 Ziel unerreichbar → offen', mr.pOpen, 1);
eq('A3 DD ≥ 0 und ≤ 200', mr.dd95 >= 0 && mr.dd95 <= 200, true);
eq('A3 Histogramm-Summe', mr.hist.reduce((a, b) => a + b, 0), 500);
const mc2 = C.mcInit([-600], [1, 1], { start: 1000, maxDD: 1000, dailyLoss: 500, target: 100 }, 50, 1);
C.mcStep(mc2, 50);
eq('A3 Tagesverlust → durchgefallen', C.mcResult(mc2).pFail, 1);
eq('A3 dayCounts', C.dayCounts([{ status: 'closed', exitT: Date.UTC(2026, 6, 15, 14) / 1000 }, { status: 'closed', exitT: Date.UTC(2026, 6, 15, 15) / 1000 }, { status: 'closed', exitT: Date.UTC(2026, 6, 16, 15) / 1000 }], NY), [2, 1]);
eq('quantile', C.quantile([1, 2, 3, 4, 5], 0.5), 3);

/* ===== A4: RTH-Levels ohne Lookahead ===== */
const rb = [];
const s18 = Date.UTC(2026, 6, 14, 22) / 1000; /* 14.7. 18:00 ET */
for (let t = s18; t < s18 + 23 * 3600; t += 60) { const k = (t - s18) / 60; rb.push({ t, o: 100 + k * 0.01, h: 100.5 + k * 0.01, l: 99.5 + k * 0.01, c: 100 + k * 0.01 }); }
const iOpen = rb.findIndex((b) => b.t === Date.UTC(2026, 6, 15, 13, 30) / 1000);
let L = C.rthLevels(rb, iOpen + 5, 60);
eq('A4 Overnight-Hoch nur bis 9:30', L.onh, rb[iOpen - 1].h, 1e-9);
eq('A4 RTH-Open', L.rthOpen, rb[iOpen].o, 1e-9);
eq('A4 IB läuft', [L.ibDone, L.orDone, L.ibh], [false, false, rb[iOpen + 5].h]);
L = C.rthLevels(rb, iOpen + 59, 60);
eq('A4 IB fertig nach 60 Minuten', [L.ibDone, L.orDone], [true, true]);
eq('A4 kein Blick nach vorn', C.rthLevels(rb, iOpen + 20, 60).ibh, rb[iOpen + 20].h, 1e-9);

/* ===== Archiv-Hilfen ===== */
const days = C.tradingDays(['2023-03'], 2021, 2024, true);
eq('Handelstage März 2023', days.length, 23);
eq('Monate über Grenze', C.monthsBetween(Date.UTC(2023, 1, 27) / 1000, Date.UTC(2023, 2, 2) / 1000), ['2023-02', '2023-03']);
eq('3 Handelstage zurück', C.shiftTradingDays(2023, 3, 14, -3, true), { y: 2023, m: 3, d: 9 });
/* Formatierung */
eq('fmtMoney', C.fmtMoney(1234.5, true), '+1.234,50 $');
eq('fmtR', C.fmtR(1.9), '+1,90R');
eq('fmtPct', C.fmtPct(40), '40,0 %');
/* Prop je Session */
const pbs = C.propBySession([
  { status: 'closed', id: 1, replay: 1, pnl: -700, exitT: Date.UTC(2026, 6, 15, 14) / 1000, entryT: 0 },
  { status: 'closed', id: 2, replay: 2, pnl: -700, exitT: Date.UTC(2026, 6, 15, 15) / 1000, entryT: 1 }
], { start: 50000, maxDD: 2000, dailyLoss: 1000, target: 3000 }, NY);
eq('F4 Sessions getrennt: kein Tagesverlust', pbs.map((x) => x.breaches.length), [0, 0]);

console.log(passes + ' ok, ' + fails + ' Fehler');
process.exit(fails ? 1 : 0);
