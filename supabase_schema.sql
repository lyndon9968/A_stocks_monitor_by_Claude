-- 在 Supabase SQL Editor 中执行这个文件完成建表

create table if not exists market_breadth (
  trade_date    text primary key,   -- "20250613"
  sh_index      numeric(10, 2),
  new_high_20d  numeric(8, 4),      -- 百分比，如 18.25
  new_high_60d  numeric(8, 4),
  new_high_252d numeric(8, 4),
  total_stocks  integer,
  updated_at    timestamptz default now()
);

-- 按日期排序的查询索引
create index if not exists idx_market_breadth_date on market_breadth (trade_date desc);

-- 允许匿名读取（anon key 可以 SELECT，但不能 INSERT/UPDATE）
alter table market_breadth enable row level security;

create policy "公开只读" on market_breadth
  for select using (true);

-- 只有 service_role（GitHub Actions 使用）可以写入
create policy "服务端写入" on market_breadth
  for all using (auth.role() = 'service_role');
