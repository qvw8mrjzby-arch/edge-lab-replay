/* Edge Lab Replay — Speicher: Journal, Sessions, Strategien in IndexedDB (unbegrenzt), localStorage als Rückfall.
   Einstellungen, Zeichnungen und der Fortsetzen-Stand bleiben im localStorage (klein, synchron). */
'use strict';
const IDB = {
  NAME: 'edge-lab-replay', VERSION: 2, _p: null,
  open() {
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      let r;
      try {
        if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB fehlt in diesem Browser');
        r = indexedDB.open(this.NAME, this.VERSION);
      } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('bilder')) { const s = db.createObjectStore('bilder', { keyPath: 'id' }); s.createIndex('owner', 'owner', { unique: false }); }
        if (!db.objectStoreNames.contains('daten')) db.createObjectStore('daten');
      };
      r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); res(db); };
      r.onerror = () => rej(r.error || new Error('IndexedDB nicht verfügbar'));
      r.onblocked = () => rej(new Error('IndexedDB blockiert – bitte andere Tabs der App schließen'));
    });
    this._p.catch(() => { /* Aufrufer behandeln den Fehler */ });
    return this._p;
  }
};

const Store = {
  mode: 'ls', db: null, err: '', migrated: [],
  KEYS: { journal: 'elr.journal', sessions: 'elr.sessions', strategies: 'elr.strategies', syncmeta: 'elr.syncmeta' },
  idKey: { journal: 'id', sessions: 'id', strategies: 'name' },
  async init() {
    try { this.db = await IDB.open(); this.mode = 'idb'; }
    catch (e) { this.mode = 'ls'; this.err = e.message || String(e); console.warn('Speicher: localStorage-Rückfall –', this.err); return this.mode; }
    /* Einmalige Migration aus dem localStorage (v2) – bei Daten auf beiden Seiten zusammenführen */
    for (const k of Object.keys(this.KEYS)) {
      if (k === 'syncmeta') continue;
      const ls = store.get(this.KEYS[k], null);
      if (ls == null) continue;
      try {
        const have = await this.getIdb(k);
        let merged = ls;
        if (Array.isArray(have) && Array.isArray(ls)) {
          const id = this.idKey[k], seen = new Set(have.map((x) => x && x[id]));
          merged = have.concat(ls.filter((x) => x && !seen.has(x[id])));
        } else if (have != null) merged = have;
        await this.putIdb(k, merged);
        const check = await this.getIdb(k);
        if (Array.isArray(check) && check.length >= (Array.isArray(ls) ? ls.length : 0)) {
          try { localStorage.removeItem(this.KEYS[k]); } catch (_) { /* egal */ }
          this.migrated.push(k);
        }
      } catch (e) { console.warn('Migration ' + k + ' fehlgeschlagen', e); }
    }
    return this.mode;
  },
  tx(mode, fn) {
    return new Promise((res, rej) => {
      try {
        const t = this.db.transaction('daten', mode);
        const r = fn(t.objectStore('daten'));
        let out;
        if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('Speichern abgebrochen'));
      } catch (e) { rej(e); }
    });
  },
  getIdb(k) { return this.tx('readonly', (s) => s.get(k)); },
  putIdb(k, v) { return this.tx('readwrite', (s) => s.put(v, k)); },
  async load(k, def) {
    if (this.mode === 'idb') {
      try { const v = await this.getIdb(k); return v === undefined ? def : v; }
      catch (e) { console.warn('Laden fehlgeschlagen', k, e); }
    }
    return store.get(this.KEYS[k], def);
  },
  /* Speichern (asynchron). Bei Fehler in IndexedDB: localStorage versuchen, sonst Meldung. */
  save(k, v) {
    if (this.mode !== 'idb') return Promise.resolve(store.set(this.KEYS[k], v));
    return this.putIdb(k, v).then(() => true).catch((e) => {
      console.warn('IndexedDB-Speichern fehlgeschlagen', k, e);
      return store.set(this.KEYS[k], v);
    });
  },
  /* Speicheranzeige und dauerhafte Speicherung */
  async estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (_) { /* egal */ }
    return null;
  },
  async persisted() { try { return navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (_) { return null; } },
  async persist() {
    if (this._asked) return this._persist;
    this._asked = true;
    try { this._persist = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : null; } catch (_) { this._persist = null; }
    return this._persist;
  }
};
