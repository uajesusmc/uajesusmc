/**
 * Operaciones genéricas (listar, guardar, eliminar a la papelera, restaurar) para las
 * entidades descritas en `shared/entidades.ts`. Las reglas específicas de cada
 * entidad se aplican en `validacionesExtra` y `despuesDeGuardar`.
 */
import { ENTIDADES, entidad, type Campo, type NombreEntidad } from '../../shared/entidades';
import { TABLAS_PAPELERA } from '../db/schema';
import {
  auditar, ErrorNegocio, esFecha, hoy, limpiar, requerirPermiso, type Contexto,
} from './comun';

/** SELECT con las columnas calculadas que muestran las tablas (alias base `t`). */
const CONSULTAS: Record<NombreEntidad, string> = {
  periodos: `SELECT t.*, (SELECT count(*) FROM cursillos c WHERE c.periodo_id = t.id AND c.eliminado_en IS NULL) AS num_cursillos
             FROM periodos t`,
  cursillos: `SELECT t.*, p.nombre AS periodo,
               (SELECT count(*) FROM matriculas m WHERE m.cursillo_id = t.id AND m.eliminado_en IS NULL AND m.estado <> 'Anulada') AS num_estudiantes
             FROM cursillos t JOIN periodos p ON p.id = t.periodo_id`,
  docentes: `SELECT t.*, t.nombres || ' ' || t.apellidos AS nombre_completo,
               (SELECT group_concat(a.nombre, ', ') FROM asignaturas a WHERE a.docente_id = t.id AND a.eliminado_en IS NULL) AS asignaturas
             FROM docentes t`,
  asignaturas: `SELECT t.*, c.nombre AS cursillo, d.nombres || ' ' || d.apellidos AS docente
             FROM asignaturas t JOIN cursillos c ON c.id = t.cursillo_id LEFT JOIN docentes d ON d.id = t.docente_id`,
  grupos: `SELECT t.*, c.nombre AS cursillo, d.nombres || ' ' || d.apellidos AS director,
             (SELECT count(*) FROM matriculas m WHERE m.grupo_id = t.id AND m.eliminado_en IS NULL AND m.estado = 'Activa') AS num_estudiantes
           FROM grupos t JOIN cursillos c ON c.id = t.cursillo_id LEFT JOIN docentes d ON d.id = t.docente_id`,
  estudiantes: `SELECT t.*, um.cursillo, um.cursillo_id, um.grupo, um.grupo_id, um.estado AS estado_matricula
             FROM estudiantes t LEFT JOIN (
               SELECT m.estudiante_id, c.nombre AS cursillo, c.id AS cursillo_id, g.nombre AS grupo, g.id AS grupo_id, m.estado, max(c.fecha_inicio)
               FROM matriculas m JOIN cursillos c ON c.id = m.cursillo_id LEFT JOIN grupos g ON g.id = m.grupo_id
               WHERE m.eliminado_en IS NULL GROUP BY m.estudiante_id
             ) um ON um.estudiante_id = t.id`,
  matriculas: `SELECT t.*, e.nombres || ' ' || e.apellidos AS estudiante, e.identificacion, c.nombre AS cursillo, g.nombre AS grupo
             FROM matriculas t JOIN estudiantes e ON e.id = t.estudiante_id JOIN cursillos c ON c.id = t.cursillo_id
             LEFT JOIN grupos g ON g.id = t.grupo_id`,
};

/** Filtros especiales que no son columnas directas de la tabla. */
const FILTROS_EXTRA: Partial<Record<NombreEntidad, Record<string, string>>> = {
  estudiantes: {
    cursillo_id: 'EXISTS (SELECT 1 FROM matriculas x WHERE x.estudiante_id = t.id AND x.cursillo_id = ? AND x.eliminado_en IS NULL)',
    grupo_id: 'EXISTS (SELECT 1 FROM matriculas x WHERE x.estudiante_id = t.id AND x.grupo_id = ? AND x.eliminado_en IS NULL)',
    estado_matricula: 'um.estado = ?',
  },
  docentes: {
    cursillo_id: 'EXISTS (SELECT 1 FROM asignaturas x WHERE x.docente_id = t.id AND x.cursillo_id = ? AND x.eliminado_en IS NULL)',
  },
};

/** Etiqueta legible de cada entidad para listas desplegables. */
const ETIQUETAS: Record<string, { tabla: string; label: string; extra?: string; orden: string }> = {
  periodos: { tabla: 'periodos', label: "codigo || ' – ' || nombre", orden: 'fecha_inicio DESC' },
  cursillos: { tabla: 'cursillos', label: "codigo || ' – ' || nombre", extra: 'estado, fecha_inicio, fecha_fin', orden: 'fecha_inicio DESC' },
  docentes: { tabla: 'docentes', label: "apellidos || ', ' || nombres", orden: 'apellidos, nombres' },
  estudiantes: { tabla: 'estudiantes', label: "apellidos || ', ' || nombres || ' (' || identificacion || ')'", orden: 'apellidos, nombres' },
  grupos: { tabla: 'grupos', label: 'nombre', extra: 'cursillo_id, aula', orden: 'nombre' },
  asignaturas: { tabla: 'asignaturas', label: "nombre || ' (' || codigo || ')'", extra: 'cursillo_id, docente_id, area, intensidad_horaria', orden: 'nombre' },
  matriculas: { tabla: 'matriculas', label: 'id', extra: 'estudiante_id, cursillo_id', orden: 'id' },
};

export interface FiltroLista {
  busqueda?: string;
  filtros?: Record<string, string | number | null | undefined>;
  limite?: number;
}

const assertEntidad = (n: string): NombreEntidad => {
  if (!(n in ENTIDADES)) throw new ErrorNegocio(`Entidad desconocida: ${n}`);
  return n as NombreEntidad;
};

export function listar(ctx: Contexto, nombre: string, f: FiltroLista = {}) {
  const n = assertEntidad(nombre);
  const e = entidad(n);
  requerirPermiso(ctx, e.modulo, 'ver');
  const where = ['t.eliminado_en IS NULL'];
  const params: any[] = [];
  const texto = limpiar(f.busqueda);
  if (texto) {
    where.push(`(${e.busqueda.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    e.busqueda.forEach(() => params.push(`%${texto}%`));
  }
  const camposValidos = new Set(e.campos.map((c) => c.name));
  for (const [k, v] of Object.entries(f.filtros ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    const extra = FILTROS_EXTRA[n]?.[k];
    if (extra) where.push(extra);
    else if (camposValidos.has(k)) where.push(`t.${k} = ?`);
    else throw new ErrorNegocio(`Filtro no permitido: ${k}`);
    params.push(v);
  }
  return ctx.db.all(
    `${CONSULTAS[n]} WHERE ${where.join(' AND ')} ORDER BY ${e.orden} LIMIT ?`,
    [...params, Math.min(f.limite ?? 5000, 20000)],
  );
}

export function obtener(ctx: Contexto, nombre: string, id: number) {
  const n = assertEntidad(nombre);
  requerirPermiso(ctx, entidad(n).modulo, 'ver');
  const r = ctx.db.get(`${CONSULTAS[n]} WHERE t.id = ?`, [id]);
  if (!r) throw new ErrorNegocio('Registro no encontrado.');
  return r;
}

/** Opciones para listas desplegables (solo registros vigentes). */
export function opciones(ctx: Contexto, nombre: string) {
  const et = ETIQUETAS[nombre];
  if (!et) throw new ErrorNegocio(`Entidad desconocida: ${nombre}`);
  if (!ctx.sesion) throw new ErrorNegocio('Debe iniciar sesión.');
  return ctx.db.all(
    `SELECT id, ${et.label} AS label${et.extra ? ', ' + et.extra : ''} FROM ${et.tabla} WHERE eliminado_en IS NULL ORDER BY ${et.orden}`,
  );
}

/** Convierte y valida un campo según su definición. */
function convertir(c: Campo, valor: unknown, ctx: Contexto): string | number | null {
  const v = limpiar(valor);
  if (v === null) {
    if (c.required) throw new ErrorNegocio(`El campo «${c.label}» es obligatorio.`);
    return null;
  }
  if (c.maxLength && v.length > c.maxLength) throw new ErrorNegocio(`«${c.label}» admite máximo ${c.maxLength} caracteres.`);
  switch (c.type) {
    case 'number': {
      const num = Number(v.replace(',', '.'));
      if (!Number.isFinite(num)) throw new ErrorNegocio(`«${c.label}» debe ser un número.`);
      if (c.min !== undefined && num < c.min) throw new ErrorNegocio(`«${c.label}» debe ser mayor o igual a ${c.min}.`);
      if (c.max !== undefined && num > c.max) throw new ErrorNegocio(`«${c.label}» debe ser menor o igual a ${c.max}.`);
      return num;
    }
    case 'date':
      if (!esFecha(v)) throw new ErrorNegocio(`«${c.label}» no es una fecha válida.`);
      return v;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ErrorNegocio(`«${c.label}» no es un correo válido.`);
      return v.toLowerCase();
    case 'tel':
      if (!/^[0-9+()\-\s]{5,30}$/.test(v)) throw new ErrorNegocio(`«${c.label}» no es un teléfono válido.`);
      return v;
    case 'select':
      if (c.options && !c.options.includes(v)) throw new ErrorNegocio(`Valor no permitido en «${c.label}».`);
      return v;
    case 'ref': {
      const id = Number(v);
      const tabla = entidad(c.ref!).tabla;
      if (!Number.isInteger(id) || !ctx.db.get(`SELECT 1 FROM ${tabla} WHERE id = ? AND eliminado_en IS NULL`, [id])) {
        throw new ErrorNegocio(`El valor de «${c.label}» no existe o fue eliminado.`);
      }
      return id;
    }
    default:
      return v;
  }
}

/** Reglas de negocio propias de cada entidad (se ejecutan antes de guardar). */
function validacionesExtra(ctx: Contexto, n: NombreEntidad, d: Record<string, any>, id?: number): void {
  const db = ctx.db;
  if ('fecha_inicio' in d && 'fecha_fin' in d && d.fecha_inicio && d.fecha_fin && d.fecha_fin < d.fecha_inicio) {
    throw new ErrorNegocio('La fecha de finalización no puede ser anterior a la fecha de inicio.');
  }
  if (n === 'periodos' || n === 'cursillos' || n === 'docentes' || n === 'asignaturas' || n === 'estudiantes') {
    for (const k of ['codigo', 'identificacion']) if (typeof d[k] === 'string') d[k] = d[k].toUpperCase().replace(/\s/g, '');
  }
  if (n === 'estudiantes' || n === 'docentes') {
    if (!/^[A-Z0-9-]{3,20}$/.test(d.identificacion)) throw new ErrorNegocio('La identificación solo admite números, letras y guiones (3 a 20 caracteres).');
    if (d.fecha_nacimiento && d.fecha_nacimiento > hoy()) throw new ErrorNegocio('La fecha de nacimiento no puede ser futura.');
  }
  if (n === 'cursillos') {
    const p = db.get('SELECT * FROM periodos WHERE id = ?', [d.periodo_id]);
    if (p && (d.fecha_inicio < p.fecha_inicio || d.fecha_fin > p.fecha_fin)) {
      throw new ErrorNegocio(`Las fechas del cursillo deben estar dentro del periodo «${p.nombre}» (${p.fecha_inicio} a ${p.fecha_fin}).`);
    }
    if (id) {
      const fuera = db.valor<number>(
        'SELECT count(*) FROM horarios WHERE cursillo_id = ? AND eliminado_en IS NULL AND (fecha < ? OR fecha > ?)', [id, d.fecha_inicio, d.fecha_fin],
      );
      if (fuera) throw new ErrorNegocio(`Hay ${fuera} clase(s) programada(s) fuera de las nuevas fechas. Reprográmelas primero.`);
    }
  }
  if (n === 'asignaturas' && id) {
    const ant = db.get('SELECT cursillo_id FROM asignaturas WHERE id = ?', [id]);
    if (ant && ant.cursillo_id !== d.cursillo_id && db.valor<number>('SELECT count(*) FROM horarios WHERE asignatura_id = ? AND eliminado_en IS NULL', [id])) {
      throw new ErrorNegocio('No se puede cambiar el cursillo de una asignatura que ya tiene clases programadas.');
    }
  }
  if (n === 'grupos' && id && d.cupo) {
    const n_ = db.valor<number>("SELECT count(*) FROM matriculas WHERE grupo_id = ? AND eliminado_en IS NULL AND estado = 'Activa'", [id]);
    if (n_ > d.cupo) throw new ErrorNegocio(`El grupo ya tiene ${n_} estudiantes activos; el cupo no puede ser menor.`);
  }
  if (n === 'matriculas') {
    const c = db.get('SELECT * FROM cursillos WHERE id = ?', [d.cursillo_id]);
    if (!id && c.estado !== 'Activo') throw new ErrorNegocio(`No se puede matricular en un cursillo ${c.estado.toLowerCase()}.`);
    if (d.grupo_id) {
      const g = db.get('SELECT * FROM grupos WHERE id = ?', [d.grupo_id]);
      if (g.cursillo_id !== d.cursillo_id) throw new ErrorNegocio('El grupo seleccionado no pertenece al cursillo.');
      if (g.cupo && d.estado === 'Activa') {
        const ocupados = db.valor<number>(
          "SELECT count(*) FROM matriculas WHERE grupo_id = ? AND eliminado_en IS NULL AND estado = 'Activa' AND id <> ?", [d.grupo_id, id ?? 0],
        );
        if (ocupados >= g.cupo) throw new ErrorNegocio(`El grupo «${g.nombre}» alcanzó su cupo máximo (${g.cupo}).`);
      }
    }
  }
}

/** Acciones posteriores a guardar (dentro de la misma transacción). */
function despuesDeGuardar(ctx: Contexto, n: NombreEntidad, id: number, d: Record<string, any>, nuevo: boolean, anterior?: any): void {
  const db = ctx.db;
  if (n === 'matriculas' && (nuevo || anterior?.cursillo_id !== d.cursillo_id)) {
    // Por defecto el estudiante cursa todas las asignaturas del cursillo.
    db.run('DELETE FROM matricula_asignaturas WHERE matricula_id = ?', [id]);
    db.run(
      'INSERT INTO matricula_asignaturas (matricula_id, asignatura_id) SELECT ?, id FROM asignaturas WHERE cursillo_id = ? AND eliminado_en IS NULL',
      [id, d.cursillo_id],
    );
  }
  if (n === 'asignaturas' && nuevo) {
    db.run(
      `INSERT OR IGNORE INTO matricula_asignaturas (matricula_id, asignatura_id)
       SELECT id, ? FROM matriculas WHERE cursillo_id = ? AND eliminado_en IS NULL AND estado = 'Activa'`,
      [id, d.cursillo_id],
    );
  }
}

export function guardar(ctx: Contexto, nombre: string, datos: Record<string, unknown>): number {
  const n = assertEntidad(nombre);
  const e = entidad(n);
  requerirPermiso(ctx, e.modulo, 'editar');
  const id = datos.id ? Number(datos.id) : undefined;
  const anterior = id ? ctx.db.get(`SELECT * FROM ${e.tabla} WHERE id = ? AND eliminado_en IS NULL`, [id]) : undefined;
  if (id && !anterior) throw new ErrorNegocio('El registro ya no existe (pudo ser eliminado).');

  const d: Record<string, any> = {};
  for (const c of e.campos) d[c.name] = convertir(c, datos[c.name], ctx);
  validacionesExtra(ctx, n, d, id);

  for (const u of e.unicos) {
    const dup = ctx.db.get(
      `SELECT id FROM ${e.tabla} WHERE ${u.campos.map((c) => `${c} = ?`).join(' AND ')} AND eliminado_en IS NULL AND id <> ?`,
      [...u.campos.map((c) => d[c]), id ?? 0],
    );
    if (dup) throw new ErrorNegocio(u.mensaje);
  }

  return ctx.db.tx(() => {
    let nuevoId: number;
    if (id) {
      ctx.db.actualizar(e.tabla, id, d);
      nuevoId = id;
    } else {
      nuevoId = ctx.db.insertar(e.tabla, d);
    }
    despuesDeGuardar(ctx, n, nuevoId, d, !id, anterior);
    auditar(ctx, id ? `Editó ${e.singular.toLowerCase()}` : `Creó ${e.singular.toLowerCase()}`, e.tabla, nuevoId, resumen(d));
    return nuevoId;
  });
}

const resumen = (d: Record<string, any>) =>
  Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== null && !['descripcion', 'observaciones'].includes(k)));

/** Envía un registro a la papelera, si nada depende de él. */
export function eliminar(ctx: Contexto, nombre: string, id: number): void {
  const n = assertEntidad(nombre);
  const e = entidad(n);
  requerirPermiso(ctx, e.modulo, 'eliminar');
  const reg = ctx.db.get(`SELECT * FROM ${e.tabla} WHERE id = ? AND eliminado_en IS NULL`, [id]);
  if (!reg) throw new ErrorNegocio('El registro no existe o ya fue eliminado.');
  const bloqueos: string[] = [];
  for (const dep of e.dependientes) {
    const cnt = ctx.db.valor<number>(
      `SELECT count(*) FROM ${dep.tabla} WHERE ${dep.fk} = ?${dep.logico ? ' AND eliminado_en IS NULL' : ''}${dep.tabla === 'certificados' ? ' AND anulado = 0' : ''}`,
      [id],
    );
    if (cnt) bloqueos.push(`${cnt} ${dep.etiqueta}`);
  }
  if (bloqueos.length) {
    throw new ErrorNegocio(`No se puede eliminar: tiene ${bloqueos.join(', ')} asociados. Elimine o reasigne esos registros primero.`);
  }
  ctx.db.tx(() => {
    ctx.db.run(`UPDATE ${e.tabla} SET eliminado_en = datetime('now','localtime') WHERE id = ?`, [id]);
    if (n === 'estudiantes') {
      // Las matrículas del estudiante van con él a la papelera.
      ctx.db.run("UPDATE matriculas SET eliminado_en = datetime('now','localtime') WHERE estudiante_id = ? AND eliminado_en IS NULL", [id]);
    }
    auditar(ctx, `Envió a la papelera: ${e.singular.toLowerCase()}`, e.tabla, id);
  });
}

// ---------------------------------------------------------------- papelera

const ETIQUETA_PAPELERA: Record<(typeof TABLAS_PAPELERA)[number], string> = {
  periodos: "codigo || ' – ' || nombre", cursillos: "codigo || ' – ' || nombre", docentes: "nombres || ' ' || apellidos",
  asignaturas: "codigo || ' – ' || nombre", grupos: 'nombre', estudiantes: "identificacion || ' – ' || nombres || ' ' || apellidos",
  matriculas: "'Matrícula #' || id", horarios: "fecha || ' ' || hora_inicio", tematicas: "unidad || ': ' || tema",
  materiales: 'titulo', usuarios: 'usuario', planeaciones: "'Planeación #' || id",
};

export function papelera(ctx: Contexto) {
  requerirPermiso(ctx, 'configuracion', 'ver');
  return ctx.db.all(
    TABLAS_PAPELERA.map((t) => `SELECT '${t}' AS tabla, id, ${ETIQUETA_PAPELERA[t]} AS descripcion, eliminado_en FROM ${t} WHERE eliminado_en IS NOT NULL`)
      .join(' UNION ALL ') + ' ORDER BY eliminado_en DESC',
  );
}

const assertTablaPapelera = (t: string) => {
  if (!(TABLAS_PAPELERA as readonly string[]).includes(t)) throw new ErrorNegocio('Tabla no válida.');
};

export function restaurar(ctx: Contexto, tabla: string, id: number): void {
  requerirPermiso(ctx, 'configuracion', 'editar');
  assertTablaPapelera(tabla);
  try {
    ctx.db.tx(() => {
      ctx.db.run(`UPDATE ${tabla} SET eliminado_en = NULL WHERE id = ?`, [id]);
      if (tabla === 'estudiantes') {
        ctx.db.run(
          `UPDATE matriculas SET eliminado_en = NULL WHERE estudiante_id = ? AND eliminado_en IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM matriculas m2 WHERE m2.estudiante_id = matriculas.estudiante_id AND m2.cursillo_id = matriculas.cursillo_id AND m2.eliminado_en IS NULL)`,
          [id],
        );
      }
    });
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('No se puede restaurar: ya existe un registro activo con los mismos datos únicos.');
    throw e;
  }
  auditar(ctx, 'Restauró desde la papelera', tabla, id);
}

/** Eliminación definitiva (solo superadministrador). */
export function purgar(ctx: Contexto, tabla: string, id: number): void {
  const s = requerirPermiso(ctx, 'configuracion', 'eliminar');
  if (s.rol !== 'superadmin') throw new ErrorNegocio('Solo el superadministrador puede eliminar definitivamente.');
  assertTablaPapelera(tabla);
  try {
    ctx.db.run(`DELETE FROM ${tabla} WHERE id = ? AND eliminado_en IS NOT NULL`, [id]);
  } catch (e: any) {
    if (String(e.message).includes('FOREIGN KEY')) {
      throw new ErrorNegocio('No se puede eliminar definitivamente: otros registros (posiblemente históricos) lo referencian.');
    }
    throw e;
  }
  auditar(ctx, 'Eliminó definitivamente', tabla, id);
}
