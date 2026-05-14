import { useCallback, useRef, useState } from "react";
import { GraduationCap, Upload, X, Loader2, Sparkles, Film } from "lucide-react";
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
  hasJob: boolean;
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
  hasJob,
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

  return (
    <div className="space-y-3">
      {/* Image Upload */}
      {!hasProblem && (
        <>
          {preview ? (
            <div className="space-y-2">
              <div className="relative inline-block">
                <img src={preview} alt="题目图片" className="h-20 rounded-md border border-border" />
                <button
                  onClick={clear}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={busy || !visionConfig.apiKey}
                onClick={handleAnalyze}
              >
                <GraduationCap className="h-3 w-3 mr-1" />
                提取题目
              </Button>
              {!visionConfig.apiKey && (
                <p className="text-xs text-muted-foreground">请先在设置中配置视觉模型 API Key</p>
              )}
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 p-2 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">上传题目图片（拍照/截图）</span>
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
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" />
            题目识别结果
          </div>
          <Textarea
            value={agentState.problemText}
            onChange={(e) => {
              // Allow editing the problem text
              window.dispatchEvent(new CustomEvent("teacher:set-problem-text", { detail: e.target.value }));
            }}
            className="h-20 resize-none text-xs"
            disabled={busy}
          />
          {agentState.problemType && (
            <span className="inline-block bg-muted text-xs px-2 py-0.5 rounded">
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
          className="h-16 resize-none text-xs"
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

      {/* Refinement Input */}
      {hasSolution && !isRunning && (
        <div className="space-y-2">
          <Textarea
            value={refinement}
            onChange={(e) => setRefinement(e.target.value)}
            placeholder="用自然语言描述你想要的修改，如第2步改用面积法、加一个坐标系可视化..."
            className="h-16 resize-none text-xs"
            disabled={busy}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!hasSolution ? (
          <Button
            onClick={onSolve}
            disabled={busy || (!hasProblem && !prompt.trim()) || !llmConfig.apiKey}
            className="flex-1"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5" />
            )}
            {isRunning ? "分析中..." : "生成解题"}
          </Button>
        ) : (
          <>
            <Button
              onClick={handleRefine}
              disabled={busy || !refinement.trim()}
              variant="outline"
            >
              应用修改
            </Button>
            <Button
              onClick={onRender}
              disabled={busy || !hasJob}
              className="flex-1"
            >
              <Film className="h-4 w-4 mr-1.5" />
              生成动画
            </Button>
          </>
        )}
      </div>

      {/* Refinement History */}
      {agentState.refinementHistory.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">修改记录</div>
          {agentState.refinementHistory.map((r, i) => (
            <div key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-2">
              {r.stepIndex !== null && `第${r.stepIndex + 1}步：`}{r.instruction}
            </div>
          ))}
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
