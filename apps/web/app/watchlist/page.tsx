import Link from "next/link";
import { Search, ShieldCheck, Star } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { AssetTabs } from "@/components/AssetTabs";
import { SymbolCode } from "@/components/SymbolCode";
import { WatchButton } from "@/components/WatchButton";
import { getMyWatchlist, type WatchItem } from "@/lib/watchlist";
import { fmtPct, tradingDayLabel } from "@/lib/format";

/**
 * 관심 종목 — **진짜 데이터**(2026-08-25).
 *
 * 이 화면은 그때까지 예시였다. 회원 전용으로 잠가 놓고(8/24) 로그인해서 들어가면
 * SK스퀘어·삼성전자 같은 **남의 종목 다섯 개가 가짜로** 들어 있었고, 머리에는
 * 「로그인 기능 준비 중 — 아래는 예시 화면」이라 적혀 있었다. FAQ 에는 「회원이 되면
 * 내 자산이 열립니다」라고 적어 두었으니, 화면이 거짓말을 하는 상태였다.
 *
 * 표(watchlists)와 정책은 진작 있었다(0005·0006) — 붙이지 않았을 뿐이다.
 *
 * ## 이 화면이 답하는 질문
 *
 * «내가 담아 둔 것이 지금 어떤 상태인가». 그래서 종목마다 시세·최근 판정·픽 여부를
 * 한 줄에 놓는다. 담은 순서(최근이 위)가 기본이다 — 정렬을 고르게 하지 않는 이유는
 * 아직 몇 종목뿐이기 때문이고, 늘어나면 그때 붙인다.
 *
 * ## 「오늘의 변화」를 넣지 않았다
 *
 * 예시 화면에는 「판정 변경: 관망 → 중립」 같은 줄이 있었다. 그걸 진짜로 만들려면
 * 어제 판정과 오늘 판정을 종목마다 비교해야 하는데, 지금 구조로는 종목당 조회가
 * 하나씩 더 붙는다. **없는 것을 예시로 그리지 않는다**는 원칙에 따라, 만들 때까지
 * 자리를 비워 둔다.
 */
export const metadata = {
  title: "내 자산 — VECTA Stock",
  description: "담아 둔 종목의 판정·시세를 한곳에서 봅니다.",
};

const RATING_STYLE: Record<string, string> = {
  매수: "bg-accent text-text-on-accent",
  중립: "bg-surface-3 text-text-dim",
  관망: "border border-border text-text-mute",
  "거래 부적합": "bg-bad-soft text-bad",
};

export default async function WatchlistPage() {
  const items = await getMyWatchlist();
  const inPick = items.filter((r) => r.inPick).length;
  const rated = items.filter((r) => r.rating === "매수").length;

  return (
    <AppShell
      title="내 자산"
      subtitle="담아 둔 종목의 시세와 가장 최근 판정입니다. 종목명을 누르면 상세로 갑니다."
      stats={[
        { label: "관심 종목", value: `${items.length}` },
        { label: "매수 판정", value: `${rated}` },
        { label: "픽에 오름", value: `${inPick}`, tone: "accent" as const },
      ]}
    >
      <AssetTabs />

      {items.length === 0 ? (
        <EmptyWatchlist />
      ) : (
        <>
          {/* 관심 → 진단. 반대 방향(진단한 종목을 담기)은 /diagnosis 가 갖는다.
              같은 탭 안의 두 화면이 서로를 모르면 사용자가 종목 코드를 손으로 옮겨
              적게 된다(2026-08-25 Victor 지적).
              비중은 비워서 넘긴다 — 우리는 그 사람이 얼마씩 들고 있는지 모른다.
              진단 화면이 «비중 미입력이면 동일가중»으로 받아 준다. */}
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-surface px-4 py-3">
            <span className="text-[12.5px] text-text-dim">
              담아 둔 {items.length}종목을 하나의 조합으로 보면 어떤가요?
            </span>
            <Link
              href={`/diagnosis?h=${encodeURIComponent(items.map((r) => `${r.symbol}:0`).join(","))}`}
              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-border px-4 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
              관심 종목으로 리스크 진단
            </Link>
          </div>

          {/* 데스크톱 — 표 */}
          <div className="hidden overflow-hidden rounded-[12px] border border-border bg-surface md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] text-text-mute">
                  <th className="px-4 py-2.5 text-left font-medium">종목</th>
                  <th className="px-4 py-2.5 text-right font-medium">현재가</th>
                  <th className="px-4 py-2.5 text-right font-medium">전일 대비</th>
                  <th className="px-4 py-2.5 text-left font-medium">판정</th>
                  <th className="px-4 py-2.5 text-right font-medium">담은 날</th>
                  <th className="px-4 py-2.5 text-right font-medium sr-only">빼기</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.symbol} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/stocks/${r.symbol}`}
                          className="font-bold text-text hover:text-accent hover:underline"
                        >
                          {r.name}
                        </Link>
                        <SymbolCode symbol={r.symbol} className="text-[10.5px] text-text-mute" />
                        {r.inPick && (
                          <span className="rounded-[999px] bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
                            오늘의 픽
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="tnum px-4 py-3 text-right font-semibold text-text">
                      {r.last != null ? `${r.last.toLocaleString()}원` : "—"}
                    </td>
                    <td
                      className={`tnum px-4 py-3 text-right font-semibold ${
                        r.changePct == null
                          ? "text-text-mute"
                          : r.changePct >= 0
                            ? "text-good"
                            : "text-bad"
                      }`}
                    >
                      {r.changePct != null ? fmtPct(r.changePct) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Rating item={r} />
                    </td>
                    <td className="tnum px-4 py-3 text-right text-[11.5px] text-text-mute">
                      {r.addedAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <WatchButton symbol={r.symbol} watched signedIn size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 폰 — 카드. 표로 두면 판정이 스크롤 뒤로 숨는데, 이 화면의 핵심이 그것이다. */}
          <div className="space-y-2 md:hidden">
            {items.map((r) => (
              <article
                key={`m-${r.symbol}`}
                className="rounded-[12px] border border-border bg-surface px-4 py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/stocks/${r.symbol}`}
                      className="block text-[15px] font-bold text-text"
                    >
                      {r.name}
                    </Link>
                    <SymbolCode symbol={r.symbol} className="text-[12px] text-text-mute" />
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-[15px] font-bold text-text">
                      {r.last != null ? `${r.last.toLocaleString()}원` : "—"}
                    </p>
                    <p
                      className={`tnum text-[12.5px] font-semibold ${
                        r.changePct == null
                          ? "text-text-mute"
                          : r.changePct >= 0
                            ? "text-good"
                            : "text-bad"
                      }`}
                    >
                      {r.changePct != null ? fmtPct(r.changePct) : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Rating item={r} />
                  {r.inPick && (
                    <span className="rounded-[999px] bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                      오늘의 픽
                    </span>
                  )}
                  <span className="ml-auto">
                    <WatchButton symbol={r.symbol} watched signedIn size="sm" />
                  </span>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-4 text-[11.5px] leading-relaxed text-text-mute">
            시세는 마지막 거래일 종가입니다(장중 실시간 아님). 판정은 그 종목의 가장
            최근 분석이며, 날짜가 종목마다 다를 수 있습니다 — 분석이 매일 전 종목을
            도는 것은 아닙니다.
          </p>
        </>
      )}
    </AppShell>
  );
}

function Rating({ item: r }: { item: WatchItem }) {
  if (!r.rating) {
    return <span className="text-[12px] text-text-mute">분석 없음</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={`rounded-[999px] px-2 py-0.5 text-[11.5px] font-bold ${
          RATING_STYLE[r.rating] ?? "bg-surface-3 text-text-dim"
        }`}
      >
        {r.rating}
      </span>
      {r.score != null && (
        <span className="tnum text-[11.5px] text-text-mute">{r.score}점</span>
      )}
      {r.ratingAsOf && (
        <span className="text-[11px] text-text-mute">
          {tradingDayLabel(r.ratingAsOf)}
        </span>
      )}
    </span>
  );
}

/** 빈 상태 — «없다»로 끝내지 않고 담으러 갈 곳을 준다. */
function EmptyWatchlist() {
  return (
    <div className="rounded-[12px] border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <Star className="mx-auto h-7 w-7 text-text-mute" aria-hidden />
      <p className="mt-3 text-[15px] font-bold text-text">아직 담은 종목이 없습니다</p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-text-dim">
        종목 화면의 <b className="font-semibold text-text">☆ 관심</b> 을 누르면 여기에
        쌓입니다. 담아 두면 시세와 판정 변화를 한곳에서 볼 수 있습니다.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Link
          href="/reports"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[9px] bg-accent px-5 text-[13.5px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
        >
          <Search className="h-4 w-4" aria-hidden />
          종목 찾아보기
        </Link>
        <Link
          href="/focus"
          className="inline-flex min-h-10 items-center rounded-[9px] border border-border px-5 text-[13.5px] font-semibold text-text-dim transition-colors hover:text-text"
        >
          오늘의 픽 보기
        </Link>
      </div>
    </div>
  );
}
