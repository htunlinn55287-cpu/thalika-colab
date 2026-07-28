import fs from "node:fs/promises";
import path from "node:path";
import { ensureDataDirs, idStamp, localIsoString, profilesDir, safeJoin, sanitizeFilename } from "../file-utils";
import type { ReferenceAudioPayload, ReferenceQualityReport, VoiceProfileSummary } from "../types";

interface VoiceProfileRecord extends VoiceProfileSummary {
  referenceAudioFile: string;
}

function profileMetadataPath(id: string) {
  return safeJoin(profilesDir, `${id}.json`);
}

function assertProfileId(id: string) {
  if (!/^profile_[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid voice profile id");
}

function decodeAudio(referenceAudio: ReferenceAudioPayload) {
  const match = referenceAudio.dataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Voice profile requires a valid audio file");
  return Buffer.from(match[2], "base64");
}

function publicProfile(profile: VoiceProfileRecord): VoiceProfileSummary {
  const { referenceAudioFile: _referenceAudioFile, ...summary } = profile;
  return summary;
}

export async function createVoiceProfile(input: {
  name: string;
  consent: boolean;
  referenceAudio: ReferenceAudioPayload;
  referenceText: string;
  qualityReport: ReferenceQualityReport;
  preferredCloneMode?: "balanced" | "high_fidelity";
  preferredCloneStrength?: number;
  preferredDenoiseReference?: boolean;
  preferredNormalizeText?: boolean;
}) {
  if (!input.consent) throw new Error("Consent is required before saving a local voice profile");
  if (input.qualityReport.status === "block") throw new Error("Blocked reference audio cannot be saved as a voice profile");
  await ensureDataDirs();
  const id = `profile_${idStamp()}`;
  const extension = path.extname(input.referenceAudio.filename).toLowerCase() || ".audio";
  const audioFile = `${id}${sanitizeFilename(extension)}`;
  const createdAt = localIsoString();
  const profile: VoiceProfileRecord = {
    id,
    name: input.name.trim(),
    consentedAt: createdAt,
    referenceFilename: sanitizeFilename(input.referenceAudio.filename),
    referenceAudioFile: audioFile,
    referenceSize: input.referenceAudio.size,
    referenceText: input.referenceText.trim(),
    qualityReport: input.qualityReport,
    preferredCloneMode: input.preferredCloneMode || "high_fidelity",
    preferredCloneStrength: input.preferredCloneStrength ?? 2,
    preferredDenoiseReference: input.preferredDenoiseReference ?? false,
    preferredNormalizeText: input.preferredNormalizeText ?? true,
    createdAt
  };
  await fs.writeFile(safeJoin(profilesDir, audioFile), decodeAudio(input.referenceAudio));
  await fs.writeFile(profileMetadataPath(id), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return publicProfile(profile);
}

export async function listVoiceProfiles() {
  await ensureDataDirs();
  const entries = await fs.readdir(profilesDir, { withFileTypes: true });
  const results = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^profile_[a-zA-Z0-9_-]+\.json$/.test(entry.name))
      .map(async (entry) => {
        // Best-effort per file: a single corrupt or half-written profile JSON must not reject
        // Promise.all and hide every other profile from the user.
        try {
          const profile = JSON.parse(await fs.readFile(safeJoin(profilesDir, entry.name), "utf8")) as VoiceProfileRecord;
          return publicProfile(profile);
        } catch {
          return null;
        }
      })
  );
  return results
    .filter((profile): profile is VoiceProfileSummary => profile !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getVoiceProfile(id: string) {
  assertProfileId(id);
  const profile = JSON.parse(await fs.readFile(profileMetadataPath(id), "utf8")) as VoiceProfileRecord;
  const audio = await fs.readFile(safeJoin(profilesDir, profile.referenceAudioFile));
  const extension = path.extname(profile.referenceAudioFile).toLowerCase();
  const mimeType = extension === ".mp3" ? "audio/mpeg" : extension === ".m4a" ? "audio/mp4" : "audio/wav";
  return {
    profile: publicProfile(profile),
    referenceAudio: {
      dataUrl: `data:${mimeType};base64,${audio.toString("base64")}`,
      filename: profile.referenceFilename,
      mimeType,
      size: audio.length,
      durationSeconds: profile.qualityReport.durationSeconds
    } satisfies ReferenceAudioPayload
  };
}

export async function deleteVoiceProfile(id: string) {
  assertProfileId(id);
  const metadataPath = profileMetadataPath(id);
  const profile = JSON.parse(await fs.readFile(metadataPath, "utf8")) as VoiceProfileRecord;
  await fs.unlink(metadataPath);
  await fs.unlink(safeJoin(profilesDir, profile.referenceAudioFile)).catch(() => undefined);
  return { id };
}
