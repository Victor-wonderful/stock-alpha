import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LEGAL_EFFECTIVE, LEGAL_VERSION } from "@/lib/legal";

/**
 * 약관·방침 문서의 공통 틀.
 *
 * 이 화면들은 «읽히게» 만들어야 한다. 법적 고지를 회색 6px 글씨로 깔아 두는 관행이
 * 있는데, 그건 동의를 받아 두려는 것이지 알리려는 것이 아니다. 본문 15px · 행간 1.9 ·
 * 74자 폭으로, 이 사이트의 다른 글과 같은 읽기 조건을 준다.
 *
 * 시행일과 버전을 머리에 박는다 — 나중에 «어느 판에 동의했나»를 사람이 눈으로
 * 확인할 수 있어야 한다(가입 기록에는 버전이 저장된다).
 */
export function LegalDoc({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[820px] px-6 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        홈
      </Link>

      <h1 className="mt-5 text-[26px] font-bold leading-[1.35] tracking-[-0.6px] text-text">
        {title}
      </h1>
      <p className="mt-3 max-w-[70ch] text-[13.5px] leading-[1.8] text-text-dim">{intro}</p>
      <p className="tnum mt-3 text-[12px] text-text-mute">
        판 {LEGAL_VERSION} · 시행일 {LEGAL_EFFECTIVE}
      </p>

      <div className="mt-9 space-y-9">{children}</div>

      <p className="mt-12 border-t border-border-soft pt-6 text-[12px] leading-[1.8] text-text-mute">
        이 문서는 서비스가 실제로 하는 일을 근거로 작성한 것입니다. 사업자 정보 등
        「확정 후 기재」로 표시된 항목은 값이 정해지는 대로 채웁니다.
      </p>
    </main>
  );
}

/** 조(條) 하나. 제목이 없는 문단 덩어리를 만들지 않는다 — 찾아 읽을 수 없다. */
export function Article({
  no,
  title,
  children,
}: {
  no: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[16.5px] font-bold leading-[1.5] text-text">
        <span className="tnum mr-2 text-text-mute">{no}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-[1.9] text-text-dim">
        {children}
      </div>
    </section>
  );
}

/** 번호 없는 목록 — 조 안의 항목. */
export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            className="mt-[11px] h-[3px] w-[3px] shrink-0 rounded-full bg-accent"
            aria-hidden
          />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** 표 — 수집 항목·위탁처럼 «항목과 이유»가 짝인 것. 문장으로 늘어놓으면 못 찾는다. */
export function LegalTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left text-[12.5px] font-semibold text-text-mute"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border-soft align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-3 leading-[1.7] text-text-dim">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
