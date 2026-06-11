// 공통 UI 프리미티브 (다크 터미널 토큰)

export function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-2xs font-medium text-warn">
      <span className="inline-block h-1 w-1 rounded-full bg-warn" />
      예시 데이터
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text">
            <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "bull" | "bear";
}) {
  const toneCls =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-text";
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-2xs uppercase tracking-wide text-text-mute">{label}</p>
      <p className={`tnum mt-1 text-lg font-semibold ${toneCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-text-mute">{sub}</p>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-text-mute">
      {message}
    </div>
  );
}

// 신뢰도 막대 (0~1)
export function StrengthBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tone = pct >= 65 ? "bg-bull" : pct >= 55 ? "bg-warn" : "bg-text-mute";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tnum text-2xs text-text-dim">{pct}</span>
    </div>
  );
}
