#!/usr/bin/env python3
"""Render the app's logo to PNG launcher icons.

Source is icon-source.png — the clock glyph stacked over the 근무기록 / LOGGER
wordmark, on a transparent field. It is a lossy raster, so nothing is copied
from it directly. Instead its ink is separated into two antialiased coverage
masks, red and dark, which are then re-laid in the app's own token colours
(--color-accent and --color-text). That drops the compression noise, keeps the
brand colours exact at every size, and makes the ink weight adjustable.

Two marks come out of it:

  full     the whole logo. Used only where the icon is shown large: the 512px
           store/splash icon.
  compact  the clock dropped and the wordmark scaled up to fill the disc. Used
           everywhere the icon actually renders small — the Android launcher
           bitmaps, the maskable home-screen icon, the apple-touch icon, the
           favicon. At those sizes the clock eats two fifths of the height and
           leaves the lettering too fine to read, so it goes and the wordmark
           takes the space.

Both are full-bleed: the disc touches all four edges and only the corners fall
back to the field colour, so a circle mask crops exactly to the disc, and the
laid-out mark stays inside the central 80% safe zone maskable icons require.

Android's adaptive icons are the exception to that: there the disc and the mark
have to be separate layers for the launcher to mask and animate them, so the
compact mark is also emitted alone on transparency — see ADAPTIVE_VIEWPORT.

At 128px and below the ink is also thickened — see INK_GAIN.
"""
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# app tokens, from ds-tokens.css
BG = (0xF3, 0xF2, 0xF2)       # --color-bg, the icon's corners
INK = (0x20, 0x1E, 0x1D)      # --color-text, the 근무기록 lettering
ACCENT = (0xEC, 0x30, 0x13)   # --color-accent, LOGGER and the clock
DISC = (0xFD, 0xFD, 0xFD)     # the logo's disc, flattened from its faint sheen

SRC = "icon-source.png"

# Where the source's own ink sits, used to normalise coverage: solid ink reads
# ~24 on its darkest channel. The disc it sits on is measured per source rather
# than assumed — re-exports of the logo flatten it anywhere from 248 to 255, and
# a level set even a few counts high leaves the whole disc reading as faint ink,
# which lands as a grey box around the mark wherever it is pasted.
SRC_INK = 24

# Fraction of the disc's width each mark spans. The maskable safe zone is the
# central 80% measured corner to corner, and the wordmark is wide and short, so
# 0.72 of the width lands its own corners at 0.78 — just inside. The full logo
# is taller and is never masked, so it only needs to clear the disc rim.
COMPACT_SPAN = 0.72
FULL_SPAN = 0.62

# Coverage exponent for small renders. Below 1 it pushes partly covered pixels
# toward solid, which thickens every stroke by a fraction of a pixel without
# spreading it far enough to close the counters in 록 or 기. Straight
# downsampling leaves those 1px strokes grey and mushy at 48px.
INK_GAIN = 0.70
BOLD_AT_OR_BELOW = 128

# Android 8+ adaptive icons split the icon in two layers on a 108dp canvas. The
# launcher masks away everything outside the central 72dp and animates the two
# layers against each other inside it, so only the inner 66dp circle is certain
# to survive every mask on every device.
#
# The disc becomes the background layer — a flat colour, since the mask decides
# its shape — and the compact mark becomes the foreground, laid over
# transparency. It spans COMPACT_SPAN of the 72dp viewport rather than of the
# whole bitmap, which is what keeps it the size it already is on the home
# screen; over the full canvas that is 0.48, putting the mark's own corners at a
# 58dp diagonal, well inside the 66dp circle.
ADAPTIVE_VIEWPORT = 72 / 108


def disc_level(darkest, alpha):
    """The value the source's disc sits at, i.e. the one it most often carries.

    Only the light end is a candidate: the ink and its edges are far darker, and
    on a disc carrying a sheen this picks its darkest common shade, so the whole
    sheen falls at or below zero coverage instead of washing in as ink.
    """
    hist = darkest.histogram(alpha.point(lambda v: 255 if v > 250 else 0))
    return max(range(200, 256), key=lambda v: hist[v])


def ink_coverage(src):
    """(red, dark) coverage masks over the whole source, antialiasing intact."""
    r, g, b = src.convert("RGB").split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    disc = disc_level(darkest, src.getchannel("A"))
    span = disc - SRC_INK
    cov = darkest.point(lambda v: max(0, min(255, round((disc - v) * 255 / span))))
    # The disc's own cut-out edge shades toward grey and would otherwise read as
    # a ring of ink, so the alpha is eroded a couple of px before it gates.
    core = src.getchannel("A").filter(ImageFilter.MinFilter(5))
    cov = ImageChops.multiply(cov, core)

    # Red ink has its green channel far below its red one; the dark lettering is
    # near-neutral. The split only has to be right in the glyph interiors — the
    # edge softness all lives in `cov`.
    is_red = ImageChops.subtract(r, g).point(lambda v: 255 if v > 60 else 0)
    red = ImageChops.multiply(cov, is_red)
    return red, ImageChops.subtract(cov, red)


def row_bands(mask):
    """Runs of consecutive rows carrying ink, top to bottom."""
    profile = list(mask.resize((1, mask.height), Image.BOX).getdata())
    bands, start = [], None
    for y, v in enumerate(profile + [0]):
        if v and start is None:
            start = y
        elif not v and start is not None:
            bands.append((start, y - 1))
            start = None
    return bands


def place(img, layers, box, span, gain):
    """Centre `layers` [(mask, colour)] on `img`, across `span` of its width.

    Everything is composed at the final size — the ink gain has to be the last
    thing that touches the mask, or a downsample afterwards just thins it again.
    """
    size = img.width
    w = round(size * span)
    h = max(1, round((box[3] - box[1]) * w / (box[2] - box[0])))
    at = ((size - w) // 2, (size - h) // 2)
    for mask, colour in layers:
        m = mask.crop(box).resize((w, h), Image.LANCZOS)
        if gain != 1:
            m = m.point(lambda v: max(0, min(255, round(255 * (v / 255) ** gain))))
        # on a transparent foreground the mask carries the alpha too, so the ink
        # itself goes down solid and `m` decides how much of it lands
        fill = colour + (255,) if img.mode == "RGBA" else colour
        img.paste(Image.new(img.mode, (w, h), fill), at, m)
    return img


def lay(size, layers, box, span, gain, ss=4):
    """A `size` px icon: the disc, then the mark on top of it.

    Only the disc is supersampled, since ImageDraw's ellipse has no antialiasing.
    """
    img = Image.new("RGB", (size * ss, size * ss), BG)
    ImageDraw.Draw(img).ellipse([0, 0, size * ss - 1, size * ss - 1], fill=DISC)
    return place(img.resize((size, size), Image.LANCZOS), layers, box, span, gain)


def lay_foreground(size, layers, box, span, gain):
    """A `size` px adaptive foreground: the mark alone, over transparency."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return place(img, layers, box, span, gain)


def load_source():
    """(layers, full_box, compact_box) from icon-source.png."""
    here = os.path.dirname(os.path.abspath(__file__))
    src = Image.open(os.path.join(here, SRC)).convert("RGBA")

    red, dark = ink_coverage(src)
    layers = [(red, ACCENT), (dark, INK)]

    # Geometry comes off the solid ink only — faint coverage is JPEG haze and
    # would drag every bounding box out to the disc.
    solid = ImageChops.lighter(red, dark).point(lambda v: 255 if v > 128 else 0)
    full_box = solid.getbbox()

    # The topmost ink band is the clock; everything under it is the wordmark.
    bands = row_bands(solid)
    if len(bands) < 2:
        raise SystemExit(f"{SRC}: expected a clock band above the wordmark")
    top, bottom = bands[1][0], bands[-1][1]
    strip = solid.crop((0, top, solid.width, bottom + 1)).getbbox()
    compact_box = (strip[0], top, strip[2], bottom + 1)
    return layers, full_box, compact_box


def main():
    out = os.path.dirname(os.path.abspath(__file__))
    layers, full_box, compact_box = load_source()

    def written(path):
        print(f"{os.path.relpath(path, out):52}{os.path.getsize(path):>8} bytes")

    def emit(path, size, compact=True):
        box, span = (compact_box, COMPACT_SPAN) if compact else (full_box, FULL_SPAN)
        gain = INK_GAIN if size <= BOLD_AT_OR_BELOW else 1
        lay(size, layers, box, span, gain).save(path, "PNG", optimize=True)
        written(path)

    def emit_foreground(path, size):
        # the mark lands at ADAPTIVE_VIEWPORT of the canvas, so it is that, not
        # the canvas, that decides whether the strokes need thickening
        gain = INK_GAIN if size * ADAPTIVE_VIEWPORT <= BOLD_AT_OR_BELOW else 1
        span = COMPACT_SPAN * ADAPTIVE_VIEWPORT
        lay_foreground(size, layers, compact_box, span, gain).save(
            path, "PNG", optimize=True
        )
        written(path)

    for name, size, compact in [
        ("icon-192.png", 192, True),
        ("icon-512.png", 512, False),
        ("icon-180.png", 180, True),
        ("icon-maskable-512.png", 512, True),
    ]:
        emit(os.path.join(out, name), size, compact)

    # Android launcher bitmaps, one per density bucket: the 48dp legacy icon
    # that API 24-25 and the Play Store still use, and the 108dp adaptive
    # foreground that everything from API 26 on picks up instead (paired with a
    # flat background by mipmap-anydpi-v26/ic_launcher.xml). Every bucket renders
    # at the same physical size on the home screen, so all use compact.
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


if __name__ == "__main__":
    main()
