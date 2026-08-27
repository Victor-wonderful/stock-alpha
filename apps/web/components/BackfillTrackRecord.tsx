import snapshot from "@/lib/backfill-1y.json";
import { HORIZONS } from "@/lib/holding";

/**
 * 지난 1년 재현 성과 — «새 규칙으로 발행했다면».
 *
 * 라이브 픽은 규칙을 바꾼 2026-08-22 부터라 표본이 0 이다. 그래서 같은 규칙을 과거
 * 1년에 적용해 «발행했다면 어땠을지»를 낸다(apps/engine/scripts/backfill_track_record).
 * 진입·청산·게이트·국면 억제는 라이브와 같은 코드를 쓰고, 하루 5건·한 종목 1건이라는
 * 발행 상한까지 적용한다 — 그래야 «신호 전체의 통계»가 아니라 «픽의 성적»이 된다.
 *
 * ⚠️ 발행 기록이 아니다. 계산이다. 화면에서 계속 구분한다.
 * ⚠️ 픽 단위 행을 DB 에 만들지 않는다 — 백테스트가 청산 «사유»를 돌려주지 않아
 *    status 를 채우면 «전부 만료»가 되고 손절률이 0% 로 찍힌다. 집계만 남긴다.
 *
 * 스냅샷은 엔진이 JSON 으로 떨군 것을 그대로 읽는다. 다시 돌리면 다시 나온다.
 */

type HorizonStat = {
  horizon: string;
  n: number;
  wins: number;
  meanR: number | null;
  medianR: number | null;
  meanRetPct: number | null;
};

type Variant = { label: string; combos: number; byHorizon: HorizonStat[] };

function StatRow({ label, bars, s }: { label: string; bars: number; s?: HorizonStat }) {
  if (!s || s.n === 0) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-4 px-4 py-3 text-[12px]">
        <span className="min-w-[8rem] font-bold text-text">
          {label}
          <span className="ml-1.5 text-[11px] font-normal text-text-mute">
            최대 {bars}거래일
          </span>
        </span>
        <span className="text-text-mute">발행 0건</span>
      </div>
    );
  }
  const win = Math.round((s.wins / s.n) * 100);
  const pos = (s.meanR ?? 0) >= 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-[12px]">
      <span className="min-w-[8rem] font-bold text-text">
        {label}
        <span className="ml-1.5 text-[11px] font-normal text-text-mute">
          최대 {bars}거래일
        </span>
      </span>
      <span className="tnum text-text-dim">발행 {s.n}건</span>
      <span className="tnum text-text-dim">승 {s.wins}</span>
      <span className="tnum text-text-dim">승률 {win}%</span>
      {s.meanRetPct != null && (
        <span className="tnum text-text-mute">계좌 {s.meanRetPct.toFixed(2)}%</span>
      )}
      <span className={`tnum ml-auto font-semibold ${pos ? "text-good" : "text-bad"}`}>
        평균 {s.meanR?.toFixed(3)}R
      </span>
    </div>
  );
}

function VariantBlock({ v, note }: { v: Variant; note?: string }) {
  const by = new Map(v.byHorizon.map((s) => [s.horizon, s]));
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border-soft px-4 py-2">
        <span className="text-[12px] font-bold text-text">{v.label}</span>
        <span className="text-[11px] text-text-mute">{v.combos}개 조합</span>
        {note && <span className="text-[11px] text-text-mute">· {note}</span>}
      </div>
      <div className="divide-y divide-border-soft">
        {HORIZONS.map((hz) => (
          <StatRow key={hz.key} label={hz.label} bars={hz.bars} s={by.get(hz.key)} />
        ))}
      </div>
    </div>
  );
}

export function BackfillTrackRecord() {
  const snap = snapshot as unknown as {
    generatedAt: string | null;
    start: string | null;
    end: string | null;
    tradingDays: number;
    picksMax: number;
    candidates: number;
    variants: { current: Variant; recentFloor: Variant };
    caveat: string;
  };
  if (!snap.start || snap.tradingDays === 0) return null;

  return (
    <div className="rounded-[12px] border border-dashed border-border-strong bg-surface-2">
      <div className="border-b border-border-soft px-4 py-2.5">
        <span className="rounded-[999px] bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-text-dim">
          재현
        </span>
        <span className="ml-2 text-[12px] font-bold text-text">
          새 규칙으로 지난 1년을 발행했다면
        </span>
        <p className="mt-1 text-[11px] leading-relaxed text-text-mute">
          발행한 픽이 아니라 <b className="font-semibold text-text-dim">계산</b>입니다.{" "}
          {snap.start} ~ {snap.end} ({snap.tradingDays}거래일)에 지금 규칙을 그대로
          적용했습니다 — 다음 거래일 시가 진입 · 목표는 본전스톱(재현 당시 규칙) · 기간별 보유 상한 ·
          하루 최대 {snap.picksMax}건 · 한 종목 1건. 후보 {snap.candidates.toLocaleString("ko-KR")}건
          중에서 골랐습니다.
        </p>
      </div>

      <VariantBlock v={snap.variants.current} note="지금 발행 기준" />
      <div className="h-px bg-border" />
      <VariantBlock
        v={snap.variants.recentFloor}
        note="최근 두 달 엣지가 죽은 조합 제외"
      />

      <div className="border-t border-border-soft px-4 py-3 text-[11px] leading-relaxed text-text-mute">
        {snap.caveat}
        <br />
        규칙을 정한 2026-08-22 이후 구간만이 진짜 검증입니다 — 이 숫자는 규칙을 고를 때
        본 구간을 포함합니다.
      </div>
    </div>
  );
}
