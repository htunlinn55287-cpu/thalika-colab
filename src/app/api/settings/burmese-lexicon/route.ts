import { NextResponse } from "next/server";
import { z } from "zod";
import { readBurmeseLexicon, writeBurmeseLexicon } from "@/lib/storage/burmese-lexicon-store";

export const runtime = "nodejs";

const entrySchema = z.object({
  source: z.string().trim().min(1).max(120),
  spoken: z.string().trim().min(1).max(120),
  note: z.string().trim().max(200).optional().or(z.literal(""))
});
const requestSchema = z.object({ entries: z.array(entrySchema).max(500) });

export async function GET() {
  return NextResponse.json(await readBurmeseLexicon());
}

export async function PUT(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Burmese lexicon entries" }, { status: 400 });
  const sources = parsed.data.entries.map((entry) => entry.source.toLocaleLowerCase());
  if (new Set(sources).size !== sources.length) {
    return NextResponse.json({ error: "Burmese lexicon source terms must be unique" }, { status: 400 });
  }
  return NextResponse.json(await writeBurmeseLexicon(parsed.data.entries));
}
