// 켤 때 앱보다 먼저 보이는 화면이 있으면 안 됩니다.
//
// 지운 데이터로 앱을 처음 열면 환영 화면이 뜨기 전에 다른 페이지가 한 번
// 스쳤습니다. 부팅을 화면 녹화로 잡아 보니(헤드리스, CPU 8배 느리게) 앱이
// 아닌 화면이 셋이었습니다 — 번들러의 크림색 섬네일, 흰 화면, 그리고
// **디자인 토큰 없이 그려진 앱**. 셋째가 알맹이입니다: `--color-bg`가 아직
// 없으면 `background:var(--color-bg)`는 '기본 배경'이 아니라 **무효**라
// 투명해지고, 환영 화면은 출퇴근 탭 위에 덮인 전면 오버레이이므로 그 한
// 프레임 동안 두 화면이 겹쳐 보입니다.
//
// 여기서 재는 것은 앱의 로직이 아니라 **build.py가 내놓은 페이지**라서
// regress.js가 아니라 따로 있고, run.sh에서 빌드 다음에 돕니다.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { (c ? pass++ : fail++); console.log((c ? '  PASS  ' : '! FAIL  ') + n + (extra ? '  ' + extra : '')); };

for (const dist of ['dist', 'dist-v2']) {
  const idx = path.join(ROOT, dist, 'index.html');
  if (!fs.existsSync(idx)) { ok(dist + '/index.html 이 있습니다', false, '먼저 build.py를 도십시오'); continue; }
  const built = fs.readFileSync(idx, 'utf8');

  console.log('\n== ' + dist + ' · 앱보다 먼저 보이는 화면 ==');

  // ── 셋째 프레임: 토큰이 첫 페인트에 있어야 합니다 ──────────────────────
  const m = built.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  ok('로더가 갈아 끼우는 템플릿을 찾았습니다', !!m);
  if (!m) continue;
  const template = JSON.parse(m[1]);
  const head = template.split('<body')[0];

  ok('토큰이 <head>에 있습니다 — 링크가 아니라 파싱되는 자리',
    head.includes('--color-bg:') && head.includes('--color-text:'));
  ok('환영 화면이 쓰는 --color-bg 값이 실제 토큰과 같습니다',
    /--color-bg:\s*#f3f2f2/.test(head));
  // 토큰이 <body> 뒤에 있으면 앱이 먼저 그려지고 나서 색이 붙습니다 —
  // 겹쳐 보이던 그 프레임이 그대로 돌아옵니다.
  ok('토큰이 앱 마크업보다 앞섭니다',
    head.indexOf('--color-bg:') < template.indexOf('<body'));

  // 헬멧의 _ds 링크는 그대로 남아 있어야 합니다 — 인라인은 그것을 대신하는
  // 것이 아니라 한 프레임 먼저 도착하는 것뿐이고, 둘은 같은 빌드에서 같은
  // ds-tokens.css로 만들어집니다.
  const tokens = fs.readFileSync(path.join(ROOT, 'ds-tokens.css'), 'utf8');
  const vars = (tokens.match(/^\s*--[a-z0-9-]+:/gm) || []).map(s => s.trim());
  ok('ds-tokens.css의 변수가 하나도 빠짐없이 인라인됐습니다 (' + vars.length + '개)',
    vars.length >= 15 && vars.every(v => head.includes(v)));
  // 스물여덟째의 교훈 — 정규식이 아무것도 못 찾으면 every()는 조용히
  // 통과합니다. 몇 개를 셌는지 위 이름에 찍어 두고 개수부터 봅니다.

  // ── 둘째 프레임: 문서를 갈아 끼운 직후의 흰 화면 ───────────────────────
  ok('갈아 끼운 문서의 html/body가 곧바로 앱 바탕색입니다',
    /html,\s*body\s*\{[^}]*background:\s*var\(--color-bg\)/.test(head));

  // ── 첫째 프레임: 번들러 자신의 화면 ────────────────────────────────────
  const loaderHead = built.split('</head>')[0];
  ok('로더 화면도 앱 바탕색입니다 (크림색 #faf9f5 아님)',
    /body\s*\{\s*background:\s*#f3f2f2/.test(loaderHead));
  ok('번들러 섬네일은 그려지지 않습니다',
    /#__bundler_thumbnail\s*\{\s*display:\s*none/.test(loaderHead));
  // 진행 표시는 지우지 않고 늦춥니다 — setStatus()가 풀기 실패를 적는 유일한
  // 자리입니다. 없애면 실패가 조용해집니다.
  ok('진행 표시는 지운 것이 아니라 늦춘 것입니다',
    /#__bundler_loading\s*\{[^}]*animation:\s*__bundler_late/.test(loaderHead)
    && built.includes("setStatus('Error unpacking: '"));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
