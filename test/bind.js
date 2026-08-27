const fs=require('fs');
const {Component}=require('./harness2.js');
const src=fs.readFileSync(require('path').join(__dirname,'..','WorkLogApp.v2.dc.html'),'utf8');
const tpl=src.slice(src.indexOf('<x-dc>'), src.indexOf('</x-dc>'));
const c=new Component({}); c.base=new Date('2026-08-02T10:00:00'); c.t0=Date.now();
// give it data so list rows are populated
c.state.extra=[
 {y:2026,m:7,day:27,kind:'day',type:'shift',inH:9,outH:21,c:c.calc(9,21,'day',false)},
 {y:2026,m:8,day:1,kind:'day',type:'shift',holiday:true,inH:9,outH:22,c:c.calc(9,22,'day',true)},
 {y:2026,m:7,day:30,kind:'day',type:'absent',c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}},
 {y:2026,m:7,day:31,kind:'day',type:'shutdown',sentHome:true,c:{gross:0,bk:0,net:0,reg:0,ot:0,night:0,hol:0,pay:0}},
 {y:2026,m:7,day:29,kind:'day',type:'annual',c:{gross:0,bk:0,net:8,reg:8,ot:0,night:0,hol:0,pay:0}},
];
c.state.settings.allowances=[{name:'식대',en:'Meal',amount:200000,tf:true}];
c.state.pending='work'; c.state.pendingIso=new Date(2026,7,2).toISOString();
c.state.openDay=c.key(c.state.extra[1]);
const R=c.renderVals();

// collect scopes: top-level + L + every list item shape
const scopes=[R, R.L||{}];
const listKeys=Object.keys(R).filter(k=>Array.isArray(R[k]));
listKeys.forEach(k=>{ if(R[k][0] && typeof R[k][0]==='object') scopes.push(R[k][0]); });
// nested lists inside rows
listKeys.forEach(k=>(R[k]||[]).forEach(row=>{ if(row&&typeof row==='object')
  Object.keys(row).forEach(kk=>{ if(Array.isArray(row[kk])&&row[kk][0]&&typeof row[kk][0]==='object') scopes.push(row[kk][0]); });}));
scopes.push(R.rangeInfo||{}, {}); 

const names=new Set();
(tpl.match(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)||[]).forEach(m=>{
  names.add(m.replace(/[{}]/g,'').trim());
});
const known=new Set();
scopes.forEach(o=>Object.keys(o||{}).forEach(k=>known.add(k)));
// sc-for aliases
const aliases=new Set((tpl.match(/as="(\w+)"/g)||[]).map(x=>x.slice(4,-1)));
const missing=[];
names.forEach(n=>{
  const root=n.split('.')[0];
  if(aliases.has(root)) return;      // loop variable, resolved per-row
  if(known.has(root)) return;
  if(root==='L') return;
  missing.push(n);
});
console.log('template bindings:',names.size,'| unresolved:',missing.length);
if(missing.length) console.log(missing.join('\n'));

// also check L.* specifically
const Lmiss=[...names].filter(n=>n.startsWith('L.')&&!(n.slice(2) in (R.L||{})));
console.log('missing L labels:',Lmiss.length, Lmiss.join(', '));
