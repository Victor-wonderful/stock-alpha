import { createClient as createUserClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getLatestPricesBySymbols, getTradingCalendar } from "@/lib/data";
import { horizonSpec } from "@/lib/holding";
import { tradingDayLabel } from "@/lib/format";

/**
 * 관심 종목 — 회원이 담아 두는 것.
 *
 * 2026-08-25: 「내 자산」이 그때까지 **예시 데이터**였다. 회원 전용으로 잠가 놓고
 * 로그인해서 들어가면 남의 종목 다섯 개가 가짜로 들어 있었다. FAQ 에는 「회원이 되면
 * 내 자산이 열립니다」라고 적어 두었으니, 그건 화면이 거짓말을 하는 상태였다.
 *
 * 표(watchlists)와 정책(RLS)은 이미 있었다(0005·0006) — select/insert/delete 가 전부
 * `user_id = auth.uid()` 다. 그래서 새 마이그레이션 없이 화면만 붙인다. 조회에
 * **사용자 클라이언트**를 쓰는 것이 중요하다. 공개 클라이언트로 읽으면 정책이
 * 익명으로 걸려 언제나 0건이 나온다.
 */

export interface WatchItem {
  symbol: string;
  name: string;
  exchange: string | null;
  addedAt: string;
  /** 마지막 종가 */
  last: number | null;
  /** 전일 대비 (0.012 = +1.2%) */
  changePct: number | null;
  /** 가장 최근 분석의 판정 — 없으면 아직 분석이 없는 종목이다 */
  rating: string | null;
  ratingAsOf: string | null;
  score: number | null;
  /**
   * 지금 발행 중인 픽 — 있으면 그 «매매 계획»이 통째로 실린다.
   *
   * 2026-08-25 Victor 확정: 「내 픽 추적」이라는 새 화면을 만들지 않고, 관심 종목
   * 줄에 계획을 붙인다. 새 개념(«담기»)을 하나 더 만들지 않고도 «내가 지켜보는
   * 종목의 계획이 지금 어디쯤인가»는 답할 수 있다 — 그리고 아무도 안 누르면
   * 비어 있는 화면이 하나 더 생기는 일도 없다.
   */
  pick: WatchPick | null;
}

export interface WatchPick {
  asOf: string;
  /** pending = 다음 거래일 시가 진입 예정 · open = 보유 중 */
  status: string;
  horizon: string | null;
  entry: number | null;
  /** 본전 도달로 손절이 올라갔으면 진입가가 손절이다(trail 규칙, 0037) */
  stop: number | null;
  /** 본전 도달가 — 여기 닿으면 손절이 진입가로 올라간다. 파는 자리가 아니다 */
  target: number | null;
  tp1Hit: boolean;
  /** 청산 예정일 라벨 — 휴장일 표가 그 구간을 못 덮으면 null */
  exitLabel: string | null;
  /** 현재가에서 손절까지 (음수 = 아래로 그만큼 남음) */
  toStopPct: number | null;
  /** 현재가에서 본전 도달까지 */
  toTargetPct: number | null;
  /** 진입가 대비 — pending 이면 «아직 안 산» 상태라 null */
  fromEntryPct: number | null;
}

/** 담은 종목의 instrument_id 목록 — 화면이 아니라 판정용(☆ 버튼)이 쓴다. */
export async function getWatchedSymbols(): Promise<Set<string>> {
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Set();
    const { data } = await supabase
      .from("watchlists")
      .select("instruments(symbol)")
      .limit(500);
    const out = new Set<string>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const inst = (r.instruments ?? {}) as { symbol?: string };
      if (inst.symbol) out.add(inst.symbol);
    }
    return out;
  } catch {
    return new Set();
  }
}

export async function isWatched(symbol: string): Promise<boolean> {
  const set = await getWatchedSymbols();
  return set.has(symbol);
}

/**
 * 담아 둔 종목과 그 상태.
 *
 * 조회는 네 번이다 — 목록 · 시세 · 최근 분석 · 발행 중인 픽. 종목 수가 몇이든
 * 왕복 수는 같다(전부 in 절 벌크). 종목마다 따로 물으면 20종목에 왕복 60회다.
 */
export async function getMyWatchlist(): Promise<WatchItem[]> {
  try {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from("watchlists")
      .select("instrument_id,created_at,instruments(symbol,name,exchange)")
      .order("created_at", { ascending: false })
      .limit(500);

    const rows = (data ?? []) as Record<string, unknown>[];
    const items = rows
      .map((r) => {
        const inst = (r.instruments ?? {}) as Record<string, unknown>;
        return {
          instrumentId: Number(r.instrument_id),
          symbol: (inst.symbol as string) ?? "",
          name: (inst.name as string) ?? "",
          exchange: (inst.exchange as string) ?? null,
          addedAt: String(r.created_at),
        };
      })
      .filter((x) => x.symbol);
    if (items.length === 0) return [];

    const pub = createPublicClient();
    const ids = items.map((x) => x.instrumentId);
    const symbols = items.map((x) => x.symbol);

    const [prices, reportsRes, picksRes, cal] = await Promise.all([
      getLatestPricesBySymbols(symbols),
      // 최근 분석 — 종목당 최신 1건만 필요하지만 PostgREST 에 «그룹별 최신»이 없다.
      // 종목 수 × 몇 건이면 충분하므로 넉넉히 받아 메모리에서 첫 건만 취한다.
      pub
        .from("reports")
        .select("instrument_id,as_of,rating,score:payload->verdict->>score")
        .eq("status", "published")
        .eq("report_type", "indepth")
        .in("instrument_id", ids)
        .order("as_of", { ascending: false })
        .limit(Math.min(ids.length * 6, 900)),
      // 지금 살아 있는 픽 — 진입 대기(pending)와 보유 중(open) 둘 다 «내 관심 종목이
      // 지금 픽에 올라 있다»는 뜻이다. 레벨까지 같이 받아 계획을 그린다.
      pub
        .from("recommendations")
        .select(
          "instrument_id,as_of,status,horizon,entry_price,stop_loss,target_price,tp1_hit",
        )
        .eq("basket_type", "daily_focus")
        .in("status", ["pending", "open"])
        .in("instrument_id", ids)
        .order("as_of", { ascending: false })
        .limit(200),
      // 청산 예정일 — 휴장일을 한 번만 읽고 메모리에서 센다.
      getTradingCalendar(),
    ]);

    const latestReport = new Map<
      number,
      { as_of: string; rating: string | null; score: number | null }
    >();
    for (const r of (reportsRes.data ?? []) as Record<string, unknown>[]) {
      const iid = Number(r.instrument_id);
      if (latestReport.has(iid)) continue; // 정렬이 최신순이라 첫 건이 최신이다
      latestReport.set(iid, {
        as_of: String(r.as_of),
        rating: (r.rating as string) ?? null,
        score: r.score != null ? Math.round(Number(r.score) * 10) / 10 : null,
      });
    }

    // 같은 종목에 픽이 여러 건이면 최신 하나만 쓴다(정렬이 최신순이라 첫 건).
    const pickByIid = new Map<number, Record<string, unknown>>();
    for (const r of (picksRes.data ?? []) as Record<string, unknown>[]) {
      const iid = Number(r.instrument_id);
      if (!pickByIid.has(iid)) pickByIid.set(iid, r);
    }

    return items.map((x) => {
      const p = prices.get(x.symbol);
      const rep = latestReport.get(x.instrumentId);
      const raw = pickByIid.get(x.instrumentId);
      const pick = raw ? buildPick(raw, p?.close ?? null, cal) : null;
      return {
        symbol: x.symbol,
        name: x.name,
        exchange: x.exchange,
        addedAt: x.addedAt,
        last: p?.close ?? null,
        changePct: p?.changePct ?? null,
        rating: rep?.rating ?? null,
        ratingAsOf: rep?.as_of ?? null,
        score: rep?.score ?? null,
        pick,
      };
    });
  } catch {
    return [];
  }
}

/** 픽 한 건을 «계획»으로 옮긴다 — 화면이 계산하지 않게 여기서 다 낸다. */
function buildPick(
  r: Record<string, unknown>,
  last: number | null,
  cal: { nth: (from: string, n: number) => string | null },
): WatchPick {
  const asOf = String(r.as_of);
  const entry = (r.entry_price as number) ?? null;
  const tp1Hit = Boolean(r.tp1_hit);
  // 본전 도달 뒤에는 손절이 진입가다 — 규칙이 «목표=파는 트리거»가 아니라
  // «본전스톱 전환»이기 때문이다(0037). 옛 stop_loss 를 그대로 그리면 이미 올라간
  // 손절선을 아래에 그려 «아직 여유 있다»고 읽힌다.
  const stop = (tp1Hit ? entry : ((r.stop_loss as number) ?? null)) ?? null;
  const target = (r.target_price as number) ?? null;
  const horizon = (r.horizon as string) ?? null;

  const bars = horizonSpec(horizon)?.bars;
  // 발행일 다음 거래일이 진입일(1거래일째)이라, 발행일에서 기간만큼 세면 마지막 날이다.
  const exitIso = bars ? cal.nth(asOf, bars) : null;

  const pct = (from: number | null, to: number | null) =>
    from != null && from > 0 && to != null ? to / from - 1 : null;

  return {
    asOf,
    status: String(r.status),
    horizon,
    entry,
    stop,
    target,
    tp1Hit,
    exitLabel: exitIso ? tradingDayLabel(exitIso) : null,
    toStopPct: pct(last, stop),
    toTargetPct: pct(last, target),
    // 아직 안 산 픽에 «진입가 대비»를 적으면 산 것처럼 읽힌다.
    fromEntryPct: String(r.status) === "open" ? pct(entry, last) : null,
  };
}
