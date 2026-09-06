# 근무기록 LOGGER — orientation for whoever picks this up next

Read this first. It is the map; the detail lives in the three files it points at.

## What this is

An offline work-log and wage app for **foreign workers in Korea** (built with and for
an EPS E-9 factory worker, generalised to any visa or company). It records clock-in /
clock-out with the phone's fingerprint sensor, decides day-vs-night shift on its own,
applies Korean overtime and night-premium law, and predicts the monthly 급여명세서 so
the worker can hold it up against the paper the company hands them.

**Three things drive every decision in here.**

1. *The output is evidence.* A worker may print the 근무내역서 years later and put it
   in front of a 근로감독관. So money figures must be right or absent, and the record
   must read in **Korean** whatever language the app is set to.
2. *Nothing leaves the phone.* No server, no account, no telemetry, no analytics.
   `localStorage` is the whole database. This is a hard product requirement — workers
   pass this app around between themselves and their pay data is nobody else's.
3. *The app calculates; it does not judge.* It applies the statute to the worker's own
   record and shows the arithmetic. It never says what the worker should do, never
   drafts or files a 진정 for them, and is never sold. That line is what keeps it a
   calculator rather than 노무 상담 under 공인노무사법 제27조 — see the 2026-08-28
   (seventeenth) entry, which is where the disclaimers, the 1350 hand-off and the
   reasoning live.

## Which version is live

**v2 is the shipping version.** v1 still builds and is untouched, but do not develop it.

| | v2 (ship this) | v1 (frozen) |
|---|---|---|
| source | `WorkLogApp.v2.dc.html` | `WorkLogApp.dc.html` |
| build | `python3 build.py v2` → `dist-v2/` | `python3 build.py` → `dist/` |
| APK | `./build_apk.sh v2` → `worklog-debug.apk` | `./build_apk.sh` → `worklog-frozen-debug.apk` |

The two APKs above are debug-signed, for your own phone. The store route is
`./bump_version.sh` then `./build_apk.sh bundle` → `worklog-release.aab`, signed
with the upload key named by `android/keystore.properties` (gitignored; template
at `android/keystore.properties.example`). Without a key it still builds,
unsigned, and says so. **Release builds are not debuggable**, so the CDP trick
below does not work against them — verify on a debug build. R8 is off on purpose;
`DEPLOY.md` §"R8 is off, deliberately" says why and what to check by hand if you
ever turn it on.

Both carry `applicationId app.worklog.punch`, so installing one upgrades the other in
place and the WebView's `localStorage` survives — that is what makes v2's v1→v2 record
migration run on a real phone.

## The four documents

- **`README.md`** — what the app is, the wage engine's rules, the non-negotiables.
  The wage rules section is the specification; it is byte-identical between v1 and v2
  and there is a test that proves it.
- **`V2.md`** — every bug found by actually using v1 on shift, and what changed. Read
  Part 1 before you "fix" anything that looks odd; it is probably deliberate and the
  reasoning is written down.
- **`CHANGELOG.md`** — the same thing for everything since v2 shipped: sixty-eight
  entries, each a bug found on shift and the rule it taught. Grep it before changing
  a screen. It used to be the tail of this file; see the last section.
- **`DEPLOY.md`** — building, hosting, HTTPS, WebAuthn, TWA, the APK.

## How the source is shaped

`WorkLogApp.v2.dc.html` is **one file**, and it is large. Three regions:

1. `<x-dc>…</x-dc>` — the **template**. A small custom runtime (React under the hood)
   with `<sc-if value="{{ x }}">`, `<sc-for list="{{ xs }}" as="x">`, and `{{ … }}`
   holes. Inline `style="…"` strings, `onClick="{{ handler }}"`. There is no CSS file
   and no class names; the design system is inline styles plus `ds-tokens.css` vars.
2. `class Component extends DCLogic` — **all the logic**. Plain framework-agnostic JS.
   This class is the part worth reading. `renderVals()` at the bottom builds every
   value the template interpolates — if a `{{ hole }}` is empty on screen, its key is
   missing from `renderVals()`.
3. `static STR = {…}` — the **generated** 8-language string table. 716 keys, ~262 KB
   on one line. **Never edit it by hand.** Edit `lang/*.json`, then
   `python3 tools/sync_lang.py` (it prints the key count and size, so you can tell at a
   glance whether the source you are looking at is current).

Because of (3), `grep` the source with care: a bare `grep -n "reason"` returns the
whole STR line. Filter it out — `grep -n "reason" WorkLogApp.v2.dc.html | grep -v '"en":'`.

### Number fields — never write `type="number"`

Every number box in the app is:

```html
<input type="text" inputmode="decimal" enterkeyhint="done" onKeyDown="{{ keyFoo }}"
       value="{{ fooVal }}" onFocus="{{ focFoo }}" onBlur="{{ blurFoo }}" onChange="{{ setFoo }}" />
```

That is deliberate and was measured on a real Galaxy. Chrome **overrides
`enterkeyhint` on `type="number"`** with its own form-navigation logic: `Next` if
another field follows, `Go` if it is the last one — and that `Go` is drawn greyed and
dead, because there is no form to submit. A worker who had finished typing had no way
off the keypad except tapping somewhere else on the screen, which is usually another
button. `type="text"` + `inputmode="decimal"` keeps the same numeric keypad and gets a
live **Done**. The full four-way measurement is in the comment above `numField()`.

Two things follow, and both are easy to forget when adding a field:

- **The browser no longer filters the input.** Values must go through
  `Component.numClean()` (drops thousands-separator commas, keeps one decimal point,
  no letters, no minus) and `Component.numReady()` (`''` and `'.'` are not numbers
  yet — committing them gives 0 or NaN). `numField()` does both for you. The only
  hand-rolled call site is `slipRows`, and it cleans explicitly.
- **`onKeyDown` must be wired**, or the Done key is live but does nothing — which
  reads to the worker exactly like the dead one. `numField()`/`timeField()` expose
  `key`; `numFields()` publishes it as `key<Name>`, and row builders pass `key: f.key`.

Easiest safe route: copy an existing row rather than writing a new input from scratch.

### Design system — the shape lives in `ds-tokens.css`, not in the source

Near-mono red `#ec3013` on `#f3f2f2`, Archivo throughout, every tap target ≥ 44px.
Colours, type and copy are final.

**Shape is not flat any more** (2026-08-30, the fortieth entry). White cards on the
grey ground, 16px corners, a soft shadow, pill chips and a pill tab bar. That whole
layer is a **stylesheet at the bottom of `ds-tokens.css`** — the source still has
zero `border-radius` and zero `box-shadow` in its 937 inline styles, which is exactly
what makes the layer possible: those two properties are unclaimed, so a plain rule
wins without `!important`. Read the comments in that file before changing shape;
each `!important` in there says which inline style it is overruling and why.

Two things follow:
- **Add shape in `ds-tokens.css`, not inline.** An inline `border-radius` would be
  the first one in the file and would quietly opt that element out of the layer.
- **`background: transparent` inline means "unselected", not "see through me".**
  The layer turns it back into card white and restores the tinted state on top
  (`#tabScroll > div > div[style*="background: transparent"]`). If you add a row
  that way, check it on a card and not against the old flat ground.

### Wording

House style: **the Korean payslip term leads and the translation follows** —
`잔업 Tăng ca ×1.5`, not `Tăng ca ×1.5`. The worker has to be able to find that word
on the paper in their hand. ASCII digits always, never a script's own numerals.

Adding or changing wording: edit `lang/base.json` (ko + en, the reference), then the
six `lang/<code>.json` files, then `python3 tools/check_lang.py && python3 tools/sync_lang.py`.
`tools/README.md` covers adding a language and adding a 조퇴 사유.

## Working on it

```sh
sh test/run.sh          # everything: regressions, bindings, translations, both builds
python3 build.py v2     # dist-v2/
./build_apk.sh v2       # worklog-debug.apk  (needs Gradle from Android Studio)
```

`sh test/run.sh` is the gate. It runs the wage-engine equivalence proof, 2152
regression assertions (each tied to a real bug), a check that every `{{ hole }}` in the
template resolves, translation validation, a render of all eight languages, both
builds, and `test/boot.js` — the one test that reads the *built page* rather than the
source, so it comes after the builds (see the 2026-08-28 thirtieth entry).

The app has **five tabs**: 출퇴근 PUNCH · 근무기록 LOGS · 급여 PAY · 내 권리 RIGHTS ·
설정 SETUP. 내 권리 is 퇴직금 / 연차 / 휴업수당 — money the law owes that is not in
this month's payslip. First run shows a welcome screen (`showTour`), not a form.

In the 연차 ledger only **발생 ACCRUED** is the law's figure (`annualAccrued()`, §60).
**잔여 LEFT** is the worker's own balance (`annualLeft()`) and **사용 USED** is the
difference. It has to work that way: the app cannot know leave taken before it was
installed, and everyone installs it mid-employment. See the 2026-08-19 (eleventh) entry
before changing any of those three cells.

`test/bind.js` reports `unresolved: 2` at rest — those are the literals `true` and
`false` from `hint-placeholder-val` attributes, not real holes. Anything else in that
list is a genuine missing `renderVals()` key.

**Run it after every change**, and add an assertion for whatever you changed —
`test/regress.js` is written as a narrative of bugs found on real shifts, in Korean,
and new entries should read the same way.

### Checking a change on a real screen

There is no test that looks at pixels. To see the app, serve the build and drive it
with headless Chrome over CDP:

```sh
(cd dist-v2 && python3 -m http.server 8777) &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/cp about:blank &
```

Two things will bite you:

- **`localhost` is a secure context**, so the punch pad becomes a *real* WebAuthn
  fingerprint prompt, not press-and-hold. Add a CDP virtual authenticator
  (`WebAuthn.enable` then `WebAuthn.addVirtualAuthenticator` with
  `automaticPresenceSimulation: true`) or you cannot punch. Clear
  `localStorage['worklog.bio.v1']` between runs or the app tries to verify a
  credential the new authenticator has never seen.
- **Seed state from a separate page that redirects into the app.** Writing
  `localStorage` from inside the running app just gets overwritten by its own `save()`.
- **Focus events do not fire unless the window has focus.** `element.focus()` in
  headless is silent — no `focus`, no `focusin`, and `document.hasFocus()` is false.
  Send `Emulation.setFocusEmulationEnabled {enabled:true}` first. This bit once and
  looked exactly like a broken feature.

Delete any scratch seed pages from `dist-v2/` before building the APK — whatever is in
that folder ships.

**Headless cannot answer paint questions either.** A stale-tile bug — the previous
tab's pixels showing through the new one — reproduces only on the device, and only
under `Emulation.setCPUThrottlingRate` (20× made it 7 runs in 25; unthrottled it took
30+ tries by hand to see once). Judge it by pixels, not by eye: keep one known-good
screenshot and diff the band. See the 2026-08-30 forty-eighth entry.

**Headless cannot answer keyboard questions at all.** The on-screen keyboard is drawn
by the IME, not by the app, and it differs per vendor. Anything about the keypad — which
action key appears, whether it is live, how much of the screen it covers — has to be
looked at on the phone. See the next two sections.

### Installing on the phone

```sh
adb devices                              # must say "device", not "unauthorized"
adb install -r worklog-debug.apk         # -r keeps the worker's records
```

**Never launch it with `adb shell monkey`.** `monkey -p app.worklog.punch -c
android.intent.category.LAUNCHER 1` is the usual one-liner and the trailing `1` is
**one random event** — it launches the app and then taps somewhere. On this app the
biggest thing on the first screen is the punch pad, so that stray tap can **clock the
worker in**. It did exactly that on 2026-08-30 (session at 06:31:35, spotted only
because a screenshot showed the on-shift card and removed by restoring the backup).
Launch it with the intent instead, which injects nothing:

```sh
adb shell am start -n app.worklog.punch/.MainActivity
```

`unauthorized` means the "Allow USB debugging" prompt has not been accepted on the
phone — but a *stale daemon* reports the same thing for an already-trusted phone.
Try `adb kill-server && adb start-server` before going to look for a prompt that
isn't there. `adb` lives at `~/Library/Android/sdk/platform-tools/adb` if it is not
on PATH.

**Never uninstall to "get a clean install."** The records live in the WebView's
localStorage inside the app's data directory; removing the app destroys them. `-r`
upgrades in place. If the signature does not match, Android *refuses* the install
rather than wiping — so a failed `install -r` is safe, and the answer is to build on
the machine that owns `~/.android/debug.keystore`, not to uninstall.

### Seeing what the app on the phone is actually running

The debug build exposes the WebView to CDP, which is the only reliable way to know
whether the phone is running the build you just made:

```sh
adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof app.worklog.punch)
curl -s http://127.0.0.1:9333/json/list
```

Then drive it over the WebSocket exactly as with headless Chrome. `window.__dcRegistry
.WorkLogApp.Logic` is the component class — checking for a method or a `Logic.STR` key
you just added tells you in one line whether the new code is live. Do that before
debugging any "the fix didn't work on the phone" report; the answer is often that the
phone is running the previous build (see the service-worker note below).

`adb shell input tap X Y` uses device pixels. Get them from the element itself rather
than measuring a screenshot — `rect.left * devicePixelRatio` via CDP — because the
screenshot is 1440px wide while CSS is 384.

**Calling `focus()` over CDP is not the same as tapping.** On the phone too, focus
events need real window focus — `document.hasFocus()` comes back false and nothing
happens. To test anything focus- or keyboard-related you must `adb shell input tap`
like a finger, then `adb exec-out screencap -p` and look at it.

**Testing something that only appears with years of records.** The picker in the
stepper needs three pay periods before it shows, and the tap-count test that justifies
its design needs three *years*. Do not hand-edit the worker's store to get there — back
it up, seed, test, restore, and *prove* the restore:

```sh
node eval.js "$WS" "localStorage.getItem('worklog.v2')" > PHONE-BACKUP.json   # 1. back up
node eval.js "$WS" "localStorage.setItem('worklog.v2', <seed>);                     setTimeout(() => location.reload(), 30)"                  # 2. seed + reload
#   … tap-test …
node eval.js "$WS" "localStorage.setItem('worklog.v2', <backup>);                     setTimeout(() => location.reload(), 30)"                  # 3. restore
#   4. read it back and compare the parsed JSON — not 'it looked right'
```

The `setTimeout` before `reload()` matters: writing `localStorage` from inside the
running app is otherwise overwritten by its own `save()` (the same trap as the headless
seed page). Reloading immediately after the write beats the 250ms save debounce.

**And re-measure before every tap.** Once the keyboard is up the page has scrolled and
the coordinates you took a moment ago are stale. Re-using them taps the keypad instead
of the field — which is how a stray `8` once landed in a real worker's 연차 balance.
Re-read `getBoundingClientRect()` immediately before each tap, and check the stored
value afterwards when you have been tapping near real settings.

## Traps

- **`build.py` does not compile the app.** It unpacks the handoff bundle
  `근무기록-WorkLog.html`, swaps the current source in as a gzip+base64 asset, adds the
  design tokens and PWA head tags, and re-seals it. The loader, the dc runtime, React
  and the font CSS come through byte-for-byte from that file. **Do not delete it.**
  It *looks* like a stale July artifact and it is the single most deletable-looking
  file in the folder — it has been proposed for deletion once already. `build.py:32`
  opens it by name and dies without it (`FileNotFoundError`), so every future build
  stops. That an APK already on a phone still runs proves nothing: the APK is baked,
  the shell is what makes the *next* one.
- **The PWA head tags live in `PWA_HEAD` inside `build.py`**, not in `WorkLog.dc.html`.
- **`tools/` holds exactly two live scripts** — `sync_lang.py` and `check_lang.py`.
  Seven one-time i18n refactor scripts used to sit beside them and would corrupt the
  source if run; they were deleted 2026-08-28 (see `tools/README.md`).
- **The `__en` gloss keys** (`rsn_machine__en`) are the small English line shown *under*
  a label for Korean readers. `check_lang.py` skips them; they are never translated.
- **A record's `reason.ko` is a snapshot**, copied onto the record when the worker picks
  it. Changing wording in `lang/` does not rewrite documents already generated. That is
  deliberate — the paper must read as it did the day it was made.
- **`./build_apk.sh` can fail while exiting 0.** It needs `JAVA_HOME` (Android
  Studio ships one at `/Applications/Android Studio.app/Contents/jbr/Contents/Home`)
  and `ANDROID_HOME` (`~/Library/Android/sdk`). Without either, Gradle dies but the
  script still exits 0 and **leaves the previous APK sitting on disk with its old
  timestamp** — so `adb install -r` happily installs the build you were trying to
  replace. Check the mtime of `worklog-debug.apk`, not the exit code.
- **The service worker can hide your build.** `pwa/sw.js` caches the shell. It used to
  serve navigations cache-first, so a freshly installed APK opened the *previous*
  build and only showed the new one on the second launch — which reads exactly like
  "the change didn't work". It is network-first with a 1.5s fallback now (fixed
  2026-08-13), but if you ever see the phone running old code, check the worker before
  suspecting your patch. The cache key is `sha256(index.html + sw.js)[:10]`, so it
  moves when either does.
## Rules the change log taught

Sixty-eight entries, and they keep teaching one lesson in different costumes: **in this
app the failure mode is silence.** A selector that matches nothing, a `margin` the
layer already owns, a `var(--…)` absent at first paint, a function that takes a period
and then reads `this.st()` — none of them throw. The screen keeps its old shape, or
last month quietly recomputes with this month's numbers, and nobody finds out until
the worker puts that paper in front of a 근로감독관. **When a change appears to do
nothing, do not assume it did nothing. Measure it.**

Each rule cites the entry it came from — grep `CHANGELOG.md` for the ordinal to get
the whole story, which is always longer and usually has a table in it.

### The shape layer

- **Ask whether your rule is true only inside `#tabScroll`.** Three full-screen
  overlays live outside that box — 환영, 설정 흐름, 사유 시트 — and a rule scoped to it
  never reaches them. (fifty-ninth, fifty-third)
- **Ask what a border *says* before matching on it.** Rule 2 catches `border: 2px` and
  `1px` only; a 3px border stays square, and one did for five rounds. Three costumes
  are in use: black 2px = a card that asks or a row you pick, `neutral-300` 2px = a box
  you write in, borderless 30px circle = a collapse toggle. Something that "looks old"
  is usually wearing the wrong one, and the answer is the right costume, not a softer
  one. (fifty-ninth, fifty-sixth)
- **Is this card one object, or a container of rows?** A container's inner rows must not
  take `border-radius` — rule 2c rounds anything tappable, so a tappable row inside a
  card starts pretending to be a card. (forty-fourth, forty-second)
- **Inside a card, pad with `padding`, never `margin`.** The layer takes `margin` with
  `!important`, so your value dies on write and the text slides to the clipped edge.
  (forty-third)
- **A margin escapes a parent that has no `padding`, `border` or `overflow`.** The
  standard `margin:14px 18px 0` block is safe only because rule 1 gives every top-level
  card `overflow: hidden`; one level deeper — a group's open body panel — the top margin
  collapses out, the panel starts that much lower, and the card's white shows through as
  a line the panel was supposed to cover. And a box drawn with a border is one object:
  give it the same value above and below, measured, not judged by eye. (sixty-first)
- **Write selectors against the DOM's normalised value, not the source.** React
  re-serialises inline styles: source `border:2px solid`, attribute `border: 2px solid`.
  It also *expands* shorthands — source `flex:none`, attribute `flex: 0 0 auto` — so a
  clause copied from the source can match nothing, silently. Two clauses that already
  pin the element are enough; a third is one more place to be wrong. (sixtieth, fortieth)
- **`box-sizing` is `content-box`.** `min-width`/`width` exclude padding, so the width on
  screen is the declared width plus the inline padding. (fifty-second)
- **Greying something has two neighbours** — card white `#ffffff` and ground `#f3f2f2`,
  twelve steps apart. Choose against one and it merges with the other, and the card
  reads as a hole. (fifty-fifth)
- **Never `inset: 0` on a full-screen overlay.** It re-enters the root's safe-area
  padding and slides under the status bar — and headless cannot see it, because insets
  are 0 there. (fifty-first)
- **Press feedback runs in both directions.** `brightness(.86)` on a black button is
  invisible; dark controls need `brightness(1.9)`. Pick one direction and every dark
  control stays exactly as it was. (fiftieth)
- **On touch, `:hover` persists after the finger lifts.** A state colour and a hover
  colour that match will make a closed row look open. (forty-fourth)
- **`transform` inside `scroll-snap` moves the snap rectangle.** The browser re-snaps and
  the code reads that scroll as the worker's finger; it surfaces as a value reverting,
  so it does not look like a shape bug at all. (forty-fifth)
- **Changing a size can drop an element out of the layer.** Rule 8 catches the ON SHIFT
  lamp by its `width`/`height`; shrinking one dot took it out of the rule and it went back
  to a hard square, silently. Ask what the layer is holding an element by before you
  resize it. (sixtieth)
- **Shrink the glow with the thing that glows.** A halo reaching 6px past a 7px dot is a
  19px lamp: shrinking only the dot makes it read *bigger*, not smaller. What the eye
  measures is the lit footprint, so each size carries its own halo. (sixtieth)
- **`vertical-align: middle` is not the middle of the text** — it is half the *x-height*
  (2.69px above the baseline in Archivo 12px), so anything set beside capitals sits low.
  Measure the neighbouring word's ink box and use a length. Measure the letter *bodies*:
  Vietnamese and Thai read ~1px higher only because of marks stacked above them, and
  chasing that floats the marker off the top of the line. (sixtieth)
- **Take a size from the type beside it, don't pick one.** "As small as the dot in 09.06"
  is measurable: draw the glyph on a canvas and read its ink box — that period is 2×2px.
  (sixtieth)
- **A marker added to one row in a list wants a hanging indent, and nothing else works.**
  Three arrangements each fixed one thing and broke another — as a flex sibling it eats the
  text column and pushes that row's text right; hung outside with a negative margin the
  column is right but continuation lines align to the text, not the marker; inline in the
  flow the wrap is right but the first word is pushed by the marker's width. Keep it inline
  (so wrapping obeys line rules) and pull only the first line back by its width:
  `text-indent: -(width + gap)`. Make the indent a per-row value — it is set on the block,
  so rows without a marker must get `0` or the whole list shifts. (sixtieth)
- **Colour alone is already unique — don't also make it bold.** A row that is the only
  green one in a list is found; adding weight makes it beat its neighbours instead of
  differing from them. (sixtieth)
- **When a number lives in more than one place, move all of them.** Source,
  `ds-tokens.css` and the tests carry the same figures — `DRUM_ITEM` is 44 and the
  layer's selectors spell out `height: 132px` and `top: 44px`, so changing the source
  alone leaves those matching nothing and the drum goes flat.
  (forty-ninth, fifty-third)
- **The fingerprint is the app's identity.** `padIconInk`'s green appears in four places
  (the pad plus three logo copies); change one and change all four. (twenty-second)

### Money that has to remember its period

- **A function that takes `W` must not read `this.st()`.** `insBase` did, `dedRows` did.
  The result is last month recomputed with today's settings, and it raises nothing.
  (fifty-eighth)
- **Ask of every new setting: does this value change from year to year?** If it does, it
  belongs on the stamp (`wageNow()`), not in settings. (fifty-eighth)
- **`stampWage()` stamps only the period containing today**, and past stamps are never
  rewritten — correct, because the app does not know what was true then. For a value
  that cannot be recovered from the record, split on `src` and let the document admit
  it; `employerFor()` is the pattern. (nineteenth, eighteenth)
- **Still unstamped: insurance rates and tax tables.** Statute moves those, so they are a
  different problem from 기본금; today they always compute at current rates. (sixteenth)
- **Changing `periodStart` silently orphans history.** `wageKey(P)` and `slipKey(P)` are
  both keyed on the period's start date, so an existing `wageLog` and saved payslip
  comparisons stop matching any period. A warning when `payBackMax() > 0` is still owed.
  (thirty-second, thirty-first)
- **Before adding a row to the payslip comparison, ask: is this another line on the
  payslip, or a slice of a line already counted?** A slice has no place in the table —
  workers read indentation as "why are you asking twice", not as "this is not
  double-counted". Ask for it where it actually matters, and share the hole instead of
  storing a second copy of the value. (fifty-seventh)
- **Never explain away a shortfall.** A card may explain a *deduction* gap; it must never
  explain why the worker was paid less than the app computed. That number is the reason
  this app exists. (thirty-eighth, twenty-fifth)
- **Only 국민연금 recovers a unique 보수월액**, because its basis is in 천원 units;
  건강보험 is in 원 units and the same arithmetic yields a range, not a value.
  (twenty-sixth)
- **Two questions about a break, not one:** *when* does it come off (position) and *on
  which days* (the `ot` tag). Do not use the tag for something position already solves —
  a 9-to-6 factory's 18:00–18:30 is exact without it. And never call `isOtBreak` from
  `otMark`; it recurses. (twenty-ninth)

### Words on screen

- **`T()` on a missing key returns the key name.** It does not throw, so neither
  `bind.js` nor the eight-language render catches it, and the worker sees `N_OF_4`.
  (thirty-third)
- **Do not hand-build `{ ko, en }` labels — put them through `pair()`.** Six hand-built
  rows survived a fix that way; four were found only by opening the phone. (forty-sixth)
- **To colour part of a sentence, cut the string — do not mint new keys.** Splitting a
  sentence into fragments makes the next person re-decide word order in eight languages,
  and a wrong order is silent. If every language already leads with the same phrase and
  the same separator, slice on it and let a test count all eight. (sixtieth)
- **For a two-line label, ask whether the lower line already *carries* the word**, not
  whether it equals it. Payslip words usually contain the short word — 수당, 심야, 공제
  get appended — so waiting for equality never fires. Then check that the word gets the
  same treatment on every screen. (forty-seventh, forty-sixth)
- **The template renders text literally.** `**bold**` reaches the phone as asterisks.
  (thirty-fifth)
- **Pull a date or time range from the function that computes it**, and test it by asking
  that function, not by comparing strings. `period()` was right the whole time; the label
  transcribed it wrong. (thirty-fourth)

### When the arithmetic is right and the screen is still wrong

- **If the worker says it a second time, do not add another sentence.** The first time,
  confirming "the calculation is correct" and explaining harder was the wrong move. The
  question was *what must this screen answer, and is this value that answer?* A correct
  value answering a different question is a wrong screen. (thirty-seventh)
- **If the worker says "it never changes", measure whether it does.** It was changing —
  somewhere other than where they were looking. The fix is not the arithmetic, it is
  making the screen say what is tied to what. (thirty-fifth)
- **Placement is about who opens it, how often, and what for** — not about what it
  produces. "Both make files" was not a reason to put a once-in-a-lifetime backup beside
  a monthly document. (twentieth)
- **For a settings field, ask "must the worker touch this?", not "what is this value?"**
  Law-set / from-your-payslip / from-your-contract / what-your-company-does — and a
  statutory *floor* is none of the first three. (twenty-seventh, twenty-eighth)

### Knowing it actually works

- **A raw CDP touch is not a finger.** `Input.dispatchTouchEvent` never runs the gesture
  recogniser, so `:active` never fires and it looks exactly like a rule that failed to
  attach. Use `Input.synthesizeTapGesture`. (fiftieth)
- **Some bugs need a slow phone.** The stale-tile bug reproduced 7 times in 25 under
  `Emulation.setCPUThrottlingRate` at 20×, and never once by hand. Judge it by pixel diff
  against a known-good frame, not by eye. (forty-eighth)
- **"It flickers" is a question about frames.** Headless: `Page.startScreencast` plus CPU
  throttling. Phone: `screenrecord` plus **`ffmpeg -vsync 0`** — an `fps=` filter
  resamples away the very frame you are hunting. (thirtieth)
- **Safe-area bugs are invisible in headless** until you plant values with
  `Emulation.setSafeAreaInsetsOverride`, which also resurrects the pre-fix screen for
  side-by-side comparison. (fifty-first)
- **Some bugs need accumulated records, or one specific day.** Three years of records
  before the period picker earns its design (thirteenth); the pay-period rollover
  morning, when a night shift punches out (twelfth). Both have assertions that stand a
  phone up at exactly that moment — run them when you touch those screens.
- **Before deleting anything in this folder, `grep -rl` the name**, then move it aside
  and run `sh test/run.sh` and `python3 build.py v2` before you decide. (twenty-fourth)

## Change log — `CHANGELOG.md`

**Sixty-eight entries, and they are the reasoning behind most of what looks odd in this
app.** Each is a bug found by actually using it on shift, what changed, and why it was
that fix and not the obvious one. Most end with a **다음 사람에게** paragraph — the rule
the bug taught. Entries are cited by ordinal across the repo ("the twenty-third entry"),
and `CHANGELOG.md` opens with an index keyed by ordinal.

It lived in this file until 2026-09-05, when it pushed `CLAUDE.md` past 150k characters
and the file stopped loading. Splitting it out is what makes this map readable again;
nothing was edited in the move.

**Do not read it front to back — grep it.** The section above is the distillation; this
is where the reasoning, the measurements and the numbers live. Before you "fix" something
that looks wrong, search `CHANGELOG.md` for the screen, the value, or the function you are
about to touch. It is probably deliberate, and an entry says why — usually with the figure
that settled it and the assertion that now holds it in place.
