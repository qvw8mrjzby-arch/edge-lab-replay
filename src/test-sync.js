/* Sync: Merge-Logik (Last-write-wins, Grabsteine, Erstabgleich) */
const S = require('./sync.js');
let fails = 0, passes = 0;
const eq = (n, g, e) => { if (JSON.stringify(g) === JSON.stringify(e)) passes++; else { fails++; console.log('FAIL', n, 'got', JSON.stringify(g), 'exp', JSON.stringify(e)); } };
const idOf = (x) => x.id;
eq('Hash ignoriert _u/_dirty und Schlüsselreihenfolge', S.hash({ a: 1, b: { c: 2 }, _u: 5 }) === S.hash({ b: { c: 2 }, a: 1, _dirty: true }), true);
eq('Hash erkennt Änderung', S.hash({ a: 1 }) !== S.hash({ a: 2 }), true);
/* Erstabgleich: vorhandene Einträge u = 0, danach neue Einträge u = jetzt */
let meta = {}, L = [{ id: 'a', x: 1 }];
eq('scan first', S.scan(meta, 'trade', L, idOf, 1000, true), 1);
eq('scan first: u=0, dirty', [meta['trade:a'].u, meta['trade:a'].d, L[0]._dirty], [0, true, true]);
meta['trade:a'].d = false;
eq('unverändert: nichts', S.scan(meta, 'trade', L, idOf, 2000, false), 0);
L[0].x = 2;
S.scan(meta, 'trade', L, idOf, 3000, false);
eq('geändert: u=jetzt, dirty', [meta['trade:a'].u, meta['trade:a'].d], [3000, true]);
L.push({ id: 'b' }); S.scan(meta, 'trade', L, idOf, 3500, false);
eq('neu nach Erstabgleich: u=jetzt', meta['trade:b'].u, 3500);
L.splice(0, 1); S.scan(meta, 'trade', L, idOf, 4000, false);
eq('gelöscht → Grabstein', meta['trade:a'], { h: null, u: 4000, d: true, del: true });
eq('laufende Session wird übersprungen', (() => { const m = {}; S.scan(m, 'session', [{ id: 's', running: true }], idOf, 1, false, (s) => s.running); return Object.keys(m).length; })(), 0);
/* decide */
const row = (u, del, data) => ({ kind: 'trade', id: 'a', deleted: !!del, data: Object.assign({ _u: u }, data || {}) });
eq('lokal neuer und dirty → keep', S.decide({ h: 'x', u: 5000, d: true }, row(4000)), 'keep');
eq('Server neuer → apply', S.decide({ h: 'x', u: 3000, d: true }, row(4000)), 'apply');
eq('Gleichstand → Server gewinnt', S.decide({ h: 'x', u: 4000, d: true }, row(4000)), 'apply');
eq('unbekannt → apply', S.decide(undefined, row(1)), 'apply');
eq('identisch → skip', S.decide({ h: S.hash({ id: 'a', y: 1 }), u: 7, d: false }, row(7, false, { id: 'a', y: 1 })), 'skip');
eq('Grabstein identisch → skip', S.decide({ h: null, u: 7, d: false, del: true }, row(7, true)), 'skip');
/* applyRows */
meta = {}; L = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
S.scan(meta, 'trade', L, idOf, 100, false); meta['trade:a'].d = false; meta['trade:b'].d = false;
let n = S.applyRows(meta, 'trade', L, idOf, [{ kind: 'trade', id: 'a', deleted: false, data: { id: 'a', v: 2, _u: 200 } }, { kind: 'trade', id: 'c', deleted: false, data: { id: 'c', v: 1, _u: 150 } }, { kind: 'trade', id: 'b', deleted: true, data: { _u: 300 } }, { kind: 'session', id: 'z', deleted: false, data: {} }]);
eq('applyRows: ändern, neu, löschen', [n, L.map((x) => x.id + x.v).join(',')], [3, 'a2,c1']);
eq('applyRows: nach Anwenden kein erneuter Upload', S.scan(meta, 'trade', L, idOf, 400, false), 0);
/* gleichzeitige Änderung: lokale neuere gewinnt und bleibt dirty */
L[0].v = 9; S.scan(meta, 'trade', L, idOf, 500, false);
n = S.applyRows(meta, 'trade', L, idOf, [{ kind: 'trade', id: 'a', deleted: false, data: { id: 'a', v: 3, _u: 450 } }]);
eq('lokal neuer gewinnt', [n, L[0].v, meta['trade:a'].d], [0, 9, true]);
n = S.applyRows(meta, 'trade', L, idOf, [{ kind: 'trade', id: 'a', deleted: false, data: { id: 'a', v: 4, _u: 600 } }]);
eq('Server neuer gewinnt', [n, L[0].v, meta['trade:a'].d], [1, 4, false]);
/* Löschen auf dem Server, lokal neuer bearbeitet → lokal bleibt */
L[0].v = 5; S.scan(meta, 'trade', L, idOf, 900, false);
n = S.applyRows(meta, 'trade', L, idOf, [{ kind: 'trade', id: 'a', deleted: true, data: { _u: 800 } }]);
eq('lokale neuere Änderung schlägt älteres Löschen', [n, L.length && L[0].id], [0, 'a']);
eq('Einstellungen ohne Gerätedinge', Object.keys(S.settingsPart({ layout: 4, charts: [], tz: 'UTC', jf: {}, ind: {} })).sort(), ['ind', 'tz']);
eq('Fehler: Tabelle fehlt', /Sync-Tabelle fehlt/.test(S.restError(404, { code: 'PGRST205' })), true);
eq('Fehler: Login', S.authError(400, { error_code: 'invalid_credentials' }), 'E-Mail oder Passwort falsch.');
eq('Fehler: Bestätigung', /Bitte E-Mail bestätigen/.test(S.authError(400, { error_code: 'email_not_confirmed' })), true);
console.log(passes + ' ok, ' + fails + ' Fehler');
process.exit(fails ? 1 : 0);
