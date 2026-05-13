import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch, resolveMediaUrl } from "./lib/api";
import { supabase } from "./lib/supabase";
import type { Health, ProjectRow } from "./lib/types";

import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { PromptPanel } from "./components/PromptPanel";
import { CodeEditor } from "./components/CodeEditor";
import { VideoPreview } from "./components/VideoPreview";
import { StatusBar } from "./components/StatusBar";
import { loadLlmConfig } from "./components/SettingsDialog";
import type { LlmConfig } from "./components/SettingsDialog";

export default function App() {
  const [prompt, setPrompt] = useState(
    "显示文字 Hello Manim，从左侧飞入，停留 2 秒后淡出"
  );
  const [code, setCode] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(loadLlmConfig);

  const token = session?.access_token ?? null;

  const refreshHealth = useCallback(async () => {
    try {
      const r = await apiFetch("/api/health");
      if (r.ok) setHealth(await r.json());
    } catch {
      setHealth(null);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    if (!token) {
      setProjects([]);
      return;
    }
    try {
      const r = await apiFetch("/api/projects", { method: "GET" }, token);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setProjects(Array.isArray(data.items) ? data.items : []);
    } catch {
      setProjects([]);
    }
  }, [token]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const onGenerate = async () => {
    setBusy(true);
    setStatus("正在根据描述生成 Manim 代码...");
    setVideoUrl(null);
    try {
      const r = await apiFetch(
        "/api/generate",
        {
          method: "POST",
          body: JSON.stringify({
            prompt,
            llm: llmConfig.apiKey
              ? { api_key: llmConfig.apiKey, base_url: llmConfig.baseUrl, model: llmConfig.model }
              : null,
          }),
        },
        token
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(typeof data.detail === "string" ? data.detail : "生成失败");
        return;
      }
      setCode(data.code ?? "");
      setJobId(data.job_id ?? null);
      setSelectedProjectId(data.job_id ?? null);
      setStatus(
        token
          ? "代码已生成并写入 Supabase；可编辑后渲染。"
          : "代码已生成。登录后可同步到 Supabase。"
      );
      void loadProjects();
    } catch (e) {
      setStatus(`网络错误：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onRender = async () => {
    if (!jobId) {
      setStatus("请先生成代码。");
      return;
    }
    setBusy(true);
    setStatus("Manim 正在渲染（首次可能较慢）...");
    setVideoUrl(null);
    try {
      const r = await apiFetch(
        "/api/render",
        {
          method: "POST",
          body: JSON.stringify({ job_id: jobId, code: code || null }),
        },
        token
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(typeof data.detail === "string" ? data.detail : "渲染失败");
        return;
      }
      const raw = data.video_url as string;
      setVideoUrl(resolveMediaUrl(raw, Date.now()));
      setStatus("预览已更新。");
      void loadProjects();
    } catch (e) {
      setStatus(`网络错误：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      void refreshHealth();
    }
  };

  const openProject = async (id: string) => {
    if (!token) return;
    setBusy(true);
    setStatus("正在载入云端项目...");
    try {
      const r = await apiFetch(
        `/api/project/${encodeURIComponent(id)}`,
        { method: "GET" },
        token
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(typeof data.detail === "string" ? data.detail : "加载失败");
        return;
      }
      setJobId(data.job_id ?? null);
      setSelectedProjectId(data.job_id ?? null);
      setPrompt(typeof data.prompt === "string" ? data.prompt : "");
      setCode(typeof data.code === "string" ? data.code : "");
      if (typeof data.video_url === "string" && data.video_url.length > 0) {
        setVideoUrl(resolveMediaUrl(data.video_url, Date.now()));
      } else {
        setVideoUrl(null);
      }
      setStatus("已从云端载入。");
    } finally {
      setBusy(false);
    }
  };

  const renameProject = async (jobId: string, newPrompt: string) => {
    if (!token) return;
    try {
      const r = await apiFetch(
        `/api/project/${encodeURIComponent(jobId)}`,
        { method: "PATCH", body: JSON.stringify({ prompt: newPrompt }) },
        token
      );
      if (r.ok) {
        void loadProjects();
        if (selectedProjectId === jobId) {
          setPrompt(newPrompt);
        }
      }
    } catch {
      // ignore
    }
  };

  const deleteProject = async (id: string) => {
    if (!token) return;
    try {
      const r = await apiFetch(
        `/api/project/${encodeURIComponent(id)}`,
        { method: "DELETE" },
        token
      );
      if (r.ok) {
        setProjects((prev) => prev.filter((p) => p.job_id !== id));
        if (selectedProjectId === id) {
          setSelectedProjectId(null);
          setJobId(null);
          setCode("");
          setVideoUrl(null);
        }
      }
    } catch {
      // ignore
    }
  };

  const newProject = () => {
    setPrompt("");
    setCode("");
    setJobId(null);
    setVideoUrl(null);
    setSelectedProjectId(null);
    setStatus("");
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header health={health} onLlmConfigChange={setLlmConfig} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar toggle for small screens */}
        <button
          className="lg:hidden fixed top-14 left-2 z-50 bg-surface border border-border rounded-md p-1.5"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 transition-transform`}
        >
          <Sidebar
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={(id) => {
              void openProject(id);
              if (window.innerWidth < 1024) setSidebarOpen(false);
            }}
            onNew={newProject}
            onRename={renameProject}
            onDelete={deleteProject}
            session={session}
            busy={busy}
            onStatusChange={setStatus}
          />
        </div>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Left: Prompt + Code */}
            <div className="flex flex-col lg:w-1/2 p-4 overflow-auto border-b lg:border-b-0 lg:border-r border-border">
              <div className="mb-4">
                <PromptPanel
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  onGenerate={onGenerate}
                  onRender={onRender}
                  busy={busy}
                  hasCode={!!code}
                />
              </div>
              <div className="flex-1 min-h-[250px]">
                <CodeEditor
                  value={code}
                  onChange={setCode}
                  disabled={busy}
                />
              </div>
            </div>

            {/* Right: Video Preview */}
            <div className="lg:w-1/2 p-4 overflow-auto">
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                预览
              </label>
              <VideoPreview videoUrl={videoUrl} />
            </div>
          </div>

          <StatusBar status={status} busy={busy} />
        </main>
      </div>
    </div>
  );
}
