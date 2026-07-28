"use client";

import { Download, Volume2 } from "lucide-react";

interface AudioResult {
  audioUrl: string;
  filename: string;
  provider: string;
  createdAt: string;
}

interface AudioPreviewProps {
  result?: AudioResult;
}

export function AudioPreview({ result }: AudioPreviewProps) {
  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
          <Volume2 size={19} />
        </div>
        <h2 className="text-lg font-semibold text-studio-text">Audio Preview</h2>
      </div>
      {result ? (
        <div className="mt-4 grid gap-4">
          <audio controls src={result.audioUrl} />
          <div className="grid gap-1 text-sm text-studio-muted">
            <span className="break-all text-studio-text">{result.filename}</span>
            <span>Provider: {result.provider}</span>
            <span>Created: {result.createdAt}</span>
          </div>
          <a
            href={result.audioUrl}
            download={result.filename}
            className="studio-soft-chip-bg inline-flex items-center justify-center gap-2 rounded-[1.5rem] border border-white/10 px-4 py-3 text-sm font-semibold text-studio-text transition hover:border-studio-accent"
          >
            <Download size={17} />
            Download Audio
          </a>
        </div>
      ) : (
        <p className="mt-3 text-sm text-studio-muted">No audio generated yet.</p>
      )}
    </section>
  );
}
