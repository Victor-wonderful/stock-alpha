"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtPrice, fmtPct } from "@/lib/format";
import type { RecommendationView, ReportListItem } from "@/lib/types";

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const v =
    rating === "매수"
      ? "bull"
      : rating === "거래 부적합"
        ? "bear"
        : "warn";
  return (
    <Badge variant={v as "bull" | "bear" | "warn"} size="sm">
      {rating}
    </Badge>
  );
}

// 행동 스탠스 — 판정 등급에서 도출. 점수로 편입된 '중립'을 매수처럼 보이게 하지 않고
// 명확히 '관찰 대기'로 구분한다(픽 5개는 그대로 노출, 라벨만 정직하게).
function stanceFor(rating: string | null): {
  label: string;
  cls: string;
  hint: string;
} {
  if (rating === "매수")
    return {
      label: "매수 후보",
      cls: "bg-good-soft text-good",
      hint: "기준 통과 — 진입 검토 대상",
    };
  if (rating === "중립")
    return {
      label: "관찰 대기",
      cls: "bg-warn-soft text-warn",
      hint: "점수 상위로 편입 · 확신 매수 아님 — 진입 신호 확인 후 대응",
    };
  return {
    label: "관망",
    cls: "bg-surface-3 text-text-mute",
    hint: "보류",
  };
}

export function PickCard({
  pick,
  rank,
  report,
  riskPct,
}: {
  pick: RecommendationView & { as_of?: string | null };
  rank: number;
  report?: ReportListItem | null;
  riskPct: number;
}) {
  const [open, setOpen] = useState(false);

  const isFirst = rank === 1;
  const rr =
    pick.entry_price && pick.stop_loss && pick.target_price
      ? (pick.target_price - pick.entry_price) / (pick.entry_price - pick.stop_loss)
      : null;
  // 권장 비중: 손절 시 계좌 riskPct% 손실 → 포지션 크기
  const sizePct =
    pick.entry_price && pick.stop_loss && pick.entry_price > pick.stop_loss
      ? Math.min(
          (riskPct / 100 / ((pick.entry_price - pick.stop_loss) / pick.entry_price)) * 100,
          25,
        )
      : null;

  // 행동 스탠스 — 판정 등급 기반(매수 후보 / 관찰 대기 / 관망).
  const stance = stanceFor(report?.rating ?? null);

  return (
    <div
      className={`rounded-[16px] border bg-surface transition-colors ${
        isFirst ? "border-accent" : "border-border"
      }`}
    >
      {/* 메인 행 */}
      <div className="flex items-center gap-3 px-5 py-4">
        {/* 순위 필 */}
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-xs font-extrabold ${
            isFirst ? "bg-accent text-[#0B0C10]" : "bg-surface-3 text-text-mute"
          }`}
        >
          {rank}
        </span>

        {/* 종목 정보 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/stocks/${pick.symbol}`}
              className="text-[15px] font-bold text-text hover:text-accent"
            >
              {pick.name}
            </Link>
            <span className="mono text-[10px] text-text-mute">{pick.symbol}</span>
            <RatingBadge rating={report?.rating ?? null} />
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] bg-surface-3 text-text-dim font-medium">
              {pick.style}
            </span>
          </div>
        </div>

        {/* 5분할 스탯 */}
        <div className="hidden xl:grid grid-cols-5 gap-3 text-center">
          {[
            { label: "진입가", value: fmtPrice(pick.entry_price) },
            {
              label: pick.tp2_price != null ? "목표가 (1차)" : "목표가",
              value: fmtPrice(pick.target_price),
              tone: "good",
              sub: pick.tp2_price != null ? `2차 ${fmtPrice(pick.tp2_price)}` : undefined,
            },
            { label: "손절가", value: fmtPrice(pick.stop_loss), tone: "bad" },
            { label: "R:R", value: rr != null ? `${rr.toFixed(1)}` : "—" },
            { label: "권장 비중", value: sizePct != null ? `${sizePct.toFixed(1)}%` : "—", tone: "accent" },
          ].map(({ label, value, tone, sub }) => (
            <div key={label} className="min-w-[56px]">
              <p className="text-[10px] text-text-mute">{label}</p>
              <p
                className={`tnum mt-0.5 text-[13px] font-bold ${
                  tone === "good"
                    ? "text-good"
                    : tone === "bad"
                      ? "text-bad"
                      : tone === "accent"
                        ? "text-accent"
                        : "text-text"
                }`}
              >
                {value}
              </p>
              {sub && <p className="tnum mt-0.5 text-[10px] text-good/70">{sub}</p>}
            </div>
          ))}
        </div>

        {/* 우측: 점수 + 행동 스탠스 */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="tnum text-xl font-extrabold text-accent">
            {report?.score != null ? report.score : Math.round(pick.conviction * 100)}
          </span>
          <span
            title={stance.hint}
            className={`rounded-[999px] px-2.5 py-1 text-[10px] font-semibold ${stance.cls}`}
          >
            {stance.label}
          </span>
        </div>
      </div>

      {/* 모바일 스탯 (xl 미만) */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-3 xl:hidden">
        {[
          { label: "진입", value: fmtPrice(pick.entry_price) },
          {
            label: pick.tp2_price != null ? "목표 1·2차" : "목표",
            value:
              pick.tp2_price != null
                ? `${fmtPrice(pick.target_price)} / ${fmtPrice(pick.tp2_price)}`
                : fmtPrice(pick.target_price),
          },
          { label: "손절", value: fmtPrice(pick.stop_loss) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[8px] bg-surface-2 px-2.5 py-2 text-center">
            <p className="text-[10px] text-text-mute">{label}</p>
            <p className="tnum mt-0.5 text-xs font-bold text-text">{value}</p>
          </div>
        ))}
      </div>

      {/* 접이식 근거 */}
      <div className="border-t border-border px-5 py-2.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          {!open && (
            <p className="line-clamp-1 text-[11px] text-text-mute flex-1 mr-3">
              {pick.thesis || "근거 없음"}
            </p>
          )}
          {open && <span className="text-[11px] font-semibold text-text-dim">근거 접기</span>}
          {!open && (
            <span className="shrink-0 text-[11px] font-semibold text-accent">
              펼치기 ▾
            </span>
          )}
          {open && (
            <span className="shrink-0 text-[11px] font-semibold text-accent">
              ▴
            </span>
          )}
        </button>
        {open && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs leading-relaxed text-text-dim">{pick.thesis}</p>
            {report && (
              <Link
                href={`/reports/${report.id}`}
                className="block text-[11px] font-semibold text-accent hover:underline"
              >
                근거 리포트 전체 보기 →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
