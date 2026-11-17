/** Configuración institucional, imágenes (logo, firma) y banner con la foto inaugural. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_POR_DEFECTO } from '../../shared/modelos';
import type { Db } from '../db/connection';
import { auditar, ErrorNegocio, requerirEdicion, requerirSesion, type Contexto } from './comun';

export function leerConfig(db: Db): Record<string, string> {
  const c = { ...CONFIG_POR_DEFECTO };
  for (const f of db.all('SELECT clave, valor FROM configuracion')) c[f.clave] = f.valor ?? '';
  return c;
}
export function escribirConfig(db: Db, clave: string, valor: string) {
  db.run('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', [clave, valor]);
}
export function configPublica(ctx: Contexto) {
  requerirSesion(ctx);
  const c = leerConfig(ctx.db);
  delete c.secreto;
  return c;
}
export function guardarConfig(ctx: Contexto, valores: Record<string, string>) {
  requerirEdicion(ctx);
  ctx.db.tx(() => {
    for (const [k, v] of Object.entries(valores)) {
      if (!(k in CONFIG_POR_DEFECTO)) throw new ErrorNegocio(`Parámetro desconocido: ${k}`);
      escribirConfig(ctx.db, k, String(v ?? ''));
    }
  });
  auditar(ctx, 'Actualizó la configuración');
}
export function secreto(db: Db): string {
  let s = db.valor<string>("SELECT valor FROM configuracion WHERE clave = 'secreto'");
  if (!s) { s = crypto.randomBytes(32).toString('hex'); escribirConfig(db, 'secreto', s); }
  return s;
}

// ---------------------------------------------------------------- imágenes
const EXT = ['.png', '.jpg', '.jpeg'];
const MAX_IMAGEN = 15 * 1024 * 1024;

function copiarImagen(origen: string, dir: string, prefijo: string): string {
  const ext = path.extname(origen).toLowerCase();
  if (!EXT.includes(ext)) throw new ErrorNegocio('Use una imagen JPG o PNG.');
  if (fs.statSync(origen).size > MAX_IMAGEN) throw new ErrorNegocio('La imagen no debe superar 15 MB.');
  fs.mkdirSync(dir, { recursive: true });
  const nombre = `${prefijo}-${Date.now()}${ext}`;
  fs.copyFileSync(origen, path.join(dir, nombre));
  return nombre;
}
const dataUrl = (p: string) => `data:${p.endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(p).toString('base64')}`;

export const IMAGENES = ['logo', 'firma_director'] as const;
export type Imagen = (typeof IMAGENES)[number];

export function rutaImagen(ctx: Contexto, img: Imagen): string | null {
  const n = ctx.db.valor<string>('SELECT valor FROM configuracion WHERE clave = ?', [`img_${img}`]);
  const p = n ? path.join(ctx.rutas.imagenes, n) : '';
  return p && fs.existsSync(p) ? p : null;
}
export function guardarImagen(ctx: Contexto, img: Imagen, origen: string | null) {
  requerirEdicion(ctx);
  if (!IMAGENES.includes(img)) throw new ErrorNegocio('Imagen desconocida.');
  escribirConfig(ctx.db, `img_${img}`, origen ? copiarImagen(origen, ctx.rutas.imagenes, img) : '');
  auditar(ctx, origen ? `Cargó imagen ${img}` : `Quitó imagen ${img}`);
}
export function imagenes(ctx: Contexto) {
  requerirSesion(ctx);
  return Object.fromEntries(IMAGENES.map((i) => { const p = rutaImagen(ctx, i); return [i, p ? dataUrl(p) : null]; }));
}

// ----------------------------------------------------------------- banner

/** Guarda la foto inaugural de un evento. Si `comoBanner`, la deja como banner de la aplicación. */
export function guardarFotoEvento(ctx: Contexto, eventoId: number, origen: string | null, comoBanner = true) {
  requerirEdicion(ctx);
  const ev = ctx.db.get('SELECT * FROM eventos WHERE id = ? AND eliminado_en IS NULL', [eventoId]);
  if (!ev) throw new ErrorNegocio('Evento no encontrado.');
  const nombre = origen ? copiarImagen(origen, ctx.rutas.banners, `evento${eventoId}`) : null;
  ctx.db.tx(() => {
    ctx.db.actualizar('eventos', eventoId, { foto: nombre });
    if (nombre && comoBanner) escribirConfig(ctx.db, 'banner_evento_id', String(eventoId));
    if (!nombre && leerConfig(ctx.db).banner_evento_id === String(eventoId)) escribirConfig(ctx.db, 'banner_evento_id', '');
  });
  auditar(ctx, origen ? 'Actualizó la foto inaugural' : 'Quitó la foto inaugural', ev.nombre);
}

export function fijarBanner(ctx: Contexto, eventoId: number | null) {
  requerirEdicion(ctx);
  if (eventoId && !ctx.db.get('SELECT 1 FROM eventos WHERE id = ? AND foto IS NOT NULL AND eliminado_en IS NULL', [eventoId])) {
    throw new ErrorNegocio('Ese evento no tiene foto inaugural.');
  }
  escribirConfig(ctx.db, 'banner_evento_id', eventoId ? String(eventoId) : '');
  auditar(ctx, 'Cambió el banner', eventoId);
}

/**
 * Banner que muestra la aplicación: el evento elegido o, si no hay, el evento más
 * reciente que tenga foto inaugural.
 */
export function bannerActual(ctx: Contexto) {
  requerirSesion(ctx);
  const elegido = Number(leerConfig(ctx.db).banner_evento_id) || 0;
  const ev = ctx.db.get(
    `SELECT id, nombre, tipo, anio, fecha_inicio, fecha_fin, lugar, foto FROM eventos
     WHERE foto IS NOT NULL AND eliminado_en IS NULL ORDER BY (id = ?) DESC, fecha_inicio DESC LIMIT 1`, [elegido],
  );
  if (!ev) return null;
  const p = path.join(ctx.rutas.banners, ev.foto);
  if (!fs.existsSync(p)) return null;
  return { ...ev, imagen: dataUrl(p) };
}

export function fotoEvento(ctx: Contexto, eventoId: number): string | null {
  requerirSesion(ctx);
  const f = ctx.db.valor<string>('SELECT foto FROM eventos WHERE id = ?', [eventoId]);
  const p = f ? path.join(ctx.rutas.banners, f) : '';
  return p && fs.existsSync(p) ? dataUrl(p) : null;
}
