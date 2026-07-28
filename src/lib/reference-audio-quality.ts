import type { ReferenceAudioAssessment, ReferenceAudioPayload } from "./types";

export function assessReferenceAudio(referenceAudio?: Pick<ReferenceAudioPayload, "durationSeconds" | "size">): ReferenceAudioAssessment {
  if (!referenceAudio) {
    return {
      score: 0,
      label: "missing",
      message: "Upload a clean reference voice file."
    };
  }

  const duration = referenceAudio.durationSeconds;
  if (!duration) {
    return {
      score: 55,
      label: "unknown",
      message: "Reference loaded. Duration could not be read, so quality cannot be fully checked."
    };
  }

  if (duration < 3) {
    return {
      score: 25,
      label: "too_short",
      message: "Reference is too short for stable cloning. Use at least 6-15 seconds of clean speech."
    };
  }

  if (duration < 6) {
    return {
      score: 60,
      label: "too_short",
      message: "Reference is usable but short. 6-15 seconds usually preserves tone and pacing better."
    };
  }

  if (duration <= 30) {
    return {
      score: 90,
      label: "good",
      message: "Reference length is good. Clean, dry speech will give the best match."
    };
  }

  if (duration <= 50) {
    return {
      score: 75,
      label: "good",
      message: "Reference is long but acceptable. Trim silence, music, and other speakers if present."
    };
  }

  return {
    score: 30,
    label: "too_long",
    message: "VoxCPM2 public Space rejects very long references. Trim to 6-30 seconds of clean speech."
  };
}
