import Link from "next/link";

import { AppShell } from "@/components/AppShell";

/**
 * 자주 묻는 질문 — **가입 전에 읽는 화면**이라 공개다(middleware.ts 공개 목록).
 *
 * 2026-08-24: 홈을 뺀 전 화면이 회원 전용이 되면서 «가입하면 뭐가 열리는지»를 말할
 * 자리가 필요해졌다. 그 말을 처음엔 홈에, 다음엔 푸터 배너에 넣었다가 둘 다 물렸다
 * (Victor: "회원 가입시에 어떤 혜택이 있는지 이런 내용에 대해서는 FAQ나 이런 내용으로
 * 해놓고, 로그인, 회원가입 이건 상단에 해놔야지").
 *
 * 맞는 구조다. **버튼과 설명은 다른 물건**이다 —
 *   버튼(로그인·회원가입)  머리에 상시. 어느 화면에서든 한 번에 닿아야 한다
 *   설명(무엇이 열리나)     여기. 궁금한 사람만 읽으러 온다
 * 설명을 버튼 옆에 붙이면 매 화면마다 같은 문단을 스크롤로 지나가게 된다.
 *
 * ⚠️ 답에 **없는 사실을 쓰지 않는다**. 배치 시각(08:30·16:30 KST)은 engine/cli 의
 * 실제 스케줄이고, 진입 시점은 발행 다음 거래일 시가다. 관심 종목·알림 저장은 아직
 * 만들지 않았으므로 «곧»이라고도 쓰지 않는다 — 기능이 생기면 그때 항목을 늘린다.
 */
export const metadata = {
  title: "자주 묻는 질문 — VECTA Stock",
  description:
    "회원가입하면 무엇이 열리는지, 숫자는 어떻게 계산되는지, 이 서비스가 하지 않는 일은 무엇인지.",
};

interface QA {
  q: string;
  a: React.ReactNode;
}

const QAS: QA[] = [
  {
    q: "회원가입하면 무엇이 열리나요?",
    a: (
      <>
        <p>
          홈을 뺀 모든 화면이 열립니다. 홈은 오늘 무슨 일이 있었는지 요약해 보여주고,
          나머지는 그 근거와 전부를 담고 있습니다.
        </p>
        <ul className="mt-3 space-y-1.5">
          {[
            ["오늘의 픽", "발행된 종목 전부와 선정 과정, 진입가·손절가·비중·청산 기한"],
            ["스크리너", "발행 중인 시그널을 조건으로 걸러 찾기"],
            ["분석", "종목별 5축 진단과 밸류에이션, 개별 리포트"],
            ["시장", "지수·수급·섹터와 오늘 장의 상태"],
            ["인사이트", "매일 브리프와 주간 브리핑 아카이브"],
            ["성과", "발행한 픽이 어떻게 끝났는지 — 맞은 것과 틀린 것 전부"],
            ["내 자산", "관심 종목·리스크 진단·알림"],
          ].map(([name, desc]) => (
            <li key={name} className="flex items-baseline gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="min-w-0">
                <b className="font-semibold text-text">{name}</b>
                <span className="ml-2 text-text-dim">{desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    q: "돈이 드나요?",
    a: (
      <p>
        들지 않습니다. 등급도 결제도 없고, 지금은 회원 종류가 하나뿐입니다. 결제를
        받게 되면 그때 미리 알리고, 이미 열려 있던 것을 뒤에서 잠그지 않겠습니다.
      </p>
    ),
  },
  {
    q: "왜 홈만 열어 두었나요?",
    a: (
      <p>
        홈은 오늘 이 서비스가 무엇을 했는지 보여주는 자리라, 가입 여부와 무관하게
        열어 둡니다. 나머지는 계정에 붙는 것(관심 종목·알림·기록)이거나 그 근거를
        끝까지 담은 화면이라 로그인한 분에게만 보여 드립니다.
      </p>
    ),
  },
  {
    q: "픽은 언제 올라오나요?",
    a: (
      <p>
        평일 장 마감 뒤 <b className="font-semibold text-text">16:30</b>(한국시간) 배치가
        그날 종가로 계산해 발행합니다. 진입은 <b className="font-semibold text-text">다음
        거래일 시가</b> 기준입니다 — 그래서 발행 당일의 픽은 아직 사지 않은 상태로
        표시됩니다. 아침 <b className="font-semibold text-text">08:30</b> 배치는 밤사이
        바뀐 해외 변수만 갱신해 브리프를 씁니다.
      </p>
    ),
  },
  {
    q: "숫자는 누가 계산하나요?",
    a: (
      <p>
        전부 코드가 계산합니다. 점수·진입가·손절가·비중은 공개된 시세와 재무·공시
        데이터에서 규칙대로 산출한 값이고, 글은 그 값을 설명할 뿐 새로 만들어 내지
        않습니다. 계산과 서술을 갈라 둔 이유가 그것입니다.
      </p>
    ),
  },
  {
    q: "추천대로 하면 수익이 나나요?",
    a: (
      <p>
        보장할 수 없습니다. 모든 수치는 과거 데이터로 계산한 것이고 과거 성과가 미래
        수익을 보장하지 않습니다. 그래서 맞은 것만 고르지 않고{" "}
        <b className="font-semibold text-text">틀린 것까지 성과 화면에 남깁니다</b>.
        투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.
      </p>
    ),
  },
  {
    q: "이 서비스가 하지 않는 일은 무엇인가요?",
    a: (
      <p>
        자금을 맡아 두지 않고, 매매를 대신하지 않으며, 증권 계좌에 주문을 넣지
        않습니다. 개별 회원의 사정을 반영한 맞춤 자문도 아닙니다 — 불특정 다수를
        대상으로 한 투자 참고 정보입니다. 자세한 내용은{" "}
        <Link href="/terms" className="font-semibold text-accent hover:underline">
          이용약관
        </Link>
        에 있습니다.
      </p>
    ),
  },
  {
    q: "가입할 때 무엇을 적나요?",
    a: (
      <p>
        닉네임·연락처·이메일과 비밀번호를 받습니다. 로그인은 이메일로 합니다 —
        따로 아이디를 정하지 않습니다. 이메일은 화면에 내보이지 않고, 다른 회원에게
        보이는 것은 닉네임뿐입니다. 어떤 정보를 어떻게 다루는지는{" "}
        <Link href="/privacy" className="font-semibold text-accent hover:underline">
          개인정보처리방침
        </Link>
        에 적어 두었습니다.
      </p>
    ),
  },
];

export default function FaqPage() {
  return (
    <AppShell
      title="자주 묻는 질문"
      subtitle="가입 전에 궁금할 만한 것들을 모았습니다."
    >
      <div className="mx-auto w-full max-w-[760px]">
        <ol className="space-y-7">
          {QAS.map((qa, i) => (
            <li key={qa.q}>
              <h2 className="flex items-baseline gap-2.5 text-[15.5px] font-bold leading-snug text-text">
                <span className="shrink-0 font-mono text-[12px] text-text-mute">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {qa.q}
              </h2>
              <div className="mt-2 pl-[30px] text-[13.5px] leading-[1.85] text-text-dim">
                {qa.a}
              </div>
            </li>
          ))}
        </ol>

        {/* 화면 끝의 가입 버튼. 머리에도 상시로 있지만, 여기까지 읽은 사람에게 다시
            위로 올라가라고 하지 않는다. 설명을 다 읽은 자리가 결정하는 자리다. */}
        <div className="mt-12 flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface px-6 py-5">
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-text-dim">
            더 궁금한 점이 있으면 가입 후 문의해 주세요. 가입은 무료입니다.
          </p>
          <Link
            href="/login?mode=signup"
            className="inline-flex min-h-10 shrink-0 items-center rounded-[9px] bg-accent px-6 text-[13.5px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
          >
            무료로 시작하기
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
