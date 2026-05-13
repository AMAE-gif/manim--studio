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
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-muted-foreground">自然语言描述</label>
        <span className="text-xs text-muted-foreground">{prompt.length}/4000</span>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="例如：画一个圆变成正方形，颜色从蓝变红"
        disabled={busy}
        className="flex-1 resize-none min-h-[120px] text-sm"
      />
      <div className="flex gap-2 mt-3">
        <Button
          onClick={onGenerate}
          disabled={busy || !prompt.trim()}
          className="flex-1"
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
          className="flex-1"
        >
          <Play className="h-4 w-4 mr-1.5" />
          渲染预览
        </Button>
      </div>
    </div>
  );
}
