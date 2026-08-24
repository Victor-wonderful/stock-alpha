"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

/**
 * 푸터의 가입 안내 — **로그인하지 않은 사람에게만** 보인다.
 *
 * 2026-08-24: 홈을 뺀 전 화면이 회원 전용이 되면서 «가입하면 뭐가 좋은지»를 말할
 * 자리가 필요해졌다. 잠깐 홈을 통째로 소개 화면으로 바꿨다가 되돌렸다 — 홈은
 * 오늘 무슨 일이 있었나를 말하는 자리이지 제품 소개를 하는 자리가 아니다
 * (Victor: "회원가입에 대한 안내를 별도로 풋터에 넣어두든지 하면 되잖아").
 *
 * 그래서 푸터로 왔다. 푸터는 루트 레이아웃에 있어 **모든 화면 아래**에 붙는다 —
 * 어느 화면에서 벽을 만나든 스크롤 끝에 가입할 길이 있다. 본문을 한 픽셀도 밀지
 * 않는다는 것이 이 자리의 장점이다.
 *
 * 클라이언트 컴포넌트인 이유는 딱 하나, 경로를 봐야 해서다. 로그인 화면에서 「가입은
 * 무료입니다」 배너를 또 보여줄 이유가 없다(바로 위에 가입 탭이 있다). 세션 판정은
 * 서버가 하고(components/Footer), 여기는 **어디에 서 있는지만** 본다.
 *
 * ⚠️ 없는 기능을 약속하지 않는다. 관심 종목·내 픽 추적·알림은 아직 만들지 않았다.
 * 아래 네 개는 **오늘 실제로 열리는 화면**이다. 기능이 생기면 그때 늘린다.
 */

// 가입하면 열리는 것 — 화면 이름은 8개 메뉴(components/GNB)의 라벨을 그대로 쓴다.
const UNLOCKS = ["오늘의 픽", "스크리너", "분석", "시장", "인사이트", "성과", "내 자산"];

// 배너를 숨길 곳 — 가입·로그인 화면 그 자체
const HIDE_ON = ["/login"];

export function JoinBand() {
  const path = usePathname();
  if (HIDE_ON.some((p) => path === p || path.startsWith(p + "/"))) return null;

  return (
    <section className="border-b border-border-soft pb-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-text">
            홈 말고는 전부 회원에게만 보입니다
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-dim">
            가입은 무료입니다. 등급도, 결제도 없습니다. 계정 하나로 아래가 전부 열립니다.
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-1.5">
            {UNLOCKS.map((u) => (
              <li
                key={u}
                className="rounded-[999px] border border-border bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-text-dim"
              >
                {u}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Link
            href="/login?mode=signup"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[9px] bg-accent px-5 text-[13.5px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
          >
            무료로 시작하기
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center rounded-[9px] border border-border px-5 text-[13.5px] font-semibold text-text-dim transition-colors hover:text-text"
          >
            로그인
          </Link>
        </div>
      </div>
    </section>
  );
}
