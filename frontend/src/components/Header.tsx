import { Clapperboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Health } from "@/lib/types";

interface HeaderProps {
  health: Health | null;
}

export function Header({ health }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <Clapperboard className="h-5 w-5 text-accent" />
        <h1 className="text-base font-semibold tracking-tight">Manim Studio</h1>
      </div>
      {health && (
        <div className="flex items-center gap-2">
          <Badge variant={health.llm_configured ? "default" : "destructive"} className="text-xs">
            LLM
          </Badge>
          <Badge variant={health.manim_cli ? "default" : "destructive"} className="text-xs">
            Manim
          </Badge>
          <Badge variant={health.supabase_service_configured ? "default" : "secondary"} className="text-xs">
            DB
          </Badge>
        </div>
      )}
    </header>
  );
}
