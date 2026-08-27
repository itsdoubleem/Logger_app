# tools/

## Use these

- **`sync_lang.py`** — folds `lang/*.json` into `Component.STR` in
  `WorkLogApp.v2.dc.html`. Run after editing any wording.
  `--report` prints coverage without writing.
- **`check_lang.py`** — validates every language file against `lang/base.json`.
  Run before shipping; also runs inside `sh test/run.sh`.

## Adding a language

1. Copy `lang/base.json` to `lang/<code>.json` and replace each value with the
   translation. Keep `{p0}`, `{n}`, `{name}` placeholders exactly as they are, and
   keep `|` lists (`dow_letters`, `dow_short`, `dow_long`, `month_names`) the same
   length — they are read by index.
2. Add the code to `EXTRA_LANGS` in `sync_lang.py`.
3. Add a row to `Component.LANGS` in `WorkLogApp.v2.dc.html`:
   `['tl', 'Tagalog', 'Tagalog']` — code, the name in that language, the English
   name.
4. `python3 tools/check_lang.py && python3 tools/sync_lang.py && python3 build.py v2`

Anything a file leaves out falls back to English, then Korean, so a partial file
never blanks the screen — but `check_lang.py` will list what is missing.

## Adding a 조퇴 사유 (early-out reason)

A reason needs a row in `Component.REASONS` and **two** keys, because the picker
shows the reader's language on top and Korean underneath:

- `rsn_<id>` — the sentence, translated in every language file
- `rsn_<id>__en` — the small English gloss shown under it *for Korean readers only*.
  `check_lang.py` skips any key ending `__en`, so it never asks for translations
  of it.

`fault` is the part that matters: `'employer'` is what makes the app apply
근로기준법 제46조 to that day, `'worker'` and `'other'` leave the pay alone. The
Korean text is copied onto the record when the worker picks it, so changing the
wording here does not rewrite documents that were already generated.

House style, from the six that are already here: **the Korean payslip term leads
and the translation follows** — `잔업 Tăng ca ×1.5`, not `Tăng ca ×1.5`. The worker
has to be able to find that word on the paper in their hand. Use ASCII digits, not
the script's own numerals: every figure the app computes is ASCII and so is every
figure on a Korean payslip.

27 of the 504 keys are deliberately never translated — the `*__en` glosses and the
Korean-only secondary labels. `check_lang.py` knows which and won't ask for them.

## Removed — the one-time refactor scripts

Seven scripts once lived here (`extract_lang.py`, `convert_rest.py`,
`convert_last.py`, `add_dates.py`, `fix_pass*.py`). They performed the one-time v2
i18n refactor — 416 `this.t(ko, en)` call sites → `this.T(key, params)` — and were
kept afterwards only as a record. They rewrote `WorkLogApp.v2.dc.html` in place and
expected the pre-refactor source, so running one *ever again* would have corrupted
the file. That job is finished and cannot recur, so they were deleted on
2026-08-28 rather than left in the folder as a live footgun.

Only `sync_lang.py` and `check_lang.py` remain, and both are safe to run any time.
