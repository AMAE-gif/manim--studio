import { Clapperboard, Bot, Wand2, GraduationCap } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import type { LlmConfig, VisionConfig } from "./SettingsDialog";
import type { Health } from "@/lib/types";

interface HeaderProps {
  health: Health | null;
  onLlmConfigChange: (config: LlmConfig) => void;
  onVisionChange: (config: VisionConfig) => void;
  mode: "simple" | "agent" | "teacher";
  onModeChange: (v: "simple" | "agent" | "teacher") => void;
}

const modes = [
  { key: "simple" as const, label: "简单", icon: Wand2 },
  { key: "agent" as const, label: "Agent", icon: Bot },
  { key: "teacher" as const, label: "教师", icon: GraduationCap },
];

export function Header({ health, onLlmConfigChange, onVisionChange, mode, onModeChange }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] glass">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20">
          <Clapperboard className="h-4 w-4 text-white" />
        </div>
        <h1 className="text-[15px] font-semibold tracking-tight text-white/90">Manim Studio</h1>
      </div>
      <div className="flex items-center gap-3">
        {/* Apple-style segmented control */}
        <div className="flex items-center bg-white/[0.06] rounded-xl p-0.5 border border-white/[0.06]">
          {modes.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onModeChange(key)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ease-out ${
                mode === key
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-white/40 hover:text-white/60"
              }`}
              title={`${label}模式`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {health && (
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${health.manim_cli ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-[11px] text-white/40">Manim</span>
          </div>
        )}
        <SettingsDialog onConfigChange={onLlmConfigChange} onVisionChange={onVisionChange} />
      </div>
    </header>
  );
}
