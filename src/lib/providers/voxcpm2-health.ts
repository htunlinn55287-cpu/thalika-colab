import { readEnvKey } from "../storage/env-store";
import { fetchWithTimeout, getHFRequestTimeout, readJsonResponse, TimeoutError } from "./hf-utils";

export type VoxCPM2HealthStatus = "connected" | "timeout" | "rate_limited" | "unavailable" | "invalid_response";

export interface VoxCPM2Health {
  provider: "voxcpm2";
  backend: "huggingface-space";
  ok: boolean;
  status: VoxCPM2HealthStatus;
  baseUrl: string;
  endpoint: string;
  latencyMs: number;
  timeoutMs: number;
  message: string;
  checkedAt: string;
}

// Local-first default: the managed local VoxCPM2 server (scripts/voxcpm-local.sh) exposes the
// same /generate contract the app speaks and gives full control over inference_timesteps (the
// biggest stability/quality lever, locked out on the public Space). Point HF_VOXCPM2_URL at the
// public/demo Space explicitly if you want remote inference instead.
const localVoxCPM2Url = "http://localhost:7860";
const publicSpaceFallback = "https://openbmb-voxcpm-demo.hf.space";

// Precedence: user setting (.env.local, set in-app) > env > local default.
export async function getVoxCPM2BaseUrl() {
  const stored = await readEnvKey("HF_VOXCPM2_URL");
  return (stored || process.env.HF_VOXCPM2_URL || localVoxCPM2Url).replace(/\/+$/, "");
}

// True when the active endpoint is the local server. Used to enable local-only levers (extra
// /generate args like inference_timesteps) that the public Space's fixed signature would reject.
export async function isLocalVoxCPM2Endpoint() {
  const baseUrl = await getVoxCPM2BaseUrl();
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(baseUrl);
}

export const VOXCPM2_PUBLIC_SPACE_URL = publicSpaceFallback;

function makeHealth(
  status: VoxCPM2HealthStatus,
  options: {
    baseUrl: string;
    endpoint: string;
    latencyMs: number;
    message: string;
  }
): VoxCPM2Health {
  return {
    provider: "voxcpm2",
    backend: "huggingface-space",
    ok: status === "connected",
    status,
    baseUrl: options.baseUrl,
    endpoint: options.endpoint,
    latencyMs: options.latencyMs,
    timeoutMs: getHFRequestTimeout(),
    message: options.message,
    checkedAt: new Date().toISOString()
  };
}

function hasNamedGenerateEndpoint(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const namedEndpoints = record.named_endpoints;
  if (!namedEndpoints || typeof namedEndpoints !== "object") return false;
  return "/generate" in namedEndpoints;
}

function hasConfigGenerateEndpoint(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const dependencies = (value as Record<string, unknown>).dependencies;
  if (!Array.isArray(dependencies)) return false;

  return dependencies.some((dependency) => {
    if (!dependency || typeof dependency !== "object") return false;
    return (dependency as Record<string, unknown>).api_name === "generate";
  });
}

async function probeJson(baseUrl: string, endpoint: string) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  const latencyMs = Date.now() - startedAt;

  if (response.status === 429) {
    return makeHealth("rate_limited", {
      baseUrl,
      endpoint,
      latencyMs,
      message: `${endpointName(baseUrl)} is rate limited.`
    });
  }

  if (response.status === 503) {
    return makeHealth("unavailable", {
      baseUrl,
      endpoint,
      latencyMs,
      message: `${endpointName(baseUrl)} is currently unavailable.`
    });
  }

  if (!response.ok) {
    return makeHealth("unavailable", {
      baseUrl,
      endpoint,
      latencyMs,
      message: `${endpointName(baseUrl)} returned HTTP ${response.status}.`
    });
  }

  try {
    const json = await readJsonResponse<unknown>(response, "Invalid response from VoxCPM2 Space.");
    return { json, latencyMs };
  } catch {
    return makeHealth("invalid_response", {
      baseUrl,
      endpoint,
      latencyMs,
      message: "Invalid response from VoxCPM2 Space."
    });
  }
}

function endpointName(baseUrl: string) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(baseUrl) ? "Local VoxCPM server" : "Hugging Face Space";
}

export async function checkVoxCPM2Health(): Promise<VoxCPM2Health> {
  const baseUrl = await getVoxCPM2BaseUrl();

  try {
    const info = await probeJson(baseUrl, "/gradio_api/info");
    if ("status" in info) return info;
    if (hasNamedGenerateEndpoint(info.json)) {
      return makeHealth("connected", {
        baseUrl,
        endpoint: "/gradio_api/info",
        latencyMs: info.latencyMs,
        message: `${endpointName(baseUrl)} is connected and exposes /generate.`
      });
    }

    const config = await probeJson(baseUrl, "/config");
    if ("status" in config) return config;
    if (hasConfigGenerateEndpoint(config.json)) {
      return makeHealth("connected", {
        baseUrl,
        endpoint: "/config",
        latencyMs: config.latencyMs,
        message: `${endpointName(baseUrl)} is connected and exposes generate.`
      });
    }

    return makeHealth("invalid_response", {
      baseUrl,
      endpoint: "/gradio_api/info",
      latencyMs: info.latencyMs,
      message: "Invalid response from VoxCPM2 Space."
    });
  } catch (error) {
    if (error instanceof TimeoutError) {
      return makeHealth("timeout", {
        baseUrl,
        endpoint: "/gradio_api/info",
        latencyMs: getHFRequestTimeout(),
        message: "Remote inference timed out."
      });
    }

    return makeHealth("unavailable", {
      baseUrl,
      endpoint: "/gradio_api/info",
      latencyMs: 0,
      message: `${endpointName(baseUrl)} is currently unavailable.`
    });
  }
}
