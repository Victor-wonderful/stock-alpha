import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { BlogPosts, WeeklyReportRows } from "@/components/HomeSections";
import { getBlogPosts, getWeeklyReports, pickBlogPostsWithEngine } from "@/lib/data";

/**
 * 주간 브리핑 전체 — 인사이트의 그 섹션이 최근 5편만 세우고 나머지는 여기로.
 *
 * 2026-08-24 Victor: "각 섹션마다 5개로 하고 전체 보기는 따로 해라". 인사이트 한 장에
 * 섹션마다 20편씩 늘어놓으니 아래 섹션이 화면 밖으로 밀렸다. 그렇다고 앞의 몇 편만
 * 두고 끝내면 나머지는 다시 «없는 것»이 된다 — 매일 브리프에서 이미 겪은 문제다
 * (/insights/brief 가 그 답이었다). 같은 구조를 주간에도 준다.
 *
 * 사람 글이 먼저, 그 아래 엔진 글. 글이 하나도 없으면 엔진이 낸 주간 리포트가 자리를
 * 지킨다 — 인사이트의 섹션과 같은 규칙이라 두 화면이 다른 말을 하지 않는다.
 */
export const metadata = {
  title: "주간 브리핑 — VECTA Stock",
  description: "한 주 동안 무엇이 통했고 무엇이 통하지 않았는지. 측정한 것만 적습니다.",
};

export default async function WeeklyListPage() {
  const [blogPosts, reports] = await Promise.all([getBlogPosts(), getWeeklyReports(200)]);
  const posts = pickBlogPostsWithEngine(blogPosts, "view", "weekly", "weekly", 200);
  const total = posts.length || reports.length;

  return (
    <AppShell
      title="주간 브리핑"
      subtitle="한 주가 끝나면 그 주를 한 편으로 남깁니다. 전망이 아니라 끝난 주의 숫자입니다."
      stats={[{ label: "글", value: `${total}`, tone: "accent" as const }]}
    >
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        인사이트
      </Link>

      {total === 0 ? (
        <p className="mt-6 rounded-[12px] border border-border-soft bg-surface/40 p-8 text-center text-[13px] text-text-mute">
          아직 쌓인 주간 브리핑이 없습니다.
        </p>
      ) : posts.length > 0 ? (
        <div className="-mt-2">
          <BlogPosts posts={posts} />
        </div>
      ) : (
        <div className="-mt-2">
          <WeeklyReportRows items={reports} />
        </div>
      )}
    </AppShell>
  );
}
