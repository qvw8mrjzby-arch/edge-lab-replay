"""Shop-Test (Playwright, headless): Payout anfordern, Guthaben, Kaufen, Tragen, Kerzenfarben, Schutz vor nicht gekauften Dingen,
Einstellungen-Reset behält den Shop, Sync-Schlüssel, Übersicht, Statistik-Link, Handy-Ansicht."""
import os
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
out = 'shots'; os.makedirs(out, exist_ok=True)
errs, fails = [], []


def check(name, cond, info=''):
    if not cond:
        fails.append(name + ' ' + str(info))
        print('FAIL', name, info)
    else:
        print('ok  ', name)


def open_page(b, w, h):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('console', lambda m: errs.append('console.%s: %s' % (m.type, m.text)) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: %s' % e))
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.route('https://s3.tradingview.com/**', lambda r: r.abort())
    pg.goto(url)
    pg.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0')
    pg.wait_for_timeout(500)
    if pg.is_visible('#onboardModal'):
        pg.click('#obSkip')
    return pg


# 4 saubere Sessions (je 88 Coins), eine mit fehlendem Stop, eine mit Regelverstoß, eine, die das Ziel nicht erreicht
SEED = '''() => {
  const now = Math.floor(Date.now() / 1000), DAY = 86400, T0 = Date.UTC(2024, 4, 6, 14) / 1000;
  const J = [], S = [];
  const add = (rid, pnls, o) => {
    S.push({ id: 's' + rid, created: now - rid * DAY, replayId: rid, strategy: 'VWAP', sym: 'NQ', running: false, realDay: '0' + rid + '.05.2024', trades: pnls.length, net: pnls.reduce((a, b) => a + b, 0) });
    pnls.forEach((p, i) => J.push(Object.assign({ id: rid + '-' + i, replay: rid, session: 's' + rid, status: 'closed', sym: 'NQ', pnl: p, r: p > 0 ? 2 : -1, sl: 10, slFinal: 10, side: 1, entryT: T0 + rid * DAY + i * 600, exitT: T0 + rid * DAY + i * 600 + 300, sess: { tz: 'UTC', hour: 0 } }, o && o(i))));
  };
  for (let r = 1; r <= 4; r++) add(r, [1000, 1000, 800, 500]);
  add(5, [1000, 1000, 800, 500], (i) => (i === 1 ? { sl: null } : {}));
  add(6, [-1100, 2000, 2000, 1500]);
  add(7, [400, 300, 200]);
  App.journal = J; App.sessions = S;
  return Promise.all([Store.save('journal', J), Store.save('sessions', S)]);
}'''

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = open_page(b, 1280, 800)
    pg.evaluate(SEED)

    # --- Übersicht: Karte mit bereitem Payout
    pg.evaluate("() => location.hash = '#start'"); pg.wait_for_timeout(300)
    pg.evaluate('() => Pass.check()'); pg.wait_for_timeout(300)
    check('Übersicht zeigt Shop-Karte mit bereitem Payout', pg.locator('.shop-chip').count() == 1 and '4 Payouts bereit' in pg.inner_text('.shop-chip'), pg.inner_text('#view-start')[:200])
    check('Hinweis "Payout bereit" als Toast', 'Payout bereit' in pg.inner_text('#toasts') or pg.evaluate("() => (JSON.parse(localStorage.getItem('elr.shop.seen')) || []).length") == 4)

    # --- Shop-Seite
    pg.evaluate("() => location.hash = '#shop'"); pg.wait_for_timeout(300)
    check('Shop-Seite sichtbar', pg.is_visible('#view-shop') and pg.locator('#shopBody .si').count() == 24, pg.locator('#shopBody .si').count())
    check('Guthaben startet bei 0', pg.inner_text('#shopBal').startswith('0 Coins'), pg.inner_text('#shopBal'))
    check('vier Payouts bereit', pg.locator('[data-claim]').count() == 4)
    txt = pg.inner_text('.pay-tbl')
    check('Fehlender Stop erklärt', 'Stop-Loss' in txt, txt)
    check('Regelverstoß erklärt', 'Tagesverlust-Limit' in txt, txt)
    check('Session unter Ziel steht nicht in der Liste', pg.locator('.pay-tbl tr').count() == 1 + 6, pg.locator('.pay-tbl tr').count())
    pg.screenshot(path=out + '/shop-desktop.png', full_page=True)

    # --- Payout anfordern
    pg.locator('[data-claim]').first.click(); pg.wait_for_timeout(200)
    check('Erstes Payout bringt 88 Coins', pg.inner_text('#shopBal').startswith('88 Coins'), pg.inner_text('#shopBal'))
    check('Eingelöstes Payout hat keinen Button mehr', pg.locator('[data-claim]').count() == 3 and 'Ausgezahlt' in pg.inner_text('.pay-tbl'))
    again = pg.evaluate("() => { const k = Object.keys(App.settings.shop.claims)[0]; Shop.claim(k); return [Object.keys(App.settings.shop.claims).length, ShopCore.wallet(App.settings.shop).earned]; }")
    check('Zweites Einlösen derselben Session bringt nichts', again == [1, 88], again)
    stored = pg.evaluate("() => JSON.parse(localStorage.getItem('elr.settings')).shop")
    check('Auszahlung steht in den gespeicherten Einstellungen', len(stored['claims']) == 1, stored)
    check('Shop-Daten werden mit synchronisiert', pg.evaluate("() => 'shop' in SyncCore.settingsPart(App.settings)"))
    check('Blockierte Session lässt sich nicht erzwingen', pg.evaluate("() => { const r = Shop.data().rows.find((x) => x.a.state === 'blocked'); Shop.claim(r.a.key); return Object.keys(App.settings.shop.claims).length; }") == 1)
    pg.evaluate("() => { document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); }")

    # --- Zu wenig Coins
    pg.evaluate("() => { Shop.render(); }")
    pg.locator('[data-buy="theme:rubin"]').click(force=True); pg.wait_for_timeout(200)  # aria-disabled: echte Nutzer können tippen, Playwright nur mit force
    check('Zu teuer → Hinweis, nichts gekauft', 'fehlen noch' in pg.inner_text('#toasts') and not pg.evaluate("() => 'theme:rubin' in App.settings.shop.owned"), pg.inner_text('#toasts'))

    # --- Rest einlösen, dann kaufen
    for _ in range(3):
        pg.locator('[data-claim]').first.click(); pg.wait_for_timeout(100)
    check('Vier Payouts = 352 Coins', pg.inner_text('#shopBal').startswith('352 Coins'), pg.inner_text('#shopBal'))
    pg.locator('[data-buy="theme:rubin"]').click(); pg.wait_for_timeout(200)
    check('Bestätigung vor dem Kauf', pg.is_visible('#confirmModal') and 'Rubin' in pg.inner_text('#cfTitle'))
    pg.click('#cfCancel'); pg.wait_for_timeout(150)
    check('Abbrechen kauft nichts', pg.inner_text('#shopBal').startswith('352 Coins'))
    pg.locator('[data-buy="theme:rubin"]').click(); pg.wait_for_timeout(200)
    pg.click('#cfOk'); pg.wait_for_timeout(300)
    check('Design gekauft und aktiv', pg.evaluate("() => document.documentElement.getAttribute('data-theme')") == 'rubin' and pg.inner_text('#shopBal').startswith('172 Coins'), pg.inner_text('#shopBal'))
    check('Rubin-Karte zeigt "Aktiv"', 'Aktiv' in pg.locator('.si.on').first.inner_text())
    accent = pg.evaluate("() => COL.accent")
    check('Chart-Farben folgen dem Design', accent.lower() == '#ff5d6c', accent)
    pg.screenshot(path=out + '/shop-theme.png', full_page=True)

    # --- Kerzenfarben
    pg.locator('[data-buy="candles:blauorange"]').click(); pg.wait_for_timeout(200)
    pg.click('#cfOk'); pg.wait_for_timeout(300)
    col = pg.evaluate("() => [document.documentElement.getAttribute('data-candles'), COL.bull, COL.bear]")
    check('Kerzenfarben wirken im Chart', col == ['blauorange', '#3b9eff', '#ff9a3c'], col)
    pg.locator('[data-buy="candles:standard"]').click(); pg.wait_for_timeout(200)
    col = pg.evaluate("() => [document.documentElement.getAttribute('data-candles'), COL.bull]")
    check('Zurück auf Standard ist kostenlos', col == [None, '#2bb38a'] and pg.inner_text('#shopBal').startswith('72 Coins'), (col, pg.inner_text('#shopBal')))
    pg.locator('[data-buy="candles:blauorange"]').click(); pg.wait_for_timeout(200)
    check('Gekaufte Kerzenfarbe wieder tragen ohne Aufpreis', pg.evaluate("() => document.documentElement.getAttribute('data-candles')") == 'blauorange' and not pg.is_visible('#confirmModal') and pg.inner_text('#shopBal').startswith('72 Coins'))

    # --- Avatar, Rahmen, Titel
    pg.evaluate("() => { App.settings.shop.claims.bonus = { t: 1, c: 160, n: 0 }; Shop.render(); }")  # nur für den Test: mehr Coins
    pg.locator('[data-buy="avatar:blitz"]').click(); pg.wait_for_timeout(150); pg.click('#cfOk'); pg.wait_for_timeout(200)
    pg.locator('[data-buy="frame:gold"]').click(); pg.wait_for_timeout(150); pg.click('#cfOk'); pg.wait_for_timeout(200)
    check('Avatar und Rahmen aktiv', pg.evaluate("() => [Pass.state().avatar, Pass.state().frame]") == ['blitz', 'gold'])
    check('Guthaben nach drei Käufen stimmt (72 + 160 − 70 − 120)', pg.inner_text('#shopBal').startswith('42 Coins'), pg.inner_text('#shopBal'))
    pg.evaluate("() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove())")
    pg.locator('[data-buy="title:auszahler"]').click(force=True); pg.wait_for_timeout(150)
    check('Titel (60) ist mit 42 Coins zu teuer', 'fehlen noch 18' in pg.inner_text('#toasts') and not pg.evaluate("() => 'title:auszahler' in App.settings.shop.owned"), pg.inner_text('#toasts'))

    # --- Pass-Seite und Übersicht benutzen die neuen Dinge
    pg.evaluate("() => location.hash = '#pass'"); pg.wait_for_timeout(300)
    check('Pass zeigt den gekauften Avatar', pg.locator('.pass-hero .pav.fr-gold').count() == 1)

    # --- Schutz: nicht gekaufte Dinge werden zurückgesetzt
    res = pg.evaluate("() => { const s = Pass.state(); s.theme = 'neon'; s.avatar = 'pokal'; s.frame = 'glow'; s.title = 'funded'; const r = Pass.state(); return [r.theme, r.avatar, r.frame, r.title]; }")
    check('Nicht gekaufte Dinge fallen auf Standard zurück', res == ['standard', 'kerze', 'keiner', 'auto'], res)
    res = pg.evaluate("() => { Pass.state().theme = 'rubin'; Pass.applyTheme(); return Pass.state().theme; }")
    check('Gekauftes bleibt', res == 'rubin')
    res = pg.evaluate("() => { App.settings.shop.candles = 'gold'; Shop.applyCandles(); return [App.settings.shop.candles, document.documentElement.getAttribute('data-candles')]; }")
    check('Nicht gekaufte Kerzenfarbe fällt auf Standard zurück', res == ['standard', None], res)
    pg.evaluate("() => { App.settings.shop.candles = 'blauorange'; Shop.applyCandles(); }")

    # --- Käufe und Einstellungen-Reset
    pg.click('#btnSettings'); pg.wait_for_timeout(300)
    pg.click('#setReset'); pg.wait_for_timeout(200); pg.click('#cfOk'); pg.wait_for_timeout(400)
    kept = pg.evaluate("() => [ShopCore.wallet(App.settings.shop).payouts, Object.keys(App.settings.shop.owned).length, Pass.state().theme]")
    check('Einstellungen zurücksetzen behält Payouts, Käufe und Design', kept[0] >= 4 and kept[1] == 4 and kept[2] == 'rubin', kept)

    # --- Neu laden: alles bleibt
    pg.reload(); pg.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0'); pg.wait_for_timeout(600)
    if pg.is_visible('#onboardModal'):
        pg.click('#obSkip')
    after = pg.evaluate("() => [document.documentElement.getAttribute('data-theme'), document.documentElement.getAttribute('data-candles'), ShopCore.wallet(App.settings.shop).balance]")
    check('Nach dem Neuladen: Design, Kerzenfarben und Guthaben bleiben', after[0] == 'rubin' and after[1] == 'blauorange' and after[2] >= 0, after)

    # --- Statistik verweist auf den Shop
    pg.evaluate("() => location.hash = '#stats'"); pg.wait_for_timeout(500)
    check('Statistik: Ziel erreicht → Link zum Shop', pg.locator('#view-stats a[href="#shop"]').count() >= 1)

    # --- Aktive Session wird nicht aufgelistet
    ids = pg.evaluate("() => { App.replay.active = true; App.replay.id = 3; const n = Shop.data().rows.map((r) => r.a.key); App.replay.active = false; App.replay.id = null; return n; }")
    check('Laufende Session fehlt in der Payout-Liste', '3' not in ids and len(ids) == 6, ids)

    # --- Prop-Regeln aus → keine Payouts
    off = pg.evaluate("() => { App.settings.prop.on = false; const n = Shop.readyRows().length; App.settings.prop.on = true; return n; }")
    check('Prop-Regeln aus → nichts bereit', off == 0, off)
    pg.close()

    # --- Handy
    m = open_page(b, 390, 800)
    m.evaluate(SEED)
    m.evaluate("() => location.hash = '#shop'"); m.wait_for_timeout(400)
    sw = m.evaluate('() => document.documentElement.scrollWidth')
    check('Handy: Shop ohne horizontales Scrollen', sw <= 392, sw)
    m.screenshot(path=out + '/shop-mobile.png', full_page=True)
    m.evaluate("() => location.hash = '#start'"); m.wait_for_timeout(300)
    check('Handy: Übersicht ohne horizontales Scrollen', m.evaluate('() => document.documentElement.scrollWidth') <= 392)
    m.click('#navMore'); m.wait_for_timeout(200)
    check('Shop im Mehr-Menü', m.locator('#moreMenu a[href="#shop"]').count() == 1)
    m.close()
    b.close()

print('Fehler in der Konsole:', errs)
if errs:
    fails.append('Konsolenfehler')
print('FEHLER: ' + str(len(fails)) + ' ' + str(fails) if fails else 'Alles ok')
raise SystemExit(1 if fails else 0)
