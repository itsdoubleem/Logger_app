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

for (const dist of ['dist-v2']) {
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

  // ── 상태 표시줄 밑 ─────────────────────────────────────────────────────
  // 이 앱은 가장자리까지 그립니다. 그래서 뿌리도 전면 오버레이도
  // `env(safe-area-inset-*)`로 시계와 제스처 바를 피하는데, **그 값은
  // viewport-fit=cover일 때만 0이 아닙니다.** 이것이 빠지면 여백이 전부
  // 0으로 계산되어 화면이 조용히 예전으로 돌아갑니다 — 오류는 나지 않습니다.
  // 여기서 세는 것은 **셸이 들고 있는 한 벌**입니다(앱 소스의 helmet은
  // gzip 자산 안이라 이 파일에서는 보이지 않고, 그쪽은 regress가 셉니다).
  ok('갈아 끼운 문서가 viewport-fit=cover를 답니다',
    (template.match(/viewport-fit=cover/g) || []).length === 1);

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

  // ON SHIFT 앞의 점은 앱이 '지금 근무중'이라고 말하는 유일한 자리인데 9px
  // 네모라 옆의 문장부호와 같은 무게였습니다. 규칙 8이 그것을 켜진 등으로
  // 바꿉니다 — 선택자는 그 요소의 크기 자체이므로, 소스에 9px 사각형이 하나
  // 더 생기면 엉뚱한 것이 빛나고 아무도 오류를 보지 못합니다.
  // 점은 둘입니다 — 출퇴근 카드의 9px와 근무기록 진행 중인 줄의 4px. 크기가
  // 다른 것은 옆에 선 글자가 다르기 때문이고(13px 자간 vs 12px 본문), 같은
  // 사실을 말하므로 층이 둘 다 이름을 불러야 합니다. 크기가 층이 이 점들을
  // 붙잡고 있는 손잡이라, 크기를 바꾸면 조용히 규칙 바깥으로 나갑니다.
  ok('점이 앱에 둘뿐이고 둘 다 근무중을 말합니다',
    (src.match(/width:9px;height:9px;flex:none;[^"]*background:\{\{ padIconInk \}\}/g) || []).length === 1
    && (src.match(/width:4px;height:4px;[^"]*background:\{\{ r\.liveInk \}\}/g) || []).length === 1
    && (src.match(/width:9px/g) || []).length === 1
    && (src.match(/width:4px/g) || []).length === 1);
  ok('층이 두 크기를 다 부르고, 저마다 제 후광을 씁니다',
    /\[style\*="width: 4px"\]\[style\*="height: 4px"\] \{[^}]*--radius-pill[^}]*animation: onshift-lamp-sm/.test(css.replace(/\n/g, ' '))
    && /@keyframes onshift-lamp-sm/.test(css));
  // 이 한 줄이 세 번 어긋났고, 셋 다 화면은 조용했습니다.
  //  1) 등을 flex 형제로 칸 안에 세움 → 등이 칸의 폭을 먹어 이 줄의 글자만
  //     11px 오른쪽에서 시작(점 4 + gap 7).
  //  2) 음수 margin으로 여백에 걺 → 글자 칸은 맞았지만 접힌 둘째 줄이 등이
  //     아니라 'ON SHIFT' 밑에 섬.
  //  3) 등을 글줄 안(inline-block)에 넣음 → 접힌 줄은 등 밑에 왔지만, 이번에는
  //     'ON SHIFT'가 등만큼 밀려 아래 줄들의 글자와 어긋남.
  // 답은 **매다는 들여쓰기**입니다. 등은 글줄의 첫 글자이고, 첫 줄만 등의 폭
  // 만큼 왼쪽으로 내밉니다: 글자는 아래 줄들과 같은 자리에서 시작하고 등은
  // 그 왼쪽 여백에 걸립니다. 셋의 합이 0이어야 하고, 하나만 바꾸면 글자 칸이
  // 조용히 다시 어긋납니다.
  {
    const dot = (src.match(/<span style="display:inline-block;width:(\d+)px;height:\d+px;margin-right:(\d+)px;vertical-align:2px;background:\{\{ r\.liveInk \}\}/) || []);
    const w = parseFloat(dot[1]), mr = parseFloat(dot[2]);
    ok('등이 글줄 안에 서 있습니다 (inline-block)', dot.length > 0);
    ok('첫 줄이 등의 폭만큼 내밀립니다 (' + w + ' + ' + mr + ' + -8 = ' + (w + mr - 8) + ')',
      w + mr - 8 === 0 && /text-indent:\{\{ r\.ioIndent \}\}/.test(src)
      && /ioIndent: '-8px'/.test(src));
    // 등이 없는 줄까지 내밀리면 아래 줄들이 다 어긋납니다
    ok('등이 없는 줄은 내밀지 않습니다', /r\.ioIndent = '0'/.test(src));
    // 그리고 글자 칸은 flex가 아니라 그냥 글줄입니다 — 접힘이 여기서 나옵니다
    ok('글자 칸이 평범한 글줄입니다', !/display:flex;align-items:flex-start;gap:\d+px;font-variant-numeric/.test(src));
  }

  // 작은 점에 큰 후광을 그대로 물려주면, 점만 줄고 빛은 그대로라 오히려 커
  // 보입니다 — 만든 사람이 폰에서 그것을 짚었습니다. 후광도 함께 작아야 합니다.
  {
    const big = (css.match(/@keyframes onshift-lamp \{[\s\S]*?\n\}/) || [''])[0];
    const sm  = (css.match(/@keyframes onshift-lamp-sm \{[\s\S]*?\n\}/) || [''])[0];
    const max = t => Math.max(...(t.match(/0 0 0 ([\d.]+)px/g) || ['0 0 0 0px']).map(x => parseFloat(x.slice(6))));
    ok('작은 등의 후광이 큰 등보다 작습니다 (' + max(sm) + ' < ' + max(big) + ')', max(sm) < max(big));
  }
  ok('층이 그 점을 동그란 등으로 만듭니다',
    /\[style\*="width: 9px"\]\[style\*="height: 9px"\][^{]*\{[^}]*--radius-pill[^}]*box-shadow[^}]*animation: onshift-lamp/.test(css.replace(/\n/g, ' '))
    && /@keyframes onshift-lamp/.test(css));
  // flex는 선택자에 넣지 않습니다. React는 짧은 표기를 다시 띄어 쓰는 것이
  // 아니라 펼칩니다 — 소스의 `flex:none`이 DOM에서는 `flex: 0 0 auto`입니다.
  // 한 번 넣었더니 아무것도 안 잡혀서 점이 그대로 네모였고, 오류는 없었습니다.
  ok('점 선택자가 flex를 짚지 않습니다',
    !/\[style\*="width: 9px"\][^{]*flex: none/.test(css));
  // 손가락을 대고 있는 동안 padIconInk가 페이지 회색으로 뒤집히므로, 후광이
  // 초록 리터럴이면 회색 점 둘레에 초록 고리만 남습니다. currentColor여야 합니다.
  const lamp = (css.match(/@keyframes onshift-lamp[\s\S]*?\n\}/) || [''])[0];
  ok('후광이 currentColor를 따라갑니다',
    lamp.includes('currentColor') && !/rgba?\(|#[0-9a-f]{3}|oklch/i.test(lamp));
  // 흰 카드 위에서는 흐린 그림자가 빛이 아니라 때로 읽힙니다 — 처음 판이 그래서
  // 물러났습니다. 후광은 흐림 0에 단단한 테두리 셋으로 그립니다.
  ok('후광에 흐림이 없습니다',
    (lamp.match(/0 0 0 /g) || []).length === 6
    && !/box-shadow:[^;]*\d+px \d+px/.test(lamp));

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

  // 26px 배지 둘 — 근무기록 줄머리의 해·달과 환영 화면 카드의 번호. 테두리도
  // min-height도 없어 위 규칙이 하나도 닿지 않았고, 둥근 카드 위에 마지막으로
  // 남은 네모였습니다. 처음에는 #tabScroll로 좁혀 근무기록 쪽만 둥글게 했는데,
  // 갓 깐 폰의 첫 화면이 바로 그 번호 넷이라 만든 사람이 그것을 보고 말했습니다.
  // 이제 선택자에 #tabScroll이 없고 둘 다 9px입니다 — 그 조각이 되살아나면
  // 환영 화면만 조용히 네모로 돌아가는데, 모양이 안 붙는 것은 오류를 내지
  // 않습니다(마흔째). 그래서 없다는 것을 따로 셉니다.
  const badgeRule = (css.match(/^[^\n]*\[style\*="width: 26px"\]\[style\*="height: 26px"\][^\n]*$/m) || [''])[0];
  ok('26px 배지의 모서리를 층이 정합니다', /--radius-sm/.test(badgeRule));
  ok('그 규칙은 #tabScroll로 좁혀져 있지 않습니다', badgeRule.indexOf('#tabScroll') < 0);
  const tiles = (src.split('width:26px;height:26px').length - 1);
  const scrollAt = src.indexOf('id="tabScroll"');
  const badgeAt = src.indexOf('width:26px;height:26px;flex:none');
  ok('26px 상자는 둘뿐입니다 (' + tiles + '개)', tiles === 2);
  ok('하나는 #tabScroll 안, 하나는 환영 화면이라 바깥입니다',
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
  ok('‹ › 는 여전히 44px입니다 (스테퍼 넷 + 달력 둘 + 설정 흐름의 칩 둘)',
    (src.split('min-height:44px;min-width:44px').length - 1) === 8);
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

// ══ 설정 · 카드가 '누를 수 있다'는 뜻을 잃었습니다 ═════════════════════════
// 마흔째의 층은 탭 안의 top-level 블록을 **전부** 같은 흰 카드로 만듭니다.
// 설정에서는 그것이 열여덟 개였고, 아홉은 눌러서 열리고 아홉은 열리지 않는데
// 상자가 똑같아 가를 길이 없었습니다. 모양이 뜻을 나르지 않으면 문법이
// 없는 것과 같습니다. 셋으로 갈랐고, 그 셋을 여기서 셉니다.
console.log('\n== 설정 · 열리는 것과 열리지 않는 것 ==');
{
  const css = fs.readFileSync(path.join(ROOT, 'ds-tokens.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'WorkLogApp.v2.dc.html'), 'utf8');
  const tpl = src.split('class Component')[0];
  const built = fs.readFileSync(path.join(ROOT, 'dist-v2', 'index.html'), 'utf8');
  // 첫 페인트의 head는 로더가 갈아 끼우는 템플릿 **안**에 있습니다 — 파일을
  // 그냥 <body로 자르면 번들러 셸의 head(1.8KB)를 보게 됩니다.
  const tm = built.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  const head = tm ? JSON.parse(tm[1]).split('<body')[0] : '';

  // ── 1 · 층의 이름표는 카드가 아닙니다 ──
  // 다음 카드의 머리말이지 그 자체로 하나의 물건이 아니라, 바닥에 놓입니다 —
  // 이 화면에서 상자에 들어 있지 않은 유일한 것입니다.
  const tierRule = (css.match(/#tabScroll > div > div\[style\*="padding: 0px 18px 7px"\]\s*\{[^}]*\}/) || [''])[0];
  ok('층의 이름표는 카드가 아닙니다 — 바탕도 그림자도 모서리도 없습니다',
    /background:\s*none/.test(tierRule) && /box-shadow:\s*none/.test(tierRule)
    && /border-radius:\s*0/.test(tierRule), tierRule.slice(0, 70));
  // margin은 층이 !important로 가져간 속성이라 되찾으려면 같은 무게가 필요합니다
  ok('그 이름표의 여백이 층의 !important를 이깁니다',
    /margin:[^;]*!important/.test(tierRule));
  // 소스에 그런 이름표가 정말 셋인지 — 넷째가 생기면 이 수가 늘고, 그때 그것도
  // 바닥에 놓이는지 눈으로 보게 됩니다
  ok('바닥에 놓인 이름표는 셋입니다 (' + (tpl.split('padding:0 18px 7px').length - 1) + '개)',
    (tpl.split('padding:0 18px 7px').length - 1) === 3);
  // 층이 첫 페인트에 있어야 이름표가 한 프레임 동안 카드로 번쩍이지 않습니다
  ok('그 규칙도 첫 페인트에 있습니다', head.indexOf('padding: 0px 18px 7px') > 0);

  // ── 2 · 동그라미는 그린 단추입니다 ──
  // 30×30은 소스에 이 열 개뿐입니다 — 묶음 줄 아홉과 조퇴 사유 시트 하나.
  // 26px 근무기록 배지(2d)도, min-height 30px 알약(2b)도 이 선택자에
  // 걸리지 않습니다.
  //
  // 선택자에서 `#tabScroll`이 빠졌습니다(쉰아홉째). 사유 시트는 탭 스크롤
  // 상자 **바깥**의 오버레이라, 좁혀 둔 채로 같은 동그라미를 붙이면 그것만
  // 조용히 네모로 남습니다 — 쉰세째가 26px 번호에서 겪은 그 자리입니다.
  const circleRule = (css.match(/^[^\n]*\[style\*="width: 30px"\]\[style\*="height: 30px"\][^\n]*$/m) || [''])[0];
  ok('층이 동그라미의 모양을 정합니다', /--radius-pill/.test(circleRule), circleRule.slice(0, 60));
  ok('그 규칙에 #tabScroll이 없습니다', circleRule.indexOf('#tabScroll') < 0);
  const circles = (src.match(/width:30px;height:30px/g) || []).length;
  ok('30px 상자는 열뿐입니다 (' + circles + '개)', circles === 10);
  // 그 열째가 사유 시트의 것입니다 — 색은 홀이고 마크업에 박혀 있지 않습니다
  ok('사유 시트의 동그라미도 색이 홀입니다',
    /background:\{\{ rsnChevBg \}\};color:\{\{ rsnChevInk \}\}/.test(src));
  ok('그 시트에 인라인 모서리가 없습니다',
    src.slice(src.indexOf('{{ earlySheet }}'),
              src.indexOf('grid-template-columns:1fr 1fr 1fr 1fr 1fr')).indexOf('border-radius') < 0);
  // 모양은 층이, 색은 setGroupVals가 — 인라인에 모서리를 적으면 그 요소만
  // 조용히 층 바깥으로 나갑니다(마흔째)
  ok('동그라미의 색은 홀이고 마크업에 박혀 있지 않습니다',
    (src.match(/background:\{\{ g\w+ChevBg \}\};color:\{\{ g\w+ChevInk \}\}/g) || []).length === 9);

  // ── 3 · 묶음 줄은 줄이지 단추가 아닙니다 ──
  // 규칙 2c는 '누를 수 있고 44px 이상'인 것을 둥글게 합니다. 홀로 선 단추에는
  // 맞고, 같은 것이 카드 **안의 한 줄**이 되는 순간 틀립니다: 줄마다 12px
  // 모서리가 생겨 줄 사이의 1px 실선이 그 곡선을 따라 양끝에서 안으로
  // 휘었고, 세 줄을 담은 카드 하나가 카드 셋을 쌓아 둔 것으로 읽혔습니다.
  // 마흔두째와 같은 잘못입니다 — 가르는 선을 두르는 선처럼 그린 것.
  const rowRule = (css.match(/#tabScroll \[style\*="cursor: pointer"\]\[style\*="min-height: 44px"\]\[style\*="padding: 13px 18px"\]\s*\{[^}]*\}/) || [''])[0];
  ok('층이 묶음 줄의 모서리를 다시 네모로 만듭니다', /border-radius:\s*0/.test(rowRule), rowRule.slice(0, 60));
  // 속성 셋이라 2c(둘)를 무게로 이깁니다 — 그래도 뒤에 있는지 함께 봅니다
  const btnAt = css.indexOf('[style*="cursor: pointer"][style*="min-height: 44px"],');
  ok('그 규칙이 단추 규칙보다 뒤에 있습니다', rowRule && css.indexOf(rowRule) > btnAt && btnAt > 0);
  const rows = (src.match(/padding:13px 18px;min-height:44px/g) || []).length;
  ok('그 선택자가 가리키는 줄은 아홉뿐입니다 (' + rows + '개)', rows === 9);

  // ── 4 · 정규화된 형태로 적었는지 ──
  // 소스는 `padding:0 18px 7px`인데 React는 `padding: 0px 18px 7px`로 다시
  // 씁니다. 소스를 보고 선택자를 쓰면 아무것도 안 잡히는데, 화면은 그냥 예전
  // 모양이라 고장으로 보이지 않습니다(마흔째).
  ok('설정의 새 선택자들이 정규화된 값을 씁니다',
    css.indexOf('"padding: 0px 18px 7px"') > 0 && css.indexOf('"padding: 13px 18px"') > 0
    && css.indexOf('"padding:0 18px 7px"') < 0);
}

// 굴림판이 바퀴로 읽히려면 두 가지가 필요하고, 소스는 그 둘을 말할 수 없습니다 —
// border-radius도 box-shadow도 소스에 0개라는 것이 마흔째의 층이 서 있는 근거이고,
// 그 둘이 여기서 하는 일이 통을 파묻고 띠를 들어 올리는 것입니다.
console.log('\n== 굴림판은 파묻힌 통이고 띠는 그 위에 뜹니다 ==');
{
  const css = fs.readFileSync(path.join(ROOT, 'ds-tokens.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'WorkLogApp.v2.dc.html'), 'utf8');
  const tpl = src.split('class Component')[0];
  const built = fs.readFileSync(path.join(ROOT, 'dist-v2', 'index.html'), 'utf8');
  const tm = built.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  const head = tm ? JSON.parse(tm[1]).split('<body')[0] : '';

  // ── 1 · 통은 페이지 안으로 파여 있습니다 ──
  // 그림자가 **inset**이고 위아래에만 있는 것이 요점입니다 — 진짜 드럼이
  // 제 통 속으로 사라지는 자리가 거기입니다.
  const well = (css.match(/\[style\*="height: 132px"\]\s*\{[^}]*\}/) || [''])[0];
  ok('층이 통을 파묻습니다', /inset/.test(well) && (well.match(/inset/g) || []).length === 2, well.slice(0, 70));
  ok('띠는 반대로 떠 있습니다',
    /\[style\*="top: 44px"\]\[style\*="height: 44px"\]\s*\{[^}]*box-shadow:[^}]*\}/.test(css)
    && !/\[style\*="top: 44px"\]\[style\*="height: 44px"\]\s*\{[^}]*inset/.test(css));
  // 모서리는 규칙 2가 이미 줍니다 — 통이 2px 회색 테두리를 두르고 있기 때문입니다.
  // 인라인에 border-radius를 적으면 그 순간 파일의 첫 번째가 되고 통만 층
  // 바깥으로 나갑니다(마흔째).
  ok('통의 모서리는 규칙 2가 줍니다',
    (tpl.match(/height:132px;margin-top:6px;border:2px solid var\(--color-neutral-300\)/g) || []).length === 4
    && src.indexOf('border-radius') < 0 && src.indexOf('box-shadow') < 0);

  // 소스에 그런 상자가 정말 넷인지 — 다섯째가 생기면 이 수가 늘고, 그때 그것도
  // 파묻히는지 눈으로 보게 됩니다(마흔넷째가 세운 그 습관입니다)
  const wells = (src.match(/height:132px/g) || []).length;
  ok('132px 상자는 넷뿐입니다 (' + wells + '개)', wells === 4);
  const bands = (src.match(/top:44px;height:44px/g) || []).length;
  ok('그 통의 띠도 넷뿐입니다 (' + bands + '개)', bands === 4);
  // 굴리는 칸의 44px 칸(수십 개)이 이 선택자에 걸리면 줄마다 그림자가 집니다 —
  // 그 칸들은 top을 쓰지 않으므로 걸리지 않습니다
  ok('굴리는 칸은 이 선택자에 걸리지 않습니다',
    (src.match(/height:44px;display:flex/g) || []).length >= 8
    && src.indexOf('top:44px;height:44px;display:flex') < 0);

  ok('두 규칙 다 첫 페인트에 있습니다',
    head.indexOf('"height: 132px"') > 0 && head.indexOf('"top: 44px"') > 0);
  // 소스는 `height:132px`인데 React는 `height: 132px`로 다시 씁니다 — 소스를 보고
  // 선택자를 쓰면 아무것도 안 잡히고, 화면은 그냥 예전 모양이라 고장으로
  // 보이지 않습니다(마흔째)
  ok('선택자가 정규화된 값을 씁니다',
    css.indexOf('"height: 132px"') > 0 && css.indexOf('"height:132px"') < 0);
}

// 층이 모양만 말하는 것이 아니라 **눌린 순간**도 말합니다. 소스에는 :active가
// 한 번도 없었고 filter도 0개라, 그 둘은 border-radius·box-shadow와 같은 뜻에서
// 비어 있는 속성입니다 — 규칙 한 줄이 !important 없이 이깁니다.
console.log('\n== 설정 흐름의 단추가 눌린 티를 냅니다 ==');
{
  const css = fs.readFileSync(path.join(ROOT, 'ds-tokens.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'WorkLogApp.v2.dc.html'), 'utf8');
  const built = fs.readFileSync(path.join(ROOT, 'dist-v2', 'index.html'), 'utf8');
  const tm = built.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  const head = tm ? JSON.parse(tm[1]).split('<body')[0] : '';

  const act = (css.match(/\[style\*="z-index: 22"\][^{]*:active\s*\{[^}]*\}/) || [''])[0];
  ok('층이 눌린 상태를 정합니다', /filter:\s*brightness/.test(act), act.slice(0, 80));
  // 채워진 단추는 인라인 background가 이기므로 filter가, 테두리만 있는 단추는
  // 인라인 background가 없으므로 background-color가 답합니다. 둘 다 있어야
  // 이 화면의 두 종류가 모두 대답합니다.
  ok('칠한 단추와 빈 단추 양쪽에 답이 있습니다', /background-color:/.test(act), act.slice(0, 120));
  ok('되돌아오는 데 시간이 걸립니다 — 그래서 눌린 것으로 읽힙니다',
    /\[style\*="z-index: 22"\][^{]*\{[^}]*transition:[^}]*filter/.test(css));

  // !important가 하나도 없어야 합니다 — 비어 있는 속성이라 다툴 일이 없습니다
  ok('그 규칙에는 !important가 없습니다', act.indexOf('!important') < 0);
  // 소스가 그 둘을 한 번도 쓰지 않는다는 것이 이 규칙이 서 있는 근거입니다.
  // 주석은 그 둘을 **쓰는 것이 아니라 가리키는 것**이라 먼저 걷어냅니다 —
  // 걷어내지 않으면 층의 누름 규칙을 설명하는 주석 한 줄이 이 시험을
  // 실패시키고, 실패 문구는 그것이 주석이라고 말해 주지 않습니다.
  const bare = src.split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');
  ok('소스에 :active도 filter도 없습니다',
    bare.indexOf(':active') < 0 && !/[^-]filter:/.test(bare));

  // min-height를 함께 요구하는 것이 이번의 판단입니다 — 굴리는 칸은 height라
  // 걸리지 않습니다. 던져서 굴리는 중에 바탕이 번쩍이면 되먹임이 아니라 고장으로
  // 읽히고, 거기에 transform을 걸면 무는 자리가 옮겨 갑니다(마흔다섯째).
  ok('선택자가 min-height를 함께 요구합니다',
    /\[style\*="z-index: 22"\] \[style\*="cursor: pointer"\]\[style\*="min-height:"\]:active/.test(css));
  ok('그 규칙은 transform을 건드리지 않습니다', !/transform/.test(act));

  // 열쇠는 오버레이의 z-index 하나입니다 — 다섯 탭에는 닿지 않습니다
  ok('z-index 22는 설정 흐름 하나뿐입니다',
    (src.match(/z-index:22/g) || []).length === 1);
  ok('그 규칙도 첫 페인트에 있습니다', head.indexOf('"z-index: 22"') > 0);
  // 소스는 `z-index:22`인데 React는 `z-index: 22`로 다시 씁니다(마흔째)
  ok('선택자가 정규화된 값을 씁니다',
    css.indexOf('"z-index: 22"') > 0 && css.indexOf('"z-index:22"') < 0);

  // 검은 것은 더 어두워질 수 없습니다 — #201e1d에 .86을 곱하면 #1b1a19이고,
  // 그것이 근로자가 '아무 일도 안 일어난다'고 말한 그 화면입니다. 그래서 검은
  // 것만 반대 방향으로 갑니다(뒤로·건너뛰기 칩 둘 + 4/4에서 고른 급여기간·월급날 칩).
  const lift = (css.match(/\[style\*="z-index: 22"\][^{]*background: var\(--color-text\)"\]:active\s*\{[^}]*\}/) || [''])[0];
  ok('검은 것은 어두워지는 대신 밝아집니다', /brightness\(1\./.test(lift), lift.slice(0, 90));
  // 무게가 같으면 앞 규칙의 .86이 이기고, 칩만 조용히 예전처럼 아무 일도 하지
  // 않게 됩니다 — 그것은 오류를 내지 않습니다(마흔째). 선택자가 하나 더 많아야 합니다.
  // 두 규칙 다 이제 쉼표로 이은 목록입니다(설정 흐름 22 · 사유 시트 30) —
  // 무게는 목록 전체가 아니라 **한 선택자**의 것이므로 첫 벌끼리 견줍니다.
  const attrs = t => (t.split(',')[0].match(/\[style\*=/g) || []).length;
  ok('그 규칙이 앞 규칙보다 무겁습니다', attrs(lift.split('{')[0]) === attrs(act.split('{')[0]) + 1,
    attrs(lift.split('{')[0]) + ' vs ' + attrs(act.split('{')[0]));
  ok('그리고 뒤에 있습니다', css.indexOf(lift) > css.indexOf(act));

  // 검은 칩 둘은 층의 알약 규칙(2e)이 잡습니다 — min-height가 min-width보다
  // 앞에 적혀야 걸리고, 안 걸리면 조용히 네모가 됩니다(마흔째)
  ok('뒤로·건너뛰기 칩이 그 알약 규칙의 모양대로 적혀 있습니다',
    (src.match(/min-height:44px;min-width:44px;display:flex;align-items:center;justify-content:center;padding:0;background:var\(--color-text\)/g) || []).length === 2);
}

// 조퇴 사유 창만 앞 시대의 모양으로 남아 있었습니다 — 각진 모서리에 검은 3px
// 테두리, 그 안은 바탕색. 다섯 탭이 전부 둥근 흰 카드가 된 뒤로 이 창을 여는
// 근로자는 **앱의 예전 판**을 보고 있었던 것입니다. 테두리와 칠은 소스에서
// 뗐고(모달은 테두리가 아니라 뒤의 어둠으로 '위에 있다'고 말합니다), 모양은
// 다른 모든 반지름과 같은 자리 — 이 층 — 에 둡니다.
console.log('\n== 조퇴 사유 창도 카드입니다 ==');
{
  const css = fs.readFileSync(path.join(ROOT, 'ds-tokens.css'), 'utf8');
  const src = fs.readFileSync(path.join(ROOT, 'WorkLogApp.v2.dc.html'), 'utf8');
  const built = fs.readFileSync(path.join(ROOT, 'dist-v2', 'index.html'), 'utf8');
  const tm = built.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  const head = tm ? JSON.parse(tm[1]).split('<body')[0] : '';

  const rule = (css.match(/\[style\*="z-index: 30"\] > div \s*\{[^}]*\}/) || [''])[0];
  ok('층이 그 판의 모서리를 정합니다', /border-radius:\s*var\(--radius-lg\)/.test(rule), rule.slice(0, 70));
  ok('그늘도 층이 줍니다', /box-shadow:\s*var\(--shadow-card\)/.test(rule));
  // border-radius도 box-shadow도 소스가 한 번도 쓰지 않는 속성이라 다툴 일이
  // 없습니다(마흔째) — !important가 붙었다면 그 근거가 무너진 것입니다
  ok('그 규칙에는 !important가 없습니다', rule.indexOf('!important') < 0);
  // 어두운 바탕은 화면을 통째로 덮는 것이 맞습니다. 둥글어지는 것은 그 안의
  // 판이지 어둠이 아니므로, 선택자가 `> div`로 한 겹 들어가야 합니다.
  ok('둥글어지는 것은 어둠이 아니라 그 안의 판입니다', rule.indexOf('> div') > 0);
  // 열쇠는 오버레이의 z-index 하나입니다 — 소스에 한 자리뿐입니다
  ok('z-index 30은 사유 시트 하나뿐입니다',
    (src.match(/z-index:30/g) || []).length === 1);
  ok('그 규칙도 첫 페인트에 있습니다', head.indexOf('"z-index: 30"') > 0);
  // 소스는 `z-index:30`인데 React는 `z-index: 30`으로 다시 씁니다(마흔째)
  ok('선택자가 정규화된 값을 씁니다',
    css.indexOf('"z-index: 30"') > 0 && css.indexOf('"z-index:30"') < 0);
  // 판은 `overflow: auto`로 제 모서리를 자릅니다 — 없으면 빨간 머리띠가 위쪽
  // 두 모서리를 도로 각지게 만듭니다(마흔다섯째의 굴림판 통과 같은 자리)
  ok('판이 제 모서리를 자릅니다',
    /max-height:100%;overflow:auto;background:var\(--color-surface\)/.test(src));
  ok('검은 3px 테두리가 소스에서 사라졌습니다',
    src.indexOf('border:3px solid var(--color-text)') < 0);

  // 눌린 티 — 설정 흐름과 **같은 규칙**을 나눠 씁니다. 값을 두 벌 만들면
  // 두 오버레이의 누름이 서로 다르게 되는 날이 옵니다(쉰다섯째).
  const act = (css.match(/:active,?\s*\n?[^{]*:active\s*\{[^}]*brightness\(\.86\)[^}]*\}/) || [''])[0];
  ok('사유 시트의 단추도 눌린 티를 냅니다',
    /\[style\*="z-index: 30"\] \[style\*="cursor: pointer"\]\[style\*="min-height:"\]:active/.test(css));
  ok('검은 것은 시트에서도 반대로 갑니다',
    /\[style\*="z-index: 30"\] \[style\*="cursor: pointer"\]\[style\*="min-height:"\]\[style\*="background: var\(--color-text\)"\]:active/.test(css));
  ok('두 오버레이가 규칙 한 벌을 나눠 씁니다 — 복사본이 아닙니다',
    (css.match(/filter: brightness\(\.86\)/g) || []).length === 1
    && (css.match(/filter: brightness\(1\.9\)/g) || []).length === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
