import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const appUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";
const healthUrl = new URL("/api/health", appUrl).toString();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForNext(timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(healthUrl, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting while the local production server boots.
    }

    await sleep(750);
  }

  throw new Error(`Next.js did not become ready at ${healthUrl}`);
}

async function isNextReady() {
  try {
    const response = await fetch(healthUrl, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

const startedNext = !(await isNextReady());
const nextProcess = startedNext
  ? spawnProcess("npm", ["run", "start"], {
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    })
  : null;

try {
  await waitForNext();

  const electronProcess = spawnProcess(electronPath, ["electron/main.cjs"], {
    env: {
      ...process.env,
      ELECTRON_START_URL: appUrl,
    },
  });

  const shutdown = () => {
    electronProcess.kill();
    nextProcess?.kill();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  electronProcess.on("exit", (code) => {
    nextProcess?.kill();
    process.exit(code ?? 0);
  });
} catch (error) {
  nextProcess?.kill();
  console.error(error);
  process.exit(1);
}
