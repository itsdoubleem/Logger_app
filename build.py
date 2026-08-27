#!/usr/bin/env python3
"""Rebuild the deployable PWA from the handoff sources.

    python3 build.py            ->  dist/

The compiled handoff file 근무기록-WorkLog.html is a self-unpacking bundle: a
small loader plus a JSON manifest of gzip+base64 assets (the dc runtime, React,
the Archivo webfont CSS, and WorkLogApp.dc.html itself), which it decodes into
blob URLs and swaps into the document. This script reuses that file as the
shell and rewrites only what has to change:

  1. the WorkLogApp asset is replaced with the current WorkLogApp.dc.html,
     so the WebAuthn punch pad in the source ships in the build;
  2. ds-tokens.css is registered under the _ds/... href the app's helmet
     already links, which is missing from the handoff bundle (see that file);
  3. the outer template gains the manifest link, the icons and the service
     worker registration.

Nothing else is touched: the loader, the runtime, React, the font CSS and the
wage engine come through byte-for-byte.
"""
import base64
import gzip
import hashlib
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SHELL = os.path.join(ROOT, '근무기록-WorkLog.html')
# `python3 build.py v2` builds the v2 source into dist-v2/ alongside the v1 build,
# so the two can be served and compared side by side.
V2 = len(sys.argv) > 1 and sys.argv[1] == 'v2'
APP = os.path.join(ROOT, 'WorkLogApp.v2.dc.html' if V2 else 'WorkLogApp.dc.html')
TOKENS = os.path.join(ROOT, 'ds-tokens.css')
PWA = os.path.join(ROOT, 'pwa')
DIST = os.path.join(ROOT, 'dist-v2' if V2 else 'dist')

# the href the app's <helmet> links but the bundle never shipped
DS_CSS_ID = '_ds/modernist-5ce80c01-ca67-4380-af11-739c06a783bc/styles.css'
DS_JS_ID = '_ds/modernist-5ce80c01-ca67-4380-af11-739c06a783bc/_ds_bundle.js'
DS_CSS_UUID = 'd5000000-0000-4000-8000-000000000001'

PWA_HEAD = """
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#f3f2f2">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="근무기록">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="icon-512.png">
<script>
// Offline shell. Registered from the real page URL — the bundle swaps the
// document element in place, it never navigates to the blob, so this scope is
// the site root and Add to Home screen installs the whole app.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(function () { /* http:// or private mode — app still runs */ });
}
</script>
"""


def read(p, mode='r'):
    with open(p, mode, **({'encoding': 'utf-8'} if mode == 'r' else {})) as f:
        return f.read()


def island(html, kind):
    m = re.search(r'<script type="__bundler/%s">(.*?)</script>' % kind, html, re.S)
    if not m:
        sys.exit('bundle island missing: ' + kind)
    return m


def pack(raw_bytes):
    """gzip + base64, matching what the loader expects."""
    gz = gzip.compress(raw_bytes, 9, mtime=0)
    return base64.b64encode(gz).decode('ascii')


def patch_app(src):
    """Adjustments the app source cannot make for itself, because they only
    apply once it is bundled and served from a static host."""
    # The DS bundle registers custom elements; this app uses none (only plain
    # divs plus the runtime's own sc-if / sc-for), and the file 404s on any
    # host, so drop the tag rather than ship a broken request.
    src, n = re.subn(r'[ \t]*<script src="%s"></script>\n' % re.escape(DS_JS_ID), '', src)
    if n != 1:
        sys.exit('expected exactly one _ds_bundle.js script tag, found %d' % n)
    if DS_CSS_ID not in src:
        sys.exit('the _ds styles.css link is gone — check WorkLogApp.dc.html')
    return src


def main():
    shell = read(SHELL)
    app = patch_app(read(APP))
    tokens = read(TOKENS)

    man_m = island(shell, 'manifest')
    ext_m = island(shell, 'ext_resources')
    tpl_m = island(shell, 'template')

    manifest = json.loads(man_m.group(1))
    ext = json.loads(ext_m.group(1))
    template = json.loads(tpl_m.group(1))

    # 1 ── swap in the current app source
    app_uuid = next((e['uuid'] for e in ext if e['id'].endswith('WorkLogApp.dc.html')), None)
    if app_uuid not in manifest:
        sys.exit('could not find the WorkLogApp asset in the bundle')
    manifest[app_uuid]['data'] = pack(app.encode('utf-8'))
    manifest[app_uuid]['compressed'] = True

    # 2 ── supply the missing design-system stylesheet under its own href
    manifest[DS_CSS_UUID] = {'mime': 'text/css', 'compressed': True,
                             'data': pack(tokens.encode('utf-8'))}
    ext = [e for e in ext if e['id'] != DS_CSS_ID]
    ext.insert(0, {'id': DS_CSS_ID, 'uuid': DS_CSS_UUID})

    # 3 ── PWA head tags into the template the loader mounts
    if '<link rel="manifest"' not in template:
        template = template.replace(
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">' + PWA_HEAD,
            1)
    if '<link rel="manifest"' not in template:
        sys.exit('could not place the PWA head tags in the template')

    # These islands live inside <script> tags, so a literal "</script>" in the
    # JSON would close the tag early. The bundler escapes the slash; match it.
    def island_json(val):
        return json.dumps(val).replace('</', '<\\u002F')

    out = shell
    for m, val in ((tpl_m, template), (ext_m, ext), (man_m, manifest)):
        out = out[:m.start(1)] + island_json(val) + out[m.end(1):]

    os.makedirs(DIST, exist_ok=True)
    index = os.path.join(DIST, 'index.html')
    with open(index, 'w', encoding='utf-8') as f:
        f.write(out)

    # Cache key changes whenever the built page does — and whenever the worker
    # itself does. Hashing only the page meant a fix to sw.js shipped under the
    # old cache name: the browser still swaps the worker (it compares the script
    # byte for byte), but `activate` keeps the cache it thinks is current, so
    # entries written under the old rules survive a change to those rules.
    sw_src = read(os.path.join(PWA, 'sw.js'))
    build_id = hashlib.sha256((out + sw_src).encode('utf-8')).hexdigest()[:10]
    sw = sw_src.replace('__BUILD__', build_id)
    with open(os.path.join(DIST, 'sw.js'), 'w', encoding='utf-8') as f:
        f.write(sw)

    for name in ['manifest.webmanifest', 'icon-192.png', 'icon-512.png',
                 'icon-180.png', 'icon-maskable-512.png']:
        shutil.copy2(os.path.join(PWA, name), os.path.join(DIST, name))

    d = os.path.basename(DIST)
    print('%s/index.html  %7d bytes  (build %s)' % (d, os.path.getsize(index), build_id))
    for name in sorted(os.listdir(DIST)):
        if name != 'index.html':
            print('%s/%-24s %7d bytes' % (d, name, os.path.getsize(os.path.join(DIST, name))))


if __name__ == '__main__':
    main()
