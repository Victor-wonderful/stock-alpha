"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type EnrollState =
  | { status: "idle" }
  | { status: "ready"; factorId: string; qr: string; secret: string }
  | { status: "error"; message: string };

/**
 * OTP 등록 시작 — Supabase 에 TOTP 인증 수단을 하나 만들고 QR·비밀키를 돌려준다.
 *
 * 화면을 그릴 때(서버 컴포넌트)가 아니라 **버튼을 눌렀을 때** 만든다. 렌더마다
 * 만들면 새로고침할 때마다 «만들다 만 수단»이 하나씩 쌓인다(계정당 10개 상한).
 * 그래도 남은 것이 있으면 여기서 먼저 지운다.
 */
export async function startEnroll(): Promise<EnrollState> {
  const supabase = await createClient();
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "VECTA 관리",
  });
  if (error || !data) {
    return {
      status: "error",
      message: error?.message ?? "인증 수단을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    };
  }
  return {
    status: "ready",
    factorId: data.id,
    qr: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export type VerifyState = { error: string | null };

/**
 * 6자리 코드 확인 — 등록 마무리와 매 로그인의 확인이 **같은 호출**이다.
 * 통과하면 세션이 aal2 로 올라가고, 미들웨어가 그 뒤부터 관리 화면을 열어 준다.
 */
export async function verifyCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!factorId || !/^\d{6}$/.test(code)) return { error: "6자리 숫자를 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return {
      error: /invalid|expired/i.test(error.message)
        ? "코드가 맞지 않습니다. 앱의 새 코드를 다시 입력해 주세요."
        : error.message,
    };
  }
  revalidatePath("/", "layout");
  redirect("/");
}
