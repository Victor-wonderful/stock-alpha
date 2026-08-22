import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { BackfillTrackRecord } from "@/components/BackfillTrackRecord";
import {
  getPickHistory,
  getResimHorizonStats,
  NON_TRADE_PICK_STATUSES,
  type PickRecord,
} from "@/lib/data";
import { HORIZONS, horizonLabel } from "@/lib/holding";
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
  진행중: "bg-warn-soft text-warn",
  만료: "bg-surface-3 text-text-dim",
  "—": "bg-surface-3 text-text-mute",
};

const FILTERS = ["전체", "진입 대기", "진행중", "목표 도달", "손절", "만료", "미체결"] as const;

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filter = sp.status && FILTERS.includes(sp.status as (typeof FILTERS)[number])
    ? sp.status
    : "전체";

  const [history, resim] = await Promise.all([
    getPickHistory(500),
    getResimHorizonStats(),
  ]);
  const all = history.data;
  const rows = filter === "전체" ? all : all.filter((r) => r.status === filter);

  // 요약 집계 — 전체 발행 기준 (필터와 무관)
  //
  // ⚠️ 비율의 «분모»는 발행 건수가 아니라 «거래가 된 건수»다. 진입을 다음 거래일
  // 시가로 바꾼 뒤(2026-08-21) 픽은 발행 즉시 거래가 아니다 — 하루는 진입 대기고,
  // 갭으로 진입 조건이 무너지면 아예 안 산다(취소). 옛 지정가 픽의 미체결도 같다.
  // 이것들을 분모에 넣으면 손절률이 실제보다 낮아 보인다.
  const traded = all.filter((r) => !NON_TRADE_PICK_STATUSES.has(r.status));
  const pending = all.filter((r) => r.status === "진입 대기");
  const closedTarget = all.filter((r) => r.status === "목표 도달");
  const closedStop = all.filter((r) => r.status === "손절");
  const inProgress = all.filter((r) => r.status === "진행중");
  const closed = all.filter((r) => r.closed && r.return_pct != null);
  const avgClosed =
    closed.length > 0
      ? closed.reduce((a, r) => a + (r.return_pct ?? 0), 0) / closed.length
      : null;
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
      subtitle="발행한 모든 픽의 트랙레코드 — 다음 거래일 시가 진입 · 종가 기준 자동 확정 (목표 / 손절 / 만료 30일)"
    >
      <div className="space-y-4">
        {/* 요약 스탯 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
              label: "목표 달성",
              value: `${closedTarget.length}건${traded.length ? ` (${Math.round((closedTarget.length / traded.length) * 100)}%)` : ""}`,
              sub: avg(closedTarget) != null ? `평균 ${fmtPct(avg(closedTarget))}` : undefined,
              color: "text-good",
            },
            {
              label: "손절",
              value: `${closedStop.length}건${traded.length ? ` (${Math.round((closedStop.length / traded.length) * 100)}%)` : ""}`,
              sub: avg(closedStop) != null ? `평균 ${fmtPct(avg(closedStop))}` : undefined,
              color: "text-bad",
            },
            {
              label: "진행중 (미실현)",
              value: avg(inProgress) != null ? fmtPct(avg(inProgress)) : "—",
              sub: `${inProgress.length}건 보유 중 · 현재가 기준`,
              color:
                avg(inProgress) == null
                  ? "text-text"
                  : avg(inProgress)! >= 0
                    ? "text-good"
                    : "text-bad",
            },
            {
              label: "확정 픽 평균 수익률",
              value: avgClosed != null ? fmtPct(avgClosed) : "—",
              sub: "만료 포함 · 확정 기준",
              color: avgClosed != null && avgClosed >= 0 ? "text-good" : "text-bad",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="flex flex-col gap-1 rounded-[12px] border border-border bg-surface px-4 py-3.5">
              <span className="text-[11px] text-text-mute">{label}</span>
              <span className={`tnum text-xl font-extrabold leading-none ${color}`}>{value}</span>
              {sub && <span className="text-[11px] text-text-mute">{sub}</span>}
            </div>
          ))}
        </div>

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
                const won = rows.filter((r) => r.status === "목표 도달");
                const lost = rows.filter((r) => r.status === "손절");
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
                      <span className="text-text-mute">아직 발행 없음</span>
                    ) : (
                      <>
                        <span className="tnum text-text-dim">발행 {rows.length}건</span>
                        <span className="tnum text-text-dim">거래 {tr.length}건</span>
                        <span className="tnum text-good">목표 {won.length}</span>
                        <span className="tnum text-bad">손절 {lost.length}</span>
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
              {all.filter((r) => !r.horizon).length > 0 && (
                <div className="px-4 py-3 text-[11px] text-text-mute">
                  기간 도입(2026-08-22) 전 발행 {all.filter((r) => !r.horizon).length}건은
                  기간 구분이 없어 위 집계에서 빠집니다 — 전체 통계에는 포함됩니다.
                </div>
              )}
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
                        <span className="tnum text-text-dim">진행중 {st.open}</span>
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
              위아래 모두 같은 방식으로 중복(보유 중 재선정)을 합쳐 셉니다.
            </div>
          </div>
        )}

        {/* 상태 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "전체" ? "/picks" : `/picks?status=${encodeURIComponent(f)}`}
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                    <th className="py-2 pl-1 text-left font-medium">종목</th>
                    <th className="px-3 py-2 text-left font-medium">발행일</th>
                    <th className="px-3 py-2 text-right font-medium">진입가</th>
                    <th className="px-3 py-2 text-right font-medium">목표가</th>
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
                        <span className="mono ml-2 text-2xs text-text-mute">{r.symbol}</span>
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
          )}
          <p className="mt-3 text-[11px] text-text-mute">
            진행중 픽은 매일 16:30 종가로 평가 — 목표·손절 도달 시 자동 확정되며, &quot;(예정)&quot;은 종가 확정 배치 전 상태입니다.
            같은 종목의 연속 재선정은 <span className="text-text-dim">하나의 포지션</span>으로 합산합니다(진행중·종결 공통, &quot;N일 선정&quot;) — 청산 후 다시 픽되면 별개 거래. 손익·손절률 중복집계 방지.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
