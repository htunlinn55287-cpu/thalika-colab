"use client";

import { CheckCircle2, Clock3, Download, ExternalLink, Pause, Play, Save, Star, Trash2, Volume2, X } from "lucide-react";
import { useRef, useState } from "react";
import type { ListeningReview } from "@/lib/types";

interface HistoryJob {
  id: string;
  title: string;
  provider: string;
  emotion: string;
  format: string;
  createdAt: string;
  audioFile?: string;
  rawAudioFile?: string;
  status: string;
  completedChunks?: number;
  totalChunks?: number;
  progressMessage?: string;
  review?: ListeningReview;
}

interface HistoryPanelProps {
  jobs: HistoryJob[];
  deletingJobId?: string;
  onDelete: (job: HistoryJob) => void;
  onReviewSaved?: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function HistoryAudioPlayer({ filename }: { filename: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioUrl = `/api/audio/${filename}`;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        // play() rejects on autoplay policy or a missing/404 file; keep the button in sync.
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const nextTime = (value / 100) * duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function changePlaybackRate(value: number) {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = value;
    setPlaybackRate(value);
  }

  return (
    <div className="studio-control-bg rounded-[1.6rem] border border-white/10 p-3">
      <audio
        ref={audioRef}
        preload="metadata"
        src={audioUrl}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="grid gap-3">
        <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[1.2rem] bg-studio-accent text-white transition hover:bg-emerald-700"
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3 text-xs text-studio-muted">
            <span className="inline-flex min-w-0 items-center gap-2 text-studio-accent">
              <Volume2 size={14} className="shrink-0" />
              <span>Voice over</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={(event) => seek(Number(event.target.value))}
            className="h-2 w-full accent-studio-accent"
            aria-label={`Seek ${filename}`}
          />
        </div>
      </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pl-0 sm:pl-[52px]">
        <div className="studio-soft-chip-bg flex rounded-full border border-white/10 p-1">
          {[0.8, 1, 1.2].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => changePlaybackRate(rate)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                playbackRate === rate ? "bg-studio-accent text-white" : "text-studio-muted hover:text-studio-text"
              }`}
            >
              {rate.toFixed(1)}x
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <a
            href={audioUrl}
            download={filename}
            className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-studio-text transition hover:border-studio-accent"
          >
            <Download size={14} />
            Download
          </a>
          <a
            href={audioUrl}
            target="_blank"
            rel="noreferrer"
            className="studio-soft-chip-bg inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-studio-text transition hover:border-studio-accent"
          >
            <ExternalLink size={14} />
            Open
          </a>
        </div>
      </div>
      </div>
    </div>
  );
}

export function HistoryPanel({ jobs, deletingJobId, onDelete, onReviewSaved }: HistoryPanelProps) {
  const [reviewJob, setReviewJob] = useState<HistoryJob | undefined>();
  const [review, setReview] = useState({ speakerSimilarity: 4, burmesePronunciation: 4, naturalness: 4, noise: 4, approval: "review_needed" as "approved" | "review_needed", notes: "" });
  const [reviewError, setReviewError] = useState("");

  function openReview(job: HistoryJob) {
    setReviewJob(job);
    setReviewError("");
    setReview(job.review ? { speakerSimilarity: job.review.speakerSimilarity, burmesePronunciation: job.review.burmesePronunciation, naturalness: job.review.naturalness, noise: job.review.noise, approval: job.review.approval, notes: job.review.notes || "" } : { speakerSimilarity: 4, burmesePronunciation: 4, naturalness: 4, noise: 4, approval: "review_needed", notes: "" });
  }

  async function saveReview() {
    if (!reviewJob) return;
    const response = await fetch(`/api/history/${encodeURIComponent(reviewJob.id)}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(review)
    });
    const data = await response.json();
    if (!response.ok) {
      setReviewError(data.error || "Could not save listening QA.");
      return;
    }
    setReviewJob(undefined);
    onReviewSaved?.();
  }

  return (
    <section className="studio-card-bg rounded-[2.2rem] border border-white/10 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-studio-accent/10 text-studio-accent">
            <Clock3 size={19} />
          </div>
          <h2 className="text-lg font-semibold text-studio-text">History</h2>
        </div>
        <span className="studio-soft-chip-bg rounded-full border border-white/10 px-3 py-1 text-sm text-studio-muted">{jobs.length} recent</span>
      </div>
      <div className="grid gap-3">
        {jobs.length === 0 && <p className="text-sm text-studio-muted">Generated jobs will appear here.</p>}
        {jobs.map((job) => (
          <article key={job.id} className="studio-nested-card-bg grid gap-4 rounded-[1.85rem] border border-white/10 p-4 lg:grid-cols-[minmax(220px,0.36fr)_minmax(0,0.64fr)] lg:items-center">
            <div className="grid gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-studio-text">{job.title}</h3>
                <p className="mt-1 text-xs text-studio-muted">{job.createdAt}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-studio-muted">
                <span className="studio-soft-chip-bg rounded-full border border-white/10 px-2 py-1">{job.provider}</span>
                <span className="studio-soft-chip-bg rounded-full border border-white/10 px-2 py-1">{job.emotion}</span>
                <span className="studio-soft-chip-bg rounded-full border border-white/10 px-2 py-1">{job.format}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-studio-border px-2 py-1 text-xs text-studio-muted">
                  {job.status}
                  {job.status === "generating" && job.totalChunks ? ` ${job.completedChunks || 0}/${job.totalChunks}` : ""}
                </span>
                <span className={`rounded-full border px-2 py-1 text-xs ${job.review?.approval === "approved" ? "border-emerald-300 text-emerald-700" : "border-amber-300 text-amber-700"}`}>
                  {job.review ? `${job.review.overallScore}/100 ${job.review.approval === "approved" ? "approved" : "review needed"}` : "review needed"}
                </span>
                {job.audioFile && (
                  <button type="button" onClick={() => openReview(job)} className="inline-flex items-center gap-1 rounded-full border border-studio-border px-2 py-1 text-xs font-semibold text-studio-text">
                    <Star size={13} /> Review
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(job)}
                  disabled={deletingJobId === job.id}
                  className="inline-flex items-center gap-1 rounded-full border border-red-300/50 px-2 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Delete ${job.title}`}
                >
                  <Trash2 size={13} />
                  {deletingJobId === job.id ? "Deleting" : "Delete"}
                </button>
              </div>
              {job.status === "generating" && job.progressMessage && <p className="text-xs text-studio-muted">{job.progressMessage}</p>}
            </div>
            {job.audioFile && (
              <div className="flex flex-col gap-2">
                {job.rawAudioFile && <p className="text-xs font-medium text-studio-muted">Mastered</p>}
                <HistoryAudioPlayer filename={job.audioFile} />
                {job.rawAudioFile && (
                  <>
                    <p className="text-xs font-medium text-studio-muted">Raw (un-mastered) — A/B</p>
                    <HistoryAudioPlayer filename={job.rawAudioFile} />
                  </>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {reviewJob && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" className="studio-card-bg w-full max-w-lg rounded-[2rem] border border-white/10 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-studio-text">Listening QA</h2><p className="text-sm text-studio-muted">Score the generated voice after listening.</p></div>
              <button type="button" onClick={() => setReviewJob(undefined)} aria-label="Close listening QA" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-studio-muted"><X size={16} /></button>
            </div>
            <div className="grid gap-3">
              {([
                ["speakerSimilarity", "Speaker similarity"],
                ["burmesePronunciation", "Burmese pronunciation"],
                ["naturalness", "Naturalness"],
                ["noise", "Clean audio"]
              ] as const).map(([key, label]) => (
                <label key={key} className="grid gap-2 text-sm font-medium text-studio-muted">
                  <span className="flex justify-between"><span>{label}</span><strong className="text-studio-text">{review[key]}/5</strong></span>
                  <input type="range" min="1" max="5" step="1" value={review[key]} onChange={(event) => setReview((value) => ({ ...value, [key]: Number(event.target.value) }))} className="accent-studio-accent" />
                </label>
              ))}
              <label className="studio-control-bg flex items-center justify-between rounded-2xl border border-white/10 px-3 py-3 text-sm text-studio-muted">
                <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} /> Approve for production</span>
                <input type="checkbox" checked={review.approval === "approved"} onChange={(event) => setReview((value) => ({ ...value, approval: event.target.checked ? "approved" : "review_needed" }))} className="h-4 w-4 accent-studio-accent" />
              </label>
              <textarea value={review.notes} onChange={(event) => setReview((value) => ({ ...value, notes: event.target.value }))} maxLength={1000} placeholder="Optional notes..." className="studio-control-bg min-h-20 rounded-2xl border border-white/10 px-3 py-3 text-sm text-studio-text" />
              {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
              <button type="button" onClick={() => void saveReview()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-studio-accent px-4 py-3 text-sm font-semibold text-white"><Save size={15} /> Save Listening QA</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
