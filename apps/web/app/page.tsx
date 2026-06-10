import Link from "next/link";
import {
  TRADE_SETUP_LABELS,
  TRADE_STYLE_LABELS,
  TRADE_STYLES,
} from "@stock-alpha/db";
import { Nav } from "@/components/Nav";

const SETUPS = ["leader_trend", "oversold_bounce", "breakout", "close_betting"] as const;

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{
              background:
                "radial-gradient(600px 300px at 70% 0%, var(--accent), transparent 70%)",
            }}
          />
          <div className="mx-auto max-w-6xl px-6 py-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
              Professional Equity Research Terminal
            </p>
            <h1 className="mt-4 max-w-2xl text-5xl font-bold leading-[1.1] tracking-tight">
              퀀트·펀더멘털·AI 리서치를
              <br />
              <span className="text-text-dim">투자 스타일별로</span> 한 곳에서.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-dim">
              멀티팩터 알파, DCF 밸류에이션, 그리고 스타일 × 셋업 × 세션 3축
              시그널을 백테스트로 검증해 발행합니다.
            </p>
            <div className="mt-8 flex gap-3">
              <Link
                href="/focus"
                className="rounded-md bg-text px-5 py-2.5 font-medium text-bg hover:opacity-90"
              >
                오늘의 포커스 보기
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-border-strong px-5 py-2.5 font-medium text-text-dim hover:text-text"
              >
                시작하기
              </Link>
            </div>
          </div>
        </section>

        {/* 3축 소개 */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-4 md:grid-cols-3">
            <Card
              title="스타일 (보유기간)"
              items={TRADE_STYLES.map((s) => TRADE_STYLE_LABELS[s])}
              accent="text-sky-300"
            />
            <Card
              title="셋업 (플레이북)"
              items={SETUPS.map((s) => TRADE_SETUP_LABELS[s])}
              accent="text-violet-300"
            />
            <Card
              title="세션"
              items={["프리장", "정규장", "종가단일가", "애프터장"]}
              accent="text-amber-300"
            />
          </div>
          <p className="mt-6 text-sm text-text-mute">
            같은 종목도 (스윙 × 과대낙폭반등 × 정규장)과 (데이트 × 종가베팅 × 종가)가
            별개 시그널로 — 진입·손절·목표가가 전략마다 다릅니다.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-2xs text-text-mute">
          본 플랫폼의 분석·시그널·투자의견·목표주가는 정보 제공 목적이며 투자 권유가
          아닙니다. 모든 투자 판단과 책임은 사용자 본인에게 있습니다.
        </div>
      </footer>
    </>
  );
}

function Card({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className={`text-sm font-semibold ${accent}`}>{title}</h3>
      <ul className="mt-3 space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-2 text-sm text-text-dim">
            <span className="h-1 w-1 rounded-full bg-text-mute" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
