"use client";

import { Gauge, Mic2, Plus, RefreshCw, Save, Server, Settings, SlidersHorizontal, Trash2, UploadCloud, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { assessReferenceAudio } from "@/lib/reference-audio-quality";
import type { BurmeseLexiconEntry, CloneMode, NarrationStyle, ReferenceAudioPayload, ReferenceQualityReport, VoiceEmotion, VoiceProfileSummary, VoiceProvider } from "@/lib/types";

export type ProviderHealthStatus = "connected" | "timeout" | "rate_limited" | "unavailable" | "invalid_response";

export interface ProviderHealth {
  ok: boolean;
  status: ProviderHealthStatus;
  message: string;
  baseUrl?: string;
  latencyMs?: number;
  checkedAt?: string;
}

function isLocalUrl(url?: string) {
  return Boolean(url && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url));
}

interface VoiceSettingsProps {
  provider: VoiceProvider;
  voiceMode: "clone" | "design";
  onVoiceModeChange: (value: "clone" | "design") => void;
  voiceDescription: string;
  onVoiceDescriptionChange: (value: string) => void;
  speed: number;
  narrationStyle: NarrationStyle;
  emotion: VoiceEmotion;
  emotionIntensity: number;
  cloneMode: CloneMode;
  cloneStrength: number;
  inferenceTimesteps: number;
  denoiseReference: boolean;
  normalizeText: boolean;
  referenceAudio?: ReferenceAudioPayload;
  referenceText: string;
  referenceQualityReport?: ReferenceQualityReport;
  profiles: VoiceProfileSummary[];
  selectedProfileId?: string;
  referenceAudioError?: string;
  providerHealth?: ProviderHealth;
  providerHealthLoading?: boolean;
  onSpeedChange: (value: number) => void;
  onNarrationStyleChange: (value: NarrationStyle) => void;
  onEmotionChange: (value: VoiceEmotion) => void;
  onEmotionIntensityChange: (value: number) => void;
  onCloneModeChange: (value: CloneMode) => void;
  onCloneStrengthChange: (value: number) => void;
  onInferenceTimestepsChange: (value: number) => void;
  onDenoiseReferenceChange: (value: boolean) => void;
  onNormalizeTextChange: (value: boolean) => void;
  onReferenceAudioChange: (file: File | null) => void;
  onReferenceTextChange: (value: string) => void;
  onProfileSelect: (id: string) => void;
 onProfileSave: (name: string, consent: boolean) => void;
  onProfileDelete: () => void;
  dialogueMode: boolean;
  onDialogueModeChange: (value: boolean) => void;
  speakerAReferenceAudio?: ReferenceAudioPayload;
  speakerBReferenceAudio?: ReferenceAudioPayload;
  onSpeakerAReferenceAudioChange: (file: File | null) => void;
  onSpeakerBReferenceAudioChange: (file: File | null) => void;
  onLexiconSaved: () => void;
  onRefreshProviderHealth?: () => void;
}

const healthLabel: Record<ProviderHealthStatus, string> = {
  connected: "connected",
  timeout: "timeout",
  rate_limited: "rate limited",
  unavailable: "unavailable",
  invalid_response: "invalid response"
};

const healthClassName: Record<ProviderHealthStatus, string> = {
  connected: "border-emerald-300/45 bg-emerald-400/10 text-emerald-800",
  timeout: "border-amber-300/45 bg-amber-400/10 text-amber-800",
  rate_limited: "border-amber-300/45 bg-amber-400/10 text-amber-800",
  unavailable: "border-red-300/50 bg-red-400/10 text-red-700",
  invalid_response: "border-red-300/50 bg-red-400/10 text-red-700"
};

export function VoiceSettings({
  provider,
  voiceMode,
  onVoiceModeChange,
  voiceDescription,
  onVoiceDescriptionChange,
  speed,
  narrationStyle,
  emotion,
  emotionIntensity,
  cloneMode,
  cloneStrength,
  denoiseReference,
  normalizeText,
  referenceAudio,
  referenceText,
  referenceQualityReport,
  profiles,
  selectedProfileId,
  referenceAudioError,
  providerHealth,
  providerHealthLoading = false,
  onSpeedChange,
  onNarrationStyleChange,
  onEmotionChange,
  onEmotionIntensityChange,
  onCloneModeChange,
  onCloneStrengthChange,
  inferenceTimesteps,
  onInferenceTimestepsChange,
  onDenoiseReferenceChange,
  onNormalizeTextChange,
  onReferenceAudioChange,
  onReferenceTextChange,
  onProfileSelect,
  onProfileSave,
  onProfileDelete,
  dialogueMode,
  onDialogueModeChange,
  speakerAReferenceAudio,
  speakerBReferenceAudio,
  onSpeakerAReferenceAudioChange,
  onSpeakerBReferenceAudioChange,
  onLexiconSaved,
  onRefreshProviderHealth
}: VoiceSettingsProps) {
  const referenceAssessment = assessReferenceAudio(referenceAudio);
  const isCloneProvider = provider === "voxcpm2";
  // Voice Design (no reference audio) only works on the local server — the public HF Space's
  // Gradio app requires a reference. Gate the Design toggle by the checked endpoint, and if the
  // user is somehow in Design mode against a non-local endpoint, flip them back to Clone.
  const canDesign = isCloneProvider && isLocalUrl(providerHealth?.baseUrl);
  useEffect(() => {
    if (!canDesign && voiceMode === "design") onVoiceModeChange("clone");
  }, [canDesign, voiceMode, onVoiceModeChange]);
  const [profileName, setProfileName] = useState("");
  const [profileConsent, setProfileConsent] = useState(false);
  const [lexiconOpen, setLexiconOpen] = useState(false);
  const [lexiconEntries, setLexiconEntries] = useState<BurmeseLexiconEntry[]>([]);
  const [lexiconError, setLexiconError] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [endpointSaving, setEndpointSaving] = useState(false);
  const [endpointNote, setEndpointNote] = useState("");
  const [localStatus, setLocalStatus] = useState({ configured: false, running: false, reachable: false });

  const refreshLocalStatus = () =>
    fetch("/api/voxcpm-local", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setLocalStatus(data))
      .catch(() => undefined);

  useEffect(() => {
    void fetch("/api/settings/voxcpm2-endpoint", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setEndpoint(data.baseUrl || ""))
      .catch(() => undefined);
    void refreshLocalStatus();
  }, []);

  async function saveEndpoint(url: string) {
    setEndpointSaving(true);
    setEndpointNote("");
    try {
      const response = await fetch("/api/settings/voxcpm2-endpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url })
      });
      const data = await response.json();
      if (!response.ok) {
        setEndpointNote(data.error || "Could not save the endpoint.");
        return;
      }
      if (data.baseUrl) setEndpoint(data.baseUrl);
      setEndpointNote(`Saved. Checking ${data.baseUrl} …`);
      onRefreshProviderHealth?.();
      await refreshLocalStatus();
    } finally {
      setEndpointSaving(false);
    }
  }

  async function startLocal() {
    setEndpointSaving(true);
    setEndpointNote("");
    try {
      const response = await fetch("/api/voxcpm-local", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setEndpointNote(data.error || "Could not start local VoxCPM.");
        return;
      }
      setEndpoint("http://localhost:7860");
      setEndpointNote(
        data.alreadyRunning
          ? "Local VoxCPM is already up — click Save & check."
          : "Starting locally. First run downloads the model (minutes). Click Save & check when it's ready."
      );
      await refreshLocalStatus();
    } finally {
      setEndpointSaving(false);
    }
  }

  async function stopLocal() {
    setEndpointSaving(true);
    try {
      await fetch("/api/voxcpm-local", { method: "DELETE" });
      setEndpointNote("Local VoxCPM stopped.");
      await refreshLocalStatus();
    } finally {
      setEndpointSaving(false);
    }
  }

  useEffect(() => {
    if (!lexiconOpen) return;
    void fetch("/api/settings/burmese-lexicon", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setLexiconEntries(data.entries || []))
      .catch(() => setLexiconError("Could not load the Burmese lexicon."));
  }, [lexiconOpen]);

  async function saveLexicon() {
    setLexiconError("");
    const response = await fetch("/api/settings/burmese-lexicon", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: lexiconEntries })
    });
    const data = await response.json();
    if (!response.ok) {
      setLexiconError(data.error || "Could not save the Burmese lexicon.");
      return;
    }
    setLexiconOpen(false);
    onLexiconSaved();
  }

  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
          <SlidersHorizontal size={19} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-studio-text">Voice Settings</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-4">
        {/* <div className="grid gap-2 text-sm font-medium text-studio-muted">
          Engine
          <div className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text">
            VoxCPM2 Multilingual
            <span className="ml-2 text-xs font-normal text-studio-muted">Burmese pronunciation QA applies automatically</span>
          </div>
        </div> */}

        {isCloneProvider && (
          <div className="studio-nested-card-bg grid gap-3 rounded-[1.8rem] border border-white/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-studio-accent/30 bg-studio-accent/10 px-3 py-1 text-xs font-semibold text-emerald-800">
                <Mic2 size={13} /> VoxCPM2 multilingual inference
              </span>
              <span className="rounded-full border border-amber-300/45 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-700">
                Public shared inference may be slow
              </span>
            </div>

            <div className="studio-control-bg grid gap-2 rounded-2xl border border-white/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-studio-text">
                  <Server size={15} /> VoxCPM endpoint
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${providerHealth
                        ? healthClassName[providerHealth.status]
                        : "border-slate-300 bg-slate-100 text-slate-600"
                      }`}
                  >
                    {providerHealthLoading
                      ? "Checking..."
                      : providerHealth
                        ? `${isLocalUrl(providerHealth.baseUrl) ? "Local" : "HF"} ${healthLabel[providerHealth.status]}`
                        : "Not checked"}
                  </span>
                  {onRefreshProviderHealth && (
                    <button
                      type="button"
                      onClick={onRefreshProviderHealth}
                      disabled={providerHealthLoading}
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/35 text-studio-muted transition hover:text-studio-text disabled:opacity-50"
                      aria-label="Refresh VoxCPM2 backend health"
                    >
                      <RefreshCw size={14} className={providerHealthLoading ? "animate-spin" : ""} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-studio-muted">
                {providerHealth?.message || "Checks the selected VoxCPM endpoint before remote generation."}
                {providerHealth?.latencyMs !== undefined && providerHealth.latencyMs > 0
                  ? ` ${providerHealth.latencyMs}ms.`
                  : ""}
              </p>
              <input
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="https://...hf.space or http://localhost:7860"
                className="rounded-xl border border-studio-border bg-white/60 px-3 py-2 text-xs text-studio-text outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setEndpoint("https://openbmb-voxcpm-demo.hf.space")} className="studio-soft-chip-bg rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-studio-text">HF Space</button>
                <button type="button" onClick={() => setEndpoint("http://localhost:7860")} className="studio-soft-chip-bg rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-studio-text">Local</button>
                <button type="button" disabled={endpointSaving || !endpoint.trim()} onClick={() => void saveEndpoint(endpoint)} className="rounded-full bg-studio-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-45">
                  {endpointSaving ? "Saving..." : "Save & check"}
                </button>
              </div>
              {localStatus.configured && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-studio-muted">
                    Local server: {localStatus.reachable ? "running" : localStatus.running ? "starting…" : "stopped"}
                  </span>
                  <button type="button" disabled={endpointSaving || localStatus.reachable || localStatus.running} onClick={() => void startLocal()} className="studio-soft-chip-bg rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-studio-text disabled:opacity-45">Start</button>
                  <button type="button" disabled={endpointSaving || !localStatus.running} onClick={() => void stopLocal()} className="studio-soft-chip-bg rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-studio-text disabled:opacity-45">Stop</button>
                </div>
              )}
              {endpointNote && <p className="text-xs leading-5 text-studio-muted">{endpointNote}</p>}
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => onVoiceModeChange("clone")} className={`flex-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${voiceMode === "clone" ? "border-studio-accent bg-studio-accent/10 text-emerald-800" : "border-white/10 text-studio-muted"}`}>Clone a voice</button>
              <button
                type="button"
                disabled={!canDesign}
                onClick={() => canDesign && onVoiceModeChange("design")}
                title={canDesign ? "" : "Voice Design needs the local VoxCPM2 server (it accepts no reference audio). Start the local server or switch the endpoint to Local."}
                className={`flex-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${voiceMode === "design" ? "border-studio-accent bg-studio-accent/10 text-emerald-800" : "border-white/10 text-studio-muted"} disabled:opacity-40 disabled:cursor-not-allowed`}
              >Design a voice</button>
            </div>
            {!canDesign && voiceMode === "design" && (
              <p className="text-xs text-amber-700">Voice Design needs the local VoxCPM2 server. Switch to Clone, or start the local server / point the endpoint at Local.</p>
            )}
            {!canDesign && voiceMode !== "design" && (
              <p className="text-xs text-studio-muted">Voice Design is available on the local server only.</p>
            )}

            {voiceMode === "design" && (
              <label className="grid gap-2 text-sm font-medium text-studio-muted">
                Voice description
                <textarea value={voiceDescription} onChange={(event) => onVoiceDescriptionChange(event.target.value)} maxLength={500} placeholder="A calm young man, warm tone, slightly slow…" className="studio-control-bg min-h-24 rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent" />
                <span className="text-xs font-normal text-studio-muted">No reference needed — VoxCPM2 creates a new voice from this description.</span>
              </label>
            )}

            {voiceMode === "clone" && (<>
            <label className="studio-control-bg flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm font-medium text-studio-muted">
              <span>
                Dialogue mode (2 characters)
                <span className="block text-xs font-normal text-studio-muted">Tag lines in the script with [A]: and [B]: — each speaker uses its own reference voice below. Untagged lines use the main reference audio as narrator.</span>
              </span>
              <input
                type="checkbox"
                checked={dialogueMode}
                onChange={(event) => onDialogueModeChange(event.target.checked)}
                className="h-4 w-4 accent-studio-accent"
              />
            </label>

            {dialogueMode && (
              <div className="studio-control-bg grid gap-3 rounded-2xl border border-white/10 p-3">
                <label className="grid gap-2 text-sm font-medium text-studio-muted">
                  <span className="inline-flex items-center gap-2"><UploadCloud size={15} /> Speaker A reference audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) => onSpeakerAReferenceAudioChange(event.target.files?.[0] || null)}
                    className="studio-control-bg block w-full rounded-2xl border border-white/10 px-3 py-3 text-sm text-studio-text file:mr-3 file:rounded-xl file:border-0 file:bg-studio-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
                  />
                  <span className="text-xs text-studio-muted">
                    {speakerAReferenceAudio ? `${speakerAReferenceAudio.filename} (${Math.ceil(speakerAReferenceAudio.size / 1024)} KB)` : "Upload a reference clip for Speaker A."}
                  </span>
                </label>
                <label className="grid gap-2 text-sm font-medium text-studio-muted">
                  <span className="inline-flex items-center gap-2"><UploadCloud size={15} /> Speaker B reference audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) => onSpeakerBReferenceAudioChange(event.target.files?.[0] || null)}
                    className="studio-control-bg block w-full rounded-2xl border border-white/10 px-3 py-3 text-sm text-studio-text file:mr-3 file:rounded-xl file:border-0 file:bg-studio-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
                  />
                  <span className="text-xs text-studio-muted">
                    {speakerBReferenceAudio ? `${speakerBReferenceAudio.filename} (${Math.ceil(speakerBReferenceAudio.size / 1024)} KB)` : "Upload a reference clip for Speaker B."}
                  </span>
                </label>
              </div>
            )}

            <label className="grid gap-2 text-sm font-medium text-studio-muted">
              Saved voice profile
              <select value={selectedProfileId || ""} onChange={(event) => onProfileSelect(event.target.value)} className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent">
                <option value="">Use a new upload</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium text-studio-muted">
              <span className="inline-flex items-center gap-2"><UploadCloud size={15} /> Reference audio</span>
              <input
                type="file"
                accept="audio/*"
                onChange={(event) => onReferenceAudioChange(event.target.files?.[0] || null)}
                className="studio-control-bg block w-full rounded-2xl border border-white/10 px-3 py-3 text-sm text-studio-text file:mr-3 file:rounded-xl file:border-0 file:bg-studio-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
              />
            </label>
            <p className={referenceAudioError ? "text-sm text-red-600" : "text-sm text-studio-muted"}>
              {referenceAudioError ||
                (referenceAudio
                  ? `${referenceAudio.filename} (${Math.ceil(referenceAudio.size / 1024)} KB${referenceAudio.durationSeconds ? `, ${referenceAudio.durationSeconds.toFixed(1)}s` : ""
                  })`
                  : selectedProfileId
                    ? "Saved local voice profile selected."
                    : "Upload a clean voice reference for VoxCPM2 cloning.")}
            </p>

            {(referenceAudio || selectedProfileId) && (
              <div className="studio-control-bg grid gap-2 rounded-2xl border border-white/10 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2 font-medium text-studio-muted"><Gauge size={15} /> Reference quality</span>
                  <span className="font-semibold text-studio-text">{referenceQualityReport?.score ?? referenceAssessment.score}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-studio-border">
                  <div className="h-full rounded-full bg-studio-accent" style={{ width: `${referenceQualityReport?.score ?? referenceAssessment.score}%` }} />
                </div>
                <p className="text-xs text-studio-muted">
                  {referenceQualityReport ? `${referenceQualityReport.status.toUpperCase()} · ${referenceQualityReport.issues.join(" ") || "Clean reference audio."}` : referenceAssessment.message}
                </p>
              </div>
            )}

            <label className="grid gap-2 text-sm font-medium text-studio-muted">
              Reference transcript <span className="font-normal text-studio-muted">(optional)</span>
              <textarea value={referenceText} onChange={(event) => onReferenceTextChange(event.target.value)} maxLength={2000} placeholder="Optional notes — not required to generate..." className="studio-control-bg min-h-24 rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent" />
              <span className="text-xs leading-5">Optional. Cloning uses the reference audio only — you don&apos;t need to type the transcript, and it is not sent to the model.</span>
            </label>

            {referenceAudio && !selectedProfileId && (
              <div className="studio-control-bg grid gap-2 rounded-2xl border border-white/10 p-3">
                <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Optional local profile name" className="rounded-xl border border-studio-border bg-white/60 px-3 py-2 text-sm text-studio-text outline-none" />
                <label className="flex items-start gap-2 text-xs leading-5 text-studio-muted">
                  <input type="checkbox" checked={profileConsent} onChange={(event) => setProfileConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-studio-accent" />
                  Save this consented voice sample and transcript on this device for repeated use.
                </label>
                <button type="button" disabled={!profileName.trim() || !profileConsent || referenceQualityReport?.status === "block"} onClick={() => onProfileSave(profileName, profileConsent)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-studio-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-45">
                  <Save size={15} /> Save Local Profile
                </button>
              </div>
            )}
            {selectedProfileId && (
              <button type="button" onClick={onProfileDelete} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-600">
                <Trash2 size={15} /> Delete Selected Profile
              </button>
            )}
            </>)}
          </div>
        )}

        {isCloneProvider && (
          <details className="studio-nested-card-bg rounded-[1.8rem] border border-white/10 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-studio-text">Advanced tuning</summary>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-studio-muted">
                <span className="inline-flex items-center gap-2"><Wand2 size={15} /> Clone mode</span>
                <select
                  value={cloneMode}
                  onChange={(event) => onCloneModeChange(event.target.value as CloneMode)}
                  className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent"
                >
                  <option value="high_fidelity">high fidelity</option>
                  <option value="balanced">balanced</option>
                </select>
              </label>

              <label className="grid gap-3 text-sm font-medium text-studio-muted">
                <span className="flex justify-between">
                  Clone strength <span className="text-studio-text">{cloneStrength.toFixed(1)}</span>
                </span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={cloneStrength}
                  onChange={(event) => onCloneStrengthChange(Number(event.target.value))}
                  className="accent-studio-accent"
                />
              </label>

              <label className="grid gap-3 text-sm font-medium text-studio-muted">
                <span className="flex justify-between">
                  Quality steps <span className="text-studio-text">{inferenceTimesteps}</span>
                </span>
                <input
                  type="range"
                  min="4"
                  max="50"
                  step="1"
                  value={inferenceTimesteps}
                  onChange={(event) => onInferenceTimestepsChange(Number(event.target.value))}
                  className="accent-studio-accent"
                />
                <span className="text-xs font-normal text-studio-muted">Higher = better quality, slower. Local server only (ignored on HF Space).</span>
              </label>

              <div className="grid gap-3 text-sm text-studio-muted">
                <label className="studio-control-bg flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2">
                  <span>Reference denoise</span>
                  <input
                    type="checkbox"
                    checked={denoiseReference}
                    onChange={(event) => onDenoiseReferenceChange(event.target.checked)}
                    className="h-4 w-4 accent-studio-accent"
                  />
                </label>
                <label className="studio-control-bg flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2">
                  <span>Text normalization</span>
                  <input
                    type="checkbox"
                    checked={normalizeText}
                    onChange={(event) => onNormalizeTextChange(event.target.checked)}
                    className="h-4 w-4 accent-studio-accent"
                  />
                </label>
                <label className="grid gap-3 text-sm font-medium text-studio-muted px-3 py-2">
                  <span className="flex justify-between">
                    Speed <span className="text-studio-text">{speed.toFixed(1)}x</span>
                  </span>
                  <input
                    type="range"
                    min="0.8"
                    max="1.2"
                    step="0.1"
                    value={speed}
                    onChange={(event) => onSpeedChange(Number(event.target.value))}
                    className="accent-studio-accent"
                  />
                  <span className="text-xs leading-5">Public VoxCPM2 uses this as pace guidance, not an exact playback-speed transform.</span>
                </label>
              </div>
            </div>
          </details>
        )}



        <div className="studio-nested-card-bg grid gap-4 rounded-[1.8rem] border border-white/10 p-4">
          <div>
            <h3 className="text-sm font-semibold text-studio-text">Performance direction</h3>
            <p className="mt-1 text-xs leading-5 text-studio-muted">Applied consistently to every automatic chunk before the final WAV is merged.</p>
          </div>

          <label className="grid gap-2 text-sm font-medium text-studio-muted">
            Narration style
            <select
              value={narrationStyle}
              onChange={(event) => onNarrationStyleChange(event.target.value as NarrationStyle)}
              className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent"
            >
              <option value="professional">Professional broadcast</option>
              <option value="movie_recap">Movie recap</option>
              <option value="cinematic">Cinematic storyteller</option>
              <option value="documentary">Premium documentary</option>
              <option value="conversational">Conversational</option>
            </select>
            <span className="text-xs font-normal leading-5 text-studio-muted">
              {narrationStyle === "movie_recap"
                ? "Hook-driven pacing, suspenseful transitions and stronger plot-turn emphasis."
                : narrationStyle === "professional"
                  ? "Clean diction, controlled breathing and consistent studio delivery."
                  : narrationStyle === "cinematic"
                    ? "Immersive dramatic arc with deliberate pauses and expressive phrasing."
                    : narrationStyle === "documentary"
                      ? "Authoritative, thoughtful and precisely paced narration."
                      : "Natural, intimate storytelling with relaxed phrasing."}
            </span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-studio-muted">
            Emotion
            <select
              value={emotion}
              onChange={(event) => onEmotionChange(event.target.value as VoiceEmotion)}
              className="studio-control-bg rounded-2xl border border-white/10 px-3 py-3 text-studio-text outline-none focus:border-studio-accent"
            >
              <option value="neutral">Neutral</option>
              <option value="calm">Calm</option>
              <option value="warm">Warm</option>
              <option value="hopeful">Hopeful</option>
              <option value="sad">Sad / reflective</option>
              <option value="tense">Tense / suspenseful</option>
              <option value="excited">Excited</option>
              <option value="energetic">Energetic</option>
              <option value="dramatic">Dramatic</option>
            </select>
          </label>

          <label className="grid gap-3 text-sm font-medium text-studio-muted">
            <span className="flex justify-between gap-3">
              Emotion intensity <span className="text-studio-text">{emotionIntensity}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={emotionIntensity}
              onChange={(event) => onEmotionIntensityChange(Number(event.target.value))}
              className="accent-studio-accent"
            />
            <span className="text-xs font-normal leading-5 text-studio-muted">60–80% is usually expressive without becoming theatrical. Use 85%+ for trailers and intense recaps.</span>
          </label>
        </div>
      </div>

      <button type="button" onClick={() => setLexiconOpen(true)} className="studio-soft-chip-bg mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-studio-text">
        <Settings size={14} /> Burmese Pronunciation Lexicon
      </button>

      {lexiconOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" className="studio-card-bg max-h-[85vh] w-full max-w-2xl overflow-auto rounded-[2rem] border border-white/10 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-studio-text">Burmese Pronunciation Lexicon</h2><p className="text-sm text-studio-muted">Local replacements for names, brands, and loanwords.</p></div>
              <button type="button" onClick={() => setLexiconOpen(false)} aria-label="Close lexicon" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-studio-muted"><X size={16} /></button>
            </div>
            <div className="grid gap-2">
              {lexiconEntries.map((entry, index) => (
                <div key={`${entry.source}-${index}`} className="studio-control-bg grid gap-2 rounded-2xl border border-white/10 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input value={entry.source} onChange={(event) => setLexiconEntries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value } : item))} placeholder="Source" className="rounded-xl border border-studio-border px-2 py-2 text-sm" />
                  <input value={entry.spoken} onChange={(event) => setLexiconEntries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, spoken: event.target.value } : item))} placeholder="Spoken form" className="rounded-xl border border-studio-border px-2 py-2 text-sm" />
                  <input value={entry.note || ""} onChange={(event) => setLexiconEntries((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, note: event.target.value } : item))} placeholder="Note" className="rounded-xl border border-studio-border px-2 py-2 text-sm" />
                  <button type="button" onClick={() => setLexiconEntries((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label="Delete lexicon entry" className="grid h-9 w-9 place-items-center rounded-xl border border-red-200 text-red-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => setLexiconEntries((items) => [...items, { source: "", spoken: "", note: "" }])} className="inline-flex items-center gap-2 rounded-xl border border-studio-border px-3 py-2 text-sm font-semibold text-studio-text"><Plus size={15} /> Add Entry</button>
              <button type="button" onClick={() => void saveLexicon()} className="inline-flex items-center gap-2 rounded-xl bg-studio-accent px-4 py-2 text-sm font-semibold text-white"><Save size={15} /> Save Lexicon</button>
            </div>
            {lexiconError && <p className="mt-3 text-sm text-red-600">{lexiconError}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
