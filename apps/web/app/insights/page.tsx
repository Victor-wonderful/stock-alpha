import { AppShell } from "@/components/AppShell";
import { SectionHead } from "@/components/SectionHead";
import {
  getWeeklyReports,
  getMacroSeries,
  getBlogPosts,
  pickBlogPosts,
} from "@/lib/data";
import { WeeklyBriefs, MacroSection, BlogPosts } from "@/components/HomeSections";

/**
 * 인사이트 — 「읽을 것」이 모이는 곳.
 *
 * 홈의 주간 브리핑·매크로는 최근 3건만 보여주는 미리보기였는데, 정작 «전체 보기»가
 * 갈 데가 없었다. /market 으로 보냈지만 그건 지표·레짐 화면이지 브리핑 목록이 아니다
 * (2026-08-20 Victor 지적). 브리핑이 쌓일수록 그 공백이 커진다.
 *
 * 기업 분석은 여기 두지 않는다 — 이미 '종목'(/reports)이 그 역할을 한다.
 * 대신 블로그가 쓴 종목 글은 이 시스템의 리포트와 성격이 달라 아래 「블로그에서」로 모은다.
 */
export const metadata = {
  title: "인사이트 — VECTA Stock",
  description: "주간 브리핑과 매크로. 전망이 아니라 측정한 것만 적습니다.",
};

export default async function InsightsPage() {
  const [weekly, macro, blogPosts] = await Promise.all([
    getWeeklyReports(20),
    getMacroSeries(["DEXKOUS"]),
    getBlogPosts(),
  ]);

  const weeklyPosts = pickBlogPosts(blogPosts, "view", "weekly", 20);
  const macroPosts = pickBlogPosts(blogPosts, "view", "macro", 20);
  // 위 두 섹션이 이미 가져간 글은 빼고 나머지를 모은다(같은 글을 두 번 보여주지 않는다).
  const taken = new Set([...weeklyPosts, ...macroPosts].map((p) => p.url));
  const otherPosts = blogPosts.filter((p) => !taken.has(p.url)).slice(0, 20);

  const empty = weekly.length === 0 && macro.length === 0 && blogPosts.length === 0;

  return (
    <AppShell
      title="인사이트"
      subtitle="전망이 아니라 측정한 것만 적습니다"
    >
      {empty ? (
        <p className="rounded-[12px] border border-border-soft bg-surface/40 p-8 text-center text-[13px] text-text-mute">
          아직 쌓인 글이 없습니다. 주간 브리핑은 매 거래일 배치가 그 주를 갱신합니다.
        </p>
      ) : (
        // 섹션 컴포넌트는 홈의 리듬대로 mt-12 를 갖고 있다. 여기서는 첫 섹션만 0 으로
        // 되돌린다 — 제목과 첫 섹션 사이는 AppShell 의 mb-6 로 충분하다.
        // (-mt-12 로 당겼더니 제목 위로 올라타 겹쳤다)
        <div className="[&>section:first-child]:mt-0">
          <WeeklyBriefs posts={weeklyPosts} reports={weekly} moreHref={null} />
          <MacroSection posts={macroPosts} indicators={macro} moreHref={null} />
          {otherPosts.length > 0 && (
            <section className="mt-12">
              <SectionHead
                title="블로그에서"
                sub="VECTA 블로그에 쓴 글입니다. 판단은 사람이, 수치는 엔진이 냅니다."
              />
              <BlogPosts posts={otherPosts} />
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
