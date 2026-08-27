const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
const m = src.match(/data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
if(!m) throw new Error('no script');
let code = m[1];

// stubs
// 탭 다섯 개가 함께 쓰는 스크롤 상자. scrollTabTop()이 여기를 0으로 되돌립니다.
const tabScroll = { scrollTop: 0 };
global.window = { localStorage: { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} }, isSecureContext:false, crypto:{getRandomValues:a=>a} };
global.document = { createElement:()=>({style:{},click(){},remove(){}}), body:{appendChild(){},removeChild(){}},
                    getElementById:id=>(id==='tabScroll'?tabScroll:null) };
global.navigator = {};
class DCLogic {
  constructor(p){ this.props = p||{}; this.state={}; }
  setState(o){ Object.assign(this.state, typeof o==='function'?o(this.state):o); }
}
global.DCLogic = DCLogic;
const Component = eval(code + '; Component');
module.exports = { Component, tabScroll };
