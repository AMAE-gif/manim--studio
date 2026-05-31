import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut, UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

interface AuthBarProps {
  session: Session | null;
  busy: boolean;
  onStatusChange: (status: string) => void;
}

export function AuthBar({ session, busy, onStatusChange }: AuthBarProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);

  const supabaseReady = Boolean(supabase);

  const handleSubmit = async () => {
    if (!supabase) {
      onStatusChange("未配置 Supabase。");
      return;
    }
    const em = email.trim();
    if (!em) {
      onStatusChange("请输入邮箱。");
      return;
    }
    if (password.length < 6) {
      onStatusChange("密码至少 6 位。");
      return;
    }
    setLoading(true);
    let result;
    if (mode === "register") {
      result = await supabase.auth.signUp({ email: em, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email: em, password });
    }
    setLoading(false);
    if (result.error) {
      onStatusChange(`失败：${result.error.message}`);
      return;
    }
    if (mode === "register") {
      onStatusChange("注册成功，请查收确认邮件（或直接登录）。");
    } else {
      onStatusChange("登录成功。");
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    onStatusChange("已退出登录。");
  };

  if (!supabaseReady) {
    return (
      <div className="px-4 py-3 text-[11px] text-white/25 border-t border-border">
        未配置 Supabase，可本地使用
      </div>
    );
  }

  if (session?.user?.email) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-white font-semibold">
              {session.user.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-[12px] text-white/50 truncate font-medium">
            {session.user.email}
          </span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={signOut} disabled={busy} className="text-white/30 hover:text-white/60">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-border space-y-2.5">
      <Input
        type="email"
        placeholder="邮箱"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy || loading}
        className="h-9 text-[12px]"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <Input
        type="password"
        placeholder="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy || loading}
        className="h-9 text-[12px]"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <Button
        variant="default"
        size="sm"
        className="w-full h-9 text-[12px] rounded-[10px]"
        disabled={busy || loading}
        onClick={handleSubmit}
      >
        {mode === "login" ? (
          <><LogIn className="h-3.5 w-3.5 mr-1.5" />登录</>
        ) : (
          <><UserPlus className="h-3.5 w-3.5 mr-1.5" />注册</>
        )}
      </Button>
      <button
        className="w-full text-[11px] text-white/25 hover:text-white/50 transition-colors font-medium"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        disabled={loading}
      >
        {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
      </button>
    </div>
  );
}
