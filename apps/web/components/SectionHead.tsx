import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * 섹션 헤더 — vecta-blog 의 `components/SectionHead.tsx` 와 같은 형태.
 * 제목 아래 인디고 밑줄 40x3, 우측에 인디고 링크 + 화살표. 좌우가 바닥선에서 맞물린다.
 * 두 사이트가 같은 리듬으로 읽히도록 값을 그대로 옮겼다.
 */
export function SectionHead({
  title,
  sub,
  href,
  linkLabel = "전체 보기",
}: {
  title: string;
  sub?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[20px] font-bold leading-[1.3] tracking-[-0.4px] text-text xl:text-[26px] xl:tracking-[-0.7px]">
          {title}
        </h2>
        <div className="mt-2.5 h-[3px] w-10 rounded-[2px] bg-accent" aria-hidden />
        {sub && <p className="mt-3 text-[12.5px] text-text-mute">{sub}</p>}
      </div>
      {href &&
        // 홈 3섹션의 링크는 블로그(다른 오리진)로 나간다. next/link 는 내부 라우팅용이라
        // 외부 절대 URL 이면 평범한 <a> 로 내보낸다.
        (/^https?:\/\//.test(href) ? (
          <a
            href={href}
            className="inline-flex shrink-0 items-center gap-1.5 text-[13.5px] font-semibold text-accent transition-colors duration-200 hover:text-navy"
          >
            {linkLabel}
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </a>
        ) : (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1.5 text-[13.5px] font-semibold text-accent transition-colors duration-200 hover:text-navy"
          >
            {linkLabel}
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        ))}
    </div>
  );
}
