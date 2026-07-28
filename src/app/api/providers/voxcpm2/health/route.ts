import { NextResponse } from "next/server";
import { checkVoxCPM2Health } from "@/lib/providers/voxcpm2-health";

export const runtime = "nodejs";

export async function GET() {
  const health = await checkVoxCPM2Health();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
