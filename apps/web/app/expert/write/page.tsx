import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { getMyExpert, getMyExpertNote } from "@/lib/expert";
import { saveNote } from "@/app/expert/actions";
import { BODY_SECTIONS, HORIZONS } from "@/lib/expert-form";
import { SymbolPicker } from "./_symbol";

/**
 * 추천 쓰기 — 전문가가 글을 넣는 유일한 길.
 *
 * 여태 이 길이 없었다. 0040 이 표를 정의해 두고도 한 편도 안 쌓인 이유가 그것이다
 * (게다가 표는 운영 DB 에 적용조차 안 돼 있었다 — 2026-08-24).
 *
 * 본문을 자유 서술로 두지 않고 세 칸으로 가른 이유: 「좋아 보인다」만 적힌 추천이
 * 가장 나쁘다. 특히 「무엇이 틀리면 접나」는 필수다 — 이 코너는 성적을 추적하지
 * 않으므로, 접는 조건이 글에 없으면 읽는 사람은 손을 뗄 시점을 영영 알 수 없다.
 */
export const metadata = { title: "추천 쓰기 — VECTA Stock" };

/** «오늘» 은 서버의 오늘이 아니라 한국의 오늘이다(운영 서버는 UTC, 개발 PC 는 MSK). */
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

const INPUT =
  "w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent";
const LABEL = "block text-[13px] font-semibold text-text";

export default async function ExpertWritePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const expert = await getMyExpert();
  if (!expert) redirect("/expert");

  const { id, error } = await searchParams;
  const note = id ? await getMyExpertNote(expert.id, Number(id)) : null;

  const bodyOf = (label: string): string => {
    if (!note?.body) return "";
    const m = note.body.split(/^## /m).find((s) => s.startsWith(label));
    return m ? m.slice(label.length).trim() : "";
  };

  return (
    <AppShell
      title={note ? "추천 고치기" : "추천 쓰기"}
      subtitle="네 칸을 채우면 글이 됩니다. 「무엇이 틀리면 접나」는 반드시 적어 주세요 — 접는 조건이 없는 추천은 싣지 않습니다."
      badge={
        <span className="rounded-[999px] bg-on-navy/10 px-2.5 py-1 text-[10px] font-semibold text-on-navy-2">
          {expert.name}
        </span>
      }
    >
      <Link
        href="/expert"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        내 추천
      </Link>

      {error && (
        <p className="mt-4 max-w-[720px] rounded-[10px] border border-bad/30 bg-bad-soft px-4 py-3 text-[13px] text-bad">
          {error}
        </p>
      )}

      <form action={saveNote} className="mt-5 max-w-[720px] space-y-6">
        {note && <input type="hidden" name="id" value={note.id} />}

        <section className="rounded-[12px] border border-border bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className={LABEL}>종목</label>
              <div className="mt-1.5">
                <SymbolField note={note} />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="stance">
                입장
              </label>
              <select
                id="stance"
                name="stance"
                defaultValue={note?.stance ?? "buy"}
                className={`mt-1.5 ${INPUT}`}
              >
                <option value="buy">산다</option>
                <option value="watch">본다</option>
              </select>
              <p className="mt-1.5 text-[11.5px] text-text-mute">
                「산다」는 진입가·손절가가 필요합니다
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className={LABEL} htmlFor="summary">
              한 줄 요약{" "}
              <span className="font-normal text-text-mute">목록에는 이 문장만 보입니다</span>
            </label>
            <input
              id="summary"
              name="summary"
              defaultValue={note?.summary ?? ""}
              maxLength={120}
              placeholder="원가 부담이 꺾이는 첫 분기라고 봅니다"
              className={`mt-1.5 ${INPUT}`}
            />
          </div>
        </section>

        {/* ── 가격 레벨 ──
            2026-08-24 Victor 지적으로 들어왔다. 레벨 없는 추천은 읽는 사람이 실행할 수
            없고, 손절 없이 사게 만든다. 목표가만 선택인 이유는 엔진 픽에서 목표 도달이
            30건 중 0건이었기 때문이다 — 목표는 파는 트리거로 잘 작동하지 않는다. */}
        <section className="rounded-[12px] border border-border bg-surface p-5">
          <h2 className="text-[13px] font-bold text-text">얼마에 사고, 어디서 접나</h2>
          <p className="mt-1 text-[11.5px] text-text-mute">
            쉼표를 써도 됩니다(125,400). 손절가는 진입가보다 낮아야 합니다.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {[
              { name: "entry_price", label: "진입가", v: note?.entryPrice, hint: "필수(산다)" },
              { name: "stop_loss", label: "손절가", v: note?.stopLoss, hint: "필수(산다)" },
              { name: "target_price", label: "목표가", v: note?.targetPrice, hint: "선택" },
            ].map((f) => (
              <div key={f.name}>
                <label className={LABEL} htmlFor={f.name}>
                  {f.label} <span className="font-normal text-text-mute">{f.hint}</span>
                </label>
                <input
                  id={f.name}
                  name={f.name}
                  inputMode="numeric"
                  defaultValue={f.v != null ? String(f.v) : ""}
                  className={`tnum mt-1.5 ${INPUT}`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[12px] border border-border bg-surface p-5">
          <h2 className="text-[13px] font-bold text-text">본문</h2>
          <div className="mt-3 space-y-4">
            {BODY_SECTIONS.map((s, i) => {
              const must = s.key === "invalidate";
              return (
                <div
                  key={s.key}
                  className={
                    must
                      ? "rounded-[10px] border border-warn/30 bg-warn-soft p-3.5"
                      : undefined
                  }
                >
                  <label className={LABEL} htmlFor={`body_${s.key}`}>
                    {i + 1}. {s.label}{" "}
                    <span className="font-normal text-text-mute">
                      {must ? "필수" : s.hint}
                    </span>
                  </label>
                  <textarea
                    id={`body_${s.key}`}
                    name={`body_${s.key}`}
                    rows={must ? 2 : 3}
                    defaultValue={bodyOf(s.label)}
                    placeholder={must ? s.hint : undefined}
                    className={`mt-1.5 ${INPUT} leading-[1.7]`}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="horizon_note">
                얼마나 볼 건가
              </label>
              <select
                id="horizon_note"
                name="horizon_note"
                defaultValue={note?.horizonNote ?? "몇 주"}
                className={`mt-1.5 ${INPUT}`}
              >
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="tags">
                태그 <span className="font-normal text-text-mute">쉼표로 구분 · 최대 5개</span>
              </label>
              <input
                id="tags"
                name="tags"
                defaultValue={note?.tags.join(", ") ?? ""}
                placeholder="음식료, 중국 소비"
                className={`mt-1.5 ${INPUT}`}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-4 rounded-[12px] border border-border bg-surface p-5">
          <div>
            <label className={LABEL} htmlFor="as_of">
              추천한 날
            </label>
            <input
              id="as_of"
              name="as_of"
              type="date"
              defaultValue={note?.asOf ?? todayKST()}
              className={`tnum mt-1.5 ${INPUT}`}
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-text">
            <input
              type="checkbox"
              name="publish"
              defaultChecked={note ? note.published : true}
              className="h-4 w-4 accent-accent"
            />
            바로 발행
          </label>
          <button
            type="submit"
            className="ml-auto self-end rounded-[9px] bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
          >
            {note ? "고쳐서 저장" : "저장"}
          </button>
        </section>

        <p className="text-[11.5px] leading-relaxed text-text-mute">
          목표 수익률·기간 수익을 약속하는 문장은 쓰지 않습니다. 이 코너의 글은 참여
          전문가 개인의 의견이며 시스템 검증(백테스트 게이트)을 거치지 않습니다.
        </p>
      </form>
    </AppShell>
  );
}

/** 클라이언트 컴포넌트를 서버 페이지에서 쓰기 위한 얇은 껍데기. */
function SymbolField({ note }: { note: { instrumentId: number | null; name: string | null; symbol: string | null } | null }) {
  const label =
    note?.name && note?.symbol ? `${note.name} (${note.symbol})` : (note?.name ?? null);
  return <SymbolPicker defaultId={note?.instrumentId ?? null} defaultLabel={label} />;
}
