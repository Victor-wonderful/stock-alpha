import { notFound } from "next/navigation";

import { OtpSetup, OtpVerify } from "@/components/AdminOtp";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * OTP — 두 얼굴. 등록한 인증 수단이 있으면 «코드 입력», 없으면 «등록».
 *
 * 미들웨어가 비밀번호는 맞았지만 aal2 가 아닌 사람을 여기로 보낸다. 운영자가 아닌
 * 세션은 관리 호스트에 생길 수 없지만(로그인이 막는다), 그래도 한 번 더 본다.
 *
 * ⚠️ metadata 를 내보내지 않는다 — 관리 화면 전체의 규칙(app/admin/page.tsx).
 */
export default async function AdminOtpPage() {
  if (!(await isAdmin())) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = (data?.totp ?? []).find((f) => f.status === "verified") ?? null;

  return (
    <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-6 py-12">
      {verified ? <OtpVerify factorId={verified.id} /> : <OtpSetup />}
    </main>
  );
}
