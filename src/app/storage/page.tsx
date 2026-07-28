"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, CheckCircle2, Copy, ExternalLink, FileAudio2, FileText, FolderOpen, HardDrive, RefreshCcw } from "lucide-react";
import { StudioPageShell } from "@/components/StudioPageShell";

interface LocalFile {
  name: string;
  size: number;
  sizeLabel: string;
  modifiedAt: string;
}

interface LocalFolder {
  id: string;
  label: string;
  description: string;
  path: string;
  fileCount: number;
  totalBytes: number;
  totalSizeLabel: string;
  latestModifiedAt: string;
  files: LocalFile[];
}

interface LocalStorageResponse {
  root: string;
  folders: LocalFolder[];
  updatedAt: string;
}

interface WavMigrationStatus {
  totalAudioFiles: number;
  realPcmWavFiles: number;
  legacyMp3Files: number;
  mislabeledWavFiles: number;
  nonMasterWavFiles: number;
  unsupportedFiles: number;
  pendingFiles: number;
  backupDir: string;
  convertedFiles?: number;
  backedUpFiles?: number;
  updatedJobs?: number;
  failures?: Array<{ filename: string; error: string }>;
}

type StorageStatus = "idle" | "loading" | "ready" | "failed";

const folderIcons: Record<string, typeof FileText> = {
  data: HardDrive,
  scripts: FileText,
  jobs: CheckCircle2,
  outputs: FileAudio2,
  profiles: FileAudio2,
  reviews: CheckCircle2,
  memory: FolderOpen
};

function formatDate(value: string) {
  if (!value) return "No files yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function StoragePage() {
  const [storage, setStorage] = useState<LocalStorageResponse | null>(null);
  const [status, setStatus] = useState<StorageStatus>("idle");
  const [error, setError] = useState("");
  const [copiedPath, setCopiedPath] = useState("");
  const [openError, setOpenError] = useState("");
  const [isElectron, setIsElectron] = useState(false);
  const [migration, setMigration] = useState<WavMigrationStatus | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState("");

  const totals = useMemo(() => {
    const folders = storage?.folders ?? [];
    return {
      files: folders.reduce((total, folder) => total + folder.fileCount, 0),
      bytes: folders.reduce((total, folder) => total + folder.totalBytes, 0)
    };
  }, [storage]);

  const loadStorage = useCallback(async () => {
    setStatus("loading");
    setError("");
    setOpenError("");

    try {
      const response = await fetch("/api/storage/local", { cache: "no-store" });
      const data = (await response.json()) as LocalStorageResponse | { error?: string };
      if (!response.ok || !("folders" in data)) {
        throw new Error("error" in data && data.error ? data.error : "Could not load local folders.");
      }

      setStorage(data);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load local folders.");
      setStatus("failed");
    }
  }, []);

  const loadMigration = useCallback(async () => {
    try {
      const response = await fetch("/api/storage/migrate-wav", { cache: "no-store" });
      const data = (await response.json()) as WavMigrationStatus | { error?: string };
      if (!response.ok || !("pendingFiles" in data)) {
        throw new Error("error" in data && data.error ? data.error : "Could not inspect WAV migration status.");
      }
      setMigration(data);
    } catch (caught) {
      setMigrationMessage(caught instanceof Error ? caught.message : "Could not inspect WAV migration status.");
    }
  }, []);

  useEffect(() => {
    void loadStorage();
    void loadMigration();
  }, [loadMigration, loadStorage]);

  useEffect(() => {
    setIsElectron(Boolean(window.thalikaDesktop?.isElectron));
  }, []);

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(path);
    setCopiedPath(path);
    window.setTimeout(() => setCopiedPath(""), 1200);
  }

  async function openFolder(folder: LocalFolder) {
    setOpenError("");
    if (!window.thalikaDesktop?.openStorageFolder) {
      await copyPath(folder.path);
      setOpenError("Desktop folder opening is available in the Electron app. Path copied instead.");
      return;
    }

    const result = await window.thalikaDesktop.openStorageFolder(folder.id);
    if (!result.ok) {
      setOpenError(result.error || "Could not open local folder.");
    }
  }

  async function migrateLegacyAudio() {
    if (!migration?.pendingFiles || migrationBusy) return;
    if (!window.confirm(`Convert ${migration.pendingFiles} legacy audio file${migration.pendingFiles === 1 ? "" : "s"} into real PCM WAV masters? Original compressed files will be preserved in the legacy backup folder.`)) {
      return;
    }

    setMigrationBusy(true);
    setMigrationMessage("");

    try {
      const response = await fetch("/api/storage/migrate-wav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true })
      });
      const data = (await response.json()) as WavMigrationStatus | { error?: string };
      if (!response.ok || !("pendingFiles" in data)) {
        throw new Error("error" in data && data.error ? data.error : "PCM WAV migration failed.");
      }

      setMigration(data);
      setMigrationMessage(
        `Converted ${data.convertedFiles ?? 0} file${data.convertedFiles === 1 ? "" : "s"}, preserved ${data.backedUpFiles ?? 0} backup${data.backedUpFiles === 1 ? "" : "s"}, and updated ${data.updatedJobs ?? 0} job record${data.updatedJobs === 1 ? "" : "s"}.`
      );
      await loadStorage();
    } catch (caught) {
      setMigrationMessage(caught instanceof Error ? caught.message : "PCM WAV migration failed.");
    } finally {
      setMigrationBusy(false);
    }
  }

  const heroAside = (
    <div className="studio-card-bg grid gap-2 rounded-[2.1rem] border border-white/10 p-2 sm:grid-cols-3">
      <div className="studio-soft-chip-bg rounded-[1.25rem] px-3 py-3">
        <p className="text-xs font-medium text-studio-muted">Files</p>
        <p className="mt-1 text-lg font-semibold text-studio-text">{totals.files}</p>
      </div>
      <div className="studio-soft-chip-bg rounded-[1.25rem] px-3 py-3">
        <p className="text-xs font-medium text-studio-muted">Mode</p>
        <p className="mt-1 text-lg font-semibold text-studio-text">{isElectron ? "Desktop" : "Browser"}</p>
      </div>
      <div className="studio-soft-chip-bg rounded-[1.25rem] px-3 py-3">
        <p className="text-xs font-medium text-studio-muted">Access</p>
        <p className="mt-1 text-lg font-semibold text-studio-text">{isElectron ? "Open" : "Copy"}</p>
      </div>
    </div>
  );

  return (
    <StudioPageShell
      activeTab="storage"
      badge="Local folder access"
      title="Folders"
      description="Review the app-managed local folders for scripts, jobs, audio outputs, and memory without exposing arbitrary files."
      aside={heroAside}
    >
      <section className="studio-card-bg mb-5 rounded-[2.2rem] border border-white/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
              <ArchiveRestore size={19} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-studio-text">PCM WAV Migration</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-studio-muted">
                Convert compressed legacy outputs and mislabeled WAV files into validated 48kHz mono 24-bit PCM WAV masters. Original files stay preserved in a local backup folder.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void migrateLegacyAudio()}
            disabled={!migration?.pendingFiles || migrationBusy}
            className="inline-flex items-center gap-2 rounded-2xl bg-studio-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArchiveRestore size={16} className={migrationBusy ? "animate-spin" : ""} />
            {migrationBusy ? "Migrating" : "Migrate Audio"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="studio-soft-chip-bg rounded-2xl border border-white/10 px-4 py-3">
            <p className="text-xs font-medium text-studio-muted">PCM WAV masters</p>
            <p className="mt-1 text-lg font-semibold text-studio-text">{migration?.realPcmWavFiles ?? "..."}</p>
          </div>
          <div className="studio-soft-chip-bg rounded-2xl border border-white/10 px-4 py-3">
            <p className="text-xs font-medium text-studio-muted">Migration pending</p>
            <p className="mt-1 text-lg font-semibold text-studio-text">{migration?.pendingFiles ?? "..."}</p>
          </div>
          <div className="studio-soft-chip-bg rounded-2xl border border-white/10 px-4 py-3">
            <p className="text-xs font-medium text-studio-muted">Backup location</p>
            <p className="mt-1 truncate text-sm font-semibold text-studio-text">{migration?.backupDir ?? "Loading..."}</p>
          </div>
        </div>

        {migrationMessage && (
          <p className="mt-4 rounded-2xl bg-studio-accent/10 px-4 py-3 text-sm font-medium text-studio-text">
            {migrationMessage}
          </p>
        )}
        {(migration?.failures?.length ?? 0) > 0 && (
          <p className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700">
            {migration?.failures?.length} file migration{migration?.failures?.length === 1 ? "" : "s"} need manual review.
          </p>
        )}
      </section>

      <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
              <FolderOpen size={19} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-studio-text">Local Storage</h2>
              <p className="text-sm text-studio-muted">
                {storage ? `Root: ${storage.root}` : "Loading app-managed folders."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadStorage();
              void loadMigration();
            }}
            className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-studio-text transition hover:border-studio-accent"
          >
            <RefreshCcw size={16} className={status === "loading" ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && <p className="mb-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
        {openError && <p className="mb-4 rounded-2xl bg-amber-400/15 px-4 py-3 text-sm font-medium text-amber-800">{openError}</p>}

        <div className="grid gap-4">
          {(storage?.folders ?? []).map((folder) => {
            const Icon = folderIcons[folder.id] || FolderOpen;
            return (
              <article key={folder.id} className="studio-nested-card-bg rounded-[2rem] border border-white/10 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,1fr)] lg:items-start">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
                          <Icon size={18} />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-studio-text">{folder.label}</h3>
                          <p className="text-sm leading-6 text-studio-muted">{folder.description}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-studio-border px-3 py-1 text-xs font-semibold text-studio-muted">
                        {folder.fileCount} files
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-studio-muted">
                      <p className="break-all rounded-2xl border border-studio-border bg-white/50 px-3 py-2">{folder.path}</p>
                      <p>
                        {folder.totalSizeLabel} total · Latest: {formatDate(folder.latestModifiedAt)}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void openFolder(folder)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-studio-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700"
                      >
                        <ExternalLink size={16} />
                        {isElectron ? "Open Folder" : "Copy Path"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyPath(folder.path)}
                        className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-studio-text transition hover:border-studio-accent"
                      >
                        <Copy size={16} />
                        {copiedPath === folder.path ? "Copied" : "Copy Path"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[1.6rem] border border-studio-border bg-white/45 p-3">
                    <p className="mb-3 text-sm font-semibold text-studio-text">Recent files</p>
                    {folder.files.length === 0 ? (
                      <p className="text-sm text-studio-muted">No files yet.</p>
                    ) : (
                      <div className="grid gap-2">
                        {folder.files.map((file) => (
                          <div key={`${folder.id}-${file.name}`} className="grid gap-1 rounded-2xl bg-white/55 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-sm font-semibold text-studio-text">{file.name}</span>
                              <span className="shrink-0 text-xs text-studio-muted">{file.sizeLabel}</span>
                            </div>
                            <span className="text-xs text-studio-muted">{formatDate(file.modifiedAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </StudioPageShell>
  );
}
