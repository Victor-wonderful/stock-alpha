"use client";

import { useEffect, useRef, useState } from "react";

type Hit = { id: number; symbol: string; name: string };

/**
 * 종목 칸 — 이름이나 6자리 코드를 치면 후보가 뜨고, **눌러야** 잡힌다.
 *
 * 비슷한 이름을 폼이 알아서 고르지 않는다. 「대한」 이라고 치면 열 종목이 나오는데,
 * 그중 하나를 임의로 고르면 전문가가 의도하지 않은 종목에 그의 이름이 붙는다.
 * 고르기 전까지 hidden 값은 비어 있고, 서버 액션이 «종목을 골라 주세요»로 막는다.
 */
export function SymbolPicker({
  defaultId,
  defaultLabel,
}: {
  defaultId?: number | null;
  defaultLabel?: string | null;
}) {
  const [q, setQ] = useState(defaultLabel ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<number | null>(defaultId ?? null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked !== null) return; // 이미 고른 뒤에는 조용히 있는다
    if (q.trim().length < 1) {
      setHits([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/instruments?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { hits?: Hit[] };
        setHits(json.hits ?? []);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, picked]);

  return (
    <div className="relative">
      <input type="hidden" name="instrument_id" value={picked ?? ""} />
      <input
        type="text"
        value={q}
        placeholder="종목명 또는 6자리 코드"
        onChange={(e) => {
          setQ(e.target.value);
          setPicked(null); // 글자를 고치면 선택은 풀린다 — 옛 선택이 남으면 딴 종목이 저장된다
        }}
        className="w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
      />
      {picked !== null ? (
        <p className="mt-1.5 text-[11.5px] text-good">이 종목으로 저장됩니다</p>
      ) : (
        <p className="mt-1.5 text-[11.5px] text-text-mute">후보를 눌러야 종목이 잡힙니다</p>
      )}
      {open && picked === null && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-[240px] w-full overflow-auto rounded-[10px] border border-border bg-surface shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  setPicked(h.id);
                  setQ(`${h.name} (${h.symbol})`);
                  setOpen(false);
                }}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="text-[13.5px] font-semibold text-text">{h.name}</span>
                <span className="tnum text-[11.5px] text-text-mute">{h.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
