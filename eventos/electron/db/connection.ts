/**
 * Conexión SQLite basada en sql.js (SQLite compilado a WebAssembly).
 *
 * Se eligió sql.js para no depender de módulos nativos: la misma compilación funciona
 * en Windows 10/11 sin herramientas de compilación. La base vive en memoria y se
 * persiste en disco de forma atómica (archivo temporal + rename) después de cada
 * operación que modifica datos, por lo que la información se conserva al cerrar.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic, type SqlValue } from 'sql.js';
import { MIGRACIONES } from './schema';

export type Param = SqlValue | boolean | undefined;
export type Fila = Record<string, any>;

let SQL: SqlJsStatic | null = null;
async function motor(): Promise<SqlJsStatic> {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

const norm = (p: Param[]): SqlValue[] =>
  p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export class Db {
  private profundidadTx = 0;
  private sucio = false;

  private constructor(private sql: SqlDatabase, public archivo: string | null) {
    this.sql.exec('PRAGMA foreign_keys = ON;');
  }

  /** Abre (o crea) la base en `archivo`. Con `null` crea una base en memoria (pruebas). */
  static async abrir(archivo: string | null): Promise<Db> {
    const SQLJS = await motor();
    let datos: Uint8Array | undefined;
    if (archivo && fs.existsSync(archivo)) datos = fs.readFileSync(archivo);
    const db = new Db(new SQLJS.Database(datos), archivo);
    db.verificarIntegridad();
    db.migrar();
    return db;
  }

  /** Comprueba que un archivo sea una base de datos válida de MEIF (para restauraciones). */
  static async validarArchivo(archivo: string, tablas: string[]): Promise<{ ok: boolean; mensaje: string }> {
    try {
      const SQLJS = await motor();
      const d = new SQLJS.Database(fs.readFileSync(archivo));
      const r = d.exec(`SELECT count(*) FROM sqlite_master WHERE name IN (${tablas.map((t) => `'${t.replace(/'/g, '')}'`).join(',')})`);
      d.close();
      const n = Number(r[0]?.values[0][0] ?? 0);
      return n === tablas.length ? { ok: true, mensaje: 'Archivo válido.' } : { ok: false, mensaje: 'El archivo no es una base de datos de esta aplicación.' };
    } catch {
      return { ok: false, mensaje: 'El archivo está dañado o no es una base de datos SQLite.' };
    }
  }

  private verificarIntegridad(): void {
    const r = this.sql.exec('PRAGMA integrity_check');
    const v = r[0]?.values[0][0];
    if (v !== 'ok') throw new Error(`La base de datos está dañada (${v}). Restaure una copia de seguridad.`);
  }

  /** Aplica las migraciones pendientes. Seguro de ejecutar en cada inicio. */
  private migrar(): void {
    const version = Number(this.sql.exec('PRAGMA user_version')[0].values[0][0]);
    for (let v = version; v < MIGRACIONES.length; v++) {
      this.sql.exec('BEGIN');
      try {
        this.sql.exec(MIGRACIONES[v]);
        this.sql.exec(`PRAGMA user_version = ${v + 1}`);
        this.sql.exec('COMMIT');
      } catch (e) {
        this.sql.exec('ROLLBACK');
        throw e;
      }
      this.sucio = true;
    }
    this.guardar();
  }

  get version(): number {
    return Number(this.sql.exec('PRAGMA user_version')[0].values[0][0]);
  }

  all<T = any>(sql: string, params: Param[] = []): T[] {
    const st = this.sql.prepare(sql);
    try {
      st.bind(norm(params));
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      return out;
    } finally {
      st.free();
    }
  }

  get<T = any>(sql: string, params: Param[] = []): T {
    return this.all<T>(sql, params)[0];
  }

  valor<T = any>(sql: string, params: Param[] = []): T {
    const f = this.get(sql, params);
    return (f ? Object.values(f)[0] : null) as T;
  }

  run(sql: string, params: Param[] = []): { cambios: number; id: number } {
    this.sql.run(sql, norm(params));
    this.sucio = true;
    const cambios = this.sql.getRowsModified();
    const id = Number(this.sql.exec('SELECT last_insert_rowid()')[0].values[0][0]);
    if (this.profundidadTx === 0) this.guardar();
    return { cambios, id };
  }

  /** Ejecuta `fn` dentro de una transacción (anidable mediante SAVEPOINT). */
  tx<T>(fn: () => T): T {
    const sp = `sp${this.profundidadTx}`;
    this.sql.exec(this.profundidadTx === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
    this.profundidadTx++;
    try {
      const r = fn();
      this.profundidadTx--;
      this.sql.exec(this.profundidadTx === 0 ? 'COMMIT' : `RELEASE ${sp}`);
      if (this.profundidadTx === 0) this.guardar();
      return r;
    } catch (e) {
      this.profundidadTx--;
      this.sql.exec(this.profundidadTx === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    }
  }

  /** Inserta una fila agregando `uuid` automáticamente. Devuelve el id. */
  insertar(tabla: string, datos: Record<string, Param>, conUuid = true): number {
    const d = { ...datos } as Record<string, Param>;
    if (conUuid && d.uuid === undefined) d.uuid = crypto.randomUUID();
    const cols = Object.keys(d);
    return this.run(
      `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => d[c]),
    ).id;
  }

  actualizar(tabla: string, id: number, datos: Record<string, Param>, conMarca = true): void {
    const cols = Object.keys(datos);
    const sets = cols.map((c) => `${c} = ?`);
    if (conMarca) sets.push("actualizado_en = datetime('now','localtime')");
    this.run(`UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = ?`, [...cols.map((c) => datos[c]), id]);
  }

  /** Escribe la base al disco de forma atómica si hubo cambios. */
  guardar(): void {
    if (!this.archivo || !this.sucio) return;
    fs.mkdirSync(path.dirname(this.archivo), { recursive: true });
    const tmp = `${this.archivo}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(this.sql.export()));
    // sql.js desactiva foreign_keys tras export(): se reactiva.
    this.sql.exec('PRAGMA foreign_keys = ON;');
    fs.renameSync(tmp, this.archivo);
    this.sucio = false;
  }

  exportar(): Uint8Array {
    const d = this.sql.export();
    this.sql.exec('PRAGMA foreign_keys = ON;');
    return d;
  }

  cerrar(): void {
    this.guardar();
    this.sql.close();
  }
}
