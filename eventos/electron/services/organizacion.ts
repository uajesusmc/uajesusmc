/**
 * Organización del evento: aulas, cursillos (cada uno con su docente y aula) y el
 * horario de docentes.
 *
 * Las sesiones de un cursillo se guardan como actividades de la agenda (tipo «Clase»),
 * con el docente como ponente y el aula como lugar. Así se reutiliza la detección de
 * cruces (docente ocupado, aula ocupada) y la asistencia/certificados por actividad.
 */
import { AREAS } from '../../shared/modelos';
import * as agenda from './agenda';
import { auditar, DURACION_SQL, ErrorNegocio, esFecha, esHora, fechaISO, limpiar, requerirEdicion, requerirSesion, type Contexto } from './comun';

// -------------------------------------------------------------------- aulas

export function listarAulas(ctx: Contexto) {
  requerirSesion(ctx);
  return ctx.db.all(
    `SELECT a.*, (SELECT count(*) FROM cursillos c WHERE c.aula_id = a.id AND c.eliminado_en IS NULL) AS cursillos
     FROM aulas a WHERE a.eliminado_en IS NULL ORDER BY a.nombre`,
  );
}

export function guardarAula(ctx: Contexto, d: { id?: number; nombre: string; capacidad?: number | string | null; ubicacion?: string; recursos?: string }): number {
  requerirEdicion(ctx);
  const nombre = limpiar(d.nombre);
  if (!nombre) throw new ErrorNegocio('Escriba el nombre del aula.');
  const cap = d.capacidad === '' || d.capacidad == null ? null : Number(d.capacidad);
  if (cap !== null && (!Number.isInteger(cap) || cap < 1)) throw new ErrorNegocio('La capacidad debe ser un número entero positivo.');
  if (ctx.db.get('SELECT 1 FROM aulas WHERE lower(nombre) = lower(?) AND eliminado_en IS NULL AND id <> ?', [nombre, d.id ?? 0])) {
    throw new ErrorNegocio('Ya existe un aula con ese nombre.');
  }
  const datos = { nombre, capacidad: cap, ubicacion: limpiar(d.ubicacion), recursos: limpiar(d.recursos) };
  if (d.id) {
    const anterior = ctx.db.get('SELECT nombre FROM aulas WHERE id = ?', [d.id]);
    ctx.db.tx(() => {
      ctx.db.actualizar('aulas', d.id!, datos);
      // El nombre del aula se refleja en las sesiones ya programadas.
      if (anterior && anterior.nombre !== nombre) ctx.db.run('UPDATE actividades SET lugar = ? WHERE aula_id = ?', [nombre, d.id]);
    });
  }
  const id = d.id ?? ctx.db.insertar('aulas', datos);
  auditar(ctx, d.id ? 'Editó aula' : 'Creó aula', nombre);
  return id;
}

export function eliminarAula(ctx: Contexto, id: number) {
  requerirEdicion(ctx);
  const n = ctx.db.valor<number>('SELECT count(*) FROM cursillos WHERE aula_id = ? AND eliminado_en IS NULL', [id]);
  if (n) throw new ErrorNegocio(`El aula está asignada a ${n} cursillo(s). Reasígnelos primero.`);
  ctx.db.run("UPDATE aulas SET eliminado_en = datetime('now','localtime') WHERE id = ?", [id]);
  auditar(ctx, 'Eliminó aula', id);
}

// ---------------------------------------------------------------- cursillos

const SELECT_CURSILLO = `
  SELECT c.*, p.nombres || ' ' || p.apellidos AS docente, au.nombre AS aula, au.capacidad AS aula_capacidad,
    (SELECT count(*) FROM actividades a WHERE a.cursillo_id = c.id AND a.eliminado_en IS NULL) AS sesiones,
    (SELECT round(coalesce(sum(${DURACION_SQL}), 0), 2) FROM actividades a WHERE a.cursillo_id = c.id AND a.eliminado_en IS NULL) AS horas
  FROM cursillos c LEFT JOIN ponentes p ON p.id = c.docente_id LEFT JOIN aulas au ON au.id = c.aula_id`;

export function listarCursillos(ctx: Contexto, eventoId: number) {
  requerirSesion(ctx);
  return ctx.db.all(`${SELECT_CURSILLO} WHERE c.evento_id = ? AND c.eliminado_en IS NULL ORDER BY c.nombre`, [eventoId]);
}

export interface DatosCursillo {
  id?: number; evento_id: number; nombre: string; area?: string | null; nivel?: string | null;
  docente_id?: number | null; aula_id?: number | null; cupo?: number | string | null; descripcion?: string | null;
}

export function guardarCursillo(ctx: Contexto, d: DatosCursillo): { id: number; advertencias: string[] } {
  requerirEdicion(ctx);
  const nombre = limpiar(d.nombre);
  if (!nombre) throw new ErrorNegocio('Escriba el nombre del cursillo.');
  const ev = ctx.db.get('SELECT * FROM eventos WHERE id = ? AND eliminado_en IS NULL', [d.evento_id]);
  if (!ev) throw new ErrorNegocio('Evento no encontrado.');
  if (d.area && !AREAS.includes(d.area as any)) throw new ErrorNegocio('Área no válida.');
  const docente = d.docente_id ? Number(d.docente_id) : null;
  const aula = d.aula_id ? Number(d.aula_id) : null;
  if (docente && !ctx.db.get('SELECT 1 FROM ponentes WHERE id = ? AND eliminado_en IS NULL', [docente])) throw new ErrorNegocio('El docente no existe.');
  const aulaReg = aula ? ctx.db.get('SELECT * FROM aulas WHERE id = ? AND eliminado_en IS NULL', [aula]) : null;
  if (aula && !aulaReg) throw new ErrorNegocio('El aula no existe.');
  const cupo = d.cupo === '' || d.cupo == null ? null : Number(d.cupo);
  if (cupo !== null && (!Number.isInteger(cupo) || cupo < 1)) throw new ErrorNegocio('El cupo debe ser un número entero positivo.');
  if (ctx.db.get('SELECT 1 FROM cursillos WHERE evento_id = ? AND lower(nombre) = lower(?) AND eliminado_en IS NULL AND id <> ?', [d.evento_id, nombre, d.id ?? 0])) {
    throw new ErrorNegocio('Ya existe un cursillo con ese nombre en el evento.');
  }
  const advertencias: string[] = [];
  if (aulaReg?.capacidad && cupo && cupo > aulaReg.capacidad) advertencias.push(`El cupo (${cupo}) supera la capacidad del aula ${aulaReg.nombre} (${aulaReg.capacidad}).`);
  const datos = { evento_id: Number(d.evento_id), nombre, area: limpiar(d.area), nivel: limpiar(d.nivel), docente_id: docente, aula_id: aula, cupo, descripcion: limpiar(d.descripcion) };

  const id = ctx.db.tx(() => {
    if (!d.id) return ctx.db.insertar('cursillos', datos);
    ctx.db.actualizar('cursillos', d.id, datos);
    // Las sesiones ya programadas adoptan el nuevo docente/aula; si eso genera un cruce, se revierte todo.
    const sesiones = ctx.db.all('SELECT * FROM actividades WHERE cursillo_id = ? AND eliminado_en IS NULL', [d.id]);
    for (const s of sesiones) {
      const nueva = { ...s, titulo: nombre, area: datos.area, ponente_id: docente, aula_id: aula, lugar: aulaReg?.nombre ?? null };
      const v = agenda.verificar(ctx, nueva);
      if (v.errores.length) throw new ErrorNegocio(`No se puede aplicar el cambio a la sesión del ${s.fecha} ${s.hora_inicio}: ${v.errores[0]}`);
      ctx.db.actualizar('actividades', s.id, { titulo: nombre, area: datos.area, ponente_id: docente, aula_id: aula, lugar: aulaReg?.nombre ?? null });
    }
    return d.id;
  });
  auditar(ctx, d.id ? 'Editó cursillo' : 'Creó cursillo', { id, nombre });
  return { id, advertencias };
}

export function eliminarCursillo(ctx: Contexto, id: number) {
  requerirEdicion(ctx);
  const conAsistencia = ctx.db.valor<number>(
    'SELECT count(*) FROM asistencias s JOIN actividades a ON a.id = s.actividad_id WHERE a.cursillo_id = ? AND a.eliminado_en IS NULL', [id],
  );
  if (conAsistencia) throw new ErrorNegocio('El cursillo tiene sesiones con asistencia registrada; no se puede eliminar.');
  ctx.db.tx(() => {
    ctx.db.run("UPDATE actividades SET eliminado_en = datetime('now','localtime') WHERE cursillo_id = ? AND eliminado_en IS NULL", [id]);
    ctx.db.run("UPDATE cursillos SET eliminado_en = datetime('now','localtime') WHERE id = ?", [id]);
  });
  auditar(ctx, 'Eliminó cursillo y sus sesiones', id);
}

// ----------------------------------------------------- programación de sesiones

export interface Programacion { cursillo_id: number; fechas?: string[]; dias?: number[]; desde?: string; hasta?: string; hora_inicio: string; hora_fin: string }

/** Fechas de la programación: lista explícita o días de la semana (1 = lunes) en un rango. */
function fechasDe(p: Programacion): string[] {
  if (p.fechas?.length) return p.fechas;
  if (!esFecha(p.desde) || !esFecha(p.hasta) || p.hasta < p.desde) throw new ErrorNegocio('Indique un rango de fechas válido.');
  if (!p.dias?.length) throw new ErrorNegocio('Elija al menos un día de la semana.');
  const out: string[] = [];
  const d = new Date(p.desde + 'T12:00:00');
  const fin = new Date(p.hasta + 'T12:00:00');
  while (d <= fin) {
    const dia = d.getDay() === 0 ? 7 : d.getDay();
    if (p.dias.includes(dia)) out.push(fechaISO(d));
    d.setDate(d.getDate() + 1);
  }
  if (out.length > 200) throw new ErrorNegocio('Demasiadas sesiones (máximo 200 por programación).');
  return out;
}

function sesionDe(c: any, fecha: string, p: Programacion): agenda.DatosActividad & { cursillo_id: number; aula_id: number | null } {
  return {
    evento_id: c.evento_id, titulo: c.nombre, tipo: 'Clase', area: c.area, ponente_id: c.docente_id, lugar: c.aula,
    fecha, hora_inicio: p.hora_inicio, hora_fin: p.hora_fin, cursillo_id: c.id, aula_id: c.aula_id,
  };
}

/** Revisa cada sesión propuesta: cruces del docente, del aula y fechas fuera del evento. */
export function verificarProgramacion(ctx: Contexto, p: Programacion) {
  requerirSesion(ctx);
  const c = ctx.db.get(`${SELECT_CURSILLO} WHERE c.id = ? AND c.eliminado_en IS NULL`, [p.cursillo_id]);
  if (!c) throw new ErrorNegocio('Cursillo no encontrado.');
  if (!esHora(p.hora_inicio) || !esHora(p.hora_fin) || p.hora_fin <= p.hora_inicio) throw new ErrorNegocio('Revise las horas de inicio y fin.');
  const advertencias: string[] = [];
  if (!c.docente_id) advertencias.push('El cursillo no tiene docente asignado.');
  if (!c.aula_id) advertencias.push('El cursillo no tiene aula asignada.');
  const fechas = fechasDe(p);
  const sesiones = fechas.map((fecha) => {
    const v = agenda.verificar(ctx, sesionDe(c, fecha, p));
    return { fecha, errores: v.errores };
  });
  return { cursillo: c, sesiones, advertencias, validas: sesiones.filter((s) => !s.errores.length).length };
}

/** Crea las sesiones sin conflicto. Con `soloValidas` omite las que tienen cruce; si no, no crea nada. */
export function programar(ctx: Contexto, p: Programacion, soloValidas = false) {
  requerirEdicion(ctx);
  const v = verificarProgramacion(ctx, p);
  const conflicto = v.sesiones.filter((s) => s.errores.length);
  if (conflicto.length && !soloValidas) {
    throw new ErrorNegocio(`Hay ${conflicto.length} sesión(es) con cruce de horario:\n${conflicto.slice(0, 5).map((s) => `${s.fecha}: ${s.errores[0]}`).join('\n')}`);
  }
  let creadas = 0;
  ctx.db.tx(() => {
    for (const s of v.sesiones) {
      if (s.errores.length) continue;
      ctx.db.insertar('actividades', { ...sesionDe(v.cursillo, s.fecha, p) });
      creadas++;
    }
  });
  auditar(ctx, 'Programó sesiones de cursillo', { cursillo: v.cursillo.nombre, creadas });
  return { creadas, omitidas: conflicto.map((s) => s.fecha) };
}

// ------------------------------------------------------- horario de docentes

/** Todas las sesiones del evento con docente, cursillo y aula (para el horario de docentes). */
export function horarioDocentes(ctx: Contexto, eventoId: number, ponenteId?: number | null) {
  requerirSesion(ctx);
  return ctx.db.all(
    `SELECT a.id, a.fecha, a.hora_inicio, a.hora_fin, round(${DURACION_SQL}, 2) AS horas, a.titulo, a.tipo, a.area,
            a.ponente_id, p.nombres || ' ' || p.apellidos AS docente, coalesce(au.nombre, a.lugar) AS aula,
            c.id AS cursillo_id, coalesce(c.nombre, a.titulo) AS cursillo, c.nivel
     FROM actividades a LEFT JOIN ponentes p ON p.id = a.ponente_id LEFT JOIN cursillos c ON c.id = a.cursillo_id
     LEFT JOIN aulas au ON au.id = a.aula_id
     WHERE a.evento_id = ? AND a.eliminado_en IS NULL AND a.ponente_id IS NOT NULL ${ponenteId ? 'AND a.ponente_id = ?' : ''}
     ORDER BY p.apellidos, p.nombres, a.fecha, a.hora_inicio`,
    ponenteId ? [eventoId, ponenteId] : [eventoId],
  );
}
