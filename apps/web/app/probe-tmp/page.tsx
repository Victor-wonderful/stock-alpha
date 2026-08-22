import { HomeOpenPicks } from "@/components/HomeOpenPicks";
import { HomeOpenSummary } from "@/components/HomeOpenSummary";
import type { OpenPick } from "@/lib/data";

const M: OpenPick[] = [
  { symbol: "005930", name: "삼성전자", asOf: "2026-08-14", entry: 84300, target: 91000,
    stop: 81500, last: 82000, tp1Hit: false, heldDays: 6, horizon: "mid", setup: "double_bottom",
    returnPct: -0.0273, toTargetPct: 0.1098, toStopPct: -0.0061 },
  { symbol: "000660", name: "SK하이닉스", asOf: "2026-08-12", entry: 301500, target: 325000,
    stop: 301500, last: 318000, tp1Hit: true, heldDays: 8, horizon: "short", setup: "vol_squeeze",
    returnPct: 0.0547, toTargetPct: 0.022, toStopPct: -0.0519 },
];
export default function P() {
  return (
    <main className="mx-auto max-w-[1440px] px-7 py-8">
      <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[1fr_2fr]">
        <HomeOpenSummary picks={M} />
        <HomeOpenPicks picks={M} exitDays={new Map([["005930","9월 4일(금)"],["000660","8월 19일(수)"]])} />
      </div>
    </main>
  );
}
