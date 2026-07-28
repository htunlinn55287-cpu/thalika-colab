"use client";

import { FileText, FolderOpen, History, Mic2 } from "lucide-react";
import Link from "next/link";

interface AppHeaderProps {
  activeTab: "script" | "voiceover" | "history" | "storage";
}

export function AppHeader({ activeTab }: AppHeaderProps) {
  const tabClass = (tab: AppHeaderProps["activeTab"]) =>
    `inline-flex items-center gap-2 rounded-[1.35rem] px-4 py-2 text-sm font-semibold transition ${
      activeTab === tab
        ? "border border-studio-accent/25 bg-studio-accent/10 text-emerald-800 shadow-sm shadow-emerald-100"
        : "text-studio-muted hover:bg-white/7 hover:text-studio-text"
    }`;

  return (
    <nav className="flex flex-col gap-3 rounded-[2rem] sm:flex-row sm:items-center sm:justify-start">
      <div className="studio-card-bg flex w-full items-center gap-1 rounded-[1.95rem] border border-white/10 p-1 sm:w-auto">
        <Link href="/script" className={tabClass("script")} prefetch>
          <FileText size={16} />
          Script
        </Link>
        <Link href="/" className={tabClass("voiceover")} prefetch>
          <Mic2 size={16} />
          Voice Over
        </Link>
        <Link href="/history" className={tabClass("history")} prefetch>
          <History size={16} />
          History
        </Link>
        <Link href="/storage" className={tabClass("storage")} prefetch>
          <FolderOpen size={16} />
          Folders
        </Link>
      </div>
    </nav>
  );
}
