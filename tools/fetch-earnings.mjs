// Quartalszahlen für die Seite „Quartalszahlen“ (läuft als GitHub Action, siehe .github/workflows/earnings.yml)
//  - Offizielle Zahlen aus den SEC-Berichten (10-Q/10-K, data.sec.gov companyfacts): Umsatz, Gewinn, GAAP-EPS, Bruttogewinn, operatives Ergebnis
//  - Erwartung vs. Ergebnis (bereinigter EPS) und nächster Termin von Nasdaq
//  - Earnings-Kalender der nächsten 14 Tage (Nasdaq)
//  - Kursreaktion der Aktie und des Nasdaq 100 rund um den Termin (Yahoo-Tageskerzen)
// Keine API-Keys, keine Kosten. Fehlt eine Quelle, bleibt das Feld leer – es wird nichts geschätzt.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'data', 'earnings.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEC_UA = { 'User-Agent': 'EdgeLabReplay github.com/qvw8mrjzby-arch/edge-lab-replay 41898282+github-actions[bot]@users.noreply.github.com', 'Accept': 'application/json' };
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/' };

// Schwergewichte im Nasdaq 100 + JPM (eröffnet die Saison). Muss zur Liste in src/earnings.js passen.
const LIST = ['NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA', 'NFLX', 'COST', 'AMD', 'PLTR', 'JPM'];

const getJ = async (url, headers, tries = 2) => {
  for (let a = 0; a < tries; a++) {
    try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(25000) }); if (r.status === 429) { await sleep(3000); continue; } if (!r.ok) return { err: r.status }; return await r.json(); }
    catch (e) { if (a === tries - 1) return { err: e.message }; await sleep(1500); }
  }
  return { err: 'limit' };
};
const log = [];

/* ---------- SEC ---------- */
const tick = await getJ('https://www.sec.gov/files/company_tickers.json', SEC_UA);
const CIK = {};
if (!tick.err) for (const v of Object.values(tick)) CIK[v.ticker] = v.cik_str;
else log.push('SEC Tickerliste: ' + tick.err);

const DAY = 864e5;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
/* alle Quartale eines Kennzahl-Begriffs: Originalmeldung (frühestes filed) je Zeitraum, Q4 = Jahr − Q1..Q3 */
function quarters(units) {
  if (!units) return {};
  const byP = new Map();
  for (const e of units) {
    if (!e.start || !e.end || !/^10-[QK]/.test(e.form || '')) continue;
    const k = e.start + '|' + e.end; const o = byP.get(k);
    if (!o || e.filed < o.filed) byP.set(k, e);
  }
  const Q = {}, A = [];
  for (const e of byP.values()) { const d = days(e.start, e.end); if (d >= 80 && d <= 100) Q[e.end] = { end: e.end, start: e.start, fy: e.fy, fp: e.fp, filed: e.filed, form: e.form, val: e.val }; else if (d >= 350 && d <= 380) A.push(e); }
  for (const a of A) {
    const inside = Object.values(Q).filter((q) => q.start >= a.start && q.end < a.end && days(a.start, q.start) < 280);
    if (inside.length !== 3 || Q[a.end]) continue;
    const last = inside.map((q) => q.end).sort().pop();
    Q[a.end] = { end: a.end, start: new Date(Date.parse(last) + DAY).toISOString().slice(0, 10), fy: a.fy, fp: 'Q4', filed: a.filed, form: a.form, val: a.val - inside.reduce((s, q) => s + q.val, 0), derived: true };
  }
  return Q;
}
const pick = (facts, names, unit) => {
  let best = null;
  for (const n of names) { const u = facts?.[n]?.units?.[unit]; if (!u) continue; const q = quarters(u); const ends = Object.keys(q).sort(); if (!ends.length) continue; if (!best || ends[ends.length - 1] > best.last) best = { q, last: ends[ends.length - 1], name: n }; }
  return best ? best.q : {};
};
const REV = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenuesNetOfInterestExpense', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'];

/* ---------- Yahoo-Tageskerzen für die Kursreaktion ---------- */
async function candles(sym) {
  for (const host of ['query1', 'query2']) {
    const j = await getJ(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d`, UA);
    const res = j?.chart?.result?.[0]; if (!res?.timestamp) continue;
    const c = res.indicators?.quote?.[0]?.close || [];
    const out = []; res.timestamp.forEach((t, i) => { if (c[i] != null) out.push([new Date((t + (res.meta?.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), c[i]]); });
    return { c: out, price: res.meta?.regularMarketPrice ?? null, name: res.meta?.longName || res.meta?.shortName || sym };
  }
  return null;
}
/* Schluss am letzten Handelstag vor dem Termin → Schluss am ersten Handelstag nach dem Termin (deckt vor- und nachbörslich ab) */
const reaction = (C, date) => {
  if (!C || !date) return null;
  const i = C.c.findIndex((x) => x[0] >= date); if (i <= 0) return null;
  const before = C.c[i - 1], after = C.c[C.c[i][0] === date ? i + 1 : i];
  if (!after) return null;
  return { from: before[0], to: after[0], pct: +((after[1] / before[1] - 1) * 100).toFixed(2) };
};

/* ---------- Nasdaq ---------- */
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const usDate = (s) => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const num = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(/[$,%\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return isFinite(n) ? n : null; };

const ndx = await candles('^NDX'); if (!ndx) log.push('Yahoo ^NDX fehlt');
const companies = [];
for (const sym of LIST) {
  const co = { sym, name: sym, q: [], next: null };
  const cik = CIK[sym];
  if (cik) {
    const f = await getJ(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`, SEC_UA);
    if (f.err) log.push(`SEC ${sym}: ${f.err}`);
    else {
      co.name = f.entityName || sym; const g = f.facts?.['us-gaap'] || {};
      const R = pick(g, REV, 'USD'), N = pick(g, ['NetIncomeLoss', 'ProfitLoss'], 'USD'), E = pick(g, ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted'], 'USD/shares'), GP = pick(g, ['GrossProfit'], 'USD'), OI = pick(g, ['OperatingIncomeLoss'], 'USD');
      const ends = [...new Set([...Object.keys(R), ...Object.keys(N), ...Object.keys(E)])].sort().slice(-12);
      co.q = ends.map((end) => { const b = R[end] || N[end] || E[end]; return { end, fy: b.fy, fp: b.fp, filed: b.filed, rev: R[end]?.val ?? null, ni: N[end]?.val ?? null, eps: E[end] ? +E[end].val.toFixed(2) : null, gp: GP[end]?.val ?? null, oi: OI[end]?.val ?? null, derived: !!b.derived }; });
    }
    await sleep(150);
  } else log.push(`SEC ${sym}: keine CIK`);

  const s = await getJ(`https://api.nasdaq.com/api/company/${sym}/earnings-surprise`, UA);
  const rows = s?.data?.earningsSurpriseTable?.rows || [];
  if (s.err) log.push(`Nasdaq Überraschung ${sym}: ${s.err}`);
  for (const r of rows) {
    const m = String(r.fiscalQtrEnd || '').match(/([A-Za-z]{3})\s+(\d{4})/); if (!m) continue;
    const ym = `${m[2]}-${MON[m[1]]}`;
    const est = { date: usDate(r.dateReported), eps: num(r.eps), cons: num(r.consensusForecast), surp: num(r.percentageSurprise) };
    let q = co.q.find((x) => x.end.slice(0, 7) === ym) || co.q.find((x) => { const d = Math.abs(Date.parse(x.end) - Date.parse(ym + '-15')); return d < 20 * DAY; });
    if (!q) { q = { end: ym + '-28', fy: null, fp: null, onlyEst: true }; co.q.push(q); }
    q.est = est;
  }
  co.q.sort((a, b) => a.end.localeCompare(b.end));
  const nd = await getJ(`https://api.nasdaq.com/api/analyst/${sym}/earnings-date`, UA);
  if (nd?.data) { const txt = nd.data.announcement || nd.data.reportText || ''; const m = String(txt).match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/); co.next = { date: m ? `${m[3]}-${MON[m[1]]}-${m[2].padStart(2, '0')}` : null, text: String(txt).replace(/<[^>]+>/g, '').trim().slice(0, 240) }; }
  else if (nd.err) log.push(`Nasdaq Termin ${sym}: ${nd.err}`);

  const C = await candles(sym);
  if (C) { co.name = co.name === sym ? C.name : co.name; co.price = C.price; for (const q of co.q) { const d = q.est?.date; if (d) q.react = { stock: reaction(C, d), ndx: reaction(ndx, d) }; } }
  else log.push(`Yahoo ${sym} fehlt`);
  companies.push(co);
  await sleep(400);
}

/* ---------- Kalender nächste 14 Tage ---------- */
const calendar = [];
for (let i = 0; i < 15; i++) {
  const d = new Date(Date.now() + i * DAY); const wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
  const ds = d.toISOString().slice(0, 10);
  const j = await getJ(`https://api.nasdaq.com/api/calendar/earnings?date=${ds}`, UA);
  if (j.err) { log.push(`Nasdaq Kalender ${ds}: ${j.err}`); continue; }
  for (const r of j?.data?.rows || []) {
    const mcap = num(r.marketCap);
    if (!(mcap >= 20e9) && !LIST.includes(r.symbol)) continue;
    calendar.push({ date: ds, sym: r.symbol, name: r.name, time: r.time === 'time-pre-market' ? 'vorbörslich' : r.time === 'time-after-hours' ? 'nachbörslich' : '', est: num(r.epsForecast), last: num(r.lastYearEPS), mcap, fqe: r.fiscalQuarterEnding || '', n: num(r.noOfEsts) });
  }
  await sleep(300);
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const okCount = companies.filter((c) => c.q.length).length;
if (!okCount && prev) { console.log('Keine Daten bekommen – alte Datei bleibt.', log.join(' | ')); process.exit(0); }
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), sources: { zahlen: 'SEC EDGAR (10-Q/10-K)', erwartung: 'Nasdaq', kurse: 'Yahoo Finance' }, log, companies, calendar: calendar.sort((a, b) => a.date.localeCompare(b.date) || (b.mcap || 0) - (a.mcap || 0)) }));
console.log('Quartalszahlen:', okCount, 'Firmen,', calendar.length, 'Kalender-Einträge'); if (log.length) console.log(log.join('\n'));
