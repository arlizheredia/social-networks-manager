#!/usr/bin/env python3
"""Prepara la extensión unificada para publicarla con la app en GitHub Pages.

  bun run build:extension      (o: python3 tools/build-extension.py)

- Genera extension/files.json con la versión y el SHA-256 de cada archivo: la autoactualización
  de la extensión lo descarga de GitHub Pages y verifica cada archivo antes de instalarlo.
- Copia la extensión a public/extension/ (se publica en …/social-networks-manager/extension/).
- Crea public/social-networks-manager-extension.zip para la instalación manual.

Sube "version" en extension/manifest.json antes de ejecutarlo.
"""
import hashlib, json, os, shutil, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, 'extension')
PUB = os.path.join(ROOT, 'public')
SKIP = {'files.json'}

version = json.load(open(os.path.join(EXT, 'manifest.json'), encoding='utf-8'))['version']
names = sorted(f for f in os.listdir(EXT) if os.path.isfile(os.path.join(EXT, f)) and f not in SKIP and not f.startswith('.'))
files = [{'name': n, 'sha256': hashlib.sha256(open(os.path.join(EXT, n), 'rb').read()).hexdigest()} for n in names]
with open(os.path.join(EXT, 'files.json'), 'w', encoding='utf-8') as fh:
    json.dump({'version': version, 'files': files}, fh, indent=2, ensure_ascii=False)
    fh.write('\n')

out = os.path.join(PUB, 'extension')
os.makedirs(out, exist_ok=True)
for n in names + ['files.json']:
    shutil.copy2(os.path.join(EXT, n), os.path.join(out, n))

zpath = os.path.join(PUB, 'social-networks-manager-extension.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for n in names + ['files.json']:
        z.write(os.path.join(EXT, n), 'social-networks-manager-extension/' + n)
print(f'Extensión {version}: {len(files)} archivos · files.json, public/extension/ y {os.path.basename(zpath)} listos')
