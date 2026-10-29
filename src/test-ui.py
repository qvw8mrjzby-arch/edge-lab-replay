"""Oberflächen-Test (Playwright, headless): Bereiche, Replay ohne Lookahead, Ticket, Positions-Werkzeug,
SL/TP-Schutzregeln, Vollbild, Fotos (IndexedDB) inkl. Auto-Foto, Journal, Backtests, Statistik, Strategien, Handy."""
import os
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
out = 'shots'; os.makedirs(out, exist_ok=True)
errs = []
VIEWS = ['charts', 'journal', 'backtests', 'stats', 'analyse', 'strategien', 'handbuch', 'tradingview']
ALL_VIEWS = ['start'] + VIEWS


def page(b, w, h, touch=False):
    pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2 if touch else 1, has_touch=touch)
    pg.on('console', lambda m: errs.append('%dpx console.%s: %s' % (w, m.type, m.text)) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('%dpx PAGEERROR: %s' % (w, e)))
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.route('https://s3.tradingview.com/**', lambda r: r.abort())
    pg.goto(url)
    pg.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0')
    pg.wait_for_timeout(400)
    pg._start = pg.evaluate('() => App.view')
    if pg.is_visible('#onboardModal'):
        pg.click('#obSkip')
    pg.evaluate("() => location.hash = '#charts'"); pg.wait_for_timeout(150)
    return pg


def overlaps(pg):
    """Sichtbare Bedienelemente, die sich überlappen oder abgeschnitten sind (nur Kopf, Leisten, Seitenleiste)."""
    return pg.evaluate('''() => {
      const sel = 'header.top button, header.top a, #chartBar > *, #replayBar button, #replayBar #rpTime, #side .btn, #mAct button, #mainNav a';
      const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0);
      const bad = [];
      const vw = document.documentElement.clientWidth;
      for (const e of els) { const r = e.getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1) bad.push('außerhalb: ' + (e.id || e.textContent.trim().slice(0, 20))); }
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
        const r = a.getBoundingClientRect(), s = b.getBoundingClientRect();
        const ox = Math.min(r.right, s.right) - Math.max(r.left, s.left), oy = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
        if (ox > 2 && oy > 2) bad.push((a.id || a.textContent.trim().slice(0, 16)) + ' / ' + (b.id || b.textContent.trim().slice(0, 16)));
      }
      return bad;
    }''')


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = page(b, 1440, 860)
    pg.screenshot(path=out + '/1-start.png')
    info = pg.evaluate('() => ({sym: App.symbol, n: App.base.length, charts: App.charts.length, view: App.view, risk: App.settings.ticket.risk})')
    print('state', info)
    assert pg._start == 'start' and info['view'] == 'charts' and info['risk'] == 500, 'Startbereich Übersicht, Standardrisiko 500 $'

    # --- Bereichswechsel + Zurück-Taste ---
    for v in VIEWS[1:]:
        pg.click('#mainNav a[data-view="%s"]' % v); pg.wait_for_timeout(120)
        st = pg.evaluate('(v) => ({hash: location.hash, view: App.view, vis: !document.getElementById("view-" + v).hidden, cur: document.querySelector("#mainNav [aria-current=page]").dataset.view})', v)
        assert st['hash'] == '#' + v and st['view'] == v and st['vis'] and st['cur'] == v, st
    pg.go_back(); pg.wait_for_timeout(150)
    assert pg.evaluate('() => App.view') == VIEWS[-2], 'Zurück-Taste'
    pg.click('#mainNav a[data-view="charts"]'); pg.wait_for_timeout(150)
    print('Bereichswechsel ok')

    # --- Startpunkt-Modus: Abbrechen sichtbar (Kritik 7) ---
    pg.click('#btnReplay'); pg.wait_for_timeout(100)
    assert pg.is_visible('#btnPickCancel'), 'Abbrechen im Startpunkt-Modus sichtbar'
    pg.click('#btnPickCancel'); assert not pg.evaluate('() => App.replay.picking')

    # --- Replay mitten im Datensatz, kein Lookahead ---
    pg.evaluate('() => App.startReplayAt(Math.floor(App.base.length*0.55))')
    pg.wait_for_timeout(200)
    c0 = pg.evaluate('() => App.cursor')
    look = pg.evaluate('''() => App.charts.map(c => { const m = c.model(); return { last: m.bar(m.n-1).t, cur: App.base[App.cursor].t, h: m.last.h, maxBase: Math.max(...App.base.slice(m.last.i0, App.cursor+1).map(b=>b.h)) }; })''')
    for l in look:
        assert l['last'] <= l['cur'], 'Lookahead!'
        assert abs(l['h'] - l['maxBase']) < 1e-9
    rth = pg.evaluate('() => { const L = App.rthNow(); return L && {ibh: L.ibh, onh: L.onh, maxT: App.base[App.cursor].t} }')
    print('lookahead ok, RTH', rth)

    # --- Market-Long über das Ticket ---
    pg.fill('#tkSl', '10'); pg.fill('#tkTp', '2'); pg.fill('#tkRisk', '400')
    pg.click('#btnBuy'); pg.wait_for_timeout(100)
    o = pg.evaluate('() => { const o = App.engine.orders[0]; return {status:o.status, qty:o.qty, entry:o.entryPrice, sl:o.sl, tp:o.tp, close: App.base[App.cursor].c}; }')
    print('order', o)
    assert o['status'] == 'open' and o['qty'] == 1 and abs(o['entry'] - (o['close'] + 0.25)) < 1e-9

    # --- Schutzregeln: TP auf Verlustseite verhindern, SL-Vergrößerung warnen ---
    r = pg.evaluate('() => { const o = App.engine.orders[0]; const before = o.tp; const ok = App.modifyOrder(o, "tp", o.entryPrice - 5); return {ok, same: o.tp === before}; }')
    assert r['ok'] is False and r['same'], 'TP auf Verlustseite muss abgewiesen werden'
    r = pg.evaluate('() => { const o = App.engine.orders[0]; App.modifyOrder(o, "sl", o.entryPrice - 25); const t = [...document.querySelectorAll(".toast")].map(x=>x.textContent).join("|"); return {sl:o.sl, toast:t, info: App.slInfo(o, o.sl)}; }')
    print('SL vergrößert', r['toast'][-90:])
    assert 'Risiko jetzt' in r['toast'] and r['info']['r'] < -2
    assert len(pg.query_selector_all('#toasts .toast')) <= 2, 'max. 2 Toasts'
    pg.evaluate('() => { const o = App.engine.orders[0]; App.modifyOrder(o, "sl", o.entryPrice - 10); }')
    # SL per +/- Tick-Knopf
    sl0 = pg.evaluate('() => App.engine.orders[0].sl')
    pg.wait_for_timeout(500)
    pg.click("#posList .pos [data-act=\"sl+\"]")
    assert abs(pg.evaluate("() => App.engine.orders[0].sl") - (sl0 - 0.25)) < 1e-9, 'SL + = einen Tick weiter weg'

    # --- Positions-Werkzeug: Short setzen, SL ziehen, platzieren ---
    pg.keyboard.press('Shift+S')
    assert pg.evaluate('() => App.tool') == 'short'
    c = pg.evaluate('''() => { const c = App.activeChart; const r = c.cv.getBoundingClientRect(); const y = c.yOf(App.price() + 12); return {x: r.left + c.plot.w * 0.5, y: r.top + y}; }''')
    pg.mouse.click(c['x'], c['y']); pg.wait_for_timeout(120)
    d = pg.evaluate('() => App.posDraft && {side: App.posDraft.side, entry: App.posDraft.entry, sl: App.posDraft.sl, tp: App.posDraft.tp, px: App.price()}')
    print('Entwurf', d)
    assert d and d['side'] == -1 and d['sl'] > d['entry'] > d['tp']
    assert pg.is_visible('.chart.active .pos-confirm'), 'Bestätigen-Leiste sichtbar'
    pg.screenshot(path=out + '/2-positionswerkzeug.png')
    # SL-Griff ziehen (Label-Box als Griff)
    box = pg.evaluate('''() => { const c = App.activeChart; const L = c._lines.find(l => l.draft && l.f === 'sl'); const r = c.cv.getBoundingClientRect(); return {x: r.left + L.box.x + 20, y: r.top + L.box.y + 9, dy: c.yOf(App.posDraft.sl - 0) - c.yOf(App.posDraft.sl + 4)}; }''')
    pg.mouse.move(box['x'], box['y']); pg.mouse.down(); pg.mouse.move(box['x'], box['y'] - box['dy'] / 2, steps=4); pg.mouse.move(box['x'], box['y'] - box['dy'], steps=4)
    live = pg.evaluate('() => App.activeChart._lines.find(l => l.draft && l.f === "sl").label')
    pg.mouse.up(); pg.wait_for_timeout(80)
    d2 = pg.evaluate('() => App.posDraft.sl')
    print('SL gezogen', d['sl'], '→', d2, '| Label:', live)
    assert d2 > d['sl'] + 2, 'SL muss nach oben gezogen sein'
    assert 'Punkte' in live and '$' in live
    txt = pg.inner_text('.chart.active .pos-confirm')
    assert 'R:R' in txt and 'Risiko' in txt, txt
    pg.keyboard.press('Enter'); pg.wait_for_timeout(120)
    pend = pg.evaluate('() => App.engine.orders.filter(o => o.status === "pending").map(o => ({type: o.type, side: o.side, sl: o.sl}))')
    print('platziert', pend)
    assert pend and pend[-1]['side'] == -1 and pend[-1]['type'] == 'limit' and abs(pend[-1]['sl'] - d2) < 1e-9 and pg.evaluate('() => App.posDraft') is None
    # Esc bricht Entwurf ab
    pg.keyboard.press('Shift+B'); pg.mouse.click(c['x'], c['y'] + 80); pg.wait_for_timeout(50)
    assert pg.evaluate('() => !!App.posDraft'); pg.keyboard.press('Escape'); assert pg.evaluate('() => App.posDraft') is None

    # --- Tastenkürzel in Zahlenfeldern abfangen ---
    pg.click('#tkSl'); pg.keyboard.press('b'); pg.keyboard.press('Enter')
    assert pg.evaluate('() => document.activeElement.id') != 'tkSl', 'Enter verlässt das Feld'
    n_orders = pg.evaluate('() => App.engine.orders.length')
    pg.click('#tkRisk'); pg.keyboard.press('s')
    assert pg.evaluate('() => App.engine.orders.length') == n_orders, 'S im Zahlenfeld darf nicht verkaufen'
    pg.keyboard.press('Escape')

    # --- Limit/Stop vorbelegen ---
    pg.click('#tkType [data-v="pending"]')
    assert abs(float(pg.input_value('#tkPrice')) - pg.evaluate('() => App.price()')) < 1e-9, 'Limit-Feld mit Kurs vorbelegt'
    pg.click('#tkType [data-v="market"]')

    # --- Vollbild an/aus ---
    pg.keyboard.press('g'); pg.wait_for_timeout(250)
    fs = pg.evaluate('() => ({fs: document.body.classList.contains("fs"), side: getComputedStyle(document.getElementById("side")).display, panel: getComputedStyle(document.getElementById("fsPanel")).display, w: App.activeChart.W})')
    print('Vollbild', fs)
    assert fs['fs'] and fs['side'] == 'none' and fs['panel'] != 'none' and fs['w'] > 1200
    pg.screenshot(path=out + '/3-vollbild.png')
    pg.click('#fsMin'); assert pg.evaluate('() => document.getElementById("fsPanel").classList.contains("min")'); pg.click('#fsMin')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    assert not pg.evaluate('() => document.body.classList.contains("fs")'), 'Esc beendet Vollbild'

    # --- Abspielen bis die Position zu ist; Auto-Foto beim Ein- und Ausstieg ---
    for i in range(600):
        pg.keyboard.press('ArrowRight')
        if pg.evaluate('() => App.engine.orders[0].status') == 'closed':
            break
    pg.wait_for_timeout(600)
    pg.screenshot(path=out + '/4-replay.png')
    tid = pg.evaluate('() => App.journal[App.journal.length-1].id')
    ph = pg.evaluate('async (id) => (await Photos.list(id)).map(r => ({kind: r.kind, size: r.blob.size, type: r.blob.type, w: r.w}))', tid)
    print('Fotos', ph)
    kinds = sorted(x['kind'] for x in ph)
    assert pg.evaluate('() => Photos.ok') and kinds == ['auto-entry', 'auto-exit'], 'Auto-Fotos beim Einstieg und Ausstieg'
    assert all(x['type'] == 'image/jpeg' and x['size'] > 3000 and x['w'] <= 1400 for x in ph)

    # --- Lookahead über das Journal: früherer Trade aus späterer Zeit ist im Replay unsichtbar ---
    fut = pg.evaluate('''() => { const t = App.base[App.base.length-5].t; App.journal.push({id:'zukunft-1', sym: App.symbol, replay: 1, side: 1, qty: 1, entryT: t - 600, exitT: t, entryPrice: 1, exitPrice: 2, pnl: 9999, r: 5, status: 'closed', fees: 0});
      const b1 = App.balance(); const vis = App.visibleJournal().some(j => j.id === 'zukunft-1'); const marks = App.chartTrades().some(j => j.id === 'zukunft-1');
      return {b1, vis, marks}; }''')
    assert not fut['vis'] and not fut['marks'] and fut['b1'] < 59000, fut
    pg.evaluate("() => { App.journal = App.journal.filter(j => j.id !== 'zukunft-1'); App.saveJournal(); }")

    # --- Journal-Bereich: Tabelle, Detail mit Fotos, Upload ---
    pg.click('#mainNav a[data-view="journal"]'); pg.wait_for_timeout(400)
    rows = pg.query_selector_all('#jTable .jrow')
    assert rows and pg.query_selector('#jTable img.thumb'), 'Journal-Zeile mit Vorschaubild'
    pg.screenshot(path=out + '/5-journal.png')
    rows[0].click(); pg.wait_for_selector('#tdPhotos .ph'); pg.wait_for_timeout(200)
    n0 = len(pg.query_selector_all('#tdPhotos .ph'))
    pg.evaluate('''async () => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#356'; x.fillRect(0,0,2400,1200);
      const b = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([b], 'notiz.png', {type: 'image/png'});
      const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('#tdPhotos input[type=file]'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); }''')
    pg.wait_for_function('(n) => document.querySelectorAll("#tdPhotos .ph").length > n', arg=n0)
    up = pg.evaluate('async () => (await Photos.list(App.journal[App.journal.length-1].id)).find(r => r.kind === "upload")')
    assert up and up['w'] == 1600, 'Upload auf 1600 px verkleinert'
    pg.screenshot(path=out + '/6-trade-detail.png')
    pg.click('#tdPhotos .ph'); pg.wait_for_timeout(200)
    assert pg.is_visible('#lightbox') and 'Einstieg' in pg.inner_text('#lbCap')
    pg.keyboard.press('ArrowRight'); assert '2 /' in pg.inner_text('#lbCap')
    pg.keyboard.press('Escape'); pg.keyboard.press('Escape')

    # --- Sicherung inkl. Fotos: exportieren, Fotos löschen, wieder importieren ---
    bk = pg.evaluate('''async () => { const b = UI.backup(); b.photos = await Photos.exportAll(); const n = b.photos.length; const id = App.journal[App.journal.length-1].id;
      await Photos.delOwner(id); const after = (await Photos.list(id)).length; const r = await UI.importBackup(b); return {n, after, back: (await Photos.list(id)).length, imp: r.p}; }''')
    print('Sicherung', bk)
    assert bk['n'] >= 3 and bk['after'] == 0 and bk['back'] >= 3 and bk['imp'] >= 3

    # --- Zurück zu Charts, Replay beenden → Session-Dialog ---
    pg.click('#mainNav a[data-view="charts"]'); pg.wait_for_timeout(150)
    pg.click('#btnStop'); pg.wait_for_timeout(150)
    if pg.is_visible('#confirmModal'):
        assert '1 wartende Order wird' in pg.inner_text('#cfText') or 'offene Position' in pg.inner_text('#cfText')
        pg.click('#cfOk')
    pg.wait_for_timeout(250)
    assert pg.is_visible('#sessModal'), 'Session-Dialog nach Replay-Ende'
    pg.select_option('#sessForm select[name=strategy]', index=1)
    pg.click('#sessDisc label:nth-child(4)')
    pg.click('#sessMistakes label:nth-child(2)')
    pg.fill('#sessForm textarea[name=bad]', 'Zu früh eingestiegen, vor der Bestätigung.')
    pg.screenshot(path=out + '/7-session.png')
    pg.click('#sessForm button[type=submit]'); pg.wait_for_timeout(200)

    # --- Backtests, Statistik, Strategien ---
    pg.click('#mainNav a[data-view="backtests"]'); pg.wait_for_timeout(300)
    assert pg.query_selector('#notesBody .sess')
    pg.screenshot(path=out + '/8-backtests.png')
    # Teilausstieg über das Ticket, damit Statistik mehr Daten hat
    pg.click('#mainNav a[data-view="charts"]'); pg.wait_for_timeout(100)
    pg.evaluate('''() => { App.randomStart(); const T = App.settings.ticket; Object.assign(T, {tp1R: 1, tp1Pct: 50, beR: 1, trail: 0, slPts: 6, tpR: 3, risk: 600}); App.placeOrder(1);
      for (let k = 0; k < 2000 && App.engine.orders[0].status !== 'closed'; k++) App.advanceTo(App.cursor + 1); Object.assign(T, {tp1R: 0, beR: 0}); }''')
    part = pg.evaluate('() => { const j = App.journal[App.journal.length-1]; return {partials: j.partials ? j.partials.length : 0, reason: j.reason, n: App.journal.filter(x => x.replay === j.replay).length}; }')
    print('Teilausstieg im Journal', part)
    assert part['n'] == 1, 'Teilausstiege bleiben EIN Journal-Eintrag'
    pg.evaluate('''() => { for (let k = 0; k < 12; k++) { App.placeOrder(k % 2 ? 1 : -1); for (let s = 0; s < 3000 && App.engine.open().length; s++) App.advanceTo(App.cursor + 1); } }''')
    pg.evaluate('() => App.forceStopReplay()')
    pg.click('#mainNav a[data-view="stats"]'); pg.wait_for_timeout(200)
    pg.wait_for_function('() => /Läufe/.test(document.getElementById("mcOut").textContent) && /2\\.000/.test(document.getElementById("mcOut").textContent)', timeout=20000)
    mc = pg.inner_text('#mcOut'); print('Monte-Carlo:', mc.replace('\n', ' '))
    assert pg.query_selector('#calBox .cal-g i[title]'), 'Kalender mit Tages-PnL'
    pg.screenshot(path=out + '/9-statistik.png', full_page=True)
    pg.click('#mainNav a[data-view="strategien"]'); pg.wait_for_timeout(200)
    pg.click('#stratAdd'); pg.wait_for_timeout(100)
    pg.fill('#stratList .strat-card:first-child [data-k="name"]', 'ORB 15'); pg.press('#stratList .strat-card:first-child [data-k="name"]', 'Tab')
    assert pg.evaluate('() => App.strategies.some(s => s.name === "ORB 15")')
    pg.screenshot(path=out + '/10-strategien.png')
    pg.click('#mainNav a[data-view="tradingview"]'); pg.wait_for_timeout(300)
    tv = pg.evaluate('() => ({script: !!document.querySelector("#tvHost script[src*=embed-widget-advanced-chart]") || !!document.getElementById("tvFallback"), cfg: (document.querySelector("#tvHost script") || {}).textContent || ""})')
    assert tv['script'] and ('de_DE' in tv['cfg'] or tv['cfg'] == '')
    pg.wait_for_selector('#tvFallback', timeout=12000)
    pg.screenshot(path=out + '/11-tradingview.png')

    # --- Einstellungen zurücksetzen wirkt (Fund 5) ---
    pg.click('#mainNav a[data-view="charts"]')
    pg.evaluate('() => { App.settings.ticket.risk = 123; App.settings.ind.vwap = false; App.saveSettings(); }')
    pg.click('#btnSettings'); pg.click('#setReset'); pg.click('#cfOk'); pg.wait_for_timeout(200)
    rs = pg.evaluate('() => ({risk: App.settings.ticket.risk, vwap: App.settings.ind.vwap, def: DEFAULTS.ticket.risk})')
    assert rs == {'risk': 500, 'vwap': True, 'def': 500}, rs

    for v in ALL_VIEWS:
        pg.evaluate("(v) => location.hash = '#' + v", v); pg.wait_for_timeout(250)
        bad = overlaps(pg)
        if bad: errs.append('1440 %s Überlappung: %s' % (v, bad[:4]))
    pg.evaluate("() => location.hash = '#charts'"); pg.wait_for_timeout(200)
    pg.click('#btnData'); pg.wait_for_timeout(150); pg.screenshot(path=out + '/12-daten.png'); pg.keyboard.press('Escape')
    pg.click('#layoutSeg [data-l="4"]'); pg.wait_for_timeout(300); pg.screenshot(path=out + '/13-layout4.png')
    pg.close()

    # --- 1280×720 ---
    pg = page(b, 1280, 720)
    pg.evaluate('() => { App.startReplayAt(Math.floor(App.base.length*0.7)); App.placeOrder(-1); }')
    pg.wait_for_timeout(300)
    for v in ALL_VIEWS:
        pg.evaluate("(v) => location.hash = '#' + v", v); pg.wait_for_timeout(350)
        pg.screenshot(path=out + '/s-%s.png' % v)
        bad = overlaps(pg)
        if bad: errs.append('1280 %s Überlappung: %s' % (v, bad[:4]))
    pg.close()

    # --- Handy 390×844 ---
    m = page(b, 390, 844, touch=True)
    st = m.evaluate('() => ({charts: App.charts.length, nav: getComputedStyle(document.getElementById("mainNav")).position, act: getComputedStyle(document.getElementById("mAct")).display, navH: document.querySelector("#mainNav a").getBoundingClientRect().height})')
    print('mobil', st)
    assert st['charts'] == 1 and st['nav'] == 'fixed' and st['act'] != 'none' and st['navH'] >= 48
    m.evaluate('() => App.startReplayAt(Math.floor(App.base.length*0.6))')
    m.tap('#mBuy'); m.wait_for_timeout(200)
    assert m.evaluate('() => App.engine.open().length') == 1, 'Kaufen über die Aktionsleiste'
    m.tap('#mStep'); m.wait_for_timeout(100)
    m.screenshot(path=out + '/m-charts.png')
    sw = m.evaluate('() => document.documentElement.scrollWidth'); print('mobile scrollWidth', sw); assert sw <= 390
    # Bottom-Sheet: Chart füllt die Fläche, Ticket per Griff aufziehen
    sh = m.evaluate('() => { const c = document.getElementById("charts").getBoundingClientRect(); const s = document.getElementById("side").getBoundingClientRect(); return {chartH: c.height, sheetTop: s.top, vh: innerHeight}; }')
    print('Sheet zu', sh)
    assert sh['chartH'] > 300 and sh['sheetTop'] > sh['vh'] - 200, 'Chart groß, Sheet eingeklappt'
    m.tap('#sheetH'); m.wait_for_timeout(350)
    so = m.evaluate('() => ({open: document.body.classList.contains("sheet-open"), top: document.getElementById("side").getBoundingClientRect().top, buy: (() => { const b = document.getElementById("btnBuy").getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2); return !!t && (t.id === "btnBuy" || !!t.closest("#btnBuy")); })()})')
    print('Sheet offen', so)
    assert so['open'] and so['top'] < 400, 'Sheet aufgezogen'
    m.evaluate('() => document.getElementById("btnBuy").scrollIntoView({block: "center"})'); m.wait_for_timeout(100)
    m.screenshot(path=out + '/m-ticket.png')
    m.tap('#sheetBackdrop', position={'x': 200, 'y': 72}); m.wait_for_timeout(300)
    assert not m.evaluate('() => document.body.classList.contains("sheet-open")'), 'Sheet schließt per Tipp daneben'
    for v in ALL_VIEWS[2:]:
        if m.is_visible('#mainNav a[data-view="%s"]' % v): m.tap('#mainNav a[data-view="%s"]' % v)
        else: m.tap('#navMore'); m.wait_for_timeout(150); m.tap('#moreMenu a[href="#%s"]' % v)  # v4: Strategien/Handbuch/TradingView unter „Mehr“
        m.wait_for_timeout(350)
        m.screenshot(path=out + '/m-%s.png' % v)
        bad = overlaps(m)
        if bad: errs.append('390 %s Überlappung: %s' % (v, bad[:4]))
    m.tap('#mainNav a[data-view="charts"]'); m.wait_for_timeout(200)
    m.tap('#btnFs'); m.wait_for_timeout(300)
    assert m.evaluate('() => document.body.classList.contains("fs") && getComputedStyle(document.getElementById("mainNav")).display === "none"')
    m.screenshot(path=out + '/m-vollbild.png')
    m.tap('#fsExit'); m.wait_for_timeout(200)
    m.tap('#btnHelp'); m.wait_for_timeout(150)
    assert m.is_visible('#helpModal [data-panel="touch"]') and not m.is_visible('#helpModal [data-panel="keys"]'), 'Hilfe zeigt Gesten auf Touch'
    m.close()
    b.close()
print('\n'.join(errs) if errs else 'keine Fehler')
if any('PAGEERROR' in e or 'console.error' in e for e in errs):
    raise SystemExit(1)
