import Link from "next/link";

import { AppShell } from "@/components/AppShell";

// 워치리스트 — 회원 전용(watchlists 테이블 · RLS: 본인만 조회).
// 로그인/CRUD 백엔드 연결 전까지는 V3 레이아웃 미리보기(예시 데이터)로 제공.
const PREVIEW = [
  { name: "SK스퀘어", symbol: "402340", price: "157,400", chg: "+2.1%", up: true, rating: "매수", score: 72, setup: "52주 신고가", bell: true, badge: "오늘의 픽" },
  { name: "SK하이닉스", symbol: "000660", price: "301,500", chg: "+0.8%", up: true, rating: "매수", score: 78, setup: "주도주 추세", bell: true, badge: null },
  { name: "삼성전자", symbol: "005930", price: "84,300", chg: "-1.2%", up: false, rating: "중립", score: 64, setup: null, bell: true, badge: "판정 상향" },
  { name: "신세계", symbol: "004170", price: "172,900", chg: "-0.4%", up: false, rating: "중립", score: 61, setup: "눌림목", bell: false, badge: null },
  { name: "NAVER", symbol: "035420", price: "178,200", chg: "-1.8%", up: false, rating: "관망", score: 44, setup: null, bell: false, badge: null },
];

export default function WatchlistPage() {
  return (
    <AppShell
      title="워치리스트"
      subtitle="관심 종목의 판정·시그널·픽 변화를 한곳에서 — 변화가 있던 종목이 위로 올라옵니다"
      badge={
        <span className="rounded-[999px] bg-warn-soft px-3 py-1 text-[11px] font-semibold text-warn">
          로그인 기능 준비 중 — 아래는 예시 화면
        </span>
      }
    >
      <div className="space-y-4">
        {/* 오늘의 변화 (예시) */}
        <section className="rounded-[20px] border border-accent/50 bg-surface px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-bold text-text">오늘의 변화</h2>
            <span className="text-[10px] text-text-mute">16:30 일일 배치 기준 · 예시</span>
          </div>
          <div className="space-y-2">
            {[
              { icon: "★", tone: "text-accent", nm: "SK스퀘어", desc: "오늘의 픽 1위로 선정 — 52주 신고가 셋업" },
              { icon: "⚡", tone: "text-good", nm: "SK하이닉스", desc: "신규 시그널 발생 — 주도주 추세 (스윙)" },
              { icon: "↕", tone: "text-warn", nm: "삼성전자", desc: "판정 변경: 관망 → 중립 — 업황 회복 신호 반영" },
            ].map((c) => (
              <div key={c.nm} className="flex items-center gap-3 rounded-[12px] bg-surface-2 px-3.5 py-2.5">
                <span className={`text-sm ${c.tone}`}>{c.icon}</span>
                <span className="text-[13px] font-bold text-text">{c.nm}</span>
                <span className="text-xs text-text-dim">{c.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 워치리스트 테이블 (예시) */}
        <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                  <th className="py-2 pl-1 text-left font-medium">종목</th>
                  <th className="px-3 py-2 text-right font-medium">현재가</th>
                  <th className="px-3 py-2 text-right font-medium">등락률</th>
                  <th className="px-3 py-2 text-center font-medium">AI 판정 · 점수</th>
                  <th className="px-3 py-2 text-left font-medium">활성 시그널</th>
                  <th className="px-3 py-2 text-center font-medium">알림</th>
                  <th className="px-3 py-2 text-right font-medium">메모</th>
                </tr>
              </thead>
              <tbody>
                {PREVIEW.map((r) => (
                  <tr key={r.symbol} className="border-b border-border/50 last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 pl-1">
                      <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-surface-3 align-middle text-[9px] font-bold text-text-dim">
                        {r.name.slice(0, 1)}
                      </span>
                      <Link href={`/stocks/${r.symbol}`} className="font-medium text-text hover:text-accent">
                        {r.name}
                      </Link>
                      <span className="mono ml-2 text-2xs text-text-mute">{r.symbol}</span>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-text">{r.price}원</td>
                    <td className={`tnum px-3 py-2.5 text-right font-semibold ${r.up ? "text-good" : "text-bad"}`}>{r.chg}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`mr-1.5 rounded-[999px] px-2 py-0.5 text-[10px] font-bold ${
                          r.rating === "매수"
                            ? "bg-accent text-[#0B0C10]"
                            : r.rating === "중립"
                              ? "bg-surface-3 text-text-dim"
                              : "border border-border text-text-mute"
                        }`}
                      >
                        {r.rating}
                      </span>
                      <span className="tnum text-[13px] font-bold text-text">{r.score}점</span>
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      {r.setup ? (
                        <span className="rounded-[999px] bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-text-dim">{r.setup}</span>
                      ) : (
                        <span className="text-2xs text-text-mute">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">{r.bell ? "🔔" : <span className="opacity-30">🔕</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {r.badge && (
                        <span className="rounded-[999px] bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">{r.badge}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-text-mute">
            워치리스트는 회원 전용 데이터 — 본인만 조회 가능(RLS) · 알림 ON 종목은 시그널·판정 변경 시 발송(준비 중)
          </p>
        </section>
      </div>
    </AppShell>
  );
}
