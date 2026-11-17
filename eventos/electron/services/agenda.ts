/**
 * Agenda del evento (actividades) con detección de conflictos.
 * Errores (bloquean): fecha fuera del evento, cruce del ponente con otra actividad
 * (de cualquier evento), cruce de lugar dentro del mismo horario, actividad duplicada.
 */
import { AREAS, TIPOS_ACTIVIDAD } from '../../shared/modelos';
import { auditar, DURACION_SQL, ErrorNegocio, esFecha, esHora, limpiar, redondear, requerirEdicion, requerirSesion, type Contexto } from './comun';

export interface DatosActividad {
  id?: number; evento_id: number; titulo: string; tipo: string; area?: string | null; ponente_id?: number | null;
  fecha: string; hora_inicio: string; hora_fin: string; lugar?: string | null; descripcion?: string | null;
}

const SELECT = `SELECT a.*, p.nombres || ' ' || p.apellidos AS ponente, e.nombre AS evento, round(${DURACION_SQL}, 2) AS horas,
  (SELECT count(*) FROM asistencias s WHERE s.actividad_id = a.id) AS asistencia_registrada
  FROM actividades a JOIN eventos e ON e.id = a.evento_id LEFT JOIN ponentes p ON p.id = a.ponente_id`;

export function listar(ctx: Contexto, f: { eventoId?: number; ponenteId?: number; desde?: string; hasta?: string } = {}) {
  requerirSesion(ctx);
  const w = ['a.eliminado_en IS NULL', 'e.eliminado_en IS NULL'];
  const p: any[] = [];
  if (f.eventoId) { w.push('a.evento_id = ?'); p.push(f.eventoId); }
  if (f.ponenteId) { w.push('a.ponente_id = ?'); p.push(f.ponenteId); }
  if (f.desde) { w.push('a.fecha >= ?'); p.push(f.desde); }
  if (f.hasta) { w.push('a.fecha <= ?'); p.push(f.hasta); }
  return ctx.db.all(`${SELECT} WHERE ${w.join(' AND ')} ORDER BY a.fecha, a.hora_inicio`, p);
}

export function verificar(ctx: Contexto, d: DatosActividad): { errores: string[]; advertencias: string[] } {
  requerirSesion(ctx);
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!limpiar(d.titulo)) errores.push('Escriba el título de la actividad.');
  if (!TIPOS_ACTIVIDAD.includes(d.tipo as any)) errores.push('Seleccione el tipo de actividad.');
  if (d.area && !AREAS.includes(d.area as any)) errores.push('Área no válida.');
  if (!esFecha(d.fecha)) errores.push('La fecha no es válida.');
  if (!esHora(d.hora_inicio) || !esHora(d.hora_fin)) errores.push('Las horas deben tener el formato HH:MM.');
  else if (d.hora_fin <= d.hora_inicio) errores.push('La hora de finalización debe ser posterior a la de inicio.');
  if (errores.length) return { errores, advertencias };
  const ev = ctx.db.get('SELECT * FROM eventos WHERE id = ? AND eliminado_en IS NULL', [d.evento_id]);
  if (!ev) return { errores: ['El evento no existe.'], advertencias };
  if (ev.estado === 'Cancelado') errores.push('El evento está cancelado.');
  if (d.fecha < ev.fecha_inicio || d.fecha > ev.fecha_fin) errores.push(`La fecha está fuera del evento (${ev.fecha_inicio} a ${ev.fecha_fin}).`);
  const cruce = (campo: string, valor: string | number, mismoEvento: boolean) => ctx.db.all(
    `${SELECT} WHERE a.${campo} = ? AND a.fecha = ? AND a.hora_inicio < ? AND ? < a.hora_fin AND a.eliminado_en IS NULL AND a.id <> ?
     ${mismoEvento ? 'AND a.evento_id = ?' : ''}`,
    [valor, d.fecha, d.hora_fin, d.hora_inicio, d.id ?? 0, ...(mismoEvento ? [d.evento_id] : [])],
  );
  if (d.ponente_id) {
    for (const c of cruce('ponente_id', d.ponente_id, false)) {
      errores.push(`Cruce del ponente ${c.ponente}: ya tiene «${c.titulo}» (${c.hora_inicio}–${c.hora_fin}) en ${c.evento}.`);
    }
  }
  const lugar = limpiar(d.lugar);
  if (lugar) {
    for (const c of cruce('lugar', lugar, true)) errores.push(`El lugar «${lugar}» ya está ocupado por «${c.titulo}» (${c.hora_inicio}–${c.hora_fin}).`);
  }
  const dup = ctx.db.get(
    'SELECT 1 FROM actividades WHERE evento_id = ? AND lower(titulo) = lower(?) AND fecha = ? AND hora_inicio = ? AND eliminado_en IS NULL AND id <> ?',
    [d.evento_id, limpiar(d.titulo), d.fecha, d.hora_inicio, d.id ?? 0],
  );
  if (dup) errores.push('Actividad duplicada: ya existe con el mismo título, fecha y hora.');
  if (!d.ponente_id && !['Receso', 'Ceremonia'].includes(d.tipo)) advertencias.push('La actividad no tiene ponente asignado.');
  return { errores, advertencias };
}

export function guardar(ctx: Contexto, d: DatosActividad): number {
  requerirEdicion(ctx);
  const v = verificar(ctx, d);
  if (v.errores.length) throw new ErrorNegocio(v.errores.join('\n'), v.errores);
  const datos = {
    evento_id: Number(d.evento_id), titulo: limpiar(d.titulo), tipo: d.tipo, area: limpiar(d.area), ponente_id: d.ponente_id || null,
    fecha: d.fecha, hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, lugar: limpiar(d.lugar), descripcion: limpiar(d.descripcion),
    // Si el lugar coincide con un aula registrada, la actividad queda vinculada a ella.
    aula_id: limpiar(d.lugar) ? ctx.db.valor<number>('SELECT id FROM aulas WHERE lower(nombre) = lower(?) AND eliminado_en IS NULL', [limpiar(d.lugar)]) ?? null : null,
  };
  if (d.id) {
    if (!ctx.db.get('SELECT 1 FROM actividades WHERE id = ? AND eliminado_en IS NULL', [d.id])) throw new ErrorNegocio('La actividad ya no existe.');
    ctx.db.actualizar('actividades', d.id, datos);
  }
  const id = d.id ?? ctx.db.insertar('actividades', datos);
  auditar(ctx, d.id ? 'Editó actividad' : 'Agregó actividad a la agenda', { id, titulo: datos.titulo });
  return id;
}

export function eliminar(ctx: Contexto, id: number) {
  requerirEdicion(ctx);
  if (ctx.db.valor<number>('SELECT count(*) FROM asistencias WHERE actividad_id = ?', [id])) {
    throw new ErrorNegocio('La actividad tiene asistencia registrada; no se puede eliminar.');
  }
  ctx.db.run("UPDATE actividades SET eliminado_en = datetime('now','localtime') WHERE id = ?", [id]);
  auditar(ctx, 'Eliminó actividad (papelera)', id);
}

/** Horas académicas del evento (no cuentan los recesos). */
export function horasEvento(ctx: Contexto, eventoId: number): number {
  return redondear(ctx.db.valor<number>(
    `SELECT coalesce(sum(${DURACION_SQL}), 0) FROM actividades a WHERE a.evento_id = ? AND a.eliminado_en IS NULL AND a.tipo <> 'Receso'`, [eventoId],
  ));
}
