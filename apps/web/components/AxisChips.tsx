import {
  TRADE_SESSION_LABELS,
  TRADE_SETUP_LABELS,
  type TradeSession,
  type TradeSetup,
} from "@stock-alpha/db";
import { Badge } from "./ui/badge";
import { horizonLabel } from "@/lib/holding";

export function SetupChip({ setup }: { setup: TradeSetup }) {
  return <Badge variant="setup">{TRADE_SETUP_LABELS[setup]}</Badge>;
}
export function SessionChip({ session }: { session: TradeSession }) {
  return <Badge variant="session">{TRADE_SESSION_LABELS[session]}</Badge>;
}

/** 기간 칩 — 단기·중기·장기. 스타일(스윙·포지션)은 기간 축 도입 전 이름이라 쓰지 않는다. */
export function HorizonChip({ horizon }: { horizon?: string | null }) {
  const label = horizonLabel(horizon);
  if (!label) return null;
  return <Badge variant="style">{label}</Badge>;
}

export function AxisRow({
  horizon,
  setup,
  session,
}: {
  horizon?: string | null;
  setup: TradeSetup;
  session: TradeSession;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <HorizonChip horizon={horizon} />
      <SetupChip setup={setup} />
      <SessionChip session={session} />
    </div>
  );
}
