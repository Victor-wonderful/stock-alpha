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
    for (setup, style), ok in sorted(result.items()):
        typer.echo(f"{'PASS' if ok else 'FAIL'}  {setup}:{style}")


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
    as_of: str = typer.Option(
        None, "--as-of",
        help="발행 일자(거래일, YYYY-MM-DD). 미지정 시 오늘. 자정 넘긴 재실행 시 대상일 명시용.",
    ),
) -> None:
    """일일 EOD 배치 (발행 규정 v1) — 인제스트→팩터→백테스트 게이트→시그널→리포트→오늘의 포커스.

    매 영업일 16:30 실행 전제. 스윙·포지션 시그널만 발행(데이/종가베팅은 장중 배치 영역).
    """
    from engine.backtest import runner as br
    from engine.factors import runner as fr
    from engine.fundamental import runner as fdr
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

    # 신선도 가드 — 인제스트가 목표 거래일(target) 봉을 못 채웠으면(장중·휴장·인제스트
    # 실패) 낡은 가격으로 '종가 분석' 픽을 발행하는 사고(2026-06-19)를 차단하고 중단한다.
    from datetime import date as _date
    target = as_of or _date.today().isoformat()
    from engine import db_direct, freshness
    if db_direct.available():
        fr_check = freshness.assess_dates(db_direct.latest_bar_date_by_iid(), target)
        typer.echo(
            f"      freshness: {fr_check['n_fresh']}/{fr_check['n']} "
            f"({fr_check['fresh_frac']:.0%}) @ {target} · "
            f"market_latest={fr_check['market_latest']}"
        )
        if not fr_check["ok"]:
            typer.echo(
                f"[중단] {target} 봉 미적재 — 낡은 데이터 발행 차단 "
                f"(market_latest={fr_check['market_latest']}). 인제스트 점검 후 재실행."
            )
            log.error("daily.freshness.abort", **fr_check)
            return
    else:
        log.warning("daily.freshness.skipped_no_db_direct")

    # 레짐을 팩터보다 먼저 — 같은 거래일 레짐으로 팩터 가중을 틸트(point-in-time).
    from engine.market import regime as rg
    r0 = rg.run()
    typer.echo(f"[2/5] regime: {r0['regime']} (score {r0['score']})")
    typer.echo(
        f"      factors: {fr.run(regime=r0['regime'])} rows · "
        f"valuations: {fdr.run(as_of=as_of)} rows"
    )

    # br.run() 은 (셋업×스타일) 매트릭스 → {(setup, style): passed}. 튜플 키를
    # setup 문자열로 풀어야 한다(시그널 발행 필터는 셋업 단위, 스타일 게이팅은 내부 처리).
    gate = br.run()
    passed_pairs = [(setup, style) for (setup, style), ok in gate.items() if ok]
    passed = sorted({setup for setup, _ in passed_pairs})
    typer.echo(
        "[3/5] backtest gate passed: "
        f"{', '.join(f'{s}:{st}' for s, st in passed_pairs) or '(없음)'}"
    )

    # factor_composite 는 횡단면 백테스트(backtest-factor) 판정을 따른다 —
    # 미통과면 발행 제외 (2026-06-10 검증: IC 유효하나 상위10% 초과수익 무유의)
    setups = list(passed)
    if "factor_composite" in rd.passed_setups_from_db():
        setups.append("factor_composite")
    n = sr.run(setups=setups, as_of=target)
    typer.echo(f"[4/5] signals: {n} rows ({', '.join(setups) or '(없음)'})")

    r = rd.run_daily(use_llm=llm, cap=cap, as_of=as_of)
    typer.echo(
        f"[5/5] reports — A:{r['track_a']} B:{r['track_b']} "
        f"published:{r['published']} skipped:{r['skipped']} picks:{r['picks']}"
    )


@app.command()
def worker(
    tick: int = typer.Option(30, help="스케줄 폴링 간격(초)"),
    once: bool = typer.Option(False, help="한 틱만 평가하고 종료(테스트용)"),
    dry_run: bool = typer.Option(False, help="실행하지 않고 판단만 로그(테스트용)"),
) -> None:
    """상주 워커 — 내부 스케줄러로 모닝(08:30)·데일리(16:30) 배치를 KST 기준 실행.

    배치처럼 끝나고 죽는 대신 계속 떠 있는다. 각 작업은 별도 프로세스로 띄워
    한 작업의 크래시가 워커를 죽이지 않게 한다. 상태파일(var/worker_state.json)로
    '오늘 이미 실행' 여부를 추적해 PC가 꺼졌다 켜져도(catch-up) 중복 없이 한 번만 돈다.
    평일(월~금)만 실행 — 기존 작업스케줄러와 동일 동작.
    """
    import json
    import socket
    import subprocess
    import sys
    import time
    from datetime import datetime, timedelta, timezone
    from pathlib import Path

    # 싱글톤 가드 — 동일 PC에서 워커는 단 하나만. 래퍼/작업스케줄러가 중복 기동해도
    # 두 번째 인스턴스는 즉시 종료해 데일리 이중 실행을 원천 차단한다.
    _guard = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        _guard.bind(("127.0.0.1", 47654))
        _guard.listen(1)
    except OSError:
        log.warning("worker.already_running", note="다른 워커 인스턴스 감지 — 이 인스턴스 종료")
        raise typer.Exit(0)

    kst = timezone(timedelta(hours=9))  # 한국은 DST 없음 → 고정 +9 (PC 시간대 무관)
    here = Path(__file__).resolve()
    engine_dir = here.parents[1]  # apps/engine — 서브프로세스 cwd
    repo_root = here.parents[3]  # D:\Stock-Alpha — logs·var
    log_dir = repo_root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    state_path = repo_root / "var" / "worker_state.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    py = sys.executable

    # (이름, KST시, KST분, 로그파일 베이스, [CLI 인자열 ...])
    jobs = [
        {"name": "morning", "hh": 8, "mm": 30, "logbase": "morning",
         "cmds": [["morning"]]},
        {"name": "daily", "hh": 16, "mm": 30, "logbase": "daily",
         "cmds": [["daily"],
                  ["ingest-minutes", "--top", "200"],
                  ["ingest-disclosures", "--days", "3"]]},
    ]

    def load_state() -> dict:
        try:
            # utf-8-sig: PowerShell 등이 붙인 BOM이 있어도 안전하게 파싱
            return json.loads(state_path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            return {}

    def save_state(s: dict) -> None:
        state_path.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")

    MAX_RETRIES = 3  # 실패 시 같은 날 재시도 상한 — LLM 비용/폭주 가드레일

    def run_job(job: dict, now: datetime) -> bool:
        """작업 실행. 모든 하위 명령이 exit=0 이면 True. 하나라도 실패하면 즉시 False.

        실패한 명령 이후 명령은 돌리지 않는다(예: daily 본체 실패 시 분봉/공시 생략).
        """
        logfile = log_dir / f"{job['logbase']}-{now.strftime('%Y%m%d')}.log"
        for cmd in job["cmds"]:
            # daily 발행은 디스패치 시점의 거래일로 라벨을 고정한다. 배치가 자정을
            # 넘겨 끝나도 date.today() 가 다음날로 넘어가 오라벨되는 일을 막는다.
            if cmd and cmd[0] == "daily":
                cmd = [*cmd, "--as-of", now.strftime("%Y-%m-%d")]
            log.info("worker.dispatch", job=job["name"], cmd=" ".join(cmd))
            with logfile.open("ab") as f:
                f.write(f"\n=== {job['name']} :: {' '.join(cmd)} @ {now.isoformat()} ===\n".encode())
                f.flush()
                rc = subprocess.run(  # noqa: S603 — 내부 고정 명령
                    [py, "-m", "engine.cli", *cmd], cwd=str(engine_dir),
                    stdout=f, stderr=subprocess.STDOUT,
                ).returncode
                f.write(f"exit={rc} at {datetime.now(kst).isoformat()}\n".encode())
            log.info("worker.done", job=job["name"], cmd=" ".join(cmd), exit=rc)
            if rc != 0:
                return False
        return True

    log.info("worker.start", tz="KST", tick=tick, once=once, dry_run=dry_run,
             state=str(state_path), engine_dir=str(engine_dir))
    last_heartbeat = 0.0
    while True:
        now = datetime.now(kst)
        today = now.strftime("%Y-%m-%d")
        state = load_state()
        is_weekday = now.weekday() < 5
        for job in jobs:
            name = job["name"]
            after_time = (now.hour, now.minute) >= (job["hh"], job["mm"])
            # 오늘 성공 완료했으면 skip. 실패해서 today 가 안 찍힌 경우만 재시도.
            done_today = state.get(name) == today
            fail = state.get(f"{name}_fail") or {}
            attempts = fail.get("n", 0) if fail.get("date") == today else 0
            due = (
                is_weekday and after_time and not done_today
                and attempts < MAX_RETRIES
            )
            if not due:
                continue
            if dry_run:
                log.info("worker.would_run", job=name, now=now.isoformat(),
                         attempt=attempts + 1)
                continue
            ok = run_job(job, now)
            if ok:
                state[name] = today
                state.pop(f"{name}_fail", None)
            else:
                state[f"{name}_fail"] = {"date": today, "n": attempts + 1}
                log.warning("worker.job_failed", job=name,
                            attempt=attempts + 1, max=MAX_RETRIES,
                            note="state 미기록 — 다음 틱 재시도" if attempts + 1 < MAX_RETRIES
                            else "재시도 상한 도달 — 오늘은 포기")
            save_state(state)
        # 하트비트 — 10분마다 살아있음 로그
        mono = time.monotonic()
        if mono - last_heartbeat >= 600:
            log.info("worker.alive", kst=now.isoformat(), state=load_state())
            last_heartbeat = mono
        if once:
            return
        time.sleep(tick)


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
