import { GNB } from "./GNB";
import { AuthMenu } from "./AuthMenu";

/** 머리 오른쪽에 세우는 «지금 상태» 숫자. 페이지마다 2~3개. */
export type PageStat = {
  label: string;
  value: string;
  /** 그 페이지에서 가장 중요한 한 칸만 강조한다. 셋 다 칠하면 강조가 사라진다. */
  tone?: "accent" | "good" | "bad";
};

/**
 * 메뉴 페이지의 공통 머리 — 슬롯 세 개.
 *
 *   [메뉴 이름]  [기준일 칩]                    라벨   라벨   라벨
 *   이 화면이 무엇을 하는가 — 한 줄              값     값     값
 *
 * 왜 골격을 맞추나(2026-08-23 Victor) — 메뉴가 8개인데 머리 모양이 세 가지였다.
 * 홈만 큰 네이비 히어로, 오늘의 픽은 제목+배지+별도 밴드, 나머지 여섯은 한 줄 헤더.
 * 어느 메뉴를 눌러도 같은 자리에서 같은 종류를 읽어야 «같은 제품»으로 느껴진다.
 *
 * 옛 머리는 제목·설명·배지를 한 줄에 flex 로 흘려보냈다. 그래서 (1) 설명이 길면
 * (성과는 60자가 넘었다) 배지가 밀려 내려가고 (2) «지금 상태» 숫자가 회색 설명문
 * 속에 문자열로 박혀 묻혔다(스크리너의 「시그널 264건」이 문장 안에 있었다).
 * 숫자를 오른쪽 고정석으로 빼면 그 두 가지가 구조적으로 사라진다.
 *
 * 색은 네이비다(2026-08-23 Victor — "색상 말이야, 상단에"). 홈만 상단이 네이비고
 * 나머지는 흰 바탕이라 같은 제품으로 안 보였다. 네이비를 장식으로 쓰는 것도 아니다 —
 * 이 밴드에 세우는 값(분석 179 · 발행 1 · 레짐 45 · 시그널 264)이 전부 **엔진이 계산한
 * 수치**라 「네이비 = 기계가 낸 데이터」 규칙과 그대로 맞는다.
 *
 * 홈은 이 골격을 쓰지 않는다 — 랜딩은 «우리가 무엇을 하는 곳인가»를 말하고,
 * 나머지는 이미 들어온 사람이 «지금 여기 상태»를 본다. 하는 일이 다르면 모양도 다르다.
 */
export function AppShell({
  title,
  asOf,
  subtitle,
  stats,
  badge,
  headerExtra,
  hideHeader,
  children,
}: {
  title: string;
  /** 기준일 칩 — "8월 22일 기준". 화면이 어느 시점의 값인지 항상 말한다. */
  asOf?: string | null;
  /** 이 화면이 무엇을 하는가. 한 문장으로 끝낸다 — 길어지면 숫자가 밀린다. */
  subtitle?: React.ReactNode;
  stats?: PageStat[];
  /** 샘플 데이터 배지처럼 제목 옆에 붙는 것. 네이비 위에 올라가니 밝은 칩을 쓴다. */
  badge?: React.ReactNode;
  /** 머리 밴드 안 아래쪽에 더 들어갈 것 — 「오늘의 픽」의 국면·깔때기 줄. */
  headerExtra?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <GNB authSlot={<AuthMenu />} />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7 pb-10">
        {!hideHeader && (
          <div className="mb-6 rounded-[14px] bg-navy px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h1 className="text-xl font-bold text-on-navy">{title}</h1>
                  {asOf && (
                    <span className="rounded-[999px] bg-on-navy/10 px-2.5 py-1 text-[10px] font-semibold text-on-navy-2">
                      {asOf}
                    </span>
                  )}
                  {badge}
                </div>
                {subtitle && (
                  <p className="mt-1.5 max-w-[70ch] text-xs leading-relaxed text-on-navy-2">
                    {subtitle}
                  </p>
                )}
              </div>

              {stats && stats.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-start gap-x-7 gap-y-2">
                  {stats.map((s) => (
                    <div key={s.label} className="text-right">
                      <p className="text-[10px] text-on-navy-3">{s.label}</p>
                      <p
                        className={`tnum mt-0.5 text-lg font-extrabold ${
                          s.tone === "accent"
                            ? "text-accent-on-navy"
                            : s.tone === "good"
                              ? "text-up-on-navy"
                              : s.tone === "bad"
                                ? "text-down-on-navy"
                                : "text-on-navy"
                        }`}
                      >
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 머리 안에 더 들어갈 것(오늘의 픽의 «전제» 줄처럼). 같은 네이비 안에
                두는 이유 — 네이비 밴드를 위아래로 두 개 세우면 어느 쪽이 «지금»인지
                흐려진다(홈에서 배운 것). 실선 대신 얇은 구분선으로 가른다. */}
            {headerExtra && (
              <div className="mt-4 border-t border-on-navy/15 pt-4">{headerExtra}</div>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
