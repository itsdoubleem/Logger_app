# 근무기록 LOGGER — design system

The app's look is already in code: colours, type and the card layer live in
`ds-tokens.css`, and `CLAUDE.md` §"Design system" explains how that layer works.
This file records the **mark** and the **punch pad**. The pad changed on
2026-10-26, when the fingerprint punch was dropped for a plain START / STOP tap,
and again on 2026-11-09, when it took the shape the worker drew.

## Palette

Three colours of the pad's own — `--color-mark-100` for the 출근 pill and the two
punch-button fills — the rest are the app's:

| Role | Value | Where |
|---|---|---|
| mark | `oklch(0.52 0.14 149)` ≈ `#127E38` | logo, wordmark O, 출근, the 근무중 lamp |
| START button | `#60b973` (`--color-punch-start`) | the round button before a shift |
| STOP button | `#e9806f` (`--color-punch-stop`) | the round button during a shift |
| accent | `#ec3013` (`--color-accent`), ink `--color-accent-700` | the 퇴근 pill (accent-700 on accent-100) |
| ground | `#f3f2f2` (`--color-bg`) | the launcher icon's corners |
| mark tint | `#ebf5ee` (`--color-mark-100`) | the 출근 pill |
| card | `#ffffff` | the launcher icon's disc |

The mark green on white is 5.2 : 1 and on the app grey 4.6 : 1 (WCAG AA for
text). On a dark ground it falls to 3.0 : 1 — the mark is never placed on dark.

The two button fills are a pair: the salmon is the worker's pick, and the green
has its exact OKLCH lightness and chroma (L 0.71, C 0.13) at the mark's hue
(149), so neither shouts over the other and START still reads as the app's
green. Both carry dark text (`--color-text`): 6.9 : 1 on the green, 6.2 : 1 on
the salmon.

## The mark — clock and folder

`logo/logo-mark.svg` is the master: a clock (the hours the app counts) with a
folder (the record it keeps) at its lower right, green on a transparent ground.
Redrawn on 2026-10-27 from the worker's own picture, measured rather than traced
(CHANGELOG, eighty-ninth entry). PNGs: 1024, 512, 192, 180, 48.

- **The clock:** a heavy ring (4.3 in a 100-unit box) that opens where the folder
  sits, a short swept arc outside it at the upper left, four square ticks, a hub
  and three hands — tapered hour and minute hands and a thin second hand. The
  ring and the arc are filled sectors with square-cut ends, not round-capped
  strokes.
- **The folder:** a back sheet with a tab and a front sheet over it, with one
  bar across the front — round-capped strokes at 4. The back sheet's sides run
  straight down into the front sheet's.
- **Launcher icon:** a home-screen icon cannot be transparent (iOS fills it
  black, Android masks it over a background layer), so the launcher icon is
  this mark on the same white disc the fingerprint used to sit on.
  `pwa/make_icons.py` draws it; its ink stays inside the maskable 80% circle.
- **The Android home-screen tile draws the mark large, nudged up and left**
  (`ADAPTIVE_SPAN` 0.78 of the 72dp tile, `ADAPTIVE_OFFSET` 0.045, since
  2026-11-09, the ninety-second entry). The worker's themed One UI launcher
  crops the tile to a shape measured off a home-screen capture as a k = 2.5
  superellipse — much rounder than the rounded square once assumed — and at
  0.82, centred, the folder's corner reached 1.04 of it and was cut. The mark
  is centred by its ink box but its weight is not (a thin arc tip top-left, a
  full folder corner bottom-right), so it is pushed toward the arc and drawn
  5% smaller: both corners sit at about 0.93 against a 0.95 limit, at every
  density (worst 0.939, mdpi). On a launcher that crops to a circle the
  folder is no longer clipped (0.99); at mdpi the arc's tip just touches the
  edge (1.005).

## The wordmark — the clock as the O

`근무기록 L◷GGER`: the O is the mark's clock **without the folder**, which turns
to a smudge at 14–16px. Same arc, ticks, hands and hub — the same paths as the
icon. Two differences, both for wordmark size: the ring is **closed** (opened
where the folder would be, it reads as C or G), and the second hand is **2.4**
instead of 1.85, which at 16px is a half-pixel line. The outer arc reaches out
of the O's box into the empty space above the L (`overflow: visible`). File:
`logo/clock-mark.svg`; three copies in the source (welcome, header, setup
flow), all the same drawing.

## The punch pad

One tap, no fingerprint, no press-and-hold. Since the ninety-third entry
(2026-11-09) the card is the worker's own drawing: a round button on the left,
the pill and a lamp on one line beside it, and the clock under them.

```
  ╭──────╮   ( 출근 )  ○ 근무 외            ← pill 14px 800 · lamp 13px 800
  │START │                                   (ring: grey, unlit, still)
  ╰──────╯   02:59                       ← clock, clamp(32px, 11vw, 48px)
  78–92px circle, #60b973, dark text 17–20px 600

  ╭──────╮   ( 퇴근 )  ● 근무중              (on shift: salmon #e9806f,
  │ STOP │                                   red pill, green lamp breathing)
  ╰──────╯   3h 42m
```

- **The button** is a circle, `clamp(78px, 24vw, 92px)` across — 92px at
  384, 78px at 320 (made smaller at the worker's request; it was 104 / 88) — filled with `--color-punch-start` before a shift and
  `--color-punch-stop` during one, with START / STOP in dark ink and no icon.
  The label scales 17–20px with it. Shaped and
  pressed (a step darker, slightly sunk) by `ds-tokens.css` rule 5, which
  catches it by that width string plus `touch-action: manipulation`.
  **Only the circle punches**: it covers neither the pill nor the clock (the
  sixty-third entry), and the page still scrolls over it.
- **The lamp beside the pill has two states.** On shift: the green dot whose
  halo breathes (rule 8), with 근무중 / ON SHIFT. Off shift: its opposite — an
  empty grey ring that does not move (rule 8c, 8px so rule 8 cannot catch it),
  with 근무 외 / OFF SHIFT in `--color-neutral-600` (4.7 : 1). It replaced the
  filler line in the worker's drawing ("TAP START TO START SHIFT"): what was
  missing there was not a sentence but the ON SHIFT lamp's pair.
- **The pill.** 출근 on `--color-mark-100` in the mark green — 4.63 : 1. 퇴근
  on `--color-accent-100` in `--color-accent-700` — 5.42 : 1. Shaped by rule 5b.
  The pill line starts at the column's left edge; the clock is centred in the
  column under it (the worker's choice, after the English `○ OFF SHIFT` line
  ran wider than the clock and left it looking pushed to the left). The long
  Indonesian lamp label drops to its own line under the pill at 320 and 360px.
- **The clock** is the hero of the right column. Every form with a day count
  (`1d 13h 59m`, only when a shift was left open) uses the smaller
  `clamp(22px, 7vw, 34px)`. Measured at 320 / 360 / 384px in eight languages:
  nothing overflows and the page never scrolls sideways.
- **Centred as a group, and still under the finger.** The button and the text
  column stand together in the middle of the card (`justify-content: center`;
  the column does not grow). Centring made the group's width depend on the
  state, so at first the button slid 13–15px sideways the moment START was
  tapped. Two things held it: the clock has `min-width: 3.46em` (the measured
  width of `3h 42m`, so `03:14` takes the same room), and both lamps sit in one
  grid cell with the inactive one `visibility: hidden`, so the cell is always
  as wide as the longer label. Measured at 320 / 360 / 384px in four
  languages: centred to 1px, and the button moves 0px at the tap. Past ten
  hours the clock widens once and the button shifts about 12px, mid-shift.
- Card height 116px at 320 and 130px at 384 (Indonesian 134px), against 188px
  for the bar design.
- `preview-punch-circle.html` is the approved preview (option 1, the matched
  green). `mockup-punch.png` is the bar design it replaced, and
  `mockup-punch-tile.png` the centred tile before that — kept for the record.

## Do / don't

- **Do** change every copy of the clock at once — three wordmarks plus the
  launcher icon. A test reads them.
- **Don't** put the mark on a dark ground, restyle it, or add a second green.
- **Don't** bring back a hold or a confirmation step to stop pocket taps.
  Part of that is already caught after the fact — a repeat within 1.5 s is the
  same tap, and a second tap within 30 minutes offers to cancel the clock-in.
  A stray START noticed only at the next tap is asked about at clock-out: a
  shift over 14 h, or a clock-in more than 6 h from the shift start, opens a
  card directly under the pad (CHANGELOG, eighty-sixth entry).

## References

The two screenshots the user supplied (a clock-and-folder app icon on a dark
tile, and the START / STOP mockup) were temporary captures and were not kept.
Nor was the worker's drawing of the round-button card (2026-11-09): a salmon
circle with START in dark text on the left, a 출근 pill and a red filler label
("TAP START TO START SHIFT") above a large clock on the right. It set the
layout, the button and the salmon; the green and the OFF SHIFT ring were
derived from it.
The first set the concept and composition only; the mark was drawn fresh, not
traced. `preview-punch-circle.html` is the approved punch pad (the round button, option 1). `mockup-punch.png` is the wide-bar design it replaced; `preview.html` and `mockup-punch-tile.png` show the centred tile before that.
