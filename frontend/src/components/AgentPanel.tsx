import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StyleUpload } from "./StyleUpload";
import { StylePreview } from "./StylePreview";
import { RulesConfig } from "./RulesConfig";
import { AgentProgress } from "./AgentProgress";
import type { AgentState } from "@/lib/agent-store";
import type { LlmConfig } from "./SettingsDialog";

interface AgentPanelProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  agentState: AgentState;
  llmConfig: LlmConfig;
  visionConfig: { apiKey: string; baseUrl: string; model: string };
  onGenerate: () => void;
  onRender: () => void;
  busy: boolean;
  hasJob: boolean;
}

export function AgentPanel({
  prompt,
  onPromptChange,
  agentState,
  llmConfig,
  visionConfig,
  onGenerate,
  onRender,
  busy,
  hasJob,
}: AgentPanelProps) {
  const isRunning = agentState.status !== "idle" && agentState.status !== "complete" && agentState.status !== "error";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <label className="text-[13px] font-medium text-white/60">动画描述</label>
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="描述你想要的动画效果..."
        className="h-32 resize-none text-[13px] leading-relaxed"
        disabled={busy}
      />

      <StyleUpload
        onAnalysis={(text) => agentState && window.dispatchEvent(new CustomEvent("agent:set-style", { detail: text }))}
        visionConfig={visionConfig}
        disabled={busy}
      />

      <StylePreview
        value={agentState.styleAnalysis}
        onChange={(text) => window.dispatchEvent(new CustomEvent("agent:set-style", { detail: text }))}
      />

      <RulesConfig
        rules={agentState.rules}
        onChange={(r) => window.dispatchEvent(new CustomEvent("agent:set-rules", { detail: r }))}
        disabled={busy}
      />

      <div className="flex gap-2.5">
        <Button
          onClick={onGenerate}
          disabled={busy || !prompt.trim() || !llmConfig.apiKey}
          className="flex-1 h-10 rounded-[10px] bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium text-[13px] shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-200 border-0"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {isRunning ? "生成中..." : "生成动画"}
        </Button>
        <Button
          onClick={onRender}
          disabled={busy || !hasJob}
          variant="outline"
          className="h-10 px-5 rounded-[10px]"
        >
          渲染预览
        </Button>
      </div>

      {!llmConfig.apiKey && (
        <p className="text-[11px] text-white/25 text-center font-medium">请先在设置中配置 LLM API Key</p>
      )}

      <AgentProgress
        status={agentState.status}
        steps={agentState.steps}
        plan={agentState.plan}
        error={agentState.error}
      />
    </div>
  );
}
