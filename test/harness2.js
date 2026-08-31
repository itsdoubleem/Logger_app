const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.v2.dc.html'), 'utf8');
const m = src.match(/data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
if(!m) throw new Error('no script');
let code = m[1];

// stubs
// 탭 다섯 개가 함께 쓰는 스크롤 상자. scrollTabTop()이 여기를 0으로 되돌리고,
// 새 탭이 그려진 뒤 한 프레임 동안 display:none으로 두었다 되돌려 앞 탭의 타일을
// 버리게 합니다(repaintBox). offsetHeight를 읽는 순간의 display를 적어 두므로,
// '정말로 숨긴 채 레이아웃을 다시 쟀는가'를 시험이 확인할 수 있습니다.
const tabScroll = {
  scrollTop: 0, style: {}, seen: [],
  get offsetHeight() { this.seen.push(this.style.display); return 0; },
};
// 이 앱에서 rAF는 '새 탭이 그려진 뒤'라는 뜻입니다 — 곧 **나중**입니다. 곧바로
// 불러 버리면 '누름을 처리하는 그 자리에서 했는가'와 '한 프레임 뒤에 했는가'를
// 가릴 수 없습니다(느린 폰에서는 그 차이가 근로자의 스크롤을 빼앗습니다).
// 그래서 모아 두고, 시험이 필요할 때 flushRaf()로 흘려보냅니다.
const rafQueue = [];
global.requestAnimationFrame = fn => rafQueue.push(fn);
const flushRaf = () => { const q = rafQueue.splice(0); q.forEach(fn => fn()); return q.length; };
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
module.exports = { Component, tabScroll, flushRaf };
