"use client";

import { useEffect, useState } from "react";

// KRX 정규장 09:00–15:30 (KST) 기준 장중/장마감 표시 + 시계
export function MarketClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    return <div className="h-4 w-28" />; // SSR/하이드레이션 안정
  }

  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const mins = kst.getHours() * 60 + kst.getMinutes();
  const day = kst.getDay();
  const open = day >= 1 && day <= 5 && mins >= 540 && mins <= 930; // 09:00~15:30
  const hh = String(kst.getHours()).padStart(2, "0");
  const mm = String(kst.getMinutes()).padStart(2, "0");
  const ss = String(kst.getSeconds()).padStart(2, "0");

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          open ? "bg-bull" : "bg-text-mute"
        }`}
      />
      <span className="text-text-dim">{open ? "KRX 장중" : "장 마감"}</span>
      <span className="mono text-text-mute">
        {hh}:{mm}:{ss} KST
      </span>
    </div>
  );
}
