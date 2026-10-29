"""Tests für Version 4 (Playwright, headless): Fehler-Analyse mit gemockten Journal-Daten, „Betroffene Trades“ filtert das Journal,
Handbuch (Navigation, Suche, Deep-Link, Lesefortschritt, „Im Chart zeigen“, „Üben im Replay“), Nachlauf-Prüfung nur nach Session-Ende,
Einstiegs-Kontext beim Platzieren, Session-Dialog mit Kurzbefunden, Handy-Navigation mit „Mehr“. Netzwerk ist komplett gesperrt."""
import os, re
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
out = 'shots'; os.makedirs(out, exist_ok=True)
errs, passed = [], []

MOCK = r'''() => {
  const day = Date.UTC(2026, 5, 1, 13, 30) / 1000; let id = 0; const J = [];
  const mk = (rid, d, min, o) => { id++; const t = day + d * 86400 + min * 60; return Object.assign({ id: 'mock' + id, sym: 'NQ', src: 'Mock', replay: rid, side: 1, type: 'market', qty: 1, entryT: t, exitT: t + 900, entryPrice: 21000, exitPrice: 20990, avgExit: 20990, sl: 20990, slFinal: 20990, tp: 21020, reason: 'SL', pnl: -205, gross: -200, fees: 5, r: -1.025, risk: 200, points: -10, mae: 10, mfe: 4, maeR: 1, mfeR: 0.4, plannedR: 2, setup: 'VWAP-Rückeroberung', note: '', pv: 20, tick: 0.25, status: 'closed', riskTarget: 200, ctx: { vwapSide: 1 } }, o); };
  const W = { reason: 'TP', pnl: 395, r: 1.975, exitPrice: 21020, avgExit: 21020, mfe: 20, mfeR: 2, mae: 3, maeR: 0.3 };
  for (let s = 0; s < 8; s++) {
    const rid = 1000 + s;
    J.push(mk(rid, s, 0, W), mk(rid, s, 30, s % 2 ? W : {}), mk(rid, s, 60, s % 3 ? W : {}));
    if (s === 2) for (let k = 0; k < 6; k++) J.push(mk(rid, s, 90 + k * 20, { r: -0.6, pnl: -120 }));
  }
  J.push(mk(1003, 3, 200, { id: 'slbig', slFinal: 20980, pnl: -415, r: -2.075, exitPrice: 20980, avgExit: 20980, mae: 20, maeR: 2 }));
  J.push(mk(1004, 4, 120, {}), mk(1004, 4, 139, { risk: 300, riskTarget: 200, pnl: -305, r: -1.017 }));
  J.push(mk(1005, 5, 150, { ctx: { vwapSide: -1 } }), mk(1005, 5, 200, { ctx: { vwapSide: -1 } }), mk(1006, 6, 150, { ctx: { vwapSide: -1 } }));
  J.push(mk(1007, 7, 140, { reason: 'Manuell', r: 0.5, pnl: 100, mfeR: 2.2, mfe: 22 }), mk(1007, 7, 180, { reason: 'Manuell', r: 0.3, pnl: 60, mfeR: 1.1, post: { hitTp: true, minutes: 25, n: 25 } }));
  App.journal = J;
  App.sessions = [...new Set(J.map((j) => j.replay))].map((r, i) => ({ id: 'ns' + r, created: day + i * 86400, replayId: r, strategy: 'VWAP-Rückeroberung', sym: 'NQ', from: day + i * 86400, discipline: 3, mistakes: [], result: 'auto' }));
  return J.length;
}'''


def ok(cond, name):
    assert cond, name
    passed.append(name)


def page(b, w=1440, h=860, touch=False, hash='#start'):
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, device_scale_factor=2 if touch else 1)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append('%dpx console.%s: %s' % (w, m.type, m.text)) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load' not in m.text and '[Edge Lab]' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('%dpx PAGEERROR: %s' % (w, e)))
    pg.on('dialog', lambda d: d.accept())
    pg.route(re.compile(r'^https?://'), lambda r: r.abort())  # Netzwerk gesperrt
    pg.add_init_script('try { localStorage.setItem("elr.onboarded", "1"); } catch (_) {}')
    pg.goto(url + hash)
    pg.wait_for_function('() => typeof App !== "undefined" && App.base && App.base.length > 0 && !document.getElementById("boot")', timeout=20000)
    pg.wait_for_timeout(200)
    return pg


def go(pg, h):
    pg.evaluate('(h) => { location.hash = h; }', h); pg.wait_for_timeout(250)


with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- Analyse mit gemockten Journal-Daten ----------
    pg = page(b)
    go(pg, '#analyse')
    ok(pg.is_visible('#aBody .empty-state') and 'Noch nichts zu analysieren' in pg.inner_text('#aBody'), 'Analyse: leerer Zustand')
    n = pg.evaluate(MOCK)
    pg.evaluate('() => App.renderAnalysis()')
    res = pg.evaluate('() => App._an')
    ids = [f['id'] for f in res['befunde']]
    print('Befunde:', [(f['id'], f['schwere'], f['anzahl'], f['kostenUsd']) for f in res['befunde']])
    for want in ['sl-vergroessert', 'revenge', 'overtrading', 'zu-frueh-raus', 'gegen-vwap', 'risiko-zu-gross']:
        ok(want in ids, 'Analyse: Befund ' + want)
    cards = pg.evaluate('() => [...document.querySelectorAll("#aBody .an-card")].map(c => c.dataset.id)')
    ok(cards == ids, 'Analyse: Karten nach Kosten sortiert wie Core')
    ok(res['befunde'][0]['kostenUsd'] >= res['befunde'][-1]['kostenUsd'], 'Analyse: teuerster Befund zuerst')
    ok(pg.inner_text('.an-hero h2') == res['befunde'][0]['titel'], 'Analyse: Kopf zeigt größte Baustelle')
    sl = next(f for f in res['befunde'] if f['id'] == 'sl-vergroessert')
    ok(abs(sl['kostenUsd'] - 215) < 0.01 and sl['tradeIds'] == ['slbig'], 'Analyse: SL-Kosten = Verlust jenseits −1R (215 $)')
    card = pg.inner_text('.an-card[data-id="sl-vergroessert"]')
    ok('−215 $' in card and '1 Trade' in card, 'Analyse: Karte zeigt Anzahl und Kosten')
    tot = pg.inner_text('.an-sum')
    ok(('−' + format(round(res['kostenUsd']), ',').replace(',', '.') + ' $') in tot, 'Analyse: Summe geschätzter Kosten im Kopf')
    rv = next(f for f in res['befunde'] if f['id'] == 'revenge')
    ok(rv['schwere'] == 'hoch', 'Analyse: Revenge mit größerem Risiko = hoch')
    ok(len(pg.query_selector_all('.an-g')) >= 1, 'Analyse: Stärken werden gezeigt')
    pg.screenshot(path=out + '/v4-analyse-1440.png')
    # Filter: Strategie / letzte N Sessions
    pg.select_option('#aFilter', 'last:5')
    ok(pg.evaluate('() => App._an.n') < n and pg.evaluate('() => App.settings.aFilter') == 'last:5', 'Analyse: Filter letzte 5 Sessions')
    pg.select_option('#aFilter', 'all')
    # Betroffene Trades → Journal gefiltert
    pg.click('.an-card[data-id="overtrading"] [data-a-trades]'); pg.wait_for_timeout(300)
    ot = next(f for f in res['befunde'] if f['id'] == 'overtrading')
    rows = pg.evaluate('() => [...document.querySelectorAll("#jTable .jrow")].map(r => r.dataset.id)')
    ok(pg.evaluate('() => location.hash') == '#journal' and sorted(rows) == sorted(ot['tradeIds']), 'Betroffene Trades filtert das Journal')
    ok(pg.is_visible('#jIdFilter') and 'Overtrading' in pg.inner_text('#jIdFilter'), 'Journal: Filter-Hinweis sichtbar')
    pg.click('#jIdClear'); pg.wait_for_timeout(200)
    ok(len(pg.query_selector_all('#jTable .jrow')) == n and pg.is_hidden('#jIdFilter'), 'Journal: Filter aufheben')
    # Im Handbuch lesen → Deep-Link auf den Abschnitt
    go(pg, '#analyse')
    pg.click('.an-card[data-id="revenge"] [data-a-hb]'); pg.wait_for_timeout(400)
    ok(pg.evaluate('() => location.hash') == '#handbuch-revenge' and pg.inner_text('#hbTitle') == 'Psychologie & Fehler', 'Im Handbuch lesen öffnet Kapitel')
    ok(pg.evaluate('() => { const r = document.getElementById("hb-s-revenge").getBoundingClientRect(); return r.top >= -2 && r.top < 200; }'), 'Deep-Link scrollt zum Abschnitt')
    # Jede Handbuch-Verlinkung der Analyse existiert
    missing = pg.evaluate('''() => { const ids = new Set(); HB.forEach(c => { ids.add(c.id); c.abschnitte.forEach(s => ids.add(s.id)); });
      return ['sl-verschieben','zu-frueh-raus','stopp-setzen','revenge','overtrading','groesse','verlierer-halten','zeitfenster','checkliste','vwap-fehler','ziele'].filter(x => !ids.has(x)); }''')
    ok(missing == [], 'Alle Analyse-Verweise haben einen Handbuch-Abschnitt')
    # Übersicht: Karte „Größte Baustelle“
    go(pg, '#start')
    ok(pg.is_visible('.an-mini') and res['befunde'][0]['titel'] in pg.inner_text('.an-mini'), 'Übersicht: Karte Größte Baustelle')
    pg.close()

    # ---------- Handbuch ----------
    pg = page(b, hash='#handbuch')
    toc = pg.evaluate('() => [...document.querySelectorAll("#hbToc > ol > li > a .hb-tt")].map(a => a.textContent)')
    ok(len(toc) == 11 and toc[0] == 'Einleitung' and toc[-1] == 'Glossar', 'Handbuch: 11 Kapitel im Inhaltsverzeichnis')
    ok('Anlageberatung' in pg.inner_text('#hbRead'), 'Handbuch: Hinweis im Einleitungs-Kapitel')
    pg.click('#hbToc a[href="#handbuch-vwap"]'); pg.wait_for_timeout(300)
    ok(pg.inner_text('#hbTitle') == 'VWAP' and pg.evaluate('() => location.hash') == '#handbuch-vwap', 'Handbuch: Kapitel-Navigation')
    ok(len(pg.query_selector_all('#hbRead .hb-fig svg')) >= 1, 'Handbuch: Schaubild VWAP')
    pg.click('.hb-next'); pg.wait_for_timeout(300)
    ok(pg.inner_text('#hbTitle') == 'Volume Profile & Market Profile', 'Handbuch: Weiter-Knopf')
    figs = pg.evaluate('() => HB.flatMap(c => c.abschnitte).map(s => (s.html.match(/class="hb-fig"/g) || []).length).reduce((a, b) => a + b, 0)')
    ok(figs >= 7, 'Handbuch: mindestens 7 Schaubilder')
    gl = pg.evaluate('() => HB_GLOSSAR.length')
    ok(gl >= 40, 'Glossar: mindestens 40 Begriffe')
    # Suche
    pg.fill('#hbQ', 'value area'); pg.wait_for_timeout(400)
    nres = len(pg.query_selector_all('#hbResults .hb-res'))
    ok(nres >= 2 and pg.is_hidden('#hbToc') and len(pg.query_selector_all('#hbResults mark')) >= 2, 'Suche: Treffer mit Hervorhebung')
    pg.click('#hbResults .hb-res'); pg.wait_for_timeout(400)
    ok(len(pg.query_selector_all('#hbRead mark.hb-mark')) >= 1, 'Suche: Treffer im Lesetext markiert')
    ok(pg.evaluate('() => document.querySelectorAll("#hbRead svg mark").length') == 0, 'Suche: Schaubilder bleiben unverändert')
    pg.fill('#hbQ', 'xyzunbekannt'); pg.wait_for_timeout(300)
    ok('Keine Treffer' in pg.inner_text('#hbResults'), 'Suche: keine Treffer')
    pg.click('#hbQx'); pg.wait_for_timeout(200)
    ok(pg.is_visible('#hbToc') and len(pg.query_selector_all('#hbRead mark.hb-mark')) == 0, 'Suche löschen entfernt Markierungen')
    # Deep-Link direkt (neue Seite), ungültiger Hash
    pg2 = page(b, hash='#handbuch-trailing-drawdown')
    pg2.wait_for_timeout(300)
    ok(pg2.evaluate('() => App.view') == 'handbuch' and pg2.inner_text('#hbTitle') == 'Prop-Firm-Regeln', 'Deep-Link beim Start')
    go(pg2, '#handbuch-<img>')
    ok(pg2.evaluate('() => App.view') == 'start', 'Hash mit Sonderzeichen wird nicht als Deep-Link genutzt')
    go(pg2, '#handbuch-gibtsnicht')
    ok(pg2.evaluate('() => App.view') == 'handbuch' and any('gibt es im Handbuch nicht' in t for t in pg2.evaluate('() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent)')), 'Unbekannter Abschnitt: Hinweis')
    pg2.close()
    # Gelesen-Haken
    go(pg, '#handbuch-vwap')
    pg.click('[data-hb-read]'); pg.wait_for_timeout(200)
    ok(pg.evaluate('() => JSON.parse(localStorage.getItem("elr.hb.read")).vwap') == 1 and pg.query_selector('#hbToc a[href="#handbuch-vwap"] .hb-ok') is not None, 'Lesefortschritt gespeichert und im Inhaltsverzeichnis')
    ok('1 von 11' in pg.inner_text('#hbProgTxt'), 'Lesefortschritt-Anzeige')
    pg.screenshot(path=out + '/v4-handbuch-1440.png')
    # Im Chart zeigen
    pg.evaluate('() => { App.settings.ind.vwap = false; App.settings.ind.bands = false; App.saveSettings(); }')
    pg.click('.hb-ch-h [data-hb-show="vwap"]'); pg.wait_for_timeout(300)
    ok(pg.evaluate('() => [location.hash, App.settings.ind.vwap, App.settings.ind.bands, document.querySelector("#indBar [data-ind=vwap]").getAttribute("aria-pressed")]') == ['#charts', True, True, 'true'], 'Im Chart zeigen schaltet VWAP ein')
    go(pg, '#handbuch-orderflow')
    pg.click('.hb-ch-h [data-hb-show="footprint"]'); pg.wait_for_timeout(200)
    ok(pg.evaluate('() => [App.settings.ind.fp, App.settings.ind.lower]') == [True, 'delta'], 'Im Chart zeigen: Footprint + Delta')
    go(pg, '#handbuch-setups')
    pg.click('#hbRead [data-hb-practice]'); pg.wait_for_timeout(400)
    ok(pg.is_visible('#newSessModal'), 'Üben im Replay öffnet Neue Session')
    pg.keyboard.press('Escape')
    pg.close()

    # ---------- Nachlauf-Prüfung nur nach Session-Ende, Einstiegs-Kontext ----------
    pg = page(b, hash='#charts')
    pg.evaluate('''() => { App.strategies.push({ id: 'st4', name: 'Test-Regeln', desc: '', rules: 'Regel A\\nRegel B' }); App.saveStrategies();
      Object.assign(App.settings.ticket, { setup: 'Test-Regeln', slPts: 3, tpR: 3, risk: 400, riskMode: 'money', qtyMode: 'risk', type: 'market', tp1R: 0, beR: 0, trail: 0 }); App.renderRuleCheck();
      App.startReplayAt(Math.floor(App.base.length * 0.35)); }''')
    pg.evaluate('''() => { for (let k = 0; k < 6; k++) { document.querySelectorAll('#tkRules input').forEach((c, i) => { c.checked = k % 2 === 0 || i === 0; });
        App.placeOrder(k % 2 ? -1 : 1); for (let s = 0; s < 4000 && App.engine.open().length; s++) App.advanceTo(App.cursor + 1); App.advanceTo(App.cursor + 3); } }''')
    rid = pg.evaluate('() => App.replay.id')
    during = pg.evaluate('(rid) => App.journal.filter(j => j.replay === rid).map(j => ({ post: j.post || null, ctx: j.ctx, rt: j.riskTarget, ok: j.rulesOk, tot: j.rulesTotal, reason: j.reason }))', rid)
    ok(len(during) == 6, 'Replay: 6 Trades geschlossen')
    ok(all(d['post'] is None for d in during), 'Während des Replays: keine Nachlauf-Information')
    ok(all(d['ctx'] and d['ctx']['vwapSide'] in (-1, 0, 1) and 'atr' in d['ctx'] for d in during), 'Einstiegs-Kontext gespeichert (VWAP-Seite, ATR, Delta, CVD)')
    ok(all(d['rt'] == 400 for d in during), 'Ziel-Risiko gespeichert')
    ok([d['ok'] for d in during] == [True, False, True, False, True, False] and all(d['tot'] == 2 for d in during), 'Regel-Check gespeichert')
    # Analyse während des Replays: keine Nachlauf-Werte
    go(pg, '#analyse')
    ok(pg.evaluate('(rid) => App._an && App.journal.filter(j => j.replay === rid).every(j => !j.post)', rid), 'Analyse im Replay nutzt keine Zukunftsdaten')
    go(pg, '#charts')
    # Kursdaten nach dem Cursor dürfen während des Replays nicht in den Trades stehen
    pg.evaluate('() => { App.noUnloadWarn = true; }')
    pg.evaluate('() => App.stopReplay()'); pg.wait_for_timeout(400)
    after = pg.evaluate('(rid) => App.journal.filter(j => j.replay === rid).map(j => ({ post: j.post || null, reason: j.reason }))', rid)
    checked = [a for a in after if a['reason'] != 'TP']
    ok(len(checked) > 0 and all(a['post'] and isinstance(a['post']['hitTp'], bool) for a in checked), 'Nach Session-Ende: Nachlauf-Prüfung gespeichert')
    ok(all(a['post'] is None for a in after if a['reason'] == 'TP'), 'TP-Trades ohne Nachlauf-Prüfung')
    # Session-Dialog zeigt Kurzbefunde
    ok(pg.is_visible('#sessModal') and pg.is_visible('#sessFindings'), 'Session-Dialog nach Ende: Kurzbefunde sichtbar')
    txt = pg.inner_text('#sessFindings')
    ok('Eingestiegen ohne alle Regeln' in txt or 'Auffällig' in txt, 'Session-Dialog: Befund Regel-Check')
    pg.click('#sessFindings [data-sf-an]'); pg.wait_for_timeout(300)
    ok(pg.evaluate('() => location.hash') == '#analyse' and pg.is_hidden('#sessModal'), 'Session-Dialog: zur Analyse')
    pg.close()

    # ---------- Handy: Navigation mit „Mehr“, Screenshots ----------
    for (w, h, tag) in [(390, 844, 'hoch'), (844, 390, 'quer')]:
        pg = page(b, w, h, touch=True, hash='#start')
        pg.evaluate(MOCK)
        vis = pg.evaluate('() => [...document.querySelectorAll("#mainNav a, #navMore")].filter(a => a.offsetParent && getComputedStyle(a).display !== "none").map(a => a.textContent.trim())')
        ok(len(vis) == 7 and vis[-1] == 'Mehr' and 'Analyse' in vis, 'Handy %s: 7 Nav-Punkte mit Analyse und Mehr' % tag)
        ok(pg.evaluate('() => { const n = document.getElementById("mainNav"); return n.scrollWidth <= n.clientWidth + 1 && n.scrollHeight <= n.clientHeight + 1; }'), 'Handy %s: Navigation läuft nicht über' % tag)
        ok(pg.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), 'Handy %s: kein horizontales Scrollen' % tag)
        pg.click('#navMore'); pg.wait_for_timeout(200)
        ok(pg.is_visible('#moreMenu'), 'Handy %s: Mehr-Menü öffnet' % tag)
        pg.click('#moreMenu a[href="#handbuch"]'); pg.wait_for_timeout(400)
        ok(pg.evaluate('() => App.view') == 'handbuch' and pg.is_hidden('#moreMenu') and pg.evaluate('() => document.getElementById("navMore").classList.contains("cur")'), 'Handy %s: Handbuch über Mehr' % tag)
        pg.click('#hbTocBtn'); pg.wait_for_timeout(150)
        ok(pg.is_visible('#hbToc'), 'Handy %s: Inhaltsverzeichnis aufklappbar' % tag)
        pg.click('#hbToc a[href="#handbuch-orderflow"]'); pg.wait_for_timeout(400)
        ok(pg.inner_text('#hbTitle') == 'Orderflow-Grundlagen' and pg.is_hidden('#hbToc'), 'Handy %s: Kapitel gewählt, Inhalt zugeklappt' % tag)
        ok(pg.evaluate('() => document.documentElement.scrollWidth <= innerWidth'), 'Handy %s: Handbuch ohne horizontales Scrollen' % tag)
        pg.screenshot(path=out + '/v4-handbuch-%s.png' % tag)
        go(pg, '#analyse')
        ok(len(pg.query_selector_all('.an-card')) >= 5, 'Handy %s: Analyse-Karten' % tag)
        ok(pg.evaluate('() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll(".an-card")].every(c => c.scrollWidth <= c.clientWidth + 1)'), 'Handy %s: Analyse ohne Überlauf' % tag)
        small = pg.evaluate('() => [...document.querySelectorAll("#view-analyse button, #view-analyse select")].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5).length')
        ok(small == 0, 'Handy %s: Touch-Ziele ≥ 44 px (Analyse)' % tag)
        pg.screenshot(path=out + '/v4-analyse-%s.png' % tag)
        pg.close()

    b.close()

print('\n'.join('ok  ' + x for x in passed))
print(len(passed), 'Prüfungen bestanden')
if errs:
    print('FEHLER:'); print('\n'.join(errs)); raise SystemExit(1)
print('keine Fehler')
