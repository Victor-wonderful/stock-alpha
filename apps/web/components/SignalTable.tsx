import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";
import type { SignalView } from "@/lib/types";
import { fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { AxisRow } from "./AxisChips";
import { Badge } from "./ui/badge";
import { StrengthBar } from "./ui";
import { Sparkline } from "./ui/Sparkline";

export function SignalTable({ rows }: { rows: SignalView[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
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
            <Th className="text-right">본전 도달가</Th>
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
  );
}

function Th({ children, className = "text-center" }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-3 py-2.5 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-2.5 ${className}`}>{children}</td>;
}
