import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import { jobsDir, safeJoin } from "@/lib/file-utils";
import { saveListeningReview } from "@/lib/storage/listening-review-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  speakerSimilarity: z.number().int().min(1).max(5),
  burmesePronunciation: z.number().int().min(1).max(5),
  naturalness: z.number().int().min(1).max(5),
  noise: z.number().int().min(1).max(5),
  approval: z.enum(["approved", "review_needed"]),
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
});

export async function PUT(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Listening QA scores must be between 1 and 5" }, { status: 400 });
  try {
    const jobId = (await context.params).jobId;
    await fs.access(safeJoin(jobsDir, `${jobId}.md`));
    return NextResponse.json({ review: await saveListeningReview({ jobId, ...parsed.data }) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ error: "History item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save listening review" }, { status: 400 });
  }
}
