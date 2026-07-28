import fs from "node:fs/promises";
import { ensureDataDirs, idStamp, localIsoString, readMarkdownFiles, safeJoin, scriptsDir, wordCount } from "../file-utils";
import { parseMarkdown, serializeMarkdown, toNumber } from "../markdown-utils";
import type { ScriptRecord } from "../types";

export async function saveScript(input: { title?: string; script: string }) {
  await ensureDataDirs();
  const createdAt = localIsoString();
  const id = `script_${idStamp()}`;
  const title = input.title?.trim() || "Untitled Script";
  const record: ScriptRecord = {
    id,
    title,
    createdAt,
    characterCount: input.script.length,
    wordCount: wordCount(input.script),
    content: input.script
  };

  const markdown = serializeMarkdown(
    {
      id: record.id,
      title: record.title,
      createdAt: record.createdAt,
      characterCount: record.characterCount,
      wordCount: record.wordCount
    },
    record.content
  );
  await fs.writeFile(safeJoin(scriptsDir, `${id}.md`), markdown, "utf8");
  return record;
}

export async function listScripts(limit = 20) {
  const files = await readMarkdownFiles(scriptsDir);
  return files
    .map(({ content }) => {
      const parsed = parseMarkdown(content);
      return {
        id: parsed.frontmatter.id || "",
        title: parsed.frontmatter.title || "Untitled Script",
        createdAt: parsed.frontmatter.createdAt || "",
        characterCount: toNumber(parsed.frontmatter.characterCount),
        wordCount: toNumber(parsed.frontmatter.wordCount),
        content: parsed.body
      } satisfies ScriptRecord;
    })
    .filter((script) => script.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getScriptById(id: string) {
  if (!/^script_[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid script id");
  }

  const file = await fs.readFile(safeJoin(scriptsDir, `${id}.md`), "utf8");
  const parsed = parseMarkdown(file);
  return {
    id: parsed.frontmatter.id || id,
    title: parsed.frontmatter.title || "Untitled Script",
    createdAt: parsed.frontmatter.createdAt || "",
    characterCount: toNumber(parsed.frontmatter.characterCount),
    wordCount: toNumber(parsed.frontmatter.wordCount),
    content: parsed.body
  } satisfies ScriptRecord;
}
