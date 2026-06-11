import Link from "next/link";
import { Calculator, ListFilter, ScanSearch } from "lucide-react";

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
// 서버 타임존과 무관하도록 UTC 달력 연산 (예: MSK 서버에서 하루 밀림 방지).
function nextTradingDayLabel(asOf: string): string {
  const [y, m, dd] = asOf.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${days[d.getUTCDay()]})`;
}

// 선정 과정 3단계 스트립 — "96개를 다 보고 걸러낸 결과"라는 신뢰 메시지 (UI V2)
function HowItWorks({ analyzed }: { analyzed: number }) {
  const steps = [
    {
      icon: ScanSearch,
      title: "1 검토",
      desc: "유동 종목 1,200+ 스캔 — 시그널 발생 + 시총 상위",
      badge: `오늘 ${analyzed}종목 분석`,
      color: "text-accent",
      bg: "bg-accent-dim",
    },
    {
      icon: Calculator,
      title: "2 평가",
      desc: "팩터 40 + 밸류 30 + 시그널 30 = 100점 · 거래가능 게이트",
      badge: "매수≥65 · 중립≥45",
      color: "text-warn",
      bg: "bg-warn-soft",
    },
    {
      icon: ListFilter,
      title: "3 선정",
      desc: "60점+ & 게이트 통과 & 검증 플랜 보유 → 점수순 상위 5",
      badge: "미달이면 빈 날",
      color: "text-good",
      bg: "bg-good-soft",
    },
  ];
  return (
    <div className="mb-3 grid gap-2 md:grid-cols-3">
      {steps.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.title} className="rounded-xl bg-surface-2 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-md ${s.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${s.color}`} strokeWidth={2} />
                </span>
                <span className="text-xs font-bold">{s.title}</span>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.bg} ${s.color}`}
              >
                {s.badge}
              </span>
            </div>
            <p className="mt-1.5 text-2xs leading-relaxed text-text-dim">{s.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

// 오늘의 포커스 — 제품의 첫 화면이자 첫 번째 답: "오늘 뭘 봐야 하나".
// 픽은 사람이 고르지 않는다. 발행 규정 v1 기준을 통과한 종목만, 기준 미달이면 빈 날.
export default async function FocusPage() {
  const recs = await getRecommendations();
  const picks = recs.isSample
    ? []
    : recs.data.filter((r) => r.basket_type === "daily_focus");
  const asOf = picks[0]?.as_of ?? null;
  // 장 마감 후 발행된 픽은 "다음 거래일 장 시작 전 플랜".
  const planDay = asOf ? nextTradingDayLabel(asOf) : null;

  // 판정 보드용 — 부적합 포함 전체 발행분에서 최신 발행일 것만 등급별 분류.
  const { data: reports } = await getReports(150, { includeUnfit: true });
  const latestDay = reports[0]?.as_of ?? null;
  const todayReports = reports.filter((r) => r.as_of === latestDay);
  const gradeBoard = {
    매수: todayReports.filter((r) => r.rating === "매수").length,
    중립: todayReports.filter((r) => r.rating === "중립").length,
    관망: todayReports.filter((r) => r.rating === "관망").length,
    부적합: todayReports.filter((r) => r.rating === "거래 부적합").length,
    total: todayReports.length,
  };
  // 픽 ↔ 근거 리포트 연결 (심볼 매칭)
  const reportBySymbol = new Map(reports.map((r) => [r.symbol, r]));
  const riskPct = await getUserRiskPct();
  const { data: history } = await getPickHistory();
  const { data: brief } = await getMorningBrief();

  return (
    <AppShell
      title="오늘의 포커스"
      subtitle="시스템 기준을 통과한 관심 후보 — 사람이 고르지 않습니다"
      badge={recs.isSample ? <SampleBadge /> : undefined}
    >
      {/* UI V2: 좌측 = 픽 카드(히어로), 우측 = 컨텍스트 레일 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── 메인: 포커스 종목 ── */}
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
          <HowItWorks analyzed={gradeBoard.total} />
          {picks.length === 0 ? (
            <EmptyState message="오늘은 기준(판정·거래가능 게이트·백테스트)을 통과한 종목이 없습니다. 억지로 채우지 않습니다 — 기준 미달이면 빈 날입니다." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {picks.map((p) => {
                const upside =
                  p.target_price && p.entry_price
                    ? p.target_price / p.entry_price - 1
                    : null;
                const report = reportBySymbol.get(p.symbol);
                return (
                  <div
                    key={p.symbol}
                    className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/stocks/${p.symbol}`}
                          className="text-[15px] font-bold hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <span className="mono text-2xs text-text-mute">{p.symbol}</span>
                        {report?.rating && (
                          <Badge
                            variant={report.rating === "매수" ? "bull" : "warn"}
                            size="md"
                          >
                            {report.rating}
                          </Badge>
                        )}
                      </div>
                      <StyleChip style={p.style} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-dim">
                      {p.thesis}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat label="진입" value={fmtPrice(p.entry_price)} dense />
                      <Stat label="목표" value={fmtPrice(p.target_price)} tone="bull" dense />
                      <Stat label="손절" value={fmtPrice(p.stop_loss)} tone="bear" dense />
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
                        tone="accent"
                        dense
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xs text-text-mute">확신도</span>
                        <StrengthBar value={p.conviction} />
                      </div>
                      <span
                        className={`tnum rounded-md px-2 py-0.5 text-xs font-bold ${
                          (upside ?? 0) >= 0
                            ? "bg-bull-soft text-bull"
                            : "bg-bear-soft text-bear"
                        }`}
                      >
                        목표수익 {fmtPct(upside)}
                      </span>
                    </div>
                    {report && (
                      <Link
                        href={`/reports/${report.id}`}
                        className="mt-3 text-2xs font-semibold text-accent hover:underline"
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
              권장 비중 = 손절 시 손실이 계좌의 {riskPct}%가 되도록 역산(상한 25%) ·{" "}
              {picks.length}종목 전부 집행 시 총 리스크 약{" "}
              {(picks.length * riskPct).toFixed(1)}%
            </p>
          )}
        </Panel>

        {/* ── 우측 레일: 시장 → 판정 현황 → 픽 기록 ── */}
        <div className="space-y-4">
          {brief && (
            <Panel
              title="시장 브리프"
              action={
                brief.regime && (
                  <Badge variant="warn" size="md">
                    {brief.regime.regime === "risk_on"
                      ? "위험선호"
                      : brief.regime.regime === "risk_off"
                        ? "위험회피"
                        : "중립"}
                  </Badge>
                )
              }
            >
              <p className="text-sm font-semibold leading-relaxed text-text">
                {brief.headline}
              </p>
              {brief.watchpoints.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {brief.watchpoints.slice(0, 3).map((w, i) => (
                    <li key={i} className="flex gap-2 text-2xs leading-relaxed text-text-dim">
                      <span className="font-bold text-accent">▸</span>
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              {brief.market_view && (
                <details className="mt-2.5">
                  <summary className="cursor-pointer text-2xs text-text-mute hover:text-text-dim">
                    상세 코멘트 펼치기
                  </summary>
                  <p className="mt-2 text-2xs leading-relaxed text-text-dim">
                    {brief.market_view}
                  </p>
                </details>
              )}
              {brief.macro.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {brief.macro.map((m) => (
                    <div key={m.series} className="rounded-lg bg-surface-2 px-2 py-1.5">
                      <p className="truncate text-[10px] text-text-mute">{m.label}</p>
                      <p className="tnum text-xs font-bold text-text">
                        {m.value.toLocaleString()}
                        {m.change_pct != null && (
                          <span
                            className={`ml-1 text-[10px] font-semibold ${
                              m.change_pct >= 0 ? "text-bull" : "text-bear"
                            }`}
                          >
                            {fmtPct(m.change_pct)}
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel title="오늘의 판정 현황">
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ["매수", gradeBoard.매수, "text-bull", "bg-bull-soft"],
                  ["중립", gradeBoard.중립, "text-warn", "bg-warn-soft"],
                  ["관망", gradeBoard.관망, "text-text-dim", "bg-surface-2"],
                  ["부적합", gradeBoard.부적합, "text-text-mute", "bg-surface-2"],
                ] as const
              ).map(([label, n, color, bg]) => (
                <div
                  key={label}
                  className={`flex flex-col items-center rounded-lg px-2 py-2.5 ${bg}`}
                >
                  <span className="text-[10px] text-text-mute">{label}</span>
                  <span className={`tnum mt-0.5 text-lg font-extrabold ${color}`}>
                    {n}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-2xs text-text-mute">
              {latestDay ?? "—"} 발행 {gradeBoard.total}건 · 부적합 기본 숨김 ·{" "}
              <Link href="/reports" className="text-accent hover:underline">
                전체 보기 →
              </Link>
            </p>
          </Panel>

          <Panel
            title="픽 기록"
            action={
              <span className="text-2xs text-text-mute">전부 공개 · 삭제 없음</span>
            }
          >
            {history.length === 0 ? (
              <p className="text-sm text-text-mute">
                아직 기록이 없습니다. 첫 픽부터 결과를 전부 공개합니다.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {history.slice(0, 7).map((h, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="mono shrink-0 text-[10px] text-text-mute">
                        {h.as_of.slice(5)}
                      </span>
                      <Link
                        href={`/stocks/${h.symbol}`}
                        className="truncate text-xs font-semibold hover:text-accent"
                      >
                        {h.name}
                      </Link>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {h.status !== "진행중" && (
                        <Badge
                          variant={
                            h.status === "목표 도달"
                              ? "bull"
                              : h.status === "손절"
                                ? "bear"
                                : "neutral"
                          }
                        >
                          {h.status}
                        </Badge>
                      )}
                      <span
                        className={`tnum rounded px-1.5 py-0.5 text-xs font-bold ${
                          (h.return_pct ?? 0) > 0
                            ? "bg-bull-soft text-bull"
                            : (h.return_pct ?? 0) < 0
                              ? "bg-bear-soft text-bear"
                              : "text-text-dim"
                        }`}
                      >
                        {fmtPct(h.return_pct)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-2xs text-text-mute">
              진입가 대비 종가 기준 · 전체 {history.length}건
            </p>
          </Panel>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-4 text-xs">
        <Link href="/reports" className="font-medium text-accent hover:underline">
          전체 종목 분석 →
        </Link>
        <Link href="/screener" className="font-medium text-accent hover:underline">
          전체 시그널 →
        </Link>
        <Link href="/strategies" className="font-medium text-accent hover:underline">
          검증·트랙레코드 →
        </Link>
      </div>

      <p className="mt-3 text-center text-2xs leading-relaxed text-text-mute">
        유사투자자문업자의 불특정 다수 대상 투자 참고 정보 · 맞춤 자문 아님 · 투자
        판단의 책임은 투자자 본인에게 있습니다 · 과거 성과는 미래 수익을 보장하지
        않습니다
      </p>
    </AppShell>
  );
}
