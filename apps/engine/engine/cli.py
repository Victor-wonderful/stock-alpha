"""엔진 CLI — 인제스트/분석/시그널/리포트 작업 진입점.

예) python -m engine.cli levels-demo --style swing
"""
from __future__ import annotations

import typer

from engine.logging import configure_logging, get_logger
from engine.signals.levels import compute_levels
from engine.signals.styles import STYLES

app = typer.Typer(help="Stock-Alpha 엔진 CLI", no_args_is_help=True)
log = get_logger("cli")


@app.callback()
def _init() -> None:
    configure_logging()


@app.command()
def ingest(
    target: str = typer.Argument(..., help="prices|flows|fundamentals|macro|news|realtime"),
    market: str = typer.Option("kr", help="kr|us"),
    days: int = typer.Option(30, help="조회 기간(일)"),
    year: str = typer.Option("2024", help="재무 회계연도(fundamentals)"),
    workers: int = typer.Option(12, help="prices 병렬 fetch 워커 수"),
) -> None:
    """데이터 인제스트 (M2). 현재 KRX prices/flows/fundamentals 구현."""
    from engine.ingest import runner

    if market == "kr" and target == "prices":
        n = runner.ingest_krx_prices(days=days, workers=workers)
    elif market == "kr" and target == "flows":
        n = runner.ingest_krx_flows(days=days)
    elif market == "kr" and target == "fundamentals":
        n = runner.ingest_krx_financials(year=year)
    else:
        log.info("ingest", target=target, market=market, status="not_implemented")
        return
    typer.echo(f"ingested rows: {n}")


@app.command("seed-universe")
def seed_universe(
    markets: str = typer.Option("KOSPI,KOSDAQ", help="쉼표구분 시장: KOSPI,KOSDAQ"),
) -> None:
    """유니버스 시드 — 네이버 시총 목록에서 전 종목 instruments 적재."""
    from engine.ingest import universe

    ms = tuple(m.strip().upper() for m in markets.split(",") if m.strip())
    n = universe.seed_universe(ms)
    typer.echo(f"seeded instruments: {n}")


@app.command()
def analyze(
    target: str = typer.Argument(..., help="valuation|factors|flow|macro|micro|risk"),
) -> None:
    """분석 엔진 실행. valuation(M3)·factors(M4) 구현."""
    if target == "valuation":
        from engine.fundamental import runner as fr
        typer.echo(f"valuations rows: {fr.run()}")
    elif target == "factors":
        from engine.factors import runner as kr
        typer.echo(f"factor_scores rows: {kr.run()}")
    else:
        log.info("analyze", target=target, status="not_implemented")


@app.command()
def signals(
    risk: float = typer.Option(1.0, help="트레이드당 리스크(%)"),
    setups: str = typer.Option("", help="쉼표구분 플레이북 필터 (비우면 전체)"),
    gate: bool = typer.Option(False, help="백테스트 품질 게이트 통과 셋업만 발행 (M6)"),
) -> None:
    """시그널 생성 (M5) — 플레이북 × 스타일 × 세션 → signals 적재."""
    from engine.signals import runner

    setup_list = [s.strip() for s in setups.split(",") if s.strip()] or None
    n = runner.run(risk_per_trade_pct=risk, setups=setup_list, enforce_gate=gate)
    typer.echo(f"signals rows: {n}")


@app.command()
def backtest() -> None:
    """플레이북 백테스트 + 품질 게이트 평가 (M6) → backtests 적재."""
    from engine.backtest import runner as br

    result = br.run()
    for setup, ok in result.items():
        typer.echo(f"{'PASS' if ok else 'FAIL'}  {setup}")


@app.command()
def report(
    report_type: str = typer.Argument(..., help="indepth|market|portfolio|custom"),
) -> None:
    """AI 애널리스트 북 발행 (Phase 2). 현재는 골격."""
    log.info("report", report_type=report_type, status="not_implemented")


@app.command("levels-demo")
def levels_demo(
    style: str = typer.Option("swing", help=f"스타일: {', '.join(STYLES)}"),
    entry: float = typer.Option(70000.0, help="진입가"),
    atr: float = typer.Option(1500.0, help="ATR"),
    risk: float = typer.Option(1.0, help="트레이드당 리스크(%)"),
) -> None:
    """가격레벨 산출 데모 — 외부 데이터 없이 levels 모듈 동작 확인."""
    lv = compute_levels(
        style=style, side="buy", entry_price=entry, atr=atr, risk_per_trade_pct=risk,
    )
    typer.echo(lv.as_row())


if __name__ == "__main__":
    app()
