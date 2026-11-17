/** Eventos, ponentes, participantes e inscripciones (incluye importación desde Excel). */
import ExcelJS from 'exceljs';
import { MODELOS, type Campo, type NombreModelo } from '../../shared/modelos';
import { auditar, ErrorNegocio, esFecha, fechaISO, hoy, limpiar, requerirEdicion, requerirSesion, type Contexto } from './comun';

const CONSULTAS: Record<NombreModelo, string> = {
  eventos: `SELECT t.*, CASE WHEN t.foto IS NULL THEN 0 ELSE 1 END AS tiene_foto,
              (SELECT count(*) FROM inscripciones i WHERE i.evento_id = t.id AND i.estado = 'Inscrito') AS inscritos,
              (SELECT count(*) FROM actividades a WHERE a.evento_id = t.id AND a.eliminado_en IS NULL) AS actividades,
              (SELECT count(*) FROM certificados c WHERE c.evento_id = t.id AND c.anulado = 0) AS certificados
            FROM eventos t`,
  ponentes: `SELECT t.*, t.nombres || ' ' || t.apellidos AS nombre,
              (SELECT count(*) FROM actividades a WHERE a.ponente_id = t.id AND a.eliminado_en IS NULL) AS actividades
            FROM ponentes t`,
  participantes: `SELECT t.*, (SELECT count(*) FROM inscripciones i WHERE i.participante_id = t.id AND i.estado = 'Inscrito') AS eventos
            FROM participantes t`,
};
const BUSQUEDA: Record<NombreModelo, string[]> = {
  eventos: ['t.nombre', 't.tipo', 't.lugar'],
  ponentes: ['t.identificacion', 't.nombres', 't.apellidos', 't.area'],
  participantes: ['t.identificacion', 't.nombres', 't.apellidos', "t.nombres || ' ' || t.apellidos", 't.institucion'],
};
const ORDEN: Record<NombreModelo, string> = { eventos: 't.fecha_inicio DESC', ponentes: 't.apellidos, t.nombres', participantes: 't.apellidos, t.nombres' };

const modelo = (n: string): NombreModelo => {
  if (!(n in MODELOS)) throw new ErrorNegocio('Tipo de registro desconocido.');
  return n as NombreModelo;
};

export function listar(ctx: Contexto, nombre: string, f: { busqueda?: string; anio?: number; estado?: string; eventoId?: number } = {}) {
  requerirSesion(ctx);
  const n = modelo(nombre);
  const w = ['t.eliminado_en IS NULL'];
  const p: any[] = [];
  const t = limpiar(f.busqueda);
  if (t) { w.push(`(${BUSQUEDA[n].map((c) => `${c} LIKE ?`).join(' OR ')})`); BUSQUEDA[n].forEach(() => p.push(`%${t}%`)); }
  if (n === 'eventos' && f.anio) { w.push('t.anio = ?'); p.push(f.anio); }
  if (n === 'eventos' && f.estado) { w.push('t.estado = ?'); p.push(f.estado); }
  return ctx.db.all(`${CONSULTAS[n]} WHERE ${w.join(' AND ')} ORDER BY ${ORDEN[n]}`, p);
}

export function obtener(ctx: Contexto, nombre: string, id: number) {
  requerirSesion(ctx);
  const n = modelo(nombre);
  const r = ctx.db.get(`${CONSULTAS[n]} WHERE t.id = ? AND t.eliminado_en IS NULL`, [id]);
  if (!r) throw new ErrorNegocio('Registro no encontrado.');
  return r;
}

export function anios(ctx: Contexto): number[] {
  requerirSesion(ctx);
  return ctx.db.all('SELECT DISTINCT anio FROM eventos WHERE eliminado_en IS NULL ORDER BY anio DESC').map((r) => r.anio);
}

function convertir(c: Campo, v: unknown): string | number | null {
  const s = limpiar(v);
  if (s === null) { if (c.required) throw new ErrorNegocio(`El campo «${c.label}» es obligatorio.`); return null; }
  if (c.maxLength && s.length > c.maxLength) throw new ErrorNegocio(`«${c.label}» admite máximo ${c.maxLength} caracteres.`);
  switch (c.type) {
    case 'number': {
      const x = Number(s.replace(',', '.'));
      if (!Number.isFinite(x)) throw new ErrorNegocio(`«${c.label}» debe ser un número.`);
      if ((c.min !== undefined && x < c.min) || (c.max !== undefined && x > c.max)) throw new ErrorNegocio(`«${c.label}» debe estar entre ${c.min} y ${c.max}.`);
      return x;
    }
    case 'date': if (!esFecha(s)) throw new ErrorNegocio(`«${c.label}» no es una fecha válida.`); return s;
    case 'email': if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ErrorNegocio(`«${c.label}» no es un correo válido.`); return s.toLowerCase();
    case 'tel': if (!/^[0-9+()\-\s]{5,30}$/.test(s)) throw new ErrorNegocio(`«${c.label}» no es un teléfono válido.`); return s;
    case 'select': if (c.options && !c.options.includes(s)) throw new ErrorNegocio(`Valor no permitido en «${c.label}».`); return s;
    default: return s;
  }
}

export function guardar(ctx: Contexto, nombre: string, datos: Record<string, unknown>): number {
  requerirEdicion(ctx);
  const n = modelo(nombre);
  const m = MODELOS[n];
  const id = datos.id ? Number(datos.id) : undefined;
  if (id && !ctx.db.get(`SELECT 1 FROM ${n} WHERE id = ? AND eliminado_en IS NULL`, [id])) throw new ErrorNegocio('El registro ya no existe.');
  const d: Record<string, any> = {};
  for (const c of m.campos) d[c.name] = convertir(c, datos[c.name]);
  if (m.unico) {
    d[m.unico] = String(d[m.unico]).toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z0-9-]{3,20}$/.test(d[m.unico])) throw new ErrorNegocio('La identificación solo admite números, letras y guiones (3 a 20 caracteres).');
    if (ctx.db.get(`SELECT 1 FROM ${n} WHERE ${m.unico} = ? AND eliminado_en IS NULL AND id <> ?`, [d[m.unico], id ?? 0])) {
      throw new ErrorNegocio(`Ya existe un ${m.singular.toLowerCase()} con esa identificación.`);
    }
  }
  if (n === 'eventos') {
    if (d.fecha_fin < d.fecha_inicio) throw new ErrorNegocio('La fecha de finalización no puede ser anterior a la de inicio.');
    d.anio = Number(d.fecha_inicio.slice(0, 4));
    if (id) {
      const fuera = ctx.db.valor<number>('SELECT count(*) FROM actividades WHERE evento_id = ? AND eliminado_en IS NULL AND (fecha < ? OR fecha > ?)', [id, d.fecha_inicio, d.fecha_fin]);
      if (fuera) throw new ErrorNegocio(`Hay ${fuera} actividad(es) de la agenda fuera de las nuevas fechas. Ajústelas primero.`);
      const inscritos = ctx.db.valor<number>("SELECT count(*) FROM inscripciones WHERE evento_id = ? AND estado = 'Inscrito'", [id]);
      if (d.cupo && inscritos > d.cupo) throw new ErrorNegocio(`El evento ya tiene ${inscritos} inscritos; el cupo no puede ser menor.`);
    }
  }
  const nuevoId = id ?? 0;
  if (id) ctx.db.actualizar(n, id, d);
  const r = id ? nuevoId : ctx.db.insertar(n, d);
  auditar(ctx, `${id ? 'Editó' : 'Creó'} ${m.singular.toLowerCase()}`, { id: r, nombre: d.nombre ?? `${d.nombres} ${d.apellidos}` });
  return r;
}

export function eliminar(ctx: Contexto, nombre: string, id: number) {
  requerirEdicion(ctx);
  const n = modelo(nombre);
  const deps: [string, string][] = n === 'eventos'
    ? [["SELECT count(*) FROM certificados WHERE evento_id = ? AND anulado = 0", 'certificados emitidos']]
    : n === 'ponentes'
      ? [['SELECT count(*) FROM actividades WHERE ponente_id = ? AND eliminado_en IS NULL', 'actividades en la agenda']]
      : [['SELECT count(*) FROM certificados WHERE participante_id = ? AND anulado = 0', 'certificados emitidos']];
  for (const [sql, txt] of deps) {
    const c = ctx.db.valor<number>(sql, [id]);
    if (c) throw new ErrorNegocio(`No se puede eliminar: tiene ${c} ${txt}.`);
  }
  ctx.db.run(`UPDATE ${n} SET eliminado_en = datetime('now','localtime') WHERE id = ?`, [id]);
  auditar(ctx, `Eliminó ${MODELOS[n].singular.toLowerCase()} (papelera)`, id);
}

export function papelera(ctx: Contexto) {
  requerirSesion(ctx);
  return ctx.db.all(
    `SELECT 'eventos' AS tabla, id, nombre AS descripcion, eliminado_en FROM eventos WHERE eliminado_en IS NOT NULL
     UNION ALL SELECT 'ponentes', id, nombres || ' ' || apellidos, eliminado_en FROM ponentes WHERE eliminado_en IS NOT NULL
     UNION ALL SELECT 'participantes', id, identificacion || ' – ' || nombres || ' ' || apellidos, eliminado_en FROM participantes WHERE eliminado_en IS NOT NULL
     UNION ALL SELECT 'actividades', id, titulo || ' (' || fecha || ')', eliminado_en FROM actividades WHERE eliminado_en IS NOT NULL
     ORDER BY eliminado_en DESC`,
  );
}
export function restaurar(ctx: Contexto, tabla: string, id: number) {
  requerirEdicion(ctx);
  if (!['eventos', 'ponentes', 'participantes', 'actividades'].includes(tabla)) throw new ErrorNegocio('Tabla no válida.');
  try {
    ctx.db.run(`UPDATE ${tabla} SET eliminado_en = NULL WHERE id = ?`, [id]);
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('Ya existe un registro activo con la misma identificación.');
    throw e;
  }
  auditar(ctx, 'Restauró de la papelera', { tabla, id });
}

// ------------------------------------------------------------ inscripciones

export function inscritos(ctx: Contexto, eventoId: number) {
  requerirSesion(ctx);
  return ctx.db.all(
    `SELECT i.id, i.fecha, i.estado, p.id AS participante_id, p.tipo_documento, p.identificacion, p.nombres, p.apellidos,
            p.apellidos || ' ' || p.nombres AS nombre, p.institucion, p.grado, p.telefono, p.correo
     FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
     WHERE i.evento_id = ? AND p.eliminado_en IS NULL ORDER BY i.estado DESC, p.apellidos, p.nombres`, [eventoId],
  );
}

export function inscribir(ctx: Contexto, eventoId: number, participanteIds: number[]): { inscritos: number; omitidos: string[] } {
  requerirEdicion(ctx);
  const ev = ctx.db.get('SELECT * FROM eventos WHERE id = ? AND eliminado_en IS NULL', [eventoId]);
  if (!ev) throw new ErrorNegocio('Evento no encontrado.');
  if (ev.estado === 'Finalizado' || ev.estado === 'Cancelado') throw new ErrorNegocio(`El evento está ${ev.estado.toLowerCase()}; no admite inscripciones.`);
  let n = 0;
  const omitidos: string[] = [];
  ctx.db.tx(() => {
    for (const pid of participanteIds) {
      const p = ctx.db.get('SELECT * FROM participantes WHERE id = ? AND eliminado_en IS NULL', [pid]);
      if (!p) continue;
      const ya = ctx.db.get('SELECT * FROM inscripciones WHERE evento_id = ? AND participante_id = ?', [eventoId, pid]);
      if (ya?.estado === 'Inscrito') { omitidos.push(`${p.nombres} ${p.apellidos}: ya estaba inscrito.`); continue; }
      const total = ctx.db.valor<number>("SELECT count(*) FROM inscripciones WHERE evento_id = ? AND estado = 'Inscrito'", [eventoId]);
      if (ev.cupo && total >= ev.cupo) { omitidos.push(`${p.nombres} ${p.apellidos}: el evento alcanzó su cupo (${ev.cupo}).`); continue; }
      if (ya) ctx.db.run("UPDATE inscripciones SET estado = 'Inscrito', fecha = ? WHERE id = ?", [hoy(), ya.id]);
      else ctx.db.run('INSERT INTO inscripciones (evento_id, participante_id, fecha) VALUES (?, ?, ?)', [eventoId, pid, hoy()]);
      n++;
    }
    auditar(ctx, 'Inscribió participantes', { evento: ev.nombre, cantidad: n });
  });
  return { inscritos: n, omitidos };
}

export function cancelarInscripcion(ctx: Contexto, inscripcionId: number) {
  requerirEdicion(ctx);
  const i = ctx.db.get('SELECT * FROM inscripciones WHERE id = ?', [inscripcionId]);
  if (!i) throw new ErrorNegocio('Inscripción no encontrada.');
  if (ctx.db.get('SELECT 1 FROM certificados WHERE evento_id = ? AND participante_id = ? AND anulado = 0', [i.evento_id, i.participante_id])) {
    throw new ErrorNegocio('El participante ya tiene certificado de este evento; anúlelo antes de cancelar la inscripción.');
  }
  ctx.db.run("UPDATE inscripciones SET estado = 'Cancelado' WHERE id = ?", [inscripcionId]);
  auditar(ctx, 'Canceló inscripción', inscripcionId);
}

// --------------------------------------------------------- importación Excel

const ENCABEZADOS: Record<string, string> = {
  tipodocumento: 'tipo_documento', tipo: 'tipo_documento', identificacion: 'identificacion', documento: 'identificacion',
  numerodeidentificacion: 'identificacion', cedula: 'identificacion', nombres: 'nombres', nombre: 'nombres', apellidos: 'apellidos',
  apellido: 'apellidos', institucion: 'institucion', institucioneducativa: 'institucion', colegio: 'institucion', grado: 'grado',
  telefono: 'telefono', celular: 'telefono', correo: 'correo', correoelectronico: 'correo', email: 'correo',
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
function celda(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return fechaISO(v);
  if (typeof v === 'object') {
    if ('text' in v) return String((v as any).text);
    if ('result' in v) return celda((v as any).result);
    if ('richText' in v) return (v as any).richText.map((r: any) => r.text).join('');
  }
  return String(v);
}

/**
 * Importa participantes desde Excel y, si se indica, los inscribe en un evento.
 * Con `simular` valida todo y no guarda nada (vista previa). Nunca duplica identificaciones.
 */
export async function importar(ctx: Contexto, archivo: string, op: { eventoId?: number | null; simular: boolean }) {
  requerirEdicion(ctx);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.readFile(archivo); } catch { throw new ErrorNegocio('No se pudo leer el archivo. Use un libro de Excel (.xlsx).'); }
  const ws = wb.worksheets[0];
  if (!ws) throw new ErrorNegocio('El libro no tiene hojas.');
  const mapa: Record<number, string> = {};
  ws.getRow(1).eachCell((c, col) => { const k = ENCABEZADOS[norm(celda(c.value) ?? '')]; if (k) mapa[col] = k; });
  for (const r of ['identificacion', 'nombres', 'apellidos']) {
    if (!Object.values(mapa).includes(r)) throw new ErrorNegocio(`Falta la columna obligatoria «${r}» en la primera fila. Descargue la plantilla.`);
  }
  const filas: { fila: number; datos: Record<string, string | null> }[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const d: Record<string, string | null> = {};
    for (const [col, k] of Object.entries(mapa)) d[k] = limpiar(celda(row.getCell(Number(col)).value));
    if (Object.values(d).some(Boolean)) filas.push({ fila: n, datos: d });
  });
  if (filas.length > 5000) throw new ErrorNegocio('Importe máximo 5000 participantes por archivo.');

  const resultado: { fila: number; identificacion: string; nombre: string; estado: 'nuevo' | 'existente' | 'error'; mensaje: string }[] = [];
  let creados = 0;
  let inscritosN = 0;
  const vistos = new Set<string>();
  const ejecutar = () => {
    for (const { fila, datos } of filas) {
      const ident = (datos.identificacion ?? '').toUpperCase().replace(/\s/g, '');
      const nombre = `${datos.nombres ?? ''} ${datos.apellidos ?? ''}`.trim();
      try {
        if (vistos.has(ident)) throw new ErrorNegocio('Identificación repetida en el archivo.');
        vistos.add(ident);
        if (datos.grado && /^\d{1,2}$/.test(datos.grado)) datos.grado = `${datos.grado}°`;
        datos.tipo_documento = (datos.tipo_documento ?? 'TI').toUpperCase();
        let id = ctx.db.valor<number>('SELECT id FROM participantes WHERE identificacion = ? AND eliminado_en IS NULL', [ident]);
        const existente = !!id;
        ctx.db.tx(() => {
          if (!id) { id = guardar(ctx, 'participantes', { ...datos, identificacion: ident }); creados++; }
          if (op.eventoId) {
            const r = inscribir(ctx, op.eventoId, [id]);
            if (r.omitidos.length && !r.omitidos[0].includes('ya estaba')) throw new ErrorNegocio(r.omitidos[0]);
            inscritosN += r.inscritos;
          }
        });
        resultado.push({ fila, identificacion: ident, nombre, estado: existente ? 'existente' : 'nuevo', mensaje: existente ? 'Ya registrado: no se duplica' : 'Nuevo participante' });
      } catch (e: any) {
        if (!(e instanceof ErrorNegocio)) throw e;
        resultado.push({ fila, identificacion: ident, nombre, estado: 'error', mensaje: e.message });
      }
    }
  };
  if (op.simular) {
    const REV = new Error('simulacion');
    try { ctx.db.tx(() => { ejecutar(); throw REV; }); } catch (e) { if (e !== REV) throw e; }
  } else {
    ejecutar();
    auditar(ctx, 'Importó participantes desde Excel', { creados, inscritos: inscritosN });
  }
  return { filas: resultado, creados, inscritos: inscritosN, errores: resultado.filter((r) => r.estado === 'error').length };
}

export async function plantilla(destino: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Participantes');
  ws.columns = ['Tipo documento', 'Identificación', 'Nombres', 'Apellidos', 'Institución educativa', 'Grado', 'Teléfono', 'Correo']
    .map((h) => ({ header: h, width: h.length < 10 ? 14 : 26 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
  ws.getCell('B1').note = 'Obligatorio: número de documento sin puntos ni espacios.';
  ws.getCell('F1').note = 'Ej.: 10, 11, Egresado, Docente.';
  await wb.xlsx.writeFile(destino);
}
