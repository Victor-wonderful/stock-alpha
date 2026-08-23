import { Fragment } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MarketBrief } from "@/components/MarketBrief";
import { MarketTicker } from "@/components/MarketTicker";
import { SectorTable } from "@/components/SectorTable";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/ui";
import {
  getEventEvidence,
  getLatestDisclosures,
  getMarket,
  getMarketQuotes,
  getMorningBrief,
  getNextTradingDay,
  getSignalSectorCounts,
} from "@/lib/data";
import {
  EVENT_LABEL,
  VERDICT_CLASS,
  VERDICT_LABEL,
  contradictsDirection,
  evidenceSentence,
} from "@/lib/events";
import type { EventEvidence } from "@/lib/events";
import { fmtNum, tradingDayLabel } from "@/lib/format";
import type { Regime, SectorRotationView } from "@/lib/types";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

const REGIME_META: Record<
  Regime,
  { label: string; variant: "bull" | "warn" | "bear"; gaugeLabel: string; color: string }
> = {
  risk_on: {
    label: "강세장 · 공격 (Risk-On)",
    variant: "bull",
    gaugeLabel: "위험 선호",
    color: "bg-good",
  },
  neutral: {
    label: "중립 (Neutral)",
    variant: "warn",
    gaugeLabel: "중립",
    color: "bg-warn",
  },
  risk_off: {
    label: "방어 구간 (위험 회피 · Risk-off)",
    variant: "bear",
    gaugeLabel: "위험 회피",
    color: "bg-bad",
  },
};

// 섹터 사분면 맵 — SVG 기반 (모멘텀 x축, 수급 y축)
/**
 * 섹터 사분면 — 점 대신 «칸»으로.
 *
 * 예전에는 320×240 SVG 에 27개 섹터를 점으로 찍고 8px 라벨을 붙였다. 이름이 서로
 * 겹쳐 읽을 수가 없었고(2026-08-23 Victor), 정작 사분면이 말하는 것은 정확한 좌표가
 * 아니라 «어느 칸에 있나»다. 칸을 네 장으로 세우고 그 안에 이름을 적는다.
 *
 * 칸 이름만으로는 뜻이 안 통해서(「선취매」가 무엇인지) 한 줄씩 붙인다.
 */
const QUADRANTS = [
  {
    key: "lead",
    name: "주도",
    axis: "모멘텀 ↑ · 수급 ↑",
    desc: "오르는데 돈도 들어온다",
    cls: "border-good/30 bg-good-soft",
    tone: "text-good",
    hit: (s: SectorRotationView) => s.momentum >= 0 && s.flow >= 0,
  },
  {
    key: "early",
    name: "선취매",
    axis: "모멘텀 ↓ · 수급 ↑",
    desc: "아직 안 올랐는데 돈이 먼저 들어온다",
    cls: "border-accent/30 bg-accent-soft",
    tone: "text-accent",
    hit: (s: SectorRotationView) => s.momentum < 0 && s.flow >= 0,
  },
  {
    key: "take",
    name: "차익실현",
    axis: "모멘텀 ↑ · 수급 ↓",
    desc: "올랐지만 돈은 빠지는 중",
    cls: "border-warn/30 bg-warn-soft",
    tone: "text-warn",
    hit: (s: SectorRotationView) => s.momentum >= 0 && s.flow < 0,
  },
  {
    key: "out",
    name: "소외",
    axis: "모멘텀 ↓ · 수급 ↓",
    desc: "안 오르고 돈도 나간다",
    cls: "border-border-soft bg-surface-2",
    tone: "text-text-mute",
    hit: (s: SectorRotationView) => s.momentum < 0 && s.flow < 0,
  },
] as const;

function QuadrantCards({ sectors }: { sectors: SectorRotationView[] }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {QUADRANTS.map((q) => {
        const rows = sectors.filter(q.hit);
        return (
          <div key={q.key} className={`rounded-[12px] border px-3.5 py-3 ${q.cls}`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={`text-[12.5px] font-bold ${q.tone}`}>{q.name}</span>
              <span className="tnum text-[11px] font-semibold text-text-dim">
                {rows.length}개
              </span>
              <span className="text-[10px] text-text-mute">{q.axis}</span>
            </div>
            <p className="mt-0.5 text-[10.5px] text-text-mute">{q.desc}</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-dim">
              {rows.length === 0
                ? "해당 섹터 없음"
                : rows
                    .slice()
                    .sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum))
                    .map((r) => r.sector)
                    .join(" · ")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h2 className="text-sm font-bold text-text">{title}</h2>
      {note && <span className="text-[11px] text-text-mute">{note}</span>}
    </div>
  );
}

export default async function MarketPage() {
  const [
    { data, isSample },
    { data: quotes },
    { data: signalSectors },
    { data: disclosures },
    evidence,
  ] = await Promise.all([
    getMarket(),
    getMarketQuotes(),
    getSignalSectorCounts(),
    // 방향당 상한을 넉넉히 — 그날 공시를 전부 보여준다(8/14 기준 호재 36·악재 30·중립 24).
    // 열마다 내부 스크롤이 있어 페이지 길이는 늘지 않는다.
    getLatestDisclosures(60),
    // 유형별 성적표 — 호재/악재 분류는 추측이라 실측을 함께 붙인다.
    getEventEvidence(),
  ]);
  const { regime, macro, sectors } = data;
  const rm = REGIME_META[regime.regime];

  // 레짐 게이지: score -1~1 → 0~100%
  const gauge = Math.round(((regime.score + 1) / 2) * 100);

  const maxFlow = Math.max(...sectors.map((s) => Math.abs(s.flow)), 1);
  const maxMom = Math.max(...sectors.map((s) => Math.abs(s.momentum)), 1);

  // ── 공시를 «유형»으로 묶는다 ──
  // 실측 판정(event_evidence)이 유형 단위로 계산된 값이라, 종목마다 붙이면 같은
  // 문장이 25번 반복된다(2026-08-21 단일판매·공급계약 25건). 유형이 주인공이고
  // 종목은 그 안의 목록이다.
  //
  // 정렬은 «알려줄 값이 큰 순»: 분류와 실측이 어긋난 유형 → 판정이 선 유형 → 건수.
  // 「공급계약이 25건 들어왔는데 이 유형은 실측이 나쁘다」가 맨 위에 와야 한다.
  const disclosureGroups = (() => {
    const all = [
      ...disclosures.positive.map((d) => ({ d, dir: "positive" as const })),
      ...disclosures.neutral.map((d) => ({ d, dir: "neutral" as const })),
      ...disclosures.negative.map((d) => ({ d, dir: "negative" as const })),
    ];
    const DIR_LABEL = { positive: "호재", neutral: "중립", negative: "악재" } as const;
    const byType = new Map<
      string,
      { key: string; label: string; dirLabel: string; rows: typeof disclosures.positive; ev?: EventEvidence; flips: boolean }
    >();
    for (const { d, dir } of all) {
      const key = d.eventType ?? "(미분류)";
      let g = byType.get(key);
      if (!g) {
        const ev = d.eventType ? evidence.get(d.eventType) : undefined;
        g = {
          key,
          label: (d.eventType && EVENT_LABEL[d.eventType]) || d.eventType || "미분류",
          dirLabel: DIR_LABEL[dir],
          rows: [],
          ev,
          flips: contradictsDirection(d.direction, ev?.verdict),
        };
        byType.set(key, g);
      }
      g.rows.push(d);
    }
    const rank = (g: { flips: boolean; ev?: EventEvidence }) =>
      g.flips ? 0 : g.ev && g.ev.verdict !== "insufficient" ? 1 : 2;
    const groups = [...byType.values()].sort(
      (a, b) => rank(a) - rank(b) || b.rows.length - a.rows.length,
    );
    return { groups, total: all.length };
  })();
  // 섹터별 오늘 시그널 건수 — 표가 찾아 쓰기 좋게 맵으로 넘긴다.
  const signalCountBySector = Object.fromEntries(
    signalSectors.map((sc) => [sc.sector, sc.count]),
  );

  // 오늘의 시황 — 2026-08-22 에 홈에서 옮겨 왔다(IA 1단계).
  // 내용은 «전망»이 아니라 «오늘 무슨 일이 있었나 + 과거 같은 상황의 빈도»다.
  // 442거래일 측정에서 무조건 "오른다"의 적중률이 55.3%였다 — 전망을 쓰면 그 55%가
  // 시스템 실력으로 읽힌다. MarketBrief 는 기준선과 뚜렷한 차이가 없으면 아예
  // 표시하지 않는다(components/MarketBrief 주석). 그 판단을 잃지 않으려고 옮겼다.
  const brief = await getMorningBrief();
  // 상승 종목 비중 — 시황이 이미 들고 있는 실측값. 예시 게이지를 대체한다.
  const mk = brief.data?.market ?? null;
  const upTotal = mk ? mk.advancers + mk.decliners : 0;
  const upShare = mk && upTotal > 0 ? mk.advancers / upTotal : 0;
  const baseUp = mk?.baseline?.up_rate_1d ?? null;
  const briefAsOf = brief.data?.as_of ?? null;
  const briefPlanDay = briefAsOf ? await getNextTradingDay(briefAsOf) : null;

  return (
    <AppShell
      title="시장"
      asOf={briefAsOf ? `${tradingDayLabel(briefAsOf)} 기준` : null}
      subtitle="지금 시장이 어떤 구간인가 — 매크로 · 레짐 · 섹터 · 공시. 전망이 아니라 잰 값입니다."
      stats={[
        { label: "레짐", value: rm.label },
        { label: "레짐 점수", value: `${gauge}`, tone: "accent" as const },
        { label: "섹터", value: `${sectors.length}` },
      ]}
      badge={isSample ? <SampleBadge onNavy /> : undefined}
    >
      {/* ── 밴드 1 · 오늘 무슨 일이 있었나 ──
           예전에는 시황·공시·수급·섹터·보도가 한 줄로 계속 아래로 이어졌다(렌더
           텍스트 783줄). 읽는 사람은 «지금 어디를 보고 있는지»를 잃는다.
           세 덩어리로 가르고 각 덩어리에 «무엇에 답하는 칸인가»를 붙인다.
           「최근 보도」는 뺐다 — 오늘의 픽의 「종목 소식」이 같은 데이터를 추천·보유
           종목에 대해 이미 말한다(2026-08-23 Victor). 여기는 시장 전체만 본다. */}
      <SectionHead
        title="오늘 무슨 일이 있었나"
        note="전 종목을 세어본 값입니다 — 전망이 아닙니다"
      />
      {/* 시황과 「상승 종목 비중」을 한 카드로 합쳤다(2026-08-23 Victor) — 둘이
          **같은 데이터**다. 비중은 시황이 들고 있는 오른/내린 종목 수로 계산한
          값이라, 따로 두면 같은 사실을 두 칸에서 두 번 말하게 된다. */}
      <div className="mb-4">
        {brief.data?.market ? (
          <section className="rounded-[12px] border border-border bg-surface p-5">
            <MarketBrief market={brief.data.market} planDay={briefPlanDay} />
            <div className="mt-4 border-t border-border-soft pt-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-[13px] font-bold">상승 종목 비중</h3>
            <span className="text-[11px] text-text-mute">
              오른 종목 ÷ (오른 + 내린) · 전 종목 집계
            </span>
          </div>
          {mk ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={`tnum text-2xl font-extrabold ${
                    upShare >= 0.5 ? "text-good" : "text-bad"
                  }`}
                >
                  {(upShare * 100).toFixed(0)}%
                </span>
                <span className="text-[12px] text-text-dim">
                  오른 종목 <span className="tnum font-semibold">{mk.advancers.toLocaleString()}</span>
                  {" · "}내린 종목{" "}
                  <span className="tnum font-semibold">{mk.decliners.toLocaleString()}</span>
                </span>
              </div>
              <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={`h-3 rounded-full ${upShare >= 0.5 ? "bg-good/50" : "bg-bad/50"}`}
                  style={{ width: `${Math.max(0, Math.min(100, upShare * 100))}%` }}
                />
                {/* 기준선 — «아무 날이나»의 상승 비중. 이게 없으면 17%가 낮은 건지 모른다. */}
                {baseUp != null && (
                  <div
                    className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-text-dim"
                    style={{ left: `${Math.max(0, Math.min(100, baseUp * 100))}%` }}
                    title={`기준선 ${(baseUp * 100).toFixed(0)}%`}
                  />
                )}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-text-mute">
                <span>0%</span>
                {baseUp != null && <span>기준선 {(baseUp * 100).toFixed(0)}%</span>}
                <span>100%</span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-text-mute">
                투자자별(외국인·기관·개인) 순매수는 아직 연결되지 않았습니다 — 값이
                들어오면 여기에 붙입니다. <span className="text-text-dim">없는 값을
                예시로 그리지 않습니다.</span>
              </p>
            </>
          ) : (
            <p className="py-3 text-sm text-text-mute">오늘 집계를 불러오지 못했습니다.</p>
          )}

            </div>
          </section>
        ) : (
          <section className="rounded-[12px] border border-border bg-surface p-5 text-sm text-text-mute">
            오늘 시황을 불러오지 못했습니다.
          </section>
        )}
      </div>

      {/* 매크로는 카드 그리드가 아니라 «움직이는 띠»다(2026-08-23 Victor — 홈 상단과
          같은 모양으로). 지표 6개는 훑는 값이지 비교하는 값이 아니라, 카드로 세우면
          화면 한 덩어리를 먹으면서 각 칸이 하는 말은 한 줄뿐이다.
          지수와 매크로를 한 띠에 태운다 — 둘 다 «오늘의 배경»이라 자리가 같다. */}
      <div className="mb-6">
        <MarketTicker
          items={[
            ...quotes.map((q) => ({
              id: `q-${q.id}`,
              label: q.label,
              value: q.value,
              unit: q.unit,
              change: q.changePct,
              isPct: true,
            })),
            ...macro.map((m) => ({
              id: `m-${m.series_id}`,
              label: m.label,
              value: m.value,
              unit: m.unit,
              change: m.change,
              isPct: false,
            })),
          ]}
        />
        <p className="mt-1.5 text-[10px] text-text-mute">
          지수 · 매크로 — 해외 변수는 모닝 배치 갱신 · 마우스를 올리면 멈춥니다
        </p>
      </div>

      {/* ── 밴드 2 · 돈이 어디로 가나 ── */}
      <SectionHead title="돈이 어디로 가나" note="수급과 섹터 — 오늘 어디에 몰렸나" />
      <div className="mb-6 grid gap-4">
        {/* ── 섹터 로테이션 ──
             예전에는 한 카드 안에 (1) 27개 점을 찍은 사분면 SVG (2) 시그널 분포 막대
             7개 (3) 27행 표가 다 들어 있었다. 사분면은 이름이 겹쳐 못 읽었고, 분포
             막대의 값은 표의 「오늘 시그널」 열과 같은 값이라 두 번 그린 셈이었다.
             사분면을 «칸 네 장»으로 바꾸고 분포 막대는 뺐다. */}
        <div className="rounded-[12px] border border-border bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 className="text-[13px] font-bold">섹터 로테이션</h3>
            <span className="text-[11px] text-text-mute">
              모멘텀 = 20일 추세(z) · 수급 = 5일 순매수
            </span>
          </div>
          <QuadrantCards sectors={sectors} />

          <SectorTable sectors={sectors} signalCountBySector={signalCountBySector} />
        </div>
      </div>

      {/* ── 밴드 3 · 공시 — «유형»으로 묶는다 ──
           예전에는 99건을 종목별로 나열했다(화면 214줄). 그런데 그날 공시는 14개
           유형뿐이고, 실측 판정(event_evidence)은 **유형 단위로 계산된 값**이다.
           종목마다 붙이니 「분류와 실측이 다름 · 과거 434번 중 10번에 4번 성공 …」이
           단일판매·공급계약 25건에 대해 25번 그대로 반복됐다.

           유형을 주인공으로 세우면 (1) 실측 문장이 유형당 한 번이고 (2)「분류는
           호재인데 실측은 조심」이 훨씬 잘 읽힌다 — 오늘 그 유형이 몇 건 들어왔는지가
           같은 줄에 있기 때문이다. 종목은 그 안에 이름만 나열한다. */}
      <SectionHead
        title="오늘 들어온 공시"
        note={`${disclosures.asOf ?? "접수일 미상"} · ${disclosureGroups.total}건 · ${disclosureGroups.groups.length}개 유형 — 색과 배지는 분류가 아니라 실제로 세어본 결과입니다`}
      />
      <div className="mb-6 rounded-[12px] border border-border bg-surface p-5">
        {disclosureGroups.groups.length === 0 ? (
          <p className="py-3 text-sm text-text-mute">표시할 공시가 없습니다.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {disclosureGroups.groups.map((g) => (
              <div
                key={g.key}
                // 카드 색은 «실측 판정»으로 칠한다(2026-08-23 Victor). 예전에는
                // 「분류와 실측이 다름」일 때만 앰버였고 나머지는 전부 회색이라, 좋은
                // 유형과 나쁜 유형이 같은 색으로 나란히 있었다.
                //
                // ⚠️ 색의 근거는 분류(direction)가 아니라 실측(verdict)이다. 분류는
                // 보고서 이름을 보고 붙인 «추측»이고 — 공급계약은 호재로 분류돼 있지만
                // 실측은 한 달 뒤 -3.2% 다 — 색까지 추측을 따르면 화면이 틀린 쪽을
                // 강조하게 된다. 「판단 보류」는 회색 그대로다: 모르는 것에 색을 주면
                // 아는 것처럼 읽힌다(lib/events 의 규약과 같다).
                className={`rounded-[12px] border px-4 py-3 ${
                  g.ev?.verdict === "good"
                    ? "border-good/30 bg-good-soft"
                    : g.ev?.verdict === "caution"
                      ? "border-bad/30 bg-bad-soft"
                      : "border-border-soft bg-surface-2"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={`shrink-0 rounded-[4px] px-1.5 py-px text-[10px] font-semibold ${
                      g.ev ? VERDICT_CLASS[g.ev.verdict] : "bg-surface-3 text-text-mute"
                    }`}
                  >
                    {g.ev ? VERDICT_LABEL[g.ev.verdict] : "판정 없음"}
                  </span>
                  <span className="text-[13px] font-bold text-text">{g.label}</span>
                  <span className="tnum text-[12px] font-semibold text-text-dim">{g.rows.length}건</span>
                  {/* 색이 실측을 말하게 됐으니, 「분류와 실측이 다름」은 그 위에
                      얹는 표시로 남긴다 — 이 화면에서 가장 알려줄 값이 큰 한 줄이다. */}
                  {g.flips && (
                    <span className="rounded-[4px] bg-warn-soft px-1.5 py-px text-[10px] font-bold text-warn">
                      분류({g.dirLabel})와 반대
                    </span>
                  )}
                </div>
                {g.ev && g.ev.verdict !== "insufficient" && (
                  <p className="mt-1 text-[11px] leading-relaxed text-text-dim">
                    {evidenceSentence(g.ev)}
                  </p>
                )}
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px] text-text-mute">
                  {g.rows.slice(0, 6).map((d, k) => (
                    <span key={d.id}>
                      {d.symbol ? (
                        <Link href={`/stocks/${d.symbol}`} className="hover:text-accent">
                          {d.name ?? d.symbol}
                        </Link>
                      ) : (
                        d.name ?? "—"
                      )}
                      {k < Math.min(g.rows.length, 6) - 1 && <span className="text-text-mute"> ·</span>}
                    </span>
                  ))}
                  {g.rows.length > 6 && (
                    <span className="font-semibold text-text-dim">+{g.rows.length - 6}</span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>


    </AppShell>
  );
}
