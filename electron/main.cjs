const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

const DEFAULT_APP_URL = "http://localhost:3000";

const storageFolders = {
  data: path.join(process.cwd(), "data"),
  scripts: path.join(process.cwd(), "data", "scripts"),
  jobs: path.join(process.cwd(), "data", "jobs"),
  outputs: path.join(process.cwd(), "data", "outputs"),
  memory: path.join(process.cwd(), "data", "memory"),
};

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

ipcMain.handle("thalika:open-storage-folder", async (_event, folderId) => {
  const folderPath = storageFolders[folderId];
  if (!folderPath) {
    return { ok: false, error: "Unknown local folder." };
  }

  const error = await shell.openPath(folderPath);
  return error ? { ok: false, error } : { ok: true };
});

function createMainWindow() {
  const appUrl = process.env.ELECTRON_START_URL || DEFAULT_APP_URL;
  const appOrigin = new URL(appUrl).origin;

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 1024,
    minHeight: 720,
    title: "Thalika",
    backgroundColor: "#f2f4f7",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === appOrigin) {
        return { action: "allow" };
      }
    } catch {
      return { action: "deny" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(appUrl);
}

app.on("second-instance", () => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  app.setName("Thalika");
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
