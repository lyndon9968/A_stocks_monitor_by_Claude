# A股大盘监控 PWA

手机可安装的 A 股宽度指标监控应用。

## 技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| 数据采集 | Python + AkShare | 拉取全市场日 K，计算新高占比 |
| 定时任务 | GitHub Actions | 每日 16:30 自动运行，免服务器 |
| 数据库 | Supabase (PostgreSQL) | 存储历史指标，提供 REST API |
| 前端 | Next.js 14 + PWA | 手机可添加到主屏幕 |
| 托管 | Netlify | 免费，全球 CDN |

---

## 部署步骤

### 第一步：Supabase 建表

1. 注册 [Supabase](https://supabase.com)，新建项目
2. 打开 SQL Editor，粘贴并执行 `supabase_schema.sql` 中的内容
3. 在 Settings → API 页面记录下：
   - `Project URL`（即 `SUPABASE_URL`）
   - `anon public` key（即 `NEXT_PUBLIC_SUPABASE_ANON_KEY`）
   - `service_role` key（即 `SUPABASE_SERVICE_KEY`，只给 GitHub Actions 用）

### 第二步：首次历史数据导入

在本地运行一次，把历史数据写入 Supabase：

```bash
pip install akshare pandas tqdm pyarrow supabase

export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key"

# 修改脚本中的 calc_start 为 1-2 年前的日期
python scripts/update_breadth.py
```

> ⚠️ 首次运行需要拉取全市场 5000+ 只股票，约需 60-90 分钟。

### 第三步：配置 GitHub Actions

1. 把项目 push 到 GitHub
2. 在 GitHub 仓库 → Settings → Secrets → Actions 中添加：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
3. Actions 会在每个交易日 16:30（北京时间）自动运行

### 第四步：部署到 Netlify

1. 注册 [Netlify](https://netlify.com)，Import 你的 GitHub 仓库
2. 构建设置已在 `netlify.toml` 中自动配置
3. 在 Netlify → Site settings → Environment variables 中添加：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. 点击 Deploy，完成后获得形如 `https://your-app.netlify.app` 的链接

### 第五步：手机安装为 App

**iOS（Safari）**：打开网址 → 分享按钮 → 添加到主屏幕

**Android（Chrome）**：打开网址 → 菜单 → 安装应用

---

## 项目结构

```
astock-monitor/
├── app/
│   ├── api/breadth/route.ts    # 从 Supabase 读数据的 API 路由
│   ├── components/
│   │   ├── BreadthChart.tsx    # Chart.js 双轴图表
│   │   └── AIPanel.tsx         # Claude AI 市场解读面板
│   ├── lib/supabase.ts         # Supabase 客户端
│   ├── page.tsx                # 主页面
│   ├── layout.tsx              # PWA meta 标签
│   └── globals.css             # 全局样式（深色主题）
├── scripts/
│   └── update_breadth.py       # 每日数据采集脚本
├── public/
│   └── manifest.json           # PWA 配置
├── .github/workflows/
│   └── update-data.yml         # GitHub Actions 定时任务
├── supabase_schema.sql         # 建表 SQL
├── netlify.toml                # Netlify 部署配置
└── .env.example                # 环境变量模板
```

## 指标说明

| 指标 | 含义 | 信号意义 |
|---|---|---|
| 20日新高占比 | 创 20 日新高个股数 / 全市场总数 | 短期热度，反应快 |
| 60日新高占比 | 创 60 日新高个股数 / 全市场总数 | 中期趋势强弱 |
| 52周新高占比 | 创 252 日新高个股数 / 全市场总数 | 长期牛熊判断 |

**信号解读**：
- 三指标均高（20d>25%, 60d>20%, 52w>12%）→ 多头扩散，强势市场
- 短周期高、长周期低 → 结构性行情，个股分化
- 三指标均低，52w<5% → 动能收缩，防御为主
