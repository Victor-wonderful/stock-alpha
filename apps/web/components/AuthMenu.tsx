import Link from "next/link";
import { LogIn, PenLine, ShieldCheck, User } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
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
    // 로그인과 **회원가입 둘 다** 머리에 둔다(2026-08-24 Victor: "로그인, 회원가입
    // 이건 상단에 해놔야지"). 예전엔 로그인 하나뿐이었다 — 홈을 뺀 전 화면이 회원
    // 전용인데 «계정을 만드는 길»이 첫 화면 어디에도 없었던 셈이다.
    //
    // 채운 쪽은 회원가입이다. 강조 예산은 «다음에 할 행동»에 쓴다 — 계정이 없는
    // 사람에게 다음 행동은 가입이지 로그인이 아니다.
    // 폰(375px)에서는 로그인의 글자를 접고 아이콘만 남긴다. 회원가입은 글자를
    // 유지한다 — 아이콘만 둘이면 어느 쪽이 가입인지 알 수 없다.
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link
          href="/login"
          className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text sm:px-4"
        >
          <LogIn className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">로그인</span>
        </Link>
        <Link
          href="/login?mode=signup"
          className="flex h-11 items-center rounded-full bg-accent px-3.5 text-[12.5px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2 sm:px-4"
        >
          회원가입
        </Link>
      </div>
    );
  }

  // 전문가로 등록된 사람에게만 「추천 쓰기」가 보인다. 남에게 보여 봐야 눌러도 막힌다.
  // 「관리」도 같다 — 운영자가 아니면 그 주소가 있다는 것조차 알릴 이유가 없다(404).
  const [expert, profile, admin] = await Promise.all([
    getMyExpert(),
    getMyProfile(),
    isAdmin(),
  ]);
  // 부르는 순서: 전문가 필명 → 가입 때 정한 닉네임.
  // 이메일은 쓰지 않는다 — 개인정보를 굳이 머리에 띄울 이유가 없다(예전엔 앞부분을 썼다).
  // 닉네임은 가입 때 필수라, 여기까지 내려오는 건 트리거 전에 만들어진 옛 계정뿐이다.
  const label = expert?.name ?? profile?.displayName ?? "내 계정";

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {admin && (
        <Link
          href="/admin/experts"
          className="hidden h-11 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-text sm:flex"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden />
          관리
        </Link>
      )}
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
