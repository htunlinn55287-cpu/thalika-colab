import fs from "node:fs/promises";
import { ensureDataDirs, localIsoString, reviewsDir, safeJoin } from "../file-utils";
import { parseMarkdown, serializeMarkdown, toNumber } from "../markdown-utils";
import type { ListeningReview } from "../types";

function reviewPath(jobId: string) {
  if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error("Invalid job id");
  return safeJoin(reviewsDir, `${jobId}.md`);
}

export async function saveListeningReview(input: Omit<ListeningReview, "overallScore" | "updatedAt">) {
  await ensureDataDirs();
  const overallScore = Math.round(((input.speakerSimilarity + input.burmesePronunciation + input.naturalness + input.noise) / 4) * 20);
  const review: ListeningReview = { ...input, overallScore, updatedAt: localIsoString() };
  await fs.writeFile(
    reviewPath(input.jobId),
    serializeMarkdown(
      {
        jobId: review.jobId,
        speakerSimilarity: review.speakerSimilarity,
        burmesePronunciation: review.burmesePronunciation,
        naturalness: review.naturalness,
        noise: review.noise,
        overallScore: review.overallScore,
        approval: review.approval,
        hasNotes: Boolean(input.notes),
        updatedAt: review.updatedAt
      },
      input.notes || "Human listening QA review."
    ),
    "utf8"
  );
  return review;
}

export async function readListeningReview(jobId: string): Promise<ListeningReview | undefined> {
  try {
    const parsed = parseMarkdown(await fs.readFile(reviewPath(jobId), "utf8"));
    return {
      jobId,
      speakerSimilarity: toNumber(parsed.frontmatter.speakerSimilarity),
      burmesePronunciation: toNumber(parsed.frontmatter.burmesePronunciation),
      naturalness: toNumber(parsed.frontmatter.naturalness),
      noise: toNumber(parsed.frontmatter.noise),
      overallScore: toNumber(parsed.frontmatter.overallScore),
      approval: parsed.frontmatter.approval === "approved" ? "approved" : "review_needed",
      // New records carry hasNotes; for older records fall back to the placeholder check.
      notes:
        "hasNotes" in parsed.frontmatter
          ? parsed.frontmatter.hasNotes === "true"
            ? parsed.body
            : ""
          : parsed.body === "Human listening QA review."
            ? ""
            : parsed.body,
      updatedAt: parsed.frontmatter.updatedAt || ""
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function deleteListeningReview(jobId: string) {
  await fs.unlink(reviewPath(jobId)).catch((error) => {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  });
}
