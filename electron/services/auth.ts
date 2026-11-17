/** Usuarios, roles, permisos e inicio de sesión. */
import bcrypt from 'bcryptjs';
import { MODULOS, PERMISOS_POR_DEFECTO, ROLES, type CodigoRol, type Modulo } from '../../shared/constantes';
import type { Db } from '../db/connection';
import { auditar, ErrorNegocio, limpiar, requerirPermiso, requerirSesion, type Contexto, type Permiso, type Sesion } from './comun';

const COSTO_BCRYPT = 10;
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 60_000;
const intentos = new Map<string, { n: number; hasta: number }>();

/** Crea roles y permisos por defecto si no existen (idempotente). */
export function sembrarRoles(db: Db): void {
  db.tx(() => {
    for (const r of ROLES) {
      db.run('INSERT OR IGNORE INTO roles (codigo, nombre) VALUES (?, ?)', [r.codigo, r.nombre]);
      const rolId = db.valor<number>('SELECT id FROM roles WHERE codigo = ?', [r.codigo]);
      for (const m of MODULOS) {
        const [ver, editar, eliminar] = PERMISOS_POR_DEFECTO[r.codigo][m.id];
        db.run('INSERT OR IGNORE INTO permisos (rol_id, modulo, ver, editar, eliminar) VALUES (?, ?, ?, ?, ?)', [rolId, m.id, ver, editar, eliminar]);
      }
    }
    // El superadministrador conserva siempre todos los permisos.
    db.run("UPDATE permisos SET ver = 1, editar = 1, eliminar = 1 WHERE rol_id = (SELECT id FROM roles WHERE codigo = 'superadmin')");
  });
}

export function validarClave(clave: string): void {
  if (typeof clave !== 'string' || clave.length < 8) throw new ErrorNegocio('La contraseña debe tener al menos 8 caracteres.');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave) || !/\d/.test(clave)) {
    throw new ErrorNegocio('La contraseña debe combinar letras y números.');
  }
}

export const hayUsuarios = (db: Db): boolean =>
  db.valor<number>('SELECT count(*) FROM usuarios WHERE eliminado_en IS NULL') > 0;

/** Primer arranque: crea la cuenta de superadministrador. Solo funciona si no hay usuarios. */
export function crearPrimerAdministrador(ctx: Contexto, datos: { usuario: string; nombre: string; clave: string }): Sesion {
  if (hayUsuarios(ctx.db)) throw new ErrorNegocio('El sistema ya fue configurado.');
  const usuario = limpiar(datos.usuario)?.toLowerCase();
  const nombre = limpiar(datos.nombre);
  if (!usuario || !/^[a-z0-9._-]{3,30}$/.test(usuario)) throw new ErrorNegocio('Usuario inválido: use de 3 a 30 letras, números, punto o guion.');
  if (!nombre) throw new ErrorNegocio('Indique el nombre completo.');
  validarClave(datos.clave);
  const rolId = ctx.db.valor<number>("SELECT id FROM roles WHERE codigo = 'superadmin'");
  ctx.db.insertar('usuarios', { usuario, nombre, clave_hash: bcrypt.hashSync(datos.clave, COSTO_BCRYPT), rol_id: rolId });
  auditar(ctx, 'Configuración inicial: creó el superadministrador', 'usuarios', null, usuario);
  return iniciarSesion(ctx, usuario, datos.clave);
}

function permisosRol(db: Db, rolId: number): Record<Modulo, Permiso> {
  const out = {} as Record<Modulo, Permiso>;
  for (const m of MODULOS) out[m.id] = { ver: false, editar: false, eliminar: false };
  for (const p of db.all('SELECT * FROM permisos WHERE rol_id = ?', [rolId])) {
    if (p.modulo in out) out[p.modulo as Modulo] = { ver: !!p.ver, editar: !!p.editar, eliminar: !!p.eliminar };
  }
  return out;
}

export function construirSesion(db: Db, usuarioId: number): Sesion {
  const u = db.get(
    `SELECT u.*, r.codigo AS rol, r.nombre AS rol_nombre FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.id = ? AND u.eliminado_en IS NULL`, [usuarioId],
  );
  if (!u) throw new ErrorNegocio('Usuario no encontrado.');
  return {
    id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol as CodigoRol, rolNombre: u.rol_nombre,
    docenteId: u.docente_id ?? null, debeCambiarClave: !!u.debe_cambiar_clave, permisos: permisosRol(db, u.rol_id),
  };
}

export function iniciarSesion(ctx: Contexto, usuario: string, clave: string): Sesion {
  const clave_ = String(usuario ?? '').trim().toLowerCase();
  const bloqueo = intentos.get(clave_);
  if (bloqueo && bloqueo.n >= MAX_INTENTOS && Date.now() < bloqueo.hasta) {
    throw new ErrorNegocio('Demasiados intentos fallidos. Espere un minuto e intente de nuevo.');
  }
  const u = ctx.db.get('SELECT * FROM usuarios WHERE lower(usuario) = ? AND eliminado_en IS NULL', [clave_]);
  if (!u || !bcrypt.compareSync(String(clave ?? ''), u.clave_hash)) {
    const n = (bloqueo && Date.now() < bloqueo.hasta ? bloqueo.n : 0) + 1;
    intentos.set(clave_, { n, hasta: Date.now() + BLOQUEO_MS });
    auditar(ctx, 'Intento de inicio de sesión fallido', 'usuarios', u?.id ?? null, clave_);
    throw new ErrorNegocio('Usuario o contraseña incorrectos.');
  }
  if (!u.activo) throw new ErrorNegocio('El usuario está inactivo. Contacte al administrador.');
  intentos.delete(clave_);
  ctx.db.run("UPDATE usuarios SET ultimo_acceso = datetime('now','localtime') WHERE id = ?", [u.id]);
  ctx.sesion = construirSesion(ctx.db, u.id);
  auditar(ctx, 'Inició sesión', 'usuarios', u.id);
  return ctx.sesion;
}

export function cerrarSesion(ctx: Contexto): void {
  if (ctx.sesion) auditar(ctx, 'Cerró sesión', 'usuarios', ctx.sesion.id);
  ctx.sesion = null;
}

export function cambiarClave(ctx: Contexto, actual: string, nueva: string): void {
  const s = requerirSesion(ctx);
  const u = ctx.db.get('SELECT clave_hash FROM usuarios WHERE id = ?', [s.id]);
  if (!u || !bcrypt.compareSync(String(actual ?? ''), u.clave_hash)) throw new ErrorNegocio('La contraseña actual no es correcta.');
  if (actual === nueva) throw new ErrorNegocio('La nueva contraseña debe ser diferente de la actual.');
  validarClave(nueva);
  ctx.db.actualizar('usuarios', s.id, { clave_hash: bcrypt.hashSync(nueva, COSTO_BCRYPT), debe_cambiar_clave: 0 });
  ctx.sesion = construirSesion(ctx.db, s.id);
  auditar(ctx, 'Cambió su contraseña', 'usuarios', s.id);
}

// ------------------------------------------------------------ administración

export function listarUsuarios(ctx: Contexto) {
  requerirPermiso(ctx, 'usuarios', 'ver');
  return ctx.db.all(
    `SELECT u.id, u.usuario, u.nombre, u.activo, u.ultimo_acceso, u.debe_cambiar_clave, u.rol_id, u.docente_id,
            r.nombre AS rol, d.nombres || ' ' || d.apellidos AS docente
     FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN docentes d ON d.id = u.docente_id
     WHERE u.eliminado_en IS NULL ORDER BY u.nombre`,
  );
}

export function listarRoles(ctx: Contexto) {
  requerirSesion(ctx);
  return ctx.db.all('SELECT id, codigo, nombre FROM roles ORDER BY id');
}

interface DatosUsuario { id?: number; usuario: string; nombre: string; rol_id: number; docente_id?: number | null; activo?: boolean; clave?: string }

export function guardarUsuario(ctx: Contexto, d: DatosUsuario): number {
  const s = requerirPermiso(ctx, 'usuarios', 'editar');
  const usuario = limpiar(d.usuario)?.toLowerCase();
  const nombre = limpiar(d.nombre);
  if (!usuario || !/^[a-z0-9._-]{3,30}$/.test(usuario)) throw new ErrorNegocio('Usuario inválido: use de 3 a 30 letras, números, punto o guion.');
  if (!nombre) throw new ErrorNegocio('El nombre es obligatorio.');
  const rol = ctx.db.get('SELECT * FROM roles WHERE id = ?', [d.rol_id]);
  if (!rol) throw new ErrorNegocio('Seleccione un rol válido.');
  if (rol.codigo === 'docente' && !d.docente_id) throw new ErrorNegocio('Un usuario con rol Docente debe estar vinculado a un docente registrado.');
  const dup = ctx.db.get('SELECT id FROM usuarios WHERE lower(usuario) = ? AND eliminado_en IS NULL AND id <> ?', [usuario, d.id ?? 0]);
  if (dup) throw new ErrorNegocio('Ya existe un usuario con ese nombre de usuario.');
  const datos = { usuario, nombre, rol_id: d.rol_id, docente_id: d.docente_id || null, activo: d.activo === false ? 0 : 1 };
  if (d.id) {
    if (d.id === s.id && (datos.activo === 0 || rol.codigo !== s.rol)) throw new ErrorNegocio('No puede desactivarse ni cambiar su propio rol.');
    protegerUltimoAdmin(ctx, d.id, rol.codigo !== 'superadmin' || datos.activo === 0);
    ctx.db.actualizar('usuarios', d.id, datos);
    if (d.clave) {
      validarClave(d.clave);
      ctx.db.actualizar('usuarios', d.id, { clave_hash: bcrypt.hashSync(d.clave, COSTO_BCRYPT), debe_cambiar_clave: 1 });
    }
    auditar(ctx, 'Actualizó usuario', 'usuarios', d.id, usuario);
    return d.id;
  }
  if (!d.clave) throw new ErrorNegocio('Asigne una contraseña inicial.');
  validarClave(d.clave);
  const id = ctx.db.insertar('usuarios', { ...datos, clave_hash: bcrypt.hashSync(d.clave, COSTO_BCRYPT), debe_cambiar_clave: 1 });
  auditar(ctx, 'Creó usuario', 'usuarios', id, usuario);
  return id;
}

function protegerUltimoAdmin(ctx: Contexto, usuarioId: number, pierdeAdmin: boolean): void {
  if (!pierdeAdmin) return;
  const esAdmin = ctx.db.get(
    "SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ? AND r.codigo = 'superadmin' AND u.activo = 1", [usuarioId],
  );
  if (!esAdmin) return;
  const otros = ctx.db.valor<number>(
    `SELECT count(*) FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE r.codigo = 'superadmin' AND u.activo = 1 AND u.eliminado_en IS NULL AND u.id <> ?`, [usuarioId],
  );
  if (otros === 0) throw new ErrorNegocio('Debe existir al menos un superadministrador activo.');
}

export function eliminarUsuario(ctx: Contexto, id: number): void {
  const s = requerirPermiso(ctx, 'usuarios', 'eliminar');
  if (id === s.id) throw new ErrorNegocio('No puede eliminar su propio usuario.');
  protegerUltimoAdmin(ctx, id, true);
  ctx.db.run("UPDATE usuarios SET eliminado_en = datetime('now','localtime'), activo = 0 WHERE id = ?", [id]);
  auditar(ctx, 'Eliminó usuario (papelera)', 'usuarios', id);
}

export function matrizPermisos(ctx: Contexto) {
  requerirPermiso(ctx, 'usuarios', 'ver');
  return ctx.db.all(
    'SELECT p.rol_id, r.codigo, r.nombre AS rol, p.modulo, p.ver, p.editar, p.eliminar FROM permisos p JOIN roles r ON r.id = p.rol_id ORDER BY p.rol_id',
  );
}

export function guardarPermiso(ctx: Contexto, rolId: number, modulo: Modulo, p: Permiso): void {
  requerirPermiso(ctx, 'usuarios', 'editar');
  if (ctx.sesion!.rol !== 'superadmin') throw new ErrorNegocio('Solo el superadministrador puede modificar permisos.');
  const rol = ctx.db.get('SELECT codigo FROM roles WHERE id = ?', [rolId]);
  if (!rol) throw new ErrorNegocio('Rol no encontrado.');
  if (rol.codigo === 'superadmin') throw new ErrorNegocio('Los permisos del superadministrador no se pueden reducir.');
  if (!MODULOS.some((m) => m.id === modulo)) throw new ErrorNegocio('Módulo desconocido.');
  // Editar o eliminar implica poder ver.
  const ver = p.ver || p.editar || p.eliminar;
  ctx.db.run('UPDATE permisos SET ver = ?, editar = ?, eliminar = ? WHERE rol_id = ? AND modulo = ?', [ver, p.editar, p.eliminar, rolId, modulo]);
  auditar(ctx, 'Modificó permisos', 'permisos', rolId, { modulo, ...p });
}

export function auditoria(ctx: Contexto, filtro: { desde?: string; hasta?: string; texto?: string; limite?: number }) {
  requerirPermiso(ctx, 'usuarios', 'ver');
  const w: string[] = [];
  const p: any[] = [];
  if (filtro.desde) { w.push('fecha >= ?'); p.push(filtro.desde); }
  if (filtro.hasta) { w.push('fecha < date(?, \'+1 day\')'); p.push(filtro.hasta); }
  if (filtro.texto) { w.push('(accion LIKE ? OR usuario LIKE ? OR entidad LIKE ? OR detalle LIKE ?)'); const t = `%${filtro.texto}%`; p.push(t, t, t, t); }
  return ctx.db.all(
    `SELECT * FROM auditoria ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`,
    [...p, Math.min(filtro.limite ?? 500, 5000)],
  );
}
