import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { dataDir, ensureDataDirs, jobsDir, memoryFile, outputsDir, profilesDir, reviewsDir, scriptsDir } from "@/lib/file-utils";

export const runtime = "nodejs";

interface FolderDefinition {
  id: "data" | "scripts" | "jobs" | "outputs" | "profiles" | "reviews" | "memory";
  label: string;
  description: string;
  path: string;
  extensions: string[];
}

const folderDefinitions: FolderDefinition[] = [
  {
    id: "data",
    label: "Data root",
    description: "Main local-first storage folder.",
    path: dataDir,
    extensions: [] as string[]
  },
  {
    id: "scripts",
    label: "Scripts",
    description: "Saved original and rewritten script Markdown files.",
    path: scriptsDir,
    extensions: [".md"]
  },
  {
    id: "jobs",
    label: "Jobs",
    description: "Generation job metadata stored as Markdown.",
    path: jobsDir,
    extensions: [".md"]
  },
  {
    id: "outputs",
    label: "Audio outputs",
    description: "Generated PCM WAV masters and migration-compatible legacy audio files.",
    path: outputsDir,
    extensions: [".wav", ".mp3"]
  },
  {
    id: "profiles",
    label: "Voice profiles",
    description: "Consented local reference audio and profile metadata.",
    path: profilesDir,
    extensions: [".json", ".wav", ".mp3", ".m4a"]
  },
  {
    id: "reviews",
    label: "Listening QA",
    description: "Human listening review scores stored as Markdown.",
    path: reviewsDir,
    extensions: [".md"]
  },
  {
    id: "memory",
    label: "Memory",
    description: "Local memory notes and temporary voice-over draft state.",
    path: path.dirname(memoryFile),
    extensions: [".md", ".json"]
  }
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

async function inspectFolder(folder: FolderDefinition) {
  await fs.mkdir(folder.path, { recursive: true });
  const entries = await fs.readdir(folder.path, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.startsWith(".") &&
          (folder.extensions.length === 0 || folder.extensions.includes(path.extname(entry.name)))
      )
      .map(async (entry) => {
        const filePath = path.join(folder.path, entry.name);
        const stat = await fs.stat(filePath);
        return {
          name: entry.name,
          size: stat.size,
          sizeLabel: formatBytes(stat.size),
          modifiedAt: stat.mtime.toISOString()
        };
      })
  );

  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  return {
    id: folder.id,
    label: folder.label,
    description: folder.description,
    path: folder.path,
    fileCount: files.length,
    totalBytes,
    totalSizeLabel: formatBytes(totalBytes),
    latestModifiedAt: files[0]?.modifiedAt || "",
    files: files.slice(0, 12)
  };
}

export async function GET() {
  await ensureDataDirs();
  const folders = await Promise.all(folderDefinitions.map(inspectFolder));

  return NextResponse.json({
    root: dataDir,
    folders,
    updatedAt: new Date().toISOString()
  });
}
