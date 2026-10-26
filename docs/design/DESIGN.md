# 근무기록 LOGGER — design system

The app's look is already in code: colours, type and the card layer live in
`ds-tokens.css`, and `CLAUDE.md` §"Design system" explains how that layer works.
This file records the **mark** and the **punch pad**, which changed on
2026-10-26 when the fingerprint punch was dropped for a plain START / STOP tap.

## Palette

One new colour, `--color-mark-100` (the mark green's tint, for the 출근 pill); the rest are the app's own:

| Role | Value | Where |
|---|---|---|
| mark / START | `oklch(0.52 0.14 149)` ≈ `#127E38` | logo, wordmark O, ▶, 출근, START, the 근무중 lamp |
| STOP | `#ec3013` (`--color-accent`) | ■, 퇴근, STOP |
| ground | `#f3f2f2` (`--color-bg`) | the punch bar, the launcher icon's corners |
| mark tint | `#ebf5ee` (`--color-mark-100`) | the 출근 pill |
| card | `#ffffff` | the launcher icon's disc |

The mark green on white is 5.2 : 1 and on the app grey 4.6 : 1 (WCAG AA for
text). On a dark ground it falls to 3.0 : 1 — the mark is never placed on dark.

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
- **The Android home-screen tile draws the mark at its largest**
  (`ADAPTIVE_SPAN` 0.82 of the 72dp tile, since 2026-10-27). One UI crops the
  tile to a rounded square, and the ink stays inside one at 0.93 against a
  0.95 limit. At 0.66, sized for the strict 66dp circle, it still read small
  beside Claude and EPS. On a launcher that crops to a circle the outer arc's
  tip and the folder's corner are clipped — the price of the size, chosen by
  the worker.

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

One tap, no fingerprint, no press-and-hold. Since the eighty-seventh entry
(2026-10-26) everything stands on one centre line:

```
                 ( 출근 )                ← pill, 14px Archivo 800
                  06:53                 ← clock, clamp(32px, 11.5vw, 44px)
     ┌────────────────────────────┐
     │          ▶  START          │     ← 60px bar, 18px corners
     └────────────────────────────┘       26px glyph · START/STOP 15px

           ( 퇴근 ) ● 근무중               (on shift: red pill · ■ STOP)
                 3h 42m
```

- **The pill.** 출근 on `--color-mark-100` (`#ebf5ee`, the mark green's own
  tint) in the mark green — 4.63 : 1. 퇴근 on `--color-accent-100` in
  `--color-accent-700` — 5.42 : 1 (the plain accent would be 3.18 : 1). Shaped
  by `ds-tokens.css` rule 5b (`padding: 6px 14px` + `white-space: nowrap`).
  The 근무중 lamp sits beside it and drops to its own line on narrow phones.
- **The clock is the hero**, centred and large. It scales with the screen so
  the longest form, `1d 13h 59m`, fits a 320px phone (37px there, 44px at 384).
- **The bar** is unchanged: card width inside **48px side margins** (272px at
  384px — the worker narrowed it from 18 through 32 and 40), shaped by rule 5
  (`height: 60px` + `touch-action: manipulation`), darkening while pressed.
  Only the bar punches; it covers neither the pill nor the clock.
- Card height 188px. The worker chose this from three rendered proposals for
  the top line (`proposals-punch-head.png`: centred clock, label over number,
  pill and clock on one line), after choosing the wide bar from
  `proposals-punch.png`.
- The 근무중 lamp keeps its size: the shape layer catches it by its exact
  width and height (`ds-tokens.css` rule 8).
- `mockup-punch-tile.png` is the earlier centred-tile design, kept for the
  record.

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
The first set the concept and composition only; the mark was drawn fresh, not
traced. `mockup-punch.png` is the approved punch pad (centred pill and clock over the wide bar); `preview.html` and `mockup-punch-tile.png` show the earlier centred tile.
