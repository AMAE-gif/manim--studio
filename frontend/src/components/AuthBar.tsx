import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LogOut, Mail } from "lucide-react";
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
  const [sending, setSending] = useState(false);

  const supabaseReady = Boolean(supabase);

  const sendMagicLink = async () => {
    if (!supabase) {
      onStatusChange("未配置 Supabase。");
      return;
    }
    const em = email.trim();
    if (!em) {
      onStatusChange("请输入邮箱。");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: em,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      onStatusChange(`发送失败：${error.message}`);
      return;
    }
    onStatusChange("已发送魔法链接，请到邮箱点击完成登录。");
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    onStatusChange("已退出登录。");
  };

  if (!supabaseReady) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        未配置 Supabase，可本地使用
      </div>
    );
  }

  if (session?.user?.email) {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-t border-border">
        <span className="text-xs text-muted-foreground truncate flex-1 mr-2">
          {session.user.email}
        </span>
        <Button variant="ghost" size="sm" onClick={signOut} disabled={busy}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="p-3 border-t border-border space-y-2">
      <Input
        type="email"
        placeholder="邮箱登录"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy || sending}
        className="h-8 text-xs"
        onKeyDown={(e) => e.key === "Enter" && sendMagicLink()}
      />
      <Button
        variant="default"
        size="sm"
        className="w-full h-8 text-xs"
        disabled={busy || sending}
        onClick={sendMagicLink}
      >
        <Mail className="h-3.5 w-3.5 mr-1.5" />
        发送登录链接
      </Button>
    </div>
  );
}
