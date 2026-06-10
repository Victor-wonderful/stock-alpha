import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { EmptyState, Panel } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getReports } from "@/lib/data";
import { fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

function ratingVariant(rating: string | null) {
  if (rating === "매수") return "bull" as const;
  if (rating === "거래 부적합") return "bear" as const;
  if (rating === "관망") return "warn" as const;
  return "neutral" as const;
}

export default async function ReportsPage() {
  const { data: reports } = await getReports(100);

  return (
    <AppShell title="리포트" subtitle="AI 애널리스트 — 판정·게이트·실행플랜">
      {reports.length === 0 ? (
        <EmptyState message="발행된 리포트가 없습니다. 엔진에서 `report indepth` 실행 시 여기에 게시됩니다." />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`} className="block">
              <Panel className="transition-colors hover:border-border-strong">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={ratingVariant(r.rating)} size="md">
                        {r.rating ?? "—"}
                      </Badge>
                      <h3 className="truncate text-sm font-semibold text-text">
                        {r.title}
                      </h3>
                    </div>
                    {r.summary && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-text-dim">
                        {r.summary}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {r.target_price != null && (
                      <p className="tnum text-sm font-semibold text-text">
                        목표 {fmtPrice(r.target_price)}원
                      </p>
                    )}
                    <p className="mt-0.5 text-2xs text-text-mute">
                      {r.symbol ?? ""} · {r.as_of}
                    </p>
                  </div>
                </div>
              </Panel>
            </Link>
          ))}
          <p className="text-2xs text-text-mute">
            본 리포트는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고
            정보이며, 투자 판단의 책임은 투자자 본인에게 있습니다.
          </p>
        </div>
      )}
    </AppShell>
  );
}
