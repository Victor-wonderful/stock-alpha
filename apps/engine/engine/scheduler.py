"""시장시간 인지 스케줄러 — 인제스트·분석·시그널 주기 실행.

골격: 실제 cron 스케줄(EOD 재무, 일중 시세, 실시간 틱)은 M2~M5 에서 채운다.
docker-compose 의 engine 서비스가 이 모듈을 기동한다.
"""
from __future__ import annotations

import time

from engine.logging import configure_logging, get_logger

log = get_logger("scheduler")


def main() -> None:
    configure_logging()
    log.info("scheduler.start", note="골격 — 작업 등록은 M2~M5 에서 구현")
    try:
        while True:
            # TODO(M2): 시장시간 판단 → 인제스트/분석/시그널 디스패치
            time.sleep(60)
    except KeyboardInterrupt:
        log.info("scheduler.stop")


if __name__ == "__main__":
    main()
