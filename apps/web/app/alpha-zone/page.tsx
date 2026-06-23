import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SampleBadge } from "@/components/ui";
import { SetupChip, StyleChip } from "@/components/AxisChips";
import { AlphaZoneMini } from "@/components/AlphaZoneMini";
import { getAlphaZoneStocks, type AlphaZoneCard } from "@/lib/data";
import { RecommendTabs } from "@/components/RecommendTabs";
import { fmtPrice, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AlphaZonePage() {
  const { data: cards, isSample } = await getAlphaZoneStocks(12);

  return (
    <AppShell
      title="알파존"
      subtitle="현재가가 진입가 부근에 도달한 종목 — 검증 패턴이 가리키는 ‘지금 진입하기 좋은 자리’"
      badge={
        <span className="flex items-center gap-1.5 rounded-[999px] bg-accent/15 px-3 py-1 text-[11px] font-bold text-accent">
          존 진입 {cards.length}종목
        </span>
      }
    >
      <RecommendTabs />

      {isSample && (
        <div className="mb-4">
          <SampleBadge />
        </div>
      )}

      {/* 범례 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-text-dim">
        <ZoneKey color="rgba(46,189,133,0.85)" label="목표 존 (진입→목표)" />
        <ZoneKey color="rgba(61,123,255,0.85)" label="알파 존 (진입→손절)" />
        <ZoneKey color="#f6465d" label="손절선" line />
        <span className="ml-auto text-text-mute">
          정렬: 강도순 · 진입가 근접 우선
        </span>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-[20px] border border-border bg-surface px-6 py-16 text-center">
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
        매수 추천이 아닌 셋업 트리거 기록 — 진입/목표/손절은 백테스트 캘리브레이션 기준 · 판단 책임은 투자자 본인
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
    <Link
      href={`/stocks/${c.symbol}`}
      className="group flex flex-col rounded-[16px] border border-border bg-surface p-4 transition-colors hover:border-accent"
    >
      {/* 헤더 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-text group-hover:text-accent">
              {c.name}
            </span>
            <span className="mono shrink-0 text-[10px] text-text-mute">{c.symbol}</span>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <SetupChip setup={c.setup} />
            <StyleChip style={c.style} />
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

      {/* 스탯 */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-border pt-3 text-center">
        <Stat label="진입" value={fmtPrice(c.entry, c.currency)} />
        <Stat label="목표" value={fmtPrice(c.tp1, c.currency)} tone="good" sub={tpPct != null ? fmtPct(tpPct) : undefined} />
        <Stat label="손절" value={fmtPrice(c.stop, c.currency)} tone="bad" sub={fmtPct(slPct)} />
        <Stat label="R:R" value={c.rr != null ? c.rr.toFixed(1) : "—"} tone="accent" />
      </div>
    </Link>
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
