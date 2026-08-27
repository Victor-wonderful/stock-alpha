import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";
import type { SignalView } from "@/lib/types";
import { fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { AxisRow } from "./AxisChips";
import { Badge } from "./ui/badge";
import { StrengthBar } from "./ui";
import { Sparkline } from "./ui/Sparkline";

/**
 * 시그널 표 — 넓은 화면은 12열 표, 폰은 카드.
 *
 * 이 표가 이 앱에서 가장 넓다(1080px). 종목 상세에 얹혀 있어 사람들이 자주 열는데,
 * 390px 폰에서는 종목·현재가까지만 보이고 **진입·손절·본전이 전부 스크롤 뒤**였다
 * (2026-08-24). 그 셋이 시그널의 내용 전부다.
 *
 * 카드에서는 스파크라인·비중·신뢰도 막대를 뺐다 — 좁은 화면에 12개를 다 넣으면 어느
 * 것도 안 읽힌다. 남긴 것은 «무엇을·어느 방향으로·얼마에».
 */
export function SignalTable({ rows }: { rows: SignalView[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="md:hidden">
        {rows.map((s) => {
          const buy = s.signal_type === "buy";
          const chg = s.change_pct ?? null;
          const risk =
            s.entry_price != null && s.stop_loss != null
              ? `${Math.round(s.entry_price - s.stop_loss).toLocaleString("ko-KR")}원`
              : "—";
          return (
            <article key={`m-${s.id}`} className="border-b border-border-soft px-4 py-3.5 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/stocks/${s.symbol}`} className="text-[15px] font-bold text-text">
                    {s.name}
                  </Link>
                  <div className="mt-0.5">
                    <SymbolCode symbol={s.symbol} className="text-[12px] text-text-mute" />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant={buy ? "bull" : "bear"} size="md">
                    {buy ? "매수" : s.signal_type === "sell" ? "매도" : "관망"}
                  </Badge>
                  <p
                    className={`mono mt-1 text-[12.5px] font-semibold ${
                      chg == null ? "text-text-mute" : chg >= 0 ? "text-bull" : "text-bear"
                    }`}
                  >
                    {fmtPct(chg)}
                  </p>
                </div>
              </div>

              <div className="mt-2">
                <AxisRow horizon={s.horizon} setup={s.setup} session={s.session} />
              </div>

              <dl className="mono mt-2.5 flex flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px]">
                <span>
                  <dt className="inline text-text-mute">진입 </dt>
                  <dd className="inline font-semibold text-text">
                    {fmtPrice(s.entry_price, s.currency)}
                  </dd>
                </span>
                <span>
                  <dt className="inline text-text-mute">손절 </dt>
                  <dd className="inline font-semibold text-bear">
                    {fmtPrice(s.stop_loss, s.currency)}
                  </dd>
                </span>
                <span>
                  <dt className="inline text-text-mute">본전 </dt>
                  <dd className="inline font-semibold text-bull">
                    {fmtPrice(s.tp1, s.currency)}
                  </dd>
                </span>
                <span>
                  <dt className="inline text-text-mute">1주 리스크 </dt>
                  <dd className="inline font-semibold text-text-dim">{risk}</dd>
                </span>
              </dl>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
            <Th className="pl-4 text-left">종목</Th>
            <Th className="text-right">현재가</Th>
            <Th className="text-right">등락</Th>
            <Th className="text-center">추세</Th>
            <Th className="text-left">전략 · 셋업/세션</Th>
            <Th className="text-center">방향</Th>
            <Th className="text-left">신뢰도</Th>
            <Th className="text-right">진입</Th>
            {/* 「목표」·「R:R」을 버렸다(2026-08-23) — 채택 규칙(trail)은 목표에서
                팔지 않고 손절만 진입가로 올린다. 홈·오늘의 픽·스크리너와 같은 말로. */}
            <Th className="text-right">손절</Th>
            <Th className="text-right">목표가</Th>
            <Th className="text-right">1주당 리스크</Th>
            <Th className="pr-4 text-right">비중</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const buy = s.signal_type === "buy";
            const chg = s.change_pct ?? null;
            const chgTone = chg == null ? "text-text-mute" : chg >= 0 ? "text-bull" : "text-bear";
            return (
              <tr
                key={s.id}
                className="group border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2"
              >
                <td className="py-2.5 pl-4">
                  <Link href={`/stocks/${s.symbol}`} className="font-medium group-hover:text-accent">
                    {s.name}
                  </Link>
                  <div className="text-2xs"><SymbolCode symbol={s.symbol} className="text-text-mute" /></div>
                </td>
                <Td className="mono text-right">{fmtPrice(s.entry_price, s.currency)}</Td>
                <Td className={`mono text-right ${chgTone}`}>{fmtPct(chg)}</Td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-center">
                    {s.spark ? <Sparkline data={s.spark} /> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <AxisRow horizon={s.horizon} setup={s.setup} session={s.session} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Badge variant={buy ? "bull" : "bear"} size="md">
                    {buy ? "매수" : s.signal_type === "sell" ? "매도" : "관망"}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <StrengthBar value={s.strength} />
                </td>
                <Td className="mono text-right">{fmtPrice(s.entry_price, s.currency)}</Td>
                <Td className="mono text-right text-bear">{fmtPrice(s.stop_loss, s.currency)}</Td>
                <Td className="mono text-right text-bull">{fmtPrice(s.tp1, s.currency)}</Td>
                <Td className="mono text-right">
                  {s.entry_price != null && s.stop_loss != null
                    ? `${Math.round(s.entry_price - s.stop_loss).toLocaleString("ko-KR")}원`
                    : "—"}
                </Td>
                <Td className="mono pr-4 text-right">
                  {s.position_size_pct != null ? `${s.position_size_pct}%` : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Th({ children, className = "text-center" }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-3 py-2.5 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-2.5 ${className}`}>{children}</td>;
}
