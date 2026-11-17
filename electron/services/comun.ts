/** Tipos y utilidades compartidas por todos los servicios del proceso principal. */
import type { Db } from '../db/connection';
import type { Accion, CodigoRol, Modulo } from '../../shared/constantes';

/** Error de regla de negocio: su mensaje se muestra tal cual al usuario. */
export class ErrorNegocio extends Error {
  constructor(mensaje: string, public detalle?: unknown) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}

export interface Permiso { ver: boolean; editar: boolean; eliminar: boolean }

export interface Sesion {
  id: number;
  usuario: string;
  nombre: string;
  rol: CodigoRol;
  rolNombre: string;
  docenteId: number | null;
  debeCambiarClave: boolean;
  permisos: Record<Modulo, Permiso>;
}

export interface Rutas {
  /** Carpeta de datos del usuario (AppData). */
  datos: string;
  materiales: string;
  certificados: string;
  respaldos: string;
  reportes: string;
}

export interface Contexto {
  db: Db;
  sesion: Sesion | null;
  rutas: Rutas;
  /** Base de demostración (se muestra un aviso permanente en la interfaz). */
  demo: boolean;
}

export function requerirSesion(ctx: Contexto): Sesion {
  if (!ctx.sesion) throw new ErrorNegocio('Debe iniciar sesión.');
  return ctx.sesion;
}

export function requerirPermiso(ctx: Contexto, modulo: Modulo, accion: Accion): Sesion {
  const s = requerirSesion(ctx);
  if (!s.permisos[modulo]?.[accion]) {
    const verbo = { ver: 'consultar', editar: 'modificar', eliminar: 'eliminar' }[accion];
    throw new ErrorNegocio(`Su rol (${s.rolNombre}) no tiene permiso para ${verbo} en este módulo.`);
  }
  return s;
}

/** Registra una acción en la bitácora de auditoría. */
export function auditar(ctx: Contexto, accion: string, entidad?: string, entidadId?: number | null, detalle?: unknown): void {
  ctx.db.run(
    'INSERT INTO auditoria (usuario_id, usuario, accion, entidad, entidad_id, detalle) VALUES (?, ?, ?, ?, ?, ?)',
    [
      ctx.sesion?.id ?? null, ctx.sesion?.usuario ?? 'sistema', accion, entidad ?? null, entidadId ?? null,
      detalle === undefined ? null : typeof detalle === 'string' ? detalle : JSON.stringify(detalle),
    ],
  );
}

export const hoy = (): string => fechaISO(new Date());

export function fechaISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const esFecha = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00'));

export const esHora = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha AAAA-MM-DD. */
export function diaSemana(fecha: string): number {
  const d = new Date(fecha + 'T12:00:00').getDay();
  return d === 0 ? 7 : d;
}

/** Duración en horas entre dos horas HH:MM. */
export function duracionHoras(inicio: string, fin: string): number {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return Math.round(((m(fin) - m(inicio)) / 60) * 100) / 100;
}

export function formatoFechaLarga(fecha: string): string {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [a, m, d] = fecha.split('-').map(Number);
  return `${d} de ${meses[m - 1]} de ${a}`;
}

export const limpiar = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
};

export const redondear = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;

/** Expresión SQL de la duración (horas) de una clase con alias `h`. */
export const DURACION_SQL = "((strftime('%s','2000-01-01 ' || h.hora_fin) - strftime('%s','2000-01-01 ' || h.hora_inicio)) / 3600.0)";
