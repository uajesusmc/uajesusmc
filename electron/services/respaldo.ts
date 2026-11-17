/**
 * Copias de seguridad y restauración.
 *
 * Cada copia es una carpeta con la base de datos (`meif.sqlite`), la biblioteca de
 * materiales, las imágenes institucionales y un `respaldo.json` descriptivo.
 * Los PDF de certificados no se copian porque se regeneran a partir de la base.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Db } from '../db/connection';
import { auditar, ErrorNegocio, requerirPermiso, type Contexto } from './comun';
import { escribirConfig, leerConfig } from './config';

const ARCHIVO_DB = 'meif.sqlite';
const sello = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

function copiarCarpeta(origen: string, destino: string) {
  if (fs.existsSync(origen)) fs.cpSync(origen, destino, { recursive: true });
}

export interface InfoRespaldo { nombre: string; ruta: string; fecha: string; tipo: string; tamano: number; version: number }

/** Crea una copia en `destinoBase` (por defecto, la carpeta de respaldos). */
export function crear(ctx: Contexto, tipo: 'manual' | 'automatico' | 'previo-restauracion', destinoBase?: string): InfoRespaldo {
  if (tipo === 'manual') requerirPermiso(ctx, 'configuracion', 'editar');
  const base = destinoBase ?? ctx.rutas.respaldos;
  const nombre = `respaldo-${sello()}-${tipo}${ctx.demo ? '-DEMO' : ''}`;
  const dir = path.join(base, nombre);
  fs.mkdirSync(dir, { recursive: true });
  ctx.db.guardar();
  fs.writeFileSync(path.join(dir, ARCHIVO_DB), Buffer.from(ctx.db.exportar()));
  copiarCarpeta(ctx.rutas.materiales, path.join(dir, 'materiales'));
  copiarCarpeta(path.join(ctx.rutas.datos, 'imagenes'), path.join(dir, 'imagenes'));
  const info = { aplicacion: 'MEIF - SABANALARGA', fecha: new Date().toISOString(), tipo, version: ctx.db.version, demo: ctx.demo };
  fs.writeFileSync(path.join(dir, 'respaldo.json'), JSON.stringify(info, null, 2));
  if (tipo === 'automatico') escribirConfig(ctx.db, 'ultimo_respaldo_automatico', new Date().toISOString());
  if (ctx.sesion) auditar(ctx, `Creó copia de seguridad (${tipo})`, 'respaldos', null, destinoBase ? dir : nombre);
  if (!destinoBase) rotar(ctx);
  return describir(dir)!;
}

function tamanoCarpeta(dir: string): number {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t += e.isDirectory() ? tamanoCarpeta(p) : fs.statSync(p).size;
  }
  return t;
}

function describir(dir: string): InfoRespaldo | null {
  const meta = path.join(dir, 'respaldo.json');
  if (!fs.existsSync(path.join(dir, ARCHIVO_DB))) return null;
  let info: any = {};
  try { info = JSON.parse(fs.readFileSync(meta, 'utf8')); } catch { /* sin metadatos */ }
  return {
    nombre: path.basename(dir), ruta: dir, fecha: info.fecha ?? fs.statSync(dir).mtime.toISOString(),
    tipo: info.tipo ?? 'desconocido', tamano: tamanoCarpeta(dir), version: info.version ?? 0,
  };
}

export function listar(ctx: Contexto): InfoRespaldo[] {
  requerirPermiso(ctx, 'configuracion', 'ver');
  if (!fs.existsSync(ctx.rutas.respaldos)) return [];
  return fs.readdirSync(ctx.rutas.respaldos)
    .map((n) => describir(path.join(ctx.rutas.respaldos, n)))
    .filter((x): x is InfoRespaldo => !!x)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Conserva solo las N copias automáticas más recientes. */
function rotar(ctx: Contexto) {
  const conservar = Math.max(3, Number(leerConfig(ctx.db).respaldos_conservar) || 15);
  if (!fs.existsSync(ctx.rutas.respaldos)) return;
  const automaticas = fs.readdirSync(ctx.rutas.respaldos).filter((n) => n.includes('-automatico')).sort().reverse();
  for (const n of automaticas.slice(conservar)) fs.rmSync(path.join(ctx.rutas.respaldos, n), { recursive: true, force: true });
}

/** Copia automática diaria (se llama al iniciar sesión y al cerrar la aplicación). */
export function automaticoSiCorresponde(ctx: Contexto): void {
  const cfg = leerConfig(ctx.db);
  if (cfg.respaldo_automatico !== '1') return;
  const ultimo = Date.parse(cfg.ultimo_respaldo_automatico ?? '');
  if (Number.isFinite(ultimo) && Date.now() - ultimo < 20 * 3600 * 1000) return;
  crear(ctx, 'automatico');
}

/**
 * Valida un respaldo (carpeta de respaldo o archivo .sqlite) y devuelve la ruta de la
 * base que contiene. La restauración efectiva la hace el proceso principal, que debe
 * cerrar la base abierta antes de reemplazar archivos.
 */
export async function validarOrigen(ruta: string): Promise<{ db: string; dir: string | null }> {
  let db = ruta;
  let dir: string | null = null;
  if (fs.existsSync(ruta) && fs.statSync(ruta).isDirectory()) {
    dir = ruta;
    db = path.join(ruta, ARCHIVO_DB);
  }
  if (!fs.existsSync(db)) throw new ErrorNegocio('No se encontró la base de datos en el respaldo seleccionado.');
  const v = await Db.validarArchivo(db);
  if (!v.ok) throw new ErrorNegocio(v.mensaje);
  return { db, dir };
}

/** Reemplaza los datos actuales por los del respaldo (la base debe estar cerrada). */
export function aplicarRestauracion(origen: { db: string; dir: string | null }, rutas: Contexto['rutas'], archivoDb: string): void {
  fs.copyFileSync(origen.db, archivoDb);
  if (origen.dir) {
    for (const [sub, destino] of [['materiales', rutas.materiales], ['imagenes', path.join(rutas.datos, 'imagenes')]] as const) {
      const o = path.join(origen.dir, sub);
      if (fs.existsSync(o)) {
        fs.rmSync(destino, { recursive: true, force: true });
        fs.cpSync(o, destino, { recursive: true });
      }
    }
  }
}
