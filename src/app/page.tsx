"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, UploadCloud, WandSparkles } from "lucide-react";
import { AudioPreview } from "@/components/AudioPreview";
import { GenerateButton } from "@/components/GenerateButton";
import { ScriptInput } from "@/components/ScriptInput";
import { StatusPanel, type StudioStatus } from "@/components/StatusPanel";
import { StudioPageShell } from "@/components/StudioPageShell";
import { VoiceSettings, type ProviderHealth } from "@/components/VoiceSettings";
import { NormalizationApprovalPanel } from "@/components/NormalizationApprovalPanel";
import { analyzeReferenceAudio } from "@/lib/browser-reference-audio";
import { detectScriptLanguage } from "@/lib/language-utils";
import { preflightProvider } from "@/lib/provider-capabilities";
import { MAX_SCRIPT_CHARACTERS } from "@/lib/script-limits";
import type {
  CloneMode,
  NarrationStyle,
  ProviderPreflightResult,
  BurmeseNormalizationResult,
  ReferenceAudioPayload,
  ReferenceQualityReport,
  VoiceProfileSummary,
  VoiceEmotion,
  VoiceProvider
} from "@/lib/types";

interface AudioResult {
  audioUrl: string;
  filename: string;
  provider: string;
  createdAt: string;
}

interface VoiceOverDraft {
  title?: string;
  script?: string;
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [provider] = useState<VoiceProvider>("voxcpm2");
  const [speed, setSpeed] = useState(1);
  const [narrationStyle, setNarrationStyle] = useState<NarrationStyle>("movie_recap");
  const [emotion, setEmotion] = useState<VoiceEmotion>("dramatic");
  const [emotionIntensity, setEmotionIntensity] = useState(75);
  const [cloneMode, setCloneMode] = useState<CloneMode>("high_fidelity");
  // VoxCPM2's cfg_value sweet spot is ~2.0; higher over-adheres to the prompt and sounds more
  // robotic/over-articulated. Default to the model-recommended value; the slider still goes to 3.0.
  const [cloneStrength, setCloneStrength] = useState(2.0);
  // Diffusion sampling steps (local server only): higher = better quality, slower. Model default 10.
  const [inferenceTimesteps, setInferenceTimesteps] = useState(24);
  // Clone (from a reference clip) vs Design (create a new voice from a text description, no reference).
  const [voiceMode, setVoiceMode] = useState<"clone" | "design">("clone");
  const [voiceDescription, setVoiceDescription] = useState("");
  const [denoiseReference, setDenoiseReference] = useState(false);
  const [normalizeText, setNormalizeText] = useState(true);
  const [dialogueMode, setDialogueMode] = useState(false);
  const [speakerAReferenceAudio, setSpeakerAReferenceAudio] = useState<ReferenceAudioPayload | undefined>();
  const [speakerBReferenceAudio, setSpeakerBReferenceAudio] = useState<ReferenceAudioPayload | undefined>();
  const [status, setStatus] = useState<StudioStatus>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ completed: number; total: number; message: string } | undefined>();
  const [audioResult, setAudioResult] = useState<AudioResult | undefined>();
  const [referenceAudio, setReferenceAudio] = useState<ReferenceAudioPayload | undefined>();
  const [referenceAudioError, setReferenceAudioError] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [referenceQualityReport, setReferenceQualityReport] = useState<ReferenceQualityReport | undefined>();
  const [profiles, setProfiles] = useState<VoiceProfileSummary[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [normalization, setNormalization] = useState<BurmeseNormalizationResult | undefined>();
  const [normalizationLoading, setNormalizationLoading] = useState(false);
  const [normalizationApproved, setNormalizationApproved] = useState(false);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | undefined>();
  const [providerHealthLoading, setProviderHealthLoading] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const loadedDraftRef = useRef(false);

  // Burmese scripts automatically get the production QA layer (pronunciation normalization +
  // approval gate). The trigger is the detected language, not a separate provider selection.
  const isBurmeseScript = useMemo(() => detectScriptLanguage(script).code === "my", [script]);

  useEffect(() => {
    async function loadDraft() {
      try {
        const response = await fetch("/api/drafts/voice-over", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { draft: VoiceOverDraft | null };
        if (!data.draft) return;
        if (data.draft.title) setTitle(data.draft.title);
        if (data.draft.script) setScript(data.draft.script);
        loadedDraftRef.current = true;
      } catch {
        // Draft transfer is optional; voice generation still works without it.
      } finally {
        setDraftReady(true);
      }
    }

    void loadDraft();
  }, []);

  const loadProfiles = useCallback(async () => {
    const response = await fetch("/api/voice-profiles", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { profiles: VoiceProfileSummary[] };
    setProfiles(data.profiles);
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const refreshNormalization = useCallback(async () => {
    if (detectScriptLanguage(script).code !== "my" || script.trim().length < 10) {
      setNormalization(undefined);
      setNormalizationApproved(false);
      return;
    }
    setNormalizationLoading(true);
    setNormalizationApproved(false);
    try {
      const response = await fetch("/api/burmese/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script })
      });
      if (!response.ok) throw new Error("Could not prepare Burmese pronunciation preview.");
      setNormalization((await response.json()) as BurmeseNormalizationResult);
    } catch {
      setNormalization(undefined);
    } finally {
      setNormalizationLoading(false);
    }
  }, [script]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshNormalization(), 450);
    return () => window.clearTimeout(timer);
  }, [refreshNormalization]);

  useEffect(() => {
    if (!draftReady) return;
    if (!script.trim()) {
      const timeout = window.setTimeout(() => {
        void fetch("/api/drafts/voice-over", { method: "DELETE" });
      }, 600);

      return () => window.clearTimeout(timeout);
    }
    if (script.trim().length < 10) return;

    const timeout = window.setTimeout(() => {
      void fetch("/api/drafts/voice-over", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          script
        })
      });
      loadedDraftRef.current = false;
    }, loadedDraftRef.current ? 1200 : 600);

    return () => window.clearTimeout(timeout);
  }, [draftReady, script, title]);

  const refreshProviderHealth = useCallback(async () => {
    setProviderHealthLoading(true);
    try {
      const response = await fetch("/api/providers/voxcpm2/health", { cache: "no-store" });
      const data = (await response.json()) as ProviderHealth;
      setProviderHealth(data);
    } catch {
      setProviderHealth({
        ok: false,
        status: "unavailable",
        message: "Could not reach the local VoxCPM2 health route.",
        checkedAt: new Date().toISOString()
      });
    } finally {
      setProviderHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProviderHealth();
  }, [refreshProviderHealth]);

  const scriptError = useMemo(() => {
    const trimmed = script.trim();
    if (!trimmed) return "Script is required.";
    if (trimmed.length < 10) return "Script must be at least 10 characters.";
    if (trimmed.length > MAX_SCRIPT_CHARACTERS) return `Script must be ${MAX_SCRIPT_CHARACTERS.toLocaleString()} characters or fewer.`;
    return "";
  }, [script]);

  async function handleReferenceAudioChange(file: File | null) {
    setSelectedProfileId("");
    setReferenceAudio(undefined);
    setReferenceQualityReport(undefined);
    setReferenceText("");
    setReferenceAudioError("");

    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setReferenceAudioError("Reference audio must be an audio file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setReferenceAudioError("Reference audio must be 10MB or smaller.");
      return;
    }

    try {
      const report = await analyzeReferenceAudio(file);

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read reference audio."));
        reader.readAsDataURL(file);
      });
  setReferenceAudio({
        dataUrl,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        durationSeconds: report.durationSeconds
      });
      setReferenceQualityReport(report);
    } catch (caught) {
      setReferenceAudioError(caught instanceof Error ? caught.message : "Could not read reference audio.");
    }
  }

  async function handleSpeakerReferenceAudioChange(speaker: "A" | "B", file: File | null) {
    const setter = speaker === "A" ? setSpeakerAReferenceAudio : setSpeakerBReferenceAudio;
    setter(undefined);
    if (!file) return;
    if (!file.type.startsWith("audio/")) return;

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read reference audio."));
        reader.readAsDataURL(file);
      });
      setter({ dataUrl, filename: file.name, mimeType: file.type, size: file.size });
    } catch {
      // Best-effort — dialogue speaker uploads don't have a dedicated error UI slot yet.
    }
  }

  function selectProfile(id: string) {
    setSelectedProfileId(id);
    setReferenceAudio(undefined);
    setReferenceAudioError("");
    const profile = profiles.find((item) => item.id === id);
    setReferenceText(profile?.referenceText || "");
    setReferenceQualityReport(profile?.qualityReport);
    if (profile) {
      setCloneMode(profile.preferredCloneMode);
      setCloneStrength(profile.preferredCloneStrength);
      setDenoiseReference(profile.preferredDenoiseReference);
      setNormalizeText(profile.preferredNormalizeText);
    }
  }

  async function saveProfile(name: string, consent: boolean) {
    if (!referenceAudio || !referenceQualityReport) return;
    const response = await fetch("/api/voice-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        consent,
        referenceAudio,
        referenceText,
        qualityReport: referenceQualityReport,
        preferredCloneMode: cloneMode,
        preferredCloneStrength: cloneStrength,
        preferredDenoiseReference: denoiseReference,
        preferredNormalizeText: normalizeText
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setReferenceAudioError(data.error || "Could not save local voice profile.");
      return;
    }
    const profile = data.profile as VoiceProfileSummary;
    setProfiles((items) => [profile, ...items.filter((item) => item.id !== profile.id)]);
    setSelectedProfileId(profile.id);
    setReferenceAudio(undefined);
  }

  async function deleteProfile() {
    if (!selectedProfileId || !window.confirm("Delete this local voice profile and its saved reference audio?")) return;
    await fetch(`/api/voice-profiles/${encodeURIComponent(selectedProfileId)}`, { method: "DELETE" });
    setSelectedProfileId("");
    setReferenceText("");
    setReferenceQualityReport(undefined);
    await loadProfiles();
  }

  async function generateAudio() {
    const preflight = preflightProvider({
      provider,
      script,
      referenceAudio: voiceMode === "design" ? undefined : referenceAudio,
      voiceProfileId: voiceMode === "design" ? undefined : selectedProfileId || undefined,
      referenceText,
      normalizationApproved,
      cloneMode,
      voiceDescription: voiceMode === "design" ? voiceDescription : undefined
    });
    if (scriptError || !preflight.ok) {
      setError(preflight.message);
      setStatus("failed");
      return;
    }
    setStatus("saving");
    setError("");
    setAudioResult(undefined);
    setProgress(undefined);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          script,
          provider,
          format: "wav",
          speed,
          narrationStyle,
          emotion,
          emotionIntensity,
          cloneMode,
          cloneStrength,
          inferenceTimesteps,
          denoiseReference,
          normalizeText,
          referenceAudio: voiceMode === "design" ? undefined : referenceAudio,
          referenceText,
          voiceDescription: voiceMode === "design" ? voiceDescription : undefined,
          voiceProfileId: voiceMode === "design" ? undefined : selectedProfileId || undefined,
        referenceQualityReport,
          approvedNormalizedScript: normalization?.normalizedScript,
          lexiconRevision: normalization?.lexiconRevision,
          normalizationApproved,
          dialogueMode,
          speakerAReferenceAudio: dialogueMode ? speakerAReferenceAudio : undefined,
          speakerBReferenceAudio: dialogueMode ? speakerBReferenceAudio : undefined
       })
       });
      const data = await response.json();

      if (!response.ok || data.status === "failed" || !data.jobId) {
        throw new Error(data.message || data.error || "Generation failed");
      }

      // Generation runs in the background; poll the job for live progress and the final audio so a
      // long, multi-chunk script isn't tied to one long-lived request.
      setStatus("generating");
      const jobId: string = data.jobId;
      const deadline = Date.now() + 40 * 60 * 1000;

      for (;;) {
        if (Date.now() > deadline) {
          throw new Error("Generation is taking unusually long. Check the History tab for this job.");
        }
        await new Promise((resolve) => setTimeout(resolve, 1300));

        let job: {
          status?: string;
          completedChunks?: number;
          totalChunks?: number;
          progressMessage?: string;
          audioUrl?: string;
          audioFile?: string;
          provider?: string;
          createdAt?: string;
          error?: string;
        };
        try {
          const poll = await fetch(`/api/history/${jobId}`, { cache: "no-store" });
          if (!poll.ok) continue;
          job = await poll.json();
        } catch {
          continue; // transient network hiccup — keep polling
        }

        if (typeof job.totalChunks === "number" && job.totalChunks > 0) {
          setProgress({ completed: job.completedChunks ?? 0, total: job.totalChunks, message: job.progressMessage ?? "" });
        }

        if (job.status === "completed" && job.audioUrl) {
          setAudioResult({
            audioUrl: job.audioUrl,
            filename: job.audioFile || "",
            provider: job.provider || provider,
            createdAt: job.createdAt || ""
          });
          setStatus("completed");
          setProgress(undefined);
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error || "Generation failed");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed");
      setStatus("failed");
      setProgress(undefined);
    }
  }

  const isGenerating = status === "saving" || status === "generating";
  const isDesign = voiceMode === "design";
  const referenceRequirementError = isDesign
    ? voiceDescription.trim()
      ? ""
      : "Describe the voice to design (e.g. a calm young man, warm tone)."
    : referenceAudioError ||
      (!referenceAudio && !selectedProfileId
        ? "VoxCPM2 requires reference audio for voice cloning."
        : referenceAudio?.durationSeconds && referenceAudio.durationSeconds < 3
          ? "Reference audio is too short. Use at least 3 seconds, ideally 6-15 seconds."
          : referenceAudio?.durationSeconds && referenceAudio.durationSeconds > 50
            ? "Reference audio is too long for VoxCPM2. Trim it to 6-30 seconds of clean speech."
            : "");
  const generateDisabled =
    Boolean(scriptError) ||
    isGenerating ||
    Boolean(referenceRequirementError) ||
    (isBurmeseScript && (referenceQualityReport?.status === "block" || !normalizationApproved));
  const activePreflight: ProviderPreflightResult = preflightProvider({
    provider,
    script,
    referenceAudio: isDesign ? undefined : referenceAudio,
    voiceProfileId: isDesign ? undefined : selectedProfileId || undefined,
    referenceText,
    normalizationApproved,
    cloneMode,
    voiceDescription: isDesign ? voiceDescription : undefined
  });
  const capabilityDisabled = !activePreflight.ok;
  const disabledReason =
    scriptError ||
    referenceRequirementError ||
    (referenceQualityReport?.status === "block" ? "Reference audio quality is blocked. Upload a cleaner voice sample." : "") ||
    (!activePreflight.ok ? activePreflight.message : "");

  const workflowSteps = [
    { label: "Script", helper: script.trim() ? "Ready" : "Paste text", icon: FileText, active: Boolean(script.trim()) },
    { label: "Voice", helper: referenceAudio || selectedProfileId ? "Ready" : "Add sample", icon: UploadCloud, active: Boolean(referenceAudio || selectedProfileId) },
    { label: "Generate", helper: status === "completed" ? "Done" : "Create audio", icon: WandSparkles, active: status === "completed" }
  ];
  const heroAside = (
    <div className="grid gap-3">
      <div className="studio-card-bg grid grid-cols-3 gap-2 rounded-[2.1rem] border border-white/10 p-2">
        {workflowSteps.map((step) => {
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
    </div>
  );

  return (
    <StudioPageShell
      activeTab="voiceover"
      badge="Local-first voice cloning"
      title="Voice Over"
      description="Paste Burmese script, add a clean voice reference, generate audio, then review everything locally."
      aside={heroAside}
    >
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="grid gap-5">
            <ScriptInput
              title={title}
              script={script}
              error={scriptError}
              onTitleChange={setTitle}
              onScriptChange={setScript}
            />
            {isBurmeseScript && (
              <NormalizationApprovalPanel result={normalization} loading={normalizationLoading} approved={normalizationApproved} onRefresh={() => void refreshNormalization()} onApprove={() => setNormalizationApproved(true)} />
            )}
          </div>

          <aside className="grid content-start gap-5">
            <VoiceSettings
              provider={provider}
              voiceMode={voiceMode}
              onVoiceModeChange={setVoiceMode}
              voiceDescription={voiceDescription}
              onVoiceDescriptionChange={setVoiceDescription}
              speed={speed}
              narrationStyle={narrationStyle}
              emotion={emotion}
              emotionIntensity={emotionIntensity}
              cloneMode={cloneMode}
              cloneStrength={cloneStrength}
              inferenceTimesteps={inferenceTimesteps}
              onInferenceTimestepsChange={setInferenceTimesteps}
              denoiseReference={denoiseReference}
              normalizeText={normalizeText}
              referenceAudio={referenceAudio}
              referenceText={referenceText}
              referenceQualityReport={referenceQualityReport}
              profiles={profiles}
              selectedProfileId={selectedProfileId}
              referenceAudioError={referenceRequirementError}
              providerHealth={providerHealth}
              providerHealthLoading={providerHealthLoading}
              onSpeedChange={setSpeed}
              onNarrationStyleChange={setNarrationStyle}
              onEmotionChange={setEmotion}
              onEmotionIntensityChange={setEmotionIntensity}
              onCloneModeChange={setCloneMode}
              onCloneStrengthChange={setCloneStrength}
              onDenoiseReferenceChange={setDenoiseReference}
              onNormalizeTextChange={setNormalizeText}
              onReferenceAudioChange={handleReferenceAudioChange}
              onReferenceTextChange={setReferenceText}
              onProfileSelect={selectProfile}
              onProfileSave={(name, consent) => void saveProfile(name, consent)}
              onProfileDelete={() => void deleteProfile()}
              dialogueMode={dialogueMode}
              onDialogueModeChange={setDialogueMode}
              speakerAReferenceAudio={speakerAReferenceAudio}
              speakerBReferenceAudio={speakerBReferenceAudio}
              onSpeakerAReferenceAudioChange={(file) => void handleSpeakerReferenceAudioChange("A", file)}
              onSpeakerBReferenceAudioChange={(file) => void handleSpeakerReferenceAudioChange("B", file)}
              onLexiconSaved={() => void refreshNormalization()}
              onRefreshProviderHealth={refreshProviderHealth}
            />
            <GenerateButton
              disabled={generateDisabled || capabilityDisabled}
              loading={isGenerating}
              disabledReason={disabledReason}
              onClick={generateAudio}
            />
            <StatusPanel status={status} error={error} completedChunks={progress?.completed} totalChunks={progress?.total} progressMessage={progress?.message} />
            <AudioPreview result={audioResult} />
          </aside>
        </div>
    </StudioPageShell>
  );
}
