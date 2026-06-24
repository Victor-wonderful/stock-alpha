"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtPrice, fmtPct } from "@/lib/format";
import { MiniSnowflake } from "@/components/MiniSnowflake";
import { setupCharacter, TONE_CLASS } from "@/lib/setupCharacter";
import type { SnowflakeAxis } from "@/lib/snowflake";
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

// 진입 레벨 알림 — 현재가 vs 진입/손절가로 '지금 진입 타이밍 / 대기 / 무효' 판정.
// 추천 = 검증된 매매 계획서 + 레벨 알림(IA 2026-06-24)의 핵심. reports planStatus 와 동일 기준.
function entryStatus(
  last: number | null,
  entry: number | null,
  stop: number | null,
): { label: string; cls: string; icon: string; alert: string } {
  if (last == null || entry == null)
    return {
      label: "분석 완료",
      cls: "bg-surface-3 text-text-dim",
      icon: "",
      alert: "진입가·목표·손절 도달 시 알림",
    };
  const diff = (last - entry) / entry;
  if (stop != null && last <= stop)
    return { label: "무효 · 손절가 하회", cls: "bg-bad-soft text-bad", icon: "⚠", alert: "플랜 무효 — 신규 알림 없음" };
  if (diff > 0.05)
    return { label: `무효 · 진입가 +${(diff * 100).toFixed(1)}% 이탈`, cls: "bg-bad-soft text-bad", icon: "⚠", alert: "진입가 이탈 — 되돌림 대기" };
  if (Math.abs(diff) <= 0.02)
    return { label: "지금 진입 타이밍", cls: "bg-accent text-[#0B0C10]", icon: "🟢", alert: "지금 진입가 부근 — 목표·손절 도달 시 알림" };
  return {
    label: `진입 대기 · ${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`,
    cls: "bg-warn-soft text-warn",
    icon: "⏳",
    alert: `진입가 ${Math.round(entry).toLocaleString()} 도달하면 알림`,
  };
}

export function PickCard({
  pick,
  rank,
  report,
  riskPct,
  mini,
  lastPrice,
}: {
  pick: RecommendationView & { as_of?: string | null };
  rank: number;
  report?: ReportListItem | null;
  riskPct: number;
  mini?: SnowflakeAxis[];
  lastPrice?: number | null;
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

  // 진입 레벨 알림 — 현재가 대비 진입 타이밍/대기/무효(레벨 알림 핵심).
  const es = entryStatus(lastPrice ?? null, pick.entry_price, pick.stop_loss);
  // 성격 — "왜 떴나"(큰손/추세/반등…). 전 픽이 게이트 통과분이라 검증 배지도 함께.
  const ch = setupCharacter(pick.setup);

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
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded px-1.5 py-0.5 text-[10px] bg-surface-3 text-text-dim font-medium">
              {pick.style === "position" ? "포지션 · 수주~수개월" : pick.style === "swing" ? "스윙 · 수일~수주" : pick.style}
            </span>
            <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[ch.tone]}`}>
              {ch.icon} {ch.label}
            </span>
            <span
              title="백테스트 게이트(워크포워드·기대값·MDD)를 통과한 셋업만 발행"
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-good-soft text-good"
            >
              🛡 검증 통과
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

        {/* 미니 스노우플레이크 — 5축 한눈(밸류·수급·모멘텀·성장·안정성) */}
        {mini && mini.length >= 5 && (
          <div className="hidden shrink-0 lg:block">
            <MiniSnowflake axes={mini} size={62} />
          </div>
        )}

        {/* 우측: 점수 + 진입 레벨 알림 상태 */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="tnum text-xl font-extrabold text-accent">
            {report?.score != null ? report.score : Math.round(pick.conviction * 100)}
          </span>
          <span
            className={`flex items-center gap-1 rounded-[999px] px-2.5 py-1 text-[10px] font-bold ${es.cls}`}
          >
            {es.icon && <span aria-hidden>{es.icon}</span>}
            {es.label}
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

      {/* 🔔 진입 레벨 알림 + 접이식 근거 */}
      <div className="border-t border-border px-5 py-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px]">
          <span aria-hidden className="text-accent">🔔</span>
          <span className="font-medium text-text-dim">{es.alert}</span>
        </div>
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
