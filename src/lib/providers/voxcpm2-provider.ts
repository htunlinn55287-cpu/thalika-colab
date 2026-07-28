import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  convertRemoteAudioToPcm24Wav,
  getPunctuationAwarePauseMilliseconds,
  matchChunkLoudness,
  mergeWavFiles,
  normalizeMasterPeak,
  pcm24DurationSeconds,
  trimSilenceEdges,
  type PcmWavConversionResult
} from "../audio-utils";
import { ensureDataDirs, idStamp, outputsDir, safeJoin, sanitizeFilename } from "../file-utils";
import { REMOTE_TTS_CHUNK_CHARACTERS } from "../script-limits";
import { parseDialogueSegments, splitDialogueIntoChunks, splitScriptIntoChunks } from "../script-chunker";
import type { DialogueSegment, DialogueSpeaker, GenerateVoiceInput, GenerateVoiceResult, NarrationStyle, ReferenceAudioPayload, VoiceEmotion } from "../types";
import { appendGenerationLog } from "../storage/generation-log";
import type { TTSProvider } from "./base";
import {
  assertOkResponse,
  extractAudioUrlFromEvents,
  fetchTextWithTimeout,
  fetchWithTimeout,
  getHFInferenceTimeout,
  getHFRequestTimeout,
  parseSSEData,
  parseUploadResponse,
  readJsonResponse,
  RemoteProviderError,
  shouldRetryHFError,
  summarizeRemoteEvents,
  TimeoutError,
  withRetry
} from "./hf-utils";
import { getVoxCPM2BaseUrl, isLocalVoxCPM2Endpoint } from "./voxcpm2-health";

const narrationStyleControls: Record<NarrationStyle, string> = {
  professional: "polished professional broadcast narrator, confident studio delivery, clean diction, controlled breathing, consistent vocal presence",
  movie_recap: "high-retention movie recap narrator, cinematic storytelling, crisp hook-driven pacing, strong emphasis on plot turns, suspenseful transitions",
  cinematic: "cinematic storyteller, immersive dramatic arc, deliberate pauses, expressive but natural phrasing",
  documentary: "premium documentary narrator, authoritative and thoughtful delivery, precise pronunciation, measured pacing",
  conversational: "natural conversational storyteller, intimate and authentic delivery, relaxed phrasing without sounding flat"
};

const emotionControls: Record<VoiceEmotion, string> = {
  neutral: "emotionally controlled, clear and composed",
  calm: "calm, reassuring and steady",
  warm: "warm, empathetic and gently expressive",
  hopeful: "hopeful, uplifting and quietly inspiring",
  sad: "sad and reflective, restrained vulnerability, soft emotional weight",
  tense: "tense and suspenseful, controlled urgency, rising anticipation",
  excited: "excited and vivid, bright energy, punchy emphasis",
  energetic: "high energy, brisk momentum, assertive emphasis",
  dramatic: "highly dramatic, powerful emotional contrast, strong rising and falling intonation"
};

// Dialogue-mode character voices get a short conversational-delivery hint instead of the
// narrator emotion preset — Speaker A/B are having a scene, not narrating.
const dialogueSpeakerControls: Record<"A" | "B", string> = {
  A: "natural conversational character voice, emotionally reactive dialogue delivery",
  B: "natural conversational character voice, emotionally reactive dialogue delivery, distinct from the other speaker"
};

function speedControl(speed: number) {
  if (speed <= 0.85) return "slow, deliberate pacing, heavy dramatic pauses";
  if (speed <= 0.95) return "slightly slower pacing, building suspense";
  if (speed >= 1.15) return "fast, punchy movie-recap pacing, energetic momentum";
  if (speed >= 1.05) return "brisk, engaging pacing";
  return "natural cinematic narration pacing";
}

function emotionIntensityControl(value = 60) {
  if (value <= 20) return "very subtle emotional expression";
  if (value <= 45) return "restrained natural emotional expression";
  if (value <= 70) return "clearly expressive emotion while preserving natural speech";
  if (value <= 88) return "strong emotional expression with pronounced emphasis";
  return "maximum expressive intensity, bold contrast and unmistakable emotion without shouting";
}

function stableConsistencySeed(input: GenerateVoiceInput) {
  const hash = crypto.createHash("sha256");
  hash.update(input.voiceDescription || "");
  hash.update(input.referenceAudio?.dataUrl || "");
  hash.update(input.speakerAReferenceAudio?.dataUrl || "");
  hash.update(input.speakerBReferenceAudio?.dataUrl || "");
  hash.update(`${input.narrationStyle}|${input.emotion}|${input.emotionIntensity ?? 60}|${input.speed}|${input.cloneStrength ?? 2}`);
  return hash.digest().readUInt32BE(0) & 0x7fffffff;
}

// Extra /generate args appended AFTER the 8 public-Space args. These controls are exposed by the
// local server (and any self-hosted Space) but NOT by the public demo — so they must only be sent
// when the endpoint actually accepts them, or the public Space's fixed 8-arg signature 500s.
//
// Local server contract (local-server/server.py): arg 9 = inference_timesteps, arg 10 = retry_badcase.
// The user's "Quality steps" slider drives inference_timesteps; retry_badcase is on for stability.
// For a NON-local self-hosted Space, VOXCPM2_EXTRA_PARAMS is the expert escape hatch instead.
async function resolveExtraGenerateParams(isLocal: boolean, inferenceTimesteps: number | undefined, consistencySeed: number) {
  if (isLocal) {
    return [Math.min(50, Math.max(4, inferenceTimesteps ?? 24)), true, consistencySeed];
  }
  const raw = process.env.VOXCPM2_EXTRA_PARAMS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// QA flag: keep an un-mastered raw sibling output for A/B comparison in History.
function keepRawOutput() {
  const value = process.env.THALIKA_KEEP_RAW_OUTPUT?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function decodeReferenceAudio(referenceAudio: ReferenceAudioPayload) {
  const match = referenceAudio.dataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new RemoteProviderError("Invalid reference audio", {
      publicMessage: "VoxCPM2 requires a valid audio reference file."
    });
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

async function uploadReferenceAudio(baseUrl: string, referenceAudio: ReferenceAudioPayload) {
  const { bytes, mimeType } = decodeReferenceAudio(referenceAudio);
  const filename = sanitizeFilename(referenceAudio.filename || "reference.wav");
  const form = new FormData();
  form.append("files", new Blob([bytes], { type: mimeType }), filename);

  const response = await fetchWithTimeout(`${baseUrl}/gradio_api/upload`, {
    method: "POST",
    body: form
  });
  assertOkResponse(response, "VoxCPM2 reference audio upload failed");

  const json = await readJsonResponse<unknown>(response, "Invalid response from VoxCPM2 Space.");
  return parseUploadResponse(json);
}

// A submission (POST) enqueues remote inference and returns an event id; the result (GET)
// only reads that queued job's output. Retrying the POST starts a *new* inference, so the
// two stages need different retry policies — see shouldRetrySubmit and the staged retries below.
async function submitVoxCPM2Generation(
  baseUrl: string,
  input: GenerateVoiceInput,
  uploadedReferencePath: string | undefined,
  referenceFilename: string | undefined,
  referenceMimeType: string | undefined,
  scriptChunk: string,
  controlInstruction: string,
  consistencySeed: number
) {
  const cloneMode = input.cloneMode || "high_fidelity";
  // cfg_value (a.k.a. cloneStrength): higher = stronger adherence to the reference = more consistent
  // timbre across chunks (at some naturalness cost). For high_fidelity we prioritize cross-chunk
  // stability over naturalness (per the explicit stability-first goal), so default higher. `balanced`
  // keeps the lower, more natural value. The user's slider still overrides both.
  const cloneStrength = Math.min(3, Math.max(1, input.cloneStrength ?? (cloneMode === "high_fidelity" ? 2.5 : 1.7)));
  const denoiseReference = input.denoiseReference ?? false;
  const normalizeText = input.normalizeText ?? true;
  // Resolve per-endpoint: local server gets [inference_timesteps, retry_badcase]; a self-hosted
  // Space gets VOXCPM2_EXTRA_PARAMS; the public demo gets nothing (its 8-arg signature would 500).
  const extraParams = await resolveExtraGenerateParams(await isLocalVoxCPM2Endpoint(), input.inferenceTimesteps, consistencySeed);
  const data: unknown[] = [
    scriptChunk,
    controlInstruction,
    // null audio = Voice Design (no reference); else the uploaded reference FileData for cloning.
    uploadedReferencePath
      ? {
          path: uploadedReferencePath,
          orig_name: sanitizeFilename(referenceFilename || "reference.wav"),
          mime_type: referenceMimeType || "audio/wav",
          meta: { _type: "gradio.FileData" }
        }
      : null,
    false, // use_prompt_text — always off; VoxCPM speaks the prompt transcript otherwise
    "", // prompt_text — never sent
    cloneStrength,
    normalizeText,
    denoiseReference,
    // Local server (or a self-hosted Space via VOXCPM2_EXTRA_PARAMS) gets extra controls the
    // public demo rejects: [inference_timesteps, retry_badcase]. Resolved per-endpoint so the
    // public Space's fixed 8-arg signature never receives a 9th arg.
    ...extraParams
  ];
  const body = {
    data
  };

  const response = await fetchWithTimeout(`${baseUrl}/gradio_api/call/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assertOkResponse(response, "VoxCPM2 remote inference failed");

  const json = await readJsonResponse<{ event_id?: string }>(response, "Invalid response from VoxCPM2 Space.");
  if (!json.event_id) {
    throw new RemoteProviderError("Missing Gradio event id", {
      publicMessage: "Invalid response from VoxCPM2 Space."
    });
  }

  return { eventId: json.event_id };
}

async function fetchVoxCPM2Result(baseUrl: string, eventId: string, input: GenerateVoiceInput, chunkIndex: number, chunkCount: number) {
  const { response: resultResponse, text: resultText } = await fetchTextWithTimeout(`${baseUrl}/gradio_api/call/generate/${eventId}`, {
    method: "GET",
    headers: { Accept: "text/event-stream" }
  });
  assertOkResponse(resultResponse, "VoxCPM2 remote inference failed");

  const events = parseSSEData(resultText);
  try {
    return extractAudioUrlFromEvents(events, baseUrl);
  } catch (error) {
    await appendGenerationLog("remote_sse_without_audio", {
      jobId: input.jobId,
      chunk: chunkIndex + 1,
      chunks: chunkCount,
      events: JSON.stringify(summarizeRemoteEvents(events)),
      error: diagnosticError(error)
    });
    throw error;
  }
}

// A submission timeout is ambiguous: the job may already be queued, so re-POSTing would run
// inference twice. Only retry the submit on an explicit pre-enqueue rejection (429/503).
function shouldRetrySubmit(error: unknown) {
  return error instanceof RemoteProviderError && error.retryable;
}

// The public Space rejects bursts of submissions with 503 under load; retry patiently (with
// capped backoff) so a transient busy window doesn't surface as a hard generation failure.
// Safe because a rejected submission never enqueued inference — no duplicate-run risk.
const SUBMIT_RETRY_ATTEMPTS = 5;

// Client-side retry_badcase: VoxCPM occasionally emits a take far longer than the text warrants —
// a repeated phrase or an echoed reference tail. Detect it by chars-per-second (normal Burmese TTS
// runs ~8-20 cps; a leaked/repeated take drops well below) and regenerate, keeping the densest take.
const BADCASE_MAX_RETRIES = 2;
const BADCASE_MIN_SECONDS = 6; // never second-guess short clips, where cps is noisy
const BADCASE_MIN_CHARS_PER_SECOND = 4.5;

function charsPerSecond(chunkText: string, wav: Buffer) {
  const seconds = pcm24DurationSeconds(wav);
  return seconds > 0 ? chunkText.trim().length / seconds : Infinity;
}

function isBadCaseTake(chunkText: string, wav: Buffer) {
  const seconds = pcm24DurationSeconds(wav);
  if (seconds <= BADCASE_MIN_SECONDS) return false;
  return charsPerSecond(chunkText, wav) < BADCASE_MIN_CHARS_PER_SECOND;
}

async function downloadRemoteAudio(audioUrl: string) {
  const response = await fetchWithTimeout(audioUrl, { method: "GET" });
  assertOkResponse(response, "VoxCPM2 audio download failed");

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("audio") && !contentType.includes("octet-stream")) {
    throw new RemoteProviderError("Unexpected VoxCPM2 audio response type", {
      publicMessage: "Invalid response from VoxCPM2 Space."
    });
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new RemoteProviderError("Empty VoxCPM2 audio response", {
      publicMessage: "VoxCPM2 audio download failed."
    });
  }

  return bytes;
}

function normalizeVoxCPM2Error(error: unknown) {
  if (error instanceof TimeoutError) return "Remote inference timed out.";
  if (error instanceof RemoteProviderError) return error.publicMessage;
  return "VoxCPM2 remote inference failed";
}

function diagnosticError(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return "Unknown remote inference error";
}

// Resolves which reference audio a dialogue segment's speaker should clone. Speaker A/B fall back
// to the main reference audio if their own reference wasn't uploaded, so a partially-configured
// dialogue job still generates instead of hard-failing.
function resolveReferenceForSpeaker(input: GenerateVoiceInput, speaker: DialogueSpeaker): ReferenceAudioPayload | undefined {
  if (speaker === "A") return input.speakerAReferenceAudio || input.referenceAudio;
  if (speaker === "B") return input.speakerBReferenceAudio || input.referenceAudio;
  return input.referenceAudio;
}

function controlInstructionFor(input: GenerateVoiceInput, speaker: DialogueSpeaker) {
  if (speaker === "A" || speaker === "B") {
    return `${dialogueSpeakerControls[speaker]}, ${emotionControls[input.emotion]}, ${emotionIntensityControl(input.emotionIntensity)}, ${speedControl(input.speed)}`;
  }
  const designedVoice = input.voiceDescription?.trim() ? `${input.voiceDescription.trim()}, ` : "";
  return `${designedVoice}${narrationStyleControls[input.narrationStyle]}, ${emotionControls[input.emotion]}, ${emotionIntensityControl(input.emotionIntensity)}, ${speedControl(input.speed)}`;
}

interface ResolvedChunk {
  speaker: DialogueSpeaker;
  text: string;
}

async function generateRemote(input: GenerateVoiceInput) {
  const dialogueMode = Boolean(input.dialogueMode);
  // Voice Design = no reference + a description; the model creates a new voice from the text.
  // Dialogue mode always requires reference audio (Voice Design isn't wired for multi-speaker).
  const isVoiceDesign = !dialogueMode && !input.referenceAudio && Boolean(input.voiceDescription?.trim());
  if (!dialogueMode && !input.referenceAudio && !isVoiceDesign) {
    throw new RemoteProviderError("Missing reference audio", {
      publicMessage: "VoxCPM2 requires reference audio for voice cloning."
    });
  }
  if (dialogueMode && !input.referenceAudio && !input.speakerAReferenceAudio && !input.speakerBReferenceAudio) {
    throw new RemoteProviderError("Missing reference audio", {
      publicMessage: "Dialogue mode requires at least one reference audio (narrator, Speaker A, or Speaker B)."
    });
  }

  await ensureDataDirs();
  const baseUrl = await getVoxCPM2BaseUrl();

  const resolvedChunks: ResolvedChunk[] = dialogueMode
    ? splitDialogueIntoChunks(parseDialogueSegments(input.script), REMOTE_TTS_CHUNK_CHARACTERS)
    : splitScriptIntoChunks(input.script, REMOTE_TTS_CHUNK_CHARACTERS).map((text) => ({ speaker: "main" as DialogueSpeaker, text }));

  if (resolvedChunks.length === 0) {
    throw new RemoteProviderError("Empty script", {
      publicMessage: "Script is required."
    });
  }
  const consistencySeed = stableConsistencySeed(input);

  // Upload each speaker's reference audio once (not once per chunk). Cache by speaker so repeated
  // dialogue turns for the same character reuse the same uploaded path.
  const uploadedPathBySpeaker = new Map<DialogueSpeaker, string | undefined>();
  const referenceBySpeaker = new Map<DialogueSpeaker, ReferenceAudioPayload | undefined>();
  const speakersInScript = new Set(resolvedChunks.map((chunk) => chunk.speaker));
  for (const speaker of speakersInScript) {
    const reference = dialogueMode ? resolveReferenceForSpeaker(input, speaker) : input.referenceAudio;
    referenceBySpeaker.set(speaker, reference);
    if (!reference) {
      uploadedPathBySpeaker.set(speaker, undefined);
      continue;
    }
    const uploadedPath = await withRetry(
      () => uploadReferenceAudio(baseUrl, reference),
      shouldRetryHFError,
      2,
      async (error, attempt) => {
        await appendGenerationLog("reference_upload_retry", {
          jobId: input.jobId,
          speaker,
          attempt,
          error: diagnosticError(error)
        });
      }
    );
    uploadedPathBySpeaker.set(speaker, uploadedPath);
  }

  const outputStem = sanitizeFilename(`voice_${idStamp()}`);
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "thalika-voxcpm2-"));
  let result: GenerateVoiceResult | undefined;

  try {
    const audioChunkPaths: string[] = [];
    const remoteFormats = new Set<string>();
    await appendGenerationLog("generation_started", {
      jobId: input.jobId,
      provider: "voxcpm2",
      characters: input.script.length,
      chunks: resolvedChunks.length,
      dialogueMode,
      speakers: [...speakersInScript].join(",")
    });
    await input.onProgress?.({
      completedChunks: 0,
      totalChunks: resolvedChunks.length,
      message: `Preparing ${resolvedChunks.length} audio segment${resolvedChunks.length === 1 ? "" : "s"}.`
    });

    // Warmup (multi-chunk only): the model sometimes emits noise/stutter on its very first
    // inference after being idle (cold start). Running ONE short, fully-completed throwaway take
    // warms the weights before the real chunk 0 runs, so the first real chunk isn't penalized.
    // Uses the first chunk's speaker reference. Best-effort — a warmup failure must NOT abort
    // the job, the real generation still runs.
    const firstChunk = resolvedChunks[0];
    const firstUploadedPath = uploadedPathBySpeaker.get(firstChunk.speaker);
    if (resolvedChunks.length > 1 && firstUploadedPath) {
      try {
        const firstReference = referenceBySpeaker.get(firstChunk.speaker);
        const warmupSubmission = await submitVoxCPM2Generation(
          baseUrl,
          input,
          firstUploadedPath,
          firstReference?.filename,
          firstReference?.mimeType,
          "။",
          controlInstructionFor(input, firstChunk.speaker),
          consistencySeed
        );
        await fetchVoxCPM2Result(baseUrl, warmupSubmission.eventId, input, -1, resolvedChunks.length);
        await appendGenerationLog("warmup_completed", { jobId: input.jobId });
      } catch (error) {
        await appendGenerationLog("warmup_failed", { jobId: input.jobId, error: diagnosticError(error) });
      }
    }

    for (const [chunkIndex, chunk] of resolvedChunks.entries()) {
      const uploadedReferencePath = uploadedPathBySpeaker.get(chunk.speaker);
      const reference = referenceBySpeaker.get(chunk.speaker);
      const controlInstruction = controlInstructionFor(input, chunk.speaker);

      await appendGenerationLog("chunk_started", {
        jobId: input.jobId,
        chunk: chunkIndex + 1,
        chunks: resolvedChunks.length,
        speaker: chunk.speaker,
        characters: chunk.text.length
      });
      await input.onProgress?.({
        completedChunks: chunkIndex,
        totalChunks: resolvedChunks.length,
        message: `Generating audio segment ${chunkIndex + 1} of ${resolvedChunks.length}${dialogueMode ? ` (${chunk.speaker})` : ""}.`
      });
      const logStageRetry = (stage: string) => async (error: unknown, attempt: number) => {
        await appendGenerationLog("chunk_retry", {
          jobId: input.jobId,
          chunk: chunkIndex + 1,
          chunks: resolvedChunks.length,
          speaker: chunk.speaker,
          stage,
          attempt,
          error: diagnosticError(error)
        });
      };

      // One full attempt: enqueue (POST, retry 429/503 only — an ambiguous timeout must not
      // re-enqueue), read the SAME event id (retry safe), download (idempotent), decode to PCM.
      const produceTake = async (): Promise<PcmWavConversionResult> => {
        const submission = await withRetry(
          () =>
            submitVoxCPM2Generation(
              baseUrl,
              input,
              uploadedReferencePath,
              reference?.filename,
              reference?.mimeType,
              chunk.text,
              controlInstruction,
              consistencySeed
            ),
          shouldRetrySubmit,
          SUBMIT_RETRY_ATTEMPTS,
          logStageRetry("submit")
        );
        const remoteAudioUrl = await withRetry(
          () => fetchVoxCPM2Result(baseUrl, submission.eventId, input, chunkIndex, resolvedChunks.length),
          shouldRetryHFError,
          2,
          logStageRetry("result")
        );
        const audio = await withRetry(() => downloadRemoteAudio(remoteAudioUrl), shouldRetryHFError, 2, logStageRetry("download"));
        try {
          return await convertRemoteAudioToPcm24Wav(audio);
        } catch {
          throw new RemoteProviderError("Remote audio decode failed", {
            publicMessage: "VoxCPM2 returned an audio segment that could not be decoded into PCM WAV."
          });
        }
      };

      // Client-side retry_badcase: if a take runs far longer than the text warrants (a repeat or a
      // leaked reference echo), regenerate and keep the densest (least-padded) take.
      let converted = await produceTake();
      for (let attempt = 1; attempt <= BADCASE_MAX_RETRIES && isBadCaseTake(chunk.text, converted.wav); attempt += 1) {
        await appendGenerationLog("chunk_badcase_retry", {
          jobId: input.jobId,
          chunk: chunkIndex + 1,
          chunks: resolvedChunks.length,
          attempt,
          seconds: pcm24DurationSeconds(converted.wav).toFixed(2),
          charsPerSecond: charsPerSecond(chunk.text, converted.wav).toFixed(2)
        });
        const candidate = await produceTake();
        if (charsPerSecond(chunk.text, candidate.wav) > charsPerSecond(chunk.text, converted.wav)) {
          converted = candidate;
        }
      }

      const chunkPath = path.join(temporaryDir, `chunk-${chunkIndex}.wav`);
      await fs.writeFile(chunkPath, converted.wav);
      audioChunkPaths.push(chunkPath);
      remoteFormats.add(converted.remoteFormat);
      await appendGenerationLog("chunk_completed", {
        jobId: input.jobId,
        chunk: chunkIndex + 1,
        chunks: resolvedChunks.length,
        speaker: chunk.speaker,
        remoteFormat: converted.remoteFormat,
        pcmWavBytes: converted.wav.length,
        seconds: pcm24DurationSeconds(converted.wav).toFixed(2),
        charsPerSecond: charsPerSecond(chunk.text, converted.wav).toFixed(2)
      });
      await input.onProgress?.({
        completedChunks: chunkIndex + 1,
        totalChunks: resolvedChunks.length,
        message: `Generated audio segment ${chunkIndex + 1} of ${resolvedChunks.length}.`
      });
    }

    const format = "wav";
    const filename = sanitizeFilename(`${outputStem}.wav`);
    const audioFilePath = safeJoin(outputsDir, filename);
    // Pause between chunks: use punctuation-aware pause normally, but force a slightly longer
    // beat whenever the speaker changes (a turn-take reads more naturally with a small gap).
    const punctuationAwarePauses = resolvedChunks.slice(0, -1).map((chunk, index) => {
      const base = getPunctuationAwarePauseMilliseconds(chunk.text);
      const nextSpeaker = resolvedChunks[index + 1]?.speaker;
      return nextSpeaker && nextSpeaker !== chunk.speaker ? Math.max(base, 260) : base;
    });
    await appendGenerationLog("merge_started", {
      jobId: input.jobId,
      chunks: resolvedChunks.length,
      format,
      encoding: "pcm_s24le",
      pausesMilliseconds: punctuationAwarePauses.join(",")
    });

    // QA-only: when THALIKA_KEEP_RAW_OUTPUT is set, keep an un-mastered sibling merged from the
    // SAME chunks (no trim, no normalize) so History can A/B the mastering on identical content.
    let rawAudioFile: string | undefined;
    if (keepRawOutput()) {
      rawAudioFile = sanitizeFilename(`${outputStem}_raw.wav`);
      await mergeWavFiles([...audioChunkPaths], safeJoin(outputsDir, rawAudioFile), punctuationAwarePauses);
    }

    // Trim each chunk's edge silence, then merge so the only inter-chunk gap is the controlled
    // punctuation pause (steadier rhythm), then master (peak-normalize + edge fades). Only new
    // generations are mastered — legacy-file migration must not re-level existing user audio.
    for (const chunkPath of audioChunkPaths) {
      await trimSilenceEdges(chunkPath);
    }
    const loudnessMatch = await matchChunkLoudness(audioChunkPaths, 3);
    await appendGenerationLog("chunk_loudness_matched", {
      jobId: input.jobId,
      chunks: resolvedChunks.length,
      adjustedChunks: loudnessMatch.adjustedChunks,
      targetRms: loudnessMatch.targetRms.toFixed(6)
    });
    await mergeWavFiles(audioChunkPaths, audioFilePath, punctuationAwarePauses);
    await normalizeMasterPeak(audioFilePath);
    await appendGenerationLog("generation_completed", {
      jobId: input.jobId,
      chunks: resolvedChunks.length,
      filename,
      format,
      rawCopy: Boolean(rawAudioFile)
    });
    result = {
      filename,
      audioFilePath,
      format,
      localAudioUrl: `/api/audio/${filename}`,
      rawAudioFile,
      metadata: {
        remoteProvider: "huggingface-space",
        remoteBaseUrl: baseUrl,
        remoteFormats: [...remoteFormats].join(","),
        outputEncoding: "pcm_s24le",
        outputSampleRate: 48_000,
        outputChannels: 1,
        outputBitDepth: 24,
        pausePolicy: "punctuation-aware",
        mode: dialogueMode ? "voxcpm2-dialogue-cloning" : "voxcpm2-controllable-cloning",
        dialogueMode,
        speakers: [...speakersInScript].join(","),
        cloneMode: input.cloneMode || "high_fidelity",
        cloneStrength: input.cloneStrength ?? 2,
        denoiseReference: input.denoiseReference ?? false,
        normalizeText: input.normalizeText ?? true,
        referenceTranscriptUsed: false,
        paceGuidance: speedControl(input.speed),
        narrationStyle: input.narrationStyle,
        emotion: input.emotion,
        emotionIntensity: input.emotionIntensity ?? 60,
        consistencySeed,
        chunkedGeneration: resolvedChunks.length > 1,
        chunkLoudnessMatched: loudnessMatch.adjustedChunks > 0,
        chunkCount: resolvedChunks.length,
        chunkMaxCharacters: REMOTE_TTS_CHUNK_CHARACTERS,
        originalCharacters: input.script.length,
        timeoutMs: getHFRequestTimeout(),
        inferenceTimeoutMs: getHFInferenceTimeout()
      }
    };
  } catch (error) {
    await appendGenerationLog("generation_failed", {
      jobId: input.jobId,
      chunks: resolvedChunks.length,
      error: diagnosticError(error),
      publicMessage: normalizeVoxCPM2Error(error)
    });
    throw error;
  } finally {
    await fs.rm(temporaryDir, { recursive: true, force: true });
  }

  if (!result) throw new Error("VoxCPM2 generation completed without a local audio result.");
  return result;
}

export const voxcpm2Provider: TTSProvider = {
  id: "voxcpm2",
  name: "VoxCPM2",
  async generate(input) {
    try {
      return await generateRemote(input);
    } catch (error) {
      throw new RemoteProviderError("VoxCPM2 remote inference failed", {
        publicMessage: normalizeVoxCPM2Error(error)
      });
    }
  }
};
