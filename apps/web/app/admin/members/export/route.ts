import { getMembers, isAdmin } from "@/lib/admin";

/**
 * 회원 명단 CSV 내려받기 — 운영자만(2026-08-25 Victor 요청).
 *
 * 세 가지가 이 파일의 전부다. 셋 다 «안 하면 조용히 망가지는» 것들이라 적어 둔다.
 *
 * ## 1. BOM 이 없으면 엑셀에서 한글이 깨진다
 *
 * 엑셀은 CSV 를 열 때 인코딩을 스스로 추측하는데, UTF-8 이라는 표시가 없으면 시스템
 * 기본(한국 윈도우는 CP949)으로 읽는다. 그러면 「남산자산」이 「?????」이 된다.
 * 맨 앞에 BOM(﻿) 한 글자를 붙이면 엑셀이 UTF-8 로 읽는다. 텍스트 편집기에서도
 * 문제없다.
 *
 * ## 2. =, +, -, @ 로 시작하는 값은 엑셀이 «수식»으로 실행한다
 *
 * 닉네임을 `=1+1` 로 지은 사람이 있으면 그 칸이 2 가 되고, `=HYPERLINK(...)` 같은
 * 것을 넣으면 파일을 여는 사람의 엑셀에서 그게 동작한다(CSV injection). 회원이 직접
 * 적는 값(닉네임·이메일)이 그대로 파일에 들어가므로 반드시 막아야 한다 — 앞에
 * 작은따옴표를 붙여 문자열로 고정한다.
 *
 * ## 3. 권한은 여기서도 본다
 *
 * 미들웨어는 «로그인했는가»까지만 본다. 운영자가 아닌 회원이 이 주소를 알면 전 회원
 * 명단을 받아 갈 수 있으므로 여기서 한 번 더 막는다. 실제 방어는 DB 함수가 한다
 * (admin_members 가 is_admin() 을 본다) — 이건 그 앞의 문이다.
 */

/** 엑셀이 수식으로 읽는 앞글자를 막고, 따옴표·쉼표·줄바꿈을 CSV 규칙대로 감싼다. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** 2026-08-25 09:12 — 엑셀이 날짜로 읽게 하지 않고 사람이 읽는 문자열로 둔다. */
function kst(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const HEADERS = [
  "닉네임",
  "이메일",
  "연락처",
  "가입일(KST)",
  "메일확인",
  "등급",
  "전문가",
  "운영자",
  "약관동의(KST)",
  "동의문서판",
];

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return new Response("권한이 없습니다.", { status: 403 });
  }

  const q = new URL(req.url).searchParams.get("q");
  // 화면과 같은 조건으로 받는다 — 검색해 놓고 내려받으면 «보고 있는 것»이 나와야 한다.
  const members = await getMembers(q, 5000);

  const rows = members.map((m) =>
    [
      m.displayName,
      m.email,
      m.phone,
      kst(m.createdAt),
      m.emailConfirmed ? "완료" : "미확인",
      m.tier,
      m.expertName ?? "",
      m.isAdmin ? "예" : "",
      kst(m.termsAgreedAt),
      m.agreedDocVersion,
    ]
      .map(cell)
      .join(","),
  );

  // 줄바꿈은 CRLF — 엑셀이 기대하는 형식이다.
  const csv = "﻿" + [HEADERS.join(","), ...rows].join("\r\n") + "\r\n";

  // 파일명에 한글을 쓰되 ASCII 대체 이름을 같이 준다(filename* 를 못 읽는 옛 도구용).
  const day = kst(new Date().toISOString()).slice(0, 10);
  const name = `VECTA_회원명단_${day}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="vecta-members-${day}.csv"; ` +
        `filename*=UTF-8''${encodeURIComponent(name)}`,
      // 회원 명단이다. 중간 캐시에 남기지 않는다.
      "Cache-Control": "no-store",
    },
  });
}
