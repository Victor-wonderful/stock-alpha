"""인제스트 소스 공통 인터페이스."""
from __future__ import annotations

from abc import ABC, abstractmethod


class Source(ABC):
    """데이터 소스 어댑터. fetch → 정규화 → 대상 테이블 행 리스트 반환."""

    name: str = "base"
    target_table: str = ""

    @abstractmethod
    def fetch(self, **kwargs) -> list[dict]:
        """원천에서 데이터를 가져와 대상 테이블 스키마에 맞춘 dict 리스트로 반환."""
        raise NotImplementedError
