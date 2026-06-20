"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

export interface AlphaLevels {
  entry?: number | null;
  stop?: number | null;
  tp1?: number | null;
  tp2?: number | null;
}

// 알파존 = 진입/손절/목표를 '채워진 가격 존'으로 시각화.
//  - 목표 존(entry→tp1, tp1→tp2): 익절을 노리는 상방 구간 (초록)
//  - 알파 존(stop→entry): 진입 후 감내하는 리스크 구간 (블루)
//  - 손절선: 하단 하드 스톱 (적색)
// lightweight-charts 의 priceToCoordinate 로 가격→y 좌표를 매 프레임 동기화해
// HTML 밴드를 캔들 위에 겹친다(존이 줌/스크롤을 따라 움직임).
type Band = {
  el: HTMLDivElement;
  hi: number; // 존 상단 가격
  lo: number; // 존 하단 가격
};

// 결정적 합성 캔들 (실 OHLCV 연결 전 구조 표시용 — 기존 PriceChart 와 동일 시드)
function sampleCandles(anchor: number, n = 140): CandlestickData[] {
  const out: CandlestickData[] = [];
  let price = anchor * 0.82;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  const start = Math.floor(Date.UTC(2026, 0, 1) / 1000);
  for (let i = 0; i < n; i++) {
    const drift = (anchor - price) * 0.03;
    const open = price;
    const change = drift + rnd() * anchor * 0.022;
    const close = Math.max(1, open + change);
    const high = Math.max(open, close) * (1 + Math.abs(rnd()) * 0.012);
    const low = Math.min(open, close) * (1 - Math.abs(rnd()) * 0.012);
    out.push({ time: (start + i * 86400) as UTCTimestamp, open, high, low, close });
    price = close;
  }
  return out;
}

export function AlphaZoneChart({
  anchor,
  levels,
  candles,
  className,
}: {
  anchor: number;
  levels: AlphaLevels;
  candles?: CandlestickData[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !overlayRef.current) return;
    const el = ref.current;
    const overlay = overlayRef.current;

    const chart: IChartApi = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9aa4b2",
        fontFamily: "var(--font-sans)",
      },
      grid: {
        vertLines: { color: "rgba(34,39,50,0.5)" },
        horzLines: { color: "rgba(34,39,50,0.5)" },
      },
      rightPriceScale: { borderColor: "#222732", scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: "#222732", timeVisible: false },
      crosshair: { mode: 1 },
      autoSize: true,
    });

    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#2ebd85",
      downColor: "#f6465d",
      borderVisible: false,
      wickUpColor: "#2ebd85",
      wickDownColor: "#f6465d",
    });
    series.setData(candles && candles.length > 0 ? candles : sampleCandles(anchor));

    // ── 가격선 (존 경계) ──
    const line = (price: number | null | undefined, color: string, title: string) => {
      if (price == null) return;
      series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
    };
    line(levels.tp2, "#2ebd85", "TP2");
    line(levels.tp1, "#2ebd85", "목표");
    line(levels.entry, "#3d7bff", "진입");
    line(levels.stop, "#f6465d", "손절");

    // ── 채워진 존 밴드 (HTML 오버레이) ──
    const { entry, stop, tp1, tp2 } = levels;
    const mkBand = (
      hi: number | null | undefined,
      lo: number | null | undefined,
      bg: string,
    ): Band | null => {
      if (hi == null || lo == null || hi <= lo) return null;
      const d = document.createElement("div");
      d.style.position = "absolute";
      d.style.left = "0";
      d.style.pointerEvents = "none";
      d.style.background = bg;
      overlay.appendChild(d);
      return { el: d, hi, lo };
    };

    const bands: Band[] = [];
    // 목표 존: 진입~1차 목표 (진한 초록), 1차~2차 (옅은 초록)
    const tgt1 = mkBand(tp1, entry, "rgba(46,189,133,0.13)");
    if (tgt1) bands.push(tgt1);
    const tgt2 = mkBand(tp2, tp1, "rgba(46,189,133,0.07)");
    if (tgt2) bands.push(tgt2);
    // 알파 존: 손절~진입 (감내 리스크, 블루)
    const alpha = mkBand(entry, stop, "rgba(61,123,255,0.12)");
    if (alpha) bands.push(alpha);

    // ── 좌표 동기화 (priceToCoordinate, 매 프레임) ──
    let raf = 0;
    const reposition = () => {
      const scaleW = chart.priceScale("right").width();
      const plotW = Math.max(0, el.clientWidth - scaleW);
      for (const b of bands) {
        const yHi = series.priceToCoordinate(b.hi);
        const yLo = series.priceToCoordinate(b.lo);
        if (yHi == null || yLo == null) {
          b.el.style.display = "none";
          continue;
        }
        b.el.style.display = "block";
        b.el.style.top = `${yHi}px`;
        b.el.style.height = `${Math.max(0, yLo - yHi)}px`;
        b.el.style.width = `${plotW}px`;
      }
      raf = requestAnimationFrame(reposition);
    };
    raf = requestAnimationFrame(reposition);

    chart.timeScale().fitContent();

    // autoSize:true 가 리사이즈를 처리 — 별도 ResizeObserver 불필요(중복 경고 방지).
    return () => {
      cancelAnimationFrame(raf);
      for (const b of bands) b.el.remove();
      chart.remove();
    };
  }, [
    anchor,
    levels.entry,
    levels.stop,
    levels.tp1,
    levels.tp2,
    candles?.length ?? 0,
    candles?.[candles.length - 1]?.time ?? 0,
    candles?.[candles.length - 1]?.close ?? 0,
  ]);

  return (
    <div className={`relative w-full ${className ?? "h-[460px]"}`}>
      <div ref={ref} className="absolute inset-0" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
