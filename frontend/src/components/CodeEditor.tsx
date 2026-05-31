import Editor from "@monaco-editor/react";
import { Code2 } from "lucide-react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CodeEditor({ value, onChange, disabled }: CodeEditorProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          <label className="text-[13px] font-medium text-white/60">
            Manim 代码
          </label>
        </div>
        {value && (
          <span className="text-[11px] text-white/15 font-medium">
            {value.split('\n').length} 行
          </span>
        )}
      </div>
      <div className="flex-1 rounded-[12px] border border-white/[0.06] overflow-hidden min-h-[200px] bg-[#0d0d0f] relative">
        {!value && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
            <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center mb-3">
              <Code2 className="h-5 w-5 text-white/10" />
            </div>
            <p className="text-[12px] text-white/15 font-medium">生成后代码将在此显示</p>
            <p className="text-[11px] text-white/10 mt-1">可编辑后重新渲染</p>
          </div>
        )}
        <Editor
          height="100%"
          defaultLanguage="python"
          theme="vs-dark"
          value={value}
          onChange={(v) => onChange(v ?? "")}
          options={{
            readOnly: disabled,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 20,
            letterSpacing: 0.3,
            fontFamily: "'Geist Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 14, bottom: 14 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            renderLineHighlight: "none",
            scrollbar: { vertical: "auto", horizontal: "auto" },
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-white/25 text-[13px]">
                <div className="w-4 h-4 border-2 border-white/10 border-t-white/30 rounded-full animate-spin" />
                加载编辑器...
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
