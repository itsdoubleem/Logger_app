# 근무기록 LOGGER — design system

The app's look is already in code: colours, type and the card layer live in
`ds-tokens.css`, and `CLAUDE.md` §"Design system" explains how that layer works.
This file records the **mark** and the **punch pad**. The pad changed on
2026-10-26, when the fingerprint punch was dropped for a plain START / STOP tap,
and again on 2026-11-09, when it took the shape the worker drew.

## Palette

Three colours of the pad's own — `--color-mark-100` for the 출근 pill and the two
punch-clock inks — the rest are the app's:

| Role | Value | Where |
|---|---|---|
| mark | `oklch(0.52 0.14 149)` ≈ `#127E38` | logo, wordmark O, 출근, the 근무중 lamp |
| START clock | `#3c9d55` (`--color-punch-start`) | the clock button's ring and word before a shift |
| STOP clock | `#e9806f` (`--color-punch-stop`) | the clock button's ring and word during a shift |
| accent | `#ec3013` (`--color-accent`), ink `--color-accent-700` | the 퇴근 pill (accent-700 on accent-100) |
| ground | `#f3f2f2` (`--color-bg`) | the launcher icon's corners |
| mark tint | `#ebf5ee` (`--color-mark-100`) | the 출근 pill |
| card | `#ffffff` | the launcher icon's disc |

The mark green on white is 5.2 : 1 and on the app grey 4.6 : 1 (WCAG AA for
text). On a dark ground it falls to 3.0 : 1, so the mark itself is never placed
on dark. In dark mode the app's green *ink* (`--color-mark`) lifts to `#6fcf8a`
at the same hue instead — see "Dark mode" below. The launcher icon always keeps
its own white disc.

The two punch colours are inks, not fills, since the button became the logo's
clock (F14, ninety-sixth entry): each draws the ring and the word, on no fill.
The salmon is the worker's pick and kept its old value; the green is
`oklch(0.62 0.14 149)` — the colour the small wordmark clock *looks* on screen,
between the mark (L 0.52) and the old fill (#60b973, L 0.71). On the white card
they are 3.4 : 1 and 2.7 : 1, accepted by the worker; see "The punch pad".

## Dark mode — graphite

Chosen 2026-11-09 from three options drawn side by side in
`preview-dark.html` (inverted, OLED night shift, graphite). Graphite is a
mid-dark warm grey rather than black, so cards keep a real shadow and every
screen reads exactly as it does in light. Same Archivo, same red and green,
same corners and pills — only token values change (CHANGELOG, ninety-fourth
entry).

| Role | Light | Dark | Dark contrast on card |
|---|---|---|---|
| ground `--color-bg` | `#f3f2f2` | `#2b2a29` | — |
| card `--color-card` | `#ffffff` | `#363433` | — |
| text `--color-text` | `#201e1d` | `#f6f5f4` | 11.4 : 1 |
| secondary `--color-neutral-600` | `#747372` | `#a9a6a4` | 5.1 : 1 |
| body on tint `--color-neutral-700` | `#555352` | `#d2cfcd` | 8.0 : 1 |
| hairline `--color-neutral-300` | `#e0dddd` | `#524f4d` | — |
| accent `--color-accent` | `#ec3013` | `#ff7059` | 4.6 : 1 |
| accent ink on tint `--color-accent-700` on `-100` | `#ae1800` on `#f2dbd7` | `#ff9a86` on `#4a2a24` | 6.2 : 1 |
| mark ink `--color-mark` | `oklch(0.52 0.14 149)` | `#6fcf8a` | 6.5 : 1 |
| mark tint `--color-mark-100` | `#ebf5ee` | `#2a4232` | 5.7 : 1 under the ink |
| absence `--color-absent` (결근 bar, 결 badge) | `oklch(0.45 0.02 0)` | `#8f8c8a` | 3.7 : 1 (badge ink 5.0) |
| drum band `--color-raised` | `#ffffff` | `#4a4847` | one step above the well |
| START / STOP clock | `#3c9d55` / `#e9806f` | `#6fcf8a` / unchanged | 6.5 / 4.6 on the card |

- **Who decides.** 설정 › 화면: 자동 (default, follows the phone) / 라이트 /
  다크. The app puts the result on `<html data-theme>`; the dark tokens hang
  on that attribute only, never on a media query, so there is one copy of
  every rule.
- **Fixed fills keep fixed ink.** The yellow 주간 chip and the orange and grey
  day badges do not change colour with the theme, so the letters on them use
  `--color-on-fill` (`#201e1d`) or `--color-on-dark-fill` (`#f3f2f2`), never
  `--color-text` / `--color-bg`, which swap. (START / STOP were fills until F14;
  now they are inks — the green lifts in dark like the mark, the salmon stays.)
- **Black things turn light.** Anything drawn as `background: var(--color-text)`
  with `color: var(--color-bg)` — the period chip, the night badge, a picked
  option — inverts as a pair and becomes a light chip with dark ink. Pressed,
  it darkens (`brightness(.86)`) instead of lifting.
- **Shadows** are tokens (`--shadow-card`, `--shadow-bar`, `--shadow-knob`,
  `--shadow-tabbar`, `--shadow-well`, `--shadow-band`) and deepen to black
  alphas in dark; a warm-ink shadow is invisible on a dark ground.
- **Documents stay on white.** The 근무내역서 and the payslip comparison use
  their own fixed stylesheet. They are evidence, not a screen preference.

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
  78–92px clock ring in #3c9d55, START inside, 800 14–16.5px

  ╭──────╮   ( 퇴근 )  ● 근무중              (on shift: salmon #e9806f,
  │ STOP │                                   red pill, green lamp breathing)
  ╰──────╯   3h 42m
```
(The boxes stand for the round clock — `mockup-punch-clock.png` shows it.)

- **The button is the logo's clock** (F14, built 2026-11-11, ninety-sixth entry).
  The worker asked for the plain filled circle to be replaced by the clock from
  the mark (`mockup-punch-clock.png`, light / dark at 384px and Korean at 320px).
  - **Drawing:** `logo/punch-clock.svg` — the clock of `clock-mark.svg` with the
    hands, hub and second hand removed and **only the 12 and 6 o'clock ticks
    kept**. With all four, START touched the 3 and 9 ticks (under 1.5px clear);
    shrinking the word to clear them was tried and the worker chose two ticks.
    The ring is closed, as in the wordmark O; the arc reaches past the button at
    the upper left (`overflow: visible`). This is a deliberate variant, not a
    sixth copy of the mark to keep in sync.
  - **Line: 2.5 units, 3.75px at 92px** — thinner than the logo's 4.3 (6.5px at
    this size), which read heavy on a button: the ring now weighs about what the
    bold START letters do. The ring's outer edge, the arc's angles and its gap to
    the ring are the logo's; the arc is a stroked path of the same weight, and the
    ticks are 2.6 units (3.9px). Four weights were rendered (6.5 / 5 / 3.75 /
    2.85px) and the worker picked 3.75 (B); a thinner line also reads lighter,
    which is part of why the colour question went away.
  - **Size:** the ring's outer edge *is* the old circle — the same
    `clamp(78px, 24vw, 92px)` box, so rule 5's selector, the layout and the tap
    area (the whole circle, empty middle included) stay as they are. The drawing
    and the word carry `pointer-events: none`: the round corner shapes only the
    button itself, so without it the square's corners punched too (review S1).
  - **Ink, no fill.** START ring and word in **`--color-punch-start` #3c9d55** —
    the green the wordmark's clock *looks*. Same token value as the mark was tried
    and read darker: the button's thick ring is 90% solid colour, while the ~27px
    O is 59% solid and 41% edge pixels blended with white, averaging #3c955b
    (measured on the built page). #3c9d55 is oklch(0.62 0.14 149), between the
    mark (L 0.52) and the old #60b973 (L 0.71); 3.4 : 1 on the white card,
    accepted. In dark mode it lifts to the mark's #6fcf8a (6.5 : 1).
    STOP ring and word in `--color-punch-stop` (#e9806f, the old circle's salmon;
    2.7 : 1 on white, 4.6 : 1 on dark — the worker's pick). How it got here, all
    on 2026-11-11: first drawn in the logo green; the worker asked for the
    circles' current colours (#60b973 / #e9806f) and that shipped (#47); then,
    seeing it on the phone, asked for the START clock to match the LOGGER clock
    (#48, the mark token); then found that too dark and picked B of three steps
    between. The darker 퇴근-pill red (#ae1800) was shown for STOP and declined.
  - **Word:** START / STOP inside the ring, Archivo 800,
    `clamp(14px, 4.3vw, 16.5px)`, `letter-spacing: 0.02em`, centred, HTML laid
    over the SVG (the template runtime drops a `{{ hole }}` inside SVG `<text>`).
    Measured: 16.5px in the 92px ring, 14px in the 78px ring, the same word in
    every language.
  - **Pressed:** `brightness(.9)` barely shows on a line drawing, so rule 5 now
    fills the inside with the state's tint while pressed (`--color-mark-100` for
    START, `--color-accent-100` for STOP, picked by the inline `color:` —
    `var(--color-punch-start)` / `var(--color-punch-stop)`) and keeps
    the `scale(.97)` sink.
  - No new tokens. `--color-punch-start` changed value (#60b973 → #3c9d55) and
    gained a dark value (#6fcf8a); it is a line now, not a fill.
- *Before F14* the button was a filled circle — `--color-punch-start` /
  `--color-punch-stop` behind START / STOP in dark ink, 600, 17–20px, darkened by
  `brightness(.9)` when pressed. The box, the selector and "only the circle
  punches" carried over unchanged:
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
  The pill line and the clock are both centred in the column (the worker's
  choice, after the English `○ OFF SHIFT` line ran wider than the clock and
  left it looking pushed to the left; and again when the shorter Korean and
  Chinese line left the clock looking pushed to the right). Where the pill
  line fills the column, as in English, it starts at the column's left edge. The long
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
- **The undo strip** (F13, ninety-fifth entry). Shortly after START, the
  slot under the card holds a green strip for 9 seconds: `✓ 09:34 · Undo clock-in` with
  `출근 취소` as its small grey second line. It is the "I clocked in earlier today"
  strip's own box — `padding: 9px 18px`, 16px line, 36px, pill corners, whole
  strip is the button, 44px tap area from rule 1d — on `--color-mark-100`
  instead of `--color-accent-100`. That strip only shows off shift, so START
  empties the slot and the green one takes it over without pushing anything at
  the tap (the tiles below rise 45px when it leaves). START lifts the pad 62px
  (the today card shortens), so the strip lands under the finger that just
  pressed START: for its first **0.5 s** it holds its slot but is **invisible**
  (`visibility: hidden` — untappable, nothing moves), then shows for 9 s and
  works on the first tap; it is gone 9.5 s after START, on STOP, or when the
  tab changes. 0.5 s still covers a double tap's second tap (0.2–0.4 s); it was
  1.5 s, the pad's own guard, and the worker asked for it sooner. Showing and
  accepting are one check (`inUndoArmed()`), so a tap the instant it appears
  works (ninety-seventh entry: visible-but-guarded made the worker tap twice).
  START's own 1.5 s double-tap guard is unchanged. Accepted trade-off: a
  re-press of START (or a triple tap) between 0.5 and 1.5 s lands on the
  freshly shown strip and cancels the clock-in; the button visibly turns back
  to START and "I clocked in earlier today" can put the time back. Cancelling moves the card back down, so START (or, before
  the shift is confirmed, 맞습니다 / 고치기) comes back under the finger: for
  1.5 s after the undo those ignore a tap (`tapShielded()`). Accepted on
  purpose — a deliberate tap in that second and a half is rare and costs one
  more tap, while a double tap landing there used to clock the worker back in. There is no confirmation
  *before* the tap (the eighty-sixth entry): the way back comes after it.
- **The undo-clock-out strip** (F15, ninety-eighth entry). The same strip after
  STOP: `✓ 18:02 · Undo clock-out` with `퇴근 취소` as its second line, on
  `--color-accent-100` (the 퇴근 pill's pink, as green is START's), same box, same
  0.5 s hidden + 9 s shown clock (`outUndoArmed()`). It replaces the "I clocked in
  earlier today" strip in that slot and pushes the black undo bar aside, so a STOP
  has one undo, where the finger is. Tapping it removes the record **and puts the
  worker back on shift from the original clock-in**. Only a STOP from the pad (or
  the odd-shift card's confirm) raises it; records added from the six day-type
  cards or the too-soon card keep the black bar under the cards. The six cards
  ignore a tap within 1.5 s of a pad or strip tap, because after the undo one of
  them rises into the strip's place.
  A STOP that counts as a short day opens the 조퇴 사유 sheet over everything, so
  that sheet carries the same undo as a black-outlined 44px button right under
  "your clock-out is already saved": `퇴근 취소 — 아직 근무 중`. The strip's clock
  waits while the sheet is open and starts when it is closed with 나중에.
- `preview-punch-circle.html` is the approved preview (option 1, the matched
  green). `mockup-punch.png` is the bar design it replaced, and
  `mockup-punch-tile.png` the centred tile before that — kept for the record.

## Do / don't

- **Do** change every copy of the clock at once — three wordmarks plus the
  launcher icon. A test reads them.
- **Don't** put the mark on a dark ground, restyle it, or add a second green.
  The dark-mode lift of `--color-mark` is the same green as a token value, not
  a second green: write `var(--color-mark)`, never a literal.
- **Don't** write `var()` in an SVG `fill` or `stroke` attribute — attributes
  do not read custom properties. Draw with `currentColor` and set `color`.
- **Do** ask of every colour pair whether both halves move with the theme. A
  fixed fill under a swapping ink is perfect in light and unreadable in dark.
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
