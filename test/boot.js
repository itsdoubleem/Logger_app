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

  // ── 모양 층 · 2026-08-30 ───────────────────────────────────────────────
  // 카드·모서리·그림자는 ds-tokens.css 아래의 스타일시트 한 벌이고, 여기도
  // 같은 자리에 인라인되므로 첫 페인트에 모양이 있습니다.
  ok('모양 층이 첫 페인트에 있습니다 — 카드 규칙과 모서리 값',
    /#tabScroll\s*>\s*div\s*>\s*div\s*\{/.test(head) && head.includes('--radius-lg:'));

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

// ══ 모양 층이 서 있는 단 하나의 사실 ══════════════════════════════════════
// 인라인 스타일 937개 가운데 border-radius도 box-shadow도 **하나도 없기**
// 때문에 스타일시트가 !important 없이 이깁니다. 소스에 하나라도 생기면 그
// 요소만 조용히 층 바깥으로 나갑니다 — 화면은 그냥 예전 모양이라 고장으로
// 보이지 않습니다. 그래서 세어 둡니다.
console.log('\n== 모양은 소스가 아니라 ds-tokens.css에 있습니다 ==');
{
  const src = fs.readFileSync(path.join(ROOT, 'WorkLogApp.v2.dc.html'), 'utf8');
  const tpl = src.split('class Component')[0];   // 템플릿 구간만
  ok('템플릿에 인라인 border-radius가 하나도 없습니다',
    !/border-radius/.test(tpl));
  ok('템플릿에 인라인 box-shadow가 하나도 없습니다',
    !/box-shadow/.test(tpl));

  const css = fs.readFileSync(path.join(ROOT, 'ds-tokens.css'), 'utf8');
  // React가 인라인 스타일을 다시 직렬화하므로 DOM의 속성값은 콜론 뒤에 공백이
  // 있습니다. 소스를 보고 `[style*="border:2px"]`라고 쓰면 아무것도 안 잡히고,
  // 안 잡히는 선택자는 오류를 내지 않습니다.
  const bad = (css.match(/\[style\*="[^"]*"\]/g) || [])
    .filter(sel => /:[^ "]/.test(sel));
  ok('속성 선택자가 정규화된 형태(콜론 뒤 공백)를 씁니다', bad.length === 0, bad.join(' '));

  // 층이 이기려면 이 파일이 head에 통째로 들어가야 하고, boot.js는 head를
  // `<` + `body`에서 자릅니다 — 그 글자가 파일에 있으면 뒤가 통째로 잘립니다.
  ok('토큰 파일에 head를 자르는 태그 이름이 없습니다',
    !css.includes('<' + 'body') && !css.includes('<' + 'head'));

  // 알약 일곱 개 — 근무기록의 배지 넷과 출퇴근 카드의 셋이 한 모양입니다.
  // 이 선택자가 놓치면 알약이 조용히 네모가 됩니다(실제로 한 번 그랬습니다).
  const chips = (src.match(/min-height:30px;display:inline-flex/g) || []).length;
  ok('알약이 일곱 개이고 층이 그 모양을 정합니다 (' + chips + '개)',
    chips === 7 && /\[style\*="min-height: 30px"\]\[style\*="display: inline-flex"\][^{]*\{[^}]*--radius-pill/.test(css));

  // 채워진 단추에는 테두리가 없어서 규칙 2가 닿지 않았습니다 — 옆에 나란히 선
  // 테두리 단추만 둥글고 확인·추가는 네모였습니다. 높이로 잡습니다: 소스가
  // 단추에 실제로 쓰는 여섯 높이입니다. 색으로 잡으면 조퇴 사유의 저장 단추가
  // 고른 것이 있을 때만 둥글어집니다.
  const BTN_H = [44, 46, 48, 50, 52, 56];
  const btnRule = (css.match(/\[style\*="cursor: pointer"\]\[style\*="min-height: \d+px"\][^{]*\{[^}]*\}/) || [''])[0];
  ok('단추 규칙이 여섯 높이를 모두 셉니다',
    BTN_H.every(h => btnRule.indexOf('min-height: ' + h + 'px') > 0)
    && /--radius-md/.test(btnRule), btnRule.slice(0, 60));
  // 소스의 단추 높이가 그 여섯 안에 있는지 — 새 높이를 쓰면 그것만 조용히 네모가 됩니다
  const heights = [...new Set((src.match(/cursor:pointer/g) ? src : '')
    .split('style="').slice(1)
    .filter(a => a.indexOf('cursor:pointer') >= 0 && a.indexOf('"') > 0)
    .map(a => a.slice(0, a.indexOf('"')))
    .filter(a => /background:(var\(--color-(accent|text)\)|\{\{)/.test(a))
    .map(a => (a.match(/min-height:(\d+)px/) || [0, 0])[1] * 1)
    .filter(h => h >= 44))];
  ok('채워진 단추의 높이가 모두 그 여섯 안에 있습니다 (' + heights.sort((a, b) => a - b).join(',') + ')',
    heights.every(h => BTN_H.indexOf(h) >= 0));
  // 30px 알약과 탭바는 이 규칙에 걸리지 않아야 합니다 — 걸리면 알약이 네모가 됩니다
  ok('알약 높이는 단추 목록에 없습니다', BTN_H.indexOf(30) < 0 && BTN_H.indexOf(34) < 0);

  // 근무기록 줄 머리의 26px 배지 — 테두리도 min-height도 없어 위 규칙이 하나도
  // 닿지 않았고, 둥근 카드 위에 마지막으로 남은 네모였습니다. #tabScroll로 좁힌
  // 이유는 환영 화면의 번호 배지가 같은 26px 상자이기 때문입니다 — 그것은 목록의
  // 배지가 아니라 문서의 번호라 그대로 두고, 탭 스크롤 상자 바깥에 있습니다.
  ok('근무기록 배지의 모서리를 층이 정합니다',
    /#tabScroll \[style\*="width: 26px"\]\[style\*="height: 26px"\][^{]*\{[^}]*--radius-sm/.test(css));
  const tiles = (src.split('width:26px;height:26px').length - 1);
  const scrollAt = src.indexOf('id="tabScroll"');
  const badgeAt = src.indexOf('width:26px;height:26px;flex:none');
  ok('26px 상자는 둘뿐입니다 (' + tiles + '개)', tiles === 2);
  ok('근무기록 배지는 #tabScroll 안이고 환영 화면의 번호는 바깥입니다',
    scrollAt > 0 && badgeAt > scrollAt
    && src.indexOf('flex:none;width:26px;height:26px') < scrollAt);

  // 급여기간 스테퍼 — 근무기록과 급여가 한 마크업을 나눠 씁니다(스무째). 한쪽만
  // 줄이면 다른 탭이 예전 크기로 남으므로 **둘 다** 셉니다.
  // 바깥 여백은 손대지 않았습니다 — 카드 층이 `margin`을 !important로 가져가므로
  // 인라인으로 적어 봐야 죽은 값입니다. 얇아진 것은 카드 **안쪽**입니다.
  ok('스테퍼가 두 탭에서 다 얇아졌습니다 (padding 11/12 → 5px 7px)',
    (src.split('border:2px solid var(--color-divider);padding:5px 7px').length - 1) === 2);
  ok('스테퍼의 예전 여백이 한 곳도 남아 있지 않습니다',
    !src.includes('padding:11px 12px 12px'));
  // 이름표는 지운 것이 아니라 가운데 칸으로 접어 넣었습니다 — 그 칸은 44px 화살표보다
  // 짧아서 줄 하나를 더 얹어도 카드가 높아지지 않습니다.
  ok('급여기간 이름표는 그대로 두 탭에 있습니다',
    (src.split('{{ L.payPeriodLbl }}').length - 1) === 2);
  // 화살표는 44px 그대로입니다 — 이 앱에서 누를 것의 바닥이고, 얇아진 것은
  // 카드이지 손가락이 닿는 자리가 아닙니다.
  ok('‹ › 는 여전히 44px입니다 (스테퍼 넷 + 달력 둘)',
    (src.split('min-height:44px;min-width:44px').length - 1) === 6);
  ok('층이 그 화살표를 동그랗게 만듭니다',
    /\[style\*="cursor: pointer"\]\[style\*="min-height: 44px; min-width: 44px"\][^{]*\{[^}]*--radius-pill/.test(css));
  // 규칙 2c(단추 12px)와 선택자 무게가 같으므로 **뒤에** 있어야 이깁니다.
  ok('그 규칙이 단추 규칙보다 뒤에 있습니다',
    css.indexOf('min-height: 44px; min-width: 44px') > css.indexOf('[style*="cursor: pointer"][style*="min-height: 56px"]'));
  ok('스테퍼 카드는 보통 카드보다 둥급니다 (--radius-xl)',
    /#tabScroll > div > div\[style\*="padding: 5px 7px"\][^{]*\{[^}]*--radius-xl/.test(css)
    && /--radius-xl:\s*20px/.test(css));
  ok('탭바는 min-height를 쓰지 않습니다',
    !/grid-template-columns:1fr 1fr 1fr 1fr 1fr[^>]*>[\s\S]{0,400}?min-height/.test(src));

  // 층은 카드의 위아래 테두리 색을 지웁니다 — 그것이 구역을 가르던 2px 줄이기
  // 때문입니다. 그런데 테두리를 **통째로** 두른 카드에도 그 규칙이 닿아서, 주
  // 52시간 경고가 왼쪽과 오른쪽만 빨갛고 위아래는 뚫린 채로 섰습니다. 둥근
  // 모서리가 남은 두 변을 이어 그리니 아래쪽에 빨간 갈고리가 둘 생겼습니다.
  // `:not([style*="border: "])`가 그 카드들을 빼 줍니다.
  ok('위아래 테두리를 지우는 규칙이 통째로 두른 카드를 뺍니다',
    /#tabScroll > div > div:not\(\[style\*="border: "\]\)[^{]*\{[^}]*border-top-color:\s*transparent[^}]*border-bottom-color:\s*transparent/.test(css));
  // 규칙 1의 맨몸 선택자에 그 선언이 남아 있으면 :not이 아무 일도 못 합니다 —
  // 두 규칙이 같은 속성을 다투고, 무게가 낮은 맨몸 쪽이 뒤에 있으면 이깁니다.
  ok('규칙 1의 맨몸 선택자는 그 색을 더 이상 지우지 않습니다',
    !/#tabScroll > div > div \{[^}]*border-(top|bottom)-color/.test(css));
  // 카드를 고르는 규칙 가운데 그 색을 지우는 것은 :not 하나뿐이어야 합니다.
  // (탭바·여섯 칸 타일·머리말도 같은 속성을 지우지만 그것들은 카드가 아닙니다.)
  // 카드 자신을 고르는 규칙만 셉니다 — `>`가 둘. 여섯 칸 타일의 규칙은
  // `… > div`가 하나 더 붙은 자식 선택자라 카드가 아니고, 그쪽은 타일마다
  // 하나씩인 하드 사각형을 지우는 다른 일을 합니다(규칙 4).
  const cardRules = (css.match(/#tabScroll > div > div[^{]*\{[^}]*\}/g) || [])
    .filter(r => (r.split('{')[0].match(/>/g) || []).length === 2)
    .filter(r => /border-(top|bottom)-color:\s*transparent/.test(r));
  ok('카드의 위아래 테두리를 지우는 규칙은 하나뿐이고 그것이 :not입니다',
    cardRules.length === 1 && cardRules[0].indexOf(':not([style*="border: "])') > 0,
    cardRules.length + ' rule(s)');
  // 구조용 회색 테두리는 여전히 네 변 모두 사라져야 합니다 — 그 규칙이
  // border-color 하나로 가져가므로 위 :not에서 빠져도 달라지지 않습니다.
  ok('회색 테두리 카드는 네 변 모두 그대로 투명합니다',
    /#tabScroll > div > div\[style\*="border: 2px solid var\(--color-divider\)"\][\s\S]{0,160}?border-color:\s*transparent\s*!important/.test(css));
  // 소스에 그런 카드가 실제로 몇 개인지 — 새로 만들면 이 수가 늘고, 그때
  // 위 규칙이 그것도 함께 지켜 주는지 눈으로 보게 됩니다.
  const framed = (src.match(/margin:\d+px 18px[^"]*;border:[23]px solid var\(--color-(accent|text)\)/g) || []).length;
  ok('통째로 두른 카드는 다섯입니다 (' + framed + '개)', framed === 5);

  // 근무기록의 누계 네 칸 — 마지막 줄의 밑줄과 오른쪽 칸의 오른줄이 카드의
  // 가장자리에 얹혀 카드의 끝을 두 번 그렸습니다. 색은 이제 홀입니다.
  ok('누계 네 칸의 줄 색이 마크업에 박혀 있지 않습니다',
    !/\{\{ totalCells \}\}[\s\S]{0,500}?border-bottom:1px solid var\(--color-neutral-300\)/.test(src));

  // 소스에서 바꾼 두 줄
  ok('머리말의 급여기간 칩은 검은 알약입니다',
    /padding:6px 11px;background:var\(--color-text\);color:var\(--color-bg\);font-weight:700">\{\{ monthChip \}\}/.test(src));
  ok('이미 출근했습니다 줄은 분홍 카드입니다',
    /openBackIn[^>]*background:var\(--color-accent-100\)/.test(src));
}

// ══ 카드 안의 여백은 margin이 아니라 padding입니다 ═══════════════════════
// 만든 사람이 내 권리와 설정을 열고 말했습니다: 글자가 잘려 있습니다.
// 셋 다 같은 모양이었습니다 — 평면 시대에 좌우 여백을 `margin:14px 18px 0`의
// 18px로 주고 글자를 그 안에 바로 담은 구역들입니다. 마흔째의 카드 층이
// margin을 !important로 통째로 가져가면서(구역마다 제각각이던 여백을 한
// 박자로 모으려고) 그 18px가 죽었고, 카드는 overflow:hidden이라 글자가
// 가장자리에서 **잘렸습니다**. 층이 margin을 소유하므로, 카드 안쪽의 여백은
// 그 카드가 padding으로 스스로 가져야 합니다.
console.log('\n== 카드 안의 여백은 padding입니다 ==');
{
  const src = fs.readFileSync(path.join(ROOT, 'WorkLogApp.v2.dc.html'), 'utf8');
  const tpl = src.split('class Component')[0];

  // 고친 셋
  ok('내 권리의 가리키는 한 줄이 스스로 여백을 갖습니다',
    /padding:12px 18px;text-wrap:pretty">\{\{ L\.rightsEvidence \}\}/.test(tpl));
  const tiers = (tpl.match(/border-top:2px solid var\(--color-divider\);padding:13px 18px 14px/g) || []).length;
  ok('설정의 법적 고지와 정보 카드가 좌우 여백을 갖습니다 (' + tiers + '개)', tiers === 2);
  // 되돌리면 여기서 걸립니다 — 예전 모양은 좌우가 0이었습니다
  ok('좌우가 0인 예전 모양이 남아 있지 않습니다',
    !/margin:14px 18px 0;border-top:2px solid var\(--color-divider\);padding:13px 0 0/.test(tpl));

  // 그리고 같은 함정을 다시 파지 않도록: 좌우 여백을 margin에 맡긴 채
  // padding의 좌우를 0으로 적어 둔 구역이 하나도 없어야 합니다.
  const hz = [];
  (tpl.match(/style="[^"]*"/g) || []).forEach(function (a) {
    const st = a.slice(7, -1);
    const m = /(?:^|;)\s*margin\s*:\s*([^;]+)/.exec(st);
    if (!m) return;
    const parts = m[1].trim().split(/\s+/);
    const mx = parts.length >= 2 ? parts[1] : parts[0];
    if (!/^18px$/.test(mx)) return;                 // 구역의 그 좌우 여백만
    const pd = /(?:^|;)\s*padding\s*:\s*([^;]+)/.exec(st);
    if (!pd) { hz.push(st); return; }               // 여백을 아예 안 적은 것
    const pp = pd[1].trim().split(/\s+/);
    const px = pp.length >= 2 ? pp[1] : pp[0];
    if (/^0(px)?$/.test(px)) hz.push('ZERO ' + st); // 좌우를 0으로 못 박은 것
  });
  ok('좌우 여백을 0으로 못 박은 구역이 없습니다',
    hz.filter(function (x) { return x.indexOf('ZERO ') === 0; }).length === 0,
    hz.filter(function (x) { return x.indexOf('ZERO ') === 0; }).join(' | '));
  // 여백을 안 적은 셋은 안쪽 줄이 저마다 padding을 갖고 있어서 괜찮습니다
  // (주 52시간 경고 둘 · 명세서 대조의 검은 띠). 넷째가 생기면 이 수가 늘고,
  // 그때 그 카드의 글자가 가장자리에 붙는지 눈으로 보게 됩니다.
  ok('여백을 스스로 적지 않은 구역은 셋뿐입니다 (' + hz.length + '개)', hz.length === 3);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
