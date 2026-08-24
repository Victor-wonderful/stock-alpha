import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { BlogPosts, MacroRows } from "@/components/HomeSections";
import { getBlogPosts, getMacroSeries, pickBlogPosts } from "@/lib/data";

/**
 * 매크로 전체 — 인사이트의 그 섹션이 지표 5개만 세우고 나머지는 여기로.
 *
 * 2026-08-24 Victor: "각 섹션마다 5개로 하고 전체 보기는 따로 해라".
 *
 * 여기서는 **지표와 글을 같이** 보여준다. 인사이트의 섹션은 «글이 있으면 글이 이긴다»라
 * 지표가 통째로 가려질 수 있는데, 전체 목록까지 그러면 지표를 볼 데가 아예 없어진다.
 * 글은 해석이고 지표는 값이라, 둘은 서로를 대신하지 못한다.
 */
export const metadata = {
  title: "매크로 — VECTA Stock",
  description: "금리·변동성·유가·환율. 해석이 아니라 값과 그 기준일을 적습니다.",
};

export default async function MacroListPage() {
  const [indicators, blogPosts] = await Promise.all([getMacroSeries(), getBlogPosts()]);
  const posts = pickBlogPosts(blogPosts, "view", "macro", 100);

  return (
    <AppShell
      title="매크로"
      subtitle="지표마다 발표 주기가 달라 기준일이 서로 다릅니다 — 오래된 값은 오래됐다고 적습니다."
      stats={[
        { label: "지표", value: `${indicators.length}`, tone: "accent" as const },
        ...(posts.length > 0 ? [{ label: "글", value: `${posts.length}` }] : []),
      ]}
    >
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        인사이트
      </Link>

      {indicators.length === 0 && posts.length === 0 ? (
        <p className="mt-6 rounded-[12px] border border-border-soft bg-surface/40 p-8 text-center text-[13px] text-text-mute">
          지표를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.
        </p>
      ) : (
        <>
          {indicators.length > 0 && (
            <section className="-mt-2">
              <MacroRows items={indicators} />
            </section>
          )}
          {posts.length > 0 && (
            <section className="mt-12">
              <h2 className="text-sm font-bold text-text">매크로를 다룬 글</h2>
              <BlogPosts posts={posts} />
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
