import fs from "node:fs/promises";
import { burmeseLexiconFile, ensureDataDirs, idStamp } from "../file-utils";
import type { BurmeseLexiconEntry } from "../types";

interface BurmeseLexiconFile {
  revision: string;
  entries: BurmeseLexiconEntry[];
}

const emptyLexicon: BurmeseLexiconFile = { revision: "builtin", entries: [] };

export async function readBurmeseLexicon(): Promise<BurmeseLexiconFile> {
  await ensureDataDirs();
  try {
    const parsed = JSON.parse(await fs.readFile(burmeseLexiconFile, "utf8")) as BurmeseLexiconFile;
    return {
      revision: parsed.revision || "builtin",
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return emptyLexicon;
    throw error;
  }
}

export async function writeBurmeseLexicon(entries: BurmeseLexiconEntry[]) {
  await ensureDataDirs();
  const lexicon = { revision: `lexicon_${idStamp()}`, entries };
  const temporaryPath = `${burmeseLexiconFile}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(lexicon, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, burmeseLexiconFile);
  return lexicon;
}
