import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 로그인한 사람의 프로필 — 머리의 계정 자리가 쓴다.
 *
 * 예전에는 **이메일 앞부분**을 잘라 이름 대신 썼다. 이제 가입 때 닉네임과 아이디를
 * 직접 받으므로(0043·0045) 그 값을 쓴다. 이메일은 화면에 내지 않는다 — 개인정보를
 * 굳이 띄울 이유가 없다.
 */
export interface MyProfile {
  /** 로그인 아이디 */
  username: string | null;
  /** 화면에 보이는 이름(닉네임) */
  displayName: string | null;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("username,display_name")
      .eq("id", user.id)
      .maybeSingle();
    return {
      username: (data?.username as string) ?? null,
      displayName: (data?.display_name as string) ?? null,
    };
  } catch {
    return null;
  }
}
