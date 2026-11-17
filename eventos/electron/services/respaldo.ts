/** Copias de seguridad: base de datos + fotos de eventos + imágenes institucionales. */
import fs from 'node:fs';
import path from 'node:path';
import { Db } from '../db/connection';
import { auditar, ErrorNegocio, requerirAdmin, requerirEdicion, requerirSesion, type Contexto, type Rutas } from './comun';
import { escribirConfig, leerConfig } from './config';

const sello = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

export function crear(ctx: Contexto, tipo: 'manual' | 'automatico' | 'previo-restauracion', base = ctx.rutas.respaldos) {
  if (tipo === 'manual') requerirEdicion(ctx);
  const dir = path.join(base, `respaldo-${sello()}-${tipo}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meif-eventos.sqlite'), Buffer.from(ctx.db.exportar()));
  for (const [o, d] of [[ctx.rutas.banners, 'banners'], [ctx.rutas.imagenes, 'imagenes']]) if (fs.existsSync(o)) fs.cpSync(o, path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'respaldo.json'), JSON.stringify({ aplicacion: 'MEIF Eventos', fecha: new Date().toISOString(), tipo }, null, 2));
  if (tipo === 'automatico') escribirConfig(ctx.db, 'ultimo_respaldo', new Date().toISOString());
  if (ctx.sesion) auditar(ctx, `Creó copia de seguridad (${tipo})`, dir);
  if (base === ctx.rutas.respaldos) {
    const autos = fs.readdirSync(base).filter((n) => n.includes('-automatico')).sort().reverse();
    for (const n of autos.slice(15)) fs.rmSync(path.join(base, n), { recursive: true, force: true });
  }
  return dir;
}

export function automatico(ctx: Contexto) {
  const c = leerConfig(ctx.db);
  if (c.respaldo_automatico !== '1') return;
  const u = Date.parse(c.ultimo_respaldo ?? '');
  if (Number.isFinite(u) && Date.now() - u < 20 * 3600 * 1000) return;
  crear(ctx, 'automatico');
}

export function listar(ctx: Contexto) {
  requerirSesion(ctx);
  if (!fs.existsSync(ctx.rutas.respaldos)) return [];
  return fs.readdirSync(ctx.rutas.respaldos).filter((n) => fs.existsSync(path.join(ctx.rutas.respaldos, n, 'meif-eventos.sqlite')))
    .sort().reverse().map((n) => ({ nombre: n, ruta: path.join(ctx.rutas.respaldos, n), fecha: fs.statSync(path.join(ctx.rutas.respaldos, n)).mtime.toISOString() }));
}

export async function validar(ctx: Contexto, ruta: string) {
  requerirAdmin(ctx);
  const dir = fs.statSync(ruta).isDirectory() ? ruta : null;
  const db = dir ? path.join(dir, 'meif-eventos.sqlite') : ruta;
  if (!fs.existsSync(db)) throw new ErrorNegocio('No se encontró la base de datos en el respaldo.');
  try {
    const v = await Db.validarArchivo(db, ['eventos', 'participantes', 'certificados', 'usuarios']);
    if (!v.ok) throw new ErrorNegocio(v.mensaje);
  } catch (e) {
    if (e instanceof ErrorNegocio) throw e;
    throw new ErrorNegocio('El archivo no es una base de datos válida.');
  }
  return { db, dir };
}

export function aplicar(origen: { db: string; dir: string | null }, r: Rutas) {
  fs.copyFileSync(origen.db, r.archivoDb);
  if (!origen.dir) return;
  for (const [sub, destino] of [['banners', r.banners], ['imagenes', r.imagenes]]) {
    const o = path.join(origen.dir, sub);
    if (fs.existsSync(o)) { fs.rmSync(destino, { recursive: true, force: true }); fs.cpSync(o, destino, { recursive: true }); }
  }
}
