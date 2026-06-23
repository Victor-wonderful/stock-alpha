// ③ 종목 상세 히어로 — Stock-Alpha 스노우플레이크(5축) + 적정가 + 건강점수 + AI 한 줄 + ProTips.
// 서버 컴포넌트(순수 SVG, 클라이언트 상호작용 없음). 색은 다크 테마 고정값.
import type { SnowflakeResult } from "@/lib/snowflake";
import type { ValuationView } from "@/lib/types";
import { fmtPrice, fmtPct } from "@/lib/format";

// 펜타곤 5축 좌표 — 위(밸류)부터 시계방향 72°.
const C = { cx: 130, cy: 108, R: 80 };
const ANG = [-90, -18, 54, 126, 198].map((d) => (d * Math.PI) / 180);
const vtx = (scale: number) =>
  ANG.map(
    (a, i) =>
      `${(C.cx + Math.cos(a) * C.R * scale).toFixed(1)},${(C.cy + Math.sin(a) * C.R * scale).toFixed(1)}`,
  ).join(" ");
const point = (i: number, scale: number): [number, number] => [
  C.cx + Math.cos(ANG[i]) * C.R * scale,
  C.cy + Math.sin(ANG[i]) * C.R * scale,
];

const LABEL_POS: Array<{ x: number; y: number }> = [
  { x: 130, y: 9 }, // 밸류
  { x: 224, y: 75 }, // 수급
  { x: 189, y: 202 }, // 모멘텀
  { x: 71, y: 202 }, // 성장
  { x: 44, y: 75 }, // 안정성
];

export function SnowflakePanel({
  result,
  val,
  anchor,
  currency,
}: {
  result: SnowflakeResult;
  val: ValuationView | null;
  anchor: number;
  currency: string;
}) {
  const { axes, health, overall, summary, tips } = result;
  const dataPoly = axes.map((a, i) => point(i, a.score / 100).map((n) => n.toFixed(1)).join(",")).join(" ");

  return (
    <div className="mb-4 rounded-[20px] border border-border bg-surface p-5">
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* 레이더 */}
        <div>
          <svg viewBox="0 0 260 212" className="w-full" role="img" aria-label={`스노우플레이크 5축: ${axes.map((a) => `${a.label} ${a.score}`).join(", ")}`}>
            {[1, 0.66, 0.33].map((s) => (
              <polygon key={s} points={vtx(s)} fill="none" stroke="rgba(255,255,255,0.10)" />
            ))}
            {ANG.map((_, i) => {
              const [x, y] = point(i, 1);
              return <line key={i} x1={C.cx} y1={C.cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" />;
            })}
            <polygon points={dataPoly} fill="rgba(198,242,78,0.18)" stroke="#C6F24E" strokeWidth={2} />
            {axes.map((a, i) => {
              const [x, y] = point(i, a.score / 100);
              return <circle key={a.key} cx={x} cy={y} r={2.6} fill={a.score < 45 ? "#FF6B6B" : "#C6F24E"} />;
            })}
            {axes.map((a, i) => (
              <text
                key={a.key}
                x={LABEL_POS[i].x}
                y={LABEL_POS[i].y}
                textAnchor="middle"
                fontSize="11"
                fontWeight={a.score < 45 ? 600 : 500}
                fill={a.score < 45 ? "#FF8A8A" : "#C7CAD1"}
              >
                {a.label} {a.score}
              </text>
            ))}
          </svg>
        </div>

        {/* 핵심 스탯 */}
        <div className="flex flex-col gap-2.5">
          <div className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-mute">적정가 (DCF)</span>
              <span className="rounded-[5px] border border-border px-1.5 py-px text-[9px] text-text-mute">InvestingPro식</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tnum text-lg font-bold text-text">{fmtPrice(val?.dcf_value, currency)}</span>
              {val?.upside_pct != null && (
                <span className={`tnum text-sm font-bold ${val.upside_pct >= 0 ? "text-good" : "text-bad"}`}>
                  {val.upside_pct >= 0 ? "＋" : ""}
                  {fmtPct(val.upside_pct)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-text-mute">현재가 {fmtPrice(anchor, currency)} 대비</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
              <p className="text-[11px] text-text-mute">건강점수</p>
              <p className="mt-1 text-[15px] tracking-[2px]">
                <span className="text-accent">{"●".repeat(health)}</span>
                <span className="text-text-mute/40">{"○".repeat(5 - health)}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-text-mute">{health} / 5</p>
            </div>
            <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
              <p className="text-[11px] text-text-mute">종합</p>
              <p className="tnum mt-1 text-[18px] font-bold text-accent">{overall}</p>
              <p className="text-[10px] text-text-mute">5축 평균</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI 한 줄 (토스식) */}
      <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-accent/20 bg-accent-soft px-3.5 py-3">
        <span aria-hidden>💬</span>
        <div>
          <p className="text-[13px] leading-relaxed text-text">{summary}</p>
          <p className="mt-1 text-[9px] text-text-mute">수치는 모두 엔진 산출(DB 근거) · 서술만 자동 생성</p>
        </div>
      </div>

      {/* ProTips */}
      {tips.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[12px] font-semibold text-text-dim">ProTips</span>
            <span className="rounded-[5px] border border-border px-1.5 py-px text-[9px] text-text-mute">InvestingPro식</span>
          </div>
          <div className="flex flex-col gap-1.5 text-[12px]">
            {tips.map((t, i) => (
              <div key={i} className="flex gap-2">
                <span className={t.tone === "good" ? "text-good" : t.tone === "bad" ? "text-bad" : "text-warn"}>
                  {t.tone === "bad" || t.tone === "warn" ? "⚠" : "✓"}
                </span>
                <span className="text-text-dim">{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
