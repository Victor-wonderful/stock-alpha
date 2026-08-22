import Link from "next/link";

import { TRADE_SETUP_LABELS } from "@stock-alpha/db";
import type { OpenPick } from "@/lib/data";
import { fmtPct } from "@/lib/format";
import { horizonSpec } from "@/lib/holding";
import { PickCell } from "@/components/HomePickCard";

/**
 * 홈 「진행 중」 — 이미 산 픽이 지금 어떻게 되고 있나.
 *
 * 홈은 getOpenPicks(30) 으로 보유 픽을 통째로 받아놓고 `.length` 만 쓰고 버리고
 * 있었다(2026-08-22 Victor). 아침 브리핑 때와 같은 패턴이다. 조회는 늘지 않는다.
 *
 * ⚠️ 「대기」와 「진행 중」은 다르다.
 *   대기(pending)  = 오늘 발행 → 다음 거래일 시가에 살 것. 그게 「오늘의 픽」 카드다.
 *   진행 중(open)  = 이미 산 것. 매일 값이 바뀌는 건 이쪽이다.
 *
 * 카드 모양은 「오늘의 픽」과 **같다**(Victor 요청). 같은 종류의 것(한 종목의 매매
 * 계획)이므로 다른 모양으로 그릴 이유가 없다 — PickCell 을 그대로 쓴다. 다만 칸의
 * 내용이 다르다: 오늘의 픽은 «앞으로 어떻게 할 것인가»(비중·1주당 리스크)이고,
 * 진행 중은 «지금 어디까지 왔나»(수익률·보유일수·남은 거리)다.
 *
 * 정렬은 getOpenPicks 가 «손절에 가까운 순»으로 준다 — 오늘 봐야 할 게 위로 온다.
 */

/** 손절까지 남은 거리로 위험 색. toStopPct 는 롱에서 음수이고 0 에 가까울수록 코앞. */
function stopSub(toStopPct: number | null): string {
  if (toStopPct == null) return "전량 매도";
  const pct = fmtPct(toStopPct);
  if (toStopPct >= -0.03) return `${pct} · 코앞`;
  return `${pct} 남음`;
}

function OpenPickCard({ pick, exitDay }: { pick: OpenPick; exitDay: string | null }) {
  const spec = horizonSpec(pick.horizon);
  const setupLabel = pick.setup
    ? TRADE_SETUP_LABELS[pick.setup as keyof typeof TRADE_SETUP_LABELS] ?? pick.setup
    : null;
  const won = (v: number) => Math.round(v).toLocaleString("ko-KR");
  const bars = spec?.bars ?? null;
  // 보유일수는 달력일이다(getOpenPicks). 상한은 거래일이라 단위가 다르므로 «남은 며칠»을
  // 빼서 계산하지 않는다 — 섞으면 주말마다 하루씩 틀린다.
  const near = pick.toStopPct != null && pick.toStopPct >= -0.03;

  return (
    <li className="overflow-hidden rounded-[12px] border border-border bg-surface">
      {/* 머리 — 「오늘의 픽」과 같은 줄 구성 */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 pb-2.5 pt-3.5">
        {spec && (
          <span className="rounded-[999px] bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
            {spec.label} · {spec.bars}거래일
          </span>
        )}
        <Link
          href={`/stocks/${pick.symbol}`}
          className="text-[19px] font-bold tracking-[-0.2px] text-text hover:text-accent"
        >
          {pick.name}
        </Link>
        <span className="text-[11px] text-text-mute">{pick.symbol}</span>
        {setupLabel && (
          <span className="rounded-[999px] bg-surface-3 px-2 py-0.5 text-[11px] text-text-dim">
            {setupLabel}
          </span>
        )}
        {/* 본전스톱으로 전환된 픽 — 이 시점부터 손절선이 진입가다. */}
        {pick.tp1Hit && (
          <span className="rounded-[999px] bg-pass-soft px-2 py-0.5 text-[11px] font-semibold text-pass">
            본전스톱
          </span>
        )}
        {near && !pick.tp1Hit && (
          <span className="rounded-[999px] bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">
            손절 코앞
          </span>
        )}
        {pick.last != null && (
          <span className="tnum ml-auto text-[12px] text-text-dim">
            현재 {won(pick.last)}원
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
        <PickCell
          label="진입가"
          value={pick.entry != null ? won(pick.entry) : "—"}
          sub={`${pick.asOf.slice(5).replace("-", "/")} 발행`}
        />
        {/* «수익률»은 누적인지 오늘치인지 모호하다. 진입가 대비 **지금** 값이므로
            이름을 그대로 적는다(2026-08-22 Victor). 보조에는 1주당 손익 금액을 —
            비율만 보면 «얼마 벌었나»가 안 잡힌다. */}
        <PickCell
          label="현재 손익률"
          tone={pick.returnPct == null ? "plain" : pick.returnPct >= 0 ? "up" : "down"}
          value={pick.returnPct != null ? fmtPct(pick.returnPct) : "—"}
          sub={
            pick.entry != null && pick.last != null
              ? `1주당 ${pick.last - pick.entry >= 0 ? "+" : ""}${won(pick.last - pick.entry)}원`
              : "진입가 대비"
          }
        />
        <PickCell
          label="손절가"
          tone="down"
          value={pick.stop != null ? won(pick.stop) : "—"}
          sub={stopSub(pick.toStopPct)}
        />
        <PickCell
          label="본전 도달가"
          tone="up"
          value={pick.target != null ? won(pick.target) : "—"}
          sub={
            pick.tp1Hit
              ? "도달 — 손절이 본전"
              : pick.toTargetPct != null
                ? `${fmtPct(pick.toTargetPct)} 남음`
                : "닿으면 손절이 본전으로"
          }
        />
        <PickCell
          label="보유"
          value={`${pick.heldDays}일`}
          sub={bars ? `상한 ${bars}거래일` : "발행일부터"}
        />
        <PickCell
          label="청산 예정일"
          value={exitDay ?? (bars ? `${bars}거래일째` : "—")}
          sub="그날 종가에 전량"
        />
      </div>

      {/* 남은 규칙 — «지금부터 무엇이 남았나». 이미 지나온 단계는 적지 않는다. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-[12px] text-text-dim">
        {pick.tp1Hit ? (
          <span className="text-text">
            본전 도달 — 손절이 {pick.entry != null ? `${won(pick.entry)}(진입가)` : "본전"}
            로 올라가 손해 구간이 없습니다
          </span>
        ) : (
          <span className="text-text">
            {pick.target != null ? `${won(pick.target)} 닿으면` : "본전 도달가에 닿으면"}{" "}
            손절을 {pick.entry != null ? `${won(pick.entry)}(본전)` : "본전"}으로 올림
          </span>
        )}
        <span className="text-text-mute">→</span>
        <span>
          {pick.stop != null ? `${won(pick.stop)}` : "손절"} 닿으면 전량 매도
        </span>
        <span className="text-text-mute">→</span>
        <span>{exitDay ?? `${bars ?? "-"}거래일째`} 종가에 전량 매도</span>
        <Link
          href={`/stocks/${pick.symbol}`}
          className="ml-auto shrink-0 text-[11px] font-semibold text-accent hover:underline"
        >
          종목 분석 →
        </Link>
      </div>
    </li>
  );
}

export function HomeOpenPicks({
  picks,
  exitDays,
  pendingCount = 0,
  planDay,
}: {
  picks: OpenPick[];
  /** 종목별 청산 예정일 라벨. 휴장일 표가 못 덮으면 그 종목만 비어 있다. */
  exitDays?: Map<string, string | null>;
  /** 오늘 발행분 중 아직 안 산 건수 — 빈 상태 문구에 쓴다. */
  pendingCount?: number;
  /** 그 대기 픽을 살 날 — "8월 24일(월)". 모르면 null. */
  planDay?: string | null;
}) {
  // 0 건이어도 섹션은 남는다(2026-08-22 Victor — "진행 중 종목이 없을 수 없잖아,
  // 섹션을 만들어놔라"). 자리를 지워버리면 보유가 생기는 날 화면 구조가 통째로 바뀌어
  // 매일 오는 사람이 «어제 보던 그 자리»를 잃는다.
  if (picks.length === 0) {
    // 자리를 «채우려» 하지 않는다. 처음엔 유령 행("진입가 —, 수익률 —, …")을 그렸는데
    // 미리보기가 아니라 **고장난 표**로 읽혔다(2026-08-22 Victor — "이게 뭐야?").
    // 없는 것은 없다고 한 줄로 말하고, 자리는 작게 잡는다.
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-surface px-5 py-4">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-text-dim">
          <span className="font-semibold text-text">아직 보유 중인 픽이 없습니다</span>
          {pendingCount > 0 ? (
            <>
              {" — 오늘의 픽 "}
              <span className="tnum font-semibold text-text">{pendingCount}건</span>이{" "}
              <span className="font-semibold text-text">{planDay ?? "다음 거래일"}</span>{" "}
              시가에 체결되면 여기에 나타납니다.
            </>
          ) : (
            <>. 픽이 체결되면 여기에 나타납니다.</>
          )}
        </p>
        {pendingCount > 0 && (
          <Link
            href="/focus"
            className="shrink-0 text-[12px] font-semibold text-accent hover:underline"
          >
            오늘의 픽 보기 →
          </Link>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {picks.map((p) => (
        <OpenPickCard key={p.symbol} pick={p} exitDay={exitDays?.get(p.symbol) ?? null} />
      ))}
    </ul>
  );
}
