"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 전문가 신청 판정 — 운영자만.
 *
 * 권한을 웹에서 «확인»하지 않는다. 승인은 DB 함수가, 거절은 정책이 각자 is_admin() 을
 * 본다(0047). 여기서 한 번 더 검사해 봐야 그건 화면을 위한 것이지 안전장치가 아니다 —
 * 안전장치를 두 곳에 두면 한쪽만 고치는 날이 온다.
 */

const back = (msg?: string): never =>
  redirect(msg ? `/admin/experts?error=${encodeURIComponent(msg)}` : "/admin/experts?done=1");

export async function approveApplication(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) back("잘못된 요청입니다.");

  const supabase = await createUserClient();
  // 신청서 상태 변경 + experts 행 생성 + 계정 연결을 **한 트랜잭션**으로 묶은 함수.
  // 웹에서 나눠 쓰면 사이에서 실패했을 때 «승인됐다고 적혀 있는데 전문가는 없는»
  // 상태가 남는다.
  const { error } = await supabase.rpc("approve_expert_application", { p_id: id });
  if (error) back(`승인하지 못했습니다 — ${error.message}`);

  // 전문가가 늘면 인사이트의 코너와 머리의 「추천 쓰기」가 같이 바뀐다.
  revalidatePath("/admin/experts");
  revalidatePath("/insights");
  revalidatePath("/expert/apply");
  revalidatePath("/", "layout");
  back();
}

export async function rejectApplication(formData: FormData) {
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isFinite(id)) back("잘못된 요청입니다.");
  // 사유 없는 거절은 신청자에게 «왜»를 남기지 않는다. 다시 신청할 수 있는 제도라
  // 무엇을 고쳐야 하는지 모르면 같은 신청이 그대로 다시 온다.
  if (note.length < 5) back("거절 사유를 5자 이상 적어 주세요. 신청자에게 그대로 보입니다.");

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("expert_applications")
    .update({
      status: "rejected",
      review_note: note,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) back(`거절하지 못했습니다 — ${error.message}`);

  revalidatePath("/admin/experts");
  revalidatePath("/expert/apply");
  back();
}
