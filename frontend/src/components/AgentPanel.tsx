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
      <Textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="描述你想要的动画效果..."
        className="h-32 resize-none text-[14px] leading-relaxed"
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
          className="flex-1 h-10 text-[14px] font-semibold"
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
          className="h-10 px-5"
        >
          渲染预览
        </Button>
      </div>

      {!llmConfig.apiKey && (
        <p className="text-[12px] text-white/30 text-center">请先在设置中配置 LLM API Key</p>
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
