import { useState, useEffect } from "react";
import { Settings, Plus, Trash2, Check } from "lucide-react";
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
  apiFormat: "openai" | "anthropic";
}

export interface VisionConfig {
  useSameAsCode: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  apiFormat: "openai" | "anthropic";
}

interface SettingsState {
  providers: Provider[];
  activeProviderId: string | null;
  activeModel: string;
  vision: VisionConfig;
}

const STORAGE_KEY = "manim-studio-settings-v2";

const BUILT_IN_PROVIDERS: Omit<Provider, "id">[] = [
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"], apiFormat: "openai" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", apiKey: "", models: ["deepseek-chat", "deepseek-reasoner"], apiFormat: "openai" },
  { name: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "", models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-vl-max", "qwen-vl-plus"], apiFormat: "openai" },
  { name: "智谱", baseUrl: "https://open.bigmodel.cn/api/paas/v4", apiKey: "", models: ["glm-4", "glm-4-flash", "glm-4v", "glm-4v-flash"], apiFormat: "openai" },
  { name: "月之暗面", baseUrl: "https://api.moonshot.cn/v1", apiKey: "", models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"], apiFormat: "openai" },
  { name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", apiKey: "", models: ["Qwen/Qwen2.5-72B-Instruct", "Qwen/Qwen2-VL-72B-Instruct", "deepseek-ai/DeepSeek-V3"], apiFormat: "openai" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", apiKey: "", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], apiFormat: "openai" },
  { name: "小米 MiMo", baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic", apiKey: "", models: ["mimo-v2.5"], apiFormat: "anthropic" },
];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate from old format if needed
      if (parsed.apiKey && !parsed.providers) {
        return {
          providers: [{
            id: generateId(),
            name: "默认",
            baseUrl: parsed.baseUrl || "https://api.openai.com/v1",
            apiKey: parsed.apiKey || "",
            models: [parsed.model || "gpt-4o-mini"],
            apiFormat: "openai",
          }],
          activeProviderId: null,
          activeModel: parsed.model || "gpt-4o-mini",
          vision: parsed.vision || { useSameAsCode: true, apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
        };
      }
      // Migrate: add apiFormat to providers that don't have it
      if (parsed.providers) {
        parsed.providers = parsed.providers.map((p: Record<string, unknown>) => ({
          ...p,
          apiFormat: p.apiFormat || "openai",
        }));
      }
      return parsed;
    }
  } catch {}
  return {
    providers: [],
    activeProviderId: null,
    activeModel: "gpt-4o-mini",
    vision: { useSameAsCode: true, apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  };
}

function saveSettings(state: SettingsState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getActiveProvider(state: SettingsState): Provider | null {
  return state.providers.find((p) => p.id === state.activeProviderId) || null;
}

// Known vision models per provider (by base URL pattern)
const KNOWN_VISION_MODELS: Record<string, string> = {
  "openai.com": "gpt-4o",
  "dashscope": "qwen-vl-max",
  "aliyuncs": "qwen-vl-max",
  "bigmodel.cn": "glm-4v",
  "siliconflow": "Qwen/Qwen2-VL-72B-Instruct",
  "xiaomimimo": "mimo-v2.5",
  "moonshot": "",    // no vision
  "deepseek": "",    // no vision
  "groq": "",        // no vision
};

// User-learned vision model preferences (per base URL)
const VISION_LEARN_KEY = "manim-studio-vision-learn";

function loadVisionLearn(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VISION_LEARN_KEY) || "{}"); } catch { return {}; }
}

function saveVisionLearn(map: Record<string, string>) {
  localStorage.setItem(VISION_LEARN_KEY, JSON.stringify(map));
}

/** Remember that user chose this vision model for a given base URL. */
export function learnVisionModel(baseUrl: string, model: string) {
  const map = loadVisionLearn();
  map[baseUrl] = model;
  saveVisionLearn(map);
}

function guessVisionModel(baseUrl: string): string {
  // 1. Check user-learned preference first
  const learned = loadVisionLearn();
  if (learned[baseUrl]) return learned[baseUrl];

  // 2. Check known providers
  const url = baseUrl.toLowerCase();
  for (const [pattern, model] of Object.entries(KNOWN_VISION_MODELS)) {
    if (url.includes(pattern)) return model;
  }
  return ""; // unknown
}

export function resolveVisionConfig(code: LlmConfig, vision: VisionConfig): { apiKey: string; baseUrl: string; model: string } {
  if (vision.useSameAsCode) {
    const model = guessVisionModel(code.baseUrl);
    if (model) {
      return { apiKey: code.apiKey, baseUrl: code.baseUrl, model };
    }
    // Can't auto-detect — fall back to vision config
    return { apiKey: vision.apiKey || code.apiKey, baseUrl: vision.baseUrl || code.baseUrl, model: vision.model || "" };
  }
  return { apiKey: vision.apiKey, baseUrl: vision.baseUrl, model: vision.model };
}

interface SettingsDialogProps {
  onConfigChange?: (config: LlmConfig) => void;
  onVisionChange?: (config: VisionConfig) => void;
}

export function SettingsDialog({ onConfigChange, onVisionChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [open, setOpen] = useState(false);
  const [newModelInput, setNewModelInput] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [showAddProvider, setShowAddProvider] = useState(false);

  useEffect(() => {
    onConfigChange?.(getLlmConfig(settings));
    onVisionChange?.(settings.vision);
  }, []);

  const update = (patch: Partial<SettingsState>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
  };

  const getLlmConfig = (s: SettingsState): LlmConfig => {
    const provider = s.providers.find((p) => p.id === s.activeProviderId);
    if (!provider) return { apiKey: "", baseUrl: "https://api.openai.com/v1", model: s.activeModel, apiFormat: "openai" };
    return { apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: s.activeModel, apiFormat: provider.apiFormat || "openai" };
  };

  const selectProvider = (providerId: string) => {
    const provider = settings.providers.find((p) => p.id === providerId);
    const model = provider?.models[0] || "gpt-4o-mini";
    update({ activeProviderId: providerId, activeModel: model });
  };

  const addBuiltInProvider = (preset: Omit<Provider, "id" | "apiKey"> & { apiKey?: string }) => {
    const exists = settings.providers.some((p) => p.name === preset.name);
    if (exists) return;
    const id = generateId();
    const provider: Provider = { ...preset, id, apiKey: preset.apiKey || "" };
    update({
      providers: [...settings.providers, provider],
      activeProviderId: id,
      activeModel: provider.models[0],
    });
  };

  const addCustomProvider = () => {
    if (!newProviderName.trim()) return;
    const id = generateId();
    const provider: Provider = {
      id,
      name: newProviderName.trim(),
      baseUrl: "",
      apiKey: "",
      models: ["custom-model"],
      apiFormat: "openai",
    };
    update({
      providers: [...settings.providers, provider],
      activeProviderId: id,
      activeModel: "custom-model",
    });
    setNewProviderName("");
    setShowAddProvider(false);
  };

  const removeProvider = (id: string) => {
    const next = settings.providers.filter((p) => p.id !== id);
    const patch: Partial<SettingsState> = { providers: next };
    if (settings.activeProviderId === id) {
      patch.activeProviderId = next[0]?.id || null;
      patch.activeModel = next[0]?.models[0] || "gpt-4o-mini";
    }
    update(patch);
  };

  const updateProvider = (id: string, patch: Partial<Provider>) => {
    update({
      providers: settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const addModel = (providerId: string) => {
    const model = newModelInput.trim();
    if (!model) return;
    const provider = settings.providers.find((p) => p.id === providerId);
    if (!provider || provider.models.includes(model)) return;
    updateProvider(providerId, { models: [...provider.models, model] });
    setNewModelInput("");
  };

  const removeModel = (providerId: string, model: string) => {
    const provider = settings.providers.find((p) => p.id === providerId);
    if (!provider) return;
    const models = provider.models.filter((m) => m !== model);
    updateProvider(providerId, { models });
    if (settings.activeModel === model && models.length > 0) {
      update({ activeModel: models[0] });
    }
  };

  const handleSave = () => {
    // Learn: if user configured vision model separately, remember it for this provider
    if (!settings.vision.useSameAsCode && settings.vision.model && activeProvider) {
      learnVisionModel(activeProvider.baseUrl, settings.vision.model);
    }
    const llm = getLlmConfig(settings);
    console.log("Settings save:", {
      activeProvider: activeProvider?.name,
      api_key: llm.apiKey ? "***" + llm.apiKey.slice(-4) : "(empty)",
      baseUrl: llm.baseUrl,
      model: llm.model,
      apiFormat: llm.apiFormat,
      vision: settings.vision,
    });
    saveSettings(settings);
    onConfigChange?.(llm);
    onVisionChange?.(settings.vision);
    setOpen(false);
  };

  const activeProvider = getActiveProvider(settings);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-white/[0.06] transition-all duration-200 cursor-pointer border-none bg-transparent">
        <Settings className="h-4 w-4 text-white/40" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API 设置</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Active Provider Selector */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-white/60 block">当前 Provider</label>
            <div className="flex flex-wrap gap-1.5">
              {settings.providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProvider(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                    settings.activeProviderId === p.id
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                      : "bg-white/[0.04] text-white/40 border border-transparent hover:bg-white/[0.08] hover:text-white/60"
                  }`}
                >
                  {settings.activeProviderId === p.id && <Check className="h-3 w-3" />}
                  {p.name}
                </button>
              ))}
              <button
                onClick={() => setShowAddProvider(!showAddProvider)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] text-white/25 hover:text-white/40 hover:bg-white/[0.04] transition-all duration-200 border border-dashed border-white/10"
              >
                <Plus className="h-3 w-3" />
                添加
              </button>
            </div>
          </div>

          {/* Add Provider */}
          {showAddProvider && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 space-y-3 animate-fade-in">
              <div className="text-[12px] text-white/40 font-medium">快速添加常用 Provider</div>
              <div className="flex flex-wrap gap-1.5">
                {BUILT_IN_PROVIDERS.filter(
                  (bp) => !settings.providers.some((p) => p.name === bp.name)
                ).map((bp) => (
                  <button
                    key={bp.name}
                    onClick={() => addBuiltInProvider(bp)}
                    className="px-2.5 py-1 rounded-lg text-[12px] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/70 transition-all duration-200"
                  >
                    + {bp.name}
                  </button>
                ))}
              </div>
              <div className="border-t border-white/[0.06] pt-3">
                <div className="text-[12px] text-white/40 font-medium mb-2">或自定义 Provider</div>
                <div className="flex gap-2">
                  <Input
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="名称，如 我的小米 API"
                    className="text-[13px] h-8"
                    onKeyDown={(e) => e.key === "Enter" && addCustomProvider()}
                  />
                  <Button size="sm" onClick={addCustomProvider} className="h-8 px-3">
                    添加
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Provider Detail */}
          {activeProvider && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-medium text-white/60">{activeProvider.name} 配置</label>
                <button
                  onClick={() => removeProvider(activeProvider.id)}
                  className="text-white/20 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                <Input
                  value={activeProvider.name}
                  onChange={(e) => updateProvider(activeProvider.id, { name: e.target.value })}
                  placeholder="Provider 名称"
                  className="text-[13px] h-9"
                />
                <Input
                  value={activeProvider.baseUrl}
                  onChange={(e) => updateProvider(activeProvider.id, { baseUrl: e.target.value })}
                  placeholder="Base URL，如 https://api.openai.com/v1"
                  className="text-[13px] h-9"
                />
                <Input
                  type="password"
                  value={activeProvider.apiKey}
                  onChange={(e) => updateProvider(activeProvider.id, { apiKey: e.target.value })}
                  placeholder="API Key"
                  className="text-[13px] h-9"
                />
                <div className="flex items-center gap-2">
                  <label className="text-[12px] text-white/40 whitespacenowrap">API 格式</label>
                  <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.06] p-0.5">
                    {(["openai", "anthropic"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => updateProvider(activeProvider.id, { apiFormat: fmt })}
                        className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all duration-200 ${
                          activeProvider.apiFormat === fmt
                            ? "bg-blue-500/15 text-blue-400"
                            : "text-white/40 hover:text-white/60"
                        }`}
                      >
                        {fmt === "openai" ? "OpenAI" : "Anthropic"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Model List */}
              <div className="space-y-2">
                <label className="text-[12px] text-white/40 font-medium">模型列表</label>
                <div className="space-y-1">
                  {activeProvider.models.map((model) => (
                    <div
                      key={model}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 ${
                        settings.activeModel === model
                          ? "bg-blue-500/10 border border-blue-500/20"
                          : "bg-white/[0.03] border border-transparent hover:bg-white/[0.06]"
                      }`}
                      onClick={() => update({ activeModel: model })}
                    >
                      <span className={`text-[13px] font-mono ${settings.activeModel === model ? "text-blue-400" : "text-white/50"}`}>
                        {model}
                      </span>
                      <div className="flex items-center gap-1">
                        {settings.activeModel === model && <Check className="h-3 w-3 text-blue-400" />}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeModel(activeProvider.id, model); }}
                          className="text-white/15 hover:text-red-400 transition-colors p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    placeholder="输入模型名称，如 gpt-4o"
                    className="text-[13px] h-8 flex-1"
                    onKeyDown={(e) => e.key === "Enter" && addModel(activeProvider.id)}
                  />
                  <Button size="xs" onClick={() => addModel(activeProvider.id)} className="h-8 px-2.5">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Vision Model */}
          <div className="space-y-3 border-t border-white/[0.06] pt-4">
            <label className="text-[13px] font-medium text-white/60 block">视觉分析模型</label>
            <label className="flex items-center gap-2 text-[13px] text-white/40 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.vision.useSameAsCode}
                onChange={(e) => update({ vision: { ...settings.vision, useSameAsCode: e.target.checked } })}
                className="rounded"
              />
              使用与代码模型相同的 API Key
            </label>
            {settings.vision.useSameAsCode && activeProvider && (() => {
              const autoModel = guessVisionModel(activeProvider.baseUrl);
              return autoModel ? (
                <p className="text-[11px] text-amber-400/60">
                  将自动使用 <span className="text-amber-400/80">{autoModel}</span> 作为视觉模型
                </p>
              ) : (
                <p className="text-[11px] text-red-400/70">
                  当前 Provider（{activeProvider.name}）无法自动识别视觉模型。请取消勾选，单独配置视觉模型。
                </p>
              );
            })()}
            {!settings.vision.useSameAsCode && (
              <div className="space-y-2">
                <Input
                  value={settings.vision.baseUrl}
                  onChange={(e) => update({ vision: { ...settings.vision, baseUrl: e.target.value } })}
                  placeholder="Base URL"
                  className="text-[13px] h-9"
                />
                <Input
                  type="password"
                  value={settings.vision.apiKey}
                  onChange={(e) => update({ vision: { ...settings.vision, apiKey: e.target.value } })}
                  placeholder="API Key"
                  className="text-[13px] h-9"
                />
              </div>
            )}
            <Input
              value={settings.vision.model}
              onChange={(e) => update({ vision: { ...settings.vision, model: e.target.value } })}
              placeholder="模型名称（需支持 vision，如 gpt-4o, qwen-vl-max）"
              className="text-[13px] h-9"
            />
            <p className="text-[11px] text-white/25">
              支持图像的模型：gpt-4o, gpt-4o-mini, qwen-vl-max, qwen-vl-plus, glm-4v, glm-4v-flash 等
              {settings.vision.useSameAsCode && activeProvider?.baseUrl.includes("deepseek") && (
                <span className="text-amber-400/80 block mt-1">
                  DeepSeek 不支持图像识别，请取消勾选上方选项，单独配置视觉模型。
                </span>
              )}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
        <p className="text-[11px] text-white/20">
          配置仅保存在浏览器本地，不会上传到任何服务器。
        </p>
      </DialogContent>
    </Dialog>
  );
}

export { loadSettings as loadLlmConfig };
