import fs from "node:fs/promises";
import path from "node:path";

const envLocalPath = path.join(process.cwd(), ".env.local");

function parseEnvValue(line: string) {
  const separatorIndex = line.indexOf("=");
  const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
  return rawValue.trim().replace(/^["']|["']$/g, "");
}

function serializeEnvValue(value: string) {
  return value.replace(/\r?\n/g, "").trim();
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function readEnvLocal() {
  try {
    return await fs.readFile(envLocalPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function readEnvKey(key: string) {
  const content = await readEnvLocal();
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  return line ? parseEnvValue(line) : "";
}

export async function writeEnvKey(key: string, value: string) {
  const safeValue = serializeEnvValue(value);
  const content = await readEnvLocal();
  const lines = content ? content.split(/\r?\n/) : [];
  const nextLine = `${key}=${safeValue}`;
  const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(nextLine);
  }

  const nextContent = `${lines.join("\n").replace(/\n*$/g, "")}\n`;
  const temporaryPath = `${envLocalPath}.tmp`;
  await fs.writeFile(temporaryPath, nextContent, "utf8");
  await fs.rename(temporaryPath, envLocalPath);
  return safeValue;
}

export async function getGeminiApiKey() {
  const fileValue = await readEnvKey("GEMINI_API_KEY");
  if (fileValue) return fileValue;
  return process.env.GEMINI_API_KEY?.trim() || "";
}
