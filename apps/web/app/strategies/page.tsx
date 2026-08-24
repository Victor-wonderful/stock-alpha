import { AppShell } from "@/components/AppShell";
import { horizonLabel, PUBLISH_HORIZONS } from "@/lib/holding";
import { Panel, SampleBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getBacktests } from "@/lib/data";
import { fmtNum, fmtPct } from "@/lib/format";
import type { TradeSetup } from "@stock-alpha/db";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

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
  flow_accumulation: {
    name: "수급 동반 매집",
    desc: "외국인과 기관이 동시에 꾸준히 사 모으는 종목을 따라 매수",
  },
  pullback: {
    name: "눌림목",
    desc: "상승 추세 종목이 잠시 쉬어갈 때(20일선 부근) 좋은 가격에 진입",
  },
  high_52w: {
    name: "52주 신고가",
    desc: "1년 최고가를 갱신한 종목의 장기 상승 흐름에 올라타는 매매",
  },
  vol_squeeze: {
    name: "변동성 수축 돌파",
    desc: "움직임이 바짝 줄었던 종목이 거래량과 함께 터질 때 진입",
  },
  pead: {
    name: "실적 모멘텀(PEAD)",
    desc: "깜짝 실적(영업이익 급증·흑자전환) 공시 직후의 추가 상승 흐름에 진입",
  },
  factor_composite: {
    name: "멀티팩터 종합",
    desc: "가치·품질·모멘텀 등 6개 지표 종합 점수 상위 종목 매수",
  },
  theme: {
    name: "테마주",
    desc: "시장 테마(섹터 순환) 기반 매매 — 탐지기 미구현",
  },
  new_listing: {
    name: "신규주",
    desc: "신규 상장 종목 수급 매매 — 탐지기 미구현",
  },
  // 2026-06 이후 추가분 — 누락돼 영어 키가 그대로 노출되고 있었다(2026-07-31 보강).
  double_bottom: {
    name: "쌍바닥(W)",
    desc: "같은 가격대에서 두 번 버틴 자리(쌍지지)에서 매도세가 소진된 뒤 반등을 노리는 매매",
  },
  anchor_pullback: {
    name: "기준봉 눌림",
    desc: "큰손이 대량 매수로 신고가를 뚫은 자리(기준봉) 이후 얕게 눌렸다 반등할 때 진입",
  },
  capitulation: {
    name: "투매 소진",
    desc: "투매로 바닥까지 밀린 종목을, 반등을 기다리지 않고 약세 구간에서 먼저 담는 매매",
  },
  kalman: {
    name: "칼만 추세",
    desc: "가격의 잡음을 걸러낸 '진짜 추세선'이 위를 향할 때 올라타는 매매",
  },
  median: {
    name: "메디안 추세",
    desc: "이상치에 흔들리지 않는 중앙값 기준으로 추세 방향을 판정해 진입",
  },
  sortino: {
    name: "소르티노 모멘텀",
    desc: "하락 위험 대비 상승폭이 큰 종목을 고르는 매매(변동성이 아닌 '하락'만 위험으로 계산)",
  },
  markov: {
    name: "마르코프 레짐",
    desc: "종목이 상승 국면에 있는지 통계로 판정하고, 그 국면이 이어질 확률이 높을 때 진입",
  },
  delta: {
    name: "델타 모멘텀",
    desc: "어제 오른 종목이 오늘도 오르는 '관성'이 통계적으로 확인될 때 진입",
  },
  ensemble: {
    name: "앙상블 합의",
    desc: "검증 통과한 여러 전략이 동시에 매수를 가리킬 때만 진입하는 고확신 매매",
  },
  bayes: {
    name: "베이즈 결합",
    desc: "가격·거래량 등 여러 증거를 확률로 합산해 상승 가능성이 높을 때 진입",
  },
  pivot: {
    name: "피봇 돌파",
    desc: "전일 고저종으로 계산한 기준선(피봇)을 위로 뚫을 때 진입하는 단기 매매",
  },
  sigma: {
    name: "시그마 평균회귀",
    desc: "평균에서 비정상적으로 멀어진 가격이 제자리로 돌아오는 데 거는 매매",
  },
  quantile: {
    name: "콴타일 반등",
    desc: "최근 가격 분포의 하위 구간까지 밀린 종목의 되돌림을 노리는 매매",
  },
};

// 축은 기간이다(2026-08-23). 예전에는 「스타일(스윙·포지션)」 열이었는데, 발행을 정하는
// 게이트가 (셋업 × 기간)으로 바뀐 뒤로 이 표가 **옛 축 성적을 현재 검증 결과처럼**
// 보여주고 있었다. 실측: backtests 1,584행 중 기간 축은 66행(통과 12)이고 나머지
// 1,518행(통과 542)이 옛 스타일 축이다. 「통과 542건」이 화면에 뜨면 지금 발행 근거가
// 그만큼 두터운 줄로 읽힌다.

// 미통과 사유 — 어떤 기준에 걸렸는지. 기대값이 높은데 미통과인 행(워크포워드 탈락)이
// 고장처럼 보이던 문제를 해소한다.
function failReason(b: {
  expectancy_r?: number | null;
  mdd: number | null;
  walkforward?: {
    ok: boolean;
    evaluable: boolean;
    reason: string | null;
    recent_expectancy_r?: number | null;
  } | null;
}): string | null {
  const bits: string[] = [];
  if (b.expectancy_r == null || b.expectancy_r < 0.05) bits.push("기대값 미달");
  if (b.mdd != null && b.mdd > 0.4) bits.push("낙폭 초과");
  const wf = b.walkforward;
  if (wf && wf.evaluable && !wf.ok) {
    const recent =
      wf.recent_expectancy_r != null
        ? ` (최근 ${wf.recent_expectancy_r >= 0 ? "+" : ""}${wf.recent_expectancy_r.toFixed(2)}R)`
        : "";
    bits.push(`최근 구간 부진${recent}`);
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

// 이벤트 백테스트 대상이 아닌 셋업의 상태 — 전략 지도를 완전하게.
// (스크리너 필터와 검증 페이지가 같은 전략 목록을 보여야 혼란이 없다)
const NON_BACKTEST_SETUPS: {
  setup: TradeSetup;
  status: string;
  variant: "accent" | "neutral" | "bear";
  note: string;
}[] = [
  {
    setup: "theme",
    status: "준비 중",
    variant: "neutral",
    note: "미구현 — 발행되지 않습니다.",
  },
  {
    setup: "new_listing",
    status: "준비 중",
    variant: "neutral",
    note: "미구현 — 발행되지 않습니다.",
  },
];

export default async function StrategiesPage() {
  const { data: allRows, isSample } = await getBacktests();
  // 멀티팩터(횡단면 검증)는 지표 체계가 달라(IC 기반) 본 표와 분리 표시
  // 같은 플레이북의 스타일별 행이 흩어져 있으면 판정이 모순돼 보인다 → 이름·스타일순 정렬로
  // 나란히 붙인다(예: 돌파 스윙 미통과 / 돌파 포지션 통과).
  const rows = allRows.filter((b) => b.setup !== "factor_composite");
  // 지금 발행 근거는 기간 축뿐이다. 옛 스타일 축 행은 표에서 빼고 «몇 건이 있었는지»만
  // 아래 각주로 밝힌다 — 지우면 성적을 감춘 것이 되고, 섞으면 현재 근거를 부풀린다.
  const legacyRows = rows.filter((b) => !b.horizon);
  const data = rows
    .filter((b) => !!b.horizon)
    .sort((a, b) => {
      const an = SETUP_GUIDE[a.setup]?.name ?? a.setup;
      const bn = SETUP_GUIDE[b.setup]?.name ?? b.setup;
      const order = { short: 0, mid: 1, long: 2 } as Record<string, number>;
      return (
        an.localeCompare(bn, "ko") ||
        (order[a.horizon ?? ""] ?? 9) - (order[b.horizon ?? ""] ?? 9)
      );
    });
  const factor = allRows.find((b) => b.setup === "factor_composite");
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
                <span className="font-medium text-text">승률 · 이기면 몇 배</span> —
                이긴 거래의 비율, 그리고 평균 이익이 평균 손실의 몇 배인가.
                승률이 낮아도 이길 때 크게 벌면 돈을 법니다(추세 전략의 전형).
                참고용 지표.
              </li>
              <li>
                <span className="font-medium text-text">최대 낙폭</span> — 매일
                계좌의 1%만 리스크에 쓰며 이 전략을 따랐을 때, 최악의 시기에
                계좌가 고점 대비 몇 % 내려갔는가.{" "}
                <span className="text-text-mute">40% 이하여야 통과.</span>
              </li>
              <li>
                <span className="font-medium text-text">최근 구간 성적</span> —
                전체 기간을 넷으로 나눠, 성적이 한 시기에만 몰린 게 아닌지 봅니다.
                특히 <span className="font-medium text-text">가장 최근 구간이 손실</span>이면
                전체 기대값이 아무리 높아도 통과시키지 않습니다 — 예전엔 통했지만 지금은
                통하지 않는 전략을 걸러내기 위해서입니다.{" "}
                <span className="text-text-mute">
                  표에서 &ldquo;기대값은 높은데 미통과&rdquo;인 전략이 대개 여기 걸린 경우입니다.
                </span>
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
          {/* ── 폰 (768 미만) — 플레이북 하나가 카드 한 장 ──
              열이 8개다. 표로 두면 기대값·승률이 스크롤 뒤로 숨는데, 이 화면은
              «어느 전략이 통과했나»를 보는 곳이라 검증 결과가 먼저 보여야 한다.
              (멀티팩터 종합 행은 표에만 둔다 — 카드로 옮기면 같은 것이 두 모양이 된다.) */}
          <div className="md:hidden">
            {data.map((b, i) => {
              const guide = SETUP_GUIDE[b.setup];
              const exp = b.expectancy_r ?? null;
              return (
                <article key={`m-${i}`} className="border-b border-border-soft py-3.5 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-text">{guide?.name ?? b.setup}</p>
                      <p className="mt-1 text-[12px] leading-[1.6] text-text-mute">
                        {guide?.desc ?? ""}
                      </p>
                      <p className="mt-1 text-[12px] text-text-dim">
                        {horizonLabel(b.horizon) ?? "기간 미상"}
                        {b.horizon && !PUBLISH_HORIZONS.includes(b.horizon as never) && (
                          <span className="text-text-mute"> · 발행 안 함</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant={b.passed ? "pass" : "fail"} size="md">
                        {b.passed ? "통과" : "미통과"}
                      </Badge>
                      <p
                        className={`mono mt-1 text-[15px] font-bold ${
                          exp != null && exp > 0 ? "text-bull" : "text-bear"
                        }`}
                      >
                        {exp != null ? `${exp > 0 ? "+" : ""}${fmtNum(exp, 3)}` : "—"}
                      </p>
                      <p className="text-[11.5px] text-text-mute">기대값 R</p>
                    </div>
                  </div>
                  {!b.passed && failReason(b) && (
                    <p className="mt-1.5 text-[12px] text-text-mute">{failReason(b)}</p>
                  )}
                  <dl className="mono mt-2.5 flex flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px]">
                    <span>
                      <dt className="inline text-text-mute">승률 </dt>
                      <dd className="inline font-semibold text-text">{fmtPct(b.win_rate, 0)}</dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">이기면 </dt>
                      <dd className="inline font-semibold text-text">{fmtNum(b.avg_rr, 2)}</dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">최대 낙폭 </dt>
                      <dd className="inline font-semibold text-text">
                        {b.mdd != null ? `${(b.mdd * 100).toFixed(1)}%` : "—"}
                      </dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">검증 </dt>
                      <dd className="inline text-text-dim">{b.verified_at ?? b.period ?? "—"}</dd>
                    </span>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                  <th className="py-2 pl-1 text-left font-medium">플레이북</th>
                  <th className="px-3 py-2 text-center font-medium">기간</th>
                  <th className="px-3 py-2 text-center font-medium">검증</th>
                  <th className="px-3 py-2 text-right font-medium">
                    기대값 (R/거래)
                  </th>
                  <th className="px-3 py-2 text-right font-medium">승률</th>
                  <th className="px-3 py-2 text-right font-medium">이기면</th>
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
                      <td className="px-3 py-2.5 text-center text-2xs text-text-dim">
                        {horizonLabel(b.horizon) ?? "—"}
                        {b.horizon && !PUBLISH_HORIZONS.includes(b.horizon as never) && (
                          <span className="ml-1 text-text-mute">· 발행 안 함</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={b.passed ? "pass" : "fail"} size="md">
                          {b.passed ? "통과" : "미통과"}
                        </Badge>
                        {!b.passed && failReason(b) && (
                          <p className="mt-1 whitespace-nowrap text-2xs text-text-mute">
                            {failReason(b)}
                          </p>
                        )}
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
                {factor && (
                  <tr className="border-b border-border/50 hover:bg-surface-2">
                    <td className="py-2.5 pl-1">
                      <p className="font-medium text-text">멀티팩터 종합</p>
                      <p className="mt-0.5 max-w-sm text-2xs text-text-mute">
                        {SETUP_GUIDE.factor_composite?.desc}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-center text-2xs text-text-dim">—</td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant={factor.passed ? "pass" : "fail"} size="md">
                        {factor.passed ? "통과" : "미통과"}
                      </Badge>
                    </td>
                    <td colSpan={5} className="px-3 py-2.5 text-2xs text-text-mute">
                      횡단면 검증(주간 {factor.period?.replace("weekly x ", "") ?? "—"}
                      기) — 순위 예측력 IC {fmtNum(factor.ic, 3)}·양수 비율{" "}
                      {factor.win_rate != null
                        ? `${(factor.win_rate * 100).toFixed(0)}%`
                        : "—"}로 유효하나, 상위 10% 매수
                      초과수익이 무유의(t={fmtNum(factor.sharpe, 2)}) → 매수
                      시그널·픽 근거로 사용하지 않습니다. 가격 팩터 프록시 기준
                      부분 검증이며, 재무 팩터 포함 모델 개선 후 재검증 예정.
                    </td>
                  </tr>
                )}
                {NON_BACKTEST_SETUPS.map((s) => {
                  const guide = SETUP_GUIDE[s.setup];
                  return (
                    <tr
                      key={s.setup}
                      className="border-b border-border/50 last:border-0 hover:bg-surface-2"
                    >
                      <td className="py-2.5 pl-1">
                        <p className="font-medium text-text">
                          {guide?.name ?? s.setup}
                        </p>
                        <p className="mt-0.5 max-w-sm text-2xs text-text-mute">
                          {guide?.desc ?? ""}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center text-2xs text-text-dim">—</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={s.variant} size="md">
                          {s.status}
                        </Badge>
                      </td>
                      <td
                        colSpan={5}
                        className="px-3 py-2.5 text-2xs text-text-mute"
                      >
                        {s.note}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {legacyRows.length > 0 && (
            <p className="mt-3 rounded-[10px] border border-border-soft bg-surface-2 px-3 py-2 text-2xs leading-relaxed text-text-mute">
              <span className="font-semibold text-text-dim">
                옛 축(스타일) 검증 {legacyRows.length}건은 표에서 뺐습니다
              </span>{" "}
              — 발행을 정하는 게이트가 (셋업 × 기간)으로 바뀌기 전에 잰 성적이라 지금
              발행 근거가 아닙니다. 지우지는 않았고, 위 표는 현재 축만 보여줍니다.
            </p>
          )}
          <p className="mt-3 text-2xs text-text-mute">
            검증 기준: 표본 ≥ 20거래 · 기대값 ≥ +0.05R · 최대 낙폭 ≤ 40%(일일
            리스크 1% 기준) · 최근 구간 기대값 ≥ 0. 같은 플레이북도 기간별로
            따로 검증하므로, 단기는 통과하고 중기는 미통과일 수 있습니다.
            과거 성과는 미래 수익을 보장하지 않습니다.
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
