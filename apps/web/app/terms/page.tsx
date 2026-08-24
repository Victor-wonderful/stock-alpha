import Link from "next/link";

import { Article, Bullets, LegalDoc } from "@/components/LegalDoc";
import { biz } from "@/lib/legal";

/**
 * 이용약관.
 *
 * 문장은 이 서비스가 **실제로 하는 일**에서 나왔다. 다른 회사 약관을 옮겨 오면
 * 하지도 않는 일(자금 수탁·일임매매·자동주문)에 대한 조항이 따라 들어오고, 그건
 * 우리가 그런 일을 한다는 오해를 만든다. 가장 중요한 조항이 제5조다 — 우리가
 * **무엇을 하지 않는지**.
 */
export const metadata = {
  title: "이용약관 — VECTA Stock",
  description: "VECTA Stock 서비스 이용약관",
};

export default function TermsPage() {
  return (
    <LegalDoc
      title="이용약관"
      intro="VECTA Stock(이하 「서비스」)을 이용하는 데 적용되는 약속입니다. 가입하시면 이 약관에 동의한 것으로 봅니다."
    >
      <Article no="제1조" title="목적">
        <p>
          이 약관은 {biz("company")}(이하 「회사」)가 제공하는 서비스의 이용 조건과
          절차, 회사와 회원의 권리·의무를 정합니다.
        </p>
      </Article>

      <Article no="제2조" title="서비스가 하는 일">
        <p>서비스는 국내 주식에 관한 다음의 정보를 제공합니다.</p>
        <Bullets
          items={[
            "공개된 시세·재무·공시 데이터를 가공한 지표와 점수",
            "규칙과 백테스트로 산출한 시그널·추천 종목과 그 진입가·손절가",
            "시장 상황과 종목에 대한 분석 리포트",
            "회원이 저장한 관심 종목·알림·리스크 설정의 보관",
          ]}
        />
        <p>
          제공되는 모든 정보는 <b className="font-semibold text-text">불특정 다수를 대상으로 한 투자 참고 정보</b>
          이며, 개별 회원의 재산 상태·투자 목적을 반영한 맞춤 자문이 아닙니다.
        </p>
      </Article>

      <Article no="제3조" title="회원 가입">
        <Bullets
          items={[
            "가입 시 닉네임·연락처·이메일·비밀번호를 받습니다. 개인정보의 처리는 개인정보처리방침에 따릅니다.",
            "만 14세 미만은 가입할 수 없습니다.",
            "타인의 정보를 도용하거나 허위로 기재한 경우 이용을 제한할 수 있습니다.",
            "회원은 언제든지 탈퇴할 수 있습니다.",
          ]}
        />
      </Article>

      <Article no="제4조" title="요금">
        <p>
          현재 서비스는 무료로 제공합니다. 유료 서비스를 도입하는 경우 적용 대상·금액·
          결제·환불 조건을 <b className="font-semibold text-text">사전에 공지</b>하고, 회원이 동의한 경우에만
          적용합니다. 기존에 무료로 쓰던 기능을 소급해 유료로 바꾸지 않습니다.
        </p>
      </Article>

      <Article no="제5조" title="회사가 하지 않는 일 (가장 중요합니다)">
        <Bullets
          items={[
            <>
              <b className="font-semibold text-text">자금을 맡지 않습니다.</b> 회사는 회원의 돈을
              받거나 보관하지 않습니다.
            </>,
            <>
              <b className="font-semibold text-text">매매를 대신하지 않습니다.</b> 주문은 회원이 직접
              증권사를 통해 냅니다. 회사는 일임매매를 하지 않습니다.
            </>,
            <>
              <b className="font-semibold text-text">개별 맞춤 자문을 하지 않습니다.</b> 제공되는 정보는
              모든 회원에게 동일하게 제공되는 것이며, 특정 회원의 사정에 맞춘 것이 아닙니다.
            </>,
            <>
              <b className="font-semibold text-text">수익을 약속하지 않습니다.</b> 화면의 모든 수치는
              과거 데이터로 계산한 것이고, 과거 성과는 미래 수익을 보장하지 않습니다.
            </>,
          ]}
        />
      </Article>

      <Article no="제6조" title="회원의 책임">
        <Bullets
          items={[
            "투자 판단과 그 결과에 대한 책임은 회원 본인에게 있습니다.",
            "계정 정보를 다른 사람에게 알려주거나 빌려줄 수 없습니다.",
            "서비스의 정보를 회사의 사전 동의 없이 복제·배포·재판매할 수 없습니다.",
            "자동화된 수단으로 서비스에 과도한 부하를 주는 행위를 할 수 없습니다.",
          ]}
        />
      </Article>

      <Article no="제7조" title="데이터의 한계">
        <p>
          가격·재무·공시 데이터는 KRX·DART·네이버금융·FRED 등 외부에서 받아 가공합니다.
          원천의 지연·누락·오류가 그대로 반영될 수 있으며, 화면의 값은 표시된 기준일
          시점의 것입니다. 회사는 데이터의 정확성·완전성을 보증하지 않습니다.
        </p>
      </Article>

      <Article no="제8조" title="서비스의 중단">
        <p>
          점검·장애·천재지변 등으로 서비스가 일시 중단될 수 있습니다. 예정된 점검은
          미리 공지하며, 예기치 못한 중단은 사유를 사후에 알립니다.
        </p>
      </Article>

      <Article no="제9조" title="책임의 한계">
        <p>
          회사는 회원의 투자 손실에 대해 책임지지 않습니다. 다만 회사의 고의 또는 중대한
          과실로 회원에게 손해가 발생한 경우에는 관련 법령에 따라 책임을 집니다. 이 조항은
          법령이 인정하는 회원의 권리를 제한하지 않습니다.
        </p>
      </Article>

      <Article no="제10조" title="약관의 변경">
        <p>
          약관을 변경할 때는 시행일 7일 전(회원에게 불리한 변경은 30일 전)까지 서비스
          화면에 공지합니다. 변경에 동의하지 않으면 탈퇴할 수 있습니다.
        </p>
      </Article>

      <Article no="제11조" title="분쟁">
        <p>
          이 약관은 대한민국 법에 따릅니다. 회사와 회원 사이에 분쟁이 생기면 먼저 협의로
          해결하고, 소송이 필요한 경우 민사소송법에 따른 관할 법원에 제기합니다.
        </p>
      </Article>

      <Article no="사업자 정보" title="">
        <Bullets
          items={[
            <>상호: {biz("company")}</>,
            <>대표자: {biz("ceo")}</>,
            <>사업자등록번호: {biz("bizNo")}</>,
            <>유사투자자문업 신고번호: {biz("advisoryNo")}</>,
            <>주소: {biz("address")}</>,
            <>문의: {biz("contactEmail")}</>,
          ]}
        />
        <p className="text-[13px] text-text-mute">
          개인정보의 처리에 관한 사항은{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            개인정보처리방침
          </Link>
          을 확인해 주세요.
        </p>
      </Article>
    </LegalDoc>
  );
}
