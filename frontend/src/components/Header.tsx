import { Clapperboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsDialog } from "./SettingsDialog";
import type { LlmConfig } from "./SettingsDialog";
import type { Health } from "@/lib/types";

interface HeaderProps {
  health: Health | null;
  onLlmConfigChange: (config: LlmConfig) => void;
}

export function Header({ health, onLlmConfigChange }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <Clapperboard className="h-5 w-5 text-accent" />
        <h1 className="text-base font-semibold tracking-tight">Manim Studio</h1>
      </div>
      <div className="flex items-center gap-2">
        {health && (
          <>
            <Badge variant={health.manim_cli ? "default" : "destructive"} className="text-xs">
              Manim
            </Badge>
            <Badge variant={health.supabase_service_configured ? "default" : "secondary"} className="text-xs">
              DB
            </Badge>
          </>
        )}
        <SettingsDialog onConfigChange={onLlmConfigChange} />
      </div>
    </header>
  );
}
