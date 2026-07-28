import os from "node:os";
import path from "node:path";
import { readProcesses, selectAppProcesses } from "./resource-processes.mjs";

const projectRoot = process.cwd();
const projectName = path.basename(projectRoot);

function formatMb(kilobytes) {
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

const filteredProcesses = selectAppProcesses(await readProcesses(), process.pid);

const totalRssKb = filteredProcesses.reduce((total, process) => total + process.rssKb, 0);
const totalCpuPercent = filteredProcesses.reduce((total, process) => total + process.cpuPercent, 0);
const totalMemoryMb = os.totalmem() / 1024 / 1024;
const freeMemoryMb = os.freemem() / 1024 / 1024;

console.log(`Thalika memory report (${new Date().toISOString()})`);
console.log(`Project: ${projectName}`);
console.log(`System RAM: ${totalMemoryMb.toFixed(0)} MB total, ${freeMemoryMb.toFixed(0)} MB immediately free`);
console.log("");

if (filteredProcesses.length === 0) {
  console.log("No active Thalika / Next.js / Electron processes were detected.");
  console.log("Start the app in another terminal, then run: npm run metrics:memory");
  process.exit(0);
}

console.log("PID     PPID    RSS       CPU    COMMAND");
for (const process of filteredProcesses.sort((left, right) => right.rssKb - left.rssKb)) {
  const shortCommand = process.command.length > 90 ? `${process.command.slice(0, 87)}...` : process.command;
  console.log(
    `${String(process.pid).padEnd(7)} ${String(process.ppid).padEnd(7)} ${formatMb(process.rssKb).padEnd(9)} ${`${process.cpuPercent.toFixed(1)}%`.padEnd(6)} ${shortCommand}`
  );
}

console.log("");
console.log(`Detected app-process RSS total: ${formatMb(totalRssKb)}`);
console.log(`Detected app-process CPU total: ${totalCpuPercent.toFixed(1)}%`);
console.log("RSS is a point-in-time estimate. Shared Electron/Chromium memory and OS cache can make Activity Monitor totals differ.");
