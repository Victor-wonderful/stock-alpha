"""전문가 코너 준비 — 마이그레이션 적용 + 전문가 등록.

왜 스크립트인가: 이 저장소는 `supabase db push` 를 쓸 수 있지만, 그건 링크된 프로젝트
전체를 밀어 올린다. 여기서는 **두 파일만** 올리면 되고, 이어서 「전문가 한 명 등록」까지
같은 연결에서 끝내는 편이 낫다(등록은 auth.users 를 봐야 해서 REST 로는 못 한다).

사용:
    python scripts/setup_expert_corner.py                       # 마이그레이션만
    python scripts/setup_expert_corner.py --email me@x.com \\
        --name "홍길동" --headline "방산·조선 15년"             # 전문가로 등록까지

연결 정보는 apps/engine/.env.local 의 SUPABASE_DB_URL 을 쓴다(출력하지 않는다).
같은 명령을 여러 번 돌려도 안전하다 — SQL 은 전부 if not exists 이고, 등록은 upsert 다.
"""

from __future__ import annotations

import argparse
import io
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS = [
    ROOT / "supabase" / "migrations" / "0040_expert_recommendations.sql",
    ROOT / "supabase" / "migrations" / "0041_expert_authoring.sql",
]


def load_env(path: pathlib.Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in io.open(path, encoding="utf-8-sig"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", help="전문가로 등록할 로그인 계정(auth.users 의 이메일)")
    ap.add_argument("--name", help="화면에 보이는 이름 = 필명(본명일 필요 없다)")
    ap.add_argument(
        "--handle",
        help="공개 아이디(영문 소문자·숫자·하이픈). 익명 키로도 읽히는 값이라 "
        "이메일에서 따오지 않는다 — 생략하면 물어보지 않고 막는다.",
    )
    ap.add_argument("--headline", default=None, help='한 줄 소개 (예: "방산·조선 15년")')
    args = ap.parse_args()

    try:
        import psycopg
    except ImportError:
        print("psycopg 가 없습니다 — apps/engine 의 가상환경 파이썬으로 실행하세요.")
        return 1

    dsn = load_env(ROOT / "apps" / "engine" / ".env.local").get("SUPABASE_DB_URL")
    if not dsn:
        print("SUPABASE_DB_URL 을 찾지 못했습니다 (apps/engine/.env.local)")
        return 1

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            for f in MIGRATIONS:
                cur.execute(io.open(f, encoding="utf-8").read())
                print(f"적용: {f.name}")
        conn.commit()

        if args.email:
            if not args.name:
                print("--name 이 필요합니다.")
                return 1
            handle = args.handle
            if not handle:
                # 첫 등록 때 이메일 앞부분을 넣었다가 그대로 공개됐다(2026-08-24).
                # 공개 값이므로 사람이 고른 것만 받는다.
                print("--handle 이 필요합니다 (공개 아이디, 예: --handle namsan)")
                return 1
            import re

            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,19}", handle):
                print("--handle 은 영문 소문자·숫자·하이픈 2~20자여야 합니다.")
                return 1
            with conn.cursor() as cur:
                cur.execute("select id from auth.users where email = %s", (args.email,))
                row = cur.fetchone()
                if not row:
                    print(f"그 이메일로 가입된 계정이 없습니다: {args.email}")
                    print("먼저 웹에서 /login 으로 가입한 뒤 다시 실행하세요.")
                    return 1
                uid = row[0]
                # 같은 사람을 두 번 만들지 않는다 — handle 이 자연키다.
                cur.execute(
                    """
                    insert into experts (handle, name, headline, user_id)
                    values (%s, %s, %s, %s)
                    on conflict (handle) do update
                       set name = excluded.name,
                           headline = coalesce(excluded.headline, experts.headline),
                           user_id = excluded.user_id
                    returning id
                    """,
                    (handle, args.name, args.headline, uid),
                )
                print(f"전문가 등록: {args.name} (handle={handle}, id={cur.fetchone()[0]})")
            conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                "select count(*) from information_schema.columns"
                " where table_schema='public' and table_name='expert_notes'"
            )
            print(f"expert_notes 컬럼 {cur.fetchone()[0]}개")
            cur.execute("select count(*) from experts")
            print(f"등록된 전문가 {cur.fetchone()[0]}명")

    return 0


if __name__ == "__main__":
    sys.exit(main())
