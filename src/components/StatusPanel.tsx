"use client";

import { CheckCircle2, Loader2, Radio, XCircle } from "lucide-react";

export type StudioStatus = "idle" | "saving" | "generating" | "completed" | "failed";

interface StatusPanelProps {
  status: StudioStatus;
  error?: string;
  completedChunks?: number;
  totalChunks?: number;
  progressMessage?: string;
}

const labels: Record<StudioStatus, string> = {
  idle: "Idle",
  saving: "Saving script",
  generating: "Generating audio",
  completed: "Completed",
  failed: "Failed"
};

export function StatusPanel({ status, error, completedChunks, totalChunks, progressMessage }: StatusPanelProps) {
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? XCircle : status === "idle" ? Radio : Loader2;
  const total = totalChunks ?? 0;
  const completed = completedChunks ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const showProgress = status === "generating" && total > 0;

  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
            <Icon size={19} className={status === "saving" || status === "generating" ? "animate-spin" : ""} />
          </div>
          <h2 className="text-lg font-semibold text-studio-text">Status</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            status === "completed"
              ? "bg-emerald-400/15 text-emerald-800"
              : status === "failed"
                ? "bg-red-400/15 text-red-700"
                : "bg-studio-border text-studio-muted"
          }`}
        >
          {labels[status]}
        </span>
      </div>
      <p className="mt-3 text-sm text-studio-muted">
        {status === "idle" && "Waiting for a valid script."}
        {status === "saving" && "Writing Markdown files into local storage."}
        {status === "generating" && (progressMessage || "Generating audio through the selected provider.")}
        {status === "completed" && "Audio is ready for preview and download."}
        {status === "failed" && (error || "Something went wrong.")}
      </p>
      {showProgress && (
        <div className="mt-3 grid gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-studio-border">
            <div className="h-full rounded-full bg-studio-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-xs font-medium text-studio-muted">
            Segment {Math.min(completed + 1, total)} of {total} · {percent}%
          </span>
        </div>
      )}
    </section>
  );
}
