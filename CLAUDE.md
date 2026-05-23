# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Manim NL Studio** — an AI-powered tool that generates Manim (math animation) code from natural language descriptions. Users describe an animation in Chinese/English, an LLM generates Python Manim code, and the backend renders it to MP4 video.

## Commands

### Backend (FastAPI + Manim)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload          # Dev server on :8000
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev                        # Dev server on :5173 (proxies /api → :8000)
npm run build                      # Type-check + Vite build
```

### Lint/Type-check
```bash
cd frontend && npx tsc --noEmit    # TypeScript type-check (no dedicated linter configured)
```

There are no test suites configured in this project.

## Architecture

### Three-mode operation
The app has three user-facing modes in `App.tsx`:
- **Simple mode**: Frontend calls LLM directly from browser, sends generated code to backend for validation/render
- **Agent mode**: Backend orchestrates LLM + syntax validation + render via SSE stream (`/api/agent/submit` → `/api/agent/stream/{job_id}`)
- **Teacher mode**: Upload math problem image → vision model extracts problem → LLM solves → generates Manim code (multi-phase SSE workflow)

### Data flow (Agent/Teacher mode)
1. Frontend calls `/api/agent/submit` or `/api/teacher/submit` → gets `job_id`
2. Frontend opens SSE connection to `/api/agent/stream/{job_id}`
3. Backend `agent/workflow.py` runs: LLM generate → validate syntax → render with manim CLI → auto-fix loop on failure
4. Events stream back: `step_start` → `code_generated` → `validation_result` → `render_result` → `complete`
5. State managed by `agentReducer` in `frontend/src/lib/agent-store.ts`

### Key backend modules
- `main.py` — FastAPI app, all HTTP endpoints, CORS config, serves frontend SPA in production
- `agent/workflow.py` — Core agent workflow (LLM call → validate → render loop) and teacher workflow (extract → solve → generate → refine)
- `agent/tools.py` — Syntax validation, MathTex Chinese detection/fix, manim CLI render via subprocess
- `agent/prompts.py` — All system prompts for code generation, teacher mode, and code fixing
- `agent/vision.py` — Vision model integration for math problem extraction from images
- `agent/queue.py` — Async job queue with semaphore-based concurrency control
- `supabase_sync.py` — Supabase admin client, JWT decoding, project CRUD, video upload

### Key frontend modules
- `App.tsx` — Main orchestrator, all mode logic, state coordination
- `lib/sse.ts` — SSE client for agent/teacher streaming (submit + stream pattern)
- `lib/agent-store.ts` — `useReducer`-based state machine for workflow progress
- `lib/api.ts` — API base URL resolution (`VITE_API_BASE_URL`), fetch helpers
- `lib/supabase.ts` — Supabase client init (runtime config from `/api/config`)
- `lib/llm-client.ts` — Direct browser-to-LLM calls for Simple mode
- `components/SettingsDialog.tsx` — Multi-provider LLM config (OpenAI/Anthropic/compatible), vision model config

### Database (Supabase)
Single table `manim_projects` with RLS: `(id, user_id, job_id, prompt, code, status, storage_object_path, created_at, updated_at)`. Video files stored in `renders` bucket. Schema in `supabase/migrations/`.

## Critical Constraints

### Manim code generation rules
- Scene class must be `GeneratedScene(Scene)` — hardcoded everywhere
- Chinese text MUST use `Text("中文", font="Noto Sans CJK SC")`, NEVER inside `MathTex/Tex` (LaTeX doesn't support Unicode Chinese)
- MathTex must use raw strings `r"..."`, no `$` delimiters
- `agent/tools.py` has `check_chinese_in_mathtex()` and `fix_chinese_in_mathtex()` that auto-detect and fix these issues

### LLM integration
- Backend supports both OpenAI-format and Anthropic-format APIs via `api_format` field
- `_llm_chat()` in `workflow.py` handles both; Anthropic system messages are extracted to top-level param
- Anthropic thinking blocks are logged but skipped in response extraction
- LLM config is passed per-request from frontend (not just env vars) — users configure their own API keys in Settings

### SSE streaming pattern
All long-running backend operations use SSE (Server-Sent Events), not WebSocket. The pattern is:
1. POST to submit endpoint → returns `{ job_id }`
2. GET `/api/agent/stream/{job_id}` → SSE stream with replay + live events
3. Keepalive comments (`: keepalive\n\n`) sent every 30s on idle

### Production deployment
- Backend: Railway (Dockerfile in `backend/`), health check at `/api/health`
- Frontend: Vercel or served by FastAPI SPA fallback from `frontend/dist/`
- `VITE_API_BASE_URL` env var points frontend to backend in production
- `ALLOWED_ORIGINS` env var configures CORS on backend

## Tool Usage (MCP)
- **Database**: Use `supabase` MCP to fetch schema. DO NOT guess table columns.
- **Debugging**: Use `puppeteer` only when console logs are insufficient.
- **Logic analysis**: Use `sequential_thinking` before writing backend-to-frontend glue code.
- Avoid reading `node_modules` or `dist` folders. Use `grep` to find specific code.
