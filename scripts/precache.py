"""
预缓存脚本：先把全市场股票数据下载到本地，再跑计算。
断点续传——已缓存的股票直接跳过，随时可以中断重启。
带重试机制，网络抖动时自动等待后重试。

用法：
  python scripts/precache.py
"""

import time
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import akshare as ak
import pandas as pd
from tqdm import tqdm

warnings.filterwarnings("ignore")

CACHE_DIR = Path(__file__).parent.parent / ".cache_akshare"
SLEEP_SEC = 0.8   # 加大间隔，减少被限流概率

def main():
    CACHE_DIR.mkdir(exist_ok=True)

    start = (datetime.today() - timedelta(days=int(252 * 1.5))).strftime("%Y%m%d")
    end   = datetime.today().strftime("%Y%m%d")

    print(f"数据区间：{start} → {end}")
    print(f"缓存目录：{CACHE_DIR.resolve()}")

    codes_df = ak.stock_info_a_code_name()
    codes = [c for c in codes_df["code"].tolist() if not c.startswith("8")]
    total = len(codes)

    already = sum(1 for c in codes if (CACHE_DIR / f"{c}.parquet").exists())
    print(f"共 {total} 只，已缓存 {already} 只，剩余 {total - already} 只\n")

    ok, fail, skip = 0, 0, 0

    for code in tqdm(codes, ncols=80):
        cache_file = CACHE_DIR / f"{code}.parquet"

        # 断点续传：已有缓存且覆盖到今天则跳过
        if cache_file.exists():
            try:
                df = pd.read_parquet(cache_file)
                df.index = df.index.astype(str)
                if df.index.max() >= end:
                    skip += 1
                    continue
            except Exception:
                cache_file.unlink(missing_ok=True)

        # 从网络拉取，最多重试3次
        success = False
        for attempt in range(3):
            try:
                raw = ak.stock_zh_a_hist(
                    symbol=code, period="daily",
                    start_date=start, end_date=end, adjust="qfq"
                )
                time.sleep(SLEEP_SEC)

                if raw is None or raw.empty:
                    break

                raw = raw.rename(columns={"日期": "date", "收盘": "close"})
                raw["date"] = raw["date"].astype(str).str.replace("-", "")
                raw = raw.set_index("date")[["close"]]
                raw.index = raw.index.astype(str)
                raw.to_parquet(cache_file)
                ok += 1
                success = True
                break

            except Exception as e:
                wait = 2 * (3 ** attempt)  # 2s → 6s → 18s
                tqdm.write(f"[RETRY {attempt+1}/3] {code} 等待{wait}s: {e}")
                time.sleep(wait)

        if not success and not (CACHE_DIR / f"{code}.parquet").exists():
            fail += 1

    print(f"\n✅ 完成！新下载 {ok} 只，跳过(已缓存) {skip} 只，失败 {fail} 只")
    print(f"缓存目录文件数：{len(list(CACHE_DIR.glob('*.parquet')))}")

if __name__ == "__main__":
    main()