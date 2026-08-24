import Link from "next/link";
import { LogIn, PenLine, User } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { getMyExpert } from "@/lib/expert";
import { getMyProfile } from "@/lib/account";

/**
 * 머리 우측의 계정 자리.
 *
 * 여기에는 원래 «로그인 준비 중»이라는 **눌러도 아무 일도 없는 버튼**이 있었다.
 * 로그인·회원가입 화면(/login)은 진작 있었는데 사이트 어디에서도 그 화면으로 갈 수
 * 없었다(2026-08-24 Victor — "회원가입부터 있어야 하는 거 아닌가?"). 맞다. 전문가
 * 작성 폼을 만들어 놓고 정작 로그인할 길이 없으면 아무도 쓸 수 없다.
 *
 * 서버 컴포넌트다 — 세션을 읽어야 해서. GNB 는 "use client" 라 이걸 **슬롯으로**
 * 받는다(클라이언트 컴포넌트에 서버 렌더 결과를 prop 으로 넘기는 방식).
 */
export async function AuthMenu() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text sm:px-4"
      >
        <LogIn className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">로그인</span>
      </Link>
    );
  }

  // 전문가로 등록된 사람에게만 「추천 쓰기」가 보인다. 남에게 보여 봐야 눌러도 막힌다.
  const [expert, profile] = await Promise.all([getMyExpert(), getMyProfile()]);
  // 부르는 순서: 전문가 필명 → 가입 때 정한 닉네임 → 아이디.
  // 이메일은 쓰지 않는다 — 개인정보를 굳이 머리에 띄울 이유가 없다(예전엔 앞부분을 썼다).
  const label =
    expert?.name ?? profile?.displayName ?? profile?.username ?? "내 계정";

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {expert && (
        <Link
          href="/expert"
          className="hidden h-11 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text sm:flex"
        >
          <PenLine className="h-4 w-4" aria-hidden />
          추천 쓰기
        </Link>
      )}
      <Link
        href="/watchlist"
        className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text"
      >
        <User className="h-4 w-4" aria-hidden />
        <span className="hidden max-w-[90px] truncate sm:inline">{label}</span>
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="h-11 rounded-full px-2 text-[12px] text-text-mute transition-colors hover:text-text"
        >
          로그아웃
        </button>
      </form>
    </div>
  );
}
