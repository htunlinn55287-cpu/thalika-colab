import { NextResponse } from "next/server";
import { listJobs } from "@/lib/storage/job-store";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await listJobs(20);
  return NextResponse.json({ jobs });
}
