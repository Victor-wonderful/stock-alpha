import Link from "next/link";
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
            <Th className="text-left">전략 · 스타일/셋업/세션</Th>
            <Th className="text-center">방향</Th>
            <Th className="text-left">신뢰도</Th>
            <Th className="text-right">진입</Th>
            <Th className="text-right">손절</Th>
            <Th className="text-right">목표</Th>
            <Th className="text-right">R:R</Th>
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
                  <div className="mono text-2xs text-text-mute">{s.symbol}</div>
                </td>
                <Td className="mono text-right">{fmtPrice(s.entry_price, s.currency)}</Td>
                <Td className={`mono text-right ${chgTone}`}>{fmtPct(chg)}</Td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-center">
                    {s.spark ? <Sparkline data={s.spark} /> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <AxisRow style={s.style} setup={s.setup} session={s.session} />
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
                <Td className="mono text-right">{fmtNum(s.risk_reward, 2)}</Td>
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
