import Link from "next/link";
import { ArrowRight, BarChart3, FileText, LineChart, ShieldCheck } from "lucide-react";

import { Footer } from "@/components/Footer";
import { HomeHero } from "@/components/HomeHero";
import { MarketTicker, type TickerItem } from "@/components/MarketTicker";
import { VectaLogo } from "@/components/VectaLogo";
import type { BlogPost, LandingStats } from "@/lib/data";
import { tradingDayLabel } from "@/lib/format";

/**
 * ⚠️ **아직 어디에도 연결되어 있지 않다.** 이 화면은 «가입 화면이 할 말»이다
 * (2026-08-24 Victor: "지금 내용은 회원 가입시에 보여주는 건데 이것은 따로 해야지,
 * 홈은 보여줘라는 거야"). 잠깐 비로그인 홈으로 붙였다가 뗐다 — 홈은 로그인 없이도
 * 홈이어야 한다. 가입 소개 화면을 만들 때 이 컴포넌트를 그 자리에 붙인다.
 *
 * 여기 담긴 것: 히어로 · 오늘의 «건수»(종목명 없이) · 무엇을 하는 곳인가 4장 ·
 * 회원이 되면 보이는 것 · 가입 없이 읽을 블로그 글.
 *
 * 붙일 때 지켜야 할 두 가지:
 *
 * 1. **성과 숫자를 쓰지 않는다.** 「승률 ○○%」를 넣고 싶어지는 자리인데, 화면에 남은
 *    성적은 폐기된 옛 규칙의 것이고 목표 도달은 30건 중 0건이다. 검증 안 된 수치를
 *    광고로 한번 내보내면 되돌릴 수 없다. 대신 셀 수 있는 사실만.
 * 2. **없는 기능을 약속하지 않는다.** 관심 종목·내 픽 추적·알림은 아직 만들지 않았다.
 *    「회원이 되면」에는 **오늘 실제로 열리는 것**만 적는다. 기능이 생기면 그때 늘린다.
 *
 * GNB(8개 메뉴)와 푸터 메뉴를 쓰지 않는 이유: 가입 전에는 그 링크가 전부 벽이다.
 * 눌러 봐야 로그인 화면으로 튕기는 버튼을 소개 화면에 늘어놓을 이유가 없다.
 */

// 「무엇을 하나」 — 기능 자랑이 아니라 **이 기계가 지키는 규칙**을 적는다.
// 넷 다 코드에 실재하는 것이고, 화면에서 확인할 수 있는 것들이다.
const WHAT: { icon: typeof LineChart; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: "통과한 전략만 발행합니다",
    body: "백테스트에서 거래비용까지 뺀 뒤 기대값이 남는 전략만 추천에 올립니다. 떨어진 전략은 그날 종목이 아무리 좋아 보여도 발행하지 않습니다.",
  },
  {
    icon: LineChart,
    title: "진입가·손절가까지 계산합니다",
    body: "«좋아 보인다»로 끝내지 않습니다. 어디서 사고, 어디서 접고, 얼마나 담을지를 변동성 기준으로 계산해 붙입니다.",
  },
  {
    icon: BarChart3,
    title: "틀린 것도 남깁니다",
    body: "발행한 모든 픽의 결과를 지우지 않고 기록합니다. 맞은 것만 세면 성적표가 아니라 광고입니다.",
  },
  {
    icon: FileText,
    title: "숫자는 기계가, 서술만 사람 말로",
    body: "화면의 모든 수치는 코드가 계산한 값입니다. 문장이 수치를 지어내지 못하도록 계산과 서술을 갈라 두었습니다.",
  },
];

// 「회원이 되면」 — 오늘 실제로 열리는 화면들. 없는 기능은 적지 않는다.
const UNLOCKS: { label: string; desc: string }[] = [
  { label: "오늘의 픽", desc: "종목·진입가·손절가·비중·청산 기한" },
  { label: "종목 분석", desc: "5축 진단과 밸류에이션, 종목별 리포트" },
  { label: "성과 기록", desc: "발행한 픽이 어떻게 끝났는지 전부" },
  { label: "시장·인사이트", desc: "매일 브리프와 주간 브리핑 아카이브" },
];

export function Landing({
  stats,
  ticker,
  posts,
}: {
  stats: LandingStats;
  ticker: TickerItem[];
  posts: BlogPost[];
}) {
  const asOfLabel = stats.asOf ? tradingDayLabel(stats.asOf) : null;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* 머리 — 메뉴 없이 로고와 계정 버튼만 */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-7">
          <Link href="/" aria-label="VECTA Stock 홈" className="shrink-0">
            <VectaLogo className="flex items-center gap-2" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="flex h-10 items-center rounded-full border border-border bg-surface-2 px-4 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text"
            >
              로그인
            </Link>
            <Link
              href="/login?mode=signup"
              className="flex h-10 items-center rounded-full bg-accent px-4 text-[12.5px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
            >
              회원가입
            </Link>
          </div>
        </div>
      </header>

      {/* 지수 티커 — 공개 정보다. 여기 있는 이유는 정보 전달이 아니라 «이 사이트가
          지금 살아 있다»는 신호다. 숫자가 멈춘 사이트에는 아무도 가입하지 않는다. */}
      <MarketTicker items={ticker} />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-10 pt-7 sm:px-7">
        {/* 화면의 h1. 히어로의 큰 글씨는 p 다(그쪽 주석 참조) — 브랜드 카피이지
            이 문서의 제목이 아니다. 제목을 눈에 보이게 또 쓰면 같은 말을 두 번 한다. */}
        <h1 className="sr-only">VECTA Stock — 근거로 고르는 종목 리서치</h1>

        <HomeHero cta={{ href: "/login?mode=signup", label: "무료로 시작하기" }} />

        {/* ── 오늘 이 기계가 한 일 ──
            자랑이 아니라 양이다. 셋 다 count 쿼리 결과이고 종목명은 넘어오지 않는다. */}
        <section className="mb-12">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-sm font-bold text-text">오늘 이 기계가 한 일</h2>
            {asOfLabel && (
              <span className="text-[11.5px] text-text-mute">
                {asOfLabel} 기준 · 마지막 거래일
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="발행한 픽" value={stats.publishedToday} unit="건" />
            <Stat label="추적 중인 픽" value={stats.tracking} unit="건" />
            <Stat label="종목 분석 리포트" value={stats.reports} unit="개" />
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-text-mute">
            건수만 공개합니다. 종목명·진입가·손절가는 로그인한 회원에게만 보입니다.
          </p>
        </section>

        {/* ── 무엇을 하나 ── */}
        <section className="mb-12">
          <h2 className="mb-3 text-sm font-bold text-text">무엇을 하는 곳인가</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {WHAT.map((w) => (
              <div
                key={w.title}
                className="rounded-[12px] border border-border bg-surface px-5 py-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <w.icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <p className="text-[13.5px] font-bold text-text">{w.title}</p>
                </div>
                <p className="text-[12.5px] leading-relaxed text-text-dim">{w.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 회원이 되면 ── */}
        <section className="mb-12 rounded-[14px] bg-navy px-6 py-7">
          <h2 className="text-[17px] font-bold text-on-navy">회원이 되면 보이는 것</h2>
          <p className="mt-1.5 text-[13px] text-on-navy-2">
            가입은 무료입니다. 등급도, 결제도 없습니다.
          </p>
          <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {UNLOCKS.map((u) => (
              <li key={u.label} className="flex items-baseline gap-2.5">
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-on-navy"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="text-[13.5px] font-semibold text-on-navy">
                    {u.label}
                  </span>
                  <span className="ml-2 text-[12.5px] text-on-navy-3">{u.desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/login?mode=signup"
            className="mt-6 inline-flex min-h-10 items-center gap-1.5 rounded-[9px] bg-accent px-6 text-[14px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
          >
            무료로 시작하기
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        {/* ── 공개 글 ──
            블로그는 별도 사이트라 잠금 대상이 아니다. 지금은 이쪽이 유일한 외부
            유입 경로라, 가입하지 않아도 읽을 것이 있어야 한다. 블로그가 연결되지
            않았으면(BLOG_URL 미설정) 섹션 자체가 없다 — 빈 껍데기를 남기지 않는다. */}
        {posts.length > 0 && (
          <section className="mb-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold text-text">읽을 것 — 가입 없이</h2>
              <span className="text-[11.5px] text-text-mute">블로그</span>
            </div>
            <ul className="divide-y divide-border-soft border-y border-border-soft">
              {posts.map((p) => (
                <li key={p.slug}>
                  <a
                    href={p.url}
                    className="flex items-baseline gap-3 py-3 transition-colors hover:text-accent"
                  >
                    <span className="shrink-0 font-mono text-[11.5px] text-text-mute">
                      {p.publishedAt.slice(5).replace("-", ".")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-dim">
                      {p.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* 푸터 메뉴는 감춘다 — 거기 걸린 링크 아홉 개가 전부 로그인 벽이다.
          법적 고지와 약관·방침 링크는 그대로 남는다(가입 전에 읽을 자리). */}
      <Footer showNav={false} />
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-5 py-4">
      <p className="text-[11.5px] text-text-mute">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-none text-text">
        {value}
        <span className="ml-1 text-[13px] font-semibold text-text-dim">{unit}</span>
      </p>
    </div>
  );
}
