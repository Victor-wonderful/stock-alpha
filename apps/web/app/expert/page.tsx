import Link from "next/link";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { SymbolCode } from "@/components/SymbolCode";
import { getMyExpert, getMyExpertNotes } from "@/lib/expert";
import { setPublished } from "@/app/expert/actions";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { fmtPrice } from "@/lib/format";

/**
 * 내 추천 — 전문가 본인만 보는 화면(초안 포함).
 *
 * 등록된 전문가가 아니면 «신청하는 곳»이 된다. 404 로 막지 않는다 — 이 코너는
 * 여러 전문가가 참여하는 것이 목적이라, 문이 어디 있는지는 보여야 한다.
 */
export const metadata = { title: "내 추천 — VECTA Stock" };

export default async function ExpertHomePage() {
  const expert = await getMyExpert();

  if (!expert) {
    // 로그인은 했는데 전문가가 아닌 경우와, 아예 로그인 안 한 경우를 가른다.
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return (
      <AppShell title="전문가 코너" subtitle="사람이 고른 종목을 싣는 곳입니다.">
        <div className="max-w-[560px] rounded-[12px] border border-border bg-surface p-6">
          {user ? (
            <>
              <p className="text-[14px] font-semibold text-text">
                아직 전문가로 등록된 계정이 아닙니다
              </p>
              <p className="mt-2 text-[13px] leading-[1.7] text-text-dim">
                이 코너에 글을 싣는 분은 운영자가 등록합니다. 참여를 원하시면 운영자에게
                계정 이메일을 알려 주세요.
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-text">로그인이 필요합니다</p>
              <Link
                href="/login"
                className="mt-3 inline-block rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-navy"
              >
                로그인
              </Link>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  const notes = await getMyExpertNotes(expert.id);
  const live = notes.filter((n) => n.published).length;

  return (
    <AppShell
      title="내 추천"
      subtitle="여기서 쓰고 고칩니다. 내린 글도 지워지지 않고 남습니다."
      badge={
        <span className="rounded-[999px] bg-on-navy/10 px-2.5 py-1 text-[10px] font-semibold text-on-navy-2">
          {expert.name}
        </span>
      }
      stats={[
        { label: "발행 중", value: `${live}`, tone: "accent" as const },
        { label: "전체", value: `${notes.length}` },
      ]}
    >
      <Link
        href="/expert/write"
        className="inline-flex items-center gap-1.5 rounded-[9px] bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
      >
        <Plus size={15} strokeWidth={2.5} aria-hidden />새 추천 쓰기
      </Link>

      {notes.length === 0 ? (
        <p className="mt-6 rounded-[12px] border border-dashed border-border-strong bg-surface p-8 text-center text-[13px] text-text-mute">
          아직 쓴 글이 없습니다. 첫 추천을 써 보세요.
        </p>
      ) : (
        <ul className="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface">
          {notes.map((n, i) => (
            <li
              key={n.id}
              className={`px-5 py-4 ${i > 0 ? "border-t border-border-soft" : ""}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="tnum text-[12px] text-text-mute">
                  {n.asOf.slice(5).replace("-", ".")}
                </span>
                <span className="text-[14.5px] font-bold text-text">{n.name ?? "—"}</span>
                {n.symbol && <SymbolCode symbol={n.symbol} />}
                <span
                  className={`rounded-[999px] px-2 py-0.5 text-[11px] font-semibold ${
                    n.stance === "buy" ? "bg-accent-soft text-accent" : "bg-surface-3 text-text-dim"
                  }`}
                >
                  {n.stance === "buy" ? "산다" : "본다"}
                </span>
                {!n.published && (
                  <span className="rounded-[999px] border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-text-mute">
                    초안
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-3">
                  <Link
                    href={`/expert/write?id=${n.id}`}
                    className="text-[12px] font-semibold text-accent hover:underline"
                  >
                    고치기
                  </Link>
                  <form action={setPublished}>
                    <input type="hidden" name="id" value={n.id} />
                    {!n.published && <input type="hidden" name="published" value="on" />}
                    <button
                      type="submit"
                      className="text-[12px] text-text-mute transition-colors hover:text-text"
                    >
                      {n.published ? "내리기" : "올리기"}
                    </button>
                  </form>
                </span>
              </div>

              <p className="mt-1.5 text-[13px] leading-[1.6] text-text-dim">{n.summary}</p>

              {n.entryPrice != null && (
                <p className="tnum mt-2 text-[12px] text-text-mute">
                  진입 {fmtPrice(n.entryPrice)}
                  {n.stopLoss != null && <> · 손절 {fmtPrice(n.stopLoss)}</>}
                  {n.targetPrice != null && <> · 목표 {fmtPrice(n.targetPrice)}</>}
                  {n.horizonNote && <> · {n.horizonNote}</>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
