import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPackagePath = require.resolve("electron/package.json");
const electronDirectory = path.dirname(electronPackagePath);
const electronPackage = require(electronPackagePath);
const checksums = require(path.join(electronDirectory, "checksums.json"));
const { downloadArtifact } = require("@electron/get");

function getPlatformPath(platform) {
  switch (platform) {
    case "darwin":
    case "mas":
      return "Electron.app/Contents/MacOS/Electron";
    case "win32":
      return "electron.exe";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

function extractArchive(archivePath, destination, platform) {
  if (platform === "win32") {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Expand-Archive",
        "-LiteralPath",
        archivePath,
        "-DestinationPath",
        destination,
        "-Force",
      ],
      { stdio: "inherit" },
    );
    return;
  }

  execFileSync("unzip", ["-q", archivePath, "-d", destination], { stdio: "inherit" });
}

const platform = process.env.ELECTRON_INSTALL_PLATFORM || process.platform;
const arch = process.env.ELECTRON_INSTALL_ARCH || process.arch;
const platformPath = getPlatformPath(platform);
const distDirectory = path.join(electronDirectory, "dist");
const executablePath = path.join(distDirectory, platformPath);

console.log(`Downloading checksum-verified Electron ${electronPackage.version} for ${platform}-${arch}...`);

const archivePath = await downloadArtifact({
  version: electronPackage.version,
  artifactName: "electron",
  checksums,
  platform,
  arch,
});

rmSync(distDirectory, { force: true, recursive: true });
rmSync(path.join(electronDirectory, "path.txt"), { force: true });
mkdirSync(distDirectory, { recursive: true });
extractArchive(archivePath, distDirectory, platform);
writeFileSync(path.join(electronDirectory, "path.txt"), platformPath);

const installedVersion = readFileSync(path.join(distDirectory, "version"), "utf8").trim().replace(/^v/, "");
if (installedVersion !== electronPackage.version || !existsSync(executablePath)) {
  throw new Error("Electron repair failed: the restored executable did not pass validation.");
}

console.log(`Electron repaired: ${executablePath}`);
