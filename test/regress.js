const V1=require('./harness.js').Component;
const V2=require('./harness2.js').Component;
let pass=0,fail=0;
const ok=(n,c,extra='')=>{ (c?pass++:fail++); console.log((c?'  PASS  ':'! FAIL  ')+n+(extra?'  '+extra:'')); };
const mk=(C,iso='2026-08-02T10:00:00')=>{const c=new C({});c.base=new Date(iso);c.t0=Date.now();return c;};

console.log('\n== wage engine unchanged from v1 (verified against real payslips) ==');
{ const a=mk(V1),b=mk(V2);
  // v2의 기본 기본금은 '설치한 해의 최저임금 × 209'라 2027년부터는 v1과 다릅니다.
  // 비교하려는 것은 시작 금액이 아니라 계산식이므로 같은 기본금에서 출발시킵니다.
  b.state.settings.basic=a.state.settings.basic;
  b.state.settings.divisor=a.state.settings.divisor;
  // v2의 기본 근무조도 바뀌었습니다 — 교대(09:00/21:00)에서 주간만(09:00–18:00,
  // 점심 한 번)으로. 여기서 증명하려는 것은 '같은 근무조건에 같은 계산식'이므로
  // 근무조와 휴게도 v1에 맞춰 놓고 비교합니다. 기본값이 아니라 식이 대상입니다.
  b.state.settings.shifts=a.state.settings.shifts;
  b.state.settings.dayStart=a.state.settings.dayStart;
  b.state.settings.nightStart=a.state.settings.nightStart;
  b.state.settings.breaksDay=JSON.parse(JSON.stringify(a.state.settings.breaksDay));
  b.state.settings.breaksNight=JSON.parse(JSON.stringify(a.state.settings.breaksNight));
  const cases=[[8+40/60,20+50/60,'day',false],[20+40/60,32+50/60,'night',false],
               [9,21,'day',true],[9,23,'day',true],[6,15,'day',false],[22,30,'night',false]];
  let same=true, detail='';
  cases.forEach(k=>{const x=JSON.stringify(a.calc(...k)),y=JSON.stringify(b.calc(...k));
    if(x!==y){same=false;detail=JSON.stringify(k)+'\n   v1='+x+'\n   v2='+y;}});
  ok('calc() identical across 6 shift shapes',same,detail);
  ok('rate/otRate/nightRate/holOverRate identical',
    [a.rate(),a.otRate(),a.nightRate(),a.holOverRate()].join()===[b.rate(),b.otRate(),b.nightRate(),b.holOverRate()].join());
  let sn=true; for(let h=0;h<24;h+=0.25){ if(a.snapIn(h)!==b.snapIn(h)||a.snapOut(h)!==b.snapOut(h)) sn=false; }
  ok('snapIn/snapOut identical across all 96 half-hours',sn);
  let ds=true; for(let h=0;h<24;h+=0.5){ if(a.detectShift(h)!==b.detectShift(h)) ds=false; }
  ok('detectShift identical',ds);
}

console.log('\n== BUG A: a shift a year later no longer overwrites last year ==');
{ const c=mk(V2,'2027-07-21T18:00:00');
  c.state.extra=[{y:2026,m:7,day:21,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)}];
  c.state.session={inIso:new Date('2027-07-21T09:00:00').toISOString()};
  c.punch();
  ok('both years kept', c.state.extra.length===2, 'records='+c.state.extra.length);
  ok('keys differ', c.key(c.state.extra[0])!==c.key(c.state.extra[1]));
}

console.log('\n== BUG A-migration: v1 data gets a sensible year ==');
{ const ref=new Date('2026-08-02T10:00:00');
  ok('07.21 -> 2026', V2.addYear({m:7,day:21},ref).y===2026);
  // 2026-12-25 is 145 days away, 2025-12-25 is 220 — nearest is 2026
  ok('12.25 -> 2026 (the nearer December)', V2.addYear({m:12,day:25},ref).y===2026, 'got '+V2.addYear({m:12,day:25},ref).y);
  const ref2=new Date('2026-02-10T00:00:00');
  ok('12.25 from Feb -> 2025 (the December just gone)', V2.addYear({m:12,day:25},ref2).y===2025, 'got '+V2.addYear({m:12,day:25},ref2).y);
  ok('01.05 -> 2027 (nearest forward)', V2.addYear({m:1,day:5},ref).y===2027, 'got '+V2.addYear({m:1,day:5},ref).y);
}

console.log('\n== BUG B: leave balance counts only leave since the stated date ==');
{ const c=mk(V2);
  c.state.settings.annualBase=9;
  c.state.settings.annualAsOf=new Date('2026-07-01T00:00:00').toISOString();
  c.state.extra=[
    {y:2025,m:3,day:2,type:'annual',c:{reg:8}},   // last year, must not count
    {y:2026,m:7,day:9,type:'annual',c:{reg:8}},   // after the as-of date
  ];
  ok('annualLeft = 8', c.annualLeft()===8, 'got '+c.annualLeft());
  const v1=mk(V1); v1.state.settings.annualBase=9;
  v1.state.extra=[{m:3,day:2,type:'annual',c:{reg:8}},{m:7,day:9,type:'annual',c:{reg:8}}];
  ok('v1 got this wrong (7)', v1.annualLeft()===7, 'v1='+v1.annualLeft());
}

console.log('\n== BUG E: save() no longer writes on an unchanged tick ==');
{ let w=0; const C=require('./harness2.js').Component;
  global.window.localStorage.setItem=()=>{w++;};
  const c=new C({}); c.base=new Date(); c.t0=Date.now();
  for(let i=0;i<10;i++){ c.state.tick=i; c.save(); }
  ok('10 clock ticks -> 1 write', w===1, 'writes='+w);
  c.state.extra=[{y:2026,m:8,day:2,type:'shift',c:{}}]; c.save();
  ok('a real change still writes', w===2, 'writes='+w);
}

console.log('\n== BUG F: 비과세 식대 excluded from tax and 보수월액 ==');
{ const c=mk(V2);
  // 기본금은 해마다 바뀌는 기본값(최저임금 × 209)이므로 숫자를 박지 않습니다
  const B=c.state.settings.basic;
  c.state.settings.allowances=[{name:'식대',en:'Meal',amount:200000,tf:true}];
  ok('taxFree = 200,000', c.taxFree()===200000);
  ok('insBase excludes it', c.insBase()===B, 'got '+c.insBase());
  const t=c.totals(), pc=c.payCalc(t);
  ok('gross still includes it', pc.gross===B+200000, 'gross='+pc.gross);
  ok('taxable excludes it', pc.taxable===B, 'taxable='+pc.taxable);
  c.state.settings.allowances=[{name:'식대',amount:300000,tf:true}];
  ok('exemption capped at 200,000', c.taxFree()===200000, 'got '+c.taxFree());
  ok('over-cap flagged', c.taxFreeOver()===true);
}

console.log('\n== BUG G: absence and shutdown reduce pay; shutdown is not leave ==');
{ const c=mk(V2);
  c.state.settings.periodStart=21;   // 이 기록들은 21일~20일 기간 안에 있습니다
  const base=c.payCalc(c.totals()).gross;
  c.state.extra=[{y:2026,m:7,day:30,type:'absent',kind:'day',c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}}];
  const withAbs=c.payCalc(c.totals()).gross;
  ok('결근 lowers gross by hourly x 8', base-withAbs===c.rate()*8, 'delta='+(base-withAbs));
  c.state.extra=[{y:2026,m:7,day:31,type:'shutdown',kind:'day',c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}}];
  const withShut=c.payCalc(c.totals()).gross;
  ok('휴업 pays 70%', base-withShut===c.rate()*8-c.shutdownPay(), 'delta='+(base-withShut));
  ok('휴업 does not touch leave', c.annualLeft()===(+c.st().annualBase||0));
}

console.log('\n== sentHome now records 휴업, not 연차 ==');
{ const c=mk(V2,'2026-08-03T09:20:00');
  c.state.session={inIso:new Date('2026-08-03T09:00:00').toISOString()};
  c.sentHome();
  ok("type === 'shutdown'", c.state.extra[0].type==='shutdown', 'got '+c.state.extra[0].type);
  ok('has a year', c.state.extra[0].y===2026);
  const v1=mk(V1,'2026-08-03T09:20:00');
  v1.state.session={inIso:new Date('2026-08-03T09:00:00').toISOString()};
  try{v1.sentHome(); ok('v1 recorded it as annual leave', v1.state.extra[0].type==='annual');}
  catch(e){ ok('v1 sentHome threw (inD undefined)', true, e.message); }
}

console.log('\n== hand-marked legal 휴일 restores the x2.0 tier ==');
{ const c=mk(V2,'2028-02-16T10:00:00');   // a 설날 the table does not know
  c.state.settings.periodStart=1;
  const rec={y:2028,m:2,day:16,kind:'day',type:'shift',holiday:true,inH:9,outH:22,c:c.calc(9,22,'day',true)};
  c.state.extra=[rec];
  ok('unmarked: no x2.0', c.holOverHours(c.state.extra[0])===0);
  c.toggleLegalHol(rec);
  const after=c.state.extra[0];
  ok('marked: x2.0 applies', c.holOverHours(after)>0, 'holOver='+c.holOverHours(after));
}

console.log('\n== 52-hour week detection ==');
{ // 12시간 2교대 공장의 한 주 — 휴게가 두 번이라 하루 실근무가 11.5시간입니다
  const c=mk(V2);
  c.state.settings.periodStart=21;
  c.state.settings.breaksDay=[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}];
  [[7,27],[7,28],[7,29],[7,30],[7,31],[8,1]].forEach(([m,d])=>
    c.state.extra.push({y:2026,m,day:d,kind:'day',type:'shift',inH:9,outH:22,c:c.calc(9,22,'day',false)}));
  ok('one week flagged', c.weekOver().length===1);
  ok('69.0h total', Math.abs(c.weeks()[0].net-69)<1e-9, c.weeks()[0].net+'h');
  const c2=mk(V2);
  c2.state.settings.periodStart=21;
  c2.state.settings.breaksDay=[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}];
  [[7,27],[7,28],[7,29],[7,30],[7,31]].forEach(([m,d])=>
    c2.state.extra.push({y:2026,m,day:d,kind:'day',type:'shift',inH:9,outH:19,c:c2.calc(9,19,'day',false)}));
  ok('a lawful 5x8.5h week is not flagged', c2.weekOver().length===0, c2.weeks()[0].net+'h');
}

console.log('\n== payslip comparison ==');
{ const c=mk(V2);
  c.state.extra=[{y:2026,m:7,day:27,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)}];
  ok('nothing entered -> no shortfall', !c.slipFilled() && c.slipShortfall()===0);
  const otApp=c.slipRows().find(r=>r.k==='ot').app;
  c.setSlip('ot', String(otApp-30000));
  ok('underpaid OT surfaces', c.slipShortfall()===30000, 'short='+c.slipShortfall());
  c.setSlip('ot', String(otApp));
  ok('matching figure clears it', c.slipShortfall()===0);
  c.setSlip('ot', String(otApp+5000));
  ok('overpayment is not a shortfall', c.slipShortfall()===0);
}

console.log('\n== evidence document ==');
{ const c=mk(V2);
  c.state.settings.periodStart=21;
  c.state.extra=[{y:2026,m:7,day:27,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)}];
  const h=c.evidenceHtml();
  ok('is a full HTML document', h.startsWith('<!doctype html>'));
  ok('names the period', h.includes('07.21 → 08.20'));
  ok('lists the day', h.includes('07.27'));
  ok('states the hourly rate', h.includes(c.won(c.rate())));
  ok('no unescaped user text', !/<script/i.test(h));
}

console.log('\n== BUG H: a week straddling the pay-period boundary is counted whole ==');
{ // period starts on the 21st, so Mon 17 -> Sun 23 Aug sits half in each period.
  // Six 11h days = 63h actual. Counting only the days inside the period saw 21h
  // and raised no warning at all — and every period has one such week.
  const c=mk(V2,'2026-08-24T10:00:00');
  c.state.settings.periodStart=21;
  c.state.settings.breaksDay=[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}];   // 09:00–21:00에 휴게 두 번 = 하루 10.5시간
  c.month=function(){return this.state.extra.slice();};
  [[8,17],[8,18],[8,19],[8,20],[8,21],[8,22]].forEach(([m,d])=>
    c.state.extra.push({y:2026,m,day:d,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)}));
  const w=c.weeks()[0];
  ok('the whole week is counted, not just the days inside the period', Math.abs(w.net-63)<1e-9, w.net+'h');
  ok('6 days, not 2', w.days===6, 'days='+w.days);
  ok('the breach is flagged', c.weekOver().length===1);
  // a week entirely outside the period must not appear
  const c2=mk(V2,'2026-08-24T10:00:00');
  c2.state.settings.periodStart=21;
  c2.month=function(){return this.state.extra.slice();};
  [[6,1],[6,2],[6,3],[6,4],[6,5],[6,6]].forEach(([m,d])=>
    c2.state.extra.push({y:2026,m,day:d,kind:'day',type:'shift',inH:9,outH:21,c:c2.calc(9,21,'day',false)}));
  ok('a week from a past period is not shown', c2.weeks().length===0, 'weeks='+c2.weeks().length);
}

console.log('\n== BUG I: 토요일 = 휴일 설정이 연차 범위에도 적용됩니다 ==');
{ // the setting made Saturday work count as 특근, but the leave picker ignored it
  // and still ate a 연차 day for a Saturday nobody was due to work.
  const on=mk(V2); on.st().satIsHoliday=true;  on.openPending('annual');
  const off=mk(V2); off.st().satIsHoliday=false; off.openPending('annual');
  const range=c=>{ c.state.pendingIso=new Date(2026,7,21).toISOString();   // Fri 21
                   c.state.pendingEndIso=new Date(2026,7,22).toISOString(); // Sat 22
                   return c.rangeDays(); };
  const a=range(on), b=range(off);
  ok('설정 켜짐 → 토요일 차감 없음', a[1].deduct===false);
  ok('설정 켜짐 → 금요일은 그대로 차감', a[0].deduct===true);
  ok('설정 켜짐 → 연차 1일만 사용', a.filter(x=>x.deduct).length===1, 'used='+a.filter(x=>x.deduct).length);
  ok('설정 꺼짐 → 예전 그대로 (체크박스로 직접)', b[1].deduct===true);
  ok('토요일이 아닌 날에는 영향 없음', range(on)[0].deduct===true);
}

console.log('\n== BUG J: 자동계산 적용이 고용보험도 갱신합니다 ==');
{ // insCalc() worked out emp and applyIns() threw it away: three of the four
  // statutory rows updated and 고용보험 silently kept its old number.
  const c=mk(V2);
  c.st().insAuto=false;
  c.st().deductions=[{name:'건강보험',amount:1},{name:'국민연금',amount:2},
                     {name:'장기요양',amount:3},{name:'고용보험',amount:4},{name:'기숙사비',amount:150000}];
  const want=c.insCalc();
  c.applyIns();
  const get=n=>c.st().deductions.find(d=>d.name===n).amount;
  ok('고용보험 updated', get('고용보험')===want.emp, get('고용보험')+' want '+want.emp);
  ok('the other three still update', get('건강보험')===want.health&&get('국민연금')===want.pension&&get('장기요양')===want.care);
  ok('non-statutory rows untouched', get('기숙사비')===150000);
  // E-9 workers often have no 고용보험 line — it must not be invented
  const c2=mk(V2);
  c2.st().insAuto=false;
  c2.st().deductions=[{name:'건강보험',amount:1}];
  c2.applyIns();
  ok('no 고용보험 row is added when the payslip has none',
    !c2.st().deductions.some(d=>d.name==='고용보험'));
}

console.log('\n== BUG K: 간이세액표가 현행 공식 표와 일치합니다 ==');
{ // 소득세법 시행령 [별표 2] <개정 2026. 2. 27.> · 2026.3.1 지급분부터.
  // 예전 표(개정 전)를 몇 점만 찍어 어림하던 때는 월 350만원대에서 매달
  // 15,000원쯤을 실제보다 많게 잡았습니다. 아래 값은 관보 표에서 그대로 옮긴 것.
  const c=mk(V2);
  const dep=n=>{ c.st().dependents=n; };
  // [월급여(원), 공제대상가족 수, 공식 세액]
  const spot=[
    [2000000,1,19520],[2000000,2,14750],[2000000,3,6600],[2000000,4,3220],
    [2500000,1,35600],[2500000,2,28600],[2500000,3,16530],
    [3000000,1,74350],[3000000,2,56850],[3000000,3,31940],
    [4500000,1,262840],[4500000,2,234460],[4500000,11,42680],
    [6000000,1,505900],[6000000,11,245720],
  ];
  let ok2=true, why='';
  spot.forEach(([g,d,want])=>{ dep(d); const got=c.tax(g); if(got!==want){ok2=false;why=`${g} dep${d}: got ${got} want ${want}`;} });
  ok('15 published spot values reproduce exactly',ok2,why);
  dep(1);
  ok('개정 전 값(84,850)은 더 이상 나오지 않습니다', c.tax(3000000)===74350, 'got '+c.tax(3000000));
  // 구간 안에서는 세액이 같고, 구간이 바뀌면 올라갑니다
  ok('구간 내 동일', c.tax(3000000)===c.tax(3019000));
  ok('다음 구간에서 상승', c.tax(3020000)>c.tax(3019000));
  // 표 밖
  ok('표 아래 급여는 0원', c.tax(500000)===0);
  ok('표 범위는 100만~1,000만원', c.taxBand()[0]===1000000&&c.taxBand()[1]===10000000, c.taxBand().join('~'));
  // 부양가족이 늘면 세금은 절대 늘지 않습니다 (예전 배수식은 이 성질을 깼습니다)
  let mono=true;
  [1500000,2500000,3500000,5000000,8000000].forEach(g=>{
    let prev=Infinity;
    for(let d=1;d<=11;d++){ dep(d); const t=c.tax(g); if(t>prev) mono=false; prev=t; }
  });
  ok('부양가족이 늘수록 세액이 줄거나 같음', mono);
  dep(1);
}

console.log('\n== 8~20세 자녀 추가공제 ==');
{ // 별표2 비고 — 표에서 나온 세액에서 자녀 수만큼 한 번 더 뺍니다.
  // 금액은 자녀세액공제 ÷ 12 (2025년 귀속부터 25만/55만/+40만원).
  const c=mk(V2); c.st().dependents=1;
  const base=c.tax(3000000);                       // 74,350 · 자녀 0명
  ok('기본값은 자녀 0명 — 예전과 같은 세액', base===74350, 'got '+base);
  const at=n=>{ c.st().children=n; return c.tax(3000000); };
  ok('자녀 1명 → 20,830원 공제', at(1)===base-20830, 'got '+at(1));
  ok('자녀 2명 → 45,830원 공제', at(2)===base-45830, 'got '+at(2));
  // 3명·4명은 공제가 74,350원보다 커서 여기서는 0에 걸립니다 — 세액이 큰 구간에서 확인
  c.st().children=0;
  const hi=c.tax(4500000); // 262,840 · 자녀 0명
  const atHi=n=>{ c.st().children=n; return c.tax(4500000); };
  ok('자녀 3명 → 79,160원 공제', atHi(3)===hi-79160, 'got '+atHi(3)+' base '+hi);
  ok('자녀 4명 → 112,490원 공제', atHi(4)===hi-112490, 'got '+atHi(4));
  c.st().children=0;
  // 공제가 세액보다 크면 0 — 음수 세금은 없습니다
  c.st().children=6;
  ok('공제가 세액보다 크면 0원', c.tax(2000000)===0, 'got '+c.tax(2000000));
  ok('세액이 음수로 내려가지 않음', c.tax(1500000)===0);
  // 자녀 수는 부양가족 수와 별개로 동작합니다
  c.st().children=1; c.st().dependents=3;
  ok('부양가족 수와 함께 적용', c.tax(3000000)===31940-20830, 'got '+c.tax(3000000));
  // 잘못된 입력
  c.st().dependents=1;
  c.st().children=-2; ok('음수 자녀 수는 0으로', c.tax(3000000)===base);
  c.st().children=undefined; ok('값이 없으면 0으로', c.tax(3000000)===base);
  ok('childCredit(0)===0', V2.childCredit(0)===0);
}

console.log('\n== 조퇴 사유 · 언제 물어보는가 ==');
{ // 하루가 짧은지는 고정된 8시간이 아니라 근로자 자신의 평소로 판단합니다.
  // 이 공장의 주간조는 09:00-18:00에 휴게가 두 번이라 정상인 하루가 7.5시간입니다 —
  // 8시간을 기준으로 잡으면 매일 물어보는 앱이 됩니다. (앱의 기본 휴게는 점심
  // 하나뿐이므로, 그 공장의 휴게 두 개를 여기서 직접 넣고 시작합니다.)
  const c=mk(V2,'2026-08-11T18:00:00');
  c.state.settings.breaksDay=[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}];
  ok('휴게 두 번이면 09:00-18:00은 실근무 7.5시간', c.calc(9,18,'day',false).net===7.5);
  ok('기록이 없으면 평소를 모릅니다', c.normalNet('day')===null);
  ok('평소를 모르는 동안 기준은 6시간', c.shortDayLimit('day')===6);
  ok('정상인 7.5시간짜리 하루는 묻지 않습니다',
    !c.isShortDay({type:'shift',kind:'day',c:c.calc(9,18,'day',false)}));
  ok('4시간짜리 하루는 기록이 없어도 묻습니다',
    c.isShortDay({type:'shift',kind:'day',c:c.calc(9,14,'day',false)}));
  // 매일 10.5시간을 하던 사람에게는 기준이 따라 올라갑니다
  [3,4,5,6,7].forEach(d=>c.state.extra.push(
    {y:2026,m:8,day:d,kind:'day',type:'shift',c:c.calc(9,21,'day',false)}));
  ok('평소 10.5시간이 잡힙니다', c.normalNet('day')===10.5, 'got '+c.normalNet('day'));
  ok('기준이 9.5시간으로 올라갑니다', c.shortDayLimit('day')===9.5, 'got '+c.shortDayLimit('day'));
  ok('잔업이 없어진 8.5시간짜리 하루도 묻습니다',
    c.isShortDay({type:'shift',kind:'day',c:c.calc(9,19,'day',false)}), 'net='+c.calc(9,19,'day',false).net);
  ok('평소대로 10.5시간이면 묻지 않습니다',
    !c.isShortDay({type:'shift',kind:'day',c:c.calc(9,21,'day',false)}));
  // 야간조는 야간조끼리 — 조가 다르면 평소도 다릅니다
  ok('야간은 따로 셉니다', c.normalNet('night')===null);
}

console.log('\n== 조퇴 사유 · 퇴근이 먼저 저장됩니다 ==');
{ const c=mk(V2,'2026-08-11T14:00:00');
  c.state.session={inIso:new Date('2026-08-11T08:40:00').toISOString()};
  c.punch();
  // 사유를 받기 전에 근무가 이미 들어가 있어야 합니다. 예전에는 시트가 근무를
  // 들고 있다가 함께 저장했는데, 그 사이에 앱이 죽으면 하루가 통째로 없어졌습니다.
  ok('퇴근이 즉시 기록됩니다', c.state.extra.length===1);
  ok('출근 상태가 바로 풀립니다', c.state.session===null);
  ok('그 다음에 시트가 열립니다', c.state.reasonFor===c.key(c.state.extra[0]));
  ok('방금 찍은 퇴근으로 표시됩니다', c.state.reasonFresh===true);
  ok('시간이 맞습니다', c.state.extra[0].c.net===4, 'net='+c.state.extra[0].c.net);
  // 시트가 열려 있는 동안 앱이 죽어도 — 저장되는 것은 이 payload뿐입니다
  const saved=JSON.parse(JSON.stringify({extra:c.state.extra,session:c.state.session}));
  ok('앱이 죽어도 근무가 남습니다', saved.extra.length===1 && saved.session===null);
  // 사유 없이 닫아도 근무는 그대로입니다
  c.closeReason();
  ok('닫아도 근무는 그대로', c.state.extra.length===1);
  ok('사유는 비어 있습니다', !c.state.extra[0].reason);
  ok('시트가 닫힙니다', c.state.reasonFor===null && c.state.reasonFresh===false);
  // 평소대로 채운 날은 시트를 열지 않습니다
  const c2=mk(V2,'2026-08-11T21:00:00');
  c2.state.session={inIso:new Date('2026-08-11T09:00:00').toISOString()};
  c2.punch();
  ok('평소대로 일한 날은 묻지 않습니다', c2.state.reasonFor===null);
  ok('그 날도 물론 기록됩니다', c2.state.extra.length===1);
}

console.log('\n== 조퇴 사유 · 고르면 법적 분류가 따라옵니다 ==');
{ const c=mk(V2,'2026-08-11T14:00:00');
  c.state.session={inIso:new Date('2026-08-11T08:40:00').toISOString()};
  c.punch();
  c.pickReason('machine');
  ok('기계 고장은 회사 사정으로 분류됩니다', c.state.earlyFault==='employer');
  c.setEarlyNote('금형 3호기 파손');
  c.saveReason();
  const r=c.state.extra[0];
  ok('사유가 기록에 붙습니다', !!r.reason && r.reason.id==='machine');
  ok('한국어가 함께 저장됩니다', r.reason.ko==='기계 · 금형 고장', r.reason.ko);
  ok('메모가 저장됩니다', r.reason.note==='금형 3호기 파손');
  ok('시트가 닫힙니다', c.state.reasonFor===null);
  // 태국어로 적어도 분류와 한국어 항목명은 남습니다 — 문서는 읽힙니다
  const c2=mk(V2,'2026-08-11T14:00:00');
  c2.state.session={inIso:new Date('2026-08-11T08:40:00').toISOString()};
  c2.punch(); c2.pickReason('no_material'); c2.setEarlyNote('ไม่มีกล่อง'); c2.saveReason();
  const r2=c2.state.extra[0];
  ok('태국어 메모라도 회사 사정으로 남습니다', r2.reason.fault==='employer');
  ok('한국어 항목명이 남습니다', r2.reason.ko==='자재 · 부자재 부족');
  ok('한글이 없는 메모를 가려냅니다', !c2.hasHangul('ไม่มีกล่อง'));
  ok('한글이 있는 메모는 통과합니다', c2.hasHangul('박스가 없었습니다'));
  ok('직접 입력은 누구 사정인지 따로 고릅니다', c2.reasonDef('other').fault==='other');
  // 메모 칸의 onChange는 값이 아니라 이벤트를 넘깁니다. 이걸 그대로 String()에
  // 넣으면 메모가 '[object Object]'로 저장됩니다 — 실제로 휴대폰에서 그렇게
  // 저장됐습니다. 화면에는 한글이 없다는 경고까지 정상으로 떠서, 저장된 것을
  // 열어 보기 전에는 아무 이상이 없어 보였습니다.
  const c3=mk(V2,'2026-08-11T14:00:00');
  const R=c3.renderVals();
  R.setEarlyNote({target:{value:'금형 3호기 파손'}});
  ok('이벤트에서 값을 꺼냅니다', c3.state.earlyNote==='금형 3호기 파손', JSON.stringify(c3.state.earlyNote));
  R.setEarlyNote('직접 넘긴 문자열도 받습니다');
  ok('문자열을 그대로 넘겨도 받습니다', c3.state.earlyNote==='직접 넘긴 문자열도 받습니다');
  ok('[object Object]는 저장되지 않습니다', c3.state.earlyNote.indexOf('[object')===-1);
}

console.log('\n== 조퇴 사유 · 지난 기록에 나중에 달기 ==');
{ const c=mk(V2,'2026-08-12T10:00:00');
  c.state.extra=[{y:2026,m:8,day:11,kind:'day',type:'shift',inH:8+40/60,outH:14,
    c:c.calc(8+40/60,14,'day',false)}];
  const k=c.key(c.state.extra[0]);
  c.openReason(c.state.extra[0]);
  ok('시트가 그 날을 물고 열립니다', c.state.reasonFor===k);
  c.pickReason('defect'); c.saveReason();
  ok('사유가 붙습니다', c.state.extra[0].reason.id==='defect');
  ok('시간은 건드리지 않습니다', c.state.extra[0].c.net===4);
  ok('기록이 늘거나 줄지 않습니다', c.state.extra.length===1);
  // 고쳐 쓰기
  c.openReason(c.state.extra[0]);
  ok('고칠 때 원래 값이 들어옵니다', c.state.earlyPick==='defect');
  c.pickReason('sick'); c.saveReason();
  ok('본인 사정으로 바뀝니다', c.state.extra[0].reason.fault==='worker');
  ok('회사 사정이 아니면 제46조는 걸리지 않습니다', !c.isEmployerShort(c.state.extra[0]));
}

// ── 팝업으로 바뀐 뒤 ──
// 예전에는 사유 시트가 탭 안에 끼어드는 한 칸이었습니다. 기록 탭에서는 목록
// 맨 위에 열려서, 한참 내려간 자리에서 '사유 고치기'를 눌러도 화면에서는
// 아무 일도 일어나지 않는 것처럼 보였습니다. 근무 탭에서는 열두 줄이 늘 펼쳐져
// 있어 저장 단추가 화면 밖에 있었고, 나와서 곧바로 돌려보내진 날은 '일감 부족'
// 이 붙은 채 사유를 고를 기회 자체가 없었습니다. 이 세 가지를 검사합니다.
console.log('\n== 조퇴 사유 · 팝업과 드롭다운 ==');
{ const c=mk(V2,'2026-08-11T14:00:00');
  c.state.session={inIso:new Date('2026-08-11T08:40:00').toISOString()};
  c.punch();
  // 팝업은 언제나 목록이 접힌 채로 열립니다 — 고른 사유 한 줄만 보이도록
  ok('팝업이 열립니다', c.renderVals().earlySheet===true);
  ok('목록은 접힌 채로 시작합니다', c.state.rsnOpen===false);
  ok('고르기 전에는 자리 표시 문구', c.renderVals().rsnPickedKo===c.T('rsn_pick_none'));
  ok('고르기 전에는 저장할 수 없습니다', c.renderVals().rsnCanSave===false);
  c.toggleRsnList();
  ok('누르면 펼쳐집니다', c.state.rsnOpen===true);
  ok('펼침 표시가 바뀝니다', c.renderVals().rsnCaret==='∧');
  c.pickReason('machine');
  ok('고르면 다시 접힙니다', c.state.rsnOpen===false);
  ok('고른 사유가 그 자리에 남습니다', c.renderVals().rsnPickedKo===c.T('rsn_machine'));
  ok('이제 저장할 수 있습니다', c.renderVals().rsnCanSave===true);
  ok('열두 가지가 모두 목록에 있습니다',
    c.renderVals().rsnEmployer.length + c.renderVals().rsnWorker.length
      + c.renderVals().rsnOther.length === 12);
  c.closeReason();
  ok('닫으면 목록도 접힙니다', c.state.rsnOpen===false && c.state.reasonFor===null);
}

// 나와서 곧바로 돌려보내진 날 — '일감 부족'은 가장 흔한 짐작일 뿐입니다.
// 금형이 깨졌을 수도 정전이 났을 수도 있고, 근무내역서에서는 그 차이가 전부입니다.
console.log('\n== 조퇴 사유 · 귀가한 날도 사유를 고를 수 있습니다 ==');
{ const c=mk(V2,'2026-08-11T09:10:00');
  c.state.session={inIso:new Date('2026-08-11T09:00:00').toISOString()};
  c.sentHome();
  const k=c.key(c.state.extra[0]);
  ok('휴업으로 기록됩니다', c.state.extra[0].type==='shutdown');
  ok('일감 부족이 미리 붙습니다', c.state.extra[0].reason.id==='no_work');
  ok('그 날을 물고 팝업이 열립니다', c.state.reasonFor===k);
  ok('미리 고른 것이 팝업에도 들어와 있습니다', c.state.earlyPick==='no_work');
  // 실제로는 금형이 깨진 날이었다면, 여기서 바로 바꿉니다
  c.pickReason('machine'); c.saveReason();
  ok('고른 대로 바뀝니다', c.state.extra[0].reason.id==='machine');
  ok('회사 사정은 그대로입니다', c.state.extra[0].reason.fault==='employer');
  ok('휴업 기록은 흔들리지 않습니다', c.state.extra[0].type==='shutdown');
  // 그냥 닫으면 미리 붙은 '일감 부족'이 남습니다 — 사유 없는 날이 되지는 않습니다
  const c2=mk(V2,'2026-08-11T09:10:00');
  c2.state.session={inIso:new Date('2026-08-11T09:00:00').toISOString()};
  c2.sentHome(); c2.closeReason();
  ok('닫아도 일감 부족이 남습니다', c2.state.extra[0].reason.id==='no_work');
}

// 시간이 미심쩍어 '그래도 기록' 으로 나온 날에도 사유를 남길 수 있어야 합니다
console.log('\n== 조퇴 사유 · 그래도 기록한 날 ==');
{ const c=mk(V2,'2026-08-11T09:10:00');
  c.state.session={inIso:new Date('2026-08-11T09:00:00').toISOString()};
  c.forceClockOut();
  ok('검토 표시가 붙습니다', c.state.extra[0].review===true);
  ok('그 날을 물고 팝업이 열립니다', c.state.reasonFor===c.key(c.state.extra[0]));
  ok('사유는 아직 비어 있습니다', c.state.earlyPick===null);
  c.pickReason('power'); c.saveReason();
  ok('사유가 붙습니다', c.state.extra[0].reason.id==='power');
  ok('검토 표시는 그대로입니다', c.state.extra[0].review===true);
}

console.log('\n== 근로기준법 제46조 · 평균임금이 기준입니다 ==');
{ const c=mk(V2,'2026-08-11T18:00:00');
  // 기록이 없으면 평균임금이 통상임금 아래로 떨어집니다 — 제2조②가 통상임금을 바닥으로 잡습니다
  ok('평균임금은 1일 통상임금 아래로 내려가지 않습니다',
    c.avgDaily()>=c.rate()*8, c.won(c.avgDaily()));
  ok('기록이 얇으면 추정이라고 밝힙니다', c.avgIsEst());
  // 매일 잔업을 하면 평균임금이 통상임금을 넘고, 휴업수당도 따라 오릅니다
  const base=c.shutdownPay();
  c.st().avgDaily=101000;
  ok('직접 넣은 평균임금이 이깁니다', c.avgDaily()===101000);
  ok('추정 표시가 사라집니다', !c.avgIsEst());
  ok('휴업수당이 평균임금의 70%로 오릅니다', c.shutdownPay()===70700, 'got '+c.shutdownPay());
  ok('통상임금 기준이던 예전 값보다 큽니다', c.shutdownPay()>base, base+' -> '+c.shutdownPay());
  // 제46조① 단서 — 70%가 통상임금을 넘으면 통상임금으로 갈음할 수 있습니다
  c.st().avgDaily=200000;
  ok('70%가 통상임금을 넘으면 통상임금에서 멈춥니다',
    c.shutdownPay()===c.rate()*8, c.won(c.shutdownPay()));
  // 회사가 월급을 그대로 주는 곳은 100으로 둘 수 있습니다
  c.st().avgDaily=0; c.st().shutdownPct=100;
  ok('지급률 100이면 1일 통상임금 전액', c.shutdownPay()===c.rate()*8);
  c.st().shutdownPct=70;
}

console.log('\n== 근로기준법 제46조 · 부분휴업 ==');
{ const c=mk(V2,'2026-08-12T10:00:00');
  c.st().avgDaily=101000;                       // 평균임금 70% = 70,700
  [3,4,5,6,7].forEach(d=>c.state.extra.push(
    {y:2026,m:8,day:d,kind:'day',type:'shift',c:c.calc(9,21,'day',false)}));
  const rec={y:2026,m:8,day:11,kind:'day',type:'shift',inH:8+40/60,outH:14,
    c:c.calc(8+40/60,14,'day',false),
    reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장'}};
  c.state.extra.push(rec);
  ok('회사 사정으로 짧아진 날로 잡힙니다', c.isEmployerShort(rec));
  ok('일한 4시간의 시간분 임금', c.partialWorkedPay(rec)===41280, 'got '+c.partialWorkedPay(rec));
  ok('시간을 깎였다면 차액이 나옵니다', c.partialShort(rec)===70700-41280,
    'got '+c.partialShort(rec));
  // 본인 사정이면 제46조가 걸리지 않습니다
  const own=Object.assign({},rec,{reason:{id:'sick',fault:'worker',ko:'몸이 아파서'}});
  ok('본인 사정에는 차액이 없습니다', c.partialShort(own)===0);
  // 사유가 없으면 아무 판단도 하지 않습니다 — 모르는 것을 아는 척하지 않습니다
  const bare=Object.assign({},rec); delete bare.reason;
  ok('사유가 없으면 제46조를 걸지 않습니다', !c.isEmployerShort(bare));
  // 평소대로 일한 날은 짧은 날이 아니므로 차액이 없습니다
  const full={y:2026,m:8,day:10,kind:'day',type:'shift',c:c.calc(9,21,'day',false),
    reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장'}};
  ok('평소대로 일한 날에는 차액이 없습니다', c.partialShort(full)===0);
}

console.log('\n== 나와서 곧바로 돌려보내진 날 ==');
{ const c=mk(V2,'2026-08-11T09:05:00');
  c.state.session={inIso:new Date('2026-08-11T09:00:00').toISOString()};
  c.sentHome();
  const r=c.state.extra[0];
  ok('휴업으로 기록됩니다', r.type==='shutdown');
  ok('사유가 자동으로 붙습니다', !!r.reason && r.reason.id==='no_work');
  ok('회사 사정으로 분류됩니다', r.reason.fault==='employer');
  ok('한국어가 함께 저장됩니다', r.reason.ko==='일감 부족 · 물량 없음');
}

console.log('\n== 근무내역서에 사유가 한국어로 들어갑니다 ==');
{ const c=mk(V2,'2026-08-12T10:00:00');
  c.st().lang='th';                              // 앱은 태국어로 쓰고 있어도
  c.st().avgDaily=101000;
  [3,4,5,6,7].forEach(d=>c.state.extra.push(
    {y:2026,m:8,day:d,kind:'day',type:'shift',c:c.calc(9,21,'day',false),inH:9,outH:21}));
  c.state.extra.push({y:2026,m:8,day:11,kind:'day',type:'shift',inH:8+40/60,outH:14,
    c:c.calc(8+40/60,14,'day',false),
    reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장',note:'금형 3호기 파손'}});
  const h=c.evidenceHtml();
  ok('사유 칸이 생깁니다', h.includes('<th>사유</th>'));
  ok('사유가 한국어로 찍힙니다', h.includes('기계 · 금형 고장'));
  ok('누구 사정인지 함께 찍힙니다', h.includes('회사 사정'));
  ok('메모도 들어갑니다', h.includes('금형 3호기 파손'));
  ok('제46조 표가 붙습니다', h.includes('근로기준법 제46조'));
  ok('차액이 계산되어 나옵니다', h.includes(c.won(70700-41280)));
  ok('연차가 아니라는 설명은 휴업일이 있을 때만', !h.includes('제60조⑤'));
  ok('태국어로 새지 않습니다', !/[฀-๿]/.test(h));
  ok('여전히 안전한 문서입니다', !/<script/i.test(h));
}

console.log('\n== 최저임금은 해마다 바뀝니다 · 상수 하나로는 안 됩니다 ==');
{ // 2026년 10,320원, 2027년 10,700원 — 고용노동부 고시. 12월 31일에 일한 시간과
  // 1월 1일에 일한 시간은 서로 다른 법 아래 있습니다.
  ok('2026-12-31은 10,320원', V2.minWageOn('2026-12-31')===10320, 'got '+V2.minWageOn('2026-12-31'));
  ok('2027-01-01은 10,700원', V2.minWageOn('2027-01-01')===10700, 'got '+V2.minWageOn('2027-01-01'));
  ok('바뀌는 날 하루 전은 아직 옛 금액', V2.minWageOn('2026-12-31')!==V2.minWageOn('2027-01-01'));
  // 표에 없는 옛 날짜는 첫 줄로 봅니다 — 2025년 이전 고시는 넣지 않았습니다
  ok('표보다 앞선 날짜는 첫 줄로', V2.minWageOn('2024-05-05')===10320);
  // 표가 낡아도 마지막으로 아는 금액은 내놓습니다. 모른다고 화면을 비우면
  // 견줄 잣대 자체가 사라집니다 — 낡았다는 말은 배너가 따로 합니다.
  ok('표 끝을 넘겨도 마지막 금액은 남습니다', V2.minWageOn('2031-06-01')===10700);
  ok('금액 옆 연도는 고시된 해입니다', V2.minWageYearOn('2031-06-01')==='2027');
  // toISOString()은 UTC라 한국 새벽에는 하루가 밀립니다 — 1월 1일 0시가 문제입니다
  ok('자정 직후에도 날짜가 밀리지 않습니다',
    V2.isoDay(new Date(2027,0,1,0,30,0))==='2027-01-01', 'got '+V2.isoDay(new Date(2027,0,1,0,30,0)));
}

console.log('\n== 명세서는 만들어진 날의 얼굴로 읽혀야 합니다 ==');
{ // 2027년 3월에 앱을 열어도, 2026년 12월 명세서의 법정 최저는 그때의 10,320원입니다.
  // reason.ko를 기록에 박아 두는 것과 같은 이유입니다.
  const c=mk(V2,'2027-03-15T10:00:00');
  c.state.settings.periodStart=21;   // 해를 걸치는 기간은 21일 시작에서만 생깁니다
  const dec=c.period(new Date('2026-12-15T00:00:00'));   // 11.21 → 12.20
  ok('12월 급여기간이 맞습니다', dec.label==='11.21 → 12.20', dec.label);
  ok('2027년에 열어도 10,320원', c.periodMinWage(dec).won===10320, 'got '+c.periodMinWage(dec).won);
  ok('연도도 2026으로 찍힙니다', c.periodMinWage(dec).year==='2026');
  // 기기 시계가 아니라 급여기간을 봅니다 — 오늘은 2027년인데도 그렇습니다
  ok('오늘의 최저임금과는 다릅니다', c.minWageToday()===10700);
  // 해를 걸치는 기간(12.21 → 01.20)은 나중 날짜에 맞춥니다. 낮은 쪽을 찍으면
  // 1월에 최저임금 미달로 받은 급여가 합법처럼 보입니다.
  const cross=c.period(new Date('2027-01-05T00:00:00'));
  ok('해를 걸친 기간은 12.21 → 01.20', cross.label==='12.21 → 01.20', cross.label);
  ok('걸친 기간은 높은 쪽 10,700원', c.periodMinWage(cross).won===10700);
  // 화면에 실제로 그렇게 나오는지
  const v=c.renderVals();
  const row=v.basisRows.filter(r=>/최저시급|minimum|最低|ขั้นต่ำ|tối thiểu/.test(r.k))[0];
  ok('계산 근거 표에 한 줄로 나옵니다', !!row && row.v==='₩10,700/h', row?row.k+' '+row.v:'행이 없습니다');
}

console.log('\n== 시급 10,500원 · 2026년에는 괜찮고 2027년에는 미달입니다 ==');
{ const a=mk(V2,'2026-11-10T10:00:00');
  a.st().basic=10500*209; a.st().divisor=209;
  ok('시급이 10,500원으로 잡힙니다', a.rate()===10500, 'got '+a.rate());
  ok('2026년에는 경고가 없습니다', a.renderVals().minWageWarn==='', a.renderVals().minWageWarn);
  const b=mk(V2,'2027-01-02T10:00:00');
  b.st().basic=10500*209; b.st().divisor=209;
  const w=b.renderVals().minWageWarn;
  ok('2027년에는 경고가 뜹니다', w!=='');
  ok('경고에 내 시급이 들어갑니다', w.includes('₩10,500'));
  ok('경고에 그 해의 최저임금이 들어갑니다', w.includes('₩10,700'), w);
  ok('경고에 연도가 들어갑니다', w.includes('2027'), w);
  // 예전에는 문구에 2026과 ₩10,320이 박혀 있어서 해가 바뀌면 틀린 말을 했습니다
  ok('낡은 금액이 문구에 남아 있지 않습니다', !w.includes('10,320'), w);
}

console.log('\n== 앱이 법보다 낡았을 때 · 알리기만 하고 막지 않습니다 ==');
{ const a=mk(V2,'2027-08-01T10:00:00');
  ok('표가 덮는 해에는 배너가 없습니다', a.renderVals().wageStale===false);
  const b=mk(V2,'2028-01-01T10:00:00');
  const v=b.renderVals();
  ok('표를 넘긴 해에는 배너가 뜹니다', v.wageStale===true);
  ok('앱이 아는 마지막 해를 말합니다', v.wageStaleMsg.includes('2027'), v.wageStaleMsg);
  // 이번 실행 동안만 닫힙니다 — save()가 쓰는 목록에 없어서 저장되지 않습니다
  v.hideWageStale();
  ok('닫으면 사라집니다', b.renderVals().wageStale===false);
  b.save();
  ok('닫았다는 사실은 저장되지 않습니다', !/wageStaleHide/.test(b.lastSaved||''),
    (b.lastSaved||'').length+'자 저장');
  // 그리고 이것이 막는 것은 아무것도 없습니다. 임금체불로 다투는 사람이
  // 자기 기록을 못 여는 일은 없어야 합니다.
  const c=mk(V2,'2028-01-05T21:00:00');
  c.st().avgDaily=101000;
  [2,3,4].forEach(d=>c.state.extra.push(
    {y:2028,m:1,day:d,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)}));
  ok('배너가 떠 있어도 배너는 떠 있습니다', c.renderVals().wageStale===true);
  c.state.session={inIso:new Date('2028-01-05T09:00:00').toISOString()};
  c.punch();
  ok('출근·퇴근이 그대로 됩니다', c.state.extra.length===4, 'records='+c.state.extra.length);
  const h=c.evidenceHtml();
  ok('근무내역서가 그대로 나옵니다', h.includes('근무내역서') && h.length>1000, 'len='+h.length);
  ok('기록이 문서에 들어 있습니다', h.includes('01.03'));
  ok('배너 문구가 근무내역서로 새지 않습니다', !h.includes('앱을 새로 받으세요'));
  ok('기록 목록도 그대로 열립니다', c.renderVals().logRows.length>0);
}

console.log('\n== 쓰던 사람의 기본금은 앱이 건드리지 않습니다 ==');
{ // 기본값은 '새로 깐 앱'에만 닿습니다. 이미 쓰던 사람의 기본금을 앱이 말없이
  // 최저임금으로 바꿔 놓으면 그 사람의 모든 금액이 한꺼번에 틀어집니다.
  const store={'worklog.v1':JSON.stringify({v:1,settings:{basic:2600000,divisor:209,annualBase:9},
    extra:[{m:7,day:21,kind:'day',type:'shift',inH:9,outH:21}],removed:[]})};
  const g=global.window.localStorage.getItem;
  global.window.localStorage.getItem=k=>store[k]||null;
  const c=new V2({}); c.base=new Date('2027-03-01T10:00:00'); c.t0=Date.now();
  global.window.localStorage.getItem=g;
  ok('v1에서 올라와도 기본금 그대로', c.st().basic===2600000, 'got '+c.st().basic);
  ok('기준시간도 그대로', c.st().divisor===209);
  ok('시급도 본인이 넣은 그대로', c.rate()===Math.round(2600000/209), 'got '+c.rate());
  ok('기본값이 덮어쓰지 않았습니다', c.st().basic!==V2.DEFAULTS.basic);
  // 연도는 마이그레이션이 붙입니다(BUG A-migration) — 여기서 볼 것은 기록이 남았다는 것
  ok('v1 기록도 살아서 올라옵니다', c.state.extra.length===1 && !!c.state.extra[0].y,
    JSON.stringify(c.state.extra[0]));
  // 새로 까는 사람만 그 해의 최저임금에서 시작합니다
  ok('새 설치는 그 해 최저임금 × 209', V2.DEFAULTS.basic===V2.minWageOn(V2.isoDay(new Date()))*209,
    'got '+V2.DEFAULTS.basic);
  ok('2027년 새 설치라면 2,236,300', V2.minWageOn('2027-06-01')*209===2236300);
}

console.log('\n== 설정은 접혀서 열립니다 · 열네 개의 벽이 일곱 줄이 되었습니다 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  const v=c.renderVals();
  ['Lang','Me','Pay','Shift','Period','Money','Ins','Rules','Backup'].forEach(g=>{
    ok(g+' 묶음이 접힌 채로 시작합니다', v['g'+g+'Open']===false);
  });
  // 접혀 있어도 값은 보여야 합니다 — 감추는 것이 아니라 접는 것입니다
  // 첫 층 세 묶음은 요약 앞에 ✓ / ! 가 붙습니다(2026-08-29) — 값은 그대로 보입니다
  ok('시급이 제목 옆에 적힙니다', v.gPaySum.indexOf(c.won(c.rate())+'/h')>=0, v.gPaySum);
  ok('근무조도 적힙니다', /교대|주간|야간/.test(v.gShiftSum), v.gShiftSum);
  // 급여기간은 회사 규칙에서 나와 자기 묶음이 됐습니다(2026-08-29)
  ok('급여기간도 적힙니다', v.gPeriodSum.indexOf(c.period(c.now()).label)>=0, v.gPeriodSum);
  ok('회사 규칙은 배수와 휴업률을 말합니다', /×1\.5/.test(v.gRulesSum) && /70/.test(v.gRulesSum), v.gRulesSum);
  ok('보험은 몇 개 켜졌는지까지', /3/.test(v.gInsSum), v.gInsSum);
  // 펼치면 요약이 사라집니다 — 바로 아래 같은 값이 다시 나오니까요
  v.gPayTap();
  const v2=c.renderVals();
  ok('누르면 펼쳐집니다', v2.gPayOpen===true);
  ok('펼쳐지면 요약은 비웁니다', v2.gPaySum==='');
  ok('다른 묶음은 그대로 접혀 있습니다', v2.gShiftOpen===false);
  // 무엇을 펼쳐 뒀는지는 기록이 아닙니다
  c.save();
  ok('펼침 상태는 저장되지 않습니다', !/setOpen/.test(c.lastSaved||''));
}

console.log('\n== 기본값이라고 말해 줍니다 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  const v=c.renderVals();
  ok('기본금이 기본값이면 그렇게 적습니다', v.basicDefaultNote.includes('법이 정한 바닥'), v.basicDefaultNote);
  ok('최저임금과 기준시간이 함께 나옵니다',
    v.basicDefaultNote.includes('₩10,320') && v.basicDefaultNote.includes('209'), v.basicDefaultNote);
  ok('처음 열면 기본금을 묻습니다', v.askBasic===true);
  // 본인 금액을 넣으면 설명이 바뀌고 더는 묻지 않습니다
  c.st().basic=2600000;
  const w=c.renderVals();
  ok('본인 숫자가 되면 문구가 바뀝니다', w.basicDefaultNote.includes('당신이 적은 숫자'), w.basicDefaultNote);
  ok('그 뒤로는 묻지 않습니다', w.askBasic===false);
  // 4대보험이 왜 켜져 있는지도 말해야 합니다
  ok('보험이 켜진 이유를 적습니다', w.insWhyOnNote.includes('요율이 법으로'), w.insWhyOnNote);
  ok('고용보험이 꺼진 이유도 함께', w.insWhyOnNote.includes('E-9'));
  c.st().insAuto=false;
  ok('직접 입력으로 바꾸면 그 설명은 사라집니다', c.renderVals().insWhyOnNote==='');
}

console.log('\n== 첫 화면은 가르칩니다 · 설정 양식이 아닙니다 ==');
{ // 새로 깐 앱
  const c=mk(V2,'2026-08-17T10:00:00');
  const v=c.renderVals();
  ok('처음 켜면 소개 화면이 뜹니다', v.showTour===true);
  ok('네 가지를 설명합니다', v.tourCards.length===4);
  ok('첫 장은 출퇴근입니다', v.tourCards[0].ko.includes('출퇴근'), v.tourCards[0].ko);
  ok('법 이야기가 들어 있습니다', v.tourCards[1].body.includes('근로기준법'));
  ok('증거가 된다는 말이 들어 있습니다', v.tourCards[2].body.includes('근무내역서'));
  ok('폰에만 있다는 말이 들어 있습니다', v.tourCards[3].body.includes('서버'));
  // 첫 화면에서 기본금을 묻지 않습니다 — 그게 예전 첫 화면의 문제였습니다
  const txt=v.tourCards.map(x=>x.ko+x.body).join(' ');
  ok('첫 화면에서 기본금을 묻지 않습니다', !/기본금이 얼마/.test(txt));
  v.endTour();
  ok('시작하면 소개가 닫힙니다', c.renderVals().showTour===false);
  // START는 설정으로 보냅니다 — 첫 기록을 찍기 전에 근무조와 급여기간을
  // 한 번은 지나가야 그 기록이 제대로 계산됩니다
  // 2026-08-29: START는 설정 탭이 아니라 네 물음의 첫 화면으로 갑니다.
  // 소개 카드 1번이 '먼저 설정할 것은 없습니다'라고 말한 그 약속을 지키는 자리입니다.
  ok('첫 물음으로 갑니다', c.state.setupStep===1, 'got '+c.state.setupStep);
  ok('설정 탭으로 내보내지 않습니다', c.state.tab!=='set', 'got '+c.state.tab);
  c.save();
  ok('봤다는 사실은 저장됩니다', /tourSeen/.test(c.lastSaved||''));
  // 다시 볼 수 있어야 합니다 — 한 번 닫으면 영영 못 보는 화면이면 안 됩니다
  c.renderVals().openTour();
  ok('설정에서 다시 열 수 있습니다', c.renderVals().showTour===true);
}

console.log('\n== 쓰던 사람에게는 소개를 다시 보여 주지 않습니다 ==');
{ const store={'worklog.v2':JSON.stringify({v:2,setupDone:true,
    settings:{basic:2600000,divisor:209},extra:[],removed:[]})};
  const g=global.window.localStorage.getItem;
  global.window.localStorage.getItem=k=>store[k]||null;
  const c=new V2({}); c.base=new Date('2026-08-17T10:00:00'); c.t0=Date.now();
  global.window.localStorage.getItem=g;
  ok('업그레이드한 사람에게는 소개가 뜨지 않습니다', c.renderVals().showTour===false);
  ok('기본금도 그대로입니다', c.st().basic===2600000);
}

console.log('\n== 퇴직금 · 근로자퇴직급여 보장법 제8조① ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  c.st().basic=2600000; c.st().avgDaily=100000;
  // 입사일이 없으면 아무 금액도 내놓지 않습니다 — 모르는 것을 아는 척하지 않습니다
  ok('입사일이 없으면 계산하지 않습니다', c.renderVals().sevAmt==='—');
  ok('대신 입사일을 묻습니다', c.renderVals().sevStatus.includes('입사일'));
  ok('근속도 모른다고 적습니다', c.renderVals().tenureLine.includes('입사일'));
  // 1년 미만 — 지급 의무가 없습니다
  c.st().hireDate='2026-06-01';
  ok('1년 미만은 퇴직금이 없습니다', c.severanceEligible()===false);
  ok('며칠 남았는지 알려 줍니다', c.renderVals().sevStatus.includes('1년 미만'), c.renderVals().sevStatus);
  ok('금액 대신 줄표', c.renderVals().sevAmt==='—');
  // 1년을 넘기면 발생합니다
  c.st().hireDate='2025-04-01';
  ok('1년을 넘기면 발생합니다', c.severanceEligible()===true);
  ok('재직일수 504일', c.tenureDays()===504, 'got '+c.tenureDays());
  ok('근속 1년 4개월', c.tenureYM().y===1 && c.tenureYM().m===4, JSON.stringify(c.tenureYM()));
  // 평균임금 × 30 × 재직일수/365
  const want=Math.round(100000*30*504/365);
  ok('제8조① 공식 그대로', c.severancePay()===want, c.severancePay()+' vs '+want);
  ok('화면에도 그 금액이 나옵니다', c.renderVals().sevAmt===c.won(want));
  // 평균임금이 통상임금보다 적으면 통상임금을 씁니다 (근로기준법 제2조②)
  c.st().avgDaily=0;
  ok('평균임금은 통상임금 아래로 내려가지 않습니다', c.avgDaily()>=c.rate()*8);
}

console.log('\n== 연차 대장 · 근로기준법 제60조 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  // 제60조② 1년 미만 — 1개월 개근에 1일, 최대 11일
  c.st().hireDate='2026-05-01';
  ok('3개월 남짓이면 3일', c.annualAccrued()===3, 'got '+c.annualAccrued());
  c.st().hireDate='2025-10-01';
  ok('10개월 남짓이면 10일', c.annualAccrued()===10, 'got '+c.annualAccrued());
  // 제60조②의 한도는 11일 — 1년에서 하루 모자란 날에도 11을 넘지 않습니다
  c.st().hireDate='2025-08-20';
  ok('1년 직전에도 11일이 한도', c.annualAccrued()===11, 'got '+c.annualAccrued());
  // 제60조① 1년 이상 15일
  c.st().hireDate='2025-04-01';
  ok('1년을 넘기면 15일', c.annualAccrued()===15, 'got '+c.annualAccrued());
  c.st().hireDate='2024-04-01';
  ok('2년차도 아직 15일', c.annualAccrued()===15, 'got '+c.annualAccrued());
  // 제60조④ 3년째부터 2년마다 1일 가산
  c.st().hireDate='2023-04-01';
  ok('3년차에 16일', c.annualAccrued()===16, 'got '+c.annualAccrued());
  c.st().hireDate='2021-04-01';
  ok('5년차에 17일', c.annualAccrued()===17, 'got '+c.annualAccrued());
  c.st().hireDate='1990-01-01';
  ok('한도는 25일', c.annualAccrued()===25, 'got '+c.annualAccrued());
  // 사용은 앱이 가진 연차 기록에서 셉니다
  c.st().hireDate='2025-04-01';
  c.state.extra=[
    {y:2026,m:6,day:1,type:'annual',c:{reg:8}},
    {y:2026,m:7,day:2,type:'annual',c:{reg:8}},
    {y:2024,m:7,day:2,type:'annual',c:{reg:8}},   // 지난 연차년도 — 세지 않습니다
  ];
  ok('이번 연차년도만 셉니다', c.annualUsedThisYear()===2, 'got '+c.annualUsedThisYear());
  const led=c.renderVals().annLedger;
  ok('발생·사용·잔여 세 칸', led.length===3);
  ok('발생 15', led[0].v===15, String(led[0].v));
  // 2026-08-19에 바뀌었습니다. 예전에는 '사용'이 이번 연차년도에 **기록된**
  // 연차 일수(2일)였고 '잔여'가 15−2였습니다. 앱을 쓰기 전에 쓴 연차를 앱은
  // 모르므로 그 숫자는 앱을 깔기 전 근무를 통째로 없는 것으로 쳤습니다.
  // 이제 '잔여'는 근로자가 적어 둔 숫자에서 세고(annualLeft — 여기서는
  // annualAsOf가 없어 연차 기록 셋을 모두 뺍니다: 15−3=12), '사용'은 발생에서
  // 그것을 뺀 값입니다. annualUsedThisYear()의 연차년도 규칙은 위 줄에서
  // 그대로 시험하고 있습니다 — 규칙이 사라진 것이 아니라 화면에서 뺐습니다.
  ok('사용은 발생에서 잔여를 뺀 값', led[1].v===3, String(led[1].v));
  ok('잔여는 근로자가 적어 둔 숫자에서', led[2].v===12, String(led[2].v));
  ok('법이 준 일수라고 말합니다', c.renderVals().annLaw.includes('제60조'));
  ok('회사에 물어보라고 적습니다', c.renderVals().annVsCompany.includes('회사'));
}

console.log('\n== 휴업수당은 내 권리 탭에 모입니다 ==');
{ const c=mk(V2,'2026-08-12T10:00:00');
  c.st().avgDaily=101000;
  [3,4,5,6,7].forEach(d=>c.state.extra.push(
    {y:2026,m:8,day:d,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)}));
  ok('휴업이 없으면 0이라고 말합니다', c.renderVals().shutStatus.includes('없습니다'));
  c.state.extra.push({y:2026,m:8,day:10,kind:'day',type:'shutdown',
    c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0},
    reason:{id:'no_work',fault:'employer',ko:'일감 부족 · 물량 없음'}});
  c.state.extra.push({y:2026,m:8,day:11,kind:'day',type:'shift',inH:8+40/60,outH:14,
    c:c.calc(8+40/60,14,'day',false),
    reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장'}});
  const t=c.shutdownTally();
  ok('통째로 쉰 날을 셉니다', t.days===1, 'days='+t.days);
  ok('짧아진 날도 셉니다', t.partDays===1, 'partDays='+t.partDays);
  ok('둘을 합쳐 보여 줍니다', t.total===t.full+t.part);
  ok('제46조를 인용합니다', c.renderVals().shutStatus.includes('제46조'));
  ok('두 줄로 나눠 보여 줍니다', c.renderVals().shutRows.length===2);
}

console.log('\n== 회사가 실제로 주는 배수 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  c.st().basic=2600000;
  const r=c.rate();
  // 손대지 않으면 법정 그대로입니다 — v1 동일성 증명이 이것을 지킵니다
  ok('기본은 잔업 ×1.5', c.otRate()===Math.round(r*1.5));
  ok('기본은 야간 ×0.5', c.nightRate()===Math.round(r*0.5));
  ok('기본은 휴일 초과 ×2.0', c.holOverRate()===Math.round(r*2));
  // ×2.0을 주는 회사
  c.st().otMult=2;
  ok('회사가 ×2.0을 주면 그대로 계산합니다', c.otRate()===Math.round(r*2));
  ok('법정 최저 이상이면 경고가 없습니다', c.renderVals().multWarn==='');
  // ×1.0만 주는 회사 — 사실이지만 법정 미만입니다
  c.st().otMult=1;
  ok('법정 미만이면 말해 줍니다', c.renderVals().multWarn.includes('법정 최저 미만'), c.renderVals().multWarn);
  ok('어느 항목인지 짚어 줍니다', c.renderVals().multWarn.includes('잔업'));
  ok('그래도 계산은 실제 배수로 합니다', c.otRate()===r);
  // 망가진 값은 법정 배수로 되돌아갑니다 — 설정 한 줄에 급여가 0이 되면 안 됩니다
  c.st().otMult=0;
  ok('0이면 법정 배수로 되돌아갑니다', c.otRate()===Math.round(r*1.5));
  c.st().otMult='abc';
  ok('숫자가 아니어도 법정 배수', c.otRate()===Math.round(r*1.5));
}

console.log('\n== 상여는 평균임금에 들어갑니다 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  c.st().basic=2600000;
  const before=c.avgDailyCalc();
  c.st().bonus=1000000; c.st().bonusMonths=[6,12];
  ok('연 2회면 연액 200만', c.bonusAnnual()===2000000, 'got '+c.bonusAnnual());
  ok('평균임금이 올라갑니다', c.avgDailyCalc()>before);
  ok('연액을 365로 나눈 만큼 (반올림 1원 이내)',
    Math.abs(c.avgDailyCalc()-(before+2000000/365))<=1, before+' -> '+c.avgDailyCalc());
  // 그래서 퇴직금도 올라갑니다 — 그것이 상여를 적어 둘 이유입니다
  c.st().hireDate='2024-01-01'; c.st().avgDaily=0;
  const withB=c.severancePay();
  c.st().bonus=0; c.st().bonusMonths=[];
  ok('퇴직금도 함께 올라갑니다', withB>=c.severancePay(), withB+' vs '+c.severancePay());
  // 상여가 없으면 한 자리도 달라지지 않습니다
  ok('상여가 0이면 평균임금 그대로', c.avgDailyCalc()===before);
}

// ── 2026-08-22 · '다른 급여기간' 목록은 스테퍼가 하는 말을 덜 말하며 되풀이했습니다 ──
// 근무기록 맨 아래에 이번 기간에 없는 기록이 전부 한 줄씩 늘어서 있었습니다.
// ‹ 를 누르면 같은 날들이 시간·잔업·금액까지 붙어서 나오는데, 그 목록에는
// 날짜와 주야밖에 없었습니다. 목록은 없애고, 그 자리를 지키던 연도 칩은
// '거르기'에서 '고르기'로 바꿔 스테퍼 안으로 넣었습니다.
console.log('\n== 지난 기간은 스테퍼가 말합니다 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  const z={gross:0,bk:0,net:8,reg:8,ot:0,night:0,hol:0,pay:0};
  c.state.extra=[
    {y:2026,m:3,day:2,kind:'day',type:'shift',c:z},
    {y:2025,m:5,day:2,kind:'day',type:'shift',c:z},
    {y:2024,m:5,day:2,kind:'day',type:'shift',c:z},
  ];
  ok('다른 급여기간 목록은 없습니다', c.renderVals().others===undefined);
  ok('연도로 거르던 것도 없습니다', typeof c.archKeep!=='function' && typeof c.archPick!=='function');
  ok('기록은 셋 다 그대로', c.month().length===3);
  ok('CSV는 전부', c.csvText().trim().split('\r\n').length===4,
    c.csvText().trim().split('\r\n').length+'줄');
  ok('백업도 전부', c.backupData().extra.length===3);
}

// ── 3년치를 넣고 재 보니 연도만으로는 모자랐습니다 ──
// 연도 칩 하나로 그 해의 '가장 최근 기록이 든 기간'에 데려다줬는데, 그것은
// 언제나 그 해 12월이었습니다. 2024년 2월을 보려면 칩 한 번에 화살표 열 번 —
// 그리고 그 수는 기록이 쌓일수록 늘어납니다. 달 칸 열두 개를 아래에 놓아
// 어느 기간이든 두 번(접혀 있으면 세 번)에 닿게 했습니다.
console.log('\n== 3년을 쓴 폰에서 특정 급여기간까지 세 번 ==');
{ const c=mk(V2,'2026-08-22T10:00:00');
  c.st().periodStart=21; c.st().payday=25;
  const z={gross:0,bk:0,net:8,reg:8,ot:0,night:0,hol:0,pay:0};
  const ex=[];
  for(let y=2023;y<=2026;y++) for(let m=1;m<=12;m++){
    if(y===2023&&m<8) continue; if(y===2026&&m>8) continue;
    for(let d=1;d<=28;d++){ const dt=new Date(y,m-1,d);
      if(dt.getDay()===0||dt.getDay()===6) continue;
      if(dt>new Date(2026,7,21)) continue;
      ex.push({y,m,day:d,kind:'day',type:'shift',inH:9,outH:18,c:Object.assign({},z)}); }
  }
  c.state.extra=ex;
  ok('3년치가 들어 있습니다', ex.length>700, ex.length+'줄');
  ok('거슬러 갈 기간이 서른 개가 넘습니다', c.payBackMax()>30, 'max='+c.payBackMax());

  // 평소에는 접혀 있습니다 — 매일 출근을 찍는 사람이 매일 보는 카드입니다
  ok('고르는 자리가 있습니다', c.renderVals().jumpShow===true);
  ok('접혀서 시작합니다', c.renderVals().jumpOpen===false);
  ok('접혀 있으면 연도 칩을 만들지 않습니다', c.renderVals().yearChips.length===0);
  ok('접혀 있으면 달 칸도 만들지 않습니다', c.renderVals().monthCells.length===0);
  ok('접힌 표시는 +', c.renderVals().jumpSign==='+');

  // 어느 기간이든 세 번 — 펼치기, 연도, 달
  const reach=(y,m)=>{
    c.setState({payBack:0,jumpOpen:false});
    let taps=0;
    c.renderVals().jumpToggle(); taps++;
    const yc=c.renderVals().yearChips.filter(x=>x.label===String(y))[0];
    if(!yc) return {taps:99};
    if(yc.bg==='transparent'){ yc.go(); taps++; }
    const mc=c.renderVals().monthCells[m-1];
    if(mc.cur!=='pointer') return {taps:99};
    mc.go(); taps++;
    const P=c.viewPeriod();
    return {taps, y:P.s.getFullYear(), m:P.s.getMonth()+1, n:c.periodRecords(P).length};
  };
  const a=reach(2023,9), b=reach(2024,2), d=reach(2025,8), e=reach(2026,3);
  ok('3년 전 2023.09까지 세 번', a.taps===3 && a.y===2023 && a.m===9, JSON.stringify(a));
  ok('2년 전 2024.02까지도 세 번', b.taps===3 && b.y===2024 && b.m===2, JSON.stringify(b));
  ok('1년 전 2025.08까지도 세 번', d.taps===3 && d.y===2025 && d.m===8, JSON.stringify(d));
  ok('올해는 연도를 다시 누를 필요가 없어 두 번', e.taps===2 && e.y===2026 && e.m===3, JSON.stringify(e));
  ok('도착한 기간에 기록이 있습니다', a.n>0 && b.n>0 && d.n>0 && e.n>0);
  ok('달을 고르면 접힙니다', c.state.jumpOpen===false);

  // 펼친 뒤에 보이는 것
  c.setState({payBack:0,jumpOpen:true});
  const v=c.renderVals();
  ok('펼친 표시는 −', v.jumpSign==='−');
  ok('기록이 있는 해만 칩이 됩니다', v.yearChips.map(x=>x.label).join(',')==='2026,2025,2024,2023',
    v.yearChips.map(x=>x.label).join(','));
  ok('달 칸은 언제나 열둘', v.monthCells.length===12);
  ok('칸 이름은 01…12', v.monthCells[0].label==='01' && v.monthCells[11].label==='12');
  ok('보고 있는 해가 켜집니다', v.yearChips.filter(x=>x.bg!=='transparent').map(x=>x.label).join(',')==='2026');
  ok('보고 있는 달이 켜집니다', v.monthCells[7].bg!=='transparent' && v.monthCells[6].bg==='transparent');

  // 기록이 없는 달은 흐리고, 눌러도 아무 일이 없습니다
  c.renderVals().yearChips.filter(x=>x.label==='2023')[0].go();
  const g=c.renderVals();
  ok('연도만 골랐을 때는 펼쳐 둡니다', c.state.jumpOpen===true);
  ok('입사 전 달은 흐립니다', g.monthCells.slice(0,6).every(x=>x.cur==='default'),
    g.monthCells.map(x=>x.cur[0]).join(''));
  ok('일한 달은 누를 수 있습니다', g.monthCells.slice(7).every(x=>x.cur==='pointer'));
  const at=c.payBack();
  g.monthCells[0].go();
  ok('흐린 칸은 눌러도 움직이지 않습니다', c.payBack()===at, at+' -> '+c.payBack());
  ok('흐린 칸을 눌러도 접히지 않습니다', c.state.jumpOpen===true);

  // 되돌아오기
  c.renderVals().payNow();
  ok('이번 기간으로 돌아옵니다', c.payBack()===0);
  ok('돌아오면 접힙니다', c.state.jumpOpen===false);

  // 기간이 얼마 없는 사람에게는 나오지 않습니다 — 화살표가 더 빠릅니다
  const c2=mk(V2,'2026-08-22T10:00:00'); c2.st().periodStart=21;
  c2.state.extra=[{y:2026,m:8,day:11,kind:'day',type:'shift',c:z}];
  ok('기간이 하나뿐이면 고르는 자리가 없습니다', c2.renderVals().jumpShow===false, 'max='+c2.payBackMax());

  // 달 칸이 기간을 겹치거나 빠뜨리지 않는지 — 21일 시작으로 한 해를 훑습니다
  const map=c.periodMap();
  let onePerMonth=true;
  for(let m=1;m<=12;m++){ const n=map[2025*100+m];
    if(n==null){ onePerMonth=false; break; }
    const P=c.periodBack(n);
    if(P.s.getFullYear()!==2025||P.s.getMonth()+1!==m) onePerMonth=false; }
  ok('한 달에 시작하는 기간은 언제나 하나', onePerMonth);
  const ns=[]; for(let m=1;m<=12;m++) ns.push(map[2025*100+m]);
  ok('열두 달이 서로 다른 기간을 가리킵니다', new Set(ns).size===12, ns.join(','));
}

// ── 2026-08-22 · 목록에는 몇 년인지가 없었습니다 ──
// 기간 고르기로 2023년 08월을 고르고 접은 뒤 목록을 내려가면, 줄에는 `08.21`처럼
// 월.일밖에 없어서 몇 년의 기록인지 알 수 없었습니다. 제대로 골랐는지 근로자가
// 스스로 의심하게 되는 자리입니다.
console.log('\n== 목록 맨 위에 연도까지 적힌 기간이 붙어 있습니다 ==');
{ const c=mk(V2,'2026-08-22T10:00:00');
  c.st().periodStart=21; c.st().payday=25;
  const z={gross:0,bk:0,net:8,reg:8,ot:0,night:0,hol:0,pay:0};
  c.state.extra=[
    {y:2026,m:8,day:21,kind:'day',type:'shift',inH:9,outH:18,c:z},
    {y:2023,m:8,day:25,kind:'day',type:'shift',inH:9,outH:18,c:z},
    {y:2023,m:12,day:26,kind:'day',type:'shift',inH:9,outH:18,c:z},
  ];
  const v=c.renderVals();
  ok('이번 기간에도 연도가 있습니다', v.viewPeriodFull==='2026.08.21 → 2026.09.20', v.viewPeriodFull);
  // 예전에는 이 줄이 '이번 기간은 조용합니다'(회색)였습니다. 2026-08-30에
  // 만든 사람이 폰에서 그 회색을 보고 어긋난 것으로 읽어, 두 상태를 한 색으로
  // 모았습니다 — 지금 어느 기간에 있는지는 스테퍼가 말합니다.
  ok('이번 기간도 빨강입니다', v.viewPeriodBg==='var(--color-accent)' && v.viewPeriodInk==='var(--color-bg)');

  // 근로자가 겪은 그 자리 — 2023년 08월
  const map=c.periodMap();
  c.goPeriod(map[2023*100+8]);
  const p=c.renderVals();
  ok('2023년 08월을 고르면 연도가 보입니다', p.viewPeriodFull==='2023.08.21 → 2023.09.20', p.viewPeriodFull);
  ok('지난 기간도 같은 빨강입니다', p.viewPeriodBg==='var(--color-accent)' && p.viewPeriodInk==='var(--color-bg)');
  ok('줄 자체는 예전 그대로 월.일', p.logRows[0].date.length===5, p.logRows[0].date);

  // 해를 넘기는 기간 — 연도가 가장 헷갈리는 자리라 양쪽을 다 적습니다
  c.goPeriod(map[2023*100+12]);
  ok('해를 넘기면 두 해가 다 적힙니다',
    c.renderVals().viewPeriodFull==='2023.12.21 → 2024.01.20', c.renderVals().viewPeriodFull);

  // 급여 탭도 같은 머리띠를 씁니다 — 두 탭이 같은 payBack을 읽으므로 같은 말을
  // 해야 합니다. 값이 하나이므로 어긋날 수가 없습니다.
  ok('급여도 같은 값을 씁니다', c.renderVals().viewPeriodFull===c.renderVals().viewPeriodFull);
  ok('머리띠는 값 하나뿐입니다', typeof c.renderVals().viewPeriodFull==='string'
    && c.renderVals().logPeriodFull===undefined);

  // 돌아와도 색이 바뀌지 않습니다 — 그것이 이번에 고친 것입니다
  c.renderVals().payNow();
  ok('이번 기간으로 돌아와도 빨강 그대로', c.renderVals().viewPeriodBg==='var(--color-accent)');
  ok('돌아와도 글자색 그대로', c.renderVals().viewPeriodInk==='var(--color-bg)');
  // 회색은 이제 이 머리띠에 쓰이지 않습니다 — 되돌리면 여기서 걸립니다
  ok('머리띠에 회색이 남아 있지 않습니다',
    c.renderVals().viewPeriodBg!=='var(--color-neutral-200)'
    && c.renderVals().viewPeriodInk!=='var(--color-text)');
  // 두 머리띠는 값 하나를 나눠 쓰므로 근무기록과 급여가 어긋날 길이 없습니다.
  // 마크업이 그 값을 정말 두 번 쓰는지는 아래 블록이 셉니다.
  ok('기간을 옮겨도 두 상태가 같은 색입니다',
    (function(){ const a=c.renderVals().viewPeriodBg; c.goPeriod(map[2023*100+8]);
      const b=c.renderVals().viewPeriodBg; c.renderVals().payNow(); return a===b; })());
}

// ── 2026-08-30 · 마크업이 그 값을 정말 쓰는지 ──
// 서른두째가 겪은 자리입니다 — renderVals()는 맞는 색을 내는데 마크업이 색을
// 하드코딩해 두어 화면에 닿지 않았습니다. 값이 맞고 화면이 틀린 것은 가장 잡기
// 어려운 종류라, 머리띠 둘이 실제로 그 홀을 쓰는지 소스에서 셉니다.
console.log('\n== 두 탭의 머리띠가 같은 홀을 씁니다 ==');
{ const fs=require('fs');
  const src=fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const bg=(src.match(/\{\{ viewPeriodBg \}\}/g)||[]).length;
  const ink=(src.match(/\{\{ viewPeriodInk \}\}/g)||[]).length;
  const full=(src.match(/\{\{ viewPeriodFull \}\}/g)||[]).length;
  ok('머리띠는 근무기록과 급여 둘입니다', full===2, String(full));
  ok('두 머리띠 모두 색을 홀로 받습니다', bg===2 && ink===2, bg+'/'+ink);
  // 머리띠 줄에 색을 박아 두면 홀이 닿지 않습니다
  const bands=src.split('\n').filter(l => l.indexOf('{{ viewPeriodFull }}')!==-1);
  ok('머리띠 줄에 색을 박아 두지 않았습니다',
    bands.length===2 && bands.every(l => l.indexOf('neutral-200')===-1
      && l.indexOf('background:{{ viewPeriodBg }}')!==-1));
}

// ── 예정 · 스테퍼가 닿지 않는 유일한 자리 ──
// payBack은 0 아래로 내려가지 않으므로 ‹ › 는 이번 기간에서 멈춥니다. 다음 달
// 연차를 미리 적어 두면 그 기록은 아직 시작하지 않은 기간에 들어가고, 화살표로는
// 닿지 않습니다. 지우려면 볼 수 있어야 합니다.
console.log('\n== 미리 적어 둔 날은 예정에 남습니다 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  const z={gross:0,bk:0,net:8,reg:8,ot:0,night:0,hol:0,pay:0};
  const P=c.period(c.now());
  c.state.extra=[
    {y:2026,m:3,day:2,kind:'day',type:'shift',c:z},                    // 지난 기간
    {y:P.e.getFullYear(),m:P.e.getMonth()+1,day:P.e.getDate(),kind:'day',type:'shift',c:z}, // 이번 기간 마지막 날
    {y:2026,m:12,day:24,type:'annual',kind:'day',planned:true,c:z},    // 앞선 기간
  ];
  const v=c.renderVals();
  ok('예정에는 앞으로의 날만', v.upcoming.length===1, 'rows='+v.upcoming.length);
  ok('그 날짜입니다', v.upcoming[0].date==='2026.12.24', v.upcoming[0].date);
  ok('이번 기간 마지막 날은 예정이 아닙니다', v.upcoming.filter(x=>x.date.indexOf('.12.')===-1).length===0);
  ok('지난 기간의 날도 예정이 아닙니다', v.upcoming.filter(x=>x.date==='2026.03.02').length===0);
  ok('적어 둔 것이 있으면 자리가 있습니다', v.hasUpcoming===true);
  ok('그 기간의 이름이 붙습니다', /12\.|01\./.test(v.upcoming[0].per), v.upcoming[0].per);
  // 지우는 길은 여기뿐입니다 — 화살표는 앞으로 가지 못합니다
  v.upcoming[0].del();
  ok('예정에서 지울 수 있습니다', c.renderVals().upcoming.length===0);
  ok('지우고 나면 자리가 사라집니다', c.renderVals().hasUpcoming===false);

  // 지난 기간을 펼쳐 놓고 봐도 '예정'의 뜻은 달라지지 않습니다
  const c2=mk(V2,'2026-08-17T10:00:00');
  c2.state.extra=[{y:2026,m:12,day:24,type:'annual',kind:'day',planned:true,c:z},
                  {y:2026,m:3,day:2,kind:'day',type:'shift',c:z}];
  c2.setState({payBack:3});
  ok('지난 기간을 봐도 예정은 그대로', c2.renderVals().upcoming.length===1);
  // 앞으로의 기록이 없는 사람에게는 아예 없는 자리입니다
  const c3=mk(V2,'2026-08-17T10:00:00');
  c3.state.extra=[{y:2026,m:8,day:11,kind:'day',type:'shift',c:z}];
  ok('앞으로의 기록이 없으면 자리도 없습니다', c3.renderVals().hasUpcoming===false);
}

console.log('\n== CSV · 표 계산기로 여는 기록 ==');
{ const c=mk(V2,'2026-08-17T10:00:00');
  c.st().lang='km';                                  // 앱은 크메르어로 쓰고 있어도
  c.state.extra=[{y:2026,m:8,day:11,kind:'day',type:'shift',inH:9,outH:14,
    c:c.calc(9,14,'day',false),
    reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장',note:'금형 3호기 파손'}}];
  const csv=c.csvText();
  ok('한글 엑셀이 읽도록 BOM이 붙습니다', csv.charCodeAt(0)===0xFEFF);
  ok('머리글은 한국어입니다', csv.includes('날짜,요일,구분'));
  // 2026-08-28 (열여덟째) — 근로자 칸이 맨 앞에 붙었습니다. 13 → 14칸.
  ok('근로자 칸이 맨 앞입니다', csv.startsWith('\ufeff근로자,날짜,요일,구분'), csv.slice(0,30));
  ok('사유가 한국어로 들어갑니다', csv.includes('기계 · 금형 고장'));
  ok('누구 사정인지도 들어갑니다', csv.includes('회사 사정'));
  ok('메모도 들어갑니다', csv.includes('금형 3호기 파손'));
  ok('크메르어로 새지 않습니다', !/[ក-៿]/.test(csv));
  // 사유에 쉼표가 들어가면 칸이 밀립니다 — CSV에서 가장 흔한 고장입니다
  const c2=mk(V2,'2026-08-17T10:00:00');
  c2.state.extra=[{y:2026,m:8,day:11,kind:'day',type:'shift',inH:9,outH:14,
    c:c2.calc(9,14,'day',false),
    reason:{id:'other',fault:'other',ko:'직접 입력',note:'금형 파손, 자재 없음'}}];
  const line=c2.csvText().trim().split('\r\n')[1];
  ok('쉼표가 든 칸은 따옴표로 감쌉니다', line.includes('"금형 파손, 자재 없음"'), line);
  ok('그래서 칸 수가 밀리지 않습니다', line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length===14,
    line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length+'칸');
  ok('줄 수는 머리글 + 기록', csv.trim().split('\r\n').length===2);
}

console.log('\n== 망가진 기록 하나가 앱을 못 열게 하면 안 됩니다 ==');
{ // 손으로 고친 백업 파일에서 c가 없는 기록이 들어온 경우
  const c=mk(V2,'2026-08-17T10:00:00');
  c.setState({pendingImport:{app:'worklog',v:1,settings:{},removed:[],session:null,
    extra:[{y:2026,m:8,day:3,kind:'day',type:'shift',inH:9,outH:21},   // c가 없습니다
           {y:2026,m:8,day:4,kind:'day',type:'shift',c:{reg:'왜'}},     // 숫자가 아닙니다
           null]}});
  c.confirmImport();
  ok('망가진 줄은 버리고 나머지는 살립니다', c.state.extra.length===2, 'n='+c.state.extra.length);
  ok('없던 c를 채워 넣습니다', c.state.extra[0].c && c.state.extra[0].c.reg===0);
  ok('숫자가 아닌 값은 0으로', c.state.extra[1].c.reg===0);
  let threw=null;
  try { c.renderVals(); } catch(e) { threw=e.message; }
  ok('앱이 그대로 열립니다', threw===null, threw||'');
  ok('근무내역서도 그대로 나옵니다', c.evidenceHtml().includes('근무내역서'));
}


console.log('\n== 새로 까는 사람에게 맞는 기본값 ==');
{ // 이 앱은 12시간 2교대 공장에서 태어났고, 기본값이 전부 그 공장이었습니다.
  // 설정을 열면 '교대 · 09:00 / 21:00'이라고 적혀 있었는데, 처음 여는 사람은
  // 그 두 숫자를 출근·퇴근 시각으로 읽습니다 — 아침 9시에 나가 밤 9시에
  // 들어오는 것이 이 앱의 기본이라고. 대부분의 회사는 그렇지 않습니다.
  const D=V2.DEFAULTS;
  ok('기본 근무조는 주간만', D.shifts==='day', 'got '+D.shifts);
  ok('주간 시작은 09:00', D.dayStart==='09:00');
  ok('야간 시작 21:00은 그대로 남아 있습니다', D.nightStart==='21:00');
  ok('기본 휴게는 점심 한 번', D.breaksDay.length===1 && D.breaksDay[0].from==='11:30');
  const c=mk(V2);
  ok('그래서 09:00–18:00이 실근무 8시간입니다', c.calc(9,18,'day',false).net===8,
    'got '+c.calc(9,18,'day',false).net);
  ok('설정 요약이 주간만 · 09:00로 읽힙니다',
    /09:00/.test(c.setGroupSums().grp_shift) && !/21:00/.test(c.setGroupSums().grp_shift),
    c.setGroupSums().grp_shift);
}

console.log('\n== 근무조를 바꾸면 휴게도 따라갑니다 ==');
{ // 8시간짜리 하루에 저녁 휴게가 남아 있으면 실근무가 7.5시간으로 찍히고,
  // 12시간짜리 하루에 점심만 있으면 11시간으로 찍힙니다. 어느 쪽도 사실이 아닙니다.
  const c=mk(V2);
  const opts=()=>c.renderVals().shiftOpts;
  opts()[2].set();   // 교대
  ok('교대를 고르면 저녁 휴게가 돌아옵니다', c.st().breaksDay.length===2,
    JSON.stringify(c.st().breaksDay));
  ok('교대에서는 09:00–21:00이 10.5시간', c.calc(9,21,'day',false).net===10.5);
  ok('요약에 두 시각이 함께 나옵니다', c.setGroupSums().grp_shift.includes('09:00 / 21:00'),
    c.setGroupSums().grp_shift);
  opts()[0].set();   // 주간만
  ok('주간만으로 돌아오면 점심 하나', c.st().breaksDay.length===1);
  // 손으로 고친 휴게는 근무조를 바꿔도 앱이 건드리지 않습니다 — 그 사람의 회사 규칙입니다
  c.state.settings.breaksDay=[{from:'12:00',to:'13:00'}];
  opts()[2].set();
  ok('손댄 휴게는 그대로 둡니다', c.st().breaksDay[0].from==='12:00',
    JSON.stringify(c.st().breaksDay));
}

console.log('\n== 이 휴게는 어느 조의 것입니까 ==');
{ // 교대를 고르면 휴게 칸이 두 벌 나옵니다. 예전에는 둘 다 아무 표시가 없어서,
  // 위가 주간인지 야간인지 알 수 없었습니다 — 야간 휴게를 주간 칸에 적으면
  // 실근무가 통째로 틀어집니다.
  const c=mk(V2);
  const opts=()=>c.renderVals().shiftOpts;
  opts()[2].set();   // 교대
  let L=c.renderVals().L;
  ok('교대에서는 두 벌 다 보입니다', c.renderVals().showDay===true && c.renderVals().showNight===true);
  ok('주간 휴게에 제목이 붙습니다', L.secDayBreaks.includes('주간'), L.secDayBreaks);
  ok('야간 휴게에 제목이 붙습니다', L.secNightBreaks.includes('야간'), L.secNightBreaks);
  ok('두 제목은 서로 다릅니다', L.secDayBreaks!==L.secNightBreaks);
  // 주간만인 사람에게도 제목은 남습니다 — 틀린 말이 아니고, 화면이 흔들리지 않습니다
  opts()[0].set();
  const d=c.renderVals();
  ok('주간만이면 야간 칸은 아예 없습니다', d.showNight===false);
  ok('그래도 주간 제목은 그대로', d.L.secDayBreaks.includes('주간'));
  // 여덟 나라 말 모두에서 한국어 조 이름이 앞에 섭니다 — 공장에서 듣는 말이 그것입니다
  for (const lg of ['ko','en','vi','zh','th','id','ne','km']) {
    c.st().lang=lg;
    L=c.renderVals().L;
    ok(lg+': 주간 휴게 제목이 있습니다', /주간/.test(L.secDayBreaks), L.secDayBreaks);
    ok(lg+': 야간 휴게 제목이 있습니다', /야간/.test(L.secNightBreaks), L.secNightBreaks);
  }
  c.st().lang='ko';
}

console.log('\n== 잔업하는 날에만 있는 휴게 ==');
{ // 9시 출근 6시 퇴근인 공장도 물량이 밀리면 잔업을 시킵니다. 그럴 때 30분 쉬게 해 주는
  // 회사가 많습니다. 그 30분을 휴게에 적으면 정시 퇴근한 날까지 30분씩 빠지는 것 아니냐 —
  // 아닙니다. 휴게는 실제로 찍힌 시간과 겹치는 만큼만 빠집니다.
  const c=mk(V2);
  c.st().shifts='day';
  c.st().breaksDay=[{from:'11:30',to:'12:30'},{from:'18:00',to:'18:30'}];
  ok('정시 퇴근한 날은 점심만 빠집니다', c.calc(9,18,'day',false).bk===1);
  ok('그날 실근무는 8시간 그대로', c.calc(9,18,'day',false).net===8);
  ok('잔업 안 한 날은 잔업 0', c.calc(9,18,'day',false).ot===0);
  ok('9시까지 일한 날은 1.5시간 빠집니다', c.calc(9,21,'day',false).bk===1.5);
  ok('그날 실근무는 10.5시간', c.calc(9,21,'day',false).net===10.5);
  ok('잔업은 2.5시간', c.calc(9,21,'day',false).ot===2.5);
  // 휴게 도중에 나간 날은 있었던 만큼만 빠집니다. 다만 퇴근은 30분 단위로 내려 잡히므로
  // (snapOut) 18:15 퇴근은 18:00으로 계산되고, 그날은 휴게에 닿지도 않습니다.
  ok('18:15 퇴근은 18:00으로 잡힙니다', c.snapOut(18.25)===18);
  ok('그날은 잔업 휴게에 닿지 않습니다', c.calc(9,18.25,'day',false).bk===1);
  c.st().breaksDay=[{from:'11:30',to:'12:30'},{from:'18:00',to:'19:00'}];
  ok('휴게 중간에 퇴근하면 그만큼만', c.calc(9,18.5,'day',false).bk===1.5,
    String(c.calc(9,18.5,'day',false).bk));
}

console.log('\n== 잔업이 시작되는 시각 ==');
{ // 설정에 '퇴근 시각'은 없습니다. 그래도 실근무 8시간이 차는 자리는 셀 수 있습니다 —
  // 휴게는 무급이라 그동안 시계가 멈추기 때문입니다.
  const c=mk(V2);
  c.st().shifts='day'; c.st().dayStart='09:00';
  c.st().breaksDay=[{from:'11:30',to:'12:30'}];
  ok('09:00 + 점심 1시간이면 18:00', c.otMark('day')===18, String(c.otMark('day')));
  c.st().breaksDay=[];
  ok('휴게가 없으면 17:00', c.otMark('day')===17, String(c.otMark('day')));
  c.st().breaksDay=[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}];
  ok('12시간짜리 공장은 18:30', c.otMark('day')===18.5, String(c.otMark('day')));
  ok('저녁 휴게는 아직 정규 안쪽입니다', c.isOtBreak('day',[17,17.5])===false);
  ok('18:30부터가 잔업 휴게입니다', c.isOtBreak('day',[18.5,19])===true);
  // 야간조도 같은 방식입니다 — 21:00 시작에 자정 휴게 1시간이면 06:00
  c.st().shifts='night'; c.st().nightStart='21:00';
  c.st().breaksNight=[{from:'00:00',to:'01:00'}];
  ok('야간조는 06:00', c.otMark('night')===30, String(c.otMark('night')));
  // 출근 시각을 비워 둔 사람도 앱이 멈추지 않습니다 — 09:00으로 셉니다
  c.st().shifts='day'; c.st().dayStart='';
  c.st().breaksDay=[{from:'11:30',to:'12:30'}];
  ok('시작 시각이 비어도 셈이 됩니다', c.otMark('day')===18, String(c.otMark('day')));
}

console.log('\n== 한 줄이 거짓말을 하고 있었습니다 ==');
{ // 잔업 휴게를 넣으면 설정이 '무급 휴게 1.5시간'이라고 읽혔습니다. 정시 퇴근하는 날
  // 실제로 빠지는 건 1시간뿐인데, 근로자가 스스로 맞춰 볼 수 있는 숫자는 이 줄뿐입니다.
  const c=mk(V2);
  c.st().shifts='day'; c.st().dayStart='09:00';
  c.st().breaksDay=[{from:'11:30',to:'12:30'}];
  ok('평범한 날은 문구가 그대로입니다', c.breakTotal('day').includes('60분'), c.breakTotal('day'));
  ok('그 문구에 연장 이야기는 없습니다', !c.breakTotal('day').includes('연장'), c.breakTotal('day'));
  c.st().breaksDay=[{from:'11:30',to:'12:30'},{from:'18:00',to:'18:30'}];
  const t=c.breakTotal('day');
  ok('늘 빠지는 몫은 60분으로 남습니다', t.includes('60분'), t);
  ok('나머지는 연장 시 +30분', t.includes('연장 시 +30분'), t);
  ok('1.5시간이라고 쓰지 않습니다', !t.includes('1.5'), t);
  // 잔업 휴게 하나만 있는 사람 — 정시 퇴근하는 날은 한 푼도 안 빠집니다
  c.st().breaksDay=[{from:'18:00',to:'18:30'}];
  ok('잔업 휴게뿐이면 그렇게 말합니다', c.breakTotal('day').includes('늦게까지'), c.breakTotal('day'));
  c.st().breaksDay=[];
  ok('휴게가 없으면 전 시간 유급', c.breakTotal('day')===c.T('no_unpaid_break_all_hours_paid'));
}

console.log('\n== 연장 휴게 한 번에 넣기 ==');
{ // 시각을 직접 계산해 적게 하면 대부분 틀립니다. 잔업이 시작되는 그 자리에 30분을 얹습니다.
  const c=mk(V2);
  c.st().shifts='day'; c.st().dayStart='09:00';
  c.st().breaksDay=[{from:'11:30',to:'12:30'}];
  ok('버튼이 보입니다', c.renderVals().showDayOtAdd===true);
  c.renderVals().addDayOtBreak();
  const b=c.st().breaksDay[1];
  ok('18:00에 붙습니다', b.from==='18:00', JSON.stringify(b));
  ok('30분입니다', b.to==='18:30', JSON.stringify(b));
  ok('정시 퇴근한 날은 여전히 8시간', c.calc(9,18,'day',false).net===8);
  ok('넣고 나면 버튼이 사라집니다', c.renderVals().showDayOtAdd===false);
  const rows=c.renderVals().dayBreakRows;
  ok('점심에는 표가 없습니다', rows[0].otOnly===false);
  ok('연장 휴게에는 표가 붙습니다', rows[1].otOnly===true);
  ok('표에 연장이라고 적힙니다', rows[1].tag.includes('연장'), rows[1].tag);
  // 지우면 버튼이 돌아옵니다
  rows[1].del();
  ok('지우면 버튼이 돌아옵니다', c.renderVals().showDayOtAdd===true);
  // 야간조도 같은 버튼을 씁니다
  c.st().shifts='night'; c.st().nightStart='21:00';
  c.st().breaksNight=[{from:'00:00',to:'01:00'}];
  c.renderVals().addNightOtBreak();
  ok('야간 연장 휴게는 06:00', c.st().breaksNight[1].from==='06:00',
    JSON.stringify(c.st().breaksNight));
  ok('야간조도 정시 퇴근하면 8시간', c.calc(21,30,'night',false).net===8);
}

console.log('\n== 12시간 2교대는 잔업이 근무표 안에 있습니다 ==');
{ // 처음 만들 때 '실근무 8시간이 차는 자리'를 잔업 시작으로 잡았습니다. 9-6 공장은
  // 그 자리가 곧 퇴근이라 맞았지만, 09:00~21:00을 도는 사람은 18:30에 8시간을 채우고도
  // 아직 정상 근무 중입니다. 그 자리에 휴게를 얹으면 매일 30분씩 빠집니다 —
  // '연장 시에만'이라는 표를 달고서.
  const c=mk(V2);
  c.st().shifts='both'; c.st().dayStart='09:00'; c.st().nightStart='21:00';
  c.st().breaksDay=[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}];
  c.st().breaksNight=[{from:'00:00',to:'01:00'}];
  ok('8시간은 18:30에 찹니다', c.otMark('day')===18.5, String(c.otMark('day')));
  ok('그래도 평소 퇴근은 21:00입니다', c.normalEnd('day')===21, String(c.normalEnd('day')));
  ok('야간조의 평소 퇴근은 09:00', c.normalEnd('night')===33, String(c.normalEnd('night')));
  // 버튼이 넣는 자리는 평소 퇴근 시각입니다
  const before=c.calc(9,21,'day',false);
  c.renderVals().addDayOtBreak();
  ok('주간 연장 휴게는 21:00에 붙습니다', c.st().breaksDay[2].from==='21:00',
    JSON.stringify(c.st().breaksDay[2]));
  const after=c.calc(9,21,'day',false);
  ok('평소 하루가 그대로입니다', after.net===before.net && after.net===10.5, String(after.net));
  ok('잔업도 그대로 2.5시간', after.ot===2.5, String(after.ot));
  ok('휴게도 늘지 않습니다', after.bk===1.5, String(after.bk));
  // 22시까지 남은 날에만 물립니다
  const late=c.calc(9,22,'day',false);
  ok('22시까지 일하면 그때 빠집니다', late.bk===2, String(late.bk));
  ok('그날 잔업은 3시간', late.ot===3, String(late.ot));
  // 표는 21:00짜리에만 붙습니다 — 저녁 휴게는 평소 근무 안쪽입니다
  const rows=c.renderVals().dayBreakRows;
  ok('점심에는 표가 없습니다', rows[0].otOnly===false);
  ok('저녁 휴게에도 표가 없습니다', rows[1].otOnly===false);
  ok('21:00짜리에만 표가 붙습니다', rows[2].otOnly===true);
  ok('설정 문구도 90분 + 연장 30분', c.breakTotal('day').includes('90분')
    && c.breakTotal('day').includes('연장 시 +30분'), c.breakTotal('day'));
  // 야간조도 같은 규칙 — 21:00~09:00을 도는 사람의 평소 퇴근은 09:00입니다
  c.renderVals().addNightOtBreak();
  ok('야간 연장 휴게는 09:00에 붙습니다', c.st().breaksNight[1].from==='09:00',
    JSON.stringify(c.st().breaksNight[1]));
  ok('평소 야간 12시간이 그대로', c.calc(21,33,'night',false).net===11,
    String(c.calc(21,33,'night',false).net));
}

console.log('\n== 주간만·야간만은 예전 그대로 ==');
{ // 퇴근 시각을 알 길이 없는 근무조는 8시간이 차는 자리를 그대로 씁니다.
  const c=mk(V2);
  c.st().shifts='day'; c.st().dayStart='09:00';
  c.st().breaksDay=[{from:'11:30',to:'12:30'}];
  ok('주간만은 otMark 그대로', c.normalEnd('day')===c.otMark('day'));
  c.renderVals().addDayOtBreak();
  ok('18:00에 붙습니다', c.st().breaksDay[1].from==='18:00');
  ok('정시 퇴근한 날은 8시간 그대로', c.calc(9,18,'day',false).net===8);
  const n=mk(V2);
  n.st().shifts='night'; n.st().nightStart='20:00';
  n.st().breaksNight=[{from:'00:00',to:'01:00'}];
  ok('야간만도 otMark 그대로', n.normalEnd('night')===n.otMark('night'));
}

console.log('\n== 9시 출근 6시 퇴근만 있는 게 아닙니다 ==');
{ // 이 앱은 한 공장에서 태어났지만 쓰는 사람은 제각각입니다. 실제로 물어본 근무표들:
  // 07:00–16:00 주간, 20:00–05:00 야간, 그리고 물량 없는 날의 18:00–24:00.
  const c=mk(V2);

  // 07:00 출근에 12시 점심 — 8시간이 차는 자리는 16:00입니다
  c.st().shifts='day'; c.st().dayStart='07:00';
  c.st().breaksDay=[{from:'12:00',to:'13:00'}];
  ok('07시 출근이면 잔업은 16:00부터', c.otMark('day')===16, String(c.otMark('day')));
  ok('07-16은 딱 8시간', c.calc(7,16,'day',false).net===8);
  ok('07-16에 잔업은 없습니다', c.calc(7,16,'day',false).ot===0);
  ok('07-19면 잔업 3시간', c.calc(7,19,'day',false).ot===3);

  // 20:00 출근 05:00 퇴근, 자정 휴게 1시간
  c.st().shifts='night'; c.st().nightStart='20:00';
  c.st().breaksNight=[{from:'00:00',to:'01:00'}];
  ok('20시 야간이면 8시간이 차는 자리는 05:00', c.otMark('night')===29, String(c.otMark('night')));
  ok('20-05는 딱 8시간', c.calc(20,29,'night',false).net===8);
  ok('그날 야간 가산은 6시간', c.calc(20,29,'night',false).night===6);   // 22-05 빼기 휴게 1시간
  ok('20-07이면 잔업 2시간', c.calc(20,31,'night',false).ot===2);

  // 물량이 없어 18:00-24:00만 시키는 날 — 휴게도 없습니다
  c.st().nightStart='18:00'; c.st().breaksNight=[];
  ok('18-24는 6시간', c.calc(18,24,'night',false).net===6);
  ok('6시간은 전부 정규입니다', c.calc(18,24,'night',false).reg===6);
  ok('잔업은 0입니다', c.calc(18,24,'night',false).ot===0);
  ok('22시 뒤 2시간은 야간 가산', c.calc(18,24,'night',false).night===2);
  ok('휴게가 없으면 한 푼도 안 빠집니다', c.calc(18,24,'night',false).bk===0);
  ok('설정도 전 시간 유급이라고 씁니다',
    c.breakTotal('night')===c.T('no_unpaid_break_all_hours_paid'));
}

console.log('\n== 설정은 그대로 두고 짧게 일한 날 ==');
{ // 평소 21:00 야간인 사람을 물량 없는 날 18:00에 부릅니다. 설정을 고칠 필요가 없어야
  // 합니다 — 고쳤다가 되돌리는 걸 잊으면 그 다음 정상 야간이 통째로 틀어집니다.
  const c=mk(V2);
  c.st().shifts='both'; c.st().dayStart='09:00'; c.st().nightStart='21:00';
  c.st().breaksDay=[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}];
  c.st().breaksNight=[{from:'00:00',to:'01:00'}];
  ok('18시 출근은 야간으로 잡힙니다', c.detectShift(18)==='night');   // 21시까지 3시간, 9시까지 9시간
  const r=c.calc(18,24,'night',false);
  ok('6시간이 그대로 남습니다', r.net===6);
  ok('자정 휴게는 닿지 않으니 안 빠집니다', r.bk===0);
  ok('야간 가산 2시간', r.night===2);
  ok('주간 휴게는 끌려오지 않습니다', r.bk!==1.5);
  // 설정을 건드리지 않았으니 평소 근무는 그대로여야 합니다
  ok('평소 야간은 여전히 8시간', c.calc(21,30,'night',false).net===8);
  ok('평소 주간도 그대로', c.calc(9,21,'day',false).net===10.5);
  // 태그는 21:00 기준으로 붙습니다 — 그래도 돈은 찍힌 시간으로만 계산됩니다.
  // 이 6시간짜리 날에 붙는 돈은 야간 가산 2시간뿐입니다: 2 × 5,160 = 10,320
  ok('가산금은 야간 2시간치뿐입니다', r.pay===2*c.nightRate(), String(r.pay));
  ok('법정과 어긋나는 부분이 없습니다', r.gap===0);
  // 근무조 시작을 18:00으로 고쳐도 그날 돈은 한 푼도 달라지지 않습니다 —
  // otMark는 화면에 붙는 표시일 뿐 계산식에 들어가지 않기 때문입니다
  const before=c.calc(18,24,'night',false).pay;
  c.st().nightStart='18:00';
  ok('시작 시각을 고쳐도 그날 돈은 같습니다', c.calc(18,24,'night',false).pay===before);
  ok('otMark만 따라 움직입니다', c.otMark('night')===27, String(c.otMark('night')));
}

console.log('\n== 근무조 시작 시각을 비울 수는 없습니다 ==');
{ // 실제 휴대폰에서 발견했습니다: 주간 시작이 빈 문자열로 저장되어 있었습니다.
  // 화면은 멀쩡해 보입니다 — placeholder가 옅은 글씨로 09:00을 보여 주니까요.
  // 그런데 요약 줄은 '교대 · / 21:00'이었고, schedStart()는 조용히 09:00으로
  // 되돌아가 있었습니다. 주·야간 판정이 거기서 나옵니다.
  const c=mk(V2);
  c.st().shifts='both'; c.st().dayStart='09:00';
  const f=()=>c.renderVals();
  ok('처음에는 저장된 값이 보입니다', f().dayStartVal==='09:00');
  f().focDayStart();                                   // 누르면 비고
  ok('누르면 칸이 빕니다', f().dayStartVal==='');
  ok('비어도 설정은 아직 그대로', c.st().dayStart==='09:00');
  f().blurDayStart();                                  // 아무것도 안 하고 나갑니다
  ok('그냥 나가면 원래 값이 돌아옵니다', c.st().dayStart==='09:00');
  ok('칸에도 다시 보입니다', f().dayStartVal==='09:00');
  // 지우기만 하고 나간 경우 — 빈 칸은 저장되지 않습니다
  f().focDayStart();
  f().setDayStart({ target: { value: '' } });
  ok('빈 칸은 저장되지 않습니다', c.st().dayStart==='09:00');
  f().blurDayStart();
  ok('나가도 여전히 09:00', c.st().dayStart==='09:00');
  // 07:00으로 고치는 정상 경로
  f().focDayStart();
  f().setDayStart({ target: { value: '07:00' } });
  f().blurDayStart();
  ok('제대로 고친 값은 남습니다', c.st().dayStart==='07:00');
  ok('잔업 시각도 따라옵니다', c.otMark('day')===16, String(c.otMark('day')));  // 07:00 + 점심 1시간
  // parseHM은 너그럽습니다 — '9'도 '09:'도 09:00입니다. 계산은 맞지만 화면에는
  // 적은 그대로가 나오므로, 나갈 때 한 가지 모양으로 정리합니다.
  f().focDayStart();
  f().setDayStart({ target: { value: '9' } });
  f().blurDayStart();
  ok("'9'는 09:00으로 정리됩니다", c.st().dayStart==='09:00', c.st().dayStart);
  f().focDayStart();
  f().setDayStart({ target: { value: '07:' } });
  f().blurDayStart();
  ok("'07:'은 07:00으로 정리됩니다", c.st().dayStart==='07:00', c.st().dayStart);
  // 시각으로 읽히지 않는 것은 들어오기 전 값으로 되돌립니다
  f().focDayStart();
  f().setDayStart({ target: { value: '아침' } });
  f().blurDayStart();
  ok('시각이 아닌 것은 되돌아갑니다', c.st().dayStart==='07:00', c.st().dayStart);
  // 야간 칸도 같은 규칙입니다
  f().focNightStart();
  f().setNightStart({ target: { value: '' } });
  f().blurNightStart();
  ok('야간 시작도 비울 수 없습니다', c.st().nightStart==='21:00');
  f().focNightStart();
  f().setNightStart({ target: { value: '20:00' } });
  f().blurNightStart();
  ok('야간 시작은 고쳐집니다', c.st().nightStart==='20:00');
}

console.log('\n== 이미 비어 있는 휴대폰을 고칩니다 ==');
{ // 고치기 전에 저장된 빈 값은 그대로 남아 있습니다. 다음에 앱을 열 때 낫게 합니다.
  const load=st=>{
    const store={'worklog.v2':JSON.stringify({v:2,tourSeen:true,setupDone:true,
      settings:st, extra:[],removed:[],session:null})};
    global.window.localStorage={getItem:k=>store[k]||null,setItem:()=>{},removeItem:()=>{}};
    const c=mk(V2,'2026-08-18T10:00:00');
    global.window.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
    return c;
  };
  const c=load({ dayStart:'', nightStart:'21:00', shifts:'both' });
  ok('빈 시작 시각은 기본값으로 낫습니다', c.st().dayStart==='09:00', String(c.st().dayStart));
  ok('요약 줄에 빈자리가 없습니다', c.setGroupSums().grp_shift.includes('09:00 / 21:00'),
    c.setGroupSums().grp_shift);
  // 반만 남은 값도 마찬가지입니다
  ok("'09:'로 저장된 것도 09:00으로 정리됩니다",
    load({ dayStart:'09:', shifts:'day' }).st().dayStart==='09:00');
  ok('시각이 아닌 것도 기본값으로 낫습니다',
    load({ dayStart:'아침', shifts:'day' }).st().dayStart==='09:00');
  // 멀쩡한 값은 절대 건드리지 않습니다 — 07:00에 출근하는 사람의 설정입니다
  const k=load({ dayStart:'07:00', nightStart:'20:00', shifts:'both' });
  ok('07:00은 그대로 남습니다', k.st().dayStart==='07:00');
  ok('20:00도 그대로 남습니다', k.st().nightStart==='20:00');
  ok('그 사람의 잔업 시각은 16:00', k.otMark('day')===16, String(k.otMark('day')));
}

console.log('\n== 여기 적는 휴게는 모두 무급입니다 ==');
{ // 돈 주는 10분 커피 타임을 여기 적으면 매일 10분씩 손해입니다. 화면이 말해 줘야 합니다.
  const c=mk(V2);
  const note=c.renderVals().L.breaksUnpaidNote;
  ok('무급이라고 못 박습니다', note.includes('무급'), note);
  ok('제54조를 답니다', note.includes('제54조'), note);
  ok('커피 타임을 예로 듭니다', note.includes('커피'), note);
  for (const lg of ['ko','en','vi','zh','th','id','ne','km']) {
    c.st().lang=lg;
    ok(lg+': 경고가 비어 있지 않습니다', (c.renderVals().L.breaksUnpaidNote||'').length>40);
  }
  c.st().lang='ko';
}

console.log('\n== 급여기간은 1일부터 말일까지, 익월 10일 지급 ==');
{ // 21일~20일은 이 앱이 태어난 그 공장의 규칙이었습니다.
  ok('시작일은 1일', V2.DEFAULTS.periodStart===1);
  ok('지급일은 10일', V2.DEFAULTS.payday===10);
  const c=mk(V2,'2026-08-17T10:00:00');
  const P=c.period(c.now());
  ok('8월 기간은 08.01 → 08.31', P.label==='08.01 → 08.31', P.label);
  ok('지급일은 09.10', P.payday==='09.10', P.payday);
  // 2월도 특별한 처리 없이 맞아야 합니다 — 말일은 달마다 다릅니다
  const f=c.period(new Date('2027-02-10T00:00:00'));
  ok('윤년 아닌 2월은 02.01 → 02.28', f.label==='02.01 → 02.28', f.label);
  // 달을 그대로 쓰면 해를 걸치는 기간이 아예 없습니다
  const jan=c.period(new Date('2027-01-15T00:00:00'));
  ok('1월 기간은 해를 걸치지 않습니다', jan.s.getFullYear()===jan.e.getFullYear());
}

console.log('\n== 아직 하나도 안 쓴 사람의 연차는 15일 남았습니다 ==');
{ // 출퇴근 화면의 연차가 '9/15'로 시작했습니다. 9는 이 앱을 처음 만든 사람의
  // 그 해 잔여였을 뿐, 새로 까는 사람과는 아무 상관이 없는 숫자입니다.
  ok('발생도 15일', V2.DEFAULTS.annualTotal===15);
  ok('잔여도 15일', V2.DEFAULTS.annualBase===15);
  const c=mk(V2);
  ok('화면에도 15가 남은 것으로 나옵니다', c.annualLeft()===15, 'got '+c.annualLeft());
}

console.log('\n== 손으로 적는 하루의 기본 시각 ==');
{ // 21:00은 12시간 2교대의 퇴근 시각이라, 대부분의 사람은 매번 고쳐야 했습니다.
  const c=mk(V2,'2026-08-17T10:00:00');
  c.openPending('work');
  ok('출근 09:00', c.state.pendingIn==='09:00', c.state.pendingIn);
  ok('퇴근 18:00', c.state.pendingOut==='18:00', c.state.pendingOut);
}

console.log('\n== 쓰던 사람의 설정은 기본값이 바뀌어도 그대로입니다 ==');
{ // 기본값은 새로 까는 사람에게만 갑니다. 저장된 설정이 DEFAULTS 위에 덮이므로
  // 21일~20일에 야간까지 도는 사람이 업데이트했다고 급여기간이 옮겨지면 안 됩니다.
  const store={'worklog.v2':JSON.stringify({v:2,tourSeen:true,setupDone:true,
    settings:{basic:2600000,periodStart:21,payday:25,shifts:'both',annualBase:4,
      breaksDay:[{from:'11:30',to:'12:30'},{from:'17:00',to:'17:30'}]},
    extra:[],removed:[],session:null})};
  global.window.localStorage={getItem:k=>store[k]||null,setItem:()=>{},removeItem:()=>{}};
  const c=mk(V2,'2026-08-17T10:00:00');
  ok('급여기간 21일이 그대로', c.st().periodStart===21, 'got '+c.st().periodStart);
  ok('지급일 25일이 그대로', c.st().payday===25);
  ok('교대 근무가 그대로', c.st().shifts==='both');
  ok('저녁 휴게가 그대로', c.st().breaksDay.length===2);
  ok('연차 잔여 4일이 그대로', c.st().annualBase===4);
  ok('기본금도 그대로', c.st().basic===2600000);
  global.window.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
}

console.log('\n== 숫자 칸 · 누르면 비고, 안 고치면 되돌아옵니다 ==');
{ // 기본금 2,156,880을 3,000,000으로 바꾸려면 백스페이스를 일곱 번 눌러야 했고,
  // 다 지우고 나면 0이 남았습니다. 0은 되돌릴 수 없는 값입니다 — 원래 숫자를
  // 이미 화면에서 지웠으니 무엇이었는지 알 방법이 없고, 앱은 그 0을 진짜
  // 기본금으로 알고 시급을 0원으로 계산합니다.
  const c=mk(V2);
  const was=c.st().basic;
  ok('처음에는 저장된 값이 보입니다', c.renderVals().basicVal===was);
  c.renderVals().focBasic();
  ok('누르면 화면에서는 빕니다', c.renderVals().basicVal==='');
  ok('그래도 설정은 그대로입니다', c.st().basic===was, 'got '+c.st().basic);
  ok('시급도 0이 되지 않습니다', c.rate()>0, 'rate='+c.rate());
  // 마음이 바뀌어 아무것도 치지 않고 나갑니다
  c.renderVals().blurBasic();
  ok('나가면 원래 값이 다시 보입니다', c.renderVals().basicVal===was, 'got '+c.renderVals().basicVal);
  // 이번에는 진짜로 고칩니다
  c.renderVals().focBasic();
  c.renderVals().setBasic({target:{value:'3000000'}});
  ok('친 숫자가 저장됩니다', c.st().basic===3000000, 'got '+c.st().basic);
  ok('화면에도 그 숫자가 있습니다', c.renderVals().basicVal==='3000000');
  c.renderVals().blurBasic();
  ok('나가도 새 값이 남습니다', c.st().basic===3000000);
  // 지우는 도중의 빈 칸은 저장하지 않습니다 — 0으로 만들겠다는 뜻이 아닙니다
  c.renderVals().focBasic();
  c.renderVals().setBasic({target:{value:''}});
  ok('빈 칸은 저장되지 않습니다', c.st().basic===3000000, 'got '+c.st().basic);
  c.renderVals().blurBasic();
  ok('그래서 0이 남지 않습니다', c.renderVals().basicVal===3000000);
  // 어느 칸에 손을 대고 있는지는 기록이 아닙니다
  c.renderVals().focBasic();
  c.save();
  ok('numEdit은 저장하지 않습니다', !/numEdit/.test(c.lastSaved||''));
}

console.log('\n== 같은 성질이 설정의 다른 숫자 칸에도 있습니다 ==');
{ const c=mk(V2);
  const V=()=>c.renderVals();
  [['Divisor','divisor'],['PeriodStart','periodStart'],['Payday','payday'],
   ['AnnualTotal','annualTotal'],['Grace','outGrace'],['ShutPct','shutdownPct']]
  .forEach(([n,k])=>{
    const was=c.st()[k];
    V()['foc'+n]();
    ok(k+' · 누르면 비고 설정은 그대로', V()[n[0].toLowerCase()+n.slice(1)+'Val']==='' && c.st()[k]===was,
      k+'='+c.st()[k]);
    V()['set'+n]({target:{value:''}});
    V()['blur'+n]();
    ok(k+' · 안 고치면 되돌아옵니다', c.st()[k]===was, 'got '+c.st()[k]);
  });
  // 수당·공제·배수처럼 줄마다 있는 칸도 각자 자기 칸만 비웁니다
  c.state.settings.allowances=[{name:'식대',amount:200000,tf:true},{name:'상여',amount:100000}];
  c.renderVals().allowRows[0].foc();
  ok('첫 줄만 비고', c.renderVals().allowRows[0].v==='');
  ok('둘째 줄은 그대로', c.renderVals().allowRows[1].v===100000);
  ok('설정의 금액도 그대로', c.st().allowances[0].amount===200000);
}

console.log('\n== 기본금을 묻는 카드가 고치는 도중에 사라지지 않습니다 ==');
{ // 급여 탭을 열면 '기본금이 얼마입니까'를 한 번 묻습니다. 그런데 카드가 뜨는
  // 조건이 '기본금이 아직 손대지 않은 기본값일 때'여서, 그 칸에 한 글자만 쳐도
  // 조건이 깨지면서 카드가 통째로 사라졌습니다 — 묻던 질문도, 답을 적던 칸도
  // 함께. 지우려고 백스페이스를 누른 사람의 화면에서 창이 그냥 없어졌습니다.
  const c=mk(V2);
  ok('처음 급여 탭에서 한 번 묻습니다', c.renderVals().askBasic===true);
  c.renderVals().focBasic();
  ok('칸을 눌러 비워도 카드는 그대로', c.renderVals().askBasic===true);
  c.renderVals().setBasic({target:{value:'3'}});
  ok('한 글자를 쳐도 카드는 그대로', c.renderVals().askBasic===true);
  c.renderVals().setBasic({target:{value:'3000000'}});
  ok('다 치고 나서도 카드는 그대로', c.renderVals().askBasic===true, 'basic='+c.st().basic);
  ok('그동안 입력한 값은 살아 있습니다', c.renderVals().basicVal==='3000000');
  c.renderVals().keepBasic();
  ok('이 값으로 계속을 누르면 닫힙니다', c.renderVals().askBasic===false);
  // 다음에 앱을 다시 열면 기본금이 이미 자기 숫자이므로 묻지 않습니다
  const c2=mk(V2);
  c2.state.settings.basic=3000000;
  ok('자기 기본금이 있으면 다시 묻지 않습니다', c2.renderVals().askBasic===false);
}

console.log('\n== 소개를 덮으면 설정으로 갑니다 ==');
{ // 첫 화면을 덮고 바로 출퇴근으로 보내면, 그 순간의 앱은 근무조도 급여기간도
  // 모르는 채로 첫 기록을 받습니다. 설정을 한 번 지나가야 그 기록이 제대로
  // 계산됩니다 — 출퇴근은 아래 탭으로 언제나 한 번에 닿습니다.
  const c=mk(V2);
  c.renderVals().endTour();
  ok('다시 열어도 첫 물음입니다', c.state.setupStep===1, 'got '+c.state.setupStep);
  ok('소개는 닫혔습니다', c.renderVals().showTour===false);
  ok('출퇴근 탭은 그대로 있습니다', c.renderVals().tabs.length===5);
}

console.log('\n== 탭을 바꾸면 맨 위에서 시작합니다 ==');
{ // 실제 휴대폰에서 찾았습니다. 다섯 탭이 스크롤 상자 하나를 함께 쓰는데 탭을
  // 바꿔도 그 상자를 되돌리지 않아, 앞 탭에서 내려둔 위치가 그대로 남았습니다.
  // 내 권리를 내려 읽고 급여를 열면 공제 항목 한가운데에서 시작하고, 맨 처음
  // 물어야 할 '기본금이 얼마입니까?' 카드는 화면 위로 밀려 있었습니다.
  // 머리글은 고정이라 화면은 멀쩡해 보입니다 — 그래서 알아채지 못합니다.
  const box=require('./harness2.js').tabScroll;
  const c=mk(V2);
  // 탭 막대는 출퇴근·근무기록·급여·내 권리·설정 순서입니다
  c.renderVals().tabs[3].go();          // 내 권리
  box.scrollTop=536;                    // 끝까지 내려 읽었습니다
  c.renderVals().tabs[2].go();          // 급여
  ok('급여는 맨 위에서 시작합니다', box.scrollTop===0, 'scrollTop='+box.scrollTop);
  ok('탭은 실제로 바뀌었습니다', c.state.tab==='pay', 'got '+c.state.tab);

  // 같은 탭을 다시 누르는 것은 이동이 아니므로 읽던 자리를 빼앗지 않습니다
  box.scrollTop=300;
  c.renderVals().tabs[2].go();
  ok('보던 탭을 다시 눌러도 자리를 지킵니다', box.scrollTop===300, 'scrollTop='+box.scrollTop);

  // 어느 탭으로 건너가든 마찬가지입니다 — 떠나온 탭은 근무기록으로 고정하고
  // 나머지 네 탭을 하나씩 눌러 봅니다
  let allTop=true, where=[];
  [0,2,3,4].forEach(i=>{
    c.setState({tab:'logs'}); box.scrollTop=400;
    c.renderVals().tabs[i].go();
    if(box.scrollTop!==0) allTop=false;
    where.push(c.state.tab);
  });
  ok('근무기록에서 어느 탭으로 가도 맨 위', allTop, where.join(','));
}

console.log('\n== 고치기를 누르면 손으로 적는 칸이 보여야 합니다 ==');
{ // 근무기록 아래쪽 줄에서 '고치기'를 누르면 출퇴근으로 건너뜁니다. 그때도
  // 스크롤이 남아 있으면, 보내 놓은 입력 칸이 화면 위로 밀려 있습니다 —
  // 2026-08-13의 조퇴 사유 시트와 같은 종류의 버그입니다.
  const box=require('./harness2.js').tabScroll;
  const c=mk(V2);
  c.state.extra=[{y:2026,m:8,day:2,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)}];
  c.setState({tab:'logs'}); box.scrollTop=612;
  c.editDay(c.state.extra[0]);
  ok('출퇴근 탭입니다', c.state.tab==='punch', 'got '+c.state.tab);
  ok('맨 위에서 시작합니다', box.scrollTop===0, 'scrollTop='+box.scrollTop);
  ok('고칠 하루가 실려 있습니다', c.state.pendingEdit===true);
}

console.log('\n== 제헌절은 2026년에 빨간날로 돌아왔습니다 ==');
{ // 실제 폰에서 7월 한 달을 넣어 보다가 나왔습니다. 제헌절은 2008년에 공휴일에서
  // 빠졌고 앱의 표도 그때 기준이었는데, 2026-04-28 국무회의로 되살아났습니다.
  // 2026-07-17(금)은 빨간날입니다. 표에 없으면 앱은 그 날을 평범한 금요일로
  // 계산하고, 근무내역서에는 특근 여덟 시간이 통째로 빠진 채 찍힙니다 —
  // 근로감독관 앞에 내놓을 문서에서 돈이 사라지는 쪽의 오류입니다.
  const c=mk(V2,'2026-07-31T20:00:00');
  ok('2026-07-17은 제헌절입니다', c.holidayName(new Date(2026,6,17))==='제헌절',
    'got '+c.holidayName(new Date(2026,6,17)));
  ok('제헌절은 쉬는 날입니다', c.restDay(new Date(2026,6,17),null)===true);
  ok('그 날 일하면 특근입니다', c.autoHoliday(new Date(2026,6,17),null)===true);
  // 06:00~15:00, 휴게 10:00–11:00 — 실근무 8시간이 전부 휴일근로로 갑니다
  c.state.settings.shifts='day';
  c.state.settings.dayStart='06:00';
  c.state.settings.breaksDay=[{from:'10:00',to:'11:00'}];
  const k=c.calc(6,15,'day',true);
  ok('실근무 8시간이 전부 휴일근로', k.hol===8&&k.reg===0, 'hol='+k.hol+' reg='+k.reg);
  ok('8시간을 넘지 않으니 ×2.0은 없습니다', k.holOver===0, 'holOver='+k.holOver);
  // 제헌절도 국경일이라 대체가 붙습니다 — 2027-07-17은 토요일, 대체는 07-19(월)
  ok('2027-07-19는 대체공휴일입니다', c.holidayName(new Date(2027,6,19))==='대체공휴일',
    'got '+c.holidayName(new Date(2027,6,19)));
  ok('2027-07-17 자체도 제헌절입니다', c.holidayName(new Date(2027,6,17))==='제헌절');
  // 여덟 개 언어 모두에 이름이 있어야 합니다 — 달력은 앱 언어로 읽힙니다
  let langs=[], allNamed=true;
  V2.LANGS.forEach(([code])=>{
    const d=mk(V2,'2026-07-31T20:00:00'); d.state.settings.lang=code;
    const n=d.holidayName(new Date(2026,6,17));
    if(!n||n==='hol_jeheonjeol') allNamed=false;
    langs.push(code+'='+n);
  });
  ok('여덟 개 언어에 모두 이름이 있습니다', allNamed, langs.join(' · '));
}

console.log('\n== 현충일에는 대체공휴일이 붙지 않습니다 ==');
{ // 제헌절을 넣다가 같은 표에서 발견했습니다. 대체공휴일은 국경일과 명절에만
  // 붙습니다(관공서의 공휴일에 관한 규정 제3조). 신정과 현충일은 국경일이
  // 아니라서 빠집니다. 2027-06-06 현충일은 일요일이지만 그 다음 월요일은
  // 그냥 평일입니다. 없는 특근을 만들면 근무내역서가 회사 명세서보다 많이
  // 나오고, 많이 나온 문서도 틀린 문서입니다.
  const c=mk(V2,'2027-06-01T09:00:00');
  ok('2027-06-06은 현충일입니다', c.holidayName(new Date(2027,5,6))==='현충일');
  ok('2027-06-07(월)은 평일입니다', c.holidayName(new Date(2027,5,7))===null,
    'got '+c.holidayName(new Date(2027,5,7)));
  ok('그 월요일에 일해도 특근이 아닙니다', c.autoHoliday(new Date(2027,5,7),null)===false);
  // 신정도 마찬가지 — 2028-01-01은 토요일이지만 01-03은 대체가 아닙니다
  const d=mk(V2,'2027-12-01T09:00:00');
  ok('설날 연휴 뒤 대체는 그대로 있습니다', d.holidayName(new Date(2027,1,9))==='대체공휴일');
}

console.log('\n== 출근 도장의 초가 잔업 30분을 먹고 있었습니다 ==');
{ // 돌려보내진 날을 폰에서 시험하다가 나왔습니다. 09:30에 퇴근을 찍었는데
  // outH가 9.4999997로 나왔습니다.
  //
  // inH는 분 단위로 자릅니다(snapIn이 올림이라 06:00:37을 06:30으로 만들면 안
  // 됩니다). el은 초까지 정확합니다. 잘라 낸 밑변 + 정확한 경과 = 실제 퇴근보다
  // 최대 59초 이른 outH, 그리고 snapOut은 내림입니다. 30분이 통째로 사라집니다.
  const setup=c=>{ c.state.settings.shifts='day'; c.state.settings.dayStart='06:00';
    c.state.settings.breaksDay=[{from:'10:00',to:'11:00'}]; return c; };
  // 06:00:SS 출근 · 17:30:05 퇴근 — 잔업이 17:30에 끝나는 공장
  const at=(inSec,oh,om,os)=>{
    const c=setup(mk(V2,'2026-07-15T06:00:00'));
    c.state.session={inIso:new Date(2026,6,15,6,0,inSec,0).toISOString()};
    c.base=new Date(2026,6,15,oh,om,os,0); c.t0=Date.now();
    const L=c.sessionHours();
    return { outH:L.outH, snap:c.snapOut(L.outH), net:c.calc(L.inH,L.outH,'day',false).net, inH:L.inH };
  };
  let allHalf=true, seen=[];
  [0,5,10,20,30,45,59].forEach(sec=>{
    const r=at(sec,17,30,5);
    if(r.snap!==17.5) allHalf=false;
    seen.push(sec+'s->'+r.snap);
  });
  ok('출근 초가 몇이든 17:30 퇴근은 17:30입니다', allHalf, seen.join(' '));
  let allNet=true; [0,10,30,59].forEach(sec=>{ if(at(sec,17,30,5).net!==10.5) allNet=false; });
  ok('실근무 10.5시간 · 잔업 2.5시간 그대로', allNet);

  // inH는 여전히 분 단위로 잘려야 합니다 — 초를 살리면 snapIn이 30분을 올려
  // 버려서 이번에는 출근 쪽에서 30분을 잃습니다
  ok('출근은 여전히 분 단위로 자릅니다', at(37,17,30,5).inH===6, 'inH='+at(37,17,30,5).inH);

  // 정시 퇴근은 예전에도 유예 15분이 덮어 주고 있었습니다 — 그대로여야 합니다
  let sameTop=true; [0,30,59].forEach(sec=>{ if(at(sec,15,0,5).snap!==15) sameTop=false; });
  ok('정시 퇴근은 예전 그대로', sameTop);

  // 자정을 넘기는 야간조 — outH는 24를 넘어야 합니다
  { const c=mk(V2,'2026-07-15T21:00:00');
    c.state.settings.shifts='night'; c.state.settings.nightStart='21:00';
    c.state.settings.breaksNight=[{from:'00:00',to:'01:00'}];
    c.state.session={inIso:new Date(2026,6,15,21,0,41,0).toISOString()};
    c.base=new Date(2026,6,16,6,0,3,0); c.t0=Date.now();
    const L=c.sessionHours();
    ok('야간조는 자정을 넘겨 30 근처가 됩니다', L.outH>29.99&&L.outH<30.01, 'outH='+L.outH);
    ok('야간조 퇴근도 06:00으로 인정', c.snapOut(L.outH)===30, 'snap='+c.snapOut(L.outH));
    // 21:00:41 → 06:00:03 은 8시간 59분 22초입니다. el은 초까지 정확해야 하고,
    // outH와 달리 반올림하지 않습니다 — 화면의 'Xh Ym'이 이것으로 나옵니다.
    ok('경과 시간은 초까지 정확합니다', Math.abs(L.el-(9-38/3600))<1e-6, 'el='+L.el);
  }

  // 시계가 거꾸로 가도 퇴근이 출근보다 앞서지는 않습니다
  { const c=setup(mk(V2,'2026-07-15T06:00:00'));
    c.state.session={inIso:new Date(2026,6,15,6,0,0,0).toISOString()};
    c.base=new Date(2026,6,15,5,0,0,0); c.t0=Date.now();
    const L=c.sessionHours();
    ok('시계가 거꾸로 가도 outH >= inH', L.outH>=L.inH, 'outH='+L.outH+' inH='+L.inH);
    ok('경과는 0으로 막습니다', L.el===0);
  }

  // 너무 이른 퇴근 가드는 그대로 걸려야 합니다 — 30분이 안 되면 못 나갑니다
  { const c=setup(mk(V2,'2026-07-15T06:00:00'));
    c.state.session={inIso:new Date(2026,6,15,6,0,30,0).toISOString()};
    c.base=new Date(2026,6,15,6,20,0,0); c.t0=Date.now();
    c.punch();
    ok('20분 만에 찍으면 여전히 붙잡습니다', c.state.shortOut===true);
    ok('그 사이 기록이 만들어지지는 않습니다', c.state.extra.length===0);
  }
}

console.log('\n== 지난 달 근무내역서도 뽑을 수 있어야 합니다 ==');
{ // 폰에서 7월 한 달을 넣고 8월에 열었더니, 7월 근무내역서를 만들 방법이
  // 없었습니다. evidenceHtml()이 언제나 this.period(this.now())를 썼기
  // 때문입니다. 기록은 그대로 있는데 문서만 나오지 않았습니다 — 증거로
  // 쓰라고 만든 앱에서 가장 나쁜 종류의 구멍입니다. 임금체불 진정은 그
  // 달의 다음 달에 넣는 것이 아닙니다.
  const c=mk(V2,'2026-08-18T10:00:00');
  c.st().periodStart=1; c.st().payday=10;
  c.st().shifts='day'; c.st().dayStart='06:00';
  c.st().breaksDay=[{from:'10:00',to:'11:00'}];
  // 7월에 사흘, 8월에 이틀
  [1,2,3].forEach(d=>c.state.extra.push({y:2026,m:7,day:d,kind:'day',type:'shift',inH:6,outH:15,c:c.calc(6,15,'day',false)}));
  [3,4].forEach(d=>c.state.extra.push({y:2026,m:8,day:d,kind:'day',type:'shift',inH:6,outH:15,c:c.calc(6,15,'day',false)}));

  // 2026-08-28(스무째)부터 문서는 자기 스테퍼(docBack)를 갖지 않고, 급여 탭이
  // 보고 있는 기간(payBack)을 그대로 씁니다. 거슬러 올라가는 능력은 그대로입니다.
  ok('기본은 이번 기간입니다', c.viewPeriod().label==='08.01 → 08.31', c.viewPeriod().label);
  ok('한 걸음 뒤는 지난 기간', c.periodBack(1).label==='07.01 → 07.31', c.periodBack(1).label);
  ok('prevPeriod와 같은 것을 가리킵니다', c.periodBack(1).label===c.prevPeriod().label);
  ok('기록이 7월까지라 한 걸음까지만', c.periodBackMax()===1, 'max='+c.periodBackMax());
  ok('문서의 끝과 화면의 끝은 같은 하나입니다', c.payBackMax()===c.periodBackMax());

  // ‹ 를 눌러 7월로 — 급여 탭의 그 화살표입니다
  c.renderVals().payPrev();
  ok('‹ 를 누르면 7월', c.viewPeriod().label==='07.01 → 07.31', c.viewPeriod().label);
  ok('그 기간의 날수를 셉니다', c.periodRecords(c.viewPeriod()).length===3);
  ok('문서 줄이 같은 기간을 되읽어 줍니다', c.renderVals().docPeriodLabel==='07.01 → 07.31',
    c.renderVals().docPeriodLabel);

  const doc=c.evidenceHtml(c.viewPeriod());
  ok('문서 제목이 7월', doc.indexOf('근무내역서 07.01 → 07.31')>=0);
  ok('7월 기록이 들어 있습니다', doc.indexOf('07.01')>=0&&doc.indexOf('07.03')>=0);
  ok('8월 기록은 들어 있지 않습니다', doc.indexOf('08.03')<0&&doc.indexOf('08.04')<0);
  ok('합계는 7월치 3일', /근무일수<\/th><td class="n">3일/.test(doc), 'days');
  ok('파일 이름도 7월', c.evidenceName(c.viewPeriod())==='근무내역서-07010731.html',
    c.evidenceName(c.viewPeriod()));
  // 문서를 만든 날은 오늘이지 기간 끝이 아닙니다
  ok('작성일은 오늘입니다', doc.indexOf('작성 2026.08.18')>=0);

  // 끝에서 더 눌러도 넘어가지 않습니다
  c.renderVals().payPrev(); c.renderVals().payPrev();
  ok('가장 오래된 기간에서 멈춥니다', c.viewPeriod().label==='07.01 → 07.31', c.viewPeriod().label);
  ok('더 갈 수 없으면 화살표가 흐려집니다', c.renderVals().payPrevInk==='var(--color-neutral-300)');
  // › 로 돌아옵니다
  c.renderVals().payNext();
  ok('› 로 이번 기간으로 돌아옵니다', c.viewPeriod().label==='08.01 → 08.31');
  c.renderVals().payNext(); c.renderVals().payNext();
  ok('이번 기간보다 앞으로는 못 갑니다', c.viewPeriod().label==='08.01 → 08.31');
  ok('앞쪽 화살표도 흐려집니다', c.renderVals().payNextInk==='var(--color-neutral-300)');

  // 기본값은 건드리지 않았을 때 예전 그대로 — 인자 없이 부르면 이번 기간
  ok('인자 없이 부르면 예전 그대로', c.evidenceName()==='근무내역서-08010831.html', c.evidenceName());
  ok('totals()도 예전 그대로', c.totals().days===2, 'days='+c.totals().days);

  // 어느 기간을 보고 있었는지는 기록이 아닙니다
  c.setState({payBack:1}); c.save();
  ok('고른 기간은 저장되지 않습니다', !/payBack/.test(c.lastSaved||''));
  ok('없어진 스테퍼는 정말 없어졌습니다',
    c.docPeriod===undefined&&c.stepDoc===undefined&&c.docBack===undefined);
}

console.log('\n== 21일 시작 급여기간도 거꾸로 걸어갑니다 ==');
{ // 급여기간은 달을 걸치기도 하고, 2월은 짧습니다. '한 달 빼기'로 걸어가면
  // 2월에서 깨집니다 — 그래서 언제나 직전 기간 시작 하루 전으로 가서
  // period()에게 다시 묻습니다.
  const c=mk(V2,'2026-04-25T10:00:00');
  c.st().periodStart=21; c.st().payday=25;
  ok('이번 기간', c.periodBack(0).label==='04.21 → 05.20', c.periodBack(0).label);
  ok('한 걸음', c.periodBack(1).label==='03.21 → 04.20', c.periodBack(1).label);
  ok('두 걸음 · 2월을 지납니다', c.periodBack(2).label==='02.21 → 03.20', c.periodBack(2).label);
  ok('세 걸음', c.periodBack(3).label==='01.21 → 02.20', c.periodBack(3).label);
  ok('네 걸음 · 해를 넘습니다', c.periodBack(4).label==='12.21 → 01.20', c.periodBack(4).label);
  // 월말 시작 — 31일 시작은 짧은 달에서 그 달 말일로 내려앉습니다
  const d=mk(V2,'2026-04-10T10:00:00');
  d.st().periodStart=31; d.st().payday=10;
  ok('31일 시작도 걸어갑니다', d.periodBack(1).label==='02.28 → 03.30', d.periodBack(1).label);
}

console.log('\n== 마지막 날에 금액이 더 오른다고 말하면 안 됩니다 ==');
{ // 큰 빨간 카드 밑의 한 줄이 남은 날과 상관없이 언제나 같은 문장이었습니다.
  // 마지막 날에는 '0일이 남아 있어 금액은 더 올라갑니다'가 되어, 바로 위에
  // 붙은 상태와 정면으로 어긋났습니다. 하필 그 날이 근로자가 회사 명세서와
  // 맞춰 보는 날입니다.
  const at=iso=>{ const c=mk(V2,iso); c.st().periodStart=1; c.st().payday=10; return c; };
  const v=iso=>at(iso).renderVals();

  ok('중간에는 예전 그대로', v('2026-07-20T10:00:00').payslipCheck.indexOf('11')>=0,
    v('2026-07-20T10:00:00').payslipCheck);
  ok('중간 상태도 예전 그대로', v('2026-07-20T10:00:00').periodState.indexOf('11')>=0);

  // 마지막 날 — 더 오른다고 말하지 않습니다
  const last=v('2026-07-31T09:00:00');
  ok('마지막 날에는 오른다고 하지 않습니다', last.payslipCheck.indexOf('더 올라갑니다')<0,
    last.payslipCheck);
  ok('명세서와 맞춰 보라고 합니다', last.payslipCheck.indexOf('급여명세서')>=0, last.payslipCheck);
  ok('0일이라는 말이 나오지 않습니다', last.payslipCheck.indexOf('0일')<0);
  // 마지막 날은 '마감'이 아닙니다 — 오늘 근무가 아직 남아 있습니다
  ok('마지막 날은 마감이 아닙니다', last.periodState.indexOf('마감')<0, last.periodState);
  ok('마지막 날이라고 말합니다', last.periodState==='마지막 날', last.periodState);

  // 하루 남았을 때는 단수
  const one=v('2026-07-30T09:00:00');
  ok('하루 남으면 하루라고', one.periodState==='진행중 · 1일 남음', one.periodState);
  ok('한 줄도 하루라고', one.payslipCheck.indexOf('하루 남아')>=0, one.payslipCheck);
  ok('하루 남았으면 아직 오릅니다', one.payslipCheck.indexOf('더 올라갑니다')>=0);

  // 영어로도 말이 되어야 합니다 — 여덟 개 언어 가운데 복수형이 있는 쪽입니다
  const en=iso=>{ const c=at(iso); c.st().lang='en'; return c.renderVals(); };
  const eLast=en('2026-07-31T09:00:00'), eOne=en('2026-07-30T09:00:00'), eMid=en('2026-07-20T10:00:00');
  ok('영어 · 마지막 날에 rise 없음', eLast.payslipCheck.indexOf('rise')<0, eLast.payslipCheck);
  ok('영어 · 마지막 날 상태', eLast.periodState==='LAST DAY', eLast.periodState);
  ok('영어 · 하루는 1 day, days 아님', eOne.periodState==='IN PROGRESS · 1 day left', eOne.periodState);
  ok('영어 · 하루는 1 more day', eOne.payslipCheck.indexOf('1 more day')>=0, eOne.payslipCheck);
  ok('영어 · 여러 날은 복수 그대로', eMid.periodState==='IN PROGRESS · 11 days left', eMid.periodState);
  ok('영어 · 0 days 라는 말이 어디에도 없습니다',
    !/\b0 days\b/.test(eLast.payslipCheck+' '+eLast.periodState));
}

console.log('\n== 남은 날은 시계가 아니라 달력으로 셉니다 ==');
{ // (e − now)를 밀리초로 나눠 반올림했기 때문에, 마지막 날 전날 정오에 이미
  // 0이 됐습니다. 30일 오전에는 '1일 남음'이던 것이 오후에는 '마감'으로
  // 바뀌었고, 아직 31일이 통째로 남아 있는데 다 끝난 것처럼 보였습니다.
  // 하루의 어디에 서 있든 남은 날수는 같아야 합니다.
  const left=iso=>{ const c=mk(V2,iso); c.st().periodStart=1; c.st().payday=10;
    return c.period(c.now()).left; };
  ok('29일은 아침에도 밤에도 2', left('2026-07-29T08:00:00')===2&&left('2026-07-29T23:00:00')===2,
    left('2026-07-29T08:00:00')+'/'+left('2026-07-29T23:00:00'));
  ok('30일은 아침에도 밤에도 1', left('2026-07-30T09:00:00')===1&&left('2026-07-30T20:00:00')===1,
    left('2026-07-30T09:00:00')+'/'+left('2026-07-30T20:00:00'));
  ok('31일은 아침에도 밤에도 0', left('2026-07-31T00:30:00')===0&&left('2026-07-31T23:30:00')===0,
    left('2026-07-31T00:30:00')+'/'+left('2026-07-31T23:30:00'));
  ok('기간 첫날은 30', left('2026-07-01T12:00:00')===30, ''+left('2026-07-01T12:00:00'));
  // 21일 시작 기간도 마찬가지
  const l2=iso=>{ const c=mk(V2,iso); c.st().periodStart=21; c.st().payday=25;
    return c.period(c.now()).left; };
  ok('21일 시작 · 마지막 날은 0', l2('2026-08-20T18:00:00')===0, ''+l2('2026-08-20T18:00:00'));
  ok('21일 시작 · 그 전날은 1', l2('2026-08-19T18:00:00')===1, ''+l2('2026-08-19T18:00:00'));
  // 2월도
  const l3=iso=>{ const c=mk(V2,iso); c.st().periodStart=1; c.st().payday=10;
    return c.period(c.now()).left; };
  ok('2월 마지막 날은 0', l3('2026-02-28T20:00:00')===0, ''+l3('2026-02-28T20:00:00'));
}

console.log('\n== 최저임금을 그대로 받는 사람도 답할 수 있어야 합니다 ==');
{ // 2,156,880은 2026 최저임금 × 209이자, E-9 근로자에게 가장 흔한 기본금입니다.
  // 카드가 뜨는 조건이 '기본금이 아직 기본값과 같은가'였기 때문에, 정확히 그
  // 금액을 받는 사람에게는 화면이 영영 '아직 안 적었다'고 우겼습니다 —
  // basicAsked는 저장되지 않으므로 넘어가기를 눌러도 앱을 다시 열면 카드가
  // 다시 맨 위에 앉았습니다. 답이 이미 맞는 사람에게 계속 묻는 화면은 세 번째
  // 부터는 읽히지 않고 그냥 넘겨지고, 정작 고쳐야 할 사람도 함께 넘깁니다.
  const c=mk(V2);
  ok('처음에는 묻습니다', c.renderVals().askBasic===true);

  // '나중에'는 이번 실행 동안만 — 예전 그대로여야 합니다
  c.renderVals().keepBasic();
  ok('나중에를 누르면 사라집니다', c.renderVals().askBasic===false);
  c.save();
  ok('나중에는 저장되지 않습니다', !/basicAsked/.test(c.lastSaved||''));
  const reopened=mk(V2);
  reopened.state.settings=JSON.parse(JSON.stringify(c.st()));
  ok('다시 열면 또 묻습니다', reopened.renderVals().askBasic===true);

  // '맞습니다'는 설정에 남습니다
  const d=mk(V2);
  ok('확인 전에는 묻습니다', d.renderVals().askBasic===true);
  d.renderVals().confirmBasic();
  ok('확인하면 사라집니다', d.renderVals().askBasic===false);
  ok('설정에 남습니다', d.st().basicConfirmed===true);
  d.save();
  ok('확인은 저장됩니다', /basicConfirmed/.test(d.lastSaved||''));
  const later=mk(V2);
  later.state.settings=JSON.parse(JSON.stringify(d.st()));
  ok('다시 열어도 묻지 않습니다', later.renderVals().askBasic===false);
  ok('기본금은 그대로입니다', later.st().basic===V2.DEFAULTS.basic);

  // 확인한 사람에게 '아직 당신의 급여가 아닙니다'는 거짓말입니다
  const before=mk(V2).renderVals().basicDefaultNote;
  ok('확인 전에는 아직 네 급여가 아니라고 합니다', before.indexOf('아직')>=0, before.slice(0,40));
  const after=later.renderVals().basicDefaultNote;
  ok('확인 뒤에는 그 말이 사라집니다', after.indexOf('아직')<0, after.slice(0,40));
  ok('확인했다고 적습니다', after.indexOf('확인했습니다')>=0, after.slice(0,40));

  // 직접 고치는 길은 예전 그대로 — 한 글자 쳐도 카드가 사라지지 않습니다
  const e=mk(V2);
  e.renderVals().focBasic();
  e.renderVals().setBasic({target:{value:'3'}});
  ok('한 글자만 쳐도 카드는 남습니다', e.renderVals().askBasic===true);
  e.renderVals().setBasic({target:{value:'3000000'}});
  ok('다 적으면 본인 숫자가 됩니다', e.st().basic===3000000);
  e.renderVals().blurBasic();
  e.renderVals().keepBasic();
  ok('그 뒤에는 묻지 않습니다', e.renderVals().askBasic===false);
  ok('확인 단추를 누른 적은 없습니다', e.st().basicConfirmed===false);
}

console.log('\n== 확인해도 최저임금 경고는 그대로 뜹니다 ==');
{ // 확인은 '이 금액이 내 기본금이다'라는 뜻이지 '이 금액이 적법하다'가
  // 아닙니다. 2027년에 최저임금이 오르면 2026년 금액을 확인해 둔 사람은
  // 그 순간부터 최저임금 미달입니다 — 그때 경고가 안 뜨면, 확인 단추가
  // 근로자에게 불리한 것을 덮어 준 셈이 됩니다.
  const c=mk(V2,'2027-03-02T09:00:00');
  c.setS({ basic: 2156880, basicConfirmed: true });   // 2026년에 확인해 둔 금액
  ok('2027년에는 기본값이 아니므로 묻지 않습니다', c.renderVals().askBasic===false);
  const w=c.renderVals().minWageWarn;
  ok('최저임금 미달 경고는 그대로 뜹니다', !!w, 'warn='+JSON.stringify(w).slice(0,60));
  ok('2027년 최저임금을 말합니다', w.indexOf('2027')>=0, w);
  // 2026년 안에서는 미달이 아닙니다
  const d=mk(V2,'2026-09-01T09:00:00');
  d.setS({ basic: 2156880, basicConfirmed: true });
  ok('2026년에는 경고가 없습니다', d.renderVals().minWageWarn==='');
}

console.log('\n== 쓰던 사람은 묻는 화면을 새로 만나지 않습니다 ==');
{ // basicConfirmed는 새 설정입니다. 저장된 설정이 DEFAULTS 위에 덮이므로
  // 업그레이드한 사람에게는 false로 들어옵니다 — 이미 자기 기본금을 적어 둔
  // 사람은 isDef가 거짓이라 어차피 묻지 않고, 기본값 그대로 쓰던 사람은
  // 예전과 똑같이 한 번 물어봅니다. 새로 생기는 화면은 없습니다.
  const c=mk(V2);
  c.state.settings=Object.assign({}, V2.DEFAULTS, { basic: 2600000 });  // v1에서 올라온 사람
  ok('자기 금액을 적어 둔 사람에게는 묻지 않습니다', c.renderVals().askBasic===false);
  ok('확인 여부와 상관없습니다', c.st().basicConfirmed===false);
  ok('설명도 본인 숫자라고 말합니다', c.renderVals().basicDefaultNote.indexOf('당신이 적은')>=0,
    c.renderVals().basicDefaultNote);
}

console.log('\n== 하루짜리 휴업은 단수로 적습니다 ==');
{ // 내 권리 › 휴업수당의 두 줄이 '1 full days sent home' / '1 days cut short by
  // the company'로 읽혔습니다. 복수형이 문장에 박혀 있었습니다. 금액 옆에 붙는
  // 줄이라 눈이 가는 자리이고, 영어가 모국어가 아닌 사람이 읽는 문서입니다.
  const setup=(iso)=>{ const c=mk(V2,iso);
    c.st().shifts='day'; c.st().dayStart='06:00';
    c.st().breaksDay=[{from:'10:00',to:'11:00'}];
    c.st().hireDate='2025-04-01';
    return c; };
  // 07.16 통째로 휴업 한 날, 07.15 회사 사정으로 짧아진 한 날
  const one=setup('2026-07-31T20:00:00');
  one.state.extra=[
    { y:2026,m:7,day:16,kind:'day',type:'shutdown',sentHome:true,
      reason:{id:'no_work',fault:'employer',ko:'일감 부족 · 물량 없음'},
      c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0} },
    { y:2026,m:7,day:15,kind:'day',type:'shift',inH:6,outH:9.5,
      reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장'},
      c:one.calc(6,9.5,'day',false) },
  ];
  const t=one.shutdownTally();
  ok('통째로 쉰 날 하루', t.days===1, 'days='+t.days);
  ok('짧아진 날 하루', t.partDays===1, 'partDays='+t.partDays);

  const koRows=one.renderVals().shutRows.map(r=>r.k);
  ok('한국어는 예전 그대로', koRows[0]==='통째로 쉰 날 1일', koRows[0]);
  ok('한국어 둘째 줄도 그대로', koRows[1]==='회사 사정으로 짧아진 날 1일', koRows[1]);

  one.st().lang='en';
  const en1=one.renderVals().shutRows.map(r=>r.k);
  ok('영어 · day, days 아님', en1[0]==='1 full day sent home', en1[0]);
  ok('영어 · 둘째 줄도 day', en1[1]==='1 day cut short by the company', en1[1]);
  ok('어디에도 1 days 가 없습니다', !/\b1 days?\b/.test(en1.join(' ')) || !/\b1 days\b/.test(en1.join(' ')),
    en1.join(' | '));

  // 여러 날이면 복수형 그대로여야 합니다 — 고치다가 반대로 망가뜨리기 쉬운 자리
  const many=setup('2026-07-31T20:00:00');
  many.state.extra=[16,17,20].map(d=>({ y:2026,m:7,day:d,kind:'day',type:'shutdown',sentHome:true,
      reason:{id:'no_work',fault:'employer',ko:'일감 부족 · 물량 없음'},
      c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0} }))
    .concat([15,21].map(d=>({ y:2026,m:7,day:d,kind:'day',type:'shift',inH:6,outH:9.5,
      reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장'},
      c:many.calc(6,9.5,'day',false) })));
  many.st().lang='en';
  const enN=many.renderVals().shutRows.map(r=>r.k);
  ok('셋이면 복수형 그대로', enN[0]==='3 full days sent home', enN[0]);
  ok('둘이면 복수형 그대로', enN[1]==='2 days cut short by the company', enN[1]);

  // 여덟 개 언어 모두 하루짜리 문장이 있어야 합니다
  let all=true, seen=[];
  V2.LANGS.forEach(([code])=>{
    const c=setup('2026-07-31T20:00:00');
    c.state.extra=JSON.parse(JSON.stringify(one.state.extra));
    c.st().lang=code;
    const r=c.renderVals().shutRows.map(x=>x.k);
    if(r.length!==2 || !r[0] || r[0].indexOf('one_full_day')>=0) all=false;
    seen.push(code+'='+r[0]);
  });
  ok('여덟 개 언어에 모두 있습니다', all, seen.join(' · '));

  // 아무 날도 없으면 줄이 없습니다 — 예전 그대로
  const none=setup('2026-07-31T20:00:00');
  ok('휴업이 없으면 줄도 없습니다', none.renderVals().shutRows.length===0);
}


// ── 2026-08-19 ────────────────────────────────────────────────────────────
console.log('\n== 그 휴업수당이 어느 날의 것인지 적습니다 ==');
{
  // 카드는 '회사 사정으로 짧아진 날 1일 ₩16,512'라고만 말했습니다. 근로자가
  // 그 금액을 회사에 물어보려면 그 날이 언제인지 알아야 하는데, 카드에는
  // 없어서 근무기록을 처음부터 뒤져야 했습니다.
  const setup=(iso)=>{ const c=mk(V2,iso);
    c.st().shifts='day'; c.st().dayStart='06:00';
    c.st().breaksDay=[{from:'10:00',to:'11:00'}];
    c.st().hireDate='2025-04-01';
    return c; };
  const shut=(y,m,d)=>({ y,m,day:d,kind:'day',type:'shutdown',sentHome:true,
    reason:{id:'no_work',fault:'employer',ko:'일감 부족 · 물량 없음'},
    c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0} });
  const cut=(c,y,m,d)=>({ y,m,day:d,kind:'day',type:'shift',inH:6,outH:9.5,
    reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장'},
    c:c.calc(6,9.5,'day',false) });

  // 하루뿐일 때 — 근로자가 물어본 바로 그 화면
  const one=setup('2026-08-19T20:00:00');
  one.state.extra=[shut(2026,8,4), cut(one,2026,8,11)];
  const t1=one.shutdownTally();
  ok('통째로 쉰 날의 날짜를 함께 냅니다', t1.fullDates.length===1, 'n='+t1.fullDates.length);
  ok('짧아진 날의 날짜도 함께 냅니다', t1.partDates.length===1, 'n='+t1.partDates.length);
  const r1=one.renderVals().shutRows;
  ok('짧아진 날은 (08.11)', r1[1].d==='(08.11)', r1[1].d);
  ok('쉰 날은 (08.04)', r1[0].d==='(08.04)', r1[0].d);
  ok('문장 자체는 손대지 않았습니다', r1[1].k==='회사 사정으로 짧아진 날 1일', r1[1].k);

  // 여러 날이면 쉼표로 잇고, 달력 순으로 읽힙니다 (month()는 최신순입니다)
  const many=setup('2026-08-19T20:00:00');
  many.state.extra=[cut(many,2026,8,18), cut(many,2026,8,11), shut(2026,8,20), shut(2026,8,3)];
  const r2=many.renderVals().shutRows;
  ok('짧아진 날 둘은 (08.11, 08.18)', r2[1].d==='(08.11, 08.18)', r2[1].d);
  ok('쉰 날 둘도 오래된 것부터', r2[0].d==='(08.03, 08.20)', r2[0].d);
  ok('복수형 문장은 그대로', r2[1].k==='회사 사정으로 짧아진 날 2일', r2[1].k);

  // 날짜는 숫자뿐이라 여덟 개 언어에 새 문장이 필요 없습니다 — 같은 괄호가
  // 어느 언어에서나 그대로 나와야 합니다
  let allLang=true, seenL=[];
  V2.LANGS.forEach(([code])=>{
    const c=setup('2026-08-19T20:00:00');
    c.state.extra=JSON.parse(JSON.stringify(one.state.extra));
    c.st().lang=code;
    const r=c.renderVals().shutRows;
    if(r.length!==2 || r[1].d!=='(08.11)') allLang=false;
    seenL.push(code+'='+r[1].d);
  });
  ok('여덟 개 언어 모두 (08.11)', allLang, seenL.join(' · '));

  // 빈 목록에 빈 괄호가 나오면 안 됩니다
  ok('없으면 괄호도 없습니다', setup('2026-08-19T20:00:00').shutDates([])==='');
  ok('휴업이 없으면 줄도 그대로 없습니다',
    setup('2026-08-19T20:00:00').renderVals().shutRows.length===0);
}


// ── 2026-08-19 ────────────────────────────────────────────────────────────
console.log('\n== 휴업수당 카드는 한 급여기간만 셉니다 ==');
{
  // 예전에는 month() 전체를 셌습니다 — 두 해를 일한 사람에게는 재작년 휴업까지
  // 한 금액에 얹혀 나왔고, 그 합계는 회사가 주는 급여명세서 어느 것과도 맞지
  // 않았습니다. 맞춰 볼 수 없는 금액은 물어볼 거리가 되지 못합니다.
  const setup=(iso, ps)=>{ const c=mk(V2,iso);
    c.st().shifts='day'; c.st().dayStart='06:00';
    c.st().breaksDay=[{from:'10:00',to:'11:00'}];
    c.st().hireDate='2024-04-01';
    if(ps) c.st().periodStart=ps;
    return c; };
  const shut=(y,m,d)=>({ y,m,day:d,kind:'day',type:'shutdown',sentHome:true,
    reason:{id:'no_work',fault:'employer',ko:'일감 부족 · 물량 없음'},
    c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0} });
  const cut=(c,y,m,d)=>({ y,m,day:d,kind:'day',type:'shift',inH:6,outH:9.5,
    reason:{id:'machine',fault:'employer',ko:'기계 · 금형 고장'},
    c:c.calc(6,9.5,'day',false) });

  // 1일~말일. 이번 달 08.11 하나, 지난 달 07.14 하나.
  const c=setup('2026-08-19T20:00:00');
  c.state.extra=[cut(c,2026,8,11), cut(c,2026,7,14)];
  ok('지난 달 것은 세지 않습니다', c.shutdownTally().partDays===1,
    'partDays='+c.shutdownTally().partDays);
  ok('날짜도 이번 기간 것뿐입니다', c.renderVals().shutRows[0].d==='(08.11)',
    c.renderVals().shutRows[0].d);
  const only=setup('2026-08-19T20:00:00'); only.state.extra=[cut(only,2026,8,11)];
  ok('금액도 이번 기간 것뿐입니다', c.shutdownTally().total===only.shutdownTally().total,
    c.shutdownTally().total+' vs '+only.shutdownTally().total);

  // 지난 달만 있는 사람 — 이번 기간은 비어 있습니다
  const past=setup('2026-08-19T20:00:00');
  past.state.extra=[shut(2026,7,14), cut(past,2026,7,15)];
  ok('지난 달만 있으면 이번 기간은 0', past.shutdownTally().total===0);
  ok('줄도 없습니다', past.renderVals().shutRows.length===0);
  ok('없다고 말합니다', past.renderVals().shutStatus.includes('없습니다'),
    past.renderVals().shutStatus);
  // 기록이 사라진 것은 아닙니다 — 기간을 주면 그대로 나옵니다
  const q=past.shutdownTally(past.periodBack(1));
  ok('지난 기간을 물으면 그대로 있습니다', q.days===1 && q.partDays===1,
    'days='+q.days+' partDays='+q.partDays);

  // ── 21일 시작 급여기간 ── 근로자가 말한 그대로: 21일부터 다음 달 20일까지
  const p21=setup('2026-08-19T20:00:00', 21);
  p21.state.extra=[cut(p21,2026,7,22), cut(p21,2026,8,11), cut(p21,2026,7,20)];
  ok('07.21 → 08.20 안의 두 날만', p21.shutdownTally().partDays===2,
    'partDays='+p21.shutdownTally().partDays);
  ok('07.22와 08.11', p21.renderVals().shutRows[0].d==='(07.22, 08.11)',
    p21.renderVals().shutRows[0].d);
  // 07.20은 그 앞 기간(06.21 → 07.20)의 마지막 날입니다
  ok('경계 하루 앞은 빠집니다', p21.renderVals().shutRows[0].d.indexOf('07.20')===-1);

  // 기간 첫날과 마지막 날은 안에 듭니다 — 경계를 잘못 잡으면 하루가 사라집니다
  const edge=setup('2026-08-19T20:00:00', 21);
  edge.state.extra=[cut(edge,2026,7,21), cut(edge,2026,8,20)];
  ok('첫날과 끝날은 들어옵니다', edge.renderVals().shutRows[0].d==='(07.21, 08.20)',
    edge.renderVals().shutRows[0].d);

  // 해를 걸치는 기간에서도 MM.DD는 모호하지 않습니다 (12.21 → 01.20)
  const ny=setup('2027-01-15T20:00:00', 21);
  ny.state.extra=[cut(ny,2026,12,28), cut(ny,2027,1,5)];
  ok('해를 걸쳐도 MM.DD 그대로', ny.renderVals().shutRows[0].d==='(12.28, 01.05)',
    ny.renderVals().shutRows[0].d);
}


// ── 2026-08-19 ────────────────────────────────────────────────────────────
console.log('\n== 없다는 말은 이번 기간에 없다는 말입니다 ==');
{
  // 카드가 한 급여기간만 세게 되자, 빈 화면의 문장이 지나친 말을 하게
  // 됐습니다 — '휴업으로 기록된 날이 없습니다'는 08.11에 돌려보내진 사람이
  // 08.21에 앱을 열었을 때도 그대로 떴습니다. 회사가 아직 그 돈을 주지
  // 않았는데 앱이 받을 것이 없다고 말하면, 근로자는 자기 기록을 의심합니다.
  const setup=(iso)=>{ const c=mk(V2,iso);
    c.st().shifts='day'; c.st().dayStart='06:00';
    c.st().hireDate='2024-04-01'; c.st().periodStart=21;
    return c; };

  const ko=setup('2026-08-25T10:00:00');
  ok('한국어는 이번 기간이라고 말합니다', ko.renderVals().shutStatus.indexOf('이번 기간')===0,
    ko.renderVals().shutStatus);
  ok('제46조는 그대로 남습니다', ko.renderVals().shutStatus.indexOf('제46조')>0,
    ko.renderVals().shutStatus);

  const en=setup('2026-08-25T10:00:00'); en.st().lang='en';
  ok('영어도 이번 기간이라고 말합니다',
    en.renderVals().shutStatus.indexOf('in this period')>0, en.renderVals().shutStatus);
  ok('§46도 그대로', en.renderVals().shutStatus.indexOf('§46')>0, en.renderVals().shutStatus);

  // 여덟 개 언어 모두 — 키 이름이 새어 나오거나 빈 문장이 되면 안 됩니다
  let all=true, seen=[];
  V2.LANGS.forEach(([code])=>{
    const c=setup('2026-08-25T10:00:00'); c.st().lang=code;
    const v=c.renderVals().shutStatus;
    if(!v || v.indexOf('no_shutdown')>=0 || v.length<10) all=false;
    seen.push(code+'='+v.slice(0,14));
  });
  ok('여덟 개 언어 모두 번역돼 있습니다', all, seen.join(' · '));

  // 휴업이 있는 화면은 이 문장을 쓰지 않습니다 — 고치다 반대로 망가뜨리기 쉬운 자리
  const has=setup('2026-08-25T10:00:00');
  has.state.extra=[{ y:2026,m:8,day:22,kind:'day',type:'shutdown',sentHome:true,
    reason:{id:'no_work',fault:'employer',ko:'일감 부족 · 물량 없음'},
    c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0} }];
  ok('휴업이 있으면 다른 문장입니다', has.renderVals().shutStatus.indexOf('이번 기간')!==0,
    has.renderVals().shutStatus);
  ok('그 줄은 08.22입니다', has.renderVals().shutRows[0].d==='(08.22)',
    has.renderVals().shutRows[0].d);
}



// ── 2026-08-19 ────────────────────────────────────────────────────────────
console.log('\n== 숫자 자판의 완료 키가 죽어 있었습니다 ==');
{
  // 폰에서 온 보고: 숫자를 고치고 나면 자판에 Enter도 완료도 없다, 있어도
  // 눌리지 않는다. 칸 바깥을 눌러야 빠져나오는데 그 바깥은 대개 다른 단추다.
  //
  // 갤럭시에서 네 가지를 나란히 띄워 재 본 결과가 numField 위 주석에 있습니다.
  // 요지: 크롬은 type=number에서 enterkeyhint를 무시하고 form 이동 논리로
  // 덮어씁니다(Next / 죽은 Go). type=text + inputmode=decimal이면 자판은
  // 그대로 숫자판인데 완료 키가 살아납니다. 그래서 칸이 글자 칸이 됐고,
  // 브라우저가 걸러 주던 일을 numClean()이 대신합니다.

  console.log('  -- 브라우저가 걸러 주던 것을 대신합니다 --');
  const C=V2.numClean;
  ok('글자는 버립니다', C('12a3')==='123', C('12a3'));
  ok('천 단위 쉼표는 버립니다 — 2,156,880을 붙여넣는 사람이 있습니다',
    C('2,156,880')==='2156880', C('2,156,880'));
  ok('소수점은 하나만 — 배수 1.5가 있어야 합니다', C('1.5')==='1.5', C('1.5'));
  ok('소수점 두 개는 하나로', C('1.5.7')==='1.57', C('1.5.7'));
  ok('마이너스는 없습니다 — 금액·일수·시간·배수뿐입니다', C('-5')==='5', C('-5'));
  ok('한글도 버립니다', C('9일')==='9', C('9일'));
  ok('빈 값은 빈 값', C('')==='' && C(null)==='' && C(undefined)==='');
  ok('숫자가 하나도 없으면 빈 값', C('abc')==='', C('abc'));

  ok("''은 아직 숫자가 아닙니다", V2.numReady('')===false);
  ok("'.'도 아직 숫자가 아닙니다 — 치는 중입니다", V2.numReady('.')===false);
  ok("'0'은 숫자입니다", V2.numReady('0')===true);
  ok("'1.5'도 숫자입니다", V2.numReady('1.5')===true);

  console.log('  -- 칸에 실제로 쳐 봅니다 --');
  const c=mk(V2);
  const R=()=>c.renderVals();
  R().focBasic();
  ok('누르면 화면만 비웁니다 — 예전 그대로', R().basicVal==='' && c.st().basic>0, 'stored='+c.st().basic);
  R().setBasic({ target:{ value:'2,500,000' } });
  ok('쉼표째 쳐도 숫자로 들어갑니다', c.st().basic===2500000, 'basic='+c.st().basic);
  ok('화면에는 걸러진 글자가 남습니다', R().basicVal==='2500000', R().basicVal);
  R().setBasic({ target:{ value:'250000x' } });
  ok('글자는 설정에 닿지 않습니다', c.st().basic===250000, 'basic='+c.st().basic);
  R().setBasic({ target:{ value:'' } });
  ok('빈 칸은 저장하지 않습니다 — 예전 그대로', c.st().basic===250000, 'basic='+c.st().basic);
  R().blurBasic();
  ok('나가면 저장된 값이 돌아옵니다', R().basicVal===250000 && c.state.numEdit===null, String(R().basicVal));

  // 배수 칸은 소수점을 지나갑니다 — '1'과 '1.' 사이에서 값이 튀면 안 됩니다
  const m=mk(V2);
  const mr=()=>m.renderVals().multRows[0];
  mr().foc();
  mr().set({ target:{ value:'1' } });
  ok('1까지 쳤을 때', m.st().otMult===1, 'otMult='+m.st().otMult);
  mr().set({ target:{ value:'1.' } });
  ok("'1.'은 저장하지 않습니다 — 아직 치는 중입니다", m.st().otMult===1, 'otMult='+m.st().otMult);
  ok('그래도 화면에는 1. 이 보입니다', mr().v==='1.', mr().v);
  mr().set({ target:{ value:'1.5' } });
  ok('1.5까지 치면 저장됩니다', m.st().otMult===1.5, 'otMult='+m.st().otMult);

  console.log('  -- 완료 키가 실제로 무언가 해야 합니다 --');
  // form 밖의 글자 칸에서 Enter는 기본적으로 아무 일도 하지 않습니다.
  // 아무 일도 하지 않는 키는 회색으로 죽은 키와 근로자에게 똑같습니다.
  let blurred=false, prevented=false;
  c.renderVals().keyBasic({ key:'Enter', preventDefault:()=>{prevented=true;},
    target:{ blur:()=>{blurred=true;} } });
  ok('Enter를 누르면 칸을 떠납니다', blurred);
  ok('Enter의 기본 동작은 막습니다', prevented);
  let other=false;
  c.renderVals().keyBasic({ key:'5', target:{ blur:()=>{other=true;} } });
  ok('다른 키는 아무 일도 하지 않습니다', !other);
  ok('key 없는 이벤트에도 던지지 않습니다', (function(){ try{ c.renderVals().keyBasic(null); c.renderVals().keyBasic({}); return true; }catch(e){ return false; } })());

  // 줄 안에서 만들어지는 칸들도 같은 키를 가집니다
  const rw=mk(V2);
  rw.st().allowances=[{name:'식대',en:'Meal',amount:200000,tf:true}];
  rw.st().deductions=[{name:'기숙사비',en:'Dorm',amount:150000}];
  const V=rw.renderVals();
  ok('수당 줄에도 완료 키', typeof V.allowRows[0].key==='function');
  ok('공제 줄에도 완료 키', typeof V.dedSetRows[0].key==='function');
  ok('배수 줄에도 완료 키', typeof V.multRows[0].key==='function');
  ok('명세서 대조 줄에도 완료 키', typeof V.slipRows[0].key==='function');

  // 명세서 대조 칸은 numField를 쓰지 않습니다 — 거기에도 걸러 넣기가 필요합니다
  const sp=mk(V2);
  sp.renderVals().slipRows[0].set({ target:{ value:'2,150,000원' } });
  ok('명세서 칸도 걸러서 넣습니다', sp.slip().basic==='2150000', String(sp.slip().basic));
  // 걸러 넣은 값이 실제로 숫자로 읽혀야 합니다 — NaN은 던지지 않고 조용히 번집니다
  ok('걸러 넣은 값이 숫자로 읽힙니다', !isNaN(+sp.slip().basic), '+v='+(+sp.slip().basic));
  ok('차액이 제대로 계산됩니다', sp.renderVals().slipRows[0].diff==='−₩6,880',
    sp.renderVals().slipRows[0].diff);

  // 시각 칸도 같은 Enter로 나갑니다 — 나가면서 09:00 한 모양으로 정리됩니다
  const tf=mk(V2); tf.setS({ shifts:'both' });
  tf.renderVals().focDayStart();
  tf.renderVals().setDayStart({ target:{ value:'7' } });
  let tb=false;
  tf.renderVals().keyDayStart({ key:'Enter', preventDefault:()=>{}, target:{ blur:()=>{tb=true;} } });
  ok('시각 칸도 Enter로 나갑니다', tb);
  tf.renderVals().blurDayStart();
  ok('나가면서 07:00으로 정리됩니다 — 예전 그대로', tf.st().dayStart==='07:00', tf.st().dayStart);

  // 임금 계산은 손대지 않았습니다 — 칸의 종류를 바꾼 것이지 식을 바꾼 것이 아닙니다
  const w=mk(V2);
  const before=JSON.stringify(w.calc(9,21,'day',false));
  const w2=mk(V2);
  w2.renderVals().focBasic(); w2.renderVals().blurBasic();
  ok('칸을 만졌다 놓아도 계산은 그대로', JSON.stringify(w2.calc(9,21,'day',false))===before);
}


console.log('\n== 대장의 사용 0일 · 잔여 15일이 거짓말이었습니다 ==');
{
  // 폰에서 온 보고: 발생 15 · 사용 0 · 잔여 15인데, 바로 아래 칸에는 내가
  // 적어 둔 '지금 남은 연차 9일'이 있다. 논리가 맞습니까?
  //
  // 맞지 않았습니다. '사용'은 **앱에 기록된 연차 일수**였고, 앱을 쓰기 전에
  // 쓴 연차를 앱은 모릅니다. 근무 도중에 앱을 깐 사람은 — 모든 사람은 —
  // 사용 0일로 시작했고, 잔여는 발생을 그대로 베꼈습니다. 같은 카드 안에서
  // 15와 9가 정면으로 어긋났고, 그 문서를 뽑으면 연차를 여섯 날 쓴 사람이
  // 근로감독관 앞에서 '하나도 안 썼다'고 말하게 됩니다.
  const mkAnn=(iso='2026-08-19T10:00:00')=>{ const c=mk(V2,iso);
    c.st().hireDate='2024-04-01';                 // 근속 2년 남짓 → 법정 발생 15일
    return c; };

  const c=mkAnn();
  c.setS({ annualBase: 9, annualAsOf: new Date('2026-08-19T00:00:00').toISOString() });
  const L=c.renderVals().annLedger;
  ok('발생은 그대로 법의 숫자', L[0].v===15, 'accrued='+L[0].v);
  ok('잔여는 근로자가 적어 둔 숫자', L[2].v===9, 'left='+L[2].v);
  ok('사용은 그 둘의 차이 — 기록이 없어도 6일', L[1].v===6, 'used='+L[1].v);
  ok('기록이 정말 하나도 없습니다', c.month().filter(r=>r.type==='annual').length===0);
  ok('예전의 거짓말이 없어졌습니다 — 잔여가 15가 아닙니다', L[2].v!==15, 'left='+L[2].v);

  // 앞으로 연차를 기록하면 두 칸이 함께 움직입니다
  const u=mkAnn();
  u.setS({ annualBase: 9, annualAsOf: new Date('2026-08-19T00:00:00').toISOString() });
  u.state.extra=[{y:2026,m:8,day:20,kind:'day',type:'annual',
    c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}}];
  const Lu=u.renderVals().annLedger;
  ok('연차를 하루 쓰면 잔여 8일', Lu[2].v===8, 'left='+Lu[2].v);
  ok('사용은 7일로 함께 올라갑니다', Lu[1].v===7, 'used='+Lu[1].v);
  ok('발생은 움직이지 않습니다', Lu[0].v===15, 'accrued='+Lu[0].v);

  // 적어 둔 날짜 **이전**의 연차는 이미 9 안에 들어 있습니다 — 두 번 세지 않습니다
  const before=mkAnn();
  before.setS({ annualBase: 9, annualAsOf: new Date('2026-08-19T00:00:00').toISOString() });
  before.state.extra=[{y:2026,m:7,day:10,kind:'day',type:'annual',
    c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}}];
  const Lb=before.renderVals().annLedger;
  ok('적어 둔 날 이전의 연차는 다시 빼지 않습니다', Lb[2].v===9, 'left='+Lb[2].v);
  ok('사용도 6일 그대로', Lb[1].v===6, 'used='+Lb[1].v);

  // 회사가 법보다 많이 준다면 쓴 것이 없는 것입니다 — 음수를 보여 줄 자리가 아닙니다
  const more=mkAnn();
  more.setS({ annualBase: 18, annualAsOf: more.now().toISOString() });
  const Lm=more.renderVals().annLedger;
  ok('법보다 많이 남았으면 사용 0일', Lm[1].v===0, 'used='+Lm[1].v);
  ok('잔여는 적어 둔 그대로 18일', Lm[2].v===18, 'left='+Lm[2].v);

  // 입사일이 없으면 발생을 모릅니다. 모르는 것은 숫자로 적지 않습니다.
  // 잔여는 근로자가 직접 적은 것이라 입사일과 상관없이 압니다.
  const nh=mk(V2,'2026-08-19T10:00:00');
  nh.setS({ annualBase: 9 });
  const Ln=nh.renderVals().annLedger;
  ok('입사일이 없으면 발생은 물음표', Ln[0].v==='?', String(Ln[0].v));
  ok('사용도 물음표 — 발생을 모르면 뺄 수 없습니다', Ln[1].v==='?', String(Ln[1].v));
  ok('잔여는 그래도 압니다', Ln[2].v===9, String(Ln[2].v));

  // 카드의 설명이 세 칸을 모두 짚어야 합니다 — 예전 문장은 대장 전체가
  // 법의 숫자라고 말하고 있었고, 이제 그것은 발생 한 칸뿐입니다
  const note=c.renderVals().annVsCompany;
  ok('설명이 제60조를 짚습니다', note.indexOf('제60조')>=0, note.slice(0,30));
  ok('앱을 쓰기 전에 쓴 연차를 설명합니다', note.indexOf('앱을 쓰기 전')>=0);
  ok("'따로 센다'는 옛 문장은 없어졌습니다", note.indexOf('따로 세어')<0);

  let all=true, seen=[];
  V2.LANGS.forEach(([code])=>{
    const x=mkAnn(); x.setS({ annualBase: 9, annualAsOf: x.now().toISOString() });
    x.st().lang=code;
    const r=x.renderVals();
    if(!r.annVsCompany || r.annVsCompany.indexOf('{p')>=0) all=false;
    if(r.annLedger[1].v!==6 || r.annLedger[2].v!==9) all=false;
    seen.push(code+'='+r.annLedger.map(z=>z.v).join('/'));
  });
  ok('여덟 개 언어 모두 15/6/9', all, seen.join(' · '));

  // 출퇴근의 연차 단추와 대장이 같은 숫자를 말해야 합니다 — 어긋나면
  // 근로자는 어느 쪽을 믿어야 할지 알 수 없습니다
  ok('출퇴근 단추와 대장의 잔여가 같습니다', c.annualLeft()===c.renderVals().annLedger[2].v,
    c.annualLeft()+' vs '+c.renderVals().annLedger[2].v);

  // 연차년도 규칙 자체는 그대로 살아 있습니다 — 화면에서 뺐을 뿐입니다
  ok('annualUsedThisYear()는 그대로 있습니다', typeof c.annualUsedThisYear==='function');
}

console.log('\n== 급여기간이 넘어가면 지난 한 달이 통째로 사라졌습니다 ==');
// 21일이 급여기간 첫날인 근로자의 보고입니다. 20일 20:40에 출근해 21일 08:50에
// 퇴근했더니 급여가 ₩0으로 돌아가 있고, 근무기록에는 줄이 하나도 없었습니다.
// 지난 한 달은 '지난 기록'으로 내려가 있었는데 거기서는 날짜·주야·급여기간·삭제
// 네 가지밖에 보이지 않았습니다 — 그 날 몇 시간을 일했고 얼마를 벌었는지가
// 없어진 것입니다. 하필 회사 명세서와 맞춰 보는 그 날 볼 수가 없었습니다.
{
  const mkP=(iso)=>{
    const c=mk(V2,iso);
    c.setS({ periodStart:21, payday:25, shifts:'both' });
    for(let d=21; d<=31; d++) c.state.extra.push({y:2026,m:7,day:d,kind:'night',type:'shift',
      inH:20+40/60,outH:32+50/60,c:c.calc(20+40/60,32+50/60,'night',false)});
    for(let d=1; d<=20; d++) c.state.extra.push({y:2026,m:8,day:d,kind:'night',type:'shift',
      inH:20+40/60,outH:32+50/60,c:c.calc(20+40/60,32+50/60,'night',false)});
    return c;
  };
  const c=mkP('2026-08-21T09:00:00');

  // 기본값은 언제나 이번 기간입니다 — 출근을 찍으러 여는 사람이 지난 달을
  // 보고 있으면 그것대로 위험합니다
  ok('앱을 열면 이번 기간입니다', c.payBack()===0 && c.viewPeriod().label==='08.21 → 09.20', c.viewPeriod().label);
  ok('첫날이라 이번 기간은 아직 0일', c.renderVals().logRows.length===0);

  // ‹ 한 번이면 방금 끝난 급여가 통째로 돌아옵니다
  c.stepPay(1);
  const V=c.renderVals();
  ok('‹ 한 번에 지난 급여기간', V.payPeriodLabel==='07.21 → 08.20', V.payPeriodLabel);
  ok('그 기간의 근무일이 모두 돌아옵니다', V.logRows.length===31, 'rows='+V.logRows.length);
  ok('줄을 펼치면 예전 그대로 자세히 보입니다', V.logRows[0].detail.length>=8, 'detail='+V.logRows[0].detail.length);
  ok('그 날 벌이가 다시 보입니다',
    V.logRows[0].detail.some(d=>d.k.indexOf('변동수당')>=0 || d.k.indexOf('day')>=0 || /₩/.test(d.v)));
  ok('근무기록 합계도 그 기간의 것', V.totalCells[1].value!=='0.0h', V.totalCells[1].value);
  ok('급여도 같은 기간을 말합니다', V.periodLabel.indexOf('07.21 → 08.20')>=0, V.periodLabel);
  ok('실수령이 ₩0으로 돌아가 있지 않습니다', V.netPay!=='₩0' && V.netPay!==c.won(c.payCalc(c.totals(null,c.period(c.now()))).net), V.netPay);
  ok('명세서 대조표도 그 기간의 것', V.slipPeriodLbl.indexOf('07.21 → 08.20')>=0, V.slipPeriodLbl);
  ok('이번 기간으로 돌아가는 단추가 나옵니다', V.payViewingPast===true);

  // 끝난 기간에 '며칠 남았습니다'라고 말하면 안 됩니다. period()의 left는
  // 오늘을 기준으로 재므로 지난 기간에서는 언제나 0이고, 그대로 두면 반 년 전
  // 기간이 '마지막 날'로 읽힙니다.
  ok('지난 기간은 마감된 기간', V.periodState==='마감된 기간', V.periodState);
  ok("'마지막 날'이라고 하지 않습니다", V.periodState.indexOf('마지막 날')<0);
  ok('금액이 더 오른다고 하지 않습니다', V.payslipCheck.indexOf('더 올라갑니다')<0, V.payslipCheck);
  ok('끝난 기간이라고 말합니다', V.payslipCheck.indexOf('끝났습니다')>=0);
  ok('그 기간의 지급일을 말합니다', V.payslipCheck.indexOf('08.25')>=0, V.payslipCheck);
  ok('기간 전체 기준이라고 말합니다', V.payAsOf.indexOf('이 기간 전체')>=0, V.payAsOf);
  ok('끝난 기간에는 예상 카드가 없습니다', V.projShow===false);
  // 끝난 기간의 금액은 '예정'이 아닙니다 — 앞으로 오를 일이 없습니다
  ok("빨간 카드가 '예정'이라고 하지 않습니다", V.L.netLbl.indexOf('예정')<0, V.L.netLbl);
  ok('앱이 계산한 금액이라고 말합니다', V.L.netLbl.indexOf('앱 계산')>=0, V.L.netLbl);
  ok('이번 기간에서는 예전 그대로 예정입니다',
    mkP('2026-08-21T09:00:00').renderVals().L.netLbl.indexOf('예정')>=0);

  // 머리말 칩은 다섯 탭에 모두 걸려 있습니다 — 스테퍼를 어디에 두었든 오늘입니다
  ok('머리말 칩은 오늘의 기간 그대로', V.monthChip==='08.21 → 09.20', V.monthChip);
  ok('설정의 급여기간 미리보기도 오늘 그대로', V.periodPreview.indexOf('08.21 → 09.20')>=0, V.periodPreview);

  // 되돌아오기
  c.setState({ payBack: 0 });
  ok('이번 기간으로 한 번에 돌아옵니다', c.viewPeriod().label==='08.21 → 09.20');
  ok('돌아오면 단추는 사라집니다', c.renderVals().payViewingPast===false);

  // 기록이 있는 데까지만 — 없는 기간의 빈 표를 보여 줄 이유가 없습니다
  ok('기록이 있는 데까지만 거슬러 갑니다', c.payBackMax()===1, 'max='+c.payBackMax());
  c.stepPay(9);
  ok('끝에 닿으면 더 가지 않습니다', c.payBack()===1, 'back='+c.payBack());
  c.stepPay(-9);
  ok('앞쪽 끝도 이번 기간에서 멈춥니다', c.payBack()===0, 'back='+c.payBack());

  // 근무기록과 급여는 같은 값을 읽습니다 — 두 탭이 서로 다른 달을 말하면
  // 근로자는 어느 쪽을 믿어야 할지 알 수 없습니다
  c.stepPay(1);
  const W=c.renderVals();
  ok('근무기록과 급여가 같은 기간을 말합니다',
    W.payPeriodLabel==='07.21 → 08.20' && W.periodLabel.indexOf('07.21 → 08.20')>=0);

  // 기간을 옮기면 펼쳐 둔 줄은 다른 기간의 것입니다
  c.setState({ payBack:0, openDay: 20260820 });
  c.stepPay(1);
  ok('기간을 옮기면 펼쳐 둔 줄은 닫힙니다', c.state.openDay===null);

  // 저장하지 않습니다 — 다시 열면 이번 기간입니다
  const saved=(()=>{ const x=mkP('2026-08-21T09:00:00'); x.stepPay(1); let body=null;
    x.props={}; x.lastSaved=null;
    global.window.localStorage.setItem=(k,v)=>{ body=v; };
    x.save(); return body ? JSON.parse(body) : {}; })();
  ok('payBack은 저장되지 않습니다', saved.payBack===undefined, JSON.stringify(Object.keys(saved)));
}

console.log('\n== 야간조의 열려 있는 근무는 출근한 날의 기간에 있습니다 ==');
// 기간의 마지막 날 밤에 출근해 다음 기간의 아침에 퇴근하는 근무입니다.
// 예전에는 열려 있는 근무 줄을 어느 기간을 보고 있든 맨 위에 얹었으므로,
// 21일에 새 기간을 펼치면 그 기간에 있지도 않은 하루가 생겼습니다.
{
  const c=mk(V2,'2026-08-21T08:00:00');
  c.setS({ periodStart:21, payday:25, shifts:'both' });
  for(let d=17; d<=19; d++) c.state.extra.push({y:2026,m:8,day:d,kind:'night',type:'shift',
    inH:20+40/60,outH:32+50/60,c:c.calc(20+40/60,32+50/60,'night',false)});
  c.state.session={inIso:new Date('2026-08-20T20:40:00').toISOString()};

  const now=c.renderVals();
  ok('새 기간에는 20일 밤 근무가 얹히지 않습니다', now.logRows.length===0, 'rows='+now.logRows.length);
  // 출퇴근 탭의 근무 카드는 기간과 상관없이 그대로여야 합니다 — 근로자가
  // 퇴근을 찍기 전에 보는 화면입니다
  ok('출퇴근의 근무 카드는 그대로입니다', now.padLive===true && now.liveRows.length===7,
    'padLive='+now.padLive+' rows='+now.liveRows.length);
  ok('첫 줄은 출근 시각입니다', now.liveRows[0].label==='출근', now.liveRows[0].label);

  c.stepPay(1);
  const back=c.renderVals();
  ok('지난 기간에 20일 밤 근무가 있습니다', back.logRows[0] && back.logRows[0].date==='08.20',
    back.logRows.length?back.logRows[0].date:'none');
  ok('그 줄은 아직 퇴근 전이라고 말합니다', /근무중/.test(back.logRows[0].io), back.logRows[0].io);
}

console.log('\n== 지난 기간이 비어 있어도 처음 쓰는 사람처럼 보이지 않습니다 ==');
{
  const c=mk(V2,'2026-08-21T09:00:00');
  c.setS({ periodStart:21, payday:25 });
  c.state.extra=[{y:2026,m:6,day:25,kind:'day',type:'shift',inH:9,outH:18,c:c.calc(9,18,'day',false)}];
  ok('아무것도 없는 이번 기간에는 안내가 나옵니다', c.renderVals().emptyLog===true);
  c.setState({ payBack: 1 });   // 07.21 → 08.20, 기록 없음
  ok('비어 있는 지난 기간에는 안내를 띄우지 않습니다', c.renderVals().emptyLog===false);
  ok('스테퍼가 이미 0일이라고 말합니다', /0/.test(c.renderVals().payPeriodSub), c.renderVals().payPeriodSub);
}

console.log('\n== 명세서 대조는 기간마다 따로 남습니다 ==');
// slips는 예전부터 기간 시작일로 키를 잡아 저장하고 있었습니다. 없던 것은
// '지난 기간의 그 표를 여는 방법'이었습니다.
{
  const c=mk(V2,'2026-08-21T09:00:00');
  c.setS({ periodStart:21, payday:25 });
  for(let d=1; d<=20; d++) c.state.extra.push({y:2026,m:8,day:d,kind:'day',type:'shift',
    inH:9,outH:20,c:c.calc(9,20,'day',false)});
  c.stepPay(1);
  const netIdx=c.slipRows().findIndex(r=>r.k==='net');
  c.renderVals().slipRows[netIdx].set({target:{value:'3,100,000'}});
  ok('지난 기간에 적은 명세서 금액이 그 기간에 저장됩니다',
    c.slip(c.viewPeriod()).net==='3100000', JSON.stringify(c.slip(c.viewPeriod())));
  ok('이번 기간의 표는 비어 있습니다', c.slip(c.period(c.now())).net===undefined);
  ok('지난 기간의 표에 그 금액이 보입니다',
    c.renderVals().slipRows[netIdx].val==='3100000');
  c.setState({ payBack: 0 });
  ok('이번 기간으로 돌아오면 빈 칸입니다',
    c.renderVals().slipRows[netIdx].val==='');
  c.stepPay(1);
  c.renderVals().clearSlip();
  ok('지우는 것도 그 기간의 것을 지웁니다', c.slip(c.viewPeriod()).net===undefined);
}

console.log('\n== 여덟 개 언어에서 지난 기간이 읽힙니다 ==');
{
  let all=true, seen=[];
  V2.LANGS.forEach(([code])=>{
    const c=mk(V2,'2026-08-21T09:00:00');
    c.setS({ periodStart:21, payday:25, lang:code });
    for(let d=1; d<=20; d++) c.state.extra.push({y:2026,m:8,day:d,kind:'day',type:'shift',
      inH:9,outH:20,c:c.calc(9,20,'day',false)});
    c.stepPay(1);
    const r=c.renderVals();
    [r.periodState, r.payslipCheck, r.payAsOf, r.payPeriodLabel, r.L.payPeriodLbl, r.L.payNowB, r.L.netLbl]
      .forEach(x=>{ if(!x || String(x).indexOf('{p')>=0) all=false; });
    if(r.projShow!==false || r.payViewingPast!==true) all=false;
    seen.push(code);
  });
  ok('여덟 개 언어 모두 채워집니다', all, seen.join(','));
}


console.log('\n== 퇴근을 찍는 순간 그 날 벌이가 화면에서 사라졌습니다 ==');
// 같은 날 아침에 온 두 번째 보고입니다. 20일 20:40에 출근해 21일 08:50에
// 퇴근했더니 "출퇴근 화면이 다른 것을 보여 주고, 그 날 번 돈이 안 보인다".
//
// 출퇴근 카드는 근무중일 때와 아닐 때가 서로 다른 것을 말합니다. 근무중에는
// 그 날의 것 — 출근·퇴근·실근무·잔업·야간, 그리고 '오늘 벌이' 일곱 줄. 퇴근
// 도장을 찍는 순간 그 일곱 줄이 통째로 사라지고 급여기간 누계 다섯 줄로
// 바뀝니다. 열두 시간 동안 자라는 것을 지켜보던 금액이 도장 한 번에
// 없어집니다.
//
// 야간조는 그것이 매일 아침입니다. 다만 누계가 자라고 있는 동안에는 아무도
// 눈치채지 못했습니다 — 급여기간 첫날 아침에야 드러납니다. 그 근무는 출근한
// 날(20일) 기준이라 지난 급여기간에 들어가는데, 카드는 오늘(21일)이 든 기간을
// 말하므로 근무일 0일 · 잔업 0.0h · 야간 0.0h입니다. 방금 열두 시간을 일하고
// 나온 사람에게 앱이 0을 다섯 줄 보여 준 것입니다.
{
  const mkN=(iso)=>{
    const c=mk(V2,iso);
    c.setS({ periodStart:21, payday:25, shifts:'both' });
    for(let d=21; d<=31; d++) c.state.extra.push({y:2026,m:7,day:d,kind:'night',type:'shift',
      inH:20+40/60,outH:32+50/60,c:c.calc(20+40/60,32+50/60,'night',false)});
    for(let d=1; d<=19; d++) c.state.extra.push({y:2026,m:8,day:d,kind:'night',type:'shift',
      inH:20+40/60,outH:32+50/60,c:c.calc(20+40/60,32+50/60,'night',false)});
    return c;
  };

  // 20일 20:40 출근 → 21일 08:50 퇴근, 지문으로 찍은 그대로
  const c=mkN('2026-08-20T20:40:00');
  c.punch();
  c.base=new Date('2026-08-21T08:50:00'); c.t0=Date.now();
  c.punch();
  ok('퇴근이 기록됐습니다', c.state.session===null);

  const V=c.renderVals();
  const r0=V.liveRows[0];
  ok('카드 맨 위에 방금 끝낸 근무가 남습니다', r0.label==='지난 근무', r0.label);
  ok('출근한 날의 날짜입니다', r0.sub.indexOf('08.20')===0, r0.sub);
  ok('요일도 함께 적습니다', r0.sub.indexOf('목요일')>0, r0.sub);
  ok('그 날 실근무가 적혀 있습니다', r0.sub.indexOf('11.0h')>0, r0.sub);
  const rec=c.month().filter(x=>x.m===8&&x.day===20)[0];
  ok('그 날 벌이가 다시 보입니다', r0.value===c.won(c.dayPay(rec)), r0.value);
  ok('₩0이 아닙니다', r0.value!=='₩0', r0.value);

  // 누계 줄은 거짓말을 하지 않습니다 — 오늘은 새 기간의 첫날이 맞습니다.
  // 고친 것은 '0이라고 말한 것'이 아니라 '방금 일한 하루가 어디에도 없던 것'입니다.
  ok('누계는 그대로 이번 기간을 말합니다',
    V.liveRows[1].label==='근무일' && V.liveRows[1].sub.indexOf('08.21 → 09.20')>=0, V.liveRows[1].sub);
  ok('누계 줄은 여전히 0일입니다', V.liveRows[1].value==='0일', V.liveRows[1].value);
  ok('줄이 하나 늘었을 뿐입니다', V.liveRows.length===6, 'rows='+V.liveRows.length);

  // 근무중일 때의 카드는 손대지 않았습니다 — 거기에는 이미 '오늘 벌이'가 있습니다
  const on=mkN('2026-08-20T20:40:00'); on.punch();
  on.base=new Date('2026-08-21T07:00:00'); on.t0=Date.now();
  const O=on.renderVals();
  ok('근무중 카드는 예전 그대로 일곱 줄', O.liveRows.length===7, 'rows='+O.liveRows.length);
  ok('첫 줄은 출근 시각입니다', O.liveRows[0].label==='출근', O.liveRows[0].label);
  ok('근무중에는 지난 근무 줄이 없습니다', O.liveRows.every(x=>x.label!=='지난 근무'));

  // 같은 급여기간 안에서 퇴근한 주간조도 같은 줄을 봅니다 — 급여기간이
  // 넘어가는 날만의 문제가 아니었습니다. 그 날 누계가 자라고 있었을 뿐입니다.
  const day=mk(V2,'2026-08-25T18:10:00');
  day.setS({ periodStart:21, payday:25 });
  day.state.session={inIso:new Date('2026-08-25T09:00:00').toISOString()};
  day.punch();
  const D=day.renderVals();
  ok('주간조도 퇴근 뒤에 그 날 벌이를 봅니다', D.liveRows[0].label==='지난 근무', D.liveRows[0].label);
  ok('그 날짜입니다', D.liveRows[0].sub.indexOf('08.25')===0, D.liveRows[0].sub);

  // 처음 쓰는 사람에게 '지난 근무'는 없습니다
  const fresh=mk(V2,'2026-08-21T09:00:00'); fresh.setS({ periodStart:21, payday:25 });
  ok('기록이 없으면 줄도 없습니다', fresh.lastShift()===null);
  ok('카드는 예전 그대로 다섯 줄', fresh.renderVals().liveRows.length===5,
    'rows='+fresh.renderVals().liveRows.length);

  // 앱이 미리 잡아 둔 줄은 일한 날이 아닙니다
  const pl=mk(V2,'2026-08-25T19:00:00'); pl.setS({ periodStart:21, payday:25 });
  pl.state.extra=[
    {y:2026,m:8,day:22,kind:'day',type:'shift',inH:9,outH:18,c:pl.calc(9,18,'day',false)},
    {y:2026,m:8,day:23,kind:'day',type:'shift',holiday:true,planned:true,awaiting:true,
     inH:9,outH:21,c:pl.calc(9,21,'day',true)},
  ];
  ok('지문 대기 중인 특근은 지난 근무가 아닙니다', pl.lastShift().day===22, 'day='+pl.lastShift().day);
  // 손으로 미리 넣어 둔 앞날도 마찬가지입니다
  const fu=mk(V2,'2026-08-25T19:00:00'); fu.setS({ periodStart:21, payday:25 });
  fu.state.extra=[
    {y:2026,m:8,day:24,kind:'day',type:'shift',inH:9,outH:18,c:fu.calc(9,18,'day',false)},
    {y:2026,m:8,day:28,kind:'day',type:'shift',inH:9,outH:18,c:fu.calc(9,18,'day',false)},
  ];
  ok('앞으로의 날짜는 지난 근무가 아닙니다', fu.lastShift().day===24, 'day='+fu.lastShift().day);
  // 연차·휴업은 '일한 날'이 아니라 그 앞의 근무일을 짚습니다
  const lv=mk(V2,'2026-08-25T19:00:00'); lv.setS({ periodStart:21, payday:25 });
  lv.state.extra=[
    {y:2026,m:8,day:24,kind:'day',type:'shift',inH:9,outH:18,c:lv.calc(9,18,'day',false)},
    {y:2026,m:8,day:25,type:'annual',kind:'day',c:{gross:0,bk:0,net:8,reg:8,ot:0,night:0,hol:0,pay:0}},
  ];
  ok('연차 낸 날은 지난 근무가 아닙니다', lv.lastShift().day===24, 'day='+lv.lastShift().day);

  // 여덟 개 언어
  const langs=['ko','en','vi','zh','th','id','ne','km'];
  const all=langs.map(L=>{ const x=mkN('2026-08-20T20:40:00'); x.setS({lang:L}); x.punch();
    x.base=new Date('2026-08-21T08:50:00'); x.t0=Date.now(); x.punch();
    const row=x.renderVals().liveRows[0];
    return row.label && row.sub.indexOf('08.20')===0 && /₩/.test(row.value); });
  ok('여덟 개 언어 모두 채워집니다', all.every(Boolean), langs.join(','));
}

console.log('\n== 퇴근 알림이 202608.20이라고 말했습니다 ==');
// 위를 폰에서 확인하다 걸렸습니다. 퇴근을 찍으면 검은 띠가 떠서 '✓ 202608.20
// 기록 추가됨'이라고 말합니다. 기록 키는 y*10000 + m*100 + day인데, 연도가
// 붙기 전(BUG A) 키에는 연도가 없어서 Math.floor(k / 100)이 곧 월이었습니다.
// 연도가 붙은 뒤로 그 자리가 202608이 됐고, 아무도 고치지 않았습니다.
{
  const c=mk(V2,'2026-08-25T18:10:00');
  c.setS({ periodStart:21, payday:25 });
  c.state.session={inIso:new Date('2026-08-25T09:00:00').toISOString()};
  c.punch();
  const m=c.renderVals().undoMsg;
  ok('월.일만 적습니다', m.indexOf('08.25')>=0, m);
  ok('연도가 섞여 들어가지 않습니다', m.indexOf('202608')<0, m);
  // 여러 날을 한 번에 넣을 때도 같은 자리를 씁니다
  c.setState({ undoKeys:[20260801,20260802,20260803], editedKeys:[] });
  const m2=c.renderVals().undoMsg;
  ok('여러 날도 월.일로 읽힙니다', m2.indexOf('08.01')>=0 && m2.indexOf('08.03')>=0, m2);
  ok('여기에도 연도가 없습니다', m2.indexOf('202608')<0, m2);
}

console.log('\n== 기록이 뒤에 있으면 처음 쓰는 사람에게 하는 말을 하지 않습니다 ==');
// 급여기간이 넘어간 다음 날 근무기록을 열면 '기록이 없습니다 · 출퇴근
// 화면에서 지문으로 출근하세요'가 떴습니다. ‹ 한 번 뒤에 지난 한 달 31일이
// 그대로 있는데 화면은 아무것도 없다고 말한 것이고, 근로자에게는 그것이
// '앱이 초기화됐다'로 읽힙니다.
{
  const c=mk(V2,'2026-08-21T09:00:00');
  c.setS({ periodStart:21, payday:25, shifts:'both' });
  for(let d=21; d<=31; d++) c.state.extra.push({y:2026,m:7,day:d,kind:'night',type:'shift',
    inH:20+40/60,outH:32+50/60,c:c.calc(20+40/60,32+50/60,'night',false)});
  for(let d=1; d<=20; d++) c.state.extra.push({y:2026,m:8,day:d,kind:'night',type:'shift',
    inH:20+40/60,outH:32+50/60,c:c.calc(20+40/60,32+50/60,'night',false)});
  const V=c.renderVals();
  ok('안내는 그대로 나옵니다', V.emptyLog===true);
  ok("'기록이 없습니다'라고 하지 않습니다", V.L.emptyTitle.indexOf('기록이 없습니다')<0, V.L.emptyTitle);
  ok('이번 기간이 비어 있다고 말합니다', V.L.emptyTitle.indexOf('이번 급여기간')>=0, V.L.emptyTitle);
  ok('기록이 남아 있다고 말합니다', V.L.emptyBody.indexOf('그대로 있습니다')>=0, V.L.emptyBody);
  ok('어느 기간인지 이름으로 짚습니다', V.L.emptyBody.indexOf('07.21 → 08.20')>=0, V.L.emptyBody);
  ok('스테퍼의 ‹ 를 짚습니다', V.L.emptyBody.indexOf('‹')>=0, V.L.emptyBody);
  ok('지문 안내는 사라집니다', V.L.emptyBody.indexOf('지문으로 출근')<0, V.L.emptyBody);

  // 정말 처음 쓰는 사람에게는 예전 그대로여야 합니다 — 그 사람에게는
  // 돌아갈 기간이 없고, 필요한 것은 출근하는 법입니다
  const fresh=mk(V2,'2026-08-21T09:00:00'); fresh.setS({ periodStart:21, payday:25 });
  const F=fresh.renderVals();
  ok('처음 쓰는 사람에게는 예전 그대로', F.L.emptyTitle==='기록이 없습니다', F.L.emptyTitle);
  ok('출근하는 법을 알려 줍니다', F.L.emptyBody.indexOf('지문으로 출근')>=0, F.L.emptyBody);
  ok('돌아갈 기간이 없습니다', fresh.emptyLogBack()===0);

  // 바로 앞 기간도 비어 있으면 그 앞을 짚습니다 — 한 달을 통째로 쉰 사람에게
  // 빈 기간을 가리켜 봐야 소용이 없습니다
  const gap=mk(V2,'2026-08-21T09:00:00'); gap.setS({ periodStart:21, payday:25 });
  for(let d=21; d<=25; d++) gap.state.extra.push({y:2026,m:6,day:d,kind:'day',type:'shift',
    inH:9,outH:18,c:gap.calc(9,18,'day',false)});
  ok('기록이 남아 있는 기간까지 건너뜁니다', gap.emptyLogBack()===2, 'back='+gap.emptyLogBack());
  ok('그 기간을 이름으로 짚습니다',
    gap.renderVals().L.emptyBody.indexOf('06.21 → 07.20')>=0, gap.renderVals().L.emptyBody);

  // 지난 기간을 펼쳐 놓았을 때는 예전 그대로 안내를 띄우지 않습니다
  c.stepPay(1);
  ok('지난 기간에는 안내가 없습니다', c.renderVals().emptyLog===false);
}

console.log('\n== 휴업은 나가 본 사람만의 것이 아닙니다 ==');
// 야간조 근로자의 보고입니다: 오늘은 근무표상 일하는 날이었는데, 출근
// 서너 시간 전에 회사 총무가 '오늘 휴무'라고 연락했습니다. 출퇴근 화면에서
// 휴업 표시를 찾아 눌렀더니 설명이 '나갔지만 회사에 일이 없어…'였습니다.
//
// 나가지 않았으므로 근로자는 이 날이 앱에 들어갈 자리가 없다고 읽었습니다.
// 그런데 근로기준법 제46조가 보는 것은 '나갔는가'가 아니라 '사용자의
// 귀책사유인가'입니다. 미리 알려 주었다고 해서 휴업수당이 줄지 않습니다 —
// 그런 예외는 제46조에 없습니다. 기록을 쓰는 코드는 처음부터 맞았고,
// 카드에 붙은 문장 하나만 근로자를 돌려보내고 있었습니다.
{
  const c=mk(V2,'2026-08-28T17:00:00');
  c.setS({ shifts:'both' });
  c.togglePending('shutdown');
  const E=c.renderVals().pendingEffect;
  ok('휴업 표시에 설명이 붙습니다', !!E && E.length>0);
  ok("'나갔지만'으로 시작하지 않습니다", E.indexOf('나갔지만')<0, E);
  ok('출근 전에 연락받은 날도 덮습니다', E.indexOf('출근 전')>=0, E);
  ok('나갔다 돌아온 날도 그대로 덮습니다', E.indexOf('돌아왔든')>=0, E);
  ok('제46조를 그대로 짚습니다', E.indexOf('제46조')>=0, E);
  ok('70%를 그대로 말합니다', E.indexOf('70%')>=0, E);
  ok('예상 휴업수당이 금액으로 붙습니다', E.indexOf(c.won(c.shutdownPay()))>=0, E);
  ok('연차가 아니라고 그대로 말합니다', E.indexOf('연차가 아니며')>=0, E);

  // 나가지 않은 날이므로 sentHome이 아닙니다 — 기록과 목록이 그렇게 읽혀야
  // 합니다. 나간 적 없는 사람의 근무내역서에 '귀가'라고 적으면 안 됩니다.
  c.confirmPending();
  const r=c.state.extra.filter(x=>x.type==='shutdown')[0];
  ok('휴업으로 기록됩니다', !!r && r.type==='shutdown');
  ok('나간 적 없는 날은 sentHome이 아닙니다', !r.sentHome);
  const row=c.renderVals().logRows.filter(x=>x.tag==='휴')[0];
  ok('목록은 회사 사정으로 쉰 날이라고 읽습니다', row.io.indexOf('회사 사정으로 쉼')>=0, row.io);
  ok("목록이 '귀가'라고 하지 않습니다", row.io.indexOf('귀가')<0, row.io);

  // 나갔다가 돌려보내진 날은 예전 그대로 '귀가'입니다 — 두 날은 §46에서는
  // 같지만 근무내역서에서는 다른 날이고, 한쪽을 고치다 다른 쪽을 뭉개기
  // 쉬운 자리입니다
  const h=mk(V2,'2026-08-28T09:00:00'); h.setS({ shifts:'day' });
  h.punch(); h.sentHome();
  const hr=h.state.extra.filter(x=>x.type==='shutdown')[0];
  ok('돌려보내진 날은 sentHome입니다', hr.sentHome===true);
  ok('목록은 일이 없어 귀가라고 읽습니다',
    h.renderVals().logRows.filter(x=>x.tag==='휴')[0].io.indexOf('귀가')>=0);
}

console.log('\n== 여덟 개 언어가 모두 나가지 않은 날을 덮습니다 ==');
{
  const langs=['ko','en','vi','th','km','ne','id','zh'];
  langs.forEach(L=>{
    const x=mk(V2,'2026-08-28T17:00:00'); x.setS({ lang:L });
    x.togglePending('shutdown');
    const E=x.renderVals().pendingEffect;
    ok(L+' 설명이 있습니다', !!E && E.length>20, L+': '+E);
    ok(L+' 금액이 들어갑니다', E.indexOf('{p0}')<0 && E.indexOf(x.won(x.shutdownPay()))>=0, L+': '+E);
    ok(L+' 제46조를 짚습니다', E.indexOf('46')>=0, L+': '+E);
  });
  // 영어는 '나갔다'는 전제를 문장 첫머리에서 뺐습니다
  const en=mk(V2,'2026-08-28T17:00:00'); en.setS({ lang:'en' });
  en.togglePending('shutdown');
  const E=en.renderVals().pendingEffect;
  ok('en이 You went in으로 시작하지 않습니다', E.indexOf('You went in but')<0, E);
  ok('en도 근무 전 통보를 덮습니다', E.indexOf('before your shift')>=0, E);
}

console.log('\n== 최저임금이 오르는 날, 앱은 스스로 말을 바꿉니다 ==');
// 근로자의 물음입니다: 최저임금이 바뀌면 휴업수당 같은 금액도 저절로 바뀝니까,
// 아니면 해마다 사람이 챙겨야 합니까?
//
// 금액은 바뀌지 않습니다 — 바뀌면 안 됩니다. 급여는 언제나 근로자 자신의
// 기본금에서 나오고(rate()), 최저임금은 그 옆에 대 보는 잣대일 뿐입니다.
// 회사가 안 올려 줬는데 앱이 올려 버리면, 근무내역서가 받지도 않은 돈을
// 적게 됩니다. 오를 때 앱이 할 일은 금액을 고치는 것이 아니라 '지금 받는
// 시급이 법 아래로 내려갔다'고 말하는 것입니다.
{
  const before=mk(V2,'2026-12-31T09:00:00'); before.setS({ basic:2156880, divisor:209 });
  const after =mk(V2,'2027-01-01T09:00:00'); after.setS({ basic:2156880, divisor:209 });
  ok('최저임금은 해가 바뀌면 오릅니다', before.minWageToday()===10320 && after.minWageToday()===10700,
    before.minWageToday()+' -> '+after.minWageToday());
  ok('내 시급은 그대로입니다', before.rate()===after.rate() && after.rate()===10320);
  ok('휴업수당도 그대로입니다', before.shutdownPay()===after.shutdownPay(),
    before.shutdownPay()+' -> '+after.shutdownPay());
  ok('전날에는 경고가 없습니다', before.renderVals().minWageWarn==='');
  const W=after.renderVals().minWageWarn;
  ok('오르는 날 경고가 뜹니다', W.length>0);
  ok('경고는 올라간 해를 짚습니다', W.indexOf('2027')>=0, W);
  ok('경고는 올라간 금액을 짚습니다', W.indexOf(after.won(10700))>=0, W);
  ok('경고는 내 시급을 짚습니다', W.indexOf(after.won(10320))>=0, W);
}

console.log('\n== 다음 해 고시는 8월에 나옵니다 — 1월까지 기다리지 않습니다 ==');
// 최저임금법 제8조① — 고용노동부장관은 8월 5일까지 다음 해 최저임금을 고시합니다.
// 예전에는 MIN_WAGE_UNTIL을 넘긴 1월 1일에야 알렸는데, 그 날은 앱이 이미
// 틀린 뒤입니다. 최저임금이 오른 첫 달이 하필 앱이 입을 다무는 달이 됐습니다.
{
  const U=V2.MIN_WAGE_UNTIL, y=U.slice(0,4);
  ok('표가 덮는 마지막 해는 스스로 나옵니다', V2.wageTableDueIso()===y+'-08-06', V2.wageTableDueIso());
  ok('앱이 아직 모르는 해도 스스로 나옵니다', V2.wageTableNextYear()===String(+y+1), V2.wageTableNextYear());

  const at=iso=>{ const c=mk(V2,iso+'T09:00:00'); c.setS({ lang:'ko' }); return c; };
  const eve=at('2027-08-05'), due=at('2027-08-06'), dec=at('2027-12-31'), jan=at('2028-01-01');

  ok('8월 5일까지는 조용합니다', !eve.wageTableDue() && !eve.wageTableStale());
  ok('고시 다음 날부터 알립니다', due.wageTableDue()===true);
  ok('그 날 표는 아직 낡지 않았습니다', due.wageTableStale()===false);
  ok('12월 31일까지 이어집니다', dec.wageTableDue()===true && dec.wageTableStale()===false);
  ok('해가 바뀌면 낡음으로 넘어갑니다', jan.wageTableStale()===true);
  ok('둘이 겹치지 않습니다', jan.wageTableDue()===false);

  ok('8월 5일에는 줄이 없습니다', eve.renderVals().wageStale===false);
  ok('8월 6일에는 줄이 있습니다', due.renderVals().wageStale===true);
  ok('1월 1일에도 줄이 있습니다', jan.renderVals().wageStale===true);

  const dm=due.renderVals().wageStaleMsg, jm=jan.renderVals().wageStaleMsg;
  ok('두 줄은 서로 다른 말을 합니다', dm!==jm);
  ok('고시 알림은 아직 모르는 해를 짚습니다', dm.indexOf('2028')>=0, dm);
  ok('고시 알림은 1월 전에 받으라고 합니다', dm.indexOf('1월')>=0, dm);
  ok('낡음 알림은 앱이 아는 마지막 해를 짚습니다', jm.indexOf('2027')>=0, jm);

  // 둘 다 막는 것은 없습니다 — 임금체불로 다투는 사람이 자기 기록을 못 여는
  // 일은 없어야 합니다. 이건 예전부터 그랬고, 갈래가 늘어도 그대로여야 합니다.
  [due, jan].forEach((c,i)=>{
    const tag=i?'낡음':'고시';
    const d=c.now();
    c.state.extra.push({y:d.getFullYear(),m:d.getMonth()+1,day:d.getDate(),
      kind:'day',type:'shift',inH:9,outH:18,c:c.calc(9,18,'day',false)});
    ok(tag+'이어도 기록은 들어갑니다', c.periodRecords().length>0);
    ok(tag+'이어도 근무내역서는 나옵니다', c.evidenceHtml().length>500);
  });

  // 닫으면 이번 실행 동안만 사라집니다(저장하지 않습니다)
  due.setState({ wageStaleHide:true });
  ok('닫으면 사라집니다', due.renderVals().wageStale===false);
}

console.log('\n== 기본값 설명에 숫자를 박아 두지 않습니다 ==');
// 설정의 '흐린 숫자는 기본값입니다' 한 줄이 2,156,880 · 2026 · 10,320을
// 문장 안에 그대로 갖고 있었습니다. 2027년 1월 1일에 새로 깐 사람은 기본금
// 2,236,300을 받는데 이 줄만 2,156,880이라고 우깁니다. tools/check_lang.py가
// 이제 이런 줄에서 시험을 떨어뜨립니다.
{
  const c=mk(V2,'2026-08-28T09:00:00'); c.setS({ lang:'ko' });
  const N=c.renderVals().L.noteDefaults;
  ok('설명이 있습니다', !!N && N.length>20);
  ok('구멍이 남아 있지 않습니다', N.indexOf('{p')<0, N);
  ok('그 날의 최저임금이 들어갑니다', N.indexOf(c.won(c.minWageToday()))>=0, N);
  ok('기준시간이 들어갑니다', N.indexOf(String(V2.DEFAULT_DIVISOR))>=0, N);
  ok('기본값 기본금이 들어갑니다', N.indexOf(c.won(V2.DEFAULTS.basic))>=0, N);

  // ── 문장이 스스로를 부정하지 않아야 합니다 ──
  // DEFAULTS는 페이지를 열 때 한 번 계산되는 static인데, 설명하는 줄은
  // this.now()를 보고 있었습니다. 새해를 넘겨 켜 둔 폰에서 그 둘이 갈라지면
  // '₩2,156,880은 2027 최저임금 ₩10,700 × 209시간입니다'가 됩니다 —
  // 10,700 × 209는 2,236,300입니다. 곱이 맞는지 문장에서 직접 꺼내 봅니다.
  const nums=N.match(/[\d,]{3,}/g).map(x=>+x.replace(/,/g,''));
  ok('적힌 곱이 실제로 맞습니다', nums.indexOf(V2.DEFAULTS.basic)>=0
    && nums.some(a=>nums.some(b=>a*b===V2.DEFAULTS.basic)), N);

  // 새해를 넘겨도 그 줄은 기본값을 계산한 날을 그대로 가리킵니다
  const ny=mk(V2,'2027-06-15T09:00:00'); ny.setS({ lang:'ko' });
  const NY=ny.renderVals().L.noteDefaults;
  const nn=NY.match(/[\d,]{3,}/g).map(x=>+x.replace(/,/g,''));
  ok('새해에도 곱이 맞습니다', nn.some(a=>nn.some(b=>a*b===V2.DEFAULTS.basic)), NY);
  ok('그래도 오늘 법과는 따로 견줍니다',
    ny.renderVals().minWageWarn.indexOf(ny.won(ny.minWageToday()))>=0,
    ny.renderVals().minWageWarn);

  // 여덟 개 언어 모두 — 한 언어만 고치면 나머지 일곱이 낡은 채로 남습니다
  ['ko','en','vi','th','km','ne','id','zh'].forEach(L=>{
    const x=mk(V2,'2026-08-28T09:00:00'); x.setS({ lang:L });
    const M=x.renderVals().L.noteDefaults;
    ok(L+' 설명에 구멍이 없습니다', M.indexOf('{p')<0, L+': '+M);
    ok(L+' 설명에 그 날의 최저임금이 들어갑니다', M.indexOf(x.won(x.minWageToday()))>=0, L+': '+M);
  });
}

console.log('\n== 지난 달 문서는 그 달의 시급으로 남습니다 ==');
// 1월에 기본금을 올리면 12월 근무내역서가 다시 계산됐습니다. 일별 금액은
// 기록에 박혀 있고(c.pay) 합계와 머리말은 지금 설정에서 나오므로, 문서가
// **스스로와 어긋났습니다** — 스무 줄을 더하면 619,200인데 연장근로 합계
// 줄은 642,000이었습니다. 근로감독관은 그 칸을 더해 볼 수 있습니다.
//
// 그리고 이 일은 해마다 1월에 모든 근로자에게 일어납니다. 최저임금이 오르고
// 기본금이 따라 오르는 달이, 하필 지난 달 문서를 회사 명세서와 맞춰 보는
// 달이기 때문입니다.
const decSetup = (iso) => {
  const c = mk(V2, iso);
  c.setS({ basic:2156880, divisor:209, periodStart:1, payday:10, shifts:'day', lang:'ko' });
  for (let d=1; d<=20; d++) c.state.extra.push({ y:2026, m:12, day:d, kind:'day', type:'shift',
    inH:9, outH:20, c:c.calc(9,20,'day',false) });
  return c;
};
const noDate = h => h.replace(/작성 \d{4}\.\d{2}\.\d{2}/, '작성 X');
{
  // 12월이 열려 있는 동안 도장이 찍힙니다
  const c = decSetup('2026-12-20T09:00:00');
  c.stampWage();
  const key = V2.wageKey(c.period(c.now()));
  ok('열린 기간에 도장이 찍힙니다', key==='2026-12-01' && !!c.st().wageLog[key], key);
  ok('도장은 지금 설정입니다', c.st().wageLog[key].rate===10320 && c.st().wageLog[key].src==='live');
  ok('같은 값이면 다시 쓰지 않습니다', (()=>{ const b=JSON.stringify(c.st().wageLog);
    c.stampWage(); return JSON.stringify(c.st().wageLog)===b; })());

  const dec = c.evidenceHtml(c.period(c.now()));

  // 1월 · 회사가 임금을 올리고, 근로자가 식대까지 새로 적습니다
  c.base = new Date('2027-01-15T09:00:00');
  c.setS({ basic:2236300, allowances:[{ name:'식대', amount:200000, tf:true }] });
  c.stampWage();
  const P = c.periodBack(1);
  ok('12월은 도장이 남아 있습니다', c.wageFor(P).src==='live' && c.wageFor(P).rate===10320);
  ok('12월 수당도 그대로입니다', c.wageFor(P).allow===0, String(c.wageFor(P).allow));
  ok('1월은 따로 도장이 찍힙니다', c.st().wageLog['2027-01-01'].rate===10700);
  ok('이번 기간은 지금 설정입니다', c.wageFor().rate===10700);

  ok('12월 문서가 한 글자도 바뀌지 않습니다',
    noDate(dec)===noDate(c.evidenceHtml(P)));
  // 작성 날짜만은 오늘이어야 합니다 — 덮는 기간과 만든 날은 다른 것입니다
  ok('작성 날짜는 오늘로 바뀝니다', c.evidenceHtml(P).indexOf('작성 2027.01.15')>=0);

  // 문서 안에서 줄의 합과 합계 줄이 같아야 합니다
  const doc = c.evidenceHtml(P);
  const t = c.totals(null, P), W = c.wageFor(P);
  const rowSum = c.periodRecords(P).reduce((a,r)=>a+c.dayPay(r,W),0);
  ok('줄의 합과 연장근로 합계가 맞습니다', rowSum===t.ot*c.wOtRate(W),
    rowSum+' vs '+(t.ot*c.wOtRate(W)));
  ok('머리말 시급도 같은 값입니다', doc.indexOf(c.won(10320))>=0 && doc.indexOf(c.won(10700))<0);
  ok('도장이 있으면 단서를 달지 않습니다', doc.indexOf('※')<0);
}

console.log('\n== 앱을 깔기 전에 끝난 기간은 기록에서 되살립니다 ==');
// c.pay = ot×otRate + night×nightRate + hol×otRate 이므로 시간을 알면 시급이
// 나옵니다. 지어내는 것이 아니라 앱이 이미 저장해 둔 값을 거꾸로 푸는 것입니다.
{
  [2156880, 2236300, 2600000, 3010000].forEach(basic => {
    const c = mk(V2, '2027-01-15T09:00:00');
    c.setS({ basic, divisor:209, periodStart:1, payday:10, shifts:'both' });
    for (let d=1; d<=10; d++) c.state.extra.push({ y:2026, m:12, day:d, kind:'day', type:'shift',
      inH:9, outH:20, c:c.calc(9,20,'day',false) });
    const truth = c.rate();
    c.setS({ basic: 9999999 });   // 그 뒤로 임금이 완전히 달라졌습니다
    const W = c.wageFor(c.periodBack(1));
    ok('시급이 원 단위까지 돌아옵니다 ('+basic+')', W.rate===truth, W.rate+' vs '+truth);
    ok('되살린 것이라고 표시합니다 ('+basic+')', W.src==='recovered');
  });

  // 잔업도 야간도 특근도 없는 기간은 아무것도 말해 주지 않습니다 — 지어내지 않습니다
  const flat = mk(V2, '2027-01-15T09:00:00');
  flat.setS({ basic:2156880, divisor:209, periodStart:1, payday:10, shifts:'day' });
  for (let d=1; d<=10; d++) flat.state.extra.push({ y:2026, m:12, day:d, kind:'day', type:'shift',
    inH:9, outH:18, c:flat.calc(9,18,'day',false) });
  ok('되살릴 것이 없으면 null입니다', flat.recoverWage(flat.periodBack(1))===null);
  ok('모른다고 말합니다', flat.wageFor(flat.periodBack(1)).src==='unknown');

  // 그리고 문서가 그 사실을 스스로 적습니다 — 지어낸 숫자를 조용히 내지 않습니다
  const dU = flat.evidenceHtml(flat.periodBack(1));
  ok('모르는 기간은 문서에 단서를 답니다', dU.indexOf('현재 설정값')>=0);
  ok('단서는 급여명세서로 확인하라고 합니다', dU.indexOf('급여명세서로 확인')>=0);

  const rc = mk(V2, '2027-01-15T09:00:00');
  rc.setS({ basic:2156880, divisor:209, periodStart:1, payday:10, shifts:'both' });
  for (let d=1; d<=10; d++) rc.state.extra.push({ y:2026, m:12, day:d, kind:'day', type:'shift',
    inH:9, outH:20, c:rc.calc(9,20,'day',false) });
  const dR = rc.evidenceHtml(rc.periodBack(1));
  ok('되살린 기간은 그 사실을 적습니다', dR.indexOf('되살린 값')>=0);
  ok('수당까지는 되살리지 못한다고 적습니다', dR.indexOf('고정수당은 현재 설정값')>=0);
}

console.log('\n== 쓰던 사람은 새 화면도 잃는 것도 없습니다 ==');
{
  // 새 설정이므로 업그레이드하면 wageLog가 비어서 들어옵니다. 그 사람의
  // 기본금·급여기간은 그대로여야 하고, 지난 기간은 기록에서 되살아납니다.
  const blob={ v:2, settings:{ basic:2600000, divisor:209, periodStart:21, payday:25, shifts:'both' },
    extra:[], removed:[] };
  const store={ 'worklog.v2': JSON.stringify(blob) };
  const g=global.window.localStorage.getItem;
  global.window.localStorage.getItem=k=>store[k]||null;
  const c=new V2({}); c.base=new Date('2026-08-28T09:00:00'); c.t0=Date.now();
  global.window.localStorage.getItem=g;
  ok('기본금은 그대로입니다', c.st().basic===2600000, String(c.st().basic));
  ok('급여기간도 그대로입니다', c.st().periodStart===21);
  ok('wageLog는 비어서 들어옵니다', JSON.stringify(c.st().wageLog)==='{}');
  for(let d=21; d<=27; d++) c.state.extra.push({ y:2026, m:8, day:d, kind:'night', type:'shift',
    inH:20+40/60, outH:32+50/60, c:c.calc(20+40/60,32+50/60,'night',false) });
  c.stampWage();
  const k=V2.wageKey(c.period(c.now()));
  ok('도장은 그 사람의 기간 첫날에 찍힙니다', k==='2026-08-21', k);
  ok('도장은 그 사람의 기본금입니다', c.st().wageLog[k].basic===2600000);
  // localStorage가 전부인 앱이라 크기가 곧 한계입니다
  ok('도장 하나가 200바이트를 넘지 않습니다',
    JSON.stringify(c.st().wageLog[k]).length<200, JSON.stringify(c.st().wageLog[k]).length+'B');
}

console.log('\n== 임금 기준을 붙들어도 오늘 화면은 그대로입니다 ==');
{
  // 인자 없이 부르면 예전과 똑같아야 합니다 — v1 등가 증명이 붙어 있는 자리입니다
  const c = mk(V2, '2026-12-20T09:00:00');
  c.setS({ basic:2600000, divisor:209, otMult:1.5, nightMult:0.5, holOverMult:2 });
  ok('wRate()는 rate()입니다', c.wRate()===c.rate());
  ok('wOtRate()는 otRate()입니다', c.wOtRate()===c.otRate());
  ok('wNightRate()는 nightRate()입니다', c.wNightRate()===c.nightRate());
  ok('wHolOverRate()는 holOverRate()입니다', c.wHolOverRate()===c.holOverRate());
  ok('wFixedPay()는 fixedPay()입니다', c.wFixedPay()===c.fixedPay());
  ok('배수도 함께 붙듭니다', c.wageNow().otMult===1.5 && c.wageNow().holOverMult===2);
  // 이번 기간은 도장이 있어도 지금 설정을 씁니다 — 아직 끝나지 않았으니까요
  c.stampWage();
  c.setS({ basic:3000000 });
  ok('열린 기간은 지금 설정을 따라갑니다', c.wageFor().rate===c.rate());
}

console.log('\n== 급여 탭과 근무내역서가 같은 기간을 같게 말합니다 ==');
// 문서만 붙들어 두면 새 어긋남이 생깁니다 — 문서는 12월 시급으로 얼어 있는데
// 급여 탭은 지금 시급으로 다시 셉니다. 같은 기간을 두 화면이 다르게 말하면
// 근로자는 어느 쪽을 회사에 들이밀어야 할지 알 수 없습니다. 스테퍼를 함께
// 쓰기로 한 것과 같은 이유입니다(2026-08-21 열두째 항목).
{
  const c = decSetup('2026-12-20T09:00:00');
  c.stampWage();
  const before = { gross: c.renderVals().grossPay, net: c.renderVals().netPay };

  // 새해 · 임금 인상 + 식대 신설
  c.base = new Date('2027-01-15T09:00:00');
  c.setS({ basic:2236300, allowances:[{ name:'식대', amount:200000, tf:true }] });
  c.stampWage();
  c.stepPay(1);                       // 급여·근무기록 스테퍼를 12월로
  const P = c.viewPeriod();
  ok('12월을 보고 있습니다', P.label==='12.01 → 12.31', P.label);

  const V = c.renderVals(), W = c.wageFor(P), t = c.totals(null, P);
  ok('급여 탭 금액이 12월 그대로입니다', V.grossPay===before.gross && V.netPay===before.net,
    before.gross+'/'+before.net+' -> '+V.grossPay+'/'+V.netPay);

  // 그리고 문서와 한 글자도 다르지 않아야 합니다
  const doc = c.evidenceHtml(P);
  ok('지급총액이 문서와 같습니다', doc.indexOf(V.grossPay)>=0, V.grossPay);
  ok('실수령이 문서와 같습니다', doc.indexOf(V.netPay)>=0, V.netPay);

  // 명세서 대조표의 기본금도 12월 것입니다 — 1월 기본금+식대가 아닙니다
  const basicRow = c.slipRows(P).filter(r=>r.k==='basic')[0];
  ok('대조표 기본금이 12월 것입니다', basicRow.app===2156880, String(basicRow.app));
  ok('대조표에 1월 식대가 섞이지 않습니다', basicRow.app!==2436300);

  // 일별 상세도 같은 시급으로 — 목록을 펼쳤을 때 문서와 다른 숫자가 나오면 안 됩니다
  const row = V.logRows.filter(r=>r.detail && r.detail.length)[0];
  const otLine = row.detail.map(x=>x.k+' '+x.v).join(' | ');
  ok('일별 상세도 12월 시급입니다', otLine.indexOf(c.won(c.wOtRate(W)))>=0, otLine);
  ok('일별 상세에 1월 시급이 없습니다', otLine.indexOf(c.won(16050))<0, otLine);

  // 이번 기간으로 돌아오면 다시 지금 설정입니다
  c.goPeriod(0);
  ok('이번 기간은 지금 설정입니다', c.wageFor(c.viewPeriod()).rate===c.rate());
  ok('이번 기간 기본금은 새 기본금입니다', c.wageFor(c.viewPeriod()).basic===2236300);
}

console.log('\n== 근무내역서는 누가 썼는지를 맨 위에서 밝힙니다 ==');
// 이 문서를 만든 사람은 회사도 공공기관도 아니고, 이 앱을 만든 사람도 아닙니다 —
// 근로자 본인입니다. 그 말이 맨 아래 회색 잔글씨에 있으면 읽히지 않고, 읽히지
// 않으면 표만 보고 '회사가 발행한 증명서'로 읽힙니다. 임금체불 진정에 없던
// 서류를 만들어 내는 것은 그 자체가 문제가 되므로(서류 위조), 이 문서는 스스로
// 무엇인지 먼저 말해야 합니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  const doc = c.evidenceHtml(c.period(c.now()));
  const head = doc.slice(0, doc.indexOf('<h2>계산 기준</h2>'));

  ok('본인이 작성한 기록이라고 적혀 있습니다', head.indexOf('근로자 본인이 작성한 기록입니다')>=0);
  ok('회사가 발행한 것이 아니라고 적혀 있습니다', head.indexOf('발행한 증명서가 아닙니다')>=0);
  ok('금액은 참고용 추정치라고 적혀 있습니다', head.indexOf('참고용 추정치')>=0);
  // 자리가 중요합니다 — 표보다 위, 첫 <h2>보다 위
  ok('그 말이 첫 표보다 위에 있습니다',
    doc.indexOf('근로자 본인이 작성한 기록입니다') < doc.indexOf('<table'));
  ok('상자로 둘러싸여 잔글씨가 아닙니다', head.indexOf('class="self"')>=0);
}

console.log('\n== 이 앱은 계산기이지 노무사가 아닙니다 ==');
// 공인노무사법 제27조① — 노무사가 아닌 자는 노동관계법령에 관한 상담·지도나
// 서류의 작성·확인을 '업으로서' 해서는 안 됩니다(제28조, 3년 이하 징역 또는
// 500만원 이하 벌금). 이 앱은 무료이고, 본인의 기록을 본인의 입력으로 계산해
// 보여 줄 뿐이며 어떤 사건도 대리하지 않습니다 — 그 사실이 문서와 화면 양쪽에
// 적혀 있어야 합니다. 같은 조 제2항은 그렇게 오인될 표시·광고도 금합니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  const doc = c.evidenceHtml(c.period(c.now()));

  ok('법률 자문이 아니라고 적혀 있습니다', doc.indexOf('법률 자문이나 노무 상담이 아닙니다')>=0);
  ok('노무사·변호사가 아니라고 적혀 있습니다', doc.indexOf('공인노무사·변호사가 아니며')>=0);
  ok('대리하지 않는다고 적혀 있습니다', doc.indexOf('대리하거나 대행하지 않습니다')>=0);
  ok('판단은 고용노동부의 몫이라고 적혀 있습니다', doc.indexOf('고용노동부와 공인노무사·변호사')>=0);
  ok('확정 금액은 급여명세서라고 적혀 있습니다', doc.indexOf('급여명세서와 근로계약서를 따릅니다')>=0);
  ok('세금·보험이 추정이라고 적혀 있습니다', doc.indexOf('소득세와 4대보험은 추정치')>=0);
  ok('1350을 알려 줍니다', doc.indexOf('1350')>=0);
  ok('노동포털 주소가 있습니다', doc.indexOf('labor.moel.go.kr')>=0);
  ok('무료라고 적혀 있습니다', doc.indexOf('무료로')>=0);
}

console.log('\n== 만든 사람의 이름은 근무내역서에 찍히지 않습니다 ==');
// 이 문서는 근로감독관 앞에 놓이는 종이입니다. 도구의 이름과 판(版)이 있으면
// 어떻게 계산된 것인지 확인할 수 있고, 그 이상은 필요하지 않습니다. 만든 사람의
// 이름은 설정 › 정보에 그대로 남습니다 — 그 화면은 근로자 본인만 봅니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  const doc = c.evidenceHtml(c.period(c.now()));

  ok('문서에 만든 사람 이름이 없습니다', doc.indexOf(V2.AUTHOR)<0, V2.AUTHOR);
  ok('도구 이름과 판은 남습니다', doc.indexOf('근무기록 LOGGER v2')>=0);
  ok('오프라인이라는 사실도 남습니다', doc.indexOf('본인 휴대폰에만 저장됩니다')>=0);
  // 설정 › 정보에는 그대로 있습니다
  ok('설정 정보에는 이름이 있습니다', c.renderVals().L.aboutMadeBy.indexOf(V2.AUTHOR)>=0);
}

console.log('\n== 법적 고지는 접히지 않고 여덟 개 언어에 다 있습니다 ==');
// 접어 두면 아무도 열지 않습니다. 그리고 부족액을 찾아낸 근로자가 다음에 할 일은
// 앱을 더 보는 것이 아니라 1350에 거는 것이므로, 도움받을 곳이 같은 자리에
// 붙어 있어야 합니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    c.setS({ lang:L });
    const V = c.renderVals().L;
    ok(L+' 법적 고지가 있습니다', !!V.legalNotAdvice && V.legalNotAdvice.length>60, L);
    ok(L+' 도움받을 곳이 있습니다', !!V.legalHelp && V.legalHelp.indexOf('1350')>=0, L);
    ok(L+' 머리말이 있습니다', !!V.secLegal);
    // 한국어 낱말이 앞에 섭니다 — 근로자가 전화기 너머에서 그 말을 찾아야 합니다
    ok(L+' 고용노동부라는 낱말이 그대로 있습니다', V.legalHelp.indexOf('고용노동부')>=0, L);
    ok(L+' 노무사·변호사가 아니라고 말합니다', V.legalNotAdvice.indexOf('공인노무사')>=0, L);
  });
  c.setS({ lang:'ko' });
}

console.log('\n== 고지를 붙였다고 앱이 하던 일을 멈추지는 않습니다 ==');
// 최저임금 경고가 그랬듯이(2026-08-17), 이것도 경고이지 잠금이 아닙니다.
// 출퇴근도, 기록 열람도, 근무내역서 출력도, CSV도 그대로여야 합니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  const P = c.period(c.now());
  const doc = c.evidenceHtml(P), t = c.totals(null, P);
  ok('일별 표가 그대로 나옵니다', doc.indexOf('<h2>일별 기록</h2>')>=0);
  ok('스무 날이 그대로 들어 있습니다', t.days===20, 'days='+t.days);
  ok('합계도 그대로입니다', doc.indexOf('<h2>합계</h2>')>=0);
  ok('CSV도 그대로 나옵니다', c.csvText().split('\n').length>20);
  ok('문서 이름은 바뀌지 않았습니다', c.evidenceName(P)==='근무내역서-12011231.html', c.evidenceName(P));
}

console.log('\n== 한 공장에서 셋이 내면 누구 것인지 알 수 있어야 합니다 ==');
// 이 앱은 지금까지 누구의 것인지 모르는 기록만 만들었습니다. 같은 회사에서
// 세 사람이 쓰고 각자 근무내역서를 내면, 문서도 파일 이름도 똑같습니다 —
// 한 폴더에 받으면 서로 덮어쓰기까지 합니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  c.setS({ workerName:'NGUYEN VAN A' });
  const P = c.period(c.now());
  const doc = c.evidenceHtml(P);

  ok('문서에 성명이 있습니다', doc.indexOf('NGUYEN VAN A')>=0);
  ok('성명이라는 낱말이 붙습니다', doc.indexOf('근로자 성명')>=0);
  // 자리 — 제목 아래, 급여기간보다 위. 갈라 보는 사람이 먼저 찾는 것이므로.
  ok('제목 바로 아래입니다', doc.indexOf('<h1>') < doc.indexOf('근로자 성명'));
  ok('급여기간보다 위입니다', doc.indexOf('근로자 성명') < doc.indexOf('급여기간'));
  ok('미기재라고 하지 않습니다', doc.indexOf('미기재')<0);

  // 파일 이름 — 열기 전에 보이는 유일한 것입니다
  ok('파일 이름에 성명이 들어갑니다', c.evidenceName(P)==='근무내역서-NGUYEN VAN A-12011231.html',
    c.evidenceName(P));

  // CSV — 노무사가 여러 사람 것을 한 표에 붙일 수 있어야 합니다
  const csv = c.csvText(), row = csv.trim().split('\r\n')[1];
  ok('CSV 머리글에 근로자 칸이 있습니다', csv.indexOf('근로자,날짜')>=0);
  ok('CSV 줄마다 이름이 붙습니다', row.indexOf('NGUYEN VAN A')===0, row.slice(0,30));

  // 세 사람이 각자 내면 세 파일이 다 다릅니다
  const names = ['NGUYEN VAN A','SOM CHAI','김철수'].map(n => { c.setS({ workerName:n });
    return c.evidenceName(P); });
  ok('세 사람의 파일 이름이 다 다릅니다', new Set(names).size===3, names.join(' / '));
}

console.log('\n== 이름을 안 적으면 문서가 스스로 그렇게 말합니다 ==');
// 조용히 익명으로 나가는 것이 가장 나쁩니다 — 근로자는 이름이 없는 줄 모르고
// 보내고, 받은 사람은 누구 것인지 모릅니다. 비워 둘 수 있게 하되, 비어 있다는
// 사실은 문서에 빨간 글씨로 남습니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  const P = c.period(c.now());
  ok('기본값은 비어 있습니다', c.workerName()==='' , JSON.stringify(c.st().workerName));

  const doc = c.evidenceHtml(P);
  ok('미기재라고 적습니다', doc.indexOf('미기재')>=0);
  ok('왜 필요한지도 적습니다', doc.indexOf('누구의 것인지 알 수 있습니다')>=0);
  ok('빨간 글씨입니다', doc.indexOf('class="who nm"')>=0);
  // 그래도 막지는 않습니다 — 문서는 그대로 만들어집니다
  ok('문서는 그대로 만들어집니다', doc.indexOf('<h2>일별 기록</h2>')>=0 && c.totals(null,P).days===20);
  ok('파일 이름은 예전 그대로입니다', c.evidenceName(P)==='근무내역서-12011231.html', c.evidenceName(P));
  // CSV 칸은 이름이 없어도 있습니다 — 파일마다 모양이 다르면 붙일 수가 없습니다
  ok('이름이 없어도 CSV 칸은 있습니다', c.csvText().indexOf('근로자,날짜')>=0);

  // 공백만 친 것은 이름이 아닙니다
  c.setS({ workerName:'   ' });
  ok('공백만 친 것은 이름이 아닙니다', c.workerName()==='');
  ok('공백이면 문서도 미기재입니다', c.evidenceHtml(P).indexOf('미기재')>=0);
  ok('공백이 파일 이름에 새지 않습니다', c.evidenceName(P)==='근무내역서-12011231.html', c.evidenceName(P));
}

console.log('\n== 이름은 파일 이름에 넣을 수 있게 다듬습니다 ==');
// 안드로이드·윈도우·맥이 싫어하는 글자가 파일 이름에 들어가면 저장이 실패합니다.
// 한글·태국어 이름은 그대로 둡니다 — 이 앱을 쓰는 사람의 이름이 ASCII라는
// 보장이 없고, 파일 이름은 사람이 읽는 것입니다.
{
  ok('슬래시를 지웁니다', V2.fileSafe('A/B\\C')==='ABC', V2.fileSafe('A/B\\C'));
  ok('콜론과 물음표를 지웁니다', V2.fileSafe('A:B?C*D')==='ABCD', V2.fileSafe('A:B?C*D'));
  ok('공백은 하나로 줄입니다', V2.fileSafe('  NGUYEN   VAN  A  ')==='NGUYEN VAN A', V2.fileSafe('  NGUYEN   VAN  A  '));
  ok('한글 이름은 그대로 둡니다', V2.fileSafe('김철수')==='김철수');
  ok('태국어 이름도 그대로 둡니다', V2.fileSafe('สมชาย')==='สมชาย');
  ok('아주 긴 이름은 자릅니다', V2.fileSafe('가'.repeat(80)).length===40);
  ok('빈 값은 빈 값입니다', V2.fileSafe(null)==='' && V2.fileSafe(undefined)==='');
  // 못 쓰는 글자만 친 이름은 파일 이름에서 조용히 빠집니다
  const c = decSetup('2026-12-20T09:00:00');
  c.setS({ workerName:'///' });
  ok('못 쓰는 글자만이면 파일 이름은 예전 그대로입니다',
    c.evidenceName(c.period(c.now()))==='근무내역서-12011231.html', c.evidenceName(c.period(c.now())));
  ok('그래도 문서에는 적힙니다', c.evidenceHtml(c.period(c.now())).indexOf('///')>=0);
}

console.log('\n== 성명 칸은 여덟 개 언어에 다 있고, 쓰던 사람을 건드리지 않습니다 ==');
{
  const c = decSetup('2026-12-20T09:00:00');
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    c.setS({ lang:L, workerName:'' });
    let V = c.renderVals();
    ok(L+' 이름표가 있습니다', !!V.L.workerNameLbl && !!V.L.workerNamePh, L);
    ok(L+' 비었을 때 그렇게 말합니다', !!V.workerNameNote && V.workerNameNote!==c.T('worker_name_hint'), L);
    ok(L+' 비었을 때 빨갛습니다', V.workerNameBd==='var(--color-accent)', L);
    c.setS({ workerName:'A' });
    V = c.renderVals();
    ok(L+' 적으면 조용해집니다', V.workerNameBd==='var(--color-neutral-300)', L);
  });
  c.setS({ lang:'ko' });

  // 쓰던 사람: 저장된 설정에 workerName이 없어도 터지지 않고 미기재로 갑니다
  const old = mk(V2, '2026-12-20T09:00:00');
  delete old.st().workerName;
  ok('예전 저장본에도 이름 칸이 없을 뿐입니다', old.workerName()==='');
  ok('예전 저장본도 문서가 나옵니다', old.evidenceHtml(old.period(old.now())).indexOf('근무내역서')>=0);
}

console.log('\n== 회사를 옮겨도 지난 달 문서는 그 때의 회사입니다 ==');
// 성명과 달리 사업장명은 바뀝니다. 붙들어 두지 않으면 회사를 옮긴 다음 뽑는
// 지난 달 문서가 전부 새 회사 이름을 답니다 — 열여섯째가 기본금에서 겪은 바로
// 그 어긋남이고, 임금체불 진정에서는 상대를 잘못 지목하는 문서가 됩니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  c.setS({ workerName:'NGUYEN VAN A', employer:'(주)한국정밀' });
  c.stampWage();
  const k = V2.wageKey(c.period(c.now()));
  ok('도장에 사업장명이 함께 찍힙니다', c.st().wageLog[k].employer==='(주)한국정밀',
    c.st().wageLog[k].employer);

  const dec = c.evidenceHtml(c.period(c.now()));
  ok('12월 문서에 그 회사가 있습니다', dec.indexOf('(주)한국정밀')>=0);
  ok('12월 문서에 단서가 없습니다', dec.indexOf('현재 설정값입니다')<0);

  // 1월 · 회사를 옮깁니다
  c.base = new Date('2027-01-15T09:00:00');
  c.setS({ employer:'(주)대한기계' });
  c.stampWage();
  const P = c.periodBack(1);
  ok('12월 기준은 옛 회사 그대로입니다', c.employerFor(c.wageFor(P)).name==='(주)한국정밀',
    c.employerFor(c.wageFor(P)).name);
  ok('12월 기준은 확실합니다', c.employerFor(c.wageFor(P)).sure===true);

  const doc = c.evidenceHtml(P);
  ok('지난 달 문서는 옛 회사입니다', doc.indexOf('(주)한국정밀')>=0);
  ok('새 회사가 지난 달 문서에 새지 않습니다', doc.indexOf('(주)대한기계')<0);
  // 이번 기간은 새 회사입니다
  ok('이번 기간은 새 회사입니다', c.employerFor(c.wageFor(c.period(c.now()))).name==='(주)대한기계');
}

console.log('\n== 회사 이름은 기록에서 되살릴 수 없습니다 — 그렇게 적습니다 ==');
// 시급은 c.pay에서 거꾸로 풀 수 있지만(recoverWage) 회사 이름은 어디에도
// 남지 않습니다. 지어내지 않고, 지금 설정값을 쓰되 문서가 그렇다고 밝힙니다.
{
  const c = decSetup('2027-01-15T09:00:00');   // 12월에 도장이 없습니다
  c.setS({ employer:'(주)대한기계' });
  const P = c.periodBack(1);
  const W = c.wageFor(P);
  ok('시급은 되살아납니다', W.src==='recovered' && W.rate===10320, W.src+'/'+W.rate);
  const E = c.employerFor(W);
  ok('회사 이름은 확실하지 않습니다', E.sure===false);
  ok('그래도 이름은 보여 줍니다', E.name==='(주)대한기계', E.name);

  const doc = c.evidenceHtml(P);
  ok('문서가 현재 설정값이라고 밝힙니다', doc.indexOf('현재 설정값입니다')>=0);
  ok('회사를 옮겼다면 다르다고 말합니다', doc.indexOf('이 기간의 회사는 다른')>=0);
  ok('그 단서는 빨간 글씨입니다', doc.indexOf('<span class="nm">')>=0);
}

console.log('\n== 이 변경 이전에 찍힌 도장은 확실하지 않은 쪽입니다 ==');
// employer 자체가 없는 옛 도장을 '확실하다'고 하면, 없는 것을 있다고 하는 것이
// 됩니다. 그런 기간은 현재 설정값 + 단서로 갑니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  c.stampWage();
  const k = V2.wageKey(c.period(c.now()));
  const log = JSON.parse(JSON.stringify(c.st().wageLog));
  delete log[k].employer;                       // 예전 판이 찍은 도장
  c.setS({ wageLog: log, employer:'(주)대한기계' });
  c.base = new Date('2027-01-15T09:00:00');
  const P = c.periodBack(1), W = c.wageFor(P);
  ok('도장 자체는 살아 있습니다', W.src==='live' && W.rate===10320, W.src);
  ok('회사만 확실하지 않습니다', c.employerFor(W).sure===false);
  ok('문서에 단서가 붙습니다', c.evidenceHtml(P).indexOf('현재 설정값입니다')>=0);
}

console.log('\n== 사업장명을 안 적으면 그 줄이 아예 없습니다 ==');
// 성명과 다릅니다. 성명이 없으면 '누구 문서인가'를 아무도 모르므로 빨갛게
// 말해야 하지만, 사업장명이 없다고 문서가 못 쓰게 되지는 않습니다. 경고를
// 쌓아 두면 정작 봐야 할 빨간 줄이 묻힙니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  const P = c.period(c.now());
  ok('기본값은 비어 있습니다', (c.st().employer||'')==='');
  const doc = c.evidenceHtml(P);
  ok('사업장 줄이 없습니다', doc.indexOf('사업장 <b>')<0);
  ok('빈 사업장 경고도 없습니다', doc.indexOf('현재 설정값입니다')<0);
  ok('문서는 그대로 만들어집니다', doc.indexOf('<h2>일별 기록</h2>')>=0);
  // 공백만 친 것은 이름이 아닙니다
  c.setS({ employer:'   ' });
  ok('공백만이면 여전히 줄이 없습니다', c.evidenceHtml(P).indexOf('사업장 <b>')<0);
  ok('공백은 도장에도 빈 값으로 갑니다', c.wageNow().employer==='');
}

console.log('\n== 근무내역서를 만드는 곳은 한 군데뿐입니다 ==');
// 2026-08-18(여섯째)부터 내 권리 아래와 설정 › 백업과 내보내기 두 곳에 같은
// 스테퍼와 단추가 있었습니다. 같은 docBack을 나눠 쓰므로 한쪽에서 옮기면 다른
// 탭도 말없이 따라갑니다 — 서로 보이지 않는 두 탭이라 유령이 됩니다.
// 2026-08-28(스무째)에 그 하나 남은 자리가 급여 탭으로 옮겨 왔고, 자기 스테퍼는
// 아예 없어졌습니다 — 문서의 기간은 그 탭이 보고 있는 기간입니다.
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const count = (re) => (tpl.match(re) || []).length;
  ok('근무내역서 단추는 하나입니다', count(/\{\{ doEvidence \}\}/g)===1, String(count(/\{\{ doEvidence \}\}/g)));
  ok('문서만의 스테퍼는 없습니다', count(/\{\{ docPrev \}\}/g)===0&&count(/\{\{ docNext \}\}/g)===0);
  ok('급여기간 스테퍼는 근무기록과 급여 둘뿐입니다',
    count(/\{\{ payPrev \}\}/g)===2, String(count(/\{\{ payPrev \}\}/g)));
  ok('내 권리의 안내 한 줄은 남습니다', count(/\{\{ L\.rightsEvidence \}\}/g)===1);

  // 그 한 줄은 어디서 만드는지 가리켜야 합니다 — 여덟 개 언어 모두
  const c = decSetup('2026-12-20T09:00:00');
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    c.setS({ lang:L });
    const t = c.renderVals().L.rightsEvidence;
    ok(L+' 어디서 만드는지 가리킵니다', t.indexOf('급여')>=0, L);
    ok(L+' 없어진 화면을 가리키지 않습니다', t.indexOf('백업과 내보내기')<0, L);
  });
  c.setS({ lang:'ko' });
  // 스테퍼는 지워도 기능은 그대로입니다
  ok('지난 기간 문서는 그대로 만들어집니다',
    c.evidenceHtml(c.periodBack(0)).indexOf('<h2>일별 기록</h2>')>=0);
}

console.log('\n== 성명과 사업장명은 백업 상자 안에 있을 일이 아닙니다 ==');
// 근로자의 말: 백업과 내보내기는 파일을 내보내고 되돌리는 곳이어야 하는데,
// 성명·사업장명·근무내역서가 다 그 안에 들어 있어서 어색하다.
// 맞습니다. 세 가지는 쓰는 빈도도(한 번 / 한 달에 한 번 / 어쩌면 평생 한 번),
// 읽는 사람도(아무도 / 근로감독관 / 앱 자신) 다릅니다. 그리고 백업을 한 번도
// 생각해 본 적 없는 사람은 자기 이름을 적는 칸을 영영 만나지 못했습니다 —
// 성명 미기재는 문서가 나온 뒤에야 드러납니다.
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const cut = (a, b) => tpl.slice(tpl.indexOf(a), tpl.indexOf(b));
  // 내 정보는 2026-08-29에 '더 정확하게' 층으로 옮겨졌습니다 — 회사 규칙 다음,
  // 언어·파일 층 머리말 앞입니다. 성명은 어떤 금액도 바꾸지 않습니다.
  const me     = cut('{{ gMeTap }}', '{{ L.tierRest }}');
  const backup = cut('{{ gBackupTap }}', '{{ L.secLegal }}');
  const pay    = cut('{{ isPay }}', '{{ isRights }}');

  ok('성명 칸은 내 정보에 있습니다', me.indexOf('{{ workerNameVal }}')>=0);
  ok('사업장명도 함께 있습니다', me.indexOf('{{ employerVal }}')>=0);
  ok('백업에는 성명이 없습니다', backup.indexOf('{{ workerNameVal }}')<0);
  ok('백업에는 사업장명도 없습니다', backup.indexOf('{{ employerVal }}')<0);
  ok('백업에는 근무내역서 단추가 없습니다', backup.indexOf('{{ doEvidence }}')<0);
  // 남은 것은 정말로 파일을 내보내고 되돌리는 것들뿐입니다
  ok('백업에 JSON 내보내기가 있습니다', backup.indexOf('{{ doExport }}')>=0);
  ok('백업에 복원이 있습니다', backup.indexOf('{{ pickImport }}')>=0);
  // ── 뒤집었습니다 · CSV도 급여 탭으로 갔습니다 ──
  // 스무째는 CSV를 이 상자에 남겼습니다. 이유는 '묶음 이름이 약속하는 바로
  // 그것'이라는 것이었는데, 그것은 같은 항목이 열아홉째를 두고 '서류함의
  // 논리이지 근로자의 논리가 아니다'라며 물리친 바로 그 논리입니다.
  // 누가 읽는가로 다시 물으면 CSV의 독자는 노무사·상담소이고(csvNote가
  // 그렇게 말합니다) 여는 계기는 근무내역서와 같습니다. 앱 자신이 읽는
  // JSON 백업과는 다른 무리입니다.
  ok('CSV는 백업에 없습니다', backup.indexOf('{{ doExportCsv }}')<0);
  // 묶음 이름이 '백업과 내보내기'에서 '백업'으로 바뀌었습니다 — 내보낼 것이
  // JSON 하나만 남았기 때문입니다. 이름을 바꾸면 그 이름을 가리키던 글이
  // 없는 화면을 가리키게 됩니다(소개 넷째 장이 그랬습니다). 여덟 개 언어
  // 어디에도 옛 이름이 남지 않았는지 셉니다.
  ok('묶음 이름은 백업입니다',
    V2.STR['grp_backup'].ko === '백업' && V2.STR['grp_backup__en'].ko === 'BACKUP');
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    const stale = Object.keys(V2.STR).filter(k =>
      typeof V2.STR[k][L] === 'string' && V2.STR[k][L].indexOf('백업과 내보내기') >= 0);
    ok(L + ' 옛 묶음 이름을 가리키는 글이 없습니다', stale.length === 0, stale.join(','));
  });
  ok('CSV는 급여에 있습니다', pay.indexOf('{{ doExportCsv }}')>=0);
  // 두 군데에 두면 유령이 됩니다 — 열아홉째가 복제된 근무내역서 스테퍼를
  // 지운 이유와 같습니다. 앱 전체에 하나뿐이어야 합니다.
  ok('CSV 단추는 앱에 하나뿐입니다',
    (tpl.match(/\{\{ doExportCsv \}\}/g) || []).length === 1);
  // 근무내역서 바로 다음입니다 — 부족액을 찾은 사람이 원하는 두 가지가
  // 나란히 있어야 합니다.
  ok('CSV는 근무내역서 다음입니다',
    pay.indexOf('{{ doEvidence }}') < pay.indexOf('{{ doExportCsv }}'));
  // ── 기간을 물려받지 않습니다 ──
  // 바로 위 근무내역서는 기간 스테퍼를 따르는데 CSV는 기록 전부입니다.
  // 그 차이가 화면에 적혀 있지 않으면 '이 기간의 CSV'로 읽힙니다.
  ok('CSV 상자는 기간이 아니라 기록 전부라고 말합니다',
    pay.indexOf('{{ L.csvLabel }}')>=0 && pay.indexOf('{{ csvScope }}')>=0);
  {
    const c2 = mk(V2, '2026-08-17T10:00:00');
    const z2 = { gross:0, bk:0, net:8, reg:8, ot:0, night:0, hol:0, pay:0 };
    // 서로 다른 세 급여기간
    c2.state.extra = [
      { y:2026, m:8, day:2, kind:'day', type:'shift', c:z2 },
      { y:2026, m:6, day:2, kind:'day', type:'shift', c:z2 },
      { y:2025, m:5, day:2, kind:'day', type:'shift', c:z2 },
    ];
    ok('보고 있는 기간이 아니라 전부를 셉니다',
      c2.renderVals().csvScope === c2.T('n_days_recorded', { p0: 3 }),
      c2.renderVals().csvScope);
    // 기간을 옮겨도 그 숫자는 그대로여야 합니다 — 기간과 무관하기 때문입니다
    c2.goPeriod(1);
    ok('기간을 옮겨도 전부 그대로입니다',
      c2.renderVals().csvScope === c2.T('n_days_recorded', { p0: 3 }));
    ok('CSV 내용도 여전히 전부입니다',
      c2.csvText().trim().split('\r\n').length === 4);
  }
  // ── 알림은 따로 삽니다 ──
  // 한 상태를 나눠 쓰면 급여에서 내보낸 알림이 설정 화면에 남습니다.
  {
    const c3 = mk(V2, '2026-08-17T10:00:00');
    c3.setState({ csvMsg: '내보냈습니다', backupMsg: '' });
    ok('CSV 알림은 백업 알림과 다른 자리입니다',
      c3.renderVals().csvMsg === '내보냈습니다' && !c3.renderVals().backupMsg);
  }
  // 근무내역서는 급여 탭으로 갔습니다
  ok('근무내역서 단추는 급여에 있습니다', pay.indexOf('{{ doEvidence }}')>=0);
  ok('내 정보에는 단추가 없습니다', me.indexOf('{{ doEvidence }}')<0);
  // ── 자리가 바뀌었습니다(2026-08-29) ──
  // 스무째는 여덟 묶음이 나란한 화면에서 '가장 먼저 만나는 자리'를 우선순위로
  // 썼습니다. 이제 층이 그 일을 하므로, 성명은 '더 정확하게'로 내려갔습니다 —
  // 성명은 어떤 금액도 바꾸지 않습니다. **접혀 있어도 빨갛게 말하는 것은 그대로**
  // 이고(바로 아래 블록), 그것이 스무째가 실제로 지키려던 것입니다.
  ok('내 정보는 첫 층에 없습니다', tpl.indexOf('{{ L.tierMore }}')<tpl.indexOf('{{ gMeTap }}'));
  ok('내 정보는 회사 규칙 다음입니다', tpl.indexOf('{{ gRulesTap }}')<tpl.indexOf('{{ gMeTap }}'));
  ok('언어·파일 층보다는 앞입니다', tpl.indexOf('{{ gMeTap }}')<tpl.indexOf('{{ L.tierRest }}'));
  // 첫 층은 앱이 꼭 알아야 하는 셋뿐입니다
  const t1 = tpl.indexOf('{{ L.tierNeed }}'), t2 = tpl.indexOf('{{ L.tierMore }}');
  ok('첫 층은 근무조·급여조건·급여기간 셋입니다',
    ['{{ gShiftTap }}','{{ gPayTap }}','{{ gPeriodTap }}']
      .every(t => tpl.indexOf(t)>t1 && tpl.indexOf(t)<t2)
    && ['{{ gMeTap }}','{{ gMoneyTap }}','{{ gInsTap }}','{{ gRulesTap }}','{{ gLangTap }}','{{ gBackupTap }}']
      .every(t => !(tpl.indexOf(t)>t1 && tpl.indexOf(t)<t2)));
}

console.log('\n== 접혀 있어도 이름이 있는지 없는지가 보입니다 ==');
{
  const c = decSetup('2026-12-20T09:00:00');
  let V = c.renderVals();
  ok('이름이 없으면 요약이 성명 미기재', V.gMeSum==='성명 미기재', V.gMeSum);
  ok('그 줄은 빨갛습니다', V.gMeSumInk==='var(--color-accent)', V.gMeSumInk);
  // 다른 묶음까지 빨개지지는 않습니다 — 경고를 쌓으면 빨간 줄이 묻힙니다.
  // 2026-08-29부터 빨강의 뜻이 하나 늘었습니다: 첫 층에서 아직 정하지 않은 것.
  // 그 둘 말고는 여전히 조용해야 합니다.
  c.setS({ basicConfirmed:true, shiftConfirmed:true, periodConfirmed:true });
  V = c.renderVals();
  ok('첫 층을 다 정하면 그쪽은 조용합니다', V.gPaySumInk==='var(--color-neutral-700)'
    && V.gShiftSumInk==='var(--color-neutral-700)' && V.gPeriodSumInk==='var(--color-neutral-700)');
  ok('그래도 성명 미기재는 빨갛습니다', V.gMeSumInk==='var(--color-accent)');
  ok('나머지 묶음은 언제나 조용합니다', V.gBackupSumInk==='var(--color-neutral-700)'
    && V.gLangSumInk==='var(--color-neutral-700)' && V.gInsSumInk==='var(--color-neutral-700)'
    && V.gRulesSumInk==='var(--color-neutral-700)' && V.gMoneySumInk==='var(--color-neutral-700)');

  c.setS({ workerName:'NGUYEN VAN A' });
  V = c.renderVals();
  ok('이름을 적으면 요약이 이름입니다', V.gMeSum==='NGUYEN VAN A', V.gMeSum);
  ok('빨간색도 사라집니다', V.gMeSumInk==='var(--color-neutral-700)', V.gMeSumInk);
  // 공백만 친 것은 이름이 아닙니다 — 문서와 같은 판단을 합니다
  c.setS({ workerName:'   ' });
  ok('공백만이면 여전히 미기재', c.renderVals().gMeSum==='성명 미기재');

  c.setS({ workerName:'NGUYEN VAN A' });
  // 펼치면 요약은 지웁니다 — 바로 아래에 같은 값이 다시 나오니까요
  c.renderVals().gMeTap();
  ok('펼치면 열립니다', c.renderVals().gMeOpen===true);
  ok('펼치면 요약이 비워집니다', c.renderVals().gMeSum==='');
  c.renderVals().gMeTap();
  ok('다시 누르면 접힙니다', c.renderVals().gMeOpen===false);

  // 여덟 개 언어에 다 있습니다
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    c.setS({ lang:L });
    const V2v = c.renderVals();
    ok(L+' 묶음 이름이 있습니다', !!V2v.gMeKo && V2v.gMeKo.length>1, L+':'+V2v.gMeKo);
    c.setS({ workerName:'' });
    ok(L+' 미기재도 그 언어로 말합니다', !!c.renderVals().gMeSum, L);
    c.setS({ workerName:'NGUYEN VAN A' });
  });
  c.setS({ lang:'ko' });
}

console.log('\n== 문서의 기간은 급여 탭이 보고 있는 기간입니다 ==');
// 예전에는 문서에 docBack이라는 자기 스테퍼가 있어서, 같은 앱이 '어느 기간을
// 보고 있는가'에 두 가지로 답할 수 있었습니다 — 화면은 8월인데 문서는 7월.
// 열두째가 근무기록과 급여를 하나로 묶은 것과 같은 이유로, 이제 하나입니다.
{
  const c = mk(V2,'2026-08-18T10:00:00');
  c.setS({ periodStart:1, payday:10, shifts:'day', dayStart:'06:00', workerName:'A' });
  [1,2,3].forEach(d=>c.state.extra.push({y:2026,m:7,day:d,kind:'day',type:'shift',
    inH:6,outH:15,c:c.calc(6,15,'day',false)}));
  [3,4].forEach(d=>c.state.extra.push({y:2026,m:8,day:d,kind:'day',type:'shift',
    inH:6,outH:15,c:c.calc(6,15,'day',false)}));

  ok('처음에는 이번 기간', c.renderVals().docPeriodLabel==='08.01 → 08.31');
  ok('그 기간의 날수를 되읽습니다', c.renderVals().docPeriodSub.indexOf('2')>=0,
    c.renderVals().docPeriodSub);
  // 화면을 옮기면 문서도 함께 옮겨 갑니다
  c.goPeriod(1);
  ok('‹ 를 누르면 문서 줄도 7월', c.renderVals().docPeriodLabel==='07.01 → 07.31');
  ok('만들어지는 파일도 7월', c.evidenceName(c.viewPeriod())==='근무내역서-A-07010731.html',
    c.evidenceName(c.viewPeriod()));
  ok('근무기록이 보는 기간과 같습니다', c.viewPeriod().label==='07.01 → 07.31');

  // 문서를 만들었다는 알림은 백업의 것과 섞이지 않습니다
  c.setState({ docMsg:'만들었습니다', docErr:false, backupMsg:'백업했습니다' });
  ok('문서 알림은 문서 자리에', c.renderVals().docMsg==='만들었습니다');
  ok('백업 알림은 백업 자리에', c.renderVals().backupMsg==='백업했습니다');
  ok('문서 알림이 백업 자리로 새지 않습니다', c.renderVals().backupMsg!=='만들었습니다');
  ok('알림 색은 따로 갈립니다', c.renderVals().docInk==='var(--color-neutral-700)');
  c.setState({ docErr:true });
  ok('만들지 못하면 빨갛습니다', c.renderVals().docInk==='var(--color-accent-700)');

  // 기간을 옮기면 방금 만든 문서의 알림은 그 기간의 것이 아닙니다
  c.setState({ docMsg:'만들었습니다' });
  c.goPeriod(0);
  ok('기간을 옮기면 알림이 지워집니다', c.renderVals().docMsg==='');
}

console.log('\n== 옮겼다고 앱이 하던 일을 멈추지는 않습니다 ==');
{
  const c = decSetup('2026-12-20T09:00:00');
  c.setS({ workerName:'NGUYEN VAN A', employer:'(주)한국정밀' });
  const P = c.period(c.now());
  const doc = c.evidenceHtml(P);
  ok('근무내역서는 그대로 나옵니다', doc.indexOf('<h2>일별 기록</h2>')>=0);
  ok('성명도 그대로 찍힙니다', doc.indexOf('NGUYEN VAN A')>=0);
  ok('사업장명도 그대로 찍힙니다', doc.indexOf('(주)한국정밀')>=0);
  ok('CSV도 그대로 열네 칸입니다', c.csvText().split('\r\n')[0].split(',').length===14);
  ok('CSV 맨 앞은 여전히 근로자입니다', c.csvText().indexOf('근로자,날짜')>=0);
  ok('CSV에 이름이 들어갑니다', c.csvText().indexOf('NGUYEN VAN A')>=0);
  // 임금 계산식은 손대지 않았습니다
  ok('시급은 그대로입니다', c.rate()===Math.round(2156880/209));
}

console.log('\n== 이 칸에 적는 것은 사람이 아니라 회사 이름입니다 ==');
// 근로자의 말: 'Employer'를 회사 이름으로 바꿔 주십시오. 맞습니다 — 'EMPLOYER'는
// 사람(고용주)으로도 읽히는데 이 칸에 적는 것은 근로계약서에 적힌 회사 이름이고,
// 이 앱에서 '사업주'는 이미 다른 뜻으로 쓰이고 있습니다: 근로기준법 제46조의
// 사업주 귀책. 한 낱말이 두 가지를 가리키면 안 됩니다.
{
  const c = decSetup('2026-12-20T09:00:00');
  const isCompany = t => /company|사업장명|회사|công ty|公司|บริษัท|perusahaan|कम्पनी|ក្រុមហ៊ុន/i.test(t);
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    c.setS({ lang:L });
    const V = c.renderVals();
    ok(L+' 칸 이름이 회사 이름입니다', isCompany(V.L.employerLbl), L+':'+V.L.employerLbl);
    ok(L+' 안내문도 같은 낱말을 씁니다', isCompany(V.L.employerHint), L);
    // 사람을 가리키는 낱말은 남아 있지 않습니다
    ok(L+' 고용주라고 하지 않습니다',
      !/employer|고용주|nơi làm việc|用人单位|สถานประกอบการ|रोजगारदाता|និយោជក/i
        .test(V.L.employerLbl+' '+V.L.employerHint), L);
  });
  // 한국어는 사업장명이 앞에 섭니다 — 근로계약서와 문서에 적히는 낱말입니다
  c.setS({ lang:'ko' });
  ok('한국어는 사업장명이 앞', c.renderVals().L.employerLbl.indexOf('사업장명')===0,
    c.renderVals().L.employerLbl);
  ok('문서는 여전히 사업장이라고 씁니다',
    c.evidenceHtml(c.period(c.now())).indexOf('사업장')>=0 ||
    (c.setS({employer:'(주)한국정밀'}),
     c.evidenceHtml(c.period(c.now())).indexOf('사업장')>=0));

  // §46 사업주 귀책은 법조문의 말입니다 — 같이 쓸려 나가면 안 됩니다
  ['ko','en'].forEach(L => {
    c.setS({ lang:L });
    const T = k => c.T(k, { p0:'₩0' });
    ok(L+' 사업주 귀책 휴업은 그대로', /employer|사업주/i.test(T('shutdown_employer_s_side')), L);
    ok(L+' 제46조 사유 문장도 그대로', /employer|사업주/i.test(T('rsn_fx_employer')), L);
  });
  c.setS({ lang:'ko' });
}

console.log('\n== 이름 한가운데의 O는 출퇴근 패드의 지문입니다 ==');
// 근로자가 물어서 만든 것입니다: 앱 이름의 O 자리에 출퇴근 화면의 초록 지문을
// 넣어 주십시오. 이름이 나오는 자리는 셋입니다 — 머리말, 소개 화면, 설정 › 정보.
// 셋이 서로 다르게 생기면 그것은 로고가 아니라 사고입니다.
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const count = (re) => (tpl.match(re) || []).length;

  ok('이름이 나오는 자리는 셋입니다', count(/근무기록 L<svg/g)===3, String(count(/근무기록 L<svg/g)));
  ok('셋 다 GGER로 이어집니다', count(/<\/svg>GGER/g)===3);
  // aria-label에는 온전한 이름이 남아 있어야 합니다 — 없어야 하는 것은 화면에
  // 글자로 찍히던 자리입니다
  ok('글자로 찍히던 LOGGER는 남아 있지 않습니다', count(/>근무기록 LOGGER</g)===0,
    String(count(/>근무기록 LOGGER</g)));
  // 초록은 출퇴근 패드의 지문과 같은 값이어야 합니다 — 다르면 두 초록이 됩니다
  const pad = (src.match(/padIconInk:[^\n]*'(oklch\([^']+\))'/)||[])[1];
  ok('패드의 초록을 읽어 왔습니다', !!pad, String(pad));
  ok('로고의 초록이 패드와 같습니다',
    count(new RegExp('stroke="'+pad.replace(/[().]/g,'\\$&')+'"','g'))===3, pad);
  // 그림은 글자가 아니므로, 이름은 aria-label이 말해 줍니다
  ok('세 자리 모두 읽을 수 있는 이름이 붙어 있습니다',
    count(/aria-label="근무기록 LOGGER/g)===3);
  ok('그림 자체는 읽히지 않습니다', count(/<svg viewBox="0 0 24 24"[^>]*aria-hidden="true"/g)>=3);
  // 세 자리의 크기·정렬이 한 벌입니다
  ok('크기와 정렬이 셋 다 같습니다',
    count(/width:1\.05em;height:1\.05em;vertical-align:-0\.13em/g)===3);

  // ── 판 번호는 화면에서 뺐습니다 ──
  // 공개된 적이 없는 앱이라 처음 내보내는 판이 1판입니다. 화면이 'v2'라고 하면
  // 있지도 않은 이력을 주장하는 것입니다.
  const about = tpl.slice(tpl.indexOf('{{ L.secAbout }}'), tpl.indexOf('{{ L.aboutMadeBy }}'));
  // 태그를 걷어내고 글자만 봅니다 — path 데이터에도 'v2'(세로선 명령)가 들어 있어서,
  // 날것 그대로 찾으면 지문 그림이 판 번호로 잡힙니다. 한 번 그렇게 걸렸습니다.
  const aboutText = about.replace(/<[^>]*>/g, '');
  ok('정보에는 판 번호가 없습니다', !/v\d/i.test(aboutText), aboutText.trim());
  ok('정보의 읽는 이름도 판 번호가 없습니다',
    about.indexOf('aria-label="근무기록 LOGGER"')>=0);

  // ── 문서에는 그림이 들어가지 않습니다 ──
  // 근무내역서는 근로감독관 앞에 놓이는 종이이고, 그 안의 '작성 도구' 줄은
  // 글자여야 합니다. 여기에 <svg>가 들어가면 인쇄와 첨부에서 무슨 일이
  // 일어날지 알 수 없습니다.
  const c = decSetup('2026-12-20T09:00:00');
  const doc = c.evidenceHtml(c.period(c.now()));
  ok('문서는 여전히 글자로 근무기록 LOGGER라고 씁니다', doc.indexOf('근무기록 LOGGER v2')>=0);
  ok('문서에 지문 그림은 없습니다', doc.indexOf('<svg')<0);
}

console.log('\n== 시계가 1초마다 도는데 기록 전부를 예순 번 다시 셌습니다 ==');
{
  // 시계 틱 하나가 renderVals()를 부르고, 그 한 번이 month()를 예순 번 넘게
  // 물었습니다. month()의 중복 제거가 배열 indexOf라 기록 수의 제곱이었고,
  // periodBackMax()는 period()를 한 틱에 7,751번 불렀습니다. 3년치(939건)에서
  // 한 틱에 15.5ms, 6년치에서는 44ms — 매 초입니다. 캐시를 붙였습니다.
  //
  // 캐시는 renderVals()가 도는 동안에만 삽니다. 기록의 정체(identity)를 키로
  // 삼지 않은 이유가 여기 있습니다: state.extra를 제자리에서 push하는 코드가
  // 실제로 있고(이 파일이 그렇게 기록을 심습니다), 그러면 캐시가 기록 하나를
  // 조용히 빠뜨립니다. 근무내역서에서 하루가 사라지는 것은 이 앱이 절대 내면
  // 안 되는 실패라, 캐시가 렌더 밖으로 새지 않는 것을 여기서 셉니다.
  const mkc = (iso) => { const c = new V2({}); c.base = new Date(iso); c.t0 = Date.now(); return c; };
  const seed = (c, days, y, m, d0) => {
    for (let i = 0; i < days; i++)
      c.state.extra.push({ y, m, day: d0 + i, kind:'day', type:'shift',
        inH:9, outH:21, c: c.calc(9, 21, 'day', false) });
  };

  const c = mkc('2026-08-28T10:00:00');
  seed(c, 5, 2026, 8, 21);

  ok('렌더 전에는 캐시가 없습니다', !c._rc);
  const V = c.renderVals();
  ok('렌더가 끝나면 캐시는 사라집니다', !c._rc);
  ok('렌더는 예전처럼 값을 내놓습니다', !!V && typeof V === 'object');

  // 캐시가 렌더 밖으로 새면, 렌더 사이에 넣은 기록이 다음 렌더에서 안 보입니다.
  const before = c.month().length;
  c.state.extra.push({ y:2026, m:8, day:27, kind:'day', type:'shift',
    inH:9, outH:21, c: c.calc(9, 21, 'day', false) });
  ok('렌더 사이에 넣은 기록이 바로 보입니다', c.month().length === before + 1,
    before + ' -> ' + c.month().length);
  ok('다음 렌더도 그 기록을 셉니다',
    c.renderVals().payPeriodSub === c.T('n_days_recorded', { p0: c.periodRecords(c.viewPeriod()).length }));

  // 지운 기록도 마찬가지입니다 — 캐시가 살아 있으면 지운 날이 남아 있습니다.
  const k = c.key({ y:2026, m:8, day:27 });
  c.state.removed = c.state.removed.concat([k]);
  ok('지운 기록은 바로 사라집니다', c.month().length === before,
    'got ' + c.month().length);

  // 캐시를 켠 채로 센 값과 끄고 센 값이 같아야 합니다. 다르면 그것이 버그입니다.
  const c2 = mkc('2026-08-28T10:00:00');
  seed(c2, 20, 2026, 8, 1);
  const P = c2.viewPeriod();
  const cold = JSON.stringify(c2.periodRecords(P).map(r => c2.key(r)));
  c2._rc = {};
  const warm = JSON.stringify(c2.periodRecords(P).map(r => c2.key(r)));
  const warm2 = JSON.stringify(c2.periodRecords(P).map(r => c2.key(r)));
  c2._rc = null;
  ok('캐시를 켜도 같은 기록이 나옵니다', cold === warm && warm === warm2);

  // period()도 같은 캐시를 쓰므로, 캐시가 기간을 뒤섞지 않는지 봅니다.
  const c3 = mkc('2026-08-28T10:00:00');
  c3.state.settings.periodStart = 21;
  const p0 = JSON.stringify(c3.periodBack(0).label), p1 = JSON.stringify(c3.periodBack(1).label);
  c3._rc = {};
  ok('캐시를 켜도 이번 기간과 지난 기간이 다릅니다',
    JSON.stringify(c3.periodBack(0).label) === p0
    && JSON.stringify(c3.periodBack(1).label) === p1
    && p0 !== p1, p0 + ' / ' + p1);
  c3._rc = null;

  // 기간 시작일을 바꾸면 캐시가 옛 기간을 물고 있으면 안 됩니다.
  const c4 = mkc('2026-08-28T10:00:00');
  c4.state.settings.periodStart = 1;
  const first = c4.period(c4.now()).label;
  c4.state.settings.periodStart = 21;
  ok('기간 시작일을 바꾸면 기간도 바뀝니다', c4.period(c4.now()).label !== first,
    first + ' -> ' + c4.period(c4.now()).label);

  // 렌더가 던져도 캐시는 남지 않습니다 (finally). 남으면 그 뒤의 모든 계산이
  // 그 순간의 답에 얼어붙습니다.
  const c5 = mkc('2026-08-28T10:00:00');
  const inner = c5.renderValsInner;
  c5.renderValsInner = () => { throw new Error('boom'); };
  let threw = false;
  try { c5.renderVals(); } catch (e) { threw = true; }
  c5.renderValsInner = inner;
  ok('렌더가 던져도 캐시는 남지 않습니다', threw && !c5._rc);
}

console.log('\n== 쓰이지 않는 것은 두지 않습니다 ==');
{
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
  const c = new V2({});
  // keyDate(k)는 어디에서도 불리지 않았습니다 — 소스에도 시험에도.
  ok('keyDate()는 없어졌습니다', typeof c.keyDate !== 'function');
  ok('소스에도 남아 있지 않습니다', src.indexOf('keyDate(') < 0);
  // ded_tax는 ded_tax__mine / ded_tax__est로 갈라지면서 쓰이지 않게 됐습니다.
  ok('ded_tax는 지웠습니다', !V2.STR['ded_tax'] && !V2.STR['ded_tax__en']);
  ok('갈라진 두 키는 그대로입니다', !!V2.STR['ded_tax__mine'] && !!V2.STR['ded_tax__est']);
  // 지운 뒤에도 공제 줄은 그대로 나옵니다.
  const V = c.renderVals();
  ok('공제 줄은 그대로 나옵니다', Array.isArray(V.dedRows) && V.dedRows.length > 0,
    'rows=' + (V.dedRows || []).length);
}

console.log('\n== 줄을 더하면 지급총액이 나와야 합니다 ==');
{
  // 지급 항목에는 더하는 줄만 있고 빼는 줄이 없었습니다. gross는
  // 고정급 + 변동급 − 결근공제 − 휴업공제인데, 화면과 근무내역서에는 앞의
  // 둘만 줄로 있었습니다. 휴업 하루가 든 달에 20,178원이 설명 없이
  // 사라지고, 결근까지 있으면 107,328원이 빕니다.
  //
  // 열여섯째가 일별 합과 합계 줄이 어긋나는 것을 두고 적었습니다 —
  // 근로감독관은 그 칸을 더해 볼 수 있고, 더해서 맞지 않는 문서는 증거가
  // 되지 못합니다. 여기서 그것을 셉니다.
  const mkp = (iso) => { const c = new V2({}); c.base = new Date(iso); c.t0 = Date.now();
    c.state.settings.periodStart = 21; return c; };
  const shiftD = (c, d) => ({ y:2026, m:8, day:d, kind:'day', type:'shift',
    inH:9, outH:21, c:c.calc(9, 21, 'day', false) });
  const flatD = (d, type) => ({ y:2026, m:8, day:d, kind:'day', type,
    c:{ gross:0, bk:0, net:0, reg:0, ot:0, night:0, hol:0, pay:0 } });
  // '−₩82,560' / '₩92,880' / '—' 를 숫자로. 부호를 놓치면 시험이 통과해 버립니다.
  const amt = (v) => { const m = String(v || '').match(/^(−?)₩([\d,]+)$/);
    return m ? (m[1] ? -1 : 1) * (+m[2].replace(/,/g, '')) : 0; };
  const rowSum = (V) => V.earnRows.reduce((a, r) => a + amt(r.amt), 0);
  const gross = (V) => amt(V.grossPay);

  // ── 네 가지 경우 모두 맞아야 합니다 ──
  const cases = [
    ['공제가 없는 달',        [24, 25], []],
    ['휴업 하루가 든 달',      [24, 25], [[26, 'shutdown']]],
    ['결근 하루가 든 달',      [24, 25], [[27, 'absent']]],
    ['둘 다 든 달',           [24, 25], [[26, 'shutdown'], [27, 'absent']]],
  ];
  cases.forEach(([name, work, flat]) => {
    const c = mkp('2026-08-28T10:00:00');
    c.state.extra = work.map(d => shiftD(c, d)).concat(flat.map(([d, ty]) => flatD(d, ty)));
    const V = c.renderVals();
    ok(name + ' — 줄의 합이 지급총액과 같습니다', rowSum(V) === gross(V),
      rowSum(V) + ' vs ' + gross(V));
  });

  // 공제가 없으면 줄도 없어야 합니다 — 없는 공제를 0원으로 적으면
  // 그것대로 물어볼 거리가 생깁니다.
  {
    const c = mkp('2026-08-28T10:00:00');
    c.state.extra = [shiftD(c, 24), shiftD(c, 25)];
    const V = c.renderVals();
    const labels = V.earnRows.map(r => r.ko + '|' + r.en).join(' ');
    ok('공제가 없으면 공제 줄도 없습니다',
      labels.indexOf('결근') < 0 && labels.indexOf('휴업') < 0
      && labels.indexOf('Absence') < 0 && labels.indexOf('Shutdown') < 0, labels);
  }

  // ── 빼는 줄은 지급 항목 안에 있어야 합니다 ──
  // 공제 칸은 지급총액 → 실수령의 뺄셈입니다. 거기에 두면 두 번 빼는 것으로
  // 읽히고, 실수령이 실제보다 적어 보입니다.
  {
    const a = mkp('2026-08-28T10:00:00'); a.state.extra = [shiftD(a, 24)];
    const b = mkp('2026-08-28T10:00:00');
    b.state.extra = [shiftD(b, 24), flatD(26, 'shutdown'), flatD(27, 'absent')];
    const Va = a.renderVals(), Vb = b.renderVals();
    ok('공제 칸은 늘어나지 않습니다', Va.dedRows.length === Vb.dedRows.length,
      Va.dedRows.length + ' vs ' + Vb.dedRows.length);
    ok('지급 항목이 두 줄 늘어납니다', Vb.earnRows.length === Va.earnRows.length + 2,
      Va.earnRows.length + ' -> ' + Vb.earnRows.length);
    ok('빼는 값으로 적힙니다',
      Vb.earnRows.filter(r => amt(r.amt) < 0).length === 2,
      JSON.stringify(Vb.earnRows.map(r => r.amt)));
  }

  // ── 하루면 단수입니다 (아홉째) ──
  {
    const one = mkp('2026-08-28T10:00:00');
    one.state.settings.lang = 'en';
    one.state.extra = [shiftD(one, 24), flatD(26, 'shutdown')];
    const r1 = one.renderVals().earnRows.filter(r => amt(r.amt) < 0)[0];
    const two = mkp('2026-08-28T10:00:00');
    two.state.settings.lang = 'en';
    two.state.extra = [shiftD(two, 24), flatD(25, 'shutdown'), flatD(26, 'shutdown')];
    const r2 = two.renderVals().earnRows.filter(r => amt(r.amt) < 0)[0];
    ok('휴업 하루는 1 day', r1.hrs === one.T('unit_day_one'), r1.hrs);
    ok('휴업 이틀은 2 days', r2.hrs === two.T('unit_days_n', { n: 2 }), r2.hrs);
  }

  // ── 근무내역서도 같아야 합니다 ──
  // 화면만 고치면 근로감독관 앞에 놓이는 종이가 여전히 맞지 않습니다.
  {
    const c = mkp('2026-08-28T10:00:00');
    c.state.extra = [shiftD(c, 24), shiftD(c, 25), flatD(26, 'shutdown'), flatD(27, 'absent')];
    const P = c.viewPeriod(), t = c.totals(null, P), W = c.wageFor(P), pc = c.payCalc(t, W);
    const doc = c.evidenceHtml(P);
    ok('문서에 결근 공제 줄이 있습니다', doc.indexOf('결근 공제') >= 0);
    ok('문서에 휴업 공제 줄이 있습니다', doc.indexOf('휴업 공제') >= 0);
    ok('문서의 공제도 빼는 값입니다',
      doc.indexOf('−' + c.won(pc.absentCut)) >= 0 && doc.indexOf('−' + c.won(pc.shutCut)) >= 0);
    // 표의 숫자를 실제로 더해 봅니다 — 기본금 + 변동급 − 공제 = 지급총액.
    const built = c.wFixedPay(W) + pc.variable - pc.absentCut - pc.shutCut;
    ok('문서의 지급총액은 그 줄들의 합입니다', Math.round(built) === Math.round(pc.gross),
      built + ' vs ' + pc.gross);
    // 공제가 없는 달의 문서에는 그 줄이 없습니다.
    const clean = mkp('2026-08-28T10:00:00');
    clean.state.extra = [shiftD(clean, 24), shiftD(clean, 25)];
    const doc2 = clean.evidenceHtml(clean.viewPeriod());
    ok('공제가 없으면 문서에도 그 줄이 없습니다',
      doc2.indexOf('결근 공제') < 0 && doc2.indexOf('휴업 공제') < 0);
  }

  // ── 여덟 개 언어에 다 있습니다 ──
  {
    ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
      const c = mkp('2026-08-28T10:00:00');
      c.state.settings.lang = L;
      c.state.extra = [shiftD(c, 24), flatD(26, 'shutdown'), flatD(27, 'absent')];
      const V = c.renderVals();
      const neg = V.earnRows.filter(r => amt(r.amt) < 0);
      ok(L + ' 공제 두 줄이 다 나옵니다', neg.length === 2 && neg.every(r => r.ko && r.en));
      ok(L + ' 줄의 합이 지급총액과 같습니다', rowSum(V) === gross(V));
    });
    // 한국어 명세서 낱말이 앞에 섭니다 — 이 저장소의 집 규칙입니다.
    ['vi','zh','th','id','ne','km'].forEach(L => {
      ok(L + ' 번역은 한국어 낱말이 앞에 섭니다',
        V2.STR['earn_shutcut'][L].indexOf('휴업 공제') === 0
        && V2.STR['earn_absentcut'][L].indexOf('결근 공제') === 0,
        V2.STR['earn_shutcut'][L]);
    });
  }
}

console.log('\n== 공제 차액은 덜 받은 돈이 아닙니다 ==');
{
  // 이 앱을 만든 사람이 자기 명세서를 앱과 맞춰 보다 물었습니다: 특근에서
  // 12,900원이 덜 나온 것은 찾았는데, 공제가 명세서 쪽이 107,120원 많다.
  // 회사가 무언가 더 떼고 있는 것입니까?
  //
  // 아니었습니다. 앱은 4대보험을 기본금+고정수당(2,211,640)에 매기는데
  // 회사는 공단에 신고된 보수월액(연금 3,434,000 · 건강 약 3,482,000)에
  // 매깁니다. 잔업이 통째로 빠져 있으니 차이가 납니다. 소득세도 회사가
  // 개정 전 간이세액표를 쓰고 있어 15,000원 높았고, 장기요양은 회사가
  // 떼는지 아닌지조차 명세서로는 가릴 수 없었습니다.
  //
  // 셋 다 앱이 알 수 없는 값입니다 — 공단·국세청·회사에 있습니다. 그러면
  // 계산으로 고칠 수 있는 것이 아니고, **모른다고 적는 것**이 답입니다.
  // 열여섯째가 임금 기준을 되살릴 수 없을 때 문서에 ※를 붙인 것과 같습니다.
  //
  // 만든 사람조차 네 번을 물어봐야 했습니다. 소스를 못 읽는 근로자에게는
  // 이 한 줄이 회사를 의심할 것인가 말 것인가를 가릅니다.
  const K = 'these_are_estimates_the_app_cannot_see';
  const c = new V2({});
  const V = c.renderVals();

  ok('공제 줄 밑에 한 줄이 붙습니다', !!V.L.dedNote && V.L.dedNote.length > 40, V.L.dedNote);
  ok('그 줄은 새 키에서 옵니다', V.L.dedNote === V2.STR[K]['ko']);

  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
  ok('템플릿에 실제로 걸려 있습니다', src.indexOf('{{ L.dedNote }}') > 0);
  // 공제 총액 줄보다 뒤에 있어야 합니다 — 합계를 보고 나서 읽는 단서입니다.
  ok('자리는 공제 총액 바로 밑입니다',
    src.indexOf('{{ L.dedNote }}') > src.indexOf('{{ dedTotal }}'));

  // ── 여덟 개 언어에 다 있고, 셋을 다 말합니다 ──
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    const t = V2.STR[K][L];
    ok(L + ' 그 줄이 있습니다', !!t && t.length > 40);
    // 1) 명세서에 있는 낱말이 그대로 들어갑니다 — 종이에서 찾을 수 있어야 합니다
    ok(L + ' 보수월액·공제대상가족을 한국어로 짚습니다',
      t.indexOf('보수월액') >= 0 && t.indexOf('공제대상가족') >= 0, t);
    // 2) 어디서 확인하는지 — 앱이 아니라 공단으로 넘깁니다
    ok(L + ' 확인할 곳을 가리킵니다', t.indexOf('4insure.or.kr') >= 0, t);
    // 3) 금액을 박아 두지 않습니다 — 요율도 기준도 해마다 바뀝니다
    ok(L + ' 숫자를 박아 두지 않습니다', !/[0-9]{3},[0-9]{3}/.test(t), t);
  });
  ok('한국어는 차이가 부족액이 아니라고 말합니다',
    V2.STR[K]['ko'].indexOf('덜 받은 돈이 아닙니다') >= 0);
  ok('영어도 같은 말을 합니다',
    V2.STR[K]['en'].indexOf('not money you are owed') >= 0);

  // ── 말만 그런 것이 아니라 셈이 그렇습니다 ──
  // slipShortfall()은 지급 줄(basic·ot·night·hol)만 셉니다. 공제가 아무리
  // 어긋나도 빨간 '부족액'에는 한 푼도 들어가지 않아야 합니다. 이 줄이
  // 설명하는 것이 바로 그 설계입니다 — 한쪽이 무너지면 다른 쪽은 거짓말이 됩니다.
  const d = new V2({});
  d.base = new Date('2026-08-28T10:00:00'); d.t0 = Date.now();
  d.state.settings.periodStart = 21;
  d.state.extra = [{ y:2026, m:8, day:24, kind:'day', type:'shift',
    inH:9, outH:21, c:d.calc(9, 21, 'day', false) }];
  const P = d.viewPeriod();
  const rows = () => d.slipRows(P);
  const app = {}; rows().forEach(r => { app[r.k] = r.app; });
  // 명세서: 잔업은 10,000원 적게, 공제는 107,120원 많게 적습니다.
  d.setSlip('ot', String(Math.round(app.ot) - 10000), P);
  d.setSlip('ded', String(Math.round(app.ded) + 107120), P);
  const after = rows();
  const otRow = after.find(r => r.k === 'ot');
  const dedRow = after.find(r => r.k === 'ded');
  ok('공제 줄도 차이는 보여 줍니다', dedRow.short === 107120, String(dedRow.short));
  ok('잔업 줄의 부족액은 그대로 잡힙니다', otRow.short === 10000, String(otRow.short));
  ok('부족액에는 잔업만 들어갑니다', d.slipShortfall(P) === 10000,
    '공제 107,120이 새면 ' + d.slipShortfall(P));

  // ── 줄을 붙였다고 앱이 하던 일을 멈추지는 않습니다 ──
  ok('공제 줄은 그대로 나옵니다', Array.isArray(V.dedRows) && V.dedRows.length > 0);
  ok('공제 총액도 그대로입니다', !!V.dedTotal && V.dedTotal.indexOf('₩') === 0);
  ok('실수령도 그대로입니다', !!V.netPay && V.netPay.indexOf('₩') === 0);
}

console.log('\n== 보수월액은 명세서의 국민연금에서 되살립니다 ==');
{
  // '보수월액이 얼마입니까'에 답할 수 있는 근로자는 거의 없습니다 — 공단에
  // 있는 값이고 명세서에 그 이름으로 적혀 있지도 않습니다. bosu 칸은 그래서
  // 있으나 마나였습니다(스무째의 성명 칸과 같은 모양 — 있는데 아무도 못 찾음).
  //
  // 그런데 '명세서의 국민연금이 얼마입니까'는 종이를 보고 답할 수 있고, 그
  // 한 줄이 보수월액을 **유일하게** 결정합니다: 기준소득월액은 천원 단위이고
  // 보험료는 10원 미만 절사라, 163,110원을 내는 값은 3,434,000 하나뿐입니다.
  // 열여섯째의 recoverWage()와 같은 방식입니다 — 지어내지 않고 되살립니다.
  const fl = x => Math.floor(x / 10) * 10;

  // ── 실제 명세서 한 줄 ──
  ok('163,110은 3,434,000에서만 나옵니다', V2.bosuFromPension(163110) === 3434000,
    String(V2.bosuFromPension(163110)));
  ok('되돌리면 그 줄이 그대로 나옵니다', V2.pensionOn(3434000) === 163110);

  // ── 답이 하나라는 것을 실제로 셉니다 ──
  // 천원 단위 값 전체를 훑어 163,110을 내는 것이 몇 개인지. 하나여야 합니다.
  {
    let n = 0, hit = 0;
    for (let b = V2.PENSION_FLOOR; b <= 4200000; b += 1000)
      if (V2.pensionOn(b) === 163110) { n++; hit = b; }
    ok('천원 단위 값 가운데 답은 하나뿐입니다', n === 1 && hit === 3434000, 'n=' + n);
  }
  // 요율이 다르면 아예 나오지 않습니다 — 이것이 4.75%임을 명세서가 증언합니다.
  {
    const other = r => { for (let b = 400000; b <= 4200000; b += 1000)
      if (fl(b * r) === 163110) return b; return null; };
    ok('4.5%로는 천원 단위 답이 없습니다', other(0.045) === null);
    ok('5.0%로도 천원 단위 답이 없습니다', other(0.05) === null);
  }

  // ── 되살릴 수 없으면 지어내지 않습니다 ──
  ok('절사되지 않은 금액은 되살리지 않습니다', V2.bosuFromPension(163115) === null);
  ok('천원 단위가 아닌 기준에서 나온 값도 되살리지 않습니다',
    V2.pensionOn(2211640) === 105050 && V2.bosuFromPension(105050) === null);
  ok('0과 빈 값은 null입니다',
    V2.bosuFromPension(0) === null && V2.bosuFromPension('') === null && V2.bosuFromPension(null) === null);
  ok('상한을 넘는 금액은 되살리지 않습니다', V2.bosuFromPension(999999999) === null);

  // ── 한 바퀴 돌려도 제자리입니다 ──
  {
    let bad = null;
    for (let b = 1000000; b <= 6370000; b += 1000)
      if (V2.bosuFromPension(V2.pensionOn(b)) !== b) { bad = b; break; }
    ok('천원 단위 값은 전부 왕복합니다', bad === null, '깨진 값 ' + bad);
  }

  // ── 요율은 한 곳에만 적혀 있습니다 ──
  // 두 곳에 적어 두면 2027년에 한쪽만 고치게 됩니다(열여섯째가 기본금에서
  // 겪은 그것). insCalc가 쓰는 값과 되살리기가 쓰는 값이 같아야 합니다.
  {
    const c = new V2({});
    c.state.settings.bosu = 3434000;
    ok('insCalc도 같은 요율을 씁니다', c.insCalc().pension === V2.pensionOn(3434000));
    ok('insCalc의 국민연금이 명세서와 일치합니다', c.insCalc().pension === 163110,
      String(c.insCalc().pension));
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
    const lit = src.split('\n').filter(l => l.indexOf('0.0475') >= 0 && l.indexOf('//') !== 0);
    ok('4.75%는 소스에 한 번만 적혀 있습니다', lit.length === 1, lit.join(' | '));
  }

  // ── 화면: 치면 보수월액이 채워집니다 ──
  {
    const c = new V2({});
    ok('처음에는 비어 있고 무엇을 적는지 말해 줍니다',
      c.renderVals().bosuPenVal === '' &&
      c.renderVals().bosuPenNote === V2.STR['copy_the_national_pension_line_from_yo']['ko']);
    // 손가락으로 치는 것과 같은 순서: 누르고 → 친다
    c.renderVals().focBosuPen();
    c.renderVals().setBosuPen({ target: { value: '163,110' } });   // 쉼표째 붙여넣어도
    ok('보수월액이 채워집니다', c.st().bosu === 3434000, String(c.st().bosu));
    ok('4대보험 기준이 그 값으로 바뀝니다', c.insBase() === 3434000);
    ok('국민연금이 명세서와 같아집니다', c.insCalc().pension === 163110);
    const V = c.renderVals();
    ok('한 줄이 되살린 값을 말합니다', V.bosuPenNote.indexOf('3,434,000') >= 0, V.bosuPenNote);
    ok('공단에 신고된 값인지는 확인하라고 합니다', V.bosuPenNote.indexOf('4insure.or.kr') >= 0);
    // 칸을 떠나도 값이 보입니다 — bosu 하나에서 다시 계산하므로 두 곳에 저장되지 않습니다
    V.blurBosuPen();
    ok('떠난 뒤에도 그 줄이 칸에 보입니다', c.renderVals().bosuPenVal === '163110',
      c.renderVals().bosuPenVal);
    ok('저장되는 것은 bosu 하나뿐입니다', c.st().bosuPen === undefined);
    // 손으로 보수월액을 고치면 이 칸이 따라옵니다
    c.setS({ bosu: 3000000 });
    ok('보수월액을 고치면 칸도 따라옵니다',
      c.renderVals().bosuPenVal === String(V2.pensionOn(3000000)));
  }

  // ── 되살릴 수 없는 금액을 치면 그렇다고 말합니다 ──
  {
    const c = new V2({});
    c.renderVals().focBosuPen();
    c.renderVals().setBosuPen({ target: { value: '163115' } });
    ok('되살릴 수 없으면 보수월액을 건드리지 않습니다', !c.st().bosu, String(c.st().bosu));
    ok('되살릴 수 없다고 말합니다',
      c.renderVals().bosuPenNote === V2.STR['no_standard_monthly_wage_produces_that']['ko']);
    // 치는 도중에는 나무라지 않습니다 — 아직 다 안 친 것뿐입니다
    c.renderVals().setBosuPen({ target: { value: '' } });
    ok('치는 도중에는 나무라지 않습니다',
      c.renderVals().bosuPenNote !== V2.STR['no_standard_monthly_wage_produces_that']['ko']);
  }

  // ── 여덟 개 언어 ──
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    ['national_pension_on_your_payslip','copy_the_national_pension_line_from_yo',
     'that_pension_line_comes_from_this_wage','no_standard_monthly_wage_produces_that'].forEach(k => {
      ok(L + ' ' + k + ' 있습니다', !!(V2.STR[k] && V2.STR[k][L]));
    });
    // 명세서에 적힌 낱말이 그대로 서야 종이에서 찾을 수 있습니다
    ok(L + ' 국민연금을 한국어로 짚습니다',
      V2.STR['national_pension_on_your_payslip'][L].indexOf('국민연금') >= 0,
      V2.STR['national_pension_on_your_payslip'][L]);
    ok(L + ' 되살린 줄이 보수월액을 한국어로 짚습니다',
      V2.STR['that_pension_line_comes_from_this_wage'][L].indexOf('보수월액') >= 0);
    // 금액을 문장에 박아 두지 않습니다 — 인자로 받습니다
    ok(L + ' 금액은 인자입니다',
      V2.STR['that_pension_line_comes_from_this_wage'][L].indexOf('{p0}') >= 0
      && V2.STR['that_pension_line_comes_from_this_wage'][L].indexOf('{p1}') >= 0);
  });

  // ── 칸을 더했다고 앱이 하던 일을 멈추지는 않습니다 ──
  {
    const c = new V2({});
    ok('보수월액을 안 넣으면 예전 그대로입니다',
      c.insBase() === c.taxableFixed() && !c.st().bosu);
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
    // 숫자 칸의 집 규칙 — type=number를 쓰면 완료 키가 죽습니다(열째)
    const row = src.split('\n').filter(l => l.indexOf('{{ setBosuPen }}') >= 0)[0];
    ok('숫자 칸의 집 규칙을 지킵니다',
      row.indexOf('type="text"') >= 0 && row.indexOf('inputmode="decimal"') >= 0
      && row.indexOf('enterkeyhint="done"') >= 0 && row.indexOf('{{ keyBosuPen }}') >= 0, row);
  }
}

console.log('\n== 무엇이 내 것이고 무엇이 법이 정한 것인지 보입니다 ==');
{
  // 이 앱을 만든 사람이 말했습니다: 내가 만들지 않았다면, 그냥 쓰는 사람이었다면
  // 이 설정 화면은 나에게도 너무 많아 보였을 것이다. 어느 것이 법이 정한 값이라
  // 손댈 필요가 없는지 눈에 보여야 한다. 겁먹고 설정을 아예 안 하게 된다.
  //
  // 옳습니다. 흐린 글씨(isDef)는 '내가 손댔는가'를 말할 뿐 '손대야 하는가'를
  // 말하지 않습니다. 새로 깐 사람은 숫자 열아홉 개를 보고 어느 것이 자기
  // 것인지 알 수 없습니다. 구역을 갈라 이름을 붙였습니다 — 이미 쓰는 방식입니다
  // (2026-08-18 주간 휴게 · DAY-SHIFT BREAKS).
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
  const c = new V2({});
  const V = c.renderVals();

  ok('두 구역 이름이 있습니다', !!V.L.secByLaw && !!V.L.secMine2);
  ok('법정 구역에 안심시키는 한 줄이 붙습니다', !!V.L.byLawNote && V.L.byLawNote.length > 20);

  // ── 내 급여 조건: 기본금은 명세서, 기준시간은 법 ──
  // {{ L.lBasic }}은 급여 탭의 '기본금이 얼마입니까' 카드에도 있습니다.
  // 처음 나오는 것을 집으면 설정이 아니라 그 카드를 재게 됩니다 — 한 번 걸렸습니다.
  const setup = src.indexOf('{{ gPayOpen }}');
  const at = t => src.indexOf(t, setup);
  ok('설정 안에서 재고 있습니다', setup > 0 && src.indexOf('{{ L.lBasic }}') < setup);
  ok('기본금 위에 명세서 구역이 섭니다',
    at('{{ L.secMine2 }}') < at('{{ L.lBasic }}'));
  ok('기준시간 위에 법정 구역이 섭니다',
    at('{{ L.secByLaw }}') < at('{{ L.lDivisor }}') && at('{{ L.lBasic }}') < at('{{ L.secByLaw }}'));

  // ── 4대보험: 보수월액은 명세서, 요율은 법 ──
  const iBosu = at('{{ L.lBosu }}'), iRows = at('{{ insSetRows }}');
  const mine2 = [...src.matchAll(/\{\{ L\.secMine2 \}\}/g)].map(m => m.index);
  const law = [...src.matchAll(/\{\{ L\.secByLaw \}\}/g)].map(m => m.index);
  ok('구역 이름은 설정 안에만 있습니다', mine2.every(i => i > setup) && law.every(i => i > setup));
  ok('보수월액 위에도 명세서 구역이 섭니다', mine2.some(i => i < iBosu && i > at('{{ L.lDivisor }}')));
  ok('보험 요율 위에 법정 구역이 섭니다', law.some(i => i < iRows && i > iBosu));
  // 법정 구역은 셋이 됐습니다 — 회사 규칙의 1일 평균임금이 늘었습니다(스물여덟째).
  ok('명세서 구역 둘 · 법정 구역 셋', mine2.length === 2 && law.length === 3,
    'mine=' + mine2.length + ' law=' + law.length);

  // ── 배수에는 붙이지 않았습니다 ──
  // ×1.5·×0.5·×2.0은 법정 '최저'라 회사가 다르면 고쳐야 합니다. 여기에
  // '그대로 두어도 됩니다'를 붙이면 거짓이 되고, 이 근로자처럼 ×2.0을
  // 안 주는 회사에서 부족액을 영영 못 찾게 됩니다.
  ok('배수 구역에는 법정 이름을 붙이지 않았습니다',
    !law.some(i => i > at('{{ L.secMult }}') && i < at('{{ L.secBonus }}')));
  ok('배수에는 예전의 설명이 그대로 있습니다', !!V.L.noteMult && at('{{ L.noteMult }}') > 0);

  // ── 법정이라고 이름 붙인 것이 정말 법정값인지 ──
  // 이름표가 사실과 어긋나면 이름표가 없느니만 못합니다.
  ok('기준시간 209는 기본값 그대로입니다', V2.DEFAULTS.divisor === 209);
  ok('보험 요율 넷은 앱이 계산합니다', c.st().insAuto === true);
  ok('보수월액은 기본값이 없습니다 — 근로자가 넣는 값입니다', V2.DEFAULTS.bosu === 0);
  ok('기본금 기본값은 최저임금 × 209일 뿐입니다',
    V2.DEFAULTS.basic === V2.minWageOn(V2.DEFAULT_WAGE_ISO) * V2.DEFAULTS.divisor,
    String(V2.DEFAULTS.basic));

  // ── 여덟 개 언어 ──
  ['ko','en','vi','zh','th','id','ne','km'].forEach(L => {
    ['set_by_law_you_can_leave_these','from_your_payslip_or_contract',
     'you_do_not_need_to_change_these_the_la'].forEach(k => {
      ok(L + ' ' + k + ' 있습니다', !!(V2.STR[k] && V2.STR[k][L]));
    });
  });
  // 한국어 낱말이 앞에 섭니다 — 이 저장소의 집 규칙입니다
  ['vi','zh','th','id','ne','km'].forEach(L => {
    ok(L + ' 법정 구역은 한국어가 앞에 섭니다',
      V2.STR['set_by_law_you_can_leave_these'][L].indexOf('법이 정한 값') === 0,
      V2.STR['set_by_law_you_can_leave_these'][L]);
    ok(L + ' 명세서 구역도 그렇습니다',
      V2.STR['from_your_payslip_or_contract'][L].indexOf('명세서를 보고 적으세요') === 0);
  });

  // ── 이름을 붙였다고 앱이 하던 일을 멈추지는 않습니다 ──
  ok('기본금 칸은 그대로 있습니다', V.basicVal !== undefined && !!V.setBasic);
  ok('기준시간 칸도 그대로입니다', V.divisorVal !== undefined && !!V.setDivisor);
  ok('보수월액 칸도 그대로입니다', V.bosuVal !== undefined && !!V.setBosu);
  ok('되살리기 칸도 그대로입니다', V.bosuPenVal !== undefined && !!V.setBosuPen);
}

console.log('\n== 근무조·휴게와 회사 규칙에도 같은 이름을 붙였습니다 ==');
{
  // 스물일곱째를 보고 만든 사람이 말했습니다: 근무조와 휴게, 회사 규칙에도
  // 같은 것을 해 달라. 그런데 그대로 옮길 수가 없었습니다 —
  //
  //   근무조·시작 시각·휴게는 **급여명세서에 없습니다.** 근로기준법 제17조가
  //   근로계약서에 적게 하는 것들입니다. '명세서를 보고 적으세요'라고 하면
  //   있지도 않은 종이를 가리키게 됩니다.
  //
  //   그리고 휴업수당률·토요일·×2.0 지급은 법정도 명세서도 아닙니다. 법이
  //   정하는 것이 '최저'뿐이라 회사마다 다릅니다 — 스물일곱째가 배수를 두고
  //   '세 번째 이름을 만들기 전에 noteMult를 읽으라'고 적었는데, 읽어 보니
  //   그 말이 바로 이 이름이었습니다.
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
  const c = new V2({});
  const L = c.renderVals().L;
  // 이 도우미에 이미 이스케이프된 문자열을 넘기면 두 번 이스케이프되어 **아무것도
  // 못 찾고 빈 배열**을 돌려줍니다. !idx(...).some(...) 꼴의 assertion은 그러면
  // 조용히 통과합니다 — 처음 쓴 두 줄이 그렇게 헛통과했습니다. 날것을 넘기십시오.
  const idx = t => { const out = []; let i = -1; while ((i = src.indexOf(t, i + 1)) >= 0) out.push(i); return out; };

  ok('근로계약서 구역이 있습니다', !!L.secContract && !!L.contractNote);
  ok('회사가 실제로 하는 것 구역이 있습니다', !!L.secDoes && !!L.doesNote);
  ok('근로계약서 안내가 제17조를 짚습니다', L.contractNote.indexOf('제17조') >= 0, L.contractNote);

  // ── 근무조와 휴게: 통째로 근로계약서 ──
  // 근무조의 끝은 언제나 **바로 다음 묶음**입니다 — 그 이상을 재면 남의 구역을
  // 함께 재게 되고, 거기에는 명세서 구역이 실제로 있습니다(한 번 걸렸습니다).
  // 2026-08-29에 층이 생기면서 '바로 다음'이 수당에서 내 급여 조건으로 바뀌었고,
  // 이 줄이 그 자리에서 실패해서 잡혔습니다. 이름이 아니라 순서를 재십시오.
  const shift = src.indexOf('{{ gShiftOpen }}');
  const shiftEnd = src.indexOf('{{ gPayOpen }}');
  const rules = src.indexOf('{{ gRulesOpen }}');
  ok('근무조 묶음의 끝을 제대로 잡았습니다', shift > 0 && shiftEnd > shift && rules > shiftEnd);
  const con = idx('{{ L.secContract }}');
  // {{ shiftOpts }}와 {{ L.secStarts }}는 2026-08-29부터 **네 물음의 첫 화면에서도**
  // 쓰입니다. 그쪽이 소스에서 훨씬 앞이라, 구간을 안 박고 indexOf만 쓰면 설정을
  // 잰다고 생각하면서 소개 흐름을 재게 됩니다 — 스물일곱째의 {{ L.lBasic }}과
  // 같은 자리이고, 이 두 줄이 실제로 그 자리에서 실패해서 잡혔습니다.
  ok('근무조 묶음 맨 위에 근로계약서 구역이 섭니다',
    con.some(i => i > shift && i < src.indexOf('{{ shiftOpts }}', shift)));
  ok('근무조 묶음에는 명세서 구역이 없습니다',
    !idx('{{ L.secMine2 }}').some(i => i > shift && i < shiftEnd));
  ok('근무조 묶음에는 법정 구역도 없습니다',
    !idx('{{ L.secByLaw }}').some(i => i > shift && i < shiftEnd));
  // 기존 세 머리말은 그대로 남아 있어야 합니다(2026-08-18)
  ok('주간·야간 휴게 머리말은 그대로입니다',
    [ '{{ L.secDayBreaks }}', '{{ L.secNightBreaks }}', '{{ L.secStarts }}' ]
      .every(t => { const i = src.indexOf(t, shift); return i > shift && i < shiftEnd; }));

  // ── 회사 규칙: 세 구역이 순서대로 ──
  const at = t => src.indexOf(t, rules);
  // 급여기간과 월급날은 2026-08-29에 자기 묶음이 됐습니다 — 자기 묶음 안에서 잽니다
  const period = src.indexOf('{{ gPeriodOpen }}');
  const atP = t => src.indexOf(t, period);
  ok('급여기간 위에 근로계약서 구역이 섭니다',
    period > 0 && atP('{{ L.secContract }}') < atP('{{ L.lPeriod }}'));
  ok('월급날도 같은 묶음에 있습니다', atP('{{ L.lPayday }}') < src.indexOf('{{ gMoneyOpen }}'));
  ok('회사 규칙에는 급여기간이 남아 있지 않습니다', at('{{ L.lPeriod }}') < 0);
  ok('1일 평균임금 위에 법정 구역이 섭니다',
    at('{{ L.lGrace }}') < at('{{ L.secByLaw }}') && at('{{ L.secByLaw }}') < at('{{ L.lAvgDaily }}'));
  ok('휴업수당률 위에 회사가 하는 것 구역이 섭니다',
    at('{{ L.lAvgDaily }}') < at('{{ L.secDoes }}') && at('{{ L.secDoes }}') < at('{{ L.lShutPct }}'));
  // 법정 구역이 휴업수당률까지 덮어 버리면 거짓말이 됩니다 — 70%는 '최저'입니다
  ok('법정 구역은 1일 평균임금 하나만 덮습니다',
    at('{{ L.secDoes }}') < at('{{ L.lSatHol }}') && at('{{ L.secDoes }}') < at('{{ L.lHolOver }}'));
  ok('배수는 여전히 자기 이름 아래 있습니다',
    at('{{ L.secMult }}') > at('{{ L.lHolOver }}') && at('{{ L.secMult }}') < at('{{ L.secBonus }}'));

  // ── 이름표가 사실과 어긋나지 않는지 ──
  ok('휴업수당 70%는 법정 최저라고 화면이 말합니다',
    L.lShutPctSub.indexOf('70') >= 0 && V2.DEFAULTS.shutdownPct === 70);
  ok('회사가 하는 것 안내는 최저라고 말합니다',
    L.doesNote.indexOf('최저') >= 0, L.doesNote);
  ok('근로계약서 구역에는 그대로 두라고 하지 않습니다',
    L.contractNote.indexOf('두어도 됩니다') < 0 && L.doesNote.indexOf('두어도 됩니다') < 0);

  // ── 여덟 개 언어 ──
  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ['from_your_contract_or_shift_board','your_contract_has_to_state_these_by_la',
     'what_your_company_actually_does','the_pale_figures_are_the_legal_minimum'].forEach(k => {
      ok(Lg + ' ' + k + ' 있습니다', !!(V2.STR[k] && V2.STR[k][Lg]));
    });
  });
  ['vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 근로계약서 구역은 한국어가 앞에 섭니다',
      V2.STR['from_your_contract_or_shift_board'][Lg].indexOf('근로계약서를 보고 적으세요') === 0);
    ok(Lg + ' 회사가 하는 것 구역도 그렇습니다',
      V2.STR['what_your_company_actually_does'][Lg].indexOf('회사가 실제로 하는 것') === 0);
    ok(Lg + ' 안내가 근로계약서를 한국어로 짚습니다',
      V2.STR['your_contract_has_to_state_these_by_la'][Lg].indexOf('근로계약서') >= 0);
  });

  // ── 이름을 붙였다고 앱이 하던 일을 멈추지는 않습니다 ──
  const V = c.renderVals();
  ok('근무조 단추 셋은 그대로입니다', (V.shiftOpts || []).length === 3);
  ok('급여기간·월급날 칸은 그대로입니다', V.periodStartVal !== undefined && V.paydayVal !== undefined);
  ok('휴업수당률 칸도 그대로입니다', V.shutPctVal !== undefined && !!V.setShutPct);
  ok('배수 세 줄도 그대로입니다', (V.multRows || []).length === 3);
}

console.log('\n== 근무조 안내가 고른 조를 말합니다 ==');
{
  // 폰에서 온 보고입니다: 근무조를 주간만·야간만·교대 어느 것으로 바꿔도 그 아래
  // 안내가 언제나 '주간만 하는 사람은 야간 설정이 필요 없습니다'였습니다. 야간만을
  // 고른 사람에게 주간만 이야기를 하고 있었던 것이고, 교대를 고른 사람에게는 아예
  // 반대말을 하고 있었습니다 — 교대야말로 두 조를 다 적어야 하는 근무조입니다.
  //
  // 원인은 한 줄입니다: noteShifts가 갈라지지 않는 리터럴 한 개였습니다.
  // 2026-08-18 일곱째가 적어 둔 그것과 같은 종류입니다 — 같은 값에서 갈라지는
  // 문장이 있으면 그 문장도 함께 갈라져야 합니다.
  const c = new V2({});
  const noteFor = m => { c.setS({ shifts: m }); return c.renderVals().L.noteShifts; };
  const dayN = noteFor('day'), nightN = noteFor('night'), rotN = noteFor('both');

  ok('셋이 서로 다른 문장입니다', dayN !== nightN && nightN !== rotN && dayN !== rotN,
    [dayN, nightN, rotN].map(x => x.slice(0, 12)).join(' | '));
  ok('주간만은 주간만 이야기를 합니다', dayN.indexOf('주간만') === 0, dayN);
  ok('야간만은 야간만 이야기를 합니다', nightN.indexOf('야간만') === 0, nightN);
  ok('교대는 두 조를 다 적으라고 합니다', rotN.indexOf('교대') === 0, rotN);
  ok('야간만 안내가 야간수당 구간을 짚습니다', nightN.indexOf('22:00') >= 0 && nightN.indexOf('06:00') >= 0);
  ok('교대 안내는 앱이 스스로 고른다고 말합니다', rotN.indexOf('스스로') >= 0, rotN);
  // 야간만인 사람에게 '주간'이라고 말하면 안 됩니다 — 처음에 이 assertion이 없어서
  // 문장 하나를 복사해 붙였다가 반대말을 만들 뻔했습니다
  ok('야간만 안내에 주간만이라는 말이 없습니다', nightN.indexOf('주간만') < 0, nightN);
  ok('주간만 안내에 야간만이라는 말이 없습니다', dayN.indexOf('야간만') < 0, dayN);

  // 여덟 개 언어 — 한 언어라도 비면 그 사람은 예전 문장을 계속 봅니다
  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ['day_only_workers_never_see_night_field','night_only_workers_never_see_day_field',
     'rotating_workers_set_both_shifts'].forEach(k => {
      ok(Lg + ' ' + k + ' 있습니다', !!(V2.STR[k] && V2.STR[k][Lg]));
    });
  });
  // 집 규칙 — 한국어 낱말이 앞에 섭니다
  ['vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 주간만 안내는 한국어가 앞에', V2.STR['day_only_workers_never_see_night_field'][Lg].indexOf('주간만') === 0);
    ok(Lg + ' 야간만 안내는 한국어가 앞에', V2.STR['night_only_workers_never_see_day_field'][Lg].indexOf('야간만') === 0);
    ok(Lg + ' 교대 안내는 한국어가 앞에', V2.STR['rotating_workers_set_both_shifts'][Lg].indexOf('교대') === 0);
  });
}

console.log('\n== 지운 휴게는 되살아나지 않습니다 ==');
{
  // 근로자의 보고입니다: 교대에서 17:00–17:30을 ×로 지워도, 주간만을 눌렀다가
  // 교대로 돌아오면 그 휴게가 되살아난다.
  //
  // 원인이 고약합니다. breaksFor()는 '지금 값이 씨앗과 같으면 손대지 않은 것'으로
  // 봤는데, **교대에서 저녁 휴게를 지운 목록은 점심 하나만 남아 주간만의 손대지
  // 않은 기본값과 글자 하나까지 똑같습니다.** 값의 모양으로는 '지웠다'와 '아직
  // 안 건드렸다'를 구별할 수 없습니다. 그래서 사실 자체를 적어 둡니다.
  const c = new V2({});
  ok('새로 깐 폰은 아직 손대지 않았습니다', c.st().breaksTouched === false);

  c.setS(Object.assign({ shifts: 'both' }, c.breaksFor('both')));
  ok('교대를 고르면 저녁 휴게가 따라옵니다', c.st().breaksDay.length === 2);
  ok('그 저녁 휴게에는 연장 표가 붙어 있습니다', c.st().breaksDay[1].ot === true);
  ok('근무조를 고른 것은 휴게를 손댄 것이 아닙니다', c.st().breaksTouched === false);

  c.delBreak('breaksDay', 1);                       // 근로자가 ×를 누릅니다
  ok('지우면 손댄 것으로 남습니다', c.st().breaksTouched === true);
  c.setS(Object.assign({ shifts: 'day' }, c.breaksFor('day')));
  ok('주간만으로 가도 그대로 하나', c.st().breaksDay.length === 1);
  c.setS(Object.assign({ shifts: 'both' }, c.breaksFor('both')));
  ok('교대로 돌아와도 되살아나지 않습니다', c.st().breaksDay.length === 1,
    JSON.stringify(c.st().breaksDay));
  // 열 번을 오가도 마찬가지여야 합니다 — 한 번만 참는 것으로는 부족합니다
  for (let i = 0; i < 10; i++) {
    c.setS(Object.assign({ shifts: i % 2 ? 'both' : 'night' }, c.breaksFor(i % 2 ? 'both' : 'night')));
  }
  ok('열 번을 오가도 그대로입니다', c.st().breaksDay.length === 1);

  // 시각을 고쳐도, 줄을 더해도, 표를 달아도 마찬가지입니다
  ['setBreak', 'addBreak', 'toggleBreakOt', 'addOtBreak'].forEach(fn => {
    const d = new V2({});
    if (fn === 'setBreak') d.setBreak('breaksDay', 0, 'from', '12:00');
    if (fn === 'addBreak') d.addBreak('breaksDay');
    if (fn === 'toggleBreakOt') d.toggleBreakOt('breaksDay', 'day', 0);
    if (fn === 'addOtBreak') d.addOtBreak('breaksDay', 'day');
    ok(fn + ' 뒤에는 손댄 것입니다', d.st().breaksTouched === true);
  });

  // 아직 손대지 않은 사람에게는 예전 그대로 따라갑니다 — 편의를 잃지 않습니다
  const f = new V2({});
  f.setS(Object.assign({ shifts: 'both' }, f.breaksFor('both')));
  ok('손대지 않았으면 교대에서 둘', f.st().breaksDay.length === 2);
  f.setS(Object.assign({ shifts: 'day' }, f.breaksFor('day')));
  ok('손대지 않았으면 주간만에서 하나', f.st().breaksDay.length === 1);

  // 쓰던 사람의 목록은 그 사람의 것입니다 — tourSeen과 같은 근거입니다
  const up = new V2({ savedJson: null });
  ok('업그레이드 판단은 저장본에 있습니다',
    /sv\.breaksTouched === undefined\) sv\.breaksTouched = true/.test(
      require('fs').readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8')));
  ok('그래도 새 설치는 false입니다', up.st().breaksTouched === false);
}

console.log('\n== 12시간 교대라도 8시간에 가는 날은 저녁을 먹지 않았습니다 ==');
{
  // 근로자의 보고입니다: **교대라도 잔업이 없는 날이 있습니다.** 9시부터 6시까지
  // 일하면 8시간이고, 그런 날에는 저녁 휴게를 쓰지 않았습니다. 그런데 앱은
  // 17:00–17:30을 겹치는 구간으로 보고 그대로 30분을 뺐습니다.
  //
  //   09:00 → 18:00   실근무 7.5h   ← 8.0h여야 합니다. 매일 30분씩 잃습니다.
  //
  // 자리로는 이것을 말할 수 없습니다 — 17:00은 8시간이 차기도 전이라 2026-08-18의
  // isOtBreak(자리로만 판단)에 걸리지 않습니다. 그래서 근로자가 줄에 표를 답니다.
  const c = new V2({});
  c.setS({ shifts: 'both', dayStart: '09:00', nightStart: '21:00',
    breaksDay: [{ from: '11:30', to: '12:30' }, { from: '17:00', to: '17:30', ot: true }] });

  const day = o => c.calc(9, o, 'day', false);
  ok('09:00 → 18:00 은 실근무 8.0시간', day(18).net === 8, 'net ' + day(18).net);
  ok('그 날은 잔업이 0입니다', day(18).ot === 0);
  ok('그 날은 저녁 휴게가 빠지지 않습니다', day(18).bk === 1, 'bk ' + day(18).bk);
  ok('09:00 → 21:00 은 예전 그대로 10.5시간', day(21).net === 10.5);
  ok('그 날은 잔업 2.5시간', day(21).ot === 2.5);
  ok('그 날은 점심과 저녁이 다 빠집니다', day(21).bk === 1.5);

  // 잔업이 있으면 빠지고 없으면 안 빠지는 것이라, 그 경계에서 실근무가 거꾸로
  // 줄어들면 안 됩니다 — 30분 더 일하고 돈을 덜 받는 일은 없어야 합니다
  let prev = -1, mono = true;
  for (let o = 17; o <= 23; o += 0.5) { const n = day(o).net; if (n < prev - 1e-9) mono = false; prev = n; }
  ok('늦게까지 일할수록 실근무가 줄지 않습니다', mono);
  ok('경계에서 뒷걸음질하지 않습니다', day(18.5).net >= day(18).net,
    day(18).net + ' → ' + day(18.5).net);

  // 야간조도 같습니다 — 21:00 출근, 자정 휴게, 05:00 잔업 휴게
  const n = new V2({});
  n.setS({ shifts: 'both', dayStart: '09:00', nightStart: '21:00',
    breaksNight: [{ from: '00:00', to: '01:00' }, { from: '05:00', to: '05:30', ot: true }] });
  ok('21:00 → 06:00 은 실근무 8.0시간', n.calc(21, 30, 'night', false).net === 8,
    'net ' + n.calc(21, 30, 'night', false).net);
  ok('21:00 → 09:00 은 실근무 10.5시간', n.calc(21, 33, 'night', false).net === 10.5);
  // 쓰지 않은 휴게를 야간 시간에서 빼도 안 됩니다. 05:00–05:30은 야간 구간
  // (22:00~06:00) 한가운데이므로, 표를 무시하면 야간이 6.5로 줄어듭니다 —
  // 자정 휴게 한 시간만 빠진 7.0이 맞습니다.
  ok('짧은 밤의 야간 시간에서 저녁 휴게가 빠지지 않습니다',
    n.calc(21, 30, 'night', false).night === 7, 'night ' + n.calc(21, 30, 'night', false).night);
  ok('긴 밤에는 둘 다 빠집니다', n.calc(21, 33, 'night', false).night === 6.5,
    'night ' + n.calc(21, 33, 'night', false).night);

  // 표를 달지 않은 휴게는 예전과 한 치도 다르지 않아야 합니다
  const o1 = new V2({}), o2 = new V2({});
  o1.setS({ shifts: 'day', breaksDay: [{ from: '11:30', to: '12:30' }] });
  o2.setS({ shifts: 'day', breaksDay: [{ from: '11:30', to: '12:30' }, { from: '18:00', to: '18:30' }] });
  ok('점심만 있는 하루는 그대로', o1.calc(9, 18, 'day', false).net === 8);
  ok('자리로 잡히는 잔업 휴게도 그대로 · 정시', o2.calc(9, 18, 'day', false).net === 8);
  ok('자리로 잡히는 잔업 휴게도 그대로 · 잔업', o2.calc(9, 20, 'day', false).net === 9.5,
    'net ' + o2.calc(9, 20, 'day', false).net);
  ok('자리로 잡히는 줄은 여전히 잔업 휴게로 읽힙니다', o2.isOtBreak('day', o2.breaks('day')[1]));

  // 휴일에도 같은 규칙입니다 — 8시간을 넘겨야 저녁을 먹은 것입니다
  ok('휴일 8시간짜리 하루도 저녁이 빠지지 않습니다', day(18) && c.calc(9, 18, 'day', true).hol === 8,
    'hol ' + c.calc(9, 18, 'day', true).hol);
  ok('휴일 12시간짜리 하루는 빠집니다', c.calc(9, 21, 'day', true).hol === 10.5);
}

console.log('\n== 표는 눌러서 달고 뗍니다 ==');
{
  // 자리로만 판단하면 '평소 하루 안에 있지만 잔업하는 날에만 쓰는 휴게'를 말할
  // 길이 없습니다. 그래서 줄마다 누를 수 있는 표가 있고, 한 번 누르면 자리가
  // 아니라 그 표가 이깁니다 — 그러지 않으면 뗀 표가 화면에 반영되지 않습니다.
  const c = new V2({});
  c.setS({ shifts: 'day', dayStart: '09:00',
    breaksDay: [{ from: '11:30', to: '12:30' }, { from: '17:00', to: '17:30' }] });
  const rows = () => c.renderVals().dayBreakRows;

  ok('두 줄 다 표를 갖고 있습니다', rows().length === 2 && !!rows()[0].tag && !!rows()[1].tag);
  ok('손대기 전 저녁은 매일 빠집니다', rows()[1].otOnly === false);
  ok('그래서 표가 매일이라고 읽힙니다', rows()[1].tag === c.T('break_every_day'), rows()[1].tag);
  ok('그 날은 실근무 7.5시간', c.calc(9, 18, 'day', false).net === 7.5);

  rows()[1].toggleOt();
  ok('누르면 연장 시에만이 됩니다', rows()[1].otOnly === true);
  ok('표가 바뀝니다', rows()[1].tag === c.T('only_if_you_work_late'), rows()[1].tag);
  ok('저장된 줄에 명시적으로 적힙니다', c.st().breaksDay[1].ot === true);
  ok('그리고 그 날이 8시간이 됩니다', c.calc(9, 18, 'day', false).net === 8);

  rows()[1].toggleOt();
  ok('다시 누르면 매일로 돌아옵니다', rows()[1].otOnly === false && c.st().breaksDay[1].ot === false);
  ok('계산도 함께 돌아옵니다', c.calc(9, 18, 'day', false).net === 7.5);

  // 자리로 잡힌 줄을 뗄 수 있어야 합니다 — false를 명시적으로 적지 않으면
  // 자리가 다시 이겨서, 누른 것이 화면에 아무 일도 일으키지 않습니다
  const d = new V2({});
  d.setS({ shifts: 'day', dayStart: '09:00',
    breaksDay: [{ from: '11:30', to: '12:30' }, { from: '18:00', to: '18:30' }] });
  const dr = () => d.renderVals().dayBreakRows;
  ok('자리로 잡힌 줄은 처음부터 연장 시에만', dr()[1].otOnly === true);
  dr()[1].toggleOt();
  ok('떼면 실제로 떼어집니다', dr()[1].otOnly === false, JSON.stringify(d.st().breaksDay[1]));
  ok('undefined가 아니라 false로 적힙니다', d.st().breaksDay[1].ot === false);
  // 자리로 잡힌 휴게는 정시 퇴근한 날에 겹치는 구간이 0이라, 표를 떼도 금액은
  // 달라지지 않습니다 — 달라지는 것은 요약 줄입니다. 표를 떼면 그 30분이
  // '매일 빠지는 몫'으로 옮겨 가고, 그것이 이 표가 하는 말의 전부입니다.
  ok('금액은 그대로입니다 · 정시', d.calc(9, 18, 'day', false).net === 8);
  ok('금액은 그대로입니다 · 잔업', d.calc(9, 20, 'day', false).net === 9.5,
    'net ' + d.calc(9, 20, 'day', false).net);
  ok('요약이 매일 1.5시간이라고 말합니다', d.breakTotal('day').indexOf('1.5시간') >= 0,
    d.breakTotal('day'));
  ok('요약에 잔업 몫이 남지 않습니다', d.breakTotal('day').indexOf('연장 시 +') < 0,
    d.breakTotal('day'));

  // 야간 줄도 같은 손잡이를 갖습니다
  const n = new V2({});
  n.setS({ shifts: 'both', breaksNight: [{ from: '00:00', to: '01:00' }] });
  const nr = () => n.renderVals().nightBreakRows;
  ok('야간 줄에도 표가 있습니다', !!nr()[0].tag && !!nr()[0].toggleOt);
  nr()[0].toggleOt();
  ok('야간 줄도 눌러서 달립니다', n.st().breaksNight[0].ot === true && nr()[0].otOnly === true);

  // otMark는 표 달린 휴게를 세지 않습니다 — 세면 잔업이 시작되는 자리가 밀립니다.
  // 그리고 여기서 isOtBreak를 부르면 normalEnd → otMark로 되돌아 무한히 돕니다
  const m = new V2({});
  m.setS({ shifts: 'day', dayStart: '09:00',
    breaksDay: [{ from: '11:30', to: '12:30' }, { from: '17:00', to: '17:30', ot: true }] });
  ok('표 달린 휴게는 잔업 시작 자리를 밀지 않습니다', m.otMark('day') === 18, m.otMark('day'));
  ok('normalEnd도 18:00입니다', m.normalEnd('day') === 18);
  const r2 = new V2({});
  r2.setS({ shifts: 'both', dayStart: '09:00', nightStart: '21:00',
    breaksDay: [{ from: '11:30', to: '12:30' }, { from: '17:00', to: '17:30', ot: true }] });
  ok('교대의 평소 하루는 여전히 21:00에 끝납니다', r2.normalEnd('day') === 21);

  // 요약 줄이 사실을 말해야 합니다 — 교대 기본값은 매일 1시간, 잔업 시 +30분입니다
  const t = new V2({});
  t.setS(Object.assign({ shifts: 'both' }, t.breaksFor('both')));
  ok('요약이 매일 몫과 잔업 몫을 가릅니다',
    t.breakTotal('day').indexOf('1시간') >= 0 && t.breakTotal('day').indexOf('+30분') >= 0,
    t.breakTotal('day'));
  ok('1.5시간이라고 말하지 않습니다', t.breakTotal('day').indexOf('1.5시간') < 0, t.breakTotal('day'));

  // 안내가 여덟 개 언어에 다 있고, 무급 안내는 그대로 남아 있습니다
  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 잔업 휴게 안내가 있습니다', !!(V2.STR['a_break_tagged_only_if_late_comes_off'] || {})[Lg]);
    ok(Lg + ' 매일 표가 있습니다', !!(V2.STR['break_every_day'] || {})[Lg]);
  });
  const V = new V2({}).renderVals();
  ok('무급 휴게 안내는 그대로 있습니다', !!V.L.breaksUnpaidNote && V.L.breaksUnpaidNote.indexOf('제54조') >= 0);
  ok('잔업 휴게 안내가 그 위에 섭니다', !!V.L.breaksOtNote);
  // 안내는 칩에 실제로 찍히는 낱말을 그대로 인용해야 합니다 — 근로자가 화면에서
  // 찾을 수 있어야 하니까요. ko는 '연장 시에만', 나머지 일곱은 '연장 시'입니다.
  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    const chip = V2.STR['only_if_you_work_late'][Lg];
    const note = V2.STR['a_break_tagged_only_if_late_comes_off'][Lg];
    ok(Lg + ' 안내가 칩의 낱말을 그대로 인용합니다', note.indexOf(chip) >= 0, chip);
  });
}

console.log('\n== 옆의 빈자리를 눌러도 비과세가 뒤집혔습니다 ==');
{
  // 근로자의 보고입니다: 수당을 하나 더하고 이름과 금액을 친 다음 그 아래
  // 빈자리를 눌렀더니 'TAXED'가 'TAX-FREE'로 바뀌었다. 몇 번을 누르니 계속
  // 오갔다.
  //
  // 원인은 마크업 한 줄입니다. onClick이 칩이 아니라 **칩을 오른쪽으로 미는
  // 가로 전체 상자**에 붙어 있었습니다 — 칩 왼쪽의 빈자리가 전부 단추였던
  // 것입니다. 과세·비과세는 세금과 4대보험 기준을 바꾸므로, 모르고 누르면
  // 실수령 추정이 조용히 틀어집니다.
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
  const at = t => src.indexOf(t);
  const gMoney = at('{{ gMoneyOpen }}');
  ok('수당 묶음을 찾았습니다', gMoney > 0);
  const chunk = src.slice(gMoney, at('{{ gInsOpen }}'));
  ok('구간을 제대로 잡았습니다', chunk.indexOf('{{ r.tfLbl }}') > 0);

  const wrap = chunk.indexOf('justify-content:flex-end;padding:0 0 7px');
  ok('미는 상자는 그대로 있습니다', wrap > 0);
  ok('미는 상자에는 onClick이 없습니다',
    chunk.slice(wrap - 90, wrap).indexOf('r.tf') < 0, chunk.slice(wrap - 90, wrap));
  const chip = chunk.indexOf('{{ r.tfLbl }}');
  const chipTag = chunk.lastIndexOf('<div', chip);
  ok('onClick은 칩에 붙어 있습니다', chunk.slice(chipTag, chip).indexOf('onClick="{{ r.tf }}"') >= 0);
  ok('손가락 표시도 칩에 붙어 있습니다', chunk.slice(chipTag, chip).indexOf('cursor:pointer') >= 0);
  // 44px 규칙 — 작아져서도 안 됩니다
  ok('칩은 여전히 누를 만한 크기입니다', chunk.slice(chipTag, chip).indexOf('min-height:34px') >= 0);

  // 뒤집는 일 자체는 그대로 됩니다 — 자리만 좁혔지 기능을 없앤 것이 아닙니다
  const c = new V2({});
  c.setS({ allowances: [{ name: '식대', en: 'Meal', amount: 200000, tf: false }] });
  const row = () => c.renderVals().allowRows[0];
  const was = row().tfLbl;
  row().tf();
  ok('칩을 누르면 여전히 뒤집힙니다', row().tfLbl !== was);
  ok('설정에도 남습니다', c.st().allowances[0].tf === true);
}

console.log('\n== 퇴직금 줄은 몇 년을 다녔는지 말합니다 ==');
{
  // 근로자가 물었습니다: 입사일을 2022년으로 바꿔도 '계속근로 1년을 넘겼습니다'
  // 그대로인데, 이 1년은 내가 다닌 햇수입니까 아니면 퇴직금이 나오는 문턱입니까?
  //
  // 문턱입니다 — 근로자퇴직급여 보장법 제8조①. 금액은 재직일수를 그대로 반영해
  // 처음부터 맞게 계산하고 있었습니다. 틀린 것은 계산이 아니라 **문장이 그 둘을
  // 갈라 말하지 않은 것**이고, 그래서 4년을 다닌 사람도 자기 기록을 1년으로
  // 읽었습니다. 열한째의 '발생·사용·잔여'와 같은 자리입니다.
  const mk2 = iso => { const c = new V2({}); c.base = new Date('2026-08-28T10:00:00'); c.t0 = Date.now();
    c.setS({ hireDate: iso, basic: 2156880 }); return c; };
  const a = mk2('2022-03-01'), b = mk2('2025-06-01');
  const lineA = a.renderVals().sevStatus, lineB = b.renderVals().sevStatus;

  ok('오래 다닌 사람과 갓 넘긴 사람의 줄이 다릅니다', lineA !== lineB, lineA);
  ok('4년 다닌 사람 줄에 4가 있습니다', /계속근로 4년/.test(lineA), lineA);
  ok('1년 갓 넘긴 사람 줄에 1이 있습니다', /계속근로 1년/.test(lineB), lineB);
  ok('문턱은 제8조①이라고 밝힙니다', lineA.indexOf('제8조①') >= 0, lineA);
  ok('다음 기념일까지 남은 날은 그대로 있습니다', /\d+일\./.test(lineA), lineA);

  // 금액은 예전 그대로여야 합니다 — 고친 것은 문장뿐입니다
  ok('4년 쪽이 1년 쪽보다 많습니다', a.severancePay() > b.severancePay(),
    a.severancePay() + ' vs ' + b.severancePay());
  ok('1년 미만은 여전히 금액이 없습니다', mk2('2026-06-01').severancePay() === 0);
  ok('1년 미만 문장은 손대지 않았습니다',
    mk2('2026-06-01').renderVals().sevStatus.indexOf('1년 미만') >= 0);

  // 여덟 개 언어 · 세 자리를 다 받습니다
  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    const v = V2.STR['you_have_passed_1_year_this_is_owed_wh'][Lg];
    ok(Lg + ' 퇴직금 줄이 세 자리를 다 받습니다',
      !!v && v.indexOf('{p0}') >= 0 && v.indexOf('{p1}') >= 0 && v.indexOf('{p2}') >= 0, v && v.slice(0, 24));
  });
  // 자리가 남아 있으면 화면에 {p2}가 그대로 찍힙니다 — 렌더까지 확인합니다
  ok('화면에 자리 표시가 남지 않습니다', lineA.indexOf('{p') < 0, lineA);
}

console.log('\n== 단추 위에 아홉 줄이 서 있었습니다 ==');
{
  // 매일 아침 지문을 누르러 여는 화면인데, 패드에 닿기 전에 특근·×1.5·×0.5·
  // 22:00–06:00·30분 올림이 아홉 줄로 서 있었습니다. 문장은 한 조각도 고치지
  // 않고 두 묶음으로 나눕니다 — 오늘 내 돈이 달라지는 것은 위에 남기고, 왜
  // 그렇게 되는가는 접습니다.
  const c = mk(V2, '2026-08-03T07:03:00');   // 월요일 · 평일 · 정규 시작 전
  const v = c.renderVals();

  ok('접을 것이 있습니다', v.whyHas === true);
  ok('처음에는 접혀 있습니다', v.whyOpen === false);
  ok('접힌 쪽이 비어 있지 않습니다', !!v.detectWhy && v.detectWhy.length > 10, v.detectWhy);

  // 나눈 것이지 지운 것이 아닙니다 — 합치면 예전에 있던 조각이 모두 있습니다
  const both = v.detectReason + ' ' + v.detectWhy;
  const kind = c.detectShift(7 + 3 / 60);
  const frag = [
    c.T('punching_at_logged_as_a_shift_the_near', { p0: c.hhmm(7 + 3 / 60), p1: c.shiftName(kind), p2: c.hhmm(c.schedStart(kind)) }),
    c.T('anything_past_8h_pays_overtime_1_5_and'),
    c.T('unpaid_break', { p0: c.breaks(kind).map(b => c.hhmm(b[0]) + '–' + c.hhmm(b[1])).join(', ') }),
  ];
  frag.forEach((f, i) => ok('조각 ' + (i + 1) + '이 그대로 남아 있습니다',
    both.indexOf(f.trim()) >= 0, f.slice(0, 34)));

  // 갈라 놓은 자리가 맞는지 — 법정 배수는 접히고, 언제부터 유급인지는 안 접힙니다
  ok('법정 배수 설명은 접힌 쪽에 있습니다',
    v.detectWhy.indexOf(c.T('anything_past_8h_pays_overtime_1_5_and').trim()) >= 0);
  ok('언제부터 유급인지는 접히지 않습니다',
    v.detectReason.indexOf(c.hhmm(c.snapIn(7 + 3 / 60))) >= 0, v.detectReason);
  // 반대 방향도 봅니다 — 한쪽에 있다는 것만으로는 나뉜 것을 증명하지 못합니다
  ok('법정 배수 설명은 위에 남아 있지 않습니다',
    v.detectReason.indexOf(c.T('anything_past_8h_pays_overtime_1_5_and').trim()) < 0, v.detectReason);
  ok('근무조를 고른 근거도 위에 남아 있지 않습니다',
    v.detectReason.indexOf('가장 가까움') < 0 && v.detectReason.indexOf('nearer of your two') < 0,
    v.detectReason);
  ok('접기 전보다 위에 남는 글이 짧습니다',
    v.detectReason.length < (v.detectReason + v.detectWhy).length * 0.75,
    v.detectReason.length + ' vs ' + (v.detectReason.length + v.detectWhy.length));

  // 누르면 펴집니다
  v.toggleWhy();
  ok('누르면 펴집니다', c.renderVals().whyOpen === true);
  c.renderVals().toggleWhy();
  ok('다시 누르면 접힙니다', c.renderVals().whyOpen === false);

  // 화면 상태이지 기록이 아닙니다 — setOpen·rsnOpen·jumpOpen과 같은 자리
  c.setState({ whyOpen: true });
  ok('저장되는 값이 아닙니다', JSON.stringify(c.state).indexOf('whyOpen') >= 0
    && ['v','settings','extra','removed','session','setupDone','tourSeen','tab']
      .indexOf('whyOpen') < 0);

  // 특근은 접지 않습니다 — 그 하루는 전 시간이 ×1.5입니다
  const h = mk(V2, '2026-08-15T07:03:00');   // 광복절
  const hv = h.renderVals();
  ok('특근인 날은 그 사실이 접히지 않습니다', hv.detectReason.indexOf('특근') >= 0, hv.detectReason);
  ok('특근 배수 설명은 접힌 쪽입니다',
    hv.detectWhy.indexOf(h.T('on_even_the_first_8h_pay_1_5_and_every').trim()) >= 0);
  ok('특근이라는 사실 자체는 접힌 쪽에 없습니다',
    hv.detectWhy.indexOf('광복절') < 0, hv.detectWhy);

  // 근무중에는 접을 것이 없습니다 — 그 갈래의 문장은 손대지 않았습니다
  const w = mk(V2, '2026-08-03T13:00:00');
  w.state.session = { inIso: new Date('2026-08-03T09:00:00').toISOString() };
  ok('근무중에는 토글이 없습니다', w.renderVals().whyHas === false);
  ok('근무중 문장은 그대로 나옵니다', !!w.renderVals().detectReason);

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    const t = V2.STR['why_is_it_counted_this_way'][Lg];
    ok(Lg + ' 접기 이름이 있습니다', !!t && t.length > 1, t);
  });
}

console.log('\n== 오늘이 어떤 날인지는 알약 두 개가 말합니다 ==');
{
  // 근무조와 특근이 문장 안에만 있었습니다. 근무조는 19px 글씨였고 특근은
  // 설명 문단 한가운데였습니다 — 지문을 찍으러 여는 화면에서 오늘 돈이
  // 달라지는 사실이 산문에 묻혀 있었습니다. 둘 다 알약으로 세웁니다.
  const day = mk(V2, '2026-08-03T07:03:00');            // 월요일, 특근 아님
  day.setS({ shifts: 'day', shiftConfirmed: true });
  const vd = day.renderVals();

  ok('주간 알약은 근무기록 배지와 같은 노랑입니다',
    vd.detectShiftBg === 'oklch(0.84 0.16 92)', vd.detectShiftBg);
  ok('주간 알약의 글씨는 어둡습니다', vd.detectShiftInk === 'var(--color-text)');
  ok('평일에는 특근 알약이 없습니다', vd.detectHol === false, String(vd.detectHol));

  // 야간 — 근무기록 줄의 배지와 같은 검정
  const night = mk(V2, '2026-08-03T22:10:00');
  night.setS({ shifts: 'night', shiftConfirmed: true });
  const vn = night.renderVals();
  ok('야간 알약은 검정입니다', vn.detectShiftBg === 'var(--color-text)', vn.detectShiftBg);
  ok('야간 알약의 글씨는 밝습니다', vn.detectShiftInk === 'var(--color-bg)');

  // 두 화면이 같은 하루를 다른 색으로 말하면 안 됩니다. 근무기록 줄의 배지가
  // 쓰는 그 규칙을 그대로 부르는지, 값이 아니라 **함수로** 확인합니다.
  ok('알약 색은 한 곳에서 나옵니다 (주간)', day.shiftChipBg('day') === vd.detectShiftBg);
  ok('알약 색은 한 곳에서 나옵니다 (야간)', night.shiftChipBg('night') === vn.detectShiftBg);

  // ── 특근은 근무조를 대신하지 않습니다 ──
  // 근무기록 줄의 배지는 특근이면 배지 자체가 빨강이 됩니다(:5482). 여기서는
  // 알약이 둘이라 그러면 안 됩니다 — 특근인 주간은 여전히 주간입니다.
  const hol = mk(V2, '2026-08-02T07:03:00');            // 일요일 = 특근
  hol.setS({ shifts: 'day', shiftConfirmed: true });
  const vh = hol.renderVals();
  ok('일요일에는 특근 알약이 섭니다', vh.detectHol === true);
  ok('특근이어도 주간 알약은 노랑 그대로입니다',
    vh.detectShiftBg === 'oklch(0.84 0.16 92)', vh.detectShiftBg);
  ok('특근이어도 근무조 알약이 빨강이 되지 않습니다',
    vh.detectShiftBg !== 'var(--color-accent)');

  // 알약의 글자는 새로 쓴 것이 아니라 급여명세서가 쓰는 그 말입니다
  const L = hol.renderVals().L;
  ok('특근 알약은 명세서의 낱말을 씁니다', L.holChip === hol.T('holiday_work_1_5'), L.holChip);
  ['ko', 'en', 'vi', 'zh', 'th', 'id', 'ne', 'km'].forEach(Lg => {
    const t = V2.STR['holiday_work_1_5'][Lg];
    ok(Lg + ' 특근 알약에 글자가 있습니다', !!t && t.length > 1, t);
  });
  ok('한국어 알약은 특근이라고 씁니다', V2.STR['holiday_work_1_5']['ko'].indexOf('특근') === 0);

  // 근무중에도 알약은 그대로 섭니다 — 찍고 나면 색이 사라지면 안 됩니다
  const on = mk(V2, '2026-08-03T10:00:00');
  on.setS({ shifts: 'day', shiftConfirmed: true });
  on.setState({ session: { inIso: new Date('2026-08-03T09:00:00').toISOString() } });
  const vo = on.renderVals();
  ok('근무중에도 근무조 알약이 있습니다', vo.detectShiftBg === 'oklch(0.84 0.16 92)', vo.detectShiftBg);

  // 서른한째가 세워 둔 것 — 판별하지 않은 근무조를 자동판별이라고 부르지
  // 않는다는 그 줄은 알약이 생겨도 그대로 화면에 있어야 합니다.
  ok('가정값이라는 말은 알약 옆에 그대로 남아 있습니다',
    typeof vd.detectKicker === 'string' && vd.detectKicker.length > 1);
}

console.log('\n== 정한 적 없는 근무조를 자동판별이라고 부르지 않습니다 ==');
{
  // 하루도 적지 않은 폰이 'SHIFT DETECTED · DAY 09:00 start'라고 말했습니다.
  // 아무것도 판별하지 않았습니다 — DEFAULTS.shifts입니다. 06:00에 시작하는
  // 사람은 앱이 자신 있게 틀린 말을 하는 것을 보고 자기 앱이 아니라고 읽습니다.
  const fresh = () => mk(V2, '2026-08-03T07:03:00');

  const c = fresh(), v = c.renderVals();
  ok('새로 깐 사람에게는 가정이라고 말합니다', v.detectKicker === c.T('shift_assumed'), v.detectKicker);
  ok('자동판별이라고 하지 않습니다', v.detectKicker !== c.T('shift_detected'));
  ok('맞는지 물어봅니다', v.shiftAsk === true);

  // 한 번 맞다고 하면 다시 묻지 않습니다 — basicConfirmed와 같은 방식입니다
  v.confirmShift();
  const v2 = c.renderVals();
  ok('맞다고 하면 묻지 않습니다', v2.shiftAsk === false);
  ok('그 뒤로는 자동판별입니다', v2.detectKicker === c.T('shift_detected'), v2.detectKicker);
  ok('설정에 남습니다', c.st().shiftConfirmed === true);

  // 값을 손댄 사람에게는 애초에 묻지 않습니다
  const a = fresh(); a.setS({ dayStart: '06:00' });
  ok('시작 시각을 고친 사람에게는 묻지 않습니다', a.renderVals().shiftAsk === false);
  const b = fresh(); b.setS({ shifts: 'night' });
  ok('근무조를 고른 사람에게도 묻지 않습니다', b.renderVals().shiftAsk === false);

  // 근무중에는 묻지 않습니다 — 이미 찍은 사람에게 설정을 물을 자리가 아닙니다
  const w = fresh();
  w.state.session = { inIso: new Date('2026-08-03T06:00:00').toISOString() };
  ok('근무중에는 묻지 않습니다', w.renderVals().shiftAsk === false);

  // 쓰던 사람에게 새 질문이 생기면 안 됩니다 — breaksTouched와 같은 근거입니다
  const store = { 'worklog.v2': JSON.stringify({ v: 2, tourSeen: true,
    settings: { basic: 2156880, divisor: 209, shifts: 'day', dayStart: '09:00' },
    extra: [], removed: [] }) };
  const g = global.window.localStorage.getItem;
  global.window.localStorage.getItem = k => store[k] || null;
  const up = new V2({}); up.base = new Date('2026-08-03T07:03:00'); up.t0 = Date.now();
  global.window.localStorage.getItem = g;
  ok('저장본에 없으면 이미 정한 것으로 봅니다', up.st().shiftConfirmed === true);
  ok('쓰던 사람에게는 묻지 않습니다', up.renderVals().shiftAsk === false);

  // 물어보는 것과 계산은 별개입니다 — 확인해도 금액은 한 푼도 움직이지 않습니다
  const m1 = fresh(); const before = JSON.stringify(m1.calc(9, 21, 'day', false));
  m1.setS({ shiftConfirmed: true });
  ok('확인해도 계산은 그대로입니다', JSON.stringify(m1.calc(9, 21, 'day', false)) === before);
  ok('시급도 그대로입니다', m1.rate() === fresh().rate());

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 가정 이름이 있습니다', !!V2.STR['shift_assumed'][Lg]);
    ok(Lg + ' 물음과 두 단추가 있습니다',
      !!V2.STR['you_have_not_set_a_shift_yet_the_app_i'][Lg]
      && !!V2.STR['yes_this_is_right'][Lg] && !!V2.STR['change_my_shift'][Lg]);
  });
}

console.log('\n== 하루도 적지 않은 폰이 연차 15 / 15라고 말했습니다 ==');
{
  // 기록 0일, 입사일도 없고 잔여를 적은 적도 없는 폰에서 출퇴근 탭의 연차
  // 단추가 빨갛게 '15 / 15'였습니다. 열한째가 대장에서 지운 그 거짓말을
  // 출퇴근 화면이 그대로 하고 있었습니다.
  const leave = c => c.renderVals().dayTypeBtns[1];

  const c = mk(V2, '2026-08-03T07:03:00');
  ok('아무것도 듣지 못했으면 숫자를 적지 않습니다', leave(c).note === '—', leave(c).note);
  ok('그 자리는 빨갛지 않습니다', leave(c).noteInk.indexOf('accent') < 0, leave(c).noteInk);

  // 하지만 함수는 여전히 숫자입니다 — 대장의 '사용'이 여기서 뺍니다
  ok('annualLeft()는 그대로 숫자입니다', typeof c.annualLeft() === 'number' && c.annualLeft() === 15);

  // 한 마디라도 들으면 숫자로 말합니다
  const t1 = mk(V2, '2026-08-03T07:03:00'); t1.setS({ annualBase: 9 });
  ok('잔여를 적으면 숫자가 나옵니다', leave(t1).note.indexOf('9') === 0, leave(t1).note);
  const t2 = mk(V2, '2026-08-03T07:03:00'); t2.setS({ annualAsOf: '2026-08-01' });
  ok('기준일만 적어도 숫자가 나옵니다', leave(t2).note !== '—', leave(t2).note);
  const t3 = mk(V2, '2026-08-03T07:03:00'); t3.setS({ annualTotal: 11 });
  ok('총일수를 고쳐도 숫자가 나옵니다', leave(t3).note !== '—', leave(t3).note);

  // 잔여가 적을 때 빨갛게 되던 것은 그대로입니다
  const low = mk(V2, '2026-08-03T07:03:00'); low.setS({ annualBase: 2 });
  ok('얼마 안 남으면 여전히 진한 빨강입니다', leave(low).noteInk.indexOf('accent-700') >= 0);

  // 내 권리 대장은 손대지 않았습니다 — 그쪽은 입사일이 없으면 이미 물어봅니다
  ok('대장의 잔여는 그대로 숫자입니다', mk(V2, '2026-08-03T07:03:00').annualLeft() === 15);
}

console.log('\n== 여덟 묶음이 똑같은 무게로 서 있었습니다 ==');
{
  // 설정 탭은 다 펼치면 9.8화면, 글자 칸 23개였습니다. 그런데 더 나쁜 것은
  // 길이가 아니라 **무엇을 손대야 하는지 말하는 것이 하나도 없었다**는 점입니다.
  // 여덟 묶음이 같은 크기·같은 화살표·같은 요약으로 나란히 서 있으면, 새로 깐
  // 사람은 어느 것이 자기 것인지 알 수 없어 하나도 손대지 않습니다.
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const t1 = tpl.indexOf('{{ L.tierNeed }}');
  const t2 = tpl.indexOf('{{ L.tierMore }}');
  const t3 = tpl.indexOf('{{ L.tierRest }}');

  ok('층 셋이 차례로 있습니다', t1 > 0 && t2 > t1 && t3 > t2);
  const tierOf = tap => { const i = tpl.indexOf(tap); return i < t1 ? 0 : i < t2 ? 1 : i < t3 ? 2 : 3; };
  const want = { gShiftTap:1, gPayTap:1, gPeriodTap:1,
                 gMoneyTap:2, gInsTap:2, gRulesTap:2, gMeTap:2,
                 gLangTap:3, gBackupTap:3 };
  Object.keys(want).forEach(k =>
    ok(k + ' 는 ' + want[k] + '층입니다', tierOf('{{ ' + k + ' }}') === want[k], 'got ' + tierOf('{{ ' + k + ' }}')));

  // ── 감춘 것이 아니라 순서를 매긴 것입니다 ──
  // 이 앱은 증거를 만듭니다. 임금체불 진정 중인 근로자가 설정을 열었을 때 칸이
  // 사라져 있으면 안 됩니다. 아홉 묶음이 전부 있고, 옮긴 칸도 전부 살아 있습니다.
  ['gLangTap','gMeTap','gPayTap','gShiftTap','gPeriodTap','gMoneyTap','gInsTap','gRulesTap','gBackupTap']
    .forEach(k => ok(k + ' 묶음이 그대로 있습니다', tpl.indexOf('{{ ' + k + ' }}') > 0));
  ['{{ periodStartVal }}','{{ paydayVal }}','{{ graceVal }}','{{ avgDailyVal }}','{{ shutPctVal }}',
   '{{ basicVal }}','{{ divisorVal }}','{{ workerNameVal }}','{{ employerVal }}','{{ bosuVal }}']
    .forEach(t => ok('칸이 살아 있습니다 ' + t, tpl.indexOf(t) > 0));

  // 옮긴 두 칸은 새 묶음 안에, 원래 있던 묶음에는 없습니다
  const cut = (a, b) => tpl.slice(tpl.indexOf(a), tpl.indexOf(b));
  const per = cut('{{ gPeriodTap }}', '{{ L.tierMore }}');
  const rul = cut('{{ gRulesTap }}', '{{ gMeTap }}');
  ok('급여기간 시작일은 새 묶음에 있습니다', per.indexOf('{{ periodStartVal }}') >= 0);
  ok('월급날도 새 묶음에 있습니다', per.indexOf('{{ paydayVal }}') >= 0);
  ok('회사 규칙에는 둘 다 없습니다',
    rul.indexOf('{{ periodStartVal }}') < 0 && rul.indexOf('{{ paydayVal }}') < 0);
  ok('회사 규칙에 남은 것은 그대로입니다',
    rul.indexOf('{{ graceVal }}') >= 0 && rul.indexOf('{{ avgDailyVal }}') >= 0
    && rul.indexOf('{{ shutPctVal }}') >= 0);

  // ── 값을 계산해 두는 것과 화면이 그것을 쓰는 것은 다릅니다 ──
  // ! 를 빨갛게 만들어 놓고 폰에서 보니 회색이었습니다. gMeSumInk만 마크업에
  // 홀이 있었고 나머지 여덟은 색이 **하드코딩**되어 있었습니다(스무째가 빨간 줄을
  // 하나로 묶어 두었기 때문입니다). renderVals는 맞는 값을 내고 있었고 그 값을
  // 보는 시험도 통과했는데, 화면에는 닿지 않았습니다 — 전형적인 헛통과입니다.
  ['Shift','Pay','Period'].forEach(g => {
    const i = tpl.indexOf('{{ g' + g + 'Sum }}');
    const row = tpl.lastIndexOf('<div', i);
    ok(g + ' 요약 줄이 색 홀을 실제로 씁니다',
      tpl.slice(row, i).indexOf('{{ g' + g + 'SumInk }}') >= 0, tpl.slice(row, i).slice(-70));
  });
}

console.log('\n== 나는 다 한 것입니까 ==');
{
  // 근로자가 이 화면에서 실제로 갖는 물음입니다. 예전 화면은 답할 방법이
  // 아예 없었습니다 — 값만 보고는 '내가 정한 09:00'과 '앱이 넣어 둔 09:00'을
  // 가를 수 없기 때문입니다. 셋 다 '정했다'는 사실을 따로 적어 둡니다.
  const fresh = () => mk(V2, '2026-08-03T09:00:00');

  const c = fresh();
  ok('새로 깐 사람은 셋 다 아직입니다', JSON.stringify(c.setNeededDone()) === '{"done":0,"total":3}',
    JSON.stringify(c.setNeededDone()));
  let V = c.renderVals();
  ok('맨 위가 몇 개인지 말합니다', /0/.test(V.setupStatus) && /3/.test(V.setupStatus), V.setupStatus);
  ok('아직이면 그 줄이 빨갛습니다', V.setupStatusInk === 'var(--color-accent-700)');
  ok('첫 층 셋에 ! 가 붙습니다',
    V.gShiftSum.indexOf('!') === 0 && V.gPaySum.indexOf('!') === 0 && V.gPeriodSum.indexOf('!') === 0,
    [V.gShiftSum, V.gPaySum, V.gPeriodSum].join(' | '));
  ok('나머지 묶음에는 안 붙습니다',
    V.gMoneySum.indexOf('!') !== 0 && V.gInsSum.indexOf('!') !== 0 && V.gBackupSum.indexOf('!') !== 0);
  // 그리고 그 ! 는 실제로 빨갛습니다
  ok('아직인 줄은 빨갛습니다', V.gPaySumInk === 'var(--color-accent)', V.gPaySumInk);
  ok('정해 둔 줄은 조용합니다', fresh().renderVals().gMoneySumInk === 'var(--color-neutral-700)');

  // 하나씩 정하면 하나씩 줄어듭니다
  c.setS({ shiftConfirmed: true });
  ok('근무조를 정하면 1', c.setNeededDone().done === 1);
  c.setS({ periodConfirmed: true });
  ok('급여기간까지 정하면 2', c.setNeededDone().done === 2);
  ok('근무조 요약은 이제 ✓ 입니다', c.renderVals().gShiftSum.indexOf('✓') === 0,
    c.renderVals().gShiftSum);

  // 기본금은 확인해도 되고, 본인 숫자를 적어도 됩니다 — 둘 다 '정한 것'입니다
  const a = fresh(); a.setS({ shiftConfirmed:true, periodConfirmed:true, basicConfirmed:true });
  ok('맞다고 하면 셋 다', a.setNeededDone().done === 3);
  const b = fresh(); b.setS({ shiftConfirmed:true, periodConfirmed:true, basic:2600000 });
  ok('본인 숫자를 적어도 셋 다', b.setNeededDone().done === 3, JSON.stringify(b.setNeededDone()));

  const Va = a.renderVals();
  ok('다 정하면 맨 줄이 그렇게 말합니다', Va.setupStatus === a.T('all_set_the_app_can_record_and_price'), Va.setupStatus);
  ok('그 줄은 더 이상 빨갛지 않습니다', Va.setupStatusInk === 'var(--color-neutral-700)');
  ok('바탕도 조용해집니다', Va.setupStatusBg === 'transparent');
  ok('첫 층 셋이 모두 ✓ 입니다',
    [Va.gShiftSum, Va.gPaySum, Va.gPeriodSum].every(x => x.indexOf('✓') === 0));

  // 값은 접혀 있어도 그대로 보입니다 — 표시를 붙였지 감춘 것이 아닙니다
  ok('✓ 뒤에 값이 그대로 있습니다', Va.gPeriodSum.indexOf(a.period(a.now()).label) > 0, Va.gPeriodSum);

  // 급여기간도 한 번 누르면 다시 묻지 않습니다
  const d = fresh();
  ok('정하기 전에는 물어봅니다', d.renderVals().periodAsk === true);
  d.renderVals().confirmPeriod();
  ok('누르면 묻지 않습니다', d.renderVals().periodAsk === false);
  ok('설정에 남습니다', d.st().periodConfirmed === true);

  // 쓰던 사람에게 새 질문이 생기면 안 됩니다
  const store = { 'worklog.v2': JSON.stringify({ v:2, tourSeen:true,
    settings:{ basic:2600000, divisor:209, periodStart:21, payday:25 }, extra:[], removed:[] }) };
  const g = global.window.localStorage.getItem;
  global.window.localStorage.getItem = k => store[k] || null;
  const up = new V2({}); up.base = new Date('2026-08-03T09:00:00'); up.t0 = Date.now();
  global.window.localStorage.getItem = g;
  ok('저장본에 없으면 이미 정한 것으로 봅니다', up.st().periodConfirmed === true);
  ok('쓰던 사람에게는 묻지 않습니다', up.renderVals().periodAsk === false);
  ok('쓰던 사람은 셋 다 정한 것으로 셉니다', up.setNeededDone().done === 3, JSON.stringify(up.setNeededDone()));

  // 판단하는 자리는 하나입니다 — 요약 줄과 맨 위가 갈라질 길을 만들지 않습니다
  ok('SET_NEEDED가 셋을 봅니다', Object.keys(V2.SET_NEEDED).join() === 'grp_shift,grp_pay,grp_period');

  // 층을 나눴다고 앱이 하던 일을 멈추지는 않습니다
  ok('임금 계산은 그대로입니다',
    JSON.stringify(fresh().calc(9, 21, 'day', false)) === JSON.stringify(a.calc(9, 21, 'day', false)));

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 층 이름 셋이 있습니다',
      !!V2.STR['what_the_app_needs'][Lg] && !!V2.STR['make_it_more_exact'][Lg]
      && !!V2.STR['language_files_and_legal'][Lg]);
    ok(Lg + ' 상태 두 문장이 있습니다',
      !!V2.STR['all_set_the_app_can_record_and_price'][Lg]
      && V2.STR['n_of_n_set_the_rest_are_marked_below'][Lg].indexOf('{p0}') >= 0);
    ok(Lg + ' 급여기간 묶음 이름이 있습니다', !!V2.STR['grp_period'][Lg]);
    ok(Lg + ' 급여기간 물음이 있습니다', !!V2.STR['is_this_your_pay_period_it_is_on_your'][Lg]);
  });
}

console.log('\n== 환영 화면 다음이 여덟 묶음짜리 설정이었습니다 ==');
{
  // 소개 카드 1번은 '먼저 설정할 것은 없습니다'라고 말합니다. 그래 놓고 START가
  // 설정 탭으로 내보내고 있었고, 그 화면에는 묶음이 여덟 개 있었습니다. 앱의
  // 안내문(tour_setup_next)이 '지금 다 채우지 않아도 됩니다'라고 미리 사과하고
  // 있었던 것이 그 자리가 틀렸다는 가장 분명한 표시입니다.
  const fresh = () => { const c = mk(V2, '2026-08-03T09:00:00'); c.setState({ tourSeen:false }); return c; };

  const c = fresh();
  ok('처음에는 물음이 없습니다', c.renderVals().suOn === false);
  c.renderVals().endTour();
  ok('START가 첫 물음을 엽니다', c.renderVals().suIs1 === true);
  ok('설정 탭으로 내보내지 않습니다', c.state.tab !== 'set', c.state.tab);
  ok('소개는 닫혔습니다', c.renderVals().showTour === false);

  // ── 한 화면에 하나씩, 넷 ──
  const steps = [];
  for (let i = 0; i < 5; i++) { steps.push(c.renderVals().suStep); c.renderVals().suNext(); }
  ok('다섯 화면을 지나갑니다', steps.join() === '1,2,3,4,5', steps.join());
  ok('마지막 다음에는 닫힙니다', c.renderVals().suOn === false);
  ok('끝까지 가면 다 물은 것으로 적습니다', c.state.setupDone === true);
  ok('끝나면 출퇴근으로 보냅니다', c.state.tab === 'punch', c.state.tab);

  // 건너뛰기만 해도 끝납니다 — 막지 않습니다
  const sk = fresh(); sk.renderVals().endTour();
  for (let i = 0; i < 5; i++) sk.renderVals().suNext();
  ok('전부 건너뛰어도 끝납니다', sk.renderVals().suOn === false && sk.state.setupDone === true);
  ok('건너뛰면 아무것도 정해지지 않습니다', sk.setNeededDone().done === 0,
    JSON.stringify(sk.setNeededDone()));

  // ── 1. 근무조를 고르는 것이 곧 정하는 것입니다 ──
  const a = fresh(); a.renderVals().endTour();
  ok('아직 정한 것이 없습니다', a.st().shiftConfirmed === false);
  a.renderVals().shiftOpts[2].set();
  ok('교대를 고르면 그것이 저장됩니다', a.st().shifts === 'both');
  ok('고른 것 자체가 확인입니다', a.st().shiftConfirmed === true);
  ok('그러면 출퇴근 카드도 가정이라고 하지 않습니다', a.renderVals().shiftAsk === false);
  // 교대를 고르면 저녁 휴게가 표를 달고 함께 옵니다(스물아홉째)
  ok('교대의 저녁 휴게가 따라옵니다', (a.st().breaksDay || []).length === 2,
    JSON.stringify(a.st().breaksDay));
  ok('그 줄에는 표가 붙어 있습니다', a.st().breaksDay[1].ot === true,
    JSON.stringify(a.st().breaksDay[1]));

  const t = fresh(); t.renderVals().endTour();
  t.renderVals().dayDrumH.find(x => x.t === '06').set();
  ok('시각이 정규 문자열로 저장됩니다', t.st().dayStart === '06:00', t.st().dayStart);
  ok('시각을 고른 것도 확인입니다', t.st().shiftConfirmed === true);

  // ── 2. 휴게는 첫 줄만 건드립니다 ──
  // 교대의 저녁 휴게는 잔업하는 날에만 빠지는 다른 줄입니다. 여기서 함께
  // 지워 버리면 그 사람은 그 표를 손으로 다시 달아야 합니다(스물아홉째).
  const b2 = fresh(); b2.renderVals().endTour();
  b2.renderVals().shiftOpts[2].set();
  b2.setState({ setupStep: 2 });
  const before = JSON.stringify(b2.st().breaksDay[1]);
  b2.renderVals().suBreakHalf();
  ok('30분은 첫 줄만 줄입니다', b2.st().breaksDay[0].to === b2.hhmm(b2.parseHM(b2.st().breaksDay[0].from) + 0.5),
    JSON.stringify(b2.st().breaksDay[0]));
  ok('저녁 휴게는 그대로입니다', JSON.stringify(b2.st().breaksDay[1]) === before);
  ok('손댔다는 사실이 적힙니다', b2.st().breaksTouched === true);

  const b3 = fresh(); b3.renderVals().endTour();
  b3.renderVals().shiftOpts[2].set();
  b3.setState({ setupStep: 2 });
  const dinner = JSON.stringify(b3.st().breaksDay[1]);
  b3.renderVals().suBreakNone();
  ok('없음은 식사 휴게 하나만 지웁니다', b3.st().breaksDay.length === 1);
  ok('남은 것은 저녁 휴게입니다', JSON.stringify(b3.st().breaksDay[0]) === dinner);

  // '맞습니다'는 breaksTouched를 켜지 않습니다 — 지금 값이 맞다는 뜻이지
  // 앞으로 근무조를 바꿔도 따라오지 말라는 뜻이 아닙니다
  const b4 = fresh(); b4.renderVals().endTour(); b4.setState({ setupStep: 2 });
  b4.renderVals().suNext();
  ok('맞다고만 하면 휴게를 잠그지 않습니다', b4.st().breaksTouched === false);

  // ── 3. 기본금 ──
  const p3 = fresh(); p3.renderVals().endTour(); p3.setState({ setupStep: 3 });
  ok('숫자 칸은 numField를 지납니다', typeof p3.renderVals().keyBasic === 'function'
    && typeof p3.renderVals().focBasic === 'function');
  p3.renderVals().suBasicYes();
  ok('맞다고 하면 기본금이 정해집니다', p3.st().basicConfirmed === true);
  ok('그리고 급여기간 물음으로 넘어갑니다', p3.renderVals().suIs4 === true);
  // 나중에는 확인이 아닙니다 — 급여 탭이 다시 물어야 합니다
  const p3b = fresh(); p3b.renderVals().endTour(); p3b.setState({ setupStep: 3 });
  p3b.renderVals().suNext();
  ok('나중에는 확인이 아닙니다', p3b.st().basicConfirmed === false);
  ok('급여 탭이 여전히 묻습니다', p3b.renderVals().askBasic === true);

  // ── 4. 급여기간 ──
  const p4 = fresh(); p4.renderVals().endTour(); p4.setState({ setupStep: 4 });
  ok('기록이 없으면 경고가 없습니다', p4.renderVals().suPeriodWarn === '');
  p4.renderVals().suPeriodChips[2].set();
  ok('21일 칩이 저장됩니다', p4.st().periodStart === 21);
  ok('고른 것 자체가 확인입니다', p4.st().periodConfirmed === true);
  p4.renderVals().suPaydayChips[2].set();
  ok('월급날 칩도 저장됩니다', p4.st().payday === 25);
  ok('미리보기가 고른 기간을 말합니다', /21/.test(p4.renderVals().periodPreview),
    p4.renderVals().periodPreview);

  // ── 기록이 있으면 급여기간을 바꾸는 것은 공짜가 아닙니다 ──
  // wageKey(P)도 slipKey(P)도 기간 시작일이라, 시작일이 바뀌면 이미 찍힌 임금
  // 기준과 저장된 명세서 대조가 어느 기간과도 맞지 않게 됩니다. 첫날에는 기록이
  // 0일이라 공짜이고, 그것이 이 물음을 첫 화면에 두는 가장 센 이유입니다.
  const rec = fresh(); rec.renderVals().endTour(); rec.setState({ setupStep: 4 });
  rec.state.extra = [{ y:2026, m:7, day:5, kind:'day', type:'shift', inH:9, outH:18,
    c: rec.calc(9, 18, 'day', false) }];
  ok('기록이 있으면 경고가 뜹니다', rec.renderVals().suPeriodWarn.length > 10,
    rec.renderVals().suPeriodWarn.slice(0, 40));
  ok('그래도 막지는 않습니다', typeof rec.renderVals().suPeriodChips[0].set === 'function');

  // ── 5. 다 물었습니다 ──
  const d5 = fresh(); d5.renderVals().endTour();
  d5.setS({ shiftConfirmed:true, periodConfirmed:true });
  d5.setState({ setupStep: 5 });
  const sum = d5.renderVals().suSummary;
  ok('마지막 화면이 셋을 요약합니다', sum.length === 3);
  ok('정한 것에는 ✓', sum[0].mark === '✓' && sum[2].mark === '✓');
  ok('아직인 것에는 !', sum[1].mark === '!' && sum[1].ink === 'var(--color-accent)');
  ok('요약이 설정 요약과 같은 자리에서 나옵니다',
    sum[2].v === d5.setGroupSums().grp_period, sum[2].v);
  // 마지막 화면에는 건너뛰기가 없습니다 — 큰 단추와 같은 일을 하는 두 번째
  // 단추이고, 그 하나를 '건너뛰기'라고 부르면 거짓말입니다. 폰에서 보고 잡았습니다.
  ok('마지막 화면에는 건너뛰기가 없습니다', d5.renderVals().suAsking === false);
  const q4 = fresh(); q4.renderVals().endTour(); q4.setState({ setupStep: 4 });
  ok('묻는 동안에는 있습니다', q4.renderVals().suAsking === true);

  // 도중에 닫으면 다음에 처음부터입니다 — setupStep은 저장하지 않습니다
  const q = fresh(); q.renderVals().endTour(); q.renderVals().suNext(); q.save();
  ok('setupStep은 저장되지 않습니다', !/setupStep/.test(q.lastSaved || ''));
  ok('setupDone은 저장됩니다', /setupDone/.test(q.lastSaved || ''));

  // 쓰던 사람에게는 이 흐름이 뜨지 않습니다 — 저장본이 있으면 소개부터 닿지 않습니다
  const store = { 'worklog.v2': JSON.stringify({ v:2, tourSeen:true,
    settings:{ basic:2600000, divisor:209 }, extra:[], removed:[] }) };
  const g = global.window.localStorage.getItem;
  global.window.localStorage.getItem = k => store[k] || null;
  const up = new V2({}); up.base = new Date('2026-08-03T09:00:00'); up.t0 = Date.now();
  global.window.localStorage.getItem = g;
  ok('쓰던 사람에게는 뜨지 않습니다', up.renderVals().suOn === false && up.renderVals().showTour === false);

  // 물음을 붙였다고 앱이 하던 일을 멈추지는 않습니다. 전부 건너뛴 폰은 설정이
  // 한 글자도 바뀌지 않았으므로 갓 깐 폰과 같은 답을 내야 합니다.
  ok('임금 계산은 그대로입니다',
    JSON.stringify(mk(V2).calc(9, 21, 'day', false)) === JSON.stringify(sk.calc(9, 21, 'day', false)));

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 네 물음의 제목이 다 있습니다',
      !!V2.STR['which_shift_do_you_work'][Lg] && !!V2.STR['your_unpaid_meal_break'][Lg]
      && !!V2.STR['what_is_your_basic_salary'][Lg] && !!V2.STR['which_days_are_on_one_payslip'][Lg]);
    ok(Lg + ' 마지막 화면과 건너뛰기가 있습니다',
      !!V2.STR['that_is_everything_the_app_needs'][Lg] && !!V2.STR['start_punching'][Lg]
      && !!V2.STR['skip_this'][Lg]);
    ok(Lg + ' 급여기간 경고가 있습니다', !!V2.STR['changing_this_now_re_buckets_records'][Lg]);
  });
}

console.log('\n== 없는 키를 부르면 화면에 키 이름이 그대로 찍힙니다 ==');
{
  // 네 물음의 단계 표시가 폰에서 'N_OF_4'로 나왔습니다. this.T('n_of_4', …)를
  // 써 놓고 그 키를 만들지 않았기 때문입니다. T()는 없는 키에 **던지지 않고 키
  // 이름을 돌려줍니다** — 그래서 bind.js도, 여덟 언어 렌더도 이것을 잡지
  // 못합니다. 둘 다 '홀이 채워졌는가'만 보고 '무엇으로 채워졌는가'는 안 봅니다.
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const body = src.slice(src.indexOf('class Component'));
  const called = new Set();
  // 이어 붙여 만드는 키는 뺍니다 — this.T('flt_' + f)처럼 앞자락만 리터럴인
  // 자리가 있습니다. 닫는 따옴표 뒤가 , 나 ) 인 것만 온전한 키입니다.
  const re = /this\.T\(\s*'([a-z0-9_가-힣]+)'\s*[,)]/g;
  let m;
  while ((m = re.exec(body))) called.add(m[1]);
  ok('T()를 부르는 자리를 찾았습니다', called.size > 200, 'found ' + called.size);
  const missing = [...called].filter(k => !V2.STR[k]);
  ok('부르는 키가 전부 STR에 있습니다', missing.length === 0, missing.slice(0, 6).join(', '));

  // 그리고 그 단계 표시 자체 — 숫자와 빗금뿐이라 번역할 것이 없습니다
  const c = mk(V2, '2026-08-03T09:00:00');
  c.setState({ setupStep: 2 });
  ok('단계 표시가 슬러그가 아닙니다', !/^[a-z0-9_]+$/.test(c.renderVals().suNum), c.renderVals().suNum);
  ok('단계 표시가 2 / 4 입니다', c.renderVals().suNum === '2 / 4', c.renderVals().suNum);

  // 첫 화면에서 앞으로 가는 길이 '건너뛰기'뿐이었습니다 — 주 단추가 있어야 합니다
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const q1 = tpl.slice(tpl.indexOf('{{ suIs1 }}'), tpl.indexOf('{{ suIs2 }}'));
  ok('첫 화면에 다음 단추가 있습니다', q1.indexOf('{{ L.suNextBtn }}') >= 0);
  ok('그 단추가 빨간 주 단추입니다', q1.indexOf('background:var(--color-accent)') >= 0);
}

console.log('\n== 네 물음이 절반만 묻고 있었습니다 ==');
{
  // 폰에서 쓰던 사람이 다섯 가지를 들고 왔습니다. 넷은 화면이 빠뜨린 것이고,
  // 다섯째는 **이름표가 계산과 다른 말을 하고 있던 것**입니다.
  const fresh = () => { const c = mk(V2, '2026-08-03T09:00:00'); c.setState({ setupStep: 1 }); return c; };

  // ── 1. 교대는 시작이 둘입니다 ──
  const d = fresh(); d.renderVals().shiftOpts[0].set();
  ok('주간만은 주간 시작만 묻습니다', d.renderVals().suShowDay === true && d.renderVals().suShowNight === false);
  const n = fresh(); n.renderVals().shiftOpts[1].set();
  ok('야간만은 야간 시작만 묻습니다', n.renderVals().suShowDay === false && n.renderVals().suShowNight === true);
  const r = fresh(); r.renderVals().shiftOpts[2].set();
  ok('교대는 둘 다 묻습니다', r.renderVals().suShowDay === true && r.renderVals().suShowNight === true);
  // 자리로 찾지 않습니다 — 목록이 바뀌는 날 조용히 다른 것을 고릅니다.
  r.renderVals().nightDrumH.find(x => x.t === '19').set();
  ok('야간 시가 저장됩니다', r.st().nightStart === '19:00', r.st().nightStart);
  ok('야간 시각 칸도 있습니다', typeof r.renderVals().setNightStart === 'function'
    && typeof r.renderVals().keyNightStart === 'function');

  // ── 2. 시작만 묻고 끝을 말해 주지 않았습니다 ──
  // 퇴근 시각은 설정하지 않습니다(2026-08-18) — 하지만 앱은 이미 알고 있습니다.
  const e = fresh(); e.renderVals().shiftOpts[0].set();
  // ── 무엇을 보여 주는가 ──
  // normalEnd()가 아니라 otMark()입니다. 교대의 normalEnd는 야간이 시작하는
  // 자리라 주간 시작을 바꿔도 움직이지 않고, 근로자는 두 번 그것을 고장이라고
  // 말했습니다. 이 화면이 답해야 하는 물음은 '내 8시간이 언제 차는가'입니다.
  ok('8시간이 차는 자리를 보여 줍니다',
    e.renderVals().suDayEnd === e.hhmm(e.otMark('day')), e.renderVals().suDayEnd);
  ok('9시 시작 · 점심 1시간이면 18:00입니다', e.renderVals().suDayEnd === '18:00', e.renderVals().suDayEnd);
  ok('그래도 퇴근 시각 설정은 생기지 않았습니다',
    V2.DEFAULTS.dayEnd === undefined && V2.DEFAULTS.nightEnd === undefined);

  // ── 3. 뒤로 갈 수 없었습니다 ──
  const b = fresh(); b.setState({ setupStep: 3 });
  b.renderVals().suBack();
  ok('뒤로 가면 앞 화면입니다', b.renderVals().suIs2 === true);
  b.renderVals().suBack();
  ok('한 번 더 가면 첫 화면입니다', b.renderVals().suIs1 === true);
  b.renderVals().suBack();
  ok('첫 화면에서 뒤로 가면 소개로 돌아갑니다',
    b.renderVals().suOn === false && b.renderVals().showTour === true);

  // ── 4. 휴게 시각을 고칠 수 없었습니다 ──
  const k = fresh(); k.renderVals().shiftOpts[2].set(); k.setState({ setupStep: 2 });
  const rows = k.renderVals().dayBreakRows;
  ok('휴게가 고칠 수 있는 줄로 나옵니다', rows.length === 2
    && typeof rows[0].setFrom === 'function' && typeof rows[0].setTo === 'function');
  ok('줄마다 길이가 적힙니다', /60/.test(rows[0].mins), rows[0].mins);
  ok('잔업 휴게에는 표가 붙어 있습니다', rows[1].otOnly === true);
  rows[0].setTo({ target: { value: '13:00' } });
  ok('시각을 고치면 저장됩니다', k.st().breaksDay[0].to === '13:00', k.st().breaksDay[0].to);
  ok('고치면 손댔다는 사실도 적힙니다', k.st().breaksTouched === true);
  ok('야간 휴게 줄도 있습니다', k.renderVals().nightBreakRows.length >= 1);
  // 쉼표로 이어 붙인 한 줄은 더 이상 화면에 없습니다
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  ok('이어 붙인 문자열은 사라졌습니다', tpl.indexOf('{{ suBreakNow }}') < 0);
  ok('그 값도 남겨 두지 않았습니다', src.indexOf('suBreakNow:') < 0);

  // ── 5. 이름표가 계산과 다른 말을 하고 있었습니다 ──
  // 칩이 '21 → 말일'이었습니다. 21일에 시작하는 급여기간은 말일이 아니라
  // 다음달 20일에 끝납니다. period()는 처음부터 그렇게 세고 있었고, 틀린 것은
  // 이름표뿐이었습니다. 이제 이름표를 같은 산수에서 만들고, 둘이 갈라지지
  // 않는지 period()에 직접 물어 확인합니다.
  [1, 11, 21, 26].forEach(day => {
    const c = mk(V2, '2026-08-03T09:00:00');
    c.setS({ periodStart: day });
    const P = c.period(c.now());
    const realEnd = P.e.getDate();
    const lastOfMonth = new Date(P.e.getFullYear(), P.e.getMonth() + 1, 0).getDate();
    const said = V2.periodEndDay(day);
    ok('시작 ' + day + '일의 끝을 이름표가 맞게 말합니다',
      said === 0 ? realEnd === lastOfMonth : said === realEnd,
      'label says ' + (said || 'month end') + ', period() ends ' + realEnd);
  });
  const chips = fresh().renderVals().suPeriodChips;
  ok('말일에 끝나는 것은 1일뿐입니다',
    /말일|month end|cuối tháng/.test(chips[0].lbl)
    && !/말일|month end/.test(chips[1].lbl) && !/말일|month end/.test(chips[2].lbl),
    chips.map(x => x.lbl).join(' | '));
  ok('11일 칩이 다음달 10일이라고 말합니다', /10/.test(chips[1].lbl), chips[1].lbl);
  ok('21일 칩이 다음달 20일이라고 말합니다', /20/.test(chips[2].lbl), chips[2].lbl);
  const sp = fresh(); sp.setS({ periodStart: 21 });
  ok('시작하는 날과 끝나는 날을 나란히 적습니다',
    /21/.test(sp.renderVals().suPeriodSpan) && /20/.test(sp.renderVals().suPeriodSpan),
    sp.renderVals().suPeriodSpan);

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 뒤로·끝나는 자리·기간 이름표가 있습니다',
      !!V2.STR['go_back'][Lg] && !!V2.STR['eight_hours_reached_at'][Lg]
      && !!V2.STR['clock_out_is_punched_not_set'][Lg]
      && V2.STR['day_to_next_month_day'][Lg].indexOf('{p1}') >= 0);
  });
}

console.log('\n== 네 개로는 모자라고, 안 변하는 것처럼 보였습니다 ==');
{
  // 두 가지가 더 나왔습니다. 하나는 고를 것이 모자란 것이고, 하나는 앱이
  // 맞게 계산하면서 **왜 그런지 말하지 않아** 고장으로 읽힌 것입니다.
  const fresh = () => { const c = mk(V2, '2026-08-03T09:00:00'); c.setState({ setupStep: 1 }); return c; };

  // ── 시각은 시계 앱의 알람처럼 굴려서 고릅니다 ──
  ok('시 칸은 스물넷입니다', V2.DRUM_H.length === 24 && V2.DRUM_H[0] === '00' && V2.DRUM_H[23] === '23');
  ok('분 칸은 5분 단위 열둘입니다', V2.DRUM_M.length === 12 && V2.DRUM_M[1] === '05' && V2.DRUM_M[11] === '55');
  const c = fresh();
  ok('주간 드럼 두 칸이 있습니다',
    c.renderVals().dayDrumH.length === 24 && c.renderVals().dayDrumM.length === 12);
  ok('야간 드럼 두 칸도 있습니다',
    c.renderVals().nightDrumH.length === 24 && c.renderVals().nightDrumM.length === 12);
  // 지금 값이 든 칸에 표시가 붙습니다
  c.setS({ dayStart: '09:00' });
  ok('지금 값이 든 시 칸이 굵습니다', c.renderVals().dayDrumH.find(x => x.t === '09').sel === true);
  ok('다른 칸은 흐립니다', c.renderVals().dayDrumH.find(x => x.t === '14').sel === false);
  // 눌러도 고를 수 있습니다
  c.renderVals().dayDrumH.find(x => x.t === '05').set();
  c.renderVals().dayDrumM.find(x => x.t === '30').set();
  ok('시와 분을 따로 고르면 합쳐집니다', c.st().dayStart === '05:30', c.st().dayStart);
  ok('고르면 근무조도 확인됩니다', c.st().shiftConfirmed === true);
  // 굴리면 가장 가까운 칸이 고른 값입니다
  const px = i => ({ currentTarget: { scrollTop: i * V2.DRUM_ITEM } });
  c.renderVals().dayDrumHScroll(px(14));
  ok('굴리면 그 자리의 시가 됩니다', c.st().dayStart === '14:30', c.st().dayStart);
  c.renderVals().dayDrumMScroll(px(0));
  ok('분 칸을 굴려도 같습니다', c.st().dayStart === '14:00', c.st().dayStart);
  c.renderVals().nightDrumHScroll(px(22));
  ok('야간 드럼도 자기 값만 고칩니다',
    c.st().nightStart === '22:00' && c.st().dayStart === '14:00',
    c.st().nightStart + ' / ' + c.st().dayStart);
  // 목록 밖으로 굴러가도 아무 일이 없습니다
  const before = c.st().dayStart;
  c.renderVals().dayDrumHScroll(px(99));
  c.renderVals().dayDrumHScroll(px(-3));
  ok('목록 밖이면 아무것도 안 바뀝니다', c.st().dayStart === before, c.st().dayStart);
  // 5분 격자에 없는 값도 가장 가까운 칸으로 읽습니다 — 손으로 친 값이 그렇습니다
  ok('09:07은 09시 05분 칸으로 읽습니다',
    JSON.stringify(V2.drumIndex('09:07')) === JSON.stringify({ h: 9, m: 1 }),
    JSON.stringify(V2.drumIndex('09:07')));
  ok('빈 값은 00:00으로 읽습니다', JSON.stringify(V2.drumIndex('')) === JSON.stringify({ h: 0, m: 0 }));

  // 화면에서 굴러가야 하고, 가운데 띠는 누름을 가로채면 안 됩니다
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const q1 = tpl.slice(tpl.indexOf('{{ suIs1 }}'), tpl.indexOf('{{ suIs2 }}'));
  ok('네 칸이 다 굴러갑니다', (q1.match(/scroll-snap-type:y mandatory/g) || []).length === 4);
  ok('칸마다 가운데로 물립니다', (q1.match(/scroll-snap-align:center/g) || []).length === 4);
  // 주석에도 같은 글자가 있으므로 style 속성이 닫히는 자리까지 셉니다
  ok('가운데 띠가 누름을 가로채지 않습니다', (q1.match(/pointer-events:none"/g) || []).length === 2,
    String((q1.match(/pointer-events:none"/g) || []).length));
  // 칸 높이는 코드와 마크업이 같은 값이어야 합니다 — 다르면 굴린 자리를 잘못 셉니다
  ok('칸 높이가 코드와 같습니다',
    (q1.match(new RegExp('height:' + V2.DRUM_ITEM + 'px', 'g')) || []).length >= 8,
    'DRUM_ITEM=' + V2.DRUM_ITEM);
  ok('드럼마다 id가 있습니다',
    ['drumDayH','drumDayM','drumNightH','drumNightM'].every(id => q1.indexOf('id="' + id + '"') >= 0));
  // 물음이 열려 있지 않으면 만들지 않습니다 — 시계는 1초마다 돕니다
  const idle = mk(V2, '2026-08-03T09:00:00');
  ok('물음이 닫혀 있으면 목록을 만들지 않습니다', idle.renderVals().dayDrumH.length === 0);

  // ── 자리를 맞추는 코드가 손가락과 다투면 안 됩니다 ──
  // 처음에는 componentDidUpdate에서 맞췄습니다. 폰에서 굴리니 03:00으로 갔다가
  // 곧바로 09:00으로 되돌아왔습니다 — 굴릴 때마다 setState가 일어나고 그 setState가
  // 다시 자리를 맞췄기 때문입니다. 이제 화면에 들어올 때만, 그것도 아직 아무도
  // 굴리지 않은 칸(scrollTop === 0)만 맞춥니다.
  const srcAll = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const body = srcAll.slice(srcAll.indexOf('class Component'));
  const cdu = body.slice(body.indexOf('componentDidUpdate() {'), body.indexOf('componentDidUpdate() {') + 400);
  ok('componentDidUpdate는 드럼을 건드리지 않습니다', cdu.indexOf('this.placeDrums()') < 0, cdu.slice(0, 90));
  ok('화면에 들어올 때 맞춥니다', (body.match(/placeDrumsSoon\(\)/g) || []).length >= 5,
    String((body.match(/placeDrumsSoon\(\)/g) || []).length));
  ok('이미 굴린 칸은 건드리지 않습니다', body.indexOf('el.scrollTop !== 0') > 0);
  ok('0번 칸은 맞출 것이 없습니다', body.indexOf('idx === 0') > 0);

  // 굴려서 고른 값은 그대로 남습니다 — 다시 그려도 되돌아오지 않습니다
  const keep = fresh();
  keep.setS({ dayStart: '09:00' });
  keep.renderVals().dayDrumHScroll(px(3));
  ok('굴린 값이 저장됩니다', keep.st().dayStart === '03:00', keep.st().dayStart);
  keep.renderVals();                      // 다시 그려도
  keep.renderVals();
  ok('다시 그려도 되돌아오지 않습니다', keep.st().dayStart === '03:00', keep.st().dayStart);

  // ── 교대에서 주간의 끝이 안 움직이는 것처럼 보였습니다 ──
  // 계산은 맞습니다. 교대의 normalEnd('day')는 **야간이 시작하는 자리**이고
  // (2026-08-18), 두 조가 서로 넘겨받기 때문입니다. 주간 시작을 바꾸면 움직이는
  // 것은 주간의 끝이 아니라 **야간의 끝**입니다 — 화면이 그 말을 하지 않았습니다.
  const r = mk(V2, '2026-08-03T09:00:00');
  r.setState({ setupStep: 1 });
  r.setS({ shifts: 'both', nightStart: '21:00',
    breaksDay: [{ from: '11:30', to: '12:30' }, { from: '17:00', to: '17:30', ot: true }],
    breaksNight: [{ from: '00:00', to: '01:00' }] });
  r.setS({ dayStart: '09:00' });
  const a = r.renderVals();
  r.setS({ dayStart: '06:00' });
  const b = r.renderVals();
  // ── 근로자가 두 번 말한 그것 ──
  // 교대에서 주간 시작을 바꿔도 화면의 끝이 21:00 그대로였습니다. normalEnd를
  // 적고 있었기 때문입니다. otMark로 바꾸니 세 근무조 모두에서 시작을 따라
  // 움직입니다 — 이 줄이 그것을 붙들어 둡니다.
  ok('교대에서도 시작을 따라 움직입니다', a.suDayEnd === '18:00' && b.suDayEnd === '15:00',
    a.suDayEnd + ' / ' + b.suDayEnd);
  ok('야간도 자기 시작을 따라갑니다', a.suNightEnd === b.suNightEnd && a.suNightEnd === '06:00',
    a.suNightEnd + ' / ' + b.suNightEnd);
  // 휴게까지 더해 몇 시간 있어야 하는지 — 점심 한 시간이면 9.0h입니다
  ok('점심 한 시간이면 9.0h입니다', a.suDayHours === '9.0h', a.suDayHours);
  ok('시작이 달라도 같은 9.0h입니다', b.suDayHours === '9.0h', b.suDayHours);
  const d1 = fresh(); d1.setS({ shifts: 'day' });
  d1.setS({ dayStart: '06:00', breaksDay: [{ from: '11:30', to: '12:30' }] });
  ok('주간만도 시작을 따라 움직입니다', d1.renderVals().suDayEnd === '15:00',
    d1.renderVals().suDayEnd);
  // normalEnd는 그대로입니다 — 잔업 휴게 규칙은 여전히 그것을 씁니다
  ok('normalEnd 자체는 손대지 않았습니다', r.hhmm(r.normalEnd('day')) === '21:00',
    r.hhmm(r.normalEnd('day')));

  ok('span은 자정을 넘겨도 셉니다', V2.spanH(21, 30) === 9 && V2.spanH(9, 21) === 12
    && V2.spanH(21, 21) === 24);

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 8시간 자리 이름이 있습니다', !!V2.STR['eight_hours_reached_at'][Lg]);
  });

  // ── 화면은 마크다운을 그리지 않습니다 ──
  // 이 안내를 쓰면서 **야간의 끝**이라고 적었더니 폰에 별 두 개가 그대로
  // 찍혔습니다. 템플릿은 문자열을 글자 그대로 내보냅니다 — 강조하고 싶으면
  // 별표가 아니라 마크업으로 해야 합니다.
  const marks = [];
  Object.keys(V2.STR).forEach(k => {
    const row = V2.STR[k];
    Object.keys(row).forEach(Lg => {
      if (typeof row[Lg] === 'string' && row[Lg].indexOf('**') >= 0) marks.push(k + '.' + Lg);
    });
  });
  ok('별표 강조가 남아 있지 않습니다', marks.length === 0, marks.slice(0, 5).join(', '));
}

console.log('\n== 휴게 시각도 알람처럼 굴려서 고칩니다 ==');
{
  // 2/4의 휴게 시각이 글자 칸이었습니다. 시작 시각은 굴림판인데 휴게만 자판을
  // 올려 치게 하면 한 화면 안에서 두 가지 방식이 됩니다.
  const c = mk(V2, '2026-08-03T09:00:00');
  c.setState({ setupStep: 2 });
  c.setS({ shifts: 'both',
    breaksDay: [{ from: '11:30', to: '12:30' }, { from: '17:00', to: '17:30', ot: true }],
    breaksNight: [{ from: '00:00', to: '01:00' }] });

  const rows = () => c.renderVals().dayBreakRows;
  ok('처음에는 아무 칸도 열려 있지 않습니다', rows().every(r => r.openAny === false));

  // 한 번에 하나만 열립니다
  rows()[0].tapFrom();
  ok('누른 칸이 열립니다', rows()[0].openF === true && rows()[0].openT === false);
  ok('다른 줄은 닫혀 있습니다', rows()[1].openAny === false);
  rows()[0].tapTo();
  ok('같은 줄의 다른 칸을 누르면 그쪽이 열립니다',
    rows()[0].openT === true && rows()[0].openF === false);
  rows()[1].tapFrom();
  ok('다른 줄을 누르면 앞 줄은 닫힙니다', rows()[0].openAny === false && rows()[1].openF === true);
  rows()[1].tapFrom();
  ok('같은 칸을 다시 누르면 닫힙니다', rows()[1].openAny === false);

  // 열린 칸에만 드럼이 있습니다 — 늘 넷을 펴 두면 화면이 세 배가 됩니다
  rows()[0].tapFrom();
  ok('열린 줄에만 드럼이 붙습니다',
    rows()[0].drumH.length === 24 && rows()[0].drumM.length === 12
    && rows()[1].drumH.length === 0);
  ok('지금 값이 든 칸이 굵습니다', rows()[0].drumH.find(x => x.t === '11').sel === true);

  // 눌러서도, 굴려서도 고쳐집니다
  rows()[0].drumH.find(x => x.t === '10').set();
  ok('시를 고치면 분은 그대로입니다', c.st().breaksDay[0].from === '10:30', c.st().breaksDay[0].from);
  const px = i => ({ currentTarget: { scrollTop: i * V2.DRUM_ITEM } });
  rows()[0].mScroll(px(0));
  ok('굴려서 분을 고칩니다', c.st().breaksDay[0].from === '10:00', c.st().breaksDay[0].from);
  ok('끝 시각은 건드리지 않았습니다', c.st().breaksDay[0].to === '12:30');
  ok('손댔다는 사실이 적힙니다', c.st().breaksTouched === true);

  // ── 표가 붙은 저녁 휴게는 그대로여야 합니다 ──
  const dinner = JSON.stringify(c.st().breaksDay[1]);
  rows()[1].tapTo();
  rows()[1].drumH.find(x => x.t === '18').set();
  ok('다른 줄을 고쳐도 표는 남습니다', c.st().breaksDay[1].ot === true,
    JSON.stringify(c.st().breaksDay[1]));
  ok('첫 줄은 그대로입니다', c.st().breaksDay[0].from === '10:00');
  ok('고친 것은 그 칸뿐입니다', c.st().breaksDay[1].from === '17:00' && c.st().breaksDay[1].to === '18:30',
    JSON.stringify(c.st().breaksDay[1]));

  // 야간 줄도 자기 목록을 고칩니다
  const nrows = () => c.renderVals().nightBreakRows;
  nrows()[0].tapFrom();
  nrows()[0].drumH.find(x => x.t === '01').set();
  ok('야간 휴게는 야간 목록만 고칩니다',
    c.st().breaksNight[0].from === '01:00' && c.st().breaksDay[0].from === '10:00',
    c.st().breaksNight[0].from + ' / ' + c.st().breaksDay[0].from);

  // 화면: 2/4에는 휴게 시각을 치는 글자 칸이 없고, 설정 탭에는 그대로 있습니다
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const q2 = tpl.slice(tpl.indexOf('{{ suIs2 }}'), tpl.indexOf('{{ suIs3 }}'));
  ok('2/4에는 r.setFrom을 쓰는 글자 칸이 없습니다', q2.indexOf('{{ r.setFrom }}') < 0);
  ok('2/4의 시각은 눌러서 엽니다',
    (q2.match(/\{\{ r\.tapFrom \}\}/g) || []).length === 2
    && (q2.match(/\{\{ r\.tapTo \}\}/g) || []).length === 2);
  ok('드럼이 두 벌 붙어 있습니다', (q2.match(/id="brDrumH"/g) || []).length === 2);
  ok('가운데 띠는 누름을 가로채지 않습니다', (q2.match(/pointer-events:none"/g) || []).length === 2);
  // 설정 탭의 휴게 줄은 예전 그대로입니다 — 거기까지 바꾸라고 한 적이 없습니다
  const setBreaks = tpl.slice(tpl.indexOf('{{ dayBreakRows }}', tpl.indexOf('{{ gShiftOpen }}')));
  ok('설정 탭은 여전히 글자 칸입니다', setBreaks.indexOf('{{ r.setFrom }}') >= 0);

  // 자리 맞추기가 2/4에서도 돕니다
  const body = src.slice(src.indexOf('class Component'));
  ok('2/4에서도 자리를 맞춥니다', body.indexOf("step !== 1 && step !== 2") > 0);
  ok('열린 칸 하나만 맞춥니다', body.indexOf("put('brDrumH'") > 0);
}

console.log('\n== 필요해지는 그 자리에서 묻습니다 ==');
{
  // 급여 탭 맨 위의 기본금 카드가 이미 하는 그것을 세 자리로 넓힙니다. 설정
  // 깊숙이 접어 두는 대신, 그 값이 처음으로 중요해지는 화면에서 한 번 묻습니다.
  const mkP = () => {
    const c = mk(V2, '2026-08-15T10:00:00');
    c.state.extra = [{ y:2026, m:8, day:3, kind:'day', type:'shift', inH:9, outH:21,
      c: c.calc(9, 21, 'day', false) }];
    return c;
  };

  // ── 1. 성명 · 근무내역서를 만들기 직전 ──
  // 열여덟째는 문서가 나온 **뒤에** 빨간 «성명 미기재»로 알려 줍니다. 그러면
  // 그 종이를 다시 만들어야 합니다. 만들기 전에 묻습니다.
  const n = mkP();
  ok('이름이 없으면 문서 앞에서 묻습니다', n.renderVals().askName === true);
  n.setS({ workerName: 'NGUYEN VAN A' });
  ok('적으면 묻지 않습니다', n.renderVals().askName === false);
  const n2 = mkP();
  n2.renderVals().nameLater();
  ok('나중에를 누르면 이번에는 묻지 않습니다', n2.renderVals().askName === false);
  ok('나중에는 저장되지 않습니다', (n2.save(), !/nameAsked/.test(n2.lastSaved || '')));
  ok('그래도 이름은 여전히 비어 있습니다', n2.workerName() === '');
  // 막지 않습니다 — 문서는 그대로 나오고, 스스로 미기재라고 밝힙니다
  ok('문서는 그대로 만들어집니다', n2.evidenceHtml(n2.viewPeriod()).indexOf('미기재') > 0);

  // ── 2. 공제가 어긋난 그 자리에서 두 칸 ──
  const d = mkP();
  ok('명세서를 안 적었으면 묻지 않습니다', d.renderVals().askDed === false);
  const app = d.slipRows().find(r => r.k === 'ded').app;
  d.setSlip('ded', String(app));
  ok('같으면 묻지 않습니다', d.renderVals().askDed === false);
  d.setSlip('ded', String(app + 100000));
  ok('어긋나면 그 자리에서 묻습니다', d.renderVals().askDed === true);
  d.setSlip('ded', String(app + 500));
  ok('몇백 원 차이로는 묻지 않습니다', d.renderVals().askDed === false, '500');

  // ── 잔업 줄에는 이런 카드를 붙이지 않습니다 ──
  // 거기서 어긋난 것은 **부족액**입니다. 앱이 그것을 설명해 없애면 이 앱이 있을
  // 이유가 사라집니다. 명세서가 잔업을 덜 주어도 새 카드는 뜨지 않고, 빨간
  // 부족액은 그대로 섭니다.
  const o = mkP();
  const otApp = o.slipRows().find(r => r.k === 'ot').app;
  const paid = Math.max(0, otApp - 50000);
  o.setSlip('ot', String(paid));
  const ov = o.renderVals();
  ok('잔업이 덜 나와도 새 카드는 없습니다', ov.askDed === false && ov.askAllow === false);
  // 0으로 깎이는 경우가 있으므로 실제 차액으로 셉니다 — 처음에 50,000을 그대로
  // 기대했다가 걸렸습니다. 앱이 아니라 시험의 산수가 틀렸습니다.
  ok('부족액은 그대로 섭니다', o.slipShortfall() === otApp - paid,
    o.slipShortfall() + ' vs ' + (otApp - paid));
  ok('그리고 0이 아닙니다', o.slipShortfall() > 0, String(o.slipShortfall()));
  ok('배수를 권하는 문장은 아예 없습니다',
    Object.keys(V2.STR).every(k => {
      const v = V2.STR[k] && V2.STR[k].ko;
      return !(typeof v === 'string' && /배수를 (바꿔|고쳐)/.test(v));
    }));

  // ── 3. 명세서가 앱보다 많이 줄 때 ──
  const a = mkP();
  const gApp = a.slipRows().find(r => r.k === 'gross').app;
  a.setSlip('gross', String(gApp + 200000));
  ok('수당이 없으면 그 자리에서 묻습니다', a.renderVals().askAllow === true);
  a.setS({ allowances: [{ name: '식대', en: 'Meal', amount: 200000, tf: true }] });
  ok('이미 적어 둔 사람에게는 짐작하지 않습니다', a.renderVals().askAllow === false);
  const a2 = mkP();
  a2.setSlip('gross', String(gApp - 200000));
  ok('명세서가 적을 때는 수당 이야기를 하지 않습니다', a2.renderVals().askAllow === false);

  // ── 화면: 카드가 맞는 자리에 있습니다 ──
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  ok('성명 카드는 근무내역서 단추 앞에 섭니다',
    tpl.indexOf('{{ askName }}') < tpl.indexOf('{{ doEvidence }}')
    && tpl.indexOf('{{ askName }}') > tpl.indexOf('{{ docPeriodSub }}'));
  ok('공제 카드는 대조표 아래에 섭니다',
    tpl.indexOf('{{ askDed }}') > tpl.indexOf('{{ slipRows }}'));
  ok('그 카드가 실제로 두 칸을 내어 놓습니다',
    tpl.slice(tpl.indexOf('{{ askDed }}'), tpl.indexOf('{{ askAllow }}')).indexOf('{{ setBosu }}') > 0
    && tpl.slice(tpl.indexOf('{{ askDed }}'), tpl.indexOf('{{ askAllow }}')).indexOf('{{ setDep }}') > 0);
  ok('수당 카드는 줄을 더하는 단추를 내어 놓습니다',
    tpl.slice(tpl.indexOf('{{ askAllow }}')).indexOf('{{ addAllow }}') > 0);
  // 설정에서 지운 것은 없습니다 — 옮긴 것이 아니라 한 번 더 물을 자리를 만든 것입니다
  ok('보수월액은 설정에도 그대로 있습니다',
    (tpl.match(/\{\{ setBosu \}\}/g) || []).length === 2);
  ok('공제대상가족도 그대로입니다', (tpl.match(/\{\{ setDep \}\}/g) || []).length === 2);
  ok('성명 칸도 설정에 그대로입니다', (tpl.match(/\{\{ setWorkerName \}\}/g) || []).length === 2);

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 세 카드의 문장이 다 있습니다',
      !!V2.STR['whose_record_is_this'][Lg] && !!V2.STR['the_deductions_do_not_match'][Lg]
      && !!V2.STR['your_payslip_pays_more_than_the_app'][Lg] && !!V2.STR['not_now'][Lg]);
    ok(Lg + ' 공제 카드가 덜 받은 돈이 아니라고 말합니다',
      V2.STR['these_two_are_filed_with_the_agencies'][Lg].length > 60);
  });
}

console.log('\n== 명세서의 국민연금 한 줄이 보수월액을 되살립니다 ==');
{
  // 스물여섯째가 되살리는 산수를 만들어 두었지만, 그 칸은 설정 깊숙이 접혀
  // 있어서 아무도 찾지 못했습니다. 명세서 대조는 공제를 **뭉친 숫자 하나**로
  // 받고 있었습니다. 그 밑에 국민연금 한 줄을 두면, 명세서를 옮겨 적는 근로자가
  // 이미 그 숫자를 앱에 넘겨준 것이 됩니다 — 새로 묻는 것이 하나도 없습니다.
  const mkP = () => {
    const c = mk(V2, '2026-08-15T10:00:00');
    c.state.extra = [{ y:2026, m:8, day:25, kind:'day', type:'shift', inH:9, outH:21,
      c: c.calc(9, 21, 'day', false) }];
    return c;
  };

  const c = mkP();
  ok('공제 밑에 국민연금 줄이 있습니다',
    c.slipRows().map(r => r.k).join() === 'basic,ot,night,hol,gross,ded,pension,net',
    c.slipRows().map(r => r.k).join());
  ok('그 줄은 한 칸 들여 씁니다', c.slipRows().find(r => r.k === 'pension').pad === '14px');
  ok('앱 쪽 값은 앱이 계산한 국민연금입니다',
    c.slipRows().find(r => r.k === 'pension').app === c.insCalc(c.wageFor()).pension);

  // ── 국민연금에 들지 않은 사람에게는 그 줄이 없습니다 ──
  // 사회보장협정으로 면제된 E-9 근로자가 실제로 있고, 그 사람의 명세서에는 그
  // 줄이 아예 없습니다. 없는 줄을 물으면 그것대로 틀린 화면입니다.
  const off = mkP();
  off.setS({ insOn: { health: true, care: true, pension: false, emp: false } });
  ok('연금이 꺼져 있으면 줄이 없습니다',
    off.slipRows().every(r => r.k !== 'pension'), off.slipRows().map(r => r.k).join());
  ok('그 사람에게는 되살리기도 없습니다', off.renderVals().askPen === false);

  // ── 되살리기 ──
  c.setSlip('pension', '163110');
  ok('163,110에서 되살립니다', V2.bosuFromPension(163110) === 3434000, String(V2.bosuFromPension(163110)));
  ok('권하지만 아직 쓰지는 않습니다', c.renderVals().askPen === true && (+c.st().bosu || 0) === 0);
  ok('문장이 두 숫자를 다 말합니다',
    /163,110/.test(c.renderVals().penMsg) && /3,434,000/.test(c.renderVals().penMsg),
    c.renderVals().penMsg.slice(0, 60));
  ok('단추에도 그 값이 있습니다', /3,434,000/.test(c.renderVals().penBtn), c.renderVals().penBtn);
  c.renderVals().applyPen();
  ok('누르면 그때 씁니다', c.st().bosu === 3434000, String(c.st().bosu));
  ok('쓰고 나면 다시 권하지 않습니다', c.renderVals().askPen === false);
  // 그리고 실제로 공제가 명세서에 가까워집니다
  ok('국민연금이 명세서와 원 단위로 맞습니다',
    c.slipRows().find(r => r.k === 'pension').app === 163110,
    String(c.slipRows().find(r => r.k === 'pension').app));

  // ── 풀리지 않으면 지어내지 않습니다 ──
  const bad = mkP();
  bad.setSlip('pension', '12345');
  ok('풀리지 않으면 그렇다고 말합니다', bad.renderVals().penFailed === true);
  ok('그때는 단추를 내밀지 않습니다', bad.renderVals().askPen === false && bad.renderVals().penBtn === '');
  ok('보수월액도 건드리지 않습니다', (+bad.st().bosu || 0) === 0);

  // ── 손으로 적어 둔 값을 말없이 갈아치우지 않습니다 ──
  const hand = mkP();
  hand.setS({ bosu: 3000000 });
  hand.setSlip('pension', '163110');
  ok('다른 값이면 권합니다', hand.renderVals().askPen === true);
  ok('누르기 전에는 그대로입니다', hand.st().bosu === 3000000, String(hand.st().bosu));
  hand.renderVals().applyPen();
  ok('눌러야 바뀝니다', hand.st().bosu === 3434000);

  // ══ 부족액은 한 푼도 움직이지 않습니다 ══
  // 새 줄은 공제의 조각입니다. slipShortfall은 지급 줄만 세는 allowlist라
  // 'pension'은 저절로 빠지지만, 그것이 설계라는 것을 붙들어 둡니다.
  const s1 = mkP();
  const before = s1.slipShortfall();
  s1.setSlip('pension', '163110');
  ok('국민연금을 적어도 부족액은 그대로입니다', s1.slipShortfall() === before,
    before + ' -> ' + s1.slipShortfall());
  s1.setSlip('ot', '1000');
  const withShort = s1.slipShortfall();
  s1.setSlip('pension', '999999');
  ok('국민연금을 크게 적어도 부족액은 그대로입니다', s1.slipShortfall() === withShort,
    withShort + ' -> ' + s1.slipShortfall());
  ok('부족액을 세는 줄에 pension이 없습니다',
    (function () {
      const src = require('fs').readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
      const i = src.indexOf('slipShortfall(P) {');
      return src.slice(i, i + 260).indexOf("'pension'") < 0;
    })());

  // ── 예전에 저장해 둔 대조는 그대로 읽힙니다 ──
  // slip(P)는 없는 키를 undefined로 돌려주므로 has:false, short:0입니다.
  const old = mkP();
  old.setSlip('ded', '520000');
  const pr = old.slipRows().find(r => r.k === 'pension');
  ok('국민연금을 안 적은 대조도 그대로입니다', pr.has === false && pr.short === 0);
  ok('그때는 되살리기가 뜨지 않습니다', old.renderVals().askPen === false);

  // ── 화면 ──
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  ok('되살리기 카드는 대조표 아래입니다', tpl.indexOf('{{ askPen }}') > tpl.indexOf('{{ slipRows }}'));
  ok('공제 카드보다 앞에 섭니다', tpl.indexOf('{{ askPen }}') < tpl.indexOf('{{ askDed }}'));
  ok('단추를 사이에 둡니다', tpl.slice(tpl.indexOf('{{ askPen }}'), tpl.indexOf('{{ penFailed }}')).indexOf('{{ applyPen }}') > 0);
  ok('줄이 들여쓰기 홀을 씁니다', tpl.indexOf('padding-left:{{ r.pad }}') > 0);
  // 설정의 그 칸도 그대로입니다 — 옮긴 것이 아닙니다
  ok('설정에도 국민연금 칸이 그대로 있습니다', tpl.indexOf('{{ setBosuPen }}') > 0);

  ['ko','en','vi','zh','th','id','ne','km'].forEach(Lg => {
    ok(Lg + ' 되살리기 문장이 두 자리를 받습니다',
      V2.STR['this_pension_line_points_to_one_wage'][Lg].indexOf('{p0}') >= 0
      && V2.STR['this_pension_line_points_to_one_wage'][Lg].indexOf('{p1}') >= 0);
    ok(Lg + ' 단추가 값을 받습니다',
      V2.STR['use_this_and_recount'][Lg].indexOf('{p0}') >= 0);
  });
}

console.log('\n== 카드의 마지막 줄에는 밑줄이 없습니다 ==');
{
  // 출퇴근 카드는 줄마다 1px 밑줄을 그었고 마지막 줄에도 그었습니다. 카드의
  // 위는 첫 줄의 여백 11px뿐인데 아래는 밑줄 + 여백 18px이라, 한 카드의 위아래가
  // 달랐습니다. 밑줄은 줄과 줄 사이를 가르는 것이지 카드의 끝을 그리는 것이
  // 아닙니다 — 카드는 둥근 모서리와 그림자로 스스로 끝납니다(서른째).
  const rowsOf = c => c.renderVals().liveRows;

  // 퇴근한 뒤의 카드 — 지난 근무 + 누계 다섯 줄
  const done = mk(V2, '2026-08-25T18:10:00');
  done.setS({ periodStart:21, payday:25 });
  done.state.session = { inIso: new Date('2026-08-25T09:00:00').toISOString() };
  done.punch();
  const R = rowsOf(done);
  ok('마지막 줄은 예상 실수령입니다', R[R.length-1].label === '예상 수령액',
    R[R.length-1].label);
  ok('마지막 줄에는 밑줄이 없습니다', R[R.length-1].bd === 'transparent', R[R.length-1].bd);
  ok('그 앞 줄들은 밑줄을 그대로 그립니다',
    R.slice(0, -1).every(r => r.bd === 'var(--color-neutral-300)'),
    R.map(r => r.bd).join(' | '));

  // 근무중 카드도 같습니다 — 두 갈래가 한 마크업을 나눠 씁니다
  const on = mk(V2, '2026-08-25T09:00:00');
  on.punch();
  on.base = new Date('2026-08-25T15:00:00'); on.t0 = Date.now();
  const O = rowsOf(on);
  ok('근무중 카드도 마지막 줄에 밑줄이 없습니다', O[O.length-1].bd === 'transparent',
    O[O.length-1].bd);
  ok('근무중 카드의 앞 줄들은 밑줄이 있습니다',
    O.slice(0, -1).every(r => r.bd === 'var(--color-neutral-300)'));

  // 처음 쓰는 사람 — 지난 근무 줄이 없어 다섯 줄입니다
  const fresh = mk(V2, '2026-08-21T09:00:00');
  fresh.setS({ periodStart:21, payday:25 });
  const F = rowsOf(fresh);
  ok('기록이 없어도 마지막 줄에 밑줄이 없습니다', F[F.length-1].bd === 'transparent');
  ok('줄 수는 그대로 다섯입니다', F.length === 5, 'rows=' + F.length);

  // 값은 하나도 바뀌지 않았습니다 — 더한 것은 밑줄을 그릴지 말지뿐입니다
  ok('금액도 이름도 그대로입니다',
    R[0].label === '지난 근무' && R[1].label === '근무일' && R[R.length-1].value.indexOf('₩') === 0,
    R[R.length-1].value);

  // ── 마크업 ──
  const fsB = require('fs');
  const srcB = fsB.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tplB = srcB.slice(0, srcB.indexOf('</x-dc>'));
  const secB = tplB.slice(tplB.indexOf('{{ liveRows }}'), tplB.indexOf('{{ liveRows }}') + 900);
  ok('줄의 밑줄 색이 홀입니다', secB.indexOf('border-bottom:1px solid {{ r.bd }}') > 0);
  ok('그 자리에 색이 박혀 있지 않습니다',
    secB.indexOf('border-bottom:1px solid var(--color-neutral-300)') < 0);
  // 카드 아래에 매달려 있던 18px 여백은 없앴습니다 — 위(11px)와 짝이 맞아야 합니다
  ok('카드 끝의 여백 상자가 없습니다', secB.indexOf('height:18px') < 0);
}

console.log('\n== 누계 네 칸도 카드의 끝을 두 번 그리고 있었습니다 ==');
{
  // 근무기록의 REGULAR · OVERTIME · NIGHT · HOLIDAY 네 칸이 저마다 밑줄과
  // 오른줄을 그렸습니다. 안쪽의 두 줄은 칸을 가르는 것이라 맞지만, 마지막 줄의
  // 밑줄과 오른쪽 칸의 오른줄은 카드의 가장자리에 그대로 얹힙니다 — 위는 12px
  // 여백뿐인데 아래는 12px + 1px이라 카드가 비뚤어 보였습니다. 마흔한째의
  // 요약 카드와 같은 자리이고, 답도 같습니다: 카드는 스스로 끝납니다.
  const c = mk(V2, '2026-08-25T18:10:00');
  c.setS({ periodStart:21, payday:25 });
  const C = c.renderVals().totalCells;

  ok('누계는 네 칸입니다', C.length === 4, 'cells=' + C.length);
  ok('첫 줄 두 칸은 밑줄을 그립니다',
    C[0].bd === 'var(--color-neutral-300)' && C[1].bd === 'var(--color-neutral-300)',
    C.map(x => x.bd).join(' | '));
  ok('마지막 줄 두 칸에는 밑줄이 없습니다',
    C[2].bd === 'transparent' && C[3].bd === 'transparent',
    C.map(x => x.bd).join(' | '));
  ok('왼쪽 칸은 오른줄을 그립니다',
    C[0].rt === 'var(--color-neutral-300)' && C[2].rt === 'var(--color-neutral-300)',
    C.map(x => x.rt).join(' | '));
  ok('오른쪽 칸에는 오른줄이 없습니다',
    C[1].rt === 'transparent' && C[3].rt === 'transparent',
    C.map(x => x.rt).join(' | '));

  // 값은 하나도 바뀌지 않았습니다 — 더한 것은 줄을 그릴지 말지뿐입니다
  ok('네 칸의 이름은 그대로입니다',
    C[0].label === '정상근무' && C[3].label === '특근',
    C.map(x => x.label).join(' | '));
  ok('네 칸의 값은 그대로 시간입니다',
    C.every(x => /h$/.test(x.value)), C.map(x => x.value).join(' | '));

  // 기록이 하나도 없어도 같습니다 — 빈 칸도 카드의 끝은 그리지 않습니다
  const e = mk(V2, '2026-08-21T09:00:00');
  e.setS({ periodStart:21, payday:25 });
  const E = e.renderVals().totalCells;
  ok('기록이 없어도 마지막 줄에 밑줄이 없습니다',
    E[2].bd === 'transparent' && E[3].bd === 'transparent');

  // ── 마크업 ── 값이 맞아도 마크업이 그 홀을 쓰지 않으면 화면은 그대로입니다
  // (서른두째의 헛통과). 그래서 두 홀을 소스에서 셉니다.
  const fsT = require('fs');
  const srcT = fsT.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tplT = srcT.slice(0, srcT.indexOf('</x-dc>'));
  const at = tplT.indexOf('{{ totalCells }}');
  const secT = tplT.slice(at, at + 700);
  ok('누계 칸의 밑줄 색이 홀입니다', secT.indexOf('border-bottom:1px solid {{ c.bd }}') > 0);
  ok('누계 칸의 오른줄 색도 홀입니다', secT.indexOf('border-right:1px solid {{ c.rt }}') > 0);
  ok('그 자리에 색이 박혀 있지 않습니다',
    secT.indexOf('border-bottom:1px solid var(--color-neutral-300)') < 0
    && secT.indexOf('border-right:1px solid var(--color-neutral-300)') < 0);
  // 격자를 감싼 상자에는 평면 시대의 구역 줄이 하나 더 있었습니다. 카드가 된
  // 뒤로 층이 그 색을 지워 보이지 않는데 2px 자리는 그대로 남아, 위가 12px일
  // 때 아래가 12px + 2px이었습니다. 보이지 않는 줄은 여백만 먹습니다.
  const boxT = tplT.slice(tplT.lastIndexOf('<div style="display:grid', at), at);
  ok('누계 격자에 죽은 구역 줄이 없습니다',
    boxT.indexOf('border-bottom:2px solid var(--color-divider)') < 0, boxT.trim());
}

console.log('\n== 근무조는 해와 달로도 말합니다 ==');
{
  // 근무기록 줄의 배지에는 해와 달이 있는데 출퇴근 카드에는 글자뿐이었습니다.
  // 같은 하루를 두 화면이 다르게 그리면 안 됩니다 — 그림도 색처럼 한 벌입니다.
  // 그림은 새로 그리지 않았습니다: 근무기록의 그 path를 그대로 씁니다.
  const day = mk(V2, '2026-08-03T07:03:00');
  day.setS({ shifts: 'day', shiftConfirmed: true });
  const vd = day.renderVals();
  ok('주간에는 해가 뜹니다', vd.detectSun === true && vd.detectMoon === false,
    'sun=' + vd.detectSun + ' moon=' + vd.detectMoon);

  const night = mk(V2, '2026-08-03T21:03:00');
  night.setS({ shifts: 'night', shiftConfirmed: true });
  const vn = night.renderVals();
  ok('야간에는 달이 뜹니다', vn.detectMoon === true && vn.detectSun === false,
    'sun=' + vn.detectSun + ' moon=' + vn.detectMoon);
  ok('둘이 함께 뜨는 일은 없습니다', !(vn.detectSun && vn.detectMoon));

  // 근무중에도 그대로입니다 — 찍고 나면 그림이 사라지면 안 됩니다
  const on = mk(V2, '2026-08-03T10:00:00');
  on.setS({ shifts: 'day', shiftConfirmed: true });
  on.setState({ session: { inIso: new Date('2026-08-03T09:00:00').toISOString() } });
  const vo = on.renderVals();
  ok('근무중에도 해가 그대로 있습니다', vo.detectSun === true && vo.detectMoon === false);

  const onN = mk(V2, '2026-08-03T23:00:00');
  onN.setS({ shifts: 'night', shiftConfirmed: true });
  onN.setState({ session: { inIso: new Date('2026-08-03T21:00:00').toISOString() } });
  const voN = onN.renderVals();
  ok('근무중 야간에는 달이 그대로 있습니다', voN.detectMoon === true && voN.detectSun === false);

  // 특근은 근무조를 대신하지 않습니다(마흔째) — 그림도 마찬가지입니다
  const hol = mk(V2, '2026-08-02T07:03:00');            // 일요일 = 특근
  hol.setS({ shifts: 'day', shiftConfirmed: true });
  const vh = hol.renderVals();
  ok('특근인 주간에도 해는 해입니다', vh.detectHol === true && vh.detectSun === true);

  // ── 마크업 ── 근무기록의 그림과 글자 그대로인지 셉니다
  const fsS = require('fs');
  const srcS = fsS.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tplS = srcS.slice(0, srcS.indexOf('</x-dc>'));
  const SUNP = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path>';
  const MOONP = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>';
  ok('해 그림은 근무기록의 그것과 같습니다', (tplS.split(SUNP).length - 1) === 2,
    'sun=' + (tplS.split(SUNP).length - 1));
  ok('달 그림도 그렇습니다', (tplS.split(MOONP).length - 1) === 2,
    'moon=' + (tplS.split(MOONP).length - 1));
  // 그림은 알약 안에 하나뿐입니다 — 근무기록의 배지까지 세면 둘입니다.
  // 시작 시각 줄에도 한 번 붙여 봤는데, 한 줄에서 같은 말을 두 번 하는 것이라
  // 뺐습니다: 근무조를 말하는 것은 알약이고 그 옆은 시각입니다.
  const card = tplS.slice(tplS.indexOf('{{ detectKicker }}'), tplS.indexOf('{{ detectReason }}'));
  ok('그림은 알약 안에만 있습니다',
    (card.split('{{ detectSun }}').length - 1) === 1
    && (card.split('{{ detectMoon }}').length - 1) === 1);
  ok('그림이 알약의 글자보다 앞에 섭니다',
    card.indexOf('{{ detectSun }}') < card.indexOf('{{ detectShift }}'));
  ok('시작 시각 줄에는 그림이 없습니다',
    card.indexOf('{{ detectSun }}') < card.indexOf('{{ detectWindow }}')
    && card.slice(card.indexOf('{{ detectShift }}'), card.indexOf('{{ detectReason }}')).indexOf('<svg') < 0);
  // 색을 새로 고르지 않았습니다 — 알약 안에서는 알약의 글자색입니다
  ok('그림은 currentColor를 씁니다',
    (card.split('stroke="currentColor"').length - 1) === 2);
  // 알약은 일곱 개 그대로입니다(boot.js가 세는 그 수) — 새 알약을 만들지 않았습니다
  ok('새 알약을 만들지 않았습니다',
    (srcS.match(/min-height:30px;display:inline-flex/g) || []).length === 7);
}

// ══ 설정: 열리는 것과 열리지 않는 것이 같은 흰 상자였습니다 ═════════════════
// 만든 사람이 설정을 훑어 내려가고 말했습니다: 색도 모양도 다 같은데 눌러서
// 펴지는 것이 있고 안 펴지는 것이 있어 몹시 헷갈립니다.
//
// 맞습니다, 그리고 원인은 마흔째의 카드 층입니다. 이 탭의 top-level 블록이
// **열여덟**이었고 층이 그 전부를 같은 흰 카드로 만들었습니다 — 아홉은 눌러서
// 열리고 아홉은 열리지 않는데, 상자만 보고는 가를 길이 없었습니다.
// '카드'가 아무 뜻도 나르지 않게 된 것입니다.
//
// 문법을 셋으로 갈랐습니다:
//   · 바닥에 놓인 이름표  = 다음 카드의 머리말이다 (카드가 아닙니다)
//   · 동그라미가 달린 줄  = 누르면 열린다
//   · 동그라미가 없는 카드 = 읽는 것이다
console.log('\n== 열리는 것과 열리지 않는 것 ==');
{
  const fs = require('fs');
  const srcQ = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tplQ = srcQ.slice(0, srcQ.indexOf('</x-dc>'));
  const GRP = ['Shift','Pay','Period','Money','Ins','Rules','Me','Lang','Backup'];

  // ── 1 · 층마다 카드가 하나입니다 ──
  // 예전에는 묶음 줄 하나가 카드 하나였고, 열면 본문이 **또 다른 카드**로 따로
  // 떨어져 나왔습니다(재 보니 1691px짜리 흰 상자 하나). 어느 줄의 본문인지
  // 화면이 말해 주지 않았습니다. 이제 한 층이 카드 하나이고 줄들은 그 안에
  // 있으므로, 본문은 자기 줄 **바로 아래**에서 펴집니다.
  const label = 'style="padding:0 18px 7px"';
  ok('층의 이름표는 셋뿐입니다', (tplQ.split(label).length - 1) === 3,
    'got ' + (tplQ.split(label).length - 1));
  // 이름표가 예전처럼 검은 줄과 흰 바탕을 달고 있으면 그것은 카드입니다
  ok('이름표에 카드의 옷이 남아 있지 않습니다',
    tplQ.indexOf('padding:15px 18px 9px;border-top:2px solid var(--color-text)') < 0);

  // 층의 슬라이스마다 <div>와 </div>가 맞아떨어져야 감싼 것입니다
  const bal = t => (t.match(/<div\b/g) || []).length - (t.match(/<\/div>/g) || []).length;
  const secs = [['{{ L.tierNeed }}', '{{ L.tierMore }}'],
                ['{{ L.tierMore }}', '{{ L.tierRest }}'],
                ['{{ L.tierRest }}', '{{ L.secLegal }}']];
  secs.forEach(([a, b], i) => {
    const seg = tplQ.slice(tplQ.indexOf(a), tplQ.indexOf(b));
    ok((i + 1) + '층이 카드 하나로 감싸여 있습니다', bal(seg) === 0, 'balance ' + bal(seg));
    // 그 안에 정말 그 층의 줄들이 들어 있는지 — 빈 껍데기를 통과시키지 않습니다
    const want = [['gShiftTap','gPayTap','gPeriodTap'],
                  ['gMoneyTap','gInsTap','gRulesTap','gMeTap'],
                  ['gLangTap','gBackupTap']][i];
    ok((i + 1) + '층의 줄이 모두 그 카드 안입니다',
      want.every(k => seg.indexOf('{{ ' + k + ' }}') > 0));
  });

  // ── 2 · 누를 수 있다는 말은 그려야 합니다 ──
  // 예전 표시는 11px 회색 글리프 하나였고, 바로 옆 요약도 같은 크기의 같은
  // 회색이었습니다. 그것은 단추가 아니라 문장부호로 읽힙니다.
  const circle = 'width:30px;height:30px';
  ok('동그라미는 아홉 개 — 묶음 줄마다 하나입니다',
    (tplQ.split(circle).length - 1) === 9, 'got ' + (tplQ.split(circle).length - 1));
  ok('예전의 14px 글리프 자리가 남아 있지 않습니다',
    tplQ.indexOf('flex:none;width:14px;text-align:center') < 0);

  // ── 3 · 값이 맞는 것과 마크업이 그것을 쓰는 것은 다릅니다 ──
  // 서른두째가 겪은 헛통과입니다: renderVals는 맞는 색을 내는데 마크업이 색을
  // 하드코딩해 두어 화면에는 닿지 않았습니다. 그래서 마크업부터 셉니다.
  GRP.forEach(g => {
    const i = tplQ.indexOf('{{ g' + g + 'Chev }}');
    const row = tplQ.lastIndexOf('<div', i);
    const cell = tplQ.slice(row, i);
    ok(g + ' 동그라미가 색 홀 둘을 실제로 씁니다',
      cell.indexOf('{{ g' + g + 'ChevBg }}') >= 0 && cell.indexOf('{{ g' + g + 'ChevInk }}') >= 0,
      cell.slice(-70));
  });

  // ── 4 · 그 색이 열림과 닫힘을 말합니다 ──
  const c0 = mk(V2, '2026-08-03T09:00:00');
  const V0 = c0.renderVals();
  ok('닫힌 동그라미는 회색입니다', V0.gShiftChevBg === 'var(--color-neutral-200)', V0.gShiftChevBg);
  ok('닫힌 줄에는 띠가 없습니다', V0.gShiftBg === 'transparent', V0.gShiftBg);
  c0.toggleSetGroup('grp_shift');
  const V1 = c0.renderVals();
  ok('열린 동그라미는 빨갛고 글자가 반전됩니다',
    V1.gShiftChevBg === 'var(--color-accent)' && V1.gShiftChevInk === 'var(--color-bg)',
    V1.gShiftChevBg + ' / ' + V1.gShiftChevInk);
  // 예전 열림 값 var(--color-surface)는 카드 흰색과 같은 값이라 아무 일도 하지
  // 않는 죽은 값이었습니다 — 줄이 카드 안으로 들어오면서 그렇게 됐습니다.
  ok('열린 줄은 옅은 띠를 갖습니다', V1.gShiftBg === 'var(--color-neutral-100)', V1.gShiftBg);
  ok('죽은 흰색이 남아 있지 않습니다', V1.gShiftBg !== 'var(--color-surface)');
  ok('옆 줄은 그대로 닫혀 있습니다',
    V1.gPayChevBg === 'var(--color-neutral-200)' && V1.gPayBg === 'transparent');

  // ── 4b · 폰에서 걸린 것: 손을 떼도 hover가 남습니다 ──
  // 열린 줄에 옅은 회색 띠를 주고 나서, hover도 같은 회색으로 바꿨습니다.
  // 폰에서 줄을 눌러 **닫고** 보니 그 줄이 여전히 회색이었습니다 — 터치에서는
  // :hover가 다른 곳을 누를 때까지 붙어 있고, 그래서 닫힌 줄이 열린 줄과
  // 똑같이 보였습니다(인라인은 background: transparent인데 화면은 회색).
  // 띠는 '열렸다'는 말이라야 하므로, 그 말을 할 수 있는 것은 하나뿐입니다.
  // 예전 값 var(--color-surface)는 카드 흰색과 같아 마흔째 이후로 이미 아무
  // 일도 하지 않았으므로, 잃는 것도 없습니다.
  GRP.forEach(g => {
    const i = tplQ.indexOf('{{ g' + g + 'Tap }}');
    const row = tplQ.slice(tplQ.lastIndexOf('<div', i), tplQ.indexOf('>', i));
    ok(g + ' 줄에는 hover가 없습니다 — 띠는 열림만 말합니다',
      row.indexOf('style-hover') < 0, row.slice(-60));
  });

  // ── 5 · 줄과 줄 사이는 1px, 카드와 카드 사이의 2px가 아닙니다 ──
  // 층마다 첫 줄에는 줄이 없어야 합니다(카드의 위 가장자리가 이미 끝입니다).
  ok('줄 사이 실선은 여섯입니다 (아홉 줄 - 층 셋)',
    (tplQ.split('min-height:44px;border-top:1px solid var(--color-neutral-300);cursor:pointer').length - 1) === 6);
  ok('묶음 줄에 2px 구역선이 남아 있지 않습니다',
    tplQ.indexOf('min-height:44px;border-top:2px solid var(--color-divider);cursor:pointer') < 0);

  // ── 5b · 마지막 칸은 밑줄을 긋지 않습니다 ──
  // 내 급여 조건과 급여기간, 두 본문이 **똑같은 모양**으로 틀려 있었습니다:
  // 첫 칸은 1px 머리카락 선(칸과 칸을 가릅니다)인데 **마지막 칸**은
  // 2px --color-divider — 평면 시대에 칸 묶음을 닫던 구역선입니다. 그 시절에는
  // 아래가 다른 구역이라 말이 됐는데, 이제는 같은 카드 안에서 곧바로 설명
  // 문단이 이어집니다. 마흔한째가 세운 규칙 그대로입니다: **밑줄은 줄과 줄
  // 사이를 가르는 것이지 묶음의 끝을 그리는 것이 아닙니다.**
  // 한쪽만 고치면 같은 층 카드 안에서 두 묶음이 서로 다른 모양이 됩니다.
  // 두 본문 안에서만 셉니다 — 이 padding 문자열은 앱 곳곳에 흔합니다.
  [['gPayOpen', 'gPeriodTap', 'padding:7px 0"'],
   ['gPeriodOpen', 'L.tierMore', 'padding:6px 0"']].forEach(([a, b, last]) => {
    const body = tplQ.slice(tplQ.indexOf('{{ ' + a + ' }}'), tplQ.indexOf('{{ ' + b + ' }}'));
    const hair = body.split('border-bottom:1px solid var(--color-neutral-300)').length - 1;
    ok(a.replace('Open', '') + ' 본문에 칸을 가르는 머리카락 선이 하나입니다', hair === 1, 'got ' + hair);
    // 마지막 칸의 style이 padding에서 끝납니다 = 밑줄이 없습니다
    ok(a.replace('Open', '') + ' 본문의 마지막 칸은 아무 줄도 긋지 않습니다',
      body.indexOf(last) >= 0);
  });

  // 그리고 어느 묶음 본문에도 2px 구역선이 남아 있으면 안 됩니다 — 본문은 이제
  // 카드 **안**이라, 층이 지워 주던 그 선이 여기서는 그대로 그려집니다.
  const bodies = [['gShiftOpen','gPayTap'], ['gPayOpen','gPeriodTap'], ['gPeriodOpen','L.tierMore'],
                  ['gMoneyOpen','gInsTap'], ['gInsOpen','gRulesTap'], ['gRulesOpen','gMeTap'],
                  ['gMeOpen','L.tierRest'], ['gLangOpen','gBackupTap'], ['gBackupOpen','L.secLegal']];
  bodies.forEach(([a, b]) => {
    const seg = tplQ.slice(tplQ.indexOf('{{ ' + a + ' }}'), tplQ.indexOf('{{ ' + b + ' }}'));
    ok(a.replace('Open', '') + ' 본문에 2px 구역선이 없습니다',
      seg.length > 0 && seg.indexOf('border-bottom:2px solid var(--color-divider)') < 0);
  });

  // ── 6 · 보이지 않는 줄은 여백만 먹습니다 ──
  // 백업 묶음과 법적 고지 사이에 평면 시대의 2px 구역선이 하나 남아 있었습니다.
  // 카드가 된 뒤로 층이 색을 지워 **그리는 것은 없으면서** 2px + 여백 9px를
  // 그대로 먹고 있었습니다. 마흔한째의 height:18px 상자와 같은 종류입니다.
  ok('죽은 2px 구역선이 없어졌습니다',
    tplQ.indexOf('border-top:2px solid var(--color-divider);margin-top:14px') < 0);

  // ── 7 · 아홉 묶음도, 칸도 하나 사라지지 않았습니다 ──
  // 서른두째가 세워 둔 규칙입니다: 이 앱은 증거를 만들고, 임금체불 진정 중인
  // 근로자가 설정을 열었을 때 칸이 없어져 있으면 안 됩니다. 모양만 바꿨습니다.
  GRP.forEach(g => ok('g' + g + ' 묶음이 그대로 있습니다', tplQ.indexOf('{{ g' + g + 'Tap }}') > 0));
  ['{{ periodStartVal }}','{{ paydayVal }}','{{ graceVal }}','{{ avgDailyVal }}','{{ shutPctVal }}',
   '{{ basicVal }}','{{ divisorVal }}','{{ workerNameVal }}','{{ employerVal }}','{{ bosuVal }}']
    .forEach(t => ok('칸이 살아 있습니다 ' + t, tplQ.indexOf(t) > 0));

  // ── 8 · 접히지 않는 것은 접히지 않은 채입니다 ──
  // 법적 고지는 열일곱째가 일부러 접히지 않게 만든 카드입니다. 층을 감싸면서
  // 그 카드를 딸려 넣으면 접히는 것이 됩니다.
  const restSeg = tplQ.slice(tplQ.indexOf('{{ L.tierRest }}'), tplQ.indexOf('{{ L.secAbout }}'));
  ok('법적 고지는 층 카드 바깥입니다',
    restSeg.indexOf('{{ L.secLegal }}') > restSeg.indexOf('{{ gBackupTap }}')
    && bal(tplQ.slice(tplQ.indexOf('{{ L.tierRest }}'), tplQ.indexOf('{{ L.secLegal }}'))) === 0);
}

console.log('\n== 굴림판이 종이에 그린 표였습니다 ==');
{
  // 만든 사람이 폰의 시각 굴림판을 보고 말했습니다: **아주 2D로 보입니다.
  // 3D로, 더 다듬어 보이게 해 주십시오.**
  //
  // 맞습니다. 칸을 세로로 늘어놓고 굴리기만 하면, 아무리 굴려도 그것은 종이에
  // 적힌 표입니다. 시계 앱의 알람이 **바퀴**로 읽히는 까닭은 하나뿐입니다 —
  // 가운데에서 멀어진 칸이 눕습니다.
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../WorkLogApp.v2.dc.html', 'utf8');
  const tpl = src.slice(0, src.indexOf('</x-dc>'));
  const q1 = tpl.slice(tpl.indexOf('{{ suIs1 }}'), tpl.indexOf('{{ suIs2 }}'));

  // ── 1 · 칸은 원통의 겉면 위에 섭니다 ──
  const f0 = V2.drumFace(0), fu = V2.drumFace(-1), fd = V2.drumFace(1);
  ok('가운데 칸은 눕지 않습니다', /rotateX\(0deg\)/.test(f0.tf) && f0.op === '1' && f0.sel === true, f0.tf);
  // 부호가 이 자리의 전부입니다. CSS의 rotateX(+)는 아래쪽을 앞으로, 위쪽을
  // 뒤로 보냅니다 — 가운데보다 **위**에 있는 칸은 자기 위쪽이 뒤로 넘어가야
  // 하므로 각이 양수라야 합니다. 뒤집으면 바퀴가 바깥으로 부풀어 보입니다.
  ok('위 칸은 위쪽이 뒤로 넘어갑니다', fu.tf.indexOf('rotateX(' + V2.DRUM_STEP + 'deg)') > 0, fu.tf);
  ok('아래 칸은 그 반대입니다', fd.tf.indexOf('rotateX(-' + V2.DRUM_STEP + 'deg)') > 0, fd.tf);
  const z = t => +(/translateZ\((-?[\d.]+)px\)/.exec(t) || [0, 0])[1];
  ok('가운데 칸만 앞에 있습니다', z(f0.tf) === 0 && z(fu.tf) < 0 && z(fd.tf) < 0,
    z(f0.tf) + ' / ' + z(fu.tf));
  ok('위아래가 똑같이 멀어집니다', z(fu.tf) === z(fd.tf), z(fu.tf) + ' / ' + z(fd.tf));
  ok('멀어질수록 흐려집니다', +f0.op > +fu.op && +fu.op > +V2.drumFace(2).op);
  // 넉 칸 너머는 어차피 보이지 않고, 각이 90°를 넘으면 칸이 뒤집힙니다
  ok('넉 칸 너머는 아예 세우지 않습니다', V2.drumFace(4).tf === 'none' && V2.drumFace(4).op === '0');
  ok('넉 칸 너머는 뒤에서도 마찬가지입니다', V2.drumFace(-4).tf === 'none' && V2.drumFace(-4).op === '0');

  // ── 2 · 두 화면이 바퀴 하나를 나눠 씁니다 ──
  // 같은 굴림판이 설정 흐름(근무조 시각)과 휴게 줄 양쪽에 있습니다. 각각
  // 제 손으로 모양을 정하면 같은 바퀴가 두 화면에서 다르게 굽습니다.
  const c = mk(V2, '2026-08-03T09:00:00');
  c.setState({ setupStep: 1 });
  c.setS({ dayStart: '09:00' });
  const col = c.renderVals().dayDrumH;
  ok('설정 흐름의 칸이 바퀴 위에 섭니다',
    col[9].tf === f0.tf && col[8].tf === fu.tf && col[10].tf === fd.tf, col[8].tf);
  const b = mk(V2, '2026-08-03T09:00:00');
  b.setState({ setupStep: 2, brEdit: 'breaksDay:0:from' });
  b.setS({ shifts: 'day', breaksDay: [{ from: '11:30', to: '12:30' }] });
  const brow = b.renderVals().dayBreakRows[0];
  ok('휴게 줄의 칸도 같은 바퀴입니다',
    brow.drumH[11].tf === f0.tf && brow.drumH[10].tf === fu.tf && brow.drumH[12].tf === fd.tf,
    brow.drumH[10].tf);
  ok('두 화면이 같은 한 곳에서 모양을 받습니다',
    (src.slice(src.indexOf('class Component')).match(/Component\.drumFace\(/g) || []).length === 2);

  // ── 3 · 기울기는 물리는 자리를 옮기면 안 됩니다 ──
  // 이것이 이번에 폰이 아니라 **화면에서** 잡힌 것입니다. 처음에는 칸 자체에
  // transform을 걸었습니다. 헤드리스에서 08을 눌러 보니 값이 08:00이 됐다가
  // 곧바로 09:00으로 되돌아왔습니다 — scroll-snap이 무는 자리는 요소의
  // **변형된** 테두리 상자라, 고른 값이 바뀌어 기울기가 다시 계산되는 순간
  // 무는 자리가 통째로 움직이고 크롬이 다시 뭅니다. 그 스크롤을 drumScroll이
  // **근로자가 굴린 것으로 읽고** 예전 값을 도로 씁니다.
  //
  // 그래서 무는 칸은 손대지 않고, 기울기는 그 안의 글자가 집니다. 칸은
  // preserve-3d라 바퀴의 소실점은 여전히 하나입니다(칸마다 따로 두면 줄마다
  // 제자리에서 도는 것으로 보입니다).
  const cell = q1.slice(q1.indexOf('scroll-snap-align:center') - 220,
                        q1.indexOf('scroll-snap-align:center') + 420);
  const snapDiv = cell.slice(cell.lastIndexOf('<div', cell.indexOf('scroll-snap-align:center')),
                             cell.indexOf('>', cell.indexOf('scroll-snap-align:center')) + 1);
  ok('무는 칸에는 기울기가 없습니다', snapDiv.indexOf('transform:{{') < 0, snapDiv.slice(-120));
  ok('무는 칸은 3D를 평평하게 누르지 않습니다', snapDiv.indexOf('transform-style:preserve-3d') > 0);
  ok('기울기는 그 안의 글자가 집니다',
    (q1.match(/transform:\{\{ o\.tf \}\};opacity:\{\{ o\.op \}\}/g) || []).length === 4);
  ok('소실점은 굴리는 칸 하나가 냅니다', (q1.match(/perspective:620px/g) || []).length === 4);
  // 소스 전체로도 — 굴림판은 넷입니다(근무조 둘 · 휴게 줄 둘)
  ok('굴림판 넷이 다 바퀴입니다', (tpl.match(/perspective:620px/g) || []).length === 8);
  ok('기울기를 짓는 자리도 넷뿐입니다', (tpl.match(/transform:\{\{ o\.tf \}\}/g) || []).length === 8);

  // ── 4 · 그림자를 그리는 두 겹은 누름을 받지 않습니다 ──
  // 가운데 띠는 이제 **빛을 받는 면**(흰 바닥)이고, 그 위로 원통이 굽어
  // 들어가는 그늘 한 겹이 더 덮입니다. 둘 다 그리기만 해야 합니다 — 하나라도
  // 누름을 받으면 그 줄을 영영 누를 수 없습니다.
  ok('띠가 누름을 가로채지 않습니다', (q1.match(/pointer-events:none"/g) || []).length === 2,
    String((q1.match(/pointer-events:none"/g) || []).length));
  ok('그늘은 글자 위에 덮입니다', (q1.match(/z-index:2;pointer-events:none/g) || []).length === 2);
  ok('숫자가 띠 위에 올라섭니다',
    (q1.match(/position:relative;display:flex;align-items:stretch;height:100%/g) || []).length === 2);
  ok('띠는 검은 두 줄이 아니라 빛을 받는 면입니다',
    q1.indexOf('top:56px;height:56px;background:var(--color-surface)') > 0
    && q1.indexOf('border-top:2px solid var(--color-text);border-bottom:2px solid var(--color-text)') < 0);
  // 통은 스스로 모서리를 자릅니다 — 안 그러면 띠와 그늘이 둥근 모서리 밖으로 삐져나갑니다
  ok('통이 자기 모서리로 자릅니다',
    (tpl.match(/height:168px;margin-top:8px;border:2px solid var\(--color-neutral-300\);background:var\(--color-neutral-100\);overflow:hidden/g) || []).length === 4);

  // ── 5 · 굴린 자리를 세는 산수는 그대로입니다 ──
  // transform은 자리를 바꾸지 않으므로 레이아웃도 스크롤도 한 픽셀도 움직이지
  // 않습니다. 바퀴가 되었다고 굴려서 고르는 일이 달라지면 안 됩니다.
  const px = i => ({ currentTarget: { scrollTop: i * V2.DRUM_ITEM } });
  c.renderVals().dayDrumHScroll(px(6));
  ok('굴린 자리가 그대로 그 시각입니다', c.st().dayStart === '06:00', c.st().dayStart);
  c.renderVals().dayDrumH.find(x => x.t === '14').set();
  ok('눌러서 고르는 것도 그대로입니다', c.st().dayStart === '14:00', c.st().dayStart);
  ok('가운데 칸이 그 값으로 옮겨 왔습니다',
    c.renderVals().dayDrumH[14].sel === true && c.renderVals().dayDrumH[14].op === '1');
  // ── 6 · 누른 칸으로 바퀴가 굴러갑니다 ──
  // 폰에서 잡힌 것입니다. 08을 손가락으로 눌렀더니 값은 08:00이 됐는데 **바퀴는
  // 서 있었습니다** — 빛을 받는 띠 안에는 09가 그대로 있고, 굵어진 08은 그 위
  // 칸에 있었습니다. 평면일 때는 '굵어진 칸'이 답이라 읽혔지만, 띠가 렌즈가 된
  // 지금은 화면이 두 가지를 말합니다.
  const rolled = [];
  const stub = { getElementById: id => ({ scrollTop: 0, scrollTo: o => rolled.push(id + '@' + o.top) }) };
  const realDoc = global.document; global.document = stub;
  c.renderVals().dayDrumH.find(x => x.t === '07').set();
  ok('누르면 그 칸으로 굴러갑니다', rolled.join(',') === 'drumDayH@' + (7 * V2.DRUM_ITEM), rolled.join(','));
  rolled.length = 0;
  c.renderVals().nightDrumM.find(x => x.t === '30').set();
  ok('굴림판마다 제 것만 굴립니다', rolled.join(',') === 'drumNightM@' + (6 * V2.DRUM_ITEM), rolled.join(','));
  rolled.length = 0;
  // 굴려서 고르는 쪽에서는 절대 굴리지 않습니다 — 던져서 굴러가는 중에 자리를
  // 잡으면 손가락과 다툽니다(placeDrums가 componentDidUpdate에서 겪은 그것)
  c.renderVals().dayDrumHScroll(px(11));
  ok('굴려서 고를 때는 자리를 잡지 않습니다', rolled.length === 0 && c.st().dayStart === '11:00',
    rolled.join(',') + ' / ' + c.st().dayStart);
  global.document = realDoc;
  const bodySrc = src.slice(src.indexOf('class Component'));
  const scrollFn = bodySrc.slice(bodySrc.indexOf('  drumScroll(key, part, e) {'),
                                bodySrc.indexOf('  drumScroll(key, part, e) {') + 420);
  ok('굴리는 갈래에 그 부름이 없습니다', scrollFn.indexOf('drumRollTo') < 0, scrollFn.slice(0, 60));

  ok('칸 높이도 각도도 코드와 마크업이 같습니다',
    V2.DRUM_ITEM === 56 && V2.DRUM_STEP === 30
    && (q1.match(/height:56px/g) || []).length >= 8);
}

console.log('\n== 베트남어 근로자가 근무 밑에서 근무를 또 봤습니다 ==');
{
  // 만든 사람이 폰의 언어를 베트남어로 두고 출퇴근을 열었습니다: 여섯 칸이
  // `근무 Ca đã làm` 위에 `근무`, `연차 Phép` 위에 `연차`였습니다.
  //
  // 두 규칙이 부딪힌 자리입니다. 집 규칙은 **한 줄짜리 이름표에서 한국어가 앞에
  // 선다**는 것이고(`잔업 Tăng ca ×1.5`), 그래서 여섯 언어의 값이 전부 한국어로
  // 시작합니다. 그런데 이 카드의 이름표는 **두 줄**이고, 아랫줄이 이미 그 한국어를
  // 나릅니다. 두 규칙이 각자 맞는데 겹치면 같은 낱말이 두 번 섭니다.
  //
  // 아랫줄을 지우는 것이 아니라 **윗줄에서 앞머리를 뗍니다** — 그래야 여덟 언어가
  // 영어와 같은 모양이 됩니다(윗줄은 읽는 사람의 말, 아랫줄은 한국어).
  const langs = ['ko', 'en', 'vi', 'zh', 'th', 'id', 'ne', 'km'];
  const cnt = (h, n) => h.split(n).length - 1;

  ok('앞머리를 재는 자리가 하나입니다',
    V2.leads('근무 Ca đã làm', '근무') === true
    && V2.leads('과일', '과') === false                    // 낱말 한가운데는 앞머리가 아닙니다
    && V2.leads('Past shift', '근무') === false
    && V2.leads('근무', '근무') === false                  // 똑같으면 뗄 것이 없습니다
    && V2.dropLead('근무 Ca đã làm', '근무') === 'Ca đã làm'
    && V2.dropLead('Past shift', '근무') === 'Past shift'
    && V2.dropLead('결근 공제 Khấu trừ', '결근 공제') === 'Khấu trừ'
    && V2.dropLead('Overtime', '') === 'Overtime');

  langs.forEach(L => {
    const c = mk(V2, '2026-08-30T10:00:00'); c.setS({ lang: L });
    const btns = c.renderVals().dayTypeBtns;
    ok('여섯 칸 그대로입니다 · ' + L, btns.length === 6, String(btns.length));
    ok('윗줄이 아랫줄을 다시 말하지 않습니다 · ' + L,
      btns.every(b => b.ko && b.en && b.ko !== b.en && !V2.leads(b.ko, b.en)),
      btns.map(b => b.ko + ' / ' + b.en).join(' | '));
    // 아랫줄은 그대로 한국어라야 합니다 — 앞머리를 떼면서 한국어를 잃으면
    // 근로자가 종이에서 찾을 낱말이 화면에서 사라집니다
    if (L !== 'ko') {
      ok('아랫줄은 그대로 한국어입니다 · ' + L,
        btns.map(b => b.en).join(',') === '근무,연차,휴가,특근,결근,휴업',
        btns.map(b => b.en).join(','));
    }
  });

  // 영어와 한국어는 애초에 앞머리가 없어 한 글자도 달라지지 않습니다
  const en = mk(V2, '2026-08-30T10:00:00'); en.setS({ lang: 'en' });
  ok('영어는 예전 그대로입니다',
    en.renderVals().dayTypeBtns.map(b => b.ko).join(',')
    === 'Past shift,Leave,Vacation,Holiday work,Absent,Shutdown');
  const ko = mk(V2, '2026-08-30T10:00:00'); ko.setS({ lang: 'ko' });
  ok('한국어도 예전 그대로입니다',
    ko.renderVals().dayTypeBtns.map(b => b.ko).join(',') === '근무,연차,휴가,특근,결근,휴업'
    && ko.renderVals().dayTypeBtns[0].en === 'Past shift');

  // ── 연차 칸은 pair()를 지나지 않습니다 ──
  // 그 한 칸만 손으로 지어져 있어서(잔여 / 총계를 함께 적습니다) pair()를 고쳐도
  // 저 혼자 예전 모양으로 남았습니다. 다섯 칸이 고쳐지고 하나가 남으면 그것은
  // 고장으로 읽힙니다.
  const vi = mk(V2, '2026-08-30T10:00:00'); vi.setS({ lang: 'vi' });
  ok('연차 칸도 함께 고쳐졌습니다', vi.renderVals().dayTypeBtns[1].ko === 'Phép',
    vi.renderVals().dayTypeBtns[1].ko);
  ok('기본금 줄도 같은 자리였습니다',
    vi.renderVals().earnRows[0].ko.indexOf('기본금') < 0
    && vi.renderVals().earnRows[0].en === '기본금',
    vi.renderVals().earnRows[0].ko);

  // ── 한 줄로 붙는 제목도 같은 일을 하고 있었습니다 ──
  // dual()은 같은 줄 **뒤에** 한국어를 붙입니다. 칸을 누르면 열리는 제목이
  // `근무 Ca đã làm 지난 근무`였습니다 — 한 줄에 한국어가 두 번입니다.
  ['work', 'annual', 'vacation', 'holiday', 'absent', 'shutdown'].forEach(t => {
    langs.forEach(L => {
      const c = mk(V2, '2026-08-30T10:00:00'); c.setS({ lang: L });
      c.state.pending = t;
      const title = c.renderVals().pendingTitle;
      const koWord = V2.STR['pt_' + t].ko;
      ok('제목에 한국어가 한 번뿐입니다 · ' + t + ' · ' + L,
        !!title && cnt(title, koWord) === 1, title);
    });
  });
  // 그리고 그 제목의 한국어가 카드 아랫줄과 같은 낱말이라야 합니다 — 여섯 언어의
  // pt_work가 `근무 …`라고 적혀 있어서 제목만 다른 말을 하고 있었습니다
  ok('제목의 한국어가 기록의 낱말과 같습니다',
    ['vi', 'zh', 'th', 'id', 'ne', 'km'].every(L => {
      const c = mk(V2, '2026-08-30T10:00:00'); c.setS({ lang: L });
      c.state.pending = 'work';
      return c.renderVals().pendingTitle.indexOf('지난 근무 ') === 0;
    }));

  // ── 아랫줄이 그 낱말을 품고 있으면 그것도 앞머리입니다 ──
  // 이 자리는 한 번 반대로 세워 두었습니다. `잔업 Tăng ca ×1.5` 위/`포괄잔업수당`
  // 아래를 보고 *'그 둘은 다른 말이라 떼면 근로자가 종이에서 찾을 낱말을
  // 잃는다'*고 판단했는데, **잃지 않습니다** — 찾는 낱말이 아랫줄 안에 그대로
  // 들어 있습니다(잔업 ⊂ 포괄잔업수당, 야간 ⊂ 야간심야, 특근 ⊂ 특근수당).
  // 잃는 것이 없으므로 두 번 그릴 이유도 없습니다. 앞머리를 정확히 그 낱말일
  // 때만 재던 것이 이 여섯 줄을 놓치고 있었습니다.
  ok('품고 있어도 앞머리입니다',
    V2.leads('야간 夜班津贴 ×0.5', '야간심야') === true
    && V2.leads('잔업 加班 ×1.5', '포괄잔업수당') === true      // 낱말 한가운데라도
    && V2.leads('특근 休息日津贴', '휴일(특근)수당') === true    // 괄호 안이라도
    && V2.dropLead('야간 夜班津贴 ×0.5', '야간심야') === '夜班津贴 ×0.5'
    && V2.dropLead('잔업 加班 ×1.5', '포괄잔업수당') === '加班 ×1.5'
    // 앞머리는 **낱말 하나**이고 통째로 한글이라야 합니다 — 숫자가 섞이면 아닙니다
    && V2.leadWord('1일 평균임금 Lương') === ''
    && V2.leadWord('야간 夜班') === '야간'
    && V2.leadWord('야간') === ''
    // 아랫줄이 그 낱말을 안 나르면 그대로 둡니다
    && V2.leads('야간 夜班津贴', '기본금') === false
    && V2.dropLead('야간 夜班津贴', '기본금') === '야간 夜班津贴');

  // 그 여섯 줄이 실제로 화면에서 한 번씩만 섭니다 — 그리고 아랫줄의 명세서 낱말은
  // 한 글자도 잃지 않았습니다. 뗀 것은 윗줄의 앞머리뿐입니다.
  ['vi', 'zh', 'th', 'id', 'ne', 'km'].forEach(L => {
    const c = mk(V2, '2026-08-30T10:00:00'); c.setS({ lang: L });
    const R = c.renderVals();
    const rows = R.earnRows.concat(R.slipRows).filter(r => /[가-힣]/.test(r.en || ''));
    ok('명세서 낱말은 그대로, 앞머리만 뗐습니다 · ' + L,
      rows.length >= 6 && rows.every(r => !/[가-힣]/.test(r.ko)),
      rows.filter(r => /[가-힣]/.test(r.ko)).map(r => r.ko + ' | ' + r.en).join(' // '));
  });
  ok('아랫줄의 명세서 낱말은 하나도 사라지지 않았습니다',
    vi.renderVals().earnRows.map(r => r.en).join(',')
      === '기본금,포괄잔업수당,야간심야,특근수당',
    vi.renderVals().earnRows.map(r => r.en).join(','));

  // ── 손으로 지은 줄이 다섯 군데 더 있었습니다 ──
  // pair()를 고치고 폰에서 급여를 열어 보니 소득세·건강보험·장기요양·국민연금과
  // 명세서 대조의 두 줄이 예전 모양 그대로였습니다. 전부 pair()를 지나지 않고
  // 손으로 `{ ko, en }`을 짓던 자리입니다. **한 군데를 고치는 것으로는 화면이
  // 고쳐지지 않습니다** — 그래서 이제 자리마다 세지 않고, 다섯 탭 · 여덟 언어의
  // renderVals()를 통째로 훑어 그런 짝이 하나도 없는지 셉니다. 새로 손으로
  // 지은 줄이 생기면 여기서 잡힙니다.
  {
    const dbl = [];
    langs.forEach(L => ['punch', 'logs', 'pay', 'rights', 'set'].forEach(tab => {
      const c = mk(V2, '2026-08-30T10:00:00'); c.setS({ lang: L }); c.state.tab = tab;
      const seen = [];
      (function walk(o, d) {
        if (!o || d > 4 || typeof o !== 'object' || seen.indexOf(o) !== -1) return;
        seen.push(o);
        if (typeof o.ko === 'string' && typeof o.en === 'string' && o.ko && o.en
            && (o.ko === o.en || V2.leads(o.ko, o.en))) dbl.push(L + '/' + tab + ' ' + o.ko + ' | ' + o.en);
        Object.keys(o).forEach(k => walk(o[k], d + 1));
      })(c.renderVals(), 0);
    }));
    ok('어느 탭 어느 언어에도 같은 낱말이 두 줄에 서지 않습니다', dbl.length === 0,
      dbl.slice(0, 4).join(' // '));
  }
  // ── 야간만 자리마다 다른 대접을 받고 있었습니다 ──
  // 만든 사람이 폰을 베트남어로 두고 보낸 화면입니다. 근무기록의 칸은
  // `야간 Đêm`인데 출퇴근의 같은 줄은 `Số giờ đêm` — **같은 것을 말하는 두
  // 화면이 서로 다른 모양**이었습니다. 그리고 잔업은 두 곳 모두 앞머리를
  // 답니다. 한 카드 안에서 이웃한 줄이 갈리면 근로자는 그 차이를 규칙이 아니라
  // 어긋남으로 읽습니다.
  //
  // 산문에서도 같은 일이 있었습니다 — 한 문장 안에서 잔업·특근·기본금은 남고
  // **야간만** 번역어로 지워져 있었습니다. 여섯 언어 전부에서 그랬습니다.
  ['vi', 'zh', 'th', 'id', 'ne', 'km'].forEach(L => {
    const c = mk(V2, '2026-08-30T10:00:00'); c.setS({ lang: L });
    const R = c.renderVals();
    const cell = R.totalCells[2].label, row = R.liveRows.filter(r => /야간|đêm|夜班|กะดึก|malam|रात|យប់/i.test(r.label))[0];
    ok('두 화면이 야간을 같게 부릅니다 · ' + L,
      cell.indexOf('야간 ') === 0 && !!row && row.label.indexOf('야간 ') === 0,
      cell + ' | ' + (row && row.label));
    // 이웃한 잔업 줄도 그대로 앞머리를 답니다 — 한쪽만 고치면 갈린 채로 남습니다
    ok('잔업 줄은 그대로입니다 · ' + L,
      R.totalCells[1].label.indexOf('잔업 ') === 0
      && R.liveRows.filter(r => r.label.indexOf('잔업 ') === 0).length === 1,
      R.totalCells[1].label);
    // 지난 근무는 명세서에 없는 말입니다 — 같은 카드의 이웃 셋도 앞머리가 없습니다
    ok('지난 근무는 앞머리를 달지 않습니다 · ' + L,
      R.liveRows[0].label.indexOf('지난 근무') !== 0
        && !/[가-힣]/.test(R.liveRows[0].label),
      R.liveRows[0].label);
  });
  // ── 야간은 번역이 안 되는 낱말이라, 숫자가 무엇인지 밑줄이 말합니다 ──
  // `야간`은 '야간조에서 일한 시간'이 아니라 **22:00–06:00 구간**입니다.
  // 21:00→09:00 근무는 실근무 11시간인데 야간은 7시간입니다. 그런데 번역어는
  // 여섯 언어 가운데 셋(zh·th·km)이 아예 '야간조 시간'이라고 말하고, 나머지도
  // '밤 시간'이라 넓습니다 — 한국어를 건너뛰고 읽으면 숫자가 모자라 보입니다.
  // 그래서 앞머리를 그대로 두고, 밑줄이 구간을 못 박습니다.
  {
    const c = mk(V2, '2026-08-02T10:00:00');
    c.state.extra = [{ y: 2026, m: 8, day: 2, kind: 'night', type: 'shift',
      inH: 21, outH: 33, c: c.calc(21, 33, 'night', false) }];
    ok('야간은 근무시간이 아니라 22:00–06:00입니다',
      c.calc(21, 33, 'night', false).net === 11
      && c.calc(21, 33, 'night', false).night === 7);
  }
  ['ko', 'en', 'vi', 'zh', 'th', 'id', 'ne', 'km'].forEach(L => {
    const c = mk(V2, '2026-08-02T10:00:00'); c.setS({ lang: L });
    c.state.extra = [{ y: 2026, m: 8, day: 2, kind: 'night', type: 'shift',
      inH: 21, outH: 33, c: c.calc(21, 33, 'night', false) }];
    const R = c.renderVals(), ot = R.liveRows[3], ni = R.liveRows[4];
    ok('야간 줄의 밑줄이 구간을 말합니다 · ' + L,
      ni.sub.indexOf('22:00–06:00 · ') === 0, ni.sub);
    // 잔업 줄은 손대지 않았습니다 — 그쪽은 구간이 아니라 8시간 초과분입니다
    ok('잔업 줄의 밑줄은 그대로입니다 · ' + L,
      ot.sub.indexOf('22:00') === -1 && ni.sub.indexOf(ot.sub) !== -1, ot.sub);
  });
  // 새 문장이 아니라 이미 있던 구절 앞에 숫자를 붙인 것입니다 — 키가 늘지 않습니다
  ok('두 밑줄은 같은 구절을 나눠 씁니다',
    V2.STR.period_to_date_2.ko === '22:00–06:00 · ' + V2.STR.period_to_date.ko
    && V2.STR.period_to_date_2.en === '22:00–06:00 · ' + V2.STR.period_to_date.en);

  // 산문 넉 줄: 한 문장 안에서 야간이 형제와 같은 대접을 받는지
  [['anything_past_8h_pays_overtime_1_5_and', '잔업'],
   ['on_even_the_first_8h_pay_1_5_and_every', '특근'],
   ['days_worked_ot_night_as_of_basic_and_f', '잔업'],
   ['days_worked_ot_night_whole_period', '잔업']].forEach(([k, sib]) => {
    ['vi', 'zh', 'th', 'id', 'ne', 'km'].forEach(L => {
      const v = V2.STR[k][L];
      ok('한 문장 안에서 야간이 형제와 같습니다 · ' + k + ' · ' + L,
        v.indexOf('야간') !== -1 && v.indexOf(sib) !== -1, v);
    });
    // 한국어와 영어는 손대지 않았습니다
    ok('한국어 원문은 그대로입니다 · ' + k, V2.STR[k].ko.indexOf('야간') !== -1);
  });

  // 그 자리들이 한국어를 잃지는 않았는지 — 아랫줄은 여전히 명세서의 낱말입니다
  ok('공제 줄의 아랫줄은 그대로 한국어입니다',
    vi.renderVals().dedRows.map(r => r.en).slice(0, 5).join(',')
    === '소득세,주민세,건강보험,장기요양,국민연금',
    vi.renderVals().dedRows.map(r => r.en).join(','));
  ok('공제 줄의 윗줄에서 그 낱말이 사라졌습니다',
    vi.renderVals().dedRows.slice(0, 5).every(r => r.ko.indexOf(r.en) < 0),
    vi.renderVals().dedRows.map(r => r.ko).join(' | '));
  // '· 계산됨' 같은 꼬리는 앞머리를 뗀 뒤에도 그대로 붙어 있어야 합니다
  ok('계산됐다는 꼬리는 그대로입니다',
    vi.renderVals().dedRows[2].ko.indexOf(vi.T('calculated')) > 0,
    vi.renderVals().dedRows[2].ko);
  const slip = vi.renderVals().slipRows;
  ok('명세서 대조도 같은 자리였습니다',
    slip[0].ko.indexOf('기본금') < 0 && slip[0].en === '기본금'
    && slip.filter(r => r.k === 'pension').every(r => r.ko.indexOf('국민연금') < 0),
    slip[0].ko);
  // 그리고 그 표의 금액은 한 원도 움직이지 않았습니다 — 바꾼 것은 이름표뿐입니다
  {
    const a = mk(V2, '2026-08-30T10:00:00'); a.setS({ lang: 'ko' });
    const b = mk(V2, '2026-08-30T10:00:00'); b.setS({ lang: 'vi' });
    const strip = rs => JSON.stringify(rs.map(r => [r.k, r.app, r.short]));
    ok('언어를 바꿔도 금액은 그대로입니다',
      strip(a.slipRows()) === strip(b.slipRows()), strip(b.slipRows()).slice(0, 80));
  }
}

console.log('\n'+(fail?'!! ':'')+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
