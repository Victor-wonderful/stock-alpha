import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { getMembers, isAdmin, type Member } from "@/lib/admin";

/**
 * 회원 목록 — 운영자만.
 *
 * **이메일·연락처를 목록에 늘어놓지 않는다.** 행을 펼쳐야 보인다(2026-08-25 결정).
 * 운영자가 평소에 필요한 것은 «누가 몇 명 있나»이고, 연락처는 특정 회원을 찾을 때만
 * 필요하다. 개인정보를 한 화면에 늘어놓으면 캡처 한 장으로 전부 샌다 — 머리의 계정
 * 자리가 이메일을 안 띄우는 것과 같은 이유다.
 *
 * 펼치기는 `<details>` 로 한다. 자바스크립트 없이 동작하고, 이 저장소가 이미 쓰는
 * 방식이다(분석 화면의 「나머지 N건 펼치기」).
 */
/**
 * ⚠️ metadata 를 내보내지 않는다. Next 는 notFound() 보다 **먼저** 제목을 정하므로,
 * 「관리 — VECTA Stock」이라 적어 두면 404 를 받은 사람의 브라우저 탭에 그 제목이
 * 그대로 뜬다 — 없는 척하기로 해 놓고 제목이 존재를 알려 주는 셈이다(2026-08-25).
 */

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  if (!(await isAdmin())) notFound();

  const { q = "", filter = null } = await searchParams;
  const all = await getMembers(q || null, 1000);
  const members =
    filter === "expert"
      ? all.filter((m) => m.expertName)
      : filter === "unconfirmed"
        ? all.filter((m) => !m.emailConfirmed)
        : all;

  const chip = (key: string | null, label: string, n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (key) p.set("filter", key);
    const qs = p.toString();
    const on = (filter ?? null) === key;
    return (
      <Link
        key={label}
        href={qs ? `/admin/members?${qs}` : "/admin/members"}
        className={`inline-flex items-center gap-1.5 rounded-[999px] px-3 py-1.5 text-xs font-semibold transition-colors ${
          on
            ? "bg-accent text-text-on-accent"
            : "border border-border bg-surface text-text-dim hover:border-border-strong hover:text-text"
        }`}
      >
        {label}
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            on ? "bg-black/20 text-text-on-accent" : "bg-surface-3 text-text-mute"
          }`}
        >
          {n}
        </span>
      </Link>
    );
  };

  return (
    <AppShell
      title="회원"
      subtitle="이메일·연락처는 접혀 있습니다 — 행을 펼치면 보입니다."
      stats={[
        { label: "전체", value: `${all.length}`, tone: "accent" as const },
        { label: "전문가", value: `${all.filter((m) => m.expertName).length}` },
        {
          label: "메일 미확인",
          value: `${all.filter((m) => !m.emailConfirmed).length}`,
        },
      ]}
    >
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        관리
      </Link>

      {/* 검색 */}
      <form method="get" action="/admin/members" className="mb-4 mt-5">
        {filter && <input type="hidden" name="filter" value={filter} />}
        <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-5 py-3.5 focus-within:border-accent">
          <Search className="h-4.5 w-4.5 shrink-0 text-text-mute" />
          <input
            name="q"
            defaultValue={q}
            placeholder="닉네임 · 이메일 · 연락처로 찾기"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-text-mute"
          />
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {chip(null, "전체", all.length)}
          {chip("expert", "전문가", all.filter((m) => m.expertName).length)}
          {chip(
            "unconfirmed",
            "메일 미확인",
            all.filter((m) => !m.emailConfirmed).length,
          )}
        </div>

        {/* CSV — 검색어를 그대로 넘긴다. 보고 있는 것이 내려받는 것이어야 한다.
            a 태그로 두는 이유: 파일 응답이라 라우터가 화면을 바꾸면 안 된다. */}
        <a
          href={q ? `/admin/members/export?q=${encodeURIComponent(q)}` : "/admin/members/export"}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] border border-border px-3.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV 내려받기
        </a>
      </div>

      {members.length === 0 ? (
        <p className="rounded-[12px] border border-border bg-surface px-6 py-10 text-center text-[13px] text-text-mute">
          {q ? "찾는 회원이 없습니다." : "아직 가입한 회원이 없습니다."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[12px] border border-border bg-surface">
          {members.map((m, i) => (
            <li key={m.id} className={i > 0 ? "border-t border-border-soft" : ""}>
              <MemberRow member={m} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-text-mute">
        내려받은 파일에는 이메일과 연락처가 들어 있습니다. 개인정보이므로 필요한 곳에만
        쓰고, 쓰고 난 파일은 지워 주세요.
      </p>
    </AppShell>
  );
}

function MemberRow({ member: m }: { member: Member }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-3 transition-colors hover:bg-surface-2">
        <span className="text-[13.5px] font-semibold text-text">
          {m.displayName ?? "이름 없음"}
        </span>
        {m.expertName && (
          <span className="rounded-[999px] bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
            전문가
          </span>
        )}
        {m.isAdmin && (
          <span className="rounded-[999px] bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn">
            운영자
          </span>
        )}
        {!m.emailConfirmed && (
          <span className="rounded-[999px] bg-bad-soft px-2 py-0.5 text-[10.5px] font-semibold text-bad">
            메일 미확인
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11.5px] text-text-mute">
          {m.createdAt.slice(0, 10)} 가입
        </span>
        <span className="shrink-0 text-[11px] text-text-mute">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>

      <dl className="space-y-2 border-t border-border-soft bg-surface-2 px-5 py-4 text-[12.5px]">
        <Row label="이메일" value={m.email} mono />
        <Row label="연락처" value={m.phone} mono />
        <Row label="등급" value={m.tier} />
        {m.expertName && <Row label="전문가 필명" value={m.expertName} />}
        <Row
          label="약관 동의"
          value={
            m.termsAgreedAt
              ? `${m.termsAgreedAt.slice(0, 10)}${m.agreedDocVersion ? ` · ${m.agreedDocVersion}` : ""}`
              : "기록 없음"
          }
        />
      </dl>
    </details>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-[84px] shrink-0 text-text-mute">{label}</dt>
      <dd className={`min-w-0 flex-1 text-text-dim ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
