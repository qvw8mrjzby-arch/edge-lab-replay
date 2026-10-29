// Lädt historische 1-Minuten-Kerzen von Dukascopy (kostenlos) und legt sie als
// data/<ID>/<JJJJ-MM>.csv.gz ab. Läuft als GitHub Action, siehe .github/workflows/daten.yml.
// Format je Datei: Kopfzeile "t,o,h,l,c,v", t = Unix-Sekunden (UTC, Kerzen-Start).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const TMP = path.join(ROOT, '.tmp-download');
const START = process.env.START_MONTH || '2020-01';
const BUDGET_MS = (+process.env.BUDGET_MIN || 240) * 60000; // Zeitbudget pro Lauf
const t0 = Date.now();

const INSTRUMENTS = [
  { id: 'NAS100', duka: 'usatechidxusd', name: 'Nasdaq 100', hint: 'Index-CFD, gerechnet wie NQ (20 $ pro Punkt)', tick: 0.25, pv: 20, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
  { id: 'US500', duka: 'usa500idxusd', name: 'S&P 500', hint: 'Index-CFD, gerechnet wie ES (50 $ pro Punkt)', tick: 0.25, pv: 50, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
  { id: 'US30', duka: 'usa30idxusd', name: 'Dow Jones 30', hint: 'Index-CFD, gerechnet wie YM (5 $ pro Punkt)', tick: 1, pv: 5, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
  { id: 'XAUUSD', duka: 'xauusd', name: 'Gold', hint: 'Spot-Gold, gerechnet wie GC (100 $ pro Punkt)', tick: 0.1, pv: 100, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 } },
  { id: 'GER40', duka: 'deuidxeur', name: 'DAX 40', hint: 'Index-CFD, gerechnet wie FDXM (5 pro Punkt)', tick: 0.5, pv: 5, qtyStep: 1, sess: { tz: 'Europe/Berlin', hour: 0 } }
];

const BIN = path.join(ROOT, 'node_modules', '.bin', 'dukascopy-node');
const pad = (n) => String(n).padStart(2, '0');
function monthsFrom(start) {
  const [y0, m0] = start.split('-').map(Number);
  const now = new Date();
  const out = [];
  for (let y = y0, m = m0; y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + pad(m));
  return out;
}
function nextMonth(ym) { let [y, m] = ym.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return y + '-' + pad(m); }
function decimalsOf(t) { const s = String(t); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
function round(p, tick) { return (Math.round(p / tick) * tick).toFixed(decimalsOf(tick)); }

function download(inst, ym) {
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  const from = ym + '-01', to = nextMonth(ym) + '-01';
  execFileSync(BIN, ['-i', inst.duka, '-from', from, '-to', to, '-t', 'm1', '-f', 'csv', '-v', '-vu', 'units',
    '-dir', TMP, '-fn', 'out', '-bs', '15', '-bp', '250', '-r', '4', '-re', '-fr', '-rp', '1500', '-s'], { stdio: ['ignore', 'ignore', 'inherit'], timeout: 20 * 60000 });
  const f = readdirSync(TMP).find((x) => x.endsWith('.csv'));
  if (!f) return null;
  const lines = readFileSync(path.join(TMP, f), 'utf8').split(/\r?\n/);
  const startS = Date.parse(from + 'T00:00:00Z') / 1000, endS = Date.parse(to + 'T00:00:00Z') / 1000;
  const rows = ['t,o,h,l,c,v'];
  let last = -1;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 5) continue;
    const t = Math.round(+c[0] / 1000);
    if (!(t >= startS && t < endS) || t <= last) continue;
    const o = +c[1], h = +c[2], l = +c[3], cl = +c[4], v = c.length > 5 ? +c[5] : 0;
    if (![o, h, l, cl].every(Number.isFinite)) continue;
    rows.push([t, round(o, inst.tick), round(Math.max(h, o, cl), inst.tick), round(Math.min(l, o, cl), inst.tick), round(cl, inst.tick), Number.isFinite(v) ? Math.round(v) : 0].join(','));
    last = t;
  }
  return rows.length > 1 ? rows.join('\n') + '\n' : null;
}

const months = monthsFrom(START);
const current = months[months.length - 1];
const prev = months[months.length - 2];
const order = months.slice().reverse(); // neueste Monate zuerst
let lastIdx = {};
try { lastIdx = JSON.parse(readFileSync(path.join(DATA, 'index.json'), 'utf8')); } catch (_) { /* erster Lauf */ }
const refreshDue = !lastIdx.refreshed || Date.now() - Date.parse(lastIdx.refreshed) > 20 * 3600000;
function saveProgress(label) {
  if (!process.env.GITHUB_ACTIONS) return;
  try {
    execFileSync('git', ['add', 'data'], { cwd: ROOT });
    try { execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT }); return; } catch (_) { /* es gibt Änderungen */ }
    execFileSync('git', ['commit', '-q', '-m', 'Kursdaten: ' + label], { cwd: ROOT });
    execFileSync('git', ['pull', '-q', '--rebase', 'origin', 'main'], { cwd: ROOT });
    execFileSync('git', ['push', '-q', 'origin', 'HEAD:main'], { cwd: ROOT });
  } catch (e) { console.log('Zwischenspeichern fehlgeschlagen:', e.message.split('\n')[0]); }
}
let stopped = false;
const index = { updated: new Date().toISOString(), refreshed: refreshDue ? new Date().toISOString() : lastIdx.refreshed, source: 'Dukascopy Bank SA, Bid-Kurse, 1 Minute', format: 't,o,h,l,c,v (t = Unix-Sekunden UTC)', instruments: [] };
for (const inst of INSTRUMENTS) {
  const dir = path.join(DATA, inst.id);
  mkdirSync(dir, { recursive: true });
  for (const ym of order) {
    const file = path.join(dir, ym + '.csv.gz');
    const fresh = refreshDue && (ym === current || ym === prev); // laufende Monate einmal täglich neu holen
    if (existsSync(file) && !fresh) continue;
    if (Date.now() - t0 > BUDGET_MS) { stopped = true; break; }
    try {
      const csv = download(inst, ym);
      if (csv) { writeFileSync(file, gzipSync(csv, { level: 9 })); console.log(inst.id, ym, csv.split('\n').length - 2, 'Kerzen'); }
      else console.log(inst.id, ym, 'keine Daten');
    } catch (e) { console.log(inst.id, ym, 'Fehler:', e.message.split('\n')[0]); }
  }
  const have = readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.csv\.gz$/.test(x)).map((x) => x.slice(0, 7)).sort();
  const { duka, ...meta } = inst;
  index.instruments.push({ ...meta, months: have });
  writeIndex();
  saveProgress(inst.name);
  if (stopped) break;
}
function writeIndex() {
  const all = INSTRUMENTS.map((inst) => {
    const done = index.instruments.find((x) => x.id === inst.id);
    if (done) return done;
    const dir = path.join(DATA, inst.id);
    const have = existsSync(dir) ? readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.csv\.gz$/.test(x)).map((x) => x.slice(0, 7)).sort() : [];
    const { duka, ...meta } = inst;
    return { ...meta, months: have };
  });
  writeFileSync(path.join(DATA, 'index.json'), JSON.stringify(Object.assign({}, index, { instruments: all }), null, 1));
}
// Instrumente, die wegen Zeitbudget nicht mehr dran waren, trotzdem im Index aufführen
for (const inst of INSTRUMENTS) {
  if (index.instruments.some((x) => x.id === inst.id)) continue;
  const dir = path.join(DATA, inst.id);
  const have = existsSync(dir) ? readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.csv\.gz$/.test(x)).map((x) => x.slice(0, 7)).sort() : [];
  const { duka, ...meta } = inst;
  index.instruments.push({ ...meta, months: have });
}
writeFileSync(path.join(DATA, 'index.json'), JSON.stringify(index, null, 1));
rmSync(TMP, { recursive: true, force: true });
console.log(stopped ? 'Zeitbudget erreicht – der nächste Lauf macht weiter.' : 'Fertig.');
