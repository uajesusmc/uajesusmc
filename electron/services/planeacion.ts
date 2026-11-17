/**
 * Planeación temática y distribución del tiempo.
 *
 * Indicadores por asignatura:
 *  - Horas programadas: suma de horas asignadas a las temáticas.
 *  - Horas ejecutadas de una temática = el mayor valor entre las horas registradas
 *    manualmente por el docente y las horas de clases «Ejecutadas» vinculadas a la
 *    temática en el grupo más avanzado. (Cada grupo recorre la misma planeación, por
 *    eso no se suman los grupos entre sí.)
 *  - Horas pendientes = programadas − ejecutadas (mínimo 0).
 *  - Avance (%) = ejecutadas / programadas.
 *  - Distribución (%) = programadas / intensidad horaria de la asignatura: indica si
 *    la planeación cubre exactamente la intensidad (100 %), le falta o la excede.
 *  - Cumplimiento (%) = ejecutadas / horas que debían estar ejecutadas a la fecha
 *    (temáticas con fecha programada vencida). Sin temáticas vencidas, 100 %.
 */
import type { Db } from '../db/connection';
import { auditar, DURACION_SQL, ErrorNegocio, esFecha, hoy, limpiar, redondear, requerirPermiso, type Contexto } from './comun';

export interface ResumenPlaneacion {
  intensidad: number;
  programadas: number;
  ejecutadas: number;
  pendientes: number;
  avance: number;
  distribucion: number;
  esperadas_a_la_fecha: number;
  cumplimiento: number;
  estado: 'Sin planeación' | 'Completa' | 'Al día' | 'Atrasada';
  horas_clase_programadas: number;
  horas_clase_ejecutadas: number;
}

/** Horas dictadas en clases vinculadas a la temática `t`, en el grupo más avanzado. */
export const DICTADAS_SQL = `coalesce((SELECT max(s) FROM (SELECT sum(${DURACION_SQL}) AS s FROM horarios h
  WHERE h.tematica_id = t.id AND h.estado = 'Ejecutada' AND h.eliminado_en IS NULL GROUP BY h.grupo_id)), 0)`;
/** Horas efectivamente ejecutadas de la temática `t`. */
export const EFECTIVAS_SQL = `max(t.horas_ejecutadas, ${DICTADAS_SQL})`;

export function resumen(db: Db, asignaturaId: number): ResumenPlaneacion {
  const a = db.get('SELECT intensidad_horaria FROM asignaturas WHERE id = ?', [asignaturaId]);
  const t = db.get(
    `SELECT coalesce(sum(t.horas_asignadas), 0) AS programadas, coalesce(sum(${EFECTIVAS_SQL}), 0) AS ejecutadas,
            coalesce(sum(CASE WHEN t.fecha_programada IS NOT NULL AND t.fecha_programada <= ? THEN t.horas_asignadas ELSE 0 END), 0) AS esperadas,
            count(t.id) AS n
     FROM planeaciones p JOIN tematicas t ON t.planeacion_id = p.id AND t.eliminado_en IS NULL
     WHERE p.asignatura_id = ? AND p.eliminado_en IS NULL`, [hoy(), asignaturaId],
  )!;
  const h = db.get(
    `SELECT coalesce(max(prog), 0) AS prog, coalesce(max(ejec), 0) AS ejec FROM (
       SELECT sum(CASE WHEN h.estado <> 'Cancelada' THEN ${DURACION_SQL} ELSE 0 END) AS prog,
              sum(CASE WHEN h.estado = 'Ejecutada' THEN ${DURACION_SQL} ELSE 0 END) AS ejec
       FROM horarios h WHERE h.asignatura_id = ? AND h.eliminado_en IS NULL GROUP BY h.grupo_id)`, [asignaturaId],
  )!;
  const intensidad = a?.intensidad_horaria ?? 0;
  const programadas = redondear(t.programadas);
  const ejecutadas = redondear(t.ejecutadas);
  const esperadas = redondear(t.esperadas);
  const avance = programadas ? redondear(Math.min(100, (ejecutadas / programadas) * 100), 1) : 0;
  const cumplimiento = esperadas ? redondear(Math.min(100, (ejecutadas / esperadas) * 100), 1) : 100;
  let estado: ResumenPlaneacion['estado'] = 'Al día';
  if (!t.n) estado = 'Sin planeación';
  else if (programadas > 0 && ejecutadas >= programadas) estado = 'Completa';
  else if (cumplimiento < 100) estado = 'Atrasada';
  return {
    intensidad, programadas, ejecutadas,
    pendientes: redondear(Math.max(0, programadas - ejecutadas)),
    avance,
    distribucion: intensidad ? redondear((programadas / intensidad) * 100, 1) : 0,
    esperadas_a_la_fecha: esperadas,
    cumplimiento,
    estado,
    horas_clase_programadas: redondear(h.prog),
    horas_clase_ejecutadas: redondear(h.ejec),
  };
}

function verificarEdicion(ctx: Contexto, asignaturaId: number) {
  requerirPermiso(ctx, 'planeacion', 'editar');
  const a = ctx.db.get('SELECT * FROM asignaturas WHERE id = ? AND eliminado_en IS NULL', [asignaturaId]);
  if (!a) throw new ErrorNegocio('Asignatura no encontrada.');
  const s = ctx.sesion!;
  if (s.rol === 'docente' && a.docente_id !== s.docenteId) {
    throw new ErrorNegocio('Solo el docente responsable de la asignatura puede modificar su planeación.');
  }
  return a;
}

function asegurarPlaneacion(ctx: Contexto, asignatura: any): number {
  const id = ctx.db.valor<number>('SELECT id FROM planeaciones WHERE asignatura_id = ? AND eliminado_en IS NULL', [asignatura.id]);
  if (id) return id;
  return ctx.db.insertar('planeaciones', { asignatura_id: asignatura.id, docente_id: asignatura.docente_id });
}

/** Planeación completa de una asignatura. */
export function obtener(ctx: Contexto, asignaturaId: number) {
  requerirPermiso(ctx, 'planeacion', 'ver');
  const asignatura = ctx.db.get(
    `SELECT a.*, c.nombre AS cursillo, c.fecha_inicio AS cursillo_inicio, c.fecha_fin AS cursillo_fin,
            d.nombres || ' ' || d.apellidos AS docente
     FROM asignaturas a JOIN cursillos c ON c.id = a.cursillo_id LEFT JOIN docentes d ON d.id = a.docente_id
     WHERE a.id = ? AND a.eliminado_en IS NULL`, [asignaturaId],
  );
  if (!asignatura) throw new ErrorNegocio('Asignatura no encontrada.');
  const planeacion = ctx.db.get('SELECT * FROM planeaciones WHERE asignatura_id = ? AND eliminado_en IS NULL', [asignaturaId]) ?? null;
  const tematicas = planeacion
    ? ctx.db.all(
      `SELECT t.*, round(${DICTADAS_SQL}, 2) AS horas_dictadas, round(${EFECTIVAS_SQL}, 2) AS horas_efectivas,
              (SELECT count(*) FROM horarios h WHERE h.tematica_id = t.id AND h.eliminado_en IS NULL) AS clases,
              (SELECT count(*) FROM materiales m WHERE m.tematica_id = t.id AND m.eliminado_en IS NULL) AS materiales
       FROM tematicas t WHERE t.planeacion_id = ? AND t.eliminado_en IS NULL ORDER BY t.orden, t.id`, [planeacion.id],
    )
    : [];
  const s = ctx.sesion!;
  const puedeEditar = !!s.permisos.planeacion.editar && (s.rol !== 'docente' || asignatura.docente_id === s.docenteId);
  return { asignatura, planeacion, tematicas, resumen: resumen(ctx.db, asignaturaId), puedeEditar };
}

export interface DatosTematica {
  id?: number; asignatura_id: number; unidad: string; tema: string; subtema?: string; objetivo?: string;
  fecha_programada?: string; horas_asignadas: number; horas_ejecutadas?: number; material?: string; observaciones?: string;
}

export function guardarTematica(ctx: Contexto, d: DatosTematica): number {
  const a = verificarEdicion(ctx, d.asignatura_id);
  const unidad = limpiar(d.unidad);
  const tema = limpiar(d.tema);
  if (!unidad) throw new ErrorNegocio('La unidad temática es obligatoria.');
  if (!tema) throw new ErrorNegocio('El tema es obligatorio.');
  const horas = Number(d.horas_asignadas);
  const ejec = Number(d.horas_ejecutadas ?? 0);
  if (!Number.isFinite(horas) || horas < 0 || horas > 500) throw new ErrorNegocio('Las horas asignadas deben estar entre 0 y 500.');
  if (!Number.isFinite(ejec) || ejec < 0 || ejec > 500) throw new ErrorNegocio('Las horas ejecutadas deben estar entre 0 y 500.');
  const fecha = limpiar(d.fecha_programada);
  if (fecha) {
    if (!esFecha(fecha)) throw new ErrorNegocio('La fecha programada no es válida.');
    const c = ctx.db.get('SELECT fecha_inicio, fecha_fin FROM cursillos WHERE id = ?', [a.cursillo_id])!;
    if (fecha < c.fecha_inicio || fecha > c.fecha_fin) {
      throw new ErrorNegocio(`La fecha programada debe estar dentro del cursillo (${c.fecha_inicio} a ${c.fecha_fin}).`);
    }
  }
  const datos = {
    unidad, tema, subtema: limpiar(d.subtema), objetivo: limpiar(d.objetivo), fecha_programada: fecha,
    horas_asignadas: redondear(horas), horas_ejecutadas: redondear(ejec), material: limpiar(d.material), observaciones: limpiar(d.observaciones),
  };
  return ctx.db.tx(() => {
    const planId = asegurarPlaneacion(ctx, a);
    let id: number;
    if (d.id) {
      const t = ctx.db.get('SELECT * FROM tematicas WHERE id = ? AND planeacion_id = ? AND eliminado_en IS NULL', [d.id, planId]);
      if (!t) throw new ErrorNegocio('La temática no pertenece a esta asignatura.');
      ctx.db.actualizar('tematicas', d.id, datos);
      id = d.id;
    } else {
      const orden = ctx.db.valor<number>('SELECT coalesce(max(orden), 0) + 1 FROM tematicas WHERE planeacion_id = ?', [planId]);
      id = ctx.db.insertar('tematicas', { ...datos, planeacion_id: planId, orden });
    }
    auditar(ctx, d.id ? 'Editó temática' : 'Agregó temática', 'tematicas', id, { asignatura: a.nombre, unidad, tema, horas });
    return id;
  });
}

export function eliminarTematica(ctx: Contexto, asignaturaId: number, tematicaId: number): void {
  verificarEdicion(ctx, asignaturaId);
  if (!ctx.sesion!.permisos.planeacion.eliminar && ctx.sesion!.rol !== 'docente') {
    throw new ErrorNegocio('Su rol no puede eliminar temáticas.');
  }
  const clases = ctx.db.valor<number>('SELECT count(*) FROM horarios WHERE tematica_id = ? AND eliminado_en IS NULL', [tematicaId]);
  if (clases) throw new ErrorNegocio(`La temática está vinculada a ${clases} clase(s). Desvincúlelas en Horarios antes de eliminarla.`);
  ctx.db.run(
    `UPDATE tematicas SET eliminado_en = datetime('now','localtime') WHERE id = ?
     AND planeacion_id = (SELECT id FROM planeaciones WHERE asignatura_id = ? AND eliminado_en IS NULL)`, [tematicaId, asignaturaId],
  );
  auditar(ctx, 'Eliminó temática (papelera)', 'tematicas', tematicaId);
}

/** Cambia el orden de las temáticas. */
export function reordenar(ctx: Contexto, asignaturaId: number, ids: number[]): void {
  verificarEdicion(ctx, asignaturaId);
  ctx.db.tx(() => ids.forEach((id, i) => ctx.db.run(
    `UPDATE tematicas SET orden = ? WHERE id = ? AND planeacion_id = (SELECT id FROM planeaciones WHERE asignatura_id = ? AND eliminado_en IS NULL)`,
    [i + 1, id, asignaturaId],
  )));
}

/**
 * Redistribuye las horas asignadas. Si `ajustarAIntensidad` es verdadero, reparte
 * proporcionalmente para que el total coincida con la intensidad horaria.
 */
export function redistribuir(
  ctx: Contexto, asignaturaId: number, horas: { id: number; horas_asignadas: number }[], ajustarAIntensidad = false,
): ResumenPlaneacion {
  const a = verificarEdicion(ctx, asignaturaId);
  let lista = horas.map((h) => ({ id: h.id, horas: Number(h.horas_asignadas) }));
  if (lista.some((h) => !Number.isFinite(h.horas) || h.horas < 0)) throw new ErrorNegocio('Las horas deben ser números positivos.');
  if (ajustarAIntensidad) {
    const total = lista.reduce((s, h) => s + h.horas, 0);
    if (total <= 0) {
      const igual = a.intensidad_horaria / Math.max(lista.length, 1);
      lista = lista.map((h) => ({ ...h, horas: igual }));
    } else {
      lista = lista.map((h) => ({ ...h, horas: (h.horas / total) * a.intensidad_horaria }));
    }
    // Redondea a medias horas preservando el total.
    let acumulado = 0;
    lista = lista.map((h, i) => {
      const v = i === lista.length - 1 ? a.intensidad_horaria - acumulado : Math.round(h.horas * 2) / 2;
      acumulado += v;
      return { ...h, horas: redondear(v) };
    });
  }
  ctx.db.tx(() => {
    for (const h of lista) {
      ctx.db.run(
        `UPDATE tematicas SET horas_asignadas = ?, actualizado_en = datetime('now','localtime') WHERE id = ?
         AND planeacion_id = (SELECT id FROM planeaciones WHERE asignatura_id = ? AND eliminado_en IS NULL)`,
        [h.horas, h.id, asignaturaId],
      );
    }
    auditar(ctx, 'Redistribuyó horas de la planeación', 'asignaturas', asignaturaId, lista);
  });
  return resumen(ctx.db, asignaturaId);
}

/** Resumen de todas las asignaturas (para informes y el panel principal). */
export function resumenGeneral(ctx: Contexto, filtro: { cursilloId?: number | null; docenteId?: number | null } = {}) {
  requerirPermiso(ctx, 'planeacion', 'ver');
  const w = ['a.eliminado_en IS NULL'];
  const p: any[] = [];
  if (filtro.cursilloId) { w.push('a.cursillo_id = ?'); p.push(filtro.cursilloId); }
  if (filtro.docenteId) { w.push('a.docente_id = ?'); p.push(filtro.docenteId); }
  return ctx.db.all(
    `SELECT a.id, a.codigo, a.nombre, a.area, c.nombre AS cursillo, d.nombres || ' ' || d.apellidos AS docente
     FROM asignaturas a JOIN cursillos c ON c.id = a.cursillo_id LEFT JOIN docentes d ON d.id = a.docente_id
     WHERE ${w.join(' AND ')} ORDER BY c.fecha_inicio DESC, a.area, a.nombre`, p,
  ).map((a) => ({ ...a, ...resumen(ctx.db, a.id) }));
}
