import os from "node:os";
import path from "node:path";
import { readProcesses, selectAppProcesses } from "./resource-processes.mjs";

const projectRoot = process.cwd();
const projectName = path.basename(projectRoot);
const sampleCount = 5;
const sampleDelayMs = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMb(kilobytes) {
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

const samples = [];
let latestProcesses = [];
for (let index = 0; index < sampleCount; index += 1) {
  latestProcesses = await readProcesses();
  const appProcesses = selectAppProcesses(latestProcesses, process.pid);
  samples.push({
    rssKb: appProcesses.reduce((total, process) => total + process.rssKb, 0),
    cpuPercent: appProcesses.reduce((total, process) => total + process.cpuPercent, 0)
  });
  if (index < sampleCount - 1) await sleep(sampleDelayMs);
}

const averageRssKb = samples.reduce((total, sample) => total + sample.rssKb, 0) / samples.length;
const maximumRssKb = Math.max(...samples.map((sample) => sample.rssKb));
const averageCpuPercent = samples.reduce((total, sample) => total + sample.cpuPercent, 0) / samples.length;
const maximumCpuPercent = Math.max(...samples.map((sample) => sample.cpuPercent));
const topCpuProcesses = latestProcesses
  .filter((entry) => entry.pid !== process.pid)
  .sort((left, right) => right.cpuPercent - left.cpuPercent)
  .slice(0, 8);

console.log(`Thalika resource report (${new Date().toISOString()})`);
console.log(`Project: ${projectName}`);
console.log(`Samples: ${sampleCount} over ${((sampleCount - 1) * sampleDelayMs) / 1000}s`);
console.log(`System RAM: ${(os.totalmem() / 1024 / 1024).toFixed(0)} MB total`);
console.log("");
console.log(`Thalika average RSS: ${formatMb(averageRssKb)}`);
console.log(`Thalika maximum RSS: ${formatMb(maximumRssKb)}`);
console.log(`Thalika average CPU: ${averageCpuPercent.toFixed(1)}%`);
console.log(`Thalika maximum CPU: ${maximumCpuPercent.toFixed(1)}%`);
console.log("");
console.log("Top system CPU consumers in the final sample:");
console.log("PID     CPU     RSS       COMMAND");
for (const entry of topCpuProcesses) {
  const shortCommand = entry.command.length > 80 ? `${entry.command.slice(0, 77)}...` : entry.command;
  console.log(
    `${String(entry.pid).padEnd(7)} ${`${entry.cpuPercent.toFixed(1)}%`.padEnd(7)} ${formatMb(entry.rssKb).padEnd(9)} ${shortCommand}`
  );
}
