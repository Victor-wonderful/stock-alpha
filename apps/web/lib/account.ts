import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 로그인한 사람의 프로필 — 머리의 계정 자리가 쓴다.
 *
 * 예전에는 **이메일 앞부분**을 잘라 이름 대신 썼다. 이제 가입 때 닉네임을 직접
 * 받으므로(0043) 그 값을 쓴다. 이메일은 화면에 내지 않는다 — 로그인 칸에서만 쓰이는
 * 값이고, 개인정보를 굳이 머리에 띄울 이유가 없다.
 *
 * 잠깐 로그인 아이디(username)도 여기서 들고 있었다. 아이디를 없애고 이메일로
 * 로그인하도록 되돌리면서(0046) 같이 뺐다.
 */
export interface MyProfile {
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
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    return { displayName: (data?.display_name as string) ?? null };
  } catch {
    return null;
  }
}
