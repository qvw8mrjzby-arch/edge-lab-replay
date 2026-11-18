// Baut aus dem 1-Minuten-Archiv kompakte Zeitreihen für das Jarvis-Terminal:
// data/agg/<ID>-1d.json (alle Handelstage seit 2020, nach Session-Tag), -1h.json (≈18 Monate),
// -15m.json (≈80 Tage), -5m.json (≈15 Tage). Format: { id, tf, built, c: [[t,o,h,l,c,v], ...] }, t = Unix-Sekunden UTC.
// Läuft nach jedem Archiv-Update in .github/workflows/daten.yml.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'agg');
mkdirSync(OUT, { recursive: true });
const idx = JSON.parse(readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const now = Date.now() / 1000;
const offCache = new Map();
function tzOffset(tz, tSec) { // Sekunden, die man zu UTC addieren muss, um Ortszeit zu erhalten
  const k = tz + '|' + Math.floor(tSec / 3600);
  if (offCache.has(k)) return offCache.get(k);
  const d = new Date(Math.floor(tSec / 3600) * 3600000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  const loc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000;
  const off = loc - Math.floor(tSec / 3600) * 3600; offCache.set(k, off); return off;
}
const dec = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
for (const inst of idx.instruments) {
  const months = inst.months || []; if (!months.length) continue;
  const d = Math.max(dec(inst.tick || 0.01), 2);
  const r = (x) => +x.toFixed(d);
  const bucket = (rows, keyFn, keepFrom) => {
    const out = []; let cur = null, key = null;
    for (const b of rows) {
      if (b[0] < keepFrom) continue;
      const k = keyFn(b[0]);
      if (k !== key) { if (cur) out.push(cur); cur = [k, b[1], b[2], b[3], b[4], b[5]]; key = k; cur.k = k; }
      else { cur[2] = Math.max(cur[2], b[2]); cur[3] = Math.min(cur[3], b[3]); cur[4] = b[4]; cur[5] += b[5]; }
    }
    if (cur) out.push(cur);
    return out.map((x) => [x[0], r(x[1]), r(x[2]), r(x[3]), r(x[4]), Math.round(x[5])]);
  };
  const rows = [];
  for (const ym of months) {
    const f = path.join(DATA, inst.id, ym + '.csv.gz'); if (!existsSync(f)) continue;
    const lines = gunzipSync(readFileSync(f)).toString('utf8').split('\n');
    for (let i = 1; i < lines.length; i++) { const c = lines[i].split(','); if (c.length < 5) continue; const t = +c[0]; if (!(t > 0)) continue; rows.push([t, +c[1], +c[2], +c[3], +c[4], +c[5] || 0]); }
  }
  rows.sort((a, b) => a[0] - b[0]);
  const tz = inst.sess?.tz || 'UTC', sh = inst.sess?.hour || 0;
  // Session-Tag: Ortszeit ab Session-Start (z. B. 18:00 New York) zählt zum nächsten Kalendertag
  const dayKey = (t) => { const loc = t + tzOffset(tz, t) + (sh ? (24 - sh) * 3600 : 0); return Math.floor(loc / 86400); };
  const daily = []; { let cur = null, key = null;
    for (const b of rows) { const k = dayKey(b[0]); if (k !== key) { if (cur) daily.push(cur); cur = [k * 86400 + 12 * 3600, b[1], b[2], b[3], b[4], b[5]]; key = k; } else { cur[2] = Math.max(cur[2], b[2]); cur[3] = Math.min(cur[3], b[3]); cur[4] = b[4]; cur[5] += b[5]; } }
    if (cur) daily.push(cur); }
  // Wochenend-Stummel (sehr wenige Minuten) verwerfen
  const cnt = new Map(); for (const b of rows) { const k = dayKey(b[0]); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const d1 = daily.filter((x) => (cnt.get(Math.floor((x[0] - 12 * 3600) / 86400)) || 0) >= 60).map((x) => [x[0], r(x[1]), r(x[2]), r(x[3]), r(x[4]), Math.round(x[5])]);
  const sets = {
    '1d': d1,
    '1h': bucket(rows, (t) => Math.floor(t / 3600) * 3600, now - 540 * 86400).map((x) => x),
    '15m': bucket(rows, (t) => Math.floor(t / 900) * 900, now - 80 * 86400),
    '5m': bucket(rows, (t) => Math.floor(t / 300) * 300, now - 15 * 86400)
  };
  for (const [tf, c] of Object.entries(sets)) {
    writeFileSync(path.join(OUT, `${inst.id}-${tf}.json`), JSON.stringify({ id: inst.id, name: inst.name, tf, tz, built: new Date().toISOString(), c }));
  }
  console.log(inst.id, Object.entries(sets).map(([k, v]) => k + ':' + v.length).join(' '));
}
