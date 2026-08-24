"""마이그레이션 파일을 운영 DB 에 적용한다.

`supabase db push` 는 링크된 프로젝트의 **미적용분 전부**를 밀어 올린다. 한두 파일만
올리고 싶을 때가 많아(그리고 무엇이 나갈지 눈으로 보고 싶어) 파일을 명시해 넣는다.

사용:
    python scripts/apply_sql.py supabase/migrations/0042_blog_posts.sql

연결 정보는 apps/engine/.env.local 의 SUPABASE_DB_URL 을 쓴다(출력하지 않는다).
한 트랜잭션으로 넣고, 하나라도 실패하면 전부 되돌린다.
"""

from __future__ import annotations

import io
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_env(path: pathlib.Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in io.open(path, encoding="utf-8-sig"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    try:
        import psycopg
    except ImportError:
        print("psycopg 가 없습니다 — apps/engine 의 가상환경 파이썬으로 실행하세요.")
        return 1

    dsn = load_env(ROOT / "apps" / "engine" / ".env.local").get("SUPABASE_DB_URL")
    if not dsn:
        print("SUPABASE_DB_URL 을 찾지 못했습니다 (apps/engine/.env.local)")
        return 1

    files = [pathlib.Path(a) if pathlib.Path(a).is_absolute() else ROOT / a for a in argv]
    for f in files:
        if not f.exists():
            print(f"파일이 없습니다: {f}")
            return 1

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            for f in files:
                cur.execute(io.open(f, encoding="utf-8").read())
                print(f"적용: {f.name}")
        conn.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
