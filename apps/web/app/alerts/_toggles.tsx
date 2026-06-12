"use client";

import { useState } from "react";

// 이벤트 알림 토글 — UI 데모. TODO: alerts 설정 저장 백엔드(profiles/alerts 테이블) 연결 전까지
// 상태는 세션 한정이며 저장되지 않음을 카드 하단에 명시한다.
const EVENTS: { key: string; name: string; desc: string; on: boolean }[] = [
  { key: "picks", name: "오늘의 픽 발행", desc: "새 픽 + 진입 플랜 요약", on: true },
  { key: "watchlist", name: "워치리스트 시그널", desc: "관심 종목 신규 시그널 · 판정 변경", on: true },
  { key: "exit", name: "손절 · 목표 도달", desc: "픽 기록 확정 (목표 달성 / 손절)", on: true },
  { key: "morning", name: "모닝 브리프", desc: "장 시작 전 시장 레짐 요약", on: true },
  { key: "weekly", name: "주간 트랙레코드", desc: "일요일 — 픽 성과 주간 요약", on: false },
];

export function EventToggles() {
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(EVENTS.map((e) => [e.key, e.on])),
  );
  return (
    <div className="space-y-2">
      {EVENTS.map((e) => (
        <button
          key={e.key}
          type="button"
          onClick={() => setState((s) => ({ ...s, [e.key]: !s[e.key] }))}
          className="flex w-full items-center justify-between rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-left hover:bg-surface-3 transition-colors"
        >
          <span>
            <span className="block text-[13px] font-semibold text-text">{e.name}</span>
            <span className="block text-[11px] text-text-mute">{e.desc}</span>
          </span>
          <span
            className={`relative inline-block h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
              state[e.key] ? "bg-accent" : "bg-surface-3"
            }`}
            aria-checked={state[e.key]}
            role="switch"
          >
            <span
              className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${
                state[e.key] ? "left-[19px] bg-[#0B0C10]" : "left-[3px] bg-text-mute"
              }`}
            />
          </span>
        </button>
      ))}
      <p className="pt-1 text-[10px] text-text-mute">
        설정 저장은 준비 중입니다 — 현재는 화면에서만 동작합니다.
      </p>
    </div>
  );
}
