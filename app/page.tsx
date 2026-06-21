"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { BreadthRow } from "@/app/lib/supabase";
import AIPanel from "./components/AIPanel";

const BreadthChart = dynamic(() => import("./components/BreadthChart"), {
  ssr: false,
  loading: () => <div className="chart-loading">图表加载中…</div>,
});

type Range = 60 | 120 | 250;

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

function signalColor(r20: number, r60: number, r252: number) {
  const score =
    (r20 > 25 ? 2 : r20 > 12 ? 1 : 0) +
    (r60 > 20 ? 2 : r60 > 10 ? 1 : 0) +
    (r252 > 12 ? 2 : r252 > 5 ? 1 : 0);
  if (score >= 5) return "#e05252";
  if (score >= 3) return "#d97706";
  return "#22c55e";
}

export default function Home() {
  const [range, setRange] = useState<Range>(60);
  const [data, setData] = useState<BreadthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState({ h20: true, h60: true, h252: true });

  const fetchData = useCallback(async (days: Range) => {
    setLoading(true);
    const res = await fetch(`/api/breadth?days=${days}`);
    const json: BreadthRow[] = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(range); }, [range, fetchData]);

  const latest = data[data.length - 1];
  const prev   = data[data.length - 2];

  const idxChg  = latest && prev ? latest.sh_index - prev.sh_index : 0;
  const idxPct  = latest && prev ? idxChg / prev.sh_index * 100 : 0;
  const r20chg  = latest && prev ? latest.new_high_20d  - prev.new_high_20d  : 0;
  const r60chg  = latest && prev ? latest.new_high_60d  - prev.new_high_60d  : 0;
  const r252chg = latest && prev ? latest.new_high_252d - prev.new_high_252d : 0;

  function toggleLayer(key: keyof typeof layers) {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  }

  const dateStr = latest
    ? (() => {
        const s = latest.trade_date.toString();
        return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
      })()
    : "—";

  return (
    <main>
      {/* Header */}
      <header>
        <div>
          <h1>A股大盘监控</h1>
          <p className="sub" style={{display:"flex",justifyContent:"space-between"}}><span>{loading ? "数据加载中…" : `最新数据 · ${dateStr}`}</span><span style={{color:"rgba(255,255,255,0.25)"}}>Created by CCC</span></p>
        </div>
        <div className="range-tabs">
          {([60, 120, 250] as Range[]).map((d) => (
            <button
              key={d}
              className={`tab ${range === d ? "on" : ""}`}
              onClick={() => setRange(d)}
            >
              {d === 60 ? "3月" : d === 120 ? "6月" : "1年"}
            </button>
          ))}
        </div>
      </header>

      {/* Metric cards */}
      <div className="metrics">
        <div className="mc">
          <div className="mc-label">上证指数</div>
          <div className="mc-val" style={{ color: idxChg >= 0 ? "#e05252" : "#22c55e" }}>
            {latest ? fmt(latest.sh_index) : "—"}
          </div>
          <div className="mc-sub" style={{ color: idxChg >= 0 ? "#e05252" : "#22c55e" }}>
            {latest && prev ? `${idxChg >= 0 ? "+" : ""}${fmt(idxChg)} (${idxPct >= 0 ? "+" : ""}${fmt(idxPct)}%)` : "—"}
          </div>
        </div>
        <div className="mc">
          <div className="mc-label">20日新高占比</div>
          <div className="mc-val" style={{ color: "#d97706" }}>
            {latest ? fmt(latest.new_high_20d, 1) + "%" : "—"}
          </div>
          <div className="mc-sub">{latest && prev ? `${r20chg >= 0 ? "+" : ""}${fmt(r20chg, 1)}% 较昨日` : "—"}</div>
        </div>
        <div className="mc">
          <div className="mc-label">60日新高占比</div>
          <div className="mc-val" style={{ color: "#3b82f6" }}>
            {latest ? fmt(latest.new_high_60d, 1) + "%" : "—"}
          </div>
          <div className="mc-sub">{latest && prev ? `${r60chg >= 0 ? "+" : ""}${fmt(r60chg, 1)}% 较昨日` : "—"}</div>
        </div>
        <div className="mc">
          <div className="mc-label">52周新高占比</div>
          <div className="mc-val" style={{ color: "#8b5cf6" }}>
            {latest ? fmt(latest.new_high_252d, 1) + "%" : "—"}
          </div>
          <div className="mc-sub">{latest && prev ? `${r252chg >= 0 ? "+" : ""}${fmt(r252chg, 1)}% 较昨日` : "—"}</div>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="layer-row">
        <span className="layer-label">图层：</span>
        {([
          { key: "h20",  label: "20日新高", color: "#d97706" },
          { key: "h60",  label: "60日新高", color: "#3b82f6" },
          { key: "h252", label: "52周新高", color: "#8b5cf6" },
        ] as const).map(({ key, label, color }) => (
          <button
            key={key}
            className={`layer-btn ${layers[key] ? "on" : ""}`}
            style={layers[key] ? { borderColor: color, color } : {}}
            onClick={() => toggleLayer(key)}
          >
            <span className="layer-dot" style={{ background: layers[key] ? color : "transparent", borderColor: color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="chart-wrap">
        {!loading && data.length > 0 ? (
          <BreadthChart data={data} layers={layers} />
        ) : (
          <div className="chart-loading">{loading ? "数据加载中…" : "暂无数据"}</div>
        )}
      </div>

      {/* Legend */}
      <div className="legend">
        <span><span className="leg-line" style={{ background: "#e05252" }} />上证指数（左轴）</span>
        <span><span className="leg-line" style={{ background: "#d97706", opacity: 0.7 }} />20日新高（右轴）</span>
        <span><span className="leg-line" style={{ background: "#3b82f6", opacity: 0.7 }} />60日新高（右轴）</span>
        <span><span className="leg-line" style={{ background: "#8b5cf6", opacity: 0.7 }} />52周新高（右轴）</span>
      </div>

      {/* AI Panel */}
      {latest && prev && <AIPanel latest={latest} prev={prev} />}

      {/* Signal bar */}
      {latest && (
        <div className="signal-bar" style={{ borderColor: signalColor(latest.new_high_20d, latest.new_high_60d, latest.new_high_252d) + "30" }}>
          <span className="signal-dot" style={{ background: signalColor(latest.new_high_20d, latest.new_high_60d, latest.new_high_252d) }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            参与计算 {latest.total_stocks.toLocaleString()} 只个股
          </span>
        </div>
      )}
    </main>
  );
}
