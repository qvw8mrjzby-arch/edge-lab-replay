"""Tests für Version 3 (Playwright, headless): Übersicht, Einführung, Erklärungen, Rückgängig, IndexedDB-Migration,
Update-Banner und Installieren (simuliert), Fehler-Netz, Einstellungen mit Reitern sowie die QA-Funde 1–3 und 5–12."""
import os, json
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
out = 'shots'; os.makedirs(out, exist_ok=True)
errs = []
passed = []


def ok(cond, name):
    assert cond, name
    passed.append(name)


def page(b, w=1440, h=860, touch=False, onboard=False, init=None, hash='#charts'):
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, device_scale_factor=2 if touch else 1)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append('%dpx console.%s: %s' % (w, m.type, m.text)) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load' not in m.text and '[Edge Lab]' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('%dpx PAGEERROR: %s' % (w, e)) if 'Testfehler' not in str(e) and 'Versprechen gebrochen' not in str(e) else None)
    pg.on('dialog', lambda d: d.accept())
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.route('https://s3.tradingview.com/**', lambda r: r.abort())
    if not onboard: pg.add_init_script('try { if (!sessionStorage.getItem("t")) { localStorage.setItem("elr.onboarded", "1"); sessionStorage.setItem("t", "1"); } } catch (_) {}')
    if init: pg.add_init_script(init)
    pg.goto(url + (hash or ''))
    pg.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0 && !document.getElementById("boot")', timeout=20000)
    pg.wait_for_timeout(250)
    return pg


def toasts(pg): return pg.evaluate('() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent)')


def trade_some(pg, n=6):
    pg.evaluate('''(n) => { App.randomStart(); Object.assign(App.settings.ticket, {slPts: 8, tpR: 2, risk: 500, riskMode: 'money', qtyMode: 'risk', type: 'market', tp1R: 0, beR: 0, trail: 0});
      for (let k = 0; k < n; k++) { App.placeOrder(k % 2 ? 1 : -1); for (let s = 0; s < 3000 && App.engine.open().length; s++) App.advanceTo(App.cursor + 1); } }''', n)


with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- Einführung (erster Start) ----------
    pg = page(b, onboard=True, hash='')
    ok(pg.evaluate('() => App.view') == 'start', 'Startbereich ist die Übersicht')
    pg.wait_for_selector('#onboardModal:not([hidden])', timeout=3000)
    ok('Schritt 1 von 3' in pg.inner_text('#obCount') and pg.is_hidden('#obBack'), 'Einführung Schritt 1')
    pg.screenshot(path=out + '/v3-onboarding.png')
    pg.click('#obNext'); ok('Schritt 2 von 3' in pg.inner_text('#obCount'), 'Weiter')
    pg.click('#obBack'); ok('Schritt 1 von 3' in pg.inner_text('#obCount'), 'Zurück')
    pg.click('#obNext'); pg.click('#obNext')
    ok(pg.inner_text('#obNext').startswith('Los') and pg.is_hidden('#obSkip'), 'Letzter Schritt')
    pg.click('#obNext'); pg.wait_for_timeout(200)
    ok(pg.is_hidden('#onboardModal') and pg.evaluate('() => localStorage.getItem("elr.onboarded")') == '1', 'Einführung abgeschlossen und gemerkt')
    # Leerer Zustand der Übersicht: 3 Schritte mit Knöpfen
    steps = pg.evaluate('() => [...document.querySelectorAll("#stBody .step")].map(s => s.querySelector("button").textContent)')
    ok(steps == ['Strategie anlegen', 'Session starten', 'Statistik ansehen'], 'Übersicht: 3-Schritt-Anleitung für neue Nutzer')
    pg.screenshot(path=out + '/v3-start-leer.png')
    pg.reload(); pg.wait_for_function('() => App.base && !document.getElementById("boot")'); pg.wait_for_timeout(500)
    ok(pg.is_hidden('#onboardModal'), 'Einführung erscheint nur beim ersten Start')
    # Hilfe: Reiter, Begriffe
    pg.click('#btnHelp')
    pg.click('#helpTabs [data-t="begriffe"]')
    ok('Profit-Faktor' in pg.inner_text('#glossList') and pg.is_hidden('#helpModal [data-panel="ablauf"]'), 'Hilfe: Reiter Begriffe')
    pg.keyboard.press('Escape')
    pg.close()

    # ---------- IndexedDB-Migration aus dem localStorage (v2-Daten) ----------
    v2 = {
        'elr.journal': [{'id': 'm1', 'sym': 'NQ', 'side': 1, 'qty': 1, 'entryT': 1700000000, 'exitT': 1700000600, 'entryPrice': 100, 'exitPrice': 102, 'pnl': 40, 'r': 1, 'status': 'closed', 'fees': 0, 'replay': 5},
                        {'id': 'm2', 'sym': 'NQ', 'side': -1, 'qty': 1, 'entryT': 1700001000, 'exitT': 1700001600, 'entryPrice': 102, 'exitPrice': 103, 'pnl': -20, 'r': -0.5, 'status': 'closed', 'fees': 0, 'replay': 5}],
        'elr.sessions': [{'id': 'n9', 'created': 1700000000, 'replayId': 5, 'strategy': 'Alt', 'sym': 'NQ', 'running': True, 'discipline': 4, 'mistakes': ['FOMO']}],
        'elr.strategies': [{'id': 's7', 'name': 'Alt', 'rules': 'A\nB', 'desc': ''}]
    }
    init = 'if (!sessionStorage.getItem("mig")) { sessionStorage.setItem("mig", "1"); ' + ''.join('localStorage.setItem(%s, %s);' % (json.dumps(k), json.dumps(json.dumps(v))) for k, v in v2.items()) + '}'
    pg = page(b, init=init, hash='#start')
    mg = pg.evaluate('''async () => ({ mode: Store.mode, j: App.journal.length, s: App.sessions.length, st: App.strategies.map(x => x.name),
      ls: ['elr.journal', 'elr.sessions', 'elr.strategies'].map(k => localStorage.getItem(k)), idb: (await Store.getIdb('journal')).length,
      orphan: App.sessions[0].running })''')
    print('Migration', mg)
    ok(mg['mode'] == 'idb' and mg['j'] == 2 and mg['s'] == 1 and mg['st'] == ['Alt'] and mg['idb'] == 2, 'Migration nach IndexedDB')
    ok(mg['ls'] == [None, None, None], 'localStorage nach Migration geräumt')
    ok(mg['orphan'] is False, 'QA4: verwaiste laufende Session beim Start geschlossen')
    pg.reload(); pg.wait_for_function('() => App.base && !document.getElementById("boot")'); pg.wait_for_timeout(300)
    ok(pg.evaluate('() => App.journal.length') == 2, 'Daten nach Neuladen aus IndexedDB')
    # Übersicht mit Daten: Kennzahlen, letzte Sessions, Disziplin, Fehler
    pg.evaluate("() => location.hash = '#start'"); pg.wait_for_timeout(200)
    st = pg.evaluate('() => ({kpis: [...document.querySelectorAll(".hk span")].map(s => s.textContent.trim()), rows: document.querySelectorAll(".srow").length, disc: document.querySelectorAll(".disc-bars > div").length, mk: document.querySelector(".mk-row") && document.querySelector(".mk-row").textContent})')
    print('Übersicht', st)
    ok(st['kpis'][:5] == ['Kontostand', 'Netto', 'Trefferquote', 'Ø R', 'Profit-Faktor'] and st['rows'] == 1 and st['disc'] == 1 and 'FOMO' in st['mk'], 'Übersicht mit Kennzahlen, Sessions, Disziplin, Fehlern')
    # Speicher-Anzeige in den Einstellungen
    pg.click('#btnSettings'); pg.click('#setTabs [data-t="daten"]'); pg.wait_for_timeout(300)
    ok('IndexedDB' in pg.inner_text('#storMode') and ('MB' in pg.inner_text('#storTxt') or 'nicht verfügbar' in pg.inner_text('#storTxt')), 'Speicheranzeige')
    ok(len(pg.query_selector_all('#setTabs [data-t]')) == 7, 'Einstellungen mit 7 Reitern (inkl. Konto & Sync)')
    pg.screenshot(path=out + '/v3-einstellungen-daten.png')
    pg.keyboard.press('Escape')
    pg.close()

    # ---------- Übersicht mit echten Trades, Erklärungen, Rückgängig ----------
    pg = page(b)
    trade_some(pg, 8)
    pg.evaluate('() => { App.createRunningSession({replayId: App.replay.id, strategy: "", sym: App.symbol}); App.forceStopReplay(); }')
    pg.evaluate("() => location.hash = '#start'"); pg.wait_for_timeout(300)
    pg.screenshot(path=out + '/v3-start.png')
    # Erklärung per „i“
    pg.click('.hero .infotip[data-tip="pf"]'); pg.wait_for_timeout(100)
    ok(pg.is_visible('#tipPop') and 'Profit-Faktor' in pg.inner_text('#tipPop'), 'Erklärung als Popover')
    ok(pg.get_attribute('.hero .infotip[data-tip="pf"]', 'aria-label') == 'Was ist Profit-Faktor?', 'Erklärung zugänglich (aria-label)')
    pg.keyboard.press('Escape'); ok(pg.is_hidden('#tipPop'), 'Esc schließt Erklärung')
    # Trade löschen → Rückgängig
    pg.evaluate("() => location.hash = '#journal'"); pg.wait_for_timeout(400)
    n0 = pg.evaluate('() => App.journal.length')
    pg.click('#jTable .jrow'); pg.wait_for_selector('#tradeModal:not([hidden])')
    tid = pg.evaluate('() => UI._trade.id')
    pg.click('#tdDel'); pg.wait_for_timeout(150)
    ok(pg.evaluate('() => App.journal.length') == n0 - 1 and pg.is_hidden('#confirmModal'), 'Trade gelöscht ohne Bestätigungs-Dialog')
    ok(any('Rückgängig' in t for t in toasts(pg)), 'Toast mit Rückgängig')
    pg.click('#toasts .toast-act'); pg.wait_for_timeout(200)
    ok(pg.evaluate('(id) => App.journal.some(j => j.id === id)', tid) and pg.evaluate('() => App.journal.length') == n0, 'Rückgängig stellt Trade wieder her')
    # endgültig: Fotos verschwinden erst nach Ablauf
    pg.evaluate('''async (id) => { await Photos.add(id, 'upload', new Blob([new Uint8Array(400)], {type: 'image/jpeg'}), 10, 10); }''', tid)
    pg.click('#jTable .jrow[data-id="%s"]' % tid); pg.wait_for_selector('#tradeModal:not([hidden])'); pg.click('#tdDel')
    ok(pg.evaluate('async (id) => (await Photos.list(id)).length', tid) >= 1, 'Fotos bleiben während Rückgängig möglich ist')
    pg.wait_for_timeout(6600)
    ok(pg.evaluate('async (id) => (await Photos.list(id)).length', tid) == 0, 'Fotos nach Ablauf gelöscht')
    # Session löschen → Rückgängig
    pg.evaluate("() => location.hash = '#backtests'"); pg.wait_for_timeout(300)
    ns = pg.evaluate('() => App.sessions.length')
    pg.click('#notesBody .sess'); pg.wait_for_selector('#sessModal:not([hidden])'); pg.click('#sessDelete'); pg.wait_for_timeout(150)
    ok(pg.evaluate('() => App.sessions.length') == ns - 1, 'Session gelöscht')
    pg.click('#toasts .toast.undo .toast-act'); pg.wait_for_timeout(150)
    ok(pg.evaluate('() => App.sessions.length') == ns, 'Session wiederhergestellt')
    # Zeichnung löschen → Rückgängig
    pg.evaluate("() => location.hash = '#charts'"); pg.wait_for_timeout(200)
    pg.evaluate('() => { App.addDrawing({type: "hline", a: {t: 0, p: App.price()}}); }')
    pg.evaluate('() => App.deleteSelected()')
    ok(pg.evaluate('() => App.drawings.length') == 0, 'Zeichnung gelöscht')
    pg.click('#toasts .toast.undo .toast-act'); ok(pg.evaluate('() => App.drawings.length') == 1, 'Zeichnung wiederhergestellt')
    # Foto löschen → Rückgängig (auch bei offener Lightbox sichtbar)
    pid = pg.evaluate('''async () => { const j = App.journal[0]; await Photos.add(j.id, 'upload', new Blob([new Uint8Array(300)], {type: 'image/jpeg'}), 8, 8); await Photos.add(j.id, 'upload', new Blob([new Uint8Array(300)], {type: 'image/jpeg'}), 8, 8); return j.id; }''')
    pg.evaluate('(id) => UI.openTrade(id)', pid); pg.wait_for_selector('#tdPhotos .ph'); pg.click('#tdPhotos .ph'); pg.wait_for_timeout(150)
    nph = pg.evaluate('async (id) => (await Photos.list(id)).length', pid)
    pg.click('#lbDel'); pg.wait_for_timeout(150)
    ok(pg.evaluate('async (id) => (await Photos.list(id)).length', pid) == nph - 1 and pg.is_visible('#toasts .toast.undo'), 'Foto gelöscht, Rückgängig sichtbar über dem Dialog')
    pg.click('#toasts .toast.undo .toast-act'); pg.wait_for_timeout(200)
    ok(pg.evaluate('async (id) => (await Photos.list(id)).length', pid) == nph, 'Foto wiederhergestellt')
    pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
    # „Journal leeren“ behält die Bestätigung
    pg.evaluate("() => location.hash = '#journal'"); pg.wait_for_timeout(200)
    pg.click('#jClear'); ok(pg.is_visible('#confirmModal'), 'Journal leeren fragt nach'); pg.click('#cfCancel')

    # ---------- Update-Banner und Installieren (simuliert), Fehler-Netz ----------
    pg.evaluate('() => { window.__msgs = []; window.dispatchEvent(new CustomEvent("elr-update", {detail: {postMessage: (m) => window.__msgs.push(m)}})); }')
    ok(pg.is_visible('#updBanner'), 'Update-Banner erscheint')
    pg.screenshot(path=out + '/v3-update.png')
    pg.click('#updReload'); ok(pg.evaluate('() => window.__msgs') == ['skipWaiting'], 'Neu laden aktiviert die wartende Version')
    pg.evaluate('''() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({outcome: 'accepted'}); window.dispatchEvent(e); }''')
    pg.evaluate("() => location.hash = '#start'"); pg.wait_for_timeout(200)
    ok(pg.is_visible('#stInstall'), 'Knopf „Als App installieren“')
    pg.click('#stInstall'); ok(pg.evaluate('() => window.__prompted') is True, 'Installations-Dialog des Browsers')
    pg.evaluate('() => setTimeout(() => { throw new Error("Testfehler") }, 0)'); pg.wait_for_timeout(200)
    ok(any('schiefgelaufen' in t for t in toasts(pg)), 'Globaler Fehler → Toast')
    pg.wait_for_timeout(4300); pg.evaluate('() => { Promise.reject(new Error("Versprechen gebrochen")); }'); pg.wait_for_timeout(200)
    ok(any('Versprechen gebrochen' in t for t in toasts(pg)), 'unhandledrejection → Toast')
    pg.close()

    # ---------- QA-Funde ----------
    # QA2a: Export im Blind-Modus gesperrt; QA2b: andere Replays desselben Markts im Blind-Modus unsichtbar
    pg = page(b)
    trade_some(pg, 2)
    pg.evaluate('() => App.forceStopReplay()')
    pg.evaluate('() => { App.startReplayAt(Math.floor(App.base.length * 0.3), {blind: true}); }')
    q2 = pg.evaluate('() => ({vis: App.visibleJournal().length, other: App.journal.filter(j => j.sym === App.symbol).length, marks: App.chartTrades().length})')
    ok(q2['other'] >= 2 and q2['vis'] == 0 and q2['marks'] == 0, 'QA2b: Blind-Modus blendet andere Replays desselben Markts aus')
    pg.evaluate('() => { window.__dl = 0; App.download = () => { window.__dl++; }; App.copy = () => { window.__dl++; }; }')
    pg.evaluate("() => location.hash = '#journal'"); pg.wait_for_timeout(200)
    pg.click('#jCsv'); pg.click('#jBackupBtn'); pg.click('#jCopy'); pg.click('#jBackupBtn'); pg.click('#jFile'); pg.wait_for_timeout(200)
    ok(pg.evaluate('() => window.__dl') == 0 and any('Blind-Session' in t for t in toasts(pg)), 'QA2a: Export im Blind-Modus gesperrt')
    pg.evaluate('() => App.forceStopReplay()')
    pg.click('#jCsv'); ok(pg.evaluate('() => window.__dl') == 1, 'Export nach der Session wieder möglich')
    # QA3: Ausstiegsfoto beim Beenden zeigt den Cursor zum Ausstieg, nicht das Datenende
    pg.evaluate("() => location.hash = '#charts'"); pg.wait_for_timeout(150)
    q3 = pg.evaluate('''() => { const idx = Math.floor(App.base.length * 0.4); App.startReplayAt(idx); App.placeOrder(1); App.advanceTo(App.cursor + 3);
      const seen = []; const orig = Chart.prototype.snapshot; Chart.prototype.snapshot = function () { seen.push(App.cursor); return orig.apply(this, arguments); };
      const cur = App.cursor; App.forceStopReplay(); Chart.prototype.snapshot = orig; return {seen, cur, end: App.base.length - 1}; }''')
    print('QA3', q3)
    ok(q3['seen'] and all(s == q3['cur'] for s in q3['seen']), 'QA3: Ausstiegsfoto am Ausstiegs-Cursor')
    # QA5: nach „Einstellungen zurücksetzen“ wirken die Replay-Regler
    pg.click('#btnSettings'); pg.click('#setReset'); pg.click('#cfOk'); pg.wait_for_timeout(200)
    pg.evaluate('() => App.startReplayAt(Math.floor(App.base.length * 0.5))')
    pg.fill('#rpSpeed', '30'); pg.dispatch_event('#rpSpeed', 'input')
    pg.select_option('#rpUnit', 'chart'); pg.uncheck('#rpPause')
    r5 = pg.evaluate('() => App.settings.replay')
    ok(r5['speed'] == 30 and r5['unit'] == 'chart' and r5['pauseOnFill'] is False, 'QA5: Replay-Regler nach Zurücksetzen')
    # QA10: Doppelklick auf Kaufen → genau eine Position, nichts geschlossen
    pg.dblclick('#btnBuy'); pg.wait_for_timeout(200)
    o10 = pg.evaluate('() => App.engine.orders.map(o => o.status)')
    ok(o10 == ['open'], 'QA10: Doppelklick Kaufen eröffnet genau eine Position')
    pg.evaluate('() => App.forceStopReplay()')
    # QA6: Strategie löschen leert das Ticket; unbekannter Name bleibt im Session-Dialog erhalten
    pg.evaluate("() => { App.strategies.push({id: 'sx', name: 'Weg', rules: '', desc: ''}); App.saveStrategies(); App.settings.ticket.setup = 'Weg'; App.sessions.push({id: 'nq6', created: 1, strategy: 'Weg', sym: 'X', mistakes: [], discipline: 0, result: 'auto'}); }")
    pg.evaluate("() => location.hash = '#strategien'"); pg.wait_for_timeout(200)
    pg.click('.strat-card[data-id="sx"] [data-act="del"]'); pg.click('#cfOk'); pg.wait_for_timeout(150)
    ok(pg.evaluate('() => App.settings.ticket.setup') == '', 'QA6: Ticket-Strategie nach Löschen geleert')
    pg.evaluate("() => App.openSession({id: 'nq6'})"); pg.wait_for_timeout(100)
    pg.click('#sessForm button[type=submit]'); pg.wait_for_timeout(100)
    ok(pg.evaluate("() => App.sessions.find(s => s.id === 'nq6').strategy") == 'Weg', 'QA6: Session behält gelöschten Strategie-Namen')
    # QA7: Import nach Umbenennen → keine doppelte ID
    q7 = pg.evaluate('''async () => { const bk = JSON.parse(JSON.stringify(UI.backup())); App.editStrategy(App.strategies.find(s => s.id === 's1') ? 's1' : App.strategies[0].id, 'name', 'Umbenannt');
      bk.strategies = [{id: 's1', name: 'Beispiel: VWAP-Rückeroberung', rules: 'x'}]; await UI.importBackup(bk); const ids = App.strategies.map(s => s.id); return {ids, uniq: new Set(ids).size === ids.length}; }''')
    ok(q7['uniq'], 'QA7: Import vergibt eindeutige Strategie-IDs')
    # QA9: ungültige Sicherung → Einträge verworfen, Bereich bleibt benutzbar
    q9 = pg.evaluate('''async () => { const n = App.sessions.length; await UI.importBackup({sessions: [{id: 'q'}, {id: 'q2', created: 'kaputt'}, {nope: 1}], trades: [{id: 'x'}, null, 5]}); return {n0: n, n1: App.sessions.length}; }''')
    pg.evaluate("() => location.hash = '#backtests'"); pg.wait_for_timeout(300)
    ok(q9['n1'] == q9['n0'] + 1 and pg.query_selector('#notesBody .sess') is not None, 'QA9: Import geprüft, Backtests bleibt intakt')
    ok(any('ungültige' in t for t in toasts(pg)), 'QA9: Hinweis auf übersprungene Einträge')
    # QA8: absurde Preise → keine Endlosschleife
    q8 = pg.evaluate('''() => { const bars = []; for (let i = 0; i < 100; i++) bars.push({t: 1700000000 + i * 60, o: 1e300, h: 1e300, l: 1e300, c: 1e300, v: 1});
      let err = ''; try { App.loadDataset({bars, baseTf: 60, tick: 0.25, pv: 1, symbol: 'HUGE', source: 'x'}); } catch (e) { err = e.message; }
      const b2 = []; for (let i = 0; i < 100; i++) b2.push({t: 1700000000 + i * 60, o: 9e8, h: 9e8, l: 9e8, c: 9e8, v: 1});
      App.loadDataset({bars: b2, baseTf: 60, tick: 0.25, pv: 1, symbol: 'FLAT', source: 'x'}); const a = performance.now(); App.charts.forEach(c => c.render()); return {err, ms: performance.now() - a}; }''')
    print('QA8', q8)
    ok('Zu wenige Kerzen' in q8['err'] and q8['ms'] < 500, 'QA8: 1e300 abgelehnt, flache Riesenpreise rendern schnell')
    pg.evaluate('() => Loader.demo(true)')
    pg.close()

    # QA1 (KRITISCH) + QA12: Handy quer – Platzieren trifft nicht „Verkaufen“; Chart füllt die Höhe
    m = page(b, 844, 390, touch=True)
    m.evaluate('() => App.startReplayAt(Math.floor(App.base.length * 0.6))'); m.wait_for_timeout(300)
    ch = m.evaluate('() => document.getElementById("charts").getBoundingClientRect().height')
    print('Quer: Chart-Höhe', ch)
    ok(ch >= 250, 'QA12: Querformat – Chart nutzt die Höhe')
    m.screenshot(path=out + '/v3-quer.png')
    m.evaluate('() => App.setTool("long")')
    c = m.evaluate('() => { const c = App.activeChart; const r = c.cv.getBoundingClientRect(); return {x: r.left + c.plot.w * 0.4, y: r.top + c.yOf(App.price() - 6)}; }')
    m.touchscreen.tap(c['x'], c['y']); m.wait_for_timeout(250)
    ok(m.evaluate('() => !!App.posDraft'), 'Entwurf im Querformat')
    free = m.evaluate('''() => { const b = document.querySelector('.chart.active .pos-confirm [data-pc="ok"]'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return {frei: t === b || b.contains(t), r: [r.top, r.bottom], vh: innerHeight}; }''')
    print('Platzieren-Knopf', free)
    ok(free['frei'] and free['r'][1] <= free['vh'], 'QA1: Platzieren-Knopf frei und sichtbar')
    ok(m.evaluate('() => document.getElementById("mSell").disabled'), 'QA1: Aktionsleiste während Entwurf gesperrt')
    m.screenshot(path=out + '/v3-quer-entwurf.png')
    m.tap('.chart.active .pos-confirm [data-pc="ok"]'); m.wait_for_timeout(200)
    o1 = m.evaluate('() => App.engine.orders.map(o => ({side: o.side, status: o.status, type: o.type}))')
    print('QA1 Orders', o1)
    ok(len(o1) == 1 and o1[0]['side'] == 1 and not any(o['side'] == -1 for o in o1), 'QA1: Platzieren erzeugt die geplante Long-Order, keinen Short')
    ok(not m.evaluate('() => document.getElementById("mSell").disabled'), 'Aktionsleiste nach Platzieren wieder frei')
    m.close()

    # QA11: Handy hoch – Bestätigungsleiste verdeckt keine Label-Griffe
    m = page(b, 390, 844, touch=True)
    m.evaluate('() => App.startReplayAt(Math.floor(App.base.length * 0.6))'); m.wait_for_timeout(300)
    m.evaluate('() => App.setTool("short")')
    c = m.evaluate('() => { const c = App.activeChart; const r = c.cv.getBoundingClientRect(); return {x: r.left + c.plot.w * 0.4, y: r.top + c.yOf(App.price() + 4)}; }')
    m.touchscreen.tap(c['x'], c['y']); m.wait_for_timeout(250)
    ov = m.evaluate('''() => { const c = App.activeChart, el = c.confirmEl, head = c.el.querySelector('.chart-head').offsetHeight;
      const x = el.offsetLeft, y = el.offsetTop - head, w = el.offsetWidth, h = el.offsetHeight;
      return c._lines.filter(L => L.box).filter(L => x < L.box.x + L.box.w && L.box.x < x + w && y < L.box.y + L.box.h && L.box.y < y + h).map(L => L.f); }''')
    print('QA11 überdeckte Labels', ov)
    ok(not ov, 'QA11: Bestätigungsleiste verdeckt keine SL/TP-Griffe')
    m.screenshot(path=out + '/v3-hoch-entwurf.png')
    m.close()

    # ---------- E2: Touch-Ziele ≥ 44 px, kein horizontales Scrollen (hoch und quer) ----------
    TOUCH = '''() => { const bad = []; const vw = innerWidth, vh = innerHeight, modal = !!document.querySelector('.modal:not([hidden])');
      for (const e of document.querySelectorAll('button, a[href], select, input, label.filebtn, [role=button], .tg')) {
        if (e.closest('[hidden]') || !e.getClientRects().length || (modal && !e.closest('.modal'))) continue;
        const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        if (e.matches('.infotip, input[type=range], input[type=file], input[type=checkbox], input[type=radio]')) continue;
        const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        if (r.width < 43.5 || r.height < 43.5) bad.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      } return {bad: [...new Set(bad)], sw: document.documentElement.scrollWidth, vw}; }'''
    for (w, h) in [(390, 844), (844, 390)]:
        m = page(b, w, h, touch=True)
        m.evaluate('() => { App.startReplayAt(Math.floor(App.base.length * 0.6)); App.placeOrder(1); }'); m.wait_for_timeout(200)
        for v in ['charts', 'start', 'journal', 'backtests', 'stats', 'strategien', 'tradingview']:
            m.evaluate("(v) => location.hash = '#' + v", v); m.wait_for_timeout(300)
            r = m.evaluate(TOUCH)
            ok(not r['bad'] and r['sw'] <= r['vw'], 'Touch-Ziele und Breite %dx%d %s %s' % (w, h, v, r['bad']))
        for js in ['() => { location.hash = "#charts"; Sheet.set(true); }', '() => { Sheet.set(false); UI.openSettings(); }', '() => { closeModal("#settingsModal"); NewSess.open(); }']:
            m.evaluate(js); m.wait_for_timeout(300)
            r = m.evaluate(TOUCH)
            ok(not r['bad'], 'Touch-Ziele %dx%d %s %s' % (w, h, js[:30], r['bad']))
        m.close()
    b.close()

print('%d Prüfungen ok' % len(passed))
print('\n'.join(errs) if errs else 'keine Fehler')
if errs: raise SystemExit(1)
