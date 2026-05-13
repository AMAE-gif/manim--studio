import { Loader2 } from "lucide-react";

interface StatusBarProps {
  status: string;
  busy: boolean;
}

export function StatusBar({ status, busy }: StatusBarProps) {
  if (!status && !busy) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-t border-border bg-surface/50">
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />}
      <span className="truncate">{status || "就绪"}</span>
    </div>
  );
}
