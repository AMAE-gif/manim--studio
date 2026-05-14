import { useCallback, useEffect, useReducer, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch, resolveMediaUrl } from "./lib/api";
import { supabase } from "./lib/supabase";
import type { Health, ProjectRow } from "./lib/types";
import { submitAndStreamAgent, submitAndStreamTeacher } from "./lib/sse";
import { agentReducer, initialState } from "./lib/agent-store";
import type { AgentPlan } from "./lib/agent-store";

import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { PromptPanel } from "./components/PromptPanel";
import { AgentPanel } from "./components/AgentPanel";
import { TeacherModePanel } from "./components/TeacherModePanel";
import { CodeEditor } from "./components/CodeEditor";
import { VideoPreview } from "./components/VideoPreview";
import { StatusBar } from "./components/StatusBar";
import { loadLlmConfig, resolveVisionConfig } from "./components/SettingsDialog";
import type { LlmConfig, VisionConfig } from "./components/SettingsDialog";

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
  const [llmConfig, setLlmConfig] = useState<LlmConfig>(() => {
    const s = loadLlmConfig();
    const p = s.providers.find((pp) => pp.id === s.activeProviderId);
    return { apiKey: p?.apiKey || "", baseUrl: p?.baseUrl || "https://api.openai.com/v1", model: s.activeModel, apiFormat: (p?.apiFormat as "openai" | "anthropic") || "openai" };
  });
  const [visionConfig, setVisionConfig] = useState<VisionConfig>(() => {
    const s = loadLlmConfig();
    return s.vision;
  });
  const [mode, setMode] = useState<"simple" | "agent" | "teacher">("agent");

  const [agentState, agentDispatch] = useReducer(agentReducer, initialState);

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

  // Listen for custom events from AgentPanel and TeacherModePanel
  useEffect(() => {
    const onSetStyle = (e: Event) => {
      agentDispatch({ type: "SET_STYLE", analysis: (e as CustomEvent).detail });
    };
    const onSetRules = (e: Event) => {
      agentDispatch({ type: "SET_RULES", rules: (e as CustomEvent).detail });
    };
    const onSetProblemText = (e: Event) => {
      agentDispatch({ type: "PROBLEM_EXTRACTED", problemText: (e as CustomEvent).detail, problemType: agentState.problemType, expressions: agentState.expressions });
    };
    window.addEventListener("agent:set-style", onSetStyle);
    window.addEventListener("agent:set-rules", onSetRules);
    window.addEventListener("teacher:set-problem-text", onSetProblemText);
    return () => {
      window.removeEventListener("agent:set-style", onSetStyle);
      window.removeEventListener("agent:set-rules", onSetRules);
      window.removeEventListener("teacher:set-problem-text", onSetProblemText);
    };
  }, [agentState.problemType, agentState.expressions]);

  // Sync code from agent state to local state
  useEffect(() => {
    if (agentState.code) setCode(agentState.code);
  }, [agentState.code]);

  useEffect(() => {
    if (agentState.videoUrl) setVideoUrl(resolveMediaUrl(agentState.videoUrl, Date.now()));
  }, [agentState.videoUrl]);

  useEffect(() => {
    if (agentState.jobId) {
      setJobId(agentState.jobId);
      setSelectedProjectId(agentState.jobId);
      void loadProjects();
    }
  }, [agentState.jobId, loadProjects]);

  // Teacher mode handlers
  const onTeacherAnalyze = async (file: File) => {
    // Read config directly from localStorage to avoid state timing issues
    const freshSettings = loadLlmConfig();
    const freshProvider = freshSettings.providers.find((p) => p.id === freshSettings.activeProviderId);
    const freshLlmConfig: LlmConfig = {
      apiKey: freshProvider?.apiKey || "",
      baseUrl: freshProvider?.baseUrl || "https://api.openai.com/v1",
      model: freshSettings.activeModel,
      apiFormat: (freshProvider?.apiFormat as "openai" | "anthropic") || "openai",
    };
    const freshVision = resolveVisionConfig(freshLlmConfig, freshSettings.vision);
    console.log("onTeacherAnalyze - fresh resolvedVision:", { ...freshVision, apiKey: freshVision.apiKey ? "***" + freshVision.apiKey.slice(-4) : "(empty)" });

    if (!freshVision.apiKey) {
      setStatus(`视觉模型 API Key 未配置。代码模型 API Key: ${freshLlmConfig.apiKey ? "已配置" : "未配置"}，视觉 useSameAsCode: ${freshSettings.vision.useSameAsCode}。请在设置中配置。`);
      return;
    }
    setBusy(true);
    agentDispatch({ type: "RESET" });
    try {
      // Read file as base64 and save to state
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data:image/...;base64, prefix
          const base64 = result.split(",")[1] || result;
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });
      const imageBase64 = await base64Promise;
      agentDispatch({ type: "SET_IMAGE", imageBase64 });

      const formData = new FormData();
      formData.append("file", file);
      // Send vision config as query params (FormData field gets lost in transmission)
      const visionParams = new URLSearchParams();
      if (freshVision.apiKey) visionParams.set("vision_api_key", freshVision.apiKey);
      if (freshVision.baseUrl) visionParams.set("vision_base_url", freshVision.baseUrl);
      if (freshVision.model) visionParams.set("vision_model", freshVision.model);
      visionParams.set("vision_api_format", freshVision.apiFormat || "openai");
      const qs = visionParams.toString();
      const url = `/api/teacher/analyze${qs ? "?" + qs : ""}`;
      const r = await apiFetch(url, { method: "POST", body: formData }, token);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus(typeof data.detail === "string" ? data.detail : `题目识别失败 (HTTP ${r.status})`);
        return;
      }
      if (data.error) {
        setStatus(`识别失败：${data.error}`);
        return;
      }
      if (!data.problem_text) {
        setStatus("识别失败：未返回题目内容。请检查视觉模型配置。");
        return;
      }
      agentDispatch({
        type: "PROBLEM_EXTRACTED",
        problemText: data.problem_text || "",
        problemType: data.problem_type || "",
        expressions: data.expressions || [],
      });
      setStatus("题目已识别。");
    } catch (e) {
      setStatus(`网络错误：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onTeacherSolve = async () => {
    if (!agentState.problemText && !prompt.trim()) return;
    setBusy(true);
    setVideoUrl(null);

    // Read fresh config from localStorage
    const freshSettings = loadLlmConfig();
    const freshProvider = freshSettings.providers.find((p) => p.id === freshSettings.activeProviderId);
    const freshLlm: LlmConfig = {
      apiKey: freshProvider?.apiKey || "",
      baseUrl: freshProvider?.baseUrl || "https://api.openai.com/v1",
      model: freshSettings.activeModel,
      apiFormat: (freshProvider?.apiFormat as "openai" | "anthropic") || "openai",
    };
    const freshVision = resolveVisionConfig(freshLlm, freshSettings.vision);

    await submitAndStreamTeacher(
      {
        prompt: agentState.problemText || prompt,
        image_base64: null,  // Don't re-send image; problem text is already extracted
        content_type: "image/png",
        llm: freshLlm.apiKey
          ? { api_key: freshLlm.apiKey, base_url: freshLlm.baseUrl, model: freshLlm.model, api_format: freshLlm.apiFormat }
          : null,
        vision_llm: {
          api_key: freshVision.apiKey,
          base_url: freshVision.baseUrl || undefined,
          model: freshVision.model || "gpt-4o",
        },
        style_analysis: agentState.styleAnalysis || null,
        rules: {
          max_duration: agentState.rules.maxDuration,
          color_palette: agentState.rules.colorPalette || null,
          font_size: agentState.rules.fontSize,
          background: agentState.rules.background || null,
          custom_rules: agentState.rules.customRules || null,
        },
      },
      {
        onStepStart: (data) => agentDispatch({ type: "STEP_START", step: data.step, message: data.message }),
        onProblemExtracted: (data) => agentDispatch({ type: "PROBLEM_EXTRACTED", problemText: data.problem_text, problemType: data.problem_type, expressions: data.expressions }),
        onSolutionReady: (data) => agentDispatch({ type: "SOLUTION_READY", steps: data.steps, summary: data.summary }),
        onSolutionRefined: (data) => agentDispatch({ type: "SOLUTION_REFINED", steps: data.steps, instruction: data.refinement_applied, stepIndex: null }),
        onCodeGenerated: (data) => agentDispatch({ type: "CODE_GENERATED", code: data.code }),
        onValidationResult: (data) => {
          agentDispatch({ type: "STEP_END", passed: data.passed, error: data.syntax_error });
          if (!data.passed) {
            agentDispatch({ type: "STEP_START", step: "correct", message: "修正中..." });
          }
        },
        onRenderResult: (data) => {
          agentDispatch({ type: "STEP_END", passed: data.passed, error: data.error });
          if (data.video_url) {
            agentDispatch({ type: "RENDER_RESULT", passed: true, videoUrl: data.video_url });
          }
        },
        onComplete: (data) => {
          agentDispatch({ type: "COMPLETE", code: data.code, jobId: data.job_id });
          if (data.session_id) {
            agentDispatch({ type: "SET_SESSION_ID", sessionId: data.session_id });
          }
          setCode(data.code);
          setStatus("代码已生成，请审查后点击「生成动画」渲染视频。");
        },
        onError: (data) => {
          agentDispatch({ type: "ERROR", message: data.message });
          setStatus(`错误：${data.message}`);
        },
      },
      token
    );

    setBusy(false);
  };

  const onTeacherRefine = async (instruction: string, stepIndex: number | null) => {
    if (!agentState.sessionId) return;
    setBusy(true);
    setVideoUrl(null);

    // Read fresh config from localStorage
    const freshSettings = loadLlmConfig();
    const freshProvider = freshSettings.providers.find((p) => p.id === freshSettings.activeProviderId);
    const freshLlm: LlmConfig = {
      apiKey: freshProvider?.apiKey || "",
      baseUrl: freshProvider?.baseUrl || "https://api.openai.com/v1",
      model: freshSettings.activeModel,
      apiFormat: (freshProvider?.apiFormat as "openai" | "anthropic") || "openai",
    };
    const freshVision = resolveVisionConfig(freshLlm, freshSettings.vision);

    await submitAndStreamTeacher(
      {
        session_id: agentState.sessionId,
        refinement: instruction,
        step_index: stepIndex,
        llm: freshLlm.apiKey
          ? { api_key: freshLlm.apiKey, base_url: freshLlm.baseUrl, model: freshLlm.model, api_format: freshLlm.apiFormat }
          : null,
        vision_llm: {
          api_key: freshVision.apiKey,
          base_url: freshVision.baseUrl || undefined,
          model: freshVision.model || "gpt-4o",
        },
        rules: {
          max_duration: agentState.rules.maxDuration,
          color_palette: agentState.rules.colorPalette || null,
          font_size: agentState.rules.fontSize,
          background: agentState.rules.background || null,
          custom_rules: agentState.rules.customRules || null,
        },
      },
      {
        onStepStart: (data) => agentDispatch({ type: "STEP_START", step: data.step, message: data.message }),
        onSolutionRefined: (data) => agentDispatch({ type: "SOLUTION_REFINED", steps: data.steps, instruction: data.refinement_applied, stepIndex }),
        onCodeGenerated: (data) => agentDispatch({ type: "CODE_GENERATED", code: data.code }),
        onValidationResult: (data) => {
          agentDispatch({ type: "STEP_END", passed: data.passed, error: data.syntax_error });
          if (!data.passed) {
            agentDispatch({ type: "STEP_START", step: "correct", message: "修正中..." });
          }
        },
        onRenderResult: (data) => {
          agentDispatch({ type: "STEP_END", passed: data.passed, error: data.error });
          if (data.video_url) {
            agentDispatch({ type: "RENDER_RESULT", passed: true, videoUrl: data.video_url });
          }
        },
        onComplete: (data) => {
          agentDispatch({ type: "COMPLETE", code: data.code, videoUrl: data.video_url, jobId: data.job_id });
          setStatus("修改已应用，动画已重新生成。");
        },
        onError: (data) => {
          agentDispatch({ type: "ERROR", message: data.message });
          setStatus(`错误：${data.message}`);
        },
      },
      token
    );

    setBusy(false);
  };

  // Agent mode generate
  const onAgentGenerate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setVideoUrl(null);
    agentDispatch({ type: "RESET" });

    await submitAndStreamAgent(
      {
        prompt,
        llm: llmConfig.apiKey
          ? { api_key: llmConfig.apiKey, base_url: llmConfig.baseUrl, model: llmConfig.model, api_format: llmConfig.apiFormat }
          : null,
        style_analysis: agentState.styleAnalysis || null,
        rules: {
          max_duration: agentState.rules.maxDuration,
          color_palette: agentState.rules.colorPalette || null,
          font_size: agentState.rules.fontSize,
          transitions: agentState.rules.transitions.length > 0 ? agentState.rules.transitions : null,
          background: agentState.rules.background || null,
          custom_rules: agentState.rules.customRules || null,
        },
      },
      {
        onStepStart: (data) => agentDispatch({ type: "STEP_START", step: data.step, message: data.message }),
        onPlanReady: (data) => agentDispatch({ type: "PLAN_READY", plan: { title: data.title, summary: data.summary, shots: data.shots as AgentPlan["shots"], totalDuration: data.total_duration, raw: data.raw } }),
        onCodeGenerated: (data) => agentDispatch({ type: "CODE_GENERATED", code: data.code }),
        onValidationResult: (data) => {
          agentDispatch({ type: "STEP_END", passed: data.passed, error: data.syntax_error });
          if (!data.passed) {
            agentDispatch({ type: "STEP_START", step: "correct", message: `修正中...` });
          }
        },
        onRenderResult: (data) => {
          agentDispatch({ type: "STEP_END", passed: data.passed, error: data.error });
          if (data.video_url) {
            agentDispatch({ type: "RENDER_RESULT", passed: true, videoUrl: data.video_url });
          }
        },
        onComplete: (data) => {
          agentDispatch({ type: "COMPLETE", code: data.code, videoUrl: data.video_url, jobId: data.job_id });
          setStatus("动画生成完成。");
        },
        onError: (data) => {
          agentDispatch({ type: "ERROR", message: data.message });
          setStatus(`错误：${data.message}`);
        },
      },
      token
    );

    setBusy(false);
  };

  // Simple mode generate (original)
  const onSimpleGenerate = async () => {
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
              ? { api_key: llmConfig.apiKey, base_url: llmConfig.baseUrl, model: llmConfig.model, api_format: llmConfig.apiFormat }
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

  const onGenerate = mode === "agent" ? onAgentGenerate : mode === "teacher" ? onAgentGenerate : onSimpleGenerate;

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
    agentDispatch({ type: "RESET" });
  };

  const resolvedVision = resolveVisionConfig(llmConfig, visionConfig);
  // Debug: log vision config on render
  if (resolvedVision.apiKey) {
    console.log("resolvedVision:", { model: resolvedVision.model, baseUrl: resolvedVision.baseUrl, apiKey: "***" + resolvedVision.apiKey.slice(-4) });
  } else {
    console.log("resolvedVision: API KEY EMPTY!", { visionConfig, llmConfigBaseUrl: llmConfig.baseUrl });
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header
        health={health}
        onLlmConfigChange={setLlmConfig}
        onVisionChange={setVisionConfig}
        mode={mode}
        onModeChange={setMode}
      />

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
                {mode === "teacher" ? (
                  <TeacherModePanel
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    agentState={agentState}
                    llmConfig={llmConfig}
                    visionConfig={resolvedVision}
                    onAnalyze={onTeacherAnalyze}
                    onSolve={onTeacherSolve}
                    onRefine={onTeacherRefine}
                    onRender={onRender}
                    busy={busy}
                    hasJob={!!jobId}
                  />
                ) : mode === "agent" ? (
                  <AgentPanel
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    agentState={agentState}
                    llmConfig={llmConfig}
                    visionConfig={resolvedVision}
                    onGenerate={onGenerate}
                    onRender={onRender}
                    busy={busy}
                    hasJob={!!jobId}
                  />
                ) : (
                  <PromptPanel
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    onGenerate={onGenerate}
                    onRender={onRender}
                    busy={busy}
                    hasCode={!!code}
                  />
                )}
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
