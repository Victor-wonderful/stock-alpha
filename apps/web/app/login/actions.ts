"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * 로그인·회원가입·로그아웃.
 *
 * 돌아갈 곳(`next`)을 인자로 받는다 — 미들웨어가 보호 라우트에서 튕길 때 원래 가려던
 * 곳을 붙여 보내는데, 예전 코드는 그걸 무시하고 언제나 /dashboard 로 보냈다. 「추천
 * 쓰기」를 누르고 로그인했는데 대시보드가 열리면 다시 찾아가야 한다.
 *
 * 열린 리디렉트는 막는다 — 우리 사이트 안의 경로(/로 시작하고 //가 아닌)만 허용한다.
 * 남이 만든 링크로 로그인시킨 뒤 바깥으로 튕기는 수법을 그대로 막아 준다.
 */
function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function fail(next: string, msg: string, mode?: "signup"): never {
  const q = new URLSearchParams({ error: msg });
  if (next !== "/") q.set("next", next);
  if (mode) q.set("mode", mode);
  redirect(`/login?${q.toString()}`);
}

export async function signIn(next: string | null, formData: FormData) {
  const to = safeNext(next);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) fail(to, "이메일과 비밀번호를 모두 입력해 주세요.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Supabase 원문은 영어다. 가장 흔한 두 경우만 우리말로 바꾸고 나머지는 그대로 —
    // 모르는 오류를 «비밀번호가 틀렸습니다»로 뭉뚱그리면 진짜 원인을 못 찾는다.
    const msg = /invalid login credentials/i.test(error.message)
      ? "이메일 또는 비밀번호가 맞지 않습니다."
      : /email not confirmed/i.test(error.message)
        ? "아직 이메일 확인이 끝나지 않았습니다. 받은 메일의 링크를 눌러 주세요."
        : error.message;
    fail(to, msg);
  }

  revalidatePath("/", "layout"); // 머리의 계정 자리를 새로 그린다
  redirect(to);
}

/** 연락처 — 숫자와 구분자만 받는다. 국내 번호를 전제하되 형식을 좁게 강요하지 않는다. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 9 || digits.length > 11) return null;
  return digits;
}

export async function signUp(next: string | null, formData: FormData) {
  const to = safeNext(next);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const agreed = formData.get("agree") === "on";

  if (!nickname) fail(to, "닉네임을 입력해 주세요.", "signup");
  if (nickname.length > 20) fail(to, "닉네임은 20자 이내로 정해 주세요.", "signup");
  if (!email || !password) fail(to, "이메일과 비밀번호를 모두 입력해 주세요.", "signup");
  if (password.length < 8) {
    fail(to, "비밀번호는 8자 이상으로 정해 주세요.", "signup");
  }
  const phone = normalizePhone(phoneRaw);
  if (!phone) fail(to, "연락처를 숫자 9~11자리로 입력해 주세요. (예: 010-1234-5678)", "signup");
  // 개인정보를 받는 이상 동의 없이 저장하지 않는다. 체크박스가 장식이 되면 안 된다.
  if (!agreed) fail(to, "개인정보 수집·이용에 동의해야 가입할 수 있습니다.", "signup");

  const supabase = await createClient();
  // 닉네임·연락처를 **가입 메타데이터**로 넘긴다. 이메일 확인을 쓰는 프로젝트에서는
  // 가입 직후 세션이 없어 profiles 에 직접 못 쓴다 — DB 트리거가 옮긴다(0043).
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname, phone } },
  });
  if (error) {
    const msg = /already registered|already exists/i.test(error.message)
      ? "이미 가입된 이메일입니다. 로그인해 주세요."
      : error.message;
    fail(to, msg, "signup");
  }

  // 프로젝트 설정에 따라 갈린다. 확인 메일을 쓰는 경우 session 이 없다 —
  // 그때 바로 다음 화면으로 보내면 «로그인된 줄 알았는데 아니었던» 상태가 된다.
  // 이메일은 주소창에 싣지 않는다.
  if (!data.session) {
    const q = new URLSearchParams({ sent: "1" });
    if (to !== "/") q.set("next", to);
    redirect(`/login?${q.toString()}`);
  }

  revalidatePath("/", "layout");
  redirect(to);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
