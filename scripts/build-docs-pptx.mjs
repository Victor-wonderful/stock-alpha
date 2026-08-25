// docs/*.md → docs/web/dist/*.pptx  (발표용 장표)
//
// 문서와 장표는 다른 물건이다. 문서는 «읽는 것»이라 문단이 길어도 되지만, 장표는
// 발표자가 말하는 동안 **눈이 훑는 것**이라 한 장에 주장 하나여야 한다. 그래서
// 마크다운을 기계적으로 쪼개지 않고, 각 문서에서 «말할 거리»만 골라 다시 배치했다.
// 문단으로 할 말은 슬라이드가 아니라 발표자 노트(addNotes)로 내린다.
//
// 색·모티프는 apps/web 의 VECTA 토큰을 따른다. 네이비가 전체를 지배하고(표지·구획·
// 마무리), 내용 장표만 밝게 뒤집는다. 반복 모티프는 **델타 삼각형** — 브랜드 심볼
// 이자 «변화»라는 뜻이라 이 제품에 붙는 유일한 도형이다.
//
// 실행: npm run docs:pptx   (pptxgenjs 가 전역에 있어 NODE_PATH 를 잡아 준다)

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// pptxgenjs 는 이 저장소의 의존성이 아니라 전역에 깔려 있다(문서 굽는 데만 쓴다).
// D: 에서 실행하면 노드가 C:\Users\<계정>\node_modules 까지 거슬러 올라가지 않으므로
// 홈 디렉터리를 두 번째 후보로 직접 잡아 준다 — NODE_PATH 를 매번 손으로 붙이지 않도록.
const require = (() => {
  const local = createRequire(import.meta.url);
  try {
    local.resolve("pptxgenjs");
    return local;
  } catch {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    if (!home) throw new Error("pptxgenjs 를 찾을 수 없습니다 — npm i -g pptxgenjs");
    return createRequire(join(home, "node_modules", "index.js"));
  }
})();
const PptxGenJS = require("pptxgenjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "web", "dist");

// ── 팔레트 (apps/web/app/globals.css 복제) ────────────────────────────────
const C = {
  navy: "111A47",
  navy2: "1B2560",
  navyDeep: "0B1236",
  ink: "171A2B",
  dim: "4A5068",
  mute: "61677A",
  bg: "F5F6FC",
  white: "FFFFFF",
  line: "E6E8F2",
  line2: "CFD3E8",
  soft: "F1F2FA",
  soft2: "E5E7F5",
  indigo: "5252DC",
  indigoSoft: "ECECFD",
  indigoLit: "8B8BF5",
  up: "C41F33",
  upSoft: "FEF5F6",
  down: "1F5FD0",
  downSoft: "E9F0FC",
  amber: "F2C684",
  warn: "B45309",
  warnSoft: "FDF3E3",
  pass: "10704E",
  passSoft: "E9F6F0",
  fail: "B32318",
  onNavy2: "B9C0E4",
  onNavy3: "9AA3CC",
};

// 한글 장표라 한글 글꼴을 명시한다. 맑은 고딕은 Windows Office 에 기본 탑재라
// 받는 쪽에서 대체 글꼴로 튀지 않는다.
const FONT = "맑은 고딕";

const M = 0.75; // 좌우 여백
const W = 13.333;
const CW = W - M * 2; // 11.833

/** 그림자는 매번 새 객체로 만든다 — pptxgenjs 가 옵션 객체를 제자리에서 변형한다. */
const shadow = (o = {}) => ({
  type: "outer",
  color: "171A2B",
  blur: 14,
  offset: 3,
  angle: 90,
  opacity: 0.07,
  ...o,
});

function deck({ subject, title, subtitle, chips, audience }) {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.author = "VECTA Stock";
  p.company = "VECTA";
  p.subject = subject;
  p.title = title;

  let page = 0;
  let cur = null; // 마지막으로 만든 슬라이드 — 표 헬퍼가 인자 없이 쓴다

  /** 델타 삼각형 — 이 덱의 유일한 반복 도형. */
  const delta = (s, x, y, color, size = 0.13) =>
    s.addShape(p.ShapeType.triangle, {
      x,
      y,
      w: size,
      h: size * 0.86,
      fill: { color },
      line: { color, width: 0 },
    });

  /** 어두운 장표 — 표지 · 구획 · 마무리 · 기계 데이터. */
  function dark({ kicker, title, sub, deepBg }) {
    const s = p.addSlide();
    s.background = { color: deepBg ? C.navyDeep : C.navy };
    if (kicker) {
      delta(s, M, 0.66, C.amber);
      s.addText(kicker, {
        x: M + 0.24, y: 0.5, w: CW - 0.24, h: 0.32,
        fontFace: FONT, fontSize: 11, bold: true, color: C.amber,
        charSpacing: 2, margin: 0, valign: "middle",
      });
    }
    if (title) {
      s.addText(title, {
        x: M, y: kicker ? 0.92 : 0.8, w: CW, h: 1.0,
        fontFace: FONT, fontSize: 32, bold: true, color: C.white,
        margin: 0, valign: "top", lineSpacingMultiple: 1.15,
      });
    }
    if (sub) {
      s.addText(sub, {
        x: M, y: 1.92, w: Math.min(CW, 9.6), h: 0.5,
        fontFace: FONT, fontSize: 14, color: C.onNavy2, margin: 0,
      });
    }
    cur = s;
    return s;
  }

  /** 밝은 내용 장표 — 본문은 y 2.10 부터. */
  function light({ kicker, title, sub }) {
    const s = p.addSlide();
    s.background = { color: C.bg };
    page += 1;
    if (kicker) {
      delta(s, M, 0.63, C.indigo);
      s.addText(kicker, {
        x: M + 0.24, y: 0.47, w: CW - 0.24, h: 0.32,
        fontFace: FONT, fontSize: 11, bold: true, color: C.indigo,
        charSpacing: 2, margin: 0, valign: "middle",
      });
    }
    s.addText(title, {
      x: M, y: 0.86, w: CW, h: sub ? 0.68 : 0.82,
      fontFace: FONT, fontSize: 27, bold: true, color: C.ink,
      margin: 0, valign: "top", lineSpacingMultiple: 1.12,
    });
    if (sub) {
      s.addText(sub, {
        x: M, y: 1.56, w: Math.min(CW, 10.4), h: 0.4,
        fontFace: FONT, fontSize: 13, color: C.mute, margin: 0, valign: "top",
      });
    }
    s.addText(`${audience}  ·  ${String(page).padStart(2, "0")}`, {
      x: W - M - 3, y: 6.94, w: 3, h: 0.3,
      fontFace: FONT, fontSize: 9, color: C.line2, align: "right", margin: 0,
    });
    cur = s;
    return s;
  }

  /** 흰 카드. */
  function card(s, { x, y, w, h, fill = C.white, lineColor = C.line }) {
    s.addShape(p.ShapeType.roundRect, {
      x, y, w, h,
      rectRadius: 0.12,
      fill: { color: fill },
      line: { color: lineColor, width: 1 },
      shadow: shadow(),
    });
  }

  /** 카드 격자 — {kick, head, body}[] */
  function cards(s, items, { x = M, y, w = CW, h, cols, gap = 0.26, bodySize = 12 }) {
    const cw = (w - gap * (cols - 1)) / cols;
    items.forEach((it, i) => {
      const cx = x + (i % cols) * (cw + gap);
      const cy = y + Math.floor(i / cols) * (h + gap);
      card(s, { x: cx, y: cy, w: cw, h });
      let ty = cy + 0.26;
      if (it.kick) {
        s.addText(it.kick, {
          x: cx + 0.3, y: ty, w: cw - 0.6, h: 0.24,
          fontFace: FONT, fontSize: 10, bold: true, color: C.indigo,
          charSpacing: 1.5, margin: 0, valign: "middle",
        });
        ty += 0.3;
      }
      s.addText(it.head, {
        x: cx + 0.3, y: ty, w: cw - 0.6, h: 0.34,
        fontFace: FONT, fontSize: 15, bold: true, color: C.ink, margin: 0, valign: "top",
      });
      s.addText(it.body, {
        x: cx + 0.3, y: ty + 0.42, w: cw - 0.6, h: Math.max(0.24, h - (ty - cy) - 0.62),
        fontFace: FONT, fontSize: bodySize, color: C.dim, margin: 0,
        valign: "top", lineSpacingMultiple: 1.28,
      });
    });
  }

  /** 숫자 칸 — {label, value, note, tone}[] */
  function stats(s, items, { x = M, y, w = CW, h = 1.25, gap = 0.24 }) {
    const cw = (w - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const cx = x + i * (cw + gap);
      card(s, { x: cx, y, w: cw, h });
      s.addText(it.label, {
        x: cx + 0.24, y: y + 0.18, w: cw - 0.48, h: 0.26,
        fontFace: FONT, fontSize: 10.5, color: C.mute, margin: 0, valign: "middle",
      });
      s.addText(it.value, {
        x: cx + 0.24, y: y + 0.44, w: cw - 0.48, h: 0.46,
        fontFace: FONT, fontSize: 24, bold: true, color: it.tone || C.ink,
        margin: 0, valign: "middle",
      });
      if (it.note) {
        s.addText(it.note, {
          x: cx + 0.24, y: y + 0.9, w: cw - 0.48, h: 0.26,
          fontFace: FONT, fontSize: 10, color: C.mute, margin: 0, valign: "middle",
        });
      }
    });
  }

  /** 체크 목록 — {head, note}[] */
  function checks(s, items, { x = M, y, w = CW, rowH = 0.52, color = C.pass, soft = C.passSoft }) {
    items.forEach((it, i) => {
      const cy = y + i * rowH;
      s.addShape(p.ShapeType.roundRect, {
        x, y: cy + 0.04, w: 0.26, h: 0.26,
        rectRadius: 0.06, fill: { color: soft }, line: { color: soft, width: 0 },
      });
      s.addText("✓", {
        x, y: cy + 0.04, w: 0.26, h: 0.26,
        fontFace: FONT, fontSize: 11, bold: true, color, align: "center",
        valign: "middle", margin: 0,
      });
      s.addText(
        [
          { text: it.head, options: { bold: true, color: C.ink, fontSize: 13 } },
          { text: it.note ? `   ${it.note}` : "", options: { color: C.mute, fontSize: 11.5 } },
        ],
        {
          x: x + 0.4, y: cy, w: w - 0.4, h: 0.34,
          fontFace: FONT, margin: 0, valign: "middle",
        },
      );
    });
  }

  /**
   * 강조 박스 — 경고/증거.
   *
   * 본문 없이 제목만 쓰는 경우가 있다(한 줄짜리 강조). 그때 본문 상자를 그대로
   * 그리면 높이가 **음수**가 되고, PowerPoint 는 음수 ext 가 든 파일을 열기를
   * 거부한다 — 유효성 검사도 LibreOffice 도 통과시키는데 정작 PowerPoint 만
   * 거부해서 원인을 찾기 어렵다. 본문이 없으면 제목을 세로 가운데에 두고 끝낸다.
   */
  function callout(s, { x = M, y, w = CW, h = 0.9, title, body, tone = "warn" }) {
    const fill = tone === "warn" ? C.warnSoft : C.indigoSoft;
    const fg = tone === "warn" ? C.warn : C.indigo;
    const hasBody = Boolean(body && String(body).trim());
    s.addShape(p.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.1,
      fill: { color: fill }, line: { color: fill, width: 0 },
    });
    s.addText(title, {
      x: x + 0.32,
      y: hasBody ? y + 0.16 : y,
      w: w - 0.64,
      h: hasBody ? 0.28 : h,
      fontFace: FONT, fontSize: 12.5, bold: true, color: fg, margin: 0,
      valign: hasBody ? "middle" : "middle",
    });
    if (!hasBody) return;
    s.addText(body, {
      x: x + 0.32, y: y + 0.46, w: w - 0.64, h: Math.max(0.24, h - 0.62),
      fontFace: FONT, fontSize: 12, color: C.dim, margin: 0, valign: "top",
      lineSpacingMultiple: 1.25,
    });
  }

  /** 표 — head: string[], rows: (string|{t,b,c})[][] */
  function table(head, rows, { x = M, y, w = CW, colW, rowH = 0.42, fontSize = 12.5 }) {
    const s = cur;
    const body = rows.map((r) =>
      r.map((cell) => {
        const o = typeof cell === "string" ? { t: cell } : cell;
        return {
          text: o.t,
          options: {
            bold: !!o.b,
            color: o.c || C.dim,
            fill: { color: o.fill || C.white },
            fontSize: o.size || fontSize,
          },
        };
      }),
    );
    const rowsAll = [
      head.map((h) => ({
        text: h,
        options: {
          bold: true, color: C.mute, fontSize: 10.5, fill: { color: C.soft }, charSpacing: 1,
        },
      })),
      ...body,
    ];
    s.addTable(rowsAll, {
      x, y, w, colW, rowH,
      fontFace: FONT,
      border: { type: "solid", color: C.line, pt: 1 },
      valign: "middle",
      margin: [6, 10, 6, 10],
      autoPage: false,
    });
    // 표가 실제로 차지하는 높이는 파일에 적히지 않는다 — PowerPoint 가 글에 맞춰
    // 행을 늘린다. 그래서 «표 아래에 무엇을 놓을 y» 를 여기서 돌려준다.
    // 선언 높이를 믿고 배치하면 다음 요소가 표 위로 겹친다(사용 설명 7장 실제 사고).
    return y + rowsAll.length * rowH + 0.08;
  }

  function titleSlide() {
    const s = dark({ deepBg: true });
    // 브랜드 마크
    s.addShape(p.ShapeType.triangle, {
      x: M, y: 0.62, w: 0.3, h: 0.26,
      fill: { color: C.indigoLit }, line: { color: C.indigoLit, width: 0 },
    });
    s.addText("VECTA", {
      x: M + 0.42, y: 0.58, w: 3, h: 0.32,
      fontFace: FONT, fontSize: 14, bold: true, color: C.white, charSpacing: 4,
      margin: 0, valign: "middle",
    });
    s.addText("STOCK", {
      x: M + 1.55, y: 0.6, w: 3, h: 0.3,
      fontFace: FONT, fontSize: 10.5, color: C.onNavy3, charSpacing: 2,
      margin: 0, valign: "middle",
    });
    s.addText(subject, {
      x: M, y: 1.75, w: CW, h: 0.32,
      fontFace: FONT, fontSize: 12, bold: true, color: C.amber, charSpacing: 3, margin: 0,
    });
    s.addText(title, {
      x: M, y: 2.2, w: Math.min(CW, 10.6), h: 2.1,
      fontFace: FONT, fontSize: 40, bold: true, color: C.white,
      margin: 0, valign: "top", lineSpacingMultiple: 1.16,
    });
    s.addText(subtitle, {
      x: M, y: 4.5, w: Math.min(CW, 9.4), h: 0.8,
      fontFace: FONT, fontSize: 14.5, color: C.onNavy2, margin: 0,
      valign: "top", lineSpacingMultiple: 1.35,
    });
    // 하단 칩
    let cx = M;
    chips.forEach((t) => {
      const cwid = 0.34 + t.length * 0.115;
      s.addShape(p.ShapeType.roundRect, {
        x: cx, y: 5.72, w: cwid, h: 0.36,
        rectRadius: 0.18, fill: { color: C.navy }, line: { color: "2A3566", width: 1 },
      });
      s.addText(t, {
        x: cx, y: 5.72, w: cwid, h: 0.36,
        fontFace: FONT, fontSize: 10.5, color: C.onNavy2, align: "center",
        valign: "middle", margin: 0,
      });
      cx += cwid + 0.16;
    });
    s.addText("2026-08-25 기준  ·  본 자료의 분석·시그널 관련 내용은 정보 제공 목적이며 투자 권유가 아닙니다", {
      x: M, y: 6.72, w: CW, h: 0.3,
      fontFace: FONT, fontSize: 9.5, color: C.onNavy3, margin: 0,
    });
    return s;
  }

  return { p, dark, light, card, cards, stats, checks, callout, table, titleSlide, delta, C, FONT };
}

// ══════════════════════════════════════════════════════════════════════════
// 덱 1 — 서비스 소개 (일반 고객 · 영업)
// ══════════════════════════════════════════════════════════════════════════
function buildOverview() {
  const d = deck({
    subject: "서비스 소개",
    title: "포털은 재료를 줍니다.\n우리는 요리를 냅니다.",
    subtitle:
      "국내 상장 2,500여 종목을 매 거래일 다시 계산해,\n살 값 · 나올 값 · 비중이 적힌 실행 계획과 리포트를 발행합니다.",
    chips: ["KOSPI · KOSDAQ 전 종목", "매 거래일 08:30 · 16:30", "현재 전 기능 무료", "수익 보장 없음"],
    audience: "VECTA Stock 서비스 소개",
  });

  d.titleSlide().addNotes(
    "이 한 줄이 전부입니다. 네이버·증권사 앱에 데이터는 이미 다 있습니다. 없는 것은 «그래서 얼마에 사고 어디서 나오느냐»는 한 줄입니다.",
  );

  // 문제
  let s = d.light({
    kicker: "문제",
    title: "개인투자자가 깨지는 이유는\n좋은 종목을 몰라서가 아닙니다",
  });
  d.table(
    ["", "개인", "프로"],
    [
      ["진입", "감 · 뉴스 · 테마 추격", "검증된 패턴"],
      [{ t: "청산", b: true, c: C.ink }, { t: "없음(존버) 또는 뇌동매매", b: true, c: C.fail }, "미리 정해 둔 손절 · 익절"],
      [{ t: "비중", b: true, c: C.ink }, { t: "몰빵 · 물타기", b: true, c: C.fail }, "계좌 대비 고정 리스크"],
      ["맥락", "무시", "장 국면에 따라 무기 교체"],
      ["근거", "“누가 좋다더라”", "숫자와 기록"],
    ],
    { y: 2.15, colW: [2.2, 4.8, 4.833], rowH: 0.62 },
  );
  d.callout(s, {
    y: 5.75, h: 0.85,
    title: "정보는 이미 넘칩니다",
    body: "부족한 것은 데이터가 아니라 규율입니다. 우리가 가장 정직하게, 그리고 즉시 줄 수 있는 가치가 여기 있습니다.",
    tone: "info",
  });
  s.addNotes("이 표가 이 제품의 존재 이유입니다. 진입은 셋 다 비슷합니다. 갈리는 곳은 청산과 비중입니다.");

  // 한 줄 정의
  s = d.dark({
    kicker: "우리가 하는 일",
    title: "우리가 파는 것은 종목이 아니라 계획입니다",
  });
  const trio = [
    { k: "얼마에", t: "살 값", n: "다음 거래일 시가에 시장가 매수" },
    { k: "어디서 나오나", t: "나올 값", n: "손절가 이탈 시 전량 매도" },
    { k: "얼마나", t: "비중", n: "손절에 걸려도 계좌 손실은 1%" },
  ];
  trio.forEach((it, i) => {
    const x = M + i * (CW / 3);
    const w = CW / 3 - 0.3;
    d.p; // noop
    s.addText(it.k, {
      x, y: 2.85, w, h: 0.3,
      fontFace: FONT, fontSize: 11, color: C.onNavy3, margin: 0, charSpacing: 1.5,
    });
    s.addText(it.t, {
      x, y: 3.15, w, h: 0.8,
      fontFace: FONT, fontSize: 40, bold: true, color: C.amber, margin: 0, valign: "middle",
    });
    s.addText(it.n, {
      x, y: 4.0, w, h: 0.7,
      fontFace: FONT, fontSize: 12.5, color: C.onNavy2, margin: 0,
      valign: "top", lineSpacingMultiple: 1.3,
    });
  });
  s.addText("이 셋이 한 장에 적혀 있지 않으면, 그것은 추천이 아니라 감상입니다.", {
    x: M, y: 5.6, w: CW, h: 0.4,
    fontFace: FONT, fontSize: 14, italic: true, color: C.white, margin: 0,
  });
  s.addNotes("종목 이름만 주는 서비스는 이미 많습니다. 우리는 그 뒤에 붙는 세 숫자를 팝니다.");

  // 주는 것 6가지
  s = d.light({
    kicker: "제품",
    title: "우리가 주는 것",
    sub: "여섯 가지. 전부 같은 엔진 하나에서 나옵니다.",
  });
  d.cards(
    s,
    [
      { kick: "01", head: "오늘의 픽", body: "조건을 통과한 종목만 발행. 진입·손절·본전가·비중·기간이 함께 붙습니다." },
      { kick: "02", head: "검증 성적", body: "그 픽이 쓴 조합의 승률·손익비·기대값·최대낙폭을 카드에 그대로 적습니다." },
      { kick: "03", head: "종목 분석", body: "밸류·성장·수급·모멘텀·안정성 5축 진단과 개별 리포트." },
      { kick: "04", head: "리스크 진단", body: "보유 조합의 베타·변동성·섹터 집중도를 재고 처방을 냅니다." },
      { kick: "05", head: "매일 읽을 것", body: "모닝 브리프·주간 브리핑·기업 분석·매크로·전문가 코너." },
      { kick: "06", head: "성과", body: "발행한 픽의 결과를 전부 남깁니다 — 손절과 만료까지." },
    ],
    { y: 2.15, h: 1.72, cols: 3 },
  );
  d.callout(s, {
    y: 6.05, h: 0.55,
    title: "통과한 게 없으면 0건입니다 — 매일 채워야 하는 할당량이 없습니다",
    body: "",
    tone: "info",
  });
  s.addNotes("여섯 개를 다 설명하지 마세요. 상대가 어떤 사람이냐에 따라 1·2번(트레이더)이나 3·4번(장기투자자)만 골라 말합니다.");

  // 픽 = 실행 계획
  s = d.light({
    kicker: "핵심",
    title: "픽 하나에 붙는 여섯 개의 숫자",
    sub: "「사라」가 아니라 「이 값에 사서 이 값에 나오고 이만큼만 담아라」입니다.",
  });
  const lv = [
    { label: "진입가", value: "48,200", note: "다음 거래일 시가" },
    { label: "손절가", value: "43,980", note: "−8.8% · 전량 매도", tone: C.down },
    { label: "본전 도달가", value: "56,600", note: "손절이 본전으로", tone: C.up },
  ];
  d.stats(s, lv, { y: 2.2, h: 1.35 });
  const lv2 = [
    { label: "1주당 리스크", value: "4,220원", note: "진입 − 손절" },
    { label: "권장 비중", value: "11.4%", note: "계좌 리스크 1% 역산" },
    { label: "보유 기간", value: "10거래일", note: "기간이 끝나면 청산" },
  ];
  d.stats(s, lv2, { y: 3.75, h: 1.35 });
  d.callout(s, {
    y: 5.4, h: 1.15,
    title: "목표가는 “파는 신호”가 아닙니다",
    body: "본전 도달가에 닿으면 팔지 않고 손절선만 본전으로 올린 뒤 기간까지 보유합니다. 12개 조합을 전부 비교했더니 예외 없이 이쪽이 나았습니다 — 목표에서 팔면 크게 오를 종목의 이익을 스스로 잘라내기 때문입니다.",
  });
  s.addNotes("숫자는 예시입니다. 실제 화면에서는 종목마다 엔진이 계산한 값이 들어갑니다. 여기서 «그럼 언제 파나요»가 반드시 나옵니다 — 아래 경고 박스로 받으세요.");

  // 검증 성적
  s = d.light({
    kicker: "정직",
    title: "불리한 숫자를 먼저 말합니다",
    sub: "픽 카드 맨 아래에는 그 조합의 과거 성적이 그대로 적힙니다.",
  });
  d.stats(
    s,
    [
      { label: "승률", value: "43%", note: "100번 중 이긴 횟수" },
      { label: "이기면", value: "2.3배", note: "손익비" },
      { label: "거래당", value: "+0.35R", note: "평균 기대값", tone: C.pass },
      { label: "최대낙폭", value: "−18.2%", note: "계좌가 가장 줄었던 폭", tone: C.down },
    ],
    { y: 2.2, h: 1.4 },
  );
  d.card(s, { x: M, y: 3.85, w: CW, h: 1.2 });
  s.addText(
    "“10번 중 6번은 손실로 끝납니다. 대신 이길 때 2.3배 벌어서, 4,220원을 걸면 한 번당 평균 +1,477원이 남았습니다.”",
    {
      x: M + 0.4, y: 4.05, w: CW - 0.8, h: 0.8,
      fontFace: FONT, fontSize: 15, italic: true, color: C.ink,
      margin: 0, valign: "middle", lineSpacingMultiple: 1.3,
    },
  );
  d.callout(s, {
    y: 5.25, h: 1.25,
    title: "승률이 낮은 것은 결함이 아니라 설계입니다",
    body: "승률을 억지로 올리면 이익 구간을 잘라내게 되고, 13만 건 규모의 실험에서 오히려 돈을 잃었습니다. 이 시스템은 승률이 아니라 기대값으로 굴러갑니다.\n모든 수치는 수수료·세금·슬리피지를 뺀 값이며, 과거 데이터로 잰 것이라 미래 수익을 보장하지 않습니다.",
  });
  s.addNotes("여기가 신뢰를 만드는 장표입니다. 승률 43%를 먼저 말하는 서비스는 거의 없습니다. 상대가 «생각보다 낮네요»라고 하면 그것이 정상 반응이라고 받으세요.");

  // 파이프라인
  s = d.dark({
    kicker: "공정",
    title: "하루 두 번, 사람 손 없이",
    sub: "사람이 종목을 고르지 않습니다. 아래 순서가 매 거래일 그대로 돕니다.",
  });
  const clocks = [
    { t: "08:30", n: "장 시작 전 — 밤사이 해외 지수·환율을\n갱신해 모닝 브리프를 씁니다" },
    { t: "16:30", n: "장 마감 후 — 그날 종가로 전 종목을\n다시 계산하고 픽을 발행합니다" },
  ];
  clocks.forEach((c, i) => {
    const x = M + i * 5.95;
    s.addShape(d.p.ShapeType.roundRect, {
      x, y: 2.5, w: 5.7, h: 1.1,
      rectRadius: 0.12, fill: { color: C.navy2 }, line: { color: "2A3566", width: 1 },
    });
    s.addText(c.t, {
      x: x + 0.3, y: 2.62, w: 1.5, h: 0.42,
      fontFace: FONT, fontSize: 22, bold: true, color: C.amber, margin: 0, valign: "middle",
    });
    s.addText(c.n.split("\n").join(" "), {
      x: x + 0.3, y: 3.04, w: 5.1, h: 0.5,
      fontFace: FONT, fontSize: 10.5, color: C.onNavy2, margin: 0,
      valign: "top", lineSpacingMultiple: 1.25,
    });
  });
  const steps = [
    ["01", "데이터 수집", "시세·수급·재무(DART)·공시·뉴스·매크로"],
    ["02", "신선도 가드", "그날 종가가 없으면 배치를 중단합니다"],
    ["03", "가격 보정", "병합·감자로 생긴 가짜 등락 제거"],
    ["04", "분석", "밸류에이션·멀티팩터·리스크·국면 판정"],
    ["05", "백테스트 게이트", "통과한 조합만 발행을 허용"],
    ["06", "시그널·가격 레벨", "ATR·지지저항으로 진입/손절/목표"],
    ["07", "리포트", "숫자는 코드가, 서술만 AI가"],
    ["08", "오늘의 픽 선정", "국면·리스크 예산·중복을 보고 선별"],
  ];
  // 4열 × 2행. 예전에는 오른쪽 2열로 몰아 두었는데 시계 카드와 x 가 겹쳐
  // 번호가 카드 위에 찍혔다(실측). 시계를 위로 올리고 단계는 아래를 전폭으로 쓴다.
  const colW = (CW - 0.3 * 3) / 4;
  steps.forEach((st, i) => {
    const x = M + (i % 4) * (colW + 0.3);
    const y = 4.0 + Math.floor(i / 4) * 1.25;
    s.addText(st[0], {
      x, y, w: 0.4, h: 0.28,
      fontFace: FONT, fontSize: 10.5, bold: true, color: C.indigoLit, margin: 0,
    });
    s.addText(st[1], {
      x: x + 0.42, y, w: colW - 0.42, h: 0.28,
      fontFace: FONT, fontSize: 12.5, bold: true, color: C.white, margin: 0,
    });
    s.addText(st[2], {
      x, y: y + 0.34, w: colW, h: 0.7,
      fontFace: FONT, fontSize: 10, color: C.onNavy3, margin: 0,
      valign: "top", lineSpacingMultiple: 1.25,
    });
  });
  s.addText("대상 KOSPI · KOSDAQ 전 종목(약 2,500여 종목) · 데이터 소스 KIS · DART · FRED · 뉴스", {
    x: M, y: 6.7, w: CW, h: 0.3,
    fontFace: FONT, fontSize: 10.5, color: C.onNavy3, margin: 0,
  });
  s.addNotes("«02 신선도 가드»를 강조하세요. 데이터가 안 들어오면 그냥 멈춥니다. 낡은 값으로 픽을 내는 것보다 아무것도 안 내는 편이 낫다는 판단입니다.");

  // 네 규칙
  s = d.light({
    kicker: "신뢰",
    title: "왜 믿을 수 있나 — 네 가지 규칙",
    sub: "주장이 아니라 구조입니다. 지키겠다는 다짐이 아니라, 어기기 어렵게 만든 설계입니다.",
  });
  d.cards(
    s,
    [
      { kick: "규칙 1", head: "숫자는 AI가 만들지 않는다", body: "점수·진입가·손절가·비중은 전부 코드가 계산합니다. AI는 그 값을 설명만 합니다. 환각이 끼어들 자리가 구조적으로 없습니다." },
      { kick: "규칙 2", head: "검증을 통과 못 하면 발행 금지", body: "셋업×기간 조합마다 백테스트를 돌리고, 못 넘으면 그 조합은 발행하지 않습니다." },
      { kick: "규칙 3", head: "진입 방식을 실제와 똑같이 잰다", body: "검증도 발행도 「다음 거래일 시가 시장가」로 통일했습니다. 백테스트가 실전보다 유리하면 그 성적은 거짓말입니다." },
      { kick: "규칙 4", head: "틀린 것을 지우지 않는다", body: "성과 화면에 손절·만료·규칙 교체가 전부 남습니다. 맞은 것만 골라 보여주는 화면은 만들지 않습니다." },
    ],
    { y: 2.15, h: 2.1, cols: 2 },
  );
  s.addNotes("네 개 중 하나만 기억시킨다면 규칙 4입니다. 실패를 남기는 서비스는 과장할 구조를 가질 수 없습니다.");

  // 게이트
  s = d.light({
    kicker: "규칙 2 상세",
    title: "발행 전에 통과해야 하는 것",
    sub: "하나라도 못 넘으면 그 조합은 그날 발행되지 않습니다.",
  });
  d.checks(
    s,
    [
      { head: "최소 표본 20건", note: "우연을 성적으로 세지 않습니다" },
      { head: "거래비용 차감 후 기대값이 양(+)", note: "수수료·세금·슬리피지를 이미 뺀 값" },
      { head: "이상치 제거 (±10R 클립)", note: "비현실적 대박 몇 건이 평균을 뒤집지 못하게" },
      { head: "최대낙폭 상한", note: "하루 리스크 예산을 균등 분할한 실제 집행 모델 기준" },
      { head: "워크포워드 — 기간 4등분, 과반에서 양(+)", note: "한 시기에만 먹혔던 전략을 걸러냅니다" },
      { head: "최근 구간 기대값이 음수면 탈락", note: "엣지가 죽은 전략을 계속 팔지 않습니다" },
    ],
    { y: 2.25, rowH: 0.58 },
  );
  d.callout(s, {
    y: 5.9, h: 1.0,
    title: "이 게이트가 실제로 작동한다는 증거",
    body: "지금 장기(20일) 픽은 발행을 쉬고 있습니다. 지난 1년 재현에서 셋 중 가장 낮았고 최근 구간 기대값이 마이너스였기 때문입니다.\n잘 안 되면 끄는 것이 이 시스템의 정상 동작입니다.",
  });
  s.addNotes("«스스로 껐다»는 사실 하나가 게이트 설명 여섯 줄보다 강합니다. 시간이 없으면 이 박스만 읽으세요.");

  // 비교
  s = d.light({
    kicker: "비교",
    title: "무엇이 다른가",
  });
  d.table(
    ["", "포털 · 증권사 앱", "리딩방 · 유료 추천", "VECTA Stock"],
    [
      ["주는 것", "데이터 · 차트", "“OO 사라”", { t: "살 값 · 나올 값 · 비중", b: true, c: C.indigo, fill: C.indigoSoft }],
      ["손절", "없음", "흐지부지", { t: "숫자로 명시, 전량 매도", b: true, c: C.indigo, fill: C.indigoSoft }],
      ["비중", "없음", "“몰빵”", { t: "계좌 리스크 1% 역산", b: true, c: C.indigo, fill: C.indigoSoft }],
      ["근거", "—", "말", { t: "백테스트 기록 + 원문 리포트", b: true, c: C.indigo, fill: C.indigoSoft }],
      ["실패 기록", "—", "지움", { t: "전부 공개", b: true, c: C.indigo, fill: C.indigoSoft }],
      ["수익 보장", "—", "암시", { t: "하지 않음 (명시)", b: true, c: C.indigo, fill: C.indigoSoft }],
    ],
    { y: 2.15, colW: [1.9, 3.1, 2.9, 3.933], rowH: 0.6 },
  );
  s.addNotes("가운데 칸을 공격하지 마세요. 사실만 나열하고 판단은 상대에게 맡기는 편이 훨씬 셉니다.");

  // 요금 + 하지 않는 일
  s = d.light({
    kicker: "요금",
    title: "지금은 전부 무료입니다",
    sub: "회원 등급도, 결제도 없습니다. 유료화를 하게 되면 미리 알리고, 이미 열려 있던 것을 뒤에서 잠그지 않습니다.",
  });
  d.table(
    ["무료", "유료 (예정)"],
    [
      ["홈 요약 · 시장 대시보드 · 브리프", "픽 전문 (근거 · 레벨 · 청산 시나리오)"],
      ["리포트 요약", "리포트 전문 · 진단 무제한 · 알림"],
    ],
    { y: 2.25, colW: [5.9165, 5.9165], rowH: 0.62 },
  );
  d.callout(s, {
    y: 4.35, h: 0.75,
    title: "유료로 구체적 시그널을 발행하기 전에 유사투자자문업 신고를 완료할 계획입니다",
    body: "",
    tone: "info",
  });
  s.addText("하지 않는 일", {
    x: M, y: 5.3, w: CW, h: 0.35,
    fontFace: FONT, fontSize: 16, bold: true, color: C.ink, margin: 0,
  });
  const nots = [
    "자금을 맡아 두지 않습니다",
    "매매를 대신하거나 주문을 넣지 않습니다",
    "개별 맞춤 자문이 아닙니다",
    "수익을 보장하지 않습니다",
  ];
  nots.forEach((t, i) => {
    const x = M + (i % 2) * 5.95;
    const y = 5.75 + Math.floor(i / 2) * 0.42;
    s.addText("✕", {
      x, y, w: 0.28, h: 0.3,
      fontFace: FONT, fontSize: 12, bold: true, color: C.fail, margin: 0, valign: "middle",
    });
    s.addText(t, {
      x: x + 0.3, y, w: 5.4, h: 0.3,
      fontFace: FONT, fontSize: 12.5, color: C.dim, margin: 0, valign: "middle",
    });
  });
  s.addNotes("무료라는 사실보다 «뒤에서 잠그지 않는다»는 약속이 더 잘 먹힙니다. 다들 그 경험이 있어서입니다.");

  // 현재 상태
  s = d.light({
    kicker: "현재",
    title: "지금 상태와 앞으로",
    sub: "되는 척하지 않겠습니다.",
  });
  const states = [
    { kick: "운영 중", head: "이미 매일 돕니다", body: "국내 전 종목 일일 배치 · 픽 발행 · 리포트 · 브리프 · 성과 추적 · 관심 종목 · 리스크 진단 · 전문가 코너", tone: C.pass },
    { kick: "준비 중", head: "곧 붙습니다", body: "알림 설정 저장 · 외부 발송(텔레그램) · 뉴스 「증시 영향」 판정 · 장기 픽 재개", tone: C.warn },
    { kick: "검토 중", head: "아직 결정 전", body: "유료 플랜 · 유사투자자문업 신고 · 장기 「퀄리티 픽」 · 미국 주식", tone: C.mute },
  ];
  const scw = (CW - 0.52) / 3;
  states.forEach((it, i) => {
    const x = M + i * (scw + 0.26);
    d.card(s, { x, y: 2.2, w: scw, h: 2.5 });
    s.addText(it.kick, {
      x: x + 0.3, y: 2.45, w: scw - 0.6, h: 0.28,
      fontFace: FONT, fontSize: 11, bold: true, color: it.tone, charSpacing: 1.5, margin: 0,
    });
    s.addText(it.head, {
      x: x + 0.3, y: 2.78, w: scw - 0.6, h: 0.34,
      fontFace: FONT, fontSize: 15, bold: true, color: C.ink, margin: 0,
    });
    s.addText(it.body, {
      x: x + 0.3, y: 3.2, w: scw - 0.6, h: 1.3,
      fontFace: FONT, fontSize: 12, color: C.dim, margin: 0, valign: "top", lineSpacingMultiple: 1.3,
    });
  });
  s.addText("웹 Next.js 15 (Vercel)  ·  DB Supabase (서울)  ·  분석 엔진 Python 3.12", {
    x: M, y: 5.05, w: CW, h: 0.3,
    fontFace: FONT, fontSize: 11, color: C.mute, margin: 0,
  });
  s.addNotes("«준비 중»과 «검토 중»을 굳이 보여주는 이유를 말하세요 — 없는 것을 있다고 하지 않는 것이 이 제품의 규칙입니다.");

  // 마무리
  s = d.dark({ deepBg: true });
  s.addText("한 줄로 남기자면", {
    x: M, y: 2.3, w: CW, h: 0.4,
    fontFace: FONT, fontSize: 13, bold: true, color: C.amber, charSpacing: 2, margin: 0,
  });
  s.addText("감이 아니라 규칙으로 사고,\n규칙대로 나오고,\n그 결과를 전부 남깁니다.", {
    x: M, y: 2.85, w: Math.min(CW, 10), h: 2.2,
    fontFace: FONT, fontSize: 34, bold: true, color: C.white,
    margin: 0, valign: "top", lineSpacingMultiple: 1.25,
  });
  s.addText(
    "본 서비스가 제공하는 분석·시그널·투자의견·목표주가는 정보 제공 목적이며 투자 권유가 아닙니다. 모든 수치는 과거 데이터로 계산한 것이며 과거 성과가 미래 수익을 보장하지 않습니다. 모든 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.",
    {
      x: M, y: 5.9, w: Math.min(CW, 11), h: 1.0,
      fontFace: FONT, fontSize: 10, color: C.onNavy3, margin: 0,
      valign: "top", lineSpacingMultiple: 1.35,
    },
  );
  s.addNotes("면책은 읽지 말고 «화면에도 같은 문장이 항상 붙어 있다»고만 말하세요.");

  return d.p;
}

// ══════════════════════════════════════════════════════════════════════════
// 덱 2 — 제휴 · 협업 제안
// ══════════════════════════════════════════════════════════════════════════
function buildPartnership() {
  const d = deck({
    subject: "제휴 · 협업 제안",
    title: "휴가도 슬럼프도 없는\n국내주식 분석 엔진을\n함께 쓰시겠습니까",
    subtitle:
      "KOSPI · KOSDAQ 약 2,500여 종목을 매 거래일 자동으로 계산해,\n실행 계획과 리포트를 발행하는 엔진과 서비스입니다.",
    chips: ["콘텐츠 공급", "전문가 파트너", "엔진 · 데이터 연동", "파일럿 선행"],
    audience: "VECTA Stock 제휴 제안",
  });

  d.titleSlide().addNotes(
    "첫 미팅용입니다. 제품 설명은 최소로 하고, 상대가 무엇을 갖고 있는지 듣는 데 시간을 쓰세요 — 채널이면 A, 사람이면 B, 앱이면 C입니다.",
  );

  // 한 장 요약
  let s = d.light({
    kicker: "한 장 요약",
    title: "세 가지 중 하나 이상을 드릴 수 있습니다",
    sub: "귀사가 무엇을 갖고 계신지에 따라 방향이 갈립니다.",
  });
  const models = [
    { kick: "모델 A", head: "콘텐츠 공급", body: "매일 생산되는 브리프·리포트·시황을 귀사 채널에 정기 공급", get: "사람 손 없이 매일 채워지는\n국내주식 콘텐츠", when: "준비 2~4주", tone: C.indigo, soft: C.indigoSoft },
    { kick: "모델 B · 지금 가능", head: "전문가 파트너", body: "검증된 전문가에게 필명 코너와 독자를 드립니다", get: "데이터 작업 없이\n엔진 근거 위에서 쓰는 글", when: "준비 즉시", tone: C.pass, soft: C.passSoft },
    { kick: "모델 C", head: "엔진 · 데이터 연동", body: "팩터·시그널·백테스트 결과를 API로 공급", get: "자체 퀀트 조직 없이\n분석 레이어 확보", when: "준비 6~10주", tone: C.indigo, soft: C.indigoSoft },
  ];
  const mw = (CW - 0.52) / 3;
  models.forEach((m, i) => {
    const x = M + i * (mw + 0.26);
    d.card(s, { x, y: 2.15, w: mw, h: 3.1, lineColor: m.tone === C.pass ? C.pass : C.line });
    s.addText(m.kick, {
      x: x + 0.3, y: 2.4, w: mw - 0.6, h: 0.28,
      fontFace: FONT, fontSize: 10.5, bold: true, color: m.tone, charSpacing: 1.5, margin: 0,
    });
    s.addText(m.head, {
      x: x + 0.3, y: 2.72, w: mw - 0.6, h: 0.38,
      fontFace: FONT, fontSize: 17, bold: true, color: C.ink, margin: 0,
    });
    s.addText(m.body, {
      x: x + 0.3, y: 3.16, w: mw - 0.6, h: 0.75,
      fontFace: FONT, fontSize: 12, color: C.dim, margin: 0, valign: "top", lineSpacingMultiple: 1.28,
    });
    s.addShape(d.p.ShapeType.roundRect, {
      x: x + 0.3, y: 4.0, w: mw - 0.6, h: 0.85,
      rectRadius: 0.1, fill: { color: m.soft }, line: { color: m.soft, width: 0 },
    });
    s.addText(m.get, {
      x: x + 0.48, y: 4.08, w: mw - 0.96, h: 0.7,
      fontFace: FONT, fontSize: 11.5, bold: true, color: m.tone, margin: 0,
      valign: "middle", lineSpacingMultiple: 1.25,
    });
    s.addText(m.when, {
      x: x + 0.3, y: 4.92, w: mw - 0.6, h: 0.26,
      fontFace: FONT, fontSize: 10.5, color: C.mute, margin: 0,
    });
  });
  d.callout(s, {
    y: 5.5, h: 0.92,
    title: "공통 전제 — 이것을 지키는 조건에서만 제휴합니다",
    body: "① 수익을 보장하는 표현을 쓰지 않습니다   ② 숫자는 코드가 계산하고 AI는 서술만 합니다   ③ 실패한 기록을 지우지 않습니다",
    tone: "info",
  });
  s.addNotes("세 모델을 다 설명하지 말고, 상대가 어디에 해당하는지 먼저 물어보세요. 공통 전제 세 줄은 반드시 읽습니다 — 이게 우리의 성격입니다.");

  // 엔진
  s = d.dark({
    kicker: "자산",
    title: "이미 매일 돌고 있는 것들",
    sub: "새로 만들겠다는 약속이 아닙니다.",
  });
  const eng = [
    { t: "08:30", n: "밤사이 해외 지수·환율 갱신\n→ 모닝 브리프 발행" },
    { t: "16:30", n: "수집 → 신선도 가드 → 가격 보정 → 분석\n→ 백테스트 게이트 → 시그널 → 리포트 → 픽" },
  ];
  eng.forEach((c, i) => {
    const x = M + i * 5.95;
    s.addShape(d.p.ShapeType.roundRect, {
      x, y: 2.6, w: 5.7, h: 1.15,
      rectRadius: 0.12, fill: { color: C.navy2 }, line: { color: "2A3566", width: 1 },
    });
    s.addText(c.t, {
      x: x + 0.3, y: 2.72, w: 1.4, h: 0.42,
      fontFace: FONT, fontSize: 20, bold: true, color: C.amber, margin: 0, valign: "middle",
    });
    s.addText(c.n, {
      x: x + 0.3, y: 3.14, w: 5.1, h: 0.5,
      fontFace: FONT, fontSize: 10.5, color: C.onNavy2, margin: 0, valign: "top", lineSpacingMultiple: 1.25,
    });
  });
  const rows = [
    ["데이터 소스", "KIS(시세·수급) · DART(재무·공시) · FRED(매크로) · 뉴스"],
    ["분석 축", "멀티팩터 · 밸류에이션 · 수급 · 마이크로구조 · 국면(레짐) · 리스크"],
    ["셋업 20여 종", "돌파 · 눌림목 · 과대낙폭 반등 · 쌍바닥 · 52주 신고가 · 실적 모멘텀(PEAD) 등"],
    ["보유 기간 축", "단기(5거래일) · 중기(10거래일) · 장기(20거래일)"],
  ];
  rows.forEach((r, i) => {
    const y = 4.1 + i * 0.62;
    s.addText(r[0], {
      x: M, y, w: 2.4, h: 0.4,
      fontFace: FONT, fontSize: 12.5, bold: true, color: C.amber, margin: 0, valign: "middle",
    });
    s.addText(r[1], {
      x: M + 2.5, y, w: CW - 2.5, h: 0.4,
      fontFace: FONT, fontSize: 12, color: C.onNavy2, margin: 0, valign: "middle",
    });
  });
  s.addNotes("«이미 돈다»가 이 장표의 전부입니다. 파트너가 가장 먼저 의심하는 것은 «이거 만들다 말 거 아니냐»입니다.");

  // 콘텐츠
  s = d.light({
    kicker: "자산",
    title: "매일 생산되는 콘텐츠",
    sub: "필자가 쉬어도 매 거래일 나옵니다.",
  });
  d.table(
    ["산출물", "주기", "성격"],
    [
      [{ t: "모닝 브리프", b: true, c: C.ink }, "매 거래일", "장 시작 전 국면·해외 변수 요약"],
      [{ t: "오늘의 픽", b: true, c: C.ink }, "매 거래일", "진입·손절·비중이 붙은 실행 계획"],
      [{ t: "기업 분석 리포트", b: true, c: C.ink }, "매 거래일", "5축 진단 + 밸류에이션 + 근거"],
      [{ t: "주간 브리핑", b: true, c: C.ink }, "주 1회", "한 주 정리"],
      [{ t: "블로그 「데이터」", b: true, c: C.ink }, "자동", "엔진이 직접 씁니다 — 사람 글과 물리적으로 분리"],
    ],
    { y: 2.2, colW: [3.0, 2.0, 6.833], rowH: 0.6 },
  );
  d.callout(s, {
    y: 5.7, h: 0.95,
    title: "공급이 끊기지 않는다는 뜻입니다",
    body: "사람에게 묶인 콘텐츠는 필자가 쉬면 멈춥니다. 제휴에서 가장 흔한 실패가 그것입니다.",
    tone: "info",
  });
  s.addNotes("미디어·앱 파트너에게는 이 장표가 제일 셉니다. 콘텐츠 공백은 그쪽에서 매일 겪는 고통입니다.");

  // 게이트
  s = d.light({
    kicker: "핵심 자산",
    title: "검증 인프라 — 통과 못 하면 발행하지 않습니다",
    sub: "제휴사가 가장 두려워하는 것은 나중에 터지는 과장입니다. 우리는 과장할 구조를 갖고 있지 않습니다.",
  });
  d.checks(
    s,
    [
      { head: "최소 표본 20건", note: "우연을 성적으로 세지 않습니다" },
      { head: "거래비용 차감 후 기대값이 양(+)", note: "수수료·세금·슬리피지를 이미 뺀 값" },
      { head: "이상치 ±10R 윈저라이즈", note: "대박 몇 건이 평균을 뒤집지 못하게" },
      { head: "최대낙폭 상한", note: "하루 리스크 예산 균등 분할 모델 기준" },
      { head: "워크포워드 — 기간 4등분, 과반에서 양(+)", note: "한 시기에만 먹혔던 전략을 걸러냅니다" },
      { head: "최근 구간 기대값이 음수면 탈락", note: "엣지가 죽은 전략을 계속 팔지 않습니다" },
      { head: "진입 가정 = 실제 발행과 동일", note: "검증도 발행도 「다음 거래일 시가 시장가」" },
    ],
    { y: 2.25, rowH: 0.53 },
  );
  d.callout(s, {
    y: 6.05, h: 0.85,
    title: "지금 장기(20일) 픽은 발행을 쉬고 있습니다",
    body: "성적이 떨어진 전략을 스스로 끄는 것이 이 엔진의 정상 동작이고, 파트너에게 드리는 신뢰의 근거입니다.",
  });
  s.addNotes("실사에서 반드시 파고드는 곳입니다. 숫자 근거를 요구하면 백테스트 원본을 보여드리겠다고 답하세요.");

  // 모델 A
  s = d.light({ kicker: "모델 A", title: "콘텐츠 공급 · 신디케이션", sub: "대상 — 증권 · 핀테크 앱, 미디어, 뉴스레터, 커뮤니티" });
  d.table(
    ["", ""],
    [
      [{ t: "형태", b: true, c: C.ink }, "모닝 브리프 / 주간 브리핑 / 기업 분석을 정기 공급. 귀사 톤·분량에 맞춘 포맷 조정. 출처 표기 + 원문 링크백"],
      [{ t: "드리는 것", b: true, c: C.ink }, "사람 손 없이 매일 채워지는 국내주식 콘텐츠. 휴가도 슬럼프도 없습니다"],
      [{ t: "받는 것", b: true, c: C.ink }, "유입 채널과 브랜드 노출"],
      [{ t: "준비 기간", b: true, c: C.ink }, "2~4주 (포맷 협의 + 전달 방식 구축)"],
    ],
    { y: 2.3, colW: [2.2, 9.633], rowH: 0.78 },
  );
  s.addNotes("포맷 조정은 «표현 계층만»이라고 분명히 하세요. 엔진 출력 자체를 바꾸는 요구는 받지 않습니다.");

  // 모델 B
  s = d.light({ kicker: "모델 B · 지금 바로 가능", title: "전문가 파트너", sub: "대상 — 애널리스트 출신, 검증된 트레이더, 투자 크리에이터" });
  d.table(
    ["", ""],
    [
      [{ t: "형태", b: true, c: C.ink }, "「인사이트 · 전문가 추천」에 필명 코너. 엔진의 분석·차트·리포트를 근거 자료로 자유롭게 인용"],
      [{ t: "분리 원칙", b: true, c: C.ink }, { t: "전문가 글은 엔진 픽과 섞이지 않습니다 — 코너가 물리적으로 분리되고 필명이 함께 공개됩니다", b: true, c: C.ink }],
      [{ t: "드리는 것", b: true, c: C.ink }, "데이터 작업 없이 글에만 집중할 수 있는 근거 인프라와 독자"],
      [{ t: "절차", b: true, c: C.ink }, "가입 → 전문가 참여 신청(필명·참여 이유) → 운영자 검토 → 승인 → 집필"],
    ],
    { y: 2.3, colW: [2.2, 9.633], rowH: 0.72 },
  );
  d.callout(s, {
    y: 5.5, h: 0.8,
    title: "유료 확장은 순서를 지킵니다",
    body: "유료 추천·구독 형태로 확장할 경우, 유사투자자문업 신고 완료 후에 진행합니다.",
  });
  s.addNotes("이 모델만 오늘 바로 시작할 수 있습니다. 미팅 자리에서 신청까지 받을 수 있으면 가장 좋습니다.");

  // 모델 C
  s = d.light({ kicker: "모델 C", title: "엔진 · 데이터 연동 (API / 화이트라벨)", sub: "대상 — 자체 앱을 가진 증권 · 핀테크사, HTS/MTS 부가 서비스, 로보어드바이저" });
  d.table(
    ["공급 단위", "내용"],
    [
      [{ t: "팩터 · 밸류에이션 스코어", b: true, c: C.ink }, "종목별 5축(밸류·성장·수급·모멘텀·안정성) + 적정가"],
      [{ t: "시그널 · 가격 레벨", b: true, c: C.ink }, "셋업·기간별 진입 · 손절 · 목표 + 손익비"],
      [{ t: "백테스트 성적", b: true, c: C.ink }, "조합별 승률 · 손익비 · 기대값 · 최대낙폭 · 워크포워드"],
      [{ t: "포트폴리오 진단", b: true, c: C.ink }, "가중 베타 · 변동성 · 섹터 집중도 · 합성알파"],
      [{ t: "시황 · 리포트 텍스트", b: true, c: C.ink }, "브리프 · 리포트 본문"],
    ],
    { y: 2.3, colW: [3.6, 8.233], rowH: 0.52 },
  );
  d.callout(s, {
    y: 5.3, h: 1.15,
    title: "솔직하게 — 외부 공개 API는 아직 없습니다",
    body: "데이터와 계산은 전부 있고, 외부로 내보내는 계층을 만들면 됩니다. 파트너가 정해지면 그 요구에 맞춰 설계하는 편이 낫다고 봅니다.\n필요한 것은 상호 데이터 라이선스 확인, 인증 · SLA · 정산 구조 설계입니다.",
  });
  s.addNotes("여기서 솔직하게 «없다»고 말하는 것이 신뢰를 삽니다. 있다고 했다가 실사에서 걸리는 것보다 훨씬 낫습니다.");

  // 왜 우리와
  s = d.light({ kicker: "근거", title: "왜 우리와 하나" });
  d.cards(
    s,
    [
      { kick: "01", head: "콘텐츠가 사람에 묶여 있지 않습니다", body: "필자가 쉬어도 매 거래일 나옵니다. 공급이 끊기지 않는다는 뜻입니다." },
      { kick: "02", head: "틀린 것을 지우지 않습니다", body: "제휴사가 가장 두려워하는 것은 나중에 터지는 과장입니다. 우리는 과장할 구조를 갖고 있지 않습니다." },
      { kick: "03", head: "숫자와 서술이 분리돼 있습니다", body: "AI가 수치를 지어낼 자리가 없습니다. 모든 값은 DB 근거로 추적됩니다 — 규제·평판 리스크를 구조로 낮춥니다." },
      { kick: "04", head: "안 되는 전략은 스스로 끕니다", body: "장기 픽 발행 중단이 그 증거입니다. 성적이 죽은 전략을 계속 파는 서비스가 아닙니다." },
    ],
    { y: 2.15, h: 2.15, cols: 2 },
  );
  s.addNotes("네 개 다 «리스크를 줄여 준다»는 한 방향입니다. 제휴 담당자는 상승보다 사고를 두려워합니다.");

  // 컴플라이언스
  s = d.light({
    kicker: "법 · 규제",
    title: "컴플라이언스 상태",
    sub: "제휴 검토에서 가장 먼저 확인하실 항목이라 앞에 둡니다.",
  });
  d.table(
    ["항목", "현재"],
    [
      [{ t: "사업 성격", b: true, c: C.ink }, "불특정 다수 대상 정보 제공. 자금 미수탁 · 주문 미집행 · 일임 없음"],
      [{ t: "수익 보장 표현", b: true, c: C.ink }, { t: "전면 금지. 모든 화면·문서에 면책 명시", b: true, c: C.ink }],
      [{ t: "유사투자자문업 신고", b: true, c: C.ink }, { t: "유료 시그널 발행 전 완료 예정 — 유료 제휴는 이 이후", b: true, c: C.warn }],
      [{ t: "약관 · 개인정보처리방침", b: true, c: C.ink }, "게시 중 · 법률 검토 진행 예정"],
      [{ t: "개인정보", b: true, c: C.ink }, "이메일 비노출(닉네임만 공개) · 행 단위 접근 제어(RLS)"],
      [{ t: "데이터 라이선스", b: true, c: C.ink }, "원천 데이터 재배포 범위는 제휴 형태별로 사전 확인 필요"],
    ],
    { y: 2.25, colW: [3.4, 8.433], rowH: 0.5 },
  );
  s.addNotes("먼저 꺼내세요. 상대가 물어보게 두면 «숨겼다»가 됩니다.");

  // 절차
  s = d.dark({
    kicker: "절차",
    title: "파일럿을 먼저 하자고 제안드립니다",
    sub: "계약서보다 실제 산출물이 판단에 낫습니다.",
  });
  const steps = [
    ["1주차", "소개 미팅", "모델 A / B / C 중 방향 결정"],
    ["2주차", "NDA → 지표 공유", "운영 지표와 샘플 산출물을 실제로 보여드립니다"],
    ["3~4주차", "파일럿 범위 확정", "공급 항목 · 주기 · 표기 · 정산"],
    ["5주차~", "파일럿 운영 (4~8주)", "지표 리뷰 후 본계약 판단"],
  ];
  steps.forEach((st, i) => {
    const y = 2.75 + i * 0.95;
    s.addText(st[0], {
      x: M, y, w: 1.5, h: 0.34,
      fontFace: FONT, fontSize: 13, bold: true, color: C.amber, margin: 0, valign: "middle",
    });
    s.addText(st[1], {
      x: M + 1.7, y, w: 4.2, h: 0.34,
      fontFace: FONT, fontSize: 16, bold: true, color: C.white, margin: 0, valign: "middle",
    });
    s.addText(st[2], {
      x: M + 6.0, y, w: CW - 6.0, h: 0.34,
      fontFace: FONT, fontSize: 12, color: C.onNavy2, margin: 0, valign: "middle",
    });
    if (i < steps.length - 1) {
      s.addShape(d.p.ShapeType.line, {
        x: M, y: y + 0.62, w: CW, h: 0,
        line: { color: "2A3566", width: 1 },
      });
    }
  });
  s.addNotes("파일럿을 먼저 제안하는 쪽이 협상에서 유리합니다. 상대의 결정 부담이 확 내려갑니다.");

  // 열린 항목
  s = d.light({
    kicker: "미정",
    title: "협의가 필요한 열린 항목",
    sub: "숨기지 않고 먼저 적습니다.",
  });
  const open = [
    ["정산", "정액 / 트래픽 연동 / 레버뉴 셰어 중 미정", "규모와 형태가 정해져야 계산이 됩니다"],
    ["독점", "업종 내 독점 공급을 원하시면 조건 협의 필요", "기본은 비독점입니다"],
    ["API", "외부 공개 API 미구축", "파트너 요구사항에 맞춰 설계합니다"],
    ["라이선스", "원천 데이터 재배포 범위", "소스별로 확인이 필요합니다"],
    ["시점", "유료 제휴는 유사투자자문업 신고 완료 이후", "순서를 바꾸지 않겠습니다"],
  ];
  open.forEach((o, i) => {
    const y = 2.25 + i * 0.78;
    s.addShape(d.p.ShapeType.roundRect, {
      x: M, y: y + 0.04, w: 1.15, h: 0.34,
      rectRadius: 0.08, fill: { color: C.warnSoft }, line: { color: C.warnSoft, width: 0 },
    });
    s.addText(o[0], {
      x: M, y: y + 0.04, w: 1.15, h: 0.34,
      fontFace: FONT, fontSize: 11, bold: true, color: C.warn, align: "center", valign: "middle", margin: 0,
    });
    s.addText(o[1], {
      x: M + 1.35, y, w: CW - 1.35, h: 0.34,
      fontFace: FONT, fontSize: 14, bold: true, color: C.ink, margin: 0, valign: "middle",
    });
    s.addText(o[2], {
      x: M + 1.35, y: y + 0.34, w: CW - 1.35, h: 0.28,
      fontFace: FONT, fontSize: 11.5, color: C.mute, margin: 0, valign: "middle",
    });
  });
  s.addNotes("미정 항목을 먼저 꺼내면 «준비가 덜 됐다»가 아니라 «정직하다»로 읽힙니다. 실제로 뒤에서 터지는 것보다 훨씬 낫습니다.");

  // 마무리
  s = d.dark({ deepBg: true });
  s.addText("다음 단계", {
    x: M, y: 2.3, w: CW, h: 0.4,
    fontFace: FONT, fontSize: 13, bold: true, color: C.amber, charSpacing: 2, margin: 0,
  });
  s.addText("한 달짜리 파일럿부터\n시작하시죠.", {
    x: M, y: 2.85, w: Math.min(CW, 10), h: 1.6,
    fontFace: FONT, fontSize: 36, bold: true, color: C.white,
    margin: 0, valign: "top", lineSpacingMultiple: 1.25,
  });
  s.addText("계약서보다 실제 산출물이 판단에 낫습니다. 어떤 형태가 맞을지는 귀사가 가진 것을 듣고 정하겠습니다.", {
    x: M, y: 4.6, w: Math.min(CW, 9.6), h: 0.6,
    fontFace: FONT, fontSize: 14, color: C.onNavy2, margin: 0, valign: "top",
  });
  s.addShape(d.p.ShapeType.roundRect, {
    x: M, y: 5.35, w: 5.6, h: 0.85,
    rectRadius: 0.12, fill: { color: C.navy }, line: { color: "2A3566", width: 1 },
  });
  s.addText("담당 · 연락처를 여기에 넣어 주세요", {
    x: M + 0.3, y: 5.35, w: 5.0, h: 0.85,
    fontFace: FONT, fontSize: 12, color: C.onNavy3, margin: 0, valign: "middle",
  });
  s.addText(
    "본 문서에 기재된 분석·시그널·성과 관련 내용은 정보 제공 목적이며 투자 권유가 아닙니다. 과거 성과가 미래 수익을 보장하지 않습니다. 본 제안서는 협의를 위한 자료이며 그 자체로 계약상 의무를 발생시키지 않습니다.",
    {
      x: M, y: 6.45, w: Math.min(CW, 11), h: 0.7,
      fontFace: FONT, fontSize: 10, color: C.onNavy3, margin: 0, valign: "top", lineSpacingMultiple: 1.3,
    },
  );
  s.addNotes("연락처 칸은 비워 뒀습니다 — 발표 전에 채우세요.");

  return d.p;
}

// ══════════════════════════════════════════════════════════════════════════
// 덱 3 — 사용 설명 (회원 온보딩 · 교육)
// ══════════════════════════════════════════════════════════════════════════
function buildGuide() {
  const d = deck({
    subject: "사용 설명",
    title: "규칙대로 사고,\n규칙대로 나오는 법",
    subtitle:
      "어떤 화면이 무엇을 답하는지, 픽 카드의 숫자를 어떻게 읽는지,\n그리고 아직 안 되는 것은 무엇인지.",
    chips: ["회원 온보딩", "하루 5분", "2026-08-25 기준"],
    audience: "VECTA Stock 사용 설명",
  });

  d.titleSlide().addNotes("신규 회원 대상 15분 설명용입니다. 3분 요약과 픽 카드 읽는 법만 확실히 남기면 성공입니다.");

  // 3분 요약
  let s = d.dark({ kicker: "3분 요약", title: "이것만 알면 씁니다" });
  const facts = [
    ["16:30 KST", "장 마감 뒤 그날 종가로 전 종목을 다시 계산합니다"],
    ["발행 조건", "검증을 통과한 종목만 올라옵니다. 통과가 없으면 0건입니다"],
    ["픽에 붙는 것", "진입가 · 손절가 · 본전 도달가 · 권장 비중 · 보유 기간"],
    ["끝난 뒤", "결과가 성과 화면에 남습니다. 틀린 것도 지우지 않습니다"],
  ];
  facts.forEach((f, i) => {
    const x = M + (i % 2) * 5.95;
    const y = 2.3 + Math.floor(i / 2) * 1.5;
    s.addShape(d.p.ShapeType.roundRect, {
      x, y, w: 5.7, h: 1.25,
      rectRadius: 0.12, fill: { color: C.navy2 }, line: { color: "2A3566", width: 1 },
    });
    s.addText(f[0], {
      x: x + 0.32, y: y + 0.18, w: 5.06, h: 0.32,
      fontFace: FONT, fontSize: 12, bold: true, color: C.amber, charSpacing: 1.5, margin: 0, valign: "middle",
    });
    s.addText(f[1], {
      x: x + 0.32, y: y + 0.55, w: 5.06, h: 0.6,
      fontFace: FONT, fontSize: 13, color: C.white, margin: 0, valign: "top", lineSpacingMultiple: 1.3,
    });
  });
  s.addText("감이 아니라 규칙으로 사고, 규칙대로 나오고, 그 결과를 전부 남깁니다.", {
    x: M, y: 5.6, w: CW, h: 0.4,
    fontFace: FONT, fontSize: 14, italic: true, color: C.onNavy2, margin: 0,
  });
  s.addNotes("«0건이 정상»이라는 말을 여기서 반드시 하세요. 나중에 문의가 제일 많이 오는 지점입니다.");

  // 메뉴
  s = d.light({
    kicker: "화면",
    title: "메뉴 여덟 개, 질문 여덟 개",
    sub: "메뉴 이름이 곧 그 화면이 답하는 질문입니다. 홈을 뺀 나머지는 회원 전용입니다.",
  });
  d.table(
    ["메뉴", "이 화면이 답하는 질문"],
    [
      [{ t: "홈", b: true, c: C.ink }, "오늘 무슨 일이 있었나 — 요약 상태판"],
      [{ t: "오늘의 픽", b: true, c: C.indigo }, "그래서 뭘 사나 — 진입·손절·비중이 적힌 실행 계획"],
      [{ t: "스크리너", b: true, c: C.ink }, "조건으로 직접 찾아보고 싶다 — 탐색 도구(추천 아님)"],
      [{ t: "분석", b: true, c: C.ink }, "이 종목 어때 — 5축 진단과 리포트"],
      [{ t: "시장", b: true, c: C.ink }, "지금 장이 어떤 상태인가"],
      [{ t: "인사이트", b: true, c: C.ink }, "읽을 것 — 브리프 · 브리핑 · 전문가 글"],
      [{ t: "성과", b: true, c: C.ink }, "이 서비스가 잘하고 있나"],
      [{ t: "내 자산", b: true, c: C.ink }, "내 조합은 괜찮나 — 관심 · 진단 · 알림"],
    ],
    { y: 2.2, colW: [2.6, 9.233], rowH: 0.44 },
  );
  s.addText("모바일에서는 상단 메뉴 대신 화면 아래 탭바로 이동합니다.", {
    x: M, y: 6.15, w: CW, h: 0.3,
    fontFace: FONT, fontSize: 11.5, color: C.mute, margin: 0,
  });
  s.addNotes("여덟 개를 다 돌지 마세요. 「오늘의 픽」과 「성과」 둘만 보여줘도 충분합니다.");

  // 하루 루틴
  s = d.light({
    kicker: "루틴",
    title: "하루 5분이면 충분합니다",
    sub: "장을 들여다볼 필요가 없도록 설계돼 있습니다.",
  });
  const rout = [
    ["아침 1분", "홈", "모닝 브리프 한 줄과 진행 중인 픽 상태를 봅니다", C.indigo],
    ["장중", "할 일 없음", "진입은 다음 거래일 시가라 아침에 이미 끝났습니다", C.mute],
    ["저녁 3분", "오늘의 픽", "새 픽이 있으면 카드 네 칸을 위에서 아래로 읽습니다", C.indigo],
    ["주말 5분", "내 자산 · 성과", "집중도·베타를 점검하고 이번 주 끝난 픽을 확인합니다", C.indigo],
  ];
  rout.forEach((r, i) => {
    const y = 2.25 + i * 1.05;
    d.card(s, { x: M, y, w: CW, h: 0.88 });
    s.addText(r[0], {
      x: M + 0.32, y: y + 0.2, w: 1.5, h: 0.48,
      fontFace: FONT, fontSize: 13, bold: true, color: r[3], margin: 0, valign: "middle",
    });
    s.addText(r[1], {
      x: M + 2.0, y: y + 0.2, w: 2.6, h: 0.48,
      fontFace: FONT, fontSize: 15, bold: true, color: C.ink, margin: 0, valign: "middle",
    });
    s.addText(r[2], {
      x: M + 4.7, y: y + 0.2, w: CW - 5.0, h: 0.48,
      fontFace: FONT, fontSize: 12.5, color: C.dim, margin: 0, valign: "middle",
    });
  });
  s.addNotes("«장중 할 일 없음»이 이 제품의 성격입니다. 하루 종일 호가창을 보는 서비스가 아닙니다.");

  // 픽 카드 4칸
  s = d.light({
    kicker: "핵심",
    title: "픽 카드는 사기 전에 읽는 순서 그대로입니다",
    sub: "위에서 아래로 그냥 읽으면 됩니다.",
  });
  d.cards(
    s,
    [
      { kick: "① 먼저", head: "얼마에 사고 어디서 나오나", body: "진입가 · 손절가 · 본전 도달가 · 1주당 리스크 · 권장 비중" },
      { kick: "② 그다음", head: "왜 이 종목인가", body: "엔진이 고른 근거 문장. 원문 리포트까지 갈 수 있습니다" },
      { kick: "③ 그리고", head: "어떻게 사고 파나", body: "기간에 따라 한 번에 살지 나눠 살지가 다릅니다" },
      { kick: "④ 마지막", head: "이 조합의 검증 성적", body: "승률 · 손익비 · 거래당 기대값 · 최대낙폭" },
    ],
    { y: 2.2, h: 1.65, cols: 2 },
  );
  d.callout(s, {
    y: 5.75, h: 0.9,
    title: "카드에 이 넷이 다 없으면 그것은 추천이 아닙니다",
    body: "«무엇을 사라»만 있고 «어디서 나와라»가 없는 정보는 실행할 수 없습니다.",
    tone: "info",
  });
  s.addNotes("네 칸 구조를 먼저 심어 주면 다음 장표들이 훨씬 빨리 이해됩니다.");

  // 레벨
  s = d.light({
    kicker: "① 레벨",
    title: "여섯 개의 숫자",
    sub: "예시입니다. 실제 값은 종목마다 엔진이 계산합니다.",
  });
  d.stats(
    s,
    [
      { label: "진입가", value: "48,200", note: "다음 거래일 시가" },
      { label: "손절가", value: "43,980", note: "−8.8% · 전량 매도", tone: C.down },
      { label: "본전 도달가", value: "56,600", note: "손절이 본전으로", tone: C.up },
    ],
    { y: 2.15, h: 1.3 },
  );
  d.stats(
    s,
    [
      { label: "1주당 리스크", value: "4,220원", note: "진입 − 손절" },
      { label: "권장 비중", value: "11.4%", note: "계좌 리스크 1% 역산" },
      { label: "보유 기간", value: "10거래일", note: "기간이 끝나면 청산" },
    ],
    { y: 3.65, h: 1.3 },
  );
  d.callout(s, {
    y: 5.25, h: 1.3,
    title: "권장 비중은 이렇게 나옵니다",
    body: "손절가까지 −8.8%인 종목을 계좌의 11.4%만큼 사면, 손절에 걸려도 계좌 전체로는 딱 1%를 잃습니다.\n종목이 얼마나 흔들리느냐에 따라 비중이 자동으로 줄고 늘어납니다 — 몰빵을 막는 장치입니다.",
    tone: "info",
  });
  s.addNotes("«왜 11.4%인가»를 계산으로 보여주면 신뢰가 확 올라갑니다. 감으로 정한 숫자가 아닙니다.");

  // 기간
  s = d.light({
    kicker: "③ 매매",
    title: "기간이 사는 방법을 정합니다",
    sub: "같은 종목이라도 며칠 들고 갈지에 따라 사는 방법이 달라집니다.",
  });
  const tableBottom = d.table(
    ["기간", "보유", "사는 방법"],
    [
      [{ t: "단기", b: true, c: C.ink }, "최대 5거래일 (약 1주)", "다음 거래일 시가에 전량 매수"],
      [{ t: "중기", b: true, c: C.ink }, "최대 10거래일 (약 2주)", "시가 50% + 하락(−1×ATR) 시 50% 분할 매수"],
      [{ t: "장기 (발행 중단)", b: true, c: C.mute }, { t: "최대 20거래일", c: C.mute }, { t: "지금은 쉽니다 — 검증을 통과하지 못했습니다", c: C.mute }],
    ],
    { y: 2.25, colW: [2.6, 3.4, 5.833], rowH: 0.55 },
  );
  const sellTop = tableBottom + 0.28;
  s.addText("파는 순서", {
    x: M, y: sellTop, w: CW, h: 0.35,
    fontFace: FONT, fontSize: 16, bold: true, color: C.ink, margin: 0,
  });
  const sell = [
    ["손절가 이탈", "전량 매도 (무조건)", C.down],
    ["본전 도달가 터치", "손절선을 본전으로 올리고 계속 보유", C.up],
    ["기간 만료", "시장가 청산", C.mute],
  ];
  sell.forEach((r, i) => {
    const y = sellTop + 0.5 + i * 0.58;
    s.addShape(d.p.ShapeType.roundRect, {
      x: M, y, w: 3.2, h: 0.46,
      rectRadius: 0.1, fill: { color: C.soft }, line: { color: C.line, width: 1 },
    });
    s.addText(r[0], {
      x: M + 0.24, y, w: 2.9, h: 0.46,
      fontFace: FONT, fontSize: 12.5, bold: true, color: r[2], margin: 0, valign: "middle",
    });
    s.addText("→", {
      x: M + 3.35, y, w: 0.4, h: 0.46,
      fontFace: FONT, fontSize: 13, color: C.line2, margin: 0, valign: "middle",
    });
    s.addText(r[1], {
      x: M + 3.85, y, w: CW - 3.85, h: 0.46,
      fontFace: FONT, fontSize: 13, color: C.dim, margin: 0, valign: "middle",
    });
  });
  s.addNotes("분할 매수는 «떨어지면 더 산다»가 아니라 «미리 정해 둔 값에서만 더 산다»입니다. 물타기와 구분해 주세요.");

  // 목표가 경고 (dark)
  s = d.dark({ kicker: "가장 많이 하는 오해" });
  s.addText("목표가는\n“파는 신호”가 아닙니다", {
    x: M, y: 1.6, w: Math.min(CW, 10), h: 1.7,
    fontFace: FONT, fontSize: 38, bold: true, color: C.white,
    margin: 0, valign: "top", lineSpacingMultiple: 1.2,
  });
  s.addText(
    "본전 도달가에 닿으면 팔지 않습니다. 손절선만 본전으로 올린 뒤 기간까지 그대로 들고 갑니다.",
    {
      x: M, y: 3.5, w: Math.min(CW, 10.4), h: 0.55,
      fontFace: FONT, fontSize: 16, color: C.amber, margin: 0, valign: "top",
    },
  );
  s.addShape(d.p.ShapeType.roundRect, {
    x: M, y: 4.35, w: CW, h: 1.45,
    rectRadius: 0.12, fill: { color: C.navy2 }, line: { color: "2A3566", width: 1 },
  });
  s.addText(
    "12개 조합을 전부 비교했더니 예외 없이 이쪽이 나았습니다. 목표에서 팔면 크게 오를 종목의 이익을 스스로 잘라내기 때문입니다.\n\n파는 주체는 목표가가 아니라 기간입니다.",
    {
      x: M + 0.35, y: 4.5, w: CW - 0.7, h: 1.15,
      fontFace: FONT, fontSize: 13.5, color: C.onNavy2, margin: 0, valign: "middle", lineSpacingMultiple: 1.35,
    },
  );
  s.addText("이 한 장을 놓치면 실제 손익이 설명과 어긋납니다.", {
    x: M, y: 6.1, w: CW, h: 0.35,
    fontFace: FONT, fontSize: 12, color: C.onNavy3, margin: 0,
  });
  s.addNotes("문의가 가장 많이 오는 항목입니다. 여기서 질문을 받고 넘어가세요.");

  // 검증 성적
  s = d.light({
    kicker: "④ 성적",
    title: "승률이 낮은 것은 결함이 아닙니다",
    sub: "이 시스템은 승률이 아니라 기대값으로 굴러갑니다.",
  });
  d.stats(
    s,
    [
      { label: "승률", value: "43%", note: "100번 중 이긴 횟수" },
      { label: "이기면", value: "2.3배", note: "손익비" },
      { label: "거래당", value: "+0.35R", note: "평균 기대값", tone: C.pass },
      { label: "최대낙폭", value: "−18.2%", note: "계좌가 가장 줄었던 폭", tone: C.down },
    ],
    { y: 2.2, h: 1.35 },
  );
  d.card(s, { x: M, y: 3.8, w: CW, h: 1.15 });
  s.addText(
    "“10번 중 6번은 손실로 끝납니다. 대신 이길 때 2.3배 벌어서, 4,220원을 걸면 한 번당 평균 +1,477원이 남았습니다.”",
    {
      x: M + 0.4, y: 3.98, w: CW - 0.8, h: 0.8,
      fontFace: FONT, fontSize: 14.5, italic: true, color: C.ink,
      margin: 0, valign: "middle", lineSpacingMultiple: 1.3,
    },
  );
  d.callout(s, {
    y: 5.15, h: 1.3,
    title: "승률을 억지로 올리면 돈을 잃습니다",
    body: "13만 건 규모의 실험에서 확인했습니다. 손절이 잦은 것은 고칠 대상이 아니라 이 설계의 산술적 결과입니다.\n모든 수치는 수수료·세금·슬리피지를 뺀 값이며, 과거 데이터로 잰 것이라 미래 수익을 보장하지 않습니다.",
  });
  s.addNotes("«손절이 많아요»라는 불만이 오면 이 장표로 돌아오세요. 정상 동작입니다.");

  // 성과 상태
  s = d.light({
    kicker: "성과",
    title: "여섯 가지 상태, 그리고 승률의 정의",
    sub: "발행한 픽이 어떻게 끝났는지 전부 남습니다.",
  });
  d.table(
    ["상태", "뜻", "성적에 들어가나"],
    [
      [{ t: "진행중", b: true, c: C.warn }, "아직 안 끝남", { t: "—", c: C.mute }],
      [{ t: "목표 도달", b: true, c: C.up }, "이익으로 종료", "들어감"],
      [{ t: "손절", b: true, c: C.down }, "손실로 종료", "들어감"],
      [{ t: "만료", b: true, c: C.dim }, "기간이 끝나 청산", "들어감"],
      [{ t: "미체결", b: true, c: C.mute }, "진입가에 끝내 안 닿아 살 수 없었던 픽", { t: "안 들어감", b: true, c: C.ink }],
      [{ t: "규칙 교체 정리", b: true, c: C.mute }, "규칙이 바뀌어 우리가 닫은 픽", "들어감 (숨기지 않음)"],
    ],
    { y: 2.25, colW: [2.8, 6.0, 3.033], rowH: 0.48 },
  );
  d.callout(s, {
    y: 5.5, h: 0.9,
    title: "승률 = 수익으로 끝난 거래 ÷ 끝난 거래",
    body: "미체결은 분모에 넣지 않습니다 — 살 수 없었던 것을 성적으로 세면 거짓말이 됩니다.",
    tone: "info",
  });
  s.addNotes("«미체결»을 성적에서 빼는 이유를 설명하세요. 유리하게 세려면 넣는 게 이득인데도 뺐습니다.");

  // 용어
  s = d.light({
    kicker: "용어",
    title: "화면에 나오는 말",
    sub: "이것만 알면 나머지는 읽힙니다.",
  });
  const terms = [
    ["1R", "한 번 거래에 거는 돈 = 진입가 − 손절가"],
    ["기대값(R)", "한 번 거래할 때 평균 몇 R을 버나"],
    ["손익비", "이길 때 버는 폭 ÷ 질 때 잃는 폭"],
    ["최대낙폭", "따라가는 동안 계좌가 가장 줄었던 폭"],
    ["셋업", "매수 이유의 종류 (돌파 · 눌림목 · 쌍바닥 등)"],
    ["국면(레짐)", "지금 장의 성격 (강세 / 중립 / 약세)"],
    ["ATR", "이 종목이 하루에 보통 움직이는 폭"],
    ["거래 부적합", "지금은 살 이유가 없다는 판정 (나쁜 회사 아님)"],
  ];
  terms.forEach((t, i) => {
    const x = M + (i % 2) * 5.95;
    const y = 2.2 + Math.floor(i / 2) * 0.95;
    d.card(s, { x, y, w: 5.7, h: 0.78 });
    s.addText(t[0], {
      x: x + 0.28, y: y + 0.14, w: 5.14, h: 0.28,
      fontFace: FONT, fontSize: 13, bold: true, color: C.indigo, margin: 0, valign: "middle",
    });
    s.addText(t[1], {
      x: x + 0.28, y: y + 0.42, w: 5.14, h: 0.28,
      fontFace: FONT, fontSize: 11.5, color: C.dim, margin: 0, valign: "middle",
    });
  });
  s.addNotes("전부 읽지 말고 1R과 기대값 둘만 설명하세요. 나머지는 화면에서 마주칠 때 찾아보면 됩니다.");

  // 안 되는 것 + 하지 않는 일
  s = d.dark({ kicker: "솔직하게", title: "아직 안 되는 것 · 하지 않는 일" });
  const cant = [
    ["장기(20일) 픽 발행", "검증 미통과로 쉬는 중"],
    ["알림 설정 저장 · 외부 발송", "준비 중 — 화면 안 피드로만"],
    ["관심 종목 「오늘의 변화」", "미구현"],
    ["결제 · 유료 플랜", "없음 (전 기능 무료)"],
    ["미국 주식", "미지원 — KOSPI · KOSDAQ만"],
  ];
  s.addText("아직 안 되는 것", {
    x: M, y: 2.2, w: 5.7, h: 0.34,
    fontFace: FONT, fontSize: 14, bold: true, color: C.amber, margin: 0,
  });
  cant.forEach((r, i) => {
    const y = 2.68 + i * 0.62;
    s.addText(r[0], {
      x: M, y, w: 5.7, h: 0.28,
      fontFace: FONT, fontSize: 12.5, bold: true, color: C.white, margin: 0, valign: "middle",
    });
    s.addText(r[1], {
      x: M, y: y + 0.26, w: 5.7, h: 0.26,
      fontFace: FONT, fontSize: 10.5, color: C.onNavy3, margin: 0, valign: "middle",
    });
  });
  s.addText("하지 않는 일", {
    x: M + 6.2, y: 2.2, w: 5.6, h: 0.34,
    fontFace: FONT, fontSize: 14, bold: true, color: C.amber, margin: 0,
  });
  const never = [
    "자금을 맡아 두지 않습니다",
    "매매를 대신하지 않습니다",
    "증권 계좌에 주문을 넣지 않습니다",
    "개별 맞춤 자문이 아닙니다",
    "수익을 보장하지 않습니다",
  ];
  never.forEach((t, i) => {
    const y = 2.68 + i * 0.62;
    s.addText("✕", {
      x: M + 6.2, y, w: 0.3, h: 0.3,
      fontFace: FONT, fontSize: 12, bold: true, color: "FF7A87", margin: 0, valign: "middle",
    });
    s.addText(t, {
      x: M + 6.55, y, w: 5.2, h: 0.3,
      fontFace: FONT, fontSize: 12.5, color: C.onNavy2, margin: 0, valign: "middle",
    });
  });
  s.addText(
    "본 서비스가 제공하는 분석·시그널·투자의견은 정보 제공 목적이며 투자 권유가 아닙니다. 과거 성과가 미래 수익을 보장하지 않으며, 모든 투자 판단과 책임은 투자자 본인에게 있습니다.",
    {
      x: M, y: 6.2, w: Math.min(CW, 11), h: 0.6,
      fontFace: FONT, fontSize: 10, color: C.onNavy3, margin: 0, valign: "top", lineSpacingMultiple: 1.3,
    },
  );
  s.addNotes("«안 되는 것»을 먼저 말하는 온보딩은 드뭅니다. 그래서 오래 남습니다.");

  return d.p;
}

// ── 실행 ──────────────────────────────────────────────────────────────────
await mkdir(OUT, { recursive: true });

const DECKS = [
  { name: "vecta-service-overview.pptx", build: buildOverview },
  { name: "vecta-partnership-proposal.pptx", build: buildPartnership },
  { name: "vecta-user-guide.pptx", build: buildGuide },
];

/**
 * 음수 크기 검사 — PowerPoint 가 파일 열기를 거부하는 가장 흔한 원인이다.
 * validate.py 도 LibreOffice 도 통과시키므로 여기서 직접 본다.
 */
async function assertNoNegativeExtents(file) {
  const { readFile } = await import("node:fs/promises");
  const JSZip = require("jszip"); // pptxgenjs 가 이미 쓰는 라이브러리
  const zip = await JSZip.loadAsync(await readFile(file));
  const bad = [];
  const names = Object.keys(zip.files).filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(n),
  );
  for (const name of names) {
    const xml = await zip.files[name].async("string");
    for (const m of xml.matchAll(/<a:ext cx="(-?\d+)" cy="(-?\d+)"\s*\/>/g)) {
      // 0 은 정상이다 — spTree 의 그룹 속성(<a:ext cx="0" cy="0"/>)이 항상 그렇다.
      // 파일을 못 열게 만드는 것은 **음수**뿐이다.
      if (Number(m[1]) < 0 || Number(m[2]) < 0) bad.push(`${name} ${m[0]}`);
    }
  }
  if (bad.length) {
    const list = bad.slice(0, 5).map((b) => `  ${b}`).join("\n");
    throw new Error(
      `음수/0 크기 도형 ${bad.length}개 — PowerPoint 가 이 파일을 열지 못한다:\n${list}`,
    );
  }
}

for (const dk of DECKS) {
  const pres = dk.build();
  const file = join(OUT, dk.name);
  await pres.writeFile({ fileName: file });
  await assertNoNegativeExtents(file);
  console.log(`  ${dk.name}`);
}
console.log(`\ndocs/web/dist 갱신 완료 — 덱 ${DECKS.length}개`);
