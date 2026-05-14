import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_CONFIG: LlmConfig = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

const PRESETS: Record<string, Partial<LlmConfig>> = {
  "OpenAI GPT-4o mini": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  "OpenAI GPT-4o": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  "DeepSeek V3": { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  "DeepSeek R1": { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-reasoner" },
  "通义千问 Plus": { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  "通义千问 Max": { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-max" },
  "智谱 GLM-4": { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4" },
  "智谱 GLM-4-Flash": { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  "月之暗面 Kimi": { baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  "硅基流动 MiMo": { baseUrl: "https://api.siliconflow.cn/v1", model: "XiaoMi/MiMo-7B-RL" },
  "硅基流动 Qwen": { baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-72B-Instruct" },
  "Groq Llama": { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
};

const STORAGE_KEY = "manim-studio-llm-config";

function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config: LlmConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface SettingsDialogProps {
  onConfigChange?: (config: LlmConfig) => void;
}

export function SettingsDialog({ onConfigChange }: SettingsDialogProps) {
  const [config, setConfig] = useState<LlmConfig>(loadConfig);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onConfigChange?.(config);
  }, []);

  const applyPreset = (name: string) => {
    const preset = PRESETS[name];
    if (preset) {
      const next = { ...config, ...preset };
      setConfig(next);
    }
  };

  const handleSave = () => {
    saveConfig(config);
    onConfigChange?.(config);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors cursor-pointer border-none bg-transparent">
        <Settings className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>LLM API 设置</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              快速预设
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.keys(PRESETS).map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="xs"
                  onClick={() => applyPreset(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              API Base URL
            </label>
            <Input
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              API Key
            </label>
            <Input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="sk-..."
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              模型名称
            </label>
            <Input
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">
          API Key 仅保存在浏览器本地，不会上传到任何服务器。
        </p>
      </DialogContent>
    </Dialog>
  );
}

export { loadConfig as loadLlmConfig };
