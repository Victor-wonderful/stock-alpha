import { AppShell } from "@/components/AppShell";
import { SectionHead } from "@/components/SectionHead";
import {
  getWeeklyReports,
  getMacroSeries,
  getMorningBriefs,
  getReports,
  getBlogPosts,
  getExpertNotes,
  getLatestPricesBySymbols,
  pickBlogPosts,
} from "@/lib/data";
import {
  WeeklyBriefs,
  MacroSection,
  RecentReports,
  BlogPosts,
} from "@/components/HomeSections";
import { BriefArchive } from "@/components/BriefArchive";
import { ExpertNotes } from "@/components/ExpertNotes";

/**
 * 인사이트 — 「읽을 것」이 모이는 곳.
 *
 * 홈의 주간 브리핑·매크로는 최근 3건만 보여주는 미리보기였는데, 정작 «전체 보기»가
 * 갈 데가 없었다. /market 으로 보냈지만 그건 지표·레짐 화면이지 브리핑 목록이 아니다
 * (2026-08-20 Victor 지적). 브리핑이 쌓일수록 그 공백이 커진다.
 *
 * 2026-08-24 Victor 가 순서를 정했다 — 전문가 추천 · 매일 브리프 · 주간 브리핑 ·
 * 최근 기업 분석 · 매크로. 사람 글이 맨 위이고, 그다음이 매일 → 주간 → 종목 → 지표 다.
 * 자주 바뀌는 것에서 천천히 바뀌는 것 순이고, 큰 그림(시장)에서 작은 것(지표)으로 간다.
 *
 * 기업 분석을 여기 둔다. 예전 주석에는 «/reports 가 그 역할이라 두지 않는다»고 적혀
 * 있었는데, 그건 목록이 있는 것과 «읽을 것»에 끼는 것을 혼동한 것이다. 여기서는 최근
 * 몇 건만 보여주고 전체는 /reports 로 보낸다. 제목은 홈과 같은 「최근 기업 분석」을
 * 쓴다 — 같은 것을 두 화면이 다른 이름으로 부르면 다른 것으로 읽힌다.
 *
 * 2026-08-24 — 매일 나오는 유일한 글이 이 페이지에 없었다. 모닝 브리프가 6/10 부터
 * 매 거래일 쌓여 48편인데 로더가 최신 1건만 읽어, 어제 브리프조차 다시 읽을 데가
 * 없었다. 「매일 브리프」를 이 페이지의 척추로 세운다.
 */
export const metadata = {
  title: "인사이트 — VECTA Stock",
  description: "매일 브리프와 주간 브리핑, 매크로. 전망이 아니라 측정한 것만 적습니다.",
};

/** 인사이트 본문에 세우는 브리프 수. 나머지는 /insights/brief 로 보낸다. */
const BRIEF_PREVIEW = 12;

export default async function InsightsPage() {
  const [weekly, macro, briefs, reports, blogPosts, expert] = await Promise.all([
    getWeeklyReports(20),
    // 제외 목록을 비운다 — 원달러가 USDKRW(네이버, 매일)로 바뀌어 더는 지연된
    // 시리즈가 아니다. 티커와 값이 갈리던 원인이었다(2026-08-22).
    getMacroSeries(),
    getMorningBriefs(400),
    getReports(10),
    getBlogPosts(),
    // 전문가 추천 — 홈은 4건만, 여기가 전체 목록이다.
    getExpertNotes(24),
  ]);

  const weeklyPosts = pickBlogPosts(blogPosts, "view", "weekly", 20);
  const macroPosts = pickBlogPosts(blogPosts, "view", "macro", 20);
  const analysisPosts = pickBlogPosts(blogPosts, "stocks", "analysis", 20);
  // 위 두 섹션이 이미 가져간 글은 빼고 나머지를 모은다(같은 글을 두 번 보여주지 않는다).
  const taken = new Set(
    [...weeklyPosts, ...macroPosts, ...analysisPosts].map((p) => p.url),
  );
  const otherPosts = blogPosts.filter((p) => !taken.has(p.url)).slice(0, 20);

  // 전문가 추천도 조건에 넣는다 — 엔진 산출물이 다 비어도 사람 글이 있으면 화면은
  // 비어 있지 않다(2026-08-23).
  const empty =
    briefs.length === 0 &&
    weekly.length === 0 &&
    reports.data.length === 0 &&
    macro.length === 0 &&
    blogPosts.length === 0 &&
    expert.notes.length === 0;

  // 전문가 추천이 언제나 맨 위다(2026-08-24 Victor 가 순서를 정했다). 글이 0편인 동안만
  // 아래로 내려 뒀었는데, 그러면 코너가 있다는 사실 자체가 안 보인다 — 이 코너는 여러
  // 전문가가 참여하는 것이 목적이라, 비어 있는 것도 «여기가 그 자리»라고 말한다.
  // 카드에 「진입가 대비」를 적으려면 기준이 되는 현재가가 있어야 한다. 종목당 한 번씩
  // 묻지 않고 한 번에 받아온다.
  const expertPrices = await getLatestPricesBySymbols(
    expert.notes.map((n) => n.symbol).filter((s): s is string => !!s),
  );
  const expertSection = (
    <ExpertNotes
      notes={expert.notes}
      prices={expertPrices}
      failed={expert.failed}
      moreHref={null}
    />
  );

  return (
    <AppShell
      title="인사이트"
      subtitle="전망이 아니라 측정한 것만 적습니다 — 전문가 추천 · 매일 브리프 · 주간 브리핑 · 기업 분석 · 매크로."
      stats={[
        { label: "전문가 추천", value: `${expert.notes.length}`, tone: "accent" as const },
        { label: "매일 브리프", value: `${briefs.length}` },
        { label: "기업 분석", value: `${reports.data.length + analysisPosts.length}` },
      ]}
    >
      {empty ? (
        <p className="rounded-[12px] border border-border-soft bg-surface/40 p-8 text-center text-[13px] text-text-mute">
          아직 쌓인 글이 없습니다. 브리프는 매 거래일 장 마감 뒤 배치가 한 편씩 남깁니다.
        </p>
      ) : (
        // 섹션 컴포넌트는 홈의 리듬대로 mt-12 를 갖고 있다. 여기서는 첫 섹션만 0 으로
        // 되돌린다 — 제목과 첫 섹션 사이는 AppShell 의 mb-6 로 충분하다.
        // (-mt-12 로 당겼더니 제목 위로 올라타 겹쳤다)
        <div className="[&>section:first-child]:mt-0">
          {expertSection}
          <BriefArchive
            items={briefs.slice(0, BRIEF_PREVIEW)}
            moreHref={briefs.length > BRIEF_PREVIEW ? "/insights/brief" : null}
          />
          <WeeklyBriefs posts={weeklyPosts} reports={weekly} moreHref={null} />
          <RecentReports posts={analysisPosts} reports={reports.data} />
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
