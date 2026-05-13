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
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground border border-dashed border-border rounded-lg">
        <Film className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">渲染完成后视频将在此播放</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground border border-border rounded-lg">
        <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
        <p className="text-sm mb-2">视频加载失败</p>
        <Button variant="outline" size="sm" onClick={() => setError(false)}>
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video
        key={videoUrl}
        src={videoUrl}
        controls
        playsInline
        className="w-full max-h-[480px] rounded-lg bg-black"
        onError={() => setError(true)}
      />
      <div className="flex justify-end">
        <a
          href={videoUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-background text-sm hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          下载 MP4
        </a>
      </div>
    </div>
  );
}
