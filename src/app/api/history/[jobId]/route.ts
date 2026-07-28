import { NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/storage/job-store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "History item not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    completedChunks: job.completedChunks ?? 0,
    totalChunks: job.totalChunks ?? 0,
    progressMessage: job.progressMessage ?? "",
    audioFile: job.audioFile,
    audioUrl: job.audioFile ? `/api/audio/${job.audioFile}` : undefined,
    error: job.error,
    provider: job.provider,
    createdAt: job.createdAt
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;

  try {
    const deleted = await deleteJob(jobId);
    return NextResponse.json({
      ok: true,
      deleted
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ ok: false, error: "History item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not delete history item" }, { status: 400 });
  }
}
