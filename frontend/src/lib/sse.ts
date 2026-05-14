/** SSE client for Agent workflow — supports both sync stream and async submit+stream. */

import { apiPath } from "./api";

export interface SSECallbacks {
  onStepStart?: (data: { step: string; message: string }) => void;
  onPlanReady?: (data: { title: string; summary: string; shots: unknown[]; total_duration: number; raw: string }) => void;
  onCodeGenerated?: (data: { code: string; duration?: number }) => void;
  onValidationResult?: (data: { passed: boolean; syntax_error?: string; imports?: unknown; duration?: number }) => void;
  onRenderResult?: (data: { passed: boolean; error?: string; video_url?: string; duration?: number }) => void;
  onComplete?: (data: { code: string; video_url?: string; job_id: string; session_id?: string; total_duration?: number }) => void;
  onError?: (data: { message: string; recoverable?: boolean }) => void;
  onToolResult?: (data: { tool: string; result: unknown }) => void;
  onProblemExtracted?: (data: { problem_text: string; problem_type: string; expressions: string[]; visual_elements: string[] }) => void;
  onSolutionReady?: (data: { steps: Array<{ index: number; title: string; description: string; math_expression: string | null; visual_description: string | null; animation_hint: string | null }>; summary: string; visual_summary?: string }) => void;
  onSolutionRefined?: (data: { steps: Array<{ index: number; title: string; description: string; math_expression: string | null; visual_description: string | null; animation_hint: string | null }>; summary?: string; refinement_applied: string }) => void;
  onDone?: () => void;
}

function dispatchEvent(eventType: string, data: Record<string, unknown>, callbacks: SSECallbacks) {
  switch (eventType) {
    case "step_start":
      callbacks.onStepStart?.(data as { step: string; message: string });
      break;
    case "plan_ready":
      callbacks.onPlanReady?.(data as { title: string; summary: string; shots: unknown[]; total_duration: number; raw: string });
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
    case "problem_extracted":
      callbacks.onProblemExtracted?.(data as { problem_text: string; problem_type: string; expressions: string[]; visual_elements: string[] });
      break;
    case "solution_ready":
      callbacks.onSolutionReady?.(data as { steps: Array<{ index: number; title: string; description: string; math_expression: string | null; visual_description: string | null; animation_hint: string | null }>; summary: string; visual_summary?: string });
      break;
    case "solution_refined":
      callbacks.onSolutionRefined?.(data as { steps: Array<{ index: number; title: string; description: string; math_expression: string | null; visual_description: string | null; animation_hint: string | null }>; summary?: string; refinement_applied: string });
      break;
  }
}

function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  callbacks: SSECallbacks,
): Promise<void> {
  let buffer = "";

  function processLine(line: string, currentEvent: string): string {
    if (line.startsWith("event: ")) {
      return line.slice(7).trim();
    }
    if (line.startsWith("data: ")) {
      const dataStr = line.slice(6);
      if (currentEvent === "done") {
        callbacks.onDone?.();
        return currentEvent;
      }
      try {
        const data = JSON.parse(dataStr);
        dispatchEvent(currentEvent, data, callbacks);
      } catch {
        // skip malformed JSON
      }
    }
    return currentEvent;
  }

  return (async () => {
    let currentEvent = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        currentEvent = processLine(line, currentEvent);
        if (currentEvent === "done") return;
      }
    }
    callbacks.onDone?.();
  })();
}

/** Sync mode: POST to /api/agent/generate, stream results directly. */
export async function streamAgentGenerate(
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
  accessToken?: string | null,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

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
  await parseSSEStream(reader, decoder, callbacks);
}

/** Async mode: submit job → get job_id → stream via /api/agent/stream/{job_id}. */
export async function submitAndStreamAgent(
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
  accessToken?: string | null,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  // Step 1: Submit job
  const submitRes = await fetch(apiPath("/api/agent/submit"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    callbacks.onError?.({ message: err.detail || "提交任务失败" });
    return;
  }

  const { job_id } = await submitRes.json();

  // Step 2: Stream results via SSE
  const streamHeaders: Record<string, string> = {};
  if (accessToken) streamHeaders["Authorization"] = `Bearer ${accessToken}`;

  const streamRes = await fetch(apiPath(`/api/agent/stream/${job_id}`), {
    headers: streamHeaders,
  });

  if (!streamRes.ok) {
    callbacks.onError?.({ message: "无法连接到任务流" });
    return;
  }

  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();
  await parseSSEStream(reader, decoder, callbacks);
}

/** Teacher mode: submit to /api/teacher/submit → stream via /api/agent/stream/{job_id}. */
export async function submitAndStreamTeacher(
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
  accessToken?: string | null,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const submitRes = await fetch(apiPath("/api/teacher/submit"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    callbacks.onError?.({ message: err.detail || "提交任务失败" });
    return;
  }

  const { job_id } = await submitRes.json();

  const streamHeaders: Record<string, string> = {};
  if (accessToken) streamHeaders["Authorization"] = `Bearer ${accessToken}`;

  const streamRes = await fetch(apiPath(`/api/agent/stream/${job_id}`), {
    headers: streamHeaders,
  });

  if (!streamRes.ok) {
    callbacks.onError?.({ message: "无法连接到任务流" });
    return;
  }

  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();
  await parseSSEStream(reader, decoder, callbacks);
}
