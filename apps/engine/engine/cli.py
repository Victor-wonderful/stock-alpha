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
        n = runner.ingest_krx_flows(days=days, workers=workers)
    elif market == "kr" and target == "fundamentals":
        n = runner.ingest_krx_financials(year=year, workers=workers)
    elif target == "macro":
        from engine.ingest import fred
        n = fred.ingest_macro(days=days)
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


@app.command("backfill-exchange")
def backfill_exchange() -> None:
    """레거시 exchange='KRX' 행을 KOSPI/KOSDAQ 로 백필 (네이버 시장별 목록 기준)."""
    from engine.ingest import universe

    r = universe.backfill_exchange()
    typer.echo(f"updated — KOSPI: {r.get('KOSPI', 0)}  KOSDAQ: {r.get('KOSDAQ', 0)}")


@app.command("classify-universe")
def classify_universe() -> None:
    """실기업 vs 펀드/파생(ETF/ETN) 분류 — corp_code 없는 종목·스팩 비활성화."""
    from engine.ingest import universe

    r = universe.classify_universe()
    typer.echo(f"stock(active): {r['stock']}  fund→inactive: {r['fund']}  spac→inactive: {r['spac']}")


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
    elif target == "regime":
        from engine.market import regime
        r = regime.run()
        typer.echo(f"regime: {r['regime']} (score {r['score']}) — {' · '.join(r['drivers'])}")
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
    symbols: str = typer.Option("", help="쉼표구분 심볼 (비우면 합성알파 상위 자동 선정)"),
    top: int = typer.Option(3, help="자동 선정 시 발행 종목 수"),
    llm: bool = typer.Option(True, help="Claude 서술 생성 (False면 템플릿)"),
    draft: bool = typer.Option(False, help="draft 상태로 저장 (기본 published)"),
) -> None:
    """AI 애널리스트 리포트 발행 — indepth: ①판정 ②게이트 ③실행플랜 ④근거 ⑤리스크."""
    if report_type != "indepth":
        log.info("report", report_type=report_type, status="not_implemented")
        return
    from engine.reports import runner as rr

    sym_list = [s.strip() for s in symbols.split(",") if s.strip()] or None
    results = rr.run_indepth(sym_list, top=top, use_llm=llm, publish=not draft)
    for r in results:
        typer.echo(f"{r['symbol']}  {r['rating']:<6}  llm={r['llm']}  {r['title']}")
    typer.echo(f"published reports: {len(results)}")


@app.command()
def morning(
    llm: bool = typer.Option(True, help="Claude 서술 생성"),
) -> None:
    """모닝 배치 (08:30) — FRED 매크로 갱신 → 레짐 → 모닝 브리프 발행.

    밤사이 바뀌는 해외 변수만 갱신 — 픽/리포트는 전일 16:30 발행분 그대로 유효.
    """
    from engine.ingest import fred
    from engine.market import regime
    from engine.reports import morning as mb

    typer.echo(f"[1/3] macro: {fred.ingest_macro(days=10)} rows")
    r = regime.run()
    typer.echo(f"[2/3] regime: {r['regime']} (score {r['score']})")
    out = mb.publish_morning(use_llm=llm)
    typer.echo(f"[3/3] morning brief — llm={out['llm']}  {out['headline']}")


@app.command()
def daily(
    skip_ingest: bool = typer.Option(False, help="시세 인제스트 생략(데이터 최신일 때)"),
    ingest_days: int = typer.Option(7, help="시세 인제스트 기간(일)"),
    llm: bool = typer.Option(True, help="Claude 서술 생성"),
    cap: int = typer.Option(100, help="일 발행 상한"),
) -> None:
    """일일 EOD 배치 (발행 규정 v1) — 인제스트→팩터→백테스트 게이트→시그널→리포트→오늘의 포커스.

    매 영업일 16:30 실행 전제. 스윙·포지션 시그널만 발행(데이/종가베팅은 장중 배치 영역).
    """
    from engine.backtest import runner as br
    from engine.factors import runner as fr
    from engine.ingest import runner as ir
    from engine.reports import daily as rd
    from engine.signals import runner as sr

    if not skip_ingest:
        n = ir.ingest_krx_prices(days=ingest_days)
        typer.echo(f"[1/5] ingest prices: {n} rows")
    else:
        typer.echo("[1/5] ingest skipped")

    typer.echo(f"[2/5] factors: {fr.run()} rows")

    from engine.market import regime as rg
    r0 = rg.run()
    typer.echo(f"      regime: {r0['regime']} (score {r0['score']})")

    gate = br.run()
    passed = [s for s, ok in gate.items() if ok]
    typer.echo(f"[3/5] backtest gate passed: {', '.join(passed) or '(없음)'}")

    setups = passed + ["factor_composite"]  # 횡단면 전략은 이벤트 게이트 비대상
    n = sr.run(setups=setups)
    typer.echo(f"[4/5] signals: {n} rows ({', '.join(setups)})")

    r = rd.run_daily(use_llm=llm, cap=cap)
    typer.echo(
        f"[5/5] reports — A:{r['track_a']} B:{r['track_b']} "
        f"published:{r['published']} skipped:{r['skipped']} picks:{r['picks']}"
    )


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
