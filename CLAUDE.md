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

## The three documents

- **`README.md`** — what the app is, the wage engine's rules, the non-negotiables.
  The wage rules section is the specification; it is byte-identical between v1 and v2
  and there is a test that proves it.
- **`V2.md`** — every bug found by actually using v1 on shift, and what changed. Read
  Part 1 before you "fix" anything that looks odd; it is probably deliberate and the
  reasoning is written down.
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

**Headless cannot answer keyboard questions at all.** The on-screen keyboard is drawn
by the IME, not by the app, and it differs per vendor. Anything about the keypad — which
action key appears, whether it is live, how much of the screen it covers — has to be
looked at on the phone. See the next two sections.

### Installing on the phone

```sh
adb devices                              # must say "device", not "unauthorized"
adb install -r worklog-debug.apk         # -r keeps the worker's records
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

## Change log beyond V2.md

### 2026-08-30 (latest, forty-first) — 카드의 마지막 줄에는 밑줄이 없습니다, 그리고 해와 달

만든 사람이 출퇴근의 요약 카드를 가리켜 말했습니다: **예상 수령액 아래 여백이 지난
근무 위 여백보다 넓습니다. 예상 수령액의 밑줄을 빼십시오, 그게 범인입니다.**

맞습니다. 재 보니 위는 첫 줄의 여백 **11px**뿐인데 아래는 마지막 줄의 밑줄 1px +
매달아 둔 여백 상자 **18px**였습니다. 평면 배경일 때는 그 밑줄이 카드의 끝이 아니라
그냥 다음 구역과의 경계로 읽혔는데, 카드가 되고 나니 **끝을 두 번 그리는 것**이
됐습니다 — 밑줄이 한 번, 둥근 모서리와 그림자가 또 한 번.

**밑줄은 줄과 줄 사이를 가르는 것이지 카드의 끝을 그리는 것이 아닙니다.** 카드는
서른째부터 스스로 끝납니다.

- 줄의 밑줄 색이 홀이 됐습니다(`r.bd`) — 마지막 줄만 `transparent`입니다. 색을
  마크업에 박아 두면 어느 줄이 마지막인지 마크업이 알 수 없습니다.
- **두 갈래가 한 마크업을 나눠 씁니다** — 근무중 일곱 줄과 퇴근 뒤 여섯 줄. 그래서
  줄을 만드는 두 자리가 아니라 **그 뒤 한 곳에서** 마지막 줄에 표를 답니다. 한쪽만
  고치면 다른 갈래가 예전 모양으로 남습니다(양쪽 다 asserted).
- 매달려 있던 `height:18px` 상자는 없앴습니다. 위가 11px이면 아래도 11px입니다.

11 new assertions (2174 → **2185**). **임금 계산식은 손대지 않았습니다** — 줄의 이름도
금액도 그대로이고, 더한 것은 그 줄에 밑줄을 그릴지 말지뿐입니다.

**폰에서 확인**(EN, 실제 기기): 예상 수령액 밑에 줄이 없고, CDP로 재니 첫 줄
`padding-top 11px` · 마지막 줄 `padding-bottom 11px`, 마지막 줄의 테두리 색이
`rgba(0,0,0,0)`이고 그 앞 줄은 `rgb(224,221,221)` 그대로입니다. 근로자의 저장소는
열지도 쓰지도 않았습니다.

#### 그리고 근무조는 해와 달로도 말합니다

만든 사람이 이어서 말했습니다: **근무기록 줄에 쓰는 그 해 아이콘을 DAY 앞에,
그리고 09:00 start 앞에도 넣어 주십시오. 야간이면 그 달 아이콘으로.**

**시작 시각 줄에도 붙였다가 뺐습니다.** 폰에서 보고 만든 사람이 말한 그대로입니다 —
**한 줄에서 같은 말을 두 번 합니다.** 그 줄에서 근무조를 말하는 것은 알약이고, 그
옆은 몇 시에 시작하는가입니다. 그림이 둘이면 어느 쪽이 근무조를 말하는지가 흐려집니다.
시험도 뒤집었습니다: *알약 옆에 하나씩*이 아니라 **알약 다음에는 `<svg`가 하나도
없는지**를 셉니다.

**그림을 새로 그리지 않았습니다.** 근무기록 배지의 그 path 그대로입니다 — 마흔째가
색을 두 화면이 나눠 쓰게 한 것과 같은 이유입니다. 같은 하루를 두 화면이 다른
그림으로 말하면 안 됩니다. 시험이 소스에서 그 path가 세 번(근무기록 배지 + 여기 둘)
나오는지 셉니다.

**색을 고르지 않았습니다** — `stroke="currentColor"`입니다. 알약 안에서는 알약의
글자색(노랑 위 검정 / 검정 위 흰색)을, 시작 시각 줄에서는 그 줄의 회색을 그대로
씁니다. 새 값이 하나도 늘지 않습니다.

**알약을 새로 만들지 않았습니다.** 그림은 이미 있던 알약 **안에** 들어갑니다 —
`min-height:30px;display:inline-flex`인 것은 여전히 일곱 개이고, `boot.js`가 그 수를
셉니다. 새 알약을 세우면 그 규칙이 닿지 않아 네모가 되는데, 그것은 오류를 내지
않습니다(마흔째).

`detectSun` / `detectMoon`은 근무중 갈래와 출근 전 갈래 **양쪽에서** 세웁니다 —
찍고 나면 그림이 사라지면 안 됩니다(양쪽 다 asserted). **특근은 근무조를 대신하지
않습니다**: 특근인 일요일 주간에도 해는 해입니다.

13 new assertions (2185 → **2198**). 새 문장이 없고(그림뿐입니다) 키 수도 **785**
그대로입니다. **임금 계산식은 손대지 않았습니다** — `detectShift()`는 읽기만 합니다.

**폰에서 확인**(EN, 실제 기기): 노란 `DAY` 알약 안에 검은 해, 그 오른쪽은
`09:00 start` 글자뿐입니다. 근무조를 야간으로 두고 보니 검은 `NIGHT` 알약 안에 흰
달입니다. 근로자의 저장소는 **백업 → 시험 → 복원**했고 파싱한 JSON이 백업과 완전히
같습니다(기록 32일, `shifts: both` 그대로).

### 2026-08-30 (fortieth) — 모난 것을 둥글게, 그리고 알약 셋

만든 사람이 Claude Design이 낸 시안 한 장을 들고 왔습니다: **카드에 둥근 모서리가
있고 그림자가 조금 있습니다. 이렇게 만들 수 있습니까?**

#### 937개의 인라인 스타일을 고치지 않아도 되는 이유

이 앱은 한 파일이고 클래스 이름이 하나도 없습니다. 모양은 전부
`style="…"` 안에 있고 그것이 **937개**입니다. 전부 고치면 모든 화면과, 그
문자열을 읽는 **2,152개의 시험**을 함께 건드리게 됩니다.

그럴 필요가 없었습니다. `redesign-brief/02`가 세어 둔 그대로
**`border-radius`가 소스에 0개, `box-shadow`도 0개**입니다. 아무도 쓰지 않는
속성이라 **스타일시트 한 줄이 `!important` 없이 이깁니다.** 인라인이 그 속성을
말한 적이 없으니 다툴 일이 없습니다. 이번 변경이 가능한 것이 그 한 가지
사실 덕분이고, 그래서 앱 소스는 **두 줄만** 바뀌었습니다.

층은 `ds-tokens.css` 아래에 있습니다 — `build.py`가 이미 그 파일을 통째로
head에 박아 넣으므로(서른째) 모양 없는 첫 프레임이 아예 없습니다.

#### 선택자가 기대는 두 가지 — 둘 다 실제 DOM에서 확인했습니다

1. **`<sc-if>`는 DOM에 아무 요소도 만들지 않습니다.** 그래서 한 탭의 구역들이
   정말로 `#tabScroll > div > div`입니다. 카드 하나가 곧 구역 하나입니다.
2. **React가 인라인 스타일을 다시 직렬화합니다.** 소스에는
   `border:2px solid`라고 적혀 있어도 DOM의 속성값은
   `border: 2px solid` — **콜론 뒤에 공백**입니다. 속성 선택자는 정규화된
   쪽에 맞춰야 합니다. 소스를 보고 선택자를 쓰면 아무것도 안 잡히는데,
   화면은 그냥 예전 모양이라 **고장으로 보이지 않습니다.**

#### `!important`는 넷뿐이고, 각각 무엇을 이기는지 적어 두었습니다

| 무엇 | 왜 |
|---|---|
| `margin` | 구역마다 `14px 18px`·`14px 18px 0`·없음이 섞여 있었습니다. 카드는 한 박자여야 합니다 |
| `border-bottom-color` · `border-top-color` | 붙어 있던 구역을 가르던 2px 줄. 카드는 스스로 갈라지고, 둥근 모서리를 가로지르는 직선은 줄이 없느니만 못합니다 |
| `background: transparent` → 카드 흰색 | 아래를 보십시오 |
| 지문 타일의 테두리 | 아래를 보십시오 |

**`background: transparent`가 이번의 함정이었습니다.** 설정의 묶음 줄도,
출퇴근의 여섯 칸도 인라인으로 `transparent`입니다. 그것은 *'고르지 않은 상태'*라는
뜻이지 *'나를 통해 뒤를 보여 달라'*가 아닙니다. 예전 평면 배경에서는 그 둘이
같은 것이었고, 카드 위에서 비로소 갈라졌습니다 — 화면에 **구멍**이 뚫려
보였습니다. 흰색으로 덮고, 고른 상태(`accent-100`)는 더 좁은 선택자로 되살립니다.
**칠하고 되살리는 두 줄이 한 벌입니다.**

#### 지문 타일의 테두리는 뺐고, 지문 자체는 손대지 않았습니다

96px 정사각형의 2px 테두리를 없애고 둥근 타일로 바꿨습니다. 그 테두리는
`padInk`로 근무중을 말하고 있었는데, **같은 것을 패드가 세 번 더 말합니다** —
출근/퇴근 도장, 제목, 큰 시계가 모두 `padInk`입니다. 그래서 여기서만 뺄 수
있었습니다. **초록 지문 그림은 한 글자도 바뀌지 않았습니다.**

#### 소스에서 바꾼 두 줄

- 머리말의 급여기간 칩이 **검은 알약**이 됐습니다(시안 그대로). 하얀 머리말
  위에서 하나만 진해야 어디를 보는지가 분명합니다.
- `이미 출근했습니다` 줄에 `accent-100`을 얹었습니다. 시안에서 분홍인 그
  줄이고, 지문을 못 찍은 사람이 찾아가는 자리라 눈에 띄어야 합니다.

#### 시험이 하나 걸렸습니다 — 주석이 시험을 깼습니다

`boot.js`는 `template.split('<body')[0]`으로 head를 잘라 봅니다. 새로 쓴 주석에
`<body>`라고 적었더니 **거기서 잘려서** 그 뒤의 `html, body { … }`가 사라졌고,
*'갈아 끼운 문서의 html/body가 곧바로 앱 바탕색입니다'*가 실패했습니다. head에
들어가는 파일에는 태그 이름을 꺾쇠와 함께 적지 마십시오.

**임금 계산식은 손대지 않았습니다** — 바뀐 것은 모양뿐이라 v1 등가 증명과
2152개가 그대로 통과하고(0 failed), 여덟 언어 렌더도 throws:0입니다. 토큰은
19 → **28개**(전부 **추가**, 이름은 하나도 안 바꿨습니다). 값은 둘 바꿨습니다:
`--color-surface` #eae9e9 → **#ffffff**(카드 흰색), `--color-neutral-300`
#d7d3d3 → **#e0dddd**(머리카락 선을 부드럽게). **`--color-bg`는 그대로
#f3f2f2입니다** — `boot.js`가 그 값을 정확히 셉니다.

**폰에서 확인**(EN, 실제 기기): 다섯 탭 모두 흰 카드에 16px 모서리와 그림자,
머리말의 `EN ▾`와 검은 `08.01 → 08.31` 알약, 아래 탭은 고른 것만 분홍 알약.
탭 높이 49px, 이 화면에서 44px 미만인 누를 것 **0개**. 근로자의 저장소는 열지도
쓰지도 않았고 `adb install -r`로 얹었습니다 — 설정 42칸 그대로입니다.

#### 그리고 알약 — 오늘이 어떤 날인지는 산문이 아니라 색이 말합니다

시안을 다시 보고 만든 사람이 말했습니다: **알약도 해 주십시오.**

날짜와 근무조가 **두 구역**으로 떨어져 있었습니다. 붙어 있을 때는 얇은 줄
하나였는데, 카드가 되고 나니 그 사이에 그림자가 한 겹 생겨서 **한 가지를
말하는 것이 두 가지처럼** 보였습니다. *오늘이 며칠인가*와 *오늘이 어떤
날인가*는 한 물음입니다. 한 카드로 합치고 안에서 얇은 줄로 나눕니다.

| | 예전 | 지금 |
|---|---|---|
| 요일과 시각 | 날짜 밑 회색 대문자 한 줄 | 날짜 오른쪽 **회색 알약** |
| 근무조 | 19px 굵은 글씨 `DAY` | **노랑(주간) / 검정(야간) 알약** |
| 특근 | **설명 문단 한가운데** | **분홍 알약** `특근 ×1.5` |

**색을 새로 고르지 않았습니다.** 근무기록 줄의 배지가 쓰는 그 색입니다 —
주간이면 노랑 `oklch(0.84 0.16 92)`, 야간이면 검정. `shiftChipBg()` 하나를
두 화면이 나눠 쓰고, **시험이 값이 아니라 그 함수에 물어봅니다.** 두 화면이
같은 하루를 다른 색으로 말하면 안 됩니다.

**특근은 근무조를 대신하지 않습니다 — 이것이 이번의 판단입니다.** 근무기록
줄의 배지는 특근이면 배지 **자체**가 빨강이 됩니다(`:5482`). 여기서 그것을
그대로 베끼면 **특근인 주간이 주간이 아니게 됩니다.** 특근인 야간도 있습니다.
그래서 알약이 둘입니다 — 근무조 위에 특근이 겹쳐지는 것이지 근무조를 밀어내는
것이 아닙니다. `shiftChipBg()`는 특근을 아예 보지 않고, *'특근이어도 노랑
그대로'*를 시험이 셉니다(되돌려 돌리니 네 줄이 실패합니다).

**특근 알약은 그 날만 섭니다.** 없는 날에 회색으로 서 있으면 *'오늘은 특근이
아니다'*가 아니라 *'이 앱은 특근을 모른다'*로 읽힙니다.

**새 문장이 없습니다** — 알약의 글자는 급여명세서가 이미 쓰는
`holiday_work_1_5`(`특근 ×1.5`)입니다. 근로자가 종이에서 찾을 수 있어야 한다는
그 규칙이 여기서도 공짜로 지켜집니다. 키 수 그대로 **785**.

**`SHIFT DETECTED` 줄은 지우지 않았습니다.** 시안에는 없지만, 그 자리는
서른한째가 *'판별한 적 없는 근무조를 자동판별이라고 부르지 않는다'*고 세워 둔
`근무조 가정값 ASSUMING A SHIFT`가 나오는 자리입니다. 9px 한 줄을 아끼자고
그것을 버릴 수는 없습니다 — 시안과 다른 유일한 줄이고, 일부러 다릅니다.

22 new assertions (2152 → **2174**). **임금 계산식은 손대지 않았습니다** —
`detectShift()`도 `autoHoliday()`도 읽기만 하고, 더한 것은 그 답을 어떤 색으로
그리는가입니다.

**알약을 한 번 네모로 내보냈습니다, 적어 둡니다.** 알약 모양은 층이 정하는데
`border-radius` 규칙이 **테두리 있는 상자**에만 걸려 있었고, 새 알약 셋에는
테두리가 없어서 아무 규칙도 닿지 않았습니다. 폰에서 보고서야 알았습니다 —
**모양이 안 붙은 것은 오류를 내지 않습니다.** `min-height: 30px` +
`inline-flex`인 일곱 개를 한 규칙으로 묶고, 소스에 그런 것이 정말 일곱 개인지
세는 줄을 `boot.js`에 걸었습니다.

**그리고 그것을 확인하다 또 한 번 걸렸습니다.** 근무기록 배지를 손으로
만들어 재 봤더니 `0px`가 나왔습니다. `setAttribute('style', 소스의 문자열)`은
**정규화를 하지 않습니다** — `min-height:30px` 그대로 남아서 선택자가 안
잡힙니다. React처럼 `style` 프로퍼티를 하나씩 세우니 `999px`입니다. 이 층을
확인할 때는 **React가 만드는 길로 만들어서** 재십시오.

**폰에서 확인**(EN, 실제 기기): 한 카드 안에 `2026.08.30`과 회색
`SUNDAY · 05:11` 알약, 얇은 줄 아래 노란 `DAY` · `16:00 start` · 분홍
`Holiday work ×1.5`. 셋 다 실제로 `border-radius 999px`입니다(CDP로 잼).
근로자의 저장소는 열지도 쓰지도 않았습니다.

**다음 사람에게.** 모양을 더 손보고 싶어지면 **인라인에 `border-radius`를 적지
마십시오.** 그 순간 그것이 파일의 첫 번째가 되고, 그 요소만 조용히 층 바깥으로
나갑니다. 그리고 새 선택자를 쓸 때는 소스가 아니라 **DOM의 정규화된 속성값**을
보십시오 — 안 잡히는 선택자는 오류를 내지 않고 그냥 예전 모양을 남깁니다.

### 2026-08-29 (thirty-ninth) — 명세서의 국민연금 한 줄이 보수월액을 되살립니다

스물여섯째가 되살리는 산수를 만들어 두었습니다: `bosuFromPension()`은 명세서의
국민연금 한 줄에서 보수월액을 **원 단위까지 정확히** 풀어냅니다. 기준소득월액이
천원 단위라 답이 유일하기 때문입니다.

그런데 그 칸은 설정 › 4대보험과 세금 깊숙이 접혀 있어서 아무도 찾지 못했습니다.
스물다섯째가 *'있는데 안 보이는 것'*이라고 적어 둔 그대로입니다.

#### 새로 묻지 않습니다 — 이미 적고 있는 것을 한 줄 더 받습니다

명세서 대조는 공제를 **뭉친 숫자 하나**로 받고 있었습니다. 그 밑에 국민연금 한
줄을 두면, 명세서를 옮겨 적는 근로자가 **이미 그 숫자를 앱에 넘겨준 것**이 됩니다.
그 다음은 산수입니다.

```
명세서의 국민연금 163,110  →  보수월액 3,434,000  (163,110 ÷ 0.0475, 천원 단위)
```

줄은 **한 칸 들여** 씁니다 — 국민연금은 공제의 조각이지 그와 나란한 항목이
아닙니다.

#### 국민연금에 들지 않은 사람에게는 그 줄이 없습니다

만든 사람이 짚어 준 그것입니다: **다른 외국인 근로자들은 국민연금이 없습니다.**
사회보장협정으로 면제된 E-9 근로자가 실제로 있고, 그 사람의 명세서에는 그 줄이
아예 없습니다. 없는 줄을 물으면 그것대로 틀린 화면입니다.

`insOnFor('pension')`이 꺼져 있으면 줄도 카드도 아예 없습니다(asserted). 앱은
이미 *'명세서에 없는 줄은 끄십시오'*라고 말하고 있으므로, 끈 사람에게는 저절로
사라집니다.

#### 권하는 것이지 몰래 쓰는 것이 아닙니다

- 되살린 값이 지금 쓰는 값과 **다를 때만** 카드가 뜹니다. 누르기 전에는
  `bosu`가 한 글자도 바뀌지 않습니다(asserted, 손으로 3,000,000을 적어 둔
  경우까지).
- **풀리지 않으면 지어내지 않습니다.** 천원 단위 어느 값도 그 금액을 내지
  못하면 그렇다고 말하고 단추를 내밀지 않습니다 — 열여섯째의 `src: 'unknown'`과
  같은 규칙입니다.
- 설정의 그 칸은 **그대로 있습니다.** 옮긴 것이 아니라 한 번 더 만날 자리를
  만든 것입니다.

#### 부족액은 한 푼도 움직이지 않습니다

새 줄은 공제의 조각입니다. `slipShortfall()`은 `['ot','night','hol','basic']`
allowlist라 `'pension'`은 **저절로** 빠지는데, 저절로 되는 것일수록 시험으로
붙들어 둡니다: 국민연금을 999,999로 적어도 부족액이 한 원도 안 움직이는지,
그리고 `slipShortfall` 본문에 `'pension'`이라는 글자가 없는지 함께 셉니다.

**예전에 저장해 둔 대조는 그대로 읽힙니다** — `slip(P)`는 없는 키를 `undefined`로
돌려주므로 `has: false`, `short: 0`입니다. 마이그레이션이 없습니다.

44 new assertions (2108 → **2152**). 783 → **785 키**. 되살리기를 되돌려 돌리면
여섯 줄이, 줄 자체를 지우면 그 블록이 통째로 무너집니다. **임금 계산식은 손대지
않았습니다** — 새 줄은 `insCalc()`가 이미 내던 값을 읽기만 합니다.

**폰에서 확인**(EN): 공제 밑에 `National pension ₩102,450 / 163110`이 한 칸 들여
서고 `+₩60,660`이 붙습니다. 그 아래 카드가 *163,110은 보수월액 3,434,000
하나에서만 나온다*고 말하고, 빨간 단추를 손가락으로 누르니 `bosu`가 3,434,000이
되고 카드가 사라지며 **공제 합계가 ₩218,350 → ₩330,970**으로 명세서 쪽에
가까워졌습니다. 근로자의 저장소는 백업 → 시험 → 복원했고 파싱한 JSON이 완전히
같습니다.

**남은 한계는 그대로입니다**(스물여섯째). 이 방법이 통하는 것은 **국민연금만
기준이 천원 단위**라 답이 유일해지기 때문입니다. 건강보험 보수월액은 원 단위라
같은 방법을 쓰면 범위만 나옵니다 — 그래서 두 보험이 같은 `bosu`를 나눠 쓰고,
실제로 다를 수 있다는 것이 아직 남은 어긋남입니다.

### 2026-08-29 (thirty-eighth) — 필요해지는 그 자리에서 묻습니다

급여 탭 맨 위의 기본금 카드가 이미 하는 그것을 세 자리로 넓혔습니다. 설정 깊숙이
접어 두는 대신, 그 값이 **처음으로 중요해지는 화면**에서 한 번 묻습니다. 셋 다
근로자가 그 순간 종이를 손에 들고 있는 자리입니다.

#### 1. 성명 · 근무내역서를 만들기 직전

성명은 어떤 금액도 바꾸지 않습니다. **오직 문서에만 찍힙니다.** 그런데 지금은
문서가 나온 **뒤에** 빨간 «성명 미기재»로 알려 줍니다(열여덟째) — 그러면 그 종이를
다시 만들어야 합니다. 빨간 단추 바로 위에서 묻습니다.

- **막지 않습니다.** `나중에`를 누르면 이번 실행 동안 조용해지고, 문서는 그대로
  나오며 스스로 «성명 미기재»라고 밝힙니다(asserted, 셋 다).
- `nameAsked`는 저장하지 않습니다 — `basicAsked`와 같은 자리입니다.

#### 2. 공제가 명세서와 어긋난 그 자리에서 두 칸

보수월액과 공제대상가족 수는 공단·국세청에 신고된 값이라 앱이 알 수 없습니다
(스물다섯째). 그 두 칸은 설정 깊숙이 있고, **근로자가 그것이 필요하다는 것을 아는
순간은 명세서를 옮겨 적어 공제가 어긋나는 것을 본 그 때**입니다. 대조표 바로 아래에
두 칸을 내어 놓고, 스물여섯째의 되살리기도 한 줄로 가리킵니다.

천 원 미만 차이로는 뜨지 않습니다 — 원 단위 반올림까지 카드로 만들 일이 아닙니다.

#### 3. 명세서가 앱보다 많이 줄 때

지급총액이 명세서 쪽에서 더 크고 **수당이 하나도 없는 사람**에게만 묻습니다. 이미
적어 둔 사람에게는 다른 이유일 수 있고, 그것까지 짐작하지 않습니다.

#### 잔업 줄에는 붙이지 않았습니다 — 이것이 이번의 판단입니다

명세서의 잔업·야간·특근이 앱보다 적을 때도 '설명'을 붙일 수는 있습니다:
*배수가 ×1.5가 아닐 수 있습니다.* **그것을 붙이면 안 됩니다.**

거기서 어긋난 것은 **부족액**이고, 이 앱이 있는 이유가 그것입니다. 앱이 부족액을
설명해 없애면 근로자는 자기가 덜 받았다는 사실에서 걸어 나가게 됩니다.
스물다섯째가 *'공제 차액은 덜 받은 돈이 아니다'*라고 갈라 둔 그 선의 반대편입니다 —
**공제는 설명하고, 지급은 설명하지 않습니다.**

시험이 그것을 지킵니다: 명세서에 잔업을 5만 원 덜 적어 넣어도 **새 카드가 하나도
뜨지 않고**, 빨간 부족액은 그대로 섭니다. 그리고 여덟 언어 문장 어디에도 '배수를
바꿔 보라'는 말이 없는지 셉니다.

#### 옮긴 것이 아니라 한 번 더 물을 자리를 만든 것입니다

보수월액·공제대상가족·성명은 **설정에도 그대로 있습니다**(asserted: 각 홀이 소스에
두 번). 이 앱은 증거를 만듭니다 — 근로자가 설정을 열었을 때 칸이 사라져 있으면 안
됩니다.

40 new assertions (2068 → **2108**). 776 → **783 키**. 되돌려 돌리니 세 줄이
실패합니다. **임금 계산식은 손대지 않았습니다** — 세 카드는 언제 무엇을 보여
줄지만 정하고, 값을 쓰는 것은 예전부터 있던 그 칸들입니다.

**폰에서 확인**(EN): 성명이 빈 상태로 급여를 열면 `CREATE A WORK RECORD` 바로 위에
`ONE THING FIRST · 한 가지만 / Whose record is this?`가 이름 칸과 `Not now`와 함께
섭니다. 명세서 대조에 공제와 지급총액을 어긋나게 적으니 그 아래로 두 카드가 붙고,
공제 카드 안에 `Standard monthly wage`와 `Dependents`가, 수당 카드에
`+ ADD ALLOWANCE`가 들어 있습니다. 근로자의 저장소는 백업 → 시험 → 복원했고 파싱한
JSON이 완전히 같습니다.

**다음 사람에게.** 이런 카드를 새로 붙이고 싶어지면 먼저 물으십시오: **이 카드가
설명하는 차이는 근로자가 덜 받은 돈입니까?** 그렇다면 붙이지 마십시오. 앱이 할 일은
그 차이를 크고 빨갛게 보여 주는 것이지 이유를 대 주는 것이 아닙니다.

### 2026-08-29 (thirty-seventh) — 두 번 말한 것은 설명이 모자란 것이 아니었습니다

두 가지입니다. 하나는 굴림판을 휴게 시각에도 붙인 것이고, **하나는 근로자가 같은
것을 두 번 말했는데 내가 두 번 다 설명으로 답한 것**입니다.

#### 1. 화면이 답해야 하는 물음을 잘못 잡고 있었습니다

*교대에서 주간 시작을 아무리 바꿔도 '평소 하루는 여기서 끝납니다'가 21:00
그대로입니다.* — 서른다섯째에서 이 말을 듣고, 계산이 맞다는 것을 확인한 뒤
**시간 수를 적고 넘겨받는다는 안내를 붙였습니다.** 근로자는 같은 말을 다시
했습니다.

두 번 말했다는 것은 설명이 모자랐다는 뜻이 아니라 **화면이 엉뚱한 값을 보여
주고 있었다는 뜻**입니다.

| | 무엇 | 시작을 따라가는가 |
|---|---|---|
| `normalEnd(kind)` | 잔업 휴게가 '연장 시에만'인지 가르는 자리. 교대에서는 **다른 조가 시작하는 자리**(2026-08-18) | 교대에서 **아니오** |
| `otMark(kind)` | 휴게를 빼고 **8시간이 차는 자리** | 세 근무조 모두 **예** |

이 화면이 답해야 하는 물음은 *'내 하루의 8시간이 언제 차는가'*입니다.
`normalEnd`는 잔업 휴게 규칙을 위한 **안쪽 개념**이지 근로자에게 보여 줄 값이
아니었습니다. `otMark`으로 바꾸고 이름표도 그 말로 고쳤습니다 —
`8시간이 차는 자리 · 8 HOURS REACHED AT`.

```
교대 · 야간 21:00 고정
  주간 09:00 → 18:00 · 9.0h      (예전: 21:00 · 12.0h)
  주간 12:00 → 20:30 · 8.5h      (예전: 21:00 · 9.0h)
```

**`normalEnd()`는 한 글자도 바꾸지 않았습니다** — 잔업 휴게 규칙은 여전히 그것을
쓰고, 시험이 그대로인지 봅니다. 바꾼 것은 **화면이 어느 것을 읽는가**입니다.
넘겨받는다는 안내는 지웠습니다: 맞는 값을 보여 주고 나니 설명할 것이 없습니다.

#### 2. 휴게 시각도 알람처럼 굴립니다

2/4의 휴게만 글자 칸이었습니다. 한 화면 안에서 시작 시각은 굴림판, 휴게는 자판을
올려 치는 것 — 두 가지 방식이 서 있었습니다.

**한 번에 한 칸만 엽니다**(`state.brEdit`). 줄마다 드럼 넷을 늘 펴 두면 화면이 세
배가 되고, 고칠 것 하나를 찾으러 굴려 내려가야 합니다. 시각을 누르면 그 줄 아래에
드럼이 펴지고, 다시 누르면 접힙니다. 다른 칸을 누르면 앞 칸은 닫힙니다(asserted).

- **고치는 것은 그 칸 하나뿐입니다.** 표(`ot: true`)가 붙은 저녁 휴게를 고쳐도
  표가 남고, 야간 목록은 야간만 고칩니다(asserted, 폰에서도 확인).
- **설정 탭의 휴게 줄은 그대로 글자 칸입니다.** 거기까지 바꾸라는 말이 없었고,
  `breakRows()`는 두 화면이 함께 쓰므로 시험이 그 둘을 갈라 봅니다.
- 자리 맞추기는 1/4과 같은 규칙입니다 — **화면에 들어올 때, 아직 굴리지 않은
  칸만.** 폰에서 11:30 칸을 누르니 616px(11×56)에서 열렸습니다.

#### 시험 셋이 예전 값을 붙들고 있었습니다

`normalEnd`를 기대하던 두 줄과, 지운 문장을 여덟 언어에서 세던 한 줄. 새 동작으로
고쳤고, **`normalEnd` 자체는 그대로인지 보는 줄을 새로 넣었습니다** — 화면이 다른
값을 읽게 됐다고 해서 엔진의 개념이 사라진 것이 아니라는 것을 붙들어 둡니다.

**서른세째에 넣은 '없는 키' 시험이 값을 했습니다.** `a_normal_day_ends_at`을
lang에서 지우고 소스는 아직 안 고친 중간 상태에서, 그 줄이 곧바로 두 키를
짚었습니다 — 화면에는 키 이름이 그대로 찍혔을 상태였습니다.

23 new assertions (2048 → **2068**). 777 → **776 키**(둘 지우고 하나 더했습니다).
**임금 계산식은 손대지 않았습니다.**

**폰에서 확인**: 교대에서 `8 HOURS REACHED AT 09:00 → 18:00 · 9.0h`, 시 드럼을
굴려 12:00으로 하니 `12:00 → 20:30 · 8.5h`. 2/4에서 11:30을 누르니 드럼이 그 값에서
열리고, 굴리니 `09:30`이 되며 끝 시각과 저녁 휴게의 표는 그대로입니다. 근로자의
저장소는 백업 → 시험 → 복원했고 파싱한 JSON이 완전히 같습니다.

**다음 사람에게.** 근로자가 **같은 것을 두 번 말하면 설명을 더 붙이지 마십시오.**
첫 번째에 나는 '계산은 맞다'를 확인하고 문장을 보탰는데, 정작 물어야 했던 것은
*'이 화면이 답해야 하는 물음이 무엇이고, 지금 보여 주는 값이 그 답인가'*였습니다.
값이 맞아도 **다른 물음의 답이면 그것은 틀린 화면입니다.**

### 2026-08-29 (thirty-sixth) — 시각은 시계 앱의 알람처럼 굴려서 고릅니다

앞 회차에서 시각 칩을 마흔여덟 개짜리 굴러가는 격자로 바꿨더니 만든 사람이
말했습니다: **그건 내가 말한 굴림이 아닙니다. 폰의 시계 앱에서 알람을 하나
만들어 보세요. 그 굴림판을 말한 겁니다.**

시계 앱을 열어 봤습니다(`am start -a android.intent.action.SET_ALARM`). 시 칸과
분 칸이 나란히 서서 가운데 띠에 든 값만 크고 진하고, 위아래 이웃은 흐리고,
굴리면 값이 바뀝니다. 격자와는 다른 물건입니다.

#### 굴림판

`DRUM_H`(00–23) · `DRUM_M`(5분 단위 열둘) · `DRUM_ITEM = 56`. 한 칸 높이 56px,
위아래에 56px 여백을 두어 첫 칸과 마지막 칸도 가운데에 설 수 있습니다.
`scroll-snap-type:y mandatory` + `scroll-snap-align:center`로 물리고, 가운데 띠는
**`pointer-events:none`** 입니다 — 그렇지 않으면 가운데 칸을 영영 누를 수
없습니다(asserted).

**분은 5분 단위입니다.** 근무 시작이 :07인 공장은 없고, 그런 값이 필요하면 아래
손으로 치는 칸이 그대로 받습니다 — `drumIndex()`는 :07을 :05 칸으로 읽어
보여 주기만 하고 저장된 값을 바꾸지 않습니다.

**`onScroll`이 이 런타임에서 통합니다.** dc 템플릿의 `on*`은 React props로
그대로 넘어갑니다 — `onClick`·`onChange`와 같은 길입니다. 굴린 자리에서
`Math.round(scrollTop / DRUM_ITEM)`이 고른 칸이고, 값이 같으면 아무것도 하지
않으므로 굴리는 동안 setState가 쏟아지지 않습니다.

#### 자리를 맞추는 코드가 손가락과 다퉜습니다 — 이번의 알맹이

09:00인 사람의 칸이 00에서 열리면 그것은 고장입니다. 스크롤 위치는 템플릿으로
정할 수 없으니 코드가 맞춰야 하는데, **어디서 부르는가가 전부였습니다.**

처음에는 `componentDidUpdate`에서 불렀습니다. 폰에서 굴려 보니:

```
09:00 → (굴림) → 03:00 → ... → 09:55 → 09:00
```

**굴릴 때마다 setState가 일어나고, 그 setState가 다시 자리를 맞추면서 손가락과
앱이 서로 끌어당겼습니다.** 인스턴스에 세워 둔 '이미 놓았다' 깃발은 런타임이
다시 그릴 때 사라져 막아 주지 못했습니다.

두 가지로 바꿨습니다.

1. **화면에 들어올 때만** 부릅니다 — `endTour` · `openSetupFlow` · `suBack`이
   1로 돌아올 때 · 근무조를 고를 때(그때 야간 드럼이 처음 붙습니다).
   `componentDidUpdate`는 이제 드럼을 건드리지 않습니다(asserted).
2. **아직 아무도 굴리지 않은 칸만** 맞춥니다(`scrollTop === 0`). 이미 굴린 칸은
   건드리지 않으므로 다툴 길이 아예 없습니다. 값이 00시/00분인 사람은 맞출
   자리도 0이라 아무 일이 없습니다.

폰에서 다시: 504(09:00)에서 열리고, 굴리면 672(12:00)로 가서 **2.5초 동안
그대로 있습니다.** 파생된 줄도 `12:00 → 21:00 · 9.0h`로 따라옵니다.

#### 시험이 자리로 칩을 집고 있었습니다 — 또

`suStartChips[0]`처럼 자리로 집던 두 줄이 목록이 바뀌면서 조용히 다른 것을
고르게 됐습니다. 값으로 찾도록 고쳤습니다. **마크업과 코드가 같은 칸 높이를
쓰는지도 셉니다** — `DRUM_ITEM`이 56인데 마크업이 60이면 굴린 자리를 잘못
세는데, 화면은 멀쩡해 보입니다.

13 new assertions (2035 → **2048**). 키는 그대로 777 — **새 문장이 없습니다**
(숫자와 `:` 뿐입니다). **임금 계산식은 손대지 않았습니다.**

**다음 사람에게.** 스크롤 위치를 코드로 정하는 자리에서는 **누가 마지막으로
움직였는가**를 물으십시오. 렌더마다 맞추면 손가락과 다투고, 그 다툼은
`componentDidUpdate`라는 자리 자체에서 나옵니다 — 값이 바뀔 때마다 다시 그리는
앱에서 '다시 그릴 때 맞춘다'는 곧 '근로자가 만질 때마다 되돌린다'입니다.

### 2026-08-29 (thirty-fifth) — 안 변하는 것이 아니라 무엇이 변하는지 말하지 않았습니다

두 가지가 더 나왔습니다. 하나는 고를 것이 모자란 것이고, **하나는 앱이 맞게
계산하면서 왜 그런지 말하지 않아 고장으로 읽힌 것**입니다.

#### 1. 시각은 30분 단위로 하루 전부, 굴러가는 상자에

`06 · 07 · 08 · 09` 네 개만 내어 놓으면 05:30이나 14:00에 시작하는 사람은 고를
것이 없습니다. `Component.HALF_HOURS` 마흔여덟 개를 네 칸 격자에 넣고
`max-height:212px; overflow-y:auto`로 굴립니다. 손으로 치는 칸은 그대로 두었고,
**그 칸이 지금 고른 값을 보여 주므로** 상자를 굴려 찾지 않아도 현재 값은 보입니다.

**물음이 열려 있을 때만 만듭니다**(`setupStep === 1`). 시계는 1초마다 도는데
아흔여섯 개를 늘 만들 이유가 없습니다(asserted: 닫혀 있으면 길이 0).

#### 2. 교대에서 주간의 끝이 안 움직인다 — 계산은 맞았습니다

근로자의 말: *주간 시작을 아무리 바꿔도 '평소 하루는 여기서 끝납니다'가 그대로
18:00입니다.* 재현해 보니 그 폰의 야간 시작이 18:00이었습니다.

**교대의 `normalEnd('day')`는 야간이 시작하는 자리입니다**(2026-08-18 둘째).
두 조가 서로 넘겨받으니까 그렇습니다. 그래서 주간 시작을 바꿔도 주간의 끝은
야간 시작에 묶여 있고, **움직이는 것은 야간의 끝**입니다:

```
dayStart 09:00 → 주간 끝 21:00 · 야간 끝 09:00
dayStart 06:00 → 주간 끝 21:00 · 야간 끝 06:00   ← 움직인 것은 이쪽입니다
```

**고칠 것은 계산이 아니라 화면이었습니다.** 두 가지를 더했습니다.

- **시간 수를 함께 적습니다** — `06:00 → 18:00 · 12.0h`. 야간 시작을 안 당긴
  채 주간만 06:00으로 옮기면 `06:00 → 21:00 · 15.0h`가 되어, 짝이 어긋난 것이
  숫자로 바로 보입니다. `Component.spanH(a, z)` 한 자리에서 셉니다.
- **교대일 때만 빨간 상자로 말합니다** — *두 조가 서로 넘겨받습니다. 주간이
  끝나는 자리가 곧 야간이 시작하는 자리입니다. 그래서 주간 시작을 바꾸면 야간의
  끝이 따라 움직입니다.* 주간만·야간만에는 뜨지 않습니다(asserted).

#### 폰이 또 하나 잡았습니다 — 화면은 마크다운을 그리지 않습니다

그 안내를 쓰면서 `**야간의 끝**`이라고 적었더니 폰에 **별 두 개가 그대로
찍혔습니다.** 템플릿은 문자열을 글자 그대로 내보냅니다.

여덟 개 언어를 훑어 `**`를 걷어냈고, **STR 전체에 별표 강조가 남아 있지 않은지
세는 시험**을 걸었습니다. 서른세째의 '없는 키' 시험과 같은 종류입니다 — 값이
화면에 어떻게 나오는지는 렌더 시험도 바인딩 시험도 보지 않습니다.

#### 자리로 찾던 시험 둘이 또 걸렸습니다

`suStartChips[0]`, `suNightChips[1]`로 칩을 집고 있었는데, 목록이 네 개에서
마흔여덟 개로 늘면서 다른 것을 고르게 됐습니다. **자리가 아니라 값으로
찾습니다**(`find(x => x.t === '06:00')`) — 목록이 또 바뀌어도 조용히 다른 것을
시험하지 않습니다.

31 new assertions (2004 → **2035**). 776 → **777 키**. **임금 계산식은 손대지
않았습니다** — `normalEnd()`도 `schedStart()`도 읽기만 하고, 더한 것은 시각
목록과 시간 수와 문장 하나입니다.

**폰에서 확인**(EN): 시각 상자가 30분 단위로 굴러가고 고른 것이 검게 반전됩니다.
교대에서 `06:00 → 18:00 · 12.0h`와 `18:00 → 06:00 · 12.0h`가 두 블록에 각각
붙고, 그 아래 넘겨받는다는 빨간 안내가 별표 없이 나옵니다. 근로자의 저장소는
백업 → 시험 → 복원했고 파싱한 JSON이 완전히 같습니다.

**다음 사람에게.** 근로자가 '안 변한다'고 하면 **정말 안 변하는지부터 재
보십시오.** 여기서는 앱이 맞게 계산하고 있었고, 변하는 곳이 근로자가 보고 있던
곳과 달랐을 뿐입니다. 그럴 때 고칠 것은 계산이 아니라 **무엇이 무엇에 묶여
있는지 화면이 말하게 하는 것**입니다.

### 2026-08-29 (thirty-fourth) — 네 물음이 절반만 묻고 있었습니다

서른세째를 폰에서 쓰고 만든 사람이 다섯 가지를 들고 왔습니다. 넷은 화면이
빠뜨린 것이고, **다섯째는 이름표가 계산과 다른 말을 하고 있던 것**입니다.

#### 1. 교대인데 시작을 하나만 물었습니다

교대를 고르고도 **야간 시작을 묻지 않았습니다.** 그 근로자는 자기 근무조의
절반만 앱에 말한 셈이고, `schedStart('night')`은 주야 판정과 `normalEnd`에 모두
들어가므로 비워 두면 21:00이 조용히 쓰입니다. 이제 근무조에 따라 갈라집니다 —
주간만은 주간만, 야간만은 야간만, 교대는 둘 다(asserted).

#### 2. 시작만 묻고 끝을 말해 주지 않았습니다

**퇴근 시각 설정은 만들지 않았습니다.** 2026-08-18이 적어 둔 그대로입니다 —
퇴근은 지문으로 찍는 것이지 선언하는 것이 아닙니다. 그런데 시작만 묻고 끝을
말해 주지 않으면 화면이 절반만 물은 것처럼 보입니다.

그래서 **앱이 이미 알고 있는 것을 적습니다**: `normalEnd(kind)`. 9시 시작에
점심 한 시간이면 `09:00 → 18:00`, 교대라면 `09:00 → 21:00`(다른 조가 시작하는
자리). 아래에 한 문단으로 왜 그것이 퇴근 시각이 아닌지 적었습니다.
**`DEFAULTS`에 `dayEnd`가 생기지 않았는지 시험이 지킵니다.**

#### 3. 뒤로 갈 수 없었습니다

2/4에서 1/4로 돌아갈 방법이 없었습니다. `‹ 뒤로`가 모든 화면에 있고, **첫
화면에서 뒤로 가면 소개로 돌아갑니다** — 어느 화면에서도 갇히지 않습니다.

#### 4. 휴게 시각을 고칠 수 없었고, 보이는 꼴도 싸구려였습니다

`11:30–12:30, 17:00–17:30` — 쉼표로 이어 붙인 문자열 한 줄이었고 고칠 수도
없었습니다. 이제 **설정과 같은 `breakRows()`를 그대로 씁니다**: 줄마다 시각 두
칸, 길이(60m), ×로 지우기, `연장 시 ONLY IF LATE` 표, `+ 휴게 추가`. 교대면
주간·야간 두 벌이 각자 머리말을 답니다.

**새 렌더 값을 만들지 않았습니다** — `dayBreakRows`/`nightBreakRows`가 이미
있었고, 그것을 쓰면 잔업 휴게의 표도 자동으로 따라옵니다. 프리셋 둘(30분·없음)은
줄 아래로 내려가 부 단추가 됐고, 주 단추는 `다음`입니다.

#### 5. 이름표가 계산과 다른 말을 하고 있었습니다 — 이번의 알맹이

칩이 이렇게 적혀 있었습니다:

```
1 → 말일      11 → 말일      21 → 말일
```

**11일에 시작해서 말일에 끝나는 급여기간 같은 것은 없습니다.** 그것은 스무 날
입니다. 21일에 시작하는 기간은 **다음달 20일**에 끝납니다 — 그리고 `period()`는
처음부터 그렇게 계산하고 있었습니다. **틀린 것은 계산이 아니라 이름표뿐이었고,
화면이 앱 자신의 산수를 잘못 옮겨 적고 있었습니다.**

`Component.periodEndDay(d)` / `periodEndText` / `periodLabel` — 끝나는 날을 한
곳에서만 만듭니다(`d === 1`이면 말일, 아니면 `d − 1`). 그리고 **시험이 그것을
`period()`에 직접 물어 확인합니다**: 시작일을 넣고 `period()`가 실제로 끝내는
날짜를 읽어 이름표와 맞춰 봅니다(1·11·21·26일). 이름표가 다시 거짓말을 하려면
`period()`도 함께 틀려야 합니다.

근로자가 물은 그대로 시작하는 날과 끝나는 날을 나란히 적습니다 —
`시작 21일 · 끝 20일`, 그 아래 실제 날짜로 `08.21 → 09.20 · 지급일 10.10`.

36 new assertions (1968 → **2004**). 769 → **776 키**. 되돌려 돌리니 여덟 줄이
실패하고, 그 가운데 셋이 근로자가 본 그 이름표입니다(`11일 ~ 말일`).
**임금 계산식은 손대지 않았습니다** — `period()`도 `normalEnd()`도 읽기만 합니다.

**폰에서 확인**(EN, 손가락): 교대를 고르니 주간·야간 두 벌의 칩과 각각의
`A NORMAL DAY ENDS AT 09:00 → 21:00` / `21:00 → 09:00`. 휴게 칸을 손가락으로
눌러 자판이 올라오고(`visualViewport` 832 → 473) `13:15`로 고쳐 저장됐으며,
**표가 붙은 저녁 휴게는 그대로**입니다. 급여기간 칩이 `Day 21 → day 20 next
month`, 누르니 `Starts day 21 · ends day 20` · `Pay period 08.21 → 09.20`.
근로자의 저장소는 백업 → 시험 → 복원했고 파싱한 JSON이 완전히 같습니다.

**다음 사람에게.** 화면에 날짜나 시각의 **범위**를 적을 일이 생기면, 그 범위를
손으로 적지 말고 **그것을 실제로 계산하는 함수에서 꺼내십시오.** 여기서는
`period()`가 처음부터 맞았는데 화면이 옮겨 적으면서 틀렸습니다. 그리고 그
이름표를 시험할 때는 문자열을 비교하지 말고 **계산하는 쪽에 직접 물어보십시오.**

### 2026-08-29 (thirty-third) — 환영 화면 다음이 여덟 묶음짜리 설정이었습니다

소개 카드 1번은 이렇게 말합니다: **먼저 설정할 것은 없습니다.** 그래 놓고 START가
설정 탭으로 내보내고 있었고, 그 화면에는 묶음이 여덟 개 있었습니다.

가장 분명한 표시는 앱 자신의 안내문이었습니다 — `tour_setup_next`가
*'설정이 다음입니다. 지금 다 채우지 않아도 됩니다'*라고 **미리 사과하고**
있었습니다. 문장이 화면을 대신 변명하고 있으면 그 화면이 틀린 것입니다.

#### 한 화면에 하나씩, 넷

| | 묻는 것 | 왜 이것인가 |
|---|---|---|
| 1 | 근무조와 시작 시각 | 앱이 스스로 알아낼 수 없는 **단 하나** |
| 2 | 무급 식사 휴게 | 무급 시간은 실근무에서 그대로 빠집니다 |
| 3 | 기본금 | 앱의 모든 금액이 여기서 나옵니다 |
| 4 | 급여기간과 월급날 | 법이 정하지 않습니다 — §17은 계약서에 쓰라고 할 뿐입니다 |

**모든 화면에 건너뛰기가 있고, 전부 건너뛰어도 끝납니다**(asserted). 마지막
화면이 셋을 요약하고 — 서른두째의 `SET_NEEDED`를 그대로 씁니다, 설정과 갈라질
길을 만들지 않습니다 — 출퇴근으로 내보냅니다.

`setupStep`은 **저장하지 않습니다.** 도중에 앱을 닫으면 다음에 처음부터입니다.
넷을 묻는 데 아홉 번이면 되므로, 어디에선가 멈춰 있는 것보다 다시 묻는 편이
낫습니다. 끝까지 가면 `setupDone`이 참이 되고 다시 뜨지 않습니다 — **지워진
오버레이가 남긴 죽은 값을 여기서 되살렸습니다**(스무일곱째가 적어 둔 그것).

#### 고른 것 자체가 확인입니다

`shiftOpts`의 세 단추가 이제 `shiftConfirmed`도 함께 켭니다. **설정에서 근무조를
고른 사람도 ✓ 를 받습니다** — 예전에는 주간만을 골라도 값이 기본값과 같아
서른한째의 물음이 계속 떴습니다. 시각 칩과 급여기간 칩도 같습니다.

#### 2번은 첫 줄만 건드립니다 — 이것이 이번의 알맹이입니다

Q1에서 교대를 고르면 `breaksFor('both')`가 **저녁 휴게를 표(`ot: true`)와 함께**
씨앗으로 넣습니다. 그 줄은 잔업하는 날에만 빠지는 다른 줄입니다(스물아홉째).
Q2가 '휴게'를 통째로 갈아 치우면 그 사람은 그 표를 손으로 다시 달아야 합니다.

그래서 **30분**도 **없음**도 `breaksDay[0]` 하나만 건드립니다. 폰에서 확인한
그대로입니다:

```
교대 선택 → 11:30–12:30, 17:00–17:30(ot)
30분 누름 → 11:30–12:00, 17:00–17:30(ot)   ← 저녁 휴게 그대로
```

**'맞습니다'는 `breaksTouched`를 켜지 않습니다.** 지금 값이 맞다는 뜻이지, 앞으로
근무조를 바꿔도 따라오지 말라는 뜻이 아닙니다. 켜는 것은 실제로 고친 두 단추뿐
입니다(asserted).

#### 4번은 기록이 있으면 경고합니다 — 열려 있던 자리를 닫았습니다

`wageKey(P)`도 `slipKey(P)`도 기간 시작일이라, 시작일을 바꾸면 이미 찍힌 임금
기준과 저장된 명세서 대조가 **어느 기간과도 맞지 않게 됩니다.** 첫날에는 기록이
0일이라 공짜이고, **그것이 이 물음을 첫 화면에 두는 가장 센 이유입니다.**
`periodBackMax() > 0`이면 빨간 상자로 말합니다 — 다만 **막지는 않습니다**.

#### 폰이 잡은 것 셋 — 헤드리스로는 하나도 안 보였습니다

1. **단계 표시가 `N_OF_4`로 찍혔습니다.** `this.T('n_of_4', …)`를 쓰고 그 키를
   만들지 않았습니다. **`T()`는 없는 키에 던지지 않고 키 이름을 돌려줍니다** —
   그래서 `bind.js`도(홀이 채워졌는지만 봅니다), 여덟 언어 렌더도(throws:0)
   이것을 잡지 못합니다. 숫자와 빗금뿐이라 애초에 번역할 것이 없었습니다.
2. **첫 화면에서 앞으로 가는 길이 '건너뛰기'뿐이었습니다.** 근무조를 골라도
   넘어가지 않아서, 주 동작이 SKIP처럼 읽혔습니다.
3. **마지막 화면에 건너뛰기가 남아 있었습니다.** 큰 단추와 같은 일을 하는 두
   번째 단추이고, 그 하나를 '건너뛰기'라고 부르면 거짓말입니다.

**1번 때문에 새 시험을 하나 걸었습니다** — 소스에서 `this.T('키')`를 전부 긁어
그 키가 `STR`에 실제로 있는지 셉니다(이어 붙여 만드는 `this.T('flt_' + f)` 꼴은
닫는 따옴표 뒤가 `,`나 `)`인 것만 세어 걸러냅니다). **이 앱에서 없는 키는 조용히
키 이름으로 화면에 나옵니다. 그 종류를 이제 시험이 잡습니다.**

#### 자리를 재던 시험 둘이 또 걸렸습니다

`{{ shiftOpts }}`와 `{{ L.secStarts }}`를 **네 물음의 첫 화면에서도** 쓰는데,
그쪽이 소스에서 훨씬 앞입니다. 구간을 안 박고 `indexOf`만 쓰면 설정을 잰다고
생각하면서 소개 흐름을 재게 됩니다 — 스물일곱째의 `{{ L.lBasic }}`과 똑같은
자리이고, 그 두 줄이 실제로 그 자리에서 실패했습니다. **마크업에서 자리를 잴
때는 구간부터 못 박으십시오.**

76 new assertions (1891 → **1968**), 그리고 START의 목적지를 붙들고 있던 두 줄과
자리를 재던 두 줄을 새 동작으로. 750 → **769 키**. 되돌려 돌리니 아홉 줄이
실패합니다. **임금 계산식은 손대지 않았습니다** — 전부 건너뛴 폰과 갓 깐 폰이
같은 답을 낸다는 것까지 함께 봅니다.

**폰에서 확인**(EN, 손가락 탭): 환영 → `1 / 4` 근무조(교대 선택 → 저녁 휴게가
표와 함께 따라옴) → `2 / 4` 휴게(30분 → 첫 줄만 줄고 저녁은 그대로) → `3 / 4`
기본금(확인) → `4 / 4` 급여기간(21일 · 25일) → 마지막 화면이 `✓ Rotating ·
09:00 / 21:00` · `✓ ₩10,320/h` · `✓ 08.21 → 09.20 · 09.25`, 그리고 START
PUNCHING이 출퇴근으로 내보내고 `setupDone`이 참이 됐습니다. 근로자의 저장소는
백업 → 시험 → 복원했고 파싱한 JSON이 백업과 **완전히 같습니다.**

#### 다음 사람에게

- **첫 층 세 줄은 아직 서랍을 엽니다.** 이 화면들을 열게 하면 설정 쪽 마크업이
  한 벌 없어지는데, 서랍에는 휴게 줄·야간 시작·연장 휴게 프리셋처럼 이 화면에
  없는 것이 더 있습니다. **단순한 화면으로 갈아 끼우면 그것들이 닿을 데가
  없어집니다** — 옮기려면 그 차이부터 메우십시오.
- 남은 것은 **C**(필요해지는 자리에서 묻기)와 **E**(명세서 대조에 국민연금 한 줄)
  입니다. E는 국민연금 줄이 없는 근로자에게는 닿지 않는다는 것을 기억하십시오.

### 2026-08-29 (thirty-second) — 여덟 묶음이 똑같은 무게로 서 있었습니다

서른한째의 다음 걸음입니다. 설정 탭의 문제는 길이가 아니었습니다 — **무엇을
손대야 하는지 말하는 것이 화면에 하나도 없었다**는 것입니다. 여덟 묶음이 같은
크기, 같은 화살표, 같은 요약으로 나란히 서 있으면 새로 깐 사람은 어느 것이 자기
것인지 알 수 없어 **하나도 손대지 않습니다.**

#### 세 층으로 갈랐습니다 — 감춘 것이 아니라 순서를 매긴 것입니다

| 층 | 묶음 |
|---|---|
| **앱이 꼭 알아야 하는 것** | 근무조와 휴게 · 내 급여 조건 · **급여기간과 월급날** |
| 더 정확하게 | 수당과 공제 · 4대보험과 세금 · 회사 규칙 · 내 정보 |
| 언어 · 파일 · 법적 고지 | 언어 · 백업과 내보내기 |

**아홉 묶음이 전부 그대로 있고 칸도 하나 사라지지 않았습니다**(asserted, 열 개의
홀을 이름으로 셉니다). 이 앱은 증거를 만듭니다 — 임금체불 진정 중인 근로자가
설정을 열었을 때 칸이 없어져 있으면 안 됩니다.

#### 급여기간이 자기 묶음을 갖습니다

`급여기간 시작일`과 `월급날`이 **회사 규칙에서 나왔습니다.** 그 둘은 법이
정하지 않습니다 — 근로기준법 제17조가 *계약서에 쓰도록* 정할 뿐이라 회사마다
다르고, **어떤 기본값도 맞을 수 없습니다.** 209시간이나 ×1.5, 보험 요율과는
성격이 다릅니다. 회사 규칙에 묻혀 있을 값이 아닙니다.

회사 규칙 요약도 따라 바뀌었습니다 — `08.01 → 08.31`이 아니라
`잔업 ×1.5 · 휴업 70%`, 그 묶음에 실제로 남은 것을 말합니다.

#### '나는 다 한 것입니까'에 답합니다

맨 위 한 줄, 그리고 첫 층 세 묶음의 요약 앞에 `✓` / `!`.

**값의 모양으로는 가를 수 없습니다.** 09:00 주간조도, 1일~말일에 10일 지급도,
최저임금 그대로인 기본금도 **전부 실제로 흔한 답**입니다. 그래서 셋 다 '정했다'는
사실을 따로 적습니다 — `shiftConfirmed`(서른한째) · `basicConfirmed`(여덟째) ·
새 `periodConfirmed`. 급여기간은 근무조와 같은 방식으로 묶음 안에서 한 번
누르면 확인됩니다.

**판단은 `Component.SET_NEEDED` 한 곳에서만 합니다.** 요약 줄과 맨 위 상태가
갈라질 길을 아예 만들지 않습니다. `기본금`은 확인해도, 본인 숫자를 적어도 '정한
것'입니다(둘 다 asserted).

**쓰던 사람은 셋 다 정한 것으로 셉니다** — 저장본에 `periodConfirmed`가 없으면
`true`입니다(`breaksTouched`·`tourSeen`과 같은 근거). 폰에서 확인했습니다.

#### 시험이 헛통과했습니다 — 이번 것은 적어 둘 값어치가 있습니다

`!`를 빨갛게 만들어 놓고 폰에서 보니 **회색이었습니다.** `renderVals()`는
`var(--color-accent)`를 내고 있었고, 그 값을 보는 시험도 통과했습니다.

**마크업이 그 값을 쓰지 않았습니다.** 스무째가 빨간 줄을 성명 하나로 묶어 두면서
`{{ gMeSumInk }}`만 홀로 만들고 **나머지 여덟 줄은 색을 하드코딩**해 두었기
때문입니다. 값은 맞고 화면에는 닿지 않는, 가장 잡기 어려운 종류입니다.

**그래서 이제 마크업을 셉니다** — 첫 층 세 줄이 `{{ gXSumInk }}`를 실제로 쓰는지
소스에서 확인하고, 그 다음에 값이 빨간지 봅니다. **`renderVals()`에 새 색이나 새
값을 만들 때는 템플릿이 그것을 쓰는지 함께 세십시오.** 스물여덟째의 이스케이프
헛통과와 같은 자리입니다.

#### 예전 동작을 붙들고 있던 열 줄을 새 동작으로 고쳤습니다

전부 자리를 재던 것들입니다. 특히 **`근무조 묶음의 끝`**은 스물여덟째가
*'끝은 바로 다음 묶음'*이라고 적어 둔 그 줄인데, 층이 생기면서 '바로 다음'이
수당에서 **내 급여 조건**으로 바뀌어 그 자리에서 실패했습니다 — 적어 둔 대로
잡혔습니다. **이름이 아니라 순서를 재십시오.**

`내 정보`가 '더 정확하게'로 내려간 것도 여기입니다. 스무째는 여덟 묶음이 나란한
화면에서 *'가장 먼저 만나는 자리'*를 우선순위로 썼는데, 이제 층이 그 일을 합니다.
**성명은 어떤 금액도 바꾸지 않습니다** — 다만 접혀 있어도 빨갛게 말하는 것은
그대로이고, 그것이 스무째가 실제로 지키려던 것입니다(asserted).

102 new assertions (1789 → **1891**), 그리고 기존 열 줄을 새 동작으로. 740 →
**750 키**. `yes_this_is_my_shift`는 급여기간도 같은 단추를 쓰게 되어
`yes_this_is_right`로 이름을 바꿨습니다(키 수는 그대로). **첫 층 상태 논리를
되돌려 돌리니 일곱 줄이 실패합니다** — 헛통과하는 시험이 아닙니다.

**임금 계산식은 손대지 않았습니다** — 바꾼 것은 무엇이 어느 층에 있는가와 요약
줄이 무엇을 말하는가이므로 v1 등가 증명은 그대로 통과합니다.

**폰에서 확인**(EN, 실제 기록 0일): 맨 위가 빨갛게 `2 of 3 set. The ones still
open are marked ! below.`, 첫 층이 `✓ Day only · 09:00` / `! ₩10,320/h`(실제로
`rgb(236,48,19)`) / `✓ 08.01 → 08.31 · 09.10`, 그 아래 두 층과 법적 고지·정보가
그대로입니다. 근로자의 저장소는 백업 → 시험 → 복원했고 파싱한 JSON이 같습니다
(앱이 스스로 붙인 `periodConfirmed: true` 하나만 늘었습니다).

#### 다음 사람에게

- **다음은 첫 번째 판(Proposal A)입니다** — 환영 화면 다음을 설정 탭이 아니라
  네 개의 한 화면 질문으로. 첫 층 세 줄이 그 화면들을 그대로 열게 하면 설정 쪽
  마크업이 한 벌 없어집니다. `setupDone`과 `finishSetup()`은 지워진 오버레이가
  남긴 죽은 코드라, 그때 '다 물었다'는 뜻으로 되살리면 됩니다.
- **`periodStart`를 나중에 바꾸면 조용히 어긋납니다.** `wageKey(P)`는
  `isoDay(P.s)`, `slipKey(P)`는 `keyOf(P.s)`라 시작일이 바뀌면 이미 찍힌
  `wageLog`와 저장된 명세서 대조가 **어느 기간과도 맞지 않게 됩니다.** 이제
  급여기간이 자기 묶음이 되어 더 눈에 띄므로, `payBackMax() > 0`일 때 경고를
  붙이는 일이 전보다 급해졌습니다.

### 2026-08-29 (thirty-first) — 단추 위에 아홉 줄이 서 있었습니다

만든 사람의 말입니다: **내가 이 앱을 만들지 않았다면, 그냥 쓰는 E-9 근로자였다면
설치 직후의 설정이 너무 많아 보였을 것입니다. 그냥 출퇴근을 찍고 얼마 받는지
알고 싶은 사람에게는 부담입니다.**

폰에 깔린 앱을 근로자의 눈으로 훑고 CDP로 재 보니 **설정 탭은 다 펼쳐서 9.8화면,
글자 칸 23개, 낱말 1,859개**였습니다(`scrollHeight 6599 ÷ clientHeight 674`).
그런데 이번에 고친 것은 그 설정 탭이 아닙니다. **매일 여는 화면이 먼저였습니다.**

#### 1. 지문 패드 위에 법조문 아홉 줄이 서 있었습니다

출퇴근 탭을 열면 특근·×1.5·×0.5·22:00–06:00·30분 올림이 회색 문단으로 아홉 줄,
그 아래에 비로소 패드가 있습니다. 근로자가 그 화면을 여는 이유는 **지문을 찍기
위해서**입니다.

**문장은 한 조각도 고치지 않고 두 묶음으로 나눴습니다.**

| | 무엇 | 어디 |
|---|---|---|
| `detectReason` | 무급 휴게 · 언제부터 유급인지 · **오늘이 특근인지** | 그대로 위에 |
| `detectWhy` | 근무조를 고른 근거 · 법정 배수 설명 | `왜 이렇게 계산됩니까?`로 접힘 |

66자 대 163자입니다. **나누기만 했으므로 여덟 개 언어에서 새로 쓴 문장이 없고,
합치면 예전과 같은 글자입니다**(asserted, 조각마다).

**특근은 접지 않습니다.** 그 하루는 전 시간이 ×1.5라, 눌러 보아야 알 수 있는 곳에
두면 안 되는 사실입니다. 시험이 양쪽을 다 봅니다 — 특근이라는 **사실**은 위에,
특근의 **배수 설명**은 접힌 쪽에.

`state.whyOpen`은 저장하지 않습니다 — `setOpen`·`rsnOpen`·`jumpOpen`과 같은
화면 상태입니다. **근무중 갈래는 손대지 않았습니다**(`detectWhy`가 빈 문자열이라
토글 자체가 그려지지 않습니다).

#### 2. 아무것도 판별하지 않고 '자동판별'이라고 말했습니다

`SHIFT DETECTED · DAY 09:00 start`. 판별한 것이 없습니다 — `DEFAULTS.shifts`입니다.
06:00에 시작하는 사람은 앱이 **자신 있게 틀린 말**을 하는 것을 보고 자기 앱이
아니라고 읽습니다.

**`isDef`만으로는 가를 수 없습니다.** 정말로 09:00 주간조인 사람은 값을 바꿀 것이
없어서, 아무것도 정하지 않은 사람과 값으로는 똑같습니다. **기본금이 최저임금과
같아 영영 물어보던 그 자리와 정확히 같습니다**(2026-08-18 여덟째). 그래서 같은
방식으로 `settings.shiftConfirmed`가 사실 자체를 적습니다.

- 정한 적 없으면 머리말이 `근무조 가정값 · ASSUMING A SHIFT`가 되고, 아래에
  `맞습니다` / `고치기` 두 단추가 붙습니다. **한 번 누르면 다시 묻지 않습니다.**
- **근무중에는 묻지 않습니다** — 이미 찍은 사람에게 설정을 물을 자리가 아닙니다.
- **쓰던 사람에게 새 질문이 생기지 않습니다.** 저장본에 키가 없으면 `true`로
  봅니다 — `breaksTouched`·`tourSeen`과 같은 근거입니다(`:2210`). 폰에서
  확인했습니다: `adb install -r` 뒤 저장된 설정이 `shiftConfirmed: true`로
  올라왔고 물음은 뜨지 않았습니다.
- **확인해도 금액은 한 푼도 움직이지 않습니다**(asserted). 물어보는 것과 계산은
  별개입니다.

#### 3. 하루도 적지 않은 폰이 연차 `15 / 15`라고 빨갛게 말했습니다

기록 0일, 입사일도 없고 잔여를 적은 적도 없는 폰입니다. **열한째가 대장에서 지운
그 거짓말을 출퇴근 화면이 그대로 하고 있었습니다.** `annualBase`·`annualTotal`이
둘 다 씨앗 그대로이고 `annualAsOf`도 비어 있으면 `—`입니다.

**`annualLeft()`는 한 글자도 바꾸지 않았습니다.** 그것은 숫자를 돌려주어야 하는
함수이고, 대장의 **사용**이 `max(0, 발생 − 잔여)`로 거기서 뺍니다. `'—'`를
돌려주면 그 산수가 오염되고 근무내역서에 문자열이 들어갑니다. **바꾼 것은
`renderVals()`가 화면에 무엇을 적는가뿐입니다**(asserted, 함수는 여전히 15).

#### 시험을 떨어뜨려 봤습니다

64 new assertions (1725 → **1789**). 735 → **740 키**. 고치기 전 동작으로 되돌려
돌리니 **열두 줄이 실패**했고 세 가지를 모두 덮습니다 — 헛통과하는 시험이 아닙니다.

처음 쓴 것 가운데 둘은 **고치기 전에도 통과**했습니다: '특근은 접히지 않는다'와
'언제부터 유급인지는 접히지 않는다'. 예전에는 `detectReason`에 전부 들어 있었으니
당연합니다. **한쪽에 있다는 것만으로는 나뉜 것을 증명하지 못합니다** — 반대 방향
(`detectWhy`에는 없는지)을 함께 걸고 나서야 열두 줄이 됐습니다.

**임금 계산식은 손대지 않았습니다** — `calc()`·`snapIn`/`snapOut`·`rate()`·배수
어디에도 닿지 않아 v1 등가 증명은 그대로 통과합니다.

**폰에서 확인**(EN, 실제 기록 0일): 패드 위가 세 줄로 줄고 `WHY IS IT COUNTED
THIS WAY? ▸`를 손가락으로 누르니 나머지가 펴집니다. 연차는 `—`. `shiftConfirmed`를
false로 두니 `ASSUMING A SHIFT`와 두 단추가 뜨고, `Yes, this is right`를 한 번
누르니 설정에 남고 머리말이 `SHIFT DETECTED`로 돌아왔습니다. 근로자의 저장소는
백업 → 시험 → 복원했고, 파싱한 JSON이 백업과 완전히 같습니다(앱이 스스로 붙인
`shiftConfirmed: true` 하나만 늘었습니다).

#### 다음 사람에게 — 아직 안 한 것

- **설정 탭은 그대로 여덟 묶음입니다.** 다음은 그것을 *앱이 꼭 알아야 하는 것*
  (근무조·휴게·기본금·급여기간) / *더 정확하게* / *언어·파일·법적 고지* 세 층으로
  가르는 일입니다. `setupDone`과 `finishSetup()`은 지워진 오버레이가 남긴 죽은
  코드라, 그 작업에서 '넷을 다 물었다'는 뜻으로 되살리면 됩니다.
- **근무중 갈래의 문장 몇 개가 번역되지 않았습니다.** `:4711` 언저리에서
  `'Logged in at '`, `'Next unpaid break '`, `'All breaks for this shift are
  done…'`가 **문자열 연결로 박혀 있습니다.** 베트남어로 읽는 근로자가 그 자리에서
  영어를 봅니다. 이번 변경과 무관해서 건드리지 않았지만, `T()` 키로 옮겨야 합니다.
- **급여기간(`periodStart`)을 나중에 바꾸면 조용히 어긋납니다.** `wageKey(P)`는
  `isoDay(P.s)`이고 `slipKey(P)`도 `keyOf(P.s)`라, 시작일을 바꾸면 이미 찍힌
  `wageLog`와 저장된 명세서 대조가 **어느 기간과도 맞지 않게 됩니다**
  (`wageFor()`가 `recovered`/`unknown`으로 떨어집니다). 설정에서 그 값을 고치는
  자리에는 `payBackMax() > 0`일 때 경고가 필요합니다.

### 2026-08-28 (thirtieth) — 환영 화면보다 먼저 다른 페이지가 한 번 스쳤습니다

만든 사람이 백업을 뜬 뒤 폰의 앱 데이터를 지우고 새 사용자가 보는 것을 확인하다
말했습니다: **처음 여는데 환영 화면이 뜨기 전에 다른 페이지가 아주 짧게 번쩍입니다.
너무 빨라서 보통 사람은 신경 쓰지 않겠지만 개발자로서는 거슬립니다.**

거슬려야 맞습니다. 그리고 **눈으로 좇을 수 없는 것은 추측하지 말고 녹화해야
합니다.** 헤드리스에 CDP 화면 녹화를 붙이고 CPU를 8배 느리게 해서 부팅을 잡았더니
앱이 아닌 화면이 **셋**이었습니다.

| | 언제 | 무엇 |
|---|---|---|
| 1 | ~180ms | 번들러의 크림색(#faf9f5) 화면 — 붉은 상자에 든 지문 섬네일이 **왼쪽 위 구석**에 작게 얹혀 있고, 오른쪽 아래에 영어로 `Unpacking...` |
| 2 | ~196ms | **맨 흰 화면** |
| 3 | ~760ms | **디자인 토큰 없이 그려진 앱** — 환영 화면 너머로 출퇴근 탭이 그대로 비쳐 보입니다 |

#### 셋째가 알맹이입니다 — var()가 비면 '기본값'이 아니라 **투명**입니다

`ds-tokens.css`는 앱의 `<helmet>`이 링크하는 `_ds/…/styles.css` 자리에 자산으로
등록되어 있습니다. 그 링크는 **dc 런타임이 컴포넌트를 붙인 뒤에** 문서에 넣고,
가리키는 곳이 blob URL이라 비동기로 옵니다. 그래서 React가 그리는 **첫 프레임에는
`--color-*`가 하나도 없습니다.**

```css
background: var(--color-bg);   /* --color-bg가 없으면 → invalid at computed-value time */
```

이것은 '배경이 기본값이 된다'가 아니라 **배경이 사라진다**는 뜻입니다. 그런데
환영 화면은 출퇴근 탭 **위에 덮은 전면 오버레이**(`position:absolute;inset:0`)라,
그 한 프레임 동안 근로자는 **두 화면이 겹쳐 그려진 것**을 봅니다. 그것이 번쩍임의
정체입니다.

고친 곳은 앱이 아니라 **`build.py`**입니다. 같은 `ds-tokens.css`를 head에
`<style>`로 함께 박습니다(2KB). 문서와 함께 파싱되므로 **토큰이 없는 프레임이
아예 없습니다.** `_ds` 자산은 그대로 둡니다 — 헬멧이 여전히 그 href를 링크하고,
두 벌 다 한 빌드에서 같은 파일로 만들어지므로 어긋날 길이 없습니다.

둘째(흰 화면)도 같은 `<style>`에서 끝납니다 — `html, body`의 배경이 이제 문서와
함께 옵니다. 예전에는 그 선언이 앱의 `<helmet>` 안에 있어서, 로더가
`documentElement`를 갈아 끼운 순간부터 런타임이 헬멧을 처리할 때까지 흰색이었습니다.

첫째는 셸의 화면이므로 셸의 CSS를 덮습니다: 바탕색을 `#f3f2f2`로, 섬네일은
`display:none`. **`Unpacking...`은 지우지 않고 늦췄습니다** — `setStatus()`가 풀기
실패를 적는 **유일한 자리**라 없애면 실패가 조용해집니다. `opacity:0`에 0.6초
지연 애니메이션을 걸어, 그 안에 끝나면 보이지 않고 그보다 오래 걸리거나 실패하면
그때 나타납니다. **로더 스크립트는 여전히 바이트 그대로입니다** — 덮은 것은 셸의
표현용 CSS뿐입니다.

#### `build.py`에서 한 번 스스로 틀렸습니다, 적어 둡니다

셸에 CSS를 끼워 넣는 코드를 처음에 **`island()`가 오프셋을 잰 뒤에** 두었습니다.
`out = shell[:m.start(1)] + … `로 섬을 갈아 끼우는 구조라, 앞쪽 head에 글자를
넣으면 **그 뒤 모든 섬의 오프셋이 밀립니다.** 빌드가 조용히 깨진 파일을 내놓습니다.
셸을 건드리는 일은 **`island()`를 부르기 전에** 해야 합니다.

#### 시험은 앱이 아니라 **빌드 결과물**을 봅니다

바꾼 것이 소스가 아니라 `build.py`의 산출물이므로 `test/regress.js`가 아니라
**`test/boot.js`**입니다(18 assertions, `dist`와 `dist-v2` 양쪽). 토큰이 `<body>`
앞의 head에 있는지, `ds-tokens.css`의 변수 19개가 하나도 빠짐없이 들어갔는지(개수를
이름에 찍어 둡니다 — 스물여덟째의 헛통과), `html/body`가 곧바로 앱 바탕색인지,
로더 화면이 크림색이 아닌지, 섬네일이 안 그려지는지, 그리고 **진행 표시가 지워진
것이 아니라 늦춰진 것인지**(`setStatus('Error unpacking: '`가 소스에 그대로 있는지
함께 셉니다). `run.sh`에서 빌드 **다음에** 돕니다.

**떨어뜨려 봤습니다.** 고치기 전의 `dist/`에 대고 돌리니 아홉 줄 가운데 여덟이
실패했습니다 — 헛통과하는 시험이 아닙니다.

**폰에서 확인** — 여기서 방법을 한 번 틀렸습니다, 적어 둡니다. `adb shell
screenrecord`로 찍고 `ffmpeg -vf fps=30`으로 프레임을 뽑았더니 **고치기 전에도
번쩍임이 안 보였습니다.** screenrecord는 화면이 바뀔 때만 프레임을 내는
가변 프레임 파일이고, `fps=30`은 그것을 **다시 표집해서 짧은 프레임을
버립니다.** `-vsync 0`으로 담긴 프레임을 그대로 뽑으니 바로 나왔습니다:

- **고치기 전**: `t=2.165`에 **딱 한 프레임(약 16ms)**, 환영 화면 너머로 출퇴근
  탭의 지문 패드·`출근 · 길게 누르기`·아래 탭 다섯 개가 그대로 비칩니다.
- **고친 뒤**: 잠금 해제 → 회색 창 배경 ~166ms → **환영 화면이 완성된 채로 한
  번에**. 겹친 프레임이 없습니다.

근로자의 저장소는 백업 → 시험 → 되읽어 비교했고 파싱한 JSON이 백업과 완전히
같습니다(데이터를 지운 직후라 기록 0일, `tourSeen: false` 그대로).

**임금 계산식은 손대지 않았습니다** — 앱 소스는 한 글자도 바뀌지 않았고, 바뀐 것은
그 소스를 감싸는 페이지의 head뿐이라 v1 등가 증명은 그대로 통과합니다.

**다음 사람에게.** 화면에 무언가가 '번쩍인다'는 보고를 받으면 **눈이 아니라
프레임을 보십시오** — 헤드리스는 `Page.startScreencast` + `Emulation
.setCPUThrottlingRate`, 폰은 `screenrecord` + **`ffmpeg -vsync 0`**(`fps=` 필터를
쓰면 찾으려는 그 프레임을 버립니다). 그리고 이 앱에서 `var(--…)`를 새로 쓸 때는
**그 값이 첫 페인트에 있는지** 물으십시오. 없으면 그 선언은 기본값으로 되돌아가는
것이 아니라 **없어집니다.**

### 2026-08-28 (twenty-ninth) — 저녁 휴게는 잔업하는 날에만 먹습니다

근로자가 폰에서 네 가지를 들고 왔습니다. 셋은 버그였고, 넷째는 '이게 버그입니까'
라는 물음이었는데 답은 '계산은 맞고 문장이 틀렸다'였습니다.

#### 1. 근무조 안내가 언제나 주간만 이야기를 했습니다

주간만·야간만·교대 어느 것을 눌러도 아래 안내는 *'주간만 하는 사람은 야간 설정이
필요 없습니다'*였습니다. **교대를 고른 사람에게는 아예 반대말입니다** — 교대야말로
두 조를 다 적어야 하는 근무조입니다. `noteShifts`가 갈라지지 않는 리터럴 하나였고,
2026-08-18 일곱째가 적어 둔 그것과 같은 자리입니다: **같은 값에서 갈라지는 문장이
둘이면 둘 다 갈라져야 합니다.** 새 키 둘, 여덟 개 언어.

#### 2. 지운 저녁 휴게가 되살아났습니다

교대에서 17:00–17:30을 ×로 지우고 주간만을 눌렀다가 교대로 돌아오면 그 휴게가
돌아왔습니다. `breaksFor()`가 '갈아타도 되는지'를 **값의 모양**으로 판단했기
때문입니다 — 그런데 **교대에서 저녁 휴게를 지운 목록은 점심 하나만 남아, 주간만의
손대지 않은 기본값과 글자 하나까지 똑같습니다.** 모양으로는 '지웠다'와 '아직 안
건드렸다'를 구별할 수 없습니다.

그래서 `settings.breaksTouched`가 그 **사실 자체**를 적습니다. 시각을 고치거나 줄을
더하거나 지우거나 표를 달면 켜지고, 켜진 뒤로는 근무조를 아무리 오가도 앱이 휴게
목록에 손대지 않습니다. **쓰던 사람은 저장본이 있다는 사실만으로 `true`입니다** —
`tourSeen`과 같은 근거입니다(`:2185`). 그러지 않으면 이미 지워 둔 사람이 이 판을
깔자마자 근무조를 한 번 오갈 때 그 휴게를 되찾습니다.

#### 3. 12시간 교대라도 8시간에 가는 날이 있습니다 — 그 날은 저녁을 안 먹습니다

이번의 알맹이입니다. 근로자의 말: **9시부터 9시까지 도는 것이 보통이지만 잔업이
없는 날도 있습니다. 9시에 나와 6시에 가면 8시간이고, 그런 날에는 저녁을 먹지
않습니다.** 그런데 앱은 17:00–17:30을 겹치는 구간으로 보고 그대로 30분을 뺐습니다.

```
09:00 → 18:00   실근무 7.5h   ← 8.0h여야 합니다. 매일 30분씩 잃습니다.
```

**2026-08-18 그 항목의 `isOtBreak`은 자리로만 판단합니다** — normalEnd 뒤에 앉은
휴게. 9-6 공장의 18:00–18:30이 그렇고, 정시 퇴근한 날에는 겹치는 구간이 0이라
계산이 알아서 맞습니다. **그런데 교대의 저녁 휴게는 자리로 말할 수 없습니다**:
17:00은 8시간이 차기도 전이고(otMark 18:00), 교대의 normalEnd는 21:00입니다.
평소 하루 *안*에 앉아 있는데 잔업하는 날에만 쓰는 휴게라는 것이 있습니다.

그래서 줄에 **표**를 답니다(`b.ot`). 표가 붙은 휴게는 **그 날 실제로 잔업이
있었을 때만** 빠집니다.

```js
const base = gross - bkBase;          // 평소 휴게만 뺀 실근무
const late = base > 8;                // 8시간을 넘겨 일하고 있었는가
const bk   = bkBase + (late ? bkLate : 0);
```

| | 예전 | 지금 |
|---|---|---|
| 09:00 → 18:00 | 실근무 **7.5h** · 잔업 0 | 실근무 **8.0h** · 잔업 0 |
| 09:00 → 21:00 | 실근무 10.5h · 잔업 2.5 | 실근무 10.5h · 잔업 2.5 (그대로) |

**야간 시간에서도 같은 규칙입니다.** 05:00–05:30 같은 잔업 휴게는 22:00~06:00
한가운데에 있어서, 표를 무시하면 짧은 밤의 야간수당까지 깎입니다.

**표를 뗄 수 있어야 하므로 명시적인 `true`/`false`를 적습니다.** `undefined`로
되돌리면 자리로 판단하는 기본값이 이겨서, 뗀 것이 화면에 아무 일도 일으키지
않습니다 — 죽은 단추와 같습니다(2026-08-19 열째).

**되돌아 도는 것을 한 번 만들 뻔했습니다.** `otMark`은 '평소 하루에 8시간이 차는
자리'이므로 표 붙은 휴게를 세면 안 됩니다. 그런데 거기서 `isOtBreak`을 부르면
`normalEnd → otMark → isOtBreak`으로 무한히 돕니다. `otMark`은 **표가 명시적으로
붙은 것(`b[2] === true`)만** 건너뜁니다 — 자리로 잡히는 잔업 휴게는 normalEnd 뒤에
앉으므로 그 걸음이 8시간에서 멈추기 전에 닿지 않습니다.

**교대의 기본 저녁 휴게에는 표가 붙어서 나갑니다**(`BREAKS_12`). **다만 이미
저장된 줄은 고치지 않습니다** — 앱이 근로자의 휴게 설정을 말없이 바꾸면 그 뒤의
실근무가 함께 바뀝니다. 표는 근로자가 한 번 눌러서 답니다.

#### 4. 칩 옆의 빈자리를 눌러도 비과세가 뒤집혔습니다

수당 줄의 `TAXED`/`TAX-FREE` 칩에서 `onClick`이 **칩이 아니라 칩을 오른쪽으로 미는
가로 전체 상자**에 붙어 있었습니다 — 칩 왼쪽 260px가 전부 단추였습니다. 과세·비과세는
세금과 4대보험 기준을 바꾸므로 모르고 누르면 실수령 추정이 조용히 틀어집니다.
`onClick`과 `cursor:pointer`를 칩으로 옮겼습니다. **폰에서 잰 값으로 걸어 둔
assertion이 아니라 마크업에서 두 자리의 관계를 봅니다** — 미는 상자에 `r.tf`가
없고, 칩에 있는지.

#### 5. '계속근로 1년'은 재직기간이 아니라 문턱이었습니다

근로자가 물었습니다: **입사일을 2022년으로 바꿔도 '계속근로 1년을 넘겼습니다'
그대로인데, 이 1년은 내가 다닌 햇수입니까?** 아닙니다 — 근로자퇴직급여 보장법
제8조①의 **문턱**입니다. 금액은 처음부터 재직일수를 정확히 반영하고 있었습니다.

**틀린 것은 계산이 아니라 문장이 그 둘을 갈라 말하지 않은 것**이고, 그래서 4년
6개월을 다닌 사람도 자기 기록을 1년으로 읽었습니다. 열한째의 발생·사용·잔여와 같은
자리입니다 — 화면에 있는 숫자가 무엇을 말하는 숫자인지 문장이 밝혀야 합니다.
이제 `✓ 계속근로 4년 6개월 — 제8조①이 정한 1년을 넘겼습니다.` 여덟 개 언어.

#### 시험을 쓰다 두 번 스스로 틀렸습니다

**하나.** 짧은 밤의 야간 시간을 8.0으로 적었는데 7.0이 맞습니다 — 자정 휴게
00:00–01:00이 야간 구간 안에 있으니 그것은 빠집니다. **둘.** 자리로 잡힌 잔업
휴게의 표를 떼면 금액이 달라질 줄 알았는데 달라지지 않습니다 — 정시 퇴근한 날에는
겹치는 구간이 0이고, 잔업한 날은 어차피 `late`입니다. 달라지는 것은 **요약 줄**
뿐이라 assertion을 그리로 옮겼습니다.

**안내가 칩의 낱말을 그대로 인용하는지도 봅니다.** 처음에 안내에는 `연장 시에만
ONLY IF LATE`라고 썼는데 칩에 실제로 찍히는 것은 `연장 시 ONLY IF LATE`였습니다.
근로자가 화면에서 찾을 수 있어야 한다는 것이 이 앱의 규칙이므로, 여덟 개 언어에서
안내가 칩 문자열을 포함하는지 세는 assertion을 걸었습니다.

160 new assertions (1725 total) under 근무조 안내가 고른 조를 말합니다 · 지운 휴게는
되살아나지 않습니다 · 12시간 교대라도 8시간에 가는 날은 저녁을 먹지 않았습니다 ·
표는 눌러서 달고 뗍니다 · 옆의 빈자리를 눌러도 비과세가 뒤집혔습니다 · 퇴직금 줄은
몇 년을 다녔는지 말합니다. 731 → **735 키**. **표를 달지 않은 휴게는 예전과 한 치도
다르지 않으므로** v1 등가 증명은 그대로 통과합니다.

**폰에서 확인**(EN, 실제 기록 32일): 근무조 셋이 각각 자기 안내를 띄우고, ×로 지운
휴게가 근무조를 다섯 번 오가도 돌아오지 않고, 칩 왼쪽 빈자리를 세 번 눌러도
`TAX-FREE` 그대로이며 칩을 누르면 뒤집힙니다. 17:00 줄의 칩을 손가락으로 한 번
누르니 `연장 시 ONLY IF LATE`가 되고 이 폰의 설정으로 `09:00 → 18:00`이 **7.5 →
8.0시간**이 됐습니다. 근로자의 저장소는 백업 → 시험 → 복원했고, 파싱한 JSON이
백업과 완전히 같은 것을 확인했습니다(기록 32일, 성명·입사일 그대로).

**다음 사람에게.** 휴게를 두고 물을 것이 이제 둘입니다 — *'이 휴게는 언제
빠지는가'*(자리)와 **'이 휴게는 어떤 날에 빠지는가'**(표). 자리로 풀리는 것을 표로
풀지 마십시오: 9-6 공장의 18:00–18:30은 표가 없어도 정확히 맞습니다. 표가 필요한
것은 **평소 하루 안에 앉아 있는데 잔업하는 날에만 쓰는 휴게** 하나뿐입니다.
그리고 `otMark`에서 `isOtBreak`을 부르지 마십시오 — 되돌아 돕니다.

### 2026-08-28 (twenty-eighth) — 나머지 두 묶음, 그리고 이름이 넷이 된 이유

스물일곱째를 폰에서 보고 만든 사람이 말했습니다: **근무조와 휴게, 회사 규칙에도
같은 것을 해 주십시오.**

**그대로 옮길 수 없었습니다.** 두 묶음이 각각 다른 것을 가르쳐 주었습니다.

#### 1. 근무조와 휴게는 급여명세서에 없습니다

근무조·시작 시각·휴게는 **명세서에 적히지 않습니다.** `명세서를 보고 적으세요`를
붙이면 **있지도 않은 종이를 가리키게** 됩니다. 이 앱의 이름표는 근로자를 실제
서류로 보내라고 있는 것이니, 그것은 이름표가 없느니만 못합니다.

그 넷이 적혀 있는 곳은 **근로계약서**입니다 — 그리고 우연이 아닙니다.
**근로기준법 제17조**가 임금·소정근로시간·휴게·휴일을 계약서에 명시하도록 정합니다.
그래서 새 이름 `근로계약서를 보고 적으세요 · FROM YOUR CONTRACT`, 안내는
*'제17조가 계약서에 쓰도록 정합니다 — **적혀 있지 않다면 그것부터 물어볼 만합니다**'*.
마지막 한 마디가 이 앱이 할 수 있는 말의 끝입니다. 판단하지 않고 사실만 말합니다.

이 묶음은 **통째로 한 구역**입니다 — 법정 구역도 명세서 구역도 없습니다(asserted).
기존 세 머리말(`근무 시작 시간` · `주간 휴게` · `야간 휴게`)은 그대로입니다.

#### 2. 회사 규칙에는 세 번째 이름이 필요했습니다

스물일곱째가 배수를 두고 적어 둔 말입니다 — *'세 번째 이름을 만들기 전에
`noteMult`가 이미 하는 말을 먼저 읽으십시오.'* 읽어 보니 **그 말이 바로 그
이름이었습니다**: *회사가 다르게 주는 것이 아니라면 그대로 두세요 — 흐린 숫자가
법이 정한 최저입니다.*

**법이 '최저'만 정하는 자리는 법정도 명세서도 아닙니다.** 휴업수당 70%(§46),
토요일 휴일 지정, 약정휴일 자동 특근, 휴일 8시간 초과 ×2.0 지급 — 전부
`회사가 실제로 하는 것 · WHAT YOUR COMPANY DOES`입니다.

| 회사 규칙 | 구역 |
|---|---|
| 급여기간 시작일 · 월급날 | 근로계약서를 보고 |
| 퇴근 유예 | (기존) 출퇴근 처리 |
| **1일 평균임금** | **법이 정한 값** — 비우면 §2②로 앱이 계산합니다 |
| 휴업수당률 · 토요일 · 약정휴일 · ×2.0 지급 | 회사가 실제로 하는 것 |
| 배수 ×1.5 · ×0.5 · ×2.0 | (기존) 회사가 실제로 주는 배수 |

**법정 구역이 덮는 것은 1일 평균임금 한 줄뿐입니다.** 바로 아래 휴업수당률까지
덮으면 `70%`에 *'그대로 두어도 됩니다'*가 붙는데, **70%는 최저이지 값이
아닙니다.** 한 줄만 덮는지 보는 assertion을 걸었습니다.

#### 이름은 이제 넷입니다

| 이름 | 뜻 | 어디 |
|---|---|---|
| 법이 정한 값 | 손댈 일 없음 | 기준시간 209 · 보험 요율 넷 · 1일 평균임금 |
| 명세서를 보고 적으세요 | 급여명세서에 있음 | 기본금 · 보수월액 · 명세서의 국민연금 |
| 근로계약서를 보고 적으세요 | §17이 계약서에 쓰게 함 | 근무조·시작 시각·휴게 · 급여기간·월급날 |
| 회사가 실제로 하는 것 | **법은 최저만 정함** | 휴업수당률 · 토요일 · ×2.0 · 배수 |

설정에 칸을 더할 때 물을 것은 *'이 값이 무엇인가'*가 아니라 **'근로자가 이것을
손대야 하는가, 그리고 답은 어느 종이에 있는가'**입니다.

#### 시험이 두 번 헛통과했습니다 — 둘 다 적어 둡니다

**하나.** 소스에서 자리를 재는 도우미에 **이미 이스케이프된 문자열**을 넘겨
두 번 이스케이프됐고, 정규식이 아무것도 못 찾아 **빈 배열**을 돌려줬습니다.
`!idx(...).some(...)` 꼴의 assertion은 그러면 **조용히 통과합니다.** 두 줄이
그렇게 헛통과하고 있었습니다. 고치고 나니 곧바로 실패했습니다 — 아래 둘째 때문에.

**둘.** 근무조 묶음의 끝을 `gRulesOpen`으로 잡았습니다. **묶음 차례가
언어·내 정보·급여·근무조·수당·보험·규칙이라, 그 사이에 수당과 보험이 통째로
들어 있습니다.** 근무조를 잰다고 생각하면서 보험까지 재고 있었고, 거기에는
명세서 구역이 실제로 있습니다. 끝은 **바로 다음 묶음**(`gMoneyOpen`)입니다.

스물일곱째의 `{{ L.lBasic }}`과 같은 종류입니다 — **마크업에서 자리를 잴 때는
구간부터 못 박고, 도우미가 정말 무언가를 찾았는지 세어 보십시오.** 구간을
제대로 잡았는지 보는 assertion을 함께 넣었습니다.

70 new assertions (1565 total) under 근무조·휴게와 회사 규칙에도 같은 이름을
붙였습니다. 727 → **731 키**. 예전 `구역 이름은 네 번 나옵니다`는 법정 구역이
셋이 되어 새 값으로 고쳤습니다. **임금 계산식은 손대지 않았습니다.**

**폰에서 확인**(EN): 근무조와 휴게가 `FROM YOUR CONTRACT` + §17 안내로 열리고,
회사 규칙은 `FROM YOUR CONTRACT` → `HOW PUNCH TIMES ARE COUNTED` →
`SET BY LAW`(1일 평균임금) → `WHAT YOUR COMPANY DOES`(휴업수당률부터) 차례입니다.
근로자의 기록 31일 그대로.

### 2026-08-28 (twenty-seventh) — 무엇이 내 것이고 무엇이 법이 정한 것인지

만든 사람의 말입니다: **내가 이 앱을 만들지 않았다면, 그냥 쓰는 E-9 근로자였다면
이 설정 화면은 나에게도 너무 많아 보였을 것입니다. 어느 것이 법이 정한 값이라
손댈 필요가 없는지 눈에 보여야 합니다. 겁먹고 설정을 아예 안 하게 됩니다.**

옳습니다. 그리고 **이 앱에 이미 있던 장치가 그 일을 하지 못한다**는 것이 핵심입니다.
흐린 글씨(`isDef`, 2026-08-17)는 *'내가 손댔는가'*를 말합니다 — *'손대야 하는가'*는
말하지 않습니다. 새로 깐 사람은 숫자 열아홉 개가 전부 흐린 화면을 보고, 어느 것이
자기 것인지 알 수 없어 **하나도 손대지 않습니다.**

#### 구역을 갈라 이름을 붙였습니다

새 디자인이 아니라 **이미 쓰는 방식**입니다 — 2026-08-18에 휴게 목록 두 벌을
`주간 휴게 · DAY-SHIFT BREAKS` / `야간 휴게 · NIGHT-SHIFT BREAKS`로 가른 그것입니다.

| 묶음 | 명세서를 보고 적으세요 | 법이 정한 값 |
|---|---|---|
| 내 급여 조건 | 기본금 | 기준시간 209 |
| 4대보험과 세금 | 보수월액 · 명세서의 국민연금 | 건강보험 3.595% · 장기요양 13.14% · 국민연금 4.75% · 고용보험 0.9% |

법정 구역에는 한 줄이 붙습니다 — *고치지 않아도 됩니다. 법이 정하는 값이고, 앱이
지금 값을 이미 갖고 있습니다.* 여덟 개 언어이고, 한국어 낱말이 앞에 섭니다.

#### 배수에는 붙이지 않았습니다 — 이것이 이번의 판단입니다

`×1.5` · `×0.5` · `×2.0`도 법조문에서 나온 숫자입니다. 그런데 **그것은 법정
'최저'이지 법정 '값'이 아닙니다.** 어떤 공장은 특근을 ×2.0으로 주고, 어떤 곳은
잔업을 ×1.0으로만 줍니다.

여기에 *'그대로 두어도 됩니다'*를 붙이면 **이 앱을 만든 사람 자신에게 거짓말이
됩니다** — 그 회사는 휴일 8시간 초과 ×2.0을 주지 않고, 그것을 찾아낸 것이
`holOverPaid`를 끈 덕분이었습니다(스물다섯째). 이름표가 사실과 어긋나면 **이름표가
없느니만 못합니다.** `noteMult`가 이미 맞는 말을 하고 있으므로 그대로 두었습니다.
붙이지 **않았다**는 것을 시험이 지킵니다.

#### 시험을 쓰다 한 번 걸렸습니다, 적어 둡니다

*'기본금 칸 위에 명세서 구역이 서는지'*를 `src.indexOf('{{ L.lBasic }}')`로 쟀더니
실패했습니다. **`{{ L.lBasic }}`은 급여 탭의 `기본금이 얼마입니까` 카드에도 있고,
그쪽이 소스에서 먼저 나옵니다.** 설정을 잰다고 생각하면서 다른 탭을 재고 있었던
것입니다. 스물세째에 지문 SVG의 `v2`를 글자로 착각한 것과 같은 종류입니다 —
**마크업에서 자리를 잴 때는 어느 구간을 재는지부터 못 박으십시오.**
`indexOf(t, gPayOpen)`으로 고쳤고, 구역 이름이 설정 안에만 있는지도 함께 셉니다.

55 new assertions (1495 total) under 무엇이 내 것이고 무엇이 법이 정한 것인지.
724 → **727 키**. **임금 계산식은 손대지 않았습니다** — 이름표만 붙였습니다.

**다음 사람에게.** 설정에 칸을 더할 때 물어야 하는 것은 *'이 값이 무엇인가'*가
아니라 **'근로자가 이것을 손대야 하는가'**입니다. 답이 '법이 정하므로 아니오'면
법정 구역, '명세서에 있으므로 예'면 명세서 구역, 그리고 **'법이 최저만 정하므로
회사에 따라'면 둘 다 아닙니다** — 배수가 그 자리이고, 세 번째 이름을 만들기 전에
`noteMult`가 이미 하는 말을 먼저 읽으십시오.

### 2026-08-28 (twenty-sixth) — 보수월액은 명세서의 국민연금 한 줄에서 되살립니다

스물다섯째에서 *'공제 차액은 덜 받은 돈이 아니다'*라고 적어 두고 나서, 남은 질문이
이것이었습니다: **그러면 근로자 만 명이 저마다 보수월액을 손으로 알아내야 합니까?**

**'보수월액이 얼마입니까'에 답할 수 있는 근로자는 거의 없습니다.** 공단에 신고된
값이고, 급여명세서에 그 이름으로 적혀 있지도 않습니다. `bosu` 칸은 그래서 있으나
마나였습니다 — 스무째의 성명 칸과 똑같은 모양입니다(있는데 아무도 못 찾음).

**그런데 '명세서의 국민연금이 얼마입니까'는 종이를 보고 답할 수 있습니다.**

#### 답이 하나뿐이라 되살릴 수 있습니다

```
163,110 ÷ 0.0475 = 3,433,894.7
기준소득월액은 천원 단위(국민연금법 시행령) · 보험료는 10원 미만 절사
  → 163,110을 내는 천원 단위 값은 3,434,000 하나뿐입니다
```

**추측이 아니라 산수입니다** — 열여섯째의 `recoverWage()`가 `c.pay`에서 시급을
되살린 것과 같은 방식이고, 되살릴 수 없으면 지어내지 않고 `null`입니다.

**그리고 요율까지 명세서가 증언합니다.** 4.5%로도 5.0%로도 163,110을 내는 천원
단위 값이 **아예 없습니다**(asserted, 표 전체를 훑습니다). 2026년 근로자 부담이
4.75%라는 것을 근로자의 종이가 확인해 준 셈입니다.

#### 저장하는 것은 `bosu` 하나입니다

칸에 보이는 국민연금 값은 `bosu`에서 **다시 계산한 것**입니다(`pensionOn()`).
그래서 손으로 보수월액을 고치면 이 칸이 따라오고, **같은 값이 두 곳에 저장되어
어긋나는 길이 아예 없습니다**(열아홉째). `4.75%`도 소스에 한 번만 적혀 있습니다 —
`PENSION_EE` 하나를 `insCalc()`와 `bosuFromPension()`이 같이 봅니다(asserted:
소스에 `0.0475` 리터럴이 하나뿐인지 셉니다). 2027년에 5.0%로 오르면 한 줄입니다.

#### 폰에서 확인 — 109,800 → 2,010

명세서의 국민연금 163,110 한 줄을 넣었더니(2026.07.21–08.20, 실제 기록 19일):

| | 앱(전) | 앱(후) | 명세서 | 남은 차 |
|---|---|---|---|---|
| 소득세 | 112,550 | 112,550 | 127,550 | **+15,000** |
| 주민세 | 11,250 | 11,250 | 12,750 | +1,500 |
| 건강보험 | 79,500 | 123,450 | 125,180 | +1,730 |
| 장기요양 | 10,440 | 16,220 | — | **−16,220** |
| 국민연금 | 105,050 | **163,110** | 163,110 | **0 · 원 단위 일치** |
| 기숙사비 | 100,000 | 100,000 | 100,000 | 0 |
| **합계** | 418,790 | **526,580** | 528,590 | **2,010** |

**합계가 2,010까지 붙은 것을 정확해졌다고 읽으면 안 됩니다.** 소득세가 15,000
모자라고 장기요양이 16,220 남는 것이 **우연히 상쇄된** 결과입니다. 열여섯째가
*'근로감독관은 그 칸을 더해 볼 수 있다'*고 적었는데, 그 반대도 참입니다 — **줄이
서로 틀린 채 합만 맞는 문서**가 더 나쁩니다. 남은 두 줄은 그래서 여전히 열려
있습니다:

- **소득세 15,000** — 127,550은 2026.03.01 개정 간이세액표의 **어느 칸에도 없습니다**
  (공제대상가족 수 전부 확인). 회사가 개정 전 표를 쓰는 것으로 보이며, 과다
  원천징수분은 **연말정산에서 돌아옵니다** — 잃는 돈이 아닙니다.
- **장기요양 16,220** — 명세서에 줄이 없습니다. 가입 제외(노인장기요양보험법
  시행령 §3-2)인지, 건강보험 줄에 합산된 것인지 **명세서로는 가릴 수 없습니다.**
  가리기 전에는 끄지 마십시오.

83 new assertions (1440 total) under 보수월액은 명세서의 국민연금에서 되살립니다.
720 → **724 키**. **임금 계산식은 손대지 않았습니다** — `insCalc()`의 `0.0475`가
`PENSION_EE`로 바뀐 것은 값이 같은 치환이고, v1 등가 증명과 나머지 1439개가 그것을
증명합니다.

**다음 사람에게.** 이 방식이 통하는 이유는 **국민연금만 기준이 천원 단위**라
답이 유일해지기 때문입니다. 건강보험 보수월액은 원 단위라 같은 방법을 쓰면
125,180에서 **[3,482,057 … 3,482,335]** 범위가 나올 뿐 한 값으로 좁혀지지 않습니다.
그래서 되살리기는 국민연금 한 줄에만 걸었고, 건강보험은 같은 `bosu`를 나눠 씁니다 —
두 기준이 실제로 다를 수 있다는 것이 **아직 남은 한계**입니다(위 표의 1,730원).

### 2026-08-28 (twenty-fifth) — 공제 차액은 덜 받은 돈이 아닙니다

만든 사람이 자기 급여명세서를 급여 › 명세서 대조에 넣어 보고 물었습니다: **특근에서
12,900원이 덜 나온 것은 찾았습니다. 그런데 공제가 명세서 쪽이 107,120원 많습니다.
회사가 무언가 더 떼고 있는 겁니까?**

아닙니다. 그리고 **아닌 이유가 계산이 아니라 앱이 알 수 없는 값에 있다**는 것이
이번에 적어 두는 것입니다.

| | 앱 | 회사 | 왜 |
|---|---|---|---|
| 4대보험 기준 | 2,211,640 (기본금+고정수당) | 연금 **3,434,000** · 건강 **약 3,482,000** | `insBase()`에 잔업이 안 들어갑니다. 공단에 신고된 보수월액은 들어갑니다 |
| 소득세 | 112,550 | **127,550** | 회사가 **2026.03 개정 전** 간이세액표를 쓰는 것으로 보입니다 (딱 15,000) |
| 장기요양 | 10,440 | 줄이 없음 | 가입 제외인지, 건강보험 줄에 합산된 것인지 **명세서로는 가릴 수 없습니다** |

셋 다 **공단·국세청·회사에 있는 값**입니다. 폰에는 없습니다. 그러면 요율을 고쳐서
맞출 수 있는 것이 아니고, 열여섯째가 임금 기준을 되살릴 수 없을 때 문서에 `※`를
붙인 것과 같은 답이 필요합니다 — **모르는 것은 모른다고 적습니다.**

#### 공제 총액 바로 밑에 한 줄

> 법정 요율로 계산한 추정치입니다. 보수월액과 공제대상가족 수는 공단·국세청에
> 신고된 값이라 앱은 알 수 없어 명세서와 다를 수 있고, **그 차이는 덜 받은 돈이
> 아닙니다.** 확정 금액은 회사 급여명세서이며, 부과 기준은 4insure.or.kr에서
> 확인할 수 있습니다.

- **자리는 공제 총액 *밑*입니다**(asserted, 소스에서 두 자리의 순서를 봅니다).
  합계를 보고 나서 읽는 단서이지 머리말이 아닙니다.
- **여덟 개 언어 모두 `보수월액`·`공제대상가족`을 한국어로 짚습니다.** 명세서에
  그렇게 적혀 있고, 근로자가 종이에서 찾을 수 있어야 합니다(집 규칙).
- **금액을 문장에 박지 않았습니다**(asserted). 요율도 기준도 해마다 바뀝니다 —
  열다섯째가 최저임금 문장에서 겪은 그것입니다.
- **어디서 확인하는지 가리킵니다.** 앱이 답을 지어내는 대신 공단으로 넘깁니다.
  열일곱째의 1350 하나와 같은 이유입니다.

#### 이미 맞게 되어 있던 것 — 그래서 시험으로 붙들었습니다

```js
slipShortfall(P) { return this.slipRows(P)
  .filter(r => ['ot','night','hol','basic'].indexOf(r.k) !== -1) ... }
```

**공제 줄은 부족액에 안 들어갑니다.** 107,120원은 빨간 '부족액' 숫자에 한 푼도
닿지 않았습니다. 이 한 줄이 설명하는 것이 바로 그 설계이므로, **말과 셈이 갈라지지
않도록** 잔업 −10,000 · 공제 +107,120을 넣은 명세서로 부족액이 정확히 10,000인지
보는 assertion을 걸었습니다. 한쪽이 무너지면 다른 쪽은 거짓말이 됩니다.

44 new assertions (1357 total) under 공제 차액은 덜 받은 돈이 아닙니다.
719 → **720 키**. **임금 계산식은 손대지 않았습니다** — 한 줄을 더한 것뿐이라
v1 등가 증명은 그대로 통과합니다.

**다음 사람에게 — 아직 안 한 것.** `bosu`(보수월액) 칸은 **이미 있고**, 넣으면
정확히 맞습니다(3,434,000을 넣으면 국민연금이 원 단위까지 일치합니다). 그런데
설정 깊숙이 접혀 있고 `0`으로 보여서 **아무도 찾지 못합니다.** 스무째의 성명 칸과
같은 모양의 문제입니다 — 있는데 안 보이는 것. 그리고 **잔업을 많이 하는 E-9
근로자에게는 이 어긋남이 예외가 아니라 보통입니다**(모두 보수월액 > 기본금).
`insBase`의 기본값을 바꾸고 싶어지면, **보수월액은 이번 달 급여의 평균이 아니라
작년 보수총액으로 정해져 4월·7월에만 바뀐다**는 것부터 보십시오 — 움직이는 평균은
지금의 어긋남보다 설명하기 어려운 방식으로 틀립니다.

### 2026-08-28 (twenty-fourth) — 폴더를 치웠습니다, 그리고 지울 뻔한 것

**56MB → 13MB.** 지운 것은 전부 *다시 만들어지는 것*이거나 *아무도 가리키지 않는
낡은 것*입니다. 지우기 전에 `grep`으로 참조를 확인했고, 지운 뒤 `sh test/run.sh`가
그대로 통과합니다(1244).

| 지운 것 | 크기 | 왜 |
|---|---|---|
| `android/.gradle`, `android/build`, `android/app/build` | 24M | Gradle 산출물, `build_apk.sh`가 다시 만듭니다 |
| `guide/figs`, `guide/shots` | 17.5M | 같은 28장면을 두 번 찍은 것. **어느 문서도 가리키지 않고**, 8월 2–3일 것이라 내 권리 탭이 생기기 전입니다 |
| 루트의 스크린샷 다섯 장 | 910K | 마찬가지로 낡았고(탭이 넷) 참조 없음 |
| `tools/`의 일회용 스크립트 일곱 | 40K | 아래 |
| `pwa/__pycache__` | — | 바이트코드 |

`guide/evidence.html`(견본 근무내역서)은 남겼습니다. `.gitignore`를 새로 넣었습니다.

#### 일회용 스크립트를 남겨 두는 것이 오히려 함정이었습니다

`extract_lang.py` · `convert_*.py` · `add_dates.py` · `fix_pass*.py` 일곱은 v2의
i18n 리팩터(416개 `this.t(ko, en)` → `this.T(key, params)`)를 한 번 수행한
것들입니다. **그 일은 끝났고 다시 일어날 수 없습니다.** 그런데 이것들은
`WorkLogApp.v2.dc.html`을 제자리에서 고쳐 쓰고 리팩터 *이전* 소스를 기대하므로,
지금 하나라도 돌리면 소스가 깨집니다.

그래서 이 문서에는 *'돌리지 마십시오'*라는 경고가 있었습니다. **경고로 막아야 하는
물건이라면, 없애는 편이 낫습니다.** `tools/README.md`에 무엇이었는지 남기고 파일은
지웠습니다. 남은 것은 `sync_lang.py`와 `check_lang.py` 둘뿐이고 둘 다 언제 돌려도
안전합니다.

#### 하마터면 지울 뻔한 것 — `근무기록-WorkLog.html`

**지울 후보로 지목된 것이 이 파일이었습니다.** 근거는 *'7월 것이라 낡았고, 지워도
지금 apk는 멀쩡하다'* — 뒷부분은 맞고 앞부분이 틀렸습니다. 이미 만들어진 apk는
구워진 것이라 아무 영향이 없지만, **`build.py:32`가 이 파일을 이름으로 열고, 없으면
`FileNotFoundError`로 죽습니다.** 다음 빌드부터 앱을 만들 수 없습니다.

말로 우기지 않고 **옮겨 놓고 빌드를 돌려 보였습니다** — 먼저 백업을 뜨고, 옮기고,
`python3 build.py v2`가 죽는 것을 확인하고, 되돌리고, 체크섬이 같은지 보고, 빌드가
다시 되는지까지. 파일 하나의 필요 여부를 두고 다툴 때 이것이 가장 짧은 길입니다.

`Traps` 항목에 그 사실을 적어 두었습니다 — **이 폴더에서 가장 지우기 좋아 보이는
파일이고, 실제로 한 번 지목됐다**는 것까지.

#### apk가 2.2MB 작아졌습니다 — 확인했습니다

`android/app/build`를 지우고 처음부터 빌드했더니 6.98MB → **4.75MB**. 줄어든
apk는 무언가 빠진 apk일 수 있으므로 확인했습니다: **apk 안의
`assets/www/index.html`이 `dist-v2/index.html`과 바이트 단위로 같습니다**(1,021,343).
아이콘·매니페스트·서비스 워커도 그대로입니다. 줄어든 것은 증분 빌드가 쌓아 둔
중간 산출물이지 앱이 아닙니다. 폰에 설치해 확인했습니다 — 로고, 초록, 기록 31일.

**남긴 것과 그 이유** (전부 필요하거나, 잃으면 되돌릴 수 없는 것):
`근무기록-WorkLog.html`(빌드의 껍데기) · `WorkLogApp.dc.html`+`test/harness.js`
(v1 등가 증명) · `Work Log and Pay.dc.html`(`ds-tokens.css`가 색 근거로 인용) ·
`RECREATE-PROMPT.md`(백지에서 다시 만드는 명세) · `pwa/icon-source.png.bak`
(이전 아이콘 원본, 유일본) · `dist/`·`dist-v2/`(어차피 `run.sh`가 매번 다시 만듭니다).

**다음 사람에게.** 이 폴더에서 무언가를 지우기 전에 **`grep -rl`로 이름을 찾고,
정말 필요 없다고 생각되면 옮겨 놓고 `sh test/run.sh`와 `python3 build.py v2`를
돌려 보십시오.** 여기는 git 저장소가 아니라 되돌릴 수 없습니다.

### 2026-08-28 (twenty-third) — 이 앱은 아직 1판도 나가지 않았습니다

만든 사람의 말입니다: **지문을 조금 더 크게. 그리고 정보에서 `v2`를 빼십시오. 이
앱은 한 번도 공개된 적이 없고, 처음 내보내는 판이 1판입니다. 폴더에 남아 있는 옛
apk도 치우고, 남는 하나는 v2라고 하지 않아도 됩니다.**

맞습니다. **`v2`는 이 저장소 안의 개발 계보이지 근로자가 읽을 말이 아닙니다.**
공개된 적이 없는 앱이 스스로 '2판'이라고 말하면, 있지도 않은 이력을 주장하는
것입니다 — 그리고 이 앱은 근로감독관 앞에 놓이는 문서를 만듭니다. **없는 것을
있다고 하지 않는다**는 것이 이 저장소의 규칙입니다.

#### 1. 지문 — `0.95em` → `1.05em`

`vertical-align`도 같이 옮겼습니다(`-0.08em` → `-0.13em`). 그림은 viewBox의
y 2~22만 차지하므로 실제 높이는 상자의 0.833배이고, **상자만 키우면 그림이 위로
떠오릅니다.** 그림의 한가운데가 예전 자리에 그대로 남도록 다시 잡았습니다:

```
중심 = -b + 0.5h     b = 0.5(1.05) − 0.395 = 0.13
```

그림 높이가 `0.79em` → **`0.875em`** (대문자 높이 `0.72em` 대비 10% → 21% 넘침).
세 자리가 같은 문자열을 쓰므로 assertion 하나가 셋을 함께 셉니다.

#### 2. 설정 › 정보에서 판 번호를 뺐습니다

`근무기록 L`+지문+`GGER` **· v2** → `근무기록 L`+지문+`GGER`. `aria-label`도
같이 줄였습니다 — 화면 낭독기가 없는 판 번호를 읽으면 안 됩니다.

**assertion을 쓰다 한 번 걸렸습니다, 적어 둡니다.** *'정보 칸에 `v2`라는 글자가
없는지'*를 마크업에서 그대로 찾았더니 실패했습니다. 지문 path의
`M9 6.8a6 6 0 0 1 9 5.2v2` — SVG의 세로선 명령 `v2`입니다. **이름을 그림으로
만들고 나면 마크업에서 글자를 찾는 시험은 더 이상 글자만 보지 않습니다.** 태그를
걷어내고 보도록 고쳤습니다.

#### 3. 폴더에는 apk가 하나입니다

| 지운 것 | 무엇이었나 |
|---|---|
| `worklog-debug.apk` (08-11) | 얼려 둔 원본의 빌드 |
| `worklog-dist.zip` (08-11) | 원본의 dist 묶음 |
| `worklog-v2-dist.zip` (08-13) | 두 주 전 dist-v2 묶음 |

셋 다 **소스에서 다시 만들 수 있는 산출물**이고, 어느 스크립트도 문서도 이름으로
가리키고 있지 않았습니다(지우기 전에 `grep`으로 확인했습니다).

이름도 바꿨습니다:

```
./build_apk.sh v2   ->  worklog-debug.apk         ← 나가는 앱
./build_apk.sh      ->  worklog-frozen-debug.apk  ← 얼려 둔 원본
```

**얼려 둔 원본 쪽 이름을 바꾼 이유가 중요합니다.** 나가는 앱을 그냥
`worklog-debug.apk`로 두면, 얼려 둔 원본을 한 번 빌드하는 순간 **같은 이름으로
조용히 덮어씁니다.** 그 다음 `adb install -r`은 두 주 전 앱을 근로자 폰에
얹습니다. 이 저장소가 계속 적어 온 그 함정(서비스 워커, force-stop)과 같은
종류라서, 이름 자체가 부딪히지 않게 갈랐습니다.

`CLAUDE.md`와 `DEPLOY.md`의 apk 이름도 함께 고쳤습니다.

#### 하지 않은 것 — 물어보고 하겠습니다

- **근무내역서의 `작성 도구: 근무기록 LOGGER v2` 줄은 그대로입니다.** 화면의
  판 번호와 달리 이 줄은 **어떤 빌드가 계산했는지를 확인하는 자리**입니다
  (열일곱째). 다만 화면이 판 번호를 말하지 않게 된 지금 이 줄만 `v2`라고 하는
  것은 어긋나므로, 어떻게 부를지는 정해야 합니다.
- **`v2` 계보 자체의 이름은 바꾸지 않았습니다** — `WorkLogApp.v2.dc.html`,
  `dist-v2/`, `build.py v2`, `V2.md`. 이것을 `v1`으로 옮기려면 **v1 등가
  증명이 함께 사라집니다**: `test/regress.js`가 얼려 둔 원본의 임금 엔진과
  지금 엔진이 같은 답을 내는지 증명하고 있고, 그것이 이 저장소에서 가장 센
  안전망입니다. 파일 이름 몇 개를 위해 버릴 것이 아닙니다.

4 new assertions (1244 total): 크기·정렬 문자열이 셋 다 새 값인지, 정보에는
판 번호가 없는지(태그를 걷어낸 글자로), 정보의 `aria-label`도 그런지.

**폰에서 확인**: 머리말과 정보 모두 커진 지문으로 `근무기록 L`+지문+`GGER`,
정보에는 판 번호가 없습니다. 폴더에 apk는 `worklog-debug.apk` 하나입니다.
근로자의 저장소는 그대로입니다.

### 2026-08-28 (twenty-second) — 이름 한가운데의 O는 출퇴근 패드의 지문입니다

근로자가 물었습니다: **앱 이름의 `O` 자리에 출퇴근 화면의 초록 지문을 넣어
주십시오.** `근무기록 L`+지문+`GGER`.

좋은 생각입니다. 이 앱이 하는 일이 **지문으로 도장을 찍는 것**이고, 그 지문은
근로자가 매일 아침 누르는 바로 그 그림입니다. 이름이 앱을 설명하게 됩니다.

#### 이름이 나오는 자리는 셋입니다

| 자리 | 크기 | 획 두께 |
|---|---|---|
| 머리말(모든 탭 위) | 16px | 3 |
| 소개(환영) 화면 | 26px | 2.6 |
| 설정 › 정보 | 13 → **14px** | 3 |

**셋이 서로 다르게 생기면 그것은 로고가 아니라 사고입니다.** 크기와 정렬은 한
벌입니다(`width:0.95em; height:0.95em; vertical-align:-0.08em; margin:0 0.03em`) —
`em`이라 글자 크기를 따라가고, 세 자리가 같은 문자열이라 assertion이 셋을
한꺼번에 셉니다.

- **획 두께만 자리마다 다릅니다.** viewBox 24 안에 아홉 개의 호(弧)가 있어서, 획을
  그대로 두면 작은 자리에서 뭉개지고 큰 자리에서 가늘어집니다. 26px에서는 2.6,
  작은 두 자리에서는 3입니다.
- **`0.95em`인 이유**: 그림은 viewBox의 y 2~22만 차지하므로 실제 높이는 약
  `0.79em`입니다. 대문자 높이가 `0.72em`이니 둥근 글자가 위아래로 살짝 넘치는
  그 정도 — `O`가 원래 그렇게 생겼습니다.
- **정보 줄만 13 → 14px로 올렸습니다.** 13px에서는 아홉 개의 호가 초록 얼룩으로
  보였습니다. 이름을 그림으로 만들면 **글자보다 큰 최소 크기**가 생깁니다.

**초록은 패드의 값을 그대로 씁니다** — `oklch(0.52 0.14 149)`, `padIconInk`와 같은
literal입니다. 이 저장소는 의미 있는 색을 토큰이 아니라 주석 달린 literal로 두므로
(`oklch(0.84 0.16 92)` 주간, `oklch(0.72 0.15 30)` 휴업 …) 그 방식을 따랐고,
**두 초록이 갈라지지 않도록** 소스에서 `padIconInk`의 값을 읽어 로고의 세 개와
같은지 보는 assertion을 걸었습니다.

#### 그림은 글자가 아닙니다 — 두 가지가 따라옵니다

**1. 이름을 읽을 수 있어야 합니다.** `innerText`는 이제 `근무기록 LGGER`입니다.
세 자리 모두 감싸는 요소에 `aria-label="근무기록 LOGGER"`가 붙고 `<svg>`는
`aria-hidden="true"`입니다 — 화면 낭독기는 온전한 이름을 읽습니다.

**2. 정보 줄은 문자열이 아니게 됐습니다.** `L.aboutName`(`app_name_version__en`)이
`근무기록 LOGGER · v2` 한 줄이었는데, **이름 한가운데에 그림이 들어가면 문자열
하나로는 그릴 수 없습니다.** 여덟 개 언어에서 값이 똑같은 고유명사라 머리말·소개와
같이 템플릿에 그대로 적고 키를 지웠습니다. 717 → **716 키**.

#### 문서에는 넣지 않았습니다

`evidenceHtml()`의 `작성 도구: 근무기록 LOGGER v2` 줄은 **글자 그대로입니다.**
근무내역서는 근로감독관 앞에 놓이는 종이이고, 열일곱째가 그 줄을 왜 그렇게 썼는지
적어 두었습니다. 인쇄·첨부·복사에서 `<svg>`가 어떻게 될지는 알 수 없고, **알 수
없는 것을 증거 문서에 넣지 않습니다.** 문서 전체에 `<svg`가 하나도 없는지 보는
assertion이 있습니다.

10 new assertions (1242 total) under 이름 한가운데의 O는 출퇴근 패드의 지문입니다:
세 자리가 다 지문을 갖는지, 셋의 초록이 패드와 같은지, 크기·정렬 문자열이 셋 다
같은지, `aria-label`이 셋 다 붙어 있는지, 글자로 찍히던 `근무기록 LOGGER`가 남아
있지 않은지(단 `aria-label` 안의 것은 남아 있어야 합니다 — 처음 쓴 assertion이
그것까지 세다가 걸렸습니다), 그리고 문서는 여전히 글자인지.

**폰에서 확인**: 머리말·소개·정보 세 자리 모두 `근무기록 L`+초록 지문+`GGER`,
글자 사이 간격도 어색하지 않습니다. 근로자의 저장소는 그대로입니다.

**다음 사람에게.** `padIconInk`의 초록을 바꾸면 **로고 세 개도 함께 바꾸십시오** —
assertion이 잡아 주지만, 잡히는 것과 왜 그런지 아는 것은 다릅니다. 그리고 지문
아이콘의 path를 손보게 되면 네 벌(패드 + 로고 셋)이 있다는 것을 기억하십시오.

### 2026-08-28 (twenty-first) — 이 칸에 적는 것은 사람이 아니라 회사 이름입니다

스무째로 만든 **내 정보**를 폰에서 보고 근로자가 말했습니다: **'Employer'를 회사
이름으로 바꿔 주십시오.**

맞습니다, 그리고 이 앱에서는 그냥 낱말 취향의 문제가 아닙니다. **`EMPLOYER`는
사람(고용주)으로도 읽히는데 이 칸에 적는 것은 근로계약서에 적힌 회사 이름**이고,
더 나쁜 것은 **이 앱이 '사업주'라는 말을 이미 다른 뜻으로 쓰고 있다**는 것입니다 —
근로기준법 제46조의 **사업주 귀책 휴업**. 한 낱말이 두 가지를 가리키면, 하필
그 둘이 같은 문서 안에 나옵니다.

| | 예전 | 지금 |
|---|---|---|
| ko | 사업장명 · EMPLOYER | 사업장명 · **COMPANY NAME** |
| en | EMPLOYER | **COMPANY NAME** |
| vi | 사업장명 NƠI LÀM VIỆC *(일터)* | 사업장명 **TÊN CÔNG TY** |
| zh | 사업장명 用人单位 | 사업장명 **公司名称** |
| th | 사업장명 สถานประกอบการ *(사업장)* | 사업장명 **ชื่อบริษัท** |
| id | 사업장명 PERUSAHAAN *(회사)* | 사업장명 **NAMA PERUSAHAAN** |
| ne | 사업장명 रोजगारदाता *(고용주)* | 사업장명 **कम्पनीको नाम** |
| km | 사업장명 និយោជក *(고용주)* | 사업장명 **ឈ្មោះក្រុមហ៊ុន** |

**셋(vi·ne·km)은 영어를 그대로 옮겨 '일터' 또는 '고용주'라고 말하고 있었습니다.**
영어 한 줄만 고쳤으면 그 세 언어의 근로자는 예전 낱말을 계속 봤을 것입니다.

**한국어 `사업장명`은 그대로입니다.** 근로계약서에 그렇게 적혀 있고, 근무내역서도
여전히 `사업장`이라고 씁니다 — 이 앱의 규칙은 한국어 서류의 낱말이 앞에 서고
번역이 뒤따르는 것입니다.

#### 안내문도 함께 — 그리고 한 언어는 스스로와 어긋나 있었습니다

`employer_name_hint`에서 **영어가 두 자리**(`keeps the employer that was set` ·
`has no employer on record`)에서 사람을 가리키고 있었습니다.

**태국어는 한 문장 안에서 두 낱말을 쓰고 있었습니다** — 앞 절은
`ชื่อสถานประกอบการ`(사업장 이름), 뒤 절은 이미 `ชื่อบริษัท`(회사 이름). 같은 칸을
한 문단이 두 가지로 부르고 있었던 것이고, 이번에 둘 다 `ชื่อบริษัท`이 됐습니다.

나머지 다섯은 손댈 것이 없었습니다 — 한국어는 이미 `회사 이름`, vi·zh·id·ne·km도
안내문에서는 이미 회사 이름이라고 말하고 있었습니다. **이름표만 낡아 있었던
것입니다.**

#### 손대지 않은 것

`rsn_fx_employer` · `shutdown_employer_s_side` ·
`the_company_had_no_work_for_you_whethe` — 전부 **사업주 귀책**을 말하는 제46조의
문장입니다. 영어로 `employer`가 남아 있는 것이 맞습니다. **찾아 바꾸기로 한 번에
쓸어버리기 딱 좋은 자리**라서, 그 셋이 그대로인지 보는 assertion을 함께 걸었습니다.

**키 수는 그대로 717입니다** — 값만 고쳤습니다. 30 new assertions (1232 total)
under 이 칸에 적는 것은 사람이 아니라 회사 이름입니다: 여덟 개 언어의 이름표와
안내문이 모두 회사 이름을 말하는지, 사람을 가리키는 낱말(`employer` · 고용주 ·
`nơi làm việc` · 用人单位 · สถานประกอบการ · रोजगारदाता · និយោជក)이 그 둘에
남아 있지 않은지, 한국어는 `사업장명`이 앞에 서는지, 그리고 §46 세 문장은
그대로인지. **임금 계산식은 손대지 않았습니다.**

**폰에서 확인**(EN): 칸 이름이 `COMPANY NAME`, 그 아래 안내문이 *Each pay period
keeps the **company name** that was set…*. 근로자의 저장소는 그대로입니다.

### 2026-08-28 (twentieth) — 백업 상자 안에 세 가지 다른 일이 들어 있었습니다

근로자의 말입니다: **백업과 내보내기는 파일을 내보내고 되돌리는 곳이어야 하는데,
성명과 사업장명이 그 안에 있고 근무내역서 만들기까지 거기 있어서 어색합니다.**

맞습니다. 그리고 이유는 '어색하다'보다 뾰족합니다. **한 상자 안에 세 가지가 있었고,
그 셋은 파일로 끝난다는 것 말고는 공통점이 없었습니다.**

| | 얼마나 자주 | 누가 읽는가 | 잘못되면 |
|---|---|---|---|
| 성명 · 사업장명 | **평생 한 번** | 아무도 — 찍히기만 합니다 | 모든 문서가 미기재로 나갑니다 |
| 근무내역서 | **한 달에 한 번** | 근로감독관·노무사 | 이 앱이 있을 이유가 없어집니다 |
| JSON 백업 · 복원 | 어쩌면 한 번 | 앱 자신 | **복원은 전부를 덮어씁니다** |

열아홉째는 '파일을 만드는 것들끼리 있어야 합니다'로 묶었습니다. 그것은 **서류함의
논리이지 근로자의 논리가 아닙니다.** 근로자에게 JSON 백업은 *만드는 것*이 아니라
잃어버릴 때를 대비한 보험이고, 그 바로 옆에 앱의 유일한 파괴적 단추인 복원이
있습니다. 한 달에 한 번 쓰는 문서를 그 상자 안에 두면 근로자가 **매달 복원 옆을
지나갑니다.**

#### 1. 내 정보 — 접혀 있어도 이름이 보입니다

성명이 백업 상자 안에 있을 때는 **조용히 실패했습니다.** 설정에는 묶음이 일곱 개
있는데 그 가운데 '나'를 말하는 것이 하나도 없었고, 백업을 한 번도 생각해 본 적 없는
사람은 자기 이름을 적는 칸을 **영영 만나지 못했습니다.** 열여덟째가 애써 문서에
빨간 «성명 미기재»를 넣었지만, 그것은 **문서가 이미 만들어진 뒤**입니다.

새 묶음 `내 정보 · MY DETAILS`, 자리는 **언어 바로 다음**입니다 — 처음 설정을 훑어
내려가는 사람이 가장 먼저 만나는 자리이고, 이 두 칸은 다른 무엇보다 먼저 적는
것입니다. 안에는 성명과 사업장명, 옮기기 전과 똑같은 칸과 똑같은 설명입니다.

**요약 줄이 이름을 말합니다.** 접혀 있어도 `Librado Emarjorie`가 보이고, 비어 있으면
`성명 미기재`가 **빨갛게** 보입니다. 펼치지 않고도 실패가 보이는 것이 이 변경에서
가장 값나가는 한 줄입니다.

**빨간 것은 이 하나뿐입니다**(`gMeSumInk`). 열아홉째가 사업장명에 적어 둔 이유와
같습니다 — 경고를 쌓아 두면 정작 봐야 할 빨간 줄이 묻힙니다.

#### 2. 근무내역서는 급여 탭으로 — 그리고 스테퍼 하나가 없어졌습니다

문서에는 `docBack`이라는 **자기 스테퍼**가 따로 있었습니다. 그 말은 같은 앱이
'어느 기간을 보고 있는가'에 **두 가지로 답할 수 있었다**는 뜻입니다 — 화면은 8월인데
문서는 7월. 열두째가 근무기록과 급여를 하나로 묶으면서 *'두 탭이 늘 같은 기간을
말해야 합니다'*라고 적어 둔 그 원칙이 닿지 않은 마지막 자리였습니다.

이제 문서는 **급여 탭 맨 아래**에 있고, 그 탭의 `payBack`을 그대로 씁니다.
`docBack` · `docPeriod()` · `stepDoc()`은 없어졌고, `docBackMax()`는 화면과 문서가
함께 쓰는 하나라는 뜻으로 **`periodBackMax()`**가 됐습니다.

**남은 것은 스테퍼가 아니라 확인 줄입니다** — `근무내역서 기간 · 08.21 → 09.20 ·
5 days recorded`. 빨간 단추를 누르기 직전에 '지금 만드는 것이 어느 달인가'가 눈에
있어야 하고, 스테퍼가 둘이면 둘이 어긋날 길이 생깁니다.

**그리고 이 자리가 맞는 자리입니다.** 회사 급여명세서와 맞춰 보다가 부족액을 찾아낸
사람이 **바로 다음에 원하는 것**이 이 문서입니다. 예전에는 거기서 설정 탭으로 가서
접힌 묶음을 열어야 했습니다.

**알림도 갈랐습니다**(`docMsg`/`docErr`). `backupMsg` 하나를 나눠 쓰면 급여에서 만든
문서의 알림이 **설정 화면에 남습니다** — 서로 보이지 않는 두 탭이라 열아홉째가 지운
유령과 같은 모양입니다. 기간을 옮기면 지웁니다(`goPeriod`): 07월 문서를 만들었다는
줄이 08월 밑에 남아 있으면 안 됩니다.

#### 3. 백업과 내보내기에는 이제 파일뿐입니다

`파일로 내보내기(JSON)` · `파일에서 복원` · `CSV`. **CSV는 남겼습니다** — 그것은 한
기간이 아니라 **기록 전부**를 담은 파일이고, 묶음 이름이 약속하는 바로 그것입니다.
근로자가 말한 '파일을 내보내고 되돌리는 곳'과 정확히 같습니다.

#### 고친 문장

- `the_document_carries_these_figures_too`(내 권리의 가리키는 한 줄) — `설정 ›
  백업과 내보내기` → **`급여 탭 맨 아래`**. 여덟 개 언어. 이 줄이 없는 화면을
  가리키면 열아홉째가 stale slug를 고친 이유와 같은 문제가 됩니다.
- `makes_a_one_page_korean_document_cover` — *'백업 파일(JSON)은 앱을 복구할 때
  쓰는 것이고, 이 문서는 사람이 읽는 것입니다'* 한 문장을 **뺐습니다.** 그 비교는
  JSON 단추 옆에 서 있을 때만 뜻이 있었습니다. 여덟 개 언어.
- `step_back_to_any_month_you_still_have` — *'위의 ‹ › 로 기간을 옮기면 이 문서도
  함께 옮겨 갑니다'*로 시작하게 했습니다. 그 화살표가 이제 이 탭의 것이라 어느
  화살표인지 말해 주어야 합니다. 여덟 개 언어.

새 키 셋 — `grp_me`, `grp_me__en`, `no_name_set`. 714 → **717 키**. 67 new
assertions (1202 total) under 성명과 사업장명은 백업 상자 안에 있을 일이 아닙니다 ·
접혀 있어도 이름이 있는지 없는지가 보입니다 · 문서의 기간은 급여 탭이 보고 있는
기간입니다 · 옮겼다고 앱이 하던 일을 멈추지는 않습니다. 예전 동작을 붙들고 있던
`기간 스테퍼도 하나입니다`(docPrev가 하나인지)는 **하나도 없는지**로 뒤집었고,
급여기간 스테퍼가 근무기록·급여 둘뿐인지를 함께 셉니다. **임금 계산식은 손대지
않았습니다** — 바꾼 것은 무엇이 어느 화면에 있는가이므로 v1 등가 증명은 그대로
통과합니다.

**폰에서 확인**(EN, 실제 기록 31일, 21일 시작): 설정에 `My details 내 정보 ·
Librado Emarjorie`가 언어 바로 밑에 있고, 펼치면 성명과 사업장명 두 칸입니다.
백업과 내보내기에는 `EXPORT A FILE` · `RESTORE FROM FILE` · `CSV` 셋뿐입니다.
급여 맨 아래 `DOCUMENT PERIOD 08.21 → 09.20 · 5 days recorded` + 빨간 단추,
맨 위 ‹ 를 한 번 누르니 머리띠와 함께 **`07.21 → 08.20 · 26 days recorded`**로
따라왔습니다. 근로자의 저장소는 그대로입니다(기록 31일, 성명·사업장명 그대로,
`payBack`·`docBack` 둘 다 저장되지 않음).

**다음 사람에게.** 이 앱에서 무언가를 어디에 둘지 정할 때 물어야 하는 것은 *'무엇을
만드는가'*가 아니라 **'누가, 얼마나 자주, 무엇을 하려고 여는가'**입니다. 파일을
만든다는 공통점은 백업(평생 한 번, 앱을 위해)과 근무내역서(매달, 사람에게)를 같은
상자에 넣을 이유가 되지 못했습니다. 그리고 **기간을 말하는 스테퍼는 앱에 둘뿐**
입니다(근무기록·급여, 같은 `payBack`) — 세 번째를 만들고 싶어지면, 그것이 화면과
어긋나는 날이 언제인지부터 적어 보십시오.

### 2026-08-28 (nineteenth) — 사업장명은 붙들어 두고, 근무내역서를 만드는 곳은 하나로 줄였습니다

열여덟째 끝에 '사업장명은 도장을 찍어야 한다'고 적어 둔 것을 실제로 했고, 그러다
물어본 김에 **내 권리와 설정에 근무내역서 단추가 두 벌 있다**는 것이 함께 나왔습니다.

#### 1. 사업장명 — `wageLog`에 함께 찍습니다

**성명과 달리 사업장명은 바뀝니다.** 회사를 옮기면 그 뒤로 뽑는 지난 달 문서가 전부
새 회사 이름을 답니다. 임금체불 진정에서 그것은 **상대를 잘못 지목하는 문서**입니다.

`settings.employer`는 지금 회사이고, `wageNow()`가 그것을 **임금 기준 한 벌에 얹어**
`wageLog`에 함께 찍습니다. 따로 `employerLog`를 두지 않은 이유는 같은 기간이 두 곳에
적히면 둘이 어긋날 길이 생기기 때문입니다 — 한 벌에 몇 바이트 늘 뿐입니다.

| 12월 문서를 1월에 뽑으면 | 붙들기 전 | 지금 |
|---|---|---|
| 사업장 | (주)대한기계 ← **1월에 옮긴 회사** | **(주)한국정밀** |

**회사 이름은 되살릴 수 없습니다.** 시급은 `c.pay`에서 거꾸로 풀리지만(`recoverWage`)
회사 이름은 기록 어디에도 남지 않습니다. 그리고 `recoverWage()`와 `unknown` 갈래는
둘 다 `wageNow()`를 바탕으로 만들어지므로 `employer`가 **지금 회사**로 딸려 옵니다.
그래서 `employerFor(W)`가 갈라 줍니다 — **도장이 찍힌 기간(`src === 'live'`)만
확실**하고, 나머지는 지금 설정값을 쓰되 문서가 스스로 밝힙니다:

> 사업장 **(주)대한기계** ※ 이 기간의 기록에 사업장명이 남아 있지 않아 현재
> 설정값입니다 — 그 사이에 회사를 옮겼다면 이 기간의 회사는 다른 곳입니다.

**이 변경 이전에 찍힌 도장에는 `employer` 자체가 없습니다.** `src`는 `'live'`인데
회사만 모르는 상태이고, 그것도 확실하지 않은 쪽으로 보냅니다(asserted) — 없는 것을
있다고 하지 않습니다.

**비워 두면 그 줄이 아예 없습니다.** 성명과 다릅니다: 성명이 없으면 '누구 문서인가'를
아무도 모르므로 빨갛게 말해야 하지만, 사업장명이 없다고 문서가 못 쓰게 되지는
않습니다. **경고를 쌓아 두면 정작 봐야 할 빨간 줄이 묻힙니다.**

**CSV와 파일 이름에는 넣지 않았습니다.** CSV는 여러 기간이 한 파일에 섞이므로 줄마다
`wageFor()`를 다시 불러야 하고(수백 줄), 사람을 가르는 일은 `근로자` 칸이 이미 합니다.
파일 이름은 성명만으로 충분히 갈라집니다.

#### 2. 근무내역서를 만드는 곳이 두 군데였습니다

2026-08-18(여섯째)부터 **내 권리 아래**와 **설정 › 백업과 내보내기**에 같은 스테퍼와
같은 빨간 단추가 한 벌씩 있었습니다. 둘은 같은 `docBack`을 나눠 쓰므로, **한쪽에서
7월로 옮기면 다른 탭의 스테퍼도 말없이 7월이 됩니다.**

열두째가 근무기록과 급여를 **일부러** 하나로 묶은 것과 겉모습은 같지만 뜻이 다릅니다.
그 둘은 **한 화면 안에서 같은 기간을 말해야 해서** 묶은 것이고, 이쪽은 **서로 보이지
않는 두 탭**이라 그냥 유령입니다.

**남긴 것은 설정 쪽입니다.** 세 가지 이유입니다.

- 원래 의도가 그랬습니다. 내 권리 쪽 안내의 키 이름이
  `the_same_document_as_in_settings_it_car` — *'설정에 있는 그 문서'*였습니다. 내
  권리는 처음부터 **가리키는 줄**이었고, 어느 시점에 스테퍼와 단추까지 복제된 것입니다.
- **파일을 만드는 것들끼리 있어야 합니다.** 백업(JSON)·CSV·근무내역서. 설정 쪽 안내가
  이미 *'백업 파일(JSON)은 앱을 복구할 때 쓰는 것이고, 이 문서는 사람이 읽는
  것입니다'*라고 말하는데, 그 문장은 JSON 단추 옆에서만 뜻이 있습니다.
- **내 권리는 퇴직금·연차·휴업수당**, 곧 *'이번 달 명세서에 없는 돈'*입니다.
  급여기간 하나의 근무를 정리한 문서는 그 주제가 아닙니다.

내 권리에는 **한 줄이 남습니다** — 이 탭의 금액이 문서에도 들어간다는 사실은 여기서
말해야 하고, 이제 그 줄이 **어디서 만드는지 가리킵니다**(여덟 개 언어, asserted).
**잃는 것**은 문서가 접힌 그룹 뒤로 간다는 것입니다. 매일 여는 화면에서 한 달에 한 번
쓰는 단추를 빼는 대가로는 싸다고 봤습니다.

**stale slug도 고쳤습니다** — `the_same_document_as_in_settings_it_car` →
`the_document_carries_these_figures_too`. 이 저장소는 소스를 `grep`해서 읽으라고
되어 있는데, 그 이름이 이제는 없는 화면을 가리키고 있었습니다(`tour_setup_next`,
`the_company_had_no_work_for_you_whethe`와 같은 이유). **키 수는 그대로입니다** —
이름만 바꿨습니다.

새 키 셋 — `employer_name`, `employer_name_ph`, `employer_name_hint`. 711 →
**714 키**. 35 new assertions (1135 total) under 회사를 옮겨도 지난 달 문서는 그 때의
회사입니다 · 회사 이름은 기록에서 되살릴 수 없습니다 · 이 변경 이전에 찍힌 도장은
확실하지 않은 쪽입니다 · 사업장명을 안 적으면 그 줄이 아예 없습니다 ·
근무내역서를 만드는 곳은 한 군데뿐입니다. **임금 계산식은 손대지 않았습니다** —
`employer`는 문자열이라 `wRate`·`wOtRate`·`taxableFixed` 어디에도 닿지 않고, v1 등가
증명은 그대로 통과합니다.

**폰에서 확인**(EN, 실제 기록 31일, 21일 시작): 같은 문서를 세 기간에서 뽑아
`08.21 → 09.20` **live**(단서 없음), `07.21 → 08.20` **recovered**(단서 붙음),
`06.21 → 07.20` **unknown**(단서 붙음). 내 권리 맨 아래에서 스테퍼와 빨간 단추가
사라지고 가리키는 한 줄만 남았습니다.

**다음 사람에게.** `stampWage()`는 **오늘이 든 기간에만** 도장을 찍습니다. 그래서
`employer`를 얹은 이 변경 뒤에도 **지난 기간의 도장은 다시 쓰이지 않습니다** — 그것이
맞습니다(그 때 회사가 무엇이었는지 앱은 모릅니다). 임금 기준에 무엇을 더 붙들고
싶어지면 `wageNow()`에 얹으면 되고, 되살릴 수 없는 값이라면 **`src`로 갈라서 문서가
스스로 밝히게** 하십시오 — `employerFor()`가 그 본보기입니다.

### 2026-08-28 (eighteenth) — 한 공장에서 셋이 내면 누구 것인지 알 수 없었습니다

열일곱째에서 만든 사람의 이름을 문서에서 빼고 나서 물어본 것입니다: **같은 회사에서
여러 사람이 이 앱을 쓰고 각자 근무내역서를 내면, 어느 문서가 누구 것입니까?**

알 수 없었습니다. **앱은 근로자가 누구인지를 아예 갖고 있지 않았습니다** —
`DEFAULTS`에 이름 칸이 없고, 문서 어디에도 사람을 가리키는 줄이 없습니다. 급여기간과
금액만 있는 종이 석 장이 근로감독관 책상에 놓입니다.

**파일 이름까지 똑같습니다.** 셋 다 `근무내역서-08210920.html`입니다. 한 폴더에
받으면 **서로 덮어씁니다** — 열어 보기 전에 이미 둘이 사라집니다.

#### `settings.workerName` — 한 칸, 그리고 세 군데에 찍힙니다

| | 이름을 적었을 때 | 비워 두었을 때 |
|---|---|---|
| 문서 머리 | `근로자 성명 **NGUYEN VAN A**` | `근로자 성명 **미기재**` + 빨간 설명 |
| 파일 이름 | `근무내역서-NGUYEN VAN A-08210920.html` | `근무내역서-08210920.html` |
| CSV | 줄마다 맨 앞 칸에 이름 | 맨 앞 칸이 빈 칸 |

- **문서에서 자리는 제목 아래, 급여기간보다 위입니다.** 여러 사람이 낸 문서를 갈라
  보는 사람이 가장 먼저 찾는 것이 이름이기 때문입니다(asserted, 두 위치 관계 모두).
- **비워 둘 수 있습니다.** 법이 요구하는 칸이 아니고, 이름을 적고 싶지 않은 사람이
  있습니다. 다만 **조용히 익명으로 나가지는 않습니다** — 비어 있으면 문서가 빨간
  글씨로 `미기재`라고 밝히고 왜 필요한지 적습니다. 근로자는 보내기 전에 알아야 하고,
  받은 사람도 알아야 합니다. **막지는 않습니다** — 문서도 CSV도 그대로 나옵니다.
- **공백만 친 것은 이름이 아닙니다**(`workerName()`이 trim). 파일 이름에도 새지
  않습니다.
- **CSV의 `근로자` 칸은 이름이 없어도 있습니다.** 13 → 14칸. 노무사가 여러 사람의
  CSV를 한 표에 붙여 놓고 더해 보는 자리인데, **파일마다 모양이 다르면 붙일 수가
  없습니다.** 빈 칸은 빈 칸입니다.
- **`Component.fileSafe()`** — `/ \ : * ? " < > |`와 제어문자를 빼고, 공백을 하나로
  줄이고, 40자에서 자릅니다. **한글·태국어·크메르어 이름은 그대로 둡니다**: 이 앱을
  쓰는 사람의 이름이 ASCII라는 보장이 없고, 파일 이름은 사람이 읽는 것입니다.
  못 쓰는 글자만 친 이름은 파일 이름에서 조용히 빠지지만 문서에는 그대로 적힙니다.

#### 칸의 자리 · 누르면 비우지 **않습니다**

설정 › **백업과 내보내기** 맨 위, 내보내기 단추들보다 **앞**입니다. 이 한 칸이 세 가지
출력에 다 찍히므로 찍히는 것들보다 앞에 있어야 순서가 말이 됩니다.

**숫자 칸의 `numField`를 쓰지 않았습니다.** 그쪽은 누르면 비우고 그냥 나가면
되돌립니다 — 2,156,880을 3,000,000으로 고치려고 백스페이스를 일곱 번 누르던 문제
때문입니다(2026-08-17). **이름은 고쳐 쓰는 것이 아니라 한 번 적는 것**이고, 눌렀다가
그만두면 이름이 사라지는 편이 훨씬 나쁩니다. `onKeyDown`은 다른 칸과 똑같이
`leaveField`로 갑니다 — 안 달면 완료 키가 죽은 키와 똑같아집니다(2026-08-19 열째).

**쓰던 사람에게 새로 생기는 화면은 없습니다** — 저장된 설정에 `workerName`이 없으면
빈 값이고, 그것은 그냥 미기재입니다(asserted, 키를 지운 저장본으로).

새 키 넷 — `worker_name`, `worker_name_ph`, `worker_name_hint`,
`worker_name_missing`. 707 → **711 키**. 62 new assertions (1100 total) under
한 공장에서 셋이 내면 누구 것인지 알 수 있어야 합니다 · 이름을 안 적으면 문서가
스스로 그렇게 말합니다 · 이름은 파일 이름에 넣을 수 있게 다듬습니다 · 성명 칸은
여덟 개 언어에 다 있고 쓰던 사람을 건드리지 않습니다. CSV 칸 수를 붙들고 있던 기존
assertion은 13 → 14로 고쳤습니다. **임금 계산식은 손대지 않았습니다.**

**폰에서 확인**(EN): 손가락으로 눌러 IME로 `NGUYEN VAN A`를 쳤고 — 자판 오른쪽
아래가 **살아 있는 `Done`**, 누르니 자판이 내려가고(`visualViewport` 473 → 832)
그대로 저장됐습니다. 비우면 칸이 빨갛게 되고 아래에 이유가 붙습니다. 실제 기록
31일로 만든 문서에서 `근무내역서-NGUYEN VAN A-08210920.html`, CSV 줄 맨 앞에 이름.

**다음 사람에게 — 사업장명은 일부러 넣지 않았습니다.** 넣으면 유용하지만 **회사는
바뀝니다**. 그러면 작년 문서가 지금 회사 이름을 달고 나옵니다 — 열여섯째가 기본금에서
겪은 바로 그 어긋남이고, `wageLog`처럼 **급여기간마다 도장을 찍어야** 풀립니다.
성명에는 그 문제가 없습니다(사람 이름은 바뀌지 않습니다). 사업장명을 넣게 된다면
`stampWage()` 옆에 얹으십시오 — 지금 설정을 그대로 지난 문서에 쓰면 안 됩니다.

### 2026-08-28 (seventeenth) — 이 문서를 만든 사람의 이름이 근로감독관 앞에 놓여 있었습니다

만든 사람이 물었습니다: **이 앱으로 부족액을 찾아낸 근로자가 근무내역서를 들고
노동청에 갑니다. 나는 그 사건에 끌려들어가고 싶지 않습니다. 그러면서도 앱은
법에 맞아야 합니다.**

둘은 충돌하지 않습니다. **끌려들어가게 만드는 것은 정확한 계산이 아니라, 이 앱이
무엇인지 문서가 말하지 않는 것**이었습니다. 세 가지가 실제로 문제였습니다.

#### 1. 문서 맨 아래 회색 잔글씨에 만든 사람의 이름이 있었습니다

`작성: 근무기록 LOGGER v2 — 개발 DOUBLEEM`. 이 줄은 근로감독관 앞에 놓이는
종이에 찍혔습니다. 계산이 다투어지는 순간 그 이름이 물어볼 사람의 이름이 됩니다.

**도구의 이름과 판(版)만 남겼습니다** — `작성 도구: 근무기록 LOGGER v2 — 오프라인
앱, 기록은 본인 휴대폰에만 저장됩니다`. 어떻게 계산된 것인지 확인하는 데는 그것으로
충분하고, 그 이상은 필요하지 않습니다. 엑셀이 만든 표에 엑셀 개발자의 이름이 찍히지
않는 것과 같습니다. **`Component.AUTHOR`는 그대로 설정 › 정보에 있습니다** — 그
화면은 근로자 본인만 봅니다(asserted, 양쪽 다).

#### 2. 문서가 회사가 발행한 증명서처럼 보였습니다

도장 찍힌 칸, 합계, 법조문. **받아 든 사람이 가장 먼저 알아야 하는 것은 '누가 쓴
것인가'**이고, 답은 근로자 본인입니다. 그 말은 있었지만 **맨 아래 회색 잔글씨**에
있었고, 거기 있으면 읽히지 않습니다.

이제 **제목 바로 아래, 첫 표보다 위에** 두 줄이 상자로 붙습니다:

> **이 문서는 근로자 본인이 작성한 기록입니다.** 회사나 공공기관이 발행한 증명서가
> 아닙니다. 출퇴근 시각은 근로자 본인이 휴대폰에 기록한 것이고, 아래 금액은 그
> 기록과 본인이 입력한 임금 조건으로 앱이 계산한 **참고용 추정치**입니다.

**이것은 근로자를 위한 것이기도 합니다.** 임금체불 진정에서 없던 서류를 새로
만들어 내는 것은 그 자체가 문제가 됩니다(서류 위조). 이 문서가 스스로 '자기
기록'이라고 밝히면 그 의심을 처음부터 받지 않습니다.

#### 3. 안내가 '추정치'만 말하고 '자문이 아니다'는 말하지 않았습니다

**공인노무사법 제27조①** — 노무사가 아닌 자는 노동관계법령에 관한 **상담·지도**나
**서류의 작성·확인**을 *업으로서* 해서는 안 됩니다(제28조, 3년 이하 징역 또는
500만원 이하 벌금). 제2항은 그렇게 **오인될 표시·광고**도 금합니다.

이 앱은 무료이고, 본인의 기록을 본인의 입력으로 계산해 보여 줄 뿐이며, 어떤 사건도
대리하지 않습니다 — 그래서 '업으로서'에 닿지 않습니다. **문제는 그 사실이 어디에도
적혀 있지 않았다는 것**입니다. 안내가 네 줄로 늘었습니다: 법률 자문이 아니라는 것,
판단은 고용노동부와 노무사·변호사의 몫이라는 것, 세금·보험은 추정이고 앱이 아는
법령이 낡았을 수 있다는 것, 그리고 **어디에 물어보면 되는지**.

**면책은 넓게 쓰면 오히려 무효가 됩니다.** 약관규제법 제7조는 고의·중과실 책임을
배제하는 조항을 무효로 합니다 — '개발자는 어떠한 책임도 지지 않는다'는 한국
법정에서 지워집니다. 그래서 쓴 것은 **넓은 면책이 아니라 좁은 사실**입니다: 이것은
계산기다, 자문이 아니다, 확정 금액은 급여명세서다, 확인은 여기서 하라. 사실은
지워지지 않습니다.

#### 도움받을 곳 — 앱이 아니라 국가로 넘깁니다

설정에 접히지 않는 **법적 고지와 도움** 칸이 생겼습니다. 여덟 개 언어입니다.
빨간 상자 안에 **고용노동부 고객상담센터 ☎ 1350**(평일 09:00–18:00, 통역 지원),
**노동포털 labor.moel.go.kr**, **외국인노동자지원센터** — 전부 무료입니다.

이것이 제품으로도 맞고 책임으로도 맞습니다. **부족액을 찾아낸 근로자가 다음에 할
일은 앱을 더 보는 것이 아니라 1350에 거는 것**이고, 그렇게 되면 조언하는 자리에
앉는 것은 앱이 아니라 국가입니다. `접히지 않는` 것도 그래서입니다 — 접어 두면
아무도 열지 않습니다.

PWA 매니페스트의 설명에도 한 줄 붙었습니다(`계산기이며 법률 자문이나 노무 상담이
아닙니다`). 그 줄이 스토어와 설치 화면에 나가는 **표시**이므로, 제27조②가 보는
자리가 정확히 거기입니다.

#### 하지 않은 것

**계산은 한 줄도 손대지 않았습니다.** 임금 계산식·요율·스냅 규칙 전부 그대로이고,
v1 등가 증명은 그대로 통과합니다. 고지는 **경고이지 잠금이 아닙니다** — 출퇴근,
기록 열람, 근무내역서 출력, CSV 전부 예전 그대로입니다(asserted). 최저임금 경고가
그랬던 것과 같은 원칙입니다(2026-08-17).

새 키 셋 — `legal_and_help`, `legal_not_advice`, `legal_where_to_get_help`. 704 →
**707 키**. 63 new assertions (1037 total) under 근무내역서는 누가 썼는지를 맨
위에서 밝힙니다 · 이 앱은 계산기이지 노무사가 아닙니다 · 만든 사람의 이름은
근무내역서에 찍히지 않습니다 · 법적 고지는 접히지 않고 여덟 개 언어에 다 있습니다 ·
고지를 붙였다고 앱이 하던 일을 멈추지는 않습니다.

**다음 사람에게.** 여기서 지켜야 하는 선은 하나입니다: **앱은 계산하고 보여
주기만 하고, 판단은 하지 않습니다.** 그 선을 넘는 것은 정확한 법조문이 아니라
'당신은 진정을 넣어야 합니다' 같은 문장이고, 진정서를 **대신 써 주는** 기능이며,
이 계산에 **돈을 받는** 것입니다(그 순간 '업으로서'가 됩니다 — 만든 사람의 E-9
체류자격 문제와는 별개의 이유로 유료화는 이 선을 건드립니다). 지금의 내 권리 탭은
법의 숫자와 회사의 숫자를 **나란히 놓아 근로자가 스스로 보게** 할 뿐이고, 그
설계는 우연이 아니라 이 선입니다(2026-08-19 열한째 항목이 발생·사용·잔여를 가른
이유와 같습니다).

### 2026-08-28 (sixteenth) — 1월에 기본금을 올렸더니 12월 문서가 스스로와 어긋났습니다

열다섯째를 끝내고 물어본 김에 따라 나온 것입니다. **최저임금이 오르면 회사가
기본금을 올리고, 근로자는 설정에서 그 숫자를 고칩니다. 그 순간 지난 달
근무내역서가 다시 계산됩니다.**

그냥 다시 계산되는 것이 아닙니다. **문서가 스스로를 부정합니다.**

| 2026년 12월 근무내역서 | 인상 전 | 인상 후 |
|---|---|---|
| 일별 스무 줄을 더한 값 | ₩619,200 | **₩619,200** |
| 연장근로 합계 줄 | ₩619,200 | **₩642,000** |
| 머리말 통상시급 | ₩10,320 | ₩10,700 |

일별 금액은 기록에 박혀 있고(`c.pay`, 도장을 찍던 시각의 시급) 합계와 머리말은
`rate()`에서 나옵니다. 한 문서 안에 시급이 둘이었던 것입니다. **근로감독관은 그
칸을 더해 볼 수 있고, 더해서 맞지 않는 문서는 증거가 되지 못합니다.**

그리고 이것은 드문 일이 아닙니다 — **해마다 1월에 모든 근로자에게 일어납니다.**
최저임금이 오르고 기본금이 따라 오르는 그 달이, 하필 지난 달 문서를 회사
명세서와 맞춰 보는 달이기 때문입니다.

#### 급여기간마다 임금 기준 한 벌 (`wageLog`)

`settings.wageLog` — 기간 시작일(ISO)이 키입니다. 한 벌에
`{basic, divisor, rate, otMult, nightMult, holOverMult, allow, tf, src}`.

- **기간이 열려 있는 동안 도장을 찍습니다**(`stampWage()`, `componentDidUpdate`).
  같으면 쓰지 않으므로 시계가 1초마다 돌아도 저장이 일어나지 않습니다(asserted:
  50번 찍어도 추가 기록 0). 기간이 넘어가면 **그 기간 마지막 날의 설정**이
  그대로 남습니다 — 급여명세서가 만들어지는 방식 그대로입니다.
- **수당도 함께 붙듭니다.** 수당은 `avgDaily()`를 지나 휴업수당과 퇴직금으로
  가므로, 이것을 빼면 §46 금액이 계속 흔들립니다. 마지막까지 흔들린 것은
  실수령이었고, 원인은 `insBase → taxableFixed → fixedPay`로 흐르는 4대보험
  이었습니다.
- **`rate()`·`otRate()`는 손대지 않았습니다.** 새 `w*` 계열은 인자 없이 부르면
  예전 값을 그대로 돌려줍니다(asserted). 바꾼 것은 계산식이 아니라 **어느 시점의
  값을 쓰는가**이므로 v1 등가 증명은 그대로 통과합니다.
- **한 벌에 119바이트, 10년에 14KB.** 기록마다 붙이면 30배가 되는데, 그러고도
  '12월 기본금이 얼마였나'라는 월 단위 물음에는 답하지 못합니다.

#### 앱을 깔기 전에 끝난 기간 — 지어내지 않고 되살립니다 (`recoverWage`)

`c.pay = ot×otRate + night×nightRate + hol×otRate`입니다. 시간을 알고 배수를
알면 **시급이 나옵니다.** 추측이 아니라 앱이 이미 저장해 둔 값을 거꾸로 푸는
것입니다.

| 기본금 | 그 때 시급 | 되살린 값 |
|---|---|---|
| 2,156,880 | 10,320 | **10,320** |
| 2,236,300 | 10,700 | **10,700** |
| 2,600,000 | 12,440 | **12,440** |
| 3,010,000 | 14,402 | **14,402** |

원 단위까지 정확합니다. **마이그레이션도, 업그레이드할 때 남의 저장소를 건드리는
일도 없습니다** — 필요할 때 기록에서 계산합니다.

**모르는 것은 모른다고 문서에 적습니다.** 잔업도 야간도 특근도 없던 기간은
`c.pay`가 전부 0이라 아무것도 말해 주지 않습니다. 그런 기간은 되살리지 않고,
문서에 단서가 붙습니다:

- `src: 'recovered'` — *※ 이 기간의 통상시급은 앱이 저장해 둔 일별 금액에서
  되살린 값입니다. 고정수당은 현재 설정값을 썼으므로…* (시급은 되살려도 수당까지는
  되살릴 수 없습니다)
- `src: 'unknown'` — *※ 이 기간의 임금 기준이 기록에 남아 있지 않아 **현재
  설정값**으로 계산했습니다…*
- `src: 'live'` — 단서 없음(asserted: `※`가 아예 없습니다)

#### 급여 탭도 같은 기준을 읽습니다

**문서만 붙들어 두면 새 어긋남이 생깁니다** — 문서는 12월 시급으로 얼어 있는데
급여 탭은 지금 시급으로 다시 셉니다. 같은 기간을 두 화면이 다르게 말하면 근로자는
어느 쪽을 회사에 들이밀어야 할지 알 수 없습니다. 열두째가 스테퍼를 둘이 함께
쓰게 만든 것과 같은 이유입니다.

그래서 급여 탭의 명세서 줄·수당 줄·요약 칸, **명세서 대조표**(`slipRows`),
근무기록의 **일별 상세 줄**이 전부 `wageFor(P)`를 지납니다. 출퇴근 카드의
`예상 실수령`과 설정의 `taxWarn`은 그대로 지금 설정입니다 — 그 둘은 '지금 내
급여'를 말하는 자리이지 기간을 말하는 자리가 아닙니다.

`W`는 `const P = this.viewPeriod()` **바로 아래**에 있어야 합니다. 합계
(`const t`) 옆에 두었더니 `logRows`가 그보다 먼저 만들어져 TDZ로 터졌습니다.

#### 화면의 안내문도 반대말을 하고 있었습니다

여섯째가 남겨 둔 `step_back_to_any_month_you_still_have`가 *'지난 달 문서를 만들기
전에 기본금을 먼저 맞추십시오'*라고 말하고 있었습니다. 이제 그대로 하면 **이번
기간의 기준만 바뀌고 지난 문서는 그대로**입니다. 여덟 개 언어를 다시 썼습니다 —
기간마다 그 때의 기준을 간직한다는 것, 모르는 기간은 문서가 스스로 밝힌다는 것.

10 + 39 new assertions (974 total) under 지난 달 문서는 그 달의 시급으로
남습니다 · 앱을 깔기 전에 끝난 기간은 기록에서 되살립니다 · 쓰던 사람은 새 화면도
잃는 것도 없습니다 · 급여 탭과 근무내역서가 같은 기간을 같게 말합니다.
새 키는 없습니다(문서 안의 단서는 한국어 리터럴입니다).

**폰에서 확인**(21일 시작): 세 가지 상태가 실제 기록 위에 다 나왔습니다 —
`08.21 → 09.20` **live**(도장), `07.21 → 08.20` **recovered**(19일치에서 10,320을
정확히 되살림), `06.21 → 07.20` **unknown**(기록 없음, 단서 붙음). 세 기간 모두
급여 탭과 문서의 지급총액·실수령이 같습니다.

**확인하다 스스로 한 번 틀렸습니다, 적어 둡니다.** 7월 기간에서 '줄의 합과 합계가
다르다'가 나와서 버그인 줄 알았는데, **검증식이 휴일 8시간 초과분을 빼먹은
것**이었습니다. 그 기간에 ×2.0 구간이 2.5시간(₩12,900) 있었고, 넣으면
`1,194,540 = 1,181,640 + 12,900`으로 정확히 맞습니다. 이 자리를 검증할 때
`holOverPremium`을 빠뜨리지 마십시오 — 특근이 없는 달로 시험하면 안 보입니다.

**다음 사람에게.** 아직 붙들지 않은 것은 **보험료율과 세율**입니다. 이것들은
법이 따로 바꾸는 것이라 기본금과는 다른 문제이고, 지금은 언제나 현재 요율로
계산합니다.

### 2026-08-28 (fifteenth) — 최저임금이 오르면 무엇이 저절로 바뀝니까

근로자가 물었습니다: **최저임금이 바뀌면 휴업수당 같은 금액도 저절로 바뀝니까,
아니면 해마다 사람이 챙겨야 합니까?**

**금액은 바뀌지 않습니다 — 바뀌면 안 됩니다.** 급여는 언제나 근로자 자신의
기본금에서 나오고(`rate()`), 최저임금은 그 옆에 대 보는 잣대일 뿐입니다
(`:2291`의 주석이 그렇게 적혀 있습니다). 회사가 안 올려 줬는데 앱이 올려 버리면
**근무내역서가 받지도 않은 돈을 적게 됩니다.** 오를 때 앱이 할 일은 금액을 고치는
것이 아니라 '지금 받는 시급이 법 아래로 내려갔다'고 말하는 것이고, 그것은
`minWageWarn`이 2027-01-01에 정확히 합니다(asserted, 시계를 옮겨서 확인).

세 가지가 실제로 문제였습니다.

#### 1. 한 줄이 숫자를 문장에 박아 두고 있었습니다

설정의 `pale_figures_are_defaults_nobody_has_t`가 *'기본금 **2,156,880**은
**2026** 최저임금 **₩10,320** × 209시간'*이라고 말하고 있었습니다. 형제 문장들은
전부 `{p0}`으로 받는데 이것만 리터럴이었습니다. 2027년 1월 1일에 새로 깐 사람은
기본금 2,236,300을 받는데 이 줄만 2,156,880이라고 우깁니다. 여덟 개 언어를 다시
쓰고 네 값을 인자로 받게 했습니다.

**고치다 두 번째 것이 나왔습니다.** `DEFAULTS`는 `static`이라 페이지를 열 때
`new Date()`로 **한 번** 계산되는데, 설명하는 세 줄은 `this.now()`를 보고
있었습니다. 새해를 넘겨 켜 둔 폰에서 둘이 갈라지면 *'₩2,156,880은 2027 최저임금
₩10,700 × 209시간입니다'* — 10,700 × 209는 2,236,300입니다. **문장이 스스로를
부정합니다.** `DEFAULT_WAGE_ISO`로 그 순간에 이름을 붙이고, 기본값을 설명하는 세
줄이 모두 거기를 보게 했습니다. `minWageWarn`은 그대로 `now()`입니다 — '지금 내
시급이 법 아래인가'는 다른 질문이고, 새해에 비로소 둘이 달라집니다. 문장에서
숫자를 꺼내 곱이 맞는지 보는 assertion을 남겼습니다.

#### 2. 해마다 챙겨야 하는 일을, 시험이 대신 챙깁니다

`MIN_WAGE` 표는 손으로 고칠 수밖에 없습니다 — 앱이 오프라인이라 고시를 받아올
길이 없습니다. **그건 어쩔 수 없지만, 낡은 문장이 조용히 남는 것은 어쩔 수 있는
일입니다.**

`tools/check_lang.py`가 최저임금 금액, `× 209` 곱, 그리고 최저임금을 말하면서
연도를 리터럴로 적은 문장을 잡습니다. **표를 복사하지 않고 소스에서 읽습니다** —
복사본은 지키려는 대상과 똑같은 날에 낡습니다.

**믿기 전에 떨어뜨려 봤습니다.** 옛 문장을 도로 넣으면:

```
! base.json  pale_figures…: wage figure 10,320 is typed in
! base.json  pale_figures…: wage figure 2,156,880 is typed in
! base.json  pale_figures…: 최저임금 sentence names the year 2026
  exit=1
```

`sh test/run.sh`가 `set -e`이므로 그대로 게이트입니다.

#### 3. 경고가 다섯 달 늦었습니다

**최저임금법 제8조① — 고용노동부장관은 8월 5일까지 다음 해 최저임금을
고시합니다.** 그런데 배너는 `MIN_WAGE_UNTIL`을 넘긴 **1월 1일**에야 떴습니다.
그 날은 앱이 **이미 틀린** 날이고, 하필 최저임금이 오른 첫 달입니다.

| 날짜 | 상태 | 하는 말 |
|---|---|---|
| ~2027-08-05 | 조용 | — |
| **2027-08-06 ~ 12-31** | **고시됨** | 최저임금 **2028**년 최저임금이 고시됐습니다. 1월이 오기 전에 앱을 새로 받아 두면… |
| 2028-01-01 ~ | 낡음 | ⚠ …앱이 아는 마지막 해는 2027입니다… |

두 날짜 모두 `MIN_WAGE_UNTIL`에서 나오므로, 표에 한 줄 더하면 **둘 다 저절로**
따라 옵니다(`wageTableDueIso()`, `wageTableNextYear()`). **어느 쪽도 막지
않습니다** — 출퇴근도 근무내역서도 그대로입니다(asserted, 두 상태 모두).

새 키 `next_years_minimum_wage_is_published`, 여덟 개 언어. 703 → **704 키**.
52 new assertions (925 total) under 최저임금이 오르는 날, 앱은 스스로 말을
바꿉니다 · 다음 해 고시는 8월에 나옵니다 · 기본값 설명에 숫자를 박아 두지
않습니다.

**교훈.** `MIN_WAGE` 표에는 스스로 낡는 것을 알리는 장치가 있는데(넷째 항목이
공휴일 표에는 없다고 적어 둔 그것), **문장에는 없었습니다.** 이제 시험이 그
역할을 합니다.

### 2026-08-28 (fourteenth) — 휴업은 나가 본 사람만의 것이 아닙니다

야간조 근로자의 보고입니다. **오늘은 근무표상 일하는 날이었는데, 출근 서너 시간
전에 회사 총무가 '오늘 휴무'라고 연락했습니다. 출퇴근 화면에서 휴업 표시를 찾아
눌렀더니 설명이 '나갔지만 회사에 일이 없어…'였습니다. 나는 나가지 않았는데,
그러면 이 날은 앱에 들어갈 자리가 없는 겁니까?**

있습니다. **근로기준법 제46조가 보는 것은 '나갔는가'가 아니라 '사용자의
귀책사유인가'입니다.** 미리 알려 주었다고 휴업수당이 줄지 않습니다 — 그런 예외는
제46조에 없습니다(한 달 전 예고는 제24조 경영상 해고 이야기이고 다른 것입니다).

**기록을 쓰는 코드는 처음부터 맞았습니다.** 날짜 표시로 넣는 휴업
(`togglePending('shutdown')`)은 `sentHome` 없이 저장되고, 목록도 예전부터
`휴업 · 회사 사정으로 쉼`이라고 읽습니다. 틀린 것은 **그 카드에 붙은 문장
하나**였고, 그 한 줄이 근로자를 돌려보냈습니다.

`나갔지만 회사에 일이 없어 쉬거나 돌아온 날입니다`
→ `회사 사정으로 일하지 못한 날입니다 — 나갔다가 돌아왔든, **출근 전에 쉬라는
연락을 받았든** 같습니다`

제46조·70%·예상 금액·'연차가 아닙니다'는 그대로입니다. 넓힌 것은 앞머리의
전제뿐입니다. 여덟 개 언어.

**키 이름도 바꿨습니다** — `you_went_in_but_the_company_had_no_wor` →
`the_company_had_no_work_for_you_whethe`. 자동 슬러그가 고치려는 바로 그 말을
그대로 갖고 있었고, 이 저장소는 소스를 `grep`해서 읽으라고 되어 있습니다.
'나갔다'는 이름이 '나가지 않아도 됩니다'라는 문장 위에 붙어 있으면 다음 사람이
걸려 넘어집니다(2026-08-17의 `tour_setup_next`와 같은 이유). **키 수는 그대로
703입니다** — 새로 만든 것이 아니라 이름을 바꾼 것입니다.

40 new assertions (873 total) under 휴업은 나가 본 사람만의 것이 아닙니다 ·
여덟 개 언어가 모두 나가지 않은 날을 덮습니다. **나갔다가 돌려보내진 날이
`sentHome`으로 남고 목록에 `귀가`라고 읽히는지도 함께 걸어 두었습니다** — 두 날은
§46에서는 같지만 근무내역서에서는 다른 날이고, 한쪽을 고치다 다른 쪽을 뭉개기
쉬운 자리입니다.

**폰에서 확인**(EN): 카드가 *The company had no work for you — whether you went in
and were sent home, or were told before your shift not to come.* 예상 휴업수당
₩62,735.

### 2026-08-22 (thirteenth) — '다른 급여기간'은 스테퍼가 하는 말을 덜 말하며 되풀이했습니다

근로자의 보고입니다: **근무기록 맨 아래 '다른 급여기간'에 지난 달 날짜가 하루도
빠짐없이 늘어서 있는데, ‹ › 로 그 기간을 열면 같은 날들이 또 나온다.** 맞습니다.
어제(열두째) 스테퍼가 생기면서 그 목록은 자기 자리를 잃었습니다.

더 나쁜 것은 **같은 것을 두 곳에서, 한 곳은 덜 말한다**는 점입니다. ‹ 를 누르면
날짜·출퇴근 시각·실근무·잔업·야간·금액이 붙어서 나오는데, 목록에는 **날짜·주야·
급여기간·삭제** 네 가지뿐입니다. 열두째 항목이 '지난 기록에서는 그 날 얼마를
벌었는지가 없다'고 적어 둔 바로 그 화면이 그대로 남아 있었던 것입니다.

목록은 지웠습니다. 매달려 있던 두 가지는 이렇게 처리했습니다.

#### 1. 연도 칩은 스테퍼 안으로 들어가 '기간 고르기'가 됐습니다

목록 위의 `지난 기록 · PAST RECORDS` 칩(`최근 12개월` / `2026` / `전체`)은 그
목록을 **거르는** 것이었으므로, 목록이 없어지면 아무 데도 닿지 않는 단추가
됩니다. 그렇다고 지우면 3년 쓴 사람이 2024년을 보려고 ‹ 를 서른여섯 번 눌러야
합니다.

**처음에는 연도 칩만 옮겨서 '그 해의 가장 최근 기록이 든 기간'으로 보냈습니다.
3년치(735줄, 37기간)를 넣고 재 보니 그것으로는 모자랐습니다** — 그 자리는 언제나
그 해의 **12월**이고, 21일 시작이면 이름표가 `12.21 → 01.20`이라 누른 연도처럼
보이지도 않습니다.

| 가려는 곳 | 연도 칩만 있을 때 | 지금 |
|---|---|---|
| 3년 전 2023.09 | 칩 + ‹ 3번 = **4번** | **3번** |
| 2년 전 2024.08 | 칩 + ‹ 4번 = **5번** | **3번** |
| 1년 전 2025.08 | 칩 + ‹ 4번 = **5번** | **3번** |
| 2024년 2월 | 칩 + ‹ 10번 = **11번** | **3번** |
| 올해 2026년 3월 | ‹ 5번 | **2번** |

그래서 연도 아래에 **달 칸 열두 개**를 놓았습니다. **어느 기간이든 펼치기 → 연도
→ 달, 세 번이면 끝이고, 3년을 쓰든 10년을 쓰든 그 수는 늘지 않습니다.** 보고 있는
해 안에서는 두 번입니다.

**달로 가를 수 있는 근거**: 급여기간이 며칠에 시작하든 **한 달에 시작하는 기간은
언제나 정확히 하나**입니다. 21일 시작이면 '2024년 02월'은 `02.21 → 03.20` 하나뿐
입니다. 그래서 칸 열두 개가 그 해를 빠짐없이, 겹치지 않게 덮습니다(asserted:
2025년 열두 칸이 서로 다른 기간을 가리키고, 각 칸의 기간이 정말 그 달에 시작합니다).

- **평소에는 접혀 있습니다**(`state.jumpOpen`, 저장하지 않습니다 — `setOpen`과
  같은 화면 상태입니다). 매일 출근을 찍는 사람이 매일 보는 카드이고, 지난 기간을
  찾는 일은 한 달에 한 번이거나 그보다 드뭅니다. 접혀 있으면 **지도도 셈도 만들지
  않습니다** — 735줄에서 렌더 한 번에 1.4ms 더 드는데, 그것도 펼친 동안만입니다.
- **기간이 셋 이상 쌓이기 전에는 줄 자체가 없습니다**(`payBackMax() >= 2`).
  그 전에는 화살표가 더 빠릅니다.
- **기록이 없는 달은 흐리고 눌러도 아무 일이 없습니다.** 빈 기간을 여는 것은 빈
  표를 뽑는 것과 같습니다(`docBackMax`의 주석과 같은 이유). 덕분에 이 칸들이
  **어느 달에 일했는지 한눈에 보이는 지도**가 되기도 합니다 — 입사가 2023년 8월인
  사람의 2023년 칸은 01–06이 흐리고 07–12이 진합니다.
- **켜지는 것은 '보고 있는 기간이 시작하는 해와 달'입니다.** 연도와 달이 같은
  기준으로 켜지므로 언제나 같은 곳을 가리킵니다.
- **달을 고르면 접힙니다**(`goPeriod(n, true)`). 찾던 것을 찾았으니 그 아래 기록과
  금액이 화면을 밀지 않고 바로 보여야 합니다. **연도만 고른 사람은 아직 고르는
  중이라 펼쳐 둡니다** — 다음에 누를 것이 바로 아래 달 칸입니다. `이번 기간으로`도
  접습니다.
- **근무기록과 급여 두 스테퍼에 똑같이 들어갑니다.** 같은 `payBack`을 읽는 스테퍼가
  한쪽만 다르게 생기면 안 됩니다.
- 연도 칩에 붙어 있던 **줄 수(`2025 240`)는 뺐습니다.** 네 해가 두 줄로 접히게
  만들 만큼 자리를 먹는데, 어느 해를 누를지 정하는 데는 도움이 되지 않습니다 —
  어느 달에 기록이 있는지는 바로 아래 달 칸이 말합니다.
- **한 번만 거슬러 올라갑니다**(`periodMap()`). 칸마다 따로 걸어가면 열두 번이
  되고, `renderVals()`는 시계가 갈 때마다 돕니다.

#### 2. 앞으로의 날은 화살표가 닿지 않습니다 (`futureRecords()`)

`payBack`은 0 아래로 내려가지 않으므로 **‹ › 는 이번 기간에서 멈춥니다.** 그런데
다음 달 연차를 미리 적어 두면(`planned: x.d > now`, `:3525`) 그 기록은 아직
시작하지 않은 기간에 들어갑니다. 그것을 목록째 지웠다면 **볼 수도, 지울 수도 없는
기록**이 생깁니다 — 달력은 색 막대만 보여 줄 뿐 이미 있는 기록을 열어 주지 않습니다.

그래서 같은 자리에 `예정 · UPCOMING`이 남습니다. **지난 기간의 날은 여기 없습니다**
— 그것은 ‹ 로 걸어가면 금액까지 붙어서 나옵니다. 적어 둔 것이 없으면 이 자리는
아예 없으므로, 대부분의 사람에게는 목록이 통째로 사라진 것과 같습니다.

- **기준은 `viewPeriod()`가 아니라 오늘이 든 기간입니다.** 지난 기간을 펼쳐 놓고
  본다고 해서 '예정'의 뜻이 달라지면 안 됩니다.
- 줄마다 그 날이 든 급여기간 이름이 붙어 있어서, 지금 보고 있는 기간과 헷갈리지
  않습니다.

**앞으로 가는 화살표는 만들지 않았습니다.** 급여 탭이 같은 `payBack`을 읽으므로,
아직 오지 않은 달로 넘어가면 **일하지도 않은 달의 `예상 실수령`에 기본금이 통째로
찍힙니다.** 증거로 쓰라는 앱에서 그것은 '예정' 목록 하나보다 훨씬 나쁩니다.

#### 3. 목록에는 몇 년인지가 없었습니다 (`viewPeriodFull`)

기간 고르기를 실제로 써 본 근로자의 보고입니다: **2023년 08월을 골라 접고 목록을
내려가면, 줄에는 `08.21`처럼 월.일밖에 없어서 몇 년의 기록인지 알 수 없다. 제대로
골랐는지 스스로 의심하게 된다.** 연도는 스테퍼 카드에만 있었고 — 사실 거기에도
없었습니다(`P.label`이 `08.21 → 09.20`입니다) — 목록을 몇 줄만 내려가면 화면에서
사라집니다.

목록 맨 위에 **머리띠**가 붙습니다: `2023.08.21 → 2023.09.20`.

- **자리는 줄 바로 위입니다** — 누계 네 칸도, 52시간 경고도, 공휴일 안내 상자도
  다 지나고 나서 첫 줄 바로 앞. 처음에는 공휴일 안내 상자 **위**에 놓았는데,
  근로자가 아래로 옮기라고 했습니다: 머리띠는 목록의 머리이지 경고문의 머리가
  아닙니다.
- **스크롤을 따라다닙니다**(`position:sticky; top:0`). 맨 위에만 있으면 스무 줄을
  내려간 뒤에는 없는 것과 같습니다 — 근로자가 겪은 것이 정확히 그것입니다.
- **연도를 양쪽에 다 적습니다.** `12.21 → 01.20`처럼 해를 넘기는 기간이 있고,
  하필 그 기간이 연도가 가장 헷갈리는 자리입니다(`2023.12.21 → 2024.01.20`).
- **지난 기간일 때만 빨강입니다**(`var(--color-accent)` + 흰 글자). 이번 기간에는
  조용한 회색입니다. '지금이 아닌 곳에 있다'는 말이라야 빨강이 뜻을 갖고, 매일
  보는 화면에서 빨강이면 바로 위 잔업·야간 숫자와 다툽니다.
- **줄 자체는 손대지 않았습니다** — 여전히 `08.21`입니다. 줄마다 연도를 넣으면
  스무 줄이 다 넓어지는데, 머리띠 하나면 같은 말을 한 번만 하면 됩니다.

- **급여 탭에도 같은 머리띠가 있습니다.** 거기서도 아래로 내려가면 수당·공제
  줄만 남고 어느 기간의 명세인지가 사라집니다(`Pay period 08.21 → 09.20 ·
  payday 09.25` 한 줄에도 연도가 없습니다). 자리는 큰 금액 카드 바로 아래,
  `EARNINGS` 바로 위 — 위쪽은 요약이고 여기서부터가 훑어 내려가는 줄입니다.
  **값은 하나(`viewPeriodFull`)를 둘이 같이 씁니다**: 두 탭이 같은 `payBack`을
  읽으므로 머리띠가 어긋날 수 있는 길을 아예 만들지 않습니다(asserted).

#### 지운 것 · 남긴 것

`archYears` · `archPick` · `archKeep` · `otherRecords` · `state.archYear`가
없어졌습니다. **기록은 한 줄도 지워지지 않고, CSV와 백업은 예전처럼 언제나 전부를
냅니다**(asserted) — '최근 12개월'은 애초에 화면만 접는 것이었습니다.

키 일곱 개를 지웠습니다(`past_records`, `last_12_months`, `all_years`,
`every_record_the_app_has`, `older_records_are_still_here_and_still`,
`other_pay_periods`, `saved_but_paid_on_a_different_payslip`). 새 키 셋
(`pick_a_pay_period`, `upcoming_days`, `days_you_booked_ahead_they_sit_in_a_pa`),
여덟 개 언어(머리띠는 숫자뿐이라 새 키가 없습니다). 707 → **703 키**. 51 new
assertions (833 total) under 지난 기간은
스테퍼가 말합니다 · **3년을 쓴 폰에서 특정 급여기간까지 세 번** · 목록 맨 위에
연도까지 적힌 기간이 붙어 있습니다 · 미리 적어 둔 날은 예정에 남습니다. **임금 계산식은 손대지 않았습니다** — 바꾼 것은 어느 기간을 어떻게
고르는가이므로 v1 등가 증명은 그대로 통과합니다.

**교훈, 다음 사람에게.** 이 자리는 **기록이 쌓여야 드러납니다.** 한 해치로는 연도
칩만으로도 충분해 보였고, 3년치를 세워 놓고 '2024년 2월로 가 보라'고 시켜 본 뒤에야
열한 번이 나왔습니다. `test/regress.js`의 **3년을 쓴 폰에서 특정 급여기간까지 세 번**
블록이 735줄짜리 폰을 세우고 탭 수를 세므로, 이 카드를 건드릴 때 그 자리를 함께
돌려 보십시오 — 탭 수가 늘면 시험이 잡습니다.

**폰에서 확인**(EN, 21일 시작, 기록 27일): 근무기록에서 '다른 급여기간' 스물여섯
줄이 사라졌습니다. 3년치를 심은 화면에서는 `기간 고르기` → `2024` → `02` 세 번에
`02.21 → 03.20 · 20 days recorded`가 나오고, 고르는 자리는 스스로 접힙니다.

### 2026-08-21 (twelfth) — 급여기간이 넘어간 아침, 지난 한 달이 통째로 사라졌습니다

21일이 급여기간 첫날인 근로자의 보고입니다. **20일 20:40에 출근해 21일 08:50에
퇴근했더니, 출퇴근 화면이 다른 것을 보여 주고 그 날 번 돈이 어디에도 없었습니다.
근무기록과 급여는 전부 초기화된 것처럼 보였고, 지난 급여를 볼 방법이 없었습니다 —
아직 그 달 월급을 받지도 않았는데.**

세 가지가 겹쳐 있었습니다. 각각은 작고, 합쳐지면 '앱이 내 한 달을 지웠다'가 됩니다.

#### 1. 근무기록과 급여에 급여기간 스테퍼가 생겼습니다 (`payBack`)

근무내역서(`docBack`)는 2026-08-18(여섯째)부터 지난 기간까지 거슬러 갈 수 있었는데
**화면은 그러지 못했습니다.** `periodRecords()`·`totals()`가 언제나
`period(now())`를 봤기 때문에, 21일 00:00을 넘기는 순간 근무기록은 빈 목록이 되고
급여는 기본금만 남았습니다. 지난 한 달은 '지난 기록'으로 내려가 있었지만 거기서는
**날짜·주야·급여기간·삭제** 네 가지뿐 — 그 날 몇 시간을 일했고 얼마를 벌었는지가
없습니다. 하필 회사 명세서와 맞춰 보는 그 날 볼 수가 없었습니다.

- `periodBack(n)`을 화면이 함께 씁니다. **근무기록과 급여가 스테퍼 하나(`payBack`)를
  공유합니다** — 근무기록은 7월인데 급여는 8월이면 근로자는 어느 쪽을 믿어야 할지
  알 수 없습니다.
- `periodRecords(P)` · `totals(mode, P)` · `slip(P)` 모두 `viewPeriod()` 기준.
  명세서 대조표도 그 기간의 것이 나옵니다(`slips`는 예전부터 기간별로 저장하고
  있었고, 없던 것은 여는 방법이었습니다).
- **끝난 기간에 '며칠 남았습니다'라고 하지 않습니다.** `period().left`는 오늘
  기준이라 지난 기간에서는 언제나 0이고, 그대로 두면 반 년 전 기간이 '마지막 날'로
  읽힙니다. `마감된 기간` + *이 기간은 끝났습니다. 지급일 08.25에 회사가 준
  급여명세서와 이 금액을 맞춰 보십시오.* 빨간 카드도 `예정`이 아니라 `앱 계산`입니다.
- **머리말 칩과 설정의 기간 미리보기는 오늘 그대로**(`Pnow`). 스테퍼를 어디에 두든
  '지금이 언제인가'를 말하는 자리는 움직이면 안 됩니다.
- `payBack`은 **저장하지 않습니다.** 출근을 찍으러 여는 사람이 지난 달을 보고 있으면
  그것대로 위험합니다. 기록이 남아 있는 가장 오래된 기간까지만 갑니다.
- **열려 있는 근무는 출근한 날의 기간에만 얹힙니다.** 야간조는 기간 마지막 날 밤에
  출근해 다음 기간 아침에 퇴근하므로, 21일에 새 기간을 보는 사람에게 20일 밤 근무를
  얹으면 그 기간에 없는 하루가 생깁니다.

#### 2. 퇴근 도장을 찍는 순간 그 날 벌이가 화면에서 사라졌습니다 (`lastShift()`)

출퇴근 카드는 근무중일 때와 아닐 때가 **서로 다른 것**을 말합니다. 근무중에는 그 날의
것 — 출근·퇴근·실근무·잔업·야간, 그리고 `오늘 벌이` 일곱 줄. 퇴근을 찍는 순간 그
일곱 줄이 통째로 사라지고 **급여기간 누계 다섯 줄**로 바뀝니다. 열두 시간 동안
자라는 것을 지켜보던 금액이 도장 한 번에 없어집니다.

**야간조는 그것이 매일 아침입니다.** 다만 누계가 자라고 있는 동안에는 아무도
눈치채지 못했습니다 — 급여기간 첫날 아침에야 드러납니다. 그 근무는 출근한 날(20일)
기준이라 지난 기간에 들어가는데 카드는 오늘(21일)이 든 기간을 말하므로,
**근무일 0일 · 잔업 0.0h · 야간 0.0h.** 방금 열두 시간을 일하고 나온 사람에게 앱이
0을 다섯 줄 보여 준 것입니다.

`lastShift()` — 마지막으로 **일한** 하루. 카드 맨 위에 한 줄이 남습니다:
`지난 근무 · 08.20 목요일 · 실근무 11.0h · ₩82,560`. 급여기간과 상관없이 '내가
마지막으로 일한 날'은 언제나 하나이고, 그것이 근로자가 찾던 숫자입니다.

- **예정·지문 대기(`planned`/`awaiting`)와 앞으로의 날짜는 빠집니다** — 앱이 미리
  잡아 둔 줄이지 일한 날이 아닙니다. 연차·휴업도 아닙니다(`type === 'shift'`).
- **누계 네 줄은 고치지 않았습니다.** 오늘이 새 기간 첫날인 것은 사실이고, 그
  0은 참입니다. 문제는 0이라고 말한 것이 아니라 **방금 일한 하루가 어디에도 없던
  것**입니다. 줄이 하나 늘었을 뿐, 카드는 여전히 같은 말을 합니다.
- **근무중 카드는 손대지 않았습니다** — 거기에는 이미 `오늘 벌이`가 있습니다.

#### 3. 근무기록이 처음 쓰는 사람에게 하는 말을 했습니다 (`emptyLogBack()`)

기간이 넘어간 다음 날 근무기록을 열면 **`기록이 없습니다 · 출퇴근 화면에서 지문으로
출근하세요`**. ‹ 한 번 뒤에 지난 한 달 31일이 그대로 있는데 화면은 아무것도 없다고
말한 것이고, 근로자에게는 그것이 '앱이 초기화됐다'로 읽힙니다.

뒤에 기록이 남아 있으면 → `이번 급여기간은 아직 비어 있습니다` / *기록은 그대로
있습니다. 위의 ‹ 를 누르면 07.21 → 08.20 기간이 나옵니다.* **바로 앞 기간이 아니라
'기록이 있는' 가장 가까운 기간을 짚습니다** — 한 달을 통째로 쉰 사람에게 빈 기간을
가리켜 봐야 소용이 없습니다. 정말 처음 쓰는 사람에게는 예전 그대로입니다(그 사람에게
필요한 것은 출근하는 법이고, 돌아갈 기간이 없습니다).

#### 덤 — 퇴근 알림이 `202608.20`이라고 말했습니다

폰에서 확인하다 걸렸습니다. 퇴근을 찍으면 뜨는 검은 띠가 `✓ 202608.20 기록 추가됨`.
기록 키는 `y*10000 + m*100 + day`인데, **연도가 붙기 전(BUG A)에는 키에 연도가 없어서
`Math.floor(k / 100)`이 곧 월이었습니다.** 연도가 붙은 뒤로 그 자리가 202608이 됐고
아무도 고치지 않았습니다. 퇴근할 때마다, 손으로 날을 넣을 때마다 보이던 줄입니다.

새 키 `last_shift`, `worked_h`, `nothing_logged_in_this_pay_period_yet`,
`your_records_are_still_there_tap_to_st`, 여덟 개 언어. 38 new assertions
(790 total) under 퇴근을 찍는 순간 그 날 벌이가 화면에서 사라졌습니다 ·
퇴근 알림이 202608.20이라고 말했습니다 · 기록이 뒤에 있으면 처음 쓰는 사람에게 하는
말을 하지 않습니다. 임금 계산식은 손대지 않았습니다 — 바꾼 것은 **어느 기간을 보고
있는가**와 **무엇을 화면에 남기는가**이므로 v1 등가 증명은 그대로 통과합니다.

**폰에서 확인**(EN, 21일 시작, 기록 19일): 근무기록 ‹ 한 번에
`07.21 → 08.20 · 19 days recorded` · REGULAR 132.0h · OVERTIME 39.0h ₩603,720 ·
NIGHT 49.0h ₩252,840 · HOLIDAY 21.0h ₩325,080 와 날짜별 줄이 모두 돌아왔고,
출퇴근 카드 맨 위에 `Last shift · 08.20 THU · 11.0H WORKED · ₩82,560`.

**교훈, 그리고 다음 사람에게.** 이 세 가지는 전부 **급여기간이 넘어가는 그 하루**에만
드러납니다. 한 달에 한 번, 그것도 야간조에게는 퇴근하는 아침에. 다른 스물아홉 날에는
누계가 자라고 있어서 아무 문제도 없어 보입니다. **날짜를 바꿔 가며 열어 보는 시험이
아니면 영영 안 보입니다** — `mk(V2, '2026-08-21T09:00:00')`처럼 기간 첫날을 콕 집어
세우는 assertion을 남겨 두었으니, 화면을 건드릴 때 그 자리를 함께 돌려 보십시오.

### 2026-08-19 (eleventh) — 대장의 '사용 0일 · 잔여 15일'은 거짓말이었습니다

근로자가 물었습니다: **발생 15 · 사용 0 · 잔여 15인데, 바로 아래 칸에 내가 적어
둔 '지금 남은 연차 9일'이 있다. 이게 논리에 맞습니까?**

맞지 않았습니다. `annLedger`의 '사용'은 **앱에 기록된 연차 일수**
(`annualUsedThisYear()`)였고 '잔여'는 `발생 − 그것`이었습니다. 앱을 쓰기 전에
쓴 연차를 앱은 모릅니다. 그래서 **근무 도중에 앱을 깐 사람 — 다시 말해 모든
사람 —** 은 사용 0일로 시작했고, 잔여는 발생을 그대로 베꼈습니다.

같은 카드 안에서 15와 9가 정면으로 어긋났고, 근로자 눈에는 아래 칸이 먹통인
것으로 읽혔습니다. **더 나쁜 것은 그 문서를 뽑았을 때입니다** — 연차를 여섯 날
쓴 사람의 서류가 근로감독관 앞에서 '하나도 안 썼다'고 말합니다. 모르는 것을
아는 것처럼 적은 것이고, 이 앱이 하지 않기로 한 바로 그 일입니다.

| | 예전 | 지금 |
|---|---|---|
| 발생 ACCRUED | 15 (법) | 15 (법) — 그대로 |
| 사용 USED | **0** (기록된 것만) | **6** (`발생 − 잔여`) |
| 잔여 LEFT | **15** (`발생 − 사용`) | **9** (근로자가 적어 둔 숫자) |

**발생만은 그대로 법의 숫자로 둡니다.** 그래야 회사가 덜 준 것이 눈에 보입니다 —
발생 15에 잔여 9면 사용 6이고, 근로자가 기억하는 것이 세 날뿐이라면 그 차이가
회사에 물어볼 거리입니다. 잔여까지 법이 계산하면 이 탭이 있을 이유가 없어집니다.

- **잔여는 입사일이 없어도 압니다** — 근로자가 직접 적은 숫자이기 때문입니다.
  예전에는 입사일이 없으면 `?`였습니다. 발생과 사용은 여전히 `?`입니다(발생을
  모르면 뺄 수 없습니다).
- **법보다 많이 남았으면 사용은 0입니다.** `Math.max(0, acc − left)` — 회사가
  더 주는 것은 음수로 적을 일이 아닙니다.
- **적어 둔 날 이전의 연차는 다시 빼지 않습니다.** `annualLeft()`가
  `annualAsOf` 이후의 기록만 세므로, 이미 9 안에 들어 있는 지난 연차를 두 번
  세는 일이 없습니다. 이것이 근로자가 **지난 날짜를 기억해 낼 필요가 없는**
  이유입니다 — 오늘 몇 날 남았는지만 적으면 됩니다.
- **출퇴근 탭의 연차 단추와 대장이 이제 같은 숫자를 말합니다**(둘 다
  `annualLeft()`). 어긋나면 근로자는 어느 쪽을 믿어야 할지 알 수 없습니다.

**카드의 설명도 함께 고쳤습니다.** `this_is_what_the_law_gives_you_your_co`가
'이것은 법이 주는 일수입니다 … 앱이 따로 세어'라고 말하고 있었는데, 이제 법의
숫자는 세 칸 가운데 발생 하나뿐이고 잔여는 '따로' 있지 않습니다. 세 칸을 각각
짚고, **사용에 앱을 쓰기 전의 연차가 들어 있다는 것**을 말하도록 여덟 개 언어를
다시 썼습니다. 새 키는 없습니다 — 있던 문장을 바로잡았습니다.

**`annualUsedThisYear()`와 `leaveYearStart()`는 지우지 않았습니다.** 연차년도가
입사 기념일부터 돈다는 규칙은 맞고 시험도 걸려 있습니다. 다만 이제 화면을
움직이지 않으므로, 다시 잇지 말라고 메서드 위에 적어 두었습니다.

21 new assertions (677 total) under 대장의 사용 0일 · 잔여 15일이 거짓말이었습니다.
예전 동작을 붙들고 있던 기존 세 줄(`사용 2` · `잔여 13` · `회사 대장과 다를 수
있다고`)은 새 동작으로 고쳤고, 왜 바뀌었는지 그 자리에 적었습니다.

폰에서 확인: **15 / 6 / 9**.

### 2026-08-19 (tenth) — 숫자 자판의 완료 키가 죽어 있었습니다

폰에서 온 보고: 숫자를 고치고 나면 **자판에 Enter도 완료도 없다. 있어도
눌리지 않는다.** 칸을 떠나려면 칸 바깥을 눌러야 하는데, 그 바깥은 대개 다른
단추입니다. 잘못 누르면 다른 일이 일어납니다.

**추측하지 말고 폰에서 재십시오.** 갤럭시(삼성 자판)에 네 가지를 나란히
띄워 놓고 하나씩 눌러 봤습니다:

| 칸 | 오른쪽 아래 키 |
|---|---|
| `type=number` (뒤에 칸이 있을 때) | `Next` · 살아 있음 |
| `type=number enterkeyhint=done` | `Next` — **힌트를 무시합니다** |
| `type=number`, 마지막 칸 | **`Go`, 회색으로 죽어 있음** ← 근로자가 본 화면 |
| `type=text inputmode=decimal enterkeyhint=done` | **`Done`, 살아 있음** |

크롬은 `type=number`에서 `enterkeyhint`를 form 이동 논리로 덮어씁니다 — 뒤에
칸이 있으면 `Next`, 마지막이면 `Go`이고, 보낼 form이 없으니 그 `Go`는 회색으로
죽습니다. **`enterkeyhint`만 붙이는 것은 아무것도 고치지 못합니다**(한 번
그렇게 해 보고 폰에서 회색 `Go`를 다시 봤습니다). `type="text"`에
`inputmode="decimal"`이면 자판은 그대로 숫자판인데 힌트가 지켜집니다.

**그래서 숫자 칸 19개가 전부 `type="text" inputmode="decimal"
enterkeyhint="done"`입니다.** 자판 모양은 그대로입니다 — 숫자와 `.` `,`.

**브라우저가 걸러 주던 일을 대신해야 합니다.** `type=number`가 아니므로 이제
글자가 들어올 수 있습니다.

- **`Component.numClean(raw)`** — 쉼표는 천 단위 구분으로 보고 버리고
  (`2,156,880`을 붙여넣는 사람이 있습니다), 숫자와 소수점만 남기고, 소수점은
  하나만 둡니다(배수 `1.5` 때문에 필요합니다). 음수는 없습니다 — 이 앱의 숫자
  칸은 금액·일수·시간·배수뿐입니다.
- **`Component.numReady(v)`** — `''`도 `'.'`도 아직 숫자가 아닙니다. 둘 다
  `+v`가 0이나 NaN이 됩니다. `numField`는 이 둘을 저장하지 않습니다. `1.5`를
  치는 도중의 `'1.'`에서 배수가 튀지 않는 이유가 이것입니다.
- `numField`를 쓰지 않는 **명세서 대조 칸**(`slipRows`)도 `numClean`을 지나서
  들어갑니다. 거기서 NaN이 나면 던지지 않고 차액 계산으로 조용히 번집니다.

**완료 키는 눌렀을 때 실제로 무언가 해야 합니다.** form 밖의 글자 칸에서
Enter는 기본적으로 아무 일도 하지 않고, **아무 일도 하지 않는 키는 회색으로
죽은 키와 근로자에게 똑같습니다.** `leaveField(ev)` — Enter면 기본 동작을
막고 칸을 떠납니다. `numField`/`timeField`의 새 `key`로 나가고, 템플릿의
`onKeyDown`이 부릅니다(줄 안에서 만들어지는 수당·공제·배수·명세서 칸 포함).
시각 칸 두 개도 같은 키를 씁니다 — 나가면서 `09:00` 한 모양으로 정리하던
동작은 그대로입니다.

폰에서 확인: 회색 `Go`가 살아 있는 `Done`으로 바뀌었고, 눌렀더니 자판이
내려가고(`visualViewport` 473 → 832) 친 숫자가 그대로 들어갔습니다.

36 new assertions (656 total) under 숫자 자판의 완료 키가 죽어 있었습니다.
임금 계산식은 손대지 않았습니다 — 바꾼 것은 칸의 종류이지 식이 아니라서 v1
등가 증명은 그대로 통과합니다.

**앞으로 이 자리를 볼 사람에게.** 자판은 앱이 그리는 것이 아니라 IME가 그리는
것이고, IME마다 다릅니다. **헤드리스로는 볼 수 없고, CDP로 `focus()`를 불러도
볼 수 없습니다** — `document.hasFocus()`가 거짓이면 포커스 이벤트조차 나지
않습니다. `adb shell input tap`으로 진짜 손가락처럼 누르고 `adb exec-out
screencap`으로 찍어서 눈으로 보십시오. 좌표는 화면을 재지 말고 요소에서
직접 얻으십시오(`rect.left * devicePixelRatio`). 그리고 **자판이 올라온 뒤에는
그 좌표가 이미 낡았습니다** — 화면이 스크롤됩니다. 낡은 좌표로 다시 누르면
자판 위를 누르게 되고, 그러면 근로자의 설정에 숫자가 하나 들어갑니다.

### 2026-08-18 (ninth) — 하루짜리 휴업은 단수로 적습니다

내 권리 › 휴업수당의 두 줄이 금액 옆에서 **`1 full days sent home`** ·
**`1 days cut short by the company`**로 읽혔습니다. 복수형이 문장에 박혀
있었습니다. `t.days === 1`이면 단수 키를 쓰도록 갈랐습니다 — 두 줄은 같은 카드에
붙어 있어서 한쪽만 고치면 더 이상해집니다.

새 키 `one_full_day_sent_home`, `one_day_cut_short_by_the_company`, 여덟 개 언어.
한국어·베트남어·태국어·크메르어·네팔어·인도네시아어·중국어는 수에 따라 낱말이
바뀌지 않으므로 번역은 같은 문장에 1을 넣은 것이고, **실제로 달라지는 것은 영어
하나뿐**입니다. 11 new assertions (620 total) — 하루일 때 단수, 여러 날일 때
복수가 그대로인지(고치다 반대로 망가뜨리기 쉬운 자리), 여덟 개 언어 모두.

**남아 있는 같은 종류의 문장들 — 고치지 않았습니다.** `lang/base.json`을 훑으면
`{p0}` 뒤에 복수형이 박힌 문장이 스무 개쯤 있고, 그 가운데 실제로 1이 될 수 있는
것이 열 개쯤 됩니다. 폰에서 바로 보이는 것 하나: 내 권리 맨 위가
**`Service counted from this day: 1 years 4 months (505 days)`**
(`the_app_counts_your_service_from_this`). 그 밖에 `days_added`(연차 하루 넣을 때),
`n_days_recorded`, `days_left_changeover_to_on`, `days_worked_ot_night_as_of_...`,
`exported_days_of_records`, `restored_days_of_records` 등.

**한 줄씩 키를 늘리는 방식으로는 여기서 끝납니다.** `days_as_of_logged_since_left`
(`{p1} days as of {p0} · {p2} logged since → {p3} left`)처럼 한 문장에 수가 셋인
것은 단수 키 하나로 풀리지 않습니다 — 조합이 여덟 가지입니다. 제대로 하려면
`T()`가 수에 따라 낱말을 고르는 방법을 알아야 하고, 영어만 그것이 필요하므로
`en` 값에만 붙는 표시(예: `{p0} day{p0|s}`)와 `sync_lang.py`의 이해가 함께
가야 합니다. 이 변경 하나에 얹기에는 큰 일이라 여기서 멈췄고, 다음에 손댈 사람이
보라고 적어 둡니다.

### 2026-08-18 (eighth) — 최저임금을 그대로 받는 사람도 답할 수 있어야 합니다

급여 맨 위의 `ONE THING FIRST · 기본금이 얼마입니까?` 카드가 뜨는 조건은
**'기본금이 아직 기본값과 같은가'**(`isDef('basic')`)였습니다. 그런데 그 기본값은
`최저임금 × 209 = 2,156,880`이고, **그것이 E-9 근로자에게 가장 흔한 기본금입니다.**
그 금액을 실제로 받는 사람에게 앱은 영영 '아직 안 적었다'고 우겼습니다.

`basicAsked`는 저장하지 않습니다(`save()`가 쓰는 목록에 없습니다). 그래서
'나중에 — 기본값으로 두기'를 눌러도 앱을 다시 열면 카드가 다시 맨 위에 앉았고,
`ESTIMATED TAKE-HOME`은 카드 아래로 밀려났습니다. **답이 이미 맞는 사람에게
계속 묻는 화면은 세 번째부터는 읽히지 않고 그냥 넘겨집니다** — 그리고 정작
고쳐야 할 사람도 같은 손놀림으로 함께 넘기게 됩니다.

원래 설계(`:1840`의 주석)는 '안 고쳤다면 다음에 한 번 더 묻는 편이 낫다'였고,
**답을 안 한 사람에게는 그것이 맞습니다.** 빠져 있던 것은 *'맞다'고 말할 방법*
이었습니다. 넘어가기는 유예이지 확인이 아닙니다.

**`settings.basicConfirmed`** (저장됨). 카드에 단추가 하나 늘었습니다:

| | 하는 일 | 남는 곳 |
|---|---|---|
| **맞습니다 — 이것이 내 기본금입니다** | `basicConfirmed = true` | **설정 · 저장됨** |
| 나중에 — 기본값으로 두기 | `basicAsked = true` | state · 이번 실행만 |

확인 단추가 주(까만 배경), 나중에가 부(외곽선)입니다. `askBasic`은 이제
`(isDef || basicSticky) && !basicAsked && !st().basicConfirmed`.

**설명 줄도 따라갑니다.** 확인한 사람에게 `아직 당신의 급여가 아닙니다 — 명세서의
기본급을 그대로 적어 주세요`는 거짓말입니다. `basicDefaultNote`가 세 갈래가 됐습니다:
본인이 고친 숫자 / 아직 안 답한 기본값 / **확인한 기본값**(`이 금액이 본인의
기본금이라고 확인했습니다. 마침 2026 최저임금 × 209시간과 같은 금액이고, 가장 흔한
기본금이기도 합니다`).

**확인이 덮지 않는 것 — 이게 중요합니다.** 확인은 *'이 금액이 내 기본금이다'*
이지 *'이 금액이 적법하다'*가 아닙니다. 2027년에 최저임금이 10,700으로 오르면
2026년 금액을 확인해 둔 사람은 그 순간부터 미달입니다. `minWageWarn`은 `rate()`를
오늘의 최저임금과 견주므로 **그대로 뜹니다**(asserted). 그리고 그때는
`DEFAULTS.basic`이 2,236,300으로 바뀌어 `isDef`가 거짓이 되므로 카드도 뜨지
않습니다 — 확인 단추가 근로자에게 불리한 것을 덮어 주는 일은 없습니다.

**쓰던 사람에게 새로 생기는 화면은 없습니다.** `basicConfirmed`는 새 설정이라
업그레이드하면 `false`로 들어오지만, 이미 자기 기본금을 적어 둔 사람은 `isDef`가
거짓이라 어차피 묻지 않습니다(asserted).

새 키 `yes_this_is_my_basic`, `you_confirmed_this_is_your_basic`, 여덟 개 언어.
24 new assertions (609 total) under 최저임금을 그대로 받는 사람도 답할 수 있어야
합니다 · 확인해도 최저임금 경고는 그대로 뜹니다 · 쓰던 사람은 묻는 화면을 새로
만나지 않습니다.

**폰에서 확인하다 걸린 함정, 코드가 아니라 시험 방법이었습니다.**
`adb shell am force-stop`은 SIGKILL이라 **WebView가 localStorage를 디스크에
내리기 전에 죽습니다.** 확인 → `save()` → 곧바로 force-stop 하면, 살아 있는
프로세스 안에서는 `true`로 읽히는데 다시 켜면 `false`입니다. 저장 코드가 아니라
플러시 타이밍입니다 — `location.reload()`로는 언제나 남고, 몇 초 기다린 뒤
force-stop 해도 남습니다. **앞으로 '설정이 저장 안 된다'가 보이면 이것부터
의심하십시오.** 사용자가 홈 버튼으로 나가는 정상 경로에서는 플러시가 됩니다.

### 2026-08-18 (seventh) — 마지막 날에 금액이 더 오른다고 말하면 안 됩니다

큰 빨간 실수령 카드 밑의 한 줄이 남은 날과 상관없이 **언제나** 같은 문장이었습니다:
`{p1}일이 남아 있어 금액은 더 올라갑니다`. 마지막 날에는 그것이 `0일이 남아 있어
금액은 더 올라갑니다`가 되어, 바로 위에 붙은 상태(`마감`)와 정면으로 어긋났습니다.
하필 그 날이 근로자가 회사 명세서와 맞춰 보는 날입니다.

`periodState`(`:4653`)는 `P.left > 0`으로 갈라지고 있었는데 `payslipCheck`(`:4657`)는
갈라지지 않았습니다. 두 줄 차이입니다.

**그런데 `P.left` 자체가 틀려 있었습니다.** `Math.round((e − now) / 86400000)` —
`e`는 마지막 날의 00:00이라, 남은 시간을 밀리초로 재서 반올림하면 **마지막 날
전날 정오에 이미 0**이 됩니다.

| | 예전 | 지금 |
|---|---|---|
| 07.30 09:00 | `진행중 · 1일 남음` | `진행중 · 1일 남음` |
| 07.30 13:00 | **`마감`** | `진행중 · 1일 남음` |
| 07.30 20:00 | **`마감`** | `진행중 · 1일 남음` |
| 07.31 아무 때나 | `마감` | `마지막 날` |

30일 오전에는 하루 남았다던 것이 **점심때 마감으로 바뀌었고**, 31일이 통째로
남아 있는데 다 끝난 것처럼 보였습니다. 남은 날수는 하루의 어디에 서 있든 같아야
합니다 — 이제 날짜 경계(`day0`)로 셉니다.

**그리고 0일은 '마감'이 아닙니다.** `period(now)`는 언제나 오늘이 들어 있는 기간을
돌려주므로, `left === 0`은 '기간이 끝났다'가 아니라 **'오늘이 마지막 날'**이라는
뜻입니다. 오늘 근무가 아직 남아 있는데 마감이라고 말하면 안 됩니다. `마감`은
`마지막 날 · LAST DAY`로 바뀌었고, 이제 어디에서도 쓰이지 않는 `closed` 키는
여덟 개 언어에서 지웠습니다.

세 갈래가 됐습니다 — 2일 이상은 예전 그대로, 1일은 단수(`진행중 · 1일 남음` /
`이번 기간이 하루 남아 있어`), 0일은 `마지막 날` + *오늘이 이번 기간의 마지막
날입니다. 회사가 주는 급여명세서와 이 금액을 맞춰 보십시오.* 영어에서 `1 days`가
나오던 자리도 함께 없어졌습니다.

새 키 `estimated_for_payday_every_day_logged`, `estimated_for_payday_one_day_left`,
`in_progress_one_day_left`, `last_day_of_this_period`, 여덟 개 언어. 23 new
assertions (585 total) under 마지막 날에 금액이 더 오른다고 말하면 안 됩니다 and
남은 날은 시계가 아니라 달력으로 셉니다 — 21일 시작과 2월 말일 포함, 한국어와
영어 양쪽으로.

**교훈:** 같은 값에서 갈라지는 문장이 두 개 있으면 둘 다 갈라져야 합니다. 그리고
'며칠 남았나'는 날짜를 세는 질문이지 시간을 재는 질문이 아닙니다.

### 2026-08-18 (sixth) — 지난 달 근무내역서도 뽑을 수 있습니다

7월 한 달을 폰에 넣고 8월에 열었더니, **7월 근무내역서를 만들 방법이 없었습니다.**
`evidenceHtml()`과 `evidenceName()`이 언제나 `this.period(this.now())`를 썼기
때문입니다. 8월 18일에 단추를 누르면 `근무내역서-08010831.html`이 나왔고, 그
안에는 7월 기록이 **한 줄도** 없었습니다. 기록은 `localStorage`에 그대로 있고
CSV 내보내기는 전부를 냈지만, 사람이 읽는 문서만 나오지 않았습니다.

증거로 쓰라고 만든 앱에서 이것이 가장 나쁜 종류의 구멍입니다. **임금체불 진정은
그 달의 다음 달에 넣는 것이 아닙니다** — 반 년 뒤일 수도, 퇴직하고 나서일 수도
있습니다. 그때 근로감독관 앞에 내놓을 문서가 만들어지지 않습니다.

**`periodBack(n)`** — 급여기간을 n번 거슬러 올라갑니다. '한 달 빼기'가 아니라
직전 기간 시작 하루 전으로 가서 `period()`에게 다시 묻습니다. `period()`가 이미
짧은 달과 월말 시작을 다 알고 있으므로, 21일 시작이 2월을 지나는 경우도
(`04.21 → 05.20` → … → `02.21 → 03.20`), 31일 시작이 짧은 달에서 말일로
내려앉는 경우도(`02.28 → 03.30`) 그대로 맞습니다. `prevPeriod()`는 이제
`periodBack(1)`입니다.

**기간을 받는 쪽으로 바꾼 것들** — 전부 인자가 없으면 예전 그대로입니다:
`periodRecords(P)` · `totals(mode, P)` · `weeks(P)` · `weekOver(P)` ·
`evidenceHtml(P)` · `evidenceName(P)`.

**화면은 달력과 같은 `‹ ›` 스테퍼**입니다(내 권리 아래, 설정 › 백업과 내보내기).
칩을 늘어놓지 않은 이유는 기간 이름이 `07.01 → 07.31`처럼 길어서 열두 달이면
화면을 네 줄 잡아먹기 때문입니다. 끝에 닿으면 화살표가 **회색이 되고 아무 일도
하지 않습니다** — 사라지게 하면 아래 단추의 자리가 움직여서, 누르려던 것을 잘못
누릅니다. 밑에 `23 days recorded`가 붙어서 빈 기간을 뽑는 일이 없습니다.

- **갈 수 있는 범위는 가장 오래된 기록이 든 기간까지**(`docBackMax()`). 기록이
  없는 기간의 근무내역서는 빈 표일 뿐이고, 빈 표를 뽑게 해 둘 이유가 없습니다.
- **`docBack`은 저장하지 않습니다.** 앱을 다시 열면 이번 기간에서 시작합니다 —
  문서를 만들 때 기본값이 '지금'이 아니면 그것대로 위험합니다 (asserted).
- **`작성` 줄은 언제나 오늘입니다.** 문서가 덮는 기간(P)과 문서를 만든 날(n)은
  서로 다른 것이고, 지난 기간을 뽑을 때 비로소 달라집니다. 폰에서 확인:
  `급여기간 07.01 → 07.31 · 지급일 08.10 · 작성 2026.08.18`.
- §46 블록의 1일 평균임금도 `avgDaily(P.e)`로 그 기간 끝 기준입니다.

**남아 있는 한계, 문서에는 적지 않고 화면에만 적었습니다.** 기본금과 각 요율은
**지금 설정된 값**을 씁니다 — 설정에는 이력이 없습니다. 그 뒤로 임금이 올랐다면
지난 달 문서가 그 오른 시급으로 계산됩니다. 설정 이력은 이 변경보다 훨씬 큰
일이라 여기서 하지 않았고, 대신 스테퍼 밑에 여덟 개 언어로 한 줄을 적었습니다:
*지난 달 문서를 만들기 전에 기본금을 먼저 맞추십시오.* `reason.ko`가 기록 위에
스냅숏으로 남는 것과 같은 문제이고, 같은 방식(기간별 스냅숏)으로 풀어야 합니다.

새 키 `document_period`, `step_back_to_any_month_you_still_have`, 여덟 개 언어.
`makes_a_one_page_korean_document_cover`의 '이번 급여기간' → '위에서 고른
급여기간'으로 여덟 개 언어 모두 고쳤습니다. 26 new assertions (562 total) under
지난 달 근무내역서도 뽑을 수 있어야 합니다 and 21일 시작 급여기간도 거꾸로
걸어갑니다.

### 2026-08-18 (fifth) — 출근 도장의 초가 잔업 30분을 먹고 있었습니다

Found while testing the 돌려보내진 날 flow on the phone: a 09:30 퇴근 punch produced
`outH` **9.4999997**, and `snapOut` floored it to 09:00.

`sessionHours()`가 두 가지를 섞고 있었습니다.

```js
const inH = inD.getHours() + inD.getMinutes() / 60;           // 초를 버립니다
const el  = (this.now().getTime() - inD.getTime()) / 3600000; // 초가 살아 있습니다
return { inD, inH, outH: inH + el, ... };
```

`inH`를 자르는 것은 **맞습니다** — `snapIn`이 다음 30분 단위로 올림이라, 06:00:37을
초까지 살리면 06:30 출근이 되어 근로자가 출근 쪽에서 30분을 잃습니다. 틀린 것은
그 잘라 낸 밑변에 **초까지 정확한 경과**를 더해 `outH`를 만든 것입니다. 결과적으로
`outH`는 실제 퇴근보다 최대 **59초 앞섰고**, `snapOut`은 지난 30분 단위로 내림이라
그 몇 초가 30분을 통째로 깎았습니다.

```
06:00:SS 출근 · 17:30:05 퇴근
  06:00:00 → 인정 17:30 · 실근무 10.5 · 잔업 2.5
  06:00:10 → 인정 17:00 · 실근무 10.0 · 잔업 2.0   ← 30분 손실
  06:00:59 → 인정 17:00 · 실근무 10.0 · 잔업 2.0   ← 30분 손실
```

같은 날 같은 일을 하고도 **출근 도장의 초가 몇이었느냐**로 잔업 30분(₩7,740)이
갈렸습니다. 근로자는 그 초를 볼 수 없습니다. 언제나 근로자에게 불리한 쪽으로만
틀렸습니다.

**왜 여태 안 보였는가.** 정시(매시 00분) 퇴근은 `outGrace` 15분이 덮어 줍니다 —
17:29:55는 유예 안이라 18:00… 이 아니라 17:00으로 가지 않고 정상 처리됩니다.
덮개가 없는 것은 **30분 자리**뿐이고, 거기가 하필 잔업이 끝나는 자리입니다.

`outH`는 이제 출근한 날 자정에서 곧장 잽니다 — `(now − midnight) / 3600000`.
자정 기준이라 자정을 넘기는 야간조는 그대로 24를 넘는 값이 되어 예전과 같습니다
(21:00:41 출근 → 06:00:03 퇴근 = `outH` 30.0008, 인정 06:00, asserted).
`inH`는 손대지 않았습니다.

**임금 계산식은 그대로입니다.** 고친 것은 계산식에 **넣는 시각**이지 계산식이
아니라서, v1 등가 증명(`calc()`·`snapIn`/`snapOut`·요율)은 그대로 통과합니다.
바뀐 값은 언제나 예전보다 크거나 같으므로 **이 고침으로 손해 보는 근로자는
없습니다**. 11 new assertions (536 total) under 출근 도장의 초가 잔업 30분을
먹고 있었습니다 — 야간조 자정 넘김, 시계 역행, 너무 이른 퇴근 가드 포함.

**교훈:** 분 단위로 자른 값과 초까지 정확한 값을 더하지 마십시오. 그리고 내림이
걸린 자리에서는 그 몇 초가 30분입니다.

### 2026-08-18 (fourth) — 제헌절이 빨간날로 돌아왔습니다

Found by driving a full month through the app on the phone — 06:00~15:00, 휴게
10:00–11:00, 7월 한 달. The worker looked at the result and said 7월 17일은
빨간날이었다. They were right.

**제헌절은 2008년에 공휴일에서 빠졌다가 2026년에 되살아났습니다** (2026-04-28
국무회의, 관공서의 공휴일에 관한 규정 개정). `holidayName()`의 표는 2008년 이후
기준이라 `07-17`이 아예 없었고, 소스 어디에도 `제헌절`이라는 낱말이 없었습니다.

조용했던 이유가 문제입니다. `holidayYearKnown(2026)`이 `true`라서 앱은 2026년을
**다 안다고 말하면서** 빨간날 하루를 평범한 금요일로 계산했습니다. 근무내역서에는
특근 8시간이 통째로 빠진 채 찍혔습니다 — 그 문서 하나로 **₩119,240**이 사라집니다.
앱이 막으라고 있는 바로 그 실패입니다.

| | 표에 없을 때 | 고친 뒤 |
|---|---|---|
| 실근무 (정상) | 184.0h | **176.0h** |
| 휴일근로 | — | **8.0h · ₩123,840** |
| 지급총액 | ₩2,226,540 | **₩2,350,380** |
| 실수령(추정) | ₩2,007,140 | **₩2,126,380** |

**같은 표에서 반대 방향의 오류도 하나 나왔습니다.** 2027년 칸의 `'06-07': sub`는
현충일(2027-06-06, 일)의 대체공휴일로 넣은 것인데, **대체는 국경일과 명절에만
붙습니다**(같은 규정 제3조). 신정과 현충일은 국경일이 아니라 빠집니다. 없는 특근을
만들면 근무내역서가 회사 명세서보다 **많이** 나오고, 많이 나온 문서도 틀린
문서입니다. 지웠습니다.

제헌절은 국경일이므로 대체가 함께 붙습니다 — 2027-07-17은 토요일이라 **07-19(월)**
이 대체공휴일입니다. 2027년 칸의 나머지(설날 02-09, 광복절 08-16, 개천절 10-04,
한글날 10-11, 성탄절 12-27)는 달력과 맞는 것을 확인했습니다.

새 키 `hol_jeheonjeol`, 여덟 개 언어. 12 new assertions (525 total) under
제헌절은 2026년에 빨간날로 돌아왔습니다 and 현충일에는 대체공휴일이 붙지 않습니다,
including a loop over all eight languages. 폰에서 확인: 07.17을 지우고 손으로 다시
넣었더니 앱이 **스스로** 특근으로 잡았고, 근무기록에 `Holiday`로 뜹니다.

**교훈:** 최저임금은 `MIN_WAGE` 표와 `MIN_WAGE_UNTIL` 경고로 낡는 것을 스스로
알리지만, **공휴일 표에는 그런 장치가 없습니다.** `holidayYearKnown()`은 음력
명절만 걱정하고 있고, 법이 바뀌어 양력 고정 공휴일이 늘거나 주는 경우는 보지
못합니다. 해마다 표를 눈으로 확인해야 합니다.

### 2026-08-18 (third) — 탭을 바꾸면 맨 위에서 시작합니다

Found on the phone while testing the two entries below. The five tabs share **one**
scroll container, and changing tabs only changed `state.tab` — the box kept whatever
offset the previous tab had left in it. There is no `scrollTop`, `scrollTo` or
`scrollIntoView` anywhere in the pre-fix source, so this was an omission, not a choice.

Read 내 권리 to the bottom, tap 급여, and 급여 opens **at DEDUCTIONS** — with
`ONE THING FIRST · 기본금이 얼마입니까?`, the one card a new worker has to answer,
scrolled off the top. The header is fixed, so nothing looks wrong; you simply never
learn the card exists. Measured on the device: `scrollTop` 536 carried straight across.

**`scrollTabTop()`** zeroes `#tabScroll` (the `flex:1;overflow:auto` div at `:120`,
which now carries that id) — once immediately and once in `requestAnimationFrame`,
because `setState` does not paint synchronously and the browser restores the old
offset as the new tab renders. **`goTab(t)`** is what the tab bar calls now, and it
resets **only when the tab actually changes** — re-tapping the tab you are already on
keeps your place, which matters on a long 근무기록.

Two other jumps reset too:
- **`editDay()`** — 근무기록 → 출퇴근. Tapping 고치기 on a row far down the list used
  to land on 출퇴근 already scrolled past the manual-entry fields it sent you to.
  Same shape as the 조퇴 사유 sheet of 2026-08-13.
- **`endTour()`** — 소개 → 설정.

`test/harness2.js` gained a `getElementById` stub returning a fake `tabScroll`, and
exports it, so the assertions can watch the offset. 7 new assertions (513 total) under
탭을 바꾸면 맨 위에서 시작합니다 and 고치기를 누르면 손으로 적는 칸이 보여야 합니다.
Verified on the phone: the failing sequence now reads `scrollTop` 536 → **0**, and
re-tapping the current tab still reads 536.

### 2026-08-18 (second) — 12시간 2교대는 잔업이 근무표 안에 있습니다

A correction to the entry two below, found the same day by the person who asked for
it: on 교대 the `+ 연장 휴게 30분` button was **taking money off every single day**.

`otMark` — where 8 worked hours land — is the end of a normal day *only if the
schedule ends there*. A 9-to-6 factory, yes. A 12-hour 2교대 factory, no: someone
rotating 09:00~21:00 reaches 8 hours at **18:30 and is still on normal hours**. The
button placed a break at 18:30–19:00, squarely inside the punched window, so net went
10.5h → 10.0h and 잔업 2.5 → 2.0 **daily** — while the row wore a `연장 시에만` tag and
설정 said `연장 시 +30분`. Both were false. The feature's one promise — *this costs
nothing on a normal day* — was broken for exactly the shift pattern this app was
built for.

**`normalEnd(kind)`** is the threshold now. For 주간만/야간만 it is `otMark`: no
퇴근 시각 is known, so nothing changes there. For **교대** it is
`max(otMark, the other shift's start)`, because a 2-shift rotation is *defined* by one
shift ending where the other begins — that is what the word 교대 means, and it is the
only place the app can legitimately learn a finish time without inventing a setting.

| | 8h reached | normal day ends | preset lands |
|---|---|---|---|
| 주간만 09:00, 점심 1h | 18:00 | 18:00 | 18:00–18:30 |
| 교대 주간 09:00~21:00 | 18:30 | **21:00** | 21:00–21:30 |
| 교대 야간 21:00~09:00 | 06:00 | **09:00** | 09:00–09:30 |

Verified on a 교대 setup: after tapping the button, a normal 09:00–21:00 day is
net 10.5h / 잔업 2.5 / 휴게 1.5 — **identical to before the tap** — and staying to
22:00 is the first day the 30 minutes applies. Lunch and dinner stay untagged; only
the 21:00 row wears the tag.

The lesson worth keeping: "8 hours" is a *pay* boundary, not a *schedule* boundary,
and this app's original factory pays 잔업 every ordinary day. 19 new assertions (506
total) under 12시간 2교대는 잔업이 근무표 안에 있습니다 and 주간만·야간만은 예전 그대로.

### 2026-08-18 (first) — 근무조 시작 시각도 비울 수 없게 됐습니다

Found on the real phone while checking something else: `dayStart` was stored as `''`.
Nothing looked wrong — the box showed a faint `09:00`, because that is the
**placeholder**. The tell was the group summary reading `교대 · / 21:00`, and behind it
`schedStart()` silently falling back to 9. 주·야간 판정과 `otMark()`가 모두 거기서
나오므로, 근로자 눈에는 채워진 칸인데 앱은 다른 값을 쓰고 있었습니다.

The 2026-08-17 round gave the *number* boxes tap-clears / blur-restores (`numField`);
the two time boxes are plain text inputs and were never covered. They are now, via
**`timeField(key, cur, dflt, commit)`** — same `state.numEdit` buffer, same rules
(focus empties, an empty buffer never commits, blur restores), plus one more:

- **blur normalises.** `parseHM` is deliberately lenient — `'9'`, `'09:'`, `'0900'` all
  read as 09:00. The arithmetic was always right, but the *screen* showed whatever was
  typed, so the summary could read `교대 · 09: / 21:00`. Leaving the field now writes
  back `this.hhmm(parsed)`, so storage, summary and calculation say the same thing.
- **unreadable input reverts** to the value the field had on focus (`numEdit.prev`),
  or to `DEFAULTS` if that was unreadable too.

**Already-broken phones heal on next launch.** The constructor merges saved settings
*over* `DEFAULTS`, so a stored `''` beat the default and stayed forever. The merge now
drops an unparseable `dayStart`/`nightStart` (letting `DEFAULTS` win) and canonicalises
a parseable one. Verified on the actual phone: `''` → `'09:00'`, and the summary went
from `Rotating · / 21:00` to `Rotating · 09:00 / 21:00`. A good value is never touched
(07:00 / 20:00 survive, asserted).

Break rows are *not* covered by this and should not be: `addBreak()` creates
`{from:'',to:''}` on purpose, `breaks()` filters unparseable rows out, and an empty
row is a legitimate half-finished state.

21 new assertions (487 total) under 근무조 시작 시각을 비울 수는 없습니다 and
이미 비어 있는 휴대폰을 고칩니다.

### 2026-08-18 (later) — the break that only bites on the days you work late

Asked for directly: a 9-to-6 factory that calls overtime usually gives 30 minutes'
break before the extra hours start. Should there be a separate "overtime break"?

**No — the engine already does it, and had done all along.** `calc()` subtracts breaks
by interval intersection with the *punched* window (`ov()`, `:2554`, applied `:2604`),
so an 18:00–18:30 row costs exactly nothing on a 09:00–18:00 day and costs 30 minutes
the moment the worker stays past 18:00. A second break type would have duplicated
`ov()` and given the worker a second concept to learn. What was missing was not
mechanism, it was **anything on screen saying so** — plus one line that was actively
wrong.

**`otMark(kind)` — the hour at which 8 worked hours are reached.** Walk from
`schedStart(kind)` and accumulate worked time, skipping each break (unpaid, so the
clock stops): 09:00 + 1h lunch → **18:00**; no breaks → 17:00; the 12h 교대 set →
18:30; night 21:00 + 자정 휴게 → 06:00. There is no "퇴근 시각" setting and there must
not be — 퇴근 is punched, not declared — so this is derived, not stored.

**`normalEnd(kind)` — where a normal day actually ends.** `otMark` alone was wrong,
and the same-day correction is written up under 2026-08-18 (second) below.
`normalEnd` is `otMark` for 주간만/야간만, and `max(otMark, the other shift's start)`
for 교대. **This, not `otMark`, is the threshold everything below uses.**

Three things hang off it:

- **`isOtBreak()` tags the row.** A break starting at or after `normalEnd` shows a
  small red `연장 시에만 · ONLY IF LATE` label above it. Without the tag the row reads
  like 30 minutes lost every day and gets deleted.
- **`breakTotal()` stopped lying.** It summed every break regardless of window, so one
  overtime row made 설정 read `무급 휴게 1.5시간 (90분) / 근무당` on a day where 1 hour
  is what actually comes off — and that line is the only figure a worker can check
  themselves against. It now splits: `무급 휴게 1시간 (60분) / 근무당 · 연장 시 +30분`,
  and a break set that is *only* overtime says so in a full sentence. **A break set
  with nothing past `normalEnd` renders byte-identically to before** — the 12h 교대
  default has both its breaks inside a normal day, so an existing worker sees no
  change (asserted).
- **`+ 연장 휴게 30분` preset**, dashed outline beside `+ ADD BREAK`, in both the day
  and night blocks. Appends `[normalEnd, normalEnd+30m]` — the start time is the whole
  point, since overlap with an on-time punch is then exactly zero. It hides once such
  a break exists: no double-tap duplicates, and the button vanishing *is* the
  confirmation.

**And the trap the question exposed.** Every break here is unpaid; `calc()` subtracts
all of them. A worker entering the paid 10-minute coffee break their company gives
would lose that time every single day, and nothing warned them. There is now one note
under both lists (`every_break_here_is_unpaid`) naming 근로기준법 제54조: only a real
break, where you are free to leave your post, is unpaid.

**Worth knowing:** `snapOut` floors 퇴근 to the previous 30-minute unit, so an 18:15
punch is computed as 18:00 and never touches an 18:00 break at all. A partial-break
overlap can only appear on a half-hour boundary. An assertion written the obvious way
fails here — it is the floor rule at `:2591` doing its job, not a bug.

45 new assertions in `test/regress.js` (441 total) under 잔업하는 날에만 있는 휴게,
잔업이 시작되는 시각, 한 줄이 거짓말을 하고 있었습니다, 연장 휴게 한 번에 넣기,
여기 적는 휴게는 모두 무급입니다.

### 2026-08-18 (earlier) — the two break lists finally say which shift they belong to

Reported from the phone: pick **교대** in 설정 › 근무조와 휴게 and two sets of break rows
appear, one under the other, **with nothing saying which is which**. A worker typing
their night 휴게 into the day list silently loses that time off every day shift — the
break is unpaid, so it comes straight out of 실근무.

Each list now carries a header in the same 10px uppercase style as `SHIFT START TIMES`
— `주간 휴게 · DAY-SHIFT BREAKS` and `야간 휴게 · NIGHT-SHIFT BREAKS` (`L.secDayBreaks`
/ `L.secNightBreaks`, keys `day_shift_breaks` / `night_shift_breaks`). The Korean 조
name leads in **all eight languages**, not just Korean, because 주간/야간 are the words
said on the factory floor and on the shift board — the Vietnamese reads
`주간 휴게 GIỜ NGHỈ CA NGÀY`. Each block also gained a `2px solid var(--color-divider)`
top rule, so with 교대 selected the two lists read as two sections rather than one long
run of time boxes.

The header stays when the worker is 주간만 (it is still true, and the screen does not
reshuffle when they switch); the night block is still gated on `showNight`, so
주간만 never sees it. 22 new assertions in `test/regress.js` (396 total) under
이 휴게는 어느 조의 것입니까, including a loop over all eight languages.

### 2026-08-17 — the defaults stopped being one factory's, and number fields stopped eating your figure

Reported after installing fresh and walking the app as a new worker would.

**Every default was that one 12-hour 2교대 factory.** Setup read `근무조와 휴게 · 교대 ·
09:00 / 21:00`, and a first-time reader takes those two numbers for clock-in and
clock-out — that leaving home at nine and getting back at nine is what this app
assumes. Most companies are not that. The defaults are now a standard 9-to-6:

| | was | now |
|---|---|---|
| `shifts` | `both` (교대) | `day` (주간만) |
| `breaksDay` | 11:30–12:30 + 17:00–17:30 | 11:30–12:30 only → 09:00–18:00 is 8h |
| `periodStart` / `payday` | 21 / 25 | **1 / 10** (1일~말일, 익월 10일) |
| `annualBase` | 9 | **15** — PUNCH read `9/15` on a phone that had never logged a day |
| manual entry 출근/퇴근 | 09:00 / 21:00 | `HAND_IN` / `HAND_OUT` = **09:00 / 18:00** |

`nightStart` stays 21:00. It is the *start* of the night shift, not a clock-out, and
21:00 is correct for a factory that actually rotates — so it only appears once 교대
is picked. Picking 교대 also brings the 17:00–17:30 break back (`breaksFor(mode)`,
`BREAKS_8` / `BREAKS_12`), and picking 주간만 takes it away again — but **only while
the break set is still untouched**. A worker's own break times are never rewritten.

`DEFAULTS` reaches new installs only; saved settings merge over it, so an upgrading
worker keeps 21일~20일, 교대 and their own 연차 잔여 (asserted). One trap found doing
this: the constructor had `annualBase: p.annualLeft == null ? 9 : p.annualLeft` — a
second copy of the default that made changing `DEFAULTS` do nothing on screen. It
reads `Component.DEFAULTS` now.

**START now lands on 설정, not 출퇴근.** Covering the welcome and dropping straight
onto the punch pad meant the app took its first record knowing neither the shift nor
the pay period. The line above the button changed to match (`tour_setup_next`,
renamed from the stale auto-slug `you_do_not_need_to_set_up_pay_now_the_a`, all eight
languages).

**The 기본금 card vanished while you were answering it.** 급여 shows "기본금이
얼마입니까?" gated on `isDef('basic')` — is the figure still the untouched default.
So the first keystroke in that box broke the gate and the whole card unmounted:
question, input and all. Pressing backspace made the window disappear. `askBasic` now
also honours `state.basicSticky`, set the moment the field is committed to, and
cleared by "이 값으로 계속".

**Number fields: tap clears, walking away restores.** Changing 기본금 2,156,880 to
3,000,000 meant seven backspaces, and what was left afterwards was `0` — a value with
no way back, because the original had already been wiped off the screen, and the app
took that 0 as a real 기본금 and computed a ₩0 hourly rate.

`numField(key, cur, commit)` (one place, used by all 19 number inputs via
`numFields()` and the row builders) holds the on-screen text in `state.numEdit`
`{k, v}`:

- **focus** → `{k, v: ''}`, so the box shows empty while the *setting is untouched*
- **change** → buffer updates; commit **only if non-empty**
- **blur** → buffer dropped, so the stored figure reappears

Changing your mind is therefore "do nothing", and an empty box can never be saved as
0. `numEdit` is not in `save()`'s list — which field has the cursor is not a record.
Template side: every `<input type="number">` gained `onFocus`/`onBlur`; per-row keys
are `alw:i` / `ded:i` / `mult:otMult` so one row clearing does not blank its neighbour.

64 new assertions in `test/regress.js` (374 total) under 새로 까는 사람에게 맞는 기본값,
근무조를 바꾸면 휴게도 따라갑니다, 급여기간은 1일부터 말일까지, 아직 하나도 안 쓴 사람의
연차, 손으로 적는 하루의 기본 시각, 쓰던 사람의 설정은 그대로, 숫자 칸 · 누르면 비고,
기본금을 묻는 카드, 소개를 덮으면 설정으로. The v1 equivalence proof now aligns
근무조·휴게 as well as 기본금 before comparing — it proves the *engine*, not the seeds.

### 2026-08-17 (later) — the app got a welcome, settings got folded, and 내 권리 got a tab

Reported after wiping the app and reinstalling it to see what a new worker meets:
**the first screen was a form.** `showSetup` opened straight onto the 8-language grid,
기본금, 기준시간, allowances, insurance — before saying a word about what the app does.
And the SETUP tab was 14 flat sections, every heading 9px uppercase grey while the
values beside them were 13px/800. The hierarchy was inverted: the numbers shouted and
the labels whispered.

**First run now teaches.** The setup overlay is gone, replaced by a welcome screen:
language first (you cannot explain anything in a language the reader does not have),
then four numbered cards — it records shifts / it applies 근로기준법 §56 / it becomes
evidence in Korean / it never leaves this phone. Then it gets out of the way. It does
**not** ask for 기본금: punching does not need it. That question moved to the top of
급여, asked once, at the moment it is first needed, with the legal default explained
(`askBasic`, cleared the moment the worker types their own figure).

Gated on `state.tourSeen`, which is persisted. An upgrading worker has a saved blob
without the key, so it defaults to `true` — nobody who already uses the app gets
taught. Re-openable from 설정 › 정보.

**Settings fold into seven groups** — 언어 / 내 급여 조건 / 근무조와 휴게 / 수당과
공제 / 4대보험과 세금 / 회사 규칙 / 백업과 내보내기 — each a 14.5px/800 header with
the English underneath and, crucially, **the current value on the right**. Folding
alone would just hide things; the summary is what makes it safe (`setGroupSums()`).
All closed at rest, and `setOpen` is deliberately not saved — it is screen state, not
a record. The whole tab now fits on one screen.

Two explanations the worker asked for, both driven by `isDef()`:
`basicDefaultNote` says 기본금 was seeded from 최저임금 × 209 and swaps to "this is your
own figure" once touched; `insWhyOnNote` says 건강보험·장기요양·국민연금 are ON because
their rates are fixed by law, and 고용보험 is OFF because E-9 workers often are not in it.

**Fifth tab: 내 권리** — money the law owes you that is not in this month's payslip,
each with its statute.
- **퇴직금** — `severancePay()` = `avgDaily() × 30 × tenureDays/365`, 근로자퇴직급여
  보장법 §8①. `avgDaily()` already carried the 근로기준법 §2② 통상임금 floor, so it
  was the right input. Under a year it shows no figure at all, just how many days to go.
- **연차 ledger** — 발생/사용/잔여. `annualAccrued()` implements §60② (1 day per full
  month, cap 11), §60① (15 days), §60④ (+1 every 2 years from year 3, cap 25). The
  worker's hand-typed company balance stays and is shown *next to* the legal figure —
  the app does not claim to overrule the company ledger, it lets you hold them up
  against each other.
- **휴업수당** — `shutdownTally()` gathers whole shutdown days and the §46 shortfall on
  days cut short, which were already computed but had nowhere to live.

All three hang off one new setting, **`hireDate`**. Without it the tab asks for it
rather than guessing.

**Also in this round.** Multi-year archive with a year-chip row in 근무기록 (defaults
to the last 12 months, `전체` always one tap away — nothing is ever hidden from export,
and `archKeep()` only filters the *view*). CSV export (`csvText()`, Korean headings,
UTF-8 BOM so 한글 Excel does not mojibake, reasons included). 식대 one-tap preset.
상여 with a month picker, wired into `avgDailyCalc()` because 상여 raises 평균임금 and
therefore 퇴직금. And configurable **배수** (`otMult`/`nightMult`/`holOverMult`) for
factories that pay something other than the statutory 1.5/0.5/2.0 — defaults are the
old hard-coded constants exactly, so the v1 equivalence proof still passes, and a
multiplier below the legal floor is labelled as a shortfall rather than silently accepted.

**A crash worth knowing about.** A record with no `c` block white-screened the entire
app: `totals()` reads `s.c.reg` unguarded, so one bad row from a hand-edited backup
made `renderVals()` throw and left the worker looking at a red bar with their records
still sitting in localStorage, unreachable. `Component.normRecs()` now scrubs every
record on both paths into `state.extra` (load and import) — missing `c` filled,
non-numeric fields zeroed, unusable rows dropped. NaN is worse than a throw: it does
not crash, it just spreads quietly.

**Not built this round, by agreement:** multiple 사업장. It is the deepest change on
the list — every record needs a workplace id, per-workplace 기본금 and shift rules, the
근무내역서 scoped per employer, plus a migration — and it should not land in the same
build that moves every screen.

**Deliberately not built:** any tier that hides records. The ask mentioned "free keeps
12 months visible". Records are evidence; a worker in a 임금체불 dispute must never open
this app and find last year greyed out. The 12-month idea shipped as a *default view
filter* with everything always visible and exportable.

108 new assertions in `test/regress.js` (310 total).

### 2026-08-17 (earlier) — 최저임금 became a date-keyed table, and the build warns when it is stale

The 2027 minimum wage was set on 2026-07-14: **10,700원/h** from 2027-01-01, up from
2026's 10,320. `10320` had been a literal in three places, and the year was baked into
two lang **key names** (`2026_legal_minimum`, `your_hourly_rate_is_below_the_2026_leg`),
so the app would have quietly told a lie every January.

`static MIN_WAGE = [{ from, won }]` now holds both years; `Component.minWageOn(iso)`
returns the rate in force on a given day. Minimum wage still touches **only** a warning
threshold and a display row — `rate()` is untouched and the wage-engine equivalence
proof still passes.

The two call sites read **different dates**, and that is the whole point:

- `minWageWarn` (설정) is about the 기본금 you are on *now* → today's minimum.
- `basisRows` (급여) is the basis for the payslip of period `P` → `periodMinWage(P)`,
  the minimum in force **during that period**. Opening a December 2026 payslip in
  March 2027 must still read 10,320원. Same principle as `reason.ko` being a snapshot.
  A period that straddles New Year (12.21 → 01.20) takes the **later** date: only one
  figure fits on the row, and showing the lower one would make January pay that was
  below the new floor look legal.

`DEFAULTS.basic` is now `minWageOn(today) × DEFAULT_DIVISOR`, so a fresh install in
2027 starts at 2,236,300 rather than 2,156,880. It reaches **new installs only** — the
constructor merges saved settings *over* `DEFAULTS`, so an upgrading worker's own
기본금 survives untouched (asserted, including from a v1 blob). Two older assertions
that hard-coded 2,156,880 now derive it, or they would have failed on 2027-01-01.

**Task 5, the staleness warning.** The app is offline by design and cannot fetch next
year's 고시. `MIN_WAGE_UNTIL = '2027-12-31'`; past that the app shows one line under the
header saying it does not know this year's minimum wage. It is **a warning, never a
lock** — punching, viewing, exporting and printing the 근무내역서 all keep working, and
there is a test that says so. It sits in the flow (not an overlay), dismisses for the
session only (`state.wageStaleHide` is not in `save()`'s list), and adds no network
call. Adding next year's figure is: one row in `MIN_WAGE`, move `MIN_WAGE_UNTIL`.

New keys `year_legal_minimum`, `your_hourly_rate_is_below_the_legal_mi`,
`the_app_only_knows_the_minimum_wage_up`; the two year-named keys are gone. The warning
now takes three params — rate, year, **and the minimum itself**, because that figure
had been hard-coded inside the sentence too. 39 new assertions in `test/regress.js`
under 최저임금은 해마다 바뀝니다, 명세서는 만들어진 날의 얼굴로, 시급 10,500원,
앱이 법보다 낡았을 때, 쓰던 사람의 기본금.

### 2026-08-13 — the service worker was hiding every update

Found while verifying the 조퇴 사유 popup (below) *on the phone*: it was installed and still did
not appear. The APK was correct; the app was running the previous build, because
`sw.js` answered navigations from cache and only refreshed for next time. Every APK
update had been invisible until its second launch.

`sw.js` now races the network against a 1.5s timer for navigations and falls back to
cache. In the APK the page comes from `WebViewAssetLoader` on the device, so it is
always the fresh one; offline the fetch fails immediately and it is cache-first again
(measured: 24ms to open with the network fully cut, versus 14ms online).

`build.py` now derives the cache key from `index.html` **and** `sw.js`. Before, a
change to the worker alone shipped under the old cache name — the browser swaps the
worker on a byte diff regardless, but `activate` then keeps a cache written under the
old rules.

### 2026-08-13 (earlier) — 조퇴 사유 became a popup with a dropdown

The early-out reason sheet was an inline block inside each tab. Three problems, all
reported from real use:

- In **LOGS** it opened at the very top of the tab. Tapping "사유 고치기" on a row far
  down the list appeared to do nothing; the app scrolled you to the top, but the screen
  you arrived at had no visible connection to the button you had just pressed.
- In **PUNCH** all twelve reasons were permanently expanded, so the save button sat
  off-screen.
- Clocking out minutes after clocking in hit the "너무 이른 퇴근" guard, whose only
  reason-bearing option stamped `일감 부족` ("no box") with no way to choose anything
  else without going to LOGS afterwards.

Now there is **one popup**, defined once at the root of the template outside every tab
(`<sc-if value="{{ earlySheet }}">`, `position:absolute; inset:0; z-index:30`, dimmed
backdrop, tap-outside to close). Both entry points open the same thing, so it looks
the same and there is one place to change it.

The twelve reasons are a **collapsed dropdown** (`state.rsnOpen`, `toggleRsnList()`)
showing the picked one; expanding reveals all twelve in their three fault groups.
Picking collapses it again — twelve rows permanently open is what pushed the save
button off-screen before.

`sentHome()` and `forceClockOut()` now open the popup after writing their record, so
the "sent home" path can be re-tagged as 금형 고장 or 정전 on the spot. `sentHome()`
still pre-picks `일감 부족`, so closing the popup leaves a sensible reason rather than
none.

Also fixed here: the sent-home button still read **"→ LEAVE / 연차로 기록"** long after
v2 stopped spending annual leave on that day (V2.md Part 1 §C). It now reads
"→ SHUTDOWN / 휴업으로 기록", matching what the code writes. Key renamed
`no_boxes_sent_home_leave` → `no_boxes_sent_home_shutdown`.

New strings: `rsn_kicker`, `rsn_head_pick`, `rsn_pick_none`, `rsn_sub_noio`
(a sent-home day has no clock times, so the subtitle must not say `— · 0.0h worked`).
26 new assertions in `test/regress.js` under 팝업과 드롭다운, 귀가한 날, 그래도 기록한 날.
