# Manim NL Studio

用自然语言描述动画，AI 生成 Manim 代码，在线渲染预览。

## 架构

- **前端**: React 18 + Vite + Tailwind CSS + shadcn/ui（Vercel）
- **后端**: FastAPI + Manim CLI（Railway / 自托管）
- **数据库/存储**: Supabase（认证、项目、视频存储）

## 本地开发

### 前置要求
- Python 3.11+、FFmpeg、LaTeX（texlive）
- Node.js 18+
- Supabase 项目（可选）

### 后端
```bash
cd backend
cp .env.example .env  # 填入 OPENAI_API_KEY
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 前端
```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

## 部署

### 后端（Railway）
1. 连接 GitHub 仓库到 Railway
2. 使用项目根目录的 `railway.toml` 配置
3. 添加 `backend/.env.example` 中的环境变量
4. Railway 自动检测 Dockerfile 构建

### 前端（Vercel）
1. 连接 GitHub 仓库到 Vercel
2. Root Directory 设为 `frontend`
3. 添加环境变量：
   - `VITE_API_BASE_URL` = Railway 后端 URL
   - `VITE_SUPABASE_URL` = Supabase 项目 URL
   - `VITE_SUPABASE_ANON_KEY` = Supabase anon key

### 自定义域名
- Vercel: Project Settings > Domains
- Railway: Service Settings > Networking > Custom Domain
- 后端 `ALLOWED_ORIGINS` 环境变量设为前端域名（如 `https://amae1.eu.cc`）

## Supabase 配置

在 Supabase Dashboard > SQL Editor 中执行 `supabase/migrations/20250513000000_manim_studio.sql` 创建项目表和存储桶。
