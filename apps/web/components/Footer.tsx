import Link from "next/link";

import { VectaLogo } from "@/components/VectaLogo";

/**
 * 전역 푸터.
 *
 * 2026-08-23 Victor 지적("풋터에는 아무것도 없어?") — 푸터가 아예 없었다. 단순한
 * 디자인 공백이 아니다: 법적 고지가 4개 페이지(오늘의 픽·분석·리포트 상세·포트폴리오)
 * 에만 흩어져 있고 홈·시장·인사이트·성과·스크리너·내 자산에는 없었다.
 *
 * 유사투자자문업은 «불특정 다수 대상 투자 참고 정보»라는 성격과 «투자 판단의 책임은
 * 본인»이라는 고지를 사용자가 보는 자리에 둬야 한다. 화면마다 붙이면 빠지는 화면이
 * 생긴다 — 그래서 전역 푸터가 맡는다.
 *
 * ⚠️ 사업자 정보(상호·대표자·등록번호·주소)는 아직 코드 어디에도 없다. 값이 정해지면
 * 아래 BUSINESS 를 채운다. 지금은 «없는 것을 있는 것처럼» 적지 않는다 — 빈 자리를
 * 가짜로 채우면 그게 더 나쁘다.
 */

const NAV: { group: string; items: { href: string; label: string }[] }[] = [
  {
    group: "오늘",
    items: [
      { href: "/", label: "홈" },
      { href: "/focus", label: "오늘의 픽" },
      { href: "/screener", label: "스크리너" },
    ],
  },
  {
    group: "분석",
    items: [
      { href: "/reports", label: "종목 분석" },
      { href: "/market", label: "시장" },
      { href: "/insights", label: "인사이트" },
    ],
  },
  {
    group: "기록",
    items: [
      { href: "/picks", label: "성과" },
      { href: "/watchlist", label: "내 자산" },
      { href: "/alerts", label: "알림" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-7">
        <div className="grid gap-8 md:grid-cols-[1.6fr_2fr]">
          {/* 브랜드 + 한 줄 정체성 */}
          <div>
            <VectaLogo className="flex items-center gap-2" />
            <p className="mt-3 max-w-[38ch] text-[12.5px] leading-relaxed text-text-dim">
              백테스트를 통과한 전략만 추천에 올립니다. 진입가·손절가까지 계산해 붙이고,
              맞은 것과 틀린 것을 모두 기록으로 남깁니다.
            </p>
          </div>

          {/* 메뉴 — GNB 가 8개를 다 못 담아 「더보기」로 접는 것들까지 여기서 펼친다 */}
          <nav className="grid grid-cols-2 gap-6 sm:grid-cols-3" aria-label="푸터 메뉴">
            {NAV.map((col) => (
              <div key={col.group}>
                <p className="text-[11px] font-semibold text-text-mute">{col.group}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {col.items.map((it) => (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        className="text-[12.5px] text-text-dim transition-colors hover:text-accent"
                      >
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* ── 법적 고지 ──
            문구는 app/focus 에 있던 것을 단일 출처로 올린 것이다. 화면마다 복사해 두면
            빠지는 화면이 생긴다(실제로 6개 화면에 없었다). */}
        <div className="mt-9 border-t border-border-soft pt-6">
          <p className="text-[11.5px] leading-relaxed text-text-mute">
            <span className="font-semibold text-text-dim">투자 유의</span> · 이 서비스는
            유사투자자문업자가 불특정 다수를 대상으로 제공하는 <b className="font-semibold">투자 참고 정보</b>
            입니다. 개별 회원의 사정을 반영한 <b className="font-semibold">맞춤 자문이 아니며</b>,
            매매를 대신하거나 자금을 맡아 운용하지 않습니다. 모든 수치는 과거 데이터로
            계산한 것이고 <b className="font-semibold">과거 성과는 미래 수익을 보장하지 않습니다</b>.
            투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다.
          </p>
          <p className="mt-3 text-[11.5px] leading-relaxed text-text-mute">
            가격·재무·공시 데이터는 KRX·DART·네이버금융·FRED 에서 받아 가공합니다. 원천의
            지연이나 오류가 그대로 반영될 수 있으며, 화면의 값은 표시된 기준일 시점의
            것입니다.
          </p>
          {/* 약관·방침은 가입 화면에서만 닿을 수 있으면 안 된다 — 이미 가입한 사람이
              «내가 무엇에 동의했더라»를 찾을 자리가 여기다(2026-08-24). */}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/terms"
              className="text-[11.5px] font-semibold text-text-dim transition-colors hover:text-accent"
            >
              이용약관
            </Link>
            <Link
              href="/privacy"
              className="text-[11.5px] font-semibold text-text-dim transition-colors hover:text-accent"
            >
              개인정보처리방침
            </Link>
            <p className="ml-auto text-[11.5px] text-text-mute">
              © {new Date().getFullYear()} VECTA Stock
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
