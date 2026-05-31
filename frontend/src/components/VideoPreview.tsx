import { useState } from "react";
import { Download, Film, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoPreviewProps {
  videoUrl: string | null;
}

export function VideoPreview({ videoUrl }: VideoPreviewProps) {
  const [error, setError] = useState(false);

  if (!videoUrl) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-[360px] rounded-[16px] border border-white/[0.04] bg-gradient-to-b from-white/[0.02] to-transparent overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/[0.04] rounded-full blur-3xl animate-pulse-glow" />
          <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-purple-500/[0.04] rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
        </div>

        {/* Grid pattern background */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }} />

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center px-6">
          {/* Animated icon */}
          <div className="relative mb-6 animate-float">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center border border-white/[0.06]">
              <Film className="h-10 w-10 text-white/20" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-pulse-glow">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* Text */}
          <h3 className="text-[15px] font-semibold text-white/50 mb-2">动画预览区</h3>
          <p className="text-[13px] text-white/25 text-center max-w-[240px] leading-relaxed">
            描述你的动画创意，AI 将为你生成精美的数学动画
          </p>

          {/* Feature hints */}
          <div className="flex items-center gap-4 mt-6">
            <div className="flex items-center gap-1.5 text-[11px] text-white/15">
              <div className="w-1 h-1 rounded-full bg-blue-400/40" />
              <span>自然语言描述</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/15">
              <div className="w-1 h-1 rounded-full bg-purple-400/40" />
              <span>自动生成代码</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/15">
              <div className="w-1 h-1 rounded-full bg-pink-400/40" />
              <span>即时预览</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] rounded-[16px] border border-white/[0.04] bg-white/[0.01]">
        <div className="w-16 h-16 rounded-2xl bg-red-500/[0.08] flex items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-red-400/50" />
        </div>
        <p className="text-[13px] text-white/40 font-medium mb-3">视频加载失败</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setError(false)}
          className="h-8 px-4 rounded-lg text-[12px] font-medium"
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[16px] overflow-hidden border border-white/[0.06] shadow-[0_4px_16px_rgba(0,0,0,0.3),0_12px_40px_rgba(0,0,0,0.2)]">
        <video
          key={videoUrl}
          src={videoUrl}
          controls
          playsInline
          className="w-full max-h-[480px] bg-black"
          onError={() => setError(true)}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-white/30 font-medium">动画已就绪</span>
        </div>
        <a
          href={videoUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-lg border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 text-[12px] font-medium transition-all duration-200"
        >
          <Download className="h-3.5 w-3.5" />
          下载 MP4
        </a>
      </div>
    </div>
  );
}
