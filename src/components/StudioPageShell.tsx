import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { AppHeader } from "./AppHeader";

interface StudioPageShellProps {
  activeTab: "script" | "voiceover" | "history" | "storage";
  badge: string;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}

export function StudioPageShell({ activeTab, badge, title, description, aside, children }: StudioPageShellProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1400px] px-3 py-4 sm:px-5 lg:px-8">
      <header className="grid gap-6">
        <AppHeader activeTab={activeTab} />

        <div className="grid gap-5 px-1 pb-1 pt-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.62fr)] lg:items-end">
          <div>
            {/* <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-studio-accent/25 bg-studio-accent/10 px-3 py-1 text-xs font-semibold text-emerald-800">
              <Sparkles size={14} /> {badge}
            </p> */}
            <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-studio-text sm:text-5xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-studio-muted">{description}</p>
          </div>

          {aside}
        </div>
      </header>

      <div className="rounded-[2.75rem] bg-white/72 shadow-2xl shadow-slate-300/45">
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
