import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CodeEditor({ value, onChange, disabled }: CodeEditorProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
        <label className="text-[13px] font-medium text-white/60">
          Manim 代码（可编辑后渲染）
        </label>
      </div>
      <div className="flex-1 rounded-[12px] border border-white/[0.06] overflow-hidden min-h-[200px] bg-[#0d0d0f]">
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
