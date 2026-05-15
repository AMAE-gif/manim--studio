import { useCallback, useRef, useState } from "react";
import { GraduationCap, Upload, X, Loader2, Sparkles, Film, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SolutionSteps } from "./SolutionSteps";
import { AgentProgress } from "./AgentProgress";
import type { AgentState } from "@/lib/agent-store";
import type { LlmConfig } from "./SettingsDialog";

interface TeacherModePanelProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  agentState: AgentState;
  llmConfig: LlmConfig;
  visionConfig: { apiKey: string; baseUrl: string; model: string };
  onAnalyze: (file: File) => void;
  onSolve: () => void;
  onRefine: (instruction: string, stepIndex: number | null) => void;
  onRender: () => void;
  busy: boolean;
}

export function TeacherModePanel({
  prompt,
  onPromptChange,
  agentState,
  llmConfig,
  visionConfig,
  onAnalyze,
  onSolve,
  onRefine,
  onRender,
  busy,
}: TeacherModePanelProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [refinement, setRefinement] = useState("");
  const [modifyStepIndex, setModifyStepIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRunning = agentState.status !== "idle" && agentState.status !== "complete" && agentState.status !== "error";

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleAnalyze = () => {
    if (!file) return;
    onAnalyze(file);
  };

  const handleModifyStep = (stepIndex: number) => {
    setModifyStepIndex(stepIndex);
    setRefinement(`修改第 ${stepIndex + 1} 步：`);
  };

  const handleRefine = () => {
    if (!refinement.trim()) return;
    onRefine(refinement, modifyStepIndex);
    setRefinement("");
    setModifyStepIndex(null);
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const hasProblem = !!agentState.problemText;
  const hasSolution = agentState.solutionSteps.length > 0;
  const hasCode = !!agentState.code;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Image Upload */}
      {!hasProblem && (
        <>
          {preview ? (
            <div className="space-y-3 animate-scale-in">
              <div className="relative inline-block">
                <img
                  src={preview}
                  alt="题目图片"
                  className="h-24 rounded-2xl border border-white/10 shadow-apple object-cover"
                />
                <button
                  onClick={clear}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/60 hover:bg-red-500/80 hover:text-white flex items-center justify-center transition-all duration-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-4"
                disabled={busy || !visionConfig.apiKey}
                onClick={handleAnalyze}
              >
                <GraduationCap className="h-4 w-4 mr-2" />
                提取题目
              </Button>
              {!visionConfig.apiKey && (
                <p className="text-[12px] text-white/30">请先在设置中配置视觉模型 API Key</p>
              )}
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-white/20 hover:bg-white/[0.02] transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] flex items-center justify-center group-hover:bg-white/[0.1] transition-all duration-300">
                <Upload className="h-5 w-5 text-white/40 group-hover:text-white/60 transition-colors" />
              </div>
              <div className="text-center">
                <p className="text-[13px] text-white/50 font-medium">上传题目图片</p>
                <p className="text-[11px] text-white/25 mt-1">拍照、截图或拖拽文件</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Extracted Problem Text */}
      {hasProblem && (
        <div className="space-y-2.5 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <GraduationCap className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <span className="text-[13px] font-medium text-white/60">题目识别结果</span>
          </div>
          <Textarea
            value={agentState.problemText}
            onChange={(e) => {
              window.dispatchEvent(new CustomEvent("teacher:set-problem-text", { detail: e.target.value }));
            }}
            className="min-h-[80px] resize-none text-[14px] leading-relaxed"
            disabled={busy}
          />
          {agentState.problemType && (
            <span className="inline-block bg-white/[0.06] text-[12px] text-white/50 px-2.5 py-1 rounded-lg">
              {agentState.problemType}
            </span>
          )}
        </div>
      )}

      {/* Text prompt (optional supplement) */}
      {hasProblem && !hasSolution && (
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="可选：补充描述你的解题思路或特殊要求..."
          className="min-h-[60px] resize-none text-[14px]"
          disabled={busy}
        />
      )}

      {/* Solution Steps */}
      {hasSolution && (
        <SolutionSteps
          steps={agentState.solutionSteps}
          summary={agentState.solutionSummary}
          onModifyStep={handleModifyStep}
          disabled={busy}
        />
      )}

      {/* Code status */}
      {hasCode && !hasSolution && (
        <div className={`text-[12px] rounded-lg px-3 py-2 ${agentState.validationPassed ? "text-green-400/70 bg-green-500/10" : agentState.validationError ? "text-red-400/70 bg-red-500/10" : "text-yellow-400/70 bg-yellow-500/10"}`}>
          {agentState.validationPassed
            ? "代码已生成，语法验证通过。请审查后点击「生成动画」。"
            : agentState.validationError
              ? `代码语法错误：${agentState.validationError}`
              : "代码已生成，正在验证..."}
        </div>
      )}

      {/* Refinement Input */}
      {(hasSolution || hasCode) && !isRunning && (
        <div className="space-y-2.5 animate-fade-in">
          <Textarea
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            placeholder="用自然语言描述你想要的修改，如加一个坐标系、改用面积法..."
            className="min-h-[72px] resize-none text-[14px]"
            disabled={busy}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2.5">
        {!hasCode ? (
          <Button
            onClick={onSolve}
            disabled={busy || (!hasProblem && !prompt.trim()) || !llmConfig.apiKey}
            className="flex-1 h-10 text-[14px] font-semibold"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {isRunning ? "生成中..." : "生成解题动画"}
          </Button>
        ) : (
          <>
            <Button
              onClick={handleRefine}
              disabled={busy || !refinement.trim() || !agentState.sessionId}
              variant="outline"
              className="h-10 px-5"
            >
              <Pencil className="h-4 w-4 mr-2" />
              应用修改
            </Button>
            <Button
              onClick={onRender}
              disabled={busy || !agentState.validationPassed}
              className="flex-1 h-10 text-[14px] font-semibold"
            >
              <Film className="h-4 w-4 mr-2" />
              生成动画
            </Button>
          </>
        )}
      </div>

      {/* Refinement History */}
      {agentState.refinementHistory.length > 0 && (
        <div className="space-y-2 animate-fade-in">
          <div className="text-[12px] text-white/30 font-medium">修改记录</div>
          <div className="space-y-1.5">
            {agentState.refinementHistory.map((r, i) => (
              <div
                key={i}
                className="text-[12px] text-white/40 border-l-2 border-white/10 pl-3 py-0.5"
              >
                {r.stepIndex !== null && <span className="text-white/50">第{r.stepIndex + 1}步：</span>}
                {r.instruction}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      <AgentProgress
        status={agentState.status}
        steps={agentState.steps}
        plan={agentState.plan}
        error={agentState.error}
      />
    </div>
  );
}
