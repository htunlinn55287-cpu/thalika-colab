import { NextResponse } from "next/server";
import { z } from "zod";
import { writeEnvKey } from "@/lib/storage/env-store";
import { getVoxCPM2BaseUrl } from "@/lib/providers/voxcpm2-health";

export const runtime = "nodejs";

const requestSchema = z.object({
  baseUrl: z.string().trim().url("Enter a valid http(s) URL").max(300)
});

export async function GET() {
  return NextResponse.json({ baseUrl: await getVoxCPM2BaseUrl() });
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
    return NextResponse.json({ ok: false, error: parsed.error.issues.map((i) => i.message).join(". ") }, { status: 400 });
  }

  await writeEnvKey("HF_VOXCPM2_URL", parsed.data.baseUrl.replace(/\/+$/, ""));
  return NextResponse.json({ ok: true, baseUrl: await getVoxCPM2BaseUrl() });
}
