// Carga, desde el paquete extraído, todos los módulos que usa el proceso principal.
const path = require('path');
const raiz = path.resolve(process.argv[2]);
const Module = require('module');
const req = Module.createRequire(path.join(raiz, 'dist-electron/electron/main.js'));
let fallos = 0;
for (const m of ['sql.js', 'pdfkit', 'qrcode', 'exceljs', 'bcryptjs']) {
  try { req(m); console.log('OK   ', m); } catch (e) { fallos++; console.log('FALLA', m, '→', e.message.split('\n')[0]); }
}
// Carga cada servicio compilado (sin Electron)
for (const f of ['services/certificados.js', 'services/reportes.js', 'services/documentos.js', 'services/datos.js', 'ipc.js']) {
  try { req(path.join(raiz, 'dist-electron/electron', f)); console.log('OK   ', f); } catch (e) { fallos++; console.log('FALLA', f, '→', e.message.split('\n')[0]); }
}
process.exit(fallos ? 1 : 0);
