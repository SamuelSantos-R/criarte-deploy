import { app, BrowserWindow, shell, session } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { join } from "node:path";
import { registerIpc } from "./ipc";
import { killAll } from "./cli";
import { origensDoPreview, pararServidor } from "./preview";
import { pararVigia } from "./vigia";

const DEV_URL = process.env["ELECTRON_RENDERER_URL"];

function csp(): string {
  return [
    "default-src 'self'",
    // O HMR do Vite injeta script e abre websocket; em produção nada disso vale.
    DEV_URL ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    // React escreve style inline; sem isso a UI inteira fica sem estilo.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    // As fotos dos convites moram no R2 — é a única origem remota permitida.
    "img-src 'self' data: https://*.r2.dev",
    "object-src 'none'",
    // O preview é um <iframe> pro `next dev` local. Só o loopback: o app nunca
    // emoldura nada da internet.
    "frame-src http://localhost:* http://127.0.0.1:*",
    "base-uri 'none'",
    "form-action 'none'",
    DEV_URL ? `connect-src 'self' ${DEV_URL} ws://localhost:* http://localhost:*` : "connect-src 'self'",
  ].join("; ");
}

function hardenSession(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    // O site em preview passa pela mesma sessão. Carimbar a CSP do app nele
    // mataria o `next dev`, que precisa de eval e de websocket pro HMR.
    if (origensDoPreview().some((o) => details.url.startsWith(o))) return cb({});
    cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp()] } });
  });
  // Nada de câmera, microfone, geolocalização, notificação — o app não usa.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 840,
    // Abaixo disso a lombada + nav + lista + prova comem o formulário inteiro.
    minWidth: 1160,
    minHeight: 680,
    show: false,
    backgroundColor: "#1A1E16",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 22 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  // Link externo abre no navegador do sistema, nunca numa janela do app —
  // e só se for http(s), senão vira vetor pra abrir binário local.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const ok = /^https?:\/\//i.test(url);
    if (ok) void shell.openExternal(url);
    return { action: "deny" };
  });

  // Em produção a janela nunca navega: o React troca de tela sozinho. Qualquer
  // navigate seria renderer comprometido tentando alcançar outra origem.
  win.webContents.on("will-navigate", (event, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) event.preventDefault();
  });

  win.webContents.on("will-attach-webview", (event) => event.preventDefault());

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
}

// Vale pra qualquer janela futura, não só a que o createWindow monta.
app.enableSandbox();

app.whenReady().then(() => {
  electronApp.setAppUserModelId("ao.criarte.studio");
  hardenSession();
  registerIpc();
  app.on("browser-window-created", (_, w) => optimizer.watchWindowShortcuts(w));
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killAll();
  pararServidor();
  pararVigia();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  killAll();
  pararServidor();
  pararVigia();
});
