import path from "node:path";
import fs from "node:fs/promises";

export const dataDir = path.join(process.cwd(), "data");
export const scriptsDir = path.join(dataDir, "scripts");
export const jobsDir = path.join(dataDir, "jobs");
export const outputsDir = path.join(dataDir, "outputs");
export const legacyOutputsBackupDir = path.join(outputsDir, "legacy-backup");
export const logsDir = path.join(dataDir, "logs");
export const profilesDir = path.join(dataDir, "profiles");
export const reviewsDir = path.join(dataDir, "reviews");
export const memoryFile = path.join(dataDir, "memory", "MEMORY.md");
export const burmeseLexiconFile = path.join(dataDir, "memory", "burmese-lexicon.json");

export async function ensureDataDirs() {
  await Promise.all([
    fs.mkdir(scriptsDir, { recursive: true }),
    fs.mkdir(jobsDir, { recursive: true }),
    fs.mkdir(outputsDir, { recursive: true }),
    fs.mkdir(legacyOutputsBackupDir, { recursive: true }),
    fs.mkdir(logsDir, { recursive: true }),
    fs.mkdir(profilesDir, { recursive: true }),
    fs.mkdir(reviewsDir, { recursive: true }),
    fs.mkdir(path.dirname(memoryFile), { recursive: true })
  ]);
}

export function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

export function safeJoin(baseDir: string, filename: string) {
  const safe = sanitizeFilename(filename);
  if (safe !== filename || safe.includes("..")) {
    throw new Error("Invalid filename");
  }

  const resolved = path.resolve(baseDir, safe);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error("Invalid file path");
  }

  return resolved;
}

export async function readMarkdownFiles(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  return Promise.all(
    files.map(async (filename) => ({
      filename,
      content: await fs.readFile(path.join(dir, filename), "utf8")
    }))
  );
}

export function wordCount(value: string) {
  const matches = value.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function localIsoString(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${offsetHours}:${minutes}`;
}

export function idStamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}_${Math.random().toString(36).slice(2, 7)}`;
}
