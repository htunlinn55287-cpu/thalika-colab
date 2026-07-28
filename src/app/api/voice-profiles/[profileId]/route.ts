import { NextResponse } from "next/server";
import { deleteVoiceProfile } from "@/lib/storage/voice-profile-store";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ profileId: string }> }) {
  try {
    return NextResponse.json({ ok: true, deleted: await deleteVoiceProfile((await context.params).profileId) });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return NextResponse.json({ error: "Voice profile not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete voice profile" }, { status: 400 });
  }
}
