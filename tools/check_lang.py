#!/usr/bin/env python3
"""Validate every lang/<code>.json against lang/base.json.

Checks what actually breaks a translated build:
  * unknown keys (a typo means the string silently never shows)
  * placeholders invented that the English source does not have ({p9} would
    render literally on screen)
  * '|' lists that changed length (weekday and month names are indexed)
  * keys still missing, split into ones that need translating and ones that are
    meant to stay Korean
  * 최저임금 figures typed into a sentence instead of passed in as {p0}. Those go
    stale the day the minimum wage changes and the app then states a wrong
    number with full confidence — see wage_literals() below.
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANG = os.path.join(ROOT, 'lang')
PH = re.compile(r'\{(\w+)\}')
HAN = re.compile(r'[가-힣]')
LAT = re.compile(r'[A-Za-z]')


def korean_only(s):
    return bool(HAN.search(s)) and not LAT.search(s)


SRC = os.path.join(ROOT, 'WorkLogApp.v2.dc.html')
MENTIONS_MIN_WAGE = re.compile(r'\ucd5c\uc800\uc784\uae08|minimum wage', re.I)


def wage_literals():
    """The numbers that move when 최저임금 moves, read out of the source.

    Read, never repeated: this check has to follow MIN_WAGE, because a copy kept
    here would go stale on exactly the day the thing it guards goes stale.

    Returns (numbers, years) — every minimum hourly wage the table knows, each
    one's × DEFAULT_DIVISOR monthly product, both bare and comma-grouped, plus
    the years those figures belong to.
    """
    src = io.open(SRC, encoding='utf-8').read()
    tbl = re.search(r'static MIN_WAGE = \[(.*?)\];', src, re.S)
    div = re.search(r'static DEFAULT_DIVISOR = (\d+);', src)
    if not tbl or not div:
        return None, None
    div = int(div.group(1))
    nums, years = set(), set()
    for year, won in re.findall(
            r"\{\s*from:\s*'(\d{4})-\d\d-\d\d',\s*won:\s*(\d+)\s*\}", tbl.group(1)):
        for v in (int(won), int(won) * div):
            nums.add(str(v))
            nums.add('{:,}'.format(v))
        years.add(year)
    return nums, years


def check_wage_literals():
    """Fail if a wage figure is typed into a translated sentence.

    The app is offline and cannot fetch next year's 고시, so MIN_WAGE is a hand
    edit once a year. That is fine — what is not fine is a sentence that has to
    be found and hand-edited too, because it will be missed, and a worker will
    read a confident wrong number. Every such sentence must take its figures as
    parameters; the_app_filled_this_in_with_the_legal is the shape to copy.
    """
    nums, years = wage_literals()
    print('\n== 최저임금 figures are parameters, not literals ==')
    if nums is None:
        print('  ! could not read MIN_WAGE / DEFAULT_DIVISOR from the source')
        return 1
    pats = [(n, re.compile(r'(?<![\d,])' + re.escape(n) + r'(?![\d,])')) for n in sorted(nums)]
    bad = []
    for f in sorted(os.listdir(LANG)):
        if not f.endswith('.json'):
            continue
        d = json.load(io.open(os.path.join(LANG, f), encoding='utf-8'))
        for k, v in sorted(d.items()):
            for text in ([v[x] for x in ('en', 'ko')] if isinstance(v, dict) else [v]):
                for lit, pat in pats:
                    if pat.search(text):
                        bad.append('%s  %s: wage figure %s is typed in' % (f, k, lit))
                if MENTIONS_MIN_WAGE.search(text):
                    for y in sorted(years):
                        if re.search(r'(?<!\d)' + y + r'(?!\d)', text):
                            bad.append('%s  %s: 최저임금 sentence names the year %s' % (f, k, y))
    for b in bad:
        print('  ! ' + b)
    if bad:
        print('  pass the figure in as {p0} instead — see the_app_filled_this_in_with_the_legal')
    else:
        print('  %d figures and %d years checked against every string  OK'
              % (len(nums), len(years)))
    return 1 if bad else 0


def main():
    base = json.load(io.open(os.path.join(LANG, 'base.json'), encoding='utf-8'))
    # keys nobody translates: the English gloss shown under a translated label,
    # and the Korean payslip words used as secondary lines
    skip = {k for k in base if k.endswith('__en') or korean_only(base[k]['en'])}
    need = [k for k in base if k not in skip]

    fail = 0
    for f in sorted(os.listdir(LANG)):
        if not f.endswith('.json') or f == 'base.json':
            continue
        code = f[:-5]
        d = json.load(io.open(os.path.join(LANG, f), encoding='utf-8'))
        problems = []

        for k, v in d.items():
            if k not in base:
                problems.append('%s: not a key in base.json' % k)
                continue
            allowed = set(PH.findall(base[k]['en'])) | set(PH.findall(base[k]['ko']))
            extra = set(PH.findall(v)) - allowed
            if extra:
                problems.append('%s: placeholder %s exists in neither ko nor en'
                                % (k, sorted(extra)))
            en_ph = set(PH.findall(base[k]['en']))
            if en_ph and not (set(PH.findall(v)) & en_ph):
                problems.append('%s: dropped every placeholder %s' % (k, sorted(en_ph)))
            if '|' in base[k]['en'] and v.count('|') != base[k]['en'].count('|'):
                problems.append('%s: list has %d items, needs %d'
                                % (k, v.count('|') + 1, base[k]['en'].count('|') + 1))

        missing = [k for k in need if k not in d or not str(d.get(k, '')).strip()]
        print('%-4s  %3d/%-3d translated  %s'
              % (code, len(need) - len(missing), len(need),
                 'OK' if not problems and not missing else ''))
        for p in problems:
            print('        ! ' + p)
            fail += 1
        if missing:
            print('        missing %d: %s%s'
                  % (len(missing), ', '.join(missing[:6]),
                     ' …' if len(missing) > 6 else ''))
            fail += 1

    print('\n%d language file(s) checked, %d problem group(s)'
          % (len([f for f in os.listdir(LANG) if f.endswith('.json')]) - 1, fail))
    fail += check_wage_literals()
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())
