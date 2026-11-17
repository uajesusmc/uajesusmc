import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Aplicacion } from '../electron/ipc';
import * as agenda from '../electron/services/agenda';
import * as asistencia from '../electron/services/asistencia';
import * as auth from '../electron/services/auth';
import * as certificados from '../electron/services/certificados';
import { fechaISO, type Contexto } from '../electron/services/comun';
import * as config from '../electron/services/config';
import * as datos from '../electron/services/datos';
import * as org from '../electron/services/organizacion';
import * as firmas from '../electron/services/firmas';
import * as documentos from '../electron/services/documentos';
import * as reportes from '../electron/services/reportes';
import * as respaldo from '../electron/services/respaldo';

const dias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return fechaISO(d); };
let app: Aplicacion;
let ctx: Contexto;

beforeEach(async () => {
  app = new Aplicacion(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-')));
  ctx = await app.abrir();
  auth.crearPrimerAdministrador(ctx, { usuario: 'admin', nombre: 'Admin', clave: 'Clave2027' });
  config.escribirConfig(ctx.db, 'presidente_nombre', 'Presidenta MEIF');
});

function evento(extra: Record<string, unknown> = {}) {
  return datos.guardar(ctx, 'eventos', {
    nombre: 'Olimpiada de Matemáticas 2026', tipo: 'Olimpiada', modalidad: 'Presencial', fecha_inicio: dias(-3), fecha_fin: dias(2),
    lugar: 'Coliseo', estado: 'En curso', asistencia_minima: 60, ...extra,
  });
}
const participante = (id: string) => datos.guardar(ctx, 'participantes', { tipo_documento: 'TI', identificacion: id, nombres: 'Ana', apellidos: `Prueba ${id}` });
const ponente = (id: string) => datos.guardar(ctx, 'ponentes', { identificacion: id, nombres: 'Luis', apellidos: `Polo ${id}` });
const act = (ev: number, extra: Partial<agenda.DatosActividad> = {}): agenda.DatosActividad => ({
  evento_id: ev, titulo: 'Taller de funciones', tipo: 'Taller', area: 'Matemáticas', fecha: dias(-1), hora_inicio: '08:00', hora_fin: '10:00', lugar: 'Aula 1', ...extra,
});

describe('Eventos y banner', () => {
  it('guarda eventos por año y valida fechas', () => {
    const id = evento();
    expect(datos.obtener(ctx, 'eventos', id).anio).toBe(Number(dias(-3).slice(0, 4)));
    expect(() => evento({ fecha_inicio: dias(5), fecha_fin: dias(1) })).toThrow(/anterior/);
    expect(() => evento({ nombre: '' })).toThrow(/obligatorio/);
  });

  it('actualiza el banner con la foto inaugural del evento', () => {
    const e1 = evento();
    const e2 = evento({ nombre: 'Feria de la ciencia', tipo: 'Feria de la ciencia' });
    const foto = path.join(ctx.rutas.datos, 'inauguracion.jpg');
    fs.writeFileSync(foto, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    expect(config.bannerActual(ctx)).toBeNull();
    config.guardarFotoEvento(ctx, e1, foto);
    expect(config.bannerActual(ctx)!.id).toBe(e1);
    expect(config.bannerActual(ctx)!.imagen.startsWith('data:image/jpeg;base64,')).toBe(true);
    config.guardarFotoEvento(ctx, e2, foto);
    expect(config.bannerActual(ctx)!.nombre).toBe('Feria de la ciencia');
    config.fijarBanner(ctx, e1);
    expect(config.bannerActual(ctx)!.id).toBe(e1);
    config.guardarFotoEvento(ctx, e1, null);
    expect(config.bannerActual(ctx)!.id).toBe(e2);
    const txt = path.join(ctx.rutas.datos, 'x.txt');
    fs.writeFileSync(txt, 'x');
    expect(() => config.guardarFotoEvento(ctx, e1, txt)).toThrow(/JPG o PNG/);
  });
});

describe('Participantes e inscripciones', () => {
  it('no duplica identificaciones y respeta el cupo', () => {
    const ev = evento({ cupo: 1 });
    const a = participante('1001');
    const b = participante('1002');
    expect(() => participante('1001')).toThrow(/Ya existe/);
    expect(datos.inscribir(ctx, ev, [a, b])).toEqual({ inscritos: 1, omitidos: [expect.stringMatching(/cupo/)] });
  });

  it('importa desde Excel con vista previa', async () => {
    const ev = evento();
    participante('2002');
    const f = path.join(ctx.rutas.datos, 'p.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('P');
    ws.addRow(['Identificación', 'Nombres', 'Apellidos', 'Grado']);
    ws.addRow(['2001', 'Sofía', 'Charris', '11']);
    ws.addRow(['2002', 'Ya', 'Existe', '']);
    ws.addRow(['2003', '', 'Sin nombre', '']);
    await wb.xlsx.writeFile(f);
    const sim = await datos.importar(ctx, f, { eventoId: ev, simular: true });
    expect(sim.filas.map((x) => x.estado)).toEqual(['nuevo', 'existente', 'error']);
    expect(datos.listar(ctx, 'participantes')).toHaveLength(1);
    const r = await datos.importar(ctx, f, { eventoId: ev, simular: false });
    expect(r.creados).toBe(1);
    expect(r.inscritos).toBe(2);
    expect(datos.inscritos(ctx, ev).find((i) => i.identificacion === '2001')!.grado).toBe('11°');
  });
});

describe('Agenda', () => {
  it('detecta cruces de ponente y lugar, y fechas fuera del evento', () => {
    const ev = evento();
    const p = ponente('3001');
    agenda.guardar(ctx, act(ev, { ponente_id: p }));
    expect(agenda.verificar(ctx, act(ev, { titulo: 'Otra', ponente_id: p, lugar: 'Aula 2', hora_inicio: '09:00', hora_fin: '11:00' })).errores[0]).toMatch(/Cruce del ponente/);
    expect(agenda.verificar(ctx, act(ev, { titulo: 'Otra', hora_inicio: '09:30', hora_fin: '10:30' })).errores[0]).toMatch(/lugar/);
    expect(agenda.verificar(ctx, act(ev, { titulo: 'Otra', fecha: dias(30) })).errores[0]).toMatch(/fuera del evento/);
    expect(agenda.verificar(ctx, act(ev, { titulo: 'Contigua', ponente_id: p, hora_inicio: '10:00', hora_fin: '12:00' })).errores).toHaveLength(0);
    expect(() => agenda.guardar(ctx, act(ev))).toThrow(/duplicada/);
  });
});

describe('Asistencia y certificados', () => {
  it('certifica solo a quienes cumplen la asistencia y verifica el QR', async () => {
    const ev = evento();
    const [a, b] = [participante('4001'), participante('4002')];
    datos.inscribir(ctx, ev, [a, b]);
    const ids = [
      agenda.guardar(ctx, act(ev, { titulo: 'Inauguración', tipo: 'Ceremonia', hora_inicio: '07:00', hora_fin: '08:00' })),
      agenda.guardar(ctx, act(ev)),
      agenda.guardar(ctx, act(ev, { titulo: 'Receso', tipo: 'Receso', hora_inicio: '10:00', hora_fin: '10:30' })),
    ];
    expect(agenda.horasEvento(ctx, ev)).toBe(3);
    asistencia.registrar(ctx, ids[0], [{ participante_id: a, presente: true }, { participante_id: b, presente: true }]);
    asistencia.registrar(ctx, ids[1], [{ participante_id: a, presente: true }, { participante_id: b, presente: false }]);
    expect(() => asistencia.registrar(ctx, ids[2], [])).toThrow(/recesos/);
    const r = asistencia.resumenEvento(ctx, ev);
    expect(r.find((x) => x.participante_id === a)).toMatchObject({ asistidas: 1 + 1, porcentaje: 100, horas: 3, aprueba: true });
    expect(r.find((x) => x.participante_id === b)).toMatchObject({ porcentaje: 50, aprueba: false });

    const g = await certificados.generar(ctx, ev, [a, b]);
    expect(g.generados).toHaveLength(1);
    expect(g.omitidos[0].motivo).toMatch(/50%/);
    expect(fs.readFileSync(path.join(ctx.rutas.certificados, `${g.generados[0].codigo}.pdf`)).subarray(0, 4).toString()).toBe('%PDF');
    expect((await certificados.generar(ctx, ev, [a])).omitidos[0].motivo).toMatch(/vigente/);
    const c = ctx.db.get('SELECT * FROM certificados WHERE participante_id = ?', [a]);
    expect(certificados.verificar(ctx, `MEIF-EVENTOS|${c.codigo}|4001|3|${c.firma_hash}`).estado).toBe('valido');
    expect(certificados.verificar(ctx, `MEIF-EVENTOS|${c.codigo}|4001|30|${c.firma_hash}`).estado).toBe('alterado');
    const re = await certificados.generar(ctx, ev, [a], 'Corrección de nombre');
    expect(re.generados).toHaveLength(1);
    expect(certificados.verificar(ctx, c.codigo).estado).toBe('anulado');
  });
});

describe('Organización: cursillos, aulas y horario de docentes', () => {
  it('programa sesiones con docente y aula, y detecta cruces', () => {
    const ev = evento({ fecha_inicio: dias(-7), fecha_fin: dias(14) });
    const [d1, d2] = [ponente('6001'), ponente('6002')];
    const a101 = org.guardarAula(ctx, { nombre: 'Aula 101', capacidad: 30 });
    const a102 = org.guardarAula(ctx, { nombre: 'Aula 102', capacidad: 20 });
    expect(() => org.guardarAula(ctx, { nombre: 'aula 101' })).toThrow(/Ya existe/);
    const alg = org.guardarCursillo(ctx, { evento_id: ev, nombre: 'Álgebra', area: 'Matemáticas', nivel: '10°', docente_id: d1, aula_id: a101, cupo: 25 }).id;
    const r = org.guardarCursillo(ctx, { evento_id: ev, nombre: 'Física básica', area: 'Física', docente_id: d2, aula_id: a102, cupo: 25 });
    expect(r.advertencias[0]).toMatch(/supera la capacidad/);
    const fis = r.id;

    // Sesiones semanales (lunes y miércoles) dentro del evento
    const p = { cursillo_id: alg, dias: [1, 3], desde: dias(-7), hasta: dias(14), hora_inicio: '08:00', hora_fin: '10:00' };
    const v = org.verificarProgramacion(ctx, p);
    expect(v.sesiones.length).toBeGreaterThanOrEqual(5);
    expect(v.validas).toBe(v.sesiones.length);
    expect(org.programar(ctx, p).creadas).toBe(v.sesiones.length);

    // Mismo docente a la misma hora: cruce
    const otro = org.guardarCursillo(ctx, { evento_id: ev, nombre: 'Geometría', docente_id: d1, aula_id: a102 }).id;
    expect(() => org.programar(ctx, { ...p, cursillo_id: otro })).toThrow(/Cruce del ponente/);
    // Física en el Aula 101 ocupada a esa hora: cruce de aula
    org.guardarCursillo(ctx, { evento_id: ev, nombre: 'Física básica', docente_id: d2, aula_id: a101, cupo: 25, id: fis });
    expect(org.verificarProgramacion(ctx, { ...p, cursillo_id: fis }).sesiones[0].errores[0]).toMatch(/Aula 101/);
    // Otra hora: sin cruce
    expect(org.programar(ctx, { ...p, cursillo_id: fis, hora_inicio: '10:00', hora_fin: '12:00' }).omitidas).toHaveLength(0);

    // Cambiar el aula de Álgebra actualiza sus sesiones; cambiar al docente ocupado se rechaza
    org.guardarCursillo(ctx, { id: alg, evento_id: ev, nombre: 'Álgebra', docente_id: d1, aula_id: a102 });
    expect(org.horarioDocentes(ctx, ev, d1).every((s) => s.aula === 'Aula 102')).toBe(true);
    org.programar(ctx, { cursillo_id: otro, fechas: [dias(1)], hora_inicio: '14:00', hora_fin: '15:00' });
    expect(() => org.guardarCursillo(ctx, { id: fis, evento_id: ev, nombre: 'Física básica', docente_id: d1, aula_id: a101 })).not.toThrow();

    const h = org.horarioDocentes(ctx, ev);
    expect(h[0]).toMatchObject({ cursillo: expect.any(String), aula: expect.any(String), docente: expect.any(String) });
    const rep = reportes.construir(ctx, 'horario_docentes', { eventoId: ev, ponenteId: d1 });
    expect(rep.filas.at(-1)!.docente).toMatch(/^Total/);
    expect(() => org.eliminarAula(ctx, a102)).toThrow(/asignada/);
  });
});

describe('Firmas del Presidente y del Secretario', () => {
  const fx = (n: string) => path.join(__dirname, 'fixtures', n);
  it('cada firmante sube su propia firma y aparece en certificados y documentos', async () => {
    auth.guardarUsuario(ctx, { usuario: 'presidente', nombre: 'Carlos Ruiz', rol: 'consulta', clave: 'Presi2026', firmante: 'presidente' });
    auth.guardarUsuario(ctx, { usuario: 'secretario', nombre: 'Ana Polo', rol: 'consulta', clave: 'Secre2026', firmante: 'secretario' });
    expect(() => auth.guardarUsuario(ctx, { usuario: 'otro', nombre: 'Otro', rol: 'consulta', clave: 'Otro20260', firmante: 'presidente' })).toThrow(/ya firma como presidente/);

    // El secretario sube la suya, pero no puede tocar la del presidente
    auth.iniciarSesion(ctx, 'secretario', 'Secre2026');
    firmas.datos(ctx, 'secretario', { nombre: 'Ana María Polo', cargo: 'Secretaria MEIF' });
    firmas.subir(ctx, 'secretario', fx('firma-secretario.png'));
    expect(() => firmas.subir(ctx, 'presidente', fx('firma-secretario.png'))).toThrow(/Solo el presidente/);
    expect(() => firmas.datos(ctx, 'presidente', { nombre: 'X', cargo: 'Y' })).toThrow(/Solo el presidente/);
    // Su rol es «solo consulta»: no puede editar eventos, pero sí su firma
    expect(() => datos.guardar(ctx, 'eventos', { nombre: 'X' })).toThrow(/solo consulta/);

    auth.iniciarSesion(ctx, 'presidente', 'Presi2026');
    firmas.datos(ctx, 'presidente', { nombre: 'Carlos Ruiz Charris', cargo: 'Presidente MEIF' });
    firmas.subir(ctx, 'presidente', fx('firma-presidente.png'));
    const e = firmas.estado(ctx);
    expect(e.map((f) => [f.firmante, !!f.imagen, f.puedeEditar])).toEqual([['presidente', true, true], ['secretario', true, false]]);
    expect(e[1].actualizada_por).toBe('Ana Polo');
    expect(firmas.paraDocumentos(ctx).map((f) => f.nombre)).toEqual(['Carlos Ruiz Charris', 'Ana María Polo']);

    // Organizador no puede cambiar los nombres de los firmantes desde la configuración general
    auth.iniciarSesion(ctx, 'admin', 'Clave2027');
    config.guardarConfig(ctx, { presidente_nombre: 'Intruso', org_nombre: 'MEIF' });
    expect(config.leerConfig(ctx.db).presidente_nombre).toBe('Carlos Ruiz Charris');

    // Certificado y reporte con las dos firmas
    const ev = evento();
    const a = participante('7001');
    datos.inscribir(ctx, ev, [a]);
    const act1 = agenda.guardar(ctx, act(ev));
    asistencia.registrar(ctx, act1, [{ participante_id: a, presente: true }]);
    const g = await certificados.generar(ctx, ev, [a]);
    expect(g.generados).toHaveLength(1);
    const destino = path.join(ctx.rutas.datos, 'inscritos.pdf');
    await reportes.exportar(ctx, reportes.construir(ctx, 'inscritos', { eventoId: ev }), 'pdf', destino);
    expect(fs.statSync(destino).size).toBeGreaterThan(20000); // incluye las imágenes de las firmas

    // Sin ninguna firma configurada no se generan certificados
    config.escribirConfig(ctx.db, 'presidente_nombre', '');
    config.escribirConfig(ctx.db, 'secretario_nombre', '');
    await expect(certificados.generar(ctx, ev, [a], 'Prueba')).rejects.toThrow(/Firmas/);
  });
});

describe('Documentos institucionales con membrete', () => {
  it('numera por tipo y año, firma y regenera el PDF', async () => {
    firmas.datos(ctx, 'secretario', { nombre: 'Ana Polo', cargo: 'Secretaria MEIF' });
    firmas.subir(ctx, 'secretario', path.join(__dirname, 'fixtures', 'firma-secretario.png'));
    config.guardarConfig(ctx, { org_nit: '900.123.456-7', org_direccion: 'Calle 20 # 18-45, Sabanalarga', org_telefono: '300 000 0000', org_correo: 'meif@ejemplo.org', org_lema: 'Ciencia para transformar' });
    const base = { asunto: 'Invitación a la olimpiada', cuerpo: 'Párrafo uno.\n\nPárrafo dos.', firmantes: ['presidente', 'secretario'] as any, fecha: '2026-03-10' };
    const a = await documentos.crear(ctx, { ...base, tipo: 'Oficio', destinatario: 'Rector(a)\nIE Técnica' });
    const b = await documentos.crear(ctx, { ...base, tipo: 'Oficio' });
    const c = await documentos.crear(ctx, { ...base, tipo: 'Constancia', firmantes: ['secretario'] as any });
    expect([a.consecutivo, b.consecutivo, c.consecutivo]).toEqual(['MEIF-OF-2026-001', 'MEIF-OF-2026-002', 'MEIF-CO-2026-001']);
    expect(fs.readFileSync(a.archivo).subarray(0, 4).toString()).toBe('%PDF');
    fs.rmSync(a.archivo);
    expect(fs.existsSync(await documentos.archivo(ctx, a.id))).toBe(true);
    config.escribirConfig(ctx.db, 'presidente_nombre', '');
    await expect(documentos.crear(ctx, { ...base, tipo: 'Circular' })).rejects.toThrow(/presidente/);
    await expect(documentos.crear(ctx, { ...base, tipo: 'Circular', cuerpo: '' })).rejects.toThrow(/contenido/);
    expect(documentos.listar(ctx, { tipo: 'Oficio' })).toHaveLength(2);
  });
});

describe('Miembros de MEIF', () => {
  it('registra miembros con o sin cargo y controla los cargos directivos', async () => {
    const m = (id: string, extra: Record<string, unknown> = {}) => datos.guardar(ctx, 'miembros', {
      tipo_documento: 'CC', identificacion: id, nombres: 'Nombre', apellidos: `Apellido ${id}`, estado: 'Activo', ...extra,
    });
    const pres = m('1001', { cargo: 'Presidente(a)', telefono: '3001234567', correo: 'presi@meif.org' });
    m('1002', { cargo: 'Secretario(a)' });
    m('1003'); // sin cargo
    m('1004', { cargo: 'Vocal' });
    m('1005', { cargo: 'Vocal' }); // los vocales pueden ser varios
    expect(() => m('1006', { cargo: 'Presidente(a)' })).toThrow(/ya lo ocupa/);
    expect(() => m('1001')).toThrow(/Ya existe/);
    expect(() => m('1007', { fecha_nacimiento: '2999-01-01' })).toThrow(/futura/);
    // Si el presidente anterior queda inactivo, el cargo se libera
    datos.guardar(ctx, 'miembros', { ...datos.obtener(ctx, 'miembros', pres), estado: 'Inactivo' });
    m('1008', { cargo: 'Presidente(a)' });

    const lista = datos.listar(ctx, 'miembros');
    expect(lista[0].cargo).toBe('Presidente(a)'); // junta directiva primero
    expect(lista.at(-1)!.estado).toBe('Inactivo'); // inactivos al final
    expect(datos.listar(ctx, 'miembros', { cargo: 'Sin cargo' }).map((x) => x.identificacion)).toEqual(['1003']);
    expect(datos.listar(ctx, 'miembros', { cargo: 'Vocal' })).toHaveLength(2);

    const destino = path.join(ctx.rutas.datos, 'miembros.pdf');
    await reportes.exportar(ctx, reportes.construir(ctx, 'miembros', {}), 'pdf', destino);
    expect(fs.statSync(destino).size).toBeGreaterThan(1000);
    datos.eliminar(ctx, 'miembros', pres);
    expect(datos.papelera(ctx).some((p) => p.tabla === 'miembros')).toBe(true);
  });
});

describe('Reportes, seguridad y respaldos', () => {
  it('exporta todos los reportes en PDF y Excel', async () => {
    const ev = evento();
    datos.inscribir(ctx, ev, [participante('5001')]);
    agenda.guardar(ctx, act(ev, { ponente_id: ponente('5101') }));
    for (const r of reportes.REPORTES) {
      for (const f of ['pdf', 'xlsx'] as const) {
        const d = path.join(ctx.rutas.datos, `${r.id}.${f}`);
        await reportes.exportar(ctx, reportes.construir(ctx, r.id, { eventoId: ev, anio: new Date().getFullYear() }), f, d);
        expect(fs.statSync(d).size).toBeGreaterThan(500);
      }
    }
    expect(reportes.panel(ctx, Number(dias(-3).slice(0, 4))).kpis.eventos).toBe(1);
  });

  it('usuarios de solo consulta no pueden modificar', () => {
    auth.guardarUsuario(ctx, { usuario: 'lector', nombre: 'Lector', rol: 'consulta', clave: 'Lector2027' });
    auth.iniciarSesion(ctx, 'lector', 'Lector2027');
    expect(() => evento()).toThrow(/solo consulta/);
    expect(() => auth.listarUsuarios(ctx)).toThrow(/administrador/);
  });

  it('persiste, respalda y restaura', async () => {
    evento();
    const dir = respaldo.crear(ctx, 'manual');
    evento({ nombre: 'Segundo' });
    app.cerrar();
    ctx = await app.abrir();
    expect(ctx.db.valor('SELECT count(*) FROM eventos')).toBe(2);
    auth.iniciarSesion(ctx, 'admin', 'Clave2027');
    ctx = await app.restaurar(dir);
    expect(ctx.db.valor('SELECT count(*) FROM eventos')).toBe(1);
  });
});
