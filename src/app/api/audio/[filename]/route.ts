import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { detectAudioFileFormat } from "@/lib/audio-utils";
import { outputsDir, safeJoin } from "@/lib/file-utils";

export const runtime = "nodejs";

function parseRange(rangeHeader: string | null, fileSize: number) {
  if (!rangeHeader) return undefined;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : undefined;
  const end = match[2] ? Number(match[2]) : undefined;
  if (start === undefined && end === undefined) return null;

  if (start === undefined) {
    const suffixLength = Math.min(end || 0, fileSize);
    return suffixLength > 0 ? { start: fileSize - suffixLength, end: fileSize - 1 } : null;
  }

  const resolvedEnd = Math.min(end ?? fileSize - 1, fileSize - 1);
  return Number.isSafeInteger(start) && Number.isSafeInteger(resolvedEnd) && start >= 0 && start <= resolvedEnd
    ? { start, end: resolvedEnd }
    : null;
}

export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;

  let filePath: string;
  try {
    filePath = safeJoin(outputsDir, filename);
  } catch {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension !== "mp3" && extension !== "wav") {
    return NextResponse.json({ error: "Unsupported audio format" }, { status: 400 });
  }

  try {
    const { size } = await fs.stat(filePath);
    const actualFormat = await detectAudioFileFormat(filePath);
    const contentType = actualFormat === "mp3" ? "audio/mpeg" : "audio/wav";
    const range = parseRange(request.headers.get("range"), size);
    if (range === null) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` }
      });
    }

    const stream = createReadStream(filePath, range);
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(range ? range.end - range.start + 1 : size),
      "Cache-Control": "no-store"
    };

    if (range) {
      headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    }

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: range ? 206 : 200,
      headers: {
        ...headers
      }
    });
  } catch {
    return NextResponse.json({ error: "Audio file not found" }, { status: 404 });
  }
}
