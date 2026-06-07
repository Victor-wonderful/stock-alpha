import {
  TRADE_SESSION_LABELS,
  TRADE_SETUP_LABELS,
  TRADE_STYLE_LABELS,
  type TradeSession,
  type TradeSetup,
  type TradeStyle,
} from "@stock-alpha/db";
import { Badge } from "./ui/badge";

export function StyleChip({ style }: { style: TradeStyle }) {
  return <Badge variant="style">{TRADE_STYLE_LABELS[style]}</Badge>;
}
export function SetupChip({ setup }: { setup: TradeSetup }) {
  return <Badge variant="setup">{TRADE_SETUP_LABELS[setup]}</Badge>;
}
export function SessionChip({ session }: { session: TradeSession }) {
  return <Badge variant="session">{TRADE_SESSION_LABELS[session]}</Badge>;
}

export function AxisRow({
  style,
  setup,
  session,
}: {
  style: TradeStyle;
  setup: TradeSetup;
  session: TradeSession;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StyleChip style={style} />
      <SetupChip setup={setup} />
      <SessionChip session={session} />
    </div>
  );
}
