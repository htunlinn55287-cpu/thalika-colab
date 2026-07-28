import type { BurmeseLexiconEntry, BurmeseNormalizationChange, BurmeseNormalizationResult } from "./types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Any Unicode combining mark (Mn/Mc/Me) — Burmese medials, vowel signs, tone marks, asat.
const COMBINING_MARK = /\p{M}/u;
// MYANMAR SIGN VIRAMA: invisibly subjoins the FOLLOWING consonant into the current cluster.
const VIRAMA = "္";

export function normalizeBurmeseScript(script: string, entries: BurmeseLexiconEntry[], lexiconRevision: string): BurmeseNormalizationResult {
  const originalScript = script;
  const changes: BurmeseNormalizationChange[] = [];
  const canonicalDigits = script.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10));
  if (canonicalDigits !== script) {
    changes.push({ source: "Full-width digits", spoken: "ASCII digits", reason: "Safe numeric canonicalization" });
  }
  let normalizedScript = canonicalDigits
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *([၊။]) */g, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const orderedEntries = [...entries].sort((a, b) => b.source.length - a.source.length);
  for (const entry of orderedEntries) {
    // Match the source in the same NFC form as the script, and only replace whole grapheme
    // clusters: skip any occurrence whose edge cuts a Burmese cluster, which would orphan a
    // medial/vowel sign from its base consonant and corrupt the spoken output.
    const source = entry.source.normalize("NFC");
    if (!source) continue;
    const matcher = new RegExp(escapeRegExp(source), "gu");
    let applied = false;
    const updated = normalizedScript.replace(matcher, (match: string, offset: number, full: string) => {
      const before = offset > 0 ? full[offset - 1] : "";
      const after = full[offset + match.length] ?? "";
      const startsMidCluster = COMBINING_MARK.test(match[0]) || before === VIRAMA;
      const endsMidCluster = COMBINING_MARK.test(after);
      if (startsMidCluster || endsMidCluster) return match;
      applied = true;
      return entry.spoken;
    });
    if (!applied) continue;
    normalizedScript = updated;
    changes.push({
      source: entry.source,
      spoken: entry.spoken,
      reason: entry.note || "Local pronunciation lexicon"
    });
  }

  return {
    originalScript,
    normalizedScript,
    changes,
    lexiconRevision
  };
}
