/** Proceso principal: ventana, seguridad, diálogos de archivos e IPC. */
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { Aplicacion, crearRutas, despachar, type Dialogos } from './ipc';
import * as respaldo from './services/respaldo';

if (process.env.MEIF_DATA_DIR) app.setPath('userData', process.env.MEIF_DATA_DIR);
const e2e = !!process.env.MEIF_E2E;
let ventana: BrowserWindow | null = null;
const nucleo = new Aplicacion(app.getPath('userData'));

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); } });

const dialogos: Dialogos = {
  async abrirArchivo(title, filters) {
    // En pruebas automatizadas la ruta elegida se lee de un archivo de control.
    if (e2e && process.env.MEIF_E2E_ARCHIVO) return require('node:fs').readFileSync(process.env.MEIF_E2E_ARCHIVO, 'utf8').trim() || null;
    const r = await dialog.showOpenDialog(ventana!, { title, filters, properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  },
  async guardarArchivo(title, nombre, filters) {
    const r = await dialog.showSaveDialog(ventana!, { title, defaultPath: path.join(app.getPath('documents'), nombre), filters });
    return r.canceled || !r.filePath ? null : r.filePath;
  },
  async elegirCarpeta(title) {
    const r = await dialog.showOpenDialog(ventana!, { title, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  async abrirRuta(ruta) { if (!e2e) { const e = await shell.openPath(ruta); if (e) throw new Error(e); } },
  async mostrarPdf(ruta) {
    if (e2e) return;
    const w = new BrowserWindow({ width: 1100, height: 850, parent: ventana ?? undefined, autoHideMenuBar: true, webPreferences: { plugins: true, sandbox: true } });
    await w.loadURL(`file://${ruta.replace(/\\/g, '/')}`);
  },
};

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try { await nucleo.abrir(); } catch (e: any) { dialog.showErrorBox('MEIF Eventos', `No se pudo abrir la base de datos:\n${e.message}`); }
  const rutas = crearRutas(nucleo, dialogos, app.getVersion());
  ipcMain.handle('meif', (_e, canal: string, args: unknown) => despachar(nucleo, rutas, canal, args));
  ventana = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1024, minHeight: 640, show: false, title: 'MEIF Eventos', backgroundColor: '#FFFFFF',
    icon: path.join(__dirname, '../../dist/icono.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  ventana.once('ready-to-show', () => { ventana!.maximize(); ventana!.show(); });
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.webContents.on('will-navigate', (e) => e.preventDefault());
  await ventana.loadFile(path.join(__dirname, '../../dist/index.html'));
});

app.on('before-quit', () => {
  if (nucleo.ctx) { try { respaldo.automatico(nucleo.ctx); } catch { /* sin respaldo */ } }
  nucleo.cerrar();
});
app.on('window-all-closed', () => app.quit());
