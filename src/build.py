import os, json
os.chdir(os.path.dirname(os.path.abspath(__file__)))
tpl = open('template.html').read()
js = ''.join(open(f).read() + '\n' for f in ['core.js','chart.js','app.js','econ.js','storage.js','photos.js','sync.js','notes.js','data.js','start.js','analysis.js','handbook.js','ui.js'])
assert '</script' not in js
import re
# Als Modul-Skript: wird zurückgestellt, der Startbildschirm malt sofort. Globale Namen für Konsole/Tests freigeben.
names = sorted(set(re.findall(r'^(?:const|let|class|function|async function)\s+([A-Za-z_$][\w$]*)', js, re.M)))
scripts = '<script type="module">\n' + js + '\nObject.assign(window, {' + ', '.join(names) + '});\n</script>'
os.makedirs('dist', exist_ok=True); os.makedirs('site', exist_ok=True)
open('dist/edge-lab-replay.html','w').write(tpl.replace('<!--SCRIPTS-->', scripts))
# Vollständige Seite für GitHub Pages (installierbar als App)
head_extra = '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
sw_reg = """<script>
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => {
  const tell = (w) => { window.__elrUpdate = w; window.dispatchEvent(new CustomEvent('elr-update', { detail: w })); };
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) tell(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) tell(w); }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
});
</script>"""
title_end = tpl.index('</style>') + len('</style>')
head, body = tpl[:title_end], tpl[title_end:]
page = '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n' + head_extra + head + '\n</head>\n<body>' + body.replace('<!--SCRIPTS-->', scripts + '\n' + sw_reg) + '\n</body>\n</html>\n'
open('site/index.html','w').write(page)
print('ok', len(page)//1024, 'KB')
