import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const repoRoot = path.resolve(desktopDir, "..");

const platformFlag = { darwin: "--mac", win32: "--win", linux: "--linux" }[process.platform];
if (!platformFlag) {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}

const buildId = path.join(repoRoot, "frontend", ".next", "BUILD_ID");
if (!existsSync(buildId)) {
  console.error("No frontend build found. Run `npm run app` once, or `npm --prefix frontend run build`.");
  process.exit(1);
}

mkdirSync(path.join(desktopDir, "build"), { recursive: true });
copyFileSync(
  path.join(repoRoot, "frontend", "public", "icons", "icon-512.png"),
  path.join(desktopDir, "build", "icon.png"),
);

const args = ["electron-builder", platformFlag];
if (process.argv.includes("--dir")) args.push("--dir");

// Reuse the Electron binary installed by npm instead of downloading it again.
const electronDist = path.join(desktopDir, "node_modules", "electron", "dist");
const electronShim = {
  darwin: path.join(electronDist, "Electron.app"),
  win32: path.join(electronDist, "electron.exe"),
  linux: path.join(electronDist, "electron"),
}[process.platform];
if (electronShim && existsSync(electronShim)) {
  args.push(`--config.electronDist=${electronDist}`);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
console.log(`[package] ${command} ${args.join(" ")} (${process.platform})`);
const child = spawn(command, args, {
  cwd: desktopDir,
  stdio: "inherit",
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? "false",
  },
});
child.on("exit", (code) => process.exit(code ?? 1));
