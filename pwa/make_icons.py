#!/usr/bin/env python3
"""Render the app's mark to PNG launcher icons.

The mark is the **green fingerprint** — the same nine-path glyph the punch pad
draws, in the same `oklch(0.52 0.14 149)`. It is what the app is: press a finger
twice a day. It used to be the 근무기록 · LOGGER wordmark lifted out of
`icon-source.png`, which read fine at 512px and turned to grey mush at 48; a
glyph has no such floor, so there is no longer a large mark and a small one.

Nothing is rasterised from a source file any more. The nine `d` strings below
are copied verbatim from `WorkLogApp.v2.dc.html`, flattened to polylines here
and stroked at the size being emitted, so every icon is drawn at its own
resolution rather than downsampled from someone else's. Keep them byte-identical
to the pad's — the fingerprint is the app's identity and the four copies of it
(the pad plus three logos) are meant to be the same drawing.

`pwa/icon-source.png` is no longer read by anything. It is the wordmark and it
is kept because that is still the logo inside the app; it is simply not the
launcher icon.

Every icon is full-bleed: the disc touches all four edges and only the corners
fall back to the field colour, so a circle mask crops exactly to the disc, and
the mark stays inside the central 80% safe zone maskable icons require.

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

# The punch pad's fingerprint, verbatim from WorkLogApp.v2.dc.html. viewBox
# 0 0 24 24, stroke-width 2, round caps and joins.
VIEW = 24
STROKE = 2
PATHS = [
    "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
    "M14 13.12c0 2.38 0 6.38-1 8.88",
    "M17.29 21.02c.12-.6.43-2.3.5-3.02",
    "M2 12a10 10 0 0 1 18-6",
    "M2 16h.01",
    "M21.8 16c.2-2 .131-5.354 0-6",
    "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
    "M8.65 22c.21-.66.45-1.32.57-2",
    "M9 6.8a6 6 0 0 1 9 5.2v2",
]

# Fraction of the icon's width the mark's ink box spans.
#
# What a maskable icon has to keep inside the central 80% circle is its
# *content*, and this glyph's content is nowhere near its box: the box is very
# nearly square (21.93 x 22.00 units, so its corners sit at 1.414 times this
# number) but the drawing inside it is a rounded blob with all four corners
# empty. Sizing against the box costs about a fifth of the mark for nothing —
# 0.55 is what the box allows and it lands the ink at 0.59 of the diameter,
# which on a phone reads visibly smaller than every icon beside it.
#
# So size against the ink, and measure it rather than judging it: main() reports
# the reach of the emitted maskable icon. At 0.62 the ink reaches 0.67 — well
# inside the 0.80 circle — and the mark sits on the disc the way the pad's does
# in its square. Past about 0.70 it starts crowding the rim.
SPAN = 0.62

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


def mark(lines, box, width):
    """The mark as an L-mode coverage mask `width` px across its ink box.

    The stroke is stamped as a run of overlapping discs rather than drawn with
    ImageDraw.line(): a wide line is rendered segment by segment with rounded
    endpoints, and at this stroke weight the seams between segments show as pale
    hairlines straight across the ink. A disc every quarter-width cannot leave a
    seam, and round caps and joins fall out of it for free — which is what the
    glyph asks for anyway.
    """
    x0, y0, x1, y1 = box
    scale = width * SS / (x1 - x0)
    height = round((y1 - y0) * scale / SS)
    img = Image.new("L", (width * SS, height * SS), 0)
    draw = ImageDraw.Draw(img)
    r = STROKE * scale / 2
    for ln in lines:
        pts = [((px - x0) * scale, (py - y0) * scale) for px, py in ln]
        for px, py in (walk(pts, r / 2) if len(pts) > 1 else pts):
            draw.ellipse([px - r, py - r, px + r, py + r], fill=255)
    return img.resize((width, height), Image.BOX)


def place(img, lines, box, span):
    """Centre the mark on `img`, across `span` of its width."""
    w = round(img.width * span)
    m = mark(lines, box, w)
    at = ((img.width - m.width) // 2, (img.height - m.height) // 2)
    fill = GREEN + (255,) if img.mode == "RGBA" else GREEN
    img.paste(Image.new(img.mode, m.size, fill), at, m)
    return img


def lay(size, lines, box, span):
    """A `size` px icon: the disc, then the mark on top of it."""
    img = Image.new("RGB", (size * SS, size * SS), BG)
    ImageDraw.Draw(img).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=DISC)
    return place(img.resize((size, size), Image.BOX), lines, box, span)


def lay_foreground(size, lines, box, span):
    """A `size` px adaptive foreground: the mark alone, over transparency."""
    return place(Image.new("RGBA", (size, size), (0, 0, 0, 0)), lines, box, span)


def reach(path):
    """How far the mark's ink gets from the centre, as a fraction of the width.

    The maskable safe zone is the central 80% of the icon, and it is the ink
    that has to stay inside it — not the ink's bounding box, whose corners this
    glyph never reaches. Measured off the emitted PNG so it cannot drift from
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


def main():
    out = os.path.dirname(os.path.abspath(__file__))
    lines = [seg for d in PATHS for seg in flatten(d)]
    box = glyph_box(lines)

    def written(path):
        print(f"{os.path.relpath(path, out):52}{os.path.getsize(path):>8} bytes")

    def emit(path, size):
        lay(size, lines, box, SPAN).save(path, "PNG", optimize=True)
        written(path)

    def emit_foreground(path, size):
        lay_foreground(size, lines, box, SPAN * ADAPTIVE_VIEWPORT).save(
            path, "PNG", optimize=True
        )
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
