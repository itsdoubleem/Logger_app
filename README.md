# Handoff: 근무기록 Work Log — Korean shift & wage tracker

> **New here — or an AI agent picking this folder up?** Start with
> [`CLAUDE.md`](CLAUDE.md). It is the map: which version ships, how the single-file
> source is shaped, what the build actually does, how to see a change on a real
> screen, and the traps that have caught people. Then come back here for the wage
> rules; for why things are the way they are, read [`V2.md`](V2.md) (the v1 bugs that
> made v2) and grep [`CHANGELOG.md`](CHANGELOG.md) (everything since).
>
> **There is now a v2.** See [`V2.md`](V2.md) for the bugs found in the app below
> and what changed. Source `WorkLogApp.v2.dc.html`, built with `python3 build.py v2`
> into `dist-v2/`. Checks: `sh test/run.sh`.
>
> v2 ships in eight languages — 한국어, English, Tiếng Việt, 中文, ไทย, Bahasa
> Indonesia, नेपाली, ភាសាខ្មែរ — with the Korean payslip terms kept visible beside
> every translation. Wording lives in `lang/*.json`; adding a language is adding a
> file, then `python3 tools/sync_lang.py`.
>
> v2 also records **why** a day ended early (조퇴 사유) and computes 근로기준법
> 제46조 휴업수당 on 평균임금, including partial-day shutdowns. See Part 2 §6–7 of
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
月 payslip. It is fully functional today — settings and records persist in localStorage.

**Goal of this handoff: get it onto an Android phone as an installable app whose punch pad
uses the real fingerprint sensor.** Not a redesign. The UI and the wage engine are done and
should be preserved exactly.

## What this is *not*

It is a **calculator**, not a 공인노무사 and not a lawyer. It applies 근로기준법 to a record
the worker keeps themselves and shows the arithmetic. It gives no legal advice, provides no
labour consulting, drafts and files nothing on anyone's behalf, and is free — which is what
keeps it clear of 공인노무사법 제27조, whose §1 reserves 노동관계법령 상담·지도 and 서류의
작성·확인 *as a business* (업으로서) to licensed 노무사, and whose §2 also bars advertising
that could be mistaken for it. Keep the app's own description in those terms.

Everything it produces says so on its face:

- the 근무내역서 opens with **이 문서는 근로자 본인이 작성한 기록입니다** — a self-record,
  not a certificate issued by a company or an agency — above the first table, not in grey
  type at the bottom;
- its 안내 states that the document is not legal advice, that whether wages are owed is for
  고용노동부 and a 노무사 or lawyer to decide, that the binding figures are on the company's
  급여명세서, and where to get free help;
- **no developer name is printed on it.** The tool name and version are, so the arithmetic
  can be checked. Credit stays in 설정 › 정보, a screen only the worker sees;
- the **worker's** name does appear, from 설정 › 백업과 내보내기 — on the document, in the
  CSV's first column, and in both file names, so that three workmates at one factory who
  each submit a 근무내역서 produce three documents that can be told apart. It is optional,
  and a document made without it says **성명 미기재** on its face rather than going out
  silently anonymous;
- the **employer** appears too, and is stamped per pay period alongside the wage basis, so
  changing jobs never rewrites an old document. Where no employer was recorded for a
  period, the document says it is showing the current setting rather than pretending to
  know. The 근무내역서 is made in exactly one place — 설정 › 백업과 내보내기, beside the
  backup and CSV exports.

Free help, in the app and on every document: **고용노동부 고객상담센터 ☎ 1350** (weekdays
09:00–18:00, interpreters), the 노동포털 at labor.moel.go.kr, and any 외국인노동자지원센터.

Three things would cross the line and must not be added: telling the worker what action to
take, drafting or filing a 진정 for them, and charging for the calculation.

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

### 1. Real biometric punch (the actual ask)
Today the pad is press-and-hold — a stand-in. It must become a real fingerprint prompt.

**Recommended: keep it a web app, add WebAuthn.**
WebAuthn's platform authenticator triggers the phone's real fingerprint sensor. It needs a
**secure context (https)** — it will not work from a `file://` URL, which is the only
reason the prototype doesn't have it already.

- On first run, register a platform credential:
  `navigator.credentials.create({ publicKey: { ..., authenticatorSelection:
  { authenticatorAttachment: 'platform', userVerification: 'required' } } })`
  Store the credential id in localStorage.
- On each punch, verify:
  `navigator.credentials.get({ publicKey: { challenge, allowCredentials: [{ id, type:'public-key' }],
  userVerification: 'required' } })`
  Resolve => record the punch. Reject => do nothing.
- There is **no server and no account** — this is local device verification only, used as a
  deliberate confirmation gesture (and to stop a pocket-tap logging a shift). Do not add a
  backend, do not upload anything. That is a hard product requirement: workers are sharing
  this with each other and their pay data must never leave their phone.
- Feature-detect. If WebAuthn or a platform authenticator is unavailable, fall back to the
  existing press-and-hold. Never leave the user unable to punch.

**If a signed APK is genuinely required** (e.g. to hand round on a USB stick, or to publish):
wrap the hosted PWA rather than rewriting. Bubblewrap or PWABuilder produce a TWA APK from a
https URL in minutes. Only reach for Capacitor if you need something the web can't do; if you
do use Capacitor, `@capacitor/preferences` replaces localStorage and a biometric plugin
replaces WebAuthn — the rest of the app is unchanged.

**Do not port this to Kotlin/Compose or React Native unless the user asks.** It would mean
re-deriving the wage engine below, which is where all the risk lives.

### 2. Hosting
Any static host over https: Netlify Drop, Cloudflare Pages, GitHub Pages, Vercel. The build
is one file with no dependencies. Add a web app manifest + service worker so "Add to Home
screen" installs it properly and it opens offline.

## The wage engine — port this exactly, it is verified against real payslips
All of it lives in the `Component` class in `WorkLogApp.v2.dc.html`. Read `calc()`,
`snapIn()`, `snapOut()`, `detectShift()`, `period()`, `legalGap()`.

**Rates** (all derived from 기본금, nothing hardcoded):
- hourly = 기본금 ÷ 기준시간 (default 209) — e.g. 2,156,880 ÷ 209 = ₩10,320
- 잔업 overtime = hourly × 1.5, on hours past 8 net in a day
- 야간심야 night premium = hourly × 0.5, on any hour worked 22:00–06:00 (stacks with OT)
- 특근 holiday work = hourly × 1.5 (company practice)
- Legal 휴일근로 (근로기준법 §56②) = ×1.5 first 8h, **×2.0 past 8h**
- OT / night / holiday hours floor to 0.5h

**Punch rounding — asymmetric, this matters:**
- Clock-IN rounds **up** to the next 30 min (08:40 -> 09:00, 08:20 -> 08:30). Lateness is
  never rounded away. A genuinely early 08:30 stays 08:30 and is paid.
- Clock-OUT rounds **down** to the last 30 min (20:15 -> 20:00). Unworked time is never paid.
- Exception: a configurable grace before the hour (default 15 min) credits the hour
  (20:45 -> 21:00). Set to 0 for companies that credit only the exact hour.

**Shift detection:** the user sets their own 주간 시작 / 야간 시작 times. A punch is logged as
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

**Why a day was short (v2 only).** A punch-out below the worker's own recent median
for that shift kind opens a popup offering twelve translated reasons in a dropdown,
each carrying a legal classification: `employer` (자재·금형·물량 등) puts the day under
근로기준법 제46조, `worker` (조퇴) does not, `other` routes 업무 중 부상 to 산재보험. The
same popup is how a past day is tagged from its LOGS row, and how a day recorded by
"sent home" or "record it anyway" gets its reason. The reason is stored with its
Korean text so the 근무내역서 prints Korean whatever language the app is set to. 휴업수당 is 평균임금 × 70% — floored by 제2조② and capped by the
제46조① proviso, not 통상임금 as v1's successor first had it.

**Day types with no punch:** 연차 (annual leave), 휴가 (vacation), 특근 (holiday worked).
Leave pays 8h regular — already inside 기본금 — so it adds no variable pay. Korean public
holidays for 2026–2027 are built in (including lunar 설날/추석/부처님오신날 which move each
year); leave ranges skip weekends and red days. Saturday is treated as 무급휴무일 (overtime
only, no ×2.0 tier) unless the user flags their company designates it a 휴일.

**Deductions:** 4대보험 can auto-calc from 보수월액 at 2026 rates (건강보험 3.545% employee,
장기요양 = 건강보험 × 13.14%, 국민연금 4.5%), or be typed manually. 소득세 is estimated from
근로소득 간이세액표 behaviour; 주민세 is always 10% of 소득세. Users can add their own rows.

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
that nothing leaves the device — and the cheapest way for a 노무사, an NGO or a
근로감독관 to check that claim is to read the source and the manifest themselves.
MIT also lets a 외국인노동자지원센터 mirror the APK and hand it out without asking
anyone's permission, which is how a free tool actually reaches the people it was
built for.

What the licence does **not** change is [what this is not](#what-this-is-not): it
remains a calculator, it gives no legal advice, and it stays free. The MIT warranty
disclaimer is not a substitute for the 안내 printed on every 근무내역서.
