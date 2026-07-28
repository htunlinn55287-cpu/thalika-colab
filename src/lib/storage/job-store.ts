import fs from "node:fs/promises";
import { ensureDataDirs, idStamp, localIsoString, readMarkdownFiles, safeJoin, jobsDir, outputsDir } from "../file-utils";
import { parseMarkdown, serializeMarkdown, toNumber } from "../markdown-utils";
import type { JobRecord, NarrationStyle, OutputFormat, VoiceEmotion } from "../types";
import { deleteListeningReview, readListeningReview } from "./listening-review-store";

export function createJobId() {
  return `job_${idStamp()}`;
}

export async function saveJob(record: Omit<JobRecord, "createdAt"> & { createdAt?: string }) {
  await ensureDataDirs();
  const job: JobRecord = {
    ...record,
    createdAt: record.createdAt || localIsoString()
  };
  const markdown = serializeMarkdown(
    {
      id: job.id,
      scriptId: job.scriptId,
      title: job.title,
      provider: job.provider,
      format: job.format,
      speed: job.speed,
      narrationStyle: job.narrationStyle,
      emotion: job.emotion,
      emotionIntensity: job.emotionIntensity,
      status: job.status,
      audioFile: job.audioFile,
      rawAudioFile: job.rawAudioFile,
      error: job.error,
      completedChunks: job.completedChunks,
      totalChunks: job.totalChunks,
      progressMessage: job.progressMessage,
      voiceProfileId: job.voiceProfileId,
      lexiconRevision: job.lexiconRevision,
      normalizationChanges: job.normalizationChanges,
      referenceQualityScore: job.referenceQualityScore,
      referenceTranscriptUsed: job.referenceTranscriptUsed,
      createdAt: job.createdAt
    },
    job.content
  );

  await fs.writeFile(safeJoin(jobsDir, `${job.id}.md`), markdown, "utf8");
  return job;
}

function jobFromMarkdown(content: string, fallbackId = ""): JobRecord {
  const parsed = parseMarkdown(content);
  return {
    id: parsed.frontmatter.id || fallbackId,
    scriptId: parsed.frontmatter.scriptId || "",
    title: parsed.frontmatter.title || "Untitled Script",
    provider: parsed.frontmatter.provider || "unknown",
    format: (parsed.frontmatter.format || "wav") as OutputFormat,
    speed: toNumber(parsed.frontmatter.speed, 1),
    narrationStyle: (parsed.frontmatter.narrationStyle || "professional") as NarrationStyle,
    emotion: (parsed.frontmatter.emotion || "neutral") as VoiceEmotion,
    emotionIntensity: toNumber(parsed.frontmatter.emotionIntensity, 60),
    status: parsed.frontmatter.status === "failed" ? "failed" : parsed.frontmatter.status === "generating" ? "generating" : "completed",
    audioFile: parsed.frontmatter.audioFile,
    rawAudioFile: parsed.frontmatter.rawAudioFile,
    error: parsed.frontmatter.error,
    completedChunks: toNumber(parsed.frontmatter.completedChunks, 0),
    totalChunks: toNumber(parsed.frontmatter.totalChunks, 0),
    progressMessage: parsed.frontmatter.progressMessage,
    voiceProfileId: parsed.frontmatter.voiceProfileId,
    lexiconRevision: parsed.frontmatter.lexiconRevision,
    normalizationChanges: toNumber(parsed.frontmatter.normalizationChanges, 0),
    referenceQualityScore: toNumber(parsed.frontmatter.referenceQualityScore, 0),
    referenceTranscriptUsed: parsed.frontmatter.referenceTranscriptUsed === "true",
    createdAt: parsed.frontmatter.createdAt || "",
    content: parsed.body
  } satisfies JobRecord;
}

export async function getJob(jobId: string): Promise<JobRecord | undefined> {
  if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId)) return undefined;
  try {
    const content = await fs.readFile(safeJoin(jobsDir, `${jobId}.md`), "utf8");
    const job = jobFromMarkdown(content, jobId);
    return { ...job, review: await readListeningReview(job.id) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function listJobs(limit = 20) {
  const files = await readMarkdownFiles(jobsDir);
  const jobs = files
    .map(({ content }) => jobFromMarkdown(content))
    .filter((job) => job.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  return Promise.all(jobs.map(async (job) => ({ ...job, review: await readListeningReview(job.id) })));
}

export async function deleteJob(jobId: string) {
  await ensureDataDirs();

  if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId)) {
    throw new Error("Invalid job id");
  }

  const jobFilePath = safeJoin(jobsDir, `${jobId}.md`);
  const markdown = await fs.readFile(jobFilePath, "utf8");
  const parsed = parseMarkdown(markdown);
  const audioFile = parsed.frontmatter.audioFile;
  const rawAudioFile = parsed.frontmatter.rawAudioFile;

  await fs.unlink(jobFilePath);
  await deleteListeningReview(jobId);

  // Best-effort: resolve defensively (a malformed legacy filename would make safeJoin throw) and
  // ignore ENOENT, so a missing/odd audio reference can't fail the delete after the record is gone.
  const deleteOutput = async (filename: string | undefined) => {
    if (!filename) return false;
    let outputPath: string | undefined;
    try {
      outputPath = safeJoin(outputsDir, filename);
    } catch {
      return false;
    }
    try {
      await fs.unlink(outputPath);
      return true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
      return false;
    }
  };

  const audioDeleted = await deleteOutput(audioFile);
  await deleteOutput(rawAudioFile);

  return {
    jobId,
    audioFile,
    audioDeleted
  };
}
