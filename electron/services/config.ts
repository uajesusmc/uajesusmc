/** Configuración institucional (nombre, firmas, diseño del certificado, respaldos). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_POR_DEFECTO } from '../../shared/constantes';
import { auditar, ErrorNegocio, requerirPermiso, type Contexto } from './comun';
import type { Db } from '../db/connection';

/** Claves internas que nunca se envían a la interfaz. */
const PRIVADAS = new Set(['secreto_certificados']);

export function leerConfig(db: Db): Record<string, string> {
  const filas = db.all<{ clave: string; valor: string }>('SELECT clave, valor FROM configuracion');
  const out = { ...CONFIG_POR_DEFECTO };
  for (const f of filas) out[f.clave] = f.valor ?? '';
  return out;
}

export function configPublica(ctx: Contexto): Record<string, string> {
  const c = leerConfig(ctx.db);
  for (const k of PRIVADAS) delete c[k];
  return c;
}

export function escribirConfig(db: Db, clave: string, valor: string): void {
  db.run('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', [clave, valor]);
}

export function guardarConfig(ctx: Contexto, valores: Record<string, string>): void {
  requerirPermiso(ctx, 'configuracion', 'editar');
  ctx.db.tx(() => {
    for (const [k, v] of Object.entries(valores)) {
      if (PRIVADAS.has(k) || k.startsWith('img_')) continue;
      if (!(k in CONFIG_POR_DEFECTO)) throw new ErrorNegocio(`Parámetro de configuración desconocido: ${k}`);
      escribirConfig(ctx.db, k, String(v ?? ''));
    }
  });
  auditar(ctx, 'Actualizó la configuración', 'configuracion', null, Object.keys(valores));
}

/** Secreto HMAC con el que se firman los códigos QR de los certificados. */
export function secretoCertificados(db: Db): string {
  let s = db.valor<string>("SELECT valor FROM configuracion WHERE clave = 'secreto_certificados'");
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    escribirConfig(db, 'secreto_certificados', s);
  }
  return s;
}

/** Imágenes institucionales (logo, firmas) guardadas en la carpeta de datos. */
export const IMAGENES = ['logo', 'firma_director', 'firma_coordinador'] as const;
export type Imagen = (typeof IMAGENES)[number];

export function rutaImagen(ctx: Contexto, img: Imagen): string | null {
  const nombre = leerConfig(ctx.db)[`img_${img}`];
  if (!nombre) return null;
  const p = path.join(ctx.rutas.datos, 'imagenes', nombre);
  return fs.existsSync(p) ? p : null;
}

export function guardarImagen(ctx: Contexto, img: Imagen, origen: string | null): void {
  requerirPermiso(ctx, 'configuracion', 'editar');
  if (!IMAGENES.includes(img)) throw new ErrorNegocio('Imagen desconocida.');
  if (origen === null) {
    escribirConfig(ctx.db, `img_${img}`, '');
    auditar(ctx, `Quitó la imagen ${img}`, 'configuracion');
    return;
  }
  const ext = path.extname(origen).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) throw new ErrorNegocio('Use una imagen PNG o JPG.');
  if (fs.statSync(origen).size > 5 * 1024 * 1024) throw new ErrorNegocio('La imagen no debe superar 5 MB.');
  const dir = path.join(ctx.rutas.datos, 'imagenes');
  fs.mkdirSync(dir, { recursive: true });
  const nombre = `${img}-${Date.now()}${ext}`;
  fs.copyFileSync(origen, path.join(dir, nombre));
  escribirConfig(ctx.db, `img_${img}`, nombre);
  auditar(ctx, `Actualizó la imagen ${img}`, 'configuracion');
}

/** Devuelve la imagen como data URL para mostrarla en la interfaz. */
export function imagenDataUrl(ctx: Contexto, img: Imagen): string | null {
  const p = rutaImagen(ctx, img);
  if (!p) return null;
  const mime = p.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}
