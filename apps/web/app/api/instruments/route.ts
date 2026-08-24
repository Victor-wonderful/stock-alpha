import { NextResponse } from "next/server";

import { findInstruments } from "@/lib/expert";
import { getMyExpert } from "@/lib/expert";

/**
 * 종목 찾기 — 작성 폼의 종목 칸이 쓴다.
 *
 * 로그인한 전문가에게만 답한다. 종목 목록 자체는 공개 데이터라 감출 것은 아니지만,
 * 이 경로는 «작성 도구»의 일부다. 열어 둘 이유가 없으면 열지 않는다.
 */
export async function GET(req: Request) {
  const expert = await getMyExpert();
  if (!expert) return NextResponse.json({ hits: [] }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const hits = await findInstruments(q);
  return NextResponse.json({ hits });
}
