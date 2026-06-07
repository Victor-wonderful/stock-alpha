-- ╔══════════════════════════════════════════════════════════════╗
-- ║ 0001 — 확장 + 공유 ENUM 타입                                    ║
-- ╚══════════════════════════════════════════════════════════════╝
-- 스키마 단일 출처. 변경은 새 마이그레이션 파일 추가로만.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- 종목 검색

-- ── 투자 스타일 (1급 차원) ──
create type trade_style as enum ('scalping', 'day', 'swing', 'position');

-- ── 시그널 방향 ──
create type signal_kind as enum ('buy', 'sell', 'hold');

-- ── 구독 티어 ──
create type sub_tier as enum ('free', 'pro', 'premium', 'bot');

-- ── 리포트 종류 ──
create type report_kind as enum ('indepth', 'market', 'portfolio', 'custom');

-- ── 재무제표 구분 ──
create type fs_kind as enum ('consolidated', 'separate');   -- 연결 / 별도

-- ── 자산 유형 ──
create type asset_kind as enum ('stock', 'etf', 'index');

-- 공통: updated_at 자동 갱신 트리거 함수
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
