# Prompt — rebuild 근무기록 LOGGER under a new design language

Paste everything below the line into a fresh session (empty folder, no source from the
old repo). Fill in **§0 THEME** first — that block is the only part you are meant to
change between rebuilds. Everything else is the specification and should be reproduced
as written.

---

You are building a complete, offline, single-device work-log and wage app for **foreign
workers in Korea**. A reference implementation exists but you do not have it. This
document is the specification. Build it from here.

Work in this order: wage engine + tests first, then storage, then screens, then i18n,
then packaging. Do not start on visual design until the engine passes its tests.

If any instruction here conflicts with something you would normally do — round a corner,
add a backend, simplify a legal rule — this document wins. If something is genuinely
ambiguous, ask; do not guess at anything involving money or law.

---

## §0 THEME — fill this in before you start

> **Theme name:** `_______________`
>
> **Feeling in one sentence:** `_______________`
>
> **Palette:** background `____` · surface `____` · text `____` · accent `____` ·
> warning/negative `____` · positive `____`
>
> **Type:** heading `____` · body `____` · numerals `____` (must be tabular/lining)
>
> **Shape language:** corner radius `____` · border weight `____` · shadow/elevation `____`
>
> **Density:** compact / comfortable / spacious — `____`
>
> **Dark mode:** yes / no — `____`

You own every visual decision inside that block. Invent the design system fresh; do not
imitate a "flat modernist red-on-grey" look unless the block above asks for it. Define
it once as CSS custom properties in a single tokens file, and let **every** colour,
size, weight and spacing value in the app read from those tokens. Someone must be able
to re-skin the whole app by editing that one file.

**These rules survive any theme and are not design choices:**

1. Every interactive target ≥ 44×44px. This is used one-handed, on a factory floor,
   sometimes with gloves on, sometimes at 5am.
2. Money and hours use tabular/lining numerals and never wrap mid-figure.
3. Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI edges. Cheap Android
   screens at full brightness in a lit workshop.
4. Never encode meaning in colour alone — a shortfall, a legal breach, a fault
   classification must each carry a word or icon as well as a colour.
5. The primary clock-in/out control is the largest element on its screen and reachable
   with a thumb.
6. Warnings that can cost the worker money (52-hour breach, underpayment, tax-free cap
   exceeded) must be visually **loud** — same weight of treatment as your most emphatic
   component, not a grey footnote.
7. Text scales: the app must stay usable at 200% system font size.
8. Eight scripts share every layout — Latin, Hangul, 汉字, ไทย, देवनागरी, ខ្មែរ. Line
   heights and button widths must survive Khmer (tall) and Thai (stacked diacritics).
   No fixed-height text containers.

---

## §1 What this is, and the two rules behind every decision

An offline work-log and wage app built with and for an EPS E-9 factory worker, and
generalised to any visa or company. It records clock-in / clock-out with the phone's
fingerprint sensor, decides day-vs-night shift on its own, applies Korean overtime and
night-premium law, and predicts the monthly 급여명세서 so the worker can hold it up
against the paper the company hands them.

**Rule 1 — the output is evidence.** A worker may print the record years later and put
it in front of a 근로감독관 (labour inspector). Money figures must be **right or absent**,
never approximate-looking-authoritative. Every figure the app shows must be able to say
where it came from, and must admit when it is an estimate.

**Rule 2 — nothing leaves the phone.** No server, no account, no login, no telemetry, no
analytics, no crash reporting, no fonts or scripts fetched at runtime. `localStorage` is
the entire database. Workers pass this app between themselves and their pay data is
nobody else's business. Provide JSON export/import as backup instead of sync. This is a
hard product requirement — if you find yourself adding a fetch to a remote host, stop.

---

## §2 The wage engine — implement exactly

This was reverse-engineered from seven real payslips and verified against them. It is
plain framework-agnostic JavaScript in one class, separable from any UI. Write it first
and test it before drawing anything.

### Rates (all derived from 기본금 — nothing hardcoded)

```
hourly   = round(basic / divisor)          divisor default 209
           e.g. 2,156,880 / 209 = ₩10,320
잔업 OT   = hourly × 1.5                    on hours past 8 net in a day
야간 night = hourly × 0.5                    any hour worked 22:00–06:00, stacks with OT
특근 hol  = hourly × 1.5                    company practice
legal 휴일근로 (근로기준법 §56②) = ×1.5 first 8h, ×2.0 past 8h
```

OT / night / holiday hours **floor to 0.5h** (`Math.floor(x*2 + 1e-9)/2`).

Compute both `pay` (company practice) and `legalPay` (statutory minimum) for every day
and carry the gap. When a company pays only ×1.5 past 8h on a holiday, the app shows the
difference as money not received — it does not silently pick one.

### Punch rounding — asymmetric, and this matters

- **Clock-IN rounds up** to the next 30 min. `08:40 → 09:00`, `08:20 → 08:30`. Lateness
  is never rounded away. A genuinely early `08:30` stays `08:30` and is paid.
  `snapIn = Math.ceil(h*2 - 1e-9)/2`
- **Clock-OUT rounds down** to the last 30 min. `20:15 → 20:00`. Unworked time is never
  paid.
- **Exception:** a configurable grace before the hour (default 15 min) credits the whole
  hour — `20:45 → 21:00`. Setting grace to 0 means only the exact hour counts.
  ```
  snapOut(h, grace):
    hour = ceil(h - 1e-9)
    if grace > 0 and (hour - h)*60 <= grace + 1e-9: return hour
    return floor(h*2 + 1e-9)/2
  ```

### The day calculation

```
in  = snapIn(in);  out = snapOut(out)
gross = max(0, out - in)
breaks = user-defined per shift kind, unpaid; subtract every overlap with [in,out]
net = max(0, gross - breakOverlap)

if holiday:  hol = floorHalf(net); hol8 = min(hol,8); holOver = max(0, hol-8)
else:        reg = min(net, 8);    ot   = floorHalf(max(0, net-8))

night: windows [[-2,6],[22,30]] in shift-day hours (so a 21:00 start runs to hour 30
       = 06:00 next day). Intersect each window with [in,out], subtract break overlap,
       sum, then floorHalf.

pay      = ot*otRate + night*nightRate + hol*otRate
legalPay = ot*otRate + night*nightRate + hol8*otRate + holOver*(hourly*2)
gap      = legalPay - pay
```

### Shift detection

The user sets their own 주간 시작 and 야간 시작 times. A punch is classified as whichever
of the two it is **circularly nearer** to. No fixed windows. Get the wrap-around right:

```
d = (((a - b) % 24) + 24) % 24
distance = min(d, 24 - d)
```

Getting this wrong silently misclassifies shifts, which silently misprices nights.

### Elapsed time

Elapsed time comes from **real timestamps** — `(now - inIso)/3600000` — never from
reconstructing hours-of-day. A session left open for days must still read correctly.
Past 24 hours the app refuses to auto-close and sends the worker to a manual entry
sheet.

### Payroll period

Runs from a user-set start day to the day before the next month's start day (e.g. 21st →
20th), with payday configured separately. A start day of 31 means month-end and must
fall back to each month's own last day. Weeks for the 52-hour check run Monday–Sunday,
independently of the pay period.

### Day types with no punch

- **연차** annual leave — pays 8h regular, already inside 기본금, so it adds no variable
  pay
- **휴가** vacation
- **특근** holiday worked
- **결근** absence — unpaid; deduct `hourly × 8` and label it an **estimate**, because
  companies differ (`시급 × 8h` vs `기본금 ÷ 30`) and 주휴수당 may also be lost
- **휴업** shutdown — employer-side, see §4

Korean public holidays for the next two years are built in, including the lunar ones
(설날, 추석, 부처님오신날) which move each year. Do **not** hardcode lunar dates for years
you are not confident about; instead, a 특근 day that is not a known holiday or a Sunday
offers a `법정 휴일로 표시` action in its detail that applies the ×2.0 tier and
recalculates. Leave ranges skip weekends and red days. Saturday is treated as
무급휴무일 (overtime only, no ×2.0 tier) unless the user flags that their company
designates it a 휴일.

### Deductions

**4대보험** auto-calculated from 보수월액, or typed manually:

```
건강보험  3.545% (employee side)
장기요양  건강보험 × 13.14%
국민연금  4.5%
고용보험  optional toggle
```

소득세 estimated from 근로소득 간이세액표 behaviour; **주민세 is always 10% of 소득세**.
Users can add their own deduction rows (기숙사비 etc.).

**Allowances carry a 과세 / 비과세 flag.** 식대 is tax-free up to ₩200,000 a month, and
tax-free pay carries no 4대보험 either. Cap the exemption at ₩200,000, return the excess
to taxable, default 보수월액 to the taxable figure, and warn if a row is marked tax-free
above the cap. Getting this wrong overstates both tax and 보수월액.

### Defaults to ship with

```
basic 2156880, divisor 209, periodStart 21, payday 25, outGrace 15
shifts 'both', dayStart '09:00', nightStart '21:00'
breaksDay [11:30–12:30, 17:00–17:30]   breaksNight [00:00–01:00]
annualTotal 15, annualBase 9, absentBasis 'hourly', shutdownPct 70
satIsHoliday false, restIsHoliday true, holOverPaid true
insAuto true, insOn {health, care, pension}, taxMode 'auto', dependents 1
```

---

## §3 Screens

Four tabs — **PUNCH · LOGS · PAY · SETTINGS** — plus a first-run setup screen and one
global popup. The tab bar shows the worker's language and the Korean term together, so
the screen also teaches the word.

### First-run setup
Language, 기본금, shift times, breaks, pay period, annual leave balance. Must handle
being installed **mid-shift**: ask for the time the worker actually clocked in today.

### PUNCH
- Current time, today's date, which shift the app thinks this is, and — while on shift —
  live elapsed, net, OT so far, and money earned so far
- The punch pad: a **real fingerprint prompt** (see §6), with press-and-hold fallback
- Clock-in correction (`처음 출근 시각` — set a past time for today)
- Cancel an accidental clock-in
- Manual entry sheets for the day types with no punch (연차 / 휴가 / 특근 / 결근 / 휴업),
  with a date picker and range support
- Guards: clocking out minutes after clocking in asks whether this is real, and offers
  `일감 부족 · 휴업으로 기록` (records a shutdown, **not** annual leave) and
  `그래도 기록`. A session over 24h refuses to auto-close.

### LOGS
- A calendar for the pay period plus a scrollable list of days
- Each row: date, weekday, shift kind, in→out, net hours, day pay, and any reason tag
- Tap a row to expand: the full breakdown, why the app classified it that way, and
  actions — edit, delete, undo, re-tag the reason, mark as a legal holiday
- **52-hour banner** (see §5) pinned when any week in view breaches
- Deleting is undoable, and the undo must revert, not delete something else

### PAY
The most important screen. Two things:

1. **The prediction** — 기본금, 수당, 잔업, 야간, 특근, 지급총액, 공제 (each row with its
   own basis), 실수령액, with the period and payday named.
2. **명세서 대조** — a two-column table: what the app counted from the worker's own
   punches, and an empty box for what the payslip actually says. Rows: 기본금, 연장,
   야간, 휴일, 지급총액, 공제총액, 실수령액. Type the payslip in, every line shows its
   difference, short lines go negative-coloured, and a banner totals it:
   `덜 받은 것으로 보이는 금액 · ₩125,080`. Stored per pay period so last month's
   comparison survives.

   The verdict must be careful about its own limits: **tax and insurance in the app are
   estimates, so a gap there can be normal — but a gap in basic, overtime, night or
   holiday pay is not.** Say exactly that.

3. **근무내역서** — a button that generates a self-contained printable HTML document:
   the rate basis, every day with punches and hours, the reason column, the totals, any
   52-hour breaches and any unpaid holiday premium, each with its statute cited, and a
   §46 table when shutdown days exist. It states plainly that tax and insurance are
   estimates and that the company's payslip governs. **This document is Korean
   throughout regardless of the app's language** — it exists to be read by a Korean
   employer, 노무사 or inspector.

4. **JSON backup / restore**, with the import staged behind an explicit confirm before
   it overwrites anything.

### SETTINGS
Wage basis, divisor, allowances (with 과세/비과세 chips), deductions, 4대보험 auto/manual,
보수월액, tax settings, shift times, breaks, pay period, grace minutes, Saturday
treatment, holiday-premium toggle, 평균임금 override, 휴업 percentage, annual leave, the
language picker, fingerprint enrolment, backup/restore, and an about panel.

The **leave balance shows its own arithmetic**: `08.02 기준 9일 · 그 뒤 사용 1일 → 남음 8일`.
Store *when* the balance was stated and count only leave logged after that date —
otherwise the balance drifts wrong the moment the log spans a year.

---

## §4 조퇴 사유 — why a day ended early

This is the feature that turns a log into evidence. `09:00 → 14:00 · 4.0h · ₩0` throws
away the only fact that made the day mean anything: *the mould broke*. That is the
difference between a shutdown the employer owes for under 근로기준법 제46조 and an
ordinary short day the worker eats.

**Twelve built-in reasons in three fault groups.** The reason is not a label, it is a
**classifier** — `fault: 'employer'` is what makes the app compute §46 for that day.

| fault | reasons |
|---|---|
| `employer` → §46 | 일감 부족 · 물량 없음 / 자재 · 부자재 부족 / 기계 · 금형 고장 / 불량 발생 · 생산 중단 / 정전 · 단수 / 회사 지시로 조기 퇴근 |
| `worker` | 몸이 아파서 / 병원 진료 / 개인 사정 |
| `other` | 업무 중 부상 (→ 산재보험, say so plainly) / 천재지변 · 기상 (§46②) / 직접 입력 |

**Built-in beats free text.** A Thai worker who types `ไม่มีกล่อง` has written something
true that nobody in the office can read. A worker who *picks* 자재 부족 gets
`자재 · 부자재 부족` printed on the 근무내역서 whatever language the app is set to. The
list is the main road; the note field is the shoulder — it carries a standing request to
write in Korean and warns, **without ever blocking**, when what was typed contains no
Hangul.

**When it asks.** Not at eight hours — this factory's day shift is 09:00–18:00 with two
breaks, which is 7.5h net, so a fixed 8-hour trigger fires on a completely normal day,
every day. The threshold is the worker's **own median for that shift kind, less one
hour** (10.5h normal → asks below 9.5h). Under three samples, fall back to 6h — low
enough never to nag a new install. Day and night medians are tracked separately.

**It never blocks the punch.** Build and save the shift *before* the popup opens;
`사유 없이 퇴근` writes it unchanged. A worker who wants to go home goes home.

**One popup, defined once, at the root of the app — outside every tab.** Absolutely
positioned over the whole app with a dimmed backdrop, tap-outside to close, so it
arrives where the tap happened and is plainly *because* of the tap. Every entry point
opens the same element:
- punching out short of the median
- `사유 고치기` on any past LOGS row (this is also how the past gets backfilled)
- the sent-home path, which pre-picks `일감 부족` but leaves the other eleven one tap away
- the `그래도 기록` path out of the too-early guard

The twelve reasons are a **collapsed dropdown** showing the picked one; expanding
reveals all twelve still grouped by fault; picking collapses it again. Twelve rows
permanently expanded pushes the save button off the bottom of the phone, which defeats
the entire sheet.

**A record's reason text is a snapshot** — the Korean string is copied onto the record
when the worker picks it. Later wording changes must not rewrite documents already
generated. The paper must read as it did the day it was made.

### 휴업수당 — 근로기준법 제46조

An employer-side shutdown pays at least **70% of 평균임금** (configurable — some
companies pay 100%).

- 평균임금 comes from the worker's own records (제2조①6 — last three months ÷ calendar
  days), **floored** at 통상임금 by 제2조②, and **capped** at 통상임금 by the 제46조①
  proviso. Not 통상임금 × 8 × 70% — 평균임금 includes the last three months' overtime,
  which for anyone doing 잔업 daily is well above 통상임금.
- It can be typed in from payslips. When the app's records span less than three months,
  **say so** rather than quietly returning a low number.
- **Partial shutdowns count.** §46 is not only for whole days. Whether extra is owed
  depends on something the app cannot know — whether the company deducts the unworked
  hours — so state both outcomes rather than asserting one:
  ```
  이 날 보장되는 최저 (평균임금 70%) — ₩70,700
  월급을 그대로 받는다면 — 추가 지급액 없음
  시간을 깎였다면 (₩41,280) — +₩29,420
  ```
- Note in the document that 휴업일 are **not** the worker's 연차 — 제60조⑤ puts the
  timing of leave in the worker's hands, and 제62조 needs a written agreement with the
  근로자대표.

---

## §5 The 52-hour week — 근로기준법 제50조·제53조

The app knows every hour, so it must say this. Weeks run Monday–Sunday. Any week over
**52 total hours** or **12 overtime hours** raises a prominent banner on both LOGS and
PAY, naming the week and the excess, and saying the part workers are most often told
wrong:

> **Being paid for the extra hours does not make the excess lawful, and agreeing to it
> does not either.**

EPS workers are pushed past this routinely and it is exactly the thing they cannot
easily check themselves.

---

## §6 Biometric punch

The pad must trigger the phone's **real fingerprint sensor** via WebAuthn's platform
authenticator. This needs a secure context (https or the app's own asset loader) — it
will not work from `file://`.

- First run: register a platform credential —
  `navigator.credentials.create({ publicKey: { …, authenticatorSelection: {
  authenticatorAttachment: 'platform', userVerification: 'required' } } })` — and store
  the credential id in localStorage.
- Each punch: verify with `navigator.credentials.get({ publicKey: { challenge,
  allowCredentials: [{ id, type: 'public-key' }], userVerification: 'required' } })`.
  Resolve → record the punch. Reject → do nothing.
- **There is no server and no account.** This is local device verification used as a
  deliberate confirmation gesture, and to stop a pocket-tap logging a shift. Do not add
  a backend. Do not upload anything.
- **Feature-detect and fall back** to press-and-hold if WebAuthn or a platform
  authenticator is unavailable. Never leave the worker unable to punch.

---

## §7 Languages

Ship in eight: **한국어, English, Tiếng Việt, 中文, ไทย, Bahasa Indonesia, नेपाली,
ភាសាខ្មែរ** — complete, including every statute explanation. All translations ship
inside the build; nothing is fetched at runtime.

**House style — the Korean payslip term leads and the translation follows:**
`잔업 Tăng ca ×1.5`, not `Tăng ca ×1.5`. A translation that replaces 잔업 with "overtime"
leaves the worker unable to find that line on the paper in their hand, or to name it to
a manager.

**Digits are always ASCII**, never Devanagari or Khmer numerals — every figure the app
computes is ASCII, and so is every figure on a Korean payslip. Mixing scripts inside one
sentence makes the number the worker is checking harder to find, not easier.

**Structure it as data, not as code.** One keyed string table, `t(key, params)` at every
call site, named placeholders so word order is free per language (Korean puts the year
first, `{y}년 {m}월`; English puts the month first, `{name} {y}`). One JSON file per
language against a `base.json` reference containing ko + en. Adding a language must be
adding a file plus one row in a list — no code changes. Missing strings fall back to
English, then Korean; a screen never comes up blank.

Ship a validator that catches the things which break a translated build: unknown keys (a
typo means that string silently never appears), invented placeholders (`{p9}` renders
literally on screen), and `|`-delimited lists that changed length (weekday and month
names are read by index, so a missing item is an undefined day).

Holiday names are translated too. The 근무내역서 stays Korean regardless.

---

## §8 Storage and data integrity

- `localStorage`, one versioned payload. Serialise first and **write only when the bytes
  differ** — a naive save-on-any-state-change turns a once-a-second clock tick into
  ~86,400 full `JSON.stringify` writes a day, which is real battery and flash wear on a
  cheap phone.
- **Records must carry a real year.** Keying a day as `month*100 + day` means 21 July
  2026 and 21 July 2027 are both `721`, and completing a year silently overwrites the
  same date from the year before. Key on `year*10000 + month*100 + day`.
- Migrations must be non-destructive: leave the old key in place so a rollback loses
  nothing.
- JSON export/import as the backup story. No cloud sync, ever.

---

## §9 Packaging

Build to a **single self-contained HTML file** with no runtime dependencies — no CDN, no
external fonts, no external CSS. Add a web app manifest and a service worker so "Add to
Home screen" installs properly and it opens offline.

**The service worker must be network-first for navigations, with a short timeout
(~1.5s) falling back to cache.** Cache-first for navigations means every update is
invisible on the launch that follows it and only appears on the one after — so the way
to see a new build is to open the app twice, which nobody knows to do. A worker who
installs an update, opens it, finds nothing changed, and concludes the update failed is
being taught not to trust the app. Derive the cache key from **both** the page and the
worker, so a fix to the worker alone does not ship under the old cache name.

For Android, wrap the hosted PWA as a TWA (Bubblewrap / PWABuilder). **Do not port to
Kotlin/Compose or React Native** — it would mean re-deriving the wage engine, which is
where all the risk lives.

---

## §10 Tests — the gate, not an afterthought

Ship a single command that runs everything. Nothing is done until it passes.

1. **Wage engine regressions** — `calc()` across at least six shift shapes (plain day,
   day with OT, night crossing midnight, holiday under 8h, holiday over 8h, a day
   entirely inside a break), `snapIn`/`snapOut` across **all 96 half-hours**,
   `detectShift` across the clock, and every rate.
2. **The rules in §2–§5, each with an assertion** — the adaptive short-day threshold
   (7.5h normal day not flagged; 4h flagged with no history; 8.5h flagged once the
   median is 10.5h; night counted apart), the punch never blocked, the classifier
   surviving a non-Korean note, backfilling and re-tagging a past day, 평균임금 floored
   and capped, partial-day shortfall arithmetic, the tax-free cap, the leave-balance
   as-of date, the year-keyed record.
3. **Template binding check** — every interpolated hole in the markup resolves, and
   every field a list row reads exists on that list.
4. **Render every language** end to end and assert zero throws and zero unresolved
   `{placeholders}`.
5. **Translation validation** — unknown keys, invented placeholders, broken lists.
6. **A headless browser pass** — boots with zero console errors; first-run setup, all
   four tabs, each day type, the 52-hour banner and the payslip comparison driven end to
   end.

Write each regression as a short narrative of the bug it prevents, not as
`test_calc_17`. Add one for every change you make.

---

## §11 Anti-goals

- No server, no account, no telemetry, no analytics, no crash reporting, no remote
  fonts, no remote anything.
- No AI features, no chat, no "insights", no gamification, no streaks, no badges.
- No onboarding carousel. The worker installs this the night before a shift.
- No animation that delays a punch being recorded.
- No pretty approximations. **A figure is right or it is absent**, and an estimate says
  it is an estimate.
- **Every label must match what the code actually does.** This is the failure mode that
  recurs most: an "added" toast on a flow that replaced a record; an undo that deleted
  instead of reverting; a button reading "→ 연차로 기록" long after the code stopped
  spending annual leave. Whenever you change behaviour, grep for the label.

---

## §12 How I want you to work

- Build the engine and its tests before any UI.
- Keep the wage/legal logic in one plain-JS class with no framework imports, so it can
  be tested headlessly and ported without re-derivation.
- Keep all wording in the string table from the first commit — retrofitting i18n across
  400 call sites is a week you do not need to spend.
- After each change, run the full test command and add an assertion for what you
  changed.
- When you are about to make a decision that affects a money figure or a legal
  classification, state the decision and your reasoning **before** implementing it.
- Tell me what you did not build and why, rather than stubbing it and letting me find
  out from a wrong number.
