type FrontmatterValue = string | number | boolean | undefined;

export function serializeMarkdown(frontmatter: Record<string, FrontmatterValue>, body: string) {
  const lines = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

export function parseMarkdown(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: markdown };
  }

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2].trim() };
}

export function toNumber(value: string | undefined, fallback = 0) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
