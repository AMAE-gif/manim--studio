import { useState } from "react";
import { Download, Film, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoPreviewProps {
  videoUrl: string | null;
}

export function VideoPreview({ videoUrl }: VideoPreviewProps) {
  const [error, setError] = useState(false);

  if (!videoUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[220px] rounded-[14px] border border-dashed border-white/[0.06] bg-white/[0.015]">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
          <Film className="h-7 w-7 text-white/15" />
        </div>
        <p className="text-[13px] text-white/25 font-medium">渲染完成后视频将在此播放</p>
        <p className="text-[11px] text-white/15 mt-1">支持 MP4 格式</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[220px] rounded-[14px] border border-white/[0.06] bg-white/[0.015]">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="h-7 w-7 text-red-400/60" />
        </div>
        <p className="text-[13px] text-white/40 font-medium mb-3">视频加载失败</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setError(false)}
          className="h-8 px-4 rounded-lg text-[12px] font-medium border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white/80"
        >
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] overflow-hidden border border-white/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2)]">
        <video
          key={videoUrl}
          src={videoUrl}
          controls
          playsInline
          className="w-full max-h-[480px] bg-black"
          onError={() => setError(true)}
        />
      </div>
      <div className="flex justify-end">
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
