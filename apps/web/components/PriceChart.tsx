"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

interface Levels {
  entry?: number | null;
  stop?: number | null;
  tp1?: number | null;
}

// 결정적 합성 캔들 (실 OHLCV 연결 전까지 구조 표시용)
function sampleCandles(anchor: number, n = 120): CandlestickData[] {
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
    out.push({
      time: (start + i * 86400) as UTCTimestamp,
      open, high, low, close,
    });
    price = close;
  }
  return out;
}

export function PriceChart({
  anchor,
  levels,
  candles,
}: {
  anchor: number;
  levels: Levels;
  candles?: CandlestickData[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const chart: IChartApi = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6B7184",
        fontFamily: "var(--font-sans)",
      },
      grid: {
        vertLines: { color: "rgba(230,232,242,0.9)" },
        horzLines: { color: "rgba(230,232,242,0.9)" },
      },
      rightPriceScale: { borderColor: "#E6E8F2" },
      timeScale: { borderColor: "#E6E8F2", timeVisible: false },
      crosshair: { mode: 1 },
      height: el.clientHeight || 320,
      width: el.clientWidth,
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#D6293E",
      downColor: "#1F5FD0",
      borderVisible: false,
      wickUpColor: "#D6293E",
      wickDownColor: "#1F5FD0",
    });
    series.setData(
      candles && candles.length > 0 ? candles : sampleCandles(anchor),
    );

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
    line(levels.entry, "#5959E4", "진입");
    line(levels.stop, "#1F5FD0", "손절");
    line(levels.tp1, "#D6293E", "TP1");

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
    // candles 식별키: 길이 + 마지막 캔들 시각·종가 (참조 동일성 대신 값 기반).
  }, [
    anchor,
    levels.entry,
    levels.stop,
    levels.tp1,
    candles?.length ?? 0,
    candles?.[candles.length - 1]?.time ?? 0,
    candles?.[candles.length - 1]?.close ?? 0,
  ]);

  return <div ref={ref} className="h-80 w-full" />;
}
