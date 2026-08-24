"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient as createUserClient } from "@/lib/supabase/server";
import { getMyExpert } from "@/lib/expert";
import { BODY_SECTIONS, MAX_SUMMARY } from "@/lib/expert-form";

/**
 * 전문가 추천 저장 — 로그인 세션으로 쓴다. 서비스 롤 키를 웹에 두지 않는다.
 * «누가 무엇을 쓸 수 있는가»는 0041 의 RLS 가 정하고, 여기서는 «무엇이 글로서
 * 성립하는가»만 본다.
 */



/** 숫자 칸 — 쉼표를 지우고 읽는다(사람은 125,400 이라고 쓴다). */
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function back(id: string | null, msg: string): never {
  const q = new URLSearchParams({ error: msg });
  if (id) q.set("id", id);
  redirect(`/expert/write?${q.toString()}`);
}

export async function saveNote(formData: FormData) {
  const expert = await getMyExpert();
  if (!expert) redirect("/expert");

  const id = String(formData.get("id") ?? "").trim() || null;
  const instrumentId = num(formData.get("instrument_id"));
  const stance = formData.get("stance") === "buy" ? "buy" : "watch";
  const summary = String(formData.get("summary") ?? "").trim();
  const horizon = String(formData.get("horizon_note") ?? "").trim() || null;
  const publish = formData.get("publish") === "on";
  const asOf = String(formData.get("as_of") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(/[,·]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (!instrumentId) back(id, "종목을 골라 주세요. 아래 후보에서 눌러야 종목이 잡힙니다.");
  if (!summary) back(id, "한 줄 요약이 비어 있습니다. 목록에는 이 문장만 보입니다.");
  if (summary.length > MAX_SUMMARY) back(id, `한 줄 요약이 ${MAX_SUMMARY}자를 넘었습니다.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) back(id, "추천한 날짜가 올바르지 않습니다.");

  const parts: string[] = [];
  for (const s of BODY_SECTIONS) {
    const v = String(formData.get(`body_${s.key}`) ?? "").trim();
    // 반증 조건만 필수다 — 이 코너는 성적을 추적하지 않으므로, «언제 접나»를 글쓴이가
    // 적어 두지 않으면 읽는 사람은 손을 뗄 시점을 영영 알 수 없다.
    if (s.key === "invalidate" && !v) {
      back(id, "「무엇이 틀리면 접나」는 반드시 적어야 합니다. 접는 조건이 없는 추천은 싣지 않습니다.");
    }
    if (v) parts.push(`## ${s.label}\n${v}`);
  }
  const body = parts.join("\n\n") || null;

  const entry = num(formData.get("entry_price"));
  const target = num(formData.get("target_price"));
  const stop = num(formData.get("stop_loss"));

  // DB 에도 같은 제약이 있다(0041). 여기서 먼저 막는 건 «왜 안 되는지»를 한국어로
  // 말해 주기 위해서다 — check 제약 위반 메시지를 그대로 보여줄 수는 없다.
  if (stance === "buy") {
    if (entry == null) back(id, "「산다」에는 진입가가 필요합니다.");
    if (stop == null) back(id, "「산다」에는 손절가가 필요합니다. 손절 없는 추천은 싣지 않습니다.");
  }
  if (entry != null && entry <= 0) back(id, "진입가는 0보다 커야 합니다.");
  if (entry != null && stop != null && stop >= entry) {
    back(id, "손절가는 진입가보다 낮아야 합니다.");
  }
  if (entry != null && target != null && target <= entry) {
    back(id, "목표가는 진입가보다 높아야 합니다.");
  }

  const row = {
    expert_id: expert.id,
    instrument_id: instrumentId,
    as_of: asOf,
    stance,
    summary,
    body,
    tags,
    published: publish,
    entry_price: entry,
    target_price: target,
    stop_loss: stop,
    horizon_note: horizon,
  };

  const supabase = await createUserClient();
  const { error } = id
    ? await supabase.from("expert_notes").update(row).eq("id", Number(id))
    : await supabase.from("expert_notes").insert(row);

  if (error) {
    // 23505 = 같은 사람이 같은 종목을 같은 날 두 번(0040 의 자연키).
    const msg =
      error.code === "23505"
        ? "같은 종목을 오늘 이미 올렸습니다. 새로 쓰지 말고 그 글을 고쳐 주세요."
        : `저장하지 못했습니다 — ${error.message}`;
    back(id, msg);
  }

  revalidatePath("/expert");
  revalidatePath("/insights");
  revalidatePath("/");
  redirect("/expert");
}

/** 내리기·다시 올리기. 지우기는 열지 않는다 — 내린 글도 기록으로 남는다(0041). */
export async function setPublished(formData: FormData) {
  const expert = await getMyExpert();
  if (!expert) redirect("/expert");
  const id = Number(formData.get("id"));
  const next = formData.get("published") === "on";
  if (!Number.isFinite(id)) redirect("/expert");

  const supabase = await createUserClient();
  await supabase.from("expert_notes").update({ published: next }).eq("id", id);

  revalidatePath("/expert");
  revalidatePath("/insights");
  revalidatePath("/");
  redirect("/expert");
}
