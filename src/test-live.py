"""Daten-Test (Playwright, headless, alle Netz-Quellen gemockt):
Binance (Kerzen + aggTrades), CSV-Import (deutsch, TradingView-Export, Databento), Archiv (index.json + .csv.gz),
neue Backtest-Session mit zufälligem Tag im Blind-Modus (kein Datum sichtbar), Krypto-Session in der Vergangenheit."""
import os, json, math, gzip, re, datetime, calendar
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
url = 'file://' + os.path.abspath('site/index.html')
os.makedirs('shots', exist_ok=True)
errs, calls = [], []


def px(t): return 60000 + 300 * math.sin(t / 3.6e6) + 40 * math.sin(t / 2.1e5)


def binance(route):
    u = urlparse(route.request.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}
    calls.append(u.path)
    hdr = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
    if u.path.endswith('exchangeInfo'):
        body = {'symbols': [{'symbol': s, 'filters': [{'filterType': 'PRICE_FILTER', 'tickSize': '0.01000000'}, {'filterType': 'LOT_SIZE', 'stepSize': '0.00001000'}]} for s in ('BTCUSDT', 'ETHUSDT', 'SOLUSDT')]}
    elif u.path.endswith('klines'):
        st, en, lim = int(q['startTime']), int(q['endTime']), int(q['limit'])
        st = (st + 59999) // 60000 * 60000
        rows, t = [], st
        while t <= en and len(rows) < lim:
            o, c = px(t), px(t + 59999)
            h, l = max(o, c) + 5, min(o, c) - 5
            v = 10 + (t // 60000) % 7
            rows.append([t, '%.2f' % o, '%.2f' % h, '%.2f' % l, '%.2f' % c, '%.5f' % v, t + 59999, '0', 100, '%.5f' % (v * 0.55), '0', '0'])
            t += 60000
        body = rows
    elif u.path.endswith('aggTrades'):
        lim = int(q.get('limit', 500))
        if 'fromId' in q: a = int(q['fromId']); e = a + lim - 1
        else:
            a = (int(q['startTime']) + 499) // 500; e = min(int(q['endTime']) // 500, a + lim - 1)
        body = [{'a': i, 'p': '%.2f' % px(i * 500), 'q': '%.5f' % (0.01 + (i % 13) * 0.003), 'f': i, 'l': i, 'T': i * 500, 'm': (i % 3 == 0), 'M': True} for i in range(a, e + 1)]
    else:
        route.fulfill(status=404, headers=hdr, body='{}'); return
    route.fulfill(status=200, headers=hdr, body=json.dumps(body))


# ---------- Archiv-Daten erzeugen: NAS100 März 2023, 1-Minute, Mo–Fr (Dukascopy-Stil) ----------
def nas(t): return 12000 + 60 * math.sin(t / 7200) + 25 * math.sin(t / 900) + (t % 997) / 997 * 3


def month_csv(y, m):
    lines = ['t,o,h,l,c,v']
    days = calendar.monthrange(y, m)[1]
    for d in range(1, days + 1):
        for mi in range(1440):
            dt = datetime.datetime(y, m, d, tzinfo=datetime.timezone.utc) + datetime.timedelta(minutes=mi)
            wd = dt.weekday()
            if wd == 5 or (wd == 4 and dt.hour >= 21) or (wd == 6 and dt.hour < 22): continue
            t = int(dt.timestamp())
            o, c = nas(t), nas(t + 59)
            h, l = max(o, c) + 1.25, min(o, c) - 1.0
            r = lambda v: round(v * 4) / 4
            lines.append('%d,%.2f,%.2f,%.2f,%.2f,%d' % (t, r(o), r(h), r(l), r(c), 50 + (t // 60) % 40))
    return '\n'.join(lines) + '\n'


ARCH_GZ = gzip.compress(month_csv(2023, 3).encode())
INDEX = {'updated': '2026-10-28', 'refreshed': '2026-10-28T03:00:00Z', 'source': 'Dukascopy (Bid)', 'format': 't,o,h,l,c,v',
         'instruments': [{'id': 'NAS100', 'name': 'Nasdaq 100', 'hint': 'wie NQ', 'tick': 0.25, 'pv': 20, 'qtyStep': 1, 'sess': {'tz': 'America/New_York', 'hour': 18}, 'months': ['2023-03']},
                         {'id': 'XAUUSD', 'name': 'Gold', 'hint': 'wie GC', 'tick': 0.1, 'pv': 100, 'qtyStep': 1, 'sess': {'tz': 'America/New_York', 'hour': 18}, 'months': []}]}
arch_calls = []


def archive(route):
    path = urlparse(route.request.url).path
    arch_calls.append(path)
    hdr = {'Access-Control-Allow-Origin': '*'}
    if path.endswith('/data/index.json'):
        route.fulfill(status=200, headers=dict(hdr, **{'Content-Type': 'application/json'}), body=json.dumps(INDEX))
    elif path.endswith('/data/NAS100/2023-03.csv.gz'):
        route.fulfill(status=200, headers=dict(hdr, **{'Content-Type': 'application/gzip'}), body=ARCH_GZ)
    else:
        route.fulfill(status=404, headers=hdr, body='')


DATE_RE = re.compile(r'\b(Mo|Di|Mi|Do|Fr|Sa|So)\b[ ,]|\b\d{1,2}\.\d{1,2}\.(\d{2,4})?|\b20(2[0-9]|1[0-9])\b|\b\d{4}-\d{2}-\d{2}\b')


def new_page(b, w=1440, h=860):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.route('https://api.binance.com/**', binance)
    pg.route('https://raw.githubusercontent.com/**', archive)
    pg.add_init_script('''(() => { window.__texts = []; const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, x, y, m) { if (window.__rec) window.__texts.push(String(t)); return f.call(this, t, x, y, m); }; })();''')
    pg.goto(url)
    pg.wait_for_function('() => typeof App !== "undefined" && App.base')
    pg.wait_for_timeout(300)
    if pg.is_visible('#onboardModal'): pg.click('#obSkip')
    pg.evaluate("() => location.hash = '#charts'"); pg.wait_for_timeout(150)
    return pg


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = new_page(b)

    # ---------- Binance live ----------
    pg.click('#btnData'); pg.click('#dataTabs [data-p="bn"]'); pg.fill('#bnSymbol', 'btcusdt'); pg.fill('#bnDays', '1'); pg.click('#bnLoad')
    pg.wait_for_function('() => App.symbol === "BTCUSDT"', timeout=20000)
    st = pg.evaluate('() => ({n: App.base.length, tick: App.tick, step: App.qtyStep, est: App.baseEst, tf: App.baseTf, d0: App.base[0].d, v0: App.base[0].v, costKey: App.costKey()})')
    print('binance', st)
    assert st['tick'] == 0.01 and st['step'] == 0.00001 and not st['est'] and st['tf'] == 60 and st['costKey'] == 'crypto'
    assert abs(st['d0'] - st['v0'] * 0.1) < 1e-6
    pg.evaluate('() => App.startReplayAt(Math.floor(App.base.length*0.5))')
    pg.click('#btnTrades'); pg.fill('#trHours', '0.5'); pg.click('#trLoad')
    pg.wait_for_function('() => App.trades && App.trades.n > 0', timeout=30000)
    tr = pg.evaluate('() => ({n: App.trades.n, cov: App.covPref[App.covPref.length-1], buys: Array.from(App.trades.b).filter(x=>x).length})')
    print('trades', tr)
    assert tr['n'] == 3600 and tr['cov'] == 30 and tr['buys'] == 2400
    pg.click('#tkType [data-v="market"]')
    pg.fill('#tkSl', '50'); pg.fill('#tkTp', '2'); pg.select_option('#tkRiskMode', 'pct'); pg.fill('#tkRisk', '1')
    pg.click('#btnBuy')
    o = pg.evaluate('() => { const o = App.engine.orders[0]; return {qty:o.qty, risk:o.risk, fees: App.engine.cfg.feePct}; }')
    print('crypto order', o)
    assert 9 < o['qty'] < 10.01 and o['fees'] == 0.04
    pg.evaluate('() => { App.advanceTo(App.cursor + 5); const c = App.charts[1]; c.view.barW = 140; c.view.rightIdx = null; App.requestRender(); }')
    pg.wait_for_timeout(300)
    pg.screenshot(path='shots/20-binance-fp.png')
    pg.click('#btnStop'); pg.wait_for_timeout(100)
    if pg.is_visible('#confirmModal'): pg.click('#cfOk')
    pg.wait_for_timeout(200)
    if pg.is_visible('#sessModal'): pg.keyboard.press('Escape')
    pg.select_option('#tkRiskMode', 'money'); pg.fill('#tkRisk', '500')

    # ---------- CSV: deutsch mit Semikolon + Trade-Datei ----------
    lines = ['Datum;Zeit;Eröffnung;Hoch;Tief;Schluss;Volumen']
    t0 = 1784021400  # 2026-07-14 09:30 New York
    for i in range(300):
        tt = datetime.datetime(2026, 7, 14, 9, 30) + datetime.timedelta(minutes=i)
        o_ = 21000 + i * 0.25
        fmt = lambda v: ('%.2f' % v).replace('.', ',')
        lines.append('%s;%s;%s;%s;%s;%s;%d' % (tt.strftime('%d.%m.%Y'), tt.strftime('%H:%M'), fmt(o_), fmt(o_ + 2), fmt(o_ - 1.5), fmt(o_ + 0.5), 1000 + i))
    open('shots/nq.csv', 'w').write('\n'.join(lines))
    tl = ['timestamp,price,size,side']
    for i in range(300 * 4):
        ts = (t0 + i * 15) * 1000 + 7
        tl.append('%d,%.2f,%d,%s' % (ts, 21000 + (i // 4) * 0.25 + (i % 3) * 0.25, 1 + i % 5, 'buy' if i % 2 else 'sell'))
    open('shots/nq-trades.csv', 'w').write('\n'.join(tl))
    pg.click('#btnData'); pg.click('#dataTabs [data-p="csv"]')
    pg.set_input_files('#csvBars', 'shots/nq.csv'); pg.set_input_files('#csvTrades', 'shots/nq-trades.csv')
    pg.select_option('#csvInst', 'NQ'); pg.select_option('#csvTz', 'America/New_York'); pg.fill('#csvSym', 'nqu6')
    pg.click('#csvLoad')
    pg.wait_for_function('() => App.symbol === "NQU6"', timeout=10000)
    cs = pg.evaluate('() => ({n: App.base.length, t0: new Date(App.base[0].t*1000).toISOString(), o0: App.base[0].o, v0: App.base[0].v, pv: App.pv, trades: App.trades && App.trades.n, cov: App.covPref[App.covPref.length-1], key: App.costKey(), est: App.base.filter(b=>b.est).length})')
    print('csv deutsch', cs)
    assert cs['t0'] == '2026-07-14T13:30:00.000Z' and cs['o0'] == 21000 and cs['v0'] == 1000 and cs['pv'] == 20 and cs['trades'] == 1200 and cs['key'] == 'futures'
    # Trades 13:30:00.007–14:29:45 UTC: mit Rundung auf Kerzengrenzen alle 60 Kerzen abgedeckt (vorher 59)
    assert cs['cov'] == 60 and cs['est'] == 240, 'Abdeckung auf Kerzengrenzen gerundet (Fund 10)'

    # ---------- TradingView-Export ----------
    tvl = ['time,open,high,low,close,Volume,VWAP,Upper Band #1,Lower Band #1,EMA']
    for i in range(200):
        t = 1710423000 + i * 300
        tvl.append('%d,%.2f,%.2f,%.2f,%.2f,%d,%.2f,%.2f,%.2f,%.2f' % (t, 18000 + i, 18004 + i, 17997 + i, 18002 + i, 900 + i, 18001, 18030, 17970, 18000))
    open('shots/tv-export.csv', 'w').write('\n'.join(tvl))
    pg.click('#btnData'); pg.click('#dataTabs [data-p="csv"]')
    pg.set_input_files('#csvBars', 'shots/tv-export.csv'); pg.set_input_files('#csvTrades', [])
    pg.select_option('#csvInst', 'NQ'); pg.select_option('#csvTz', 'UTC'); pg.fill('#csvSym', 'NQ1!')
    pg.click('#csvLoad')
    pg.wait_for_function('() => App.symbol === "NQ1!"', timeout=10000)
    tv = pg.evaluate('() => ({n: App.base.length, tf: App.baseTf, t0: new Date(App.base[0].t*1000).toISOString(), c: App.base[1].c, v: App.base[0].v})')
    print('tradingview', tv)
    assert tv == {'n': 200, 'tf': 300, 't0': '2024-03-14T13:30:00.000Z', 'c': 18003, 'v': 900}

    # ---------- Databento Trades (Festkomma-Preise, Aggressor-Seite, mehrere Kontrakte) ----------
    dl = ['ts_recv,ts_event,rtype,publisher_id,instrument_id,action,side,depth,price,size,flags,ts_in_delta,sequence,symbol']
    base_ns = 1710423000 * 10 ** 9
    for i in range(3000):
        ev = base_ns + i * 2 * 10 ** 9 + 123456
        side = 'B' if i % 3 else 'A'
        if i % 50 == 0: side = 'N'
        pr = int((18000 + (i // 20) * 0.25) * 1e9)
        dl.append('%d,%d,0,1,42,T,%s,0,%d,%d,0,0,%d,NQH4' % (ev + 1000, ev, side, pr, 1 + i % 4, i))
    for i in range(40):  # wenig gehandelter Folgekontrakt am selben Tag → wird verworfen
        ev = base_ns + i * 60 * 10 ** 9
        dl.append('%d,%d,0,1,43,T,B,0,%d,1,0,0,%d,NQM4' % (ev, ev, int(18100e9), 9000 + i))
    open('shots/databento.csv', 'w').write('\n'.join(dl))
    pg.click('#btnData'); pg.click('#dataTabs [data-p="csv"]')
    pg.set_input_files('#csvBars', 'shots/databento.csv')
    pg.select_option('#csvInst', 'NQ'); pg.fill('#csvSym', 'NQH4')
    pg.click('#csvLoad')
    pg.wait_for_function('() => App.symbol === "NQH4"', timeout=15000)
    db = pg.evaluate('() => ({trades: App.trades.n, buys: Array.from(App.trades.b).filter(x=>x).length, p0: App.trades.p[0], maxP: Math.max(...App.base.map(b=>b.h)), n: App.base.length, est: App.baseEst, status: document.getElementById("csvStatus").textContent})')
    print('databento', {k: v for k, v in db.items() if k != 'status'}, '|', db['status'][:140])
    assert db['trades'] == 3000 - 60 and db['p0'] == 18000 and db['maxP'] < 18100 and not db['est']
    assert db['buys'] == sum(1 for i in range(3000) if i % 50 and i % 3), 'B = Käufer-Aggressor, A = Verkäufer-Aggressor'

    # ---------- Archiv: Daten-Dialog, Reiter Archiv ----------
    pg.click('#btnData'); pg.click('#dataTabs [data-p="ar"]')
    pg.wait_for_function('() => document.querySelectorAll("#arInst option").length === 2')
    pg.fill('#arFrom', '2023-03-06'); pg.fill('#arTo', '2023-03-08'); pg.click('#arLoad')
    pg.wait_for_function('() => App.symbol === "NAS100"', timeout=20000)
    ar = pg.evaluate('() => ({n: App.base.length, src: App.source, tick: App.tick, pv: App.pv, key: App.costKey(), est: App.baseEst, t0: new Date(App.base[0].t*1000).toISOString()})')
    print('archiv', ar)
    assert ar['n'] == 3 * 1440 and ar['src'] == 'Archiv · Nasdaq 100' and ar['pv'] == 20 and ar['key'] == 'futures' and ar['est']
    assert any(c.endswith('/NAS100/2023-03.csv.gz') for c in arch_calls)

    # ---------- Neue Backtest-Session: Archiv, bestimmtes Datum, NY-Eröffnung, Blind-Modus ----------
    pg.click('#mainNav a[data-view="backtests"]'); pg.click('#btnNewSess')
    pg.wait_for_function('() => [...document.querySelectorAll("#nsMarket option")].some(o => o.value === "ar:NAS100" && !o.disabled)')
    pg.select_option('#nsMarket', 'ar:NAS100')
    pg.fill('#nsDate', '2023-03-14'); pg.check('input[name="nsWhen"][value="date"]')
    pg.select_option('#nsStart', 'ny'); pg.check('#nsBlind'); pg.select_option('#nsStrat', index=1)
    pg.screenshot(path='shots/21-neue-session.png')
    pg.click('#nsGo')
    pg.wait_for_function('() => App.replay.active && App.symbol === "NAS100"', timeout=20000)
    pg.wait_for_timeout(400)
    s = pg.evaluate('''() => ({ hash: location.hash, blind: App.replay.blind, start: new Date(App.base[App.cursor].t*1000).toISOString(),
      first: new Date(App.base[0].t*1000).toISOString(), last: new Date(App.base[App.base.length-1].t*1000).toISOString(),
      sess: App.sessions.filter(e => e.replayId === App.replay.id).map(e => ({running: e.running, realDay: e.realDay, strategy: e.strategy})) })''')
    print('session', s)
    assert s['hash'] == '#charts' and s['blind']
    assert s['start'] == '2023-03-14T13:15:00.000Z', 'Start 15 Minuten vor 9:30 ET'
    assert s['first'] <= '2023-03-09T12:00:00' and s['last'] >= '2023-03-16T20:00:00', 'Vorlauf 3 / Nachlauf 2 Handelstage'
    assert len(s['sess']) == 1 and s['sess'][0]['running'] and s['sess'][0]['realDay'] == 'Di, 14.03.2023' and s['sess'][0]['strategy']

    # Blind-Modus: Kein Datum in der Oberfläche und auf den Charts
    pg.evaluate('() => { Object.assign(App.settings.ticket, {slPts: 8, tpR: 2, risk: 500, riskMode: "money", qtyMode: "risk", type: "market"}); App.placeOrder(1); for (let i = 0; i < 400 && App.engine.open().length; i++) App.advanceTo(App.cursor + 1); App.closeAll(); App.placeOrder(-1); App.advanceTo(App.cursor + 3); }')
    nj = pg.evaluate('() => ({n: App.journal.filter(j => j.replay === App.replay.id).length, o: App.engine.orders.map(o => o.status)})')
    print('blind trades', nj)
    assert nj['n'] >= 1 and len(nj['o']) == 2
    pg.evaluate('() => { window.__texts = []; window.__rec = true; App.charts.forEach(c => { c.hover = {x: c.plot.w * 0.4, y: 50}; c.render(); }); window.__rec = false; App.charts.forEach(c => c.hover = null); }')
    canvas_texts = pg.evaluate('() => window.__texts')
    hits = sorted(set(t for t in canvas_texts if DATE_RE.search(t)))
    print('Chart-Texte mit Datum:', hits[:8])
    assert not hits, 'Blind-Modus: Datum auf dem Chart sichtbar'
    assert any(t.startswith('Tag ') for t in canvas_texts), 'Zeitachse zeigt „Tag n“'
    pg.click('#btnJumpOpen')
    assert pg.evaluate('() => document.getElementById("jumpTime").type') == 'time', 'Vorspul-Feld nur Uhrzeit'
    pg.click('#btnJumpOpen')
    pg.screenshot(path='shots/22-blind.png')
    visible = []
    # Journal und Statistik auf die laufende Session filtern (frühere Sessions anderer Märkte dürfen ihr Datum zeigen)
    pg.evaluate('() => { App.settings.jf = {sym: "", strat: "", res: "", sess: String(App.replay.id)}; App.settings.statsFilter = "replay"; }')
    for v in ['charts', 'journal', 'backtests', 'stats']:
        pg.evaluate("(v) => location.hash = '#' + v", v); pg.wait_for_timeout(500)
        assert v != 'journal' or pg.evaluate('() => document.querySelectorAll("#jTable .jrow").length') >= 1
        txt = pg.evaluate('''() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (w.nextNode()) { const n = w.currentNode, e = n.parentElement; if (!e || !n.textContent.trim()) continue;
            if (e.closest('[hidden]') || e.closest('script,style,option,datalist') || !e.getClientRects().length) continue; out.push(n.textContent.trim()); }
          for (const i of document.querySelectorAll('input')) if (i.offsetParent && i.value) out.push(i.value); return out; }''')
        bad = [t for t in txt if DATE_RE.search(t)]
        if bad: visible.append((v, bad[:5]))
        if v == 'journal': pg.screenshot(path='shots/23-blind-journal.png')
    print('sichtbare Datumsangaben im Blind-Modus:', visible)
    assert not visible, 'Blind-Modus: Datum in der Oberfläche sichtbar'
    sub = pg.inner_text('#dsSub'); rt = pg.inner_text('#rpTime')
    assert re.match(r'^Tag \d+ \d\d:\d\d$', rt), rt

    # Ende: echtes Datum wird aufgedeckt
    pg.evaluate("() => location.hash = '#charts'"); pg.wait_for_timeout(200)
    pg.click('#btnStop'); pg.wait_for_timeout(150)
    if pg.is_visible('#confirmModal'): pg.click('#cfOk')
    pg.wait_for_selector('#sessReveal:not([hidden])', timeout=5000)
    rv = pg.inner_text('#sessReveal'); print('aufgedeckt:', rv)
    assert rv == 'Das war der Di, 14.03.2023.'
    pg.screenshot(path='shots/24-aufgedeckt.png')
    pg.click('#sessForm button[type=submit]'); pg.wait_for_timeout(200)
    assert pg.evaluate('() => !App.sessions.find(e => e.realDay === "Di, 14.03.2023").running')

    # ---------- Zufälliger Archiv-Tag (2023), zufällige Startzeit ----------
    pg.click('#mainNav a[data-view="backtests"]'); pg.click('#btnNewSess')
    pg.wait_for_function('() => [...document.querySelectorAll("#nsMarket option")].some(o => o.value === "ar:NAS100" && !o.disabled)')
    pg.select_option('#nsMarket', 'ar:NAS100'); pg.check('input[name="nsWhen"][value="random"]')
    assert pg.evaluate('() => [...document.querySelectorAll("#nsY0 option")].map(o => o.value)') == ['2023'], 'Jahre aus index.json'
    pg.select_option('#nsStart', 'random'); pg.uncheck('#nsBlind')
    pg.click('#nsGo')
    pg.wait_for_function('() => App.replay.active', timeout=20000)
    rd = pg.evaluate('() => { const p = Core.localParts(App.nowT(), "UTC"); return {y: p.y, m: p.m, wd: p.wd, blind: App.replay.blind}; }')
    print('zufälliger Tag', rd)
    assert rd['y'] == 2023 and rd['m'] == 3 and not rd['blind']
    pg.evaluate('() => App.forceStopReplay()')

    # ---------- Krypto-Session in der Vergangenheit (Binance mit endTime) ----------
    pg.click('#btnNewSessBar')
    pg.select_option('#nsMarket', 'bn:ETHUSDT')
    y0s = pg.evaluate('() => [...document.querySelectorAll("#nsY0 option")].map(o => +o.value)')
    assert y0s[0] == 2017
    pg.select_option('#nsBnMarket', 'futures')
    assert pg.evaluate('() => +document.querySelector("#nsY0 option").value') == 2019, 'Futures erst ab 2019'
    pg.select_option('#nsBnMarket', 'spot')
    pg.fill('#nsDate', '2022-06-15'); pg.check('input[name="nsWhen"][value="date"]'); pg.select_option('#nsStart', 'ldn'); pg.check('#nsBlind')
    pg.click('#nsGo')
    pg.wait_for_function('() => App.replay.active && App.symbol === "ETHUSDT"', timeout=30000)
    cr = pg.evaluate('() => ({start: new Date(App.nowT()*1000).toISOString(), n: App.base.length, key: App.costKey()})')
    print('krypto session', cr)
    assert cr['start'] == '2022-06-15T07:00:00.000Z' and cr['n'] == 6 * 1440 and cr['key'] == 'crypto'
    pg.evaluate('() => App.forceStopReplay()')
    pg.close()

    # ---------- Session fortsetzen nach Neuladen (C1, QA4) ----------
    pg3 = new_page(b)
    pg3.on('dialog', lambda d: d.accept())
    pg3.evaluate("() => location.hash = '#backtests'"); pg3.click('#btnNewSess')
    pg3.wait_for_function('() => [...document.querySelectorAll("#nsMarket option")].some(o => o.value === "ar:NAS100" && !o.disabled)')
    pg3.select_option('#nsMarket', 'ar:NAS100'); pg3.fill('#nsDate', '2023-03-14'); pg3.check('input[name="nsWhen"][value="date"]')
    pg3.select_option('#nsStart', 'ny'); pg3.check('#nsBlind'); pg3.click('#nsGo')
    pg3.wait_for_function('() => App.replay.active && App.symbol === "NAS100"', timeout=20000)
    pg3.evaluate('''() => { Object.assign(App.settings.ticket, {slPts: 8, tpR: 4, risk: 500, riskMode: 'money', qtyMode: 'risk', type: 'market'}); App.placeOrder(1); App.advanceTo(App.cursor + 4);
      App.placeOrder(-1, {entry: App.price() + 30, sl: App.price() + 40, tp: App.price() + 10}); App.addDrawing({type: 'hline', a: {t: 0, p: App.price() - 5}}); App.advanceTo(App.cursor + 2); }''')
    before = pg3.evaluate('() => ({rid: App.replay.id, t: App.nowT(), blind: App.replay.blind, sid: App.replay.sessionId, o: App.engine.orders.filter(o => o.status !== "closed" && o.status !== "cancelled").map(o => [o.side, o.status, o.type, o.entryPrice || o.price, o.sl, o.tp]), dr: App.drawings.length})')
    pg3.wait_for_timeout(2300)  # gedrosseltes Speichern (alle 2 s)
    assert pg3.evaluate('() => !!localStorage.getItem("elr.resume")'), 'Stand wird laufend gespeichert'
    pg3.evaluate('() => { App.advanceTo(App.cursor + 1); }')
    before['t'] = pg3.evaluate('() => App.nowT()')
    pg3.reload()
    pg3.wait_for_function('() => typeof App !== "undefined" && App.base && !document.getElementById("boot")', timeout=20000)
    pg3.wait_for_selector('#resumeBar:not([hidden])', timeout=5000)
    rtxt = pg3.inner_text('#resumeBar'); print('Fortsetzen-Hinweis:', rtxt.replace('\n', ' | '))
    assert 'fortsetzen' in rtxt and '1 offene Position' in rtxt and '1 wartende Order' in rtxt
    assert not DATE_RE.search(rtxt), 'Blind-Modus: kein Datum im Fortsetzen-Hinweis'
    assert pg3.evaluate('() => App.sessions.find(s => s.replayId === %d).running' % before['rid']), 'Session bleibt laufend, solange fortsetzbar'
    pg3.screenshot(path='shots/26-fortsetzen.png')
    pg3.click('#resumeBar [data-resume="go"]')
    pg3.wait_for_function('() => App.replay.active && App.symbol === "NAS100"', timeout=20000)
    after = pg3.evaluate('() => ({rid: App.replay.id, t: App.nowT(), blind: App.replay.blind, sid: App.replay.sessionId, o: App.engine.orders.filter(o => o.status !== "closed" && o.status !== "cancelled").map(o => [o.side, o.status, o.type, o.entryPrice || o.price, o.sl, o.tp]), dr: App.drawings.length})')
    print('vorher', before); print('nachher', after)
    assert after == before, 'Replay exakt fortgesetzt'
    pg3.evaluate('() => App.advanceTo(App.cursor + 60)')
    assert pg3.evaluate('() => App.engine.orders.length') >= 2
    pg3.evaluate('() => App.forceStopReplay()')
    assert pg3.evaluate('() => !localStorage.getItem("elr.resume")'), 'Stand nach Ende gelöscht'

    # ---------- QA13: gescheiterter Tag im Blind-Modus zeigt nie Daten ----------
    pg3.evaluate('''() => { window.__drawn = []; const f = Chart.prototype.drawBars; Chart.prototype.drawBars = function () { window.__drawn.push(App.symbol + ':' + App.replay.active); return f.apply(this, arguments); }; }''')
    pg3.evaluate("() => location.hash = '#backtests'"); pg3.click('#btnNewSess')
    pg3.wait_for_function('() => [...document.querySelectorAll("#nsMarket option")].some(o => o.value === "ar:NAS100" && !o.disabled)')
    pg3.select_option('#nsMarket', 'ar:NAS100'); pg3.fill('#nsDate', '2023-03-11'); pg3.check('input[name="nsWhen"][value="date"]')  # Samstag
    pg3.select_option('#nsStart', 'ny'); pg3.check('#nsBlind')
    pg3.evaluate("() => { App.forceStopReplay(); location.hash = '#charts'; }"); pg3.wait_for_timeout(200)
    pg3.evaluate('() => { window.__drawn = []; }')
    pg3.click('#nsGo')
    pg3.wait_for_function('() => /Kerzen zur Startzeit|Feiertag/.test(document.getElementById("nsStatus").textContent)', timeout=20000)
    pg3.wait_for_timeout(200)
    q13 = pg3.evaluate('() => ({drawn: window.__drawn.filter(x => x === "NAS100:false").length, sym: App.symbol, hide: !!App.hideData})')
    print('QA13', q13)
    assert q13['drawn'] == 0 and q13['sym'] == 'DEMO-NQ' and not q13['hide'], 'QA13: gescheiterter Blind-Tag nie sichtbar'
    pg3.close()

    # ---------- Archiv fehlt → Hinweis ----------
    pg2 = b.new_page(viewport={'width': 1280, 'height': 720})
    pg2.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
    pg2.route('https://fonts.**', lambda r: r.abort())
    pg2.route('https://raw.githubusercontent.com/**', lambda r: r.fulfill(status=404, body=''))
    pg2.goto(url); pg2.wait_for_function('() => typeof App !== "undefined" && App.base')
    pg2.wait_for_timeout(300)
    if pg2.is_visible('#onboardModal'): pg2.click('#obSkip')
    pg2.evaluate("() => location.hash = '#charts'"); pg2.wait_for_timeout(150)
    pg2.click('#btnNewSessBar')
    pg2.wait_for_selector('#nsArchHint:not([hidden])', timeout=8000)
    hint = pg2.inner_text('#nsArchHint'); print('Hinweis:', hint[:60])
    assert 'Archiv wird noch aufgebaut' in hint
    pg2.screenshot(path='shots/25-archiv-fehlt.png')
    pg2.close()
    b.close()
print('Binance-Aufrufe:', len(calls), '· Archiv-Aufrufe:', len(arch_calls))
print('\n'.join(errs) if errs else 'keine Fehler')
if errs: raise SystemExit(1)
