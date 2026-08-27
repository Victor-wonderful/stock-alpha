import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";

import { AppShell } from "@/components/AppShell";
import { tradingDayLabel } from "@/lib/format";
import { BackfillTrackRecord } from "@/components/BackfillTrackRecord";
import {
  getPickHistory,
  getResimHorizonStats,
  NON_TRADE_PICK_STATUSES,
  type PickRecord,
} from "@/lib/data";
import { HORIZONS, horizonLabel, horizonSpec, isHorizonPaused } from "@/lib/holding";
import { fmtPct, fmtPrice } from "@/lib/format";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

// 상태 → 배지 스타일
const STATUS_BADGE: Record<string, string> = {
  "목표 도달": "bg-good-soft text-good",
  // 진입가에 끝내 안 닿아 살 수 없었던 픽 — 이겼든 졌든 «거래가 아니다».
  // 중립색으로 둔다. 성적처럼 읽히면 안 된다.
  미체결: "bg-surface-3 text-text-mute",
  손절: "bg-bad-soft text-bad",
  // 스톱 전환 뒤 «평단»에서 나간 픽 — 손절이 아니라 무승부(수익률 ~0%).
  // 2026-08-27 추격스톱 교체 이후로는 드물어진다(추격은 평단보다 위에 선다).
  // 빨간 배지로 그리면 진 것처럼 읽히므로 중립색.
  "본전 청산": "bg-surface-3 text-text-dim",
  // 추격 스톱에 걸려 «이익을 남기고» 나간 픽 — 무승부가 아니라 이긴 거래다.
  "추격 청산": "bg-good-soft text-good",
  "1차 익절": "bg-good-soft text-good", // 옛 규칙(분할익절) 픽만
  진행중: "bg-warn-soft text-warn",
  만료: "bg-surface-3 text-text-dim",
  // 규칙을 바꿔서 우리가 닫은 픽 — 성적에는 들어가고, 왜 닫혔는지는 이름이 말한다.
  "규칙 교체 정리": "bg-surface-3 text-text-dim",
  "—": "bg-surface-3 text-text-mute",
};

const FILTERS = [
  "전체", "진입 대기", "진행중", "목표 도달", "추격 청산", "손절", "본전 청산",
  "만료", "미체결",
  // 2026-08-22 규칙 교체로 우리가 닫은 픽. 숨기지 않는다 — 성적에 들어가고,
  // 왜 닫혔는지 이름이 말한다.
  "규칙 교체 정리",
] as const;

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filter = sp.status && FILTERS.includes(sp.status as (typeof FILTERS)[number])
    ? sp.status
    : "전체";
  // ── 규칙 세대 ──
  // 2026-08-22 에 진입·축·청산 규칙을 한꺼번에 바꿨다. 그 이전 픽(horizon 없음)은
  // **지금 쓰지 않는 규칙의 성적**인데, 한 표에 섞어 놓으면 그것이 이 제품의 성적표로
  // 읽힌다. 실제로 49건 중 43건이 옛 규칙이라, 요약 숫자는 사실상 전부 옛 규칙 것이었다
  // (2026-08-25 Victor 확정 — 지금 규칙이 앞, 옛 규칙은 접어서 보관).
  const legacyView = sp.gen === "legacy";

  const [history, resim] = await Promise.all([
    getPickHistory(500),
    getResimHorizonStats(),
  ]);
  // 기간(horizon)이 있으면 지금 규칙이다 — 그 축이 규칙 교체와 함께 들어왔다.
  const current = history.data.filter((r) => r.horizon);
  const legacy = history.data.filter((r) => !r.horizon);
  const all = legacyView ? legacy : current;
  const rows = filter === "전체" ? all : all.filter((r) => r.status === filter);

  // 요약 집계 — 전체 발행 기준 (필터와 무관)
  //
  // ⚠️ 비율의 «분모»는 발행 건수가 아니라 «거래가 된 건수»다. 진입을 다음 거래일
  // 시가로 바꾼 뒤(2026-08-21) 픽은 발행 즉시 거래가 아니다 — 하루는 진입 대기고,
  // 갭으로 진입 조건이 무너지면 아예 안 산다(취소). 옛 지정가 픽의 미체결도 같다.
  // 이것들을 분모에 넣으면 손절률이 실제보다 낮아 보인다.
  const traded = all.filter((r) => !NON_TRADE_PICK_STATUSES.has(r.status));
  const pending = all.filter((r) => r.status === "진입 대기");
  // ── 승률 ──
  // «수익으로 끝난 거래 / 끝난 거래»이고, **규칙 교체 정리는 모수에서 뺀다**
  // (2026-08-25 Victor 확정). 그 13건은 매매 결과가 아니라 우리가 규칙을 바꿔서
  // 그날 종가로 강제로 닫은 것이라, 우연히 작게 끝난 값이 승률을 부풀린다.
  //
  // 목표 도달률로 재지 않는 이유: 규칙이 «목표는 파는 트리거가 아니라 추격스톱 전환»
  // 으로 바뀌어(0037) 목표 도달이라는 상태 자체가 거의 나오지 않는다.
  const decided = all.filter(
    (r) => r.closed && r.return_pct != null && r.status !== "규칙 교체 정리",
  );
  const wins = decided.filter((r) => (r.return_pct ?? 0) > 0);
  const winRate = decided.length > 0 ? wins.length / decided.length : null;
  const closedStop = all.filter((r) => r.status === "손절");
  const inProgress = all.filter((r) => r.status === "진행중");
  // «이긴 픽은 아직 진행중»은 사실일 때만 적는다. 2026-08-27 에 이 문장이 거짓이
  // 된 채로 화면에 남아 있었다 — 추격 청산 2건이 이미 이익으로 확정됐는데도
  // «이긴 픽은 진행중»이라고 적혀 있었다. 문구를 데이터에 묶는다.
  const openWinners = inProgress.filter((r) => (r.return_pct ?? 0) > 0);
  const closed = all.filter((r) => r.closed && r.return_pct != null);
  const avgClosed =
    closed.length > 0
      ? closed.reduce((a, r) => a + (r.return_pct ?? 0), 0) / closed.length
      : null;
  // ── 전체 평균 손익 (진행중 포함 · 현재가 기준) ──
  // 확정 평균만 대표 숫자로 쓰면 기록 초반에 반드시 왜곡된다: 지는 픽은 1~2일 만에
  // 손절로 끝나고 이기는 픽은 5~10거래일을 채워야 확정되므로, «끝난 거래»가 손절로만
  // 채워지는 구간이 산술적으로 생긴다(2026-08-26 실제로 그랬다 — 확정 -6.9% 뒤에
  // 진행중 +4.4% 5건이 있었다). 거래가 된 픽 전체(확정+진행중 현재가)의 평균이
  // 이 시점의 정직한 중간 그림이다.
  const tradedWithReturn = traded.filter((r) => r.return_pct != null);
  const avgAll =
    tradedWithReturn.length > 0
      ? tradedWithReturn.reduce((a, r) => a + (r.return_pct ?? 0), 0) /
        tradedWithReturn.length
      : null;
  // 끝난 거래가 이만큼 쌓이기 전의 승률·확정 평균은 색을 빼고 «참고용»으로 그린다.
  const SMALL_SAMPLE = decided.length < 10;
  const avg = (list: PickRecord[]) =>
    list.length > 0
      ? list.reduce((a, r) => a + (r.return_pct ?? 0), 0) / list.length
      : null;
  const count = (s: string) =>
    s === "전체" ? all.length : all.filter((r) => r.status === s).length;

  // 개발 중이라 발행 기준이 바뀌면 과거 픽을 정리한다(2026-08-16·08-21 실제 삭제).
  // 그래서 "수정·삭제 없음"·"🔒 기록 불변" 문구를 뺐다 — 사실과 달랐다.
  // 기준이 굳고 정정 이력을 공개할 수 있게 되면 그때 다시 단다. (/focus 픽 기록의
  // "전부 공개 · 삭제 없음" 도 같은 이유로 함께 뺐다)
  return (
    <AppShell
      title="성과"
      asOf={all[0]?.as_of ? `${tradingDayLabel(all[0].as_of)} 기준` : null}
      subtitle="발행한 모든 픽의 기록입니다. 맞은 것과 틀린 것을 함께 적습니다 — 다음 거래일 시가 진입 · 종가 기준 자동 확정."
      stats={[
        { label: "누적 발행", value: `${all.length}` },
        { label: "진행중", value: `${inProgress.length}` },
        // 이 화면의 결론 한 칸 — 거래된 픽 전체의 평균 손익(진행중은 현재가).
        // 확정 평균은 기록 초반에 손절만 먼저 채점돼 반드시 나빠 보인다(위 avgAll 주석).
        {
          label: "전체 평균 손익",
          value: avgAll != null ? `${avgAll >= 0 ? "+" : ""}${(avgAll * 100).toFixed(1)}%` : "—",
          tone: (avgAll ?? 0) >= 0 ? ("good" as const) : ("bad" as const),
        },
      ]}
    >
      <div className="space-y-4">
        {/* ── 어느 규칙의 성적인가 ──
            이 화면에서 가장 먼저 말해야 하는 것이다. 숫자를 먼저 보여 주고 나중에
            «사실 옛 규칙입니다»라고 적으면, 읽는 사람은 이미 그 숫자를 기억한다. */}
        {legacyView ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-[12px] leading-relaxed text-text-dim">
            <span className="font-bold text-warn">
              지금 쓰지 않는 규칙의 기록입니다
            </span>
            <span>
              — 2026년 8월 22일에 진입·축·청산 규칙을 한꺼번에 바꿨습니다. 아래 {legacy.length}건은
              그 이전에 옛 규칙으로 발행한 것이라, 지금 발행되는 픽의 성적이 아닙니다.
            </span>
            <Link href="/picks" className="font-semibold text-accent hover:underline">
              지금 규칙 보기 →
            </Link>
          </div>
        ) : (
          current.length > 0 &&
          decided.length === 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[12px] border border-border bg-surface px-4 py-3 text-[12px] leading-relaxed text-text-dim">
              <span className="font-bold text-text">아직 끝난 거래가 없습니다</span>
              <span>
                — 지금 규칙은 8월 22일부터입니다. 발행 {current.length}건이 아직 진행중이거나
                진입을 기다리고 있어, 승률과 평균 손익은 첫 청산이 나온 뒤에 채워집니다.
              </span>
            </div>
          )
        )}

        {/* 요약 스탯 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              label: "누적 발행",
              value: `${all.length}건`,
              sub: pending.length > 0
                ? `거래 ${traded.length}건 · 진입 대기 ${pending.length}건`
                : `거래 ${traded.length}건`,
              color: "text-text",
            },
            {
              // 결론 한 칸 — 거래된 픽 전체(확정 + 진행중 현재가)의 평균.
              label: "전체 평균 손익",
              value: avgAll != null ? fmtPct(avgAll) : "—",
              sub: `거래 ${tradedWithReturn.length}건 · 진행중은 현재가 기준`,
              color:
                avgAll == null
                  ? "text-text"
                  : avgAll >= 0
                    ? "text-good"
                    : "text-bad",
            },
            {
              label: "진행중 (미실현)",
              value: avg(inProgress) != null ? fmtPct(avg(inProgress)) : "—",
              sub: `${inProgress.length}건 진행중 · 현재가 기준`,
              color:
                avg(inProgress) == null
                  ? "text-text"
                  : avg(inProgress)! >= 0
                    ? "text-good"
                    : "text-bad",
            },
            {
              label: "손절",
              value: `${closedStop.length}건 / 거래 ${traded.length}건`,
              sub: avg(closedStop) != null ? `평균 ${fmtPct(avg(closedStop))}` : undefined,
              // 손절은 이 구조의 정상 작동음(자주 작게 잃는 쪽 갈래)이다 — 결론 칸이
              // 아니므로 경고색 대문짝을 피하고, 값은 그대로 정직하게 적는다.
              color: "text-text",
            },
            {
              // 분모는 «끝난 거래»이고 규칙 교체 정리는 뺀다 — 위 decided 주석 참조.
              // «목표 도달 N»은 지웠다 — 채택 규칙(trail)에서 목표는 파는 트리거가
              // 아니라 추격스톱 트리거라 이 값은 언제나 0에 가깝고, 0이 정상인데
              // 실패처럼 읽힌다.
              label: "승률",
              value:
                winRate == null ? "—" : `${(winRate * 100).toFixed(1)}%`,
              sub:
                decided.length === 0
                  ? "끝난 거래가 아직 없습니다"
                  : SMALL_SAMPLE
                    ? `끝난 거래 ${decided.length}건 — 표본이 적어 참고용`
                    : `수익 ${wins.length} / 끝난 거래 ${decided.length}건`,
              // 끝난 거래가 몇 건 안 될 때의 승률은 통계가 아니라 소음이다 — 색을 빼고
              // 회색 참고 숫자로 그린다(숨기지는 않는다).
              color: SMALL_SAMPLE ? "text-text-dim" : "text-good",
            },
            {
              label: "확정 픽 평균 수익률",
              value: avgClosed != null ? fmtPct(avgClosed) : "—",
              sub: SMALL_SAMPLE
                ? openWinners.length > 0
                  ? `끝난 거래 ${closed.length}건뿐 — 이긴 픽 ${openWinners.length}건은 아직 진행중`
                  : `끝난 거래 ${closed.length}건뿐 — 표본이 적어 참고용`
                : "만료 포함 · 확정 기준",
              color: SMALL_SAMPLE
                ? "text-text-dim"
                : avgClosed != null && avgClosed >= 0
                  ? "text-good"
                  : "text-bad",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="flex flex-col gap-1 rounded-[12px] border border-border bg-surface px-4 py-3.5">
              <span className="text-[11px] text-text-mute">{label}</span>
              <span className={`tnum text-xl font-extrabold leading-none ${color}`}>{value}</span>
              {sub && <span className="text-[11px] text-text-mute">{sub}</span>}
            </div>
          ))}
        </div>

        {/* 기록 초반의 착시를 읽는 법 — 지는 픽은 빨리 끝나고, 이기는 픽은 «이길
            만큼 오른 뒤에야» 끝난다. 이 한 줄이 없으면 확정 칸에 손절만 쌓이는
            구간이 «망한 성적»으로 읽힌다.
            ⚠️ 이긴 픽이 실제로 진행중일 때만 띄운다 — 2026-08-27 에 이 문단이
            거짓이 된 채로 남아 있었다(추격 청산 2건이 이미 확정된 뒤였다). */}
        {!legacyView && SMALL_SAMPLE && closedStop.length > 0 && openWinners.length > 0 && (
          <p className="px-1 text-[12px] leading-relaxed text-text-mute">
            지는 픽은 보통 1~2일 만에 손절로 끝나고, 이기는 픽은 목표를 찍고 추격
            손절이 걸릴 때까지 열려 있습니다. 그래서 기록 초반에는 확정 칸에 손절이
            먼저 쌓입니다 — 진행중인 픽까지 합친 «전체 평균 손익»이 이 시점의 더
            정확한 그림입니다.
          </p>
        )}

        {/* 기간별 트랙레코드 — 이 개편의 핵심 실익.
            전체를 한 덩어리로 세면 «어느 전략의 어느 기간이 되는가»를 알 수 없다.
            단기는 5거래일이면 완결되므로 발행 일주일 뒤부터 진짜 성적이 쌓인다. */}
        {all.some((r) => r.horizon) && (
          <div className="rounded-[12px] border border-border bg-surface">
            <div className="border-b border-border px-4 py-2.5">
              <span className="text-[12px] font-bold text-text">기간별 성과</span>
              <span className="ml-2 text-[11px] text-text-mute">
                보유기간이 다르면 다른 거래다 — 따로 센다
              </span>
            </div>
            <div className="divide-y divide-border-soft">
              {HORIZONS.map((hz) => {
                const rows = all.filter((r) => r.horizon === hz.key);
                const tr = rows.filter((r) => !NON_TRADE_PICK_STATUSES.has(r.status));
                // «목표 도달»만 세면 이긴 거래가 통째로 안 보인다 — 이 규칙에서
                // 목표는 파는 트리거가 아니라 추격스톱 전환점이라 그 상태가 거의
                // 안 나오기 때문이다. 실제로 2026-08-27 에 「목표 0 · 손절 4」만
                // 떠서, 이익으로 끝난 추격 청산 2건이 화면 어디에도 없었다.
                // 세는 기준을 «상태»가 아니라 «결과»로 바꾼다.
                const won = rows.filter(
                  (r) => r.closed && (r.return_pct ?? 0) > 0,
                );
                const lost = rows.filter(
                  (r) => r.closed && (r.return_pct ?? 0) < 0,
                );
                const done = rows.filter((r) => r.closed && r.return_pct != null);
                const mean =
                  done.length > 0
                    ? done.reduce((a, r) => a + (r.return_pct ?? 0), 0) / done.length
                    : null;
                return (
                  <div
                    key={hz.key}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-[12px]"
                  >
                    <span className="min-w-[8rem] font-bold text-text">
                      {hz.label}
                      <span className="ml-1.5 text-[11px] font-normal text-text-mute">
                        최대 {hz.bars}거래일
                      </span>
                    </span>
                    {rows.length === 0 ? (
                      <span className="text-text-mute">
                        {isHorizonPaused(hz.key)
                          ? "발행을 쉬는 중 — 지난 1년 재현에서 성적이 가장 낮았습니다"
                          : "아직 발행 없음"}
                      </span>
                    ) : (
                      <>
                        <span className="tnum text-text-dim">발행 {rows.length}건</span>
                        <span className="tnum text-text-dim">거래 {tr.length}건</span>
                        <span className="tnum text-good">이익 {won.length}</span>
                        <span className="tnum text-bad">손실 {lost.length}</span>
                        <span
                          className={`tnum ml-auto font-semibold ${
                            mean == null ? "text-text-mute" : mean >= 0 ? "text-good" : "text-bad"
                          }`}
                        >
                          {mean == null ? "확정 없음" : `평균 ${fmtPct(mean)}`}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
              {/* 예전에는 여기서 «옛 픽 N건이 위 집계에서 빠진다»고 알렸다. 이제 그
                  픽들은 이 화면에 아예 없다(옛 규칙 기록으로 분리) — 없는 것을
                  «빠졌다»고 적으면 어디에 있는지 찾게 만든다. */}
            </div>
          </div>
        )}

        {/* 지난 1년 재현 — 표본이 가장 큰 성과 근거라 재현 블록 중 맨 위에 둔다. */}
        <BackfillTrackRecord />

        {/* 규칙 교체 재현 — 발행 기록이 아니라 «계산»이다.
            2026-08-22 에 진입·축·청산 규칙을 한꺼번에 바꿨는데, 그 이전 픽은 전부
            옛 규칙 기록이라 기간별 성과가 빈다. 같은 픽을 새 규칙으로 다시 돌려
            «규칙 교체가 실제로 개선인가»를 숫자로 본다.
            ⚠️ 실제로 발행한 것처럼 읽히면 안 된다 — 배경·라벨·문구로 계속 구분한다. */}
        {resim.data.length > 0 && (
          <div className="rounded-[12px] border border-dashed border-border-strong bg-surface-2">
            <div className="border-b border-border-soft px-4 py-2.5">
              <span className="rounded-[999px] bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-text-dim">
                재현
              </span>
              <span className="ml-2 text-[12px] font-bold text-text">
                규칙을 바꾸기 전 픽을 새 규칙으로 다시 돌리면
              </span>
              <p className="mt-1 text-[11px] leading-relaxed text-text-mute">
                발행한 픽이 아니라 <b className="font-semibold text-text-dim">계산</b>입니다.
                2026-08-22 이전 픽을 시가 진입·본전스톱·기간별 보유 상한으로 다시 돌린
                결과입니다.
                한 픽을 단기·중기·장기 세 벌로 폅니다 — 실제 발행도 통과한 기간마다 따로 나가기 때문입니다.
              </p>
            </div>
            <div className="divide-y divide-border-soft">
              {HORIZONS.map((hz) => {
                const st = resim.data.find((r) => r.horizon === hz.key);
                return (
                  <div
                    key={hz.key}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-[12px]"
                  >
                    <span className="min-w-[8rem] font-bold text-text">
                      {hz.label}
                      <span className="ml-1.5 text-[11px] font-normal text-text-mute">
                        최대 {hz.bars}거래일
                      </span>
                    </span>
                    {!st ? (
                      <span className="text-text-mute">재현 없음</span>
                    ) : (
                      <>
                        <span className="tnum text-text-dim">종료 {st.closed}건</span>
                        {/* 진행중(산 것)과 진입 대기(아직 안 산 것)를 나눠 적는다 —
                            합쳐서 「진행중」이라 찍으면 아직 사지도 않은 픽이 세어져,
                            위 「진행중」 타일·/focus 와 숫자가 어긋난다(2026-08-25). */}
                        <span className="tnum text-text-dim">진행중 {st.open}</span>
                        {st.pending > 0 ? (
                          <span className="tnum text-text-mute">진입 대기 {st.pending}</span>
                        ) : null}
                        <span className="tnum text-good">승 {st.wins}</span>
                        <span className="tnum text-text-dim">
                          승률{" "}
                          {st.closed > 0
                            ? `${Math.round((st.wins / st.closed) * 100)}%`
                            : "—"}
                        </span>
                        <span
                          className={`tnum ml-auto font-semibold ${
                            st.mean == null
                              ? "text-text-mute"
                              : st.mean >= 0
                                ? "text-good"
                                : "text-bad"
                          }`}
                        >
                          {st.mean == null ? "확정 없음" : `평균 ${fmtPct(st.mean)}`}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border-soft px-4 py-3 text-[11px] leading-relaxed text-text-mute">
              같은 픽의 <b className="font-semibold text-text-dim">옛 규칙 실제 성적</b>은{" "}
              종료 {closed.length}건 · 승 {closed.filter((r) => (r.return_pct ?? 0) > 0).length}건
              {closed.length > 0 &&
                ` (${Math.round(
                  (closed.filter((r) => (r.return_pct ?? 0) > 0).length / closed.length) * 100,
                )}%)`}
              {avgClosed != null && ` · 평균 ${fmtPct(avgClosed)}`} 였습니다. 승률이 오른 가장 큰
              이유는 진입 방식입니다 — 지정가는 «내려온 종목»만 체결돼 손절될 것만 사졌습니다.
              <br />
              다만 이 중{" "}
              <b className="font-semibold text-text-dim">
                현재 검증을 통과하는 조합은{" "}
                {resim.data.reduce((a, r) => a + r.gatePassed, 0)}개뿐
              </b>
              입니다. 나머지는 «새 규칙이었다면 이랬을 것»이지 «발행됐을 것»이 아닙니다.
              위아래 모두 같은 방식으로 중복(진행중 재선정)을 합쳐 셉니다.
            </div>
          </div>
        )}

        {/* 상태 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              // 옛 규칙 기록을 보다가 상태를 누르면 그 안에서 걸러져야 한다 —
              // gen 을 떨어뜨리면 지금 규칙 화면으로 튕긴다.
              href={(() => {
                const p = new URLSearchParams();
                if (legacyView) p.set("gen", "legacy");
                if (f !== "전체") p.set("status", f);
                const qs = p.toString();
                return qs ? `/picks?${qs}` : "/picks";
              })()}
              className={`rounded-[999px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === f
                  ? "border-accent bg-accent text-text-on-accent"
                  : "border-border bg-surface-2 text-text-dim hover:text-text"
              }`}
            >
              {f} {count(f)}
            </Link>
          ))}
        </div>

        {/* 픽 테이블 */}
        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-mute">
              {all.length === 0 ? "발행된 픽이 없습니다 — 매일 16:30 일일 배치에서 생성됩니다" : "해당 상태의 픽이 없습니다"}
            </p>
          ) : (
            <>
            {/* ── 폰 (768 미만) — 픽 한 건이 카드 한 장 ──
                열 7개짜리 표를 390px 에 넣으면 수익률·상태가 스크롤 뒤로 숨는다.
                이 화면은 «성적»을 보는 곳이라 그 둘이 가장 먼저 보여야 한다. */}
            <div className="md:hidden">
              {rows.map((r, i) => (
                <article
                  key={`m-${r.as_of}-${r.symbol}-${i}`}
                  className="border-b border-border-soft py-3.5 last:border-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <Link
                          href={`/stocks/${r.symbol}`}
                          className="text-[15px] font-bold text-text"
                        >
                          {r.name}
                        </Link>
                        <SymbolCode symbol={r.symbol} className="text-[12px] text-text-mute" />
                        {horizonLabel(r.horizon) && (
                          <span className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent">
                            {horizonLabel(r.horizon)}
                          </span>
                        )}
                        {r.reselects != null && r.reselects > 1 && (
                          <span className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                            {r.reselects}일 선정
                          </span>
                        )}
                      </div>
                      <p className="tnum mt-1 text-[12px] text-text-mute">{r.as_of} 발행</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`tnum text-[17px] font-bold ${
                          r.return_pct == null
                            ? "text-text-mute"
                            : r.return_pct >= 0
                              ? "text-good"
                              : "text-bad"
                        }`}
                      >
                        {r.return_pct != null ? fmtPct(r.return_pct) : "—"}
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-[999px] px-2.5 py-0.5 text-[11px] font-bold ${STATUS_BADGE[r.status]}`}
                      >
                        {r.status}
                        {!r.closed && r.status !== "진행중" && r.status !== "—" ? " (예정)" : ""}
                      </span>
                    </div>
                  </div>
                  <dl className="tnum mt-2.5 flex flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px]">
                    <span>
                      <dt className="inline text-text-mute">진입 </dt>
                      <dd className="inline font-semibold text-text">{fmtPrice(r.entry_price)}</dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">{r.closed ? "청산 " : "현재 "}</dt>
                      <dd className="inline font-semibold text-text">{fmtPrice(r.last_close)}</dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">손절 </dt>
                      <dd className="inline font-semibold text-bad">{fmtPrice(r.stop_loss)}</dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">목표 </dt>
                      <dd className="inline font-semibold text-good">{fmtPrice(r.target_price)}</dd>
                    </span>
                  </dl>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                    <th className="py-2 pl-1 text-left font-medium">종목</th>
                    <th className="px-3 py-2 text-left font-medium">발행일</th>
                    <th className="px-3 py-2 text-right font-medium">진입가</th>
                    {/* 진행중이면 최신 종가, 끝난 픽이면 실제 청산가. 수익률이 «무엇
                        대비 무엇인지»를 이 열이 말해 준다 — 없으면 숫자만 남는다. */}
                    <th className="px-3 py-2 text-right font-medium">현재가</th>
                    <th
                      className="px-3 py-2 text-right font-medium"
                      title="여기에 닿으면 팔지 않고 손절선이 «고점 − 1R» 을 따라 올라갑니다"
                    >
                      목표가
                    </th>
                    <th className="px-3 py-2 text-right font-medium">손절가</th>
                    <th className="px-3 py-2 text-right font-medium">수익률</th>
                    <th className="px-3 py-2 text-right font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.as_of}-${r.symbol}-${i}`} className="border-b border-border/50 last:border-0 hover:bg-surface-2">
                      <td className="py-2.5 pl-1">
                        <Link href={`/stocks/${r.symbol}`} className="font-medium text-text hover:text-accent">
                          {r.name}
                        </Link>
                        <SymbolCode symbol={r.symbol} className="ml-2 text-2xs text-text-mute" />
                        {/* 기간 칩 — 위의 「기간별 성과」와 이 줄을 잇는 유일한 표시다.
                            없으면 어느 행이 어느 기간에 들어가는지 알 수 없다.
                            «최대 N거래일»을 같이 적는다 — 만기가 아니라 상한이라서,
                            그 전에 끝난 청산(손절·추격)을 이상하게 읽지 않도록. */}
                        {horizonLabel(r.horizon) && (
                          <span
                            className="ml-2 rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent"
                            title={`보유 상한 ${horizonSpec(r.horizon)?.bars ?? "?"}거래일 — 손절·추격 스톱에 걸리면 그 전에 끝납니다`}
                          >
                            {horizonLabel(r.horizon)}
                          </span>
                        )}
                        {r.reselects != null && r.reselects > 1 && (
                          <span
                            className="ml-2 rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-accent"
                            title={`최초 진입 후 ${r.reselects}일 연속 기준 통과 — 하나의 포지션으로 집계`}
                          >
                            {r.reselects}일 선정
                          </span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2.5 text-left text-text-dim">{r.as_of}</td>
                      <td className="tnum px-3 py-2.5 text-right text-text">{fmtPrice(r.entry_price)}</td>
                      <td
                        className={`tnum px-3 py-2.5 text-right ${r.closed ? "text-text-dim" : "text-text"}`}
                        title={r.closed ? "청산가 — 실제로 나간 가격" : "최신 종가 (장중 실시간 아님)"}
                      >
                        {fmtPrice(r.last_close)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-good">{fmtPrice(r.target_price)}</td>
                      <td className="tnum px-3 py-2.5 text-right text-bad">{fmtPrice(r.stop_loss)}</td>
                      <td
                        className={`tnum px-3 py-2.5 text-right font-bold ${
                          r.return_pct == null ? "text-text-mute" : r.return_pct >= 0 ? "text-good" : "text-bad"
                        }`}
                      >
                        {r.return_pct != null ? fmtPct(r.return_pct) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`rounded-[999px] px-2.5 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status]}`}>
                          {r.status}
                          {!r.closed && r.status !== "진행중" && r.status !== "—" ? " (예정)" : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          <p className="mt-3 text-[11px] text-text-mute">
            진행중 픽은 매일 16:30 종가로 평가 — 목표·손절 도달 시 자동 확정되며, &quot;(예정)&quot;은 종가 확정 배치 전 상태입니다.
            같은 종목의 연속 재선정은 <span className="text-text-dim">하나의 포지션</span>으로 합산합니다(진행중·종결 공통, &quot;N일 선정&quot;) — 청산 후 다시 픽되면 별개 거래. 손익·손절률 중복집계 방지.
          </p>
        </section>

        {/* ── 옛 규칙 기록 ──
            지우지 않는다. 「틀린 것도 남긴다」가 이 제품의 약속이고, 43건은 실제로
            사고판 기록이다. 다만 **지금 규칙의 성적표 안에 섞지 않는다** — 섞으면
            지금 발행되는 픽의 성적으로 읽힌다(2026-08-25).
            숫자를 여기서 미리 보여 주는 이유: 「보기」를 눌러야만 알 수 있으면 그것도
            감추는 것이다. 크기만 접고 사실은 접지 않는다. */}
        {!legacyView && legacy.length > 0 && (
          <section className="rounded-[12px] border border-dashed border-border-strong bg-surface-2 px-5 py-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h2 className="text-[13px] font-bold text-text">
                옛 규칙 기록 {legacy.length}건
              </h2>
              <span className="text-[11.5px] text-text-mute">
                2026년 8월 22일 규칙 교체 이전 · 지금 성적에 넣지 않습니다
              </span>
            </div>
            {(() => {
              const done = legacy.filter(
                (r) => r.closed && r.return_pct != null && r.status !== "규칙 교체 정리",
              );
              const won = done.filter((r) => (r.return_pct ?? 0) > 0);
              const mean =
                done.length > 0
                  ? done.reduce((a, r) => a + (r.return_pct ?? 0), 0) / done.length
                  : null;
              return (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
                  <span className="tnum text-text-dim">
                    끝난 거래 {done.length}건
                  </span>
                  <span className="tnum text-text-dim">
                    승률{" "}
                    {done.length > 0
                      ? `${((won.length / done.length) * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                  <span
                    className={`tnum font-semibold ${
                      mean == null ? "text-text-mute" : mean >= 0 ? "text-good" : "text-bad"
                    }`}
                  >
                    평균 {mean == null ? "—" : fmtPct(mean)}
                  </span>
                  <Link
                    href="/picks?gen=legacy"
                    className="ml-auto font-semibold text-accent hover:underline"
                  >
                    옛 규칙 기록 보기 →
                  </Link>
                </p>
              );
            })()}
          </section>
        )}
      </div>
    </AppShell>
  );
}
