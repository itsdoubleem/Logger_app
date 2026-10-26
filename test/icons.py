#!/usr/bin/env python3
"""Every committed icon is what pwa/make_icons.py draws today.

The icons are generated, but they are committed — so an edit to FILLS,
STROKES or a span that is never followed by a run of the script ships the old
icons while every other check stays green (review 2026-10-27 S5). This runs
the script into a scratch copy of the tree and compares each output with the
committed file, pixel by pixel rather than byte by byte, so a different
Pillow's PNG encoder cannot fail it.
"""
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
RES = os.path.join("android", "app", "src", "main", "res")
DIRS = [
    "pwa",
    os.path.join("ios", "WorkLog", "Assets.xcassets", "AppIcon.appiconset"),
    os.path.join("docs", "design", "logo"),
    os.path.join(RES, "values"),
] + [os.path.join(RES, "mipmap-" + d) for d in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")]


def same(a, b):
    """Every channel of every pixel. Not ImageChops.difference().getbbox():
    on RGBA that looks at alpha only (Pillow's default), so a recoloured icon —
    and anything at all on the ten opaque ones — passed (review 2026-10-27 M1)."""
    a, b = a.convert("RGBA"), b.convert("RGBA")
    return a.size == b.size and a.tobytes() == b.tobytes()


def selftest():
    """The comparison must see one opaque pixel change colour."""
    a = Image.new("RGBA", (4, 4), (255, 255, 255, 255))
    b = a.copy()
    b.putpixel((1, 1), (255, 0, 255, 255))
    if same(a, b) or not same(a, a.copy()):
        raise SystemExit("icons.py: the pixel comparison is blind — fix same()")


def main():
    selftest()
    tmp = tempfile.mkdtemp(prefix="worklog-icons-")
    try:
        for d in DIRS:
            os.makedirs(os.path.join(tmp, d))
        shutil.copy(os.path.join(ROOT, "pwa", "make_icons.py"), os.path.join(tmp, "pwa"))
        subprocess.run([sys.executable, os.path.join(tmp, "pwa", "make_icons.py")],
                       check=True, stdout=subprocess.DEVNULL)
        bad, n = [], 0
        for d in DIRS:
            for f in sorted(os.listdir(os.path.join(tmp, d))):
                if f == "make_icons.py":
                    continue
                n += 1
                made, kept = os.path.join(tmp, d, f), os.path.join(ROOT, d, f)
                rel = os.path.join(d, f)
                if not os.path.exists(kept):
                    bad.append(rel + ": generated but not committed")
                elif f.endswith(".png"):
                    if not same(Image.open(made), Image.open(kept)):
                        bad.append(rel + ": differs from what make_icons.py draws")
                elif open(made, "rb").read() != open(kept, "rb").read():
                    bad.append(rel + ": differs from what make_icons.py writes")
        for b in bad:
            print("  ! " + b)
        print("  %d generated files, %d differ%s" % (n, len(bad), "" if bad else "  OK"))
        if bad:
            print("  run: python3 pwa/make_icons.py")
        return 1 if bad else 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
