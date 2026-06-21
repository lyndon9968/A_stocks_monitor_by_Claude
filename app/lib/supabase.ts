import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export type BreadthRow = {
  trade_date: string;   // "20250613"
  sh_index: number;
  new_high_20d: number; // percentage 0-100
  new_high_60d: number;
  new_high_252d: number;
  total_stocks: number;
};
