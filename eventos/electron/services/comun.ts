/** Tipos y utilidades comunes de los servicios. */
import type { Db } from '../db/connection';
import type { Firmante, Rol } from '../../shared/modelos';

export class ErrorNegocio extends Error {
  constructor(mensaje: string, public detalle?: unknown) { super(mensaje); this.name = 'ErrorNegocio'; }
}

export interface Sesion { id: number; usuario: string; nombre: string; rol: Rol; debeCambiarClave: boolean; firmante: Firmante | null }
export interface Rutas { datos: string; banners: string; imagenes: string; certificados: string; respaldos: string; archivoDb: string }
export interface Contexto { db: Db; sesion: Sesion | null; rutas: Rutas }

export function requerirSesion(ctx: Contexto): Sesion {
  if (!ctx.sesion) throw new ErrorNegocio('Debe iniciar sesión.');
  return ctx.sesion;
}
/** Organizadores y administradores pueden modificar; «Solo consulta» únicamente ve. */
export function requerirEdicion(ctx: Contexto): Sesion {
  const s = requerirSesion(ctx);
  if (s.rol === 'consulta') throw new ErrorNegocio('Su usuario es de solo consulta: no puede modificar información.');
  return s;
}
export function requerirAdmin(ctx: Contexto): Sesion {
  const s = requerirSesion(ctx);
  if (s.rol !== 'admin') throw new ErrorNegocio('Solo un administrador puede realizar esta acción.');
  return s;
}

export function auditar(ctx: Contexto, accion: string, detalle?: unknown): void {
  ctx.db.run('INSERT INTO auditoria (usuario, accion, detalle) VALUES (?, ?, ?)', [
    ctx.sesion?.usuario ?? 'sistema', accion, detalle === undefined ? null : typeof detalle === 'string' ? detalle : JSON.stringify(detalle),
  ]);
}

export function fechaISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const hoy = () => fechaISO(new Date());
export const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00'));
export const esHora = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const limpiar = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
};
export const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export function fechaLarga(f: string): string {
  const m = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [a, mm, d] = f.split('-').map(Number);
  return `${d} de ${m[mm - 1]} de ${a}`;
}
/** Duración en horas de la actividad con alias `a`. */
export const DURACION_SQL = "((strftime('%s','2000-01-01 ' || a.hora_fin) - strftime('%s','2000-01-01 ' || a.hora_inicio)) / 3600.0)";
/** Los recesos no cuentan como horas académicas ni para la asistencia. */
export const CUENTA_SQL = "a.tipo <> 'Receso'";
