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
  accessToken?: string | null;
}

const modes = [
  { key: "simple" as const, label: "简单", icon: Wand2 },
  { key: "agent" as const, label: "Agent", icon: Bot },
  { key: "teacher" as const, label: "教师", icon: GraduationCap },
];

export function Header({ health, onLlmConfigChange, onVisionChange, mode, onModeChange, accessToken }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-3 glass relative z-50">
      {/* Bottom gradient accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px gradient-line" />

      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-[11px] bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 shadow-lg shadow-blue-500/25 press-effect">
          <Clapperboard className="h-[18px] w-[18px] text-white" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-[15px] font-semibold tracking-tight text-white/95 leading-tight">Manim Studio</h1>
          <span className="text-[10px] text-white/30 font-medium tracking-wide uppercase">AI 动画生成</span>
        </div>
      </div>

      {/* Center: Mode Segmented Control */}
      <div className="flex items-center bg-white/[0.04] rounded-[11px] p-[3px] border border-white/[0.06]">
        {modes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onModeChange(key)}
            className={`relative flex items-center gap-1.5 px-4 py-[7px] rounded-[9px] text-[13px] font-medium transition-all duration-200 ease-out ${
              mode === key
                ? "bg-white/[0.12] text-white shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "text-white/35 hover:text-white/55 hover:bg-white/[0.03]"
            }`}
            title={`${label}模式`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Right: Health + Settings */}
      <div className="flex items-center gap-4">
        {health && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.04]">
              <div className={`w-[6px] h-[6px] rounded-full ${health.manim_cli ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]"}`} />
              <span className="text-[11px] text-white/40 font-medium">Manim</span>
            </div>
            {health.supabase_service_configured !== undefined && (
              <div
                className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.04]"
                title={health.supabase_jwt_configured === false ? "JWT 未配置，登录功能不可用" : "Supabase 已配置"}
              >
                <div className={`w-[6px] h-[6px] rounded-full ${health.supabase_jwt_configured ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]"}`} />
                <span className="text-[11px] text-white/40 font-medium">Auth</span>
              </div>
            )}
          </div>
        )}
        <SettingsDialog onConfigChange={onLlmConfigChange} onVisionChange={onVisionChange} accessToken={accessToken} />
      </div>
    </header>
  );
}
