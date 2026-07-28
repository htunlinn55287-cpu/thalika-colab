import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteVoiceOverDraft, readVoiceOverDraft, saveVoiceOverDraft } from "@/lib/storage/draft-store";
import { MAX_SCRIPT_CHARACTERS } from "@/lib/script-limits";

export const runtime = "nodejs";

const draftSchema = z.object({
  title: z.string().trim().max(100).optional().or(z.literal("")),
  script: z
    .string()
    .trim()
    .min(10, "Script must be at least 10 characters")
    .max(MAX_SCRIPT_CHARACTERS, `Script must be ${MAX_SCRIPT_CHARACTERS.toLocaleString()} characters or fewer`)
});

export async function GET() {
  const draft = await readVoiceOverDraft();
  return NextResponse.json({ draft });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((issue) => issue.message).join(". ") },
      { status: 400 }
    );
  }

  const draft = await saveVoiceOverDraft(parsed.data);
  return NextResponse.json({ ok: true, draft });
}

export async function DELETE() {
  const deleted = await deleteVoiceOverDraft();
  return NextResponse.json({ ok: true, deleted });
}
