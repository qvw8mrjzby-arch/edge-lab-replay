/* Apple-Look: Lichtpunkt auf Karten folgt der Maus (nur Optik, keine Funktion). */
(() => {
  if (!window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const SEL = '.card, .jt .tile, .sess, .strat-card, .welcome, .si, .steps > *, .pass-hero, .bs-stat, .bs-box';
  let el = null, x = 0, y = 0, raf = 0;
  const paint = () => {
    raf = 0; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (x - r.left) + 'px');
    el.style.setProperty('--my', (y - r.top) + 'px');
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = e.target.closest && e.target.closest(SEL);
    if (t !== el) { el = t; if (el && !el.classList.contains('a-spot')) el.classList.add('a-spot'); }
    x = e.clientX; y = e.clientY;
    if (el && !raf) raf = requestAnimationFrame(paint);
  }, { passive: true });
})();

/* Hell (Glas) / Dunkel (Glas): Schalter oben in der Leiste (#jvMode) und in den Einstellungen (#setLight) */
const Mode = (() => {
  const on = () => { try { return localStorage.getItem('elr.light') !== '0'; } catch { return true; } };
  const set = (light) => {
    try { localStorage.setItem('elr.light', light ? '1' : '0'); } catch { }
    const root = document.documentElement;
    root.classList.add('mode-anim'); setTimeout(() => root.classList.remove('mode-anim'), 450);
    if (light) { root.setAttribute('data-light', ''); root.removeAttribute('data-glass'); }
    else { root.removeAttribute('data-light'); if (typeof Space !== 'undefined') Space.setGlass(true); else root.setAttribute('data-glass', ''); }
    const box = document.getElementById('setLight'); if (box) box.checked = light;
    const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.content = light ? '#eef0f6' : '#080d19';
    try { readColors(); App.requestRender(); if (App.view === 'start') App.renderStart(); } catch { }
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#jvMode')) { set(!on()); if (typeof App !== 'undefined' && App.toast) App.toast(on() ? 'Hell (Glas)' : 'Dunkel (Glas)'); }
    if (e.target.closest && e.target.closest('#btnSettings')) setTimeout(() => { const b = document.getElementById('setLight'); if (b) b.checked = on(); }, 0);
  }, true);
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'setLight') set(e.target.checked); });
  return { on, set };
})();
