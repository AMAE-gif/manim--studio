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

export interface VisionConfig {
  useSameAsCode: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_CONFIG: LlmConfig = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

const DEFAULT_VISION: VisionConfig = {
  useSameAsCode: true,
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
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

const VISION_PRESETS: Record<string, Partial<LlmConfig>> = {
  "OpenAI GPT-4o": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  "通义千问 VL-Max": { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max" },
  "智谱 GLM-4V": { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4v" },
  "硅基流动 Qwen-VL": { baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2-VL-72B-Instruct" },
};

const STORAGE_KEY = "manim-studio-llm-config";
const VISION_STORAGE_KEY = "manim-studio-vision-config";

function loadConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

function loadVisionConfig(): VisionConfig {
  try {
    const raw = localStorage.getItem(VISION_STORAGE_KEY);
    if (raw) return { ...DEFAULT_VISION, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_VISION;
}

function saveConfig(config: LlmConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function saveVisionConfig(config: VisionConfig) {
  localStorage.setItem(VISION_STORAGE_KEY, JSON.stringify(config));
}

export function resolveVisionConfig(code: LlmConfig, vision: VisionConfig): { apiKey: string; baseUrl: string; model: string } {
  if (vision.useSameAsCode) {
    return { apiKey: code.apiKey, baseUrl: code.baseUrl, model: "gpt-4o" };
  }
  return { apiKey: vision.apiKey, baseUrl: vision.baseUrl, model: vision.model };
}

interface SettingsDialogProps {
  onConfigChange?: (config: LlmConfig) => void;
  onVisionChange?: (config: VisionConfig) => void;
}

export function SettingsDialog({ onConfigChange, onVisionChange }: SettingsDialogProps) {
  const [config, setConfig] = useState<LlmConfig>(loadConfig);
  const [vision, setVision] = useState<VisionConfig>(loadVisionConfig);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onConfigChange?.(config);
    onVisionChange?.(vision);
  }, []);

  const applyPreset = (name: string) => {
    const preset = PRESETS[name];
    if (preset) {
      const next = { ...config, ...preset };
      setConfig(next);
    }
  };

  const applyVisionPreset = (name: string) => {
    const preset = VISION_PRESETS[name];
    if (preset) {
      const next = { ...vision, ...preset, useSameAsCode: false };
      setVision(next);
    }
  };

  const handleSave = () => {
    saveConfig(config);
    saveVisionConfig(vision);
    onConfigChange?.(config);
    onVisionChange?.(vision);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors cursor-pointer border-none bg-transparent">
        <Settings className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>LLM API 设置</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Code generation model */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-foreground block">代码生成模型</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.keys(PRESETS).map((name) => (
                <Button key={name} variant="outline" size="xs" onClick={() => applyPreset(name)}>
                  {name}
                </Button>
              ))}
            </div>
            <Input
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder="API Base URL"
              className="text-sm"
            />
            <Input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="API Key"
              className="text-sm"
            />
            <Input
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="模型名称"
              className="text-sm"
            />
          </div>

          {/* Vision model */}
          <div className="space-y-3 border-t border-border pt-4">
            <label className="text-xs font-semibold text-foreground block">视觉分析模型</label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={vision.useSameAsCode}
                onChange={(e) => setVision({ ...vision, useSameAsCode: e.target.checked })}
                className="rounded"
              />
              使用与代码模型相同的 API Key
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.keys(VISION_PRESETS).map((name) => (
                <Button key={name} variant="outline" size="xs" onClick={() => applyVisionPreset(name)}>
                  {name}
                </Button>
              ))}
            </div>
            {!vision.useSameAsCode && (
              <>
                <Input
                  value={vision.baseUrl}
                  onChange={(e) => setVision({ ...vision, baseUrl: e.target.value })}
                  placeholder="API Base URL"
                  className="text-sm"
                />
                <Input
                  type="password"
                  value={vision.apiKey}
                  onChange={(e) => setVision({ ...vision, apiKey: e.target.value })}
                  placeholder="API Key"
                  className="text-sm"
                />
              </>
            )}
            <Input
              value={vision.model}
              onChange={(e) => setVision({ ...vision, model: e.target.value })}
              placeholder="模型名称（需支持 vision）"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
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
