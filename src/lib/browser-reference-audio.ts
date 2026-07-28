import type { ReferenceQualityReport } from "./types";

export type ReferenceQualityMetrics = Pick<
  ReferenceQualityReport,
  "durationSeconds" | "silenceRatio" | "clippingRatio" | "rms" | "peak"
>;

function blockedReport(issue: string): ReferenceQualityReport {
  return {
    durationSeconds: 0,
    silenceRatio: 1,
    clippingRatio: 0,
    rms: 0,
    peak: 0,
    score: 0,
    status: "block",
    issues: [issue]
  };
}

export function evaluateReferenceQuality(metrics: ReferenceQualityMetrics): ReferenceQualityReport {
  const { durationSeconds, silenceRatio, clippingRatio, rms, peak } = metrics;
  const voicedDuration = durationSeconds * (1 - silenceRatio);
  const issues: string[] = [];
  let score = 100;
  let status: ReferenceQualityReport["status"] = "pass";

  if (durationSeconds < 3) issues.push("Reference is shorter than 3 seconds.");
  else if (durationSeconds < 6) issues.push("Reference is usable but shorter than the recommended 6 seconds.");
  if (durationSeconds > 50) issues.push("Reference is longer than the supported 50 seconds.");
  else if (durationSeconds > 30) issues.push("Reference is longer than the recommended 30 seconds.");
  if (silenceRatio > 0.95 && voicedDuration < 1.5) issues.push("Reference is almost entirely silent.");
  else if (silenceRatio > 0.7) issues.push("Reference includes extended pauses. Natural pauses are allowed; trim long empty sections only if cloning is unstable.");
  if (clippingRatio > 0.03) issues.push("Reference is heavily clipped.");
  else if (clippingRatio > 0.005) issues.push("Reference contains clipped peaks.");
  if (rms < 0.025) issues.push("Reference loudness is low.");

  if (durationSeconds < 3 || durationSeconds > 50 || (silenceRatio > 0.95 && voicedDuration < 1.5) || clippingRatio > 0.03) status = "block";
  else if (issues.length > 0) status = "warn";
  if (durationSeconds < 3 || durationSeconds > 50) score -= 45;
  else if (durationSeconds < 6 || durationSeconds > 30) score -= 15;
  if (silenceRatio > 0.95 && voicedDuration < 1.5) score -= 40;
  else if (silenceRatio > 0.7) score -= 10;
  if (clippingRatio > 0.03) score -= 40;
  else if (clippingRatio > 0.005) score -= 15;
  if (rms < 0.025) score -= 10;

  return {
    durationSeconds,
    silenceRatio,
    clippingRatio,
    rms,
    peak,
    score: Math.max(0, score),
    status,
    issues
  };
}

export async function analyzeReferenceAudio(file: File): Promise<ReferenceQualityReport> {
  try {
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    await context.close();
    const durationSeconds = buffer.duration;
    let samples = 0;
    let clipped = 0;
    let sumSquares = 0;
    let peak = 0;
    const stride = Math.max(1, Math.floor(buffer.length / 250000));

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const values = buffer.getChannelData(channel);
      for (let index = 0; index < values.length; index += stride) {
        const absolute = Math.abs(values[index]);
        samples += 1;
        if (absolute >= 0.99) clipped += 1;
        sumSquares += values[index] ** 2;
        peak = Math.max(peak, absolute);
      }
    }

    const silenceThreshold = Math.min(0.012, Math.max(0.0025, peak * 0.035));
    let silent = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const values = buffer.getChannelData(channel);
      for (let index = 0; index < values.length; index += stride) {
        if (Math.abs(values[index]) < silenceThreshold) silent += 1;
      }
    }
    const silenceRatio = samples ? silent / samples : 1;
    const clippingRatio = samples ? clipped / samples : 0;
    const rms = samples ? Math.sqrt(sumSquares / samples) : 0;
    return evaluateReferenceQuality({
      durationSeconds,
      silenceRatio,
      clippingRatio,
      rms,
      peak
    });
  } catch {
    return blockedReport("Could not decode reference audio for local quality analysis.");
  }
}
