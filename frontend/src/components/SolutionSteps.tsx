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
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5" />
        解题步骤
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.index}
            className="border border-border rounded-md p-2.5 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary text-xs font-bold px-1.5 py-0.5 rounded">
                  {step.index}
                </span>
                <span className="text-xs font-medium">{step.title}</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onModifyStep(step.index - 1)}
                disabled={disabled}
              >
                <Pencil className="h-3 w-3 mr-1" />
                修改
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">{step.description}</p>

            {step.math_expression && (
              <div className="bg-muted rounded px-2 py-1 font-mono text-xs overflow-x-auto">
                {step.math_expression}
              </div>
            )}

            {step.visual_description && (
              <p className="text-xs text-muted-foreground italic">
                {step.visual_description}
              </p>
            )}
          </div>
        ))}
      </div>

      {summary && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">
          {summary}
        </p>
      )}
    </div>
  );
}
