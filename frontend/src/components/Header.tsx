import { Clapperboard, Bot, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsDialog } from "./SettingsDialog";
import type { LlmConfig, VisionConfig } from "./SettingsDialog";
import type { Health } from "@/lib/types";

interface HeaderProps {
  health: Health | null;
  onLlmConfigChange: (config: LlmConfig) => void;
  onVisionChange: (config: VisionConfig) => void;
  agentMode: boolean;
  onAgentModeChange: (v: boolean) => void;
}

export function Header({ health, onLlmConfigChange, onVisionChange, agentMode, onAgentModeChange }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <Clapperboard className="h-5 w-5 text-accent" />
        <h1 className="text-base font-semibold tracking-tight">Manim Studio</h1>
      </div>
      <div className="flex items-center gap-2">
        {/* Agent mode toggle */}
        <button
          onClick={() => onAgentModeChange(!agentMode)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            agentMode
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
          title={agentMode ? "Agent 模式：自动规划/生成/验证/渲染" : "简单模式：直接生成代码"}
        >
          {agentMode ? <Bot className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
          {agentMode ? "Agent" : "简单"}
        </button>

        {health && (
          <>
            <Badge variant={health.manim_cli ? "default" : "destructive"} className="text-xs">
              Manim
            </Badge>
            <Badge variant={health.supabase_service_configured ? "default" : "secondary"} className="text-xs">
              DB
            </Badge>
          </>
        )}
        <SettingsDialog onConfigChange={onLlmConfigChange} onVisionChange={onVisionChange} />
      </div>
    </header>
  );
}
