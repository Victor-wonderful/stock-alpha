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
    reprt: str = typer.Option(
        "11011", help="보고서 코드(fundamentals) — 11011=연간 11013=1Q 11012=반기 11014=3Q"
    ),
    workers: int = typer.Option(12, help="prices 병렬 fetch 워커 수"),
    refresh: bool = typer.Option(
        False, help="fundamentals — 기존 행도 재인제스트(disclosed_at 등 컬럼 백필)"
    ),
    source: str = typer.Option(
        "kis", help="flows 소스 — kis(개인·프로그램 포함) | naver(외인·기관만)"
    ),
) -> None:
    """데이터 인제스트 (M2). 현재 KRX prices/flows/fundamentals 구현."""
    from engine.ingest import runner

    if market == "kr" and target == "prices":
        n = runner.ingest_krx_prices(days=days, workers=workers)
    elif market == "kr" and target == "flows" and source == "kis":
        from engine.ingest import kis
        n = kis.ingest_flows(days=days, workers=min(workers, 8))
    elif market == "kr" and target == "flows":
        n = runner.ingest_krx_flows(days=days, workers=workers)
    elif market == "kr" and target == "fundamentals":
        n = runner.ingest_krx_financials(
            year=year, reprt_code=reprt, workers=workers, refresh=refresh,
        )
    elif target == "macro":
        from engine.ingest import fred
        n = fred.ingest_macro(days=days)
    else:
        log.info("ingest", target=target, market=market, status="not_implemented")
        return
    typer.echo(f"ingested rows: {n}")


@app.command("ingest-minutes")
def ingest_minutes(
    symbols: str = typer.Option("", help="쉼표구분 종목코드 (예: 005930,000660). --top 쓰면 생략."),
    top: int = typer.Option(0, help="상위 유동 N종목 자동 선정(거래대금). >0 이면 symbols 무시."),
    end_hour: str = typer.Option("153000", help="조회 종료 시각(HHMMSS)"),
) -> None:
    """당일 1분봉 인제스트 (KIS) — ohlcv(interval=1m). 데이/스캘핑 셋업의 전제 데이터.

    KIS 는 당일치만 주므로 매일 실행해 이력을 축적한다(일일 배치 연결). --top 200 권장.
    """
    from engine.ingest import kis

    if top > 0:
        syms = kis.top_liquid_symbols(top)
        typer.echo(f"top liquid symbols: {len(syms)}")
    else:
        syms = [s.strip() for s in symbols.split(",") if s.strip()]
    if not syms:
        typer.echo("대상 종목 없음 — --symbols 또는 --top 지정")
        raise typer.Exit(1)
    typer.echo(f"minute bars rows: {kis.ingest_minute_bars(syms, end_hour=end_hour)}")


@app.command("ingest-disclosures")
def ingest_disclosures(
    days: int = typer.Option(7, help="최근 N일 공시목록 수집"),
) -> None:
    """DART 공시목록 → 이벤트 분류 후 disclosures 적재 (정기/미분류 제외).

    매일 돌려 이벤트 피드 축적(일일 배치 연결). 이벤트 스터디·발행의 전제 데이터.
    """
    from engine.ingest import dart

    typer.echo(f"disclosure events: {dart.ingest_disclosures(days=days)}")


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


@app.command("backtest-factor")
def backtest_factor() -> None:
    """횡단면 백테스트 — factor_composite 검증 (IC·상위10% 초과수익) → backtests."""
    from engine.backtest import cross_section as xs

    r = xs.run()
    typer.echo(
        f"{'PASS' if r.passed else 'FAIL'}  factor_composite — "
        f"기간 {r.n_periods} · 평균IC {r.mean_ic} · IC양수 {r.ic_positive_ratio} · "
        f"초과수익 {r.excess_mean} (t={r.excess_t}) · MDD {r.excess_mdd}"
    )
    if r.reasons:
        typer.echo("사유: " + " / ".join(r.reasons))


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
    from engine.ingest import fred, kis
    from engine.market import regime
    from engine.reports import morning as mb

    from engine.ingest import naver as nv
    typer.echo(
        f"[1/3] macro: {fred.ingest_macro(days=10)} rows · "
        f"kr indices: {kis.ingest_kr_indices(days=10)} rows · fx: {nv.ingest_fx()} rows"
    )
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
        from engine.ingest import kis
        from engine.ingest import naver as nv
        typer.echo(
            f"[1/5] ingest prices: {n} rows · kr indices: {kis.ingest_kr_indices(days=10)} rows · "
            f"fx: {nv.ingest_fx()} rows · flows: {kis.ingest_flows(days=7)} rows"
        )
    else:
        typer.echo("[1/5] ingest skipped")

    typer.echo(f"[2/5] factors: {fr.run()} rows")

    from engine.market import regime as rg
    r0 = rg.run()
    typer.echo(f"      regime: {r0['regime']} (score {r0['score']})")

    gate = br.run()
    passed = [s for s, ok in gate.items() if ok]
    typer.echo(f"[3/5] backtest gate passed: {', '.join(passed) or '(없음)'}")

    # factor_composite 는 횡단면 백테스트(backtest-factor) 판정을 따른다 —
    # 미통과면 발행 제외 (2026-06-10 검증: IC 유효하나 상위10% 초과수익 무유의)
    setups = list(passed)
    if "factor_composite" in rd.passed_setups_from_db():
        setups.append("factor_composite")
    n = sr.run(setups=setups)
    typer.echo(f"[4/5] signals: {n} rows ({', '.join(setups) or '(없음)'})")

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
