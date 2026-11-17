/**
 * Prueba de extremo a extremo de MEIF Eventos (Electron real).
 * Uso: npm run build && xvfb-run -a node tests/e2e.mjs [foto.jpg]
 * E2E_CAPTURAS=<carpeta> guarda capturas de pantalla.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { _electron as electron } from 'playwright-core';

const require = createRequire(import.meta.url);
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const capturas = process.env.E2E_CAPTURAS;
if (capturas) fs.mkdirSync(capturas, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-e2e-'));
const control = path.join(tmp, 'archivo.txt');
const eleccion = (ruta) => fs.writeFileSync(control, ruta);

// Foto inaugural de prueba (o la indicada como argumento)
let foto = process.argv[2];
if (!foto) { foto = path.join(tmp, 'foto.png'); fs.copyFileSync(path.join(raiz, 'build', 'icon.png'), foto); }
// Excel con participantes
const excel = path.join(tmp, 'participantes.xlsx');
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Participantes');
ws.addRow(['Tipo documento', 'Identificación', 'Nombres', 'Apellidos', 'Institución educativa', 'Grado']);
ws.addRow(['TI', '1043111001', 'Valentina', 'Mendoza Polo', 'IE Técnica de Sabanalarga', '11']);
ws.addRow(['TI', '1043111002', 'Santiago', 'Charris Ariza', 'IE Normal Superior', '10']);
ws.addRow(['TI', '1043111003', 'Isabella', 'De la Hoz', 'IE Técnica de Sabanalarga', '11']);
await wb.xlsx.writeFile(excel);

const d = new Date();
const iso = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
let pasos = 0;
const paso = (t) => console.log(`  ✓ ${++pasos}. ${t}`);
const errores = [];

const app = await electron.launch({
  // Con E2E_EJECUTABLE se prueba la aplicación ya empaquetada (como la instala el usuario).
  executablePath: process.env.E2E_EJECUTABLE || require('electron'),
  args: process.env.E2E_EJECUTABLE ? ['--no-sandbox'] : [raiz, '--no-sandbox'],
  env: { ...process.env, MEIF_DATA_DIR: path.join(tmp, 'datos'), MEIF_E2E: '1', MEIF_E2E_ARCHIVO: control },
});
const w = await app.firstWindow();
await w.setViewportSize({ width: 1440, height: 900 }).catch(() => undefined);
w.on('pageerror', (e) => errores.push(e.message));
w.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
const captura = (n) => (capturas ? w.screenshot({ path: path.join(capturas, `${n}.png`) }) : null);
const exito = (t) => w.locator('.toast.exito', { hasText: t }).first().waitFor({ timeout: 15000 });
const modal = () => w.locator('.modal').last();
const ir = (p) => w.click(`nav button[data-pagina="${p}"]`);
async function elegir(loc, texto) { await loc.selectOption(await loc.locator('option', { hasText: texto }).first().getAttribute('value')); }

try {
  await w.getByText('Configuración inicial').waitFor();
  await captura('00-configuracion-inicial');
  await w.fill('#a-nombre', 'Coordinación MEIF');
  await w.fill('#a-usuario', 'admin');
  await w.fill('#a-clave', 'Meif2026x');
  await w.fill('#a-clave2', 'Meif2026x');
  await w.click('button:has-text("Crear superadministrador")');
  await w.locator('.banner').waitFor();
  await captura('01-inicio-sin-banner');
  paso('Primer ingreso: administrador creado; inicio con banner institucional por defecto');

  // ------------------------------------------------------ membrete institucional
  await ir('configuracion');
  await w.getByRole('tab', { name: 'Membrete' }).click();
  await w.getByLabel('Lema institucional (opcional)').fill('Ciencia y conocimiento para transformar');
  await w.getByLabel('NIT').fill('900.123.456-7');
  await w.getByLabel('Dirección').fill('Calle 20 # 18-45, Sabanalarga');
  await w.getByLabel('Teléfono').fill('300 123 4567');
  await w.getByLabel('Correo electrónico').fill('contacto@meif.org');
  await w.locator('.hoja-membrete').getByText('NIT 900.123.456-7').waitFor();
  await w.getByRole('button', { name: 'Guardar' }).click();
  await exito('Membrete guardado');
  await captura('02a-membrete');
  paso('Membrete institucional configurado con vista previa en vivo');

  // ------------------------------------------- firmas: presidente (admin) y secretario
  await w.getByRole('tab', { name: 'Usuarios' }).click();
  await w.getByRole('button', { name: 'Nuevo usuario' }).click();
  await modal().getByLabel('Usuario').fill('secretario');
  await modal().getByLabel('Nombre completo').fill('Ana María Polo');
  await modal().getByLabel('Rol').selectOption('consulta');
  await modal().getByLabel('Contraseña inicial').fill('Secre2026x');
  await modal().getByLabel('Firma como').selectOption('secretario');
  await modal().getByRole('button', { name: 'Guardar' }).click();
  await exito('Usuario guardado');
  await w.getByRole('tab', { name: 'Firmas' }).click();
  const presidente = w.locator('.tarjeta', { hasText: 'Firma del presidente' });
  await presidente.getByLabel('Nombre como aparece en los documentos').fill('Carlos Ruiz Charris');
  await presidente.getByLabel('Cargo').fill('Presidente MEIF');
  await presidente.getByRole('button', { name: 'Guardar nombre y cargo' }).click();
  await exito('Datos de firma guardados');
  eleccion(path.join(raiz, 'tests', 'fixtures', 'firma-presidente.png'));
  await presidente.getByRole('button', { name: 'Subir firma' }).click();
  await presidente.getByText('Cargada').waitFor();
  paso('Firma del presidente cargada');

  // El secretario entra con su usuario (solo consulta) y sube su propia firma
  await w.locator('.menu-pie button', { hasText: 'Salir' }).click();
  await modal().getByRole('button', { name: 'Cerrar sesión' }).click();
  await w.fill('#a-usuario', 'secretario');
  await w.fill('#a-clave', 'Secre2026x');
  await w.click('button:has-text("Ingresar")');
  await w.getByLabel('Contraseña actual').fill('Secre2026x');
  await w.locator('#c-nueva').fill('Secre2027x');
  await w.getByLabel('Confirmar nueva contraseña').fill('Secre2027x');
  await modal().getByRole('button', { name: 'Guardar' }).click();
  await exito('Contraseña actualizada');
  await w.locator('.menu-pie button', { hasText: 'Mi firma' }).click();
  const mia = modal();
  if (await mia.getByText('Firma del presidente').count()) throw new Error('El secretario no debe ver la firma del presidente en «Mi firma»');
  await mia.getByLabel('Nombre como aparece en los documentos').fill('Ana María Polo');
  await mia.getByLabel('Cargo').fill('Secretaria MEIF');
  await mia.getByRole('button', { name: 'Guardar nombre y cargo' }).click();
  await exito('Datos de firma guardados');
  eleccion(path.join(raiz, 'tests', 'fixtures', 'firma-secretario.png'));
  await mia.getByRole('button', { name: 'Subir firma' }).click();
  await mia.getByText('Cargada').waitFor();
  await captura('02b-mi-firma-secretario');
  await mia.locator('.m-pie').getByRole('button', { name: 'Cerrar' }).click();
  await w.locator('.menu-pie button', { hasText: 'Salir' }).click();
  await modal().getByRole('button', { name: 'Cerrar sesión' }).click();
  await w.fill('#a-usuario', 'admin');
  await w.fill('#a-clave', 'Meif2026x');
  await w.click('button:has-text("Ingresar")');
  await w.locator('.banner').waitFor();
  paso('El secretario subió su propia firma desde «Mi firma»');

  // ------------------------------------------------------- documento institucional
  await ir('documentos');
  await w.getByRole('button', { name: 'Nuevo documento' }).click();
  await modal().getByLabel('Destinatario').fill('Señor(a)\nRector(a) IE Técnica de Sabanalarga\nCiudad');
  await modal().getByLabel('Asunto').fill('Invitación a la Olimpiada de Matemáticas MEIF 2026');
  await modal().getByLabel(/Contenido/).fill('Reciba un cordial saludo.\n\nInvitamos a sus estudiantes a participar en la Olimpiada de Matemáticas MEIF 2026.');
  await captura('02c-nuevo-documento');
  await modal().getByRole('button', { name: 'Generar PDF' }).click();
  await exito('Documento generado');
  await w.getByText('MEIF-OF-').first().waitFor();
  await captura('02d-documentos');
  const oficio = fs.readdirSync(path.join(tmp, 'datos', 'datos', 'documentos')).find((n) => n.startsWith('MEIF-OF-'));
  if (!oficio) throw new Error('No se generó el PDF del oficio');
  paso(`Documento institucional ${oficio} generado con membrete y las dos firmas`);

  // ------------------------------------------------------------- miembros de MEIF
  await ir('miembros');
  const miembro = async (doc, nombres, apellidos, cargo, tel) => {
    await w.getByRole('button', { name: 'Nuevo miembro' }).click();
    await modal().getByLabel('Número de identificación').fill(doc);
    await modal().getByLabel('Nombres').fill(nombres);
    await modal().getByLabel('Apellidos').fill(apellidos);
    if (cargo) await modal().getByLabel('Cargo (opcional)').selectOption(cargo);
    if (tel) await modal().getByLabel('Teléfono').fill(tel);
    await modal().getByLabel('Profesión / ocupación').fill('Licenciado(a) en Matemáticas');
    await modal().getByRole('button', { name: 'Guardar' }).click();
  };
  await miembro('8001001', 'Carlos', 'Ruiz Charris', 'Presidente(a)', '3001112233');
  await exito('Miembro registrado');
  await miembro('8001002', 'Ana María', 'Polo', 'Secretario(a)', '3004445566');
  await exito('Miembro registrado');
  await miembro('8001003', 'Jorge', 'Ariza', '', '');
  await exito('Miembro registrado');
  await miembro('8001004', 'Otro', 'Presidente', 'Presidente(a)', '');
  await modal().getByText(/ya lo ocupa Carlos Ruiz Charris/).waitFor();
  await modal().getByRole('button', { name: 'Cancelar' }).click();
  await w.locator('.miembro-junta', { hasText: 'Presidente(a)' }).getByText('Carlos Ruiz Charris').waitFor();
  await w.locator('.miembro-junta', { hasText: 'Tesorero(a)' }).getByText('Vacante').waitFor();
  await captura('02e-miembros');
  await w.getByRole('cell', { name: /Ariza Jorge/ }).click();
  await modal().getByText('Sin cargo').waitFor();
  await modal().locator('.m-pie').getByRole('button', { name: 'Cerrar' }).click();
  paso('Miembros con y sin cargo; junta directiva y cargo único controlado');

  await ir('ponentes');
  await w.getByRole('button', { name: 'Nuevo' }).click();
  await modal().getByLabel('Identificación').fill('72100200');
  await modal().getByLabel('Nombres').fill('Andrés');
  await modal().getByLabel('Apellidos').fill('Charris');
  await modal().getByLabel('Área').selectOption('Matemáticas');
  await modal().getByRole('button', { name: 'Guardar' }).click();
  await exito('Ponente registrado');
  await w.getByRole('button', { name: 'Nuevo' }).click();
  await modal().getByLabel('Identificación').fill('72100300');
  await modal().getByLabel('Nombres').fill('Lucía');
  await modal().getByLabel('Apellidos').fill('Barrios');
  await modal().getByLabel('Área').selectOption('Física');
  await modal().getByRole('button', { name: 'Guardar' }).click();
  await exito('Ponente registrado');
  paso('Docentes registrados');

  await ir('eventos');
  await w.getByRole('button', { name: 'Nuevo evento' }).click();
  await modal().getByLabel('Nombre del evento').fill('Olimpiada de Matemáticas MEIF 2026');
  await modal().getByLabel('Tipo de evento').selectOption('Olimpiada');
  await modal().getByLabel('Fecha de inicio').fill(iso(-1));
  await modal().getByLabel('Fecha de finalización').fill(iso(1));
  await modal().getByLabel('Lugar').fill('Coliseo municipal de Sabanalarga');
  await modal().getByLabel('Estado').selectOption('En curso');
  await modal().getByRole('button', { name: 'Guardar' }).click();
  await exito('Evento registrado');
  await w.getByRole('heading', { name: /Olimpiada de Matemáticas/ }).waitFor();
  paso('Evento del año creado');

  eleccion(foto);
  await w.getByRole('button', { name: 'Subir foto inaugural' }).click();
  await w.locator('img.foto-evento').waitFor();
  await w.getByText('Mostrándose como banner en Inicio').waitFor();
  await captura('02-evento-foto-inaugural');
  paso('Foto inaugural cargada y asignada como banner');

  await w.getByRole('tab', { name: /Agenda/ }).click();
  const actividad = async (titulo, tipo, inicio, fin, ponente) => {
    await w.getByRole('button', { name: 'Agregar actividad' }).click();
    await modal().getByLabel('Título de la actividad').fill(titulo);
    await modal().getByLabel('Tipo').selectOption(tipo);
    if (ponente) await elegir(modal().getByLabel('Ponente / docente'), ponente);
    await modal().getByLabel('Lugar (aula, auditorio…)').fill('Coliseo');
    await modal().getByLabel('Fecha').fill(iso(-1));
    await modal().getByLabel('Hora de inicio').fill(inicio);
    await modal().getByLabel('Hora de fin').fill(fin);
  };
  await actividad('Acto de inauguración', 'Ceremonia', '08:00', '09:00');
  await modal().getByText('Sin cruces de horario').waitFor();
  await modal().getByRole('button', { name: 'Guardar' }).click();
  await exito('Actividad guardada');
  await actividad('Conferencia: el poder de las funciones', 'Conferencia', '09:00', '11:00', 'Charris');
  await modal().getByText('Sin cruces de horario').waitFor();
  await modal().getByRole('button', { name: 'Guardar' }).click();
  await exito('Actividad guardada');
  await actividad('Taller paralelo', 'Taller', '10:00', '12:00', 'Charris');
  await modal().getByText(/Cruce del ponente/).waitFor();
  if (!(await modal().getByRole('button', { name: 'Guardar' }).isDisabled())) throw new Error('Debía bloquear el cruce');
  await captura('03-agenda-conflicto');
  await modal().getByRole('button', { name: 'Cancelar' }).click();
  paso('Agenda creada y cruce de ponente detectado');

  // ------------------------------------------- organización: aulas, cursillos y horario docente
  await w.getByRole('tab', { name: /Organización/ }).click();
  await w.getByRole('tab', { name: 'Aulas', exact: true }).click();
  for (const [aula, cap] of [['Aula 101', '30'], ['Sala de informática', '20']]) {
    await w.getByRole('button', { name: 'Nueva aula' }).click();
    await modal().getByLabel('Nombre del aula o espacio').fill(aula);
    await modal().getByLabel('Capacidad (personas)').fill(cap);
    await modal().getByRole('button', { name: 'Guardar' }).click();
    await exito('Aula guardada');
  }
  await w.getByRole('tab', { name: /Cursillos, docentes y aulas/ }).click();
  const cursillo = async (nombre, docente, aula) => {
    await w.getByRole('button', { name: 'Nuevo cursillo' }).click();
    await modal().getByLabel('Nombre del cursillo').fill(nombre);
    await modal().getByLabel('Nivel o grupo').fill('Grado 11°');
    await elegir(modal().getByLabel('Docente que lo dicta'), docente);
    await elegir(modal().getByLabel('Aula asignada'), aula);
    await modal().getByRole('button', { name: 'Guardar' }).click();
    await exito('Cursillo guardado');
  };
  await cursillo('Álgebra y funciones', 'Charris', 'Aula 101');
  await cursillo('Física: cinemática', 'Barrios', 'Sala de informática');
  await cursillo('Geometría', 'Charris', 'Sala de informática');
  const programarCursillo = async (nombre, inicio, fin) => {
    await w.getByRole('row', { name: new RegExp(nombre) }).getByRole('button', { name: 'Programar horario' }).click();
    await modal().getByLabel('Una sola fecha').check();
    await modal().getByLabel('Fecha', { exact: true }).fill(iso(0));
    await modal().getByLabel('Hora de inicio').fill(inicio);
    await modal().getByLabel('Hora de fin').fill(fin);
  };
  await programarCursillo('Álgebra y funciones', '14:00', '16:00');
  await modal().getByText(/Sin cruces: el docente y el aula están libres/).waitFor();
  await modal().getByRole('button', { name: /^Guardar 1 sesión/ }).click();
  await exito('1 sesión(es) programada');
  await programarCursillo('Física: cinemática', '14:00', '16:00');
  await modal().getByText(/Sin cruces/).waitFor();
  await modal().getByRole('button', { name: /^Guardar 1 sesión/ }).click();
  await exito('1 sesión(es) programada');
  // Geometría con el mismo docente de Álgebra a la misma hora → cruce
  await programarCursillo('Geometría', '15:00', '17:00');
  await modal().getByText(/Cruce del ponente/).waitFor();
  await captura('03b-organizacion-cruce');
  await modal().getByLabel('Hora de inicio').fill('16:00');
  await modal().getByLabel('Hora de fin').fill('18:00');
  await modal().getByText(/Sin cruces/).waitFor();
  await modal().getByRole('button', { name: /^Guardar 1 sesión/ }).click();
  await exito('1 sesión(es) programada');
  await captura('03c-organizacion-cursillos');
  await w.getByRole('tab', { name: 'Horario de docentes' }).click();
  await w.locator('.bloque-horario', { hasText: 'Álgebra y funciones' }).getByText('Aula 101').waitFor();
  await w.locator('.bloque-horario', { hasText: 'Física: cinemática' }).getByText('Sala de informática').waitFor();
  await captura('03d-horario-docentes');
  paso('Organización: aulas, cursillos con docente y aula, cruce detectado y horario de docentes');
  // Acceso directo desde el menú lateral
  await ir('organizacion');
  await w.getByLabel('Evento', { exact: true }).locator('option:checked', { hasText: 'Olimpiada' }).waitFor({ state: 'attached' });
  await w.getByRole('tab', { name: 'Horario de docentes' }).click();
  await w.locator('.bloque-horario', { hasText: 'Geometría' }).getByText('Sala de informática').waitFor();
  await captura('03e-menu-organizacion');
  paso('Menú «Organización y horarios»: horario de docentes con aula y cursillo');
  await ir('eventos');
  await w.locator('.tarjeta-evento').first().click();
  await w.getByRole('heading', { name: /Olimpiada de Matemáticas/ }).waitFor();

  await w.getByRole('tab', { name: /Inscritos/ }).click();
  eleccion(excel);
  await w.getByRole('button', { name: 'Importar Excel' }).click();
  await modal().getByRole('button', { name: /Seleccionar archivo/ }).click().catch(() => modal().locator('.zona-archivo').click());
  await modal().getByText('3 nuevos').waitFor();
  await modal().getByRole('button', { name: /Importar 3 fila/ }).click();
  await exito('Importación lista');
  await w.getByRole('cell', { name: 'Mendoza Polo Valentina' }).waitFor();
  paso('3 participantes importados desde Excel e inscritos');

  await w.getByRole('tab', { name: 'Asistencia', exact: true }).click();
  await w.locator('button', { hasText: 'Acto de inauguración' }).click();
  await w.getByRole('button', { name: 'Marcar todos' }).click();
  await w.getByRole('button', { name: 'Guardar asistencia' }).click();
  await exito('3 presente');
  await w.locator('button', { hasText: 'Conferencia' }).click();
  await w.locator('.lista-presentes label', { hasText: 'Valentina' }).locator('input').check();
  await w.getByRole('button', { name: 'Guardar asistencia' }).click();
  await exito('1 presente');
  await captura('04-asistencia');
  paso('Asistencia registrada');

  await w.getByRole('tab', { name: /Certificados/ }).click();
  await w.getByRole('button', { name: /Generar todos los que cumplen \(1\)/ }).click();
  await modal().getByText(/1 certificado\(s\) generado/).waitFor();
  const codigo = (await modal().locator('code').first().innerText()).trim();
  await captura('05-certificados');
  await modal().locator('.m-pie').getByRole('button', { name: 'Cerrar' }).click();
  paso(`Certificado ${codigo} generado solo para quien cumple el 80 % de asistencia`);

  await ir('inicio');
  await w.locator('.banner img.foto').waitFor();
  await w.locator('.banner h1', { hasText: 'Olimpiada de Matemáticas MEIF 2026' }).waitFor();
  await captura('06-inicio-con-banner');
  paso('El banner de Inicio muestra la foto inaugural del evento');

  // Cambiar banner desde Inicio con otra foto
  eleccion(path.join(raiz, 'build', 'icon.png'));
  await w.getByRole('button', { name: 'Cambiar banner' }).click();
  await elegir(modal().getByLabel('Evento'), 'Olimpiada');
  await modal().getByRole('button', { name: /Subir otra foto/ }).click();
  await w.locator('.modal').waitFor({ state: 'detached' });
  paso('Banner actualizado desde Inicio');
  eleccion(foto);
  await w.getByRole('button', { name: 'Cambiar banner' }).click();
  await elegir(modal().getByLabel('Evento'), 'Olimpiada');
  await modal().getByRole('button', { name: /Subir otra foto/ }).click();
  await w.locator('.modal').waitFor({ state: 'detached' });

  await ir('certificados');
  await w.getByRole('tab', { name: 'Verificar autenticidad' }).click();
  await w.getByLabel('Contenido del QR o código del certificado').fill(codigo);
  await w.getByRole('button', { name: 'Verificar' }).click();
  await w.getByText('Certificado auténtico y vigente.').waitFor();
  paso('Certificado verificado');

  await ir('reportes');
  await w.getByRole('button', { name: 'Vista previa' }).click();
  await w.getByRole('cell', { name: 'Olimpiada de Matemáticas MEIF 2026' }).waitFor();
  await captura('07-reportes');
  await ir('eventos');
  await w.locator('.tarjeta-evento img').waitFor();
  await captura('08-eventos');
  for (const p of ['participantes', 'ponentes', 'configuracion']) { await ir(p); await w.waitForTimeout(300); await captura(`09-${p}`); }
  paso('Reportes, listados y configuración cargan');

  await app.close();
  const pdf = fs.readdirSync(path.join(tmp, 'datos', 'datos', 'certificados')).find((n) => n.startsWith(codigo));
  if (!pdf) throw new Error('No se encontró el PDF del certificado');
  if (!fs.readdirSync(path.join(tmp, 'datos', 'respaldos')).some((n) => n.includes('automatico'))) throw new Error('Sin copia automática');
  paso('PDF del certificado y copia de seguridad automática en disco');
} catch (e) {
  if (capturas) await w.screenshot({ path: path.join(capturas, 'FALLO.png') }).catch(() => undefined);
  await app.close().catch(() => undefined);
  throw e;
}
const relevantes = errores.filter((e) => !/Autofill|Electron Security/.test(e));
if (relevantes.length) { console.error('Errores de consola:\n' + relevantes.join('\n')); process.exit(1); }
console.log(`\nE2E correcto: ${pasos} pasos.`);
