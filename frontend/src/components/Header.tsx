import { Clapperboard, Bot, Wand2, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsDialog } from "./SettingsDialog";
import type { LlmConfig, VisionConfig } from "./SettingsDialog";
import type { Health } from "@/lib/types";

interface HeaderProps {
  health: Health | null;
  onLlmConfigChange: (config: LlmConfig) => void;
  onVisionChange: (config: VisionConfig) => void;
  mode: "simple" | "agent" | "teacher";
  onModeChange: (v: "simple" | "agent" | "teacher") => void;
}

export function Header({ health, onLlmConfigChange, onVisionChange, mode, onModeChange }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <Clapperboard className="h-5 w-5 text-accent" />
        <h1 className="text-base font-semibold tracking-tight">Manim Studio</h1>
      </div>
      <div className="flex items-center gap-2">
        {/* Mode toggle */}
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            onClick={() => onModeChange("simple")}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
              mode === "simple"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            title="简单模式：直接生成代码"
          >
            <Wand2 className="h-3.5 w-3.5" />
            简单
          </button>
          <button
            onClick={() => onModeChange("agent")}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors border-l border-border ${
              mode === "agent"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            title="Agent 模式：自动规划/生成/验证/渲染"
          >
            <Bot className="h-3.5 w-3.5" />
            Agent
          </button>
          <button
            onClick={() => onModeChange("teacher")}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors border-l border-border ${
              mode === "teacher"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            title="教师模式：上传题目 → AI解题 → 数形结合动画"
          >
            <GraduationCap className="h-3.5 w-3.5" />
            教师
          </button>
        </div>

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
