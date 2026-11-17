/**
 * Programación académica (horarios) con detección automática de conflictos.
 *
 * Bloquean el guardado (errores):
 *  - Cruce de horario del docente (misma fecha, franjas que se solapan).
 *  - Cruce de horario del grupo.
 *  - Duplicación de clase (mismo grupo, asignatura, fecha y hora de inicio).
 *  - Fecha fuera del rango del cursillo, o cursillo no activo.
 *  - Asignatura, grupo o temática que no corresponden al cursillo / asignatura.
 * Se advierten (permiten guardar tras confirmación):
 *  - Aula ocupada por otra clase en la misma franja.
 *  - El docente no es el responsable de la asignatura.
 *  - Las horas programadas superan la intensidad horaria de la asignatura.
 *  - Fecha pasada.
 */
import { DIAS, ESTADOS_HORARIO } from '../../shared/constantes';
import {
  auditar, diaSemana, DURACION_SQL, duracionHoras, ErrorNegocio, esFecha, esHora, fechaISO, hoy, limpiar, redondear,
  requerirPermiso, type Contexto,
} from './comun';

export interface DatosClase {
  id?: number;
  cursillo_id: number;
  asignatura_id: number;
  docente_id: number;
  grupo_id: number;
  tematica_id?: number | null;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  aula?: string | null;
  observaciones?: string | null;
}

export interface Conflicto { tipo: string; mensaje: string; fecha?: string }
export interface Verificacion { errores: Conflicto[]; advertencias: Conflicto[] }

const SELECT_CLASE = `
  SELECT h.*, a.nombre AS asignatura, a.area, g.nombre AS grupo, c.nombre AS cursillo,
         d.nombres || ' ' || d.apellidos AS docente, t.unidad || ': ' || t.tema AS tematica, ${DURACION_SQL} AS horas,
         (SELECT count(*) FROM asistencias s WHERE s.horario_id = h.id) AS asistencias
  FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id JOIN grupos g ON g.id = h.grupo_id
  JOIN cursillos c ON c.id = h.cursillo_id JOIN docentes d ON d.id = h.docente_id
  LEFT JOIN tematicas t ON t.id = h.tematica_id`;

function normalizar(d: DatosClase): DatosClase {
  return {
    ...d,
    cursillo_id: Number(d.cursillo_id), asignatura_id: Number(d.asignatura_id), docente_id: Number(d.docente_id),
    grupo_id: Number(d.grupo_id), tematica_id: d.tematica_id ? Number(d.tematica_id) : null,
    aula: limpiar(d.aula), observaciones: limpiar(d.observaciones),
  };
}

/** Verifica una clase candidata. `excluir` = ids de clases a ignorar (la propia al editar). */
export function verificar(ctx: Contexto, entrada: DatosClase, excluir: number[] = []): Verificacion {
  const d = normalizar(entrada);
  const db = ctx.db;
  const errores: Conflicto[] = [];
  const advertencias: Conflicto[] = [];
  const err = (tipo: string, mensaje: string) => errores.push({ tipo, mensaje, fecha: d.fecha });
  const adv = (tipo: string, mensaje: string) => advertencias.push({ tipo, mensaje, fecha: d.fecha });

  for (const [k, l] of [['cursillo_id', 'cursillo'], ['asignatura_id', 'asignatura'], ['docente_id', 'docente'], ['grupo_id', 'grupo']] as const) {
    if (!d[k]) err('obligatorio', `Seleccione el ${l}.`);
  }
  if (!esFecha(d.fecha)) err('fecha', 'La fecha de la clase no es válida.');
  if (!esHora(d.hora_inicio) || !esHora(d.hora_fin)) err('hora', 'Las horas deben tener el formato HH:MM.');
  else if (d.hora_fin <= d.hora_inicio) err('hora', 'La hora de finalización debe ser posterior a la de inicio.');
  if (errores.length) return { errores, advertencias };

  const cursillo = db.get('SELECT * FROM cursillos WHERE id = ? AND eliminado_en IS NULL', [d.cursillo_id]);
  const asig = db.get('SELECT * FROM asignaturas WHERE id = ? AND eliminado_en IS NULL', [d.asignatura_id]);
  const grupo = db.get('SELECT * FROM grupos WHERE id = ? AND eliminado_en IS NULL', [d.grupo_id]);
  const docente = db.get('SELECT * FROM docentes WHERE id = ? AND eliminado_en IS NULL', [d.docente_id]);
  if (!cursillo) err('referencia', 'El cursillo no existe.');
  if (!asig) err('referencia', 'La asignatura no existe.');
  if (!grupo) err('referencia', 'El grupo no existe.');
  if (!docente) err('referencia', 'El docente no existe.');
  if (errores.length) return { errores, advertencias };

  // Consistencia entre fechas, periodo y cursillo.
  if (cursillo.estado !== 'Activo') err('cursillo', `El cursillo está ${cursillo.estado.toLowerCase()}; no admite nuevas clases.`);
  if (d.fecha < cursillo.fecha_inicio || d.fecha > cursillo.fecha_fin) {
    err('fecha', `La fecha ${d.fecha} está fuera del cursillo (${cursillo.fecha_inicio} a ${cursillo.fecha_fin}).`);
  }
  const periodo = db.get('SELECT * FROM periodos WHERE id = ?', [cursillo.periodo_id]);
  if (periodo && (d.fecha < periodo.fecha_inicio || d.fecha > periodo.fecha_fin)) {
    err('fecha', `La fecha está fuera del periodo académico «${periodo.nombre}».`);
  }
  if (asig.cursillo_id !== d.cursillo_id) err('referencia', 'La asignatura no pertenece al cursillo seleccionado.');
  if (grupo.cursillo_id !== d.cursillo_id) err('referencia', 'El grupo no pertenece al cursillo seleccionado.');
  if (d.tematica_id) {
    const t = db.get(
      `SELECT t.id FROM tematicas t JOIN planeaciones p ON p.id = t.planeacion_id
       WHERE t.id = ? AND p.asignatura_id = ? AND t.eliminado_en IS NULL`, [d.tematica_id, d.asignatura_id],
    );
    if (!t) err('referencia', 'La temática no pertenece a la planeación de la asignatura.');
  }

  const excl = excluir.length ? `AND h.id NOT IN (${excluir.map(Number).join(',')})` : '';
  const solapadas = (campo: string, valor: number | string | null | undefined) => db.all(
    `${SELECT_CLASE} WHERE h.${campo} = ? AND h.fecha = ? AND h.estado <> 'Cancelada' AND h.eliminado_en IS NULL
     AND h.hora_inicio < ? AND ? < h.hora_fin ${excl}`,
    [valor, d.fecha, d.hora_fin, d.hora_inicio],
  );
  const franja = (c: any) => `${c.hora_inicio}–${c.hora_fin}`;

  for (const c of solapadas('grupo_id', d.grupo_id)) {
    if (c.asignatura_id === d.asignatura_id && c.hora_inicio === d.hora_inicio) {
      err('duplicado', `Clase duplicada: ${c.asignatura} ya está programada para el grupo ${c.grupo} el ${c.fecha} a las ${c.hora_inicio}.`);
    } else {
      err('cruce_grupo', `Cruce de horario del grupo ${c.grupo}: ya tiene ${c.asignatura} (${franja(c)}) el ${c.fecha}.`);
    }
  }
  for (const c of solapadas('docente_id', d.docente_id)) {
    err('cruce_docente', `Cruce de horario del docente ${c.docente}: ya dicta ${c.asignatura} al grupo ${c.grupo} (${franja(c)}) el ${c.fecha}.`);
  }
  if (d.aula) {
    for (const c of solapadas('aula', d.aula)) {
      if (c.grupo_id !== d.grupo_id) adv('aula', `El aula «${d.aula}» está ocupada por ${c.grupo} – ${c.asignatura} (${franja(c)}).`);
    }
  }
  if (asig.docente_id && asig.docente_id !== d.docente_id) {
    adv('docente', 'El docente seleccionado no es el responsable de la asignatura.');
  }
  if (!entrada.id && d.fecha < hoy()) adv('fecha', 'La fecha de la clase ya pasó.');
  return { errores, advertencias };
}

/** Advertencia de horas: se calcula aparte porque depende del total del lote. */
function advertenciaIntensidad(ctx: Contexto, asignaturaId: number, grupoId: number, horasNuevas: number, excluir: number[]): Conflicto | null {
  const a = ctx.db.get('SELECT nombre, intensidad_horaria FROM asignaturas WHERE id = ?', [asignaturaId]);
  if (!a) return null;
  const excl = excluir.length ? `AND h.id NOT IN (${excluir.map(Number).join(',')})` : '';
  const actuales = ctx.db.valor<number>(
    `SELECT coalesce(sum(${DURACION_SQL}), 0) FROM horarios h WHERE h.asignatura_id = ? AND h.grupo_id = ?
     AND h.estado <> 'Cancelada' AND h.eliminado_en IS NULL ${excl}`,
    [asignaturaId, grupoId],
  );
  const total = redondear(actuales + horasNuevas);
  return total > a.intensidad_horaria
    ? { tipo: 'intensidad', mensaje: `Con esta programación ${a.nombre} suma ${total} h para el grupo y supera su intensidad horaria (${a.intensidad_horaria} h).` }
    : null;
}

function puedeEditar(ctx: Contexto) {
  return requerirPermiso(ctx, 'horarios', 'editar');
}

/** Genera las fechas de un rango que caen en los días de la semana indicados (1 = lunes). */
export function fechasRecurrentes(desde: string, hasta: string, dias: number[]): string[] {
  if (!esFecha(desde) || !esFecha(hasta) || hasta < desde) throw new ErrorNegocio('Rango de fechas inválido.');
  const out: string[] = [];
  const d = new Date(desde + 'T12:00:00');
  const fin = new Date(hasta + 'T12:00:00');
  while (d <= fin) {
    const f = fechaISO(d);
    if (dias.includes(diaSemana(f))) out.push(f);
    d.setDate(d.getDate() + 1);
    if (out.length > 400) throw new ErrorNegocio('El rango genera demasiadas clases (máximo 400).');
  }
  return out;
}

export interface Lote { base: Omit<DatosClase, 'fecha'>; fechas?: string[]; dias?: number[]; desde?: string; hasta?: string }

/** Verifica una o varias clases antes de guardar (para mostrar las alertas). */
export function verificarLote(ctx: Contexto, lote: Lote & { id?: number }): Verificacion & { fechas: string[] } {
  requerirPermiso(ctx, 'horarios', 'ver');
  const fechas = lote.fechas?.length ? lote.fechas : fechasRecurrentes(lote.desde!, lote.hasta!, lote.dias ?? []);
  if (!fechas.length) throw new ErrorNegocio('No hay fechas: elija al menos un día de la semana dentro del rango.');
  const excluir = lote.id ? [lote.id] : [];
  const errores: Conflicto[] = [];
  const advertencias: Conflicto[] = [];
  for (const fecha of fechas) {
    const v = verificar(ctx, { ...lote.base, id: lote.id, fecha }, excluir);
    errores.push(...v.errores);
    advertencias.push(...v.advertencias);
  }
  if (esHora(lote.base.hora_inicio) && esHora(lote.base.hora_fin) && lote.base.hora_fin > lote.base.hora_inicio) {
    const adv = advertenciaIntensidad(ctx, Number(lote.base.asignatura_id), Number(lote.base.grupo_id), duracionHoras(lote.base.hora_inicio, lote.base.hora_fin) * fechas.length, excluir);
    if (adv) advertencias.push(adv);
  }
  return { errores, advertencias, fechas };
}

/**
 * Crea una clase o una serie recurrente. Si hay conflictos, no guarda nada y lanza
 * un error con el detalle, salvo `omitirConflictivas` (crea solo las fechas válidas).
 */
export function crear(ctx: Contexto, lote: Lote, opciones: { omitirConflictivas?: boolean } = {}) {
  puedeEditar(ctx);
  const v = verificarLote(ctx, lote);
  const conError = new Set(v.errores.map((e) => e.fecha));
  if (conError.size && !opciones.omitirConflictivas) {
    throw new ErrorNegocio(`Se encontraron ${v.errores.length} conflicto(s). No se guardó la programación.`, v.errores);
  }
  const b = normalizar({ ...lote.base, fecha: '' } as DatosClase);
  const creadas: number[] = [];
  ctx.db.tx(() => {
    for (const fecha of v.fechas) {
      if (conError.has(fecha)) continue;
      creadas.push(ctx.db.insertar('horarios', {
        cursillo_id: b.cursillo_id, asignatura_id: b.asignatura_id, docente_id: b.docente_id, grupo_id: b.grupo_id,
        tematica_id: b.tematica_id, fecha, dia_semana: diaSemana(fecha), hora_inicio: b.hora_inicio, hora_fin: b.hora_fin,
        aula: b.aula, observaciones: b.observaciones,
      }));
    }
    auditar(ctx, 'Programó clases', 'horarios', creadas[0] ?? null, { cantidad: creadas.length, omitidas: conError.size });
  });
  return { creadas: creadas.length, omitidas: [...conError] };
}

export function actualizar(ctx: Contexto, d: DatosClase): void {
  puedeEditar(ctx);
  const actual = ctx.db.get('SELECT * FROM horarios WHERE id = ? AND eliminado_en IS NULL', [d.id]);
  if (!actual) throw new ErrorNegocio('La clase no existe.');
  const v = verificar(ctx, d, [d.id!]);
  if (v.errores.length) throw new ErrorNegocio(`La clase tiene ${v.errores.length} conflicto(s). No se guardó.`, v.errores);
  const n = normalizar(d);
  ctx.db.tx(() => {
    ctx.db.actualizar('horarios', d.id!, {
      cursillo_id: n.cursillo_id, asignatura_id: n.asignatura_id, docente_id: n.docente_id, grupo_id: n.grupo_id,
      tematica_id: n.tematica_id, fecha: n.fecha, dia_semana: diaSemana(n.fecha), hora_inicio: n.hora_inicio,
      hora_fin: n.hora_fin, aula: n.aula, observaciones: n.observaciones,
    });
    auditar(ctx, 'Editó clase', 'horarios', d.id, { fecha: n.fecha, hora: n.hora_inicio });
  });
}

/** Cambia el estado de una clase (las horas de la temática vinculada se recalculan solas). */
export function cambiarEstado(ctx: Contexto, id: number, estado: string): void {
  const s = requerirPermiso(ctx, 'horarios', 'ver');
  if (!(ESTADOS_HORARIO as readonly string[]).includes(estado)) throw new ErrorNegocio('Estado inválido.');
  const c = ctx.db.get('SELECT * FROM horarios WHERE id = ? AND eliminado_en IS NULL', [id]);
  if (!c) throw new ErrorNegocio('La clase no existe.');
  // El docente puede marcar la ejecución de sus propias clases.
  const esPropia = s.rol === 'docente' && s.docenteId === c.docente_id;
  if (!s.permisos.horarios.editar && !esPropia) throw new ErrorNegocio('No tiene permiso para cambiar el estado de esta clase.');
  if (estado === c.estado) return;
  if (estado === 'Ejecutada' && c.fecha > hoy()) throw new ErrorNegocio('No se puede marcar como ejecutada una clase futura.');
  if (estado === 'Cancelada' && ctx.db.valor<number>('SELECT count(*) FROM asistencias WHERE horario_id = ?', [id])) {
    throw new ErrorNegocio('La clase tiene asistencia registrada; no se puede cancelar.');
  }
  ctx.db.tx(() => {
    ctx.db.actualizar('horarios', id, { estado });
    auditar(ctx, `Marcó clase como ${estado.toLowerCase()}`, 'horarios', id);
  });
}

export function eliminar(ctx: Contexto, id: number): void {
  requerirPermiso(ctx, 'horarios', 'eliminar');
  const c = ctx.db.get('SELECT * FROM horarios WHERE id = ? AND eliminado_en IS NULL', [id]);
  if (!c) throw new ErrorNegocio('La clase no existe.');
  if (ctx.db.valor<number>('SELECT count(*) FROM asistencias WHERE horario_id = ?', [id])) {
    throw new ErrorNegocio('La clase tiene asistencia registrada; márquela como cancelada o conserve el registro.');
  }
  ctx.db.tx(() => {
    ctx.db.run("UPDATE horarios SET eliminado_en = datetime('now','localtime') WHERE id = ?", [id]);
    auditar(ctx, 'Eliminó clase (papelera)', 'horarios', id);
  });
}

export interface FiltroHorario {
  desde?: string; hasta?: string; cursilloId?: number | null; docenteId?: number | null; grupoId?: number | null;
  asignaturaId?: number | null; estado?: string | null;
}

export function listar(ctx: Contexto, f: FiltroHorario = {}) {
  requerirPermiso(ctx, 'horarios', 'ver');
  const w = ['h.eliminado_en IS NULL'];
  const p: any[] = [];
  if (f.desde) { w.push('h.fecha >= ?'); p.push(f.desde); }
  if (f.hasta) { w.push('h.fecha <= ?'); p.push(f.hasta); }
  if (f.cursilloId) { w.push('h.cursillo_id = ?'); p.push(f.cursilloId); }
  if (f.docenteId) { w.push('h.docente_id = ?'); p.push(f.docenteId); }
  if (f.grupoId) { w.push('h.grupo_id = ?'); p.push(f.grupoId); }
  if (f.asignaturaId) { w.push('h.asignatura_id = ?'); p.push(f.asignaturaId); }
  if (f.estado) { w.push('h.estado = ?'); p.push(f.estado); }
  return ctx.db.all(`${SELECT_CLASE} WHERE ${w.join(' AND ')} ORDER BY h.fecha, h.hora_inicio LIMIT 5000`, p)
    .map((c) => ({ ...c, dia: DIAS[c.dia_semana - 1], horas: redondear(c.horas) }));
}

/** Historial de horas trabajadas por un docente, agrupado por mes y asignatura. */
export function horasDocente(ctx: Contexto, docenteId: number) {
  requerirPermiso(ctx, 'docentes', 'ver');
  return ctx.db.all(
    `SELECT strftime('%Y-%m', h.fecha) AS mes, c.nombre AS cursillo, a.nombre AS asignatura,
            sum(h.estado = 'Ejecutada') AS clases_ejecutadas, sum(h.estado = 'Programada') AS clases_programadas,
            sum(h.estado = 'Cancelada') AS clases_canceladas,
            round(coalesce(sum(CASE WHEN h.estado = 'Ejecutada' THEN ${DURACION_SQL} END), 0), 2) AS horas_ejecutadas,
            round(coalesce(sum(CASE WHEN h.estado = 'Programada' THEN ${DURACION_SQL} END), 0), 2) AS horas_programadas
     FROM horarios h JOIN asignaturas a ON a.id = h.asignatura_id JOIN cursillos c ON c.id = h.cursillo_id
     WHERE h.docente_id = ? AND h.eliminado_en IS NULL
     GROUP BY mes, c.id, a.id ORDER BY mes DESC, c.nombre, a.nombre`, [docenteId],
  );
}
