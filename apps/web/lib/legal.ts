/**
 * 약관·방침의 단일 출처.
 *
 * 2026-08-24 Victor: "개인정보 수집 이용에 동의한다고 하면 이용약관이나 이런 것들이
 * 있어야 하는 거 아닌가?" — 맞다. 동의 대상 문서가 없으면 그 동의는 성립하지 않는다.
 *
 * ## 버전을 상수로 두는 이유
 *
 * 동의는 «언제, 무엇에» 동의했는지가 남아야 증빙이 된다. 문서를 고칠 때마다 버전을
 * 올리고, 가입 시 그 버전을 함께 저장한다(profiles.agreed_doc_version). 문서만 고치고
 * 버전을 안 올리면, 나중에 «이 사람은 어떤 문장에 동의했나»를 아무도 알 수 없다.
 *
 * ## ⚠️ 채워야 하는 값
 *
 * 아래 BUSINESS 는 **비어 있다.** 상호·대표자·사업자등록번호·유사투자자문업 신고번호·
 * 주소·개인정보 보호책임자는 실제 값이 정해지기 전까지 적지 않는다 — 법적 고지에
 * 가짜를 넣는 것은 없는 것보다 나쁘다. 화면은 빈 항목을 「확정 후 기재」로 보여준다.
 *
 * 실제 회원을 받기 전에 (1) 이 값들을 채우고 (2) 변호사 검토를 받아야 한다.
 * 이 문서는 서비스가 실제로 하는 일을 근거로 쓴 초안이지 법률 자문이 아니다.
 */

export const LEGAL_VERSION = "2026-08-24";
/** 시행일 — 실제 회원을 받기 시작하는 날로 바꾼다. */
export const LEGAL_EFFECTIVE = "2026-08-24";

export const BUSINESS = {
  serviceName: "VECTA Stock",
  /** 상호 */
  company: "",
  /** 대표자 */
  ceo: "",
  /** 사업자등록번호 */
  bizNo: "",
  /** 유사투자자문업 신고번호 (금융감독원) */
  advisoryNo: "",
  address: "",
  /** 개인정보 보호책임자 */
  privacyOfficer: "",
  contactEmail: "",
} as const;

export type BusinessKey = keyof typeof BUSINESS;

/** 아직 정해지지 않은 값은 «있는 척»하지 않는다. */
export function biz(key: BusinessKey): string {
  return BUSINESS[key] || "확정 후 기재";
}

/** 수집 항목 — 가입 폼과 방침이 **같은 목록**을 말해야 한다. */
export const COLLECTED = [
  { item: "닉네임", why: "화면에 보이는 이름", required: true },
  { item: "연락처", why: "본인 확인, 서비스 중요 공지", required: true },
  { item: "이메일", why: "계정 식별, 로그인, 공지 발송", required: true },
  { item: "비밀번호", why: "로그인 (복호화 불가능한 형태로 저장)", required: true },
] as const;

/** 서비스를 쓰는 동안 자동으로 쌓이는 것. 가입 때 입력받는 것과 성격이 다르다. */
export const GENERATED = [
  { item: "관심 종목·알림 설정·리스크 설정", why: "사용자가 저장한 설정" },
  { item: "접속 기록(IP·시각·브라우저 정보)", why: "부정 이용 방지, 장애 대응" },
] as const;

/** 처리 위탁 — 국외 이전이 포함되므로 반드시 밝힌다. */
export const PROCESSORS = [
  {
    name: "Supabase",
    role: "회원 정보·서비스 데이터 저장, 인증 메일 발송",
    country: "미국 등 (리전 확정 후 기재)",
  },
  {
    name: "Vercel",
    role: "웹 서비스 호스팅",
    country: "미국 등 (리전 확정 후 기재)",
  },
] as const;
