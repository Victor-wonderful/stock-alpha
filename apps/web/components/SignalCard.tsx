import Link from "next/link";
import type { SignalView } from "@/lib/types";
import { fmtNum, fmtPrice, strengthPct } from "@/lib/format";
import { AxisRow } from "./AxisChips";

export function SignalCard({ s }: { s: SignalView }) {
  const isBuy = s.signal_type === "buy";
  const dirColor = isBuy ? "text-bull" : "text-bear";
  const dirLabel = isBuy ? "매수" : s.signal_type === "sell" ? "매도" : "관망";

  return (
    <article className="rounded-xl border border-border bg-neutral-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/stocks/${s.symbol}`}
            className="font-semibold hover:underline"
          >
            {s.name}
          </Link>
          <span className="ml-2 text-xs text-neutral-500">
            {s.symbol} · {s.exchange}
          </span>
        </div>
        <span className={`text-sm font-bold ${dirColor}`}>{dirLabel}</span>
      </div>

      <div className="mt-2">
        <AxisRow style={s.style} setup={s.setup} session={s.session} />
      </div>

      {/* 신뢰도 막대 */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>신뢰도</span>
          <span>{strengthPct(s.strength)}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-neutral-800">
          <div
            className="h-1.5 rounded-full bg-border-strong"
            style={{ width: `${strengthPct(s.strength)}%` }}
          />
        </div>
      </div>

      {/* 진입/손절/목표 */}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Field label="진입" value={fmtPrice(s.entry_price, s.currency)} />
        <Field
          label="손절"
          value={fmtPrice(s.stop_loss, s.currency)}
          className="text-bear"
        />
        <Field
          label="목표 TP1"
          value={fmtPrice(s.tp1, s.currency)}
          className="text-bull"
        />
      </dl>
      <div className="mt-2 flex gap-4 text-xs text-text-mute">
        <span>TP2 {fmtPrice(s.tp2, s.currency)}</span>
        <span>TP3 {fmtPrice(s.tp3, s.currency)}</span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-text-mute">
        <span>R:R {fmtNum(s.risk_reward, 2)}</span>
        <span>비중 {s.position_size_pct != null ? `${s.position_size_pct}%` : "—"}</span>
        <span>{s.timeframe}</span>
      </div>

      {s.llm_rationale && (
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          {s.llm_rationale}
        </p>
      )}
    </article>
  );
}

function Field({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-medium ${className}`}>{value}</dd>
    </div>
  );
}
