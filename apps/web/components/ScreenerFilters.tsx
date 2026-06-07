"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  TRADE_SESSION_LABELS,
  TRADE_SETUP_LABELS,
  TRADE_STYLE_LABELS,
} from "@stock-alpha/db";

const GROUPS: { key: string; label: string; options: Record<string, string> }[] = [
  { key: "style", label: "스타일", options: TRADE_STYLE_LABELS },
  { key: "setup", label: "셋업", options: TRADE_SETUP_LABELS },
  { key: "session", label: "세션", options: TRADE_SESSION_LABELS },
];

export function ScreenerFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const anyActive = ["style", "setup", "session"].some((k) => params.get(k));

  function toggle(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    router.push(`/screener?${next.toString()}`);
  }

  return (
    <div className="space-y-2">
      {GROUPS.map((g) => (
        <div key={g.key} className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 shrink-0 whitespace-nowrap text-2xs font-medium uppercase tracking-wide text-text-mute">
            {g.label}
          </span>
          {Object.entries(g.options).map(([val, label]) => {
            const active = params.get(g.key) === val;
            return (
              <button
                key={val}
                onClick={() => toggle(g.key, val)}
                aria-pressed={active}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface-2 text-text-dim hover:border-border-strong hover:text-text"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ))}
      {anyActive && (
        <button
          onClick={() => router.push("/screener")}
          className="inline-flex items-center gap-1 pt-1 text-2xs text-text-mute hover:text-text-dim"
        >
          <X className="h-3 w-3" /> 필터 초기화
        </button>
      )}
    </div>
  );
}
