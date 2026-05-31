import { Loader2, Sparkles, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface PromptPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onRender: () => void;
  busy: boolean;
  hasCode: boolean;
}

export function PromptPanel({
  prompt,
  onPromptChange,
  onGenerate,
  onRender,
  busy,
  hasCode,
}: PromptPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <label className="text-[13px] font-medium text-white/60">自然语言描述</label>
        </div>
        <span className="text-[11px] text-white/25 font-medium tabular-nums">{prompt.length}/4000</span>
      </div>

      {/* Textarea */}
      <Textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="例如：画一个圆变成正方形，颜色从蓝变红"
        disabled={busy}
        className="flex-1 resize-none min-h-[120px] text-[13px] leading-relaxed rounded-[12px] border-white/[0.06] bg-white/[0.02] placeholder:text-white/20 focus:border-white/[0.12] focus:bg-white/[0.03] transition-all duration-200"
      />

      {/* Actions */}
      <div className="flex gap-2.5 mt-4">
        <Button
          onClick={onGenerate}
          disabled={busy || !prompt.trim()}
          className="flex-1 h-10 rounded-[10px] bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium text-[13px] shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-200 border-0"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          生成代码
        </Button>
        <Button
          variant="secondary"
          onClick={onRender}
          disabled={busy || !hasCode}
          className="flex-1 h-10 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white font-medium text-[13px] border border-white/[0.06] transition-all duration-200"
        >
          <Play className="h-4 w-4 mr-1.5" />
          渲染预览
        </Button>
      </div>
    </div>
  );
}
