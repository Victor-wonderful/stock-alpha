import { AppShell } from "@/components/AppShell";
import { getMorningBrief, getPickHistory, getReports } from "@/lib/data";

import { EventToggles } from "./_toggles";

export const dynamic = "force-dynamic";

interface FeedItem {
  date: string; // YYYY-MM-DD
  icon: string;
  title: string;
  desc: string;
  tone: "accent" | "good" | "bad" | "dim";
}

// 실데이터(픽·리포트·모닝 브리프)에서 알림 피드 합성 — 발송 백엔드(텔레그램) 연결 전의 인앱 피드.
async function buildFeed(): Promise<FeedItem[]> {
  const [history, reports, brief] = await Promise.all([
    getPickHistory(40),
    getReports(40),
    getMorningBrief(),
  ]);
  const items: FeedItem[] = [];

  // 픽 발행(날짜별 그룹) + 확정
  const byDay = new Map<string, string[]>();
  for (const p of history.data) {
    const arr = byDay.get(p.as_of) ?? [];
    arr.push(p.name);
    byDay.set(p.as_of, arr);
    if (p.closed && (p.status === "목표 도달" || p.status === "손절")) {
      items.push({
        date: p.as_of,
        icon: p.status === "목표 도달" ? "✓" : "✕",
        title: `픽 확정 — ${p.name} ${p.status}`,
        desc: `${p.return_pct != null ? `${(p.return_pct * 100).toFixed(1)}% · ` : ""}기록은 트랙레코드에 영구 보존`,
        tone: p.status === "목표 도달" ? "good" : "bad",
      });
    }
  }
  for (const [date, names] of byDay.entries()) {
    items.push({
      date,
      icon: "★",
      title: `오늘의 픽 ${names.length}종목 발행`,
      desc: `${names.slice(0, 4).join(" · ")}${names.length > 4 ? ` 외 ${names.length - 4}종목` : ""} — 진입 플랜 포함`,
      tone: "accent",
    });
  }

  // 매수 판정 리포트(상위 몇 건)
  for (const r of reports.data.filter((x) => x.rating === "매수").slice(0, 5)) {
    const date = (r.as_of ?? "").slice(0, 10);
    if (!date) continue;
    items.push({
      date,
      icon: "⚡",
      title: `매수 판정 — ${r.name ?? r.title}`,
      desc: r.summary ? r.summary.slice(0, 60) : "인뎁스 리포트 발행",
      tone: "good",
    });
  }

  // 모닝 브리프(최신 1건)
  if (brief.data) {
    items.push({
      date: brief.data.as_of,
      icon: "☀",
      title: "모닝 브리프",
      desc: brief.data.headline,
      tone: "dim",
    });
  }

  return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
}

const TONE: Record<FeedItem["tone"], string> = {
  accent: "text-accent",
  good: "text-good",
  bad: "text-bad",
  dim: "text-text-dim",
};

export default async function AlertsPage() {
  const feed = await buildFeed();
  const today = feed[0]?.date;
  const groups = new Map<string, FeedItem[]>();
  for (const f of feed) {
    const arr = groups.get(f.date) ?? [];
    arr.push(f);
    groups.set(f.date, arr);
  }

  return (
    <AppShell
      title="알림"
      subtitle="픽 발행 · 시그널 · 손절/목표 도달을 놓치지 않게 — 채널과 이벤트를 직접 선택합니다"
    >
      <div className="grid gap-6 xl:grid-cols-[560px_minmax(0,1fr)]">
        {/* 좌측: 채널 + 이벤트 설정 */}
        <div className="flex flex-col gap-5">
          <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
            <h2 className="mb-3 text-sm font-bold text-text">알림 채널</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-[12px] bg-surface-2 px-3.5 py-2.5">
                <span>
                  <span className="block text-[13px] font-semibold text-text">텔레그램</span>
                  <span className="block text-[11px] text-text-mute">실시간 발송 채널</span>
                </span>
                <span className="rounded-[999px] bg-warn-soft px-2.5 py-0.5 text-[10px] font-bold text-warn">
                  연결 준비 중
                </span>
              </div>
              <div className="flex items-center justify-between rounded-[12px] bg-surface-2 px-3.5 py-2.5">
                <span>
                  <span className="block text-[13px] font-semibold text-text">이메일</span>
                  <span className="block text-[11px] text-text-mute">일일 요약만 (스팸 방지)</span>
                </span>
                <span className="rounded-[999px] bg-surface-3 px-2.5 py-0.5 text-[10px] font-bold text-text-dim">
                  꺼짐
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-text">이벤트 설정</h2>
              <span className="text-[10px] text-text-mute">발송: 08:30 모닝 · 16:30 일일 배치</span>
            </div>
            <EventToggles />
          </section>
        </div>

        {/* 우측: 알림 피드 */}
        <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
          <h2 className="mb-3 text-sm font-bold text-text">최근 알림</h2>
          {feed.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-mute">
              데이터 연결 후 픽·리포트·브리프 알림이 표시됩니다
            </p>
          ) : (
            <div className="space-y-4">
              {[...groups.entries()].map(([date, items]) => (
                <div key={date}>
                  <p className="mb-2 text-[11px] font-semibold text-text-mute">
                    {date}
                    {date === today && " — 최신"}
                  </p>
                  <div className="space-y-2">
                    {items.map((f, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-[12px] px-3.5 py-2.5 ${
                          date === today ? "bg-surface-2" : "border border-border-soft"
                        }`}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-3 text-xs ${TONE[f.tone]}`}>
                          {f.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-[13px] font-bold text-text">
                            {f.title}
                            {date === today && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-text-dim">{f.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
