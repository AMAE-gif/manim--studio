import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AnimationRules } from "@/lib/agent-store";

interface RulesConfigProps {
  rules: AnimationRules;
  onChange: (rules: Partial<AnimationRules>) => void;
  disabled?: boolean;
}

const TRANSITION_OPTIONS = [
  "FadeIn", "FadeOut", "Transform", "ReplacementTransform",
  "Create", "Write", "GrowFromCenter", "SpinInFromGrowing",
  "SlideIn", "MoveTo", "ScaleInPlace",
];

export function RulesConfig({ rules, onChange, disabled }: RulesConfigProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-md">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        disabled={disabled}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        动画规范
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border pt-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">最大时长（秒）</label>
              <Input
                type="number"
                min={1}
                max={60}
                value={rules.maxDuration ?? ""}
                onChange={(e) => onChange({ maxDuration: e.target.value ? Number(e.target.value) : null })}
                placeholder="15"
                className="h-7 text-xs"
                disabled={disabled}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">字体大小</label>
              <Input
                type="number"
                min={12}
                max={120}
                value={rules.fontSize ?? ""}
                onChange={(e) => onChange({ fontSize: e.target.value ? Number(e.target.value) : null })}
                placeholder="36"
                className="h-7 text-xs"
                disabled={disabled}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">颜色方案（hex 色值，逗号分隔）</label>
            <Input
              value={rules.colorPalette}
              onChange={(e) => onChange({ colorPalette: e.target.value })}
              placeholder="#3498db, #e74c3c, #2ecc71"
              className="h-7 text-xs"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">背景</label>
            <Input
              value={rules.background}
              onChange={(e) => onChange({ background: e.target.value })}
              placeholder="BLACK, WHITE, #1a1a2e"
              className="h-7 text-xs"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">允许的转场效果</label>
            <div className="flex flex-wrap gap-1">
              {TRANSITION_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    const list = rules.transitions.includes(t)
                      ? rules.transitions.filter((x) => x !== t)
                      : [...rules.transitions, t];
                    onChange({ transitions: list });
                  }}
                  className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
                    rules.transitions.includes(t)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                  }`}
                  disabled={disabled}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">额外规则</label>
            <Textarea
              value={rules.customRules}
              onChange={(e) => onChange({ customRules: e.target.value })}
              placeholder="如：使用深色主题、避免使用 LaTeX..."
              className="h-16 text-xs resize-none"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
