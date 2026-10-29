/* Wirtschaftstermine: Liste prüfen (Wochentage, ET→UTC mit Sommerzeit), Stichproben aus den Quellen, Vorwarnung, Kontext, Analyse-Regel */
const C = require('./core.js'), E = require('./econ.js');
let fails = 0, passes = 0;
const eq = (n, g, e) => { if (JSON.stringify(g) === JSON.stringify(e)) passes++; else { fails++; console.log('FAIL', n, 'got', g, 'exp', e); } };
const iso = (t) => new Date(t * 1000).toISOString();
const find = (k, y, m, d) => E.events().find((e) => e.kind === k && e.y === y && e.m === m && e.d === d);
const chk = E.check();
console.log('Termine:', chk.n, JSON.stringify(chk.count), chk.first, '…', chk.last);
for (const w of chk.warn) console.log('  Hinweis:', w);
eq('Anzahl CPI', chk.count.CPI, 81); eq('Anzahl NFP', chk.count.NFP, 81); eq('Anzahl FOMC', chk.count.FOMC, 57);
eq('keine Umrechnungs-/Wochenendfehler', chk.warn.filter((w) => !/nicht Freitag|nicht Mittwoch/.test(w)), []);
/* bekannte, belegte Ausnahmen (Feiertage, Stillstand 2025/26, Wahl 2024) */
eq('Wochentag-Ausnahmen', chk.warn.filter((w) => /nicht/.test(w)).length, 8);
eq('Zeitraum', [chk.first.slice(0, 7), chk.last.slice(0, 7)], ['2020-01', '2026-10']);
/* Stichproben (Sommer-/Winterzeit) */
eq('CPI 10.11.2022 8:30 ET (EST)', iso(find('CPI', 2022, 11, 10).t), '2022-11-10T13:30:00.000Z');
eq('NFP 2.2.2024 8:30 ET', iso(find('NFP', 2024, 2, 2).t), '2024-02-02T13:30:00.000Z');
eq('FOMC 16.3.2022 14:00 ET (EDT)', iso(find('FOMC', 2022, 3, 16).t), '2022-03-16T18:00:00.000Z');
eq('FOMC 15.3.2020 17:00 ET (außerplanmäßig)', iso(find('FOMC', 2020, 3, 15).t), '2020-03-15T21:00:00.000Z');
eq('FOMC 3.3.2020 10:00 ET', iso(find('FOMC', 2020, 3, 3).t), '2020-03-03T15:00:00.000Z');
eq('Oktober 2025 CPI ausgefallen, Sept.-CPI am 24.10.2025', [!!find('CPI', 2025, 10, 15), !!find('CPI', 2025, 10, 24)], [false, true]);
eq('Sortierung', E.events().every((e, i, a) => !i || a[i - 1].t <= e.t), true);
/* Vorwarnung, Linie, Kontext */
const t = (y, m, d, h, mi) => C.zonedToUtc(y, m, d, h, mi, 0, 'America/New_York');
eq('Vorwarnung 15 Min', E.warning(t(2024, 2, 2, 8, 15), false).text, 'In 15 Min: US-Arbeitsmarktbericht (NFP) · 8:30 ET');
eq('Vorwarnung blind generisch', E.warning(t(2024, 2, 2, 8, 15), true).text, 'In 15 Min: Hochrelevanter US-Termin um 8:30 ET');
eq('keine Vorwarnung 31 Min vorher', E.warning(t(2024, 2, 2, 7, 59), false), null);
eq('Fed 2 Std vorher', E.warning(t(2022, 3, 16, 12, 0), false).text, 'In 2 Std: Fed-Zinsentscheid · 14:00 ET');
eq('Fed 2 Std 1 Min vorher: nichts', E.warning(t(2022, 3, 16, 11, 59), false), null);
eq('nach dem Termin keine Vorwarnung', E.warning(t(2024, 2, 2, 8, 30), false), null);
eq('between enthält Termin genau am Ende', E.between(t(2024, 2, 2, 8, 0), t(2024, 2, 2, 8, 30)).map((e) => e.kind), ['NFP']);
eq('ctx 10 Min nach NFP', E.ctxAt(t(2024, 2, 2, 8, 40)), { minutesTo: null, minutesSince: 10, kind: 'NFP' });
eq('ctx 5 Min vor CPI', E.ctxAt(t(2022, 11, 10, 8, 25)).minutesTo, 5);
eq('isNewsTrade', [E.isNewsTrade({ minutesTo: 15 }), E.isNewsTrade({ minutesTo: 16, minutesSince: 31 }), E.isNewsTrade({ minutesSince: 30 })], [true, false, true]);
eq('Tag mit Termin', [E.hasEventOn(2024, 2, 2), E.hasEventOn(2024, 2, 5)], [true, false]);
eq('US-Bezug', [E.relevant('ARCHIV'), E.relevant('CRYPTO'), E.relevant('NQ'), E.relevant(null)], [true, true, true, false]);
/* Analyse-Regel „News-Trades“ */
let id = 0;
const mk = (news, r) => ({ id: 'n' + (++id), sym: 'NQ', replay: 1, side: 1, entryT: 1e9 + id * 600, exitT: 1e9 + id * 600 + 300, pnl: r * 100, r, risk: 100, status: 'closed', ctx: { vwapSide: 1, news } });
const A = (T) => C.analyzeMistakes(T, [], {});
const near = { minutesTo: 5, minutesSince: null, kind: 'CPI' }, far = { minutesTo: 300, minutesSince: 200, kind: 'CPI' };
let T = [0, 1, 2, 3].map(() => mk(near, -1)).concat([0, 1, 2, 3, 4].map(() => mk(far, 1)));
let res = A(T);
eq('News: zu wenig Daten bei 4', res.zuWenig.some((z) => z.id === 'news-trades') && !res.befunde.some((f) => f.id === 'news-trades'), true);
T = T.concat([mk({ minutesTo: null, minutesSince: 20, kind: 'NFP' }, -0.5)]);
res = A(T);
const f = res.befunde.find((x) => x.id === 'news-trades');
eq('News: Befund ab 5', !!f, true);
eq('News: Kosten 4,5R / 450 $', f && [f.kostenR, f.kostenUsd, f.anzahl, f.handbuch], [4.5, 450, 5, 'wichtige-zeiten']);
res = A([0, 1, 2, 3, 4].map(() => mk(near, 1)).concat([mk(far, -1)]));
eq('News: Stärke bei positiven News-Trades', res.staerken.some((s) => s.id === 'news-stark') && !res.befunde.some((x) => x.id === 'news-trades'), true);
console.log(passes + ' ok, ' + fails + ' Fehler');
process.exit(fails ? 1 : 0);
