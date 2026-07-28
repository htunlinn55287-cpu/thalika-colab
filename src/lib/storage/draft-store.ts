import fs from "node:fs/promises";
import path from "node:path";
import { ensureDataDirs, memoryFile } from "../file-utils";

const voiceOverDraftFile = path.join(path.dirname(memoryFile), "voice-over-draft.json");

export interface VoiceOverDraft {
  title: string;
  script: string;
  createdAt: string;
}

export async function saveVoiceOverDraft(input: { title?: string; script: string }) {
  await ensureDataDirs();
  const draft: VoiceOverDraft = {
    title: input.title?.trim() || "Narration Rewrite",
    script: input.script.trim(),
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(voiceOverDraftFile, JSON.stringify(draft, null, 2), "utf8");
  return draft;
}

export async function readVoiceOverDraft() {
  try {
    const raw = await fs.readFile(voiceOverDraftFile, "utf8");
    return JSON.parse(raw) as VoiceOverDraft;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function deleteVoiceOverDraft() {
  try {
    await fs.unlink(voiceOverDraftFile);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
