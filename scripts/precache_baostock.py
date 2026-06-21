"""
预缓存脚本（BaoStock版）
完全免费，无需注册，专做A股，比AkShare更稳定。

安装：pip install baostock pandas tqdm pyarrow
用法：python scripts/precache_baostock.py
"""

import time
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import baostock as bs
import pandas as pd
from tqdm import tqdm

warnings.filterwarnings("ignore")

CACHE_DIR = Path(__file__).parent.parent / ".cache_akshare"

# 真正的A股前缀（排除指数）
STOCK_PREFIXES = ("sh.60", "sh.68", "sz.00", "sz.30")


def get_all_codes() -> list[str]:
    """获取全市场A股代码，返回 ['sh.600000', 'sz.000001', ...]"""
    today = datetime.today().strftime("%Y-%m-%d")
    rs = bs.query_all_stock(day=today)
    codes = []
    while rs.error_code == "0" and rs.next():
        code = rs.get_row_data()[0]
        if any(code.startswith(p) for p in STOCK_PREFIXES):
            codes.append(code)
    return codes


def fetch_and_cache(code: str, start: str, end: str, cache_file: Path) -> str:
    """拉取单只股票并写入缓存。返回: 'ok' | 'empty' | 'error'"""
    start_fmt = f"{start[:4]}-{start[4:6]}-{start[6:]}"
    end_fmt   = f"{end[:4]}-{end[4:6]}-{end[6:]}"

    rs = bs.query_history_k_data_plus(
        code, "date,close",
        start_date=start_fmt, end_date=end_fmt,
        frequency="d", adjustflag="2",  # 前复权
    )

    if rs.error_code != "0":
        return "error"

    rows = []
    while rs.next():
        rows.append(rs.get_row_data())

    if not rows:
        return "empty"

    df = pd.DataFrame(rows, columns=["date", "close"])
    df["date"]  = df["date"].str.replace("-", "")
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    df = df.dropna().set_index("date")
    df.index = df.index.astype(str)
    df.to_parquet(cache_file)
    return "ok"


def main():
    CACHE_DIR.mkdir(exist_ok=True)

    start = (datetime.today() - timedelta(days=int(252 * 1.5))).strftime("%Y%m%d")
    end   = datetime.today().strftime("%Y%m%d")

    print(f"数据区间：{start} → {end}")
    print(f"缓存目录：{CACHE_DIR.resolve()}")

    print("连接 BaoStock...")
    lg = bs.login()
    if lg.error_code != "0":
        print(f"登录失败: {lg.error_msg}")
        return
    print("连接成功\n")

    codes = get_all_codes()
    total = len(codes)

    already = sum(
        1 for c in codes
        if (CACHE_DIR / f"{c.split('.')[1]}.parquet").exists()
    )
    print(f"共 {total} 只，已缓存 {already} 只，剩余 {total - already} 只\n")

    ok, fail, skip = 0, 0, 0

    for code in tqdm(codes, ncols=80):
        pure_code  = code.split(".")[1]
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
            result = fetch_and_cache(code, start, end, cache_file)

            if result == "ok":
                ok += 1
                break
            elif result == "empty":
                skip += 1
                break
            else:
                wait = 3 * (attempt + 1)
                tqdm.write(f"[RETRY {attempt+1}/3] {code} 等待{wait}s")
                time.sleep(wait)
                bs.logout()
                bs.login()
                if attempt == 2:
                    fail += 1
                    tqdm.write(f"[FAIL] {code} 放弃")

    bs.logout()

    cached_total = len(list(CACHE_DIR.glob("*.parquet")))
    print(f"\n✅ 完成！新下载 {ok} 只，跳过 {skip} 只，失败 {fail} 只")
    print(f"缓存目录共 {cached_total} 个文件")


if __name__ == "__main__":
    main()
