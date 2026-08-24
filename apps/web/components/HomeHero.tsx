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
 * 1280 미만에서는 이미지를 **배경으로** 깐다(2026-08-24 Victor — "이미지들이 다
 * 안 나온다"). 원래는 통째로 빼는 판단이었는데, 이 앱의 이미지는 이 한 장뿐이라
 * 폰에서는 사이트 전체에 사진이 0장이 됐다. 갤럭시 Z 폴드는 펼쳐도 1280 미만이라
 * 큰 화면에서도 안 나왔다.
 *
 * 옆에 나란히 두지 않고 뒤에 까는 이유: 좁은 폭에서 이미지를 한 단으로 쌓으면 그만큼
 * 아래 추천 종목이 밀린다. 배경이면 높이를 한 픽셀도 더 먹지 않는다. 대신 글자가
 * 사진 위로 올라가므로 네이비를 덮어 대비를 지킨다.
 *
 * cta — 기본은 「검증 성적표」(/picks)다. **비로그인 랜딩에서는 그 링크가 벽이다**
 * (2026-08-24: 홈을 뺀 전 화면이 회원 전용이 됐다). 처음 온 사람에게 «눌러 봐야
 * 로그인 화면으로 튕기는 버튼»을 첫 화면에 두면 그게 첫인상이 된다. 그래서 랜딩은
 * 여기에 「무료로 시작하기」를 끼운다 — 컴포넌트는 하나로 두고 목적지만 갈린다.
 */
export function HomeHero({
  cta = { href: "/picks", label: "검증 성적표", labelTail: " 보기" },
}: {
  cta?: { href: string; label: string; labelTail?: string };
} = {}) {
  return (
    <section className="relative mb-8 overflow-hidden rounded-[16px] bg-navy px-6 py-8 xl:flex xl:h-[340px] xl:items-stretch xl:rounded-[18px] xl:p-0">
      {/* 1280 미만 — 사진을 뒤에 깔고 네이비로 덮는다. 높이를 늘리지 않는다. */}
      <div className="absolute inset-0 xl:hidden" aria-hidden>
        <Image
          src="/images/home/hero.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-[0.28]"
          priority
        />
        {/* 글자가 얹히는 왼쪽은 네이비를 거의 그대로 두고, 오른쪽으로 갈수록 사진을
            드러낸다. 균일하게 덮으면 사진이 «회색 얼룩»으로만 보인다. */}
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/85 to-navy/45" />
      </div>

      <div className="relative flex flex-col justify-center gap-[18px] xl:gap-[17px] xl:w-[720px] xl:shrink-0 xl:pl-14">
        <span className="self-start rounded-[999px] bg-on-navy/10 px-3.5 py-[7px] text-[12px] font-semibold uppercase tracking-[0.6px] text-on-navy-2">
          VICTOR @ VECTA
          <span className="hidden sm:inline"> · 종목 리서치 터미널</span>
        </span>

        {/* h1 이 아니라 p 다. 홈의 h1 은 판정 블록의 「살 만한 종목 N개」 하나뿐이다
            (app/page.tsx). 여기가 h1 이면 비로그인일 때 h1 이 둘이 되고, 로그인하면
            히어로가 숨겨지며 h1 이 통째로 사라진다 — 둘 다 틀렸다.
            이건 브랜드 카피이지 이 화면의 주제가 아니다. 크기는 그대로 둔다. */}
        <p className="text-[28px] font-bold leading-[1.32] tracking-[-0.6px] text-on-navy xl:w-[600px] xl:text-[38px] xl:leading-[1.25] xl:tracking-[-1px]">
          감이 아니라 근거로,
          <br />
          오늘 살 종목을 고릅니다
        </p>

        <p className="text-[14.5px] leading-[1.8] text-on-navy-2 xl:w-[560px] xl:text-[15px] xl:leading-[1.75]">
          백테스트를 통과한 전략만 추천에 올립니다. 진입가·손절가·본전 도달가까지 계산해
          <br className="hidden xl:inline" />
          붙이고, 맞은 것과 틀린 것을 모두 기록으로 남깁니다.
        </p>

        {/* CTA 는 하나다. 예전엔 「오늘의 추천 보기」(/focus)가 여기 같이 있었는데,
            바로 아래 판정 블록의 「오늘의 픽 보기」도 같은 /focus 로 간다 — 같은 곳으로
            가는 버튼을 «추천»과 «픽» 두 이름으로 34px 간격에 두 번 둔 셈이었다
            (2026-08-22 실측). 히어로(8/20)와 판정 블록(8/22)이 이틀 간격으로 따로
            만들어지며 생긴 중복이다.
            역할을 갈랐다 — 히어로는 «왜 믿나»만 말하고, «오늘 뭘 사나»는 판정 블록이
            건수까지 붙여 답한다. 그래서 남긴 버튼은 검증 쪽이고, 하나뿐이니 채운다.
            ⚠️ 링크는 /strategies 가 아니라 /picks 다 — 8개 메뉴의 「성과」가 /picks 이고,
            /strategies 는 메뉴에 없어 한 번 들어가면 되돌아올 길이 없었다. */}
        <div className="flex flex-wrap items-center gap-[11px] pt-1 xl:pt-0.5">
          <Link
            href={cta.href}
            className="inline-flex min-h-10 items-center rounded-[9px] bg-accent px-6 text-[14px] font-semibold text-on-navy transition-colors duration-200 hover:bg-accent-2"
          >
            {cta.label}
            {cta.labelTail && (
              <span className="hidden sm:inline">{cta.labelTail}</span>
            )}
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
