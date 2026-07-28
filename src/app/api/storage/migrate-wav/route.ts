import { NextResponse } from "next/server";
import {
  getOutputWavMigrationStatus,
  migrateLegacyOutputsToPcmWav
} from "@/lib/storage/output-wav-migration";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getOutputWavMigrationStatus());
}

export async function POST(request: Request) {
  let body: { confirm?: boolean };

  try {
    body = (await request.json()) as { confirm?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Migration requires explicit confirmation." },
      { status: 400 }
    );
  }

  return NextResponse.json(await migrateLegacyOutputsToPcmWav());
}
