/* Edge Lab Replay — Fotos zu Trades und Backtest-Sessions (IndexedDB) */
'use strict';
const Photos = {
  db: null, ok: false, err: '',
  DB: 'edge-lab-replay', STORE: 'bilder',
  async init() {
    try {
      /* gemeinsame Datenbank mit Journal/Sessions/Strategien (storage.js) */
      this.db = await IDB.open();
      this.ok = true;
    } catch (e) { this.err = 'Fotos sind in diesem Browser nicht verfügbar (' + (e.message || e) + ').'; this.ok = false; }
    return this.ok;
  },
  tx(mode, fn) {
    return new Promise((res, rej) => {
      if (!this.ok) { rej(new Error(this.err || 'Fotos nicht verfügbar')); return; }
      try {
        const t = this.db.transaction(this.STORE, mode);
        const s = t.objectStore(this.STORE);
        let out;
        const r = fn(s);
        if (r) r.onsuccess = () => { out = r.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('abgebrochen'));
      } catch (e) { rej(e); }
    });
  },
  async add(owner, kind, blob, w, h) {
    const rec = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), owner: String(owner), kind, t: Math.floor(Date.now() / 1000), blob, w: w || blob.w || 0, h: h || blob.h || 0 };
    await this.tx('readwrite', (s) => s.put(rec));
    if (typeof App !== 'undefined' && App.onPhotosChanged) App.onPhotosChanged(rec.owner);
    return rec;
  },
  async list(owner) {
    if (!this.ok) return [];
    const all = await this.tx('readonly', (s) => s.index('owner').getAll(String(owner)));
    return (all || []).sort((a, b) => (a.kind === 'auto-entry' ? -1 : 0) - (b.kind === 'auto-entry' ? -1 : 0) || a.t - b.t);
  },
  async all() { return this.ok ? (await this.tx('readonly', (s) => s.getAll())) || [] : []; },
  async owners() {
    if (!this.ok) return new Map();
    const all = await this.all();
    const m = new Map();
    for (const r of all) { if (!m.has(r.owner) || r.kind === 'auto-entry') m.set(r.owner, r); }
    return m;
  },
  async del(id) { await this.tx('readwrite', (s) => s.delete(id)); },
  async delOwner(owner) {
    if (!this.ok) return;
    const list = await this.list(owner);
    await this.tx('readwrite', (s) => { for (const r of list) s.delete(r.id); });
  },
  async put(rec) { await this.tx('readwrite', (s) => s.put(rec)); },
  /* Bild verkleinern: max. Breite/Höhe, JPEG */
  async shrink(file, max, q) {
    max = max || 1600; q = q || 0.82;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild konnte nicht gelesen werden.')); i.src = url; });
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#0b1018'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
      return Object.assign(blob, { w, h });
    } finally { URL.revokeObjectURL(url); }
  },
  async addFiles(owner, files) {
    let n = 0;
    for (const f of files) {
      if (!f || !/^image\//.test(f.type)) continue;
      const b = await this.shrink(f);
      await this.add(owner, 'upload', b, b.w, b.h); n++;
    }
    return n;
  },
  blobToB64(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); },
  b64ToBlob(s, type) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: type || 'image/jpeg' }); },
  async exportAll() {
    const out = [];
    for (const r of await this.all()) out.push({ id: r.id, owner: r.owner, kind: r.kind, t: r.t, w: r.w, h: r.h, type: r.blob.type || 'image/jpeg', data: await this.blobToB64(r.blob) });
    return out;
  },
  async importAll(list) {
    if (!this.ok || !Array.isArray(list)) return 0;
    const have = new Set((await this.all()).map((r) => r.id));
    let n = 0;
    for (const r of list) {
      if (!r || !r.id || !r.data || have.has(r.id)) continue;
      await this.put({ id: r.id, owner: String(r.owner), kind: r.kind || 'upload', t: r.t || 0, w: r.w || 0, h: r.h || 0, blob: this.b64ToBlob(r.data, r.type) }); n++;
    }
    return n;
  }
};

/* Foto-Galerie in einem Container (Trade-Detail, Session-Dialog): Thumbnails, Hinzufügen, Einfügen, Ziehen */
const Gallery = {
  urls: [],
  revoke() { for (const u of this.urls) URL.revokeObjectURL(u); this.urls = []; },
  url(blob) { const u = URL.createObjectURL(blob); this.urls.push(u); return u; },
  kindLabel(k) { return k === 'auto-entry' ? 'Einstieg' : k === 'auto-exit' ? 'Ausstieg' : 'Upload'; },
  async render(host, owner) {
    host.dataset.owner = owner;
    if (!Photos.ok) { host.innerHTML = '<p class="hint">' + esc(Photos.err || 'Fotos nicht verfügbar.') + '</p>'; return; }
    const list = await Photos.list(owner);
    host._list = list;
    host.innerHTML = '<div class="ph-grid">' + list.map((r, i) => '<button type="button" class="ph" data-i="' + i + '" aria-label="Foto ' + (i + 1) + ' öffnen"><img alt="" src="' + this.url(r.blob) + '"><em>' + this.kindLabel(r.kind) + '</em></button>').join('') +
      '</div><div class="toolbar"><label class="btn sm filebtn">Foto hinzufügen<input type="file" accept="image/*" multiple></label><span class="hint">' + (list.length ? list.length + ' Foto' + (list.length > 1 ? 's' : '') + ' · ' : '') + 'oder Bild mit Strg+V einfügen bzw. hierher ziehen</span></div>';
    host.querySelector('input[type=file]').onchange = async (e) => { await this.addFiles(host, e.target.files); e.target.value = ''; };
    host.onclick = (e) => { const b = e.target.closest('.ph'); if (b) Lightbox.open(host._list, +b.dataset.i, () => this.render(host, owner)); };
    if (!host._dnd) {
      host._dnd = true;
      host.addEventListener('dragover', (e) => { e.preventDefault(); host.classList.add('over'); });
      host.addEventListener('dragleave', () => host.classList.remove('over'));
      host.addEventListener('drop', async (e) => { e.preventDefault(); host.classList.remove('over'); await this.addFiles(host, e.dataTransfer.files); });
    }
  },
  async addFiles(host, files) {
    try {
      const n = await Photos.addFiles(host.dataset.owner, Array.from(files || []));
      if (n) App.toast(n + ' Foto' + (n > 1 ? 's' : '') + ' gespeichert.', 'good');
      await this.render(host, host.dataset.owner);
    } catch (e) { App.toast('Foto konnte nicht gespeichert werden: ' + e.message, 'bad'); }
  }
};
/* Strg+V mit Bilddaten: in die gerade sichtbare Galerie */
document.addEventListener('paste', async (e) => {
  const host = $$('.modal:not([hidden]) [data-owner]').pop() || $$('.view:not([hidden]) [data-owner]').pop();
  if (!host) return;
  const files = Array.from((e.clipboardData && e.clipboardData.items) || []).filter((i) => i.kind === 'file' && /^image\//.test(i.type)).map((i) => i.getAsFile());
  if (!files.length) return;
  e.preventDefault();
  await Gallery.addFiles(host, files);
});

const Lightbox = {
  list: [], i: 0, url: null, onChange: null,
  open(list, i, onChange) { this.list = list; this.i = i; this.onChange = onChange; this.show(); openModal('#lightbox'); },
  show() {
    if (this.url) URL.revokeObjectURL(this.url);
    const r = this.list[this.i]; if (!r) { closeModal('#lightbox'); return; }
    this.url = URL.createObjectURL(r.blob);
    $('#lbImg').src = this.url;
    $('#lbCap').textContent = Gallery.kindLabel(r.kind) + ' · ' + (this.i + 1) + ' / ' + this.list.length;
    $('#lbPrev').disabled = this.i <= 0; $('#lbNext').disabled = this.i >= this.list.length - 1;
  },
  step(d) { const n = this.i + d; if (n >= 0 && n < this.list.length) { this.i = n; this.show(); } },
  /* Löschen mit „Rückgängig“ (6 s) statt Bestätigung */
  async del() {
    const r = this.list[this.i]; if (!r) return;
    await Photos.del(r.id);
    this.list.splice(this.i, 1);
    if (this.i >= this.list.length) this.i = this.list.length - 1;
    const onChange = this.onChange;
    if (onChange) onChange();
    if (!this.list.length) closeModal('#lightbox'); else this.show();
    App.undoToast('Foto gelöscht.', async () => {
      try { await Photos.put(r); if (App.onPhotosChanged) App.onPhotosChanged(r.owner); if (onChange) onChange(); App.toast('Foto wiederhergestellt.', 'good'); }
      catch (e) { App.toast('Foto konnte nicht wiederhergestellt werden.', 'bad'); }
    });
  },
  close() { if (this.url) { URL.revokeObjectURL(this.url); this.url = null; } }
};
