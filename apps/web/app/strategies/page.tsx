import { AppShell } from "@/components/AppShell";
import { Panel, SampleBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getBacktests } from "@/lib/data";
import { fmtNum, fmtPct } from "@/lib/format";
import type { TradeSetup } from "@stock-alpha/db";

export const dynamic = "force-dynamic";

// 플레이북이 "무엇을 노리는 매매인지" 일반 투자자 언어로.
const SETUP_GUIDE: Partial<Record<TradeSetup, { name: string; desc: string }>> = {
  leader_trend: {
    name: "주도주 추세",
    desc: "시장을 이끄는 강한 종목의 상승 추세에 올라타는 매매",
  },
  oversold_bounce: {
    name: "과대낙폭 반등",
    desc: "급락한 종목의 기술적 반등을 노리는 매매",
  },
  breakout: {
    name: "돌파",
    desc: "저항선(전고점)을 뚫는 순간 새 추세 시작에 진입하는 매매",
  },
  close_betting: {
    name: "종가베팅",
    desc: "장 마감 무렵 매수해 다음 날 오전에 파는 단기 매매",
  },
  factor_composite: {
    name: "멀티팩터 종합",
    desc: "가치·품질·모멘텀 등 6개 지표 종합 점수 상위 종목 매수",
  },
};

export default async function StrategiesPage() {
  const { data, isSample } = await getBacktests();
  const passed = data.filter((b) => b.passed).length;

  return (
    <AppShell
      title="검증 · 트랙레코드"
      subtitle="모든 전략은 과거 데이터로 검증을 통과해야만 발행됩니다"
      badge={isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        <Panel title="이 페이지를 읽는 법">
          <div className="space-y-2 text-sm leading-relaxed text-text-dim">
            <p>
              저희는 매매 전략(플레이북)마다 코스피·코스닥 유동 종목 전체의 과거
              데이터로 모의 매매를 돌려봅니다. 그 성적이 아래 기준을 전부 넘어야
              실제 시그널로 발행됩니다.{" "}
              <span className="font-medium text-text">
                기준에 못 미친 전략은 아무리 그럴듯해 보여도 발행하지 않습니다.
              </span>
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>
                <span className="font-medium text-text">기대값</span> — 1번 거래할
                때 평균적으로 얼마나 버는가. 리스크(진입가↔손절가 거리) 대비
                배수(R)로 측정. 예: +0.21R = 손절 시 1만원을 잃는 크기로 진입했을
                때, 거래당 평균 +2,100원 기대.{" "}
                <span className="text-text-mute">+0.05R 이상이어야 통과.</span>
              </li>
              <li>
                <span className="font-medium text-text">승률 · 손익비</span> —
                이긴 거래의 비율, 그리고 평균 이익이 평균 손실의 몇 배인가.
                승률이 낮아도 손익비가 크면 돈을 법니다(추세 전략의 전형).
                참고용 지표.
              </li>
              <li>
                <span className="font-medium text-text">최대 낙폭</span> — 매일
                계좌의 1%만 리스크에 쓰며 이 전략을 따랐을 때, 최악의 시기에
                계좌가 고점 대비 몇 % 내려갔는가.{" "}
                <span className="text-text-mute">40% 이하여야 통과.</span>
              </li>
            </ul>
          </div>
        </Panel>

        <Panel
          title="플레이북 검증 결과"
          action={
            <span className="tnum text-2xs text-text-mute">
              {data.length}개 중 {passed}개 통과 · 미통과 {data.length - passed}개는
              발행 차단
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                  <th className="py-2 pl-1 text-left font-medium">플레이북</th>
                  <th className="px-3 py-2 text-center font-medium">검증</th>
                  <th className="px-3 py-2 text-right font-medium">
                    기대값 (R/거래)
                  </th>
                  <th className="px-3 py-2 text-right font-medium">승률</th>
                  <th className="px-3 py-2 text-right font-medium">손익비</th>
                  <th className="px-3 py-2 text-right font-medium">최대 낙폭</th>
                  <th className="px-3 py-2 text-left font-medium">마지막 검증</th>
                </tr>
              </thead>
              <tbody>
                {data.map((b, i) => {
                  const guide = SETUP_GUIDE[b.setup];
                  const exp = b.expectancy_r ?? null;
                  return (
                    <tr
                      key={i}
                      className="border-b border-border/50 last:border-0 hover:bg-surface-2"
                    >
                      <td className="py-2.5 pl-1">
                        <p className="font-medium text-text">
                          {guide?.name ?? b.setup}
                        </p>
                        <p className="mt-0.5 max-w-sm text-2xs text-text-mute">
                          {guide?.desc ?? ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={b.passed ? "bull" : "bear"} size="md">
                          {b.passed ? "통과" : "미통과"}
                        </Badge>
                      </td>
                      <td
                        className={`mono px-3 py-2.5 text-right font-semibold ${
                          exp != null && exp > 0 ? "text-bull" : "text-bear"
                        }`}
                      >
                        {exp != null ? `${exp > 0 ? "+" : ""}${fmtNum(exp, 3)}` : "—"}
                      </td>
                      <td className="mono px-3 py-2.5 text-right">
                        {fmtPct(b.win_rate, 0)}
                      </td>
                      <td className="mono px-3 py-2.5 text-right">
                        {fmtNum(b.avg_rr, 2)}
                      </td>
                      <td className="mono px-3 py-2.5 text-right">
                        {b.mdd != null ? `${(b.mdd * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-2xs text-text-mute">
                        {b.verified_at ?? b.period ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-2xs text-text-mute">
            검증 기준: 표본 ≥ 20거래 · 기대값 ≥ +0.05R · 최대 낙폭 ≤ 40%(일일
            리스크 1% 기준). 멀티팩터 종합은 매매 시점이 아닌 종목 선별 전략이라
            별도 방식(횡단면 검증)으로 검증 예정입니다. 과거 성과는 미래 수익을
            보장하지 않습니다.
          </p>
        </Panel>

        {isSample && (
          <p className="text-2xs text-text-mute">
            * 백테스트 엔진(backtests) 가동 전 예시 성과입니다. `engine backtest`
            실행 시 실데이터로 대체됩니다.
          </p>
        )}
      </div>
    </AppShell>
  );
}
