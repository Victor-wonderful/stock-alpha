"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";

interface Row {
  symbol: string;
  weight: string; // % 입력
}

function parseParam(h: string | null): Row[] {
  if (!h) return [{ symbol: "", weight: "" }];
  const rows = h
    .split(",")
    .map((t) => t.split(":"))
    .filter((p) => p[0])
    .map(([symbol, weight]) => ({ symbol, weight: weight ?? "" }));
  return rows.length > 0 ? rows : [{ symbol: "", weight: "" }];
}

// 보유 종목 입력 폼 — 서버에 저장하지 않음(URL 쿼리로만 전달).
export function DiagnosisForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<Row[]>(() => parseParam(params.get("h")));

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    const h = rows
      .filter((r) => r.symbol.trim())
      .map((r) => `${r.symbol.trim()}:${r.weight.trim() || "0"}`)
      .join(",");
    router.push(h ? `/diagnosis?h=${encodeURIComponent(h)}` : "/diagnosis");
  }

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={r.symbol}
            onChange={(e) => update(i, { symbol: e.target.value })}
            placeholder="종목명 또는 코드 (예: 삼성전자, 005930)"
            className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-mute focus:border-accent focus:outline-none"
          />
          <input
            value={r.weight}
            onChange={(e) => update(i, { weight: e.target.value })}
            placeholder="비중 %"
            inputMode="decimal"
            className="tnum w-20 shrink-0 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-right text-sm text-text placeholder:text-text-mute focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            aria-label="행 삭제"
            className="text-text-mute hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setRows((rs) => [...rs, { symbol: "", weight: "" }])}
          className="inline-flex items-center gap-1.5 rounded-[999px] border border-border px-3.5 py-1.5 text-xs font-semibold text-text-dim hover:text-text hover:border-text-mute transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> 종목 추가
        </button>
        <button
          onClick={submit}
          className="rounded-[999px] bg-accent px-5 py-2 text-xs font-bold text-[#0B0C10] hover:bg-accent-2 transition-colors"
        >
          진단하기
        </button>
      </div>
      <p className="pt-1 text-2xs text-text-mute">
        보유 중이 아니어도 됩니다 — 매수 전 검토용 조합도 그대로 진단됩니다. 비중을
        비우면 동일 비중으로 계산하며, 입력 내역은 서버에 저장되지 않습니다.
      </p>
    </div>
  );
}
