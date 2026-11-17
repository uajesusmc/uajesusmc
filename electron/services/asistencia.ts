/**
 * Control de asistencia.
 *
 * Reglas de cálculo:
 *  - Una clase cuenta para un estudiante si está «Ejecutada», es de una asignatura que
 *    cursa, y es de su grupo desde su fecha de inscripción (o si tiene asistencia
 *    registrada en ella, por ejemplo tras un cambio de grupo).
 *  - Porcentaje de asistencia = (Asistió + Retardo + Excusa justificada) / clases.
 *  - Horas efectivamente asistidas = horas de las clases con Asistió o Retardo.
 *    (La excusa justifica la ausencia, pero no suma horas cursadas.)
 */
import type { EstadoAsistencia } from '../../shared/constantes';
import { ESTADOS_ASISTENCIA } from '../../shared/constantes';
import type { Db } from '../db/connection';
import { auditar, DURACION_SQL, ErrorNegocio, hoy, redondear, requerirPermiso, type Contexto } from './comun';

export { DURACION_SQL } from './comun';

export interface EstadisticaAsistencia {
  asignatura_id: number;
  asignatura: string;
  area: string;
  intensidad_horaria: number;
  clases: number;
  horas_clase: number;
  asistio: number;
  retardo: number;
  ausente: number;
  excusa: number;
  sin_registro: number;
  horas_asistidas: number;
  porcentaje: number | null;
}

export interface ResumenAsistencia {
  asignaturas: EstadisticaAsistencia[];
  clases: number;
  asistio: number;
  retardo: number;
  ausente: number;
  excusa: number;
  sin_registro: number;
  horas_clase: number;
  horas_asistidas: number;
  porcentaje: number | null;
}

export function estadisticasMatricula(db: Db, matriculaId: number): ResumenAsistencia {
  const m = db.get('SELECT * FROM matriculas WHERE id = ?', [matriculaId]);
  if (!m) throw new ErrorNegocio('Matrícula no encontrada.');
  const filas = db.all<EstadisticaAsistencia>(
    `SELECT a.id AS asignatura_id, a.nombre AS asignatura, a.area, a.intensidad_horaria,
            count(h.id) AS clases,
            coalesce(sum(${DURACION_SQL}), 0) AS horas_clase,
            coalesce(sum(s.estado = 'Asistió'), 0) AS asistio,
            coalesce(sum(s.estado = 'Retardo'), 0) AS retardo,
            coalesce(sum(s.estado = 'Ausente'), 0) AS ausente,
            coalesce(sum(s.estado = 'Excusa'), 0) AS excusa,
            coalesce(sum(h.id IS NOT NULL AND s.estado IS NULL), 0) AS sin_registro,
            coalesce(sum(CASE WHEN s.estado IN ('Asistió','Retardo') THEN ${DURACION_SQL} ELSE 0 END), 0) AS horas_asistidas
     FROM matricula_asignaturas ma
     JOIN asignaturas a ON a.id = ma.asignatura_id
     LEFT JOIN horarios h ON h.asignatura_id = a.id AND h.estado = 'Ejecutada' AND h.eliminado_en IS NULL
          AND ((h.grupo_id = ? AND h.fecha >= ?) OR EXISTS (SELECT 1 FROM asistencias x WHERE x.horario_id = h.id AND x.estudiante_id = ?))
     LEFT JOIN asistencias s ON s.horario_id = h.id AND s.estudiante_id = ?
     WHERE ma.matricula_id = ? AND a.eliminado_en IS NULL
     GROUP BY a.id ORDER BY a.area, a.nombre`,
    [m.grupo_id ?? -1, m.fecha_inscripcion, m.estudiante_id, m.estudiante_id, matriculaId],
  ).map((f) => ({
    ...f,
    horas_clase: redondear(f.horas_clase),
    horas_asistidas: redondear(f.horas_asistidas),
    porcentaje: f.clases ? redondear(((f.asistio + f.retardo + f.excusa) / f.clases) * 100, 1) : null,
  }));
  const suma = (k: keyof EstadisticaAsistencia) => filas.reduce((s, f) => s + (f[k] as number), 0);
  const clases = suma('clases');
  return {
    asignaturas: filas,
    clases,
    asistio: suma('asistio'), retardo: suma('retardo'), ausente: suma('ausente'), excusa: suma('excusa'),
    sin_registro: suma('sin_registro'),
    horas_clase: redondear(suma('horas_clase')),
    horas_asistidas: redondear(suma('horas_asistidas')),
    porcentaje: clases ? redondear(((suma('asistio') + suma('retardo') + suma('excusa')) / clases) * 100, 1) : null,
  };
}

/** Comprueba que un docente solo opere sobre sus propias clases. */
function verificarDocente(ctx: Contexto, docenteClase: number): void {
  const s = ctx.sesion!;
  if (s.rol === 'docente' && s.docenteId !== docenteClase) {
    throw new ErrorNegocio('Como docente solo puede registrar asistencia en sus propias clases.');
  }
}

/** Datos de una clase y su lista de estudiantes con el estado registrado. */
export function planilla(ctx: Contexto, horarioId: number) {
  requerirPermiso(ctx, 'asistencia', 'ver');
  const clase = ctx.db.get(
    `SELECT h.*, a.nombre AS asignatura, g.nombre AS grupo, c.nombre AS cursillo,
            d.nombres || ' ' || d.apellidos AS docente, ${DURACION_SQL} AS horas
     FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id JOIN grupos g ON g.id = h.grupo_id
     JOIN cursillos c ON c.id = h.cursillo_id JOIN docentes d ON d.id = h.docente_id
     WHERE h.id = ? AND h.eliminado_en IS NULL`, [horarioId],
  );
  if (!clase) throw new ErrorNegocio('Clase no encontrada.');
  const estudiantes = ctx.db.all(
    `SELECT e.id AS estudiante_id, e.identificacion, e.apellidos || ' ' || e.nombres AS nombre, s.estado, s.observacion
     FROM matriculas m JOIN estudiantes e ON e.id = m.estudiante_id
     JOIN matricula_asignaturas ma ON ma.matricula_id = m.id AND ma.asignatura_id = ?
     LEFT JOIN asistencias s ON s.horario_id = ? AND s.estudiante_id = e.id
     WHERE m.grupo_id = ? AND m.eliminado_en IS NULL AND e.eliminado_en IS NULL
       AND (m.estado = 'Activa' OR s.estado IS NOT NULL) AND m.fecha_inscripcion <= ?
     ORDER BY e.apellidos, e.nombres`,
    [clase.asignatura_id, horarioId, clase.grupo_id, clase.fecha],
  );
  return { clase, estudiantes };
}

export function registrar(
  ctx: Contexto, horarioId: number, registros: { estudiante_id: number; estado: EstadoAsistencia; observacion?: string }[],
  marcarEjecutada = true,
): { guardados: number } {
  const s = requerirPermiso(ctx, 'asistencia', 'editar');
  const { clase, estudiantes } = planilla(ctx, horarioId);
  verificarDocente(ctx, clase.docente_id);
  if (clase.estado === 'Cancelada') throw new ErrorNegocio('La clase está cancelada; no se puede registrar asistencia.');
  if (clase.fecha > hoy()) throw new ErrorNegocio('No se puede registrar asistencia de una clase futura.');
  const permitidos = new Set(estudiantes.map((e) => e.estudiante_id));
  for (const r of registros) {
    if (!permitidos.has(r.estudiante_id)) throw new ErrorNegocio('Uno de los estudiantes no pertenece a esta clase.');
    if (!ESTADOS_ASISTENCIA.includes(r.estado)) throw new ErrorNegocio(`Estado de asistencia inválido: ${r.estado}`);
  }
  ctx.db.tx(() => {
    for (const r of registros) {
      ctx.db.run(
        `INSERT INTO asistencias (horario_id, estudiante_id, estado, observacion, registrado_por) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(horario_id, estudiante_id) DO UPDATE SET estado = excluded.estado, observacion = excluded.observacion,
           registrado_por = excluded.registrado_por, registrado_en = datetime('now','localtime')`,
        [horarioId, r.estudiante_id, r.estado, r.observacion?.trim() || null, s.id],
      );
    }
    if (marcarEjecutada && clase.estado === 'Programada') {
      ctx.db.actualizar('horarios', horarioId, { estado: 'Ejecutada' });
    }
    auditar(ctx, 'Registró asistencia', 'horarios', horarioId, { registros: registros.length });
  });
  return { guardados: registros.length };
}

/** Asistencia individual: por cada matrícula del estudiante. */
export function resumenEstudiante(ctx: Contexto, estudianteId: number) {
  requerirPermiso(ctx, 'asistencia', 'ver');
  const mats = ctx.db.all(
    `SELECT m.id, c.nombre AS cursillo, g.nombre AS grupo, m.estado FROM matriculas m JOIN cursillos c ON c.id = m.cursillo_id
     LEFT JOIN grupos g ON g.id = m.grupo_id WHERE m.estudiante_id = ? AND m.eliminado_en IS NULL ORDER BY c.fecha_inicio DESC`,
    [estudianteId],
  );
  const detalle = ctx.db.all(
    `SELECT h.fecha, h.hora_inicio, h.hora_fin, a.nombre AS asignatura, s.estado, s.observacion
     FROM asistencias s JOIN horarios h ON h.id = s.horario_id JOIN asignaturas a ON a.id = h.asignatura_id
     WHERE s.estudiante_id = ? AND h.eliminado_en IS NULL ORDER BY h.fecha DESC, h.hora_inicio DESC`, [estudianteId],
  );
  return { matriculas: mats.map((m) => ({ ...m, resumen: estadisticasMatricula(ctx.db, m.id) })), detalle };
}

/** Asistencia grupal: un renglón por estudiante del grupo (opcionalmente de una asignatura). */
export function resumenGrupo(ctx: Contexto, grupoId: number, asignaturaId?: number | null) {
  requerirPermiso(ctx, 'asistencia', 'ver');
  const mats = ctx.db.all(
    `SELECT m.id, e.identificacion, e.apellidos || ' ' || e.nombres AS nombre, m.estado
     FROM matriculas m JOIN estudiantes e ON e.id = m.estudiante_id
     WHERE m.grupo_id = ? AND m.eliminado_en IS NULL AND e.eliminado_en IS NULL ORDER BY e.apellidos, e.nombres`, [grupoId],
  );
  return mats.map((m) => {
    const r = estadisticasMatricula(ctx.db, m.id);
    const base = asignaturaId ? r.asignaturas.find((a) => a.asignatura_id === asignaturaId) : r;
    return {
      matricula_id: m.id, identificacion: m.identificacion, nombre: m.nombre, estado_matricula: m.estado,
      clases: base?.clases ?? 0, asistio: base?.asistio ?? 0, retardo: base?.retardo ?? 0, ausente: base?.ausente ?? 0,
      excusa: base?.excusa ?? 0, horas_asistidas: base?.horas_asistidas ?? 0, porcentaje: base?.porcentaje ?? null,
    };
  });
}
