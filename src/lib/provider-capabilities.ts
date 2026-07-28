import { detectScriptLanguage } from "./language-utils";
import type { GenerateVoiceRequest, ProviderCapability, ProviderPreflightResult, VoiceProvider } from "./types";

export const providerCapabilities: Record<VoiceProvider, ProviderCapability> = {
  voxcpm2: {
    provider: "voxcpm2",
    name: "VoxCPM2 Multilingual",
    inference: "remote_hf",
    cloneQuality: "production",
    privacy: "remote_public",
    statusLabel: "remote public",
    supportedLanguages: [
      "my",
      "zh",
      "en",
      "ja",
      "ko",
      "de",
      "fr",
      "ru",
      "pt",
      "es",
      "it",
      "mixed_supported"
    ],
    supportedLanguageLabels: [
      "Burmese / Myanmar",
      "Chinese",
      "English",
      "Japanese",
      "Korean",
      "German",
      "French",
      "Russian",
      "Portuguese",
      "Spanish",
      "Italian",
      "and other VoxCPM2-supported languages"
    ],
    requiresReferenceAudio: true,
    canCloneVoice: true,
    limitations: [
      "Direct VoxCPM2 engine access for supported multilingual scripts.",
      "Uses the public OpenBMB Hugging Face Space for remote inference.",
      "Highest-fidelity cloning needs clean reference audio and stable Burmese text."
    ],
    recommendation: "This is the strongest current candidate for Burmese cloning. Send Burmese text and clean reference audio."
  }
};

export function preflightProvider(
  input: Pick<GenerateVoiceRequest, "provider" | "script" | "referenceAudio" | "voiceProfileId" | "referenceText" | "normalizationApproved" | "cloneMode" | "voiceDescription">
): ProviderPreflightResult {
  const capability = providerCapabilities[input.provider];
  const detectedLanguage = detectScriptLanguage(input.script);

  if (!input.script.trim()) {
    return {
      ok: false,
      severity: "blocked",
      detectedLanguage,
      message: "Paste a script to analyze language and provider fit.",
      nextStep: "Add the script first, then the studio will decide whether this provider can handle it."
    };
  }

  if (!capability) {
    return {
      ok: false,
      severity: "blocked",
      detectedLanguage,
      message: "Unknown provider.",
      nextStep: "Choose a configured provider."
    };
  }

  if (!capability.supportedLanguages.includes(detectedLanguage.code)) {
    return {
      ok: false,
      severity: "blocked",
      detectedLanguage,
      message: "This script language is not confidently supported by VoxCPM2.",
      nextStep: "Use Burmese or another VoxCPM2-supported language."
    };
  }

  if (!input.referenceAudio && !input.voiceProfileId && !input.voiceDescription?.trim()) {
    return {
      ok: false,
      severity: "blocked",
      detectedLanguage,
      message: "Clone a voice (reference clip) or design one (voice description).",
      nextStep: "Upload a reference, or switch to Design and describe the voice."
    };
  }

  // Burmese scripts run the production QA layer automatically: the normalized pronunciation
  // preview must be approved before generation. Other languages skip this gate.
  if (detectedLanguage.code === "my" && !input.normalizationApproved) {
    return {
      ok: false,
      severity: "blocked",
      detectedLanguage,
      message: "Review and approve the normalized Burmese script before generation.",
      nextStep: "Check the pronunciation preview and approve it."
    };
  }

  return {
    ok: true,
    severity: "info",
    detectedLanguage,
    message:
      detectedLanguage.code === "my"
        ? "Ready: Burmese pronunciation QA applied, cloning with VoxCPM2 remote inference."
        : "Ready to clone with VoxCPM2 remote inference.",
    nextStep: "",
    hideNextStep: true
  };
}
