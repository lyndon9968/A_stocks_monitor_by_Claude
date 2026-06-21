"use client";

import { useState } from "react";
import type { BreadthRow } from "@/app/lib/supabase";

type Props = { latest: BreadthRow; prev: BreadthRow };

function getSignal(r20: number, r60: number, r252: number) {
  const score =
    (r20 > 25 ? 2 : r20 > 12 ? 1 : 0) +
    (r60 > 20 ? 2 : r60 > 10 ? 1 : 0) +
    (r252 > 12 ? 2 : r252 > 5 ? 1 : 0);
  if (score >= 5) return { label: "强势扩散", color: "#e05252" };
  if (score >= 3) return { label: "结构分化", color: "#d97706" };
  return { label: "动能收缩", color: "#22c55e" };
}

export default function AIPanel({ latest, prev }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const sig = getSignal(latest.new_high_20d, latest.new_high_60d, latest.new_high_252d);

  async function runAI() {
    setLoading(true);
    setText("");
    const idxChg = latest.sh_index - prev.sh_index;
    const trend20 = latest.new_high_20d - prev.new_high_20d;
    const trend60 = latest.new_high_60d - prev.new_high_60d;

    const prompt = `你是一位专业A股量化分析师，擅长市场宽度分析。请根据以下数据给出简洁专业的中文市场研判（180字以内，直接给结论和建议，不要分段）。

当前指标：
- 上证指数：${latest.sh_index.toFixed(2)}，较昨日 ${idxChg >= 0 ? "+" : ""}${idxChg.toFixed(2)}
- 20日新高占比：${latest.new_high_20d.toFixed(1)}%（较昨日 ${trend20 >= 0 ? "+" : ""}${trend20.toFixed(1)}%）
- 60日新高占比：${latest.new_high_60d.toFixed(1)}%（较昨日 ${trend60 >= 0 ? "+" : ""}${trend60.toFixed(1)}%）
- 52周新高占比：${latest.new_high_252d.toFixed(1)}%
- 参与计算个股数：${latest.total_stocks.toLocaleString()} 只

判断规则：20日>30%、60日>25%、52周>15% 为强势扩散；三指标分化为结构行情；均低为动能收缩；52周<5% 有熊市特征。

请输出：当前市场状态、主要机会或风险、操作建议。`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await res.json();
      const result =
        json.content
          ?.filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("") || "解读失败，请重试。";
      setText(result);
    } catch {
      setText("网络错误，请重试。");
    }
    setLoading(false);
  }

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <div className="ai-title-row">
          <span className="ai-icon">✦</span>
          <span className="ai-title">AI 市场解读</span>
          <span className="signal-badge" style={{ color: sig.color, borderColor: sig.color + "40" }}>
            {sig.label}
          </span>
        </div>
        <button className="ai-btn" onClick={runAI} disabled={loading}>
          {loading ? "解读中…" : text ? "重新解读" : "生成解读"}
        </button>
      </div>
      <div className="ai-body">
        {loading ? (
          <span className="ai-placeholder">AI 正在分析市场宽度数据，请稍候…</span>
        ) : text ? (
          <p>{text}</p>
        ) : (
          <span className="ai-placeholder">
            点击「生成解读」，AI 将根据三条宽度指标走势给出市场研判。
          </span>
        )}
      </div>
    </div>
  );
}
