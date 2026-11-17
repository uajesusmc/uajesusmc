/**
 * Ciclo de vida de los datos: abre la base real o la de demostración, define las
 * carpetas de trabajo y permite restaurar copias. No depende de Electron, de modo que
 * puede probarse de forma aislada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Db } from './db/connection';
import { sembrarRoles } from './services/auth';
import type { Contexto, Rutas } from './services/comun';
import { poblarDemo } from './services/demo';
import * as respaldo from './services/respaldo';

export type Modo = 'real' | 'demo';

export class Aplicacion {
  ctx: Contexto | null = null;
  modo: Modo = 'real';

  constructor(public readonly base: string) {
    fs.mkdirSync(base, { recursive: true });
  }

  private get archivoPreferencias() { return path.join(this.base, 'preferencias.json'); }

  modoGuardado(): Modo {
    try { return JSON.parse(fs.readFileSync(this.archivoPreferencias, 'utf8')).modo === 'demo' ? 'demo' : 'real'; } catch { return 'real'; }
  }

  rutas(modo: Modo): Rutas & { archivoDb: string } {
    const raiz = path.join(this.base, modo === 'demo' ? 'demo' : 'datos');
    const r = {
      datos: raiz,
      materiales: path.join(raiz, 'materiales'),
      certificados: path.join(raiz, 'certificados'),
      reportes: path.join(raiz, 'reportes'),
      respaldos: path.join(this.base, modo === 'demo' ? 'demo-respaldos' : 'respaldos'),
      archivoDb: path.join(raiz, modo === 'demo' ? 'meif-demo.sqlite' : 'meif.sqlite'),
    };
    for (const d of [r.datos, r.materiales, r.certificados, r.reportes, r.respaldos]) fs.mkdirSync(d, { recursive: true });
    return r;
  }

  async abrir(modo: Modo = this.modoGuardado()): Promise<Contexto> {
    this.cerrar();
    const r = this.rutas(modo);
    const nueva = !fs.existsSync(r.archivoDb);
    const db = await Db.abrir(r.archivoDb);
    sembrarRoles(db);
    const ctx: Contexto = { db, sesion: null, rutas: r, demo: modo === 'demo' };
    if (modo === 'demo' && nueva) {
      try {
        await poblarDemo(ctx);
      } catch (e) {
        db.cerrar();
        fs.rmSync(r.archivoDb, { force: true });
        throw e;
      }
      ctx.sesion = null;
    }
    this.ctx = ctx;
    this.modo = modo;
    fs.writeFileSync(this.archivoPreferencias, JSON.stringify({ modo }));
    return ctx;
  }

  /** Borra la base de demostración y la vuelve a crear. */
  async restablecerDemo(): Promise<Contexto> {
    if (this.modo === 'demo') this.cerrar();
    fs.rmSync(path.join(this.base, 'demo'), { recursive: true, force: true });
    return this.abrir('demo');
  }

  /** Restaura un respaldo: crea primero una copia de seguridad del estado actual. */
  async restaurar(origen: string): Promise<Contexto> {
    if (!this.ctx) throw new Error('No hay base abierta.');
    const valido = await respaldo.validarOrigen(origen);
    respaldo.crear(this.ctx, 'previo-restauracion');
    const r = this.ctx.rutas as Rutas & { archivoDb: string };
    const modo = this.modo;
    this.cerrar();
    respaldo.aplicarRestauracion(valido, r, this.rutas(modo).archivoDb);
    return this.abrir(modo);
  }

  cerrar(): void {
    if (this.ctx) {
      try { this.ctx.db.cerrar(); } catch { /* ya cerrada */ }
      this.ctx = null;
    }
  }
}
