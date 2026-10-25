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

One tap, no fingerprint, no press-and-hold.

```
      출근            퇴근          ← 17px, Archivo 800, green / red
     ┌────┐          ┌────┐
     │ ▶  │          │ ■  │         ← 64px tile, 17px corners, 35px glyph
     └────┘          └────┘
     START           STOP          ← 11px, 0.12em tracking, green / red
     05:29          3h 42m         ← 20px
                    ● 근무중
```

- **출근 / 퇴근 above, START / STOP below.** The Korean word is the one on the
  paper the company hands the worker; START / STOP is the same in every
  language.
- **Two-thirds of the old pad**: tile 96 → 64px, glyph 52 → 35px, stamp 26 →
  17px, time 30 → 20px, padding to match. START / STOP is 11px rather than a
  strict 9px, which is too small to read on a factory floor. Measured: the
  card went 242 → 168px off shift, 264 → 190px on shift.
- The tile is still well above the 44px tap-target floor, and it is the only
  thing that punches — the rest of the card is just a card.
- The 근무중 lamp keeps its size: the shape layer catches it by its exact
  width and height (`ds-tokens.css` rule 8).

## Do / don't

- **Do** change every copy of the clock at once — three wordmarks plus the
  launcher icon. A test reads them.
- **Don't** put the mark on a dark ground, restyle it, or add a second green.
- **Don't** bring back a hold or a confirmation step to stop pocket taps.
  Part of that is already caught after the fact — a repeat within 1.5 s is the
  same tap, and a second tap within 30 minutes offers to cancel the clock-in.
  A stray START noticed only at the next tap is not caught yet; the guard for
  it belongs at clock-out (CHANGELOG, eighty-sixth entry).

## References

The two screenshots the user supplied (a clock-and-folder app icon on a dark
tile, and the START / STOP mockup) were temporary captures and were not kept.
The first set the concept and composition only; the mark was drawn fresh, not
traced. `preview.html` and `mockup-punch.png` are the approved previews.
