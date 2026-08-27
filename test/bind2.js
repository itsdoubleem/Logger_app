const fs=require('fs');
const {Component}=require('./harness2.js');
const src=fs.readFileSync(require('path').join(__dirname,'..','WorkLogApp.v2.dc.html'),'utf8');
const tpl=src.slice(src.indexOf('<x-dc>'), src.indexOf('</x-dc>'));
const c=new Component({}); c.base=new Date('2026-08-02T10:00:00'); c.t0=Date.now();
c.state.extra=[
 {y:2026,m:7,day:27,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)},
 {y:2026,m:8,day:1,kind:'day',type:'shift',holiday:true,inH:9,outH:22,c:c.calc(9,22,'day',true)},
 {y:2026,m:7,day:30,kind:'day',type:'absent',c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}},
 {y:2026,m:7,day:31,kind:'day',type:'shutdown',sentHome:true,c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}},
];
// force a 52h breach so weekWarnRows is non-empty
[24,25,26,27,28,29].forEach(d=>c.state.extra.push({y:2026,m:8,day:d,kind:'day',type:'shift',inH:9,outH:22,c:c.calc(9,22,'day',false)}));
c.state.settings.allowances=[{name:'식대',en:'Meal',amount:200000,tf:true}];
c.state.settings.deductions=[{name:'기숙사비',en:'Dorm',amount:150000}];
c.state.pending='annual'; c.state.pendingIso=new Date(2026,7,3).toISOString(); c.state.pendingEndIso=new Date(2026,7,6).toISOString();
c.state.openDay=c.key(c.state.extra[1]);
const R=c.renderVals();

// parse sc-for blocks: list name -> alias -> fields used
const re=/<sc-for\s+list="\{\{\s*([\w.]+)\s*\}\}"\s+as="(\w+)"/g;
let m, report=[], bad=0;
const seen=new Set();
while((m=re.exec(tpl))){
  const [full,list,alias]=m;
  // find the block extent (to matching </sc-for>) — approximate by next </sc-for>
  const start=m.index;
  const end=tpl.indexOf('</sc-for>',start);
  const body=tpl.slice(start,end);
  const fields=new Set();
  (body.match(new RegExp('\\{\\{\\s*'+alias+'\\.(\\w+)','g'))||[])
    .forEach(x=>fields.add(x.split('.')[1]));
  (body.match(new RegExp('\\{\\{\\s*'+alias+'\\s*\\}\\}','g'))||[]).forEach(()=>fields.add('(self)'));
  // resolve list — a name like "c.bars" or "r.detail" is a nested list living on
  // a row of the enclosing sc-for, not on the top-level render object
  let arr;
  if(list.indexOf('.')>-1){
    const [rootAlias,field]=list.split('.');
    // find any row, anywhere, that carries this field as an array
    outer: for(const lk of Object.keys(R)){
      if(!Array.isArray(R[lk])) continue;
      for(const row of R[lk]){
        if(row&&typeof row==='object'&&Array.isArray(row[field])){ arr=row[field]; break outer; }
      }
    }
    if(!arr){ report.push(`  ${list}: nested list not found on any row`); bad++; continue; }
  } else {
    arr = R[list];
  }
  if(!Array.isArray(arr)){ report.push(`  ${list}: NOT AN ARRAY`); bad++; continue; }
  if(!arr.length){ report.push(`  ${list}: empty (fields ${[...fields].join(',')||'-'}) — not verified`); continue; }
  const row=arr[0];
  const miss=[...fields].filter(f=>f!=='(self)' && !(row&&typeof row==='object'&&f in row));
  if(miss.length){ report.push(`  ${list} as ${alias}: MISSING ${miss.join(', ')}`); bad++; }
  else report.push(`  ${list} as ${alias}: ok (${arr.length} rows)`);
}
console.log('sc-for blocks checked:\n'+report.join('\n'));
console.log('\nproblems:',bad);
