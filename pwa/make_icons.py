#!/usr/bin/env python3
"""Render the app's mark to PNG launcher icons.

The mark is the **clock and folder** — a clock (the hours the app counts) with
a folder (the record it keeps) at its lower right, in the app green
`oklch(0.52 0.14 149)`. It replaced the green fingerprint on 2026-10-26, when
punching stopped asking for a fingerprint and became a plain START / STOP tap,
and was redrawn on 2026-10-27 from the worker's own picture: a heavier ring
that opens where the folder sits, a swept arc outside it, square ticks, three
tapered hands and a two-layer folder. The master drawing is
`docs/design/logo/logo-mark.svg`; DESIGN.md beside it says why it looks the
way it does.

Nothing is rasterised from a source file. The `d` strings below are the
master's paths, character for character, flattened to polylines here and drawn
at the size being emitted, so every icon is drawn at its own resolution. FILLS
are solid shapes (the ring and arc are annular sectors, so their ends are cut
square, as in the picture); STROKES are lines with round caps. Keep them in
step with the master; `test/regress.js` compares the two.

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

# docs/design/logo/logo-mark.svg, in its own 100-unit space (viewBox 10 13 76 76).
FILLS = [
    "M51.37 78.47A30.65 30.65 0 1 1 72.85 58.27L68.76 56.94A26.35 26.35 0 1 0 50.3 74.31Z",  # ring
    "M10.88 27.73A39 39 0 0 1 26.48 13.81L28.38 17.67A34.7 34.7 0 0 0 14.5 30.05Z",  # arc
    "M42.25 24.65h2.9a0.6 0.6 0 0 1 0.6 0.6v2.9a0.6 0.6 0 0 1-0.6 0.6h-2.9a0.6 0.6 0 0 1-0.6-0.6v-2.9a0.6 0.6 0 0 1 0.6-0.6ZM20.15 46.75h2.9a0.6 0.6 0 0 1 0.6 0.6v2.9a0.6 0.6 0 0 1-0.6 0.6h-2.9a0.6 0.6 0 0 1-0.6-0.6v-2.9a0.6 0.6 0 0 1 0.6-0.6ZM64.35 46.75h2.9a0.6 0.6 0 0 1 0.6 0.6v2.9a0.6 0.6 0 0 1-0.6 0.6h-2.9a0.6 0.6 0 0 1-0.6-0.6v-2.9a0.6 0.6 0 0 1 0.6-0.6ZM42.25 68.85h2.9a0.6 0.6 0 0 1 0.6 0.6v2.9a0.6 0.6 0 0 1-0.6 0.6h-2.9a0.6 0.6 0 0 1-0.6-0.6v-2.9a0.6 0.6 0 0 1 0.6-0.6Z",  # ticks
    "M40.16 48.56L31.13 39.95A1.3 1.3 0 0 1 32.8 37.96L42.85 45.35A2.1 2.1 0 1 1 40.16 48.56Z",  # hour
    "M44.37 45.26L58.63 32.65A1.4 1.4 0 0 1 60.56 34.68L47.26 48.3A2.1 2.1 0 1 1 44.37 45.26Z",  # minute
    "M40 48.8a3.7 3.7 0 1 0 7.4 0a3.7 3.7 0 1 0-7.4 0Z",  # hub
]
# (path, stroke width), round caps and joins
STROKES = [
    ("M43.7 48.8 30.09 64.79", 1.85),  # second
    ("M55.2 74.1V63a3.4 3.4 0 0 1 3.4-3.4h8l3.85 3.85h9.35a3.4 3.4 0 0 1 3.4 3.4v7.25", 4),  # folder back
    ("M59.2 70.1H79a4 4 0 0 1 4 4v8.4a4 4 0 0 1-4 4H59.2a4 4 0 0 1-4-4V74.1a4 4 0 0 1 4-4Z", 4),  # folder front
    ("M62.1 78.1h14", 4),  # bar
]

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


def glyph_box(fills, strokes):
    """The mark's ink box in viewBox units — the filled outlines, plus each
    stroked polyline grown by half its width."""
    xs, ys = [], []
    for ln in fills:
        xs += [p[0] for p in ln]
        ys += [p[1] for p in ln]
    for lines, w in strokes:
        for ln in lines:
            xs += [p[0] - w / 2 for p in ln] + [p[0] + w / 2 for p in ln]
            ys += [p[1] - w / 2 for p in ln] + [p[1] + w / 2 for p in ln]
    return min(xs), min(ys), max(xs), max(ys)


def walk(pts, step):
    """`pts` resampled so no two consecutive points are more than `step` apart."""
    out = [pts[0]]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        n = max(1, math.ceil(math.hypot(bx - ax, by - ay) / step))
        out.extend(((ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(1, n + 1)))
    return out


def mark(fills, strokes, box, width):
    """The mark as an L-mode coverage mask `width` px across its ink box.

    Fills are drawn as polygons. Strokes are stamped as a run of overlapping
    discs rather than drawn with ImageDraw.line(): a wide line is rendered
    segment by segment with rounded endpoints, and at this stroke weight the
    seams between segments show as pale hairlines straight across the ink. A
    disc every sixteenth of the width cannot leave a seam, and round caps and
    joins fall out of it for free — which is what the folder and the second hand
    ask for. The spacing matters at this weight: at a quarter-width the discs'
    overlap left a scalloped edge about 0.8px deep on the 1024px icon (sagitta
    of a disc stepped r/2); at r/8 it is under 0.05px.
    """
    x0, y0, x1, y1 = box
    scale = width * SS / (x1 - x0)
    height = round((y1 - y0) * scale / SS)
    img = Image.new("L", (width * SS, height * SS), 0)
    draw = ImageDraw.Draw(img)
    to = lambda ln: [((px - x0) * scale, (py - y0) * scale) for px, py in ln]

    for ln in fills:
        draw.polygon(to(ln), fill=255)
    for lines, w in strokes:
        r = w * scale / 2
        for ln in lines:
            pts = to(ln)
            for px, py in (walk(pts, r / 8) if len(pts) > 1 else pts):
                draw.ellipse([px - r, py - r, px + r, py + r], fill=255)
    return img.resize((width, height), Image.BOX)


def place(img, fills, strokes, box, span):
    """Centre the mark on `img`, across `span` of its width."""
    w = round(img.width * span)
    m = mark(fills, strokes, box, w)
    at = ((img.width - m.width) // 2, (img.height - m.height) // 2)
    fill = GREEN + (255,) if img.mode == "RGBA" else GREEN
    img.paste(Image.new(img.mode, m.size, fill), at, m)
    return img


def lay(size, fills, strokes, box, span):
    """A `size` px icon: the disc, then the mark on top of it."""
    img = Image.new("RGB", (size * SS, size * SS), BG)
    ImageDraw.Draw(img).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=DISC)
    return place(img.resize((size, size), Image.BOX), fills, strokes, box, span)


def lay_foreground(size, fills, strokes, box, span):
    """A `size` px adaptive foreground: the mark alone, over transparency.

    The transparent canvas is transparent *green*, not transparent black. Paste
    blends every channel through the mask, so on (0, 0, 0, 0) each antialiased
    edge pixel came out green-darkened-toward-black and the stroke wore a thin
    dark rim on the white disc (review, 2026-10-26). With the colour already
    green, only the alpha ramps and the edge stays the mark's own colour.
    """
    return place(Image.new("RGBA", (size, size), GREEN + (0,)), fills, strokes, box, span)


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
    fills = [seg for d in FILLS for seg in flatten(d)]
    strokes = [(flatten(d), w) for d, w in STROKES]
    box = glyph_box(fills, strokes)

    def written(path):
        print(f"{os.path.relpath(path, out):52}{os.path.getsize(path):>8} bytes")

    def emit(path, size):
        lay(size, fills, strokes, box, SPAN).save(path, "PNG", optimize=True)
        written(path)

    def emit_foreground(path, size):
        # measured before it is written, at every density: a run that would leave
        # the 66dp safe circle stops before writing that foreground (the PWA
        # icons and any lower density already written stay as they are)
        img = lay_foreground(size, fills, strokes, box, ADAPTIVE_SPAN * ADAPTIVE_VIEWPORT)
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
