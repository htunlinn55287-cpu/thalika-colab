import fs from "node:fs/promises";
import path from "node:path";
import { ensureDataDirs, logsDir } from "../file-utils";

const generationLogPath = path.join(logsDir, "generation.log");

export async function appendGenerationLog(event: string, details: Record<string, string | number | boolean | undefined> = {}) {
  await ensureDataDirs();
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details
  });
  await fs.appendFile(generationLogPath, `${entry}\n`, "utf8");
}
