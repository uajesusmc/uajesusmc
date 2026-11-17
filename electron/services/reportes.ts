/** Catálogo de reportes y exportación a PDF / Excel. */
import ExcelJS from 'exceljs';
import { generarReportePdf, type Reporte } from '../pdf/reporte';
import { estadisticasMatricula } from './asistencia';
import { elegibles } from './certificados';
import { auditar, DURACION_SQL, ErrorNegocio, redondear, requerirPermiso, type Contexto } from './comun';
import { leerConfig, rutaImagen } from './config';
import { EFECTIVAS_SQL, resumen as resumenPlaneacion } from './planeacion';

export interface FiltrosReporte {
  cursilloId?: number | null; docenteId?: number | null; asignaturaId?: number | null; grupoId?: number | null;
  estudianteId?: number | null; desde?: string | null; hasta?: string | null;
}
type Filtro = keyof FiltrosReporte;

interface DefReporte {
  id: string; nombre: string; descripcion: string; filtros: Filtro[]; obligatorios?: Filtro[];
  construir: (ctx: Contexto, f: FiltrosReporte) => Reporte;
}

const nombreDe = (ctx: Contexto, tabla: string, id: number | null | undefined, expr = 'nombre') =>
  id ? ctx.db.valor<string>(`SELECT ${expr} FROM ${tabla} WHERE id = ?`, [id]) : null;

function describirFiltros(ctx: Contexto, f: FiltrosReporte): string {
  const p: string[] = [];
  if (f.cursilloId) p.push(`Cursillo: ${nombreDe(ctx, 'cursillos', f.cursilloId)}`);
  if (f.grupoId) p.push(`Grupo: ${nombreDe(ctx, 'grupos', f.grupoId)}`);
  if (f.docenteId) p.push(`Docente: ${nombreDe(ctx, 'docentes', f.docenteId, "nombres || ' ' || apellidos")}`);
  if (f.asignaturaId) p.push(`Asignatura: ${nombreDe(ctx, 'asignaturas', f.asignaturaId)}`);
  if (f.estudianteId) p.push(`Estudiante: ${nombreDe(ctx, 'estudiantes', f.estudianteId, "nombres || ' ' || apellidos")}`);
  if (f.desde) p.push(`Desde: ${f.desde}`);
  if (f.hasta) p.push(`Hasta: ${f.hasta}`);
  return p.join(' · ');
}

/** Constructor de cláusulas WHERE a partir de los filtros. */
function donde(f: FiltrosReporte, mapa: Partial<Record<Filtro, string>>, base: string[] = []) {
  const w = [...base];
  const p: any[] = [];
  for (const [k, expr] of Object.entries(mapa) as [Filtro, string][]) {
    const v = f[k];
    if (v !== null && v !== undefined && v !== '') { w.push(expr); p.push(v); }
  }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

const sumar = (filas: any[], k: string) => redondear(filas.reduce((s, f) => s + (Number(f[k]) || 0), 0));

export const REPORTES: DefReporte[] = [
  {
    id: 'estudiantes', nombre: 'Listado general de estudiantes', descripcion: 'Todos los estudiantes con su matrícula más reciente.',
    filtros: ['cursilloId', 'grupoId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { cursilloId: 'm.cursillo_id = ?', grupoId: 'm.grupo_id = ?' }, ['e.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT e.identificacion, e.tipo_documento, e.apellidos, e.nombres, e.institucion, e.grado, e.telefono, e.correo,
                c.nombre AS cursillo, g.nombre AS grupo, m.estado
         FROM estudiantes e LEFT JOIN matriculas m ON m.estudiante_id = e.id AND m.eliminado_en IS NULL
         LEFT JOIN cursillos c ON c.id = m.cursillo_id LEFT JOIN grupos g ON g.id = m.grupo_id
         ${where} ORDER BY e.apellidos, e.nombres`, params,
      );
      return {
        titulo: 'Listado general de estudiantes', filas,
        columnas: [
          { key: 'tipo_documento', label: 'Tipo' }, { key: 'identificacion', label: 'Identificación' }, { key: 'apellidos', label: 'Apellidos' },
          { key: 'nombres', label: 'Nombres' }, { key: 'institucion', label: 'Institución' }, { key: 'grado', label: 'Grado' },
          { key: 'telefono', label: 'Teléfono' }, { key: 'correo', label: 'Correo' }, { key: 'cursillo', label: 'Cursillo' },
          { key: 'grupo', label: 'Grupo' }, { key: 'estado', label: 'Matrícula' },
        ],
      };
    },
  },
  {
    id: 'estudiantes_cursillo', nombre: 'Estudiantes por cursillo', descripcion: 'Listado de matriculados de un cursillo, por grupo.',
    filtros: ['cursilloId', 'grupoId'], obligatorios: ['cursilloId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { cursilloId: 'm.cursillo_id = ?', grupoId: 'm.grupo_id = ?' }, ['m.eliminado_en IS NULL', 'e.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT g.nombre AS grupo, e.identificacion, e.apellidos || ' ' || e.nombres AS estudiante, e.institucion, e.grado,
                m.fecha_inscripcion, m.estado, e.telefono, e.acudiente, e.telefono_acudiente
         FROM matriculas m JOIN estudiantes e ON e.id = m.estudiante_id LEFT JOIN grupos g ON g.id = m.grupo_id
         ${where} ORDER BY g.nombre, e.apellidos, e.nombres`, params,
      ).map((r, i) => ({ n: i + 1, ...r }));
      return {
        titulo: `Estudiantes del cursillo ${nombreDe(ctx, 'cursillos', f.cursilloId)}`, filas,
        columnas: [
          { key: 'n', label: '#', align: 'right' }, { key: 'grupo', label: 'Grupo' }, { key: 'identificacion', label: 'Identificación' },
          { key: 'estudiante', label: 'Estudiante' }, { key: 'institucion', label: 'Institución' }, { key: 'grado', label: 'Grado' },
          { key: 'fecha_inscripcion', label: 'Inscripción' }, { key: 'estado', label: 'Estado' }, { key: 'telefono', label: 'Teléfono' },
          { key: 'acudiente', label: 'Acudiente' }, { key: 'telefono_acudiente', label: 'Tel. acudiente' },
        ],
      };
    },
  },
  {
    id: 'docentes', nombre: 'Listado de docentes', descripcion: 'Docentes con sus asignaturas y horas ejecutadas.',
    filtros: ['cursilloId'],
    construir: (ctx, f) => {
      const ex = f.cursilloId ? 'AND h.cursillo_id = ?' : '';
      const ea = f.cursilloId ? 'AND a.cursillo_id = ?' : '';
      const p = f.cursilloId ? [f.cursilloId, f.cursilloId] : [];
      const filas = ctx.db.all(
        `SELECT d.identificacion, d.apellidos || ' ' || d.nombres AS docente, d.telefono, d.correo, d.profesion, d.especialidad,
                (SELECT group_concat(a.nombre, ', ') FROM asignaturas a WHERE a.docente_id = d.id AND a.eliminado_en IS NULL ${ea}) AS asignaturas,
                round(coalesce((SELECT sum(${DURACION_SQL}) FROM horarios h WHERE h.docente_id = d.id AND h.estado = 'Ejecutada' AND h.eliminado_en IS NULL ${ex}), 0), 2) AS horas
         FROM docentes d WHERE d.eliminado_en IS NULL ORDER BY d.apellidos, d.nombres`, p,
      );
      return {
        titulo: 'Listado de docentes', filas, totales: { docente: 'TOTAL', horas: sumar(filas, 'horas') },
        columnas: [
          { key: 'identificacion', label: 'Identificación' }, { key: 'docente', label: 'Docente' }, { key: 'telefono', label: 'Teléfono' },
          { key: 'correo', label: 'Correo' }, { key: 'profesion', label: 'Profesión' }, { key: 'especialidad', label: 'Especialidad' },
          { key: 'asignaturas', label: 'Asignaturas' }, { key: 'horas', label: 'Horas ejecutadas', align: 'right' },
        ],
      };
    },
  },
  ...(['docente', 'grupo'] as const).map((tipo): DefReporte => ({
    id: `horarios_${tipo}`, nombre: `Horarios por ${tipo}`, descripcion: `Clases programadas de un ${tipo} en un rango de fechas.`,
    filtros: [tipo === 'docente' ? 'docenteId' : 'grupoId', 'cursilloId', 'desde', 'hasta'],
    obligatorios: [tipo === 'docente' ? 'docenteId' : 'grupoId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, {
        docenteId: 'h.docente_id = ?', grupoId: 'h.grupo_id = ?', cursilloId: 'h.cursillo_id = ?', desde: 'h.fecha >= ?', hasta: 'h.fecha <= ?',
      }, ['h.eliminado_en IS NULL']);
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const filas = ctx.db.all(
        `SELECT h.fecha, h.dia_semana, h.hora_inicio || ' – ' || h.hora_fin AS hora, a.nombre AS asignatura, g.nombre AS grupo,
                d.nombres || ' ' || d.apellidos AS docente, h.aula, h.estado, round(${DURACION_SQL}, 2) AS horas,
                t.unidad || ': ' || t.tema AS tematica
         FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id JOIN grupos g ON g.id = h.grupo_id
         JOIN docentes d ON d.id = h.docente_id LEFT JOIN tematicas t ON t.id = h.tematica_id
         ${where} ORDER BY h.fecha, h.hora_inicio`, params,
      ).map((r) => ({ ...r, dia: dias[r.dia_semana - 1] }));
      const titulo = tipo === 'docente'
        ? `Horario del docente ${nombreDe(ctx, 'docentes', f.docenteId, "nombres || ' ' || apellidos")}`
        : `Horario del grupo ${nombreDe(ctx, 'grupos', f.grupoId)}`;
      return {
        titulo, filas, totales: { fecha: 'TOTAL', horas: sumar(filas, 'horas') },
        columnas: [
          { key: 'fecha', label: 'Fecha' }, { key: 'dia', label: 'Día' }, { key: 'hora', label: 'Hora' }, { key: 'asignatura', label: 'Asignatura' },
          tipo === 'docente' ? { key: 'grupo', label: 'Grupo' } : { key: 'docente', label: 'Docente' },
          { key: 'tematica', label: 'Temática' }, { key: 'aula', label: 'Aula' }, { key: 'estado', label: 'Estado' },
          { key: 'horas', label: 'Horas', align: 'right' },
        ],
      };
    },
  })),
  {
    id: 'asignaturas', nombre: 'Asignaturas', descripcion: 'Catálogo de asignaturas con intensidad y horas programadas/ejecutadas.',
    filtros: ['cursilloId', 'docenteId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { cursilloId: 'a.cursillo_id = ?', docenteId: 'a.docente_id = ?' }, ['a.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT a.codigo, a.nombre, a.area, c.nombre AS cursillo, d.nombres || ' ' || d.apellidos AS docente, a.intensidad_horaria,
                round(coalesce((SELECT sum(${DURACION_SQL}) FROM horarios h WHERE h.asignatura_id = a.id AND h.estado <> 'Cancelada' AND h.eliminado_en IS NULL), 0), 2) AS programadas,
                round(coalesce((SELECT sum(${DURACION_SQL}) FROM horarios h WHERE h.asignatura_id = a.id AND h.estado = 'Ejecutada' AND h.eliminado_en IS NULL), 0), 2) AS ejecutadas
         FROM asignaturas a JOIN cursillos c ON c.id = a.cursillo_id LEFT JOIN docentes d ON d.id = a.docente_id
         ${where} ORDER BY c.nombre, a.area, a.nombre`, params,
      );
      return {
        titulo: 'Asignaturas', filas,
        totales: { codigo: 'TOTAL', intensidad_horaria: sumar(filas, 'intensidad_horaria'), programadas: sumar(filas, 'programadas'), ejecutadas: sumar(filas, 'ejecutadas') },
        columnas: [
          { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Asignatura' }, { key: 'area', label: 'Área' },
          { key: 'cursillo', label: 'Cursillo' }, { key: 'docente', label: 'Docente responsable' },
          { key: 'intensidad_horaria', label: 'Intensidad (h)', align: 'right' }, { key: 'programadas', label: 'Horas en horario', align: 'right' },
          { key: 'ejecutadas', label: 'Horas ejecutadas', align: 'right' },
        ],
      };
    },
  },
  {
    id: 'planeacion', nombre: 'Planeación temática', descripcion: 'Unidades, temas y distribución de horas.',
    filtros: ['cursilloId', 'docenteId', 'asignaturaId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { cursilloId: 'a.cursillo_id = ?', docenteId: 'a.docente_id = ?', asignaturaId: 'a.id = ?' },
        ['t.eliminado_en IS NULL', 'p.eliminado_en IS NULL', 'a.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT a.nombre AS asignatura, d.nombres || ' ' || d.apellidos AS docente, t.unidad, t.tema, t.subtema, t.objetivo,
                t.fecha_programada, t.horas_asignadas, round(${EFECTIVAS_SQL}, 2) AS horas_ejecutadas,
                round(max(0, t.horas_asignadas - ${EFECTIVAS_SQL}), 2) AS pendientes, t.material
         FROM tematicas t JOIN planeaciones p ON p.id = t.planeacion_id JOIN asignaturas a ON a.id = p.asignatura_id
         LEFT JOIN docentes d ON d.id = a.docente_id ${where} ORDER BY a.nombre, t.orden, t.id`, params,
      );
      return {
        titulo: 'Planeación temática', filas,
        totales: { asignatura: 'TOTAL', horas_asignadas: sumar(filas, 'horas_asignadas'), horas_ejecutadas: sumar(filas, 'horas_ejecutadas'), pendientes: sumar(filas, 'pendientes') },
        columnas: [
          { key: 'asignatura', label: 'Asignatura' }, { key: 'docente', label: 'Docente' }, { key: 'unidad', label: 'Unidad' },
          { key: 'tema', label: 'Tema' }, { key: 'subtema', label: 'Subtema' }, { key: 'objetivo', label: 'Objetivo' },
          { key: 'fecha_programada', label: 'Fecha' }, { key: 'horas_asignadas', label: 'H. asignadas', align: 'right' },
          { key: 'horas_ejecutadas', label: 'H. ejecutadas', align: 'right' }, { key: 'pendientes', label: 'Pendientes', align: 'right' },
        ],
      };
    },
  },
  {
    id: 'horas', nombre: 'Horas programadas y ejecutadas', descripcion: 'Avance y cumplimiento de la planeación por asignatura y docente.',
    filtros: ['cursilloId', 'docenteId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { cursilloId: 'a.cursillo_id = ?', docenteId: 'a.docente_id = ?' }, ['a.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT a.id, a.nombre AS asignatura, c.nombre AS cursillo, d.nombres || ' ' || d.apellidos AS docente
         FROM asignaturas a JOIN cursillos c ON c.id = a.cursillo_id LEFT JOIN docentes d ON d.id = a.docente_id
         ${where} ORDER BY d.apellidos, a.nombre`, params,
      ).map((a) => {
        const r = resumenPlaneacion(ctx.db, a.id);
        return { ...a, ...r, avance_txt: `${r.avance}%`, cumplimiento_txt: `${r.cumplimiento}%` };
      });
      return {
        titulo: 'Horas programadas y ejecutadas', filas,
        totales: {
          asignatura: 'TOTAL', intensidad: sumar(filas, 'intensidad'), programadas: sumar(filas, 'programadas'),
          ejecutadas: sumar(filas, 'ejecutadas'), pendientes: sumar(filas, 'pendientes'),
          horas_clase_programadas: sumar(filas, 'horas_clase_programadas'), horas_clase_ejecutadas: sumar(filas, 'horas_clase_ejecutadas'),
        },
        columnas: [
          { key: 'asignatura', label: 'Asignatura' }, { key: 'docente', label: 'Docente' }, { key: 'cursillo', label: 'Cursillo' },
          { key: 'intensidad', label: 'Intensidad', align: 'right' }, { key: 'programadas', label: 'H. planeadas', align: 'right' },
          { key: 'ejecutadas', label: 'H. ejecutadas', align: 'right' }, { key: 'pendientes', label: 'Pendientes', align: 'right' },
          { key: 'avance_txt', label: 'Avance', align: 'right' }, { key: 'cumplimiento_txt', label: 'Cumplimiento', align: 'right' },
          { key: 'horas_clase_programadas', label: 'H. en horario por grupo', align: 'right' }, { key: 'horas_clase_ejecutadas', label: 'H. dictadas por grupo', align: 'right' },
          { key: 'estado', label: 'Estado' },
        ],
      };
    },
  },
  {
    id: 'actividades_docente', nombre: 'Reporte de actividades por docente', descripcion: 'Clases, horas trabajadas y avance de planeación de un docente.',
    filtros: ['docenteId', 'cursilloId', 'desde', 'hasta'], obligatorios: ['docenteId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { docenteId: 'h.docente_id = ?', cursilloId: 'h.cursillo_id = ?', desde: 'h.fecha >= ?', hasta: 'h.fecha <= ?' }, ['h.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT a.id, a.nombre AS asignatura, c.nombre AS cursillo, g.nombre AS grupo,
                sum(h.estado = 'Ejecutada') AS ejecutadas, sum(h.estado = 'Programada') AS programadas, sum(h.estado = 'Cancelada') AS canceladas,
                round(coalesce(sum(CASE WHEN h.estado = 'Ejecutada' THEN ${DURACION_SQL} END), 0), 2) AS horas_trabajadas,
                sum(EXISTS (SELECT 1 FROM asistencias s WHERE s.horario_id = h.id)) AS con_asistencia
         FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id JOIN cursillos c ON c.id = h.cursillo_id JOIN grupos g ON g.id = h.grupo_id
         ${where} GROUP BY a.id, g.id ORDER BY c.nombre, a.nombre, g.nombre`, params,
      ).map((r) => ({ ...r, avance: `${resumenPlaneacion(ctx.db, r.id).avance}%` }));
      return {
        titulo: `Actividades del docente ${nombreDe(ctx, 'docentes', f.docenteId, "nombres || ' ' || apellidos")}`, filas,
        totales: {
          asignatura: 'TOTAL', ejecutadas: sumar(filas, 'ejecutadas'), programadas: sumar(filas, 'programadas'),
          canceladas: sumar(filas, 'canceladas'), horas_trabajadas: sumar(filas, 'horas_trabajadas'), con_asistencia: sumar(filas, 'con_asistencia'),
        },
        columnas: [
          { key: 'asignatura', label: 'Asignatura' }, { key: 'cursillo', label: 'Cursillo' }, { key: 'grupo', label: 'Grupo' },
          { key: 'ejecutadas', label: 'Clases dictadas', align: 'right' }, { key: 'programadas', label: 'Por dictar', align: 'right' },
          { key: 'canceladas', label: 'Canceladas', align: 'right' }, { key: 'horas_trabajadas', label: 'Horas trabajadas', align: 'right' },
          { key: 'con_asistencia', label: 'Con asistencia', align: 'right' }, { key: 'avance', label: 'Avance planeación', align: 'right' },
        ],
      };
    },
  },
  {
    id: 'asistencia', nombre: 'Control de asistencia (consolidado)', descripcion: 'Asistencia acumulada por estudiante.',
    filtros: ['cursilloId', 'grupoId', 'asignaturaId', 'estudianteId'], obligatorios: ['cursilloId'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { cursilloId: 'm.cursillo_id = ?', grupoId: 'm.grupo_id = ?', estudianteId: 'm.estudiante_id = ?' },
        ['m.eliminado_en IS NULL', 'e.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT m.id, e.identificacion, e.apellidos || ' ' || e.nombres AS estudiante, g.nombre AS grupo
         FROM matriculas m JOIN estudiantes e ON e.id = m.estudiante_id LEFT JOIN grupos g ON g.id = m.grupo_id
         ${where} ORDER BY g.nombre, e.apellidos`, params,
      ).map((m) => {
        const r = estadisticasMatricula(ctx.db, m.id);
        const b = f.asignaturaId ? r.asignaturas.find((a) => a.asignatura_id === Number(f.asignaturaId)) : r;
        return {
          identificacion: m.identificacion, estudiante: m.estudiante, grupo: m.grupo, clases: b?.clases ?? 0, asistio: b?.asistio ?? 0,
          retardo: b?.retardo ?? 0, ausente: b?.ausente ?? 0, excusa: b?.excusa ?? 0, sin_registro: b?.sin_registro ?? 0,
          porcentaje: b?.porcentaje == null ? '' : `${b.porcentaje}%`, horas: b?.horas_asistidas ?? 0,
        };
      });
      return {
        titulo: 'Control de asistencia', filas,
        columnas: [
          { key: 'identificacion', label: 'Identificación' }, { key: 'estudiante', label: 'Estudiante' }, { key: 'grupo', label: 'Grupo' },
          { key: 'clases', label: 'Clases', align: 'right' }, { key: 'asistio', label: 'Asistió', align: 'right' },
          { key: 'retardo', label: 'Retardo', align: 'right' }, { key: 'ausente', label: 'Ausente', align: 'right' },
          { key: 'excusa', label: 'Excusa', align: 'right' }, { key: 'sin_registro', label: 'Sin registro', align: 'right' },
          { key: 'porcentaje', label: '% asistencia', align: 'right' }, { key: 'horas', label: 'Horas asistidas', align: 'right' },
        ],
      };
    },
  },
  {
    id: 'asistencia_detalle', nombre: 'Asistencia detallada por clase', descripcion: 'Registro de asistencia por fecha, clase y estudiante.',
    filtros: ['cursilloId', 'grupoId', 'asignaturaId', 'estudianteId', 'desde', 'hasta'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, {
        cursilloId: 'h.cursillo_id = ?', grupoId: 'h.grupo_id = ?', asignaturaId: 'h.asignatura_id = ?', estudianteId: 's.estudiante_id = ?',
        desde: 'h.fecha >= ?', hasta: 'h.fecha <= ?',
      }, ['h.eliminado_en IS NULL']);
      const filas = ctx.db.all(
        `SELECT h.fecha, h.hora_inicio || ' – ' || h.hora_fin AS hora, a.nombre AS asignatura, g.nombre AS grupo,
                e.identificacion, e.apellidos || ' ' || e.nombres AS estudiante, s.estado, s.observacion
         FROM asistencias s JOIN horarios h ON h.id = s.horario_id JOIN asignaturas a ON a.id = h.asignatura_id
         JOIN grupos g ON g.id = h.grupo_id JOIN estudiantes e ON e.id = s.estudiante_id
         ${where} ORDER BY h.fecha, h.hora_inicio, e.apellidos LIMIT 20000`, params,
      );
      return {
        titulo: 'Asistencia detallada', filas,
        columnas: [
          { key: 'fecha', label: 'Fecha' }, { key: 'hora', label: 'Hora' }, { key: 'asignatura', label: 'Asignatura' }, { key: 'grupo', label: 'Grupo' },
          { key: 'identificacion', label: 'Identificación' }, { key: 'estudiante', label: 'Estudiante' }, { key: 'estado', label: 'Estado' },
          { key: 'observacion', label: 'Observación' },
        ],
      };
    },
  },
  {
    id: 'estudiantes_certificados', nombre: 'Estudiantes certificados', descripcion: 'Estado de certificación de cada estudiante de un cursillo.',
    filtros: ['cursilloId'], obligatorios: ['cursilloId'],
    construir: (ctx, f) => {
      const { cursillo, estudiantes } = elegibles(ctx, Number(f.cursilloId));
      const filas = estudiantes.map((e) => ({
        identificacion: e.identificacion, nombre: e.nombre, grupo: e.grupo, porcentaje: e.porcentaje == null ? '' : `${e.porcentaje}%`,
        horas: e.horas_certificables,
        estado: e.certificado ? 'Certificado' : e.aprobado ? 'Aprobado – pendiente de certificado' : 'No cumple',
        codigo: e.certificado?.codigo ?? '', observacion: e.certificado ? e.certificado.fecha_emision : e.motivo ?? '',
      }));
      return {
        titulo: `Estudiantes certificados – ${cursillo.nombre}`, filas,
        columnas: [
          { key: 'identificacion', label: 'Identificación' }, { key: 'nombre', label: 'Estudiante' }, { key: 'grupo', label: 'Grupo' },
          { key: 'porcentaje', label: '% asistencia', align: 'right' }, { key: 'horas', label: 'Horas certificables', align: 'right' },
          { key: 'estado', label: 'Estado' }, { key: 'codigo', label: 'Código' }, { key: 'observacion', label: 'Fecha / observación' },
        ],
      };
    },
  },
  {
    id: 'certificados', nombre: 'Certificados emitidos', descripcion: 'Certificados expedidos (vigentes y anulados).',
    filtros: ['cursilloId', 'estudianteId', 'desde', 'hasta'],
    construir: (ctx, f) => {
      const { where, params } = donde(f, { cursilloId: 'k.cursillo_id = ?', estudianteId: 'k.estudiante_id = ?', desde: 'k.fecha_emision >= ?', hasta: 'k.fecha_emision <= ?' });
      const filas = ctx.db.all(
        `SELECT k.codigo, k.fecha_emision, e.identificacion, e.apellidos || ' ' || e.nombres AS estudiante, c.nombre AS cursillo,
                k.horas_certificadas, k.porcentaje_asistencia || '%' AS porcentaje, CASE WHEN k.anulado THEN 'Anulado' ELSE 'Vigente' END AS estado,
                u.nombre AS emitido_por
         FROM certificados k JOIN estudiantes e ON e.id = k.estudiante_id JOIN cursillos c ON c.id = k.cursillo_id
         LEFT JOIN usuarios u ON u.id = k.emitido_por ${where} ORDER BY k.fecha_emision DESC, k.codigo`, params,
      );
      return {
        titulo: 'Certificados emitidos', filas,
        columnas: [
          { key: 'codigo', label: 'Código' }, { key: 'fecha_emision', label: 'Fecha' }, { key: 'identificacion', label: 'Identificación' },
          { key: 'estudiante', label: 'Estudiante' }, { key: 'cursillo', label: 'Cursillo' }, { key: 'horas_certificadas', label: 'Horas', align: 'right' },
          { key: 'porcentaje', label: 'Asistencia', align: 'right' }, { key: 'estado', label: 'Estado' }, { key: 'emitido_por', label: 'Emitido por' },
        ],
      };
    },
  },
];

export function catalogo(ctx: Contexto) {
  requerirPermiso(ctx, 'reportes', 'ver');
  return REPORTES.map(({ id, nombre, descripcion, filtros, obligatorios }) => ({ id, nombre, descripcion, filtros, obligatorios: obligatorios ?? [] }));
}

export function construir(ctx: Contexto, id: string, f: FiltrosReporte): Reporte {
  requerirPermiso(ctx, 'reportes', 'ver');
  const def = REPORTES.find((r) => r.id === id);
  if (!def) throw new ErrorNegocio('Reporte desconocido.');
  for (const o of def.obligatorios ?? []) if (!f[o]) throw new ErrorNegocio('Complete los filtros obligatorios del reporte.');
  const r = def.construir(ctx, f);
  return { ...r, subtitulo: describirFiltros(ctx, f) || 'Sin filtros' };
}

export async function escribirExcel(destino: string, r: Reporte, config: Record<string, string>): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = config.org_nombre;
  const ws = wb.addWorksheet(r.titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  const nc = r.columnas.length;
  ws.mergeCells(1, 1, 1, nc);
  ws.getCell(1, 1).value = config.org_nombre;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF0B2545' } };
  ws.mergeCells(2, 1, 2, nc);
  ws.getCell(2, 1).value = r.titulo;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, nc);
  ws.getCell(3, 1).value = `${r.subtitulo ?? ''} · Generado: ${new Date().toLocaleString('es-CO')}`;
  ws.getCell(3, 1).font = { italic: true, size: 9, color: { argb: 'FF4A5568' } };
  const cab = ws.getRow(5);
  r.columnas.forEach((c, i) => {
    const cell = cab.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  const filas = [...r.filas, ...(r.totales ? [r.totales] : [])];
  filas.forEach((f, i) => {
    const row = ws.getRow(6 + i);
    r.columnas.forEach((c, j) => { row.getCell(j + 1).value = f[c.key] ?? null; });
    if (r.totales && i === filas.length - 1) row.font = { bold: true };
  });
  r.columnas.forEach((c, i) => {
    const largo = Math.max(c.label.length, ...filas.slice(0, 300).map((f) => String(f[c.key] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(Math.max(largo + 2, 8), 50);
  });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: nc } };
  ws.views = [{ state: 'frozen', ySplit: 5 }];
  await wb.xlsx.writeFile(destino);
}

export async function exportar(ctx: Contexto, r: Reporte, formato: 'pdf' | 'xlsx', destino: string): Promise<void> {
  requerirPermiso(ctx, 'reportes', 'ver');
  const cfg = leerConfig(ctx.db);
  if (formato === 'pdf') await generarReportePdf(destino, r, cfg, rutaImagen(ctx, 'logo'), ctx.sesion!.nombre);
  else await escribirExcel(destino, r, cfg);
  auditar(ctx, `Exportó reporte (${formato.toUpperCase()})`, 'reportes', null, r.titulo);
}

/** Valida una tabla enviada por la interfaz (exportación del listado en pantalla). */
export function tablaLibre(t: any): Reporte {
  if (!t || typeof t.titulo !== 'string' || !Array.isArray(t.columnas) || !Array.isArray(t.filas)) throw new ErrorNegocio('Datos de exportación inválidos.');
  if (t.filas.length > 50000) throw new ErrorNegocio('Demasiadas filas para exportar.');
  return {
    titulo: t.titulo.slice(0, 150), subtitulo: typeof t.subtitulo === 'string' ? t.subtitulo.slice(0, 300) : undefined,
    columnas: t.columnas.map((c: any) => ({ key: String(c.key), label: String(c.label) })), filas: t.filas,
  };
}
