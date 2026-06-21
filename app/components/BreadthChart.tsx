"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import { useMemo } from "react";
import type { BreadthRow } from "@/app/lib/supabase";

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  LineElement, LineController, BarElement, BarController,
  Title, Tooltip, Legend, Filler
);

type Props = {
  data: BreadthRow[];
  layers: { h20: boolean; h60: boolean; h252: boolean };
};

export default function BreadthChart({ data, layers }: Props) {
  const labels = useMemo(
    () =>
      data.map((r) => {
        const s = r.trade_date.toString();
        return `${s.slice(4, 6)}/${s.slice(6, 8)}`;
      }),
    [data]
  );

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          type: "line" as const,
          label: "上证指数",
          data: data.map((r) => r.sh_index),
          yAxisID: "yIndex",
          borderColor: "#e05252",
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.3,
          order: 1,
        },
        // 20d bar fill
        {
          type: "bar" as const,
          label: "_20bg",
          data: data.map((r) => r.new_high_20d),
          yAxisID: "yRatio",
          backgroundColor: "rgba(217,119,6,0.10)",
          borderColor: "transparent",
          barPercentage: 1,
          categoryPercentage: 1,
          order: 6,
          hidden: !layers.h20,
        },
        {
          type: "line" as const,
          label: "20日新高占比",
          data: data.map((r) => r.new_high_20d),
          yAxisID: "yRatio",
          borderColor: "#d97706",
          borderWidth: 1.5,
          borderDash: [3, 3],
          pointRadius: 0,
          tension: 0.3,
          order: 3,
          hidden: !layers.h20,
        },
        // 60d bar fill
        {
          type: "bar" as const,
          label: "_60bg",
          data: data.map((r) => r.new_high_60d),
          yAxisID: "yRatio",
          backgroundColor: "rgba(59,130,246,0.09)",
          borderColor: "transparent",
          barPercentage: 1,
          categoryPercentage: 1,
          order: 7,
          hidden: !layers.h60,
        },
        {
          type: "line" as const,
          label: "60日新高占比",
          data: data.map((r) => r.new_high_60d),
          yAxisID: "yRatio",
          borderColor: "#3b82f6",
          borderWidth: 1.5,
          borderDash: [6, 3],
          pointRadius: 0,
          tension: 0.3,
          order: 4,
          hidden: !layers.h60,
        },
        {
          type: "line" as const,
          label: "52周新高占比",
          data: data.map((r) => r.new_high_252d),
          yAxisID: "yRatio",
          borderColor: "#8b5cf6",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          order: 5,
          hidden: !layers.h252,
        },
      ],
    }),
    [data, labels, layers]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              if (ctx.dataset.label.startsWith("_")) return;
              if (ctx.dataset.label === "上证指数")
                return `上证：${ctx.parsed.y.toFixed(2)}`;
              return `${ctx.dataset.label}：${ctx.parsed.y.toFixed(2)}%`;
            },
          },
          filter: (item: any) => !item.dataset.label.startsWith("_") as boolean,
        },
      },
      scales: {
        x: {
          ticks: {
            color: "rgba(255,255,255,0.35)",
            font: { size: 10 },
            maxTicksLimit: 8,
            autoSkip: true,
            maxRotation: 0,
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        yIndex: {
          position: "left" as const,
          ticks: {
            color: "#e05252",
            font: { size: 10 },
            callback: (v: any) => v.toFixed(0),
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        yRatio: {
          position: "right" as const,
          min: 0,
          max: 70,
          ticks: {
            color: "#3b82f6",
            font: { size: 10 },
            callback: (v: any) => `${v}%`,
          },
          grid: { display: false },
        },
      },
    }),
    []
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Chart type="bar" data={chartData} options={options} />
    </div>
  );
}
