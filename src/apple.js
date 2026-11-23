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
