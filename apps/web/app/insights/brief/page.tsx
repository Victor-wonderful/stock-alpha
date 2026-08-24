import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { BriefRows } from "@/components/BriefArchive";
import { getMorningBriefs } from "@/lib/data";
import { tradingDayLabel } from "@/lib/format";

/**
 * 지난 브리프 전체 — 인사이트의 「매일 브리프」가 최근 12건만 세우고, 나머지는 여기로.
 *
 * 왜 목록을 따로 두나: 인사이트 한 장에 48행을 늘어놓으면 주간 브리핑·매크로·전문가
 * 추천이 화면 밖으로 밀린다. 그렇다고 최근 몇 건만 두고 끝내면 나머지는 다시 «없는 것»이
 * 된다(그게 이번에 고친 문제다). 미리보기는 페이지에, 전체는 여기에 둔다.
 */
export const metadata = {
  title: "지난 브리프 — VECTA Stock",
  description: "매 거래일 장 마감 뒤의 기록. 전망이 아니라 측정한 것만 적습니다.",
};

export default async function BriefListPage() {
  const briefs = await getMorningBriefs(400);
  const first = briefs[briefs.length - 1]?.as_of ?? null;

  return (
    <AppShell
      title="지난 브리프"
      asOf={briefs[0] ? `${tradingDayLabel(briefs[0].as_of)} 기준` : null}
      subtitle="매 거래일 장이 끝나면 그날을 한 편으로 남깁니다. 우측 숫자는 그날 전 종목 평균 수익률입니다."
      stats={[
        { label: "브리프", value: `${briefs.length}`, tone: "accent" as const },
        ...(first ? [{ label: "가장 오래된 날", value: first.slice(5).replace("-", ".") }] : []),
      ]}
    >
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        인사이트
      </Link>

      {briefs.length === 0 ? (
        <p className="mt-6 rounded-[12px] border border-border-soft bg-surface/40 p-8 text-center text-[13px] text-text-mute">
          브리프를 불러오지 못했습니다. 쌓인 글이 없는 것이 아니라 지금 읽어 오지 못한
          것입니다 — 잠시 뒤 다시 열어 주세요.
        </p>
      ) : (
        <div className="-mt-2">
          <BriefRows items={briefs} />
        </div>
      )}
    </AppShell>
  );
}
