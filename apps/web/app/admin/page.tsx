import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";

import { AdminShell } from "@/components/AdminShell";
import {
  getAdminStats,
  getEngineStatus,
  getExpertApplications,
  getMembers,
  isAdmin,
  type EngineItem,
} from "@/lib/admin";
import {
  getMarketState,
  getOpenPicks,
  getPickHistory,
  getTradingCalendar,
  NON_TRADE_PICK_STATUSES,
} from "@/lib/data";
import { fmtPct } from "@/lib/format";
import { horizonLabel } from "@/lib/holding";

/**
 * 관리 홈 — 운영자가 **매일 한 번 여는 화면**.
 *
 * 2026-08-25 첫 판은 회원 숫자와 전문가 신청뿐이었다(그 하나 때문에 급히 만들었다).
 * 2026-09-14 Victor: "관리자 페이지 대시보드가 이렇게 밖에 안되나?" — 운영자가 아침에
 * 알고 싶은 것은 세 가지다:
 *
 *   1. 엔진이 어젯밤 제대로 돌았나  → 엔진 상태판(산출물별 최신일 vs 기준일)
 *   2. 픽이 어떻게 되고 있나        → 열린 픽 · 최근 청산
 *   3. 사람이 들어오고 있나          → 회원 DB(목록·CSV) · 기다리는 일
 *
 * 그리고 DB 용량 — 차면 배치가 조용히 죽는데 어디에도 안 보였다.
 *
 * 크기가 고정이어야 한다. 회원이 1,000명이 되어도 이 화면의 길이는 같아야 하고,
 * 늘어나는 목록은 자기 페이지를 갖는다(/members, 성과는 회원 사이트의 /picks).
 *
 * 운영자가 아니면 404 — 관리 호스트의 세션은 전부 운영자 로그인을 거친 것이지만
 * 한 번 더 본다. 제목은 admin/layout 이 정한다.
 */

/** Supabase 요금제 상한 — 대시보드 상단이 PRO 다(2026-09-14 확인). 바꾸면 여기만. */
const DB_PLAN_BYTES = 8 * 1024 ** 3;
const DB_PLAN_LABEL = "Supabase Pro 8GB";

const REGIME_LABEL: Record<string, string> = {
  uptrend: "상승추세",
  downtrend: "하락추세",
  range: "횡보",
};

function md(iso: string | null | undefined): string {
  return iso ? iso.slice(5, 10).replace("-", ".") : "—";
}

function gb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(2) + " GB";
}

export default async function AdminHomePage() {
  if (!(await isAdmin())) notFound();

  const cal = await getTradingCalendar();
  const [stats, members, apps, engine, openPicks, history, market] = await Promise.all([
    getAdminStats(),
    getMembers(null, 3),
    getExpertApplications(),
    getEngineStatus(cal.nth),
    getOpenPicks(30),
    getPickHistory(40),
    getMarketState(),
  ]);
  const pending = apps.filter((a) => a.status === "pending");

  // 최근 청산 — 실제 거래였던 것만(진입 대기·미체결·취소는 거래가 아니다).
  const recentClosed = history.data
    .filter((p) => p.closed && !NON_TRADE_PICK_STATUSES.has(p.status))
    .sort((a, b) => (b.closed_at ?? b.as_of).localeCompare(a.closed_at ?? a.as_of))
    .slice(0, 3);

  const publishedToday = engine?.items.find((i) => i.key === "daily_focus");
  const problems = (engine?.items ?? []).filter(
    (i) => i.state === "late" || i.state === "stalled",
  );
  const regime = market?.market_state
    ? (REGIME_LABEL[market.market_state] ?? market.market_state)
    : "—";

  return (
    <AdminShell
      title="관리"
      subtitle={
        engine?.basis
          ? `기준일 ${engine.basis.replace(/-/g, ".")} — 시세의 마지막 거래일입니다. 모든 «정상/지연»은 이 날짜 기준입니다.`
          : "운영자만 보는 화면입니다."
      }
      stats={[
        { label: "회원", value: `${stats?.members ?? 0}` },
        { label: "7일 가입", value: `${stats?.members7d ?? 0}` },
        {
          label: "대기 신청",
          value: `${stats?.pendingApps ?? 0}`,
          tone: (stats?.pendingApps ?? 0) > 0 ? ("accent" as const) : undefined,
        },
        { label: "열린 픽", value: `${openPicks.length}` },
        { label: "기준일 발행", value: `${publishedToday?.n ?? 0}` },
        {
          label: "국면",
          value: regime,
          tone:
            market?.market_state === "uptrend"
              ? ("good" as const)
              : market?.market_state === "downtrend"
                ? ("bad" as const)
                : undefined,
        },
      ]}
    >
      {/* ── 1행: 엔진 상태판 · 픽 ── */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text">엔진 상태판</h2>
            <span className="text-[11px] text-text-mute">
              {problems.length === 0
                ? "모든 산출물이 기준일까지 들어왔습니다"
                : `${problems.length}개 산출물이 늦습니다`}
            </span>
          </div>
          {!engine ? (
            <p className="py-6 text-center text-[12.5px] text-text-mute">
              상태를 읽지 못했습니다. DB 함수(admin_engine_status)가 적용됐는지 확인하세요.
            </p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] text-text-mute">
                  <th className="pb-1.5 text-left font-medium">산출물</th>
                  <th className="pb-1.5 text-left font-medium">최신일</th>
                  <th className="pb-1.5 text-right font-medium">그날 건수</th>
                  <th className="pb-1.5 text-right font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {engine.items.map((it) => (
                  <EngineRow key={it.key} item={it} />
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 border-t border-border-soft pt-3 text-[11px] leading-relaxed text-text-mute">
            기준일보다 1거래일 늦으면 「지연」, 2거래일 이상이면 「멈춤」. 주말·휴장일은
            기준일 자체가 멈추므로 거짓 경보가 나지 않습니다. 배치 로그는 운영 PC 의
            <code className="mx-1 rounded bg-surface-2 px-1">logs/worker-YYYYMMDD.log</code>에
            있습니다.
          </p>
        </section>

        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text">열린 픽</h2>
            <span className="text-[11px] text-text-mute">종가 기준 · 회원 사이트 성과 화면과 같은 값</span>
          </div>
          {openPicks.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-text-mute">열린 픽이 없습니다.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] text-text-mute">
                  <th className="pb-1.5 text-left font-medium">종목</th>
                  <th className="pb-1.5 text-left font-medium">기간</th>
                  <th className="pb-1.5 text-right font-medium">수익률</th>
                  <th className="pb-1.5 text-right font-medium">손절까지</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {openPicks.slice(0, 6).map((p) => (
                  <tr key={`${p.symbol}-${p.asOf}`}>
                    <td className="py-1.5 font-semibold text-text">
                      {p.name}
                      <span className="ml-1.5 font-mono text-[10.5px] font-normal text-text-mute">
                        {p.symbol}
                      </span>
                    </td>
                    <td className="py-1.5 text-text-dim">{horizonLabel(p.horizon) ?? "—"}</td>
                    <td
                      className={`tnum py-1.5 text-right font-semibold ${
                        p.returnPct == null
                          ? "text-text-mute"
                          : p.returnPct >= 0
                            ? "text-good"
                            : "text-bad"
                      }`}
                    >
                      {p.returnPct != null ? fmtPct(p.returnPct) : "—"}
                    </td>
                    <td className="tnum py-1.5 text-right text-text-dim">
                      {p.toStopPct != null ? fmtPct(p.toStopPct) : "—"}
                    </td>
                  </tr>
                ))}
                {openPicks.length > 6 && (
                  <tr>
                    <td colSpan={4} className="py-1.5 text-[11.5px] text-text-mute">
                      외 {openPicks.length - 6}건
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          <h3 className="mb-1.5 mt-4 text-[12px] font-bold text-text">최근 청산</h3>
          {recentClosed.length === 0 ? (
            <p className="text-[12px] text-text-mute">아직 청산된 픽이 없습니다.</p>
          ) : (
            <ul className="space-y-1 text-[12px]">
              {recentClosed.map((p) => (
                <li key={`${p.symbol}-${p.as_of}`} className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-text-mute">
                    {md(p.closed_at ?? p.as_of)}
                  </span>
                  <span className="font-semibold text-text">{p.name}</span>
                  <span className="text-text-dim">{p.status}</span>
                  <span
                    className={`tnum ml-auto font-semibold ${
                      p.return_pct == null
                        ? "text-text-mute"
                        : p.return_pct >= 0
                          ? "text-good"
                          : "text-bad"
                    }`}
                  >
                    {p.return_pct != null ? fmtPct(p.return_pct) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── 2행: 회원 DB · 기다리는 일 · DB 용량 ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_0.8fr]">
        {/* 회원 DB — 「가입한 사람을 내가 직접 보고 CSV 로 받는다」(2026-09-14 Victor).
            목록 화면과 CSV 는 8/25 부터 있었지만 여기서 안 보였다. 버튼 두 개를 앞으로 낸다. */}
        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text">회원 DB</h2>
            <span className="text-[11px] text-text-mute">
              오늘 {stats?.membersToday ?? 0} · 7일 {stats?.members7d ?? 0} · 전문가{" "}
              {stats?.experts ?? 0}
            </span>
          </div>
          {members.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-text-mute">
              아직 가입한 회원이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border-soft">
              {members.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2.5 py-2">
                  <span className="text-[13px] font-semibold text-text">
                    {m.displayName ?? "이름 없음"}
                  </span>
                  {!m.emailConfirmed && (
                    <span className="rounded-[999px] bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn">
                      메일 미확인
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11.5px] text-text-mute">
                    {md(m.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border-soft pt-3">
            <Link
              href="/members"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
            >
              회원 전체 보기
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <a
              href="/members/export"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-[12px] font-semibold text-text-dim transition-colors hover:text-text"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              CSV 다운로드
            </a>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-mute">
            CSV 에는 닉네임·이메일·연락처·가입일·메일확인·전문가·약관동의 시각이 들어갑니다.
            엑셀에서 바로 열립니다.
          </p>
        </section>

        {/* 기다리는 일 — 알림이 없으니 이 자리가 그 역할을 한다. 0 이면 0 이라고 적는다. */}
        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          <h2 className="mb-3 text-sm font-bold text-text">기다리는 일</h2>
          <ul className="divide-y divide-border-soft">
            <Todo
              label="전문가 신청"
              count={pending.length}
              href="/experts"
              hint={pending.length > 0 ? pending.map((p) => p.name).join(" · ") : null}
            />
            <Todo
              label="메일 미확인 회원"
              count={stats?.unconfirmed ?? 0}
              href="/members?filter=unconfirmed"
              hint={null}
            />
            <Todo
              label="늦은 산출물"
              count={problems.length}
              href="/"
              hint={
                problems.length > 0
                  ? problems.map((p) => `${p.label} ${p.lag}일`).join(" · ")
                  : null
              }
              tone={problems.some((p) => p.state === "stalled") ? "bad" : "warn"}
            />
          </ul>
          <p className="mt-4 border-t border-border-soft pt-3 text-[11.5px] leading-relaxed text-text-mute">
            알림은 아직 없습니다 — 이 화면을 열어야 압니다. 텔레그램 알림은 별건으로 붙입니다.
          </p>
        </section>

        {/* DB 용량 — 차면 배치가 조용히 죽는다. 시세(일봉)가 대부분을 차지한다. */}
        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          <h2 className="mb-1 text-sm font-bold text-text">DB 용량</h2>
          <p className="text-[11.5px] text-text-mute">{DB_PLAN_LABEL}</p>
          {engine?.dbBytes ? (
            <DbGauge bytes={engine.dbBytes} ohlcvBytes={engine.ohlcvBytes} />
          ) : (
            <p className="mt-3 text-[12px] text-text-mute">용량을 읽지 못했습니다.</p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function DbGauge({ bytes, ohlcvBytes }: { bytes: number; ohlcvBytes: number | null }) {
  const ratio = Math.min(1, bytes / DB_PLAN_BYTES);
  const bar = ratio >= 0.9 ? "bg-bad" : ratio >= 0.7 ? "bg-warn" : "bg-accent";
  return (
    <>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
      </div>
      <p className="tnum mt-2 text-[13px] text-text">
        <span className="font-bold">{gb(bytes)}</span>
        <span className="text-text-mute">
          {" "}
          / {gb(DB_PLAN_BYTES)} · {Math.round(ratio * 100)}%
        </span>
      </p>
      {ohlcvBytes != null && (
        <p className="mt-1 text-[11.5px] text-text-mute">
          시세(일봉)가 {gb(ohlcvBytes)} — 전체의 {Math.round((ohlcvBytes / bytes) * 100)}%
        </p>
      )}
    </>
  );
}

function EngineRow({ item }: { item: EngineItem }) {
  const badge =
    item.state === "ok"
      ? ["bg-good-soft text-good", "정상"]
      : item.state === "late"
        ? ["bg-warn-soft text-warn", "지연 1일"]
        : item.state === "stalled"
          ? ["bg-bad-soft text-bad", `멈춤 ${item.lag}일`]
          : ["bg-surface-3 text-text-mute", "—"];
  return (
    <tr>
      <td className="py-1.5 font-semibold text-text">{item.label}</td>
      <td className="py-1.5 font-mono text-[11.5px] text-text-dim">{md(item.latest)}</td>
      <td className="tnum py-1.5 text-right text-text-dim">{item.n.toLocaleString("ko-KR")}</td>
      <td className="py-1.5 text-right">
        <span className={`rounded-[999px] px-2 py-0.5 text-[10.5px] font-semibold ${badge[0]}`}>
          {badge[1]}
        </span>
      </td>
    </tr>
  );
}

function Todo({
  label,
  count,
  href,
  hint,
  tone = "accent",
}: {
  label: string;
  count: number;
  href: string;
  hint: string | null;
  tone?: "accent" | "warn" | "bad";
}) {
  const has = count > 0;
  const pill = !has
    ? "bg-surface-3 text-text-mute"
    : tone === "bad"
      ? "bg-bad-soft text-bad"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : "bg-accent text-text-on-accent";
  return (
    <li className="py-2.5">
      <Link href={href} className="group flex items-baseline gap-2.5">
        <span className="text-[13px] font-semibold text-text">{label}</span>
        <span className={`rounded-[999px] px-2 py-0.5 text-[11px] font-bold ${pill}`}>{count}</span>
        {hint && <span className="min-w-0 flex-1 truncate text-[12px] text-text-dim">{hint}</span>}
        <ArrowRight
          className="ml-auto h-3.5 w-3.5 shrink-0 text-text-mute transition-colors group-hover:text-accent"
          aria-hidden
        />
      </Link>
    </li>
  );
}
