import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { StyleChip } from "@/components/AxisChips";
import { EmptyState, Panel, SampleBadge, Stat, StrengthBar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import {
  getMorningBrief,
  getPickHistory,
  getRecommendations,
  getReports,
  getUserRiskPct,
} from "@/lib/data";
import { fmtPct, fmtPrice } from "@/lib/format";
import { computePositionSizePct } from "@/lib/position";

export const dynamic = "force-dynamic";

// 발행일(as_of, 장 마감 후) 다음 거래일 라벨 — 주말은 월요일로 (공휴일은 미반영).
function nextTradingDayLabel(asOf: string): string {
  const d = new Date(asOf + "T00:00:00+09:00");
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
}

// 오늘의 포커스 — 제품의 첫 화면이자 첫 번째 답: "오늘 뭘 봐야 하나".
// 픽은 사람이 고르지 않는다. 발행 규정 v1 기준을 통과한 종목만, 기준 미달이면 빈 날.
export default async function FocusPage() {
  const recs = await getRecommendations();
  const picks = recs.isSample
    ? []
    : recs.data.filter((r) => r.basket_type === "daily_focus");
  const asOf = picks[0]?.as_of ?? null;
  // 장 마감 후(16:30) 발행된 픽은 "다음 거래일 장 시작 전 플랜".
  // 국내 가격은 장외에 움직이지 않으므로 레벨은 다음 장 시작까지 그대로 유효.
  const planDay = asOf ? nextTradingDayLabel(asOf) : null;

  // 판정 보드용 — 부적합 포함 전체 발행분에서 최신 발행일 것만 등급별 분류.
  // 포커스 선정 종목은 ⭐ 마킹(중복 노출이 아니라 분포 속 위치 표시).
  const { data: reports } = await getReports(150, { includeUnfit: true });
  const pickSymbols = new Set(picks.map((p) => p.symbol));
  const latestDay = reports[0]?.as_of ?? null;
  const todayReports = reports.filter((r) => r.as_of === latestDay);
  const gradeBoard = {
    매수: todayReports.filter((r) => r.rating === "매수"),
    중립: todayReports.filter((r) => r.rating === "중립"),
    관망: todayReports.filter((r) => r.rating === "관망"),
    부적합: todayReports.filter((r) => r.rating === "거래 부적합").length,
    total: todayReports.length,
  };
  // 픽 ↔ 근거 리포트 연결 (심볼 매칭) — 카드에서 판정·리포트 링크 표시용
  const reportBySymbol = new Map(reports.map((r) => [r.symbol, r]));
  // 권장 비중 — 사용자 리스크 설정(비로그인 1%) 기준 읽기 시점 계산
  const riskPct = await getUserRiskPct();
  // 픽 기록 — 발행한 모든 픽의 결과를 공개 (실발행 트랙레코드)
  const { data: history } = await getPickHistory();
  // 시장 맥락 — 모닝 브리프(08:30 배치) + 레짐
  const { data: brief } = await getMorningBrief();

  return (
    <AppShell
      title="오늘의 포커스"
      subtitle="시스템 기준을 통과한 관심 후보 — 사람이 고르지 않습니다"
      badge={recs.isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        {/* 시장 맥락 — 모닝 브리프 (들어가기 전에 읽는 한 문단) */}
        {brief && (
          <Panel
            title="시장 브리프"
            action={
              <span className="flex items-center gap-2 text-2xs text-text-mute">
                {brief.regime && (
                  <Badge
                    variant={
                      brief.regime.regime === "risk_on"
                        ? "bull"
                        : brief.regime.regime === "risk_off"
                          ? "bear"
                          : "neutral"
                    }
                    size="md"
                  >
                    {brief.regime.regime === "risk_on"
                      ? "위험선호"
                      : brief.regime.regime === "risk_off"
                        ? "위험회피"
                        : "중립"}
                  </Badge>
                )}
                {brief.as_of} 발행
              </span>
            }
          >
            <p className="text-sm font-medium leading-relaxed text-text">
              {brief.headline}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-text-dim">
              {brief.market_view}
            </p>
            {brief.watchpoints.length > 0 && (
              <ul className="mt-2 space-y-1">
                {brief.watchpoints.map((w, i) => (
                  <li key={i} className="flex gap-2 text-xs text-text-dim">
                    <span className="text-accent">▸</span>
                    {w}
                  </li>
                ))}
              </ul>
            )}
            {brief.macro.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {brief.macro.map((m) => (
                  <span
                    key={m.series}
                    className="rounded-md border border-border bg-surface-2 px-2 py-1 text-2xs text-text-mute"
                  >
                    {m.label}{" "}
                    <span className="tnum text-text-dim">
                      {m.value.toLocaleString()}
                    </span>
                    {m.change_pct != null && (
                      <span
                        className={`tnum ml-1 ${
                          m.change_pct >= 0 ? "text-bull" : "text-bear"
                        }`}
                      >
                        {fmtPct(m.change_pct)}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </Panel>
        )}

        {/* 픽 카드 */}
        <Panel
          title="포커스 종목"
          action={
            asOf ? (
              <span className="text-2xs text-text-mute">
                {planDay} 장 시작 전 플랜 · {asOf} 마감 데이터 기준
              </span>
            ) : undefined
          }
        >
          {/* 선정 기준 — 왜 이 종목들인가를 화면에 명시 */}
          <p className="mb-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-2xs leading-relaxed text-text-dim">
            <span className="font-medium text-text">선정 기준 (매일 자동, 사람 개입 없음):</span>{" "}
            그날 발행된 종목 심층분석 전체에서 ① 판정 &lsquo;매수&rsquo; 또는 종합점수
            60점 이상(멀티팩터 40 + 밸류에이션 30 + 시그널 30) ② 거래가능 게이트
            통과(유동성·변동성·관리종목 제외) ③ 검증 통과 플레이북의 실행플랜
            보유 — 를 모두 만족하는 종목을 점수순 상위 5개까지. 기준 미달이면 그날은
            비워둡니다.
          </p>
          {picks.length === 0 ? (
            <EmptyState message="오늘은 기준(판정·거래가능 게이트·백테스트)을 통과한 종목이 없습니다. 억지로 채우지 않습니다 — 기준 미달이면 빈 날입니다." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {picks.map((p) => {
                const upside =
                  p.target_price && p.entry_price
                    ? p.target_price / p.entry_price - 1
                    : null;
                const report = reportBySymbol.get(p.symbol);
                const score = Math.round(p.conviction * 1000) / 10;
                return (
                  <div
                    key={p.symbol}
                    className="flex h-full flex-col rounded-lg border border-border bg-surface-2 p-4 transition-colors hover:border-border-strong"
                  >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/stocks/${p.symbol}`}
                            className="font-semibold hover:text-accent"
                          >
                            {p.name}
                          </Link>
                          <span className="mono text-2xs text-text-mute">{p.symbol}</span>
                          {report?.rating && (
                            <Badge
                              variant={report.rating === "매수" ? "bull" : "neutral"}
                              size="md"
                            >
                              {report.rating}
                            </Badge>
                          )}
                        </div>
                        <StyleChip style={p.style} />
                      </div>
                      <p className="mt-1 text-2xs text-text-mute">
                        선정 이유 — 종합 <span className="tnum font-semibold text-text">{score}점</span>
                        {report?.rating === "매수"
                          ? " (매수 판정)"
                          : " (점수 기준 통과)"}{" "}
                        + 거래가능 게이트·검증 플레이북 플랜 보유
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-dim">
                        {p.thesis}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat label="진입" value={fmtPrice(p.entry_price)} />
                        <Stat label="목표" value={fmtPrice(p.target_price)} tone="bull" />
                        <Stat label="손절" value={fmtPrice(p.stop_loss)} tone="bear" />
                        <Stat
                          label="권장 비중"
                          value={(() => {
                            const sz = computePositionSizePct(
                              p.entry_price,
                              p.stop_loss,
                              riskPct,
                            );
                            return sz != null ? `${sz.toFixed(1)}%` : "—";
                          })()}
                          sub={`리스크 ${riskPct}%/건`}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-text-mute">확신도</span>
                          <StrengthBar value={p.conviction} />
                        </div>
                        <span
                          className={`tnum text-xs font-semibold ${
                            (upside ?? 0) >= 0 ? "text-bull" : "text-bear"
                          }`}
                        >
                          목표수익 {fmtPct(upside)}
                        </span>
                      </div>
                      {report && (
                        <Link
                          href={`/reports/${report.id}`}
                          className="mt-3 text-right text-2xs text-accent hover:underline"
                        >
                          왜 이 종목인가 — 근거 리포트 →
                        </Link>
                      )}
                  </div>
                );
              })}
            </div>
          )}
          {picks.length > 0 && (
            <p className="mt-3 text-2xs text-text-mute">
              권장 비중은 손절 시 손실이 계좌의 {riskPct}%가 되도록 역산한
              값입니다(상한 25%). 포커스 {picks.length}종목을 전부 집행하면 총
              리스크는 계좌의 약 {(picks.length * riskPct).toFixed(1)}%입니다 —
              동시 보유는 본인의 총 리스크 한도 안에서 선택하세요.
            </p>
          )}
        </Panel>

        {/* 오늘의 판정 현황 — 발행 전체를 등급별로 한눈에 (⭐ = 포커스 선정) */}
        <Panel
          title="오늘의 판정 현황"
          action={
            <span className="tnum text-2xs text-text-mute">
              {latestDay ?? "—"} 발행 {gradeBoard.total}건 — 매수{" "}
              {gradeBoard.매수.length} · 중립 {gradeBoard.중립.length} · 관망{" "}
              {gradeBoard.관망.length}
            </span>
          }
        >
          <div className="space-y-3">
            {(["매수", "중립", "관망"] as const).map((grade) => {
              const rows = gradeBoard[grade];
              return (
                <div key={grade} className="flex flex-wrap items-start gap-2">
                  <Badge
                    variant={
                      grade === "매수"
                        ? "bull"
                        : grade === "중립"
                          ? "neutral"
                          : "warn"
                    }
                    size="md"
                    className="mt-0.5 shrink-0"
                  >
                    {grade} {rows.length}
                  </Badge>
                  {rows.length === 0 ? (
                    <span className="py-0.5 text-2xs text-text-mute">없음</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {rows.map((r) => (
                        <Link
                          key={r.id}
                          href={`/reports/${r.id}`}
                          className={`rounded-md border px-2.5 py-1 text-xs transition-colors hover:border-border-strong hover:text-text ${
                            pickSymbols.has(r.symbol ?? "")
                              ? "border-accent/50 bg-accent/10 text-text"
                              : "border-border bg-surface-2 text-text-dim"
                          }`}
                        >
                          {pickSymbols.has(r.symbol ?? "") && "⭐ "}
                          {r.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-2xs text-text-mute">
            ⭐ = 오늘의 포커스 선정 종목. 거래 부적합 {gradeBoard.부적합}건은 기본
            숨김 —{" "}
            <Link href="/reports?all=1" className="text-accent hover:underline">
              포함해서 보기
            </Link>
            . 매수/중립인데 포커스가 아닌 종목은 실행플랜(검증 플레이북 시그널)이
            없거나 점수 순위가 정원(5) 밖인 경우입니다.
          </p>
        </Panel>

        {/* 픽 기록 — 실발행 트랙레코드 (첫날부터 전부 공개, 삭제 없음) */}
        <Panel
          title="픽 기록 — 우리가 말한 것의 결과"
          action={
            <span className="text-2xs text-text-mute">
              발행한 모든 픽을 기록하고 지우지 않습니다
            </span>
          }
        >
          {history.length === 0 ? (
            <p className="text-sm text-text-mute">
              아직 기록이 없습니다. 첫 픽부터 결과를 전부 공개합니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                    <th className="py-2 pl-1 text-left font-medium">발행일</th>
                    <th className="px-3 py-2 text-left font-medium">종목</th>
                    <th className="px-3 py-2 text-right font-medium">진입가</th>
                    <th className="px-3 py-2 text-right font-medium">현재가</th>
                    <th className="px-3 py-2 text-right font-medium">수익률</th>
                    <th className="px-3 py-2 text-center font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 last:border-0 hover:bg-surface-2"
                    >
                      <td className="mono py-2.5 pl-1 text-2xs text-text-mute">
                        {h.as_of}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/stocks/${h.symbol}`}
                          className="font-medium hover:text-accent"
                        >
                          {h.name}
                        </Link>
                        <span className="mono ml-2 text-2xs text-text-mute">
                          {h.symbol}
                        </span>
                      </td>
                      <td className="mono px-3 py-2.5 text-right">
                        {fmtPrice(h.entry_price)}
                      </td>
                      <td className="mono px-3 py-2.5 text-right">
                        {fmtPrice(h.last_close)}
                      </td>
                      <td
                        className={`mono px-3 py-2.5 text-right font-semibold ${
                          (h.return_pct ?? 0) >= 0 ? "text-bull" : "text-bear"
                        }`}
                      >
                        {fmtPct(h.return_pct)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge
                          variant={
                            h.status === "목표 도달"
                              ? "bull"
                              : h.status === "손절"
                                ? "bear"
                                : "neutral"
                          }
                          size="md"
                        >
                          {h.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-2xs text-text-mute">
            수익률은 발행 시 진입가 대비 최신 종가 기준이며, 목표/손절 도달은 종가
            기준 근사입니다(장중 터치 미반영). 과거 픽의 성과는 미래 수익을
            보장하지 않습니다.
          </p>
        </Panel>

        <div className="flex flex-wrap gap-3 text-xs">
          <Link href="/reports" className="text-accent hover:underline">
            전체 종목 분석 →
          </Link>
          <Link href="/screener" className="text-accent hover:underline">
            전체 시그널 →
          </Link>
          <Link href="/strategies" className="text-accent hover:underline">
            검증·트랙레코드 →
          </Link>
        </div>

        <p className="text-2xs leading-relaxed text-text-mute">
          본 정보는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며,
          특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단과 그 결과에 대한
          책임은 투자자 본인에게 있습니다. 과거 성과는 미래 수익을 보장하지 않습니다.
        </p>
      </div>
    </AppShell>
  );
}
