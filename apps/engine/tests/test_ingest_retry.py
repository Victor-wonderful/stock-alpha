"""인제스트 재시도 오케스트레이터 검증 — 부분 적재 완화 (네트워크 없음)."""
from __future__ import annotations

from engine.ingest.runner import _run_with_retries


def test_no_retry_when_all_succeed():
    calls = {"n": 0}

    def attempt(batch):
        calls["n"] += 1
        return len(batch), []

    total, failed = _run_with_retries([1, 2, 3], attempt, retries=3)
    assert total == 3 and failed == []
    assert calls["n"] == 1            # 첫 시도에 끝 — 재시도 없음


def test_succeeds_after_transient_failure():
    calls = {"n": 0}

    def attempt(batch):
        calls["n"] += 1
        if calls["n"] == 1:
            return 2, list(batch[2:])  # 앞 2개 성공, 뒤는 실패
        return len(batch), []          # 재시도분 전부 성공

    total, failed = _run_with_retries([1, 2, 3, 4], attempt, retries=2)
    assert total == 4 and failed == []
    assert calls["n"] == 2             # 1차 + 재시도 1회


def test_exhausts_retries_and_reports_failed():
    seen: list[int] = []

    def attempt(batch):
        return 0, list(batch)          # 항상 전량 실패

    total, failed = _run_with_retries(
        [1, 2, 3], attempt, retries=2, on_retry=lambda n, fl: seen.append(n)
    )
    assert total == 0 and failed == [1, 2, 3]
    assert seen == [1, 2]              # 재시도 정확히 2회 후 포기


def test_accumulates_rows_across_attempts():
    calls = {"n": 0}

    def attempt(batch):
        calls["n"] += 1
        # 매 시도마다 첫 1개만 성공(1행), 나머지는 다음 시도로
        if not batch:
            return 0, []
        return 1, list(batch[1:])

    total, failed = _run_with_retries([1, 2, 3], attempt, retries=1)
    # 1차 +1(남[2,3]), 재시도 1회 +1(남[3]) → retries 소진 → 총 2행, 실패 [3]
    assert total == 2 and failed == [3]
