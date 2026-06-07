import type { FactorView } from "@/lib/types";
import { fmtNum } from "@/lib/format";

const FACTORS: { key: keyof FactorView; label: string }[] = [
  { key: "value_z", label: "밸류" },
  { key: "quality_z", label: "퀄리티" },
  { key: "momentum_z", label: "모멘텀" },
  { key: "growth_z", label: "성장" },
  { key: "lowvol_z", label: "저변동" },
  { key: "size_z", label: "사이즈" },
];

// z-score(-3~3)를 0~100% 위치로 (50%가 0)
function pos(z: number | null): number {
  if (z == null) return 50;
  const clamped = Math.max(-3, Math.min(3, z));
  return ((clamped + 3) / 6) * 100;
}

export function FactorBars({ f }: { f: FactorView }) {
  return (
    <div className="space-y-2.5">
      {FACTORS.map(({ key, label }) => {
        const z = f[key] as number | null;
        const p = pos(z);
        const positive = (z ?? 0) >= 0;
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="w-12 text-xs text-text-dim">{label}</span>
            <div className="relative h-2 flex-1 rounded-full bg-surface-3">
              {/* 중앙선 */}
              <div className="absolute left-1/2 top-0 h-2 w-px bg-border-strong" />
              <div
                className={`absolute top-0 h-2 rounded-full ${
                  positive ? "bg-bull" : "bg-bear"
                }`}
                style={
                  positive
                    ? { left: "50%", width: `${p - 50}%` }
                    : { left: `${p}%`, width: `${50 - p}%` }
                }
              />
            </div>
            <span className="tnum w-10 text-right text-xs text-text-dim">
              {fmtNum(z, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
