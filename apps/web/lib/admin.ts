import { createClient as createUserClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/session";

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
    const user = await getSessionUser();
    if (!user) return false;
    const supabase = await createUserClient();
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
    const user = await getSessionUser();
    if (!user) return null;
    const supabase = await createUserClient();
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

// ── 회원 ──
/**
 * 운영자가 보는 회원 목록(0049 admin_members).
 *
 * profiles 정책은 «본인 행만»이라 여기서 직접 조회할 수 없다. 정책을 넓히지 않고
 * **운영자인지 확인한 뒤에만 답하는 함수**를 부른다 — 그 판정은 DB 가 한다.
 *
 * 이메일·연락처가 실려 온다. 화면은 이것을 목록에 상시로 늘어놓지 않는다 — 행을
 * 펼쳐야 보인다(개인정보를 한 화면에 늘어놓으면 캡처 한 장으로 전부 샌다).
 */
export interface Member {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  tier: string | null;
  isAdmin: boolean;
  emailConfirmed: boolean;
  /** 전문가로 등록돼 있으면 그 필명 */
  expertName: string | null;
  termsAgreedAt: string | null;
  agreedDocVersion: string | null;
  createdAt: string;
}

function mapMember(r: Record<string, unknown>): Member {
  return {
    id: String(r.id),
    displayName: (r.display_name as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    tier: (r.tier as string) ?? null,
    isAdmin: Boolean(r.is_admin),
    emailConfirmed: Boolean(r.email_confirmed),
    expertName: (r.expert_name as string) ?? null,
    termsAgreedAt: (r.terms_agreed_at as string) ?? null,
    agreedDocVersion: (r.agreed_doc_version as string) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function getMembers(
  q: string | null = null,
  limit = 200,
): Promise<Member[]> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("admin_members", {
      p_q: q && q.trim() ? q.trim() : null,
      p_limit: limit,
      p_offset: 0,
    });
    if (error || !data) throw error ?? new Error("empty");
    return (data as Record<string, unknown>[]).map(mapMember);
  } catch {
    return [];
  }
}

export interface AdminStats {
  members: number;
  membersToday: number;
  members7d: number;
  unconfirmed: number;
  experts: number;
  pendingApps: number;
}

/** 관리 홈의 숫자 — 화면이 세지 않고 DB 가 센다(두 곳이 갈리지 않게). */
export async function getAdminStats(): Promise<AdminStats | null> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("admin_stats");
    if (error || !data) throw error ?? new Error("empty");
    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
    if (!r) return null;
    return {
      members: Number(r.members ?? 0),
      membersToday: Number(r.members_today ?? 0),
      members7d: Number(r.members_7d ?? 0),
      unconfirmed: Number(r.unconfirmed ?? 0),
      experts: Number(r.experts ?? 0),
      pendingApps: Number(r.pending_apps ?? 0),
    };
  } catch {
    return null;
  }
}

// ── 엔진 상태판 (0050 admin_engine_status) ──
/**
 * 엔진이 어젯밤 제대로 돌았는가 — DB 에 남은 흔적으로 판정한다.
 *
 * 2026-09-14 Victor: "관리자 페이지 대시보드가 이렇게 밖에 안되나?". 배치 로그는 운영
 * PC 의 파일이라 웹에서 못 읽고, 8/27 에 배치가 사흘 연속 죽었을 때 아무도 몰랐다.
 * 산출물마다 «가장 최근 날짜»와 «그날 건수»를 받아 기준일(= 시세의 최신일, 마지막
 * 거래일)과 견준다. 판정 규칙은 여기(웹)에 있다 — 거래일 계산(휴장일)이 웹에 있어서다.
 *
 *   0 거래일 늦음 → 정상 · 1 → 지연 · 2 이상 → 멈춤
 *
 * ⚠️ 판정에 «오늘(달력)»을 쓰지 않는다. 주말·휴장일에는 새 봉이 없는 것이 정상이고,
 * 그날 화면을 열어 «멈춤»이 뜨면 거짓 경보다 — 기준일도 시세에서 가져온다.
 */
export type EngineItem = {
  key: string;
  label: string;
  latest: string | null;
  n: number;
  /** 기준일보다 몇 거래일 늦은가. null = 기준일을 모른다 */
  lag: number | null;
  state: "ok" | "late" | "stalled" | "unknown";
};

export type EngineStatus = {
  basis: string | null;
  items: EngineItem[];
  dbBytes: number | null;
  ohlcvBytes: number | null;
};

const ENGINE_ITEMS: [key: string, label: string][] = [
  ["ohlcv", "시세(일봉)"],
  ["factor_scores", "팩터"],
  ["valuations", "밸류에이션"],
  ["risk_metrics", "리스크"],
  ["market_regime", "국면"],
  ["signals", "시그널"],
  ["daily_focus", "픽 발행"],
  ["reports", "리포트"],
  ["disclosures", "공시"],
  ["blog_posts", "블로그 글"],
];

export async function getEngineStatus(
  /** 거래일 계산 — lib/data getTradingCalendar().nth */
  nth: (from: string, n: number) => string | null,
): Promise<EngineStatus | null> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("admin_engine_status");
    if (error || !data) throw error ?? new Error("empty");
    const raw = data as Record<string, { latest?: string | null; n?: number } | number | null>;
    const ohlcv = raw.ohlcv as { latest?: string | null } | null;
    const basis = ohlcv?.latest ? String(ohlcv.latest) : null;

    // 기준일까지 몇 거래일인가. nth 가 확정 달력 밖이면(먼 미래) null 을 주므로 그때는
    // 달력일로 대신 센다 — 정확하진 않아도 «멀다»는 건 맞다.
    const lagOf = (latest: string | null): number | null => {
      if (!latest || !basis) return null;
      if (latest >= basis) return 0;
      for (let k = 1; k <= 30; k++) {
        const d = nth(latest, k);
        if (d === null) {
          const days = Math.round(
            (Date.parse(basis + "T00:00:00Z") - Date.parse(latest + "T00:00:00Z")) / 86_400_000,
          );
          return Math.max(k, Math.ceil(days * 5 / 7));
        }
        if (d >= basis) return k;
      }
      return 30;
    };

    const items: EngineItem[] = ENGINE_ITEMS.map(([key, label]) => {
      const r = raw[key] as { latest?: string | null; n?: number } | null;
      const latest = r?.latest ? String(r.latest) : null;
      const lag = lagOf(latest);
      const state: EngineItem["state"] =
        lag === null ? "unknown" : lag === 0 ? "ok" : lag === 1 ? "late" : "stalled";
      return { key, label, latest, n: Number(r?.n ?? 0), lag, state };
    });

    return {
      basis,
      items,
      dbBytes: typeof raw.db_bytes === "number" ? raw.db_bytes : Number(raw.db_bytes ?? 0) || null,
      ohlcvBytes:
        typeof raw.ohlcv_bytes === "number" ? raw.ohlcv_bytes : Number(raw.ohlcv_bytes ?? 0) || null,
    };
  } catch {
    return null;
  }
}
