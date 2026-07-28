import { localIsoString } from "@/lib/file-utils";
import { detectScriptLanguage } from "@/lib/language-utils";
import { normalizeBurmeseScript } from "@/lib/burmese-normalizer";
import { preflightProvider } from "@/lib/provider-capabilities";
import { getProvider } from "@/lib/providers";
import { RemoteProviderError } from "@/lib/providers/hf-utils";
import { createJobId, saveJob } from "@/lib/storage/job-store";
import { readBurmeseLexicon } from "@/lib/storage/burmese-lexicon-store";
import { saveScript } from "@/lib/storage/script-store";
import { getVoiceProfile } from "@/lib/storage/voice-profile-store";
import type { GenerateVoiceRequest, GenerateVoiceResult, JobRecord, ProviderPreflightResult } from "@/lib/types";

export class ProviderPreflightError extends Error {
  constructor(public preflight: ProviderPreflightResult) {
    super(preflight.message);
    this.name = "ProviderPreflightError";
  }
}

export interface GenerationStarted {
  jobId: string;
  scriptId: string;
  status: "generating";
  provider: GenerateVoiceRequest["provider"];
  format: GenerateVoiceRequest["format"];
  createdAt: string;
}

function providerErrorMessage(error: unknown) {
  if (error instanceof RemoteProviderError) return error.publicMessage;
  if (error instanceof Error) return error.message;
  return "Audio generation failed";
}

function formatJobContent(providerName: string, audio: GenerateVoiceResult) {
  const metadata = audio.metadata ? `\nMetadata: ${JSON.stringify(audio.metadata)}` : "";
  return `Generated voice metadata.\n\nProvider: ${providerName}\nFormat: ${audio.format}\nAudio file: ${audio.filename}${metadata}`;
}

// The job fields shared across every save for one generation; status/content are added per save.
type BaseJob = Omit<JobRecord, "status" | "content" | "createdAt"> & { createdAt: string };

type GenerationContext = {
  baseJob: BaseJob;
  effectiveInput: GenerateVoiceRequest;
  scriptId: string;
  title: string;
};

// Runs the long multi-chunk generation in the background after the request has returned the
// jobId. Progress is written to the job record (polled by the client); it never throws — any
// failure is recorded on the job so a long script can't surface as a dropped HTTP request.
async function runGeneration({ baseJob, effectiveInput, scriptId, title }: GenerationContext) {
  try {
    const provider = getProvider(effectiveInput.provider);
    const audio = await provider.generate({
      ...effectiveInput,
      jobId: baseJob.id,
      scriptId,
      title,
      onProgress: async (progress) => {
        await saveJob({
          ...baseJob,
          status: "generating",
          ...progress,
          progressMessage: progress.message,
          content: progress.message
        });
      }
    });

    await saveJob({
      ...baseJob,
      format: audio.format,
      status: "completed",
      audioFile: audio.filename,
      rawAudioFile: audio.rawAudioFile,
      content: formatJobContent(provider.name, audio)
    });
  } catch (error) {
    await saveJob({
      ...baseJob,
      status: "failed",
      error: providerErrorMessage(error),
      content: "Generation failed before audio output was created."
    }).catch(() => undefined);
  }
}

export async function startVoiceGeneration(input: GenerateVoiceRequest): Promise<GenerationStarted> {
  let effectiveInput = { ...input };
  if (input.voiceProfileId) {
    const saved = await getVoiceProfile(input.voiceProfileId);
    effectiveInput = {
      ...effectiveInput,
      referenceAudio: effectiveInput.referenceAudio || saved.referenceAudio,
      referenceText: effectiveInput.referenceText || saved.profile.referenceText,
      referenceQualityReport: effectiveInput.referenceQualityReport || saved.profile.qualityReport
    };
  }
  // Burmese scripts get the production QA layer (pronunciation normalization + approval gate +
  // reference-quality block) automatically — keyed on the detected language, not a provider.
  const isBurmeseScript = detectScriptLanguage(effectiveInput.script).code === "my";

  if (isBurmeseScript && effectiveInput.referenceQualityReport?.status === "block") {
    throw new RemoteProviderError("Blocked reference audio", {
      publicMessage: "Reference audio quality is blocked. Upload a cleaner voice sample."
    });
  }

  let normalizationChanges = 0;
  if (isBurmeseScript) {
    const lexicon = await readBurmeseLexicon();
    const normalized = normalizeBurmeseScript(effectiveInput.script, lexicon.entries, lexicon.revision);
    if (
      !effectiveInput.normalizationApproved ||
      effectiveInput.lexiconRevision !== lexicon.revision ||
      effectiveInput.approvedNormalizedScript !== normalized.normalizedScript
    ) {
      throw new RemoteProviderError("Burmese normalization approval required", {
        publicMessage: "Burmese pronunciation preview changed. Review and approve it before generation."
      });
    }
    normalizationChanges = normalized.changes.length;
    effectiveInput = { ...effectiveInput, script: normalized.normalizedScript };
  }

  const preflight = preflightProvider(effectiveInput);
  if (!preflight.ok) {
    throw new ProviderPreflightError(preflight);
  }

  const scriptRecord = await saveScript({ title: effectiveInput.title, script: effectiveInput.script });
  const jobId = createJobId();
  const createdAt = localIsoString();
  const baseJob = {
    id: jobId,
    scriptId: scriptRecord.id,
    title: scriptRecord.title,
    provider: effectiveInput.provider,
    format: effectiveInput.format,
    speed: effectiveInput.speed,
    narrationStyle: effectiveInput.narrationStyle,
    emotion: effectiveInput.emotion,
    emotionIntensity: effectiveInput.emotionIntensity,
    voiceProfileId: effectiveInput.voiceProfileId,
    lexiconRevision: effectiveInput.lexiconRevision,
    normalizationChanges,
    referenceQualityScore: effectiveInput.referenceQualityReport?.score,
    referenceTranscriptUsed: Boolean(effectiveInput.referenceText?.trim()),
    createdAt
  };

  await saveJob({
    ...baseJob,
    status: "generating",
    completedChunks: 0,
    totalChunks: 0,
    progressMessage: "Preparing audio generation.",
    content: "Generation is in progress."
  });

  // Fire-and-forget: the job record is the source of truth from here. The client polls it for
  // live progress and the final result, so a long multi-chunk generation no longer depends on a
  // single long-lived HTTP request staying open.
  void runGeneration({
    baseJob,
    effectiveInput,
    scriptId: scriptRecord.id,
    title: scriptRecord.title
  }).catch(() => undefined);

  return {
    jobId,
    scriptId: scriptRecord.id,
    status: "generating",
    provider: effectiveInput.provider,
    format: effectiveInput.format,
    createdAt
  };
}
