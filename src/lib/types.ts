export type VoiceProvider = "voxcpm2";
export type OutputFormat = "wav" | "mp3";
export type NarrationStyle = "professional" | "movie_recap" | "cinematic" | "documentary" | "conversational";
export type VoiceEmotion = "neutral" | "calm" | "warm" | "hopeful" | "sad" | "tense" | "excited" | "energetic" | "dramatic";
export type CloneMode = "balanced" | "high_fidelity";
export type JobStatus = "generating" | "completed" | "failed";
export type LanguageCode = "unknown" | "my" | "en" | "zh" | "ja" | "ko" | "yue" | "de" | "fr" | "ru" | "pt" | "es" | "it" | "mixed_supported";
export type CapabilityLevel = "demo" | "baseline" | "production";
export type DialogueSpeaker = "main" | "A" | "B";

export interface DialogueSegment {
  speaker: DialogueSpeaker;
  text: string;
}

export interface LanguageDetectionResult {
  code: LanguageCode;
  label: string;
  confidence: number;
  reason: string;
}

export interface ProviderCapability {
  provider: VoiceProvider;
  name: string;
  inference: "remote_hf" | "placeholder";
  cloneQuality: CapabilityLevel;
  privacy: "remote_public";
  statusLabel?: string;
  supportedLanguages: LanguageCode[];
  supportedLanguageLabels: string[];
  requiresReferenceAudio: boolean;
  canCloneVoice: boolean;
  limitations: string[];
  recommendation: string;
}

export interface ProviderPreflightResult {
  ok: boolean;
  severity: "info" | "warning" | "blocked";
  detectedLanguage: LanguageDetectionResult;
  message: string;
  nextStep: string;
  hideNextStep?: boolean;
}

export interface ReferenceAudioPayload {
  dataUrl: string;
  filename: string;
  mimeType: string;
  size: number;
  durationSeconds?: number;
}

export interface ReferenceAudioAssessment {
  score: number;
  label: "missing" | "too_short" | "good" | "too_long" | "unknown";
  message: string;
}

export interface ReferenceQualityReport {
  durationSeconds: number;
  silenceRatio: number;
  clippingRatio: number;
  rms: number;
  peak: number;
  score: number;
  status: "pass" | "warn" | "block";
  issues: string[];
}

export interface BurmeseLexiconEntry {
  source: string;
  spoken: string;
  note?: string;
}

export interface BurmeseNormalizationChange {
  source: string;
  spoken: string;
  reason: string;
}

export interface BurmeseNormalizationResult {
  originalScript: string;
  normalizedScript: string;
  changes: BurmeseNormalizationChange[];
  lexiconRevision: string;
}

export interface VoiceProfileSummary {
  id: string;
  name: string;
  consentedAt: string;
  referenceFilename: string;
  referenceSize: number;
  referenceText: string;
  qualityReport: ReferenceQualityReport;
  preferredCloneMode: CloneMode;
  preferredCloneStrength: number;
  preferredDenoiseReference: boolean;
  preferredNormalizeText: boolean;
  createdAt: string;
}

export interface ListeningReview {
  jobId: string;
  speakerSimilarity: number;
  burmesePronunciation: number;
  naturalness: number;
  noise: number;
  overallScore: number;
  approval: "approved" | "review_needed";
  notes?: string;
  updatedAt: string;
}

export interface GenerateVoiceRequest {
  title?: string;
  script: string;
  provider: VoiceProvider;
  format: OutputFormat;
  speed: number;
  narrationStyle: NarrationStyle;
  emotion: VoiceEmotion;
  emotionIntensity?: number;
  cloneMode?: CloneMode;
  cloneStrength?: number;
  inferenceTimesteps?: number;
  voiceDescription?: string;
  denoiseReference?: boolean;
  normalizeText?: boolean;
  referenceAudio?: ReferenceAudioPayload;
  referenceText?: string;
  voiceProfileId?: string;
  referenceQualityReport?: ReferenceQualityReport;
  approvedNormalizedScript?: string;
  lexiconRevision?: string;
  normalizationApproved?: boolean;
  dialogueMode?: boolean;
  speakerAReferenceAudio?: ReferenceAudioPayload;
  speakerBReferenceAudio?: ReferenceAudioPayload;
}

export interface GenerateVoiceInput extends GenerateVoiceRequest {
  jobId: string;
  scriptId: string;
  onProgress?: (progress: GenerationProgress) => Promise<void>;
}

export interface GenerationProgress {
  completedChunks: number;
  totalChunks: number;
  message: string;
}

export interface GenerateVoiceResult {
  filename: string;
  audioFilePath: string;
  format: OutputFormat;
  localAudioUrl?: string;
  // Optional un-mastered sibling output kept only when THALIKA_KEEP_RAW_OUTPUT is set, for A/B QA.
  rawAudioFile?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ScriptRecord {
  id: string;
  title: string;
  createdAt: string;
  characterCount: number;
  wordCount: number;
  content: string;
}

export interface JobRecord {
  id: string;
  scriptId: string;
  title: string;
  provider: string;
  format: OutputFormat;
  speed: number;
  narrationStyle: NarrationStyle;
  emotion: VoiceEmotion;
  emotionIntensity?: number;
  status: JobStatus;
  audioFile?: string;
  rawAudioFile?: string;
  error?: string;
  completedChunks?: number;
  totalChunks?: number;
  progressMessage?: string;
  voiceProfileId?: string;
  lexiconRevision?: string;
  normalizationChanges?: number;
  referenceQualityScore?: number;
  referenceTranscriptUsed?: boolean;
  review?: ListeningReview;
  createdAt: string;
  content: string;
}
