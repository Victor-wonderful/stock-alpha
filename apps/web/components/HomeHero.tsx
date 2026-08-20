import Image from "next/image";
import Link from "next/link";

/**
 * 홈 히어로 — vecta-blog 의 `components/home/Hero.tsx` 와 같은 골격.
 * 좌 네이비 카피 / 우 이미지, 라운드 18. 데스크톱 높이는 340 — 블로그는 430 이지만
 * 여기는 매일 오는 도구라 첫 화면을 추천 종목에 내줘야 한다(아래 주석).
 * 두 사이트가 한 브랜드로 읽히도록 색·비율·버튼 형태를 맞췄다.
 *
 * 카피만 다르다. 블로그는 "글을 읽으러 오는 사람"에게 말하고,
 * 여기는 "오늘 뭘 살지 보러 오는 사람"에게 말한다.
 *
 * ⚠️ 첫 화면 비용: 블로그와 같은 430px 로 뒀더니 그 아래 추천 종목 표가 1440x900 에서
 * 접히는 선 밑으로 내려갔다(2026-08-20 실측). 블로그는 처음 온 사람을 설득하는 자리지만
 * 이 화면은 오늘 뭘 살지 확인하러 매일 오는 자리다 — 히어로가 상품을 가리면 안 된다.
 * 처음엔 260 까지 줄였는데 히어로가 배너처럼 납작해졌다(Victor 지적). 340 이면
 * 「추천 종목」 제목이 여전히 첫 화면에 걸리면서 히어로도 제 무게를 유지한다.
 * 높이를 줄일 때는 제목 46→38, 줄간격 22→17 도 같이 줄인다 — 높이만 줄이면
 * 안이 눌린 것처럼 보인다.
 * 1280 미만에서는 이미지를 빼고 높이를 내용에 맡긴다(블로그도 같은 판단).
 */
export function HomeHero() {
  return (
    <section className="mb-8 overflow-hidden rounded-[16px] bg-navy px-6 py-8 xl:flex xl:h-[340px] xl:items-stretch xl:rounded-[18px] xl:p-0">
      <div className="flex flex-col justify-center gap-[18px] xl:gap-[17px] xl:w-[720px] xl:shrink-0 xl:pl-14">
        <span className="self-start rounded-[999px] bg-on-navy/10 px-3.5 py-[7px] text-[12px] font-semibold uppercase tracking-[0.6px] text-on-navy-2">
          VICTOR @ VECTA
          <span className="hidden sm:inline"> · 종목 리서치 터미널</span>
        </span>

        <h1 className="text-[28px] font-bold leading-[1.32] tracking-[-0.6px] text-on-navy xl:w-[600px] xl:text-[38px] xl:leading-[1.25] xl:tracking-[-1px]">
          감이 아니라 근거로,
          <br />
          오늘 살 종목을 고릅니다
        </h1>

        <p className="text-[14.5px] leading-[1.8] text-on-navy-2 xl:w-[560px] xl:text-[15px] xl:leading-[1.75]">
          백테스트를 통과한 전략만 추천에 올립니다. 진입가·목표가·손절가까지 계산해
          <br className="hidden xl:inline" />
          붙이고, 맞은 것과 틀린 것을 모두 기록으로 남깁니다.
        </p>

        <div className="flex flex-wrap items-center gap-[11px] pt-1 xl:pt-0.5">
          <Link
            href="/focus"
            className="inline-flex min-h-10 items-center rounded-[9px] bg-accent px-6 text-[14px] font-semibold text-on-navy transition-colors duration-200 hover:bg-accent-2"
          >
            오늘의 추천<span className="hidden sm:inline"> 보기</span>
          </Link>
          <Link
            href="/strategies"
            className="inline-flex min-h-10 items-center rounded-[9px] border border-on-navy/25 px-6 text-[14px] font-semibold text-on-navy transition-colors duration-200 hover:border-on-navy"
          >
            검증 성적표
          </Link>
        </div>

        {/* 기준일·추천 건수는 여기 두지 않는다. 바로 아래 '공격 구간, N종목' 블록이
            같은 날짜와 같은 숫자를 100px 아래에서 다시 말한다(2026-08-20 실측).
            같은 화면에서 같은 사실을 두 번 말하면 둘 다 신뢰를 잃는다. */}
      </div>

      {/* 폭을 고정하지 않는다. 블로그는 컨테이너가 정확히 1320(=720+600)이라 600 고정이
          딱 맞지만, 이 앱의 본문은 max-w-1440 에 좌우 padding 28 이라 1384 다.
          600 으로 못박으면 남는 64px 이 네이비 맨살로 드러난다(2026-08-20 실측).
          좌측 카피만 720 으로 고정하고 이미지가 나머지를 전부 먹게 둔다. */}
      <div className="relative hidden xl:block xl:h-[340px] xl:flex-1">
        <Image
          src="/images/home/hero.webp"
          alt="상승하는 차트 선의 정점을 손끝으로 짚는 장면"
          fill
          sizes="(min-width: 1280px) 50vw, 100vw"
          className="object-cover"
          priority
        />
      </div>
    </section>
  );
}
