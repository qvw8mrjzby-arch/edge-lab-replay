"""Version 5 – Wirtschaftsdaten im Chart (Demo-Daten enthalten CPI 14.10.2026 8:30 ET): Vorwarnung, Linie erst nach dem Termin,
Blind-Modus generisch, Schalter im Indikatoren-Menü, Trade-Kontext ctx.news. Netzwerk gesperrt."""
import os, re
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
out = 'shots'; os.makedirs(out, exist_ok=True)
errs, passed = [], []


def ok(cond, name):
    assert cond, name
    passed.append(name); print('ok ', name)


IDX = '''(min) => { const t = Core.zonedToUtc(2026, 10, 14, 8, 30, 0, 'America/New_York') - min * 60 - App.baseTf;
  let i = App.base.findIndex(b => b.t >= t); return i; }'''
INFO = '() => { App.charts.forEach(c => c.render()); const c = App.charts[0]; return { warn: c.econEl.hidden ? null : c.econEl.textContent, labs: c.econLabs || [] }; }'

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 860})
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append('console.%s: %s' % (m.type, m.text)) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: %s' % e))
    pg.on('dialog', lambda d: d.accept())
    pg.route(re.compile(r'^https?://'), lambda r: r.abort())
    pg.add_init_script('try { localStorage.setItem("elr.onboarded", "1"); } catch (_) {}')
    pg.goto(url + '#charts')
    pg.wait_for_function('() => typeof App !== "undefined" && App.base && !document.getElementById("boot")', timeout=20000)
    ok(pg.evaluate('() => App.settings.ind.econ === true && App.econOn()'), 'Wirtschaftsdaten standardmäßig an (Demo-NQ hat US-Bezug)')
    i = pg.evaluate(IDX, 15)
    pg.evaluate('(i) => { App.charts.forEach(c => c.setTf && c.setTf(60)); App.startReplayAt(i, { blind: false }); }', i)
    r = pg.evaluate(INFO)
    ok(r['warn'] == 'In 15 Min: US-Verbraucherpreise (CPI) · 8:30 ET' and 'CPI' not in r['labs'], 'Normal: Vorwarnung 15 Min vorher, keine Linie für künftigen Termin')
    pg.screenshot(path=out + '/v5-econ-vorwarnung.png')
    # Trade kurz vor dem Termin → ctx.news
    pg.evaluate('() => { Object.assign(App.settings.ticket, { type: "market", slPts: 5, tpR: 2, risk: 200, riskMode: "money", qtyMode: "risk", tp1R: 0, beR: 0, trail: 0 }); App.placeOrder(1); App.advanceTo(App.cursor + 1); }')
    news = pg.evaluate('() => { const o = App.engine.open()[0] || App.engine.orders && App.engine.orders[0]; return o && o.ctx && o.ctx.news; }')
    ok(news and news['kind'] == 'CPI' and 10 <= news['minutesTo'] <= 15, 'Order speichert ctx.news (Minuten bis CPI, Art)')
    pg.evaluate('(i) => App.advanceTo(i)', pg.evaluate(IDX, -20))
    r = pg.evaluate(INFO)
    ok(r['warn'] is None and 'CPI' in r['labs'], 'Nach dem Termin: Linie mit Kürzel CPI, Banner weg')
    pg.screenshot(path=out + '/v5-econ-linie.png')
    pg.evaluate('() => { App.charts.forEach(c => c.view.rightIdx = null); }')
    pg.click('#btnInd'); pg.click('#indMenu [data-ind="econ"]')
    ok(pg.evaluate(INFO)['labs'] == [] and pg.evaluate('() => App.settings.ind.econ') is False, 'Schalter „Wirtschaftsdaten“ im Indikatoren-Menü blendet aus')
    pg.click('#indMenu [data-ind="econ"]'); pg.keyboard.press('Escape')
    pg.evaluate('() => { App.noUnloadWarn = true; App.forceStopReplay(); }')
    # Blind-Modus: generisch, kein Kürzel
    pg.evaluate('(i) => App.startReplayAt(i, { blind: true })', pg.evaluate(IDX, 15))
    r = pg.evaluate(INFO)
    ok(r['warn'] == 'In 15 Min: Hochrelevanter US-Termin um 8:30 ET', 'Blind: Vorwarnung nur generisch')
    pg.screenshot(path=out + '/v5-econ-blind.png')
    pg.evaluate('(i) => App.advanceTo(i)', pg.evaluate(IDX, -20))
    r = pg.evaluate(INFO)
    ok('CPI' not in r['labs'] and 'Termin' in r['labs'], 'Blind: Linie ohne Kürzel („Termin“)')
    b.close()

print(len(passed), 'Prüfungen bestanden')
if errs:
    print('\n'.join(errs)); raise SystemExit(1)
print('keine Fehler')
