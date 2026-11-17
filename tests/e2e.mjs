/**
 * Prueba de extremo a extremo de la aplicación de escritorio (Electron real).
 *
 * Uso:  npm run build && npm run e2e         (en Linux sin pantalla: xvfb-run npm run e2e)
 * Variables: E2E_CAPTURAS=<carpeta> guarda capturas de cada módulo.
 *
 * Recorre: configuración inicial, alta de periodo/cursillo/docente/asignatura/grupo/estudiante,
 * matrícula, programación de clases con detección de conflictos, planeación temática,
 * asistencia, certificados y su verificación, reportes, permisos por rol y la base demo.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright-core';

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const capturas = process.env.E2E_CAPTURAS;
if (capturas) fs.mkdirSync(capturas, { recursive: true });

let pasos = 0;
const errores = [];
const paso = (t) => console.log(`  ✓ ${++pasos}. ${t}`);
const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dias = (n) => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };

async function abrir(datos) {
  const app = await electron.launch({
    executablePath: require('electron'), args: [raiz, '--no-sandbox'],
    env: { ...process.env, MEIF_DATA_DIR: datos, MEIF_E2E: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });
  const w = await app.firstWindow();
  await w.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);
  w.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  w.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
  return { app, w };
}

async function captura(w, nombre) {
  if (capturas) await w.screenshot({ path: path.join(capturas, `${nombre}.png`) });
}

const ir = (w, modulo) => w.click(`nav button[data-modulo="${modulo}"]`);
const toastExito = (w, texto) => w.locator('.toast.exito', { hasText: texto }).first().waitFor({ timeout: 15000 });
async function sinToastError(w) {
  const e = w.locator('.toast.error');
  if (await e.count()) throw new Error(`Error en pantalla: ${await e.first().innerText()}`);
}
/** Selecciona en un <select> la opción cuyo texto contiene `texto`. */
async function elegir(loc, texto) {
  const valor = await loc.locator('option', { hasText: texto }).first().getAttribute('value');
  await loc.selectOption(valor);
}
const modal = (w) => w.locator('.modal').last();
const guardarModal = async (w) => { await modal(w).getByRole('button', { name: /^Guardar/ }).click(); };
/** Guarda la clase y acepta el diálogo de advertencias si aparece. */
async function guardarClase(w) {
  await guardarModal(w);
  const conf = w.locator('.modal', { hasText: 'Advertencias de programación' });
  if (await conf.waitFor({ timeout: 1500 }).then(() => true).catch(() => false)) await conf.getByRole('button', { name: 'Guardar de todas formas' }).click();
}

async function flujoReal() {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'meif-e2e-'));
  const { app, w } = await abrir(datos);
  try {
    // ---------------------------------------------------- configuración inicial
    await w.getByText('Configuración inicial').waitFor();
    await captura(w, '00-configuracion-inicial');
    await w.fill('#a-nombre', 'Coordinación MEIF');
    await w.fill('#a-usuario', 'admin');
    await w.fill('#a-clave', 'Meif2027x');
    await w.fill('#a-clave2', 'Meif2027x');
    await w.click('button:has-text("Crear superadministrador")');
    await w.locator('nav button[data-modulo="inicio"]').waitFor();
    paso('Configuración inicial: superadministrador creado e inicio de sesión');

    // ----------------------------------------------------------- configuración
    await ir(w, 'configuracion');
    await w.getByLabel('Nombre del director(a) que firma').fill('María Fernanda Ruiz');
    await w.getByRole('button', { name: 'Guardar' }).click();
    await toastExito(w, 'Configuración guardada');
    paso('Configuración institucional guardada');

    // ------------------------------------------------------- periodo y cursillo
    await ir(w, 'cursillos');
    await w.getByRole('tab', { name: /Periodos/ }).click();
    await w.getByRole('button', { name: 'Nuevo' }).click();
    await modal(w).getByLabel('Código').fill('P2027');
    await modal(w).getByLabel('Nombre').fill('Periodo 2027');
    await modal(w).getByLabel('Fecha de inicio').fill(dias(-60));
    await modal(w).getByLabel('Fecha de finalización').fill(dias(120));
    await guardarModal(w);
    await toastExito(w, 'Periodo académico registrado');
    await w.getByRole('tab', { name: /^Cursillos/ }).click();
    await w.getByRole('button', { name: 'Nuevo' }).click();
    await modal(w).getByLabel('Código').fill('C2027');
    await modal(w).getByLabel(/^Nombre\*?$/).fill('Cursillo 2027');
    await elegir(modal(w).getByLabel('Periodo académico'), 'P2027');
    await modal(w).getByLabel('Fecha de inicio').fill(dias(-30));
    await modal(w).getByLabel('Fecha de finalización').fill(dias(60));
    await guardarModal(w);
    await toastExito(w, 'Cursillo registrado');
    await w.getByRole('cell', { name: 'Cursillo 2027' }).waitFor();
    paso('Periodo y cursillo creados');

    // ------------------------------------------------------------- docentes
    await ir(w, 'docentes');
    for (const [id, n, a] of [['1045001', 'Andrés', 'Charris'], ['1045002', 'Lucía', 'Barrios']]) {
      await w.getByRole('button', { name: 'Nuevo' }).click();
      await modal(w).getByLabel('Identificación').fill(id);
      await modal(w).getByLabel('Nombres').fill(n);
      await modal(w).getByLabel('Apellidos').fill(a);
      await modal(w).getByLabel('Correo electrónico').fill(`${n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@meif.org`);
      await guardarModal(w);
      await toastExito(w, 'Docente registrado');
    }
    // duplicado
    await w.getByRole('button', { name: 'Nuevo' }).click();
    await modal(w).getByLabel('Identificación').fill('1045001');
    await modal(w).getByLabel('Nombres').fill('Otro');
    await modal(w).getByLabel('Apellidos').fill('Duplicado');
    await guardarModal(w);
    await modal(w).getByText('Ya existe un docente con esa identificación').waitFor();
    await modal(w).getByRole('button', { name: 'Cancelar' }).click();
    paso('Docentes registrados y duplicado rechazado');

    // ----------------------------------------------------------- asignaturas
    await ir(w, 'asignaturas');
    for (const [cod, nom, area, doc, h] of [['MAT1', 'Matemáticas', 'Matemáticas', 'Charris', '4'], ['FIS1', 'Física', 'Física', 'Barrios', '4']]) {
      await w.getByRole('button', { name: 'Nuevo' }).click();
      await modal(w).getByLabel('Código').fill(cod);
      await modal(w).getByLabel(/^Nombre\*?$/).fill(nom);
      await modal(w).getByLabel('Área').selectOption(area);
      await elegir(modal(w).getByLabel('Cursillo'), 'C2027');
      await elegir(modal(w).getByLabel('Docente responsable'), doc);
      await modal(w).getByLabel('Intensidad horaria (horas)').fill(h);
      await guardarModal(w);
      await toastExito(w, 'Asignatura registrado');
    }
    paso('Asignaturas por área creadas');

    // ---------------------------------------------------------------- grupo
    await ir(w, 'grupos');
    await w.getByRole('button', { name: 'Nuevo' }).click();
    await elegir(modal(w).getByLabel('Cursillo'), 'C2027');
    await modal(w).getByLabel('Nombre del grupo').fill('Grupo A');
    await modal(w).getByLabel('Aula o espacio habitual').fill('Aula 1');
    await guardarModal(w);
    await toastExito(w, 'Grupo registrado');
    paso('Grupo creado');

    // ------------------------------------------------- estudiante y matrícula
    await ir(w, 'estudiantes');
    await w.getByRole('button', { name: 'Nuevo' }).click();
    await modal(w).getByLabel('Número de identificación').fill('1043987654');
    await modal(w).getByLabel('Nombres').fill('Valentina');
    await modal(w).getByLabel('Apellidos').fill('Mendoza Polo');
    await modal(w).getByLabel('Institución educativa').fill('IE Técnica de Sabanalarga');
    await modal(w).getByLabel('Grado escolar').selectOption('11°');
    await guardarModal(w);
    await toastExito(w, 'Estudiante registrado');
    await w.getByRole('cell', { name: '1043987654' }).click();
    await w.getByRole('button', { name: 'Matricular en un cursillo' }).click();
    await elegir(modal(w).getByLabel('Cursillo'), 'C2027');
    await elegir(modal(w).getByLabel('Grupo'), 'Grupo A');
    await modal(w).getByLabel('Fecha de inscripción').fill(dias(-30));
    await guardarModal(w);
    await toastExito(w, 'Matrícula registrado');
    await w.locator('.panel-lateral').getByText('Cursillo 2027').first().waitFor();
    await captura(w, '05b-estudiante-detalle');
    await w.keyboard.press('Escape');
    paso('Estudiante inscrito y matriculado (asignaturas asignadas automáticamente)');

    // ------------------------------------------------------------- horarios
    await ir(w, 'horarios');
    const programar = async (asig, docente, fecha, inicio, fin) => {
      await w.getByRole('button', { name: 'Programar clases' }).click();
      const m = modal(w);
      await elegir(m.getByLabel('Cursillo'), 'C2027');
      await elegir(m.getByLabel('Asignatura'), asig);
      await elegir(m.getByLabel('Docente'), docente);
      await elegir(m.getByLabel('Grupo'), 'Grupo A');
      await m.getByLabel('Hora de inicio').fill(inicio);
      await m.getByLabel('Hora de finalización').fill(fin);
      await m.getByLabel('Fecha de la clase').fill(fecha);
    };
    await programar('Matemáticas', 'Charris', dias(-2), '08:00', '10:00');
    await modal(w).getByText('Sin conflictos').waitFor();
    await guardarClase(w);
    await toastExito(w, '1 clase(s) programada(s)');
    await programar('Matemáticas', 'Charris', dias(-1), '08:00', '10:00');
    await modal(w).getByText('Sin conflictos').waitFor();
    await guardarClase(w);
    await toastExito(w, '1 clase(s) programada(s)');
    // Cruce: el grupo ya tiene clase a esa hora
    await programar('Física', 'Barrios', dias(-2), '09:00', '11:00');
    await modal(w).getByText(/Cruce de horario del grupo/).waitFor();
    if (!(await modal(w).getByRole('button', { name: /^Guardar/ }).isDisabled())) throw new Error('Debía bloquear el guardado por conflicto');
    await captura(w, '06b-conflicto-horario');
    await modal(w).getByLabel('Hora de inicio').fill('10:00');
    await modal(w).getByLabel('Hora de finalización').fill('12:00');
    await modal(w).getByText('Sin conflictos').waitFor();
    await guardarClase(w);
    await toastExito(w, '1 clase(s) programada(s)');
    paso('Horarios: clases programadas, cruce detectado y bloqueado');

    // ------------------------------------------------------------- planeación
    await ir(w, 'planeacion');
    await elegir(w.getByLabel('Asignatura'), 'Matemáticas');
    for (const [u, t, h] of [['Unidad 1', 'Números reales', '2'], ['Unidad 2', 'Funciones', '2']]) {
      await w.getByRole('button', { name: 'Agregar temática' }).click();
      await modal(w).getByLabel('Unidad temática').fill(u);
      await modal(w).getByLabel(/^Tema\*?$/).fill(t);
      await modal(w).getByLabel('Horas asignadas').fill(h);
      await guardarModal(w);
      await toastExito(w, 'Temática agregada');
    }
    await w.locator('.resumen-plan').getByText('100%').first().waitFor();
    paso('Planeación temática: 4 h distribuidas (100 % de la intensidad)');

    // ------------------------------------------------------------- asistencia
    await ir(w, 'asistencia');
    for (const n of [-2, -1]) {
      await w.getByLabel('Fecha').fill(dias(n));
      await w.locator('button', { hasText: 'Matemáticas' }).first().click();
      await w.getByRole('button', { name: 'Todos asistieron' }).click();
      await w.getByRole('button', { name: 'Guardar asistencia' }).click();
      await toastExito(w, 'Asistencia guardada');
    }
    await captura(w, '09b-asistencia-registrada');
    paso('Asistencia registrada (clases marcadas como ejecutadas)');

    // ---------------------------------------------------------- certificados
    await ir(w, 'certificados');
    await elegir(w.getByLabel('Cursillo'), 'C2027');
    await w.getByRole('cell', { name: '1043987654' }).waitFor();
    await w.getByRole('button', { name: /Generar todos los aprobados \(1\)/ }).click();
    await modal(w).getByText(/1 certificado\(s\) generado\(s\)/).waitFor();
    const codigo = (await modal(w).locator('code').first().innerText()).trim();
    await captura(w, '10b-certificado-generado');
    await modal(w).getByRole('button', { name: 'Cerrar' }).click();
    await w.getByRole('tab', { name: 'Verificar autenticidad' }).click();
    await w.getByLabel('Contenido del QR o código del certificado').fill(codigo);
    await w.getByRole('button', { name: 'Verificar' }).click();
    await w.getByText('Certificado auténtico y vigente.').waitFor();
    paso(`Certificado ${codigo} generado y verificado`);
    const pdfs = fs.readdirSync(path.join(datos, 'datos', 'certificados', String(hoy.getFullYear())));
    if (!pdfs.includes(`${codigo}.pdf`)) throw new Error('No se encontró el PDF del certificado');
    paso('PDF del certificado guardado en la carpeta de datos');

    // ---------------------------------------------------------------- reportes
    await ir(w, 'reportes');
    await w.getByRole('button', { name: 'Horas programadas y ejecutadas' }).click();
    await w.getByRole('button', { name: 'Vista previa' }).click();
    await w.getByRole('cell', { name: 'Matemáticas' }).first().waitFor();
    paso('Reporte con vista previa');

    // ---------------------------------------------------------------- usuarios
    await ir(w, 'usuarios');
    await w.getByRole('button', { name: 'Nuevo usuario' }).click();
    await modal(w).getByLabel('Usuario (para iniciar sesión)').fill('secretaria');
    await modal(w).getByLabel('Nombre completo').fill('Secretaría MEIF');
    await elegir(modal(w).getByLabel('Rol'), 'Secretaría');
    await modal(w).getByLabel('Contraseña inicial').fill('Secre2027');
    await guardarModal(w);
    await toastExito(w, 'Usuario creado');
    paso('Usuario de secretaría creado');

    // ------------------------------------------------------ inicio con datos
    await ir(w, 'inicio');
    await w.getByText('Horas académicas ejecutadas').waitFor();
    await captura(w, '01b-inicio-datos-reales');
    await sinToastError(w);

    // ------------------------------------- persistencia: cerrar y volver a abrir
    await app.close();
    const r2 = await abrir(datos);
    await r2.w.fill('#a-usuario', 'secretaria');
    await r2.w.fill('#a-clave', 'Secre2027');
    await r2.w.click('button:has-text("Ingresar")');
    await r2.w.getByText('Por seguridad debe cambiar la contraseña').waitFor();
    await r2.w.getByLabel('Contraseña actual').fill('Secre2027');
    await r2.w.getByLabel('Nueva contraseña').fill('Secre2028');
    await r2.w.getByLabel('Confirmar nueva contraseña').fill('Secre2028');
    await r2.w.getByRole('button', { name: 'Guardar' }).click();
    await toastExito(r2.w, 'Contraseña actualizada');
    const menu = await r2.w.locator('nav button').allInnerTexts();
    if (menu.some((t) => /Usuarios|Configuración/.test(t))) throw new Error('Secretaría no debe ver Usuarios ni Configuración');
    await ir(r2.w, 'estudiantes');
    await r2.w.getByRole('cell', { name: '1043987654' }).waitFor();
    paso('Datos persistentes tras reiniciar; cambio obligatorio de contraseña; menú restringido por rol');
    await r2.app.close();
    const respaldos = fs.readdirSync(path.join(datos, 'respaldos'));
    if (!respaldos.some((n) => n.includes('automatico'))) throw new Error('No se creó la copia automática');
    paso('Copia de seguridad automática creada');
  } catch (e) {
    await w.screenshot({ path: path.join(capturas ?? os.tmpdir(), 'FALLO-real.png') }).catch(() => undefined);
    throw e;
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function recorridoDemo() {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'meif-demo-'));
  const { app, w } = await abrir(datos);
  try {
    await w.getByRole('button', { name: /Explorar la base de demostración/ }).click();
    await w.getByText('Base de DEMOSTRACIÓN').waitFor({ timeout: 60000 });
    await captura(w, '00-login-demo');
    await w.fill('#a-usuario', 'admin-demo');
    await w.fill('#a-clave', 'Demo2027');
    await w.click('button:has-text("Ingresar")');
    await w.getByText('MODO DEMOSTRACIÓN').waitFor();
    paso('Base de demostración creada y aviso permanente visible');
    const modulos = ['inicio', 'cursillos', 'docentes', 'estudiantes', 'asignaturas', 'grupos', 'horarios', 'planeacion', 'material', 'asistencia', 'certificados', 'reportes', 'usuarios', 'configuracion'];
    for (const [i, m] of modulos.entries()) {
      await ir(w, m);
      await w.locator('.pagina-cab h1, .contenido h1').first().waitFor();
      await w.waitForTimeout(m === 'inicio' ? 900 : 350);
      if (m === 'planeacion') { await elegir(w.getByLabel('Asignatura'), 'Matemáticas'); await w.locator('.resumen-plan').waitFor(); }
      if (m === 'certificados') { await elegir(w.getByLabel('Cursillo'), 'Preparación'); await w.locator('.tabla tbody tr').first().waitFor(); }
      if (m === 'asistencia') { await w.locator('.col-flex button.btn.chico').first().click().catch(() => undefined); await w.waitForTimeout(400); }
      await sinToastError(w);
      await captura(w, `${String(i + 1).padStart(2, '0')}-${m}`);
    }
    paso('Los 14 módulos cargan sin errores');
    await ir(w, 'docentes');
    await w.getByRole('cell', { name: /Carlos/ }).first().click();
    await w.getByRole('tab', { name: 'Horario' }).click();
    await w.waitForTimeout(300);
    await captura(w, '03b-docente-horario');
    await w.keyboard.press('Escape');
    await ir(w, 'horarios');
    await w.getByRole('button', { name: 'Mes' }).click();
    await w.waitForTimeout(300);
    await captura(w, '07b-horarios-mes');
    paso('Vistas de detalle y calendario mensual');
    // Docente: menú restringido
    await w.locator('.menu-pie button', { hasText: 'Salir' }).click();
    await modal(w).getByRole('button', { name: 'Cerrar sesión' }).click();
    await w.fill('#a-usuario', 'docente-demo');
    await w.fill('#a-clave', 'Demo2027');
    await w.click('button:has-text("Ingresar")');
    await w.locator('nav button[data-modulo="planeacion"]').waitFor();
    const menu = await w.locator('nav button').allInnerTexts();
    if (menu.some((t) => /Certificados|Usuarios|Configuración/.test(t))) throw new Error('El docente no debe ver Certificados, Usuarios ni Configuración');
    await ir(w, 'planeacion');
    await w.getByLabel('Asignatura').locator('option', { hasText: 'mi asignatura' }).first().waitFor({ state: 'attached' });
    paso('Rol Docente: menú restringido y sus asignaturas destacadas');
  } catch (e) {
    await w.screenshot({ path: path.join(capturas ?? os.tmpdir(), 'FALLO-demo.png') }).catch(() => undefined);
    throw e;
  } finally {
    await app.close().catch(() => undefined);
  }
}

console.log('Flujo completo con base real:');
await flujoReal();
console.log('Recorrido de la base de demostración:');
await recorridoDemo();
const relevantes = errores.filter((e) => !/Autofill|DevTools|Electron Security/.test(e));
if (relevantes.length) { console.error('Errores de consola:\n' + relevantes.join('\n')); process.exit(1); }
console.log(`\nE2E correcto: ${pasos} pasos verificados.`);
