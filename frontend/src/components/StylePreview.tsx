import { Textarea } from "@/components/ui/textarea";

interface StylePreviewProps {
  value: string;
  onChange: (value: string) => void;
}

export function StylePreview({ value, onChange }: StylePreviewProps) {
  if (!value) return null;

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">风格分析结果（可编辑）</label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-24 text-xs resize-none"
        placeholder="风格分析结果将显示在这里..."
      />
    </div>
  );
}
