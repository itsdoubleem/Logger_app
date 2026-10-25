#!/usr/bin/env python3
"""Render the app's mark to PNG launcher icons.

The mark is the **clock and folder** — a clock (the hours the app counts) with
a folder (the record it keeps) overlapping its lower right, in the app green
`oklch(0.52 0.14 149)`. It replaced the green fingerprint on 2026-10-26, when
punching stopped asking for a fingerprint and became a plain START / STOP tap.
The master drawing is `docs/design/logo/logo-mark.svg`; DESIGN.md beside it
says why it looks the way it does.

Nothing is rasterised from a source file. The `d` strings below are the
master's shapes — its two circles rewritten as pairs of arcs, because this
script reads paths only — flattened to polylines here and stroked at the size
being emitted, so every icon is drawn at its own resolution. Keep them in step
with the master; `test/regress.js` compares the two.

Where the folder crosses the clock, the master cuts the ring with a mask so
there is a real gap rather than a painted patch. Here that is CUT: the clock is
drawn, CUT is erased out of it, then the folder is drawn on top.

A home-screen icon cannot be transparent — iOS fills alpha with black and
Android masks every icon over a background layer — so the mark sits on the
same white disc the fingerprint did. Every icon is full-bleed: the disc touches
all four edges and only the corners fall back to the field colour, so a circle
mask crops exactly to the disc, and the mark stays inside the central 80% safe
zone maskable icons require.

Android's adaptive icons are the exception: there the disc and the mark have to
be separate layers for the launcher to mask and animate them, so the mark is
also emitted alone on transparency — see ADAPTIVE_VIEWPORT.
"""
import math
import os
import re

from PIL import Image, ImageDraw

# app tokens, from ds-tokens.css and the punch pad
BG = (0xF3, 0xF2, 0xF2)       # --color-bg, the icon's corners
DISC = (0xFD, 0xFD, 0xFD)     # the logo's disc, flattened from its faint sheen
GREEN = (0x12, 0x7E, 0x38)    # oklch(0.52 0.14 149), the pad's padIconInk

# docs/design/logo/logo-mark.svg, in its own 100-unit space. Stroke 3.6, round
# caps and joins.
STROKE = 3.6
CLOCK = [
    "M17 44a27 27 0 1 0 54 0a27 27 0 1 0-54 0",          # the ring, r 27
    "M44 21.5v4M21.5 44h4M62.5 44h4M44 62.5v4",           # 12 · 9 · 3 · 6
    "M44 44 30.5 31M44 44 55 33",                         # the hands, 10:10
    "M42.7 44a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0",   # the hub, r 1.3
]
FOLDER = [
    "M55 77V57.5a3 3 0 0 1 3-3h7.5l3 3.5h9.5a3 3 0 0 1 3 3V77a3 3 0 0 1-3 3H58a3 3 0 0 1-3-3Z",
    "M55 64.5h26M61 71.5h13",
]
# the master's mask: what is erased from the clock where the folder sits
CUT = (51, 51.5, 84, 82.5)

# Fraction of the icon's width the mark's ink box spans.
#
# What a maskable icon has to keep inside the central 80% circle is its ink,
# not its box. The fingerprint was a rounded blob and could take 0.62; this
# mark is nearly square and its far corner is filled — the folder's bottom
# right sits almost on the box corner — so the same span would push that corner
# out to 0.85 of the diameter and a circle mask would clip it. main() measures
# the emitted maskable icon and prints the reach: at 0.56 it lands at about
# 0.75, inside the 0.80 circle with the mark still as large as the old one read.
SPAN = 0.56

# Android 8+ adaptive icons split the icon in two layers on a 108dp canvas. The
# launcher masks away everything outside the central 72dp and animates the two
# layers against each other inside it, so only the inner 66dp circle is certain
# to survive every mask on every device.
#
# The disc becomes the background layer — a flat colour, since the mask decides
# its shape — and the mark becomes the foreground, laid over transparency. It
# spans SPAN of the 72dp viewport rather than of the whole bitmap, which is what
# keeps it the size it already is on the home screen.
ADAPTIVE_VIEWPORT = 72 / 108

# The adaptive foreground gets its own, larger span (2026-10-26). SPAN is sized
# for the maskable PWA icon, whose safe zone is the central 80% circle of the
# *whole* icon; reused here it left the mark at 0.75 of the 72dp viewport, and
# on the home screen it read clearly smaller than Claude, EPS or GitHub beside
# it. The adaptive safe zone is the 66dp circle — 66/72 = 0.917 of the viewport
# — so the mark can grow by about a fifth. main() measures the emitted
# foreground and stops if the ink leaves that circle.
ADAPTIVE_SPAN = 0.66
ADAPTIVE_SAFE = 66 / 72

# Antialiasing: everything is drawn at SS times the final size and box-averaged
# down. ImageDraw has no antialiasing of its own, for the strokes or the disc.
SS = 4

TOKEN = re.compile(r"[A-Za-z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?")


def _cubic(p0, p1, p2, p3, n=64):
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        yield (
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        )


def _arc(p0, rx, ry, rot, large, sweep, p1):
    """SVG endpoint-parameterised elliptical arc, flattened. Spec F.6.5."""
    x0, y0 = p0
    x1, y1 = p1
    if (x0, y0) == (x1, y1) or rx == 0 or ry == 0:
        yield p1
        return
    rx, ry = abs(rx), abs(ry)
    phi = math.radians(rot)
    cos, sin = math.cos(phi), math.sin(phi)
    dx, dy = (x0 - x1) / 2, (y0 - y1) / 2
    x1p, y1p = cos * dx + sin * dy, -sin * dx + cos * dy
    # grow the radii if they cannot span the chord
    lam = (x1p / rx) ** 2 + (y1p / ry) ** 2
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    k = math.sqrt(max(0.0, num / den))
    if large == sweep:
        k = -k
    cxp, cyp = k * rx * y1p / ry, -k * ry * x1p / rx
    cx = cos * cxp - sin * cyp + (x0 + x1) / 2
    cy = sin * cxp + cos * cyp + (y0 + y1) / 2
    th0 = math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
    th1 = math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
    d = th1 - th0
    if not sweep and d > 0:
        d -= 2 * math.pi
    elif sweep and d < 0:
        d += 2 * math.pi
    # one point per 0.15 units of arc, so the chord never sags a visible amount
    n = max(12, math.ceil(abs(d) * max(rx, ry) / 0.15))
    for i in range(1, n + 1):
        th = th0 + d * i / n
        yield (
            cx + rx * math.cos(th) * cos - ry * math.sin(th) * sin,
            cy + rx * math.cos(th) * sin + ry * math.sin(th) * cos,
        )


def flatten(d):
    """A path's `d` string as a list of polylines, in viewBox units."""
    t = TOKEN.findall(d)
    i = 0
    x = y = 0.0
    cmd = None
    lines, cur = [], None

    def n():
        nonlocal i
        v = float(t[i])
        i += 1
        return v

    while i < len(t):
        if t[i].isalpha():
            cmd = t[i]
            i += 1
        rel, c = cmd.islower(), cmd.upper()
        if c == "M":
            x, y = (x + n(), y + n()) if rel else (n(), n())
            cur = [(x, y)]
            lines.append(cur)
            cmd = "l" if rel else "L"       # a repeated M pair is a lineto
            continue
        if c == "L":
            x, y = (x + n(), y + n()) if rel else (n(), n())
            pts = [(x, y)]
        elif c == "H":
            x = x + n() if rel else n()
            pts = [(x, y)]
        elif c == "V":
            y = y + n() if rel else n()
            pts = [(x, y)]
        elif c == "C":
            a = [n() for _ in range(6)]
            if rel:
                a = [v + (x if j % 2 == 0 else y) for j, v in enumerate(a)]
            pts = list(_cubic((x, y), a[0:2], a[2:4], a[4:6]))
            x, y = a[4], a[5]
        elif c == "A":
            rx, ry, rot, large, sweep = n(), n(), n(), n(), n()
            ex, ey = (x + n(), y + n()) if rel else (n(), n())
            pts = list(_arc((x, y), rx, ry, rot, int(large), int(sweep), (ex, ey)))
            x, y = ex, ey
        elif c == "Z":
            pts = [cur[0]]
            x, y = cur[0]
        else:
            raise SystemExit(f"make_icons: path command {cmd!r} is not handled")
        cur.extend(pts)
    return lines


def glyph_box(lines):
    """The mark's ink box in viewBox units — the polylines plus the stroke."""
    xs = [p[0] for ln in lines for p in ln]
    ys = [p[1] for ln in lines for p in ln]
    r = STROKE / 2
    return min(xs) - r, min(ys) - r, max(xs) + r, max(ys) + r


def walk(pts, step):
    """`pts` resampled so no two consecutive points are more than `step` apart."""
    out = [pts[0]]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        n = max(1, math.ceil(math.hypot(bx - ax, by - ay) / step))
        out.extend(((ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(1, n + 1)))
    return out


def mark(clock, folder, box, width):
    """The mark as an L-mode coverage mask `width` px across its ink box.

    The stroke is stamped as a run of overlapping discs rather than drawn with
    ImageDraw.line(): a wide line is rendered segment by segment with rounded
    endpoints, and at this stroke weight the seams between segments show as pale
    hairlines straight across the ink. A disc every quarter-width cannot leave a
    seam, and round caps and joins fall out of it for free — which is what the
    glyph asks for anyway.

    The clock goes down first, CUT is erased out of it, and the folder is drawn
    last — the master's mask, in three steps.
    """
    x0, y0, x1, y1 = box
    scale = width * SS / (x1 - x0)
    height = round((y1 - y0) * scale / SS)
    img = Image.new("L", (width * SS, height * SS), 0)
    draw = ImageDraw.Draw(img)
    r = STROKE * scale / 2

    def stroke(lines):
        for ln in lines:
            pts = [((px - x0) * scale, (py - y0) * scale) for px, py in ln]
            for px, py in (walk(pts, r / 2) if len(pts) > 1 else pts):
                draw.ellipse([px - r, py - r, px + r, py + r], fill=255)

    stroke(clock)
    cx0, cy0, cx1, cy1 = CUT
    draw.rectangle([(cx0 - x0) * scale, (cy0 - y0) * scale,
                    (cx1 - x0) * scale, (cy1 - y0) * scale], fill=0)
    stroke(folder)
    return img.resize((width, height), Image.BOX)


def place(img, clock, folder, box, span):
    """Centre the mark on `img`, across `span` of its width."""
    w = round(img.width * span)
    m = mark(clock, folder, box, w)
    at = ((img.width - m.width) // 2, (img.height - m.height) // 2)
    fill = GREEN + (255,) if img.mode == "RGBA" else GREEN
    img.paste(Image.new(img.mode, m.size, fill), at, m)
    return img


def lay(size, clock, folder, box, span):
    """A `size` px icon: the disc, then the mark on top of it."""
    img = Image.new("RGB", (size * SS, size * SS), BG)
    ImageDraw.Draw(img).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=DISC)
    return place(img.resize((size, size), Image.BOX), clock, folder, box, span)


def lay_foreground(size, clock, folder, box, span):
    """A `size` px adaptive foreground: the mark alone, over transparency.

    The transparent canvas is transparent *green*, not transparent black. Paste
    blends every channel through the mask, so on (0, 0, 0, 0) each antialiased
    edge pixel came out green-darkened-toward-black and the stroke wore a thin
    dark rim on the white disc (review, 2026-10-26). With the colour already
    green, only the alpha ramps and the edge stays the mark's own colour.
    """
    return place(Image.new("RGBA", (size, size), GREEN + (0,)), clock, folder, box, span)


def reach(path):
    """How far the mark's ink gets from the centre, as a fraction of the width.

    The maskable safe zone is the central 80% of the icon, and it is the ink
    that has to stay inside it — not the ink's bounding box. Measured off the emitted PNG so it cannot drift from
    what actually shipped.
    """
    img = Image.open(path).convert("RGB")
    px, n = img.load(), img.width
    c = (n - 1) / 2
    far = 0.0
    for y in range(n):
        for x in range(n):
            r, g, b = px[x, y]
            if g > r + 30 and g > b + 30:
                far = max(far, math.hypot(x - c, y - c))
    return 2 * far / n


def reach_foreground(img):
    """How far the foreground's ink gets from the centre, as a fraction of the
    72dp viewport's diameter — the number the 66dp safe circle is judged by."""
    img = img.convert("RGBA")
    px, n = img.load(), img.width
    c = (n - 1) / 2
    far = 0.0
    for y in range(n):
        for x in range(n):
            if px[x, y][3] > 32:
                far = max(far, math.hypot(x - c, y - c))
    return 2 * far / (n * ADAPTIVE_VIEWPORT)


def main():
    out = os.path.dirname(os.path.abspath(__file__))
    clock = [seg for d in CLOCK for seg in flatten(d)]
    folder = [seg for d in FOLDER for seg in flatten(d)]
    box = glyph_box(clock + folder)

    def written(path):
        print(f"{os.path.relpath(path, out):52}{os.path.getsize(path):>8} bytes")

    def emit(path, size):
        lay(size, clock, folder, box, SPAN).save(path, "PNG", optimize=True)
        written(path)

    def emit_foreground(path, size):
        # measured before it is written, at every density: a run that would leave
        # the 66dp safe circle stops without touching the tree
        img = lay_foreground(size, clock, folder, box, ADAPTIVE_SPAN * ADAPTIVE_VIEWPORT)
        r = reach_foreground(img)
        if r > ADAPTIVE_SAFE:
            raise SystemExit(f"make_icons: {os.path.basename(os.path.dirname(path))} adaptive mark "
                             f"reaches {r:.3f} > {ADAPTIVE_SAFE:.3f} — lower ADAPTIVE_SPAN")
        img.save(path, "PNG", optimize=True)
        written(path)

    for name, size in [
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("icon-180.png", 180),
        ("icon-maskable-512.png", 512),
    ]:
        emit(os.path.join(out, name), size)

    print(f"{'maskable ink reach':52}{reach(os.path.join(out, 'icon-maskable-512.png')):>7.2f}"
          "  of the diameter (safe zone 0.80)")

    # Android launcher bitmaps, one per density bucket: the 48dp legacy icon
    # that API 24-25 and the Play Store still use, and the 108dp adaptive
    # foreground that everything from API 26 on picks up instead (paired with a
    # flat background by mipmap-anydpi-v26/ic_launcher.xml).
    res = os.path.join(out, os.pardir, "android", "app", "src", "main", "res")
    for bucket, legacy, adaptive in [
        ("mipmap-mdpi", 48, 108),
        ("mipmap-hdpi", 72, 162),
        ("mipmap-xhdpi", 96, 216),
        ("mipmap-xxhdpi", 144, 324),
        ("mipmap-xxxhdpi", 192, 432),
    ]:
        d = os.path.join(res, bucket)
        if os.path.isdir(d):
            emit(os.path.join(d, "ic_launcher.png"), legacy)
            emit_foreground(os.path.join(d, "ic_launcher_foreground.png"), adaptive)


    xxx = os.path.join(res, "mipmap-xxxhdpi", "ic_launcher_foreground.png")
    if os.path.exists(xxx):
        r = reach_foreground(Image.open(xxx))
        print(f"{'adaptive ink reach':52}{r:>7.2f}  of the 72dp viewport (safe circle {ADAPTIVE_SAFE:.2f})")

    # The adaptive background is the disc, which at this point is one flat
    # colour, so it is written as a colour resource rather than five more
    # bitmaps. Generated here so it cannot drift from the DISC the foregrounds
    # were laid against.
    values = os.path.join(res, "values", "ic_launcher_background.xml")
    if os.path.isdir(os.path.dirname(values)):
        with open(values, "w") as f:
            f.write(
                '<?xml version="1.0" encoding="utf-8"?>\n'
                "<!-- generated by pwa/make_icons.py, do not edit -->\n"
                "<resources>\n"
                '    <color name="ic_launcher_background">#%02X%02X%02X</color>\n'
                "</resources>\n" % DISC
            )
        written(values)

    # The iOS app icon. One 1024px image; iOS masks the corners itself, and it
    # may not carry alpha, which the disc-on-field layout already satisfies.
    appicon = os.path.join(
        out, os.pardir, "ios", "WorkLog", "Assets.xcassets", "AppIcon.appiconset"
    )
    if os.path.isdir(appicon):
        emit(os.path.join(appicon, "icon-1024.png"), 1024)


if __name__ == "__main__":
    main()
