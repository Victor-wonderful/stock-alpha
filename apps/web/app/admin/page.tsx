import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  getAdminStats,
  getExpertApplications,
  getMembers,
  isAdmin,
} from "@/lib/admin";

/**
 * 관리 홈 — 운영자가 **매일 한 번 여는 화면**.
 *
 * 2026-08-25 Victor: "관리 페이지에 가입한 회원들 리스트들도 보일 수 있게 그리고
 * 가입회원 수 등을 보일 수 있는 것을".
 *
 * 이 화면이 따로 있어야 하는 이유는 알림이 없기 때문이다. 전문가 신청이 들어와도
 * 아무도 모른다 — 텔레그램 알림을 붙이기 전까지 이 화면이 그 자리를 대신한다.
 * 그래서 「기다리는 일」이 숫자 옆에 나란히 있다.
 *
 * 크기가 고정이어야 한다. 회원이 1,000명이 되어도 이 화면의 길이는 같아야 하고,
 * 늘어나는 목록은 자기 페이지를 갖는다(/admin/members) — 오늘 인사이트·분석에서
 * 세운 규칙과 같다.
 *
 * 운영자가 아니면 404. 「권한이 없습니다」는 그 주소에 관리 화면이 있다는 사실을
 * 알려 주는 셈이다.
 */
/**
 * ⚠️ metadata 를 내보내지 않는다. Next 는 notFound() 보다 **먼저** 제목을 정하므로,
 * 「관리 — VECTA Stock」이라 적어 두면 404 를 받은 사람의 브라우저 탭에 그 제목이
 * 그대로 뜬다 — 없는 척하기로 해 놓고 제목이 존재를 알려 주는 셈이다(2026-08-25).
 */

export default async function AdminHomePage() {
  if (!(await isAdmin())) notFound();

  const [stats, members, apps] = await Promise.all([
    getAdminStats(),
    getMembers(null, 5),
    getExpertApplications(),
  ]);
  const pending = apps.filter((a) => a.status === "pending");

  return (
    <AppShell
      title="관리"
      subtitle="운영자만 보는 화면입니다."
      stats={[
        { label: "회원", value: `${stats?.members ?? 0}` },
        { label: "오늘 가입", value: `${stats?.membersToday ?? 0}` },
        { label: "전문가", value: `${stats?.experts ?? 0}` },
        {
          label: "대기 신청",
          value: `${stats?.pendingApps ?? 0}`,
          tone: "accent" as const,
        },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 최근 가입 — 「사람이 들어오고 있나」를 한눈에. 전체는 목록 페이지가 갖는다. */}
        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text">최근 가입</h2>
            <Link
              href="/admin/members"
              className="text-[11.5px] font-semibold text-accent hover:underline"
            >
              회원 전체 →
            </Link>
          </div>
          {members.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-text-mute">
              아직 가입한 회원이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border-soft">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-2.5"
                >
                  <span className="text-[13px] font-semibold text-text">
                    {m.displayName ?? "이름 없음"}
                  </span>
                  {m.expertName && (
                    <span className="rounded-[999px] bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
                      전문가
                    </span>
                  )}
                  {!m.emailConfirmed && (
                    <span className="rounded-[999px] bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn">
                      메일 미확인
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11.5px] text-text-mute">
                    {m.createdAt.slice(5, 10).replace("-", ".")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 기다리는 일 — 알림이 없으니 이 자리가 그 역할을 한다. 0 이면 0 이라고 적는다
            («없음»을 감추면 화면을 왜 열었는지 알 수 없다). */}
        <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
          <h2 className="mb-3 text-sm font-bold text-text">기다리는 일</h2>
          <ul className="divide-y divide-border-soft">
            <Todo
              label="전문가 신청"
              count={pending.length}
              href="/admin/experts"
              hint={pending.length > 0 ? pending.map((p) => p.name).join(" · ") : null}
            />
            <Todo
              label="메일 미확인 회원"
              count={stats?.unconfirmed ?? 0}
              href="/admin/members"
              hint={null}
            />
          </ul>
          <p className="mt-4 border-t border-border-soft pt-3 text-[11.5px] leading-relaxed text-text-mute">
            신청이 들어와도 알림은 가지 않습니다 — 이 화면을 열어야 압니다. 배치 실패
            알림과 함께 붙일 예정입니다.
          </p>
        </section>
      </div>

      <p className="mt-5 text-[11.5px] leading-relaxed text-text-mute">
        지난 7일 가입 {stats?.members7d ?? 0}명.
      </p>
    </AppShell>
  );
}

function Todo({
  label,
  count,
  href,
  hint,
}: {
  label: string;
  count: number;
  href: string;
  hint: string | null;
}) {
  const has = count > 0;
  return (
    <li className="py-2.5">
      <Link href={href} className="group flex items-baseline gap-2.5">
        <span className="text-[13px] font-semibold text-text">{label}</span>
        <span
          className={`rounded-[999px] px-2 py-0.5 text-[11px] font-bold ${
            has ? "bg-accent text-text-on-accent" : "bg-surface-3 text-text-mute"
          }`}
        >
          {count}
        </span>
        {hint && (
          <span className="min-w-0 flex-1 truncate text-[12px] text-text-dim">{hint}</span>
        )}
        <ArrowRight
          className="ml-auto h-3.5 w-3.5 shrink-0 text-text-mute transition-colors group-hover:text-accent"
          aria-hidden
        />
      </Link>
    </li>
  );
}
