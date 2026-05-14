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
      <div className="space-y-2.5 animate-scale-in">
        <div className="relative inline-block">
          <img
            src={preview}
            alt="风格参考"
            className="h-20 rounded-xl border border-white/10 shadow-apple object-cover"
          />
          <button
            onClick={clear}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/60 hover:bg-red-500/80 hover:text-white flex items-center justify-center transition-all duration-200"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3"
          disabled={disabled || analyzing || !visionConfig.apiKey}
          onClick={analyze}
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
          {analyzing ? "分析中..." : "分析风格"}
        </Button>
        {!visionConfig.apiKey && (
          <p className="text-[11px] text-white/25">请先在设置中配置视觉模型 API Key</p>
        )}
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="flex items-center gap-2.5 p-3 border border-dashed border-white/[0.08] rounded-xl cursor-pointer hover:border-white/[0.15] hover:bg-white/[0.02] transition-all duration-300 group"
    >
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center group-hover:bg-white/[0.08] transition-all duration-300">
        <Upload className="h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
      </div>
      <span className="text-[12px] text-white/30 group-hover:text-white/50 transition-colors">拖拽或点击上传风格参考图</span>
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
