"use client";

import { FileText, Keyboard } from "lucide-react";
import { MAX_SCRIPT_CHARACTERS } from "@/lib/script-limits";

interface ScriptInputProps {
  title: string;
  script: string;
  error?: string;
  onTitleChange: (value: string) => void;
  onScriptChange: (value: string) => void;
}

export function ScriptInput({ title, script, error, onTitleChange, onScriptChange }: ScriptInputProps) {
  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
            <Keyboard size={19} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-studio-text">Script Input</h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-studio-border bg-studio-panelSoft px-3 py-1 text-xs text-studio-muted">
          <FileText size={14} />
          {script.length}/{MAX_SCRIPT_CHARACTERS.toLocaleString()}
        </span>
      </div>

      <label className="mb-2 block text-sm font-medium text-studio-muted" htmlFor="title">
        Title
      </label>
      <input
        id="title"
        maxLength={100}
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="Optional script title"
        className="studio-control-bg mb-4 w-full rounded-2xl border border-white/10 px-4 py-3 text-studio-text outline-none transition focus:border-studio-accent"
      />

      <label className="mb-2 block text-sm font-medium text-studio-muted" htmlFor="script">
        Script
      </label>
      <textarea
        id="script"
        value={script}
        onChange={(event) => onScriptChange(event.target.value)}
        placeholder="Paste the voice script here..."
        className="studio-control-bg min-h-72 w-full resize-y rounded-[1.8rem] border border-white/10 px-4 py-3 leading-7 text-studio-text outline-none transition placeholder:text-studio-muted/60 focus:border-studio-accent"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className={error ? "text-red-600" : "text-studio-muted"}>
          {error || "Long scripts are chunked automatically and saved as one final WAV."}
        </span>
        <span className="text-studio-muted">{script.trim().split(/\s+/).filter(Boolean).length} words</span>
      </div>
    </section>
  );
}
