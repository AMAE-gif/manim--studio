import { useState } from "react";
import { Wrench, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LlmConfig } from "./SettingsDialog";

interface CodeFixPanelProps {
  code: string;
  llmConfig: LlmConfig;
  onCodeFixed: (fixedCode: string) => void;
  disabled: boolean;
}

export function CodeFixPanel({ code, llmConfig, onCodeFixed, disabled }: CodeFixPanelProps) {
  const [issue, setIssue] = useState("");
  const [fixing, setFixing] = useState(false);
  const [fixStatus, setFixStatus] = useState<"idle" | "success" | "error">("idle");
  const [fixMessage, setFixMessage] = useState("");

  const handleFix = async () => {
    if (!issue.trim() || !code) return;
    setFixing(true);
    setFixStatus("idle");
    setFixMessage("");

    try {
      const r = await fetch("/api/fix-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          issue: issue.trim(),
          llm: llmConfig.apiKey
            ? { api_key: llmConfig.apiKey, base_url: llmConfig.baseUrl, model: llmConfig.model, api_format: llmConfig.apiFormat }
            : null,
        }),
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setFixStatus("error");
        setFixMessage(typeof data.detail === "string" ? data.detail : "修复请求失败");
        return;
      }

      // Parse SSE stream
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fixedCode: string | null = null;
      let errorMsg: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "complete") {
                fixedCode = data.code;
              } else if (currentEvent === "error") {
                errorMsg = data.message;
              }
            } catch { /* skip */ }
          }
        }
      }

      if (errorMsg) {
        setFixStatus("error");
        setFixMessage(errorMsg);
      } else if (fixedCode) {
        onCodeFixed(fixedCode);
        setFixStatus("success");
        setFixMessage("代码已修复，请检查后重新渲染。");
        setIssue("");
      } else {
        setFixStatus("error");
        setFixMessage("未返回修复结果。");
      }
    } catch (e) {
      setFixStatus("error");
      setFixMessage(`网络错误: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center">
          <Wrench className="h-3.5 w-3.5 text-orange-400" />
        </div>
        <span className="text-[13px] font-medium text-white/60">代码修复</span>
      </div>

      <Textarea
        value={issue}
        onChange={(e) => setIssue(e.target.value)}
        placeholder="描述动画问题，如：&#10;• 第二步文字和公式重叠了&#10;• 总结部分没有出场动画&#10;• 坐标轴标签被遮挡"
        className="min-h-[80px] resize-none text-[13px] leading-relaxed"
        disabled={disabled || fixing}
      />

      <Button
        onClick={handleFix}
        disabled={disabled || fixing || !issue.trim() || !llmConfig.apiKey}
        variant="outline"
        className="w-full h-9 text-[13px]"
      >
        {fixing ? (
          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
        ) : (
          <Wrench className="h-3.5 w-3.5 mr-2" />
        )}
        {fixing ? "修复中..." : "修复代码"}
      </Button>

      {fixStatus !== "idle" && (
        <div className={`flex items-start gap-2 text-[12px] rounded-lg px-3 py-2 ${
          fixStatus === "success"
            ? "text-green-400/80 bg-green-500/10"
            : "text-red-400/80 bg-red-500/10"
        }`}>
          {fixStatus === "success" ? (
            <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          )}
          <span>{fixMessage}</span>
        </div>
      )}
    </div>
  );
}
