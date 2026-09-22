const fs = require('fs');
// The frozen v1 app source, kept ONLY as a test fixture. v1 is no longer built
// or shipped -- it lives here so regress.js can keep proving that v2's wage
// engine returns exactly what v1 returned, and v1's numbers were checked
// against 7 real payslips. Do not wire this into a build. See test/fixtures/.
const src = fs.readFileSync(require('path').join(__dirname, 'fixtures', 'v1-engine.dc.html'), 'utf8');
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
