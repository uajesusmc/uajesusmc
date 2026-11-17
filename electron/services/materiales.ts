/** Biblioteca digital de material educativo. Los archivos se copian a la carpeta de datos. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TIPOS_MATERIAL } from '../../shared/constantes';
import { auditar, ErrorNegocio, esFecha, hoy, limpiar, requerirPermiso, type Contexto } from './comun';

export const EXTENSIONES_PERMITIDAS = [
  '.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.ppt', '.pptx', '.odp', '.xls', '.xlsx', '.ods', '.csv',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.zip', '.rar', '.mp4', '.mp3', '.ggb', '.py', '.ipynb',
];
const TAMANO_MAXIMO = 250 * 1024 * 1024;

export interface DatosMaterial {
  id?: number; titulo: string; tipo: string; descripcion?: string; cursillo_id?: number | null; asignatura_id?: number | null;
  tematica_id?: number | null; docente_id?: number | null; fecha_publicacion?: string;
}

function verificarPropietario(ctx: Contexto, docenteId: number | null) {
  const s = ctx.sesion!;
  if (s.rol === 'docente' && docenteId !== s.docenteId) throw new ErrorNegocio('Como docente solo puede gestionar el material que usted publicó.');
}

function validar(ctx: Contexto, d: DatosMaterial) {
  const titulo = limpiar(d.titulo);
  if (!titulo) throw new ErrorNegocio('El título es obligatorio.');
  if (!(TIPOS_MATERIAL as readonly string[]).includes(d.tipo)) throw new ErrorNegocio('Seleccione el tipo de material.');
  const fecha = limpiar(d.fecha_publicacion) ?? hoy();
  if (!esFecha(fecha)) throw new ErrorNegocio('Fecha de publicación inválida.');
  let cursillo = d.cursillo_id ? Number(d.cursillo_id) : null;
  const asignatura = d.asignatura_id ? Number(d.asignatura_id) : null;
  if (asignatura) {
    const a = ctx.db.get('SELECT cursillo_id FROM asignaturas WHERE id = ? AND eliminado_en IS NULL', [asignatura]);
    if (!a) throw new ErrorNegocio('La asignatura no existe.');
    if (cursillo && a.cursillo_id !== cursillo) throw new ErrorNegocio('La asignatura no pertenece al cursillo seleccionado.');
    cursillo = a.cursillo_id;
  }
  const tematica = d.tematica_id ? Number(d.tematica_id) : null;
  if (tematica) {
    const ok = ctx.db.get(
      'SELECT 1 FROM tematicas t JOIN planeaciones p ON p.id = t.planeacion_id WHERE t.id = ? AND p.asignatura_id = ?', [tematica, asignatura],
    );
    if (!ok) throw new ErrorNegocio('La unidad temática no pertenece a la asignatura.');
  }
  let docente = d.docente_id ? Number(d.docente_id) : null;
  if (ctx.sesion!.rol === 'docente') docente = ctx.sesion!.docenteId;
  return { titulo, tipo: d.tipo, descripcion: limpiar(d.descripcion), cursillo_id: cursillo, asignatura_id: asignatura, tematica_id: tematica, docente_id: docente, fecha_publicacion: fecha };
}

export function subir(ctx: Contexto, d: DatosMaterial, archivo: string): number {
  requerirPermiso(ctx, 'material', 'editar');
  const datos = validar(ctx, d);
  if (!archivo || !fs.existsSync(archivo)) throw new ErrorNegocio('Seleccione el archivo a cargar.');
  const ext = path.extname(archivo).toLowerCase();
  if (!EXTENSIONES_PERMITIDAS.includes(ext)) throw new ErrorNegocio(`Tipo de archivo no permitido (${ext || 'sin extensión'}).`);
  const tam = fs.statSync(archivo).size;
  if (tam > TAMANO_MAXIMO) throw new ErrorNegocio('El archivo supera el tamaño máximo de 250 MB.');
  const subdir = new Date().toISOString().slice(0, 7);
  const nombreDestino = `${crypto.randomUUID()}${ext}`;
  const relativa = path.join(subdir, nombreDestino);
  fs.mkdirSync(path.join(ctx.rutas.materiales, subdir), { recursive: true });
  fs.copyFileSync(archivo, path.join(ctx.rutas.materiales, relativa));
  try {
    const id = ctx.db.insertar('materiales', {
      ...datos, archivo_nombre: path.basename(archivo), archivo_ruta: relativa.split(path.sep).join('/'), archivo_tamano: tam,
    });
    auditar(ctx, 'Cargó material', 'materiales', id, datos.titulo);
    return id;
  } catch (e) {
    fs.rmSync(path.join(ctx.rutas.materiales, relativa), { force: true });
    throw e;
  }
}

export function actualizar(ctx: Contexto, d: DatosMaterial): void {
  requerirPermiso(ctx, 'material', 'editar');
  const actual = ctx.db.get('SELECT * FROM materiales WHERE id = ? AND eliminado_en IS NULL', [d.id]);
  if (!actual) throw new ErrorNegocio('Material no encontrado.');
  verificarPropietario(ctx, actual.docente_id);
  ctx.db.actualizar('materiales', d.id!, validar(ctx, d));
  auditar(ctx, 'Editó material', 'materiales', d.id);
}

export function eliminar(ctx: Contexto, id: number): void {
  requerirPermiso(ctx, 'material', 'eliminar');
  const actual = ctx.db.get('SELECT * FROM materiales WHERE id = ? AND eliminado_en IS NULL', [id]);
  if (!actual) throw new ErrorNegocio('Material no encontrado.');
  verificarPropietario(ctx, actual.docente_id);
  ctx.db.run("UPDATE materiales SET eliminado_en = datetime('now','localtime') WHERE id = ?", [id]);
  auditar(ctx, 'Eliminó material (papelera)', 'materiales', id);
}

export function listar(ctx: Contexto, f: { busqueda?: string; cursilloId?: number; asignaturaId?: number; tematicaId?: number; docenteId?: number; tipo?: string; desde?: string; hasta?: string } = {}) {
  requerirPermiso(ctx, 'material', 'ver');
  const w = ['m.eliminado_en IS NULL'];
  const p: any[] = [];
  const t = limpiar(f.busqueda);
  if (t) { w.push('(m.titulo LIKE ? OR m.descripcion LIKE ? OR m.archivo_nombre LIKE ?)'); p.push(`%${t}%`, `%${t}%`, `%${t}%`); }
  if (f.cursilloId) { w.push('m.cursillo_id = ?'); p.push(f.cursilloId); }
  if (f.asignaturaId) { w.push('m.asignatura_id = ?'); p.push(f.asignaturaId); }
  if (f.tematicaId) { w.push('m.tematica_id = ?'); p.push(f.tematicaId); }
  if (f.docenteId) { w.push('m.docente_id = ?'); p.push(f.docenteId); }
  if (f.tipo) { w.push('m.tipo = ?'); p.push(f.tipo); }
  if (f.desde) { w.push('m.fecha_publicacion >= ?'); p.push(f.desde); }
  if (f.hasta) { w.push('m.fecha_publicacion <= ?'); p.push(f.hasta); }
  return ctx.db.all(
    `SELECT m.*, c.nombre AS cursillo, a.nombre AS asignatura, t.unidad || ': ' || t.tema AS tematica,
            d.nombres || ' ' || d.apellidos AS docente
     FROM materiales m LEFT JOIN cursillos c ON c.id = m.cursillo_id LEFT JOIN asignaturas a ON a.id = m.asignatura_id
     LEFT JOIN tematicas t ON t.id = m.tematica_id LEFT JOIN docentes d ON d.id = m.docente_id
     WHERE ${w.join(' AND ')} ORDER BY m.fecha_publicacion DESC, m.id DESC`, p,
  );
}

/** Ruta absoluta del archivo (para abrirlo o copiarlo). */
export function rutaArchivo(ctx: Contexto, id: number): { ruta: string; nombre: string } {
  requerirPermiso(ctx, 'material', 'ver');
  const m = ctx.db.get('SELECT * FROM materiales WHERE id = ? AND eliminado_en IS NULL', [id]);
  if (!m) throw new ErrorNegocio('Material no encontrado.');
  const ruta = path.resolve(ctx.rutas.materiales, m.archivo_ruta);
  if (!ruta.startsWith(path.resolve(ctx.rutas.materiales))) throw new ErrorNegocio('Ruta de archivo inválida.');
  if (!fs.existsSync(ruta)) throw new ErrorNegocio('El archivo no se encuentra en la biblioteca. Restaure una copia de seguridad.');
  return { ruta, nombre: m.archivo_nombre };
}
