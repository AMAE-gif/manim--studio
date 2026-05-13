import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CodeEditor({ value, onChange, disabled }: CodeEditorProps) {
  return (
    <div className="flex flex-col h-full">
      <label className="text-xs font-medium text-muted-foreground mb-2">
        Manim 代码（可编辑后渲染）
      </label>
      <div className="flex-1 rounded-md border border-border overflow-hidden min-h-[200px]">
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
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 12 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            renderLineHighlight: "none",
            scrollbar: { vertical: "auto" },
          }}
          loading={
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              加载编辑器...
            </div>
          }
        />
      </div>
    </div>
  );
}
