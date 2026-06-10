import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { DiagnosisForm } from "@/components/DiagnosisForm";
import { Panel, Stat } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getPortfolioDiagnosis, type HoldingInput } from "@/lib/data";
import { fmtNum, fmtPct } from "@/lib/format";

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

export default async function DiagnosisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const items = parseHoldings(sp.h);
  const diag = items.length > 0 ? await getPortfolioDiagnosis(items) : null;

  return (
    <AppShell
      title="포트폴리오 진단"
      subtitle="보유 종목을 시스템 잣대(판정·팩터·리스크)로 점검 — 자동화된 일반 분석"
    >
      <div className="space-y-4">
        <Panel title="보유 종목 입력">
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

            {/* 종목별 진단 */}
            <Panel title="종목별 진단">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                      <th className="py-2 pl-1 text-left font-medium">종목</th>
                      <th className="px-3 py-2 text-right font-medium">비중</th>
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
