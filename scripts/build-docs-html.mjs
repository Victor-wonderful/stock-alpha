// docs/web/*.html → docs/web/dist/*.html
//
// docs/web 의 원본은 **Artifact 발행용**이라 <!doctype>·<html>·<head> 가 없다
// (발행 시 호스트가 껍데기를 씌운다). 그 파일을 그대로 남에게 보내면 두 가지가 깨진다 —
//   ① charset 선언이 없어 file:// 로 열면 한글이 «ë¹„ì¹´» 로 나온다
//   ② viewport meta 가 없어 폰에서 데스크탑 폭으로 축소돼 글자가 개미만 해진다
//
// 그래서 «보내는 파일»은 여기서 따로 만든다. 원본을 두 벌로 복사하지 않는 이유는
// 뻔하다 — 한쪽만 고치는 날이 반드시 오기 때문이다. 내용의 단일 출처는 docs/web 이고
// dist 는 매번 통째로 다시 만든다(직접 수정 금지).
//
// 실행: node scripts/build-docs-html.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "docs", "web");
const OUT = join(SRC, "dist");

/** 발행 대상 — 파일명이 곧 사람에게 보내는 이름이다. */
const DOCS = [
  {
    file: "user-guide.html",
    out: "vecta-user-guide.html",
    nav: "사용 설명",
    desc: "VECTA Stock 회원용 사용 설명 — 화면별 안내, 픽 카드 읽는 법, 용어 사전.",
    for: "회원",
  },
  {
    file: "service-overview.html",
    out: "vecta-service-overview.html",
    nav: "서비스 소개",
    desc: "VECTA Stock 서비스 소개 — 무엇을 주는 서비스인지, 엔진이 하루에 하는 일, 왜 믿을 수 있는지.",
    for: "일반 고객 · 영업",
  },
  {
    file: "partnership-proposal.html",
    out: "vecta-partnership-proposal.html",
    nav: "제휴 제안",
    desc: "VECTA Stock 제휴·협업 제안 — 세 가지 모델, 검증 인프라, 컴플라이언스.",
    for: "제휴 파트너",
  },
];

/**
 * 인쇄(PDF) 규칙.
 *
 * 제안서는 결국 인쇄되거나 PDF 로 첨부된다. 브라우저 기본값은 배경색을 안 찍기
 * 때문에 그대로 두면 **네이비 패널이 흰 종이에 흰 글씨**로 나온다 — 문서에서 가장
 * 중요한 칸이 통째로 사라진다. print-color-adjust 로 배경을 강제하고, 카드·표가
 * 페이지 경계에서 반토막 나지 않게 묶는다.
 */
const PRINT_CSS = `
@media print{
  html,body{background:#fff !important;}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
  @page{margin:14mm 12mm;}
  .toc,.docnav{display:none !important;}
  section{padding:22px 0 !important;break-inside:auto;}
  .card,.model,.pipe,.terms,.navy,.mock,.note,.tw{break-inside:avoid;}
  h2,h3{break-after:avoid;}
  a{color:inherit;text-decoration:none;}
  .hero,.masthead,footer{break-inside:avoid;}
  body{font-size:11pt;}
}`;

/** 문서 사이를 오가는 얇은 띠 — 셋을 한꺼번에 보내는 경우에만 의미가 있다. */
function docnav(current) {
  const links = DOCS.map((d) =>
    d.out === current
      ? `<span class="here">${d.nav}</span>`
      : `<a href="./${d.out}">${d.nav}</a>`,
  ).join("");
  return `<nav class="docnav" aria-label="문서 이동"><div class="docnav-in"><a class="home" href="./index.html">VECTA 문서</a><div class="docnav-links">${links}</div></div></nav>`;
}

const DOCNAV_CSS = `
.docnav{background:#0B1236;border-bottom:1px solid rgba(185,192,228,.18);}
.docnav-in{max-width:1080px;margin:0 auto;padding:9px 22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
.docnav a,.docnav .here{
  font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.08em;
  text-decoration:none;padding:3px 0;
}
.docnav .home{color:#8B8BF5;font-weight:600;}
.docnav-links{display:flex;gap:16px;flex-wrap:wrap;margin-left:auto;}
.docnav-links a{color:#9AA3CC;}
.docnav-links a:hover{color:#fff;}
.docnav .here{color:#F2C684;}`;

/** 원본 조각(<title> + <link> + <style> + 본문)을 완전한 문서로 감싼다. */
function wrap({ body, title, desc, nav }) {
  // 원본 첫 줄의 <title> 은 head 로 올린다 — body 에 남겨 두면 브라우저가 봐주기는
  // 해도 문서로서 틀린 자리다.
  const stripped = body.replace(/^\s*<title>[\s\S]*?<\/title>\s*/i, "");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${desc}">
<meta name="robots" content="noindex">
<title>${title}</title>
${stripped.match(/<link[^>]*>/g)?.join("\n") ?? ""}
</head>
<body>
${nav}
${stripped.replace(/<link[^>]*>\s*/g, "")}
</body>
</html>
`;
}

/** 셋을 묶는 표지. 폴더째 보낼 때 여기부터 열면 된다. */
function indexPage() {
  const cards = DOCS.map(
    (d) => `      <a class="doc" href="./${d.out}">
        <span class="who">${d.for}</span>
        <b>${d.nav}</b>
        <p>${d.desc.replace(/^VECTA Stock [^—]*— /, "")}</p>
        <span class="go">열기 →</span>
      </a>`,
  ).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="VECTA Stock 문서 — 사용 설명 · 서비스 소개 · 제휴 제안.">
<meta name="robots" content="noindex">
<title>VECTA 문서 세 벌</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@500;700;900&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<style>
:root{
  color-scheme:only light;
  --navy:#111A47;--on-navy:#fff;--on-navy-2:#B9C0E4;--on-navy-3:#9AA3CC;
  --accent-on-navy:#8B8BF5;--warn-on-navy:#F2C684;
  --sans:"IBM Plex Sans KR","Pretendard Variable",Pretendard,system-ui,sans-serif;
  --disp:"Gothic A1","IBM Plex Sans KR",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;
}
*{box-sizing:border-box;}
body{
  margin:0;background:var(--navy);color:var(--on-navy);font-family:var(--sans);
  min-height:100vh;display:flex;align-items:center;-webkit-font-smoothing:antialiased;
}
.wrap{max-width:1000px;margin:0 auto;padding:56px 22px;width:100%;}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:26px;}
.brand b{font-family:var(--disp);font-weight:900;letter-spacing:.16em;font-size:13px;}
.brand span{font-family:var(--mono);font-size:11px;color:var(--on-navy-3);letter-spacing:.1em;}
h1{font-family:var(--disp);font-weight:900;font-size:clamp(28px,5vw,42px);line-height:1.16;letter-spacing:-.022em;margin:0 0 14px;}
.lede{color:var(--on-navy-2);font-size:15px;margin:0 0 40px;max-width:36em;line-height:1.8;}
.docs{display:grid;gap:14px;}
@media(min-width:820px){.docs{grid-template-columns:repeat(3,1fr);}}
.doc{
  display:flex;flex-direction:column;text-decoration:none;color:inherit;
  border:1px solid rgba(185,192,228,.24);border-radius:20px;padding:22px 22px 20px;
  background:rgba(255,255,255,.03);transition:border-color .16s,background .16s,transform .16s;
}
.doc:hover,.doc:focus-visible{border-color:var(--accent-on-navy);background:rgba(139,139,245,.10);transform:translateY(-2px);}
.doc:focus-visible{outline:2px solid var(--accent-on-navy);outline-offset:3px;}
.doc .who{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--warn-on-navy);margin-bottom:12px;}
.doc b{font-family:var(--disp);font-weight:900;font-size:21px;letter-spacing:-.015em;margin-bottom:8px;}
.doc p{margin:0 0 18px;font-size:13px;color:var(--on-navy-2);line-height:1.75;}
.doc .go{margin-top:auto;font-family:var(--mono);font-size:11.5px;color:var(--accent-on-navy);letter-spacing:.06em;}
.foot{margin-top:44px;padding-top:18px;border-top:1px solid rgba(185,192,228,.2);font-size:12px;color:var(--on-navy-3);line-height:1.85;}
.foot b{color:var(--on-navy);}
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <svg width="20" height="20" viewBox="0 0 120 120" aria-hidden="true">
        <defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#8B8BF5"></stop><stop offset="1" stop-color="#FF7A87"></stop>
        </linearGradient></defs>
        <path d="M60 12 L108 104 H12 Z" fill="url(#g)" opacity="0.9"></path>
        <path d="M38 78 L58 54 L72 68 L92 40" fill="none" stroke="#111A47" stroke-width="8" stroke-linecap="square"></path>
      </svg>
      <b>VECTA</b><span>STOCK</span>
    </div>
    <h1>문서 세 벌</h1>
    <p class="lede">읽는 사람이 다르면 강조할 것이 다릅니다. 보내실 상대에 맞는 것을 고르세요. 각 문서는 파일 하나로 완결돼 있어 따로 보내셔도 그대로 열립니다.</p>
    <div class="docs">
${cards}
    </div>
    <p class="foot"><b>인쇄 · PDF</b> · 각 문서에서 Ctrl+P(⌘+P)를 누르면 배경색까지 그대로 인쇄됩니다. 「대상」을 PDF로 저장으로 바꾸면 첨부용 파일이 됩니다.<br>
    2026-08-25 기준 · 본 문서의 분석·시그널 관련 내용은 정보 제공 목적이며 투자 권유가 아닙니다.</p>
  </div>
</body>
</html>
`;
}

await mkdir(OUT, { recursive: true });

for (const d of DOCS) {
  const raw = await readFile(join(SRC, d.file), "utf8");
  const title = raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? d.nav;
  // 인쇄 규칙은 원본 <style> 의 맨 끝에 붙인다 — 별도 <style> 을 뒤에 두면
  // 같은 우선순위끼리 순서 싸움이 나므로 한 블록 안에서 끝낸다.
  const withPrint = raw.replace(
    /<\/style>/i,
    `${DOCNAV_CSS}\n${PRINT_CSS}\n</style>`,
  );
  const html = wrap({ body: withPrint, title, desc: d.desc, nav: docnav(d.out) });
  await writeFile(join(OUT, d.out), html, "utf8");
  console.log(`  ${d.out}  ${(html.length / 1024).toFixed(1)}KB`);
}

await writeFile(join(OUT, "index.html"), indexPage(), "utf8");
console.log("  index.html");
console.log(`\ndocs/web/dist 갱신 완료 — ${DOCS.length + 1}개 파일`);
