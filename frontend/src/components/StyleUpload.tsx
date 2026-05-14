import { useCallback, useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StyleUploadProps {
  onAnalysis: (text: string) => void;
  visionConfig: { apiKey: string; baseUrl: string; model: string };
  disabled?: boolean;
}

export function StyleUpload({ onAnalysis, visionConfig, disabled }: StyleUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const analyze = async () => {
    if (!file || !visionConfig.apiKey) return;
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("vision_llm", JSON.stringify({
        api_key: visionConfig.apiKey,
        base_url: visionConfig.baseUrl || undefined,
        model: visionConfig.model || "gpt-4o",
      }));

      const res = await fetch("/api/analyze-style", { method: "POST", body: formData });
      const data = await res.json();
      if (data.style_analysis) {
        onAnalysis(data.style_analysis);
      }
    } catch {
      // ignore
    } finally {
      setAnalyzing(false);
    }
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (preview) {
    return (
      <div className="space-y-2">
        <div className="relative inline-block">
          <img src={preview} alt="风格参考" className="h-20 rounded-md border border-border" />
          <button
            onClick={clear}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={disabled || analyzing || !visionConfig.apiKey}
          onClick={analyze}
        >
          {analyzing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          {analyzing ? "分析中..." : "分析风格"}
        </Button>
        {!visionConfig.apiKey && (
          <p className="text-xs text-muted-foreground">请先在设置中配置视觉模型 API Key</p>
        )}
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="flex items-center gap-2 p-2 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
    >
      <Upload className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">拖拽或点击上传风格参考图</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
