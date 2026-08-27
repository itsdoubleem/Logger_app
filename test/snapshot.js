// Render every string the app can produce, in every language, as a stable dump.
// Used to prove the i18n refactor changed no Korean or English wording:
//   node test/snapshot.js ko > before.txt   (then refactor)   diff before.txt after.txt
const path = require('path');
const which = process.argv[3] === 'v1' ? './harness.js' : './harness2.js';
const { Component } = require(which);
const LANG = process.argv[2] || 'ko';

function build() {
  const c = new Component({});
  c.base = new Date('2026-08-02T10:00:00');
  c.t0 = Date.now();
  c.state.settings.lang = LANG;
  c.state.settings.allowances = [{ name: '식대', en: 'Meal allowance', amount: 200000, tf: true }];
  c.state.settings.deductions = [{ name: '기숙사비', en: 'Dormitory', amount: 150000 }];
  c.state.settings.slips = { 20260721: { ot: '200000' } };
  c.state.extra = [
    [7, 27], [7, 28], [7, 29], [7, 30], [7, 31], [8, 1],
  ].map(([m, day]) => ({
    y: 2026, m, day, kind: 'day', type: 'shift', inH: 9, outH: 22,
    c: c.calc(9, 22, 'day', false),
  }));
  c.state.extra.push({ y: 2026, m: 8, day: 3, kind: 'day', type: 'absent', c: c.calc(0, 0, 'day', false) });
  c.state.extra.push({ y: 2026, m: 8, day: 4, kind: 'day', type: 'shutdown', sentHome: true, c: c.calc(0, 0, 'day', false) });
  c.state.extra.push({ y: 2026, m: 8, day: 2, kind: 'night', type: 'shift', holiday: true, inH: 21, outH: 33, c: c.calc(21, 33, 'night', true) });
  c.state.extra.push({ y: 2026, m: 7, day: 26, kind: 'day', type: 'annual', c: { gross: 0, bk: 0, net: 8, reg: 8, ot: 0, night: 0, hol: 0, pay: 0 } });
  c.state.extra.push({ y: 2026, m: 7, day: 25, kind: 'day', type: 'vacation', c: { gross: 0, bk: 0, net: 8, reg: 8, ot: 0, night: 0, hol: 0, pay: 0 } });
  c.state.extra.push({ y: 2026, m: 7, day: 24, kind: 'day', type: 'redday', note: '공휴일', c: { gross: 0, bk: 0, net: 0, reg: 0, ot: 0, night: 0, hol: 0, pay: 0 } });
  c.state.extra.push({ y: 2026, m: 7, day: 23, kind: 'day', type: 'shift', review: true, inH: 9, outH: 9.2, c: { gross: 0.2, bk: 0, net: 0, reg: 0, ot: 0, night: 0, hol: 0, pay: 0 } });
  return c;
}

const out = [];
function walk(v, p) {
  if (v == null) return;
  if (typeof v === 'string') { if (v.trim()) out.push(p + ' = ' + v); return; }
  if (typeof v === 'number' || typeof v === 'boolean') return;
  if (typeof v === 'function') return;
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, p + '[' + i + ']')); return; }
  Object.keys(v).sort().forEach(k => walk(v[k], p + '.' + k));
}

// every screen state that gates a different set of strings
const states = [
  ['idle', c => {}],
  ['onshift', c => { c.state.session = { inIso: new Date('2026-08-02T09:00:00').toISOString() }; }],
  ['overrun', c => { c.state.session = { inIso: new Date('2026-08-01T09:00:00').toISOString() }; }],
  ['setup', c => { c.state.setupDone = false; }],
  ['backin', c => { c.state.backIn = true; c.state.backInVal = '09:00'; }],
  ['short', c => { c.state.session = { inIso: new Date('2026-08-02T09:58:00').toISOString() }; c.state.shortOut = true; }],
  ['stale', c => { c.state.staleOut = true; }],
  ['pend_work', c => { c.state.pending = 'work'; c.state.pendingIso = new Date(2026, 7, 2).toISOString(); }],
  ['pend_annual', c => { c.state.pending = 'annual'; c.state.pendingIso = new Date(2026, 7, 3).toISOString(); c.state.pendingEndIso = new Date(2026, 7, 8).toISOString(); }],
  ['pend_vac', c => { c.state.pending = 'vacation'; c.state.pendingIso = new Date(2026, 7, 3).toISOString(); c.state.pendingEndIso = new Date(2026, 7, 5).toISOString(); }],
  ['pend_hol', c => { c.state.pending = 'holiday'; c.state.pendingIso = new Date(2026, 7, 9).toISOString(); }],
  ['pend_absent', c => { c.state.pending = 'absent'; c.state.pendingIso = new Date(2026, 7, 9).toISOString(); }],
  ['pend_shut', c => { c.state.pending = 'shutdown'; c.state.pendingIso = new Date(2026, 7, 9).toISOString(); }],
  ['open_shift', c => { c.state.openDay = 20260801; }],
  ['open_hol', c => { c.state.openDay = 20260802; }],
  ['open_absent', c => { c.state.openDay = 20260803; }],
  ['open_shut', c => { c.state.openDay = 20260804; }],
  ['open_review', c => { c.state.openDay = 20260723; }],
  ['open_leave', c => { c.state.openDay = 20260726; }],
  ['open_red', c => { c.state.openDay = 20260724; }],
  ['undo', c => { c.state.undoKeys = [20260801]; }],
  ['undo_edit', c => { c.state.undoKeys = [20260801]; c.state.editedKeys = [20260801]; }],
  ['import', c => { c.state.pendingImport = { app: 'worklog', extra: [1, 2], exported: '2026-07-01T00:00:00Z' }; }],
  ['insman', c => { c.st().insAuto = false; }],
  ['taxman', c => { c.st().taxMode = 'manual'; }],
  ['dayonly', c => { c.st().shifts = 'day'; }],
  ['nightonly', c => { c.st().shifts = 'night'; }],
  ['nogap', c => { c.st().holOverPaid = false; }],
  ['satHol', c => { c.st().satIsHoliday = true; }],
  ['lowwage', c => { c.st().basic = 1000000; }],
  ['unknownyear', c => { c.base = new Date('2029-08-02T10:00:00'); }],
  ['bio', c => { c.state.bio = true; c.state.bioCred = true; }],
  ['biobusy', c => { c.state.bio = true; c.state.bioBusy = true; }],
  ['bioretry', c => { c.state.bio = true; c.state.bioMsg = 'retry'; }],
  ['biooff', c => { c.state.bioMsg = 'off'; }],
  ['annualset', c => { c.st().annualAsOf = new Date('2026-07-01T00:00:00').toISOString(); }],
  ['tfover', c => { c.st().allowances = [{ name: '식대', amount: 300000, tf: true }]; }],
];

states.forEach(([name, mut]) => {
  const c = build();
  mut(c);
  let R;
  try { R = c.renderVals(); } catch (e) { out.push(name + ' !! THREW ' + e.message); return; }
  walk(R, name);
  // strings reachable only through methods
  try { out.push(name + ' ::evidence = ' + c.evidenceHtml().replace(/\s+/g, ' ')); } catch (e) { out.push(name + ' ::evidence THREW ' + e.message); }
  try { out.push(name + ' ::backInSummary = ' + c.backInSummary()); } catch (e) {}
  try { out.push(name + ' ::breakTotal = ' + c.breakTotal('day') + ' | ' + c.breakTotal('night')); } catch (e) {}
  try { out.push(name + ' ::backupName = ' + c.backupName() + ' | ' + c.evidenceName()); } catch (e) {}
});

console.log(out.join('\n'));
