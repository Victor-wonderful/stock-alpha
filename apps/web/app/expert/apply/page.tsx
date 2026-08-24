import Link from "next/link";
import { CheckCircle2, Clock, TriangleAlert } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { getMyApplication } from "@/lib/admin";
import { getMyExpert } from "@/lib/expert";
import { applyForExpert } from "./actions";

/**
 * 전문가 참여 신청 — 로그인한 회원이 스스로 낸다.
 *
 * 2026-08-24 Victor: "전문가 참여를 승인해줘야 하는데?". 이 화면이 그 «신청» 쪽이고,
 * 판정은 /admin/experts 가 맡는다.
 *
 * 화면이 갈리는 경우가 넷이다. 하나로 뭉뚱그리면 이미 전문가인 사람에게 빈 신청서를
 * 보여주게 된다:
 *   이미 전문가          → 신청서 대신 「추천 쓰기」로 보낸다
 *   대기 중              → 낸 내용을 그대로 보여주고 폼은 감춘다(고칠 수 없다)
 *   거절됨               → 사유를 보여주고 **다시 낼 수 있게** 폼을 연다
 *   처음 · 승인 이력 없음 → 폼
 */
export const metadata = {
  title: "전문가 참여 신청 — VECTA Stock",
};

const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent";
const LABEL = "block text-[13px] font-semibold text-text";

export default async function ExpertApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const [expert, app] = await Promise.all([getMyExpert(), getMyApplication()]);

  const pending = app?.status === "pending";
  const rejected = app?.status === "rejected";
  // 거절 뒤 다시 낼 때 처음부터 적게 하지 않는다 — 대개 한 군데만 고치면 된다.
  const prefill = rejected ? app : null;

  return (
    <AppShell
      title="전문가 참여 신청"
      subtitle="심사를 거쳐 승인되면 「인사이트 · 전문가 추천」에 직접 글을 쓸 수 있습니다."
    >
      <div className="mx-auto w-full max-w-[620px]">
        {expert ? (
          <div className="rounded-[12px] border border-border bg-surface px-6 py-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="shrink-0 text-good" aria-hidden />
              <p className="text-[15px] font-bold text-text">이미 전문가로 등록돼 있습니다</p>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
              필명 <b className="font-semibold text-text">{expert.name}</b> · 공개 아이디{" "}
              <span className="font-mono">@{expert.handle}</span>
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                href="/expert/write"
                className="inline-flex min-h-10 items-center rounded-[9px] bg-accent px-5 text-[13.5px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
              >
                추천 쓰기
              </Link>
              <Link
                href="/expert/profile"
                className="inline-flex min-h-10 items-center rounded-[9px] border border-border px-5 text-[13.5px] font-semibold text-text-dim transition-colors hover:text-text"
              >
                프로필 고치기
              </Link>
            </div>
          </div>
        ) : (
          <>
            {sent === "1" && (
              <div className="mb-5 flex gap-2.5 rounded-[10px] border border-good/30 bg-good-soft px-4 py-3">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />
                <p className="text-[13px] leading-[1.7] text-text">
                  신청이 접수됐습니다. 검토 뒤 결과를 이 화면에서 알려 드립니다.
                </p>
              </div>
            )}

            {error && (
              <div className="mb-5 flex gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                <p className="text-[13px] leading-[1.7] text-text">{error}</p>
              </div>
            )}

            {pending && app && (
              <div className="rounded-[12px] border border-border bg-surface px-6 py-6">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="shrink-0 text-warn" aria-hidden />
                  <p className="text-[15px] font-bold text-text">검토 중입니다</p>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
                  {app.createdAt.slice(0, 10)} 에 신청하셨습니다. 결과가 나오면 이 화면에
                  표시됩니다.
                </p>
                {/* 낸 내용을 그대로 보여준다 — 「내가 뭐라고 썼더라」를 확인할 곳이
                    여기밖에 없다. 고칠 수는 없다(운영자가 본 것과 달라지면 안 된다). */}
                <dl className="mt-5 space-y-2.5 border-t border-border-soft pt-4 text-[13px]">
                  <Row label="필명" value={app.name} />
                  <Row label="공개 아이디" value={`@${app.handle}`} mono />
                  {app.headline && <Row label="한 줄 소개" value={app.headline} />}
                  <Row label="참여 이유" value={app.reason} />
                </dl>
              </div>
            )}

            {!pending && (
              <>
                {rejected && app && (
                  <div className="mb-5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
                    <p className="text-[13px] font-semibold text-text">
                      지난 신청은 승인되지 않았습니다
                    </p>
                    <p className="mt-1 text-[13px] leading-[1.7] text-text-dim">
                      {app.reviewNote ?? "사유가 적혀 있지 않습니다."}
                    </p>
                    <p className="mt-2 text-[11.5px] text-text-mute">
                      아래에서 다시 신청하실 수 있습니다. 지난 내용을 채워 두었습니다.
                    </p>
                  </div>
                )}

                <form action={applyForExpert} className="space-y-4">
                  <div>
                    <label className={LABEL} htmlFor="name">
                      필명{" "}
                      <span className="font-normal text-text-mute">
                        글에 이 이름이 보입니다 · 20자 이내
                      </span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      defaultValue={prefill?.name ?? ""}
                      maxLength={20}
                      required
                      placeholder="예: 남산자산"
                      className={FIELD}
                    />
                  </div>

                  <div>
                    <label className={LABEL} htmlFor="handle">
                      공개 아이디{" "}
                      <span className="font-normal text-text-mute">
                        영문 소문자·숫자·하이픈 2~20자
                      </span>
                    </label>
                    <input
                      id="handle"
                      name="handle"
                      defaultValue={prefill?.handle ?? ""}
                      maxLength={20}
                      required
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="namsan"
                      className={`${FIELD} font-mono`}
                    />
                    <p className="mt-1.5 text-[11.5px] leading-[1.6] text-text-mute">
                      주소와 언급에 쓰입니다. 승인 뒤에도 바꿀 수 있습니다.
                    </p>
                  </div>

                  <div>
                    <label className={LABEL} htmlFor="headline">
                      한 줄 소개{" "}
                      <span className="font-normal text-text-mute">40자 이내 · 선택</span>
                    </label>
                    <input
                      id="headline"
                      name="headline"
                      defaultValue={prefill?.headline ?? ""}
                      maxLength={40}
                      placeholder="방산·조선 15년"
                      className={FIELD}
                    />
                  </div>

                  <div>
                    <label className={LABEL} htmlFor="bio">
                      소개 <span className="font-normal text-text-mute">선택</span>
                    </label>
                    <textarea
                      id="bio"
                      name="bio"
                      defaultValue={prefill?.bio ?? ""}
                      rows={3}
                      maxLength={600}
                      placeholder="어떤 분야를 어떻게 봐 오셨는지 적어 주세요."
                      className={FIELD}
                    />
                  </div>

                  <div>
                    <label className={LABEL} htmlFor="reason">
                      참여 이유{" "}
                      <span className="font-normal text-text-mute">20자 이상</span>
                    </label>
                    <textarea
                      id="reason"
                      name="reason"
                      defaultValue={prefill?.reason ?? ""}
                      rows={4}
                      required
                      minLength={20}
                      maxLength={1000}
                      placeholder="어떤 종목을 어떤 근거로 다루실 계획인지 적어 주시면 판단에 도움이 됩니다."
                      className={FIELD}
                    />
                    <p className="mt-1.5 text-[11.5px] leading-[1.6] text-text-mute">
                      승인 판단의 실제 근거입니다. 운영자만 봅니다.
                    </p>
                  </div>

                  {/* 규제 고지 — 남의 이름으로 종목을 추천하는 자리라, 무엇을 하는
                      코너인지 신청 단계에서 분명히 해 둔다. */}
                  <p className="rounded-[10px] border border-border bg-surface-2 px-4 py-3 text-[11.5px] leading-[1.7] text-text-mute">
                    전문가 추천은 투자 참고 정보이며 맞춤 자문이 아닙니다. 쓰신 글은 필명과
                    함께 공개되고, 엔진이 발행하는 픽과는 별도 코너에 놓입니다. 수익을
                    보장하는 표현은 쓰실 수 없습니다.
                  </p>

                  <button
                    type="submit"
                    className="w-full rounded-[9px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-text-on-accent transition-colors hover:bg-accent-2"
                  >
                    신청하기
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-[76px] shrink-0 text-text-mute">{label}</dt>
      <dd className={`min-w-0 flex-1 text-text-dim ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
