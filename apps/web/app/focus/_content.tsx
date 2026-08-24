// /focus — 서버 컴포넌트 (데이터 패칭)
// 토글 인터랙션은 _pick-card.tsx (클라이언트)에 위임

import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";
import { AppShell } from "@/components/AppShell";
import { TRADE_SETUP_LABELS as SETUP_LABELS } from "@stock-alpha/db";
import {
  getBacktests,
  getLatestPrice,
  getLatestPricesBySymbols,
  getMarketState,
  getPlanCombosForReports,
  getMorningBrief,
  getDisclosuresForSymbols,
  getEventEvidence,
  getNewsEvents,
  getOpenPicks,
  getRecommendations,
  getReports,
  getTradingCalendar,
  getUserRiskPct,
} from "@/lib/data";
import { regimeCopy } from "@/components/RegimeHeader";
import { SampleBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { fmtPct, fmtPrice, nextTradingDayLabel, tradingDayLabel } from "@/lib/format";
import { PickCard } from "./_pick-card";
import { HORIZONS, isHorizonPaused, horizonSpec } from "@/lib/holding";
import { PickNewsRail } from "@/components/PickNewsRail";
import { OpenPicksSummary } from "@/components/OpenPicksSummary";
import { OpenPicksTable } from "@/components/OpenPicksTable";

// 레짐 게이지 (3구간 바 + 마커)
export default async function FocusContent() {
  const [recs, allReports, brief, riskPct, marketState, backtests, openPicks, cal] =
    await Promise.all([
      getRecommendations(),
      getReports(200, { includeUnfit: true }), // 최신일 분포 집계 — 일 발행 상한(100)+α 커버
      getMorningBrief(),
      getUserRiskPct(),
      getMarketState(),
      getBacktests(), // 반등 대기 리스트의 '검증 통과 플랜 보유' 판정용
      getOpenPicks(30), // 「진행 중」 — 손절에 가까운 순으로 온다
      getTradingCalendar(), // 청산 예정일 계산 — 휴장일을 한 번만 읽는다
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
  // 픽이 리포트보다 «오래된» 경우만 숨긴다.
  //
  // 예전엔 '최신 리포트가 거래 부적합이면 숨김'이었는데, 그 rating 은 리포트를 만든 날의
  // 게이트로 계산된 값이라 게이트가 바뀌면 어긋난다. 2026-08-22 실제 사례 — 8/21 리포트는
  // 옛 게이트로 «통과 셋업 없음 → 거래 부적합»이 찍혔는데, 새 게이트에서는 그 종목의
  // double_bottom 이 통과한다. 엔진은 그걸 보고 픽을 냈는데 화면이 이 가드로 다시 가렸다.
  //
  // 무엇을 발행할지는 엔진이 정한다(engine/reports/daily.select_picks — 종목 성질 +
  // 셋업×기간 게이트를 «지금» 기준으로 본다). 화면이 더 거친 신호(셋업 단위·그날 기준
  // rating)로 그 결정을 뒤집으면 안 된다. 여기서는 날짜 어긋남만 잡는다.
  const isInvalid = (p: (typeof allPicks)[number]) => {
    const rep = repForGuard.get(p.symbol);
    return Boolean(rep?.as_of && p.as_of && rep.as_of > p.as_of);
  };
  const stalePicks = picksToday.filter(isInvalid);
  const picks = picksToday.filter((p) => !isInvalid(p));
  // 카드용 미니 스노우플레이크 5축 — 픽 종목만 벌크 1회 조회(실패 시 빈 Map).
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
  // 점수 분포 — 예전에는 reports.rating 을 그대로 세어 「매수 43 · 중립 99 · 관망 10 ·
  // 부적합 27」을 띄웠다. 그 값은 **새 발행 규칙과 반대로** 움직인다(2026-08-23 확인):
  //   · 오늘 발행된 유일한 픽 오리온의 rating 이 「거래 부적합」이다 → 발행된 픽이
  //     「부적합 27건」 안에 들어가 있었다.
  //   · 「매수 43건」에는 발행된 픽이 한 건도 없다.
  // rating 은 점수 문턱(매수≥65)에 **리포트를 만든 날의 거래가능 게이트**를 덧씌운
  // 값이라, 게이트가 (셋업×기간) 축으로 바뀐 뒤로 어긋난다. 발행을 정하는 건 점수가
  // 아니라 백테스트 게이트·국면·예산이다.
  //
  // 그래서 게이트가 섞이지 않은 **점수만** 센다. 점수는 «후보»를 좁히는 단계이지
  // 발행 판정이 아니라는 것을 패널 문구로 못박는다.
  const scored = todayReports.filter((r) => r.score != null);
  const inRange = (lo: number, hi: number) =>
    scored.filter((r) => (r.score as number) >= lo && (r.score as number) < hi).length;
  const scoreBoard = {
    high: inRange(65, Infinity),
    mid: inRange(60, 65),
    low: inRange(45, 60),
    weak: inRange(0, 45),
    scored: scored.length,
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

  // 픽 카드 ④「이 조합의 검증 성적」에 붙일 백테스트 행 — **기간(horizon) 축**으로만
  // 찾는다. 스타일로 찾으면 안 된다: 같은 쌍바닥이라도 옛 스타일 축(swing)은 기대값
  // +0.11R·최근구간 −0.035R 로 게이트를 **통과하지 못했고**, 지금 발행 근거인 기간
  // 축(mid)은 +0.35R 로 통과했다. 스타일 행을 붙이면 통과한 적 없는 조합의 숫자를
  // 「검증 성적」이라며 보여주게 된다.
  const btByCombo = new Map<string, (typeof backtests.data)[number]>();
  for (const b of backtests.data) {
    if (!b.horizon) continue; // 기간 축 도입 전 행은 지금 규칙의 근거가 아니다
    const key = `${b.setup}|${b.horizon}`;
    if (!btByCombo.has(key)) btByCombo.set(key, b); // 조회가 최신순이라 첫 행이 최신
  }
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

  // ── 진행 중(이미 산 픽) ──
  // 이 자리에 예전에는 픽 이력에서 status==="진행중" 만 거른 변수가 있었는데
  // **어디에도 그려지지 않았다** — 계산만 하고 버렸다. 그래서 「오늘의 픽」 전용
  // 페이지가 «사기 전 계획»만 말하고 «산 뒤 상태»는 홈에만 있었다.
  // 표는 홈과 같은 컴포넌트를 쓴다. 한 종목이 두 화면에서 다른 열·다른 이름을 쓰면
  // 사용자는 둘 중 하나가 틀렸다고 읽는다(오늘 픽 카드에서 겪은 것과 같은 문제).
  const openExitDays = new Map<string, string | null>(
    openPicks.map((p) => {
      const bars = horizonSpec(p.horizon)?.bars;
      const iso = bars ? cal.nth(p.asOf, bars) : null;
      return [p.symbol, iso ? tradingDayLabel(iso) : null];
    }),
  );
  const pendingCount = picksToday.filter((p) => p.status === "pending").length;

  // ── 종목 소식(우측 레일) ──
  // 오늘의 픽이 먼저, 그다음 보유 픽. 같은 종목이 양쪽에 있으면 픽 쪽만 남긴다.
  const NEWS_DAYS = 30;
  const newsRows: { symbol: string; name: string; kind: "pick" | "open" }[] = [];
  const seenNewsSym = new Set<string>();
  for (const p of picks) {
    if (!p.symbol || seenNewsSym.has(p.symbol)) continue;
    seenNewsSym.add(p.symbol);
    newsRows.push({ symbol: p.symbol, name: p.name, kind: "pick" });
  }
  for (const p of openPicks) {
    if (!p.symbol || seenNewsSym.has(p.symbol)) continue;
    seenNewsSym.add(p.symbol);
    newsRows.push({ symbol: p.symbol, name: p.name, kind: "open" });
  }
  const newsSyms = newsRows.map((r) => r.symbol);
  const [pickDisclosures, pickNews, eventEvidence] = await Promise.all([
    getDisclosuresForSymbols(newsSyms, { days: NEWS_DAYS, perSymbol: 2 }),
    // 보도는 «같은 날 2개 이상 매체»만 사건으로 센다 — 한 곳이 쓴 건 사건이 아니다.
    getNewsEvents(newsSyms, { minOutlets: 2, days: NEWS_DAYS }),
    getEventEvidence(),
  ]);

  // 트랙레코드 집계(승률·기대값·종료 사유)는 여기서 뺐다 — 그 패널이 「종목 소식」으로
  // 교체됐다. 성과 숫자는 /picks 한 곳에서만 낸다. 두 화면이 서로 다른 승률을 말하던
  // 문제(미체결·규칙 교체 정리를 어디까지 세느냐)도 거기서 함께 정리한다.
  // 브리프에서 남겨 쓰는 건 «위험회피 구간인가» 하나뿐이다. 헤드라인·워치포인트·
  // 매크로·레짐 게이지는 이 페이지에서 뺐다(홈과 「시장」이 같은 것을 이미 말한다).
  const regime = brief.data?.regime ?? null;

  // 국면 문구는 컴포넌트가 아니라 값으로 받아 헤더 밴드 안에 얹는다.
  const rc = regimeCopy(marketState);

  // 지금 발행을 쉬는 기간 — 그 기간에 남은 픽이 없을 때만 «안 낸다»고 말할 수 있다.
  const pausedHorizons = HORIZONS.filter(
    (hz) => isHorizonPaused(hz.key) && !picks.some((p) => p.horizon === hz.key),
  );

  return (
    // 다른 메뉴와 같은 머리 골격을 쓴다(2026-08-23 Victor) — 예전에는 이 페이지만
    // GNB + main 을 직접 짜서 제목·배지·설명의 자리와 크기가 다른 메뉴와 어긋났다.
    // 「국면」은 머리에 두지 않는다 — 바로 아래 전제 밴드가 같은 것을 더 자세히
    // (그래서 무엇을 발행하는가까지) 말한다. 둘 다 두면 어느 쪽이 지금인지 되묻는다.
    <AppShell
      title="오늘의 픽"
      asOf={basisDay ? `${basisDay} 종가 분석` : null}
      subtitle="시스템 기준을 통과한 관심 후보입니다. 사람이 고르지 않습니다 — 직전 거래일 종가로 분석해 다음 거래일 장전 플랜으로 냅니다."
      stats={[
        { label: "분석", value: `${scoreBoard.total}` },
        { label: "발행", value: `${picks.length}`, tone: "accent" as const },
        { label: "진행 중", value: `${openPicks.length}` },
      ]}
      headerExtra={
        rc || scoreBoard.total > 0 ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,280px)]">
              {/* 좌 — 국면. 픽을 읽기 전에 깔고 가는 전제다. */}
              <div>
                {rc ? (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-bold text-on-navy">
                        {rc.icon} 지금 시장: {rc.name}
                      </span>
                      <span className="text-[12px] font-medium text-on-navy-2">
                        → {rc.routing}
                      </span>
                    </div>
                    {rc.drivers.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {rc.drivers.slice(0, 3).map((d, i) => (
                          <span
                            key={i}
                            className="rounded-[999px] bg-on-navy/10 px-2.5 py-1 text-[10px] text-on-navy-2"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* 하락장 경고를 별도 박스로 두지 않는다 — 위 routing 이 이미
                        «무엇을 막는가»를 말했다. 여기서는 «그래서 어떻게 사는가»만 덧댄다. */}
                    {regime?.regime === "risk_off" && picks.length > 0 && (
                      <p className="mt-2 text-[11px] leading-relaxed text-warn-on-navy">
                        하락장 구간입니다 — 진입은 분할로, 손절은 계획대로 타이트하게.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-on-navy-2">국면 판정을 불러오지 못했습니다.</p>
                )}
                <Link
                  href="/market"
                  className="mt-2.5 inline-block text-[11px] font-semibold text-accent-on-navy hover:underline"
                >
                  시장 브리프·지표 자세히 →
                </Link>
              </div>

              <div className="hidden bg-on-navy/15 lg:block" />

              {/* 우 — 깔때기. 「왜 오늘 이것뿐인가」에 숫자로 답한다.
                  전에는 3단계 카드로 「점수순 상위 5」까지 적었는데, 발행 수를 정하는
                  건 이제 점수 순위가 아니라 예산(리스크·노출·종목수)이다. 화면에 숫자를
                  박아두면 규칙이 바뀔 때 또 틀린다 — 세는 값만 적는다. */}
              <div>
                <p className="text-[11px] font-semibold text-on-navy-3">오늘 선정</p>
                <div className="mt-1.5 flex items-end gap-3">
                  <div>
                    <p className="tnum text-xl font-extrabold text-on-navy">
                      {scoreBoard.total}
                    </p>
                    <p className="text-[10px] text-on-navy-3">종목 분석</p>
                  </div>
                  <span className="pb-1.5 text-on-navy-3">→</span>
                  <div>
                    <p className="tnum text-xl font-extrabold text-accent-on-navy">
                      {picks.length}
                    </p>
                    <p className="text-[10px] text-on-navy-3">건 발행</p>
                  </div>
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-on-navy-3">
                  점수 미달 · 백테스트 게이트 미통과 · 국면 억제 · 예산 초과는 발행하지
                  않습니다. 통과가 없으면 빈 날로 둡니다.
                </p>
              </div>
            </div>
        ) : null
      }
      badge={
        <>
          {planDay && (
            // 네이비 위에서는 인디고(accent)가 묻힌다(대비 2.4:1) — 밝은 인디고 바탕에
            // 네이비 글자로 뒤집는다.
            <span className="rounded-[999px] bg-accent-on-navy px-3 py-1 text-[11px] font-bold text-navy">
              → {planDay} 장 시작 전 플랜
            </span>
          )}
          {recs.isSample && <SampleBadge onNavy />}
        </>
      }
    >
      <div id="today-picks">

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
                      {/* 표로 분리 — 숫자가 라벨 없이 한 열에 쌓여 있어 어느 값이
                          무엇인지 구분되지 않았다. 열마다 머리글을 단다.
                          '국면 대기' 배지는 이 목록 전체의 성격이라 행마다 반복하지 않는다. */}
                      {/* ── 폰 (768 미만) — 후보 하나가 한 항목 ── */}
                      <div className="md:hidden">
                        {waitlist.map((r) => {
                          const px = waitPrices.get(r.symbol ?? "");
                          return (
                            <div
                              key={`m-${r.id}`}
                              className="border-b border-border/50 py-3 last:border-0"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      href={`/stocks/${r.symbol}`}
                                      className="text-[15px] font-bold text-text"
                                    >
                                      {r.name}
                                    </Link>
                                    <SymbolCode
                                      symbol={r.symbol}
                                      className="text-[12px] text-text-mute"
                                    />
                                    {r.rating && (
                                      <Badge variant={r.rating === "매수" ? "bull" : "warn"} size="sm">
                                        {r.rating}
                                      </Badge>
                                    )}
                                  </div>
                                  {passedSetupsByReport.get(r.id) && (
                                    <p className="mt-1 text-[12px] text-good">
                                      검증 통과: {passedSetupsByReport.get(r.id)!.join(" · ")}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="tnum text-[15px] font-bold text-text">
                                    {fmtPrice(px?.close ?? null)}
                                  </p>
                                  <p
                                    className={`tnum text-[12.5px] font-semibold ${
                                      (px?.changePct ?? 0) >= 0 ? "text-good" : "text-bad"
                                    }`}
                                  >
                                    {px?.changePct != null ? fmtPct(px.changePct) : "—"}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-3">
                                <span className="tnum text-[15px] font-extrabold text-accent">
                                  {r.score}점
                                </span>
                                <Link
                                  href={`/reports/${r.id}`}
                                  className="ml-auto inline-block whitespace-nowrap rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-accent"
                                >
                                  🔔 알림·분석
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead>
                            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-text-mute">
                              <th className="py-2 pl-1 text-left font-medium">종목</th>
                              <th className="px-3 py-2 text-right font-medium">현재가</th>
                              <th className="px-3 py-2 text-right font-medium">전일대비</th>
                              <th className="px-3 py-2 text-right font-medium">점수</th>
                              <th className="px-3 py-2 text-right font-medium">
                                <span className="sr-only">액션</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {waitlist.map((r) => {
                              const px = waitPrices.get(r.symbol ?? "");
                              // 「목표가」·「상승여력」을 뺐다(2026-08-23). 이 목록은 아직
                              // 픽이 아니라 진입가가 없다 — 진입가가 없으면 본전 도달가도
                              // 없고, «목표까지 남은 폭»은 그 목표에서 팔지 않으므로 실현되지
                              // 않는다. 여기서 답해야 할 질문은 «얼마 벌 수 있나»가 아니라
                              // «왜 후보인가»이고, 그건 이름 밑 「검증 통과」 줄이 말한다.
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
                                      <SymbolCode symbol={r.symbol} className="text-[10px] text-text-mute" />
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
              // 구역은 «발행하는 기간»만 세운다(2026-08-23 Victor 지적). 예전에는
              // 카탈로그(HORIZONS) 셋을 다 세우고 장기 자리에 「발행을 쉬고 있습니다」를
              // 적었는데, 그러면 장기가 «오늘 마침 비어 있는 칸»으로 읽힌다. 내일도
              // 모레도 안 나오는 것을 매일 빈 칸으로 그리면 사용자는 계속 기다린다.
              // 쉬는 기간은 목록 아래 각주에서 한 번만 말한다.
              //
              // 다만 그 기간에 픽이 실제로 있으면(전환 전 발행분) 구역을 세운다 —
              // 발행 목록에서 빠졌다고 이미 낸 픽까지 숨기면 사용자는 픽이 사라진
              // 걸로 본다.
              HORIZONS.filter(
                (hz) =>
                  !isHorizonPaused(hz.key) || picks.some((p) => p.horizon === hz.key),
              ).map((hz) => {
                const group = picks.filter((p) => p.horizon === hz.key);
                // 빈 기간은 한 줄로 접는다. 지우지는 않는다 — 발행하는 기간이라면
                // «단기는 왜 없지»에 답해야 한다. 하지만 머리글 + 점선 상자로 자리를
                // 잡으면 «곧 채워질 칸»처럼 읽혀서, 픽 1건과 없는 기간이 화면에서 같은
                // 무게를 갖는다(홈에서 유령 행을 걷어낸 것과 같은 이유).
                if (group.length === 0) {
                  return (
                    <p
                      key={hz.key}
                      className="flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-text-mute"
                    >
                      <span className="font-semibold text-text-dim">{hz.label}</span>
                      <span className="tnum">0건</span>
                      <span>—</span>
                      <span>기준을 통과한 종목이 없습니다</span>
                    </p>
                  );
                }
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
                    {group.map((p) => (
                      <PickCard
                        key={p.symbol}
                        pick={p}
                        report={reportBySymbol.get(p.symbol)}
                        riskPct={riskPct}
                        backtest={btByCombo.get(`${p.setup}|${p.horizon}`) ?? null}
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
                .map((p) => (
                  <PickCard
                    key={p.symbol}
                    pick={p}
                    report={reportBySymbol.get(p.symbol)}
                    riskPct={riskPct}
                    backtest={null}
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

            {/* 쉬는 기간은 여기서 한 번만 말한다 — 구역으로 세우면 «오늘 마침 빈 칸»이
                되고, 아무 말도 안 하면 «장기는 어디 갔지»가 된다. 이유에 측정값을
                같이 적는다: 근거 없이 «성적이 낮아서»라고만 하면 임의로 뺀 것처럼 읽힌다.
                게이트·백테스트는 세 기간을 그대로 재고 있고, 내보내는 것만 줄인 것이다. */}
            {pausedHorizons.length > 0 && (
              <p className="mt-3 border-t border-border-soft pt-3 text-[11px] leading-relaxed text-text-mute">
                <span className="font-semibold text-text-dim">
                  {pausedHorizons.map((h) => h.label).join("·")}는 발행하지 않습니다
                </span>{" "}
                — 지난 1년 재현에서 거래당 기대값이 단기 +0.331R · 중기 +0.457R ·
                장기 +0.204R 로 가장 낮았습니다. 검증은 세 기간 모두 계속 돌리고 있고,
                내보내는 것만 줄였습니다.{" "}
                <Link href="/strategies" className="text-accent hover:underline">
                  검증 결과 보기 →
                </Link>
              </p>
            )}

          </div>

          {/* 우측 레일 */}
          <div className="flex flex-col gap-5">
            {/* 오늘 점수 분포 — 「오늘의 판정 현황」이 있던 자리.
                옛 패널은 reports.rating 을 세어 「매수 43 · 중립 99 · 관망 10 ·
                부적합 27」을 띄웠는데, 그 값이 새 발행 규칙과 **반대로** 움직였다:
                오늘 발행된 유일한 픽(오리온)의 rating 이 「거래 부적합」이라 발행된
                픽이 부적합 칸에 들어가 있었고, 「매수 43건」에는 발행된 픽이 하나도
                없었다. rating 은 점수 문턱에 «리포트를 만든 날의 거래가능 게이트»를
                덧씌운 값이라 게이트가 (셋업×기간) 축으로 바뀐 뒤로 어긋난다.

                게이트가 섞이지 않은 점수만 센다. 그리고 «점수는 발행을 정하지 않는다»를
                패널 안에 적는다 — 안 적으면 65점+ 49종목을 보고 «49개 살 만하구나»로
                읽는다. */}
            <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-text">오늘 점수 분포</h2>
                <Link href="/reports" className="text-[11px] text-accent hover:underline">
                  전체 보기 →
                </Link>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-text-mute">
                {latestDay ?? "—"} 분석 {scoreBoard.scored}종목 · 팩터 40 + 밸류 30 +
                시그널 30 = 100점
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { label: "65점 이상", n: scoreBoard.high, cls: "text-good", bg: "bg-good-soft" },
                    { label: "60~64점", n: scoreBoard.mid, cls: "text-warn", bg: "bg-warn-soft" },
                    { label: "45~59점", n: scoreBoard.low, cls: "text-text-dim", bg: "bg-surface-2" },
                    { label: "45점 미만", n: scoreBoard.weak, cls: "text-text-mute", bg: "bg-surface-2" },
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
              <p className="mt-2.5 border-t border-border-soft pt-2.5 text-[10.5px] leading-relaxed text-text-mute">
                <span className="font-semibold text-text-dim">점수가 발행을 정하지 않습니다.</span>{" "}
                점수는 후보를 좁히는 단계이고, 실제 발행은 그 종목의 (셋업 × 기간)이
                백테스트 게이트를 통과했는지 · 지금 국면이 그 성격을 허용하는지 ·
                포트폴리오 예산이 남았는지로 정합니다. 오늘은{" "}
                <span className="tnum font-semibold text-text-dim">
                  {scoreBoard.high + scoreBoard.mid}종목
                </span>
                이 60점을 넘었지만 발행은{" "}
                <span className="tnum font-semibold text-text-dim">{picks.length}건</span>
                입니다.
              </p>
            </section>

            {/* 종목 소식 — 「픽 기록」이 있던 자리(2026-08-23 Victor 교체 요청).
                옛 패널은 숫자가 틀렸고(「종료」에 미체결·규칙 교체 정리가 섞였고,
                목록 맨 위에는 아직 사지도 않은 「진입 대기」가 기록으로 올라왔다)
                「진행 중」 섹션이 생기면서 자리도 겹쳤다. 성과 집계는 /picks 한 곳에서
                정리한다. 픽을 보는 사람이 옆에서 확인하고 싶은 것은 지난 성적표가
                아니라 «이 종목에 무슨 일이 있었나»다. */}
            <PickNewsRail
              rows={newsRows}
              news={pickNews}
              disclosures={pickDisclosures}
              evidence={eventEvidence}
              days={NEWS_DAYS}
            />
          </div>
        </div>

        {/* ── 진행 중 — 산 뒤 상태 ──
            「오늘의 픽」과 짝이다: 오늘의 픽 = 사기 전 계획, 진행 중 = 산 뒤 상태.
            이게 없으면 이 페이지는 «권장 비중 25%로 사라»고만 하고 지금 무엇을 얼마나
            들고 있는지는 말하지 않는다 — 살 여력을 판단할 근거가 화면에 없다.

            **홈과 같은 형태**로 둔다(2026-08-23 Victor). 처음엔 좌측 열 안에 표만
            넣고 요약을 머리줄 한 줄로 접었는데, 그러면 같은 것이 두 화면에서 다른
            모양이 된다 — 매일 홈을 보던 사람이 여기서 «어제 보던 그 자리»를 잃는다.
            좌우로 가르려면 폭이 필요하므로 2컬럼 그리드 **밖**, 전폭에 놓는다.
            좌 = 보유 전체가 어떤가, 우 = 종목별로 어떤가. */}
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text">
              진행 중{" "}
              <span className="text-[11px] font-medium text-text-mute">
                {openPicks.length > 0
                  ? `이미 산 픽 ${openPicks.length}건 · 손절 가까운 순`
                  : "이미 산 픽"}
              </span>
            </h2>
            <Link href="/picks" className="text-[11px] text-accent hover:underline">
              전체 기록 →
            </Link>
          </div>
          {/* 홈과 같은 비율 — 표가 8열이라 우측을 넉넉히 준다(최소폭 760px). */}
          <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(280px,1fr)_2.6fr]">
            <OpenPicksSummary picks={openPicks} />
            <OpenPicksTable
              picks={openPicks}
              exitDays={openExitDays}
              pendingCount={pendingCount}
              planDay={planDay}
            />
          </div>
        </section>

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
      </div>
    </AppShell>
  );
}
