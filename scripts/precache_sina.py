"""
预缓存脚本（新浪财经版）
使用 AkShare 的新浪接口，稳定不限流。

安装：pip install akshare pandas tqdm pyarrow
用法：python scripts/precache_sina.py
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
SLEEP_SEC = 0.3


def get_all_codes() -> list[str]:
    """获取全市场A股代码，返回新浪格式如 sh600000"""
    df = ak.stock_info_a_code_name()
    codes = []
    for code in df["code"].tolist():
        if code.startswith("6"):
            codes.append(f"sh{code}")
        elif code.startswith(("0", "3")):
            codes.append(f"sz{code}")
        # 跳过北交所(8开头)
    return codes


def fetch_and_cache(symbol: str, start: str, end: str, cache_file: Path) -> str:
    """
    symbol: 新浪格式，如 sh600000
    返回: 'ok' | 'empty' | 'error'
    """
    try:
        df = ak.stock_zh_a_daily(symbol=symbol, adjust="qfq")

        if df is None or df.empty:
            return "empty"

        # 统一处理日期列
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y%m%d")
        df = df.set_index("date")[["close"]]
        df.index = df.index.astype(str)

        # 只保留需要的区间
        df = df.loc[(df.index >= start) & (df.index <= end)]
        if df.empty:
            return "empty"

        df.to_parquet(cache_file)
        return "ok"

    except Exception as e:
        return f"error:{e}"


def main():
    CACHE_DIR.mkdir(exist_ok=True)

    start = (datetime.today() - timedelta(days=int(252 * 1.5))).strftime("%Y%m%d")
    end   = datetime.today().strftime("%Y%m%d")

    print(f"数据区间：{start} → {end}")
    print(f"缓存目录：{CACHE_DIR.resolve()}")

    print("获取股票列表...")
    codes = get_all_codes()
    total = len(codes)

    already = sum(
        1 for c in codes
        if (CACHE_DIR / f"{c[2:]}.parquet").exists()  # sh600000 → 600000.parquet
    )
    print(f"共 {total} 只，已缓存 {already} 只，剩余 {total - already} 只\n")

    ok, fail, skip = 0, 0, 0

    for symbol in tqdm(codes, ncols=80):
        pure_code  = symbol[2:]                        # sh600000 → 600000
        cache_file = CACHE_DIR / f"{pure_code}.parquet"

        # 断点续传
        if cache_file.exists():
            try:
                df = pd.read_parquet(cache_file)
                df.index = df.index.astype(str)
                if df.index.max() >= end:
                    skip += 1
                    continue
            except Exception:
                cache_file.unlink(missing_ok=True)

        # 拉取，最多重试3次
        for attempt in range(3):
            result = fetch_and_cache(symbol, start, end, cache_file)

            if result == "ok":
                ok += 1
                time.sleep(SLEEP_SEC)
                break
            elif result == "empty":
                skip += 1
                break
            else:
                wait = 3 * (attempt + 1)  # 3s → 6s → 9s
                tqdm.write(f"[RETRY {attempt+1}/3] {symbol} 等待{wait}s | {result}")
                time.sleep(wait)
                if attempt == 2:
                    fail += 1
                    tqdm.write(f"[FAIL] {symbol} 放弃")

    cached_total = len(list(CACHE_DIR.glob("*.parquet")))
    print(f"\n✅ 完成！新下载 {ok} 只，跳过(已缓存) {skip} 只，失败 {fail} 只")
    print(f"缓存目录共 {cached_total} 个文件")


if __name__ == "__main__":
    main()
