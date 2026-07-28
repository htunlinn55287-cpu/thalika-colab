import { NextResponse } from "next/server";
import { z } from "zod";
import { createVoiceProfile, listVoiceProfiles } from "@/lib/storage/voice-profile-store";

export const runtime = "nodejs";

const qualitySchema = z.object({
  durationSeconds: z.number().positive(),
  silenceRatio: z.number().min(0).max(1),
  clippingRatio: z.number().min(0).max(1),
  rms: z.number().finite().min(0).max(16, "Reference RMS level is unexpectedly high"),
  peak: z.number().finite().min(0).max(16, "Reference peak level is unexpectedly high"),
  score: z.number().min(0).max(100),
  status: z.enum(["pass", "warn", "block"]),
  issues: z.array(z.string().max(200)).max(20)
});
const requestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  consent: z.literal(true),
  referenceAudio: z.object({
    dataUrl: z.string().startsWith("data:audio/"),
    filename: z.string().min(1).max(150),
    mimeType: z.string().startsWith("audio/"),
    size: z.number().positive().max(10 * 1024 * 1024),
    durationSeconds: z.number().positive().optional()
  }),
  referenceText: z.string().trim().max(2000).optional().default(""),
  qualityReport: qualitySchema,
  preferredCloneMode: z.enum(["balanced", "high_fidelity"]).optional(),
  preferredCloneStrength: z.number().min(1).max(3).optional(),
  preferredDenoiseReference: z.boolean().optional(),
  preferredNormalizeText: z.boolean().optional()
});

export async function GET() {
  return NextResponse.json({ profiles: await listVoiceProfiles() });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
          .join(". ")
      },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json({ profile: await createVoiceProfile(parsed.data) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save voice profile" }, { status: 400 });
  }
}
