/**
 * Enrutador de llamadas desde la interfaz. Cada ruta valida sesión y permisos en el
 * servicio correspondiente; aquí solo se adaptan argumentos y se resuelven diálogos
 * de archivos (a través de la interfaz `Dialogos`, para poder probarlo sin Electron).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Aplicacion, type Modo } from './aplicacion';
import * as auth from './services/auth';
import * as asistencia from './services/asistencia';
import * as certificados from './services/certificados';
import { ErrorNegocio, requerirPermiso, requerirSesion, type Contexto } from './services/comun';
import * as config from './services/config';
import * as crud from './services/crud';
import * as dashboard from './services/dashboard';
import { CLAVE_DEMO, USUARIOS_DEMO } from './services/demo';
import * as estudiantes from './services/estudiantes';
import * as horarios from './services/horarios';
import * as material from './services/materiales';
import * as planeacion from './services/planeacion';
import * as reportes from './services/reportes';
import * as respaldo from './services/respaldo';

export interface Filtro { name: string; extensions: string[] }
export interface Dialogos {
  abrirArchivo(titulo: string, filtros: Filtro[]): Promise<string | null>;
  guardarArchivo(titulo: string, nombre: string, filtros: Filtro[]): Promise<string | null>;
  elegirCarpeta(titulo: string): Promise<string | null>;
  abrirRuta(ruta: string): Promise<void>;
  mostrarPdf(ruta: string, titulo: string): Promise<void>;
  mostrarEnCarpeta(ruta: string): void;
}

export type Respuesta = { ok: true; data: unknown } | { ok: false; error: string; detalle?: unknown };

type Ruta = (ctx: Contexto, a: any) => unknown;

const PDF: Filtro[] = [{ name: 'PDF', extensions: ['pdf'] }];
const XLSX: Filtro[] = [{ name: 'Excel', extensions: ['xlsx'] }];
const nombreArchivo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(0, 80);

export function crearRutas(app: Aplicacion, ui: Dialogos, info: { version: string }): Record<string, Ruta> {
  const exportarReporte = async (ctx: Contexto, r: ReturnType<typeof reportes.construir>, formato: 'pdf' | 'xlsx') => {
    const destino = await ui.guardarArchivo('Guardar reporte', `${nombreArchivo(r.titulo)}.${formato}`, formato === 'pdf' ? PDF : XLSX);
    if (!destino) return null;
    await reportes.exportar(ctx, r, formato, destino);
    await ui.abrirRuta(destino);
    return destino;
  };

  return {
    // ----------------------------------------------------------- aplicación
    'app.info': (ctx) => ({
      version: info.version, modo: app.modo, demo: ctx.demo, hayUsuarios: auth.hayUsuarios(ctx.db),
      usuariosDemo: ctx.demo ? USUARIOS_DEMO : [], claveDemo: ctx.demo ? CLAVE_DEMO : null, sesion: ctx.sesion,
      datos: ctx.rutas.datos, versionBd: ctx.db.version,
    }),
    'app.cambiarModo': async (_ctx, a: { modo: Modo }) => { await app.abrir(a.modo === 'demo' ? 'demo' : 'real'); return true; },
    'app.restablecerDemo': async (ctx) => {
      if (!ctx.demo) throw new ErrorNegocio('Solo disponible en el modo de demostración.');
      await app.restablecerDemo();
      return true;
    },
    'app.abrirCarpetaDatos': (ctx) => { requerirPermiso(ctx, 'configuracion', 'ver'); ui.mostrarEnCarpeta(ctx.rutas.datos); return true; },

    // -------------------------------------------------------------- sesión
    'auth.primerAdmin': (ctx, a) => auth.crearPrimerAdministrador(ctx, a),
    'auth.login': (ctx, a) => {
      const s = auth.iniciarSesion(ctx, a.usuario, a.clave);
      if (!ctx.demo) { try { respaldo.automaticoSiCorresponde(ctx); } catch { /* no bloquea el ingreso */ } }
      return s;
    },
    'auth.logout': (ctx) => { auth.cerrarSesion(ctx); return true; },
    'auth.cambiarClave': (ctx, a) => { auth.cambiarClave(ctx, a.actual, a.nueva); return ctx.sesion; },

    // ------------------------------------------------------- CRUD genérico
    'crud.listar': (ctx, a) => crud.listar(ctx, a.entidad, a.filtro),
    'crud.obtener': (ctx, a) => crud.obtener(ctx, a.entidad, a.id),
    'crud.guardar': (ctx, a) => crud.guardar(ctx, a.entidad, a.datos),
    'crud.eliminar': (ctx, a) => { crud.eliminar(ctx, a.entidad, a.id); return true; },
    'crud.opciones': (ctx, a) => crud.opciones(ctx, a.entidad),
    'papelera.listar': (ctx) => crud.papelera(ctx),
    'papelera.restaurar': (ctx, a) => { crud.restaurar(ctx, a.tabla, a.id); return true; },
    'papelera.purgar': (ctx, a) => { crud.purgar(ctx, a.tabla, a.id); return true; },

    // --------------------------------------------------------- estudiantes
    'estudiantes.historial': (ctx, a) => estudiantes.historial(ctx, a.id),
    'estudiantes.asignaturas': (ctx, a) => estudiantes.asignaturasMatricula(ctx, a.matriculaId),
    'estudiantes.asignar': (ctx, a) => { estudiantes.asignarAsignaturas(ctx, a.matriculaId, a.asignaturas); return true; },
    'estudiantes.elegirExcel': async (ctx) => {
      requerirPermiso(ctx, 'estudiantes', 'editar');
      return ui.abrirArchivo('Seleccione el archivo de Excel', [{ name: 'Excel', extensions: ['xlsx'] }]);
    },
    'estudiantes.importar': (ctx, a) => estudiantes.importar(ctx, a.archivo, { cursilloId: a.cursilloId, grupoId: a.grupoId, simular: !!a.simular }),
    'estudiantes.plantilla': async (ctx) => {
      requerirPermiso(ctx, 'estudiantes', 'ver');
      const destino = await ui.guardarArchivo('Guardar plantilla', 'plantilla_estudiantes_MEIF.xlsx', XLSX);
      if (!destino) return null;
      await estudiantes.plantillaImportacion(destino);
      await ui.abrirRuta(destino);
      return destino;
    },

    // ------------------------------------------------------------ horarios
    'horarios.listar': (ctx, a) => horarios.listar(ctx, a ?? {}),
    'horarios.verificar': (ctx, a) => horarios.verificarLote(ctx, a),
    'horarios.crear': (ctx, a) => horarios.crear(ctx, a.lote, a.opciones),
    'horarios.actualizar': (ctx, a) => { horarios.actualizar(ctx, a); return true; },
    'horarios.estado': (ctx, a) => { horarios.cambiarEstado(ctx, a.id, a.estado); return true; },
    'horarios.eliminar': (ctx, a) => { horarios.eliminar(ctx, a.id); return true; },
    'horarios.horasDocente': (ctx, a) => horarios.horasDocente(ctx, a.docenteId),

    // ---------------------------------------------------------- planeación
    'planeacion.obtener': (ctx, a) => planeacion.obtener(ctx, a.asignaturaId),
    'planeacion.guardarTematica': (ctx, a) => planeacion.guardarTematica(ctx, a),
    'planeacion.eliminarTematica': (ctx, a) => { planeacion.eliminarTematica(ctx, a.asignaturaId, a.id); return true; },
    'planeacion.reordenar': (ctx, a) => { planeacion.reordenar(ctx, a.asignaturaId, a.ids); return true; },
    'planeacion.redistribuir': (ctx, a) => planeacion.redistribuir(ctx, a.asignaturaId, a.horas, !!a.ajustar),
    'planeacion.resumenGeneral': (ctx, a) => planeacion.resumenGeneral(ctx, a ?? {}),
    'planeacion.tematicas': (ctx, a) => {
      requerirPermiso(ctx, 'horarios', 'ver');
      return ctx.db.all(
        `SELECT t.id, t.unidad || ': ' || t.tema AS label FROM tematicas t JOIN planeaciones p ON p.id = t.planeacion_id
         WHERE p.asignatura_id = ? AND t.eliminado_en IS NULL AND p.eliminado_en IS NULL ORDER BY t.orden`, [a.asignaturaId],
      );
    },

    // ------------------------------------------------------------ material
    'material.listar': (ctx, a) => material.listar(ctx, a ?? {}),
    'material.elegirArchivo': async (ctx) => {
      requerirPermiso(ctx, 'material', 'editar');
      const ruta = await ui.abrirArchivo('Seleccione el archivo', [
        { name: 'Material educativo', extensions: material.EXTENSIONES_PERMITIDAS.map((e) => e.slice(1)) },
      ]);
      return ruta ? { ruta, nombre: path.basename(ruta), tamano: fs.statSync(ruta).size } : null;
    },
    'material.subir': (ctx, a) => material.subir(ctx, a.datos, a.archivo),
    'material.actualizar': (ctx, a) => { material.actualizar(ctx, a); return true; },
    'material.eliminar': (ctx, a) => { material.eliminar(ctx, a.id); return true; },
    'material.abrir': async (ctx, a) => { await ui.abrirRuta(material.rutaArchivo(ctx, a.id).ruta); return true; },
    'material.descargar': async (ctx, a) => {
      const { ruta, nombre } = material.rutaArchivo(ctx, a.id);
      const ext = path.extname(nombre).slice(1);
      const destino = await ui.guardarArchivo('Descargar material', nombre, [{ name: ext.toUpperCase(), extensions: [ext] }]);
      if (!destino) return null;
      fs.copyFileSync(ruta, destino);
      return destino;
    },

    // ---------------------------------------------------------- asistencia
    'asistencia.planilla': (ctx, a) => asistencia.planilla(ctx, a.horarioId),
    'asistencia.registrar': (ctx, a) => asistencia.registrar(ctx, a.horarioId, a.registros, a.marcarEjecutada !== false),
    'asistencia.estudiante': (ctx, a) => asistencia.resumenEstudiante(ctx, a.estudianteId),
    'asistencia.grupo': (ctx, a) => asistencia.resumenGrupo(ctx, a.grupoId, a.asignaturaId),

    // -------------------------------------------------------- certificados
    'certificados.elegibles': (ctx, a) => certificados.elegibles(ctx, a.cursilloId),
    'certificados.generar': async (ctx, a) => {
      const r = await certificados.generar(ctx, a.matriculas, { autorizacion: a.autorizacion });
      return r;
    },
    'certificados.listar': (ctx, a) => certificados.listar(ctx, a ?? {}),
    'certificados.ver': async (ctx, a) => { await ui.mostrarPdf(await certificados.archivo(ctx, a.id), 'Certificado'); return true; },
    'certificados.verLote': async (ctx, a) => {
      const ruta = a.ruta && fs.existsSync(a.ruta) && path.resolve(a.ruta).startsWith(path.resolve(ctx.rutas.certificados))
        ? a.ruta : await certificados.combinar(ctx, a.ids ?? []);
      await ui.mostrarPdf(ruta, 'Certificados');
      return true;
    },
    'certificados.abrirExterno': async (ctx, a) => { await ui.abrirRuta(await certificados.archivo(ctx, a.id)); return true; },
    'certificados.guardarComo': async (ctx, a) => {
      const origen = a.ids?.length > 1 ? await certificados.combinar(ctx, a.ids) : await certificados.archivo(ctx, a.ids?.[0] ?? a.id);
      const destino = await ui.guardarArchivo('Guardar certificado', path.basename(origen), PDF);
      if (!destino) return null;
      fs.copyFileSync(origen, destino);
      return destino;
    },
    'certificados.regenerar': async (ctx, a) => { requerirPermiso(ctx, 'certificados', 'editar'); await certificados.regenerarPdf(ctx, a.id); return true; },
    'certificados.anular': (ctx, a) => { certificados.anular(ctx, a.id, a.motivo); return true; },
    'certificados.verificar': (ctx, a) => certificados.verificar(ctx, a.texto),

    // ------------------------------------------------------------ reportes
    'reportes.catalogo': (ctx) => reportes.catalogo(ctx),
    'reportes.vista': (ctx, a) => reportes.construir(ctx, a.id, a.filtros ?? {}),
    'reportes.exportar': (ctx, a) => exportarReporte(ctx, reportes.construir(ctx, a.id, a.filtros ?? {}), a.formato),
    'reportes.exportarTabla': (ctx, a) => { requerirSesion(ctx); return exportarReporte(ctx, reportes.tablaLibre(a.tabla), a.formato); },

    // --------------------------------------------------------------- panel
    'dashboard.indicadores': (ctx, a) => dashboard.indicadores(ctx, a?.mes),

    // ----------------------------------------------------- usuarios y roles
    'usuarios.listar': (ctx) => auth.listarUsuarios(ctx),
    'usuarios.roles': (ctx) => auth.listarRoles(ctx),
    'usuarios.guardar': (ctx, a) => auth.guardarUsuario(ctx, a),
    'usuarios.eliminar': (ctx, a) => { auth.eliminarUsuario(ctx, a.id); return true; },
    'usuarios.permisos': (ctx) => auth.matrizPermisos(ctx),
    'usuarios.guardarPermiso': (ctx, a) => { auth.guardarPermiso(ctx, a.rolId, a.modulo, a.permiso); return true; },
    'usuarios.auditoria': (ctx, a) => auth.auditoria(ctx, a ?? {}),

    // ------------------------------------------------------- configuración
    'config.leer': (ctx) => { requerirSesion(ctx); return config.configPublica(ctx); },
    'config.guardar': (ctx, a) => { config.guardarConfig(ctx, a); return true; },
    'config.imagenes': (ctx) => {
      requerirSesion(ctx);
      return Object.fromEntries(config.IMAGENES.map((i) => [i, config.imagenDataUrl(ctx, i)]));
    },
    'config.cargarImagen': async (ctx, a) => {
      requerirPermiso(ctx, 'configuracion', 'editar');
      const ruta = await ui.abrirArchivo('Seleccione la imagen', [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg'] }]);
      if (!ruta) return false;
      config.guardarImagen(ctx, a.imagen, ruta);
      return true;
    },
    'config.quitarImagen': (ctx, a) => { config.guardarImagen(ctx, a.imagen, null); return true; },
    'config.vistaPreviaCertificado': async (ctx) => {
      requerirPermiso(ctx, 'configuracion', 'ver');
      const id = ctx.db.valor<number>('SELECT id FROM certificados ORDER BY id DESC LIMIT 1');
      if (!id) throw new ErrorNegocio('Aún no hay certificados emitidos para previsualizar el diseño. Genere uno desde el módulo Certificados.');
      await ui.mostrarPdf(await certificados.regenerarPdf(ctx, id), 'Vista previa del certificado');
      return true;
    },

    // ----------------------------------------------------------- respaldos
    'respaldo.listar': (ctx) => respaldo.listar(ctx),
    'respaldo.crear': (ctx) => respaldo.crear(ctx, 'manual'),
    'respaldo.exportar': async (ctx) => {
      requerirPermiso(ctx, 'configuracion', 'editar');
      const dir = await ui.elegirCarpeta('Elija dónde guardar la copia (por ejemplo, una memoria USB)');
      if (!dir) return null;
      return respaldo.crear(ctx, 'manual', dir);
    },
    'respaldo.restaurar': async (ctx, a) => {
      const s = requerirPermiso(ctx, 'configuracion', 'editar');
      if (s.rol !== 'superadmin') throw new ErrorNegocio('Solo el superadministrador puede restaurar copias de seguridad.');
      let origen: string | null = a?.ruta ?? null;
      if (origen) {
        // Solo se aceptan rutas de la lista de respaldos internos; las externas se eligen con el diálogo.
        if (!path.resolve(origen).startsWith(path.resolve(ctx.rutas.respaldos))) throw new ErrorNegocio('Ruta de respaldo no válida.');
      } else {
        origen = a?.carpeta
          ? await ui.elegirCarpeta('Seleccione la carpeta del respaldo')
          : await ui.abrirArchivo('Seleccione la base de datos a restaurar', [{ name: 'Base de datos MEIF', extensions: ['sqlite', 'db'] }]);
      }
      if (!origen) return false;
      await app.restaurar(origen);
      return true;
    },
    'respaldo.abrirCarpeta': (ctx) => { requerirPermiso(ctx, 'configuracion', 'ver'); ui.mostrarEnCarpeta(ctx.rutas.respaldos); return true; },
  };
}

/** Ejecuta una ruta y traduce errores a mensajes legibles. */
export async function despachar(app: Aplicacion, rutas: Record<string, Ruta>, canal: string, args: unknown): Promise<Respuesta> {
  const fn = rutas[canal];
  if (!fn) return { ok: false, error: `Operación desconocida: ${canal}` };
  if (!app.ctx) return { ok: false, error: 'La base de datos no está disponible.' };
  try {
    const data = await fn(app.ctx, args);
    app.ctx?.db.guardar();
    return { ok: true, data: data === undefined ? null : data };
  } catch (e: any) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message, detalle: e.detalle };
    const msg = String(e?.message ?? e);
    if (msg.includes('UNIQUE constraint')) return { ok: false, error: 'Ya existe un registro con esos datos (duplicado).' };
    if (msg.includes('FOREIGN KEY')) return { ok: false, error: 'La operación afecta registros relacionados y no se puede completar.' };
    if (msg.includes('CHECK constraint')) return { ok: false, error: 'Algún valor no cumple las reglas de validación.' };
    console.error(`[${canal}]`, e);
    return { ok: false, error: `Error inesperado: ${msg}` };
  }
}
