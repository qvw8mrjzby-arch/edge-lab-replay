/* Unit-Tests v4: Fehler-Analyse (Core.analyzeMistakes) und Nachlauf-Prüfung (Core.postCheck) – inkl. Grenzfälle und „zu wenig Daten“ */
const C = require('./core.js');
let fails = 0, passes = 0;
function eq(name, got, exp, tol) {
  const ok = tol != null ? Math.abs(got - exp) <= tol : JSON.stringify(got) === JSON.stringify(exp);
  if (ok) passes++; else { fails++; console.log('FAIL', name, 'got', JSON.stringify(got), 'exp', JSON.stringify(exp)); }
}
const T0 = Date.UTC(2026, 6, 15, 14, 0) / 1000; /* Mittwoch, 14:00 UTC */
let nid = 0;
/* Standard: Long 100, Stop 99 (1 Punkt = 1R), Ziel 102 (2R), Verlust −1R = −100 $ */
function mk(o) {
  nid++;
  const t = o.entryT != null ? o.entryT : T0 + nid * 3600;
  return Object.assign({ id: 't' + nid, replay: 1, sym: 'NQ', side: 1, entryT: t, exitT: t + 600, entryPrice: 100, sl: 99, slFinal: 99, tp: 102, plannedR: 2, reason: 'SL', pnl: -100, r: -1, risk: 100, mfeR: 0.5, maeR: 1, setup: 'A', status: 'closed', tick: 0.25 }, o);
}
const many = (n, o) => Array.from({ length: n }, () => mk(o || {}));
const find = (res, id) => res.befunde.find((f) => f.id === id);
const low = (res, id) => res.zuWenig.some((z) => z.id === id);
const A = (t, o) => C.analyzeMistakes(t, [], o);

/* ---------- 1 · Stop vergrößert ---------- */
{
  const t = many(3, { r: 1, pnl: 100, reason: 'TP' }).concat([
    mk({ slFinal: 98, r: -2, pnl: -200 }),                 /* vergrößert, Verlust −2R → Kosten 1R / 100 $ */
    mk({ slFinal: 98.5, r: 1, pnl: 100, reason: 'TP' }),   /* vergrößert, gerettet → keine Kosten */
    mk({ slFinal: 99.5, r: 0.5, pnl: 50, reason: 'Trailing' }), /* enger (Trailing) → kein Befund */
    mk({ side: -1, entryPrice: 100, sl: 101, slFinal: 102, tp: 98, r: -1.5, pnl: -150 }) /* Short vergrößert → 0,5R */
  ]);
  const f = find(A(t), 'sl-vergroessert');
  eq('SL: Befund', !!f, true);
  eq('SL: Anzahl (Long+Short, ohne Trailing)', f && f.anzahl, 3);
  eq('SL: Kosten R', f && f.kostenR, 1.5, 1e-9);
  eq('SL: Kosten $', f && f.kostenUsd, 150, 1e-9);
  eq('SL: Handbuch-Kapitel', f && f.handbuch, 'sl-verschieben');
  eq('SL: Schwere hoch (Anteil ≥ 20 %)', f && f.schwere, 'hoch');
  eq('SL: betroffene Trades', f && f.tradeIds.length, 3);
  /* Grenzfall: weniger als ein halber Tick weiter → kein Befund */
  const g = many(5).concat([mk({ slFinal: 99 - 0.1, r: -1.1 })]);
  eq('SL: Rundungstoleranz', !!find(A(g), 'sl-vergroessert'), false);
  eq('SL: zu wenig Daten (4 Trades)', low(A(many(4)), 'sl-vergroessert'), true);
  eq('SL: Session-Kurzcheck reicht 1 Trade', !!find(A([mk({ slFinal: 98, r: -2, pnl: -200 })], { kurz: true }), 'sl-vergroessert'), true);
}
/* ---------- 2 · Zu früh raus ---------- */
{
  const t = many(3, { r: 2, pnl: 200, reason: 'TP', mfeR: 2 }).concat([
    mk({ reason: 'Manuell', r: 0.5, pnl: 50, mfeR: 2.1 }),                        /* Ziel war während des Trades erreichbar */
    mk({ reason: 'Manuell', r: 0.5, pnl: 50, mfeR: 0.8, post: { hitTp: true, minutes: 12 } }), /* laut Nachlauf erreichbar */
    mk({ reason: 'Manuell', r: 0.3, pnl: 30, mfeR: 0.6 }),                        /* kein Nachweis → zählt, aber keine Kosten */
    mk({ reason: 'Manuell', r: -0.3, pnl: -30, mfeR: 0.2 })                        /* Verlust ohne Nachweis → kein Fehler */
  ]);
  const f = find(A(t), 'zu-frueh-raus');
  eq('Früh: Anzahl', f && f.anzahl, 3);
  eq('Früh: Kosten = (geplant − realisiert) nur mit Nachweis', f && f.kostenR, 3, 1e-9);
  eq('Früh: Kosten $', f && f.kostenUsd, 300, 1e-9);
  eq('Früh: nur 1 manueller Ausstieg → kein Befund', !!find(A(many(5, { r: 2, pnl: 200, reason: 'TP' }).concat([mk({ reason: 'Manuell', r: 0.5, pnl: 50, mfeR: 2.5 })])), 'zu-frueh-raus'), false);
  eq('Früh: zu wenig Daten ohne Ziel', low(A(many(6, { plannedR: null, tp: null })), 'zu-frueh-raus'), true);
}
/* ---------- 3 · Stop zu eng ---------- */
{
  const t = many(3).concat([mk({ mfeR: 1.2 }), mk({ mfeR: 0.3, post: { hitTp: true, minutes: 30 } }), mk({ mfeR: 0.99 })]);
  const f = find(A(t), 'stop-zu-eng');
  eq('Eng: Anzahl (MFE ≥ 1R oder Nachlauf ins Ziel)', f && f.anzahl, 2);
  eq('Eng: Kosten = Verlust dieser Trades', f && f.kostenR, 2, 1e-9);
  eq('Eng: zu wenig Stop-Verluste', low(A(many(4).concat(many(3, { r: 1, pnl: 100, reason: 'TP' }))), 'stop-zu-eng'), true);
}
/* ---------- 4 · Revenge ---------- */
{
  const s = T0;
  const t = [
    mk({ entryT: s, exitT: s + 300, pnl: -100, r: -1 }),
    mk({ entryT: s + 300 + 5 * 60, exitT: s + 1200, pnl: -150, r: -1, risk: 150 }),       /* 5 min nach Verlust, größeres Risiko */
    mk({ entryT: s + 1200 + 10 * 60, exitT: s + 2400, pnl: 50, r: 0.5 }),               /* genau 10 min → zählt */
    mk({ entryT: s + 2400 + 10 * 60 + 1, exitT: s + 4000, pnl: -100, r: -1, risk: 100 }) /* Vorgänger Gewinn → kein Revenge */,
    mk({ entryT: s + 4000 + 11 * 60, exitT: s + 5000, pnl: 100, r: 1 }),                /* 11 min → zählt nicht */
    mk({ replay: 2, entryT: s + 300 + 60, exitT: s + 900, pnl: 20, r: 0.2 })             /* andere Session → kein Vorgänger */
  ];
  const f = find(A(t), 'revenge');
  eq('Revenge: Anzahl (≤ 10 min nach Verlust)', f && f.anzahl, 2);
  eq('Revenge: Kosten = Summe, wenn negativ', f && f.kostenUsd, 100, 1e-9);
  eq('Revenge: größeres Risiko → hoch', f && f.schwere, 'hoch');
  eq('Revenge: einstellbare Minuten (3 min)', !!find(A(t, { revengeMin: 3 }), 'revenge'), false);
  eq('Revenge: zu wenig Daten', low(A([mk({ entryT: s, exitT: s + 60 }), mk({ entryT: s + 120, exitT: s + 200 })]), 'revenge'), true);
}
/* ---------- 5 · Overtrading ---------- */
{
  const sess = (rid, n, r) => Array.from({ length: n }, (_, i) => mk({ replay: rid, entryT: T0 + rid * 86400 + i * 900, exitT: T0 + rid * 86400 + i * 900 + 300, r: i < 3 ? 1 : r, pnl: (i < 3 ? 1 : r) * 100, reason: i < 3 ? 'TP' : 'SL' }));
  const t = sess(1, 2, -0.5).concat(sess(2, 2, -0.5), sess(3, 9, -0.5));
  const f = find(A(t), 'overtrading');
  eq('Over: Befund für Session mit 9 Trades', !!f, true);
  eq('Over: Kosten = Verlust ab Trade 4', f && f.kostenR, 3, 1e-9);
  eq('Over: betroffene Trades', f && f.anzahl, 6);
  eq('Over: zu wenig Sessions', low(A(sess(1, 9, -0.5).concat(sess(2, 2, 1))), 'overtrading'), true);
  eq('Over: 5 Trades je Session sind keine Überschreitung', !!find(A(sess(1, 5, 1).concat(sess(2, 5, 1), sess(3, 5, 1))), 'overtrading'), false);
}
/* ---------- 6 · Risiko-Disziplin ---------- */
{
  const t = many(4, { riskTarget: 100 }).concat([mk({ riskTarget: 100, risk: 130, pnl: -130, r: -1 }), mk({ riskTarget: 100, risk: 125, pnl: -125, r: -1 })]);
  const f = find(A(t), 'risiko-zu-gross');
  eq('Risiko: nur > 1,25 × Ziel', f && f.anzahl, 1);
  eq('Risiko: Kosten = Verlustanteil über Plan', f && f.kostenUsd, 30, 1e-9);
  eq('Risiko: Ziel-Risiko aus Einstellungen (Rückfall)', find(A(many(4).concat([mk({ risk: 200, pnl: -200 })]), { riskTarget: 100 }), 'risiko-zu-gross').kostenUsd, 100, 1e-9);
  const v = many(6, { risk: 100 }).concat(many(2, { risk: 500, pnl: -500 }));
  const g = find(A(v), 'risiko-schwankt');
  eq('Größe schwankt: VK 0,87 > 0,5', !!g, true);
  eq('Größe schwankt: Schwere mittel', g && g.schwere, 'mittel');
  eq('Größe konstant: kein Befund', !!find(A(many(8)), 'risiko-schwankt'), false);
  eq('Größe: zu wenig Daten (7)', low(A(many(7)), 'risiko-schwankt'), true);
}
/* ---------- 7 · Verlierer länger gehalten ---------- */
{
  const t = many(5, { pnl: 100, r: 1, reason: 'TP', exitT: undefined }).map((x) => Object.assign(x, { exitT: x.entryT + 600 }))
    .concat(many(4).map((x) => Object.assign(x, { exitT: x.entryT + 2400, r: -1.5, pnl: -150 })), [Object.assign(mk({}), {})].map((x) => Object.assign(x, { exitT: x.entryT + 300, r: -0.5, pnl: -50 })));
  const f = find(A(t), 'verlierer-gehalten');
  eq('Halten: Befund (Verlierer 33 min vs. Gewinner 10 min)', !!f, true);
  eq('Halten: lange Verlierer', f && f.anzahl, 4);
  eq('Halten: Mehrverlust ggü. übrigen Verlierern', f && f.kostenR, 4, 1e-9);
  eq('Halten: zu wenig Gewinner', low(A(many(4, { pnl: 100, r: 1 }).concat(many(6))), 'verlierer-gehalten'), true);
}
/* ---------- 8 · Uhrzeit / Wochentag ---------- */
{
  const day = Date.UTC(2026, 6, 13) / 1000; /* Montag */
  const t = [];
  for (let i = 0; i < 5; i++) t.push(mk({ entryT: day + i * 86400 * 7 + 15 * 3600, r: -1, pnl: -100 }));
  for (let i = 0; i < 10; i++) t.push(mk({ entryT: day + (i % 4 + 1) * 86400 + i * 86400 * 7 + 10 * 3600, r: 1, pnl: 100, reason: 'TP' }));
  const res = A(t, { tz: 'UTC' });
  const f = find(res, 'uhrzeit');
  eq('Uhrzeit: 15-Uhr-Fenster negativ, Rest positiv', f && f.anzahl, 5);
  eq('Uhrzeit: Kosten', f && f.kostenR, 5, 1e-9);
  eq('Wochentag: Montag negativ', find(res, 'wochentag') && find(res, 'wochentag').anzahl, 5);
  eq('Wochentag: Blind-Session ausgeblendet', !!find(A(t, { tz: 'UTC', hideWeekdayReplay: 1 }), 'wochentag'), false);
  eq('Uhrzeit: Zeitzone verschiebt Gruppe (Berlin 17 Uhr)', /17:00/.test(find(A(t, { tz: 'Europe/Berlin' }), 'uhrzeit').beschreibung), true);
  eq('Uhrzeit: zu wenig Daten (14)', low(A(t.slice(1)), 'uhrzeit'), true);
  const allBad = t.map((x) => Object.assign({}, x, { r: -1, pnl: -100 }));
  eq('Uhrzeit: Rest nicht positiv → kein Befund', !!find(A(allBad, { tz: 'UTC' }), 'uhrzeit'), false);
}
/* ---------- 9 · Ohne Strategie / Regel-Check ---------- */
{
  const t = many(3, { r: 1, pnl: 100 }).concat(many(2, { setup: '', r: -1, pnl: -100 }));
  const f = find(A(t), 'ohne-strategie');
  eq('Ohne Strategie: Anzahl', f && f.anzahl, 2);
  eq('Ohne Strategie: Kosten', f && f.kostenUsd, 200, 1e-9);
  const r = many(3, { rulesTotal: 3, rulesChecked: 3, rulesOk: true, r: 1, pnl: 100 }).concat(many(2, { rulesTotal: 3, rulesChecked: 1, rulesOk: false, r: -1, pnl: -100 }));
  const g = find(A(r), 'regeln');
  eq('Regeln: unvollständig', g && g.anzahl, 2);
  eq('Regeln: Kosten', g && g.kostenR, 2, 1e-9);
  eq('Regeln: zu wenig Trades mit Regel-Check', low(A(r.slice(1).concat(many(5))), 'regeln'), true);
}
/* ---------- 10 · Gegen den VWAP ---------- */
{
  const t = many(7, { ctx: { vwapSide: 1 }, r: 1, pnl: 100 }).concat(many(3, { ctx: { vwapSide: -1 }, r: -1, pnl: -100 }));
  const f = find(A(t), 'gegen-vwap');
  eq('VWAP: Long unter VWAP = gegen', f && f.anzahl, 3);
  eq('VWAP: Kosten', f && f.kostenR, 3, 1e-9);
  const s = many(7, { side: -1, ctx: { vwapSide: -1 }, r: 1, pnl: 100 }).concat(many(3, { side: -1, ctx: { vwapSide: 1 }, r: -1, pnl: -100 }));
  eq('VWAP: Short über VWAP = gegen', find(A(s), 'gegen-vwap') && find(A(s), 'gegen-vwap').anzahl, 3);
  eq('VWAP: gegen, aber profitabel → kein Befund', !!find(A(many(7, { ctx: { vwapSide: 1 }, r: -0.2, pnl: -20 }).concat(many(3, { ctx: { vwapSide: -1 }, r: 1, pnl: 100 }))), 'gegen-vwap'), false);
  eq('VWAP: zu wenig Kontext', low(A(t.slice(0, 9)), 'gegen-vwap'), true);
}
/* ---------- 11 · Ziel zu weit ---------- */
{
  const t = many(5, { plannedR: 3, mfeR: 1.5, r: -1, pnl: -100 }).concat(many(3, { plannedR: 3, mfeR: 3, r: 3, pnl: 300, reason: 'TP' }));
  const f = find(A(t), 'ziel-zu-weit');
  eq('Ziel: Befund', !!f, true);
  eq('Ziel: Netto-Vorteil Teilausstieg (5 × 1R − 3 × 1R)', f && f.kostenR, 2, 1e-9);
  const u = many(4, { plannedR: 3, mfeR: 1.5, r: -1, pnl: -100 }).concat(many(4, { plannedR: 3, mfeR: 3, r: 3, pnl: 300, reason: 'TP' }));
  eq('Ziel: kein Vorteil → kein Befund', !!find(A(u), 'ziel-zu-weit'), false);
  eq('Ziel: zu wenig Daten', low(A(t.slice(1)), 'ziel-zu-weit'), true);
}
/* ---------- Stärken, Sortierung, Summen, Robustheit ---------- */
{
  const t = many(6, { setup: 'VWAP', r: 1, pnl: 100, reason: 'TP', ctx: { vwapSide: 1 } }).concat(many(5, { setup: 'B', r: -1, pnl: -100 }), [mk({ slFinal: 97, r: -3, pnl: -300 })]);
  const res = A(t);
  eq('Stärke: beste Strategie', res.staerken[0] && res.staerken[0].titel, 'Beste Strategie: VWAP');
  eq('Sortierung nach Kosten', res.befunde.map((f) => f.kostenUsd).every((v, i, a) => !i || a[i - 1] >= v), true);
  eq('Summe Kosten', res.kostenUsd, +res.befunde.reduce((s, f) => s + f.kostenUsd, 0).toFixed(2), 1e-9);
  eq('Befund-Felder', Object.keys(res.befunde[0]).filter((k) => ['id', 'titel', 'schwere', 'anzahl', 'kostenUsd', 'kostenR', 'beschreibung', 'tipp', 'handbuch', 'tradeIds'].includes(k)).length, 10);
  eq('Leeres Journal', A([]).befunde.length, 0);
  eq('Leeres Journal: Hinweise', A([]).zuWenig.length > 5, true);
  eq('Offene/kaputte Einträge ignoriert', A([{ status: 'open' }, null, { pnl: NaN }]).n, 0);
  eq('Schwere-Stufen', [C.analyseSeverity(3, 0), C.analyseSeverity(1, 0), C.analyseSeverity(0.5, 0.16), C.analyseSeverity(0.2, 0.05)], ['hoch', 'mittel', 'mittel', 'gering']);
}
/* ---------- Nachlauf-Prüfung ---------- */
{
  const bar = (i, o, h, l, c) => ({ t: T0 + i * 60, o, h, l, c });
  /* Trade: Long 100, Stop 99, Ziel 102, ausgestoppt auf Kerze 5 */
  const j = { side: 1, entryPrice: 100, sl: 99, slFinal: 99, tp: 102, reason: 'SL', exitT: T0 + 5 * 60 };
  const base = [];
  for (let i = 0; i <= 5; i++) base.push(bar(i, 100, 103, 98, 100)); /* vor/auf der Ausstiegskerze: würde beides treffen – darf nicht zählen */
  base.push(bar(6, 99, 99.5, 98.6, 99.2), bar(7, 99.2, 101, 99, 100.8), bar(8, 100.8, 102.25, 100.5, 102));
  const p = C.postCheck(base, 60, j);
  eq('Nachlauf: Ziel nach Stopp erreicht', p && p.hitTp, true);
  eq('Nachlauf: Minuten bis Ziel', p && p.minutes, 4);
  eq('Nachlauf: startet erst nach der Ausstiegskerze', p && p.n, 3);
  const b2 = base.slice(0, 6).concat([bar(6, 99, 99.5, 98.4, 98.6), bar(7, 98.6, 102.5, 98.6, 102)]);
  eq('Nachlauf: erst Stop + 0,5R → kein Ziel', C.postCheck(b2, 60, j).hitTp, false);
  const b3 = base.slice(0, 6).concat([bar(6, 99, 102.5, 98.4, 101)]);
  eq('Nachlauf: beides in einer Kerze → Stop zuerst', C.postCheck(b3, 60, j).stopFirst, true);
  const b4 = base.slice(0, 6).concat(Array.from({ length: 10 }, (_, k) => bar(6 + k, 100, 100.5, 99.5, 100)), [bar(16, 100, 103, 100, 102.5)]);
  eq('Nachlauf: nur N Kerzen (N = 10)', C.postCheck(b4, 60, j, { bars: 10 }).hitTp, false);
  eq('Nachlauf: N = 11 findet das Ziel', C.postCheck(b4, 60, j, { bars: 11 }).hitTp, true);
  eq('Nachlauf: TP-Ausstieg → keine Prüfung', C.postCheck(base, 60, Object.assign({}, j, { reason: 'TP' })), null);
  eq('Nachlauf: keine Daten danach → null', C.postCheck(base.slice(0, 6), 60, j), null);
  const m = Object.assign({}, j, { reason: 'Manuell', slFinal: 99 });
  eq('Nachlauf manuell: Stop = aktueller Stop (99)', C.postCheck(base.slice(0, 6).concat([bar(6, 100, 100, 98.9, 99)]), 60, m).stopFirst, true);
  const sh = { side: -1, entryPrice: 100, sl: 101, tp: 98, reason: 'SL', exitT: T0 + 5 * 60 };
  eq('Nachlauf Short: Ziel erreicht', C.postCheck(base.slice(0, 6).concat([bar(6, 101, 101.2, 97.75, 98)]), 60, sh).hitTp, true);
}
console.log(passes + ' ok, ' + fails + ' Fehler');
if (fails) process.exit(1);
