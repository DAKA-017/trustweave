import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, dialog, shell } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSmoke = process.argv.includes("--smoke") || process.env.TRUSTWEAVE_SMOKE === "1";
const appRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
const backendDir = path.join(appRoot, "backend");
const frontendDir = path.join(appRoot, "frontend");
const nextBin = path.join(frontendDir, "node_modules", "next", "dist", "bin", "next");

let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;
let dashboardUrl = null;
let runtimeApiBase = null;
let quitting = false;

app.setName("TrustWeave");

function log(message) {
  console.log(`[desktop] ${message}`);
}

function logError(message) {
  console.error(`[desktop] ${message}`);
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, { label, timeoutMs = 60_000, child } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`${label} exited before becoming healthy (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}.`);
}

function pipeOutput(child, label) {
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
  child.once("exit", (code, signal) => {
    if (!quitting && code !== 0) {
      logError(`${label} exited unexpectedly (code ${code ?? "null"}, signal ${signal ?? "none"}).`);
    }
  });
}

function nodeEnv(extra) {
  return {
    ...process.env,
    ...extra,
    ELECTRON_RUN_AS_NODE: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

async function startServices() {
  if (!readFileSync(path.join(frontendDir, ".next", "BUILD_ID"), "utf8").trim()) {
    throw new Error("Frontend build is missing. Run `npm run app` or `npm --prefix frontend run build`.");
  }

  const [backendPort, frontendPort] = [await findFreePort(), await findFreePort()];
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  dashboardUrl = `${frontendOrigin}/network`;

  backendProcess = spawn(process.execPath, [path.join(backendDir, "server.js")], {
    cwd: backendDir,
    env: nodeEnv({
      NODE_ENV: "production",
      PORT: String(backendPort),
      FRONTEND_ORIGIN: frontendOrigin,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeOutput(backendProcess, "backend");
  log(`Backend starting on http://127.0.0.1:${backendPort}`);
  await waitForHttp(`http://127.0.0.1:${backendPort}/api/health`, {
    label: "backend",
    timeoutMs: 90_000,
    child: backendProcess,
  });

  frontendProcess = spawn(
    process.execPath,
    [nextBin, "start", "-H", "127.0.0.1", "-p", String(frontendPort)],
    {
      cwd: frontendDir,
      env: nodeEnv({ NODE_ENV: "production", PORT: String(frontendPort) }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  pipeOutput(frontendProcess, "frontend");
  log(`Dashboard starting on ${frontendOrigin}`);
  await waitForHttp(frontendOrigin, {
    label: "frontend",
    timeoutMs: 120_000,
    child: frontendProcess,
  });

  runtimeApiBase = `http://127.0.0.1:${backendPort}/api`;
  log("Dashboard will use the local backend through its runtime API base.");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#141619",
    title: "TrustWeave",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--trustweave-api-base=${runtimeApiBase}`],
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    logError(`Page failed to load (${code}): ${description}`);
  });
  mainWindow.loadURL(dashboardUrl);

  if (isSmoke) runSmokeCheck(mainWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function runSmokeCheck(window) {
  try {
    await new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const heading = await window.webContents.executeJavaScript(
      "document.querySelector('h1')?.textContent?.trim() ?? ''",
    );
    const image = await window.webContents.capturePage();
    const output = process.env.TRUSTWEAVE_SMOKE_OUT || path.resolve(__dirname, "smoke.png");
    writeFileSync(output, image.toPNG());
    log(`Smoke: window loaded at ${dashboardUrl}, heading "${heading}", screenshot ${output}`);
    app.quit();
  } catch (error) {
    logError(`Smoke check failed: ${error.message}`);
    app.exit(1);
  }
}

function stopChild(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  log(`Stopping ${label}…`);
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 3_000);
  timer.unref?.();
}

function stopServices() {
  quitting = true;
  stopChild(frontendProcess, "frontend");
  stopChild(backendProcess, "backend");
}

async function bootstrap() {
  if (!Menu.getApplicationMenu() && process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]),
    );
  } else if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  await startServices();
  createWindow();
}

app.whenReady().then(bootstrap).catch((error) => {
  logError(error.message);
  if (!isSmoke) {
    dialog.showErrorBox("TrustWeave could not start", error.message);
  }
  stopServices();
  app.exit(1);
});

app.on("activate", () => {
  if (mainWindow === null && dashboardUrl) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || isSmoke) app.quit();
});

app.on("before-quit", stopServices);
process.on("exit", stopServices);
