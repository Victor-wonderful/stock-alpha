// /focus — 서버 컴포넌트 (데이터 패칭)
// 토글 인터랙션은 _pick-card.tsx (클라이언트)에 위임

import Link from "next/link";
import { Calculator, ListFilter, ScanSearch } from "lucide-react";
import { GNB } from "@/components/GNB";
import {
  getMorningBrief,
  getPickHistory,
  getRecommendations,
  getReports,
  getUserRiskPct,
} from "@/lib/data";
import { SampleBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { PickCard } from "./_pick-card";

// 다음 거래일 라벨
function nextTradingDayLabel(asOf: string): string {
  const [y, m, dd] = asOf.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd));
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${days[d.getUTCDay()]})`;
}

// 분석 기준일(종가일) 라벨 — "6월 16일(화)"
function tradingDayLabel(asOf: string): string {
  const [y, m, dd] = asOf.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}월 ${dd}일(${days[wd]})`;
}

// 레짐 게이지 (3구간 바 + 마커)
function RegimeGauge({ score }: { score: number }) {
  // score: -1 ~ 1 → 0 ~ 100% 포지션
  const pct = Math.max(0, Math.min(100, (score + 1) * 50));
  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-bad/60" />
          <div className="flex-1 bg-warn/60" />
          <div className="flex-1 bg-good/60" />
        </div>
        {/* 마커 */}
        <div
          className="absolute top-0 h-full w-1 rounded-full bg-white shadow"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-mute">
        <span>약세 · 방어</span>
        <span>중립</span>
        <span>강세 · 공격</span>
      </div>
    </div>
  );
}

// 선정 3단계 스트립
function HowItWorks({ analyzed }: { analyzed: number }) {
  const steps = [
    {
      icon: ScanSearch,
      title: "1 검토",
      desc: "유동 종목 1,200+ 스캔 — 시그널 발생 + 시총 상위",
      badge: `오늘 ${analyzed}종목 분석`,
      color: "text-accent",
      bg: "bg-accent-soft",
      highlight: false,
    },
    {
      icon: Calculator,
      title: "2 평가",
      desc: "팩터 40 + 밸류 30 + 시그널 30 = 100점 · 거래가능 게이트",
      badge: "매수≥65 · 중립≥45",
      color: "text-warn",
      bg: "bg-warn-soft",
      highlight: false,
    },
    {
      icon: ListFilter,
      title: "3 선정",
      desc: "60점+ & 게이트 통과 & 검증 플랜 보유 → 점수순 상위 5",
      badge: "미달이면 빈 날",
      color: "text-good",
      bg: "bg-good-soft",
      highlight: true, // accent-soft 강조
    },
  ];
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-3">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            key={s.title}
            className={`relative rounded-[12px] px-3.5 py-3 ${
              s.highlight ? "bg-accent-soft border border-accent/20" : "bg-surface-2"
            }`}
          >
            {i < steps.length - 1 && (
              <span className="absolute -right-1.5 top-1/2 hidden -translate-y-1/2 text-text-mute sm:block">
                →
              </span>
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-[6px] ${s.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${s.color}`} strokeWidth={2} />
                </span>
                <span className="text-xs font-bold text-text">{s.title}</span>
              </div>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.bg} ${s.color}`}>
                {s.badge}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-text-mute">{s.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

export default async function FocusContent() {
  const [recs, allReports, history, brief, riskPct] = await Promise.all([
    getRecommendations(),
    getReports(200, { includeUnfit: true }), // 최신일 분포 집계 — 일 발행 상한(100)+α 커버
    getPickHistory(),
    getMorningBrief(),
    getUserRiskPct(),
  ]);

  const picks = recs.isSample
    ? []
    : recs.data.filter((r) => r.basket_type === "daily_focus");
  const asOf = picks[0]?.as_of ?? null;
  const planDay = asOf ? nextTradingDayLabel(asOf) : null;
  const basisDay = asOf ? tradingDayLabel(asOf) : null;

  // 판정 현황
  const latestDay = allReports.data[0]?.as_of ?? null;
  const todayReports = allReports.data.filter((r) => r.as_of === latestDay);
  const gradeBoard = {
    매수: todayReports.filter((r) => r.rating === "매수").length,
    중립: todayReports.filter((r) => r.rating === "중립").length,
    관망: todayReports.filter((r) => r.rating === "관망").length,
    부적합: todayReports.filter((r) => r.rating === "거래 부적합").length,
    total: todayReports.length,
  };
  // 심볼별 최신 리포트만 — allReports 는 as_of 내림차순이므로 첫 등장(최신)을 보존한다.
  // (Map(array.map(...)) 은 last-write-wins → 같은 심볼의 과거 리포트가 최신을 덮어써
  //  픽 카드에 옛 판정·점수가 표시되던 버그를 차단.)
  const reportBySymbol = new Map<string | null, (typeof allReports.data)[number]>();
  for (const r of allReports.data) {
    if (!reportBySymbol.has(r.symbol)) reportBySymbol.set(r.symbol, r);
  }

  // 픽 기록 상태
  const activePicks = history.data.filter((h) => h.status === "진행중");
  const briefData = brief.data;
  const regime = briefData?.regime ?? null;
  const regimeScore = regime?.score ?? 0;
  const regimeLabel =
    regime?.regime === "risk_on"
      ? "강세 · 위험선호"
      : regime?.regime === "risk_off"
        ? "약세 · 방어"
        : "중립";

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <GNB />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7 pb-10">
        {/* ── 페이지 헤더 ── */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-text">오늘의 포커스</h1>
              {basisDay && (
                <span className="rounded-[999px] bg-surface-3 px-2.5 py-1 text-[10px] font-semibold text-text-dim">
                  {basisDay} 종가 분석
                </span>
              )}
              {planDay && (
                <span className="rounded-[999px] bg-accent px-3 py-1 text-[11px] font-bold text-[#0B0C10]">
                  → {planDay} 장 시작 전 플랜
                </span>
              )}
              {recs.isSample && <SampleBadge />}
            </div>
            <p className="mt-1 text-xs text-text-mute">
              시스템 기준을 통과한 관심 후보 — 사람이 고르지 않습니다 · 직전 거래일
              종가로 분석해 다음 거래일 장전 플랜으로 제시합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-[999px] px-3 py-1.5 text-xs font-semibold ${
                regime?.regime === "risk_off"
                  ? "bg-bad-soft text-bad"
                  : regime?.regime === "risk_on"
                    ? "bg-good-soft text-good"
                    : "bg-warn-soft text-warn"
              }`}
            >
              {regimeLabel}
            </span>
          </div>
        </div>

        {/* ── 모닝 브리프 카드 ── */}
        {briefData && (
          <div className="mb-6 rounded-[20px] border border-border bg-surface p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1px_260px]">
              {/* 좌: 헤드라인 + 드라이버 칩 */}
              <div>
                <div className="mb-2.5 flex items-center gap-2">
                  <h2 className="text-sm font-bold text-text">시장 브리프</h2>
                  {asOf && (
                    <span className="rounded px-2 py-0.5 text-[10px] bg-surface-3 text-text-mute">
                      {asOf} 발행
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold leading-relaxed text-text">
                  {briefData.headline}
                </p>
                {(briefData.watchpoints ?? []).length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {briefData.watchpoints.slice(0, 3).map((w, i) => (
                      <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-text-dim">
                        <span className="font-bold text-accent">▸</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
                {/* 드라이버 칩 */}
                {regime?.drivers && regime.drivers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {regime.drivers.slice(0, 3).map((d, i) => (
                      <span
                        key={i}
                        className="rounded-[999px] bg-surface-3 px-2.5 py-1 text-[10px] text-text-dim"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 구분선 */}
              <div className="hidden bg-border lg:block" />

              {/* 우: 레짐 게이지 + 지수 쿼트 */}
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-text-mute">시장 레짐</p>
                  <RegimeGauge score={regimeScore} />
                </div>
                {(briefData.macro ?? []).length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {briefData.macro.slice(0, 3).map((m) => (
                      <div key={m.series} className="rounded-[8px] bg-surface-2 px-2 py-1.5">
                        <p className="truncate text-[10px] text-text-mute">{m.label}</p>
                        <p className="tnum text-xs font-bold text-text">
                          {m.value.toLocaleString()}
                        </p>
                        {m.change_pct != null && (
                          <p
                            className={`tnum text-[10px] font-semibold ${
                              m.change_pct >= 0 ? "text-good" : "text-bad"
                            }`}
                          >
                            {m.change_pct >= 0 ? "+" : ""}
                            {(m.change_pct * 100).toFixed(2)}%
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 선정 과정 3단계 ── */}
        <HowItWorks analyzed={gradeBoard.total} />

        {/* ── 메인 2컬럼 ── */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* 픽 리스트 */}
          <div className="space-y-3">
            {picks.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-border bg-surface p-16 text-center">
                <p className="text-sm text-text-mute">
                  {recs.isSample
                    ? "데이터 연결 후 오늘의 픽이 표시됩니다"
                    : "오늘은 기준(판정·거래가능 게이트·백테스트)을 통과한 종목이 없습니다. 억지로 채우지 않습니다."}
                </p>
              </div>
            ) : (
              picks.map((p, i) => (
                <PickCard
                  key={p.symbol}
                  pick={p}
                  rank={i + 1}
                  report={reportBySymbol.get(p.symbol)}
                  riskPct={riskPct}
                />
              ))
            )}
            {picks.length > 0 && (
              <p className="mt-1 text-[11px] text-text-mute">
                권장 비중 = 손절 시 손실이 계좌의 {riskPct}%가 되도록 역산(상한 25%) ·{" "}
                {picks.length}종목 전부 집행 시 총 리스크 약{" "}
                {(picks.length * riskPct).toFixed(1)}%
              </p>
            )}
          </div>

          {/* 우측 레일 */}
          <div className="flex flex-col gap-5">
            {/* 오늘의 판정 현황 */}
            <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
              <h2 className="mb-3 text-sm font-bold text-text">오늘의 판정 현황</h2>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { label: "매수", n: gradeBoard.매수, cls: "text-good", bg: "bg-good-soft" },
                    { label: "중립", n: gradeBoard.중립, cls: "text-warn", bg: "bg-warn-soft" },
                    { label: "관망", n: gradeBoard.관망, cls: "text-text-dim", bg: "bg-surface-2" },
                    {
                      label: "부적합",
                      n: gradeBoard.부적합,
                      cls: "text-text-mute",
                      bg: "bg-surface-2",
                    },
                  ] as const
                ).map(({ label, n, cls, bg }) => (
                  <div
                    key={label}
                    className={`flex flex-col items-center rounded-[10px] px-2 py-2.5 ${bg}`}
                  >
                    <span className="text-[10px] text-text-mute">{label}</span>
                    <span className={`tnum mt-0.5 text-xl font-extrabold ${cls}`}>{n}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-text-mute">
                {latestDay ?? "—"} 발행 {gradeBoard.total}건 ·{" "}
                거래 부적합 {gradeBoard.부적합}건 기본 숨김
              </p>
              <Link
                href="/reports"
                className="mt-1 block text-[11px] text-accent hover:underline"
              >
                전체 보기 →
              </Link>
            </section>

            {/* 픽 기록 미니 */}
            <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-text">픽 기록</h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-mute">전부 공개 · 삭제 없음</span>
                  <Link href="/picks" className="text-[11px] font-semibold text-accent hover:underline">
                    전체 기록 →
                  </Link>
                </div>
              </div>
              {history.data.length === 0 ? (
                <p className="text-sm text-text-mute">
                  아직 기록이 없습니다. 첫 픽부터 결과를 전부 공개합니다.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {history.data.slice(0, 7).map((h, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="mono shrink-0 text-[10px] text-text-mute">
                          {h.as_of.slice(5)}
                        </span>
                        <Link
                          href={`/stocks/${h.symbol}`}
                          className="truncate text-xs font-semibold text-text hover:text-accent"
                        >
                          {h.name}
                        </Link>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
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
                              ? "bg-good-soft text-good"
                              : (h.return_pct ?? 0) < 0
                                ? "bg-bad-soft text-bad"
                                : "text-text-dim"
                          }`}
                        >
                          {h.return_pct != null
                            ? `${h.return_pct >= 0 ? "+" : ""}${(h.return_pct * 100).toFixed(1)}%`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-text-mute">
                진입가 대비 종가 기준 · 전체 {history.data.length}건
              </p>
            </section>
          </div>
        </div>

        {/* 빠른 링크 */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs">
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

        {/* 면책 */}
        <p className="mt-4 text-center text-[11px] leading-relaxed text-text-mute">
          유사투자자문업자의 불특정 다수 대상 투자 참고 정보 · 맞춤 자문 아님 ·
          투자 판단의 책임은 투자자 본인에게 있습니다 · 과거 성과는 미래 수익을 보장하지 않습니다
        </p>
      </main>
    </div>
  );
}
