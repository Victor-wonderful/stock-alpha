import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { getMyExpert } from "@/lib/expert";
import { saveProfile } from "@/app/expert/actions";

/**
 * 필명·소개.
 *
 * 이 코너의 카드는 «누가 말했나»가 근거의 전부다. 그래서 이름이 곧 신뢰의 단위이고,
 * 그 이름은 글쓴이가 직접 정해야 한다(2026-08-24 Victor). 본명을 강제하지 않는다.
 *
 * 공개 아이디(handle)를 따로 두는 이유: 필명은 한글이어도 되지만 주소에는 못 넣는다.
 * 그리고 이 값은 **익명 키로도 읽히는 공개 값**이라 이메일에서 따오면 안 된다 —
 * 첫 등록 때 실제로 이메일 앞부분이 들어갔고, 이 화면이 그걸 고치는 자리다.
 */
export const metadata = { title: "필명·소개 — VECTA Stock" };

const FIELD =
  "mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent";
const LABEL = "block text-[13px] font-semibold text-text";

export default async function ExpertProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const expert = await getMyExpert();
  if (!expert) redirect("/expert");
  const { error } = await searchParams;

  return (
    <AppShell
      title="필명·소개"
      subtitle="추천 카드에 보이는 이름입니다. 본명일 필요는 없습니다 — 읽는 사람에게 근거는 «누가 말했나»뿐이라, 이름은 계속 같아야 합니다."
    >
      <Link
        href="/expert"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />내 추천
      </Link>

      {error && (
        <div className="mt-4 flex max-w-[560px] gap-2.5 rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-bad" aria-hidden />
          <p className="text-[13px] leading-[1.7] text-text">{error}</p>
        </div>
      )}

      <form action={saveProfile} className="mt-5 max-w-[560px] space-y-5">
        <section className="space-y-4 rounded-[12px] border border-border bg-surface p-5">
          <div>
            <label className={LABEL} htmlFor="name">
              필명 <span className="font-normal text-text-mute">카드에 이 이름이 보입니다</span>
            </label>
            <input
              id="name"
              name="name"
              defaultValue={expert.name}
              maxLength={20}
              required
              placeholder="예: 남산자산"
              className={FIELD}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="handle">
              공개 아이디{" "}
              <span className="font-normal text-text-mute">영문 소문자·숫자·하이픈</span>
            </label>
            <input
              id="handle"
              name="handle"
              defaultValue={expert.handle}
              maxLength={20}
              required
              placeholder="namsan"
              className={`${FIELD} font-mono`}
            />
            <p className="mt-1.5 text-[11.5px] leading-[1.6] text-text-mute">
              주소와 언급에 쓰이는 값이라 누구나 볼 수 있습니다.{" "}
              <span className="text-warn">이메일에서 따온 값은 바꿔 두세요.</span>
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="headline">
              한 줄 소개 <span className="font-normal text-text-mute">40자 이내 · 선택</span>
            </label>
            <input
              id="headline"
              name="headline"
              defaultValue={expert.headline ?? ""}
              maxLength={40}
              placeholder="방산·조선 15년"
              className={FIELD}
            />
            <p className="mt-1.5 text-[11.5px] text-text-mute">
              필명 아래 작게 붙습니다. 자격·수익률을 내세우는 문구는 쓰지 않습니다.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="bio">
              자기소개 <span className="font-normal text-text-mute">선택</span>
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              defaultValue={expert.bio ?? ""}
              placeholder="어떤 것을 오래 봐 왔는지, 무엇을 보지 않는지."
              className={`${FIELD} leading-[1.7]`}
            />
          </div>
        </section>

        <button
          type="submit"
          className="rounded-[9px] bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
        >
          저장
        </button>
      </form>
    </AppShell>
  );
}
