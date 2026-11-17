/** Proceso principal de Electron: ventana, seguridad, diálogos e IPC. */
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { Aplicacion } from './aplicacion';
import { crearRutas, despachar, type Dialogos } from './ipc';
import * as respaldo from './services/respaldo';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
// Permite aislar los datos (pruebas automatizadas o instalaciones portables).
if (process.env.MEIF_DATA_DIR) app.setPath('userData', process.env.MEIF_DATA_DIR);

let ventana: BrowserWindow | null = null;
const nucleo = new Aplicacion(path.join(app.getPath('userData')));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); }
  });
}

const dialogos: Dialogos = {
  async abrirArchivo(titulo, filtros) {
    const r = await dialog.showOpenDialog(ventana!, { title: titulo, filters: filtros, properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  },
  async guardarArchivo(titulo, nombre, filtros) {
    const r = await dialog.showSaveDialog(ventana!, { title: titulo, defaultPath: path.join(app.getPath('documents'), nombre), filters: filtros });
    return r.canceled || !r.filePath ? null : r.filePath;
  },
  async elegirCarpeta(titulo) {
    const r = await dialog.showOpenDialog(ventana!, { title: titulo, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  async abrirRuta(ruta) {
    if (process.env.MEIF_E2E) return; // en pruebas automatizadas no se abren programas externos
    const err = await shell.openPath(ruta);
    if (err) throw new Error(`No se pudo abrir el archivo: ${err}`);
  },
  async mostrarPdf(ruta, titulo) {
    if (process.env.MEIF_E2E) return;
    // Visor PDF integrado de Chromium: permite ver, descargar e imprimir.
    const w = new BrowserWindow({
      width: 1100, height: 850, title: titulo, parent: ventana ?? undefined, autoHideMenuBar: true,
      icon: path.join(__dirname, '../../dist/icono.png'),
      webPreferences: { plugins: true, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    await w.loadURL(`file://${ruta.replace(/\\/g, '/')}`);
  },
  mostrarEnCarpeta(ruta) {
    if (!process.env.MEIF_E2E) shell.openPath(ruta);
  },
};

async function crearVentana() {
  ventana = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1024, minHeight: 640, show: false, backgroundColor: '#FFFFFF',
    title: 'MEIF – SABANALARGA', icon: path.join(__dirname, '../../dist/icono.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true,
    },
  });
  ventana.once('ready-to-show', () => { ventana!.maximize(); ventana!.show(); });
  // Seguridad: no se permite navegar fuera de la aplicación ni abrir ventanas arbitrarias.
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.webContents.on('will-navigate', (e, url) => { if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault(); });
  if (DEV_URL) await ventana.loadURL(DEV_URL);
  else await ventana.loadFile(path.join(__dirname, '../../dist/index.html'));
}

app.whenReady().then(async () => {
  if (!DEV_URL) Menu.setApplicationMenu(null);
  let errorInicio: string | null = null;
  try {
    await nucleo.abrir();
  } catch (e: any) {
    errorInicio = String(e?.message ?? e);
    dialog.showErrorBox('MEIF – SABANALARGA', `No se pudo abrir la base de datos:\n\n${errorInicio}\n\nPuede restaurar una copia de seguridad desde la carpeta de respaldos.`);
  }
  const rutas = crearRutas(nucleo, dialogos, { version: app.getVersion() });
  ipcMain.handle('meif', (_e, canal: string, args: unknown) => despachar(nucleo, rutas, canal, args));
  await crearVentana();
});

app.on('before-quit', () => {
  const ctx = nucleo.ctx;
  if (ctx && !ctx.demo) {
    try { respaldo.automaticoSiCorresponde(ctx); } catch (e) { console.error('Respaldo automático fallido', e); }
  }
  nucleo.cerrar();
});

app.on('window-all-closed', () => app.quit());
