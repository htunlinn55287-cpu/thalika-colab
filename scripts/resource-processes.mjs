import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function isRuntimeRoot(command) {
  return (
    command.includes("next-server") ||
    command.includes("next dev") ||
    command.includes("next start") ||
    command.includes("node scripts/electron-dev.mjs") ||
    command.includes("node scripts/electron-start.mjs") ||
    command.includes("Electron electron/main.cjs")
  );
}

export async function readProcesses() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss=,%cpu=,command="]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);
      if (!match) return undefined;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssKb: Number(match[3]),
        cpuPercent: Number(match[4]),
        command: match[5],
      };
    })
    .filter(Boolean);
}

export function selectAppProcesses(processes, excludedPid) {
  const selectedPids = new Set(
    processes.filter((entry) => entry.pid !== excludedPid && isRuntimeRoot(entry.command)).map((entry) => entry.pid),
  );

  let addedChild = true;
  while (addedChild) {
    addedChild = false;
    for (const entry of processes) {
      if (entry.pid !== excludedPid && selectedPids.has(entry.ppid) && !selectedPids.has(entry.pid)) {
        selectedPids.add(entry.pid);
        addedChild = true;
      }
    }
  }

  return processes.filter((entry) => selectedPids.has(entry.pid));
}
