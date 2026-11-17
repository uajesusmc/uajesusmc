/** Núcleo de la aplicación y enrutador de llamadas de la interfaz (independiente de Electron). */
import fs from 'node:fs';
import path from 'node:path';
import { Db } from './db/connection';
import * as agenda from './services/agenda';
import * as asistencia from './services/asistencia';
import * as auth from './services/auth';
import * as certificados from './services/certificados';
import { ErrorNegocio, requerirAdmin, requerirEdicion, requerirSesion, type Contexto, type Rutas } from './services/comun';
import * as config from './services/config';
import * as datos from './services/datos';
import * as org from './services/organizacion';
import * as firmas from './services/firmas';
import * as documentos from './services/documentos';
import * as reportes from './services/reportes';
import * as respaldo from './services/respaldo';

export class Aplicacion {
  ctx: Contexto | null = null;
  constructor(public base: string) { fs.mkdirSync(base, { recursive: true }); }
  rutas(): Rutas {
    const d = path.join(this.base, 'datos');
    const r = {
      datos: d, banners: path.join(d, 'banners'), imagenes: path.join(d, 'imagenes'), certificados: path.join(d, 'certificados'),
      respaldos: path.join(this.base, 'respaldos'), archivoDb: path.join(d, 'meif-eventos.sqlite'),
    };
    for (const x of [r.datos, r.banners, r.imagenes, r.certificados, r.respaldos]) fs.mkdirSync(x, { recursive: true });
    return r;
  }
  async abrir() {
    this.cerrar();
    const r = this.rutas();
    this.ctx = { db: await Db.abrir(r.archivoDb), sesion: null, rutas: r };
    return this.ctx;
  }
  async restaurar(ruta: string) {
    const origen = await respaldo.validar(this.ctx!, ruta);
    respaldo.crear(this.ctx!, 'previo-restauracion');
    this.cerrar();
    respaldo.aplicar(origen, this.rutas());
    return this.abrir();
  }
  cerrar() { if (this.ctx) { try { this.ctx.db.cerrar(); } catch { /* cerrada */ } this.ctx = null; } }
}

export interface Filtro { name: string; extensions: string[] }
export interface Dialogos {
  abrirArchivo(titulo: string, filtros: Filtro[]): Promise<string | null>;
  guardarArchivo(titulo: string, nombre: string, filtros: Filtro[]): Promise<string | null>;
  elegirCarpeta(titulo: string): Promise<string | null>;
  abrirRuta(ruta: string): Promise<void>;
  mostrarPdf(ruta: string): Promise<void>;
}

type Ruta = (ctx: Contexto, a: any) => unknown;
const IMG: Filtro[] = [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png'] }];
const limpio = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 80);

export function crearRutas(app: Aplicacion, ui: Dialogos, version: string): Record<string, Ruta> {
  return {
    'app.info': (ctx) => ({ version, hayUsuarios: auth.hayUsuarios(ctx.db), sesion: ctx.sesion, datos: ctx.rutas.datos }),
    'auth.primerAdmin': (ctx, a) => auth.crearPrimerAdministrador(ctx, a),
    'auth.login': (ctx, a) => { const s = auth.iniciarSesion(ctx, a.usuario, a.clave); try { respaldo.automatico(ctx); } catch { /* no bloquea */ } return s; },
    'auth.logout': (ctx) => { ctx.sesion = null; return true; },
    'auth.cambiarClave': (ctx, a) => auth.cambiarClave(ctx, a.actual, a.nueva),
    'usuarios.listar': (ctx) => auth.listarUsuarios(ctx),
    'usuarios.guardar': (ctx, a) => auth.guardarUsuario(ctx, a),
    'usuarios.eliminar': (ctx, a) => { auth.eliminarUsuario(ctx, a.id); return true; },
    'auditoria.listar': (ctx) => { requerirAdmin(ctx); return ctx.db.all('SELECT * FROM auditoria ORDER BY id DESC LIMIT 1000'); },

    'datos.listar': (ctx, a) => datos.listar(ctx, a.modelo, a.filtro ?? {}),
    'datos.obtener': (ctx, a) => datos.obtener(ctx, a.modelo, a.id),
    'datos.guardar': (ctx, a) => datos.guardar(ctx, a.modelo, a.datos),
    'datos.eliminar': (ctx, a) => { datos.eliminar(ctx, a.modelo, a.id); return true; },
    'datos.anios': (ctx) => datos.anios(ctx),
    'papelera.listar': (ctx) => datos.papelera(ctx),
    'papelera.restaurar': (ctx, a) => { datos.restaurar(ctx, a.tabla, a.id); return true; },

    'inscripciones.listar': (ctx, a) => datos.inscritos(ctx, a.eventoId),
    'inscripciones.inscribir': (ctx, a) => datos.inscribir(ctx, a.eventoId, a.participantes),
    'inscripciones.cancelar': (ctx, a) => { datos.cancelarInscripcion(ctx, a.id); return true; },
    'importar.elegir': async (ctx) => { requerirEdicion(ctx); return ui.abrirArchivo('Archivo de Excel', [{ name: 'Excel', extensions: ['xlsx'] }]); },
    'importar.ejecutar': (ctx, a) => datos.importar(ctx, a.archivo, { eventoId: a.eventoId, simular: !!a.simular }),
    'importar.plantilla': async (ctx) => {
      requerirSesion(ctx);
      const d = await ui.guardarArchivo('Guardar plantilla', 'plantilla_participantes.xlsx', [{ name: 'Excel', extensions: ['xlsx'] }]);
      if (!d) return null;
      await datos.plantilla(d); await ui.abrirRuta(d); return d;
    },

    'agenda.listar': (ctx, a) => agenda.listar(ctx, a ?? {}),
    'agenda.verificar': (ctx, a) => agenda.verificar(ctx, a),
    'agenda.guardar': (ctx, a) => agenda.guardar(ctx, a),
    'agenda.eliminar': (ctx, a) => { agenda.eliminar(ctx, a.id); return true; },
    'agenda.horas': (ctx, a) => agenda.horasEvento(ctx, a.eventoId),

    'aulas.listar': (ctx) => org.listarAulas(ctx),
    'aulas.guardar': (ctx, a) => org.guardarAula(ctx, a),
    'aulas.eliminar': (ctx, a) => { org.eliminarAula(ctx, a.id); return true; },
    'cursillos.listar': (ctx, a) => org.listarCursillos(ctx, a.eventoId),
    'cursillos.guardar': (ctx, a) => org.guardarCursillo(ctx, a),
    'cursillos.eliminar': (ctx, a) => { org.eliminarCursillo(ctx, a.id); return true; },
    'cursillos.verificar': (ctx, a) => org.verificarProgramacion(ctx, a),
    'cursillos.programar': (ctx, a) => org.programar(ctx, a.programacion, !!a.soloValidas),
    'horario.docentes': (ctx, a) => org.horarioDocentes(ctx, a.eventoId, a.ponenteId),

    'asistencia.planilla': (ctx, a) => asistencia.planilla(ctx, a.actividadId),
    'asistencia.registrar': (ctx, a) => asistencia.registrar(ctx, a.actividadId, a.registros),
    'asistencia.resumen': (ctx, a) => asistencia.resumenEvento(ctx, a.eventoId),

    'certificados.elegibles': (ctx, a) => certificados.elegibles(ctx, a.eventoId),
    'certificados.generar': (ctx, a) => certificados.generar(ctx, a.eventoId, a.participantes, a.autorizacion),
    'certificados.listar': (ctx, a) => certificados.listar(ctx, a ?? {}),
    'certificados.ver': async (ctx, a) => { await ui.mostrarPdf(a.ruta && fs.existsSync(a.ruta) && path.resolve(a.ruta).startsWith(ctx.rutas.certificados) ? a.ruta : await certificados.archivo(ctx, a.ids)); return true; },
    'certificados.guardar': async (ctx, a) => {
      const o = await certificados.archivo(ctx, a.ids);
      const d = await ui.guardarArchivo('Guardar certificado', path.basename(o), [{ name: 'PDF', extensions: ['pdf'] }]);
      if (d) fs.copyFileSync(o, d);
      return d;
    },
    'certificados.anular': (ctx, a) => certificados.anular(ctx, a.id, a.motivo).then(() => true),
    'certificados.verificar': (ctx, a) => certificados.verificar(ctx, a.texto),

    'reportes.catalogo': (ctx) => { requerirSesion(ctx); return reportes.REPORTES.map(({ id, nombre, filtro }) => ({ id, nombre, filtro })); },
    'reportes.vista': (ctx, a) => reportes.construir(ctx, a.id, a.filtros ?? {}),
    'reportes.exportar': async (ctx, a) => {
      const r = reportes.construir(ctx, a.id, a.filtros ?? {});
      const d = await ui.guardarArchivo('Guardar reporte', `${limpio(r.titulo)}.${a.formato}`, [{ name: a.formato === 'pdf' ? 'PDF' : 'Excel', extensions: [a.formato] }]);
      if (!d) return null;
      await reportes.exportar(ctx, r, a.formato, d); await ui.abrirRuta(d); return d;
    },
    'panel': (ctx, a) => reportes.panel(ctx, a?.anio ?? new Date().getFullYear()),

    'config.leer': (ctx) => config.configPublica(ctx),
    'config.guardar': (ctx, a) => { config.guardarConfig(ctx, a); return true; },
    'config.imagenes': (ctx) => config.imagenes(ctx),
    'config.cargarImagen': async (ctx, a) => {
      requerirEdicion(ctx);
      const r = await ui.abrirArchivo('Seleccione la imagen', IMG);
      if (r) config.guardarImagen(ctx, a.imagen, r);
      return !!r;
    },
    'config.quitarImagen': (ctx, a) => { config.guardarImagen(ctx, a.imagen, null); return true; },

    'documentos.listar': (ctx, a) => documentos.listar(ctx, a ?? {}),
    'documentos.obtener': (ctx, a) => documentos.obtener(ctx, a.id),
    'documentos.crear': (ctx, a) => documentos.crear(ctx, a),
    'documentos.anular': (ctx, a) => { documentos.anular(ctx, a.id); return true; },
    'documentos.ver': async (ctx, a) => { await ui.mostrarPdf(await documentos.archivo(ctx, a.id)); return true; },
    'documentos.guardar': async (ctx, a) => {
      const o = await documentos.archivo(ctx, a.id);
      const d = await ui.guardarArchivo('Guardar documento', path.basename(o), [{ name: 'PDF', extensions: ['pdf'] }]);
      if (d) fs.copyFileSync(o, d);
      return d;
    },
    'membrete.vistaPrevia': async (ctx) => { await ui.mostrarPdf(await documentos.vistaPrevia(ctx)); return true; },

    'firmas.estado': (ctx) => firmas.estado(ctx),
    'firmas.subir': async (ctx, a) => {
      const r = await ui.abrirArchivo('Seleccione la imagen de la firma (PNG con fondo transparente o JPG sobre fondo blanco)', IMG);
      if (!r) return false;
      firmas.subir(ctx, a.firmante, r);
      return true;
    },
    'firmas.quitar': (ctx, a) => { firmas.subir(ctx, a.firmante, null); return true; },
    'firmas.datos': (ctx, a) => { firmas.datos(ctx, a.firmante, a); return true; },

    'banner.actual': (ctx) => config.bannerActual(ctx),
    'banner.cambiarFoto': async (ctx, a) => {
      requerirEdicion(ctx);
      const r = a.ruta ?? (await ui.abrirArchivo('Seleccione la foto inaugural del evento', IMG));
      if (!r) return false;
      config.guardarFotoEvento(ctx, a.eventoId, r, a.comoBanner !== false);
      return true;
    },
    'banner.quitarFoto': (ctx, a) => { config.guardarFotoEvento(ctx, a.eventoId, null); return true; },
    'banner.fijar': (ctx, a) => { config.fijarBanner(ctx, a.eventoId); return true; },
    'banner.fotoEvento': (ctx, a) => config.fotoEvento(ctx, a.eventoId),

    'respaldo.listar': (ctx) => respaldo.listar(ctx),
    'respaldo.crear': (ctx) => respaldo.crear(ctx, 'manual'),
    'respaldo.exportar': async (ctx) => { requerirEdicion(ctx); const d = await ui.elegirCarpeta('¿Dónde guardar la copia? (por ejemplo, una memoria USB)'); return d ? respaldo.crear(ctx, 'manual', d) : null; },
    'respaldo.restaurar': async (ctx, a) => {
      requerirAdmin(ctx);
      const r = a?.ruta ?? (await ui.elegirCarpeta('Seleccione la carpeta del respaldo'));
      if (!r) return false;
      await app.restaurar(r);
      return true;
    },
  };
}

export async function despachar(app: Aplicacion, rutas: Record<string, Ruta>, canal: string, args: unknown) {
  const fn = rutas[canal];
  if (!fn) return { ok: false, error: `Operación desconocida: ${canal}` };
  if (!app.ctx) return { ok: false, error: 'La base de datos no está disponible.' };
  try {
    const data = await fn(app.ctx, args);
    app.ctx?.db.guardar();
    return { ok: true, data: data ?? null };
  } catch (e: any) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message, detalle: e.detalle };
    const m = String(e?.message ?? e);
    if (m.includes('UNIQUE')) return { ok: false, error: 'Ya existe un registro con esos datos.' };
    console.error(canal, e);
    return { ok: false, error: `Error inesperado: ${m}` };
  }
}
