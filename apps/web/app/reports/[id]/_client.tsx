"use client";

import { useState } from "react";
import { ChartCandlestick, ChartNoAxesColumn } from "lucide-react";

interface Narrative {
  thesis: string;
  trader_view: string;
  quant_view: string;
  risks: string[];
}

export function ReportDetailClient({ narrative: n }: { narrative: Narrative }) {
  const [quantOpen, setQuantOpen] = useState(false);

  return (
    <div className="rounded-[20px] border border-border bg-surface p-5">
      <h2 className="mb-4 flex items-center gap-2 text-[13px] font-bold">
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
        근거 — 전문 트레이더 · 퀀트 모델 관점
      </h2>

      {/* 트레이더 관점 — 항상 펼침 */}
      <div className="mb-4">
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-text">
          <ChartCandlestick className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          전문 트레이더 관점
        </p>
        <p className="text-[13px] leading-relaxed text-text-dim">{n.trader_view}</p>
      </div>

      <div className="h-px bg-border" />

      {/* 퀀트/밸류 관점 — 접힘 토글 */}
      <div className="mt-4">
        <button
          onClick={() => setQuantOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={quantOpen}
        >
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-text">
            <ChartNoAxesColumn className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            퀀트 · 밸류에이션 관점
          </p>
          <span className="text-[11px] font-semibold text-accent">
            {quantOpen ? "접기 ▴" : "펼치기 ▾"}
          </span>
        </button>
        {quantOpen && (
          <p className="mt-2 text-[13px] leading-relaxed text-text-dim">{n.quant_view}</p>
        )}
      </div>

      {/* 추가 리스크 (2번~) */}
      {n.risks.length > 1 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-[11px] font-bold text-text-dim">추가 리스크 요인</p>
          <ul className="space-y-1.5">
            {n.risks.slice(1).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-text-mute">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
