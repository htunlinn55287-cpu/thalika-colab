"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, FilePenLine, KeyRound, Loader2, Send, Settings, Sparkles, WandSparkles, X } from "lucide-react";
import { StudioPageShell } from "@/components/StudioPageShell";
import { GEMINI_REWRITE_MODELS, type GeminiRewriteModel } from "@/lib/script-rewrite";
import { MAX_SCRIPT_CHARACTERS } from "@/lib/script-limits";

type RewriteStatus = "idle" | "rewriting" | "completed" | "failed";
type SyncStatus = "idle" | "syncing" | "synced" | "failed";
type KeySaveStatus = "idle" | "saving" | "saved" | "failed";

interface RewriteResponse {
  status: "completed" | "failed";
  title?: string;
  rewrittenScript?: string;
  rewrittenCharacterCount?: number;
  originalCharacterCount?: number;
  model?: string;
  error?: string;
  message?: string;
}

interface GeminiSettingsResponse {
  configured: boolean;
  maskedKey: string;
}

const statusLabels: Record<RewriteStatus, string> = {
  idle: "Idle",
  rewriting: "Rewriting",
  completed: "Completed",
  failed: "Failed"
};

export default function ScriptPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [model, setModel] = useState<GeminiRewriteModel>("gemini-2.5-flash");
  const [keepBurmese, setKeepBurmese] = useState(true);
  const [status, setStatus] = useState<RewriteStatus>("idle");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [maskedGeminiKey, setMaskedGeminiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [keySaveStatus, setKeySaveStatus] = useState<KeySaveStatus>("idle");
  const [keyError, setKeyError] = useState("");
  const [error, setError] = useState("");
  const [rewrittenScript, setRewrittenScript] = useState("");

  const loadGeminiSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/gemini", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as GeminiSettingsResponse;
      setGeminiConfigured(data.configured);
      setMaskedGeminiKey(data.maskedKey || "");
    } catch {
      setGeminiConfigured(false);
      setMaskedGeminiKey("");
    }
  }, []);

  useEffect(() => {
    void loadGeminiSettings();
  }, [loadGeminiSettings]);

  const scriptError = useMemo(() => {
    const trimmed = script.trim();
    if (!trimmed) return "Script is required.";
    if (trimmed.length < 10) return "Script must be at least 10 characters.";
    if (trimmed.length > MAX_SCRIPT_CHARACTERS) return `Script must be ${MAX_SCRIPT_CHARACTERS.toLocaleString()} characters or fewer.`;
    return "";
  }, [script]);

  const syncVoiceOverDraft = useCallback(
    async (nextScript: string) => {
      if (!nextScript.trim() || nextScript.trim().length < 10) return false;

      setSyncStatus("syncing");
      const response = await fetch("/api/drafts/voice-over", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title ? `${title} Narration` : "Narration Rewrite",
          script: nextScript
        })
      });

      if (!response.ok) {
        setSyncStatus("failed");
        return false;
      }

      setSyncStatus("synced");
      return true;
    },
    [title]
  );

  useEffect(() => {
    if (!rewrittenScript.trim() || rewrittenScript.trim().length < 10) return;

    const timeout = window.setTimeout(() => {
      void syncVoiceOverDraft(rewrittenScript);
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [rewrittenScript, syncVoiceOverDraft]);

  async function rewriteScript() {
    if (scriptError) {
      setStatus("failed");
      setError(scriptError);
      return;
    }

    setStatus("rewriting");
    setError("");
    setRewrittenScript("");

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, script, model, keepBurmese })
      });
      const data = (await response.json()) as RewriteResponse;
      if (!response.ok || data.status === "failed" || !data.rewrittenScript) {
        throw new Error(data.message || data.error || "Script rewrite failed.");
      }

      setRewrittenScript(data.rewrittenScript);
      await syncVoiceOverDraft(data.rewrittenScript);
      setStatus("completed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Script rewrite failed.");
      setStatus("failed");
    }
  }

  async function copyRewrite() {
    if (!rewrittenScript) return;
    await navigator.clipboard.writeText(rewrittenScript);
  }

  async function useInVoiceOver() {
    if (!rewrittenScript) return;
    const synced = await syncVoiceOverDraft(rewrittenScript);

    if (!synced) {
      setStatus("failed");
      setError("Could not sync script to Voice Over.");
      return;
    }

    router.push("/");
  }

  async function saveGeminiApiKey() {
    setKeySaveStatus("saving");
    setKeyError("");

    try {
      const response = await fetch("/api/settings/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: geminiApiKey })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not save Gemini API key.");
      }

      setGeminiApiKey("");
      setGeminiConfigured(Boolean(data.configured));
      setMaskedGeminiKey(data.maskedKey || "");
      setKeySaveStatus("saved");
      window.setTimeout(() => {
        setSettingsOpen(false);
        setKeySaveStatus("idle");
      }, 700);
    } catch (caught) {
      setKeySaveStatus("failed");
      setKeyError(caught instanceof Error ? caught.message : "Could not save Gemini API key.");
    }
  }

  const heroAside = (
    <div className="studio-card-bg grid gap-2 rounded-[2.1rem] border border-white/10 p-2 sm:grid-cols-3">
      {[
        { label: "Paste", helper: script.trim() ? "Ready" : "Original", icon: FilePenLine, active: Boolean(script.trim()) },
        { label: "Rewrite", helper: status === "completed" ? "Done" : "Gemini", icon: Sparkles, active: status === "completed" },
        { label: "Send", helper: rewrittenScript ? "Voice Over" : "Waiting", icon: Send, active: Boolean(rewrittenScript) }
      ].map((step) => {
        const Icon = step.icon;
        return (
          <div
            key={step.label}
            className={`rounded-[1.25rem] px-3 py-3 ${
              step.active ? "bg-studio-accent text-slate-950" : "studio-soft-chip-bg text-studio-muted"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Icon size={16} />
              <span>{step.label}</span>
            </div>
            <p className={`mt-1 text-xs ${step.active ? "text-slate-800" : "text-studio-muted"}`}>{step.helper}</p>
          </div>
        );
      })}
    </div>
  );

  return (
    <StudioPageShell
      activeTab="script"
      badge="AI narration rewrite"
      title="Script"
      description="Polish the original script with natural pauses, emphasis, and spoken pacing, then use the same script in Voice Over."
      aside={heroAside}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
                <FilePenLine size={19} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-studio-text">Original Script</h2>
                <p className="text-sm text-studio-muted">Paste the source script before narration rewrite.</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-studio-border bg-studio-panelSoft px-3 py-1 text-xs text-studio-muted">
              {script.length}/{MAX_SCRIPT_CHARACTERS.toLocaleString()}
            </span>
          </div>

          <label className="mb-2 block text-sm font-medium text-studio-muted" htmlFor="rewrite-title">
            Title
          </label>
          <input
            id="rewrite-title"
            maxLength={100}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional script title"
            className="studio-control-bg mb-4 w-full rounded-2xl border border-white/10 px-4 py-3 text-studio-text outline-none transition focus:border-studio-accent"
          />

          <label className="mb-2 block text-sm font-medium text-studio-muted" htmlFor="rewrite-script">
            Script
          </label>
          <textarea
            id="rewrite-script"
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="Paste the original script here..."
            className="studio-control-bg min-h-[28rem] w-full resize-y rounded-[1.8rem] border border-white/10 px-4 py-3 leading-7 text-studio-text outline-none transition placeholder:text-studio-muted/60 focus:border-studio-accent"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className={scriptError ? "text-red-600" : "text-studio-muted"}>
              {scriptError || "Gemini will rewrite this into narration-ready spoken flow."}
            </span>
            <span className="text-studio-muted">{script.trim().split(/\s+/).filter(Boolean).length} words</span>
          </div>
        </section>

        <aside className="grid content-start gap-5">
          <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
                  <WandSparkles size={19} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-studio-text">Rewrite Settings</h2>
                  <p className="text-sm text-studio-muted">Choose Gemini model for spoken pacing polish.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  setKeySaveStatus("idle");
                  setKeyError("");
                }}
                className="studio-soft-chip-bg grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 text-studio-muted transition hover:border-studio-accent hover:text-studio-text"
                aria-label="Open Gemini API settings"
                title="Gemini API settings"
              >
                <Settings size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="studio-soft-chip-bg flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-studio-muted">
                  <KeyRound size={15} />
                  Gemini API
                </span>
                <span className={geminiConfigured ? "font-semibold text-emerald-800" : "font-semibold text-amber-700"}>
                  {geminiConfigured ? `Configured ${maskedGeminiKey}` : "Not configured"}
                </span>
              </div>

              <label className="grid gap-2 text-sm font-medium text-studio-muted">
                Gemini model
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value as GeminiRewriteModel)}
                  className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent"
                >
                  {GEMINI_REWRITE_MODELS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-control-bg flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm font-medium text-studio-muted">
                <span>Keep Burmese language</span>
                <input
                  type="checkbox"
                  checked={keepBurmese}
                  onChange={(event) => setKeepBurmese(event.target.checked)}
                  className="h-4 w-4 accent-studio-accent"
                />
              </label>

              <button
                type="button"
                disabled={Boolean(scriptError) || status === "rewriting"}
                onClick={rewriteScript}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.6rem] bg-studio-accent px-5 py-4 font-semibold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-studio-border disabled:text-studio-muted disabled:shadow-none"
              >
                {status === "rewriting" ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {status === "rewriting" ? "Rewriting..." : "Rewrite Narration"}
              </button>
            </div>
          </section>

          <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
                  {status === "rewriting" ? <Loader2 size={19} className="animate-spin" /> : <CheckCircle2 size={19} />}
                </div>
                <h2 className="text-lg font-semibold text-studio-text">Rewrite Status</h2>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  status === "completed"
                    ? "bg-emerald-400/15 text-emerald-800"
                    : status === "failed"
                      ? "bg-red-400/15 text-red-700"
                      : "bg-studio-border text-studio-muted"
                }`}
              >
                {statusLabels[status]}
              </span>
            </div>
            <p className="mt-3 text-sm text-studio-muted">
              {status === "idle" && "Waiting for a valid script."}
              {status === "rewriting" && "Sending the script to Gemini for narration rewrite."}
              {status === "completed" &&
                (syncStatus === "synced"
                  ? "Rewrite is synced. Open Voice Over to generate audio from the same script."
                  : syncStatus === "syncing"
                    ? "Rewrite is ready and syncing into Voice Over."
                    : "Rewrite is ready. Review it, then open Voice Over.")}
              {status === "failed" && (error || "Rewrite failed.")}
            </p>
          </section>
        </aside>

        <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
                <Sparkles size={19} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-studio-text">Narration Rewrite</h2>
                <p className="text-sm text-studio-muted">
                  Edit here; the same script auto-syncs into Voice Over.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {rewrittenScript && (
                <span
                  className={`studio-soft-chip-bg inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold ${
                    syncStatus === "failed" ? "text-red-600" : "text-studio-muted"
                  }`}
                >
                  {syncStatus === "syncing"
                    ? "Syncing"
                    : syncStatus === "synced"
                      ? "Synced to Voice Over"
                      : syncStatus === "failed"
                        ? "Sync failed"
                        : "Ready"}
                </span>
              )}
              <button
                type="button"
                disabled={!rewrittenScript}
                onClick={copyRewrite}
                className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-studio-text transition hover:border-studio-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={15} />
                Copy
              </button>
              <button
                type="button"
                disabled={!rewrittenScript}
                onClick={useInVoiceOver}
                className="inline-flex items-center gap-2 rounded-full bg-studio-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-studio-border disabled:text-studio-muted"
              >
                <Send size={15} />
                Open Voice Over
              </button>
            </div>
          </div>

          <textarea
            value={rewrittenScript}
            onChange={(event) => setRewrittenScript(event.target.value)}
            placeholder="The rewritten narration script will appear here..."
            className="studio-control-bg min-h-80 w-full resize-y rounded-[1.8rem] border border-white/10 px-4 py-3 leading-7 text-studio-text outline-none transition placeholder:text-studio-muted/60 focus:border-studio-accent"
          />
        </section>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="gemini-settings-title"
            className="studio-card-bg w-full max-w-lg rounded-[2rem] border border-white/10 p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
                  <KeyRound size={19} />
                </div>
                <div>
                  <h2 id="gemini-settings-title" className="text-lg font-semibold text-studio-text">
                    Gemini API Key
                  </h2>
                  <p className="text-sm text-studio-muted">Saved locally in `.env.local` as `GEMINI_API_KEY`.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="studio-soft-chip-bg grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-studio-muted transition hover:text-studio-text"
                aria-label="Close Gemini settings"
              >
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-4">
              <div className="studio-soft-chip-bg rounded-2xl border border-white/10 px-3 py-2 text-sm text-studio-muted">
                Current status:{" "}
                <span className={geminiConfigured ? "font-semibold text-emerald-800" : "font-semibold text-amber-700"}>
                  {geminiConfigured ? `Configured ${maskedGeminiKey}` : "Not configured"}
                </span>
              </div>

              <label className="grid gap-2 text-sm font-medium text-studio-muted">
                API key
                <input
                  id="gemini-api-key"
                  type="password"
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                  placeholder="Paste your Gemini API key"
                  className="studio-control-bg rounded-2xl border border-white/10 px-4 py-3 text-studio-text outline-none transition focus:border-studio-accent"
                />
              </label>

              <p className="text-xs leading-5 text-studio-muted">
                The key is stored only on this machine. Do not commit `.env.local`.
              </p>

              {keyError && <p className="text-sm font-medium text-red-600">{keyError}</p>}

              <button
                type="button"
                disabled={!geminiApiKey.trim() || keySaveStatus === "saving"}
                onClick={saveGeminiApiKey}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[1.4rem] bg-studio-accent px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-studio-border disabled:text-studio-muted disabled:shadow-none"
              >
                {keySaveStatus === "saving" ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
                {keySaveStatus === "saved" ? "Saved" : keySaveStatus === "saving" ? "Saving..." : "Save API Key"}
              </button>
            </div>
          </section>
        </div>
      )}
    </StudioPageShell>
  );
}
