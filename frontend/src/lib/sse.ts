/** POST-based SSE client (browser EventSource only supports GET). */

import { apiPath } from "./api";

export interface SSECallbacks {
  onStepStart?: (data: { step: string; message: string }) => void;
  onCodeGenerated?: (data: { code: string; duration?: number }) => void;
  onValidationResult?: (data: { passed: boolean; syntax_error?: string; imports?: unknown; duration?: number }) => void;
  onRenderResult?: (data: { passed: boolean; error?: string; video_url?: string; duration?: number }) => void;
  onComplete?: (data: { code: string; video_url?: string; job_id: string; total_duration?: number }) => void;
  onError?: (data: { message: string; recoverable?: boolean }) => void;
  onToolResult?: (data: { tool: string; result: unknown }) => void;
  onDone?: () => void;
}

function dispatchEvent(eventType: string, data: Record<string, unknown>, callbacks: SSECallbacks) {
  switch (eventType) {
    case "step_start":
      callbacks.onStepStart?.(data as { step: string; message: string });
      break;
    case "code_generated":
      callbacks.onCodeGenerated?.(data as { code: string; duration?: number });
      break;
    case "validation_result":
      callbacks.onValidationResult?.(data as { passed: boolean; syntax_error?: string; imports?: unknown; duration?: number });
      break;
    case "render_result":
      callbacks.onRenderResult?.(data as { passed: boolean; error?: string; video_url?: string; duration?: number });
      break;
    case "complete":
      callbacks.onComplete?.(data as { code: string; video_url?: string; job_id: string; total_duration?: number });
      break;
    case "error":
      callbacks.onError?.(data as { message: string; recoverable?: boolean });
      break;
    case "tool_result":
      callbacks.onToolResult?.(data as { tool: string; result: unknown });
      break;
  }
}

export async function streamAgentGenerate(
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
  accessToken?: string | null,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(apiPath("/api/agent/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    callbacks.onError?.({ message: err.detail || "请求失败" });
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
        const dataStr = line.slice(6);
        if (currentEvent === "done") {
          callbacks.onDone?.();
          return;
        }
        try {
          const data = JSON.parse(dataStr);
          dispatchEvent(currentEvent, data, callbacks);
        } catch {
          // skip malformed JSON
        }
      }
    }
  }

  callbacks.onDone?.();
}
