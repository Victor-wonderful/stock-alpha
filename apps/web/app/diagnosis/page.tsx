import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { DiagnosisForm } from "@/components/DiagnosisForm";
import { Panel, Stat } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getPortfolioDiagnosis, type HoldingInput } from "@/lib/data";
import { fmtNum, fmtPct, fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

// ?h=005930:30,000660:20 → [{symbol, weight(0~1 정규화)}]
function parseHoldings(h: string | undefined): HoldingInput[] {
  if (!h) return [];
  const raw = h
    .split(",")
    .map((t) => t.split(":"))
    .filter((p) => p[0]?.trim())
    .map(([symbol, w]) => ({
      symbol: symbol.trim(),
      weight: Math.max(0, Number(w) || 0),
    }));
  const total = raw.reduce((a, r) => a + r.weight, 0);
  // 비중 미입력(전부 0)이면 동일가중, 아니면 합 100% 로 정규화
  return raw.map((r) => ({
    symbol: r.symbol,
    weight: total > 0 ? r.weight / total : 1 / raw.length,
  }));
}

function ratingVariant(rating: string | null) {
  if (rating === "매수") return "bull" as const;
  if (rating === "거래 부적합") return "bear" as const;
  if (rating === "관망") return "warn" as const;
  return "neutral" as const;
}

// ── 종합 등급 — 알파/분산/베타 3축 단순 산식 (자동화된 일반 분석)
function computeGrade(d: {
  weighted_alpha: number | null;
  weighted_beta: number | null;
  top_sector: { sector: string; weight: number } | null;
}): { grade: string; checks: { ok: boolean; text: string }[] } {
  const checks = [
    {
      ok: (d.weighted_alpha ?? 0) > 0.3,
      text:
        d.weighted_alpha != null
          ? `가중 합성알파 ${d.weighted_alpha.toFixed(2)}σ — ${d.weighted_alpha > 0.3 ? "시스템 선호 구간" : "선호 신호 약함"}`
          : "합성알파 데이터 없음",
    },
    {
      ok: (d.top_sector?.weight ?? 0) < 0.4,
      text: d.top_sector
        ? `최대 섹터(${d.top_sector.sector}) ${(d.top_sector.weight * 100).toFixed(0)}% — ${d.top_sector.weight < 0.4 ? "분산 양호" : "집중 — 분산 보강 필요"}`
        : "섹터 정보 없음",
    },
    {
      ok: (d.weighted_beta ?? 1) < 1.1,
      text:
        d.weighted_beta != null
          ? `가중 베타 ${d.weighted_beta.toFixed(2)} — ${d.weighted_beta < 1.1 ? "시장 수준 변동" : "시장보다 변동 큼"}`
          : "베타 데이터 없음",
    },
  ];
  const n = checks.filter((c) => c.ok).length;
  const grade = n === 3 ? "A-" : n === 2 ? "B+" : n === 1 ? "B-" : "C";
  return { grade, checks };
}

const DONUT_COLORS = ["var(--accent)", "#9CA0A8", "var(--good)", "var(--warn)", "var(--surface-3)", "#6B7280"];

// SVG 도넛 — 섹터 비중 (CSS 변수 색)
function SectorDonut({ sectors }: { sectors: { sector: string; weight: number }[] }) {
  const top = sectors.slice(0, 5);
  const rest = sectors.slice(5).reduce((a, s) => a + s.weight, 0);
  const segs = rest > 0 ? [...top, { sector: "기타", weight: rest }] : top;
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-7">
      <div className="relative h-[140px] w-[140px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          {segs.map((s, i) => {
            const len = s.weight * C;
            const el = (
              <circle
                key={s.sector}
                cx="70" cy="70" r={R}
                fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth="16"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-xl font-extrabold text-text">
            {segs[0] ? `${(segs[0].weight * 100).toFixed(0)}%` : "—"}
          </span>
          <span className="text-[9px] text-text-mute">최대 섹터</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {segs.map((s, i) => (
          <div key={s.sector} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs text-text">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              {s.sector}
            </span>
            <span className="tnum text-xs font-bold text-text">
              {(s.weight * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 개선 권장 액션 — 진단 결과 조건부 (투자 권유 아님)
function buildActions(d: {
  weighted_beta: number | null;
  top_sector: { sector: string; weight: number } | null;
  holdings: { rating: string | null; name: string; report_id: number | null }[];
}): { icon: string; title: string; body: string; href: string; link: string }[] {
  const acts: { icon: string; title: string; body: string; href: string; link: string }[] = [];
  if ((d.top_sector?.weight ?? 0) >= 0.4 && d.top_sector)
    acts.push({
      icon: "◔",
      title: "분산 보강",
      body: `${d.top_sector.sector} 비중 ${(d.top_sector.weight * 100).toFixed(0)}% — 비상관 업종 1~2종 추가를 검토하세요.`,
      href: "/focus",
      link: "관련 픽 보기",
    });
  if ((d.weighted_beta ?? 0) > 1.1)
    acts.push({
      icon: "〜",
      title: "베타 관리",
      body: `가중 베타 ${d.weighted_beta!.toFixed(2)} — 고베타 종목 비중을 줄이면 변동이 완화됩니다.`,
      href: "/market",
      link: "시장 레짐 확인",
    });
  const buys = d.holdings.filter((h) => h.rating === "매수");
  if (buys.length > 0)
    acts.push({
      icon: "🛡",
      title: "손절 라인 점검",
      body: `매수 판정 ${buys.length}종목(${buys.map((h) => h.name).slice(0, 2).join("·")}${buys.length > 2 ? " 외" : ""}) — 리포트 실행 플랜의 손절가를 확인하세요.`,
      href: buys[0].report_id ? `/reports/${buys[0].report_id}` : "/reports",
      link: "리포트 보기",
    });
  const noReport = d.holdings.filter((h) => !h.rating).length;
  if (noReport > 0)
    acts.push({
      icon: "📄",
      title: "분석 공백",
      body: `리포트 없는 종목 ${noReport}개 — 판정·게이트 점검 없이 보유 중입니다.`,
      href: "/reports",
      link: "종목 분석으로",
    });
  return acts.slice(0, 4);
}

export default async function DiagnosisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const items = parseHoldings(sp.h);
  const diag = items.length > 0 ? await getPortfolioDiagnosis(items) : null;

  const grade = diag ? computeGrade(diag) : null;
  const actions = diag ? buildActions(diag) : [];

  return (
    <AppShell
      title="종목진단"
      subtitle="보유 중이거나 매수 검토 중인 조합을 입력하면 — 종목별 판정과 포트폴리오 리스크를 함께 진단합니다"
      badge={
        <span className="rounded-[999px] border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold text-text-dim">
          🛡 입력 내용은 저장되지 않습니다
        </span>
      }
    >
      <div className="space-y-4">
        <Panel title="종목 입력 — 보유 중이든, 매수 검토 중이든">
          <DiagnosisForm />
        </Panel>

        {diag && (
          <>
            {diag.notFound.length > 0 && (
              <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                찾지 못했거나 이름이 여러 종목과 겹칩니다: {diag.notFound.join(", ")} —
                정확한 종목명 또는 6자리 코드로 입력해 주세요.
              </p>
            )}

            {/* 포트폴리오 요약 */}
            <Panel title="포트폴리오 요약">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="가중 합성알파"
                  value={fmtNum(diag.weighted_alpha, 2)}
                  tone={(diag.weighted_alpha ?? 0) >= 0 ? "bull" : "bear"}
                  sub="0보다 크면 시스템 선호"
                />
                <Stat
                  label="가중 베타"
                  value={fmtNum(diag.weighted_beta, 2)}
                  sub="1보다 크면 시장보다 출렁임"
                />
                <Stat
                  label="가중 연 변동성"
                  value={fmtPct(diag.weighted_vol)}
                />
                <Stat
                  label="최대 섹터 비중"
                  value={
                    diag.top_sector
                      ? `${(diag.top_sector.weight * 100).toFixed(0)}%`
                      : "—"
                  }
                  sub={diag.top_sector?.sector ?? undefined}
                />
              </div>
              {diag.warnings.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {diag.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs text-warn">
                      <span>⚠</span>
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* 종합 등급 + 섹터 배분 */}
            <div className="grid gap-4 lg:grid-cols-2">
              {grade && (
                <section className="rounded-[20px] border border-accent/50 bg-surface px-6 py-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-text">종합 등급</h2>
                    <span className="text-[11px] text-text-mute">알파 · 분산 · 리스크 3축 평가</span>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full border-2 border-accent bg-accent-soft">
                      <span className="tnum text-3xl font-extrabold text-accent">{grade.grade}</span>
                    </div>
                    <ul className="flex flex-1 flex-col gap-2">
                      {grade.checks.map((c, i) => (
                        <li key={i} className={`flex items-start gap-2 text-xs ${c.ok ? "text-text-dim" : "text-warn"}`}>
                          <span className={c.ok ? "text-good" : "text-warn"}>{c.ok ? "✓" : "⚠"}</span>
                          {c.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}
              {diag.sectors.length > 0 && (
                <section className="rounded-[20px] border border-border bg-surface px-6 py-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-text">섹터 배분</h2>
                    <span className="text-[11px] text-text-mute">비중 기준</span>
                  </div>
                  <SectorDonut sectors={diag.sectors} />
                </section>
              )}
            </div>

            {/* 종목별 진단 */}
            <Panel title="종목별 진단">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                      <th className="py-2 pl-1 text-left font-medium">종목</th>
                      <th className="px-3 py-2 text-right font-medium">비중</th>
                      <th className="px-3 py-2 text-right font-medium">현재가</th>
                      <th className="px-3 py-2 text-center font-medium">판정</th>
                      <th className="px-3 py-2 text-right font-medium">점수</th>
                      <th className="px-3 py-2 text-right font-medium">합성알파</th>
                      <th className="px-3 py-2 text-right font-medium">DCF 업사이드</th>
                      <th className="px-3 py-2 text-right font-medium">베타</th>
                      <th className="px-3 py-2 text-left font-medium">주의</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diag.holdings.map((h) => (
                      <tr
                        key={h.symbol}
                        className="border-b border-border/50 last:border-0 hover:bg-surface-2"
                      >
                        <td className="py-2.5 pl-1">
                          <Link
                            href={`/stocks/${h.symbol}`}
                            className="font-medium hover:text-accent"
                          >
                            {h.name}
                          </Link>
                          <span className="mono ml-2 text-2xs text-text-mute">
                            {h.symbol}
                          </span>
                        </td>
                        <td className="tnum px-3 py-2.5 text-right">
                          {(h.weight * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="mono">{fmtPrice(h.last_close)}</span>
                          {h.change_pct != null && (
                            <span
                              className={`tnum ml-1.5 text-2xs ${
                                h.change_pct >= 0 ? "text-bull" : "text-bear"
                              }`}
                            >
                              {fmtPct(h.change_pct)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {h.rating ? (
                            h.report_id ? (
                              <Link href={`/reports/${h.report_id}`}>
                                <Badge variant={ratingVariant(h.rating)} size="md">
                                  {h.rating}
                                </Badge>
                              </Link>
                            ) : (
                              <Badge variant={ratingVariant(h.rating)} size="md">
                                {h.rating}
                              </Badge>
                            )
                          ) : (
                            <span className="text-2xs text-text-mute">분석 없음</span>
                          )}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right">
                          {h.score != null ? `${h.score}점` : "—"}
                        </td>
                        <td
                          className={`mono px-3 py-2.5 text-right ${
                            (h.composite_alpha ?? 0) >= 0 ? "text-bull" : "text-bear"
                          }`}
                        >
                          {fmtNum(h.composite_alpha, 2)}
                        </td>
                        <td
                          className={`mono px-3 py-2.5 text-right ${
                            (h.upside_pct ?? 0) >= 0 ? "text-bull" : "text-bear"
                          }`}
                        >
                          {h.upside_pct != null
                            ? `${h.upside_pct.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="mono px-3 py-2.5 text-right">
                          {fmtNum(h.beta, 2)}
                        </td>
                        <td className="px-3 py-2.5 text-2xs text-warn">
                          {h.warnings.join(" · ") || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            {/* 개선 권장 액션 */}
            {actions.length > 0 && (
              <section>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <h2 className="text-sm font-bold text-text">개선 권장 액션</h2>
                  <span className="text-[11px] text-text-mute">
                    진단 결과 기반 — 투자 권유가 아닌 리스크 관리 제안
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {actions.map((a) => (
                    <div
                      key={a.title}
                      className="flex flex-col gap-2 rounded-[16px] border border-border bg-surface px-4 py-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[11px]">
                          {a.icon}
                        </span>
                        <span className="text-[13px] font-bold text-text">{a.title}</span>
                      </div>
                      <p className="flex-1 text-[11px] leading-relaxed text-text-dim">{a.body}</p>
                      <Link href={a.href} className="text-[11px] font-semibold text-accent hover:underline">
                        {a.link} →
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <p className="rounded-md border border-border bg-surface-2 p-3 text-2xs leading-relaxed text-text-mute">
          본 진단은 시스템이 전 종목에 동일하게 적용하는 자동화된 일반 분석이며,
          특정 개인의 사정을 고려한 맞춤형 투자자문이 아닙니다. 입력한 보유 내역은
          저장되지 않습니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게
          있습니다.
        </p>
      </div>
    </AppShell>
  );
}
