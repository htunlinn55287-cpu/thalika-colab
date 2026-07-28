import { NextResponse } from "next/server";
import { z } from "zod";
import { getGeminiApiKey, maskSecret, writeEnvKey } from "@/lib/storage/env-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  apiKey: z.string().trim().min(1, "Gemini API key is required").max(500, "Gemini API key is too long")
});

export async function GET() {
  const apiKey = await getGeminiApiKey();
  return NextResponse.json({
    configured: Boolean(apiKey),
    maskedKey: maskSecret(apiKey),
    source: apiKey ? "local-env" : "missing"
  });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((issue) => issue.message).join(". ") },
      { status: 400 }
    );
  }

  const apiKey = await writeEnvKey("GEMINI_API_KEY", parsed.data.apiKey);
  return NextResponse.json({
    ok: true,
    configured: Boolean(apiKey),
    maskedKey: maskSecret(apiKey)
  });
}
