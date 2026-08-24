import Link from "next/link";

import { Article, Bullets, LegalDoc, LegalTable } from "@/components/LegalDoc";
import { biz, COLLECTED, GENERATED, PROCESSORS } from "@/lib/legal";

/**
 * 개인정보처리방침.
 *
 * 수집 항목은 **가입 폼과 같은 목록**을 쓴다(lib/legal.COLLECTED). 두 곳에 따로
 * 적으면 폼에 칸을 하나 더 만드는 날 방침이 조용히 거짓이 된다.
 *
 * 국외 이전을 숨기지 않는다 — 저장소(Supabase)와 호스팅(Vercel)이 해외다. 이걸
 * 안 적는 방침이 흔한데, 그건 안 적는 게 아니라 틀린 것이다.
 */
export const metadata = {
  title: "개인정보처리방침 — VECTA Stock",
  description: "VECTA Stock이 수집하는 개인정보와 그 처리 방법",
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="개인정보처리방침"
      intro="무엇을 받고, 왜 받고, 언제 지우는지 적었습니다. 받지 않는 것도 함께 적었습니다."
    >
      <Article no="1" title="무엇을 받나">
        <p>가입할 때 회원이 직접 입력하는 것입니다. 모두 필수 항목입니다.</p>
        <LegalTable
          head={["항목", "쓰는 곳"]}
          rows={COLLECTED.map((c) => [c.item, c.why])}
        />
        <p>서비스를 쓰는 동안 자동으로 쌓이는 것은 다음과 같습니다.</p>
        <LegalTable
          head={["항목", "쓰는 곳"]}
          rows={GENERATED.map((c) => [c.item, c.why])}
        />
      </Article>

      <Article no="2" title="받지 않는 것">
        <p>
          다음은 <b className="font-semibold text-text">수집하지 않습니다.</b> 서비스가 하는 일에
          필요하지 않기 때문입니다.
        </p>
        <Bullets
          items={[
            "주민등록번호·여권번호 등 고유식별정보",
            "계좌번호·카드번호 등 금융거래정보 (회사는 자금을 맡지 않습니다)",
            "증권사 로그인 정보 (회사는 매매를 대신하지 않습니다)",
            "보유 종목·매매 내역 — 회원이 직접 저장한 관심 종목 외에는 받지 않습니다",
          ]}
        />
      </Article>

      <Article no="3" title="왜 받나 (처리 목적)">
        <Bullets
          items={[
            "회원 식별과 로그인",
            "서비스 제공 및 회원이 저장한 설정의 보관",
            "서비스 중단·약관 변경 등 중요한 사항의 공지",
            "부정 이용 방지와 장애 대응",
          ]}
        />
        <p>
          광고·마케팅 목적으로는 쓰지 않습니다. 이 목적이 생기면 별도로 동의를 받고,
          동의하지 않아도 서비스 이용에는 아무 제한이 없습니다.
        </p>
      </Article>

      <Article no="4" title="얼마나 갖고 있나">
        <Bullets
          items={[
            <>
              <b className="font-semibold text-text">회원 탈퇴 시 지체 없이 파기</b>합니다. 복구할 수
              없는 방법으로 지웁니다.
            </>,
            "다만 법령이 보관을 요구하는 경우 그 기간 동안만 따로 보관합니다(예: 전자상거래법상 거래 기록, 통신비밀보호법상 접속 기록).",
            "1년 이상 로그인하지 않은 계정은 별도로 분리 보관하거나 파기할 수 있으며, 그 전에 이메일로 알립니다.",
          ]}
        />
      </Article>

      <Article no="5" title="누구에게 맡기나 (처리 위탁·국외 이전)">
        <p>
          서비스를 운영하기 위해 아래 업체의 인프라를 씁니다. 회원 정보가 해당 업체의
          서버에 저장되며, <b className="font-semibold text-text">그 서버는 국외에 있습니다.</b>
        </p>
        <LegalTable
          head={["받는 곳", "하는 일", "위치"]}
          rows={PROCESSORS.map((p) => [p.name, p.role, p.country])}
        />
        <p>
          위탁받은 업체는 서비스 운영에 필요한 범위에서만 정보를 처리하며, 회사는 이를
          계약으로 정하고 있습니다. 그 밖의 제3자에게 개인정보를 제공하거나 판매하지
          않습니다. 법령에 따른 수사기관의 적법한 요청이 있는 경우에만 예외입니다.
        </p>
      </Article>

      <Article no="6" title="회원이 할 수 있는 것">
        <Bullets
          items={[
            "언제든지 자신의 개인정보를 열람하고 고칠 수 있습니다.",
            "처리 정지를 요구하거나 탈퇴할 수 있습니다.",
            "요구는 아래 문의처로 받고, 받은 날부터 10일 안에 처리합니다.",
          ]}
        />
      </Article>

      <Article no="7" title="어떻게 지키나">
        <Bullets
          items={[
            "비밀번호는 복호화할 수 없는 형태로 저장합니다. 회사도 회원의 비밀번호를 볼 수 없습니다.",
            "회원 정보는 데이터베이스 수준의 접근 제어(RLS)로 보호합니다 — 본인 외에는 조회되지 않습니다.",
            "전송 구간은 전부 암호화(HTTPS)합니다.",
            "개인정보를 다루는 인원을 최소한으로 두고, 접근 기록을 남깁니다.",
          ]}
        />
      </Article>

      <Article no="8" title="쿠키">
        <p>
          로그인 상태를 유지하기 위해 쿠키를 씁니다. 광고 목적의 추적 쿠키는 쓰지
          않습니다. 브라우저 설정에서 쿠키를 거부할 수 있으나, 그 경우 로그인이 유지되지
          않습니다.
        </p>
      </Article>

      <Article no="9" title="만 14세 미만">
        <p>만 14세 미만 아동은 가입할 수 없으며, 개인정보를 수집하지 않습니다.</p>
      </Article>

      <Article no="10" title="문의처">
        <Bullets
          items={[
            <>개인정보 보호책임자: {biz("privacyOfficer")}</>,
            <>문의: {biz("contactEmail")}</>,
            <>상호: {biz("company")} · 대표자: {biz("ceo")}</>,
          ]}
        />
        <p className="text-[13px] text-text-mute">
          개인정보 침해로 도움이 필요하시면 개인정보침해신고센터(privacy.kisa.or.kr,
          국번없이 118) 등에 문의하실 수 있습니다.{" "}
          <Link href="/terms" className="text-accent hover:underline">
            이용약관
          </Link>
          도 함께 확인해 주세요.
        </p>
      </Article>

      <Article no="11" title="방침이 바뀌면">
        <p>
          내용이 바뀌면 시행일 7일 전까지 서비스 화면에 공지합니다. 회원에게 불리한
          변경은 30일 전에 알리고, 필요한 경우 다시 동의를 받습니다.
        </p>
      </Article>
    </LegalDoc>
  );
}
