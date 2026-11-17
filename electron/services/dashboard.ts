/** Indicadores del panel principal. */
import { DURACION_SQL, hoy, redondear, requerirPermiso, type Contexto } from './comun';
import { resumen as resumenPlaneacion } from './planeacion';

export function indicadores(ctx: Contexto, mes?: string) {
  requerirPermiso(ctx, 'inicio', 'ver');
  const db = ctx.db;
  const n = (sql: string, p: any[] = []) => Number(db.valor(sql, p) ?? 0);
  const activos = "SELECT id FROM cursillos WHERE estado = 'Activo' AND eliminado_en IS NULL";

  const kpis = {
    estudiantes: n('SELECT count(*) FROM estudiantes WHERE eliminado_en IS NULL'),
    estudiantes_activos: n(`SELECT count(DISTINCT estudiante_id) FROM matriculas WHERE eliminado_en IS NULL AND estado = 'Activa' AND cursillo_id IN (${activos})`),
    docentes: n('SELECT count(*) FROM docentes WHERE eliminado_en IS NULL'),
    cursillos_activos: n(`SELECT count(*) FROM (${activos})`),
    asignaturas: n(`SELECT count(*) FROM asignaturas WHERE eliminado_en IS NULL AND cursillo_id IN (${activos})`),
    horas_programadas: redondear(n(`SELECT coalesce(sum(${DURACION_SQL}), 0) FROM horarios h WHERE h.eliminado_en IS NULL AND h.estado <> 'Cancelada' AND h.cursillo_id IN (${activos})`)),
    horas_ejecutadas: redondear(n(`SELECT coalesce(sum(${DURACION_SQL}), 0) FROM horarios h WHERE h.eliminado_en IS NULL AND h.estado = 'Ejecutada' AND h.cursillo_id IN (${activos})`)),
    certificados: n('SELECT count(*) FROM certificados WHERE anulado = 0'),
  };

  const proximas = db.all(
    `SELECT h.id, h.fecha, h.hora_inicio, h.hora_fin, h.aula, a.nombre AS asignatura, g.nombre AS grupo,
            d.nombres || ' ' || d.apellidos AS docente
     FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id JOIN grupos g ON g.id = h.grupo_id JOIN docentes d ON d.id = h.docente_id
     WHERE h.eliminado_en IS NULL AND h.estado = 'Programada' AND h.fecha >= ? ORDER BY h.fecha, h.hora_inicio LIMIT 8`, [hoy()],
  );

  // Clases pasadas que siguen como «Programada»: requieren atención.
  const pendientes = n(`SELECT count(*) FROM horarios WHERE eliminado_en IS NULL AND estado = 'Programada' AND fecha < ?`, [hoy()]);

  const m = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : hoy().slice(0, 7);
  const calendario = db.all(
    `SELECT h.fecha, count(*) AS clases, sum(h.estado = 'Ejecutada') AS ejecutadas,
            group_concat(substr(h.hora_inicio, 1, 5) || ' ' || a.nombre || ' (' || g.nombre || ')', '\n') AS detalle
     FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id JOIN grupos g ON g.id = h.grupo_id
     WHERE h.eliminado_en IS NULL AND h.estado <> 'Cancelada' AND strftime('%Y-%m', h.fecha) = ? GROUP BY h.fecha`, [m],
  );
  const eventosCursillos = db.all(
    `SELECT nombre, fecha_inicio, fecha_fin FROM cursillos WHERE eliminado_en IS NULL
     AND (strftime('%Y-%m', fecha_inicio) = ? OR strftime('%Y-%m', fecha_fin) = ?)`, [m, m],
  );

  const porCursillo = db.all(
    `SELECT c.nombre, count(m.id) AS estudiantes FROM cursillos c
     LEFT JOIN matriculas m ON m.cursillo_id = c.id AND m.eliminado_en IS NULL AND m.estado IN ('Activa','Finalizada')
     WHERE c.eliminado_en IS NULL GROUP BY c.id ORDER BY c.fecha_inicio DESC LIMIT 8`,
  ).reverse();
  const porArea = db.all(
    `SELECT a.area, count(*) AS asignaturas, coalesce(sum(a.intensidad_horaria), 0) AS horas
     FROM asignaturas a WHERE a.eliminado_en IS NULL AND a.cursillo_id IN (${activos}) GROUP BY a.area`,
  );
  const avance = db.all(`SELECT id, nombre FROM asignaturas WHERE eliminado_en IS NULL AND cursillo_id IN (${activos}) ORDER BY nombre`)
    .map((a) => {
      const r = resumenPlaneacion(db, a.id);
      return { nombre: a.nombre, programadas: r.programadas, ejecutadas: r.ejecutadas, avance: r.avance, estado: r.estado };
    });
  const asistenciaMensual = db.all(
    `SELECT strftime('%Y-%m', h.fecha) AS mes,
            round(100.0 * sum(s.estado IN ('Asistió','Retardo','Excusa')) / count(*), 1) AS porcentaje
     FROM asistencias s JOIN horarios h ON h.id = s.horario_id WHERE h.eliminado_en IS NULL
     GROUP BY mes ORDER BY mes DESC LIMIT 6`,
  ).reverse();

  return { kpis, proximas, pendientes, mes: m, calendario, eventosCursillos, porCursillo, porArea, avance, asistenciaMensual };
}
