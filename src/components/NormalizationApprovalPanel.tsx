"use client";

import { CheckCircle2, RefreshCcw } from "lucide-react";
import type { BurmeseNormalizationResult } from "@/lib/types";

interface Props {
  result?: BurmeseNormalizationResult;
  loading: boolean;
  approved: boolean;
  onRefresh: () => void;
  onApprove: () => void;
}

export function NormalizationApprovalPanel({ result, loading, approved, onRefresh, onApprove }: Props) {
  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-studio-text">Burmese Pronunciation Preview</h2>
          <p className="text-sm text-studio-muted">Review safe normalization and local lexicon replacements before generation.</p>
        </div>
        <button type="button" onClick={onRefresh} className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm font-semibold text-studio-text">
          <RefreshCcw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      {result ? (
        <div className="mt-4 grid gap-3">
          <textarea readOnly value={result.normalizedScript} className="studio-control-bg min-h-36 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm leading-6 text-studio-text" />
          <p className="text-xs text-studio-muted">{result.changes.length} lexicon replacement(s) · revision {result.lexiconRevision}</p>
          <button type="button" onClick={onApprove} className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${approved ? "bg-emerald-100 text-emerald-800" : "bg-studio-accent text-white"}`}>
            <CheckCircle2 size={16} /> {approved ? "Pronunciation Preview Approved" : "Approve Pronunciation Preview"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-studio-muted">{loading ? "Preparing preview..." : "Paste a valid Burmese script to prepare the pronunciation preview."}</p>
      )}
    </section>
  );
}
