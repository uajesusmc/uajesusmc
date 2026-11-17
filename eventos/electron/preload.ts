/** Puente seguro entre la interfaz y el proceso principal (sin acceso directo a Node). */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('meif', {
  invocar: (canal: string, args?: unknown) => ipcRenderer.invoke('meif', canal, args),
});
