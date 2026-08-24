"use server";

import { revalidatePath } from "next/cache";

import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * 관심 종목 담기·빼기.
 *
 * 권한을 여기서 «확인»하지 않는다. watchlists 의 정책이 insert·delete 모두
 * `user_id = auth.uid()` 라, 남의 목록에는 쓸 수도 지울 수도 없다(0006).
 * 웹은 그 위에서 화면을 그릴 뿐이다.
 *
 * symbol 을 받아 instrument_id 로 바꾸는 이유: 화면이 아는 것은 종목 코드이고
 * 표의 키는 내부 id 다. 이 변환을 화면에 시키면 종목마다 조회가 한 번씩 더 붙는다.
 */

async function instrumentIdOf(symbol: string): Promise<number | null> {
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("instruments")
    .select("id")
    .eq("symbol", symbol)
    .maybeSingle();
  return data ? Number((data as { id: number }).id) : null;
}

/** 담은 뒤 되돌아갈 화면들 — 어디서 눌러도 별과 목록이 같이 갱신돼야 한다. */
function refresh(symbol: string) {
  revalidatePath("/watchlist");
  revalidatePath(`/stocks/${symbol}`);
}

export async function addToWatchlist(symbol: string) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const id = await instrumentIdOf(symbol);
  if (id == null) return;

  // 이미 담겨 있으면 조용히 넘어간다 — 기본키가 (user_id, instrument_id) 라
  // 두 번 담아도 오류가 아니라 «변화 없음»이어야 한다.
  await supabase
    .from("watchlists")
    .upsert({ user_id: user.id, instrument_id: id }, { onConflict: "user_id,instrument_id" });

  refresh(symbol);
}

export async function removeFromWatchlist(symbol: string) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const id = await instrumentIdOf(symbol);
  if (id == null) return;

  await supabase
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("instrument_id", id);

  refresh(symbol);
}

/**
 * 여러 종목을 한 번에 담기 — 리스크 진단에서 넘어온다.
 *
 * 진단은 조합을 통째로 다루는 화면이라 종목을 하나씩 담게 하면 손이 많이 간다.
 * 진단 입력 자체는 **여전히 저장하지 않는다**(화면의 약속) — 담는 것은 사용자가
 * 별을 누른 것과 같은 명시적인 행동일 때만이다.
 */
export async function addManyToWatchlist(symbols: string[]) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return;

  const { data } = await supabase
    .from("instruments")
    .select("id,symbol")
    .in("symbol", uniq);
  const rows = ((data ?? []) as { id: number; symbol: string }[]).map((r) => ({
    user_id: user.id,
    instrument_id: Number(r.id),
  }));
  if (rows.length === 0) return;

  await supabase
    .from("watchlists")
    .upsert(rows, { onConflict: "user_id,instrument_id" });

  revalidatePath("/watchlist");
  revalidatePath("/diagnosis");
}
