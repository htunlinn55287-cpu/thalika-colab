export type RetryableStatus = 429 | 503;

export class TimeoutError extends Error {
  constructor(message = "Remote inference timed out.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class RemoteProviderError extends Error {
  public readonly statusCode?: number;
  public readonly publicMessage: string;
  public readonly retryable: boolean;

  constructor(message: string, options: { statusCode?: number; publicMessage?: string; retryable?: boolean } = {}) {
    super(message);
    this.name = "RemoteProviderError";
    this.statusCode = options.statusCode;
    this.publicMessage = options.publicMessage || message;
    this.retryable = Boolean(options.retryable);
  }
}

export function getHFRequestTimeout() {
  const parsed = Number(process.env.HF_REQUEST_TIMEOUT || 60000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60000;
}

export function getHFInferenceTimeout() {
  const parsed = Number(process.env.HF_INFERENCE_TIMEOUT || 300000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300000;
}

// ZeroGPU Spaces grant almost no GPU quota to anonymous (unauthenticated) API calls — calling
// from the Next.js server (no browser login session) hits "exceeded ZeroGPU quota" immediately.
// Passing the Space owner's own HF token as a Bearer header authenticates the call so it uses
// that account's normal (non-anonymous) quota instead. No-op if HF_TOKEN isn't set.
function getHFToken() {
  const token = process.env.HF_TOKEN?.trim();
  return token && token.length > 0 ? token : undefined;
}

function withAuthHeaders(init: RequestInit = {}): RequestInit {
  const token = getHFToken();
  if (!token) return init;

  return {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`
    }
  };
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = getHFRequestTimeout()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...withAuthHeaders(init),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTextWithTimeout(url: string, init: RequestInit = {}, timeoutMs = getHFInferenceTimeout()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...withAuthHeaders(init),
      signal: controller.signal
    });
    const text = await response.text();
    return { response, text };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function retryDelay(attempt: number) {
  // Exponential backoff capped at 15s so a long retry budget (e.g. riding out a busy public
  // Space's 503s) spaces requests out politely without growing unbounded.
  return Math.min(15_000, 600 * 2 ** attempt);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  attempts = 2,
  onRetry?: (error: unknown, nextAttempt: number) => Promise<void> | void
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error;
      }
      await onRetry?.(error, attempt + 2);
      await sleep(retryDelay(attempt));
    }
  }

  throw lastError;
}

export function shouldRetryHFError(error: unknown) {
  if (error instanceof TimeoutError) return true;
  if (error instanceof RemoteProviderError) return error.retryable;
  return false;
}

export function assertOkResponse(response: Response, fallbackMessage: string) {
  if (response.ok) return;

  if (response.status === 429) {
    throw new RemoteProviderError("Rate limited", {
      statusCode: response.status,
      publicMessage: "Public Hugging Face Space is rate limited.",
      retryable: true
    });
  }

  if (response.status === 503) {
    throw new RemoteProviderError("Unavailable", {
      statusCode: response.status,
      publicMessage: "The public VoxCPM2 Space is busy or waking up. Wait a moment and generate again.",
      retryable: true
    });
  }

  throw new RemoteProviderError(`${fallbackMessage}: HTTP ${response.status}`, {
    statusCode: response.status,
    publicMessage: fallbackMessage
  });
}

export function normalizeRemoteError(error: unknown) {
  if (error instanceof TimeoutError) return "Remote inference timed out.";
  if (error instanceof RemoteProviderError) return error.publicMessage;
  return "Remote inference failed";
}

export async function readJsonResponse<T>(response: Response, invalidMessage: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new RemoteProviderError("Invalid JSON response", { publicMessage: invalidMessage });
  }
}

export function parseUploadResponse(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "path" in first && typeof first.path === "string") return first.path;
  }

  if (value && typeof value === "object") {
    if ("path" in value && typeof value.path === "string") return value.path;
    if ("files" in value && Array.isArray(value.files)) return parseUploadResponse(value.files);
  }

  throw new RemoteProviderError("Invalid upload response", {
    publicMessage: "Invalid response from remote Space."
  });
}

export function parseSSEData(text: string) {
  const events: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      throw new RemoteProviderError("Invalid SSE response", {
        publicMessage: "Invalid response from remote Space."
      });
    }
  }
  return events;
}

function collectAudioCandidates(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    return /\.(wav|mp3)(\?|$)/i.test(value) || value.includes("/file=") ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectAudioCandidates(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = [record.url, record.path, record.name]
      .filter((item): item is string => typeof item === "string")
      .filter((item) => /\.(wav|mp3)(\?|$)/i.test(item) || item.includes("/file="));
    return [...direct, ...Object.values(record).flatMap((item) => collectAudioCandidates(item))];
  }

  return [];
}

function collectRemoteMessages(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return value.length <= 500 ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectRemoteMessages(item));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ["error", "message", "detail"].flatMap((key) => collectRemoteMessages(record[key]));
  }
  return [];
}

export function summarizeRemoteEvents(events: unknown[]) {
  return events.map((event) => {
    if (Array.isArray(event)) return { type: "array", items: event.length };
    if (event && typeof event === "object") return { type: "object", keys: Object.keys(event as Record<string, unknown>).slice(0, 12) };
    return { type: typeof event, value: typeof event === "string" ? event.slice(0, 200) : String(event) };
  });
}

export function extractAudioUrlFromEvents(events: unknown[], baseUrl: string) {
  // Copy before reversing: events is reused for diagnostics (summarizeRemoteEvents) after
  // this throws, and reverse() would otherwise mutate the caller's array in place.
  for (const event of [...events].reverse()) {
    const candidates = collectAudioCandidates(event);
    const candidate = candidates[0];
    if (!candidate) continue;
    if (/^https?:\/\//i.test(candidate)) return candidate;
    if (candidate.startsWith("/")) return `${baseUrl}${candidate}`;
    return `${baseUrl}/gradio_api/file=${encodeURIComponent(candidate)}`;
  }

  const remoteMessage = collectRemoteMessages(events).find(Boolean);
  if (remoteMessage) {
    throw new RemoteProviderError(`Remote Space generation error: ${remoteMessage}`, {
      publicMessage: "VoxCPM2 Space could not generate this audio segment."
    });
  }

  throw new RemoteProviderError("Missing audio output", {
    publicMessage: "VoxCPM2 Space returned no audio for this segment.",
    retryable: true
  });
}