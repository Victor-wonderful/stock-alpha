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
            className="w-56 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-text-mute focus:border-accent focus:outline-none"
          />
          <input
            value={r.weight}
            onChange={(e) => update(i, { weight: e.target.value })}
            placeholder="비중 %"
            inputMode="decimal"
            className="tnum w-24 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-text-mute focus:border-accent focus:outline-none"
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
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => setRows((rs) => [...rs, { symbol: "", weight: "" }])}
          className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-text"
        >
          <Plus className="h-3.5 w-3.5" /> 종목 추가
        </button>
        <button
          onClick={submit}
          className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          진단하기
        </button>
      </div>
      <p className="pt-1 text-2xs text-text-mute">
        입력한 보유 내역은 서버에 저장되지 않습니다(주소창 쿼리로만 계산).
      </p>
    </div>
  );
}
