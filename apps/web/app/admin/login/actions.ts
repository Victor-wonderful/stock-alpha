"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function fail(next: string, msg: string): never {
  const q = new URLSearchParams({ error: msg });
  if (next !== "/") q.set("next", next);
  redirect(`/login?${q.toString()}`);
}

/**
 * 관리 호스트의 로그인 — **운영자만** 통과한다.
 *
 * 계정은 회원 사이트와 같은 Supabase 계정이다(로그인 시스템을 따로 만들지 않았다 —
 * middleware.ts 의 isAdminHost 주석). 다른 점은 문턱 하나: 비밀번호가 맞아도
 * profiles.is_admin 이 아니면 **그 자리에서 세션을 지우고** 「맞지 않습니다」라고만
 * 말한다. 「운영자가 아닙니다」라고 하면 이 계정이 존재한다는 것과 여기가 관리
 * 입구라는 것을 둘 다 알려 주는 셈이다.
 *
 * 통과하면 미들웨어가 OTP(/otp)로 보낸다 — 여기서 보내지 않는다. 어디로 갈지는
 * 세션의 보증 수준을 보는 한 곳(미들웨어)만 정해야 두 곳이 갈리지 않는다.
 */
export async function adminSignIn(next: string | null, formData: FormData) {
  const to = safeNext(next);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const WRONG = "이메일 또는 비밀번호가 맞지 않습니다.";
  if (!email || !password) fail(to, "이메일과 비밀번호를 모두 입력해 주세요.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) fail(to, WRONG);

  const { data: prof } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!prof?.is_admin) {
    await supabase.auth.signOut();
    fail(to, WRONG);
  }

  revalidatePath("/", "layout");
  redirect(to);
}

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
