import { NextResponse } from "next/server";
import { listScripts } from "@/lib/storage/script-store";

export const runtime = "nodejs";

export async function GET() {
  const scripts = await listScripts(20);
  return NextResponse.json({ scripts });
}
