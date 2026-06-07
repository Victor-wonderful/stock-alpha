"""런타임 설정 — 환경변수에서 로드 (.env.local 우선)."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── 런타임 ──
    engine_env: str = Field(default="development")
    engine_log_level: str = Field(default="INFO")

    # ── Supabase (서버/워커는 service_role 로 RLS 우회 write) ──
    supabase_url: str = Field(default="", alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_db_url: str = Field(default="", alias="SUPABASE_DB_URL")

    # ── Claude ──
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    claude_report_model: str = Field(default="claude-opus-4-8", alias="CLAUDE_REPORT_MODEL")
    claude_summary_model: str = Field(default="claude-sonnet-4-6", alias="CLAUDE_SUMMARY_MODEL")

    # ── 데이터 소스 ──
    dart_api_key: str = Field(default="", alias="DART_API_KEY")
    fred_api_key: str = Field(default="", alias="FRED_API_KEY")
    ecos_api_key: str = Field(default="", alias="ECOS_API_KEY")
    fmp_api_key: str = Field(default="", alias="FMP_API_KEY")

    # ── KIS (실시간 / Phase 3) ──
    kis_app_key: str = Field(default="", alias="KIS_APP_KEY")
    kis_app_secret: str = Field(default="", alias="KIS_APP_SECRET")
    kis_env: str = Field(default="paper", alias="KIS_ENV")


@lru_cache
def get_settings() -> Settings:
    return Settings()
