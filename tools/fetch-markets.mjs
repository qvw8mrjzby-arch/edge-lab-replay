// Holt kostenlose Marktdaten für das Jarvis-Terminal (läuft als GitHub Action, siehe .github/workflows/markt.yml):
//  - Tageskerzen (2 Jahre) und Stundenkerzen (60 Tage) von Yahoo Finance → data/markets/<datei>.json
//  - Ersatz für Zinsen/Dollar/VIX/Öl über FRED (St. Louis Fed), falls Yahoo blockiert
//  - Schlagzeilen aus RSS-Feeds → data/news.json
//  - Wirtschaftskalender dieser Woche (Forex Factory) → data/calendar.json
// Keine API-Keys, keine Kosten.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'data', 'markets');
mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept': 'application/json,text/plain,*/*' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const file = (sym) => sym.replace(/[^A-Za-z0-9.-]/g, (c) => ({ '^': '_', '=': '~' }[c] || '-'));

// Muss zur Liste in src/jt-core.js passen
const DAILY = ['^GSPC', '^NDX', '^DJI', '^GDAXI', '^RUT', '^STOXX50E', 'ES=F', 'NQ=F', 'YM=F', 'RTY=F', 'GC=F', 'SI=F', 'CL=F', 'HG=F', 'NG=F',
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', '^VIX', '^TNX', '^FVX', '^IRX', '^TYX', 'DX-Y.NYB',
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA', 'NFLX', 'AMD', 'PLTR', 'JPM',
  'SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'TLT', 'HYG', 'GLD', 'SLV', 'USO', 'UUP',
  'XLK', 'SMH', 'XLC', 'XLY', 'XLF', 'XLI', 'XLV', 'XLP', 'XLE', 'XLB', 'XLU', 'XLRE',
  'SAP.DE', 'SIE.DE', 'ALV.DE', 'RHM.DE', 'DTE.DE', 'MBG.DE', 'BMW.DE', 'BAS.DE', 'DBK.DE', 'IFX.DE', 'ADS.DE'];
const HOURLY = ['^GSPC', '^NDX', '^GDAXI', 'ES=F', 'NQ=F', 'YM=F', 'GC=F', 'CL=F', 'BTC-USD', 'ETH-USD', 'EURUSD=X', '^VIX', 'NVDA', 'TSLA', 'AAPL'];
const FRED = { '^TNX': 'DGS10', '^FVX': 'DGS5', '^IRX': 'DGS3MO', '^TYX': 'DGS30', '^VIX': 'VIXCLS', 'CL=F': 'DCOILWTICO', 'DX-Y.NYB': 'DTWEXBGS', 'EURUSD=X': 'DEXUSEU' };

async function yahoo(sym, range, interval) {
  for (const host of ['query1', 'query2']) {
    for (let a = 0; a < 2; a++) {
      try {
        const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`, { headers: UA });
        if (r.status === 429) { await sleep(3000); continue; }
        if (!r.ok) break;
        const j = await r.json(); const res = j?.chart?.result?.[0]; if (!res?.timestamp) break;
        const q = res.indicators?.quote?.[0] || {}; const c = [];
        for (let i = 0; i < res.timestamp.length; i++) {
          const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], cl = q.close?.[i];
          if ([o, h, l, cl].some((v) => v == null || !isFinite(v))) continue;
          const d = Math.abs(cl) >= 100 ? 2 : Math.abs(cl) >= 1 ? 4 : 6;
          c.push([res.timestamp[i], +o.toFixed(d), +Math.max(h, o, cl).toFixed(d), +Math.min(l, o, cl).toFixed(d), +cl.toFixed(d), q.volume?.[i] || 0]);
        }
        const m = res.meta || {};
        return { c, meta: { name: m.longName || m.shortName || sym, currency: m.currency || '', price: m.regularMarketPrice ?? null, prevClose: m.chartPreviousClose ?? null, time: m.regularMarketTime || null, tz: m.exchangeTimezoneName || '', gmtoffset: m.gmtoffset || 0 } };
      } catch (e) { await sleep(800); }
    }
  }
  return null;
}
async function fred(id) {
  try {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${new Date(Date.now() - 760 * 864e5).toISOString().slice(0, 10)}`, { headers: UA });
    if (!r.ok) return null;
    const rows = (await r.text()).trim().split('\n').slice(1).map((l) => l.split(',')).filter((x) => x[1] && x[1] !== '.');
    const c = rows.map(([d, v]) => { const t = Date.parse(d + 'T21:00:00Z') / 1000, x = +v; return [t, x, x, x, x, 0]; });
    return c.length ? { c, meta: { name: 'FRED ' + id, currency: '', price: c[c.length - 1][4], time: c[c.length - 1][0], source: 'FRED' } } : null;
  } catch { return null; }
}
const status = { updated: new Date().toISOString(), ok: [], failed: [], fred: [] };
for (const sym of DAILY) {
  let d = await yahoo(sym, '2y', '1d');
  if (!d && FRED[sym]) { d = await fred(FRED[sym]); if (d) status.fred.push(sym); }
  if (!d || !d.c.length) { status.failed.push(sym); continue; }
  const out = { sym, at: new Date().toISOString(), source: d.meta.source || 'Yahoo Finance', meta: d.meta, d1: d.c };
  if (HOURLY.includes(sym)) { const h = await yahoo(sym, '60d', '60m'); if (h) out.h1 = h.c; await sleep(250); }
  writeFileSync(path.join(OUT, file(sym) + '.json'), JSON.stringify(out));
  status.ok.push(sym);
  await sleep(250);
}
writeFileSync(path.join(OUT, '_status.json'), JSON.stringify(status, null, 1));
console.log('Märkte:', status.ok.length, 'ok,', status.failed.length, 'fehlgeschlagen', status.failed.join(' '), status.fred.length ? '| FRED: ' + status.fred.join(' ') : '');

/* ---------- Nachrichten (RSS) ---------- */
const FEEDS = [
  ['CNBC Top News', 'https://www.cnbc.com/id/100003114/device/rss/rss.html', 'markt'],
  ['CNBC Wirtschaft', 'https://www.cnbc.com/id/20910258/device/rss/rss.html', 'fed'],
  ['Yahoo Finance', 'https://finance.yahoo.com/news/rssindex', 'markt'],
  ['MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories', 'markt'],
  ['Federal Reserve', 'https://www.federalreserve.gov/feeds/press_all.xml', 'fed'],
  ['CNBC Technologie', 'https://www.cnbc.com/id/19854910/device/rss/rss.html', 'tech'],
  ['Cointelegraph', 'https://cointelegraph.com/rss', 'krypto'],
  ['CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'krypto'],
  ['tagesschau Wirtschaft', 'https://www.tagesschau.de/wirtschaft/index~rss2.xml', 'dax'],
  ['finanzen.net', 'https://www.finanzen.net/rss/news', 'dax'],
  ['Investing.com Rohstoffe', 'https://www.investing.com/rss/news_11.rss', 'rohstoff'],
  ['OilPrice', 'https://oilprice.com/rss/main', 'rohstoff']
];
const dec = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? dec(m[1]) : ''; };
const items = []; const seen = new Set();
for (const [src, url, topic] of FEEDS) {
  try {
    const r = await fetch(url, { headers: { ...UA, Accept: 'application/rss+xml,application/xml,text/xml,*/*' } }); if (!r.ok) { console.log('RSS', src, r.status); continue; }
    const xml = await r.text();
    const parts = xml.split(/<item[\s>]|<entry[\s>]/i).slice(1, 26);
    for (const p of parts) {
      const title = tag(p, 'title'); let link = tag(p, 'link'); if (!link) { const m = p.match(/<link[^>]+href="([^"]+)"/i); link = m ? m[1] : ''; }
      const date = tag(p, 'pubDate') || tag(p, 'updated') || tag(p, 'published') || tag(p, 'dc:date');
      const t = Date.parse(date) || 0; const text = (tag(p, 'description') || tag(p, 'summary')).slice(0, 400);
      if (!title || !link || seen.has(title)) continue; seen.add(title);
      if (t && Date.now() - t > 4 * 864e5) continue;
      items.push({ title, url: link, t, src, topic, text });
    }
  } catch (e) { console.log('RSS', src, 'Fehler', e.message); }
}
items.sort((a, b) => b.t - a.t);
writeFileSync(path.join(ROOT, 'data', 'news.json'), JSON.stringify({ updated: new Date().toISOString(), items: items.slice(0, 160) }));
console.log('News:', items.length);

/* ---------- Wirtschaftskalender ---------- */
try {
  const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { headers: UA });
  if (r.ok) { const j = await r.json(); writeFileSync(path.join(ROOT, 'data', 'calendar.json'), JSON.stringify({ updated: new Date().toISOString(), source: 'Forex Factory', events: j.map((e) => ({ title: e.title, country: e.country, date: e.date, impact: e.impact, forecast: e.forecast, previous: e.previous })) })); console.log('Kalender:', j.length); }
  else console.log('Kalender', r.status);
} catch (e) { console.log('Kalender Fehler', e.message); }
