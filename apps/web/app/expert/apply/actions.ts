"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 전문가 참여 신청 — 회원이 스스로 낸다.
 *
 * 2026-08-24 Victor: "전문가 참여를 승인해줘야 하는데?". 그전까지 전문가가 되는 길은
 * 운영자 PC 의 명령어 하나뿐이었다(scripts/setup_expert_corner.py).
 *
 * 여기서는 **experts 를 건드리지 않는다.** 신청서만 남기고, experts 행은 운영자가
 * 승인을 누를 때 DB 함수가 만든다(0047 approve_expert_application). 웹이 두 표를
 * 따로 쓰면 사이에서 실패했을 때 «승인됐다고 적혀 있는데 전문가는 없는» 상태가 남는다.
 */

const fail = (msg: string): never =>
  redirect(`/expert/apply?error=${encodeURIComponent(msg)}`);

export async function applyForExpert(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim().toLowerCase();
  const headline = String(formData.get("headline") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!name) fail("필명을 적어 주세요. 글에 이 이름이 보입니다.");
  if (name.length > 20) fail("필명은 20자 이내로 정해 주세요.");
  // experts.handle 과 **같은 규격**이어야 한다 — 승인할 때 그대로 옮겨 가는 값이라,
  // 여기서 느슨하게 받으면 승인 버튼을 누르는 순간 DB 제약에 걸린다.
  if (!/^[a-z0-9][a-z0-9-]{1,19}$/.test(handle)) {
    fail("공개 아이디는 영문 소문자·숫자·하이픈만, 2~20자로 정해 주세요.");
  }
  if (headline && headline.length > 40) fail("한 줄 소개는 40자 이내로 적어 주세요.");
  if (reason.length < 20) {
    fail("참여 이유를 20자 이상 적어 주세요. 승인 판단의 실제 근거입니다.");
  }
  if (reason.length > 1000) fail("참여 이유는 1000자 이내로 적어 주세요.");

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/expert/apply");

  // 공개 아이디가 이미 쓰이고 있으면 여기서 말한다. 승인 시점까지 미루면 신청자는
  // 몇 시간 뒤에 «거절»만 보고 이유를 모른다.
  const { data: taken } = await supabase
    .from("experts")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (taken) fail("이미 쓰이고 있는 공개 아이디입니다. 다른 것으로 정해 주세요.");

  const { error } = await supabase.from("expert_applications").insert({
    user_id: user.id,
    handle,
    name,
    headline,
    bio,
    reason,
  });

  if (error) {
    // 23505 = 유니크 위반. 이 표에서 그건 «대기 중인 신청이 이미 있다»는 뜻이다
    // (expert_applications_one_open — 거절된 뒤 다시 내는 것은 막지 않는다).
    fail(
      error.code === "23505"
        ? "이미 신청하셨습니다. 검토 결과를 기다려 주세요."
        : `신청하지 못했습니다 — ${error.message}`,
    );
  }

  revalidatePath("/expert/apply");
  redirect("/expert/apply?sent=1");
}
