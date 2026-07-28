"use client";

import { WandSparkles } from "lucide-react";

interface GenerateButtonProps {
  disabled: boolean;
  loading: boolean;
  disabledReason?: string;
  onClick: () => void;
}

export function GenerateButton({ disabled, loading, disabledReason, onClick }: GenerateButtonProps) {
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={disabled ? disabledReason : undefined}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[1.6rem] bg-studio-accent px-5 py-4 font-semibold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-studio-border disabled:text-studio-muted disabled:shadow-none"
      >
        <WandSparkles size={18} />
        {loading ? "Generating..." : "Generate Local Audio"}
      </button>
      {disabled && disabledReason && <p className="px-2 text-sm font-medium text-amber-700">{disabledReason}</p>}
    </div>
  );
}
