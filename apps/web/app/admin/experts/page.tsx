import { notFound } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { getExpertApplications, isAdmin, type ExpertApplication } from "@/lib/admin";
import { approveApplication, rejectApplication } from "./actions";

/**
 * 전문가 신청 판정 — 운영자 화면.
 *
 * 2026-08-24 Victor: "전문가 참여를 승인해줘야 하는데?". 그전까지 전문가를 만드는 길은
 * 운영자 PC 의 명령어 하나뿐이었다(scripts/setup_expert_corner.py) — 운영자가 그 PC
 * 앞에 앉아 있어야만 승인이 가능했다.
 *
 * 운영자가 아니면 **404 로 답한다.** 「권한이 없습니다」라고 말해 주면 그 주소에 관리
 * 화면이 있다는 사실 자체를 알려 주는 셈이다.
 *
 * ⚠️ 이 화면의 판정은 감추기 위한 것이고, 실제 권한은 DB 가 지킨다(0047 정책 +
 * approve_expert_application 의 is_admin 검사).
 */
export const metadata = {
  title: "전문가 신청 — 관리",
};

export default async function AdminExpertsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { error, done } = await searchParams;
  if (!(await isAdmin())) notFound();

  const apps = await getExpertApplications();
  const pending = apps.filter((a) => a.status === "pending");
  const decided = apps.filter((a) => a.status !== "pending");

  return (
    <AppShell
      title="전문가 신청"
      subtitle="승인하면 그 자리에서 전문가로 등록되고, 그분 화면에 「추천 쓰기」가 생깁니다."
      stats={[
        { label: "대기 중", value: `${pending.length}`, tone: "accent" as const },
        { label: "처리됨", value: `${decided.length}` },
      ]}
    >
      <div className="mx-auto w-full max-w-[820px]">
        {done === "1" && (
          <div className="mb-5 flex gap-2.5 rounded-[10px] border border-good/30 bg-good-soft px-4 py-3">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
            <p className="text-[13px] text-text">처리했습니다.</p>
          </div>
        )}
        {error && (
          <div className="mb-5 flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
            <p className="text-[13px] leading-[1.7] text-text">{error}</p>
          </div>
        )}

        <section>
          <h2 className="mb-3 text-sm font-bold text-text">대기 중</h2>
          {pending.length === 0 ? (
            <p className="rounded-[12px] border border-border bg-surface px-6 py-8 text-center text-[13px] text-text-mute">
              기다리는 신청이 없습니다.
            </p>
          ) : (
            <ul className="space-y-4">
              {pending.map((a) => (
                <li key={a.id}>
                  <PendingCard app={a} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {decided.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-bold text-text">처리한 신청</h2>
            <ul className="divide-y divide-border-soft border-y border-border-soft">
              {decided.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span
                    className={`rounded-[999px] px-2 py-0.5 text-[11px] font-semibold ${
                      a.status === "approved"
                        ? "bg-good-soft text-good"
                        : "bg-bad-soft text-bad"
                    }`}
                  >
                    {a.status === "approved" ? "승인" : "거절"}
                  </span>
                  <span className="text-[13px] font-semibold text-text">{a.name}</span>
                  <span className="font-mono text-[12px] text-text-mute">@{a.handle}</span>
                  {a.reviewNote && (
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-dim">
                      {a.reviewNote}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11.5px] text-text-mute">
                    {(a.reviewedAt ?? a.createdAt).slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function PendingCard({ app }: { app: ExpertApplication }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface px-6 py-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[15px] font-bold text-text">{app.name}</p>
        <span className="font-mono text-[12.5px] text-text-mute">@{app.handle}</span>
        <span className="ml-auto font-mono text-[11.5px] text-text-mute">
          {app.createdAt.slice(0, 10)}
        </span>
      </div>
      {app.headline && (
        <p className="mt-1 text-[13px] text-text-dim">{app.headline}</p>
      )}
      {app.bio && (
        <p className="mt-3 whitespace-pre-wrap text-[13px] leading-[1.8] text-text-dim">
          {app.bio}
        </p>
      )}

      <div className="mt-4 rounded-[10px] bg-surface-2 px-4 py-3">
        <p className="text-[11.5px] font-semibold text-text-mute">참여 이유</p>
        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.8] text-text-dim">
          {app.reason}
        </p>
      </div>

      {/* 승인과 거절을 **다른 form 으로** 둔다. 하나에 버튼 둘을 넣으면 거절 사유 칸이
          비어 있어도 승인이 되고, 승인 눌렀는데 사유 required 에 걸려 멈추기도 한다. */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
        <form action={approveApplication} className="shrink-0">
          <input type="hidden" name="id" value={app.id} />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center rounded-[9px] bg-accent px-5 text-[13.5px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
          >
            승인
          </button>
        </form>

        <form action={rejectApplication} className="flex min-w-0 flex-1 gap-2">
          <input type="hidden" name="id" value={app.id} />
          <input
            name="note"
            required
            minLength={5}
            maxLength={300}
            placeholder="거절 사유 — 신청자에게 그대로 보입니다"
            className="min-w-0 flex-1 rounded-[9px] border border-border bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="inline-flex min-h-10 shrink-0 items-center rounded-[9px] border border-border px-4 text-[13.5px] font-semibold text-text-dim transition-colors hover:text-bad"
          >
            거절
          </button>
        </form>
      </div>
    </div>
  );
}
