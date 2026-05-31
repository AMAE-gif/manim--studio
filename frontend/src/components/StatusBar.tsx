import { Loader2 } from "lucide-react";

interface StatusBarProps {
  status: string;
  busy: boolean;
}

export function StatusBar({ status, busy }: StatusBarProps) {
  if (!status && !busy) return null;

  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 text-[12px] text-white/35 border-t border-border bg-surface/60">
      {busy && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400/60" />
          <div className="w-px h-3 bg-white/[0.06]" />
        </div>
      )}
      <span className="truncate font-medium">{status || "就绪"}</span>
    </div>
  );
}
