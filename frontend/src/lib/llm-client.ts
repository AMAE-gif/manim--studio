/**
 * Direct LLM client — calls the LLM API from the browser, skipping the backend proxy.
 * Supports both OpenAI and Anthropic API formats.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiFormat: "openai" | "anthropic";
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Call an LLM API directly from the browser.
 * Returns the text content of the response.
 */
export async function callLLM(options: LLMCallOptions): Promise<string> {
  const {
    apiKey,
    baseUrl,
    model,
    apiFormat,
    messages,
    temperature = 0.3,
    maxTokens = 4096,
  } = options;

  if (!apiKey) throw new Error("API Key 未配置");

  if (apiFormat === "anthropic") {
    return callAnthropic({ apiKey, baseUrl, model, messages, temperature, maxTokens });
  }
  return callOpenAI({ apiKey, baseUrl, model, messages, temperature, maxTokens });
}

async function callOpenAI(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: LLMMessage[];
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const { apiKey, baseUrl, model, messages, temperature } = opts;
  // Ensure base URL ends with /chat/completions
  let url = baseUrl.replace(/\/+$/, "");
  if (!url.endsWith("/chat/completions")) {
    url += "/chat/completions";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`LLM API 错误 (${res.status}): ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: LLMMessage[];
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const { apiKey, baseUrl, model, messages, temperature, maxTokens } = opts;

  // Anthropic: system is a top-level param, not in messages
  let systemContent = "";
  const userMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemContent += m.content + "\n";
    } else {
      userMessages.push({ role: m.role as "user" | "assistant", content: m.content });
    }
  }
  if (userMessages.length === 0) {
    userMessages.push({ role: "user", content: "Hello" });
  }

  // Ensure base URL ends with /v1/messages
  let url = baseUrl.replace(/\/+$/, "");
  if (!url.endsWith("/v1/messages")) {
    if (url.endsWith("/v1")) {
      url += "/messages";
    } else {
      url += "/v1/messages";
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemContent.trim() || undefined,
      messages: userMessages,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`LLM API 错误 (${res.status}): ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

/**
 * Call a vision LLM API directly from the browser (for image analysis).
 */
export async function callVisionLLM(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiFormat: "openai" | "anthropic";
  systemPrompt: string;
  userText: string;
  imageBase64: string;
  mimeType?: string;
}): Promise<string> {
  const {
    apiKey,
    baseUrl,
    model,
    apiFormat,
    systemPrompt,
    userText,
    imageBase64,
    mimeType = "image/png",
  } = options;

  if (!apiKey) throw new Error("视觉模型 API Key 未配置");

  if (apiFormat === "anthropic") {
    return callVisionAnthropic({ apiKey, baseUrl, model, systemPrompt, userText, imageBase64, mimeType });
  }
  return callVisionOpenAI({ apiKey, baseUrl, model, systemPrompt, userText, imageBase64, mimeType });
}

async function callVisionOpenAI(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userText: string;
  imageBase64: string;
  mimeType: string;
}): Promise<string> {
  const { apiKey, baseUrl, model, systemPrompt, userText, imageBase64, mimeType } = opts;
  let url = baseUrl.replace(/\/+$/, "");
  if (!url.endsWith("/chat/completions")) {
    url += "/chat/completions";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Vision API 错误 (${res.status}): ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callVisionAnthropic(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userText: string;
  imageBase64: string;
  mimeType: string;
}): Promise<string> {
  const { apiKey, baseUrl, model, systemPrompt, userText, imageBase64, mimeType } = opts;
  let url = baseUrl.replace(/\/+$/, "");
  if (!url.endsWith("/v1/messages")) {
    if (url.endsWith("/v1")) {
      url += "/messages";
    } else {
      url += "/v1/messages";
    }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Vision API 错误 (${res.status}): ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}
