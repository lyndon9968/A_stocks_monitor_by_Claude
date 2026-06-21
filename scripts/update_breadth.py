"""
每日收盘后由 GitHub Actions 调用。
计算全市场 20日/60日/252日 新高占比，写入 Supabase market_breadth 表。

环境变量：
  SUPABASE_URL         https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY  service_role key
"""

import os
import time
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import akshare as ak
import pandas as pd
from supabase import create_client, Client
from tqdm import tqdm

warnings.filterwarnings("ignore")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
CACHE_DIR    = Path(__file__).parent.parent / ".cache_akshare"
SLEEP_SEC    = 0.3

WINDOWS = {"new_high_20d": 20, "new_high_60d": 60, "new_high_252d": 252}

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_last_saved_date() -> str | None:
    res = sb.table("market_breadth").select("trade_date").order(
        "trade_date", desc=True
    ).limit(1).execute()
    if res.data:
        return str(res.data[0]["trade_date"])
    return None


def get_trade_dates(start: str, end: str) -> list[str]:
    df = ak.tool_trade_date_hist_sina()
    df["trade_date"] = df["trade_date"].astype(str).str.replace("-", "")
    mask = (df["trade_date"] >= start) & (df["trade_date"] <= end)
    return df.loc[mask, "trade_date"].tolist()


def get_all_codes() -> list[str]:
    """返回新浪格式代码列表，如 ['sh600000', 'sz000001', ...]"""
    df = ak.stock_info_a_code_name()
    codes = []
    for code in df["code"].tolist():
        if code.startswith("6"):
            codes.append(f"sh{code}")
        elif code.startswith(("0", "3")):
            codes.append(f"sz{code}")
    return codes


def fetch_hist(symbol: str, cache_file: Path) -> tuple[pd.DataFrame, bool]:
    """
    优先读缓存，缓存不足时走新浪接口补全。
    返回 (DataFrame, from_cache)，index 为 YYYYMMDD 字符串，列 'close'。
    """
    end = datetime.today().strftime("%Y%m%d")

    # 读缓存
    if cache_file.exists():
        try:
            df = pd.read_parquet(cache_file)
            df.index = df.index.astype(str)
            if df.index.max() >= "20260601":
                return df, True
        except Exception:
            cache_file.unlink(missing_ok=True)

    # 走新浪接口
    try:
        raw = ak.stock_zh_a_daily(symbol=symbol, adjust="qfq")
        if raw is None or raw.empty:
            return pd.DataFrame(), False

        raw["date"] = pd.to_datetime(raw["date"]).dt.strftime("%Y%m%d")
        raw = raw.set_index("date")[["close"]]
        raw.index = raw.index.astype(str)
        raw.to_parquet(cache_file)
        return raw, False
    except Exception:
        return pd.DataFrame(), False


def fetch_index(start: str, end: str) -> pd.DataFrame:
    raw = ak.stock_zh_index_daily(symbol="sh000001")
    raw["date"] = raw["date"].astype(str).str.replace("-", "")
    raw = raw.set_index("date")
    raw.index = raw.index.astype(str)
    return raw.loc[(raw.index >= start) & (raw.index <= end), ["close"]].rename(
        columns={"close": "sh_index"}
    )


def main():
    today = datetime.today().strftime("%Y%m%d")
    last_saved = get_last_saved_date()

    if last_saved and last_saved >= today:
        print(f"数据已是最新 ({last_saved})，无需更新。")
        return

    calc_start_dt = datetime.today() - timedelta(days=int(252 * 1.5))
    calc_start = calc_start_dt.strftime("%Y%m%d")

    result_start = last_saved if last_saved else calc_start
    trade_dates = get_trade_dates(result_start, today)

    if not trade_dates:
        print("今日非交易日，跳过。")
        return

    print(f"需要计算 {len(trade_dates)} 个交易日: {trade_dates[0]} → {trade_dates[-1]}")

    index_df = fetch_index(calc_start, today)

    codes = get_all_codes()
    print(f"全市场 {len(codes)} 只个股")

    CACHE_DIR.mkdir(exist_ok=True)
    count_df    = pd.DataFrame(0, index=trade_dates, columns=list(WINDOWS.keys()))
    valid_count = pd.Series(0, index=trade_dates)
    cache_hits  = 0

    for symbol in tqdm(codes, ncols=80):
        pure_code  = symbol[2:]   # sh600000 → 600000
        cache_file = CACHE_DIR / f"{pure_code}.parquet"

        hist, from_cache = fetch_hist(symbol, cache_file)

        if not from_cache:
            time.sleep(SLEEP_SEC)
        else:
            cache_hits += 1

        if hist.empty or len(hist) < 10:
            continue

        target = hist[hist.index.isin(trade_dates)]
        if target.empty:
            continue

        for col, window in WINDOWS.items():
            rolling_max = hist["close"].rolling(window, min_periods=window).max().shift(1)
            is_new_high = (hist["close"] > rolling_max).reindex(trade_dates).fillna(False)
            count_df[col] += is_new_high.astype(int)

        valid_count[target.index] += 1

    print(f"缓存命中: {cache_hits}/{len(codes)}")

    ratio_df = (count_df.div(valid_count.replace(0, pd.NA), axis=0) * 100).round(4)
    ratio_df["total_stocks"] = valid_count

    result = index_df.join(ratio_df, how="right")
    result.index.name = "trade_date"
    result = result.reset_index()

    rows = result.dropna(subset=["sh_index"]).to_dict(orient="records")
    for row in rows:
        row["trade_date"] = str(row["trade_date"])
        for k, v in row.items():
            if hasattr(v, "item"):
                row[k] = v.item()

    print(f"写入 {len(rows)} 行到 Supabase…")
    sb.table("market_breadth").upsert(rows, on_conflict="trade_date").execute()
    print("✅ 完成！")


if __name__ == "__main__":
    main()
