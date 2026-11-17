/**
 * Firmas digitalizadas del Presidente y del Secretario de MEIF.
 *
 * - El administrador vincula un usuario a cada función (Usuarios › «Firma como»).
 * - Cada firmante sube su propia firma (imagen) y actualiza su nombre y cargo desde
 *   «Mi firma», sin importar su rol. Solo él o un administrador pueden cambiarla.
 * - La plataforma toma las firmas para los certificados y, si está activado, para el
 *   bloque de firmas de los documentos PDF.
 */
import { FIRMANTES, type Firmante } from '../../shared/modelos';
import { auditar, ErrorNegocio, limpiar, requerirSesion, type Contexto } from './comun';
import { escribirConfig, guardarImagen, leerConfig, rutaImagen } from './config';
import fs from 'node:fs';

const validar = (f: string): Firmante => {
  if (!(f in FIRMANTES)) throw new ErrorNegocio('Firmante no válido.');
  return f as Firmante;
};

/** Solo el usuario vinculado a esa firma o un administrador pueden modificarla. */
function puedeGestionar(ctx: Contexto, f: Firmante) {
  const s = requerirSesion(ctx);
  if (s.rol !== 'admin' && s.firmante !== f) {
    throw new ErrorNegocio(`Solo el ${FIRMANTES[f].toLowerCase()} (o un administrador) puede cambiar esta firma.`);
  }
  return s;
}

export function estado(ctx: Contexto) {
  const s = requerirSesion(ctx);
  const c = leerConfig(ctx.db);
  return (Object.keys(FIRMANTES) as Firmante[]).map((f) => {
    const usuario = ctx.db.get('SELECT id, nombre, usuario FROM usuarios WHERE firmante = ? AND eliminado_en IS NULL', [f]);
    const ruta = rutaImagen(ctx, `firma_${f}`);
    return {
      firmante: f, titulo: FIRMANTES[f], nombre: c[`${f}_nombre`] ?? '', cargo: c[`${f}_cargo`] ?? '',
      usuario: usuario ?? null,
      imagen: ruta ? `data:${ruta.endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(ruta).toString('base64')}` : null,
      actualizada_en: c[`firma_${f}_fecha`] || null, actualizada_por: c[`firma_${f}_por`] || null,
      puedeEditar: s.rol === 'admin' || s.firmante === f,
    };
  });
}

export function subir(ctx: Contexto, firmante: string, origen: string | null) {
  const f = validar(firmante);
  const s = puedeGestionar(ctx, f);
  ctx.db.tx(() => {
    guardarImagen(ctx, `firma_${f}`, origen, true);
    escribirConfig(ctx.db, `firma_${f}_fecha`, origen ? new Date().toISOString() : '');
    escribirConfig(ctx.db, `firma_${f}_por`, origen ? s.nombre : '');
  });
  auditar(ctx, origen ? `Cargó la firma del ${FIRMANTES[f].toLowerCase()}` : `Quitó la firma del ${FIRMANTES[f].toLowerCase()}`);
}

export function datos(ctx: Contexto, firmante: string, d: { nombre: string; cargo: string }) {
  const f = validar(firmante);
  puedeGestionar(ctx, f);
  const nombre = limpiar(d.nombre);
  if (!nombre) throw new ErrorNegocio('Escriba el nombre completo tal como debe aparecer en los documentos.');
  escribirConfig(ctx.db, `${f}_nombre`, nombre);
  escribirConfig(ctx.db, `${f}_cargo`, limpiar(d.cargo) ?? FIRMANTES[f]);
  auditar(ctx, `Actualizó los datos de firma del ${FIRMANTES[f].toLowerCase()}`, nombre);
}

/** Firmas que se imprimen: las que tienen nombre configurado. */
export function paraDocumentos(ctx: Contexto): { nombre: string; cargo: string; imagen: string | null }[] {
  const c = leerConfig(ctx.db);
  return (Object.keys(FIRMANTES) as Firmante[])
    .filter((f) => c[`${f}_nombre`])
    .map((f) => ({ nombre: c[`${f}_nombre`], cargo: c[`${f}_cargo`] || FIRMANTES[f], imagen: rutaImagen(ctx, `firma_${f}`) }));
}
