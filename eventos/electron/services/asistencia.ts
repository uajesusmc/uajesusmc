/**
 * Asistencia por actividad. Porcentaje = actividades asistidas / actividades con
 * asistencia registrada (sin recesos). Horas = duración de las actividades asistidas.
 */
import { auditar, CUENTA_SQL, DURACION_SQL, ErrorNegocio, hoy, redondear, requerirEdicion, requerirSesion, type Contexto } from './comun';

export function planilla(ctx: Contexto, actividadId: number) {
  requerirSesion(ctx);
  const actividad = ctx.db.get(
    `SELECT a.*, e.nombre AS evento, round(${DURACION_SQL}, 2) AS horas FROM actividades a JOIN eventos e ON e.id = a.evento_id
     WHERE a.id = ? AND a.eliminado_en IS NULL`, [actividadId],
  );
  if (!actividad) throw new ErrorNegocio('Actividad no encontrada.');
  const lista = ctx.db.all(
    `SELECT p.id AS participante_id, p.identificacion, p.apellidos || ' ' || p.nombres AS nombre, p.institucion, s.presente
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     LEFT JOIN asistencias s ON s.actividad_id = ? AND s.participante_id = p.id
     WHERE i.evento_id = ? AND (i.estado = 'Inscrito' OR s.presente IS NOT NULL) AND p.eliminado_en IS NULL
     ORDER BY p.apellidos, p.nombres`, [actividadId, actividad.evento_id],
  );
  return { actividad, participantes: lista };
}

export function registrar(ctx: Contexto, actividadId: number, registros: { participante_id: number; presente: boolean }[]) {
  requerirEdicion(ctx);
  const { actividad, participantes } = planilla(ctx, actividadId);
  if (actividad.fecha > hoy()) throw new ErrorNegocio('No se puede registrar asistencia de una actividad futura.');
  if (actividad.tipo === 'Receso') throw new ErrorNegocio('Los recesos no llevan asistencia.');
  const validos = new Set(participantes.map((p) => p.participante_id));
  for (const r of registros) if (!validos.has(r.participante_id)) throw new ErrorNegocio('Uno de los participantes no está inscrito en el evento.');
  ctx.db.tx(() => {
    for (const r of registros) {
      ctx.db.run(
        `INSERT INTO asistencias (actividad_id, participante_id, presente) VALUES (?, ?, ?)
         ON CONFLICT(actividad_id, participante_id) DO UPDATE SET presente = excluded.presente, registrado_en = datetime('now','localtime')`,
        [actividadId, r.participante_id, r.presente ? 1 : 0],
      );
    }
    auditar(ctx, 'Registró asistencia', { actividad: actividad.titulo, registros: registros.length });
  });
  return registros.length;
}

/** Resumen de asistencia por participante en un evento. */
export function resumenEvento(ctx: Contexto, eventoId: number) {
  requerirSesion(ctx);
  const ev = ctx.db.get('SELECT * FROM eventos WHERE id = ?', [eventoId]);
  if (!ev) throw new ErrorNegocio('Evento no encontrado.');
  const total = ctx.db.valor<number>(
    `SELECT count(*) FROM actividades a WHERE a.evento_id = ? AND a.eliminado_en IS NULL AND ${CUENTA_SQL}
     AND EXISTS (SELECT 1 FROM asistencias s WHERE s.actividad_id = a.id)`, [eventoId],
  );
  return ctx.db.all(
    `SELECT p.id AS participante_id, p.tipo_documento, p.identificacion, p.nombres, p.apellidos, p.apellidos || ' ' || p.nombres AS nombre,
            p.institucion, i.estado AS inscripcion,
            coalesce(sum(s.presente), 0) AS asistidas,
            round(coalesce(sum(CASE WHEN s.presente = 1 THEN ${DURACION_SQL} END), 0), 2) AS horas,
            group_concat(CASE WHEN s.presente = 1 THEN a.titulo || '|' || coalesce(a.area, 'General') || '|' || round(${DURACION_SQL}, 2) END, '§') AS detalle
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     LEFT JOIN asistencias s ON s.participante_id = p.id AND s.actividad_id IN (SELECT id FROM actividades WHERE evento_id = ? AND eliminado_en IS NULL)
     LEFT JOIN actividades a ON a.id = s.actividad_id AND ${CUENTA_SQL}
     WHERE i.evento_id = ? AND p.eliminado_en IS NULL
     GROUP BY p.id ORDER BY p.apellidos, p.nombres`, [eventoId, eventoId],
  ).map((r) => ({
    ...r,
    actividades: total,
    porcentaje: total ? redondear((r.asistidas / total) * 100, 1) : null,
    aprueba: total > 0 && r.inscripcion === 'Inscrito' && (r.asistidas / total) * 100 >= ev.asistencia_minima,
  }));
}
