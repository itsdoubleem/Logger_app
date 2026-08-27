const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'WorkLogApp.dc.html'), 'utf8');
const m = src.match(/data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
if(!m) throw new Error('no script');
let code = m[1];

// stubs
global.window = { localStorage: { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} }, isSecureContext:false, crypto:{getRandomValues:a=>a} };
global.document = { createElement:()=>({style:{},click(){},remove(){}}), body:{appendChild(){},removeChild(){}} };
global.navigator = {};
class DCLogic {
  constructor(p){ this.props = p||{}; this.state={}; }
  setState(o){ Object.assign(this.state, typeof o==='function'?o(this.state):o); }
}
global.DCLogic = DCLogic;
const Component = eval(code + '; Component');
module.exports = { Component };
