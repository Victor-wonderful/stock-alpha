import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";
import { AppShell } from "@/components/AppShell";
import { SampleBadge } from "@/components/ui";
import { HorizonChip } from "@/components/AxisChips";
import { setupCharacter, TONE_CLASS } from "@/lib/setupCharacter";
import { AlphaZoneMini } from "@/components/AlphaZoneMini";
import { getAlphaZoneStocks, getMarketState, type AlphaZoneCard } from "@/lib/data";
import { RegimeHeader } from "@/components/RegimeHeader";
import { fmtPrice, fmtPct } from "@/lib/format";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

export default async function AlphaZonePage() {
  const { data: cards, isSample } = await getAlphaZoneStocks(12);
  const marketState = await getMarketState();

  return (
    <AppShell
      title="추천"
      subtitle="현재가가 진입가 부근에 도달한 종목 — 검증 패턴이 가리키는 ‘지금 진입하기 좋은 자리’"
      badge={
        <span className="flex items-center gap-1.5 rounded-[999px] bg-accent-soft px-3 py-1 text-[11px] font-bold text-accent">
          존 진입 {cards.length}종목
        </span>
      }
    >
      {/* 알파존 = 추천 큐레이션·스크리너 '진입 가능' 필터로 흡수(IA 2026-06-24). 레거시 라우트. */}
      <RegimeHeader state={marketState} />

      {isSample && (
        <div className="mb-4">
          <SampleBadge />
        </div>
      )}

      {/* 범례 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-text-dim">
        <ZoneKey color="rgba(46,189,133,0.85)" label="진입 → 목표가" />
        <ZoneKey color="rgba(61,123,255,0.85)" label="진입 → 손절가" />
        <ZoneKey color="#1F5FD0" label="손절선" line />
        <span className="ml-auto text-text-mute">
          정렬: 강도순 · 진입가 근접 우선
        </span>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-surface px-6 py-16 text-center">
          <p className="text-sm text-text-mute">
            현재 알파 존에 들어온 종목이 없습니다. 가격이 진입 구간에 도달하면 표시됩니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <ZoneCard key={c.symbol} c={c} />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-text-mute">
        매수 추천이 아닌 셋업 트리거 기록 — 진입·손절·목표가는 백테스트 캘리브레이션 기준 · 판단 책임은 투자자 본인
      </p>
    </AppShell>
  );
}

function ZoneCard({ c }: { c: AlphaZoneCard }) {
  const toEntry = (c.price - c.entry) / c.entry; // 진입가 대비 현재가 괴리
  const tpPct = c.tp1 != null ? (c.tp1 - c.entry) / c.entry : null;
  const slPct = (c.stop - c.entry) / c.entry;
  // 존 위치 0(손절)~1(진입) → 막대 채움 %
  const fill = Math.max(0, Math.min(1, c.zonePos)) * 100;

  return (
    // stretched link — 카드 전체를 누를 수 있게 하되 링크 안에 버튼(종목코드 복사)을
    // 넣지 않는다. 링크는 종목명에만 걸고 ::after 로 카드를 덮는다.
    <div className="group relative flex flex-col rounded-[16px] border border-border bg-surface p-4 transition-colors hover:border-accent">
      {/* 헤더 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/stocks/${c.symbol}`}
              className="truncate text-[15px] font-bold text-text after:absolute after:inset-0 after:content-[''] group-hover:text-accent"
            >
              {c.name}
            </Link>
            <SymbolCode
              symbol={c.symbol}
              className="relative z-10 shrink-0 text-[10px] text-text-mute"
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {(() => {
              const ch = setupCharacter(c.setup);
              return (
                <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[ch.tone]}`}>
                  {ch.icon} {ch.label}
                </span>
              );
            })()}
            <HorizonChip horizon={c.horizon} />
            <span
              title="백테스트 게이트 통과 셋업만"
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-good-soft text-good"
            >
              🛡 검증
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-[15px] font-bold text-text">{fmtPrice(c.price, c.currency)}</p>
          {c.changePct != null && (
            <p className={`tnum text-2xs font-semibold ${c.changePct >= 0 ? "text-bull" : "text-bear"}`}>
              {fmtPct(c.changePct)}
            </p>
          )}
        </div>
      </div>

      {/* 미니 알파존 차트 */}
      <AlphaZoneMini
        bars={c.bars}
        entry={c.entry}
        stop={c.stop}
        tp1={c.tp1}
        tp2={c.tp2}
      />

      {/* 존 위치 막대: 손절 ──●── 진입 */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-text-mute">
          <span>손절</span>
          <span className="text-text-dim">
            진입가 대비 <span className={`tnum font-semibold ${toEntry >= 0 ? "text-bear" : "text-bull"}`}>{fmtPct(toEntry)}</span>
          </span>
          <span>진입</span>
        </div>
        <div className="relative mt-1 h-1.5 rounded-full bg-bear/25">
          <div
            className="absolute left-0 top-0 h-1.5 rounded-full bg-gradient-to-r from-bear/40 to-accent"
            style={{ width: `${fill}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent"
            style={{ left: `${fill}%` }}
          />
        </div>
      </div>

      {/* 스탯 — 홈·오늘의 픽·스크리너·종목 상세와 같은 이름·같은 순서(2026-08-23).
          「목표」·「R:R」을 버렸다: 채택 규칙(trail)은 목표에서 팔지 않고 손절만
          진입가로 올린다. 잃는 쪽(손절)을 먼저 읽게 두고, 마지막 칸에는 실제로 거는
          돈(1주당 리스크)을 놓는다. */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-border pt-3 text-center">
        <Stat label="진입" value={fmtPrice(c.entry, c.currency)} />
        <Stat label="손절" value={fmtPrice(c.stop, c.currency)} tone="bad" sub={fmtPct(slPct)} />
        <Stat
          label="목표 도달"
          value={fmtPrice(c.tp1, c.currency)}
          tone="good"
          sub={tpPct != null ? fmtPct(tpPct) : undefined}
        />
        <Stat
          label="1주당 리스크"
          value={`${Math.round(c.entry - c.stop).toLocaleString("ko-KR")}원`}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "accent";
  sub?: string;
}) {
  const cls =
    tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : "text-text";
  return (
    <div className="min-w-0">
      <p className="text-[9px] text-text-mute">{label}</p>
      <p className={`tnum mt-0.5 truncate text-[12px] font-bold ${cls}`}>{value}</p>
      {sub && <p className="tnum text-[9px] text-text-mute">{sub}</p>}
    </div>
  );
}

function ZoneKey({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-sm"
        style={
          line
            ? { width: 14, height: 0, borderTop: `2px dashed ${color}` }
            : { width: 14, height: 10, background: color, opacity: 0.55 }
        }
      />
      {label}
    </span>
  );
}
