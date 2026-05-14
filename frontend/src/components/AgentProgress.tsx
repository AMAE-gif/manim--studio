import { CheckCircle, Circle, AlertCircle, Loader2 } from "lucide-react";
import type { AgentStep, AgentStatus } from "@/lib/agent-store";

interface AgentProgressProps {
  status: AgentStatus;
  steps: AgentStep[];
  error: string | null;
}

const STEP_LABELS: Record<string, string> = {
  plan: "分析规划",
  generate: "生成代码",
  validate: "语法验证",
  render_test: "渲染测试",
  correct: "自动修正",
};

export function AgentProgress({ status, steps, error }: AgentProgressProps) {
  if (status === "idle" && steps.length === 0) return null;

  return (
    <div className="space-y-1">
      {steps.map((s, i) => {
        const done = s.endedAt !== undefined;
        const running = !done && i === steps.length - 1 && status !== "complete" && status !== "error";

        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            {done ? (
              s.passed === false ? (
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
              )
            ) : running ? (
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-muted-foreground">{STEP_LABELS[s.step] || s.step}:</span>
            <span className="truncate">{s.message}</span>
            {done && s.endedAt && s.startedAt && (
              <span className="text-muted-foreground ml-auto shrink-0">
                {((s.endedAt - s.startedAt) / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        );
      })}
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive mt-1">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}
    </div>
  );
}
