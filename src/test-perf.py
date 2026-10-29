"""Performance-Messung (Playwright, headless Chromium, 1440×860):
4 Charts (1m), 30 Tage 1-Minuten-Daten (~43.000 Kerzen), herausgezoomt auf ~2.000 sichtbare Kerzen,
Verschieben per Maus und Fadenkreuz-Bewegung. Gemessen wird performance.now() um Chart.render()."""
import os, sys, json
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
errs = []
LIMIT_MS = float(os.environ.get('PERF_LIMIT', '8'))

SETUP = '''() => {
  /* 30 Tage × 1440 Minuten, Random-Walk, deterministisch */
  const R = Core.rng(11); const bars = []; let p = 18000; const t0 = Date.UTC(2026, 5, 1) / 1000;
  for (let i = 0; i < 30 * 1440; i++) { const o = p; p += (R() - 0.5) * 6; const c = Math.round(p * 4) / 4; const h = Math.max(o, c) + R() * 3, l = Math.min(o, c) - R() * 3;
    bars.push({ t: t0 + i * 60, o: Math.round(o * 4) / 4, h: Math.round(h * 4) / 4, l: Math.round(l * 4) / 4, c, v: 50 + Math.floor(R() * 200), bv: null }); }
  App.settings.layout = 4; App.settings.charts.forEach(c => { c.tf = 60; });
  App.buildCharts();
  App.loadDataset({ bars, baseTf: 60, tick: 0.25, pv: 20, qtyStep: 1, sess: { tz: 'America/New_York', hour: 18 }, symbol: 'PERF', source: 'Perf', instKey: 'NQ' });
  Object.assign(App.settings.ind, { vwap: true, bands: true, vp: true, fp: true, sessions: true, prev: true, rth: true, volume: true, lower: 'delta' });
  App.settings.emas.forEach(e => { e.on = true; });
  App.charts.forEach(c => { c.render(); c.view.barW = c.plotW() / 2000; c.view.rightIdx = null; c.render(); });
  return { n: App.base.length, charts: App.charts.length, plotW: App.charts[0].plot.w, vis: App.charts.map(c => c.vis[1] - c.vis[0] + 1) };
}'''

MEASURE = '''(kind) => {
  const times = [];
  const cs = App.charts;
  for (let k = 0; k < 60; k++) {
    for (const c of cs) {
      if (kind === 'pan') { c.view.rightIdx -= 7; }
      if (kind === 'hover') { c.hover = { x: 40 + (k * 7) % (c.plot.w - 80), y: 60 + (k * 5) % 200 }; }
      const a = performance.now();
      if (kind === 'hover' && c.renderOverlay) c.renderOverlay(); else c.render();
      times.push(performance.now() - a);
    }
  }
  cs.forEach(c => { c.hover = null; });
  times.sort((x, y) => x - y);
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  return { avg: +avg.toFixed(2), p95: +times[Math.floor(times.length * 0.95)].toFixed(2), max: +times[times.length - 1].toFixed(2) };
}'''

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 860})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.add_init_script('try { localStorage.setItem("elr.onboarded", "1"); localStorage.setItem("elr.seen", "true"); } catch (_) {}')
    pg.goto(url + '#charts')
    pg.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0', timeout=20000)
    pg.wait_for_timeout(300)
    pg.evaluate('() => document.querySelectorAll(".modal").forEach(m => { m.hidden = true; })')
    boot = pg.evaluate('() => ({fcp: Math.round((performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0), bereit: App.bootMs})')
    print('Start: erster Frame (FCP) %d ms, App bereit nach %d ms Init' % (boot['fcp'], boot['bereit']))
    info = pg.evaluate(SETUP)
    print('Datensatz', info)
    pg.wait_for_timeout(300)
    res = {}
    for kind in ('static', 'pan', 'hover'):
        pg.evaluate(MEASURE, kind)  # Aufwärmen
        res[kind] = pg.evaluate(MEASURE, kind)
    # Echtes Ziehen mit der Maus: Frame-Zeiten über requestAnimationFrame
    c = pg.evaluate('() => { const r = App.charts[0].cv.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 3}; }')
    pg.evaluate('''() => { window.__rt = []; const orig = Chart.prototype.render; Chart.prototype.render = function () { const a = performance.now(); const r = orig.apply(this, arguments); window.__rt.push(performance.now() - a); return r; }; }''')
    pg.mouse.move(c['x'], c['y']); pg.mouse.down()
    for k in range(40):
        pg.mouse.move(c['x'] + k * 6, c['y'], steps=1)
        pg.wait_for_timeout(16)
    pg.mouse.up()
    for k in range(30):
        pg.mouse.move(c['x'] - 100 + k * 9, c['y'] + k * 3, steps=1)
        pg.wait_for_timeout(16)
    rt = pg.evaluate('() => { const t = window.__rt.slice().sort((a, b) => a - b); return {n: t.length, avg: +(t.reduce((s, x) => s + x, 0) / Math.max(1, t.length)).toFixed(2), p95: +(t[Math.floor(t.length * 0.95)] || 0).toFixed(2)}; }')
    res['maus'] = rt
    print(json.dumps(res, ensure_ascii=False))
    b.close()
print('\n'.join(errs) if errs else 'keine Fehler')
ok = res['static']['avg'] < LIMIT_MS and res['pan']['avg'] < LIMIT_MS
print('Ziel < %.0f ms pro Chart-Render: %s' % (LIMIT_MS, 'erreicht' if ok else 'VERFEHLT'))
if errs or (os.environ.get('PERF_STRICT') and not ok): sys.exit(1)
