"""엔진 CLI — 인제스트/분석/시그널/리포트 작업 진입점.

예) python -m engine.cli levels-demo --style swing
"""
from __future__ import annotations

import typer

from engine.logging import configure_logging, get_logger
from engine.timeutil import kst_today
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


@app.command("ingest-news")
def ingest_news(
    symbols: str = typer.Option("", help="쉼표 구분 종목코드. 미지정 시 그날 리포트·추천 종목"),
    pages: int = typer.Option(1, help="종목당 뉴스 페이지 수"),
) -> None:
    """네이버 금융 종목뉴스 → news 적재 (제목·언론사·시각·링크만, 본문 저장 안 함).

    대상은 전 종목이 아니라 그날 리포트·추천이 나간 종목이다. 2,500종목을 매일
    긁을 이유가 없고 요청량만 커진다.
    """
    from engine.ingest import naver_news as nn

    syms = [x.strip() for x in symbols.split(",") if x.strip()]
    if not syms:
        from engine.db import get_client

        cli = get_client()
        # 그날 발행 리포트 + 추천 픽 종목 — 뉴스를 붙일 가치가 있는 대상만.
        rows = (
            cli.table("reports")
            .select("instruments(symbol)")
            .eq("report_type", "indepth")
            .eq("status", "published")
            .order("as_of", desc=True)
            .limit(200)
            .execute()
            .data
            or []
        )
        syms = sorted({(r.get("instruments") or {}).get("symbol") for r in rows} - {None})
    if not syms:
        typer.echo("대상 종목 없음")
        raise typer.Exit(1)
    typer.echo(f"news rows: {nn.ingest_news(syms, pages=pages)} (종목 {len(syms)})")


@app.command("repair-prices")
def repair_prices() -> None:
    """주식 병합·감자 뒤 옛 가격이 옛 기준으로 남은 종목을 다시 받아 덮어쓴다.

    한국 주식은 하루 ±30% 를 못 넘는다 — 그걸 넘는 등락은 실제 거래가 아니라 기준
    변경이다. 인제스트가 최근 7일만 덮어쓰기 때문에 병합일에 가짜 점프가 생긴다.
    """
    from engine.ingest import price_repair

    r = price_repair.run()
    typer.echo(
        f"이상 종목 {r['detected']} · 재수집 {r['repaired']} ({r['rows']}행) · "
        f"남음 {r['remaining']}"
    )
    if r["remaining"]:
        typer.echo("  남은 건 제한폭이 없는 사례(신규상장·정리매매·감자 소각)로 본다 — 계산에서 제외됨")


@app.command("event-study")
def event_study(
    since: str = typer.Option("2026-01-01", help="가격 조회 시작일"),
) -> None:
    """공시 유형별 성적표 — "이 뉴스 뒤에 실제로 어떻게 됐나"를 세어 적재.

    화면의 모든 "이 뉴스는 어떻다" 문장은 이 표(event_evidence)를 근거로 한다.
    """
    from engine.market import event_study as es

    typer.echo(f"event_evidence: {es.run(since=since)} 유형")


@app.command("ingest-calendar")
def ingest_calendar(
    years_back: int = typer.Option(2, help="휴장일 역산 시작 연도(오늘 기준 N년 전 1/1)"),
    years_ahead: int = typer.Option(1, help="계산 이벤트를 몇 년 앞까지 만들지"),
) -> None:
    """시장 캘린더 적재 — 휴장일(pykrx 역산) + 만기·리밸런싱 계산 + 시드 파일.

    매일 돌릴 필요는 없다(주 1회면 충분). 다만 재실행이 안전하도록 (date, event_key)
    업서트라, 일일 배치에 붙여도 중복이 쌓이지 않는다.
    """
    from engine.ingest.calendar_seed import ingest_calendar as run

    by_kind = run(years_back=years_back, years_ahead=years_ahead)
    for kind, n in sorted(by_kind.items()):
        typer.echo(f"  {kind}: {n}")

    # 일정만 띄우면 정보가 아니다 — "그래서 무슨 영향인데"를 우리 데이터로 답한다.
    from engine.market import calendar_impact as ci

    typer.echo(f"  impact measured: {ci.run()} kinds")
    if not by_kind.get("rate_decision") and not by_kind.get("macro_release"):
        typer.echo("주의: 정책 일정(FOMC·금통위)이 비어 있다 — data/calendar_events.json")


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
    target: str = typer.Argument(..., help="valuation|factors|regime|risk"),
) -> None:
    """분석 엔진 실행. valuation(M3)·factors(M4)·regime·risk 구현.

    미구현 타깃은 exit 1 로 실패한다. 예전엔 조용히 exit 0 으로 끝나서, 도움말에만
    있고 실제로는 없는 risk 를 '돌렸다'고 착각한 채 risk_metrics 가 2026-06-09 에
    멈춘 걸 7주간 아무도 눈치채지 못했다.
    """
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
    elif target == "risk":
        from engine.risk import runner as rr
        typer.echo(f"risk_metrics rows: {rr.run()}")
    else:
        log.error("analyze.unknown_target", target=target,
                  implemented=["valuation", "factors", "regime", "risk"])
        typer.echo(
            f"[STOP] 미구현 타깃: {target!r} — 사용 가능: valuation|factors|regime|risk",
            err=True,
        )
        raise typer.Exit(1)


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
        f"kr indices: {kis.ingest_kr_indices(days=10)} rows · fx: {nv.ingest_fx()} rows · "
        # 해외지수는 FRED 가 2~3거래일 늦어 '어젯밤 미국장'을 못 말한다 → 네이버 당일치.
        f"world: {nv.ingest_world_indices()} rows"
    )
    r = regime.run()
    typer.echo(f"[2/3] regime: {r['regime']} (score {r['score']})")
    out = mb.publish_morning(use_llm=llm)
    typer.echo(f"[3/3] morning brief — llm={out['llm']}  {out['headline']}")


@app.command()
def weekly(
    as_of: str = typer.Option("", help="기준일(YYYY-MM-DD). 비우면 오늘. 그 날이 속한 주를 쓴다"),
) -> None:
    """주간 브리핑 발행 — 한 주에 무엇이 달라졌나(홈 「주간 브리핑」 섹션).

    같은 주는 덮어쓴다. 매일 돌려도 그 주 1건만 남으므로 일일 배치에 그대로 걸어도 된다
    — 주 중간에도 «지금까지의 이번 주»가 최신으로 유지된다.
    """
    from engine.reports import weekly as wk

    out = wk.publish(as_of or None)
    typer.echo(f"weekly {out['as_of']} — {out['headline']}")
    if out["summary"]:
        typer.echo(f"  {out['summary']}")


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
    from engine.risk import runner as rrisk
    from engine.signals import runner as sr

    if not skip_ingest:
        n = ir.ingest_krx_prices(days=ingest_days)
        from engine.ingest import kis
        from engine.ingest import naver as nv
        typer.echo(
            f"[1/5] ingest prices: {n} rows · kr indices: {kis.ingest_kr_indices(days=10)} rows · "
            f"fx: {nv.ingest_fx()} rows · world: {nv.ingest_world_indices()} rows · "
            f"flows: {kis.ingest_flows(days=7)} rows"
        )
    else:
        typer.echo("[1/5] ingest skipped")

    # 신선도 가드 — 인제스트가 목표 거래일(target) 봉을 못 채웠으면(장중·휴장·인제스트
    # 실패) 낡은 가격으로 '종가 분석' 픽을 발행하는 사고(2026-06-19)를 차단하고 중단한다.
    from datetime import date as _date
    target = as_of or kst_today().isoformat()
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

    # 주가 기준 변경 보정 — 팩터·백테스트·성적표가 전부 일봉 수익률 위에 서 있으므로
    # 분석보다 먼저. 병합·감자 종목의 가짜 등락(실측 149종목)을 그대로 두면 그 위의
    # 모든 숫자가 오염된다. 실패해도 배치는 계속한다(있는 데이터로라도 돈다).
    if not skip_ingest:
        try:
            from engine.ingest import price_repair

            rp = price_repair.run()
            if rp["detected"]:
                typer.echo(
                    f"      price repair: 이상 {rp['detected']}종목 · "
                    f"재수집 {rp['repaired']} · 남음 {rp['remaining']}"
                )
        except Exception as e:
            log.warning("daily.price_repair.failed", error=str(e))
            typer.echo(f"      price repair: 실패 — {e}")

    # 시장 캘린더 — 픽 선정이 억제 이벤트(동시만기 등)를 읽으므로 리포트보다 먼저.
    # 실패해도 배치를 죽이지 않는다(캘린더가 비면 억제가 안 걸릴 뿐, 기존 동작 그대로).
    try:
        from engine.ingest.calendar_seed import ingest_calendar as _ical

        _k = _ical()
        typer.echo(
            f"      calendar: 휴장 {_k.get('holiday', 0)} · 만기 {_k.get('expiry', 0)} · "
            f"정책 {_k.get('rate_decision', 0)}"
        )
    except Exception as e:
        log.warning("daily.calendar.failed", error=str(e))
        typer.echo(f"      calendar: 실패 — {e}")

    # 레짐을 팩터보다 먼저 — 같은 거래일 레짐으로 팩터 가중을 틸트(point-in-time).
    from engine.market import regime as rg
    r0 = rg.run()
    typer.echo(f"[2/5] regime: {r0['regime']} (score {r0['score']})")
    typer.echo(
        f"      factors: {fr.run(regime=r0['regime'])} rows · "
        f"valuations: {fdr.run(as_of=as_of)} rows"
    )
    # 리스크 파생(베타·변동성·VaR·MDD). 배치에 연결돼 있지 않아 2026-06-09 이후
    # 갱신이 끊긴 채 웹 종목상세가 낡은 값을 현재 리스크로 렌더했다. 계산 코드
    # 자체가 master 에 병합되지 않았던 게 원인 — 코드 복원과 함께 배치에 잇는다.
    typer.echo(f"      risk: {rrisk.run()} rows")

    # br.run() 은 (셋업×스타일) 매트릭스 → {(setup, style): passed}. 튜플 키를
    # setup 문자열로 풀어야 한다(시그널 발행 필터는 셋업 단위, 스타일 게이팅은 내부 처리).
    # 게이트를 «셋업 × 기간»으로 돌리고, 통과한 조합 그대로 발행한다.
    # 게이트가 재는 규칙(진입·손절·목표·보유상한)과 발행 규칙이 같은 프로파일에서
    # 나오므로 둘이 어긋날 수 없다 — 그 어긋남이 2026-08-21 에 고친 결함이었다.
    gate = br.run(axis="horizon")
    passed_pairs = [(setup, h) for (setup, h), ok in gate.items() if ok]
    horizons_by_setup: dict[str, list[str]] = {}
    for setup, h in passed_pairs:
        horizons_by_setup.setdefault(setup, []).append(h)
    passed = sorted(horizons_by_setup)
    typer.echo(
        "[3/5] backtest gate passed: "
        f"{', '.join(f'{s}:{h}' for s, h in passed_pairs) or '(없음)'}"
    )

    # factor_composite 는 횡단면 백테스트(backtest-factor) 판정을 따른다 —
    # 미통과면 발행 제외 (2026-06-10 검증: IC 유효하나 상위10% 초과수익 무유의)
    setups = list(passed)
    if "factor_composite" in rd.passed_setups_from_db():
        setups.append("factor_composite")
    n = sr.run(setups=setups, as_of=target,
               horizons_by_setup=horizons_by_setup)
    typer.echo(f"[4/5] signals: {n} rows ({', '.join(setups) or '(없음)'})")

    r = rd.run_daily(use_llm=llm, cap=cap, as_of=as_of)
    typer.echo(
        f"[5/5] reports — A:{r['track_a']} B:{r['track_b']} "
        f"published:{r['published']} skipped:{r['skipped']} picks:{r['picks']}"
    )

    # 뉴스는 리포트 뒤에 — 그날 리포트가 나간 종목만 대상이라 순서가 뒤바뀌면 대상이 빈다.
    # 실패해도 배치를 죽이지 않는다(뉴스는 부가 정보이고, 외부 사이트 구조 변경·차단에
    # 취약하다). 제목·언론사·시각·링크만 저장하고 본문은 저장하지 않는다.
    try:
        from engine.ingest import naver_news as nn
        from engine.db import get_client

        cli_db = get_client()
        rows = (
            cli_db.table("reports")
            .select("instruments(symbol)")
            .eq("report_type", "indepth")
            .eq("status", "published")
            .eq("as_of", target)
            .limit(300)
            .execute()
            .data
            or []
        )
        syms = sorted({(x.get("instruments") or {}).get("symbol") for x in rows} - {None})
        n_news = nn.ingest_news(syms) if syms else 0
        typer.echo(f"      news: {n_news} rows (종목 {len(syms)})")
    except Exception as e:
        log.warning("daily.news.failed", error=str(e))
        typer.echo(f"      news: 실패 — {e}")

    # 이벤트 성적표 — 그날 새로 들어온 공시까지 반영해 유형별 실측을 갱신한다.
    # 공시 수집(ingest-disclosures) 뒤에 와야 하루치가 빠지지 않는다.
    try:
        from engine.market import event_study as es

        typer.echo(f"      event evidence: {es.run()} 유형")
    except Exception as e:
        log.warning("daily.event_study.failed", error=str(e))
        typer.echo(f"      event evidence: 실패 — {e}")


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
        # 분봉을 daily 보다 먼저 — KIS 분봉은 당일치만 제공해 놓치면 영구 손실이다.
        # 반면 daily·공시는 실패해도 다음날 재실행으로 복구된다. 복구 불가능한 수집을
        # 3시간짜리 daily 뒤에 두면, daily 가 실패하거나 늘어질 때 그날 분봉이 통째로
        # 사라진다(2026-06~07 실제로 21거래일 손실). 순서를 뒤집어 먼저 확보한다.
        # 분봉 대상 선정(top_liquid_symbols)은 최근 7일 거래대금이라 당일 시세가
        # 아직 안 들어와도 결과가 사실상 같다.
        {"name": "daily", "hh": 16, "mm": 30, "logbase": "daily",
         "cmds": [["ingest-minutes", "--top", "200"],
                  ["daily"],
                  ["ingest-disclosures", "--days", "3"],
                  # 주간 브리핑은 맨 뒤 — 같은 주를 덮어쓰므로 언제 돌려도 복구된다.
                  # 앞 명령이 실패하면 이건 안 돌지만, 다음날 실행이 그 주를 다시 채운다.
                  ["weekly"]]},
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

    def run_job(job: dict, now: datetime, state: dict) -> bool:
        """작업 실행. 모든 하위 명령이 exit=0 이면 True. 하나라도 실패하면 즉시 False.

        실패한 명령 이후 명령은 돌리지 않는다. 그래서 cmds 순서는 '복구 불가능한 것부터'다
        (분봉 → daily → 공시). 분봉이 먼저 끝나 있으면 daily 가 실패해도 그날 분봉은 남는다.

        명령 하나가 끝날 때마다 진행 상황을 state 에 즉시 기록한다. 이 프로세스가
        중간에 강제 종료돼도(작업스케줄러 ExecutionTimeLimit·절전 등) 다음 틱이
        끝난 명령을 건너뛰므로, 3시간짜리 daily 를 처음부터 다시 도는 일이 없다.
        """
        logfile = log_dir / f"{job['logbase']}-{now.strftime('%Y%m%d')}.log"
        today_str = now.strftime("%Y-%m-%d")
        prog = state.get(f"{job['name']}_progress") or {}
        done_cmds = list(prog.get("done", [])) if prog.get("date") == today_str else []
        for cmd in job["cmds"]:
            key = cmd[0]
            if key in done_cmds:
                log.info("worker.skip_done", job=job["name"], cmd=key,
                         note="이전 틱에서 완료 — 재실행 생략")
                continue
            # daily 발행은 디스패치 시점의 거래일로 라벨을 고정한다. 배치가 자정을
            # 넘겨 끝나도 date.today() 가 다음날로 넘어가 오라벨되는 일을 막는다.
            if cmd and cmd[0] == "daily":
                cmd = [*cmd, "--as-of", today_str]
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
            # 성공 즉시 디스크에 기록 — 이후 강제 종료돼도 이 명령은 보존된다.
            done_cmds.append(key)
            state[f"{job['name']}_progress"] = {"date": today_str, "done": done_cmds}
            save_state(state)
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
            ok = run_job(job, now, state)
            if ok:
                state[name] = today
                state.pop(f"{name}_fail", None)
                state.pop(f"{name}_progress", None)
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
