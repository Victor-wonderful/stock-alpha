import { Star } from "lucide-react";

import { addToWatchlist, removeFromWatchlist } from "@/app/watchlist/actions";

/**
 * ☆ 관심 종목 담기 — 서버 컴포넌트 + form action.
 *
 * 자바스크립트가 없어도 동작한다. 「담기」는 상태를 바꾸는 일이라 링크가 아니라
 * form 이어야 하고(GET 으로 상태를 바꾸면 크롤러가 눌러 버린다), 그래서 button 이다.
 *
 * 로그인하지 않은 사람에게는 로그인 화면으로 보내는 **링크**를 준다 — 눌러 봐야
 * 아무 일도 안 일어나는 별을 두면 «담았는데 안 담겼다»가 된다. 돌아올 곳을 기억시켜
 * 로그인하면 보던 종목으로 돌아온다.
 */
export function WatchButton({
  symbol,
  watched,
  signedIn,
  size = "md",
}: {
  symbol: string;
  watched: boolean;
  signedIn: boolean;
  size?: "sm" | "md";
}) {
  const box =
    size === "sm"
      ? "h-8 w-8 rounded-[8px]"
      : "h-10 gap-1.5 rounded-[9px] px-3.5 text-[13px] font-semibold";
  const icon = size === "sm" ? "h-4 w-4" : "h-4 w-4";

  if (!signedIn) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(`/stocks/${symbol}`)}`}
        aria-label="관심 종목에 담으려면 로그인"
        title="관심 종목에 담으려면 로그인"
        className={`inline-flex items-center justify-center border border-border bg-surface-2 text-text-mute transition-colors hover:border-border-strong hover:text-text ${box}`}
      >
        <Star className={icon} aria-hidden />
        {size === "md" && <span>관심</span>}
      </a>
    );
  }

  return (
    <form action={watched ? removeFromWatchlist.bind(null, symbol) : addToWatchlist.bind(null, symbol)}>
      <button
        type="submit"
        aria-pressed={watched}
        aria-label={watched ? "관심 종목에서 빼기" : "관심 종목에 담기"}
        title={watched ? "관심 종목에서 빼기" : "관심 종목에 담기"}
        className={`inline-flex items-center justify-center border transition-colors ${box} ${
          watched
            ? "border-accent/40 bg-accent-soft text-accent hover:border-accent"
            : "border-border bg-surface-2 text-text-mute hover:border-border-strong hover:text-text"
        }`}
      >
        {/* 채운 별과 빈 별 — 색만으로 가르지 않는다(색을 못 가리는 사람도 있다) */}
        <Star className={icon} fill={watched ? "currentColor" : "none"} aria-hidden />
        {size === "md" && <span>{watched ? "담음" : "관심"}</span>}
      </button>
    </form>
  );
}
