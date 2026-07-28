import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { dataDir, ensureDataDirs, logsDir } from "@/lib/file-utils";
import { readEnvKey } from "@/lib/storage/env-store";

export const runtime = "nodejs";

const LOCAL_URL = "http://localhost:7860";
const pidFile = path.join(dataDir, "voxcpm-local.pid");

// Default launcher: the repo's own script that sets up the venv and runs local-server/server.py.
// Resolved relative to the Next.js app root (process.cwd()), so it works on a fresh checkout.
const DEFAULT_LOCAL_CMD = "bash scripts/voxcpm-local.sh";

// Command comes ONLY from .env.local / env / this hard-coded default — NEVER the request body —
// so a stray POST can't run arbitrary shell. The serving machine is the one that hosts VoxCPM.
async function localCommand() {
  const configured = (await readEnvKey("VOXCPM_LOCAL_CMD")) || process.env.VOXCPM_LOCAL_CMD?.trim() || "";
  return configured || DEFAULT_LOCAL_CMD;
}

async function readPid() {
  try {
    const pid = Number(await fs.readFile(pidFile, "utf8"));
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reachable() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${LOCAL_URL}/gradio_api/info`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const pid = await readPid();
  const command = await localCommand();
  return NextResponse.json({
    configured: Boolean(command),
    running: pid ? isAlive(pid) : false,
    reachable: await reachable()
  });
}

export async function POST() {
  if (await reachable()) return NextResponse.json({ started: true, alreadyRunning: true });

  const command = await localCommand();
  // The command is always set (DEFAULT_LOCAL_CMD), so this only triggers on an explicit
  // empty override. The launcher itself detects missing/incompatible Python and logs to
  // data/logs/voxcpm-local.log — surface that path to the user.
  if (!command) {
    return NextResponse.json(
      { ok: false, error: "No local VoxCPM launch command configured. See data/logs/voxcpm-local.log and local-server/README.md." },
      { status: 400 }
    );
  }

  await ensureDataDirs();
  const logFd = openSync(path.join(logsDir, "voxcpm-local.log"), "a");
  // detached + own process group so Stop can kill the whole tree (sh -> python). Survives app
  // restarts; the pidfile is the only handle. Trusts the pidfile — a PID reused after a crash
  // could mistarget the kill; fine for a single local box, add a cmdline check if it bites.
  const child = spawn(command, { shell: true, detached: true, stdio: ["ignore", logFd, logFd] });
  child.unref();
  if (child.pid) await fs.writeFile(pidFile, String(child.pid), "utf8");
  return NextResponse.json({ started: true });
}

export async function DELETE() {
  const pid = await readPid();
  if (pid && isAlive(pid)) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"]);
    } else {
      try {
        process.kill(-pid, "SIGTERM"); // kill the process group
      } catch {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    }
  }
  await fs.rm(pidFile, { force: true });
  return NextResponse.json({ stopped: true });
}
