import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Search } from "lucide-react";

import { AdminShell } from "@/components/AdminShell";
import { getMembers, isAdmin, type Member } from "@/lib/admin";

/**
 * 회원 목록 — 운영자만.
 *
 * 2026-08-25 첫 판은 «닉네임 한 줄 + 펼치면 상세» 였다 — 이메일·연락처를 한 화면에
 * 늘어놓지 않으려는 결정이었다. 2026-09-14 Victor: "회원 보여주는 것을 저런 식으로
 * 하지 말고 좀 세련되게 해라". 그 사이 관리는 별도 호스트로 옮겨 **운영자 로그인 +
 * OTP** 뒤에 있으므로(admin.vecta.win), 캡처 한 장의 위험보다 «한눈에 읽히는 표»가
 * 더 큰 값이 됐다. 그래서 표로 바꾼다 — 열 하나에 값 하나, 행 하나에 회원 하나.
 *
 * 768px 미만은 표가 안 들어간다 — 카드로 접는다(mobile-tablet 규칙).
 */
/**
 * ⚠️ metadata 를 내보내지 않는다 — 관리 화면 전체의 규칙(app/admin/page.tsx).
 */

/** 01012345678 → 010-1234-5678. 자리수가 안 맞으면 그대로. */
function fmtPhone(p: string | null): string {
  if (!p) return "—";
  const d = p.replace(/[^0-9]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function ymd(iso: string | null): string {
  return iso ? iso.slice(0, 10).replace(/-/g, ".") : "—";
}

/** 닉네임 첫 글자 — 아바타 대신. 한글이면 한 글자, 영문이면 대문자 둘. */
function initials(name: string | null): string {
  if (!name) return "?";
  const t = name.trim();
  if (/^[A-Za-z]/.test(t)) return t.slice(0, 2).toUpperCase();
  return t.slice(0, 1);
}

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
        href={qs ? `/members?${qs}` : "/members"}
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

  const csvHref = q ? `/members/export?q=${encodeURIComponent(q)}` : "/members/export";

  return (
    <AdminShell
      title="회원"
      subtitle="가입한 순서의 역순입니다. 검색어와 필터는 CSV 에도 그대로 적용됩니다."
      stats={[
        { label: "전체", value: `${all.length}`, tone: "accent" as const },
        { label: "전문가", value: `${all.filter((m) => m.expertName).length}` },
        { label: "메일 미확인", value: `${all.filter((m) => !m.emailConfirmed).length}` },
      ]}
    >
      {/* 도구줄 — 검색 · 필터 · CSV 를 한 줄에 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="get" action="/members" className="min-w-[240px] flex-1">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <div className="flex h-10 items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 focus-within:border-accent">
            <Search className="h-4 w-4 shrink-0 text-text-mute" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="닉네임 · 이메일 · 연락처"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-text-mute"
            />
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          {chip(null, "전체", all.length)}
          {chip("expert", "전문가", all.filter((m) => m.expertName).length)}
          {chip("unconfirmed", "메일 미확인", all.filter((m) => !m.emailConfirmed).length)}
        </div>
        {/* a 태그 — 파일 응답이라 라우터가 화면을 바꾸면 안 된다 */}
        <a
          href={csvHref}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-accent px-4 text-[12.5px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV 다운로드
        </a>
      </div>

      {members.length === 0 ? (
        <p className="rounded-[12px] border border-border bg-surface px-6 py-10 text-center text-[13px] text-text-mute">
          {q ? "찾는 회원이 없습니다." : "아직 가입한 회원이 없습니다."}
        </p>
      ) : (
        <>
          {/* 데스크탑 — 표 */}
          <div className="hidden overflow-hidden rounded-[12px] border border-border bg-surface md:block">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-[10.5px] uppercase tracking-[0.4px] text-text-mute">
                  <th className="px-4 py-2.5 text-left font-semibold">회원</th>
                  <th className="px-3 py-2.5 text-left font-semibold">이메일</th>
                  <th className="px-3 py-2.5 text-left font-semibold">연락처</th>
                  <th className="px-3 py-2.5 text-left font-semibold">등급</th>
                  <th className="px-3 py-2.5 text-left font-semibold">메일 확인</th>
                  <th className="px-3 py-2.5 text-left font-semibold">약관 동의</th>
                  <th className="px-4 py-2.5 text-right font-semibold">가입일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {members.map((m) => (
                  <MemberTr key={m.id} m={m} />
                ))}
              </tbody>
            </table>
          </div>

          {/* 폰 — 카드 */}
          <ul className="space-y-2.5 md:hidden">
            {members.map((m) => (
              <MemberCard key={m.id} m={m} />
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-text-mute">
        {members.length}명 표시. 이메일과 연락처는 개인정보입니다 — 이 화면과 CSV 는 운영자
        로그인·OTP 뒤에만 있고, 내려받은 파일은 쓰고 나면 지워 주세요.
      </p>
    </AdminShell>
  );
}

function RoleBadges({ m }: { m: Member }) {
  return (
    <>
      {m.isAdmin && (
        <span className="rounded-[999px] bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
          운영자
        </span>
      )}
      {m.expertName && (
        <span
          className="rounded-[999px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent"
          title={`필명 ${m.expertName}`}
        >
          전문가
        </span>
      )}
    </>
  );
}

function ConfirmBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="rounded-[999px] bg-pass-soft px-2 py-0.5 text-[10.5px] font-semibold text-pass">
      완료
    </span>
  ) : (
    <span className="rounded-[999px] bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn">
      미확인
    </span>
  );
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11.5px] font-bold text-accent">
      {initials(name)}
    </span>
  );
}

function MemberTr({ m }: { m: Member }) {
  return (
    <tr className="transition-colors hover:bg-surface-2">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={m.displayName} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-text">
                {m.displayName ?? "이름 없음"}
              </span>
              <RoleBadges m={m} />
            </div>
            {m.expertName && (
              <div className="text-[11px] text-text-mute">필명 {m.expertName}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[12px] text-text-dim">{m.email ?? "—"}</td>
      <td className="tnum whitespace-nowrap px-3 py-2.5 text-text-dim">{fmtPhone(m.phone)}</td>
      <td className="px-3 py-2.5 text-text-dim">{m.tier ?? "—"}</td>
      <td className="px-3 py-2.5">
        <ConfirmBadge ok={m.emailConfirmed} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-text-dim">
        {m.termsAgreedAt ? (
          <>
            {ymd(m.termsAgreedAt)}
            {m.agreedDocVersion && (
              <span className="ml-1 text-text-mute" title="동의한 약관 문서의 판(발효일)">
                {m.agreedDocVersion.replace(/-/g, ".")}판
              </span>
            )}
          </>
        ) : (
          <span className="text-text-mute">기록 없음</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-[11.5px] text-text-dim">
        {ymd(m.createdAt)}
      </td>
    </tr>
  );
}

function MemberCard({ m }: { m: Member }) {
  return (
    <li className="rounded-[12px] border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={m.displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-semibold text-text">
              {m.displayName ?? "이름 없음"}
            </span>
            <RoleBadges m={m} />
          </div>
          <div className="text-[11px] text-text-mute">{ymd(m.createdAt)} 가입</div>
        </div>
        <ConfirmBadge ok={m.emailConfirmed} />
      </div>
      <dl className="mt-3 grid grid-cols-[64px_1fr] gap-y-1.5 border-t border-border-soft pt-3 text-[12.5px]">
        <dt className="text-text-mute">이메일</dt>
        <dd className="break-all font-mono text-[12px] text-text">{m.email ?? "—"}</dd>
        <dt className="text-text-mute">연락처</dt>
        <dd className="tnum text-text">{fmtPhone(m.phone)}</dd>
        <dt className="text-text-mute">등급</dt>
        <dd className="text-text">{m.tier ?? "—"}</dd>
        <dt className="text-text-mute">약관 동의</dt>
        <dd className="font-mono text-[12px] text-text">
          {m.termsAgreedAt ? ymd(m.termsAgreedAt) : "기록 없음"}
        </dd>
      </dl>
    </li>
  );
}
