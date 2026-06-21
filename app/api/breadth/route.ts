import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "60");

  const { data, error } = await supabase
    .from("market_breadth")
    .select("trade_date, sh_index, new_high_20d, new_high_60d, new_high_252d, total_stocks")
    .order("trade_date", { ascending: false })
    .limit(days);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 倒序取最新N条后，反转为正序给图表
  const sorted = (data || []).reverse();

  return NextResponse.json(sorted, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
