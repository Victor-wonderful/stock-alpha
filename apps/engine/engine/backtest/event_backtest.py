"""이벤트 기반 백테스트 — 플레이북을 과거에 재생하여 트레이드 결과 산출.

방식: 각 봉에서 detector(df[:i+1]) 트리거 시 levels 로 진입/손절/tp1 산출 →
이후 봉을 따라가며 손절/목표/타임아웃 중 먼저 닿는 곳에서 청산.
보수적 가정: 한 봉에서 손절·목표가 동시 도달 시 손절 우선.
포지션은 한 번에 하나(중첩 진입 없음).
"""
from __future__ import annotations

import pandas as pd

from engine.backtest.costs import CostModel
from engine.backtest.metrics import Trade
from engine.signals import playbooks
from engine.signals.levels import compute_levels, min_risk_floor
from engine.signals.styles import TradeStyle

# 스타일별 타임아웃(일봉 기준 보유 봉 수)
_TIMEOUT_BARS: dict[TradeStyle, int] = {
    "scalping": 1, "day": 1, "swing": 10, "position": 60,
}

# 스케일아웃 분할 비중 (tp1 익절 / 런). 검증(diag_scaleout): 6/7 셋업 기대값↑.
SCALEOUT_W1 = 0.5
SCALEOUT_W2 = 0.5


def _exit_single(df, i, n, entry, stop, tp, timeout, costs):
    """전량 단일청산 — 손절/tp1/타임아웃. 반환: (net_pnl, gross_pnl, bars)."""
    exit_idx = min(i + timeout, n - 1)
    exit_price = None
    for j in range(i + 1, exit_idx + 1):
        lo, hi = float(df["low"].iloc[j]), float(df["high"].iloc[j])
        if lo <= stop:                 # 손절 우선(보수적)
            exit_price, exit_idx = stop, j
            break
        if hi >= tp:
            exit_price, exit_idx = tp, j
            break
    if exit_price is None:             # 타임아웃 → 종가
        exit_price = float(df["close"].iloc[exit_idx])
    return costs.net_pnl(entry, exit_price), exit_price - entry, exit_idx - i


def _detect_at(df, i, detector, needs_flows, needs_earnings, needs_discl,
               flows, earnings, disclosures):
    """봉 i 시점의 탐지 — 그 시점까지의 데이터만 넘긴다(룩어헤드 차단)."""
    window = df.iloc[: i + 1]
    if needs_flows:
        if "ts" in df.columns:
            now_ts = str(df["ts"].iloc[i])[:10]
            fwin = flows[flows["date"] <= now_ts]
        else:
            fwin = flows
        return detector(window, flows=fwin)
    if needs_earnings:
        return detector(window, earnings=earnings)
    if needs_discl:
        # 공시는 봉의 ts 로 잘라 넘긴다 — 미래 공시가 과거 봉에 새면 룩어헤드다.
        if "ts" in df.columns:
            now_ts = str(df["ts"].iloc[i])[:10]
            dwin = disclosures[disclosures["date"] <= now_ts]
        else:
            dwin = disclosures
        return detector(window, disclosures=dwin)
    return detector(window)


def precompute_detections(
    df: pd.DataFrame, setup: str, *, min_lookback: int = 60,
    flows=None, earnings=None, disclosures=None,
) -> list | None:
    """봉마다의 탐지 결과를 한 번에 계산해 리스트로 돌려준다.

    **왜 필요한가** — 탐지는 청산 규칙과 무관하다. 어느 봉에서 신호가 뜨는지는
    보유기간·목표처리와 상관없이 같은데, 지금까지는 변형마다 처음부터 다시 돌렸다.
    870종목 × 500봉 = 43만 번을 변형 수만큼 반복한 것이다(변형 9개면 390만 번).
    한 번 계산해 재사용하면 그 배수만큼 줄어든다.

    ⚠️ 단일 변형만 돌릴 때는 오히려 느리다 — 본 루프는 트레이드가 열린 구간의 봉을
    건너뛰는데(i = i_entry + bars + 1) 사전계산은 모든 봉을 본다. 변형이 2개 이상일
    때만 쓸 것.

    반환: 길이 n 리스트(각 원소는 Candidate 또는 None). 셋업이 없으면 None.
    """
    detector = playbooks.ALL_DETECTORS.get(setup)
    if detector is None:
        return None
    needs_flows = setup == "flow_accumulation"
    needs_earnings = setup == "pead"
    needs_discl = setup in playbooks.DISCLOSURE_SETUPS
    # ⚠️ backtest_playbook 과 **같은 가드**를 둬야 한다. 그쪽은 필요한 컨텍스트가
    # 없으면 빈 결과로 조기 반환하는데, 여기엔 그게 없어서 공시 없는 종목에서
    # NoneType 구독 오류로 터졌다(2026-08-22). None 을 돌려주면 호출부가
    # detections=None 으로 넘기고, backtest_playbook 이 제 가드로 처리한다.
    if needs_flows and (flows is None or getattr(flows, "empty", True)):
        return None
    if needs_earnings and (earnings is None or getattr(earnings, "empty", True)):
        return None
    if needs_discl and (disclosures is None or getattr(disclosures, "empty", True)):
        return None
    out: list = [None] * len(df)
    for i in range(min_lookback, len(df)):
        out[i] = _detect_at(df, i, detector, needs_flows, needs_earnings,
                            needs_discl, flows, earnings, disclosures)
    return out


def _exit_scalein(df, i, n, legs, stop, tp, timeout, costs, target_action="sell",
                  trail_r_mult=1.0):
    """분할 진입 — 나눠 사고 한 번에 판다.

    legs: [(비중, 진입가), ...] 1차가 맨 앞. 1차는 진입 봉에 체결된 것으로 보고,
    2차 이후는 보유 중 저가가 그 가격 이하로 내려온 봉에서 체결된다. 청산은 전량
    동시(손절 / 목표 / 기간 만료).

    ⚠️ 손익 회계 — 반환하는 net/gross 는 «전량 체결을 가정한 계획 포지션 1주당» 값이다.
    2·3차가 안 채워지면 그만큼 작은 포지션이므로 손익도 비례해 작아진다. 안 산 몫을
    벌었다고 세면 분할 진입이 공짜로 유리해 보인다.

    ⚠️ 손절선은 **1차 진입 시점에 확정**돼 움직이지 않는다(구조가 정하는 값이다).
    분할이 낮추는 건 평단이지 손절이 아니다 — 손절을 평단 따라 내리면 «틀렸는데
    더 버티는» 규칙이 되고, 그건 분할 진입이 아니라 그냥 손절 폐지다.

    같은 봉에서 추가 체결과 청산이 겹치면 **체결을 먼저** 본다(보수적 — 더 산 뒤
    손절되는 쪽이 손실이 크다).

    target_action — 목표가에 닿았을 때 무엇을 하는가.
      "sell"  (기본) 목표가에 전량 청산. 상방이 목표에서 잘린다.
      "trail" **팔지 않고 손절을 «고점 추격»으로 바꾼 뒤 기간까지 보유한다.**
              파는 주체는 기간이고 목표는 안전장치가 된다 — 되돌림은 막으면서
              상방은 안 자른다. 목표를 아예 끄면(use_targets=False) 되돌림을 그대로
              맞고, 목표에 팔면 크게 가는 종목을 놓친다. 그 사이를 노린다.

              스톱 = max(1차 진입가, 최고가 − trail_r_mult×R),  R = 1차 진입가 − 최초손절.
              «되돌려줄 수 있는 최대치는 처음에 걸었던 리스크만큼»이라는 규칙이다.
              한 번 올라간 스톱은 내려오지 않는다(래칫). 하한이 평단이므로 옛
              본전스톱보다 **낮아지는 일은 없다** — 더 일찍 털리는 대신 더 높은
              가격에 나간다.

              ⚠️ 2026-08-27 Victor 결정으로 «본전 고정»에서 바꿨다. 본전스톱은
              12개 비교에서 검증됐지만(var/holding_horizon_trail.jsonl) 추격스톱은
              **측정된 적이 없다.** 되돌림을 무승부가 아니라 이익으로 끝내려는
              의도적 교체이고, 게이트가 다음 배치에서 이 규칙으로 다시 잰다.

    반환: (net_pnl, gross_pnl, bars, filled_w, avg_entry)
    """
    total_w = sum(w for w, _ in legs)
    filled: list[tuple[float, float]] = [legs[0]]      # 1차는 진입 봉에 체결
    pending = list(legs[1:])
    cap = min(i + timeout, n - 1)
    exit_price = None
    idx = cap
    eff_stop = stop
    trailed = False
    peak = None
    trail_dist = 0.0
    for j in range(i + 1, cap + 1):
        lo, hi = float(df["low"].iloc[j]), float(df["high"].iloc[j])
        while pending and lo <= pending[0][1]:         # 추가 체결(보수적: 먼저)
            filled.append(pending.pop(0))
        # 손절을 목표보다 «먼저» 본다(보수적). 이 순서 덕에, 목표를 찍은 그 봉의
        # 저가로 곧바로 새 스톱에 걸리는 일이 없다 — 스톱은 그 봉 «다음»부터 산다.
        if lo <= eff_stop:
            exit_price, idx = eff_stop, j
            break
        if hi >= tp:
            if target_action != "trail":
                exit_price, idx = tp, j
                break
            if not trailed:                            # 목표 도달 → 추격 스톱 개시
                trailed = True
                # 기준은 «1차 진입가»다 — 평단이 아니다. 손절선을 1차 진입에 고정하는
                # 이 규칙의 원칙(HorizonProfile 독스트링)과 같은 기준이어야 한다.
                # 분할이 낮추는 건 평단이지 «본전»이 아니다. (2026-08-27 Victor 확인)
                first_e = legs[0][1]
                trail_dist = max(first_e - stop, 0.0) * trail_r_mult
                eff_stop = first_e                     # 하한 = 1차 진입가
                peak = hi
        if trailed and trail_dist > 0:                 # 래칫 — 올라가기만 한다
            peak = hi if peak is None else max(peak, hi)
            eff_stop = max(eff_stop, peak - trail_dist)
    if exit_price is None:                             # 기간 만료 → 종가
        exit_price = float(df["close"].iloc[cap])
        idx = cap
    net = sum(w * costs.net_pnl(e, exit_price) for w, e in filled) / total_w
    gross = sum(w * (exit_price - e) for w, e in filled) / total_w
    filled_w = sum(w for w, _ in filled) / total_w
    avg_entry = sum(w * e for w, e in filled) / sum(w for w, _ in filled)
    return net, gross, idx - i, filled_w, avg_entry


def _exit_scaleout(df, i, n, entry, stop, tp1, tp2, timeout, costs):
    """분할청산 — tp1 에서 W1 익절 + 잔량 본전(entry)스톱 후 tp2 런.

    반환: (net_pnl, gross_pnl, bars) — 블렌디드. 같은 봉서 1·2차 동시 청산 불허(보수적).
    """
    cap = min(i + timeout, n - 1)
    t1 = t2 = None
    t1_done = False
    idx = cap
    for j in range(i + 1, cap + 1):
        lo, hi = float(df["low"].iloc[j]), float(df["high"].iloc[j])
        if not t1_done:
            if lo <= stop:             # tp1 전 손절 → 전량 손절
                t1 = t2 = stop
                idx = j
                break
            if hi >= tp1:              # 1차 익절, 잔량 본전스톱
                t1 = tp1
                t1_done = True
                continue               # 같은 봉서 tp2 불허
        else:
            if lo <= entry:            # 본전 청산(보수적: 먼저 검사)
                t2 = entry
                idx = j
                break
            if hi >= tp2:              # 2차 목표
                t2 = tp2
                idx = j
                break
    if t1 is None:                     # tp1 미도달 → 타임아웃 전량 종가
        t1 = t2 = float(df["close"].iloc[cap])
        idx = cap
    elif t2 is None:                   # tp1 후 타임아웃 → 잔량 종가
        t2 = float(df["close"].iloc[cap])
        idx = cap
    net = SCALEOUT_W1 * costs.net_pnl(entry, t1) + SCALEOUT_W2 * costs.net_pnl(entry, t2)
    gross = SCALEOUT_W1 * (t1 - entry) + SCALEOUT_W2 * (t2 - entry)
    return net, gross, idx - i


def _find_fill(df, i: int, n: int, entry: float, window: int) -> int | None:
    """지정가 진입이 «실제로 체결되는» 봉 인덱스. 없으면 None.

    라이브의 픽은 신호 봉 종가를 진입가로 적어 발행되고, 사용자는 다음 날부터
    그 가격 «이하»로 내려와야 살 수 있다. 예전 백테스트는 이 확인 없이 신호 봉
    가격에 무조건 체결된 것으로 쳤다 — 그래서 갭업해 도망간 종목까지 «샀다»고 셌다.

    실측(발행 픽 48건): 손절 픽은 24/24 체결됐는데 목표 픽은 1/3 만 체결됐다.
    체결 확인이 없으면 백테스트가 살 수 없었던 승리를 성적에 넣는다.
    """
    for j in range(i + 1, min(i + window, n - 1) + 1):
        if float(df["low"].iloc[j]) <= entry:
            return j
    return None


def backtest_playbook(
    df: pd.DataFrame,
    setup: str,
    *,
    risk_per_trade_pct: float = 1.0,
    min_lookback: int = 60,
    flows: pd.DataFrame | None = None,
    earnings: pd.DataFrame | None = None,
    disclosures: pd.DataFrame | None = None,
    costs: CostModel | None = None,
    style_override: TradeStyle | None = None,
    scaleout: bool = False,
    tp_r_mults: tuple[float, ...] | None = None,
    entry_mode: str = "signal",
    stop_atr_mult: float | None = None,   # 실험: 손절 ATR 배수 override
    struct_stop: bool = True,             # 실험: 구조 손절 당김 on/off
    timeout_bars: int | None = None,      # 실험: 보유 상한(봉) override — 고정 보유기간
    use_targets: bool = True,             # 실험: False 면 목표가 청산을 끈다
    scale_in: tuple[tuple[float, float], ...] | None = None,
    target_action: str = "sell",          # "trail" 이면 목표에서 안 팔고 고점 추격스톱
    trail_r_mult: float = 1.0,            # 추격 폭 — 고점에서 몇 R 아래 (HorizonProfile)
    tp_atr_mults: tuple[float, ...] | None = None,   # 목표 ATR 배수 override
    detections: list | None = None,       # precompute_detections 결과 재사용(속도)
) -> list[Trade]:
    """단일 종목·단일 플레이북 백테스트 → 트레이드 리스트.

    flows: 수급 셋업용 [date, foreign_net, inst_net] 오름차순 — 각 봉 시점까지로
    슬라이스해 전달(point-in-time). df 에 ts 컬럼이 없으면 전체를 그대로 전달.
    earnings: PEAD 용 [date, surprise] 오름차순 — detect_pead 가 봉의 ts 로
    직접 point-in-time 슬라이스하므로 전체를 그대로 전달.
    costs: 거래비용 모델(수수료·거래세·슬리피지). None 이면 한국 현물 기본값 적용.
    R·수익률은 비용 차감 후(net)로 산출 — gross 가 필요하면 costs=ZERO_COST.

    entry_mode: 진입 체결을 어떻게 가정하는가. 이 가정이 결과를 크게 바꾼다.
      "signal" — 신호 봉 가격에 무조건 체결(기존 동작, 하위 호환 기본값).
                 ⚠️ 라이브와 다르다. 갭업해 도망간 종목도 샀다고 센다.
      "limit"  — 라이브와 동일. 다음 봉부터 저가 ≤ 진입가 인 봉에서 체결.
                 타임아웃 안에 안 닿으면 «거래 없음»으로 빼고 다음 신호를 찾는다.
      "open"   — 다음 봉 시가에 시장가 진입. 갭업분을 그대로 지불하되 반드시 체결된다.
                 레벨(손절·목표)은 그 시가 기준으로 다시 계산한다 — 안 그러면
                 설계한 손익비가 깨진다.

    scale_in: 분할 진입. ((비중, ATR 하락배수), ...) 형태로 1차가 맨 앞이다.
      예) ((0.5, 0.0), (0.5, 1.0)) = 진입가에 절반, 진입가-1×ATR 에 나머지 절반.
      2차 이후는 보유 중 그 가격에 «닿아야» 체결된다 — 안 닿으면 그만큼만 보유한다.

      왜 하락 분할인가: 이 시장은 일간 중앙 변동이 3.26%p 라 진입 직후 며칠은
      노이즈가 지배한다. 발행 픽 실측에서 최대 역행 중앙값이 -11.4% 인데 92% 는
      진입가 위로 올라간 적이 있다 — **방향은 자주 맞는데 진입 시점이 나쁘다.**
      분할은 그 시점 리스크를 나눈다. 반대로 상승 분할(피라미딩)은 시점 리스크를
      줄이지 못한다.

      ⚠️ 손절선은 1차 진입 기준으로 확정되고 움직이지 않는다. R 은 «계획 평단»
      (전량 체결 가정) 기준이라 단일 진입과 같은 자로 비교된다.
    """
    if costs is None:
        costs = CostModel()
    detector = playbooks.ALL_DETECTORS.get(setup)
    if detector is None or len(df) < min_lookback + 2:
        return []
    needs_flows = setup == "flow_accumulation"
    if needs_flows and (flows is None or flows.empty):
        return []
    needs_earnings = setup == "pead"
    if needs_earnings and (earnings is None or earnings.empty):
        return []
    needs_discl = setup in playbooks.DISCLOSURE_SETUPS
    if needs_discl and (disclosures is None or disclosures.empty):
        return []

    trades: list[Trade] = []
    i = min_lookback
    n = len(df)
    while i < n - 1:
        cand = (detections[i] if detections is not None
                else _detect_at(df, i, detector, needs_flows, needs_earnings,
                                needs_discl, flows, earnings, disclosures))
        if cand is None or cand.side != "buy":  # 현재 플레이북은 모두 매수
            i += 1
            continue

        eff_style = style_override or cand.style
        lv = compute_levels(
            style=eff_style, side="buy", entry_price=cand.entry_ref,
            atr=cand.atr, risk_per_trade_pct=risk_per_trade_pct,
            support=cand.support, resistance=cand.resistance,
            setup=cand.setup, tp_r_mults=tp_r_mults,
            stop_atr_mult=stop_atr_mult, struct_stop=struct_stop,
            tp_atr_mults=tp_atr_mults,
        )
        entry = lv.entry_price
        stop = lv.stop_loss
        tp = lv.tp1

        # ── 진입 체결 ── (entry_mode) 진입 봉 인덱스를 정하고 필요하면 레벨 재계산
        i_entry = i
        timeout_for_fill = _TIMEOUT_BARS.get(eff_style, 10)
        if entry_mode == "limit":
            j = _find_fill(df, i, n, entry, timeout_for_fill)
            if j is None:
                i += 1                       # 못 산 신호는 거래가 아니다
                continue
            i_entry = j
        elif entry_mode == "open":
            if i + 1 >= n:
                break
            nxt_open = float(df["open"].iloc[i + 1])
            if nxt_open <= 0:
                i += 1
                continue
            lv = compute_levels(
                style=eff_style, side="buy", entry_price=nxt_open,
                atr=cand.atr, risk_per_trade_pct=risk_per_trade_pct,
                support=cand.support, resistance=cand.resistance,
                setup=cand.setup, tp_r_mults=tp_r_mults,
                stop_atr_mult=stop_atr_mult, struct_stop=struct_stop,
                tp_atr_mults=tp_atr_mults,
            )
            entry, stop, tp = lv.entry_price, lv.stop_loss, lv.tp1
            i_entry = i + 1

        # 분할 진입 — 계획 평단(전량 체결 가정)으로 R 을 잰다. 실제로 2·3차가
        # 안 채워지면 손익이 비례해 작아지므로 «안 산 몫»을 벌었다고 세지 않는다.
        legs = None
        if scale_in:
            legs = tuple((w, entry - d * cand.atr) for w, d in scale_in)
            total_w = sum(w for w, _ in legs)
            entry = sum(w * e for w, e in legs) / total_w      # 계획 평단
        risk = entry - stop
        # 노이즈 수준 손절폭 배제 — 라이브 시그널(generate)과 동일 기준(levels).
        if risk <= 0 or risk < min_risk_floor(entry, cand.atr):
            i += 1
            continue

        # 보유 상한 — 기본은 스타일별(_TIMEOUT_BARS). timeout_bars 를 주면 그 값으로
        # 고정한다("N일 보유 추천"). use_targets=False 면 목표가 청산을 끄고 손절과
        # 기간 만료만 남긴다 — «N일 뒤에 판다»를 그대로 재현하는 모드다.
        timeout = timeout_bars or _TIMEOUT_BARS.get(eff_style, 10)
        # 청산: 단일(tp1 전량) 또는 스케일아웃(tp1 50%+본전스톱 후 tp2 런).
        # 청산 추적은 «진입한 봉»부터 — 지정가 체결이 늦어지면 그만큼 늦게 시작한다.
        # (타임아웃은 진입 봉 기준으로 새로 센다 — 못 산 기간까지 보유로 치면 안 된다)
        if legs is not None or target_action == "trail":
            eff_legs = legs if legs is not None else ((1.0, entry),)
            pnl, gross, bars, _fw, _avg = _exit_scalein(
                df, i_entry, n, eff_legs, stop,
                tp if use_targets else float("inf"), timeout, costs,
                target_action=target_action, trail_r_mult=trail_r_mult)
        elif not use_targets:
            # 목표 없음 — 손절 아니면 기간 만료 종가. tp 를 도달 불가 값으로 둔다.
            pnl, gross, bars = _exit_single(
                df, i_entry, n, entry, stop, float("inf"), timeout, costs)
        elif scaleout:
            pnl, gross, bars = _exit_scaleout(
                df, i_entry, n, entry, stop, tp, lv.tp2, timeout, costs)
        else:
            pnl, gross, bars = _exit_single(
                df, i_entry, n, entry, stop, tp, timeout, costs)

        # 순손익(비용 차감) — 수수료·거래세·슬리피지 반영. 리스크는 계획값(entry-stop)
        # 유지 → '계획 리스크 대비 실현 순R'.
        r_multiple = pnl / risk
        r_gross = gross / risk                     # 비용 미반영 — 진단용
        ret_pct = (pnl / entry) * (lv.position_size_pct / 100.0)
        entry_ts = str(df["ts"].iloc[i_entry]) if "ts" in df.columns else ""
        trades.append(Trade(
            r_multiple=r_multiple, ret_pct=ret_pct, bars_held=bars,
            entry_ts=entry_ts, r_gross=r_gross,
        ))
        i = i_entry + bars + 1             # 청산 다음 봉부터 재탐색(중첩 방지)

    return trades
