import type { DialogueSegment, DialogueSpeaker } from "./types";
const sentenceBoundary = /([^။၊.!?\n]+[။၊.!?]?|\n+)/g;

function splitOversizedSegment(segment: string, maxCharacters: number) {
  const chunks: string[] = [];
  let remaining = segment.trim();

  while (remaining.length > maxCharacters) {
    const window = remaining.slice(0, maxCharacters + 1);
    const lastSpace = Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n"), window.lastIndexOf("\t"));
    const splitAt = lastSpace > maxCharacters * 0.45 ? lastSpace : maxCharacters;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function splitScriptIntoChunks(script: string, maxCharacters: number) {
  const normalized = script.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const segments = Array.from(normalized.matchAll(sentenceBoundary))
    .map((match) => match[0].trim())
    .filter(Boolean)
    .flatMap((segment) => splitOversizedSegment(segment, maxCharacters));

  const chunks: string[] = [];
  let current = "";

  for (const segment of segments) {
    const candidate = current ? `${current} ${segment}` : segment;
    if (candidate.length <= maxCharacters) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    current = segment;
  }

  if (current) chunks.push(current);
  return chunks;
}
const speakerTagPattern = /^\s*\[(A|B)\]\s*:\s*/i;

// Detects "[A]: ..." / "[B]: ..." tags the user writes directly in the script. Untagged lines
// stay attached to the current speaker ("main" narrator by default) so a paragraph doesn't need
// re-tagging on every line — only the line where the speaker changes needs a tag.
export function scriptHasDialogueTags(script: string): boolean {
  return /^\s*\[(A|B)\]\s*:/im.test(script);
}

export function parseDialogueSegments(script: string): DialogueSegment[] {
  const normalized = script.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const segments: DialogueSegment[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(speakerTagPattern);
    const speaker: DialogueSpeaker = match ? (match[1].toUpperCase() as DialogueSpeaker) : "main";
    const text = match ? line.slice(match[0].length).trim() : line;
    if (!text) continue;

    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) {
      last.text = `${last.text} ${text}`;
    } else {
      segments.push({ speaker, text });
    }
  }

  return segments;
}

// Chunks each speaker segment independently (never merges text across a speaker change) so a
// generated audio chunk always belongs to exactly one speaker's reference voice.
export function splitDialogueIntoChunks(segments: DialogueSegment[], maxCharacters: number): DialogueSegment[] {
  return segments.flatMap((segment) =>
    splitScriptIntoChunks(segment.text, maxCharacters).map((text) => ({
      speaker: segment.speaker,
      text
    }))
  );
}