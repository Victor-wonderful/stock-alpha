// /focus — 서버 컴포넌트 (데이터 패칭)
// 토글 인터랙션은 _pick-card.tsx (클라이언트)에 위임

import Link from "next/link";
import { Calculator, ListFilter, ScanSearch } from "lucide-react";
import { GNB } from "@/components/GNB";
import { TRADE_SETUP_LABELS as SETUP_LABELS } from "@stock-alpha/db";
import {
  getBacktests,
  getLatestPrice,
  getLatestPricesBySymbols,
  getMarketState,
  getPlanCombosForReports,
  getMorningBrief,
  getPickHistory,
  getRecommendations,
  getReports,
  getSnowflakesForSymbols,
  getUserRiskPct,
} from "@/lib/data";
import { RegimeHeader } from "@/components/RegimeHeader";
import { SampleBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { fmtPct, fmtPrice, nextTradingDayLabel, tradingDayLabel } from "@/lib/format";
import { PickCard } from "./_pick-card";
import { HORIZONS } from "@/lib/holding";

// 레짐 게이지 (3구간 바 + 마커)
function RegimeGauge({ score, onNavy = false }: { score: number; onNavy?: boolean }) {
  // score: -1 ~ 1 → 0 ~ 100% 포지션
  const pct = Math.max(0, Math.min(100, (score + 1) * 50));
  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          {/* 네이비 위에서는 라이트 바탕용 적/청이 묻힌다 — 밝은 변형을 쓴다. */}
          <div className={`flex-1 ${onNavy ? "bg-down-on-navy/70" : "bg-bad/60"}`} />
          <div className="flex-1 bg-warn/60" />
          <div className={`flex-1 ${onNavy ? "bg-up-on-navy/70" : "bg-good/60"}`} />
        </div>
        {/* 마커 */}
        <div
          className="absolute top-0 h-full w-1 rounded-full bg-white shadow"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      </div>
      <div className={`flex justify-between text-[10px] ${onNavy ? "text-on-navy-3" : "text-text-mute"}`}>
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
  const [recs, allReports, history, brief, riskPct, marketState, backtests] =
    await Promise.all([
      getRecommendations(),
      getReports(200, { includeUnfit: true }), // 최신일 분포 집계 — 일 발행 상한(100)+α 커버
      getPickHistory(),
      getMorningBrief(),
      getUserRiskPct(),
      getMarketState(),
      getBacktests(), // 반등 대기 리스트의 '검증 통과 플랜 보유' 판정용
    ]);

  // 픽 stale 가드 — 픽 선정 후 리포트가 재생성돼 픽 종목이 '거래 부적합'으로 바뀌거나,
  // 픽 날짜가 최신 리포트보다 과거(픽 재생성 누락)이면 그 픽은 무효. 무효 픽을 행동 가능한
  // 계획처럼 보여주지 않게 숨기고 안내(freshness-guard 원칙). 근본 수정은 엔진 픽 재생성.
  const allPicks = recs.isSample
    ? []
    : recs.data.filter((r) => r.basket_type === "daily_focus");
  const latestRepDay = allReports.data[0]?.as_of ?? null;
  const repForGuard = new Map<string | null, (typeof allReports.data)[number]>();
  for (const r of allReports.data) {
    if (!repForGuard.has(r.symbol)) repForGuard.set(r.symbol, r);
  }
  // 픽은 '최신 리포트 날짜'의 것만 — 그 날짜에 daily_focus 가 없으면 빈 날(과거 픽 폴백 금지).
  // (risk_off 빈 날에 옛 픽이 stale 로 뜨던 것 차단 — 2026-06-24.)
  const picksToday = latestRepDay
    ? allPicks.filter((p) => p.as_of === latestRepDay)
    : allPicks;
  // 같은 날 픽이라도 최신 리포트가 '거래 부적합'이면 무효(리포트 재생성 후 픽 미갱신) → 숨김.
  const isInvalid = (p: (typeof allPicks)[number]) =>
    repForGuard.get(p.symbol)?.rating === "거래 부적합";
  const stalePicks = picksToday.filter(isInvalid);
  const picks = picksToday.filter((p) => !isInvalid(p));
  // 카드용 미니 스노우플레이크 5축 — 픽 종목만 벌크 1회 조회(실패 시 빈 Map).
  const snowMap = await getSnowflakesForSymbols(picks.map((p) => p.symbol));
  // 진입 레벨 알림 — 픽별 현재가(최신 종가) 병렬 조회 → 진입 타이밍/대기/무효 판정.
  const priceList = await Promise.all(
    picks.map((p) =>
      p.instrument_id ? getLatestPrice(p.instrument_id) : Promise.resolve({ data: null }),
    ),
  );
  // close 뿐 아니라 전일대비(changePct)·기준일도 보관 — 카드에서 현재가 변동을 표시한다.
  const priceMap = new Map<string, NonNullable<(typeof priceList)[number]["data"]>>();
  picks.forEach((p, i) => {
    const d = priceList[i]?.data;
    if (d?.close != null) priceMap.set(p.symbol, d);
  });
  // 판정 현황
  const latestDay = allReports.data[0]?.as_of ?? null;

  // 분석 기준일 — 픽이 0건인 날에도 날짜를 잃지 않도록 리포트 최신일로 폴백한다.
  // (픽에서만 뽑으면 빈 날에 asOf=null → 날짜 라벨이 통째로 사라졌다)
  const asOf = picks[0]?.as_of ?? latestDay;
  const planDay = asOf ? nextTradingDayLabel(asOf) : null;
  const basisDay = asOf ? tradingDayLabel(asOf) : null;
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

  // ── 반등 대기 리스트 (빈 날 surface) ──
  // 폭락장 억제로 픽이 비어도, "국면만 바뀌면 바로 픽이 될 종목"을 후보로 제시.
  // "지금 사라"가 아니라 "지켜보라" — 알림/관심으로 참여·락인(위험한 추천 없이).
  //
  // 선정 기준은 점수가 아니라 '검증 통과 플랜 보유'다. 과거엔 점수 상위 N 만 뽑아서,
  // 화면은 "게이트 통과했지만 국면상 대기"라 설명하는데 코드는 그걸 보장하지 않았다
  // (게이트 통과율이 낮은 날엔 근거 없는 종목이 1순위 후보로 올라간다).
  const pickSyms = new Set(picks.map((p) => p.symbol));
  const candidates = todayReports
    .filter(
      (r) =>
        r.rating !== "거래 부적합" &&
        r.score != null &&
        r.symbol != null &&
        !pickSyms.has(r.symbol),
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 24); // 점수 상위에서만 검증 통과 여부를 확인(조회 비용 억제)

  const passedCombos = new Set(
    backtests.data
      .filter((b) => b.passed && b.style)
      .map((b) => `${b.setup}|${b.style}`),
  );
  const combosByReport = await getPlanCombosForReports(candidates.map((r) => r.id));
  // 종목별 '검증 통과한 셋업' — 왜 후보인지 화면에 근거로 노출한다.
  const passedSetupsByReport = new Map<number, string[]>();
  for (const r of candidates) {
    const names = (combosByReport.get(r.id) ?? [])
      .filter((c) => passedCombos.has(`${c.setup}|${c.style}`))
      .map((c) => SETUP_LABELS[c.setup as keyof typeof SETUP_LABELS] ?? c.setup);
    if (names.length > 0) passedSetupsByReport.set(r.id, [...new Set(names)]);
  }
  const waitlist = candidates
    .filter((r) => passedSetupsByReport.has(r.id))
    .slice(0, 6);
  // 대기 목록은 '진입 시점을 기다리는' 목록이라 현재가가 핵심 정보다 — 벌크 1회 조회.
  const waitPrices = await getLatestPricesBySymbols(
    waitlist.map((r) => r.symbol).filter((s): s is string => !!s),
  );

  // 픽 기록 상태
  const activePicks = history.data.filter((h) => h.status === "진행중");

  // 트랙레코드 집계 — 엔진이 확정(0017)한 종료 픽만. 정직한 기대값 노출(신뢰).
  // 저승률·고R:R 추세전략은 손절이 잦아도 기대값이 양(+)이면 장기 수익이 난다는 걸
  // 숫자로 보여 "손절이 많다"는 인상을 기대값으로 재맥락화한다.
  const closedPicks = history.data.filter((h) => h.closed);
  const tr = {
    closed: closedPicks.length,
    target: closedPicks.filter((h) => h.status === "목표 도달").length,
    stopped: closedPicks.filter((h) => h.status === "손절").length,
    expired: closedPicks.filter((h) => h.status === "만료").length,
    partial: closedPicks.filter((h) => h.status === "1차 익절").length,
    wins: closedPicks.filter((h) => (h.return_pct ?? 0) > 0).length,
  };
  const winRate = tr.closed > 0 ? tr.wins / tr.closed : null;
  const expectancy =
    tr.closed > 0
      ? closedPicks.reduce((s, h) => s + (h.return_pct ?? 0), 0) / tr.closed
      : null;
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
        <div id="today-picks" className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-text">오늘의 픽</h1>
              {basisDay && (
                <span className="rounded-[999px] bg-surface-3 px-2.5 py-1 text-[10px] font-semibold text-text-dim">
                  {basisDay} 종가 분석
                </span>
              )}
              {planDay && (
                <span className="rounded-[999px] bg-accent px-3 py-1 text-[11px] font-bold text-text-on-accent">
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
          {/* 국면 배지는 여기 두지 않는다 — 바로 아래 RegimeHeader 가 같은 것을 더
              자세히(그래서 무엇을 발행하는가까지) 말한다. 둘 다 두면 «강세»와
              «횡보»가 나란히 떠서 어느 쪽이 지금인지 되묻게 된다. */}
        </div>

        {/* ── 국면 헤더 — 지금 시장 상태 → 그래서 이 종류를 추천(알파 노하우 ②) ──
             추천 = 필터 없는 큐레이션(IA 2026-06-24): 4탭(RecommendTabs) 폐지, 탐색은 스크리너로 분리. ── */}
        <RegimeHeader state={marketState} />

        {/* ── 모닝 브리프 카드 ──
             시장 브리프는 «전제»다 — 추천을 읽기 전에 깔고 가는 배경.
             라이트 카드로 두면 아래 픽 카드들과 같은 무게로 읽혀 배경이 되지 못한다.
             히어로와 같은 네이비를 써서 «이건 맥락이고 아래가 본문»임을 색으로 말한다.
             안쪽 글자는 전부 on-navy 계열 — text/text-dim 을 쓰면 네이비 위에서 안 보인다. */}
        {briefData && (
          <div className="mb-6 rounded-[12px] bg-navy p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1px_260px]">
              {/* 좌: 헤드라인 + 드라이버 칩 */}
              <div>
                <div className="mb-2.5 flex items-center gap-2">
                  <h2 className="text-sm font-bold text-on-navy">시장 브리프</h2>
                  {asOf && (
                    <span className="rounded bg-on-navy/10 px-2 py-0.5 text-[10px] text-on-navy-2">
                      {asOf} 발행
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold leading-relaxed text-on-navy">
                  {briefData.headline}
                </p>
                {(briefData.watchpoints ?? []).length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {briefData.watchpoints.slice(0, 3).map((w, i) => (
                      <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-on-navy-2">
                        <span className="font-bold text-accent-on-navy">▸</span>
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
                        className="rounded-[999px] bg-on-navy/10 px-2.5 py-1 text-[10px] text-on-navy-2"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 구분선 */}
              <div className="hidden bg-on-navy/15 lg:block" />

              {/* 우: 레짐 게이지 + 지수 쿼트 */}
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-on-navy-3">시장 레짐</p>
                  <RegimeGauge score={regimeScore} onNavy />
                </div>
                {(briefData.macro ?? []).length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {briefData.macro.slice(0, 3).map((m) => (
                      <div key={m.series} className="rounded-[8px] bg-on-navy/10 px-2 py-1.5">
                        <p className="truncate text-[10px] text-on-navy-3">{m.label}</p>
                        <p className="tnum text-xs font-bold text-on-navy">
                          {m.value.toLocaleString()}
                        </p>
                        {m.change_pct != null && (
                          <p
                            className={`tnum text-[10px] font-semibold ${
                              m.change_pct >= 0 ? "text-up-on-navy" : "text-down-on-navy"
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

        {/* ── 하락장 경고 — 픽이 있을 때만(빈 날은 아래 방어 surface 가 대신 설명) ── */}
        {regime?.regime === "risk_off" && picks.length > 0 && (
          <div className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-bad/30 bg-bad-soft px-4 py-3">
            <span className="mt-0.5 shrink-0 text-bad" aria-hidden>
              ⚠
            </span>
            <p className="text-[12px] leading-relaxed text-text-dim">
              <span className="font-bold text-bad">하락장(위험회피) 구간</span> — 추세·돌파 매수픽은
              하락장에서 손실 위험이 커 <span className="font-semibold text-text">자동 억제</span>됩니다.
              대신 <span className="font-semibold text-text">과대낙폭 반등(역추세)·수급</span> 픽 위주로
              제시하며, 기준을 통과하는 종목이 없으면 <span className="font-semibold text-text">빈 날</span>로
              둡니다(억지로 채우지 않음). 진입 시 분할·타이트 손절 권장.
            </p>
          </div>
        )}

        {/* ── 메인 2컬럼 ── */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* 픽 리스트 */}
          <div className="space-y-3">
            {/* 픽 stale 가드 안내 — 무효(거래 부적합·날짜 과거) 픽을 숨겼을 때 */}
            {stalePicks.length > 0 && (
              <div className="mb-3 flex items-start gap-2.5 rounded-[14px] border border-warn/30 bg-warn-soft px-4 py-3">
                <span className="mt-0.5 shrink-0 text-warn" aria-hidden>
                  ⏳
                </span>
                <p className="text-[12px] leading-relaxed text-text-dim">
                  <span className="font-bold text-warn">픽 갱신 대기 중</span> — 분석(리포트)은
                  최신이지만 추천 픽 <span className="font-semibold text-text">{stalePicks.length}건</span>이
                  최신 리포트와 어긋나(‘거래 부적합’으로 바뀌었거나 날짜가 과거) 숨겼습니다. 다음 일일
                  배치에서 최신 리포트 기준으로 다시 선정됩니다.
                </p>
              </div>
            )}
            {picks.length === 0 ? (
              recs.isSample ? (
                <div className="rounded-[12px] border border-dashed border-border bg-surface p-16 text-center">
                  <p className="text-sm text-text-mute">데이터 연결 후 오늘의 픽이 표시됩니다</p>
                </div>
              ) : stalePicks.length > 0 ? null : (
                <div className="space-y-4">
                  {/* B — 방어가 오늘의 알파 (빈 날을 정직함·신뢰로 전환) */}
                  <div className="rounded-[12px] border border-border bg-surface p-6">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl" aria-hidden>
                        🛡️
                      </span>
                      <div>
                        {/* 픽은 '종가 분석 → 다음 거래일 플랜'이다. "오늘"이라 쓰면 장중
                            사용자가 '아침에 있던 픽이 사라졌다'로 읽는다 → 대상일 명시. */}
                        <p className="text-base font-bold text-text">
                          {planDay ? `${planDay} 장전 — ` : ""}
                          {regime?.regime === "risk_off"
                            ? "살 종목이 없습니다. 그게 알파입니다"
                            : "기준을 통과한 픽이 없습니다"}
                        </p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
                          {regime?.regime === "risk_off"
                            ? "하락 방어 구간이라 추세·돌파 매수를 자동으로 비웁니다(검증: 하락장 추세픽 평균 −2.85%). 억지로 추천해 물리지 않는 것 — 빈 날을 빈 날이라 말하는 게 우리 원칙입니다. 대신 반등 시 1순위 후보를 지켜보세요."
                            : "조건을 채우는 종목이 없으면 억지로 채우지 않습니다. 대신 반등 시 1순위 후보를 아래에서 지켜보세요."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* A — 반등 대기 리스트 (지금 진입 X · 신호 시 알림 → 참여·락인) */}
                  {waitlist.length > 0 && (
                    <div className="rounded-[12px] border border-border bg-surface p-5">
                      <div className="mb-1 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-text">
                          <span aria-hidden>👀</span> 반등 대기 리스트
                        </h2>
                        <span className="text-[11px] text-text-mute">
                          지금 진입 X · 신호 도달 시 알림
                        </span>
                      </div>
                      <p className="mb-3 text-[12px] text-text-mute">
                        <span className="font-medium text-text-dim">검증을 통과한 매매 플랜을 이미 보유한</span>{" "}
                        종목입니다 — 지금은 국면 때문에 발행이 막혀 있을 뿐, 시장이 돌면 가장 먼저
                        진입할 후보입니다.
                      </p>
                      {/* 표로 분리 — 현재가·목표가·점수가 라벨 없이 한 열에 쌓여 있어
                          어느 숫자가 무엇인지 구분되지 않았다. 열마다 머리글을 단다.
                          '국면 대기' 배지는 이 목록 전체의 성격이라 행마다 반복하지 않는다. */}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px] text-sm">
                          <thead>
                            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-text-mute">
                              <th className="py-2 pl-1 text-left font-medium">종목</th>
                              <th className="px-3 py-2 text-right font-medium">현재가</th>
                              <th className="px-3 py-2 text-right font-medium">전일대비</th>
                              <th className="px-3 py-2 text-right font-medium">목표가</th>
                              <th className="px-3 py-2 text-right font-medium">상승여력</th>
                              <th className="px-3 py-2 text-right font-medium">점수</th>
                              <th className="px-3 py-2 text-right font-medium">
                                <span className="sr-only">액션</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {waitlist.map((r) => {
                              const px = waitPrices.get(r.symbol ?? "");
                              // 상승여력 = 목표가 대비 현재가. '지금 사면 얼마 남았나'를 한 눈에.
                              const upside =
                                px?.close != null && r.target_price != null && px.close > 0
                                  ? r.target_price / px.close - 1
                                  : null;
                              return (
                                <tr
                                  key={r.id}
                                  className="border-b border-border/50 last:border-0 hover:bg-surface-2"
                                >
                                  <td className="py-2.5 pl-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Link
                                        href={`/stocks/${r.symbol}`}
                                        className="text-sm font-bold text-text hover:text-accent"
                                      >
                                        {r.name}
                                      </Link>
                                      <span className="mono text-[10px] text-text-mute">
                                        {r.symbol}
                                      </span>
                                      {r.rating && (
                                        <Badge
                                          variant={r.rating === "매수" ? "bull" : "warn"}
                                          size="sm"
                                        >
                                          {r.rating}
                                        </Badge>
                                      )}
                                    </div>
                                    {passedSetupsByReport.get(r.id) && (
                                      <p className="mt-0.5 text-[11px] text-good">
                                        검증 통과: {passedSetupsByReport.get(r.id)!.join(" · ")}
                                      </p>
                                    )}
                                  </td>
                                  <td
                                    className="tnum px-3 py-2.5 text-right font-bold text-text"
                                    title={px?.date ? `${px.date} 종가 기준 (장중 실시간 아님)` : undefined}
                                  >
                                    {fmtPrice(px?.close ?? null)}
                                  </td>
                                  <td
                                    className={`tnum px-3 py-2.5 text-right font-semibold ${
                                      (px?.changePct ?? 0) >= 0 ? "text-good" : "text-bad"
                                    }`}
                                  >
                                    {px?.changePct != null ? fmtPct(px.changePct) : "—"}
                                  </td>
                                  <td className="tnum px-3 py-2.5 text-right text-text-dim">
                                    {fmtPrice(r.target_price)}
                                  </td>
                                  <td className="tnum px-3 py-2.5 text-right font-semibold text-good">
                                    {upside != null ? fmtPct(upside) : "—"}
                                  </td>
                                  <td className="tnum px-3 py-2.5 text-right text-lg font-extrabold text-accent">
                                    {r.score}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <Link
                                      href={`/reports/${r.id}`}
                                      className="inline-block whitespace-nowrap rounded-[8px] border border-border px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:border-accent"
                                    >
                                      🔔 알림·분석
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-[11px] leading-relaxed text-text-mute">
                        * 매수 추천이 아닌 <span className="font-semibold text-text-dim">관찰 후보</span> — 진입가·반등 신호 도달 시 알림(관심 추가). 진입 판단은 투자자 본인.
                      </p>
                    </div>
                  )}
                </div>
              )
            ) : (
              // 기간별 구역 — 같은 날 추천이라도 단기·중기·장기는 «다른 거래»다.
              // 보유기간이 다르면 진입 방식(분할 여부)·청산 시점·성과 집계가 전부
              // 갈리므로 한 줄로 세우면 사용자가 섞어 읽는다.
              // 0건인 기간도 접지 않는다 — 기간은 1급 차원이라 «단기는 왜 없지»에
              // 답해야 한다. 접으면 사용자는 그 기간이 존재하지 않는 줄로 읽는다.
              HORIZONS.map((hz) => {
                const group = picks.filter((p) => p.horizon === hz.key);
                return (
                  <section key={hz.key} className="space-y-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 className="text-[13px] font-bold text-text">
                        {hz.label} 추천
                      </h3>
                      <span className="text-[11px] text-text-dim">
                        최대 {hz.bars}거래일 · {hz.approx}
                      </span>
                      <span className="text-[11px] text-text-mute">
                        {hz.scaleIn ? "분할 매수" : "시가 전량 매수"}
                      </span>
                      <span className="tnum ml-auto text-[11px] text-text-mute">
                        {group.length}건
                      </span>
                    </div>
                    {group.length === 0 && (
                      <p className="rounded-[12px] border border-dashed border-border px-4 py-3 text-[12px] text-text-mute">
                        이 기간에서 기준을 통과한 종목이 없습니다.
                      </p>
                    )}
                    {group.map((p, i) => (
                      <PickCard
                        key={p.symbol}
                        pick={p}
                        rank={i + 1}
                        report={reportBySymbol.get(p.symbol)}
                        riskPct={riskPct}
                        mini={snowMap.get(p.symbol)?.axes}
                        lastPrice={priceMap.get(p.symbol)?.close ?? null}
                        changePct={priceMap.get(p.symbol)?.changePct ?? null}
                        priceDate={priceMap.get(p.symbol)?.date ?? null}
                      />
                    ))}
                  </section>
                );
              })
            )}
            {/* 기간이 없는 옛 픽 — 전환 전 발행분이라 구역에 안 잡힌다. 숨기면
                사용자는 픽이 사라진 걸로 본다. */}
            {picks.filter((p) => !p.horizon).length > 0 &&
              picks
                .filter((p) => !p.horizon)
                .map((p, i) => (
                  <PickCard
                    key={p.symbol}
                    pick={p}
                    rank={i + 1}
                    report={reportBySymbol.get(p.symbol)}
                    riskPct={riskPct}
                    mini={snowMap.get(p.symbol)?.axes}
                    lastPrice={priceMap.get(p.symbol)?.close ?? null}
                    changePct={priceMap.get(p.symbol)?.changePct ?? null}
                    priceDate={priceMap.get(p.symbol)?.date ?? null}
                  />
                ))}
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
            <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
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
            <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-text">픽 기록</h2>
                <div className="flex items-center gap-2">
                  <Link href="/picks" className="text-[11px] font-semibold text-accent hover:underline">
                    전체 기록 →
                  </Link>
                </div>
              </div>

              {/* 트랙레코드 집계 — 종료 픽 기준 기대값·승률(정직한 성과) */}
              {tr.closed > 0 && (
                <div className="mb-3 rounded-[12px] bg-surface-2 p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-text-mute">종료</p>
                      <p className="tnum mt-0.5 text-base font-extrabold text-text">
                        {tr.closed}건
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-mute">승률</p>
                      <p className="tnum mt-0.5 text-base font-extrabold text-text">
                        {winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-mute">평균 손익</p>
                      <p
                        className={`tnum mt-0.5 text-base font-extrabold ${
                          (expectancy ?? 0) > 0
                            ? "text-good"
                            : (expectancy ?? 0) < 0
                              ? "text-bad"
                              : "text-text"
                        }`}
                      >
                        {expectancy != null
                          ? `${expectancy >= 0 ? "+" : ""}${(expectancy * 100).toFixed(1)}%`
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-text-mute">
                    목표 {tr.target} · 1차익절 {tr.partial} · 손절 {tr.stopped} ·
                    만료 {tr.expired} · 추세 전략은 손절이 잦아도{" "}
                    <span className="font-semibold text-text-dim">
                      평균 손익(기대값)이 양(+)
                    </span>
                    이면 장기 수익 — 승률보다 기대값으로 판단합니다
                  </p>
                </div>
              )}

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
                              h.status === "목표 도달" || h.status === "1차 익절"
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
