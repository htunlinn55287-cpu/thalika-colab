import fs from "node:fs/promises";
import path from "node:path";
import {
  convertRemoteAudioToPcm24Wav,
  detectAudioFileFormat,
  validatePcm24MasterFile
} from "../audio-utils";
import {
  ensureDataDirs,
  jobsDir,
  legacyOutputsBackupDir,
  outputsDir,
  sanitizeFilename
} from "../file-utils";
import { parseMarkdown, serializeMarkdown } from "../markdown-utils";

interface MigrationCandidate {
  filename: string;
  path: string;
  kind: "mp3" | "mislabeled_wav" | "non_master_wav" | "unsupported";
}

export interface OutputWavMigrationStatus {
  totalAudioFiles: number;
  realPcmWavFiles: number;
  legacyMp3Files: number;
  mislabeledWavFiles: number;
  nonMasterWavFiles: number;
  unsupportedFiles: number;
  pendingFiles: number;
  backupDir: string;
}

export interface OutputWavMigrationResult extends OutputWavMigrationStatus {
  convertedFiles: number;
  backedUpFiles: number;
  updatedJobs: number;
  failures: Array<{ filename: string; error: string }>;
}

function isAudioFilename(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return extension === ".wav" || extension === ".mp3";
}

async function listOutputAudioFiles() {
  await ensureDataDirs();
  const entries = await fs.readdir(outputsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isAudioFilename(entry.name))
    .map((entry) => ({
      filename: entry.name,
      path: path.join(outputsDir, entry.name)
    }));
}

async function classifyOutputFile(file: { filename: string; path: string }): Promise<MigrationCandidate | null> {
  try {
    const format = await detectAudioFileFormat(file.path);
    const extension = path.extname(file.filename).toLowerCase();

    if (format === "mp3") {
      return {
        ...file,
        kind: extension === ".wav" ? "mislabeled_wav" : "mp3"
      };
    }

    try {
      await validatePcm24MasterFile(file.path);
      return extension === ".wav"
        ? null
        : { ...file, kind: "non_master_wav" };
    } catch {
      return { ...file, kind: "non_master_wav" };
    }
  } catch {
    return { ...file, kind: "unsupported" };
  }
}

async function inspectCandidates() {
  const files = await listOutputAudioFiles();
  const classifications = await Promise.all(files.map(classifyOutputFile));
  return {
    files,
    candidates: classifications.filter((candidate): candidate is MigrationCandidate => Boolean(candidate))
  };
}

function buildStatus(totalAudioFiles: number, candidates: MigrationCandidate[]): OutputWavMigrationStatus {
  const count = (kind: MigrationCandidate["kind"]) =>
    candidates.filter((candidate) => candidate.kind === kind).length;
  const legacyMp3Files = count("mp3");
  const mislabeledWavFiles = count("mislabeled_wav");
  const nonMasterWavFiles = count("non_master_wav");
  const unsupportedFiles = count("unsupported");

  return {
    totalAudioFiles,
    realPcmWavFiles: totalAudioFiles - candidates.length,
    legacyMp3Files,
    mislabeledWavFiles,
    nonMasterWavFiles,
    unsupportedFiles,
    pendingFiles: candidates.length,
    backupDir: legacyOutputsBackupDir
  };
}

export async function getOutputWavMigrationStatus() {
  const { files, candidates } = await inspectCandidates();
  return buildStatus(files.length, candidates);
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniquePath(dir: string, preferredFilename: string) {
  const extension = path.extname(preferredFilename);
  const stem = path.basename(preferredFilename, extension);
  let filename = sanitizeFilename(preferredFilename);
  let index = 1;

  while (await pathExists(path.join(dir, filename))) {
    filename = sanitizeFilename(`${stem}_${index}${extension}`);
    index += 1;
  }

  return path.join(dir, filename);
}

async function chooseTargetPath(candidate: MigrationCandidate) {
  if (path.extname(candidate.filename).toLowerCase() === ".wav") {
    return candidate.path;
  }

  const targetFilename = `${path.basename(candidate.filename, path.extname(candidate.filename))}.wav`;
  return uniquePath(outputsDir, targetFilename);
}

async function updateJobAudioReferences(previousFilename: string, nextFilename: string) {
  const entries = await fs.readdir(jobsDir, { withFileTypes: true });
  let updatedJobs = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const jobPath = path.join(jobsDir, entry.name);
    const markdown = await fs.readFile(jobPath, "utf8");
    const parsed = parseMarkdown(markdown);
    if (parsed.frontmatter.audioFile !== previousFilename) continue;

    parsed.frontmatter.audioFile = nextFilename;
    parsed.frontmatter.format = "wav";
    const body = parsed.body
      .split(previousFilename)
      .join(nextFilename)
      .replace(/Format:\s*mp3/gi, "Format: wav");
    const temporaryPath = `${jobPath}.tmp`;
    await fs.writeFile(temporaryPath, serializeMarkdown(parsed.frontmatter, body), "utf8");
    await fs.rename(temporaryPath, jobPath);
    updatedJobs += 1;
  }

  return updatedJobs;
}

async function migrateCandidate(candidate: MigrationCandidate) {
  if (candidate.kind === "unsupported") {
    throw new Error("Unsupported audio file; migration skipped.");
  }

  const sourceBytes = await fs.readFile(candidate.path);
  const converted = await convertRemoteAudioToPcm24Wav(sourceBytes);
  const targetPath = await chooseTargetPath(candidate);
  const temporaryPath = path.join(outputsDir, `.migration-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  try {
    await fs.writeFile(temporaryPath, converted.wav);
    await validatePcm24MasterFile(temporaryPath);

    const backupPath = await uniquePath(legacyOutputsBackupDir, candidate.filename);
    await fs.copyFile(candidate.path, backupPath);
    await fs.rename(temporaryPath, targetPath);

    if (targetPath !== candidate.path) {
      await fs.unlink(candidate.path);
    }

    const nextFilename = path.basename(targetPath);
    const updatedJobs = await updateJobAudioReferences(candidate.filename, nextFilename);

    return {
      backupPath,
      nextFilename,
      updatedJobs
    };
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

// migrateCandidate backs up, renames, and rewrites job references with no per-file locking, so
// two overlapping runs would double-back-up and race the in-place .wav rename / job updates.
// Serialize within this process: concurrent callers share the single in-flight run's result
// (the first pass already drains every candidate, so a second scan would just find nothing).
let migrationInFlight: Promise<OutputWavMigrationResult> | null = null;

export function migrateLegacyOutputsToPcmWav(): Promise<OutputWavMigrationResult> {
  if (migrationInFlight) return migrationInFlight;
  migrationInFlight = runOutputWavMigration().finally(() => {
    migrationInFlight = null;
  });
  return migrationInFlight;
}

async function runOutputWavMigration(): Promise<OutputWavMigrationResult> {
  await ensureDataDirs();
  const before = await inspectCandidates();
  let convertedFiles = 0;
  let backedUpFiles = 0;
  let updatedJobs = 0;
  const failures: OutputWavMigrationResult["failures"] = [];

  for (const candidate of before.candidates) {
    try {
      const result = await migrateCandidate(candidate);
      convertedFiles += 1;
      backedUpFiles += 1;
      updatedJobs += result.updatedJobs;
    } catch (error) {
      failures.push({
        filename: candidate.filename,
        error: error instanceof Error ? error.message : "Migration failed."
      });
    }
  }

  const after = await inspectCandidates();
  return {
    ...buildStatus(after.files.length, after.candidates),
    convertedFiles,
    backedUpFiles,
    updatedJobs,
    failures
  };
}
