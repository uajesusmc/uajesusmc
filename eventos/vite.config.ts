import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La interfaz se sirve desde archivos locales dentro de Electron: base relativa.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { port: 5173, strictPort: true },
});
