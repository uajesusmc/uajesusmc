import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Aplicacion } from '../electron/aplicacion';
import { Db } from '../electron/db/connection';
import * as asistencia from '../electron/services/asistencia';
import * as auth from '../electron/services/auth';
import * as certificados from '../electron/services/certificados';
import { fechaISO, type Contexto } from '../electron/services/comun';
import { escribirConfig } from '../electron/services/config';
import * as crud from '../electron/services/crud';
import * as dashboard from '../electron/services/dashboard';
import * as estudiantes from '../electron/services/estudiantes';
import * as horarios from '../electron/services/horarios';
import * as material from '../electron/services/materiales';
import * as planeacion from '../electron/services/planeacion';
import * as reportes from '../electron/services/reportes';

const dias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return fechaISO(d); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'meif-'));

async function nuevoContexto(): Promise<Contexto> {
  const dir = tmp();
  const db = await Db.abrir(null);
  auth.sembrarRoles(db);
  const rutas = {
    datos: dir, materiales: path.join(dir, 'materiales'), certificados: path.join(dir, 'certificados'),
    respaldos: path.join(dir, 'respaldos'), reportes: path.join(dir, 'reportes'),
  };
  for (const d of Object.values(rutas)) fs.mkdirSync(d, { recursive: true });
  const ctx: Contexto = { db, sesion: null, rutas, demo: false };
  auth.crearPrimerAdministrador(ctx, { usuario: 'admin', nombre: 'Administrador', clave: 'Clave2027' });
  escribirConfig(db, 'director_nombre', 'Directora de Prueba');
  return ctx;
}

/** Escenario base: periodo, cursillo, docentes, asignatura, grupos y estudiantes. */
function escenario(ctx: Contexto) {
  const periodo = crud.guardar(ctx, 'periodos', { codigo: 'P27', nombre: 'Periodo 2027', fecha_inicio: dias(-60), fecha_fin: dias(60) });
  const cursillo = crud.guardar(ctx, 'cursillos', {
    codigo: 'C27', nombre: 'Cursillo 2027', periodo_id: periodo, modalidad: 'Presencial', fecha_inicio: dias(-30), fecha_fin: dias(30),
    estado: 'Activo', asistencia_minima: 80,
  });
  const d1 = crud.guardar(ctx, 'docentes', { identificacion: '1001', nombres: 'Ana', apellidos: 'Ruiz' });
  const d2 = crud.guardar(ctx, 'docentes', { identificacion: '1002', nombres: 'Luis', apellidos: 'Polo' });
  const mat = crud.guardar(ctx, 'asignaturas', { codigo: 'MAT', nombre: 'Matemáticas', area: 'Matemáticas', cursillo_id: cursillo, docente_id: d1, intensidad_horaria: 28 });
  const fis = crud.guardar(ctx, 'asignaturas', { codigo: 'FIS', nombre: 'Física', area: 'Física', cursillo_id: cursillo, docente_id: d2, intensidad_horaria: 4 });
  const gA = crud.guardar(ctx, 'grupos', { cursillo_id: cursillo, nombre: 'A', cupo: 3, aula: '101' });
  const gB = crud.guardar(ctx, 'grupos', { cursillo_id: cursillo, nombre: 'B', aula: '102' });
  const est = [1, 2, 3].map((i) => crud.guardar(ctx, 'estudiantes', { tipo_documento: 'TI', identificacion: `90${i}`, nombres: `Est${i}`, apellidos: 'Prueba' }));
  const mats = est.map((e) => crud.guardar(ctx, 'matriculas', { estudiante_id: e, cursillo_id: cursillo, grupo_id: gA, fecha_inscripcion: dias(-40), estado: 'Activa' }));
  return { periodo, cursillo, d1, d2, mat, fis, gA, gB, est, mats };
}

const clase = (e: ReturnType<typeof escenario>, extra: Partial<horarios.DatosClase> = {}): horarios.DatosClase => ({
  cursillo_id: e.cursillo, asignatura_id: e.mat, docente_id: e.d1, grupo_id: e.gA, fecha: dias(-7), hora_inicio: '08:00', hora_fin: '10:00', aula: '101', ...extra,
});

let ctx: Contexto;
beforeEach(async () => { ctx = await nuevoContexto(); });

describe('Base de datos y validaciones', () => {
  it('aplica las migraciones y siembra roles y permisos', () => {
    expect(ctx.db.version).toBe(1);
    expect(ctx.db.valor('SELECT count(*) FROM roles')).toBe(4);
    expect(ctx.sesion?.rol).toBe('superadmin');
  });

  it('evita estudiantes duplicados por identificación y valida obligatorios', () => {
    crud.guardar(ctx, 'estudiantes', { identificacion: '123', nombres: 'A', apellidos: 'B', tipo_documento: 'TI' });
    expect(() => crud.guardar(ctx, 'estudiantes', { identificacion: ' 123 ', nombres: 'C', apellidos: 'D', tipo_documento: 'TI' })).toThrow(/Ya existe un estudiante/);
    expect(() => crud.guardar(ctx, 'estudiantes', { identificacion: '124', nombres: '', apellidos: 'D', tipo_documento: 'TI' })).toThrow(/Nombres.*obligatorio/);
    expect(() => crud.guardar(ctx, 'estudiantes', { identificacion: '125', nombres: 'A', apellidos: 'D', tipo_documento: 'TI', correo: 'malo' })).toThrow(/correo/);
  });

  it('exige que el cursillo esté dentro del periodo', () => {
    const p = crud.guardar(ctx, 'periodos', { codigo: 'X', nombre: 'X', fecha_inicio: '2027-01-01', fecha_fin: '2027-06-30' });
    expect(() => crud.guardar(ctx, 'cursillos', {
      codigo: 'C', nombre: 'C', periodo_id: p, modalidad: 'Presencial', fecha_inicio: '2026-12-01', fecha_fin: '2027-02-01', estado: 'Activo', asistencia_minima: 80,
    })).toThrow(/dentro del periodo/);
  });

  it('controla el cupo del grupo y asigna asignaturas al matricular', () => {
    const e = escenario(ctx);
    const extra = crud.guardar(ctx, 'estudiantes', { identificacion: '999', nombres: 'X', apellidos: 'Y', tipo_documento: 'TI' });
    expect(() => crud.guardar(ctx, 'matriculas', { estudiante_id: extra, cursillo_id: e.cursillo, grupo_id: e.gA, fecha_inscripcion: dias(0), estado: 'Activa' })).toThrow(/cupo/);
    const asign = estudiantes.asignaturasMatricula(ctx, e.mats[0]);
    expect(asign.filter((a) => a.asignada).length).toBe(2);
  });

  it('papelera: bloquea si hay dependencias, elimina lógicamente y restaura', () => {
    const e = escenario(ctx);
    expect(() => crud.eliminar(ctx, 'cursillos', e.cursillo)).toThrow(/matrículas/);
    crud.eliminar(ctx, 'grupos', e.gB);
    expect(crud.listar(ctx, 'grupos').length).toBe(1);
    expect(crud.papelera(ctx).some((p) => p.tabla === 'grupos')).toBe(true);
    crud.restaurar(ctx, 'grupos', e.gB);
    expect(crud.listar(ctx, 'grupos').length).toBe(2);
  });
});

describe('Seguridad', () => {
  it('inicio de sesión, contraseña y bloqueo por intentos', () => {
    expect(() => auth.iniciarSesion(ctx, 'admin', 'mala')).toThrow(/incorrectos/);
    expect(auth.iniciarSesion(ctx, 'ADMIN', 'Clave2027').usuario).toBe('admin');
    expect(() => auth.cambiarClave(ctx, 'Clave2027', 'corta')).toThrow(/8 caracteres/);
    auth.cambiarClave(ctx, 'Clave2027', 'Nueva2028');
    expect(auth.iniciarSesion(ctx, 'admin', 'Nueva2028').rol).toBe('superadmin');
    for (let i = 0; i < 5; i++) expect(() => auth.iniciarSesion(ctx, 'otro', 'x')).toThrow();
    expect(() => auth.iniciarSesion(ctx, 'otro', 'x')).toThrow(/Demasiados intentos/);
  });

  it('aplica permisos por rol y restringe al docente a lo propio', () => {
    const e = escenario(ctx);
    auth.guardarUsuario(ctx, { usuario: 'secre', nombre: 'Secretaría', rol_id: 4, clave: 'Secre2027' });
    auth.guardarUsuario(ctx, { usuario: 'prof', nombre: 'Prof', rol_id: 3, docente_id: e.d2, clave: 'Prof20270' });
    expect(() => auth.guardarUsuario(ctx, { usuario: 'sin', nombre: 'Sin', rol_id: 3, clave: 'Prof20270' })).toThrow(/vinculado a un docente/);
    auth.iniciarSesion(ctx, 'secre', 'Secre2027');
    expect(() => horarios.crear(ctx, { base: clase(e), fechas: [dias(-7)] })).toThrow(/no tiene permiso/);
    crud.guardar(ctx, 'estudiantes', { identificacion: '777', nombres: 'Nuevo', apellidos: 'Est', tipo_documento: 'TI' });
    auth.iniciarSesion(ctx, 'prof', 'Prof20270');
    expect(() => crud.guardar(ctx, 'estudiantes', { identificacion: '778', nombres: 'N', apellidos: 'E', tipo_documento: 'TI' })).toThrow(/no tiene permiso/);
    expect(() => planeacion.guardarTematica(ctx, { asignatura_id: e.mat, unidad: 'U1', tema: 'T', horas_asignadas: 2 })).toThrow(/docente responsable/);
    expect(planeacion.guardarTematica(ctx, { asignatura_id: e.fis, unidad: 'U1', tema: 'Cinemática', horas_asignadas: 2 })).toBeGreaterThan(0);
  });

  it('protege al último superadministrador', () => {
    expect(() => auth.guardarUsuario(ctx, { id: ctx.sesion!.id, usuario: 'admin', nombre: 'A', rol_id: 2 })).toThrow();
  });
});

describe('Horarios y conflictos', () => {
  it('detecta cruces de docente, grupo, duplicados y fechas inconsistentes', () => {
    const e = escenario(ctx);
    expect(horarios.crear(ctx, { base: clase(e), fechas: [dias(-7)] }).creadas).toBe(1);
    // duplicado exacto
    let v = horarios.verificarLote(ctx, { base: clase(e), fechas: [dias(-7)] });
    expect(v.errores.map((x) => x.tipo)).toContain('duplicado');
    // mismo docente con otro grupo en franja solapada
    v = horarios.verificarLote(ctx, { base: clase(e, { grupo_id: e.gB, hora_inicio: '09:00', hora_fin: '11:00', aula: '102' }), fechas: [dias(-7)] });
    expect(v.errores.map((x) => x.tipo)).toContain('cruce_docente');
    // mismo grupo con otro docente
    v = horarios.verificarLote(ctx, { base: clase(e, { asignatura_id: e.fis, docente_id: e.d2, hora_inicio: '09:30', hora_fin: '10:30' }), fechas: [dias(-7)] });
    expect(v.errores.map((x) => x.tipo)).toContain('cruce_grupo');
    // aula ocupada por otro grupo: advertencia, no error
    v = horarios.verificarLote(ctx, { base: clase(e, { grupo_id: e.gB, docente_id: e.d2, asignatura_id: e.fis, aula: '101' }), fechas: [dias(-7)] });
    expect(v.errores).toHaveLength(0);
    expect(v.advertencias.map((x) => x.tipo)).toContain('aula');
    // fuera del cursillo
    v = horarios.verificarLote(ctx, { base: clase(e), fechas: [dias(45)] });
    expect(v.errores.map((x) => x.tipo)).toContain('fecha');
    // franjas contiguas no son cruce
    v = horarios.verificarLote(ctx, { base: clase(e, { hora_inicio: '10:00', hora_fin: '12:00' }), fechas: [dias(-7)] });
    expect(v.errores).toHaveLength(0);
    expect(() => horarios.crear(ctx, { base: clase(e), fechas: [dias(-7)] })).toThrow(/conflicto/);
  });

  it('crea clases recurrentes por día de la semana y omite conflictivas si se pide', () => {
    const e = escenario(ctx);
    const fechas = horarios.fechasRecurrentes(dias(-14), dias(13), [6]);
    expect(fechas.length).toBe(4);
    expect(fechas.every((f) => new Date(f + 'T12:00').getDay() === 6)).toBe(true);
    horarios.crear(ctx, { base: clase(e), fechas: [fechas[1]] });
    const r = horarios.crear(ctx, { base: clase(e), dias: [6], desde: dias(-14), hasta: dias(13) }, { omitirConflictivas: true });
    expect(r.creadas).toBe(3);
    expect(r.omitidas).toEqual([fechas[1]]);
  });

  it('advierte cuando la programación supera la intensidad horaria del grupo', () => {
    const e = escenario(ctx);
    const v = horarios.verificarLote(ctx, { base: clase(e, { asignatura_id: e.fis, docente_id: e.d2 }), fechas: [dias(-7), dias(-6), dias(-5)] });
    expect(v.advertencias.map((x) => x.tipo)).toContain('intensidad');
  });
});

describe('Planeación temática', () => {
  it('calcula programadas, ejecutadas, pendientes, avance y redistribuye', () => {
    const e = escenario(ctx);
    const temas = [['Unidad 1', 'Números reales', 4], ['Unidad 2', 'Expresiones algebraicas', 6], ['Unidad 3', 'Funciones', 8], ['Unidad 4', 'Geometría', 6], ['Unidad 5', 'Estadística básica', 4]] as const;
    const ids = temas.map(([u, t, h], i) => planeacion.guardarTematica(ctx, { asignatura_id: e.mat, unidad: u, tema: t, horas_asignadas: h, fecha_programada: dias(-20 + i * 10) }));
    let r = planeacion.resumen(ctx.db, e.mat);
    expect(r.programadas).toBe(28);
    expect(r.distribucion).toBe(100);
    expect(r.ejecutadas).toBe(0);
    // Ejecutar una clase de 2 h vinculada a la temática 1
    horarios.crear(ctx, { base: clase(e, { tematica_id: ids[0] }), fechas: [dias(-7)] });
    const c = horarios.listar(ctx)[0];
    horarios.cambiarEstado(ctx, c.id, 'Ejecutada');
    r = planeacion.resumen(ctx.db, e.mat);
    expect(r.ejecutadas).toBe(2);
    expect(r.pendientes).toBe(26);
    expect(r.avance).toBeCloseTo(7.1, 1);
    expect(r.estado).toBe('Atrasada');
    horarios.cambiarEstado(ctx, c.id, 'Programada');
    expect(planeacion.resumen(ctx.db, e.mat).ejecutadas).toBe(0);
    // Redistribución proporcional ajustada a 30 h
    ctx.db.run('UPDATE asignaturas SET intensidad_horaria = 30 WHERE id = ?', [e.mat]);
    r = planeacion.redistribuir(ctx, e.mat, ids.map((id, i) => ({ id, horas_asignadas: temas[i][2] })), true);
    expect(r.programadas).toBe(30);
  });

  it('no suma dos veces las horas cuando varios grupos dictan la misma temática', () => {
    const e = escenario(ctx);
    const t = planeacion.guardarTematica(ctx, { asignatura_id: e.mat, unidad: 'U1', tema: 'Funciones', horas_asignadas: 4 });
    horarios.crear(ctx, { base: clase(e, { tematica_id: t }), fechas: [dias(-7), dias(-5)] });
    horarios.crear(ctx, { base: clase(e, { tematica_id: t, grupo_id: e.gB, hora_inicio: '14:00', hora_fin: '16:00', aula: '102' }), fechas: [dias(-7)] });
    for (const c of horarios.listar(ctx)) horarios.cambiarEstado(ctx, c.id, 'Ejecutada');
    const r = planeacion.resumen(ctx.db, e.mat);
    expect(r.ejecutadas).toBe(4); // grupo A: 4 h, grupo B: 2 h → se toma el más avanzado
    expect(r.horas_clase_ejecutadas).toBe(4);
    // El registro manual del docente prevalece si es mayor
    planeacion.guardarTematica(ctx, { id: t, asignatura_id: e.mat, unidad: 'U1', tema: 'Funciones', horas_asignadas: 4, horas_ejecutadas: 4 });
    expect(planeacion.obtener(ctx, e.mat).tematicas[0].horas_efectivas).toBe(4);
  });

  it('valida fechas dentro del cursillo', () => {
    const e = escenario(ctx);
    expect(() => planeacion.guardarTematica(ctx, { asignatura_id: e.mat, unidad: 'U', tema: 'T', horas_asignadas: 2, fecha_programada: dias(90) })).toThrow(/dentro del cursillo/);
  });
});

describe('Asistencia y certificados', () => {
  function dictarClases(e: ReturnType<typeof escenario>, n: number, estados: Record<number, string[]>) {
    const fechas = Array.from({ length: n }, (_, i) => dias(-20 + i * 2));
    horarios.crear(ctx, { base: clase(e), fechas });
    const clases = horarios.listar(ctx, { asignaturaId: e.mat });
    clases.forEach((c, i) => {
      asistencia.registrar(ctx, c.id, e.est.map((est, j) => ({ estudiante_id: est, estado: (estados[j]?.[i] ?? 'Asistió') as any })));
    });
    return clases;
  }

  it('calcula asistencia y horas efectivamente asistidas', () => {
    const e = escenario(ctx);
    dictarClases(e, 5, { 1: ['Asistió', 'Ausente', 'Retardo', 'Excusa', 'Ausente'] });
    const r = asistencia.estadisticasMatricula(ctx.db, e.mats[1]);
    expect(r.clases).toBe(5);
    expect(r.asistio).toBe(1);
    expect(r.retardo).toBe(1);
    expect(r.ausente).toBe(2);
    expect(r.porcentaje).toBe(60); // (1 + 1 + 1) / 5
    expect(r.horas_asistidas).toBe(4); // 2 clases × 2 h (asistió y retardo)
    const g = asistencia.resumenGrupo(ctx, e.gA, e.mat);
    expect(g.find((x) => x.matricula_id === e.mats[0])!.porcentaje).toBe(100);
    expect(() => asistencia.registrar(ctx, horarios.listar(ctx)[0].id, [{ estudiante_id: 9999, estado: 'Asistió' }])).toThrow(/no pertenece/);
  });

  it('genera certificados solo a aprobados, sin duplicar, y los verifica', async () => {
    const e = escenario(ctx);
    dictarClases(e, 5, { 1: ['Asistió', 'Ausente', 'Ausente', 'Ausente', 'Ausente'] });
    const { estudiantes: lista } = certificados.elegibles(ctx, e.cursillo);
    expect(lista.find((x) => x.matricula_id === e.mats[0])!.aprobado).toBe(true);
    expect(lista.find((x) => x.matricula_id === e.mats[1])!.aprobado).toBe(false);

    const r = await certificados.generar(ctx, e.mats);
    expect(r.generados).toHaveLength(2);
    expect(r.omitidos[0].motivo).toMatch(/Asistencia 20%/);
    expect(r.lote && fs.existsSync(r.lote)).toBeTruthy();
    expect(fs.existsSync(r.generados[0].archivo)).toBe(true);
    expect(fs.readFileSync(r.generados[0].archivo).subarray(0, 4).toString()).toBe('%PDF');
    // horas: 5 clases × 2 h = 10, limitadas por la intensidad (28) → 10
    const cert = certificados.listar(ctx)[0];
    expect(cert.horas_certificadas).toBe(10);

    // No se duplica sin autorización
    const r2 = await certificados.generar(ctx, [e.mats[0]]);
    expect(r2.generados).toHaveLength(0);
    expect(r2.omitidos[0].motivo).toMatch(/certificado vigente/);
    // Reemisión autorizada anula el anterior
    const anterior = ctx.db.get('SELECT * FROM certificados WHERE matricula_id = ? AND anulado = 0', [e.mats[0]]);
    const r3 = await certificados.generar(ctx, [e.mats[0]], { autorizacion: 'Corrección de nombre (acta 12)' });
    expect(r3.generados).toHaveLength(1);
    expect(certificados.verificar(ctx, anterior.codigo).estado).toBe('anulado');

    // Verificación por QR
    const vigente = ctx.db.get('SELECT * FROM certificados WHERE matricula_id = ? AND anulado = 0', [e.mats[0]]);
    const qr = `MEIF-SABANALARGA|${vigente.codigo}|901|${vigente.horas_certificadas}|${vigente.firma_hash}`;
    expect(certificados.verificar(ctx, qr).estado).toBe('valido');
    expect(certificados.verificar(ctx, qr.replace('|10|', '|40|')).estado).toBe('alterado');
    expect(certificados.verificar(ctx, 'MEIF-2027-NOEXISTE').estado).toBe('no_encontrado');
    // Alteración directa en la base de datos
    ctx.db.run('UPDATE certificados SET horas_certificadas = 99 WHERE id = ?', [vigente.id]);
    expect(certificados.verificar(ctx, vigente.codigo).estado).toBe('alterado');
  });
});

describe('Importación, materiales, reportes y panel', () => {
  it('importa estudiantes desde Excel con vista previa y sin duplicados', async () => {
    const e = escenario(ctx);
    const archivo = path.join(ctx.rutas.datos, 'imp.xlsx');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('E');
    ws.addRow(['Identificación', 'Nombres', 'Apellidos', 'Fecha de nacimiento', 'Grado', 'Correo']);
    ws.addRow(['5001', 'Laura', 'Gómez', '15/03/2010', '10', 'laura@ejemplo.org']);
    ws.addRow(['901', 'Repetido', 'Existente', '', '', '']);
    ws.addRow(['5002', 'Sin', '', '', '', '']);
    ws.addRow(['5001', 'Laura', 'Gómez', '', '', '']);
    await wb.xlsx.writeFile(archivo);
    const sim = await estudiantes.importar(ctx, archivo, { cursilloId: e.cursillo, grupoId: e.gB, simular: true });
    expect(sim.filas.map((f) => f.estado)).toEqual(['nuevo', 'existente', 'error', 'error']);
    expect(crud.listar(ctx, 'estudiantes').length).toBe(3); // la simulación no guarda
    const real = await estudiantes.importar(ctx, archivo, { cursilloId: e.cursillo, grupoId: e.gB, simular: false });
    expect(real.creados).toBe(1);
    const laura = ctx.db.get("SELECT * FROM estudiantes WHERE identificacion = '5001'");
    expect(laura.fecha_nacimiento).toBe('2010-03-15');
    expect(laura.grado).toBe('10°');
  });

  it('gestiona materiales en la biblioteca', () => {
    const e = escenario(ctx);
    const origen = path.join(ctx.rutas.datos, 'guia.pdf');
    fs.writeFileSync(origen, '%PDF-1.4 prueba');
    const id = material.subir(ctx, { titulo: 'Guía 1', tipo: 'Guía', asignatura_id: e.mat }, origen);
    const lista = material.listar(ctx, { cursilloId: e.cursillo });
    expect(lista[0].id).toBe(id);
    expect(lista[0].cursillo_id).toBe(e.cursillo);
    expect(fs.existsSync(material.rutaArchivo(ctx, id).ruta)).toBe(true);
    const exe = path.join(ctx.rutas.datos, 'virus.exe');
    fs.writeFileSync(exe, 'x');
    expect(() => material.subir(ctx, { titulo: 'X', tipo: 'Guía' }, exe)).toThrow(/no permitido/);
  });

  it('construye y exporta todos los reportes a PDF y Excel', async () => {
    const e = escenario(ctx);
    horarios.crear(ctx, { base: clase(e), fechas: [dias(-3)] });
    const filtros = { cursilloId: e.cursillo, docenteId: e.d1, grupoId: e.gA };
    for (const def of reportes.catalogo(ctx)) {
      const r = reportes.construir(ctx, def.id, filtros);
      expect(r.columnas.length).toBeGreaterThan(0);
      for (const formato of ['pdf', 'xlsx'] as const) {
        const destino = path.join(ctx.rutas.reportes, `${def.id}.${formato}`);
        await reportes.exportar(ctx, r, formato, destino);
        expect(fs.statSync(destino).size).toBeGreaterThan(500);
      }
    }
    expect(() => reportes.construir(ctx, 'estudiantes_cursillo', {})).toThrow(/obligatorios/);
  });

  it('calcula los indicadores del panel', () => {
    const e = escenario(ctx);
    horarios.crear(ctx, { base: clase(e), fechas: [dias(-3), dias(3)] });
    const d = dashboard.indicadores(ctx);
    expect(d.kpis.estudiantes).toBe(3);
    expect(d.kpis.docentes).toBe(2);
    expect(d.kpis.cursillos_activos).toBe(1);
    expect(d.kpis.horas_programadas).toBe(4);
    expect(d.proximas).toHaveLength(1);
    expect(d.pendientes).toBe(1);
  });
});

describe('Aplicación: persistencia, respaldos y demostración', () => {
  it('persiste en disco, respalda y restaura', async () => {
    const app = new Aplicacion(tmp());
    let c = await app.abrir('real');
    auth.crearPrimerAdministrador(c, { usuario: 'admin', nombre: 'Admin', clave: 'Clave2027' });
    crud.guardar(c, 'docentes', { identificacion: 'D001', nombres: 'Uno', apellidos: 'Doc' });
    const { crear } = await import('../electron/services/respaldo');
    const resp = crear(c, 'manual');
    crud.guardar(c, 'docentes', { identificacion: 'D002', nombres: 'Dos', apellidos: 'Doc' });
    app.cerrar();
    c = await app.abrir('real');
    expect(c.db.valor('SELECT count(*) FROM docentes')).toBe(2); // persistió tras cerrar
    auth.iniciarSesion(c, 'admin', 'Clave2027');
    c = await app.restaurar(resp.ruta);
    expect(c.db.valor('SELECT count(*) FROM docentes')).toBe(1);
    expect(fs.readdirSync(c.rutas.respaldos).some((n) => n.includes('previo-restauracion'))).toBe(true);
    app.cerrar();
  });

  it('crea la base de demostración separada y marcada', async () => {
    const app = new Aplicacion(tmp());
    const c = await app.abrir('demo');
    expect(c.demo).toBe(true);
    expect(c.rutas.archivoDb).toMatch(/meif-demo\.sqlite$/);
    expect(c.db.valor("SELECT count(*) FROM cursillos WHERE nombre LIKE '[DEMO]%'")).toBe(2);
    expect(c.db.valor('SELECT count(*) FROM certificados')).toBeGreaterThan(0);
    expect(c.db.valor("SELECT count(*) FROM horarios WHERE estado = 'Ejecutada'")).toBeGreaterThan(10);
    auth.iniciarSesion(c, 'docente-demo', 'Demo2027');
    expect(c.sesion!.rol).toBe('docente');
    app.cerrar();
  }, 60000);
});
