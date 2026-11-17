/** Usuarios e inicio de sesión. */
import bcrypt from 'bcryptjs';
import { FIRMANTES, ROLES, type Firmante, type Rol } from '../../shared/modelos';
import { auditar, ErrorNegocio, limpiar, requerirAdmin, requerirSesion, type Contexto, type Sesion } from './comun';
import type { Db } from '../db/connection';

const intentos = new Map<string, { n: number; hasta: number }>();

export function validarClave(c: string) {
  if (typeof c !== 'string' || c.length < 8) throw new ErrorNegocio('La contraseña debe tener al menos 8 caracteres.');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) || !/\d/.test(c)) throw new ErrorNegocio('La contraseña debe combinar letras y números.');
}
const validarUsuario = (u: unknown) => {
  const v = limpiar(u)?.toLowerCase();
  if (!v || !/^[a-z0-9._-]{3,30}$/.test(v)) throw new ErrorNegocio('Usuario inválido: use de 3 a 30 letras, números, punto o guion.');
  return v;
};

export const hayUsuarios = (db: Db) => db.valor<number>('SELECT count(*) FROM usuarios WHERE eliminado_en IS NULL') > 0;

function sesionDe(db: Db, id: number): Sesion {
  const u = db.get('SELECT * FROM usuarios WHERE id = ?', [id]);
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, debeCambiarClave: !!u.debe_cambiar_clave, firmante: u.firmante ?? null };
}

export function crearPrimerAdministrador(ctx: Contexto, d: { usuario: string; nombre: string; clave: string }): Sesion {
  if (hayUsuarios(ctx.db)) throw new ErrorNegocio('El sistema ya fue configurado.');
  const usuario = validarUsuario(d.usuario);
  const nombre = limpiar(d.nombre);
  if (!nombre) throw new ErrorNegocio('Indique el nombre completo.');
  validarClave(d.clave);
  ctx.db.insertar('usuarios', { usuario, nombre, rol: 'admin', clave_hash: bcrypt.hashSync(d.clave, 10) });
  return iniciarSesion(ctx, usuario, d.clave);
}

export function iniciarSesion(ctx: Contexto, usuario: string, clave: string): Sesion {
  const k = String(usuario ?? '').trim().toLowerCase();
  const b = intentos.get(k);
  if (b && b.n >= 5 && Date.now() < b.hasta) throw new ErrorNegocio('Demasiados intentos fallidos. Espere un minuto.');
  const u = ctx.db.get('SELECT * FROM usuarios WHERE lower(usuario) = ? AND eliminado_en IS NULL', [k]);
  if (!u || !bcrypt.compareSync(String(clave ?? ''), u.clave_hash)) {
    intentos.set(k, { n: (b && Date.now() < b.hasta ? b.n : 0) + 1, hasta: Date.now() + 60_000 });
    throw new ErrorNegocio('Usuario o contraseña incorrectos.');
  }
  if (!u.activo) throw new ErrorNegocio('El usuario está inactivo.');
  intentos.delete(k);
  ctx.db.run("UPDATE usuarios SET ultimo_acceso = datetime('now','localtime') WHERE id = ?", [u.id]);
  ctx.sesion = sesionDe(ctx.db, u.id);
  auditar(ctx, 'Inició sesión');
  return ctx.sesion;
}

export function cambiarClave(ctx: Contexto, actual: string, nueva: string): Sesion {
  const s = requerirSesion(ctx);
  const u = ctx.db.get('SELECT clave_hash FROM usuarios WHERE id = ?', [s.id]);
  if (!bcrypt.compareSync(String(actual ?? ''), u.clave_hash)) throw new ErrorNegocio('La contraseña actual no es correcta.');
  if (actual === nueva) throw new ErrorNegocio('La nueva contraseña debe ser diferente.');
  validarClave(nueva);
  ctx.db.actualizar('usuarios', s.id, { clave_hash: bcrypt.hashSync(nueva, 10), debe_cambiar_clave: 0 });
  ctx.sesion = sesionDe(ctx.db, s.id);
  auditar(ctx, 'Cambió su contraseña');
  return ctx.sesion;
}

export function listarUsuarios(ctx: Contexto) {
  requerirAdmin(ctx);
  return ctx.db.all('SELECT id, usuario, nombre, rol, activo, ultimo_acceso, firmante FROM usuarios WHERE eliminado_en IS NULL ORDER BY nombre');
}

export function guardarUsuario(ctx: Contexto, d: { id?: number; usuario: string; nombre: string; rol: Rol; activo?: boolean; clave?: string; firmante?: Firmante | '' | null }): number {
  const s = requerirAdmin(ctx);
  const usuario = validarUsuario(d.usuario);
  const nombre = limpiar(d.nombre);
  if (!nombre) throw new ErrorNegocio('El nombre es obligatorio.');
  if (!(d.rol in ROLES)) throw new ErrorNegocio('Seleccione un rol válido.');
  if (ctx.db.get('SELECT 1 FROM usuarios WHERE lower(usuario) = ? AND eliminado_en IS NULL AND id <> ?', [usuario, d.id ?? 0])) {
    throw new ErrorNegocio('Ya existe un usuario con ese nombre de usuario.');
  }
  const activo = d.activo === false ? 0 : 1;
  const firmante = d.firmante || null;
  if (firmante && !(firmante in FIRMANTES)) throw new ErrorNegocio('Firmante no válido.');
  if (firmante) {
    const otro = ctx.db.get('SELECT nombre FROM usuarios WHERE firmante = ? AND eliminado_en IS NULL AND id <> ?', [firmante, d.id ?? 0]);
    if (otro) throw new ErrorNegocio(`El usuario ${otro.nombre} ya firma como ${FIRMANTES[firmante].toLowerCase()}. Quítele esa función primero.`);
  }
  if (d.id) {
    if (d.id === s.id && (activo === 0 || d.rol !== 'admin')) throw new ErrorNegocio('No puede desactivarse ni quitarse el rol de administrador.');
    ctx.db.actualizar('usuarios', d.id, { usuario, nombre, rol: d.rol, activo, firmante });
    if (d.id === s.id) ctx.sesion = sesionDe(ctx.db, s.id);
    if (d.clave) { validarClave(d.clave); ctx.db.actualizar('usuarios', d.id, { clave_hash: bcrypt.hashSync(d.clave, 10), debe_cambiar_clave: 1 }); }
    auditar(ctx, 'Editó usuario', usuario);
    return d.id;
  }
  if (!d.clave) throw new ErrorNegocio('Asigne una contraseña inicial.');
  validarClave(d.clave);
  const id = ctx.db.insertar('usuarios', { usuario, nombre, rol: d.rol, activo, firmante, clave_hash: bcrypt.hashSync(d.clave, 10), debe_cambiar_clave: 1 });
  auditar(ctx, 'Creó usuario', usuario);
  return id;
}

export function eliminarUsuario(ctx: Contexto, id: number) {
  const s = requerirAdmin(ctx);
  if (id === s.id) throw new ErrorNegocio('No puede eliminar su propio usuario.');
  ctx.db.run("UPDATE usuarios SET eliminado_en = datetime('now','localtime'), activo = 0, firmante = NULL WHERE id = ?", [id]);
  auditar(ctx, 'Eliminó usuario', id);
}
