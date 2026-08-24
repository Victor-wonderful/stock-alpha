import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 운영자인가 — 관리 화면의 출입 조건(0047 profiles.is_admin).
 *
 * 지금까지 이 제품에는 «운영자»라는 개념이 코드에 없었다. 전문가를 만드는 길이 운영자
 * PC 의 명령어 하나뿐이었기 때문이다(scripts/setup_expert_corner.py). 승인을 화면에서
 * 하려면 누가 누를 수 있는지부터 정해야 한다.
 *
 * 역할을 여러 개 만들지 않았다. 지금 필요한 구분은 «전문가 신청을 판정할 수 있는가»
 * 하나뿐이고, 쓰이지 않는 역할 체계는 그 자체로 틀릴 여지가 된다.
 *
 * ⚠️ 이 함수의 판정은 **화면을 감추는 용도**다. 실제 권한은 DB 가 지킨다 —
 * expert_applications 의 정책과 approve_expert_application 이 각자 is_admin() 을 다시
 * 본다. 웹이 실수해도 남의 신청을 승인할 수 없다.
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    return Boolean(data?.is_admin);
  } catch {
    return false;
  }
}

export interface ExpertApplication {
  id: number;
  userId: string;
  handle: string;
  name: string;
  headline: string | null;
  bio: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/**
 * ⚠️ 신청자의 «계정 닉네임»은 여기 없다. 가져오려면 profiles 를 읽어야 하는데 그 표의
 * 정책은 본인 행만 열어 준다 — 운영자에게도 남의 닉네임은 안 보인다. 그 정책을 넓히는
 * 것보다 신청서가 스스로 필요한 값을 다 들고 있는 편이 낫다(필명·공개 아이디·소개·사유).
 */
function mapRow(r: Record<string, unknown>): ExpertApplication {
  return {
    id: Number(r.id),
    userId: String(r.user_id),
    handle: String(r.handle),
    name: String(r.name),
    headline: (r.headline as string) ?? null,
    bio: (r.bio as string) ?? null,
    reason: String(r.reason),
    status: r.status as ExpertApplication["status"],
    reviewNote: (r.review_note as string) ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    createdAt: String(r.created_at),
  };
}

const SELECT =
  "id,user_id,handle,name,headline,bio,reason,status,review_note,reviewed_at,created_at";

/** 신청 전부 — 운영자만 실제로 다 본다(나머지는 정책이 자기 것만 돌려준다). */
export async function getExpertApplications(): Promise<ExpertApplication[]> {
  try {
    const supabase = await createUserClient();
    const { data } = await supabase
      .from("expert_applications")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
  } catch {
    return [];
  }
}

/** 내가 낸 신청 — 신청 화면이 «이미 냈습니다»를 말하려면 필요하다. */
export async function getMyApplication(): Promise<ExpertApplication | null> {
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("expert_applications")
      .select(SELECT)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return rows.length > 0 ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}
