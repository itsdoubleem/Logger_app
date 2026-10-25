# 근무기록 LOGGER — design system

The app's look is already in code: colours, type and the card layer live in
`ds-tokens.css`, and `CLAUDE.md` §"Design system" explains how that layer works.
This file records the **mark** and the **punch pad**, which changed on
2026-10-26 when the fingerprint punch was dropped for a plain START / STOP tap.

## Palette

No new colours. The two the mark and the pad use are already the app's own:

| Role | Value | Where |
|---|---|---|
| mark / START | `oklch(0.52 0.14 149)` ≈ `#127E38` | logo, wordmark O, ▶, 출근, START, the 근무중 lamp |
| STOP | `#ec3013` (`--color-accent`) | ■, 퇴근, STOP |
| ground | `#f3f2f2` (`--color-bg`) | the pad tile, the launcher icon's corners |
| card | `#ffffff` | the launcher icon's disc |

The mark green on white is 5.2 : 1 and on the app grey 4.6 : 1 (WCAG AA for
text). On a dark ground it falls to 3.0 : 1 — the mark is never placed on dark.

## The mark — clock and folder

`logo/logo-mark.svg` is the master: a clock (the hours the app counts) with a
folder (the record it keeps) overlapping its lower right, green outline on a
transparent ground. The clock ring is cut by a mask where the folder crosses
it, so there is a real gap, not a painted patch. PNGs: 1024, 512, 192, 180, 48.

- **Line weight 3.6** in a 100-unit box, round caps and joins.
- **Launcher icon:** a home-screen icon cannot be transparent (iOS fills it
  black, Android masks it over a background layer), so the launcher icon is
  this mark on the same white disc the fingerprint used to sit on.
  `pwa/make_icons.py` draws it; its ink stays inside the maskable 80% circle.

## The wordmark — the clock as the O

`근무기록 L◷GGER`: the O is the mark's clock **without the folder**, which turns
to a smudge at 14–16px. Same ring, four ticks, 10:10 hands — drawn at line
weight **4.6** instead of 3.6 so it holds up beside Archivo 800. File:
`logo/clock-mark.svg`; three copies in the source (welcome, header, setup
flow), all the same drawing.

## The punch pad

One tap, no fingerprint, no press-and-hold. A full-width bar since the
eighty-seventh entry (2026-10-26):

```
 출근                       06:24      ← 출근/퇴근 17px · time 24px, Archivo 800
┌──────────────────────────────────┐
│            ▶  START              │   ← 60px bar, card width, 18px corners
└──────────────────────────────────┘     26px glyph · START/STOP 15px, 0.14em

 퇴근  ● 근무중              3h 42m      (on shift: red 퇴근 · ■ STOP)
```

- **The Korean word leads, top left.** 출근 / 퇴근 is the word on the paper the
  company hands the worker; START / STOP inside the bar is the same in every
  language. On shift, the 근무중 lamp sits beside 퇴근.
- **The time is top right**, so the card has no empty sides. The worker chose
  this from three rendered proposals (`proposals-punch.png`: side by side,
  wide button, merged into the date card). Measured: the card is 132px, down
  from 168px with the centred tile and 242px with the fingerprint.
- **Only the bar punches.** It covers neither the words nor the time, and the
  screen still scrolls over it (`touch-action: manipulation`).
- **Shape lives in `ds-tokens.css` rule 5**, caught by `height: 60px` +
  `touch-action: manipulation`: 18px corners, the ground grey, an inset ring
  and the card shadow, plus a pressed state (`:active` darkens the plate, not the ink). The bar
  has no `min-height` and no border, so rules 2 and 2c leave it alone.
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
traced. `mockup-punch.png` is the approved punch pad (the wide bar); `preview.html` and `mockup-punch-tile.png` show the earlier centred tile.
