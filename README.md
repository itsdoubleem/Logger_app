# Handoff: LOGGER Work Log — Korean shift & wage tracker

[![License: MIT](https://img.shields.io/badge/license-MIT-ec3013.svg)](LICENSE)

> **New here?** Read the wage rules below first — they are the specification.
> For why things are the way they are, read [`V2.md`](V2.md) (the v1 bugs that made
> v2) and grep [`CHANGELOG.md`](CHANGELOG.md) (everything since). Building, hosting
> and the APK are in [`DEPLOY.md`](DEPLOY.md).
>
> **There is now a v2.** See [`V2.md`](V2.md) for the bugs found in the app below
> and what changed. Source `WorkLogApp.v2.dc.html`, built with `python3 build.py`
> into `dist-v2/`. Checks: `sh test/run.sh`.
>
> v2 ships in eight languages — Korean, English, Vietnamese, Chinese, Thai,
> Indonesian, Nepali and Khmer — with the Korean payslip terms kept visible beside
> every translation. Wording lives in `lang/*.json`; adding a language is adding a
> file, then `python3 tools/sync_lang.py`.
>
> v2 also records **why** a day ended early (the early-leave reason) and computes the
> Labor Standards Act Article 46 shutdown allowance on average wage, including partial-day shutdowns. See Part 2 §6–7 of
> [`V2.md`](V2.md).
>
> v1 — everything described in this file — is unchanged and still builds with
> `python3 build.py`. The wage engine is byte-identical between the two; there is a
> test that proves it. (`shutdownPay()` is not part of that engine — v1 has no
> shutdown day at all.)

## What this is
A working prototype of a work-log app for foreign workers in Korea (built with an EPS E-9
worker, generalised for any visa/company). It records clock-in / clock-out, decides day vs
night shift automatically, applies Korean overtime and night-premium law, and predicts the
monthly payslip. It is fully functional today — settings and records persist in localStorage.

It ships as an Android APK and an iPhone app, both wrapping the same offline web build.
Punching is **one tap**: START to clock in, STOP to clock out. The wage engine is
done and should be preserved exactly.

## What this is *not*

It is a **calculator**, not a certified labor attorney and not a lawyer. It applies the Labor
Standards Act to a record the worker keeps themselves and shows the arithmetic. It gives no legal
advice, provides no labour consulting, drafts and files nothing on anyone's behalf, and is free —
which is what keeps it clear of Article 27 of the Certified Public Labor Attorney Act, whose §1
reserves advice and guidance on labour law, and the drafting and checking of documents, *as a
business* to licensed labor attorneys, and whose §2 also bars advertising that could be mistaken
for it. Keep the app's own description in those terms.

Everything it produces says so on its face:

- the work record opens with a bold line saying **the worker wrote this record themselves** — a self-record,
  not a certificate issued by a company or an agency — above the first table, not in grey
  type at the bottom;
- its notice states that the document is not legal advice, that whether wages are owed is for
  the Ministry of Employment and Labor and a labor attorney or lawyer to decide, that the binding
  figures are on the company's payslip, and where to get free help;
- **no developer name is printed on it.** The tool name and version are, so the arithmetic
  can be checked. Credit stays in Setup › About, a screen only the worker sees;
- the **worker's** name does appear, from Setup › Backup and export — on the document, in the
  CSV's first column, and in both file names, so that three workmates at one factory who
  each submit a work record produce three documents that can be told apart. It is optional,
  and a document made without it says **name not given** on its face rather than going out
  silently anonymous;
- the **employer** appears too, and is stamped per pay period alongside the wage basis, so
  changing jobs never rewrites an old document. Where no employer was recorded for a
  period, the document says it is showing the current setting rather than pretending to
  know. The work record is made in exactly one place — Setup › Backup and export, beside the
  backup and CSV exports.

Free help, in the app and on every document: **the Ministry of Employment and Labor customer
center ☎ 1350** (weekdays 09:00–18:00, interpreters), the labour portal at labor.moel.go.kr, and
any foreign workers' support center.

Three things would cross the line and must not be added: telling the worker what action to
take, drafting or filing a labour complaint for them, and charging for the calculation.

## About the design files
`근무기록-WorkLog.html` is a single self-contained file — the entire app, offline, no server.
It is NOT a throwaway mock: the logic in it is the specification. Treat it as the reference
implementation and port it, don't reinvent it.

- `WorkLogApp.v2.dc.html` — the app (template + a `Component` class holding all logic).
  The logic class is plain JS and is the part worth reading; it is framework-agnostic.
- `근무기록-WorkLog.html` — the compiled single-file build. Open it in a browser to see
  the real thing before writing any code.

Fidelity: **high**. Colors, type, spacing and copy are final. Design system is "Modernist":
flat, zero border-radius, 2px rules, near-mono red (#ec3013) on #f3f2f2, Archivo throughout.
Every interactive target is >= 44px. Do not round corners, do not center button labels.

## The two jobs, in priority order

### 1. The punch pad — one tap, no fingerprint
The pad was a WebAuthn fingerprint prompt (with press-and-hold as the fallback) until
2026-10-26. It is now a START / STOP button beside the clock, drawn as the app's clock icon
without hands (since 2026-11-11): a green ring with START, a clock-in label and a still grey
OFF SHIFT ring when the worker is off shift; a salmon ring with STOP, a clock-out label and the
breathing ON SHIFT lamp while on shift. Only the circle punches. The app counts hours; it does
not need to verify who pressed, and with no server there was never anything to check a
signature against. `CHANGELOG.md` (eighty-sixth entry) has the reasoning.

Some accidental taps are handled after the fact: a second tap within 1.5 s is the same tap.
From 0.5 s to 9.5 s after START a green strip under the pad undoes the clock-in with one tap
(ninety-fifth and ninety-seventh entries); for 1.5 s after that undo, START and the shift
buttons ignore a tap, so a double tap cannot clock back in. A second tap within 30 minutes of
clocking in does not clock out — it offers to cancel the clock-in. At clock-out, a shift over 14 hours or one whose clock-in is more than 6 hours
from the shift start opens a card before anything is saved: record it, delete the stray
clock-in and clock in now, or close. A night-shift-shaped stray (20:00 → 07:50 for a night
worker) looks like a real shift and is not caught, and a stray STOP after 30 minutes records
a wrong clock-out. That one is undone the same way as START: from 0.5 s to 9.5 s after STOP a
pink strip under the pad removes the record and puts the worker back on shift from the original
clock-in (ninety-eighth entry); after that, fix it by editing the day. **Do not add a hold or a
confirmation step before the punch.**

There is **no server and no account**. Do not add a backend, do not upload anything. That is
a hard product requirement: workers are sharing this with each other and their pay data must
never leave their phone.

**If a signed APK is genuinely required** (e.g. to hand round on a USB stick, or to publish):
wrap the hosted PWA rather than rewriting. Bubblewrap or PWABuilder produce a TWA APK from a
https URL in minutes. Only reach for Capacitor if you need something the web can't do; if you
do use Capacitor, `@capacitor/preferences` replaces localStorage — the rest of the app is
unchanged.

**Do not port this to Kotlin/Compose or React Native unless the user asks.** It would mean
re-deriving the wage engine below, which is where all the risk lives.

### 2. Hosting
Any static host over https: Netlify Drop, Cloudflare Pages, GitHub Pages, Vercel. The build
is one file with no dependencies. Add a web app manifest + service worker so "Add to Home
screen" installs it properly and it opens offline.

## The wage engine — port this exactly, it is verified against real payslips
All of it lives in the `Component` class in `WorkLogApp.v2.dc.html`. Read `calc()`,
`snapIn()`, `snapOut()`, `detectShift()`, `period()`, `legalGap()`.

**Rates** (all derived from base pay, nothing hardcoded):
- hourly = base pay ÷ standard hours (default 209) — e.g. 2,156,880 ÷ 209 = ₩10,320
- overtime = hourly × 1.5, on hours past 8 net in a day
- night premium = hourly × 0.5, on any hour worked 22:00–06:00 (stacks with OT)
- holiday work = hourly × 1.5 (company practice)
- Legal holiday work (Labor Standards Act §56②) = ×1.5 first 8h, **×2.0 past 8h**
- OT / night / holiday hours floor to 0.5h

**Punch rounding — asymmetric, this matters:**
- Clock-IN rounds **up** to the next 30 min (08:40 -> 09:00, 08:20 -> 08:30). Lateness is
  never rounded away. A genuinely early 08:30 stays 08:30 and is paid.
- Clock-OUT rounds **down** to the last 30 min (20:15 -> 20:00). Unworked time is never paid.
- Exception: a configurable grace before the hour credits the hour (with 15 min,
  20:45 -> 21:00). A new install starts at 0, so nothing is credited that the company
  may not give; set it to what your company actually does.

**Shift detection:** the user sets their own day-shift start / night-shift start times. A punch is logged as
whichever of the two it is *circularly nearer* to. No fixed windows. Watch the wrap-around
maths — `(((a-b) % 24) + 24) % 24`, then `min(d, 24-d)`. Getting this wrong silently
misclassifies shifts.

**Breaks** are user-defined per shift and unpaid; they are subtracted from gross time and
from the night-premium window.

**Payroll period** runs from a user-set start day to the day before the next month's start
day (e.g. 21st -> 20th), with payday separate. A start day of 31 means month-end and must
fall back to each month's own last day.

**Elapsed time must come from real timestamps** (`(now - inIso)/3600000`), never from
reconstructing hours-of-day. A session left open for days must still read correctly; over 24h
the app refuses to auto-close and sends the user to the manual entry sheet.

**Why a day was short (v2 only).** A punch-out more than an hour under the worker's own recent median for that shift
kind — and never above 8 worked hours, so a day with less overtime than usual is not an
early out — opens a popup offering twelve translated reasons in a dropdown,
each carrying a legal classification: `employer` (no materials, a broken mould, no orders and
the like) puts the day under Labor Standards Act Article 46, `worker` (leaving early by choice)
does not, `other` routes an injury at work to industrial accident insurance. The
same popup is how a past day is tagged from its LOGS row, and how a day recorded by
"sent home" or "record it anyway" gets its reason. The reason is stored with its
Korean text so the work record prints Korean whatever language the app is set to. The
shutdown allowance is average wage × 70% — floored by Article 2② and capped by the
Article 46① proviso, not ordinary wage as v1's successor first had it.

**Day types with no punch:** annual leave, vacation, holiday worked.
Leave pays 8h regular — already inside base pay — so it adds no variable pay. Korean public
holidays for 2026–2027 are built in (including Lunar New Year, Chuseok and Buddha's Birthday, which follow the lunar
calendar and move each year); leave ranges skip weekends and red days. Saturday is treated as an unpaid day off
(overtime only, no ×2.0 tier) unless the user flags that their company designates it a holiday.

**Deductions:** the four major insurances can auto-calc from the monthly pay base at 2026 rates
(Health Insurance 3.545% employee, long-term care = Health Insurance × 13.14%, National Pension
4.5%), or be typed manually. Income tax is estimated from the behaviour of the simplified
withholding tax table for earned income; local income tax is always 10% of income tax. Users can add their own rows.

## Non-negotiables
1. **No server, no account, no telemetry.** Data stays on the device. Add an export/backup
   (JSON or share-sheet) instead of a cloud sync — losing a phone should not lose a year of
   evidence, but nothing may be uploaded.
2. **The language toggle** must keep working across the whole UI, including holiday names.
   (v2: eight languages, and holiday names are translated too — see `V2.md`.)
3. **Every label must match what the code actually does.** This bit us repeatedly: an
   "added" toast on a flow that replaced a record, an undo that deleted instead of reverting.
4. Money figures shown to the user may be taken to an employer. They must be right or absent.

## Files in this bundle
- `근무기록-WorkLog.html` — run this first
- `WorkLogApp.v2.dc.html` — app source (logic class = the spec)
- `test/fixtures/v1-engine.dc.html` — the frozen v1 engine, kept only so the
  regression suite can prove v2's pay maths still matches the rates that were
  reverse-engineered from 7 real payslips

## Licence

MIT — see [LICENSE](LICENSE). Third-party notices, including React's, are in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

The licence is deliberate rather than incidental. This app makes a strong claim —
that nothing leaves the device — and the cheapest way for a labor attorney, an NGO or a
labour inspector to check that claim is to read the source and the manifest themselves.
MIT also lets a foreign workers' support center mirror the APK and hand it out without asking
anyone's permission, which is how a free tool actually reaches the people it was
built for.

What the licence does **not** change is [what this is not](#what-this-is-not): it
remains a calculator, it gives no legal advice, and it stays free. The MIT warranty
disclaimer is not a substitute for the notice printed on every work record.
