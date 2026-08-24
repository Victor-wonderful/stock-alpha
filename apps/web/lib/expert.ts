import { getSessionUser } from "@/lib/session";
import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 전문가 «작성자 쪽» 데이터. 읽는 쪽(lib/data.getExpertNotes)과 다른 파일에 둔다 —
 * 저쪽은 익명 캐시 클라이언트로 공개 글만 읽고, 이쪽은 **로그인 세션**으로 자기 글을
 * 읽고 쓴다. 같은 파일에 섞으면 어느 쪽이 캐시되는지 헷갈린다.
 *
 * 권한은 코드가 아니라 DB 가 정한다(0041 RLS). 여기 함수들이 실수해도 남의 이름으로는
 * 못 쓴다 — 서비스 롤 키를 웹에 두지 않는 이유가 그것이다.
 */

export interface MyExpert {
  id: number;
  /** 공개 아이디 — 주소·언급에 쓰인다. 익명 키로도 읽히는 값이라 이메일에서 따오지 않는다. */
  handle: string;
  /** 화면에 보이는 이름 = **필명**. 본명일 필요가 없다(2026-08-24 Victor). */
  name: string;
  headline: string | null;
  bio: string | null;
}

/** 지금 로그인한 사람이 전문가로 등록돼 있나. 아니면 null — 작성 화면이 스스로 막는다. */
export async function getMyExpert(): Promise<MyExpert | null> {
  try {
    const user = await getSessionUser();
    if (!user) return null;
    const supabase = await createUserClient();
    const { data } = await supabase
      .from("experts")
      .select("id,handle,name,headline,bio")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return null;
    return {
      id: Number(data.id),
      handle: String(data.handle),
      name: String(data.name),
      headline: (data.headline as string) ?? null,
      bio: (data.bio as string) ?? null,
    };
  } catch {
    return null;
  }
}

export interface MyExpertNote {
  id: number;
  asOf: string;
  stance: "buy" | "watch";
  summary: string;
  body: string | null;
  tags: string[];
  published: boolean;
  symbol: string | null;
  name: string | null;
  instrumentId: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  horizonNote: string | null;
}

function mapMine(r: Record<string, unknown>): MyExpertNote {
  const inst = (r.instruments ?? null) as { symbol: string; name: string } | null;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: Number(r.id),
    asOf: String(r.as_of),
    stance: r.stance === "buy" ? "buy" : "watch",
    summary: String(r.summary ?? ""),
    body: (r.body as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    published: Boolean(r.published),
    symbol: inst?.symbol ?? null,
    name: inst?.name ?? null,
    instrumentId: num(r.instrument_id),
    entryPrice: num(r.entry_price),
    targetPrice: num(r.target_price),
    stopLoss: num(r.stop_loss),
    horizonNote: (r.horizon_note as string) ?? null,
  };
}

const SELECT =
  "id,as_of,stance,summary,body,tags,published,instrument_id,entry_price,target_price,stop_loss,horizon_note,instruments(symbol,name)";

/** 내가 쓴 글 — 초안(published=false)까지 보인다. 초안이 안 보이면 저장한 글이 사라진 것처럼 읽힌다. */
export async function getMyExpertNotes(expertId: number, limit = 50): Promise<MyExpertNote[]> {
  try {
    const supabase = await createUserClient();
    const { data } = await supabase
      .from("expert_notes")
      .select(SELECT)
      .eq("expert_id", expertId)
      .order("as_of", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMine);
  } catch {
    return [];
  }
}

/** 수정할 글 한 편. 남의 글이면 RLS 가 0행을 돌려주므로 여기서도 null 이다. */
export async function getMyExpertNote(
  expertId: number,
  id: number,
): Promise<MyExpertNote | null> {
  try {
    const supabase = await createUserClient();
    const { data } = await supabase
      .from("expert_notes")
      .select(SELECT)
      .eq("expert_id", expertId)
      .eq("id", id)
      .maybeSingle();
    return data ? mapMine(data as unknown as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface InstrumentHit {
  id: number;
  symbol: string;
  name: string;
}

/**
 * 종목 찾기 — 6자리 코드면 코드로, 아니면 이름으로.
 *
 * 정확히 하나로 좁혀지지 않으면 **고르지 않는다**. 비슷한 이름을 임의로 골라 쓰면
 * 전문가가 의도하지 않은 종목에 그의 이름이 붙는다. 후보를 돌려주고 사람이 고른다.
 */
export async function findInstruments(q: string, limit = 8): Promise<InstrumentHit[]> {
  const term = q.trim();
  if (term.length < 1) return [];
  try {
    const supabase = await createUserClient();
    const query = supabase.from("instruments").select("id,symbol,name").limit(limit);
    const { data } = /^\d{6}$/.test(term)
      ? await query.eq("symbol", term)
      : await query.ilike("name", `%${term}%`);
    return ((data ?? []) as { id: number; symbol: string; name: string }[]).map((r) => ({
      id: Number(r.id),
      symbol: r.symbol,
      name: r.name,
    }));
  } catch {
    return [];
  }
}
