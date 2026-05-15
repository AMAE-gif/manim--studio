import { CheckCircle, Circle, AlertCircle, Loader2, Film } from "lucide-react";
import type { AgentStep, AgentStatus, AgentPlan } from "@/lib/agent-store";

interface AgentProgressProps {
  status: AgentStatus;
  steps: AgentStep[];
  plan: AgentPlan | null;
  error: string | null;
}

const STEP_LABELS: Record<string, string> = {
  plan: "分析规划",
  generate: "生成代码",
  validate: "语法验证",
  render_test: "渲染测试",
  render_progress: "渲染中",
  correct: "自动修正",
  fix: "LLM 修复",
  extract: "识别题目",
  solve: "分析解题",
  refine: "修正解法",
};

export function AgentProgress({ status, steps, plan, error }: AgentProgressProps) {
  if (status === "idle" && steps.length === 0) return null;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Plan display */}
      {plan && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Film className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <span className="text-[13px] font-medium text-white/70">{plan.title}</span>
            <span className="text-[11px] text-white/30 ml-auto">{plan.totalDuration}s</span>
          </div>
          <p className="text-[12px] text-white/40 leading-relaxed">{plan.summary}</p>
          {plan.shots.length > 0 && (
            <div className="space-y-1.5">
              {plan.shots.map((shot) => (
                <div key={shot.id} className="flex items-start gap-2.5 text-[12px]">
                  <span className="text-blue-400/60 font-mono shrink-0 mt-0.5">{shot.id}.</span>
                  <div className="min-w-0">
                    <span className="font-medium text-white/60">{shot.name}</span>
                    <span className="text-white/25 ml-1.5">({shot.duration}s)</span>
                    <p className="text-white/30 truncate mt-0.5">{shot.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step progress */}
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const done = s.endedAt !== undefined;
          const running = !done && i === steps.length - 1 && status !== "complete" && status !== "error";

          return (
            <div
              key={i}
              className="flex items-center gap-2.5 text-[12px] py-1"
            >
              {done ? (
                s.passed === false ? (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
                )
              ) : running ? (
                <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-white/15 shrink-0" />
              )}
              <span className="text-white/30">{STEP_LABELS[s.step] || s.step}</span>
              <span className="text-white/50 truncate flex-1">{s.message}</span>
              {done && s.endedAt && s.startedAt && (
                <span className="text-white/20 shrink-0 tabular-nums">
                  {((s.endedAt - s.startedAt) / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2.5 text-[12px] text-red-400/80 bg-red-500/[0.08] rounded-xl px-3.5 py-2.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}
    </div>
  );
}
