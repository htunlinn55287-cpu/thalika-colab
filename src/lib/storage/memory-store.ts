import fs from "node:fs/promises";
import { ensureDataDirs, memoryFile } from "../file-utils";

export async function readMemory() {
  await ensureDataDirs();
  try {
    return await fs.readFile(memoryFile, "utf8");
  } catch {
    return "# Thalika Memory\n";
  }
}

export async function appendMemory(note: string) {
  await ensureDataDirs();
  await fs.appendFile(memoryFile, `\n- ${new Date().toISOString()} ${note}\n`, "utf8");
}
