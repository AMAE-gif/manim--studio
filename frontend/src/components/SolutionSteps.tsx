import { Lightbulb, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SolutionStep } from "@/lib/agent-store";

interface SolutionStepsProps {
  steps: SolutionStep[];
  summary: string;
  onModifyStep: (stepIndex: number) => void;
  disabled?: boolean;
}

export function SolutionSteps({ steps, summary, onModifyStep, disabled }: SolutionStepsProps) {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <span className="text-[13px] font-medium text-white/60">解题步骤</span>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <div
            key={step.index}
            className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 space-y-2.5 hover:bg-white/[0.05] transition-all duration-200"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 text-[12px] font-bold flex items-center justify-center">
                  {step.index}
                </span>
                <span className="text-[13px] font-semibold text-white/80">{step.title}</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onModifyStep(step.index - 1)}
                disabled={disabled}
                className="text-white/30 hover:text-white/60"
              >
                <Pencil className="h-3 w-3 mr-1" />
                修改
              </Button>
            </div>

            <p className="text-[13px] text-white/50 leading-relaxed pl-[34px]">{step.description}</p>

            {step.math_expression && (
              <div className="ml-[34px] bg-white/[0.04] rounded-lg px-3 py-2 font-mono text-[12px] text-blue-300/80 overflow-x-auto border border-white/[0.04]">
                {step.math_expression}
              </div>
            )}

            {step.visual_description && (
              <p className="ml-[34px] text-[12px] text-white/30 italic leading-relaxed">
                {step.visual_description}
              </p>
            )}
          </div>
        ))}
      </div>

      {summary && (
        <div className="border-t border-white/[0.06] pt-3">
          <p className="text-[12px] text-white/30 leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}
