"use client";

import type { ProviderCapability, ProviderPreflightResult } from "@/lib/types";

interface AgentAwarenessPanelProps {
  capability?: ProviderCapability;
  preflight?: ProviderPreflightResult;
}

const severityClasses: Record<NonNullable<ProviderPreflightResult["severity"]>, string> = {
  info: "border-studio-border studio-card-bg text-studio-muted",
  warning: "border-amber-300/45 bg-amber-400/10 text-amber-700",
  blocked: "border-red-300/45 bg-red-400/10 text-red-700"
};

export function AgentAwarenessPanel({ capability, preflight }: AgentAwarenessPanelProps) {
  if (!capability || !preflight) {
    return (
      <section className="studio-card-bg rounded-[1.6rem] border border-studio-border p-5">
        <h2 className="text-lg font-semibold text-studio-text">Agent Awareness</h2>
        <p className="mt-3 text-sm text-studio-muted">Checking provider capabilities.</p>
      </section>
    );
  }

  return (
    <section className="studio-card-bg rounded-[1.6rem] border border-studio-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-studio-text">Agent Awareness</h2>
          <p className="mt-1 text-sm text-studio-muted">What this provider can actually do.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityClasses[preflight.severity]}`}>
          {preflight.severity}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm">
        <div className={`rounded-lg border p-3 ${severityClasses[preflight.severity]}`}>
          <p className="font-semibold">{preflight.message}</p>
          {!preflight.hideNextStep && <p className="mt-1 opacity-90">{preflight.nextStep}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-studio-border bg-studio-ink/70 p-3">
            <p className="text-xs text-studio-muted">Detected language</p>
            <p className="mt-1 font-semibold text-studio-text">{preflight.detectedLanguage.label}</p>
          </div>
          <div className="rounded-lg border border-studio-border bg-studio-ink/70 p-3">
            <p className="text-xs text-studio-muted">Clone quality</p>
            <p className="mt-1 font-semibold text-studio-text">{capability.cloneQuality}</p>
          </div>
          <div className="rounded-lg border border-studio-border bg-studio-ink/70 p-3">
            <p className="text-xs text-studio-muted">Privacy</p>
            <p className="mt-1 font-semibold text-studio-text">{capability.statusLabel || capability.privacy.replace("_", " ")}</p>
          </div>
          <div className="rounded-lg border border-studio-border bg-studio-ink/70 p-3">
            <p className="text-xs text-studio-muted">Voice clone</p>
            <p className="mt-1 font-semibold text-studio-text">{capability.canCloneVoice ? "attempts clone" : "not a clone"}</p>
          </div>
        </div>

        <div className="rounded-lg border border-studio-border bg-studio-ink/70 p-3">
          <p className="text-xs text-studio-muted">Supported languages</p>
          <p className="mt-1 text-studio-text">{capability.supportedLanguageLabels.join(", ") || "Not configured"}</p>
        </div>

        <div className="rounded-lg border border-studio-border bg-studio-ink/70 p-3">
          <p className="text-xs text-studio-muted">Recommendation</p>
          <p className="mt-1 text-studio-text">{capability.recommendation}</p>
        </div>
      </div>
    </section>
  );
}
