/** Reportes en PDF y Excel, y los indicadores del panel de inicio. */
import ExcelJS from 'exceljs';
import { generarReportePdf, type Reporte } from '../pdf/reporte';
import { resumenEvento } from './asistencia';
import { auditar, DURACION_SQL, ErrorNegocio, hoy, redondear, requerirSesion, type Contexto } from './comun';
import { leerConfig, rutaImagen } from './config';
import { listar as listarCertificados } from './certificados';
import { horarioDocentes } from './organizacion';
import { listar as listarDatos } from './datos';
import { paraDocumentos } from './firmas';

export interface Filtros { eventoId?: number | null; anio?: number | null; ponenteId?: number | null }

const nombreEvento = (ctx: Contexto, id?: number | null) => (id ? ctx.db.valor<string>('SELECT nombre FROM eventos WHERE id = ?', [id]) : '');
const requiereEvento = (f: Filtros) => { if (!f.eventoId) throw new ErrorNegocio('Seleccione el evento.'); };

export const REPORTES: { id: string; nombre: string; filtro: 'evento' | 'anio' | 'ninguno'; construir: (ctx: Contexto, f: Filtros) => Reporte }[] = [
  {
    id: 'eventos', nombre: 'Eventos del año', filtro: 'anio',
    construir: (ctx, f) => {
      const filas = ctx.db.all(
        `SELECT e.nombre, e.tipo, e.fecha_inicio, e.fecha_fin, e.lugar, e.estado,
                (SELECT count(*) FROM inscripciones i WHERE i.evento_id = e.id AND i.estado = 'Inscrito') AS inscritos,
                (SELECT count(*) FROM actividades a WHERE a.evento_id = e.id AND a.eliminado_en IS NULL) AS actividades,
                (SELECT count(*) FROM certificados c WHERE c.evento_id = e.id AND c.anulado = 0) AS certificados
         FROM eventos e WHERE e.eliminado_en IS NULL ${f.anio ? 'AND e.anio = ?' : ''} ORDER BY e.fecha_inicio`, f.anio ? [f.anio] : [],
      );
      return {
        titulo: `Eventos ${f.anio ?? '(todos los años)'}`, filas,
        totales: { nombre: 'TOTAL', inscritos: filas.reduce((s, r) => s + r.inscritos, 0), certificados: filas.reduce((s, r) => s + r.certificados, 0) },
        columnas: [
          { key: 'nombre', label: 'Evento' }, { key: 'tipo', label: 'Tipo' }, { key: 'fecha_inicio', label: 'Inicio' }, { key: 'fecha_fin', label: 'Fin' },
          { key: 'lugar', label: 'Lugar' }, { key: 'estado', label: 'Estado' }, { key: 'inscritos', label: 'Inscritos', align: 'right' },
          { key: 'actividades', label: 'Actividades', align: 'right' }, { key: 'certificados', label: 'Certificados', align: 'right' },
        ],
      };
    },
  },
  {
    id: 'miembros', nombre: 'Directorio de miembros de MEIF', filtro: 'ninguno',
    construir: (ctx) => {
      const filas = listarDatos(ctx, 'miembros', {}).map((m, i) => ({
        n: i + 1, documento: `${m.tipo_documento} ${m.identificacion}`, nombre: `${m.apellidos} ${m.nombres}`, cargo: m.cargo ?? '—',
        area: m.area, profesion: m.profesion, telefono: m.telefono, correo: m.correo, ingreso: m.fecha_ingreso, estado: m.estado,
      }));
      return {
        titulo: 'Directorio de miembros de MEIF', filas,
        columnas: [
          { key: 'n', label: '#', align: 'right' }, { key: 'nombre', label: 'Miembro' }, { key: 'cargo', label: 'Cargo' }, { key: 'documento', label: 'Documento' },
          { key: 'area', label: 'Área' }, { key: 'profesion', label: 'Profesión' }, { key: 'telefono', label: 'Teléfono' }, { key: 'correo', label: 'Correo' },
          { key: 'ingreso', label: 'Ingreso' }, { key: 'estado', label: 'Estado' },
        ],
      };
    },
  },
  {
    id: 'inscritos', nombre: 'Listado de participantes inscritos', filtro: 'evento',
    construir: (ctx, f) => {
      requiereEvento(f);
      const filas = ctx.db.all(
        `SELECT p.tipo_documento || ' ' || p.identificacion AS documento, p.apellidos || ' ' || p.nombres AS nombre, p.institucion, p.grado,
                p.telefono, p.correo, i.fecha FROM inscripciones i JOIN participantes p ON p.id = i.participante_id
         WHERE i.evento_id = ? AND i.estado = 'Inscrito' AND p.eliminado_en IS NULL ORDER BY p.apellidos, p.nombres`, [f.eventoId],
      ).map((r, i) => ({ n: i + 1, ...r }));
      return {
        titulo: `Participantes inscritos – ${nombreEvento(ctx, f.eventoId)}`, filas,
        columnas: [
          { key: 'n', label: '#', align: 'right' }, { key: 'documento', label: 'Documento' }, { key: 'nombre', label: 'Participante' },
          { key: 'institucion', label: 'Institución' }, { key: 'grado', label: 'Grado' }, { key: 'telefono', label: 'Teléfono' },
          { key: 'correo', label: 'Correo' }, { key: 'fecha', label: 'Inscripción' }, { key: 'firma', label: 'Firma', ancho: 90 },
        ],
      };
    },
  },
  {
    id: 'horario_docentes', nombre: 'Horario de docentes (aula y cursillo)', filtro: 'evento',
    construir: (ctx, f) => {
      requiereEvento(f);
      const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const sesiones = horarioDocentes(ctx, Number(f.eventoId), f.ponenteId);
      const filas: Record<string, any>[] = [];
      let actual = '';
      let subtotal = 0;
      const cerrar = () => { if (actual) filas.push({ docente: `Total ${actual}`, horas: redondear(subtotal), _negrita: true }); };
      for (const s of sesiones) {
        if (s.docente !== actual) { cerrar(); actual = s.docente; subtotal = 0; }
        if (s.tipo !== 'Receso') subtotal += s.horas;
        filas.push({
          docente: s.docente, cursillo: s.cursillo, nivel: s.nivel, aula: s.aula, dia: dias[new Date(s.fecha + 'T12:00').getDay()],
          fecha: s.fecha.split('-').reverse().join('/'), hora: `${s.hora_inicio}–${s.hora_fin}`, horas: s.horas,
        });
      }
      cerrar();
      const docente = f.ponenteId ? ctx.db.valor<string>("SELECT nombres || ' ' || apellidos FROM ponentes WHERE id = ?", [f.ponenteId]) : '';
      return {
        titulo: `Horario de docentes – ${nombreEvento(ctx, f.eventoId)}${docente ? ` – ${docente}` : ''}`, filas,
        columnas: [
          { key: 'docente', label: 'Docente' }, { key: 'cursillo', label: 'Cursillo a dictar' }, { key: 'nivel', label: 'Nivel / grupo' },
          { key: 'aula', label: 'Aula' }, { key: 'dia', label: 'Día' }, { key: 'fecha', label: 'Fecha' }, { key: 'hora', label: 'Hora' },
          { key: 'horas', label: 'Horas', align: 'right' },
        ],
      };
    },
  },
  {
    id: 'agenda', nombre: 'Agenda del evento', filtro: 'evento',
    construir: (ctx, f) => {
      requiereEvento(f);
      const filas = ctx.db.all(
        `SELECT a.fecha, a.hora_inicio || ' – ' || a.hora_fin AS hora, a.titulo, a.tipo, a.area, p.nombres || ' ' || p.apellidos AS ponente,
                a.lugar, round(${DURACION_SQL}, 2) AS horas FROM actividades a LEFT JOIN ponentes p ON p.id = a.ponente_id
         WHERE a.evento_id = ? AND a.eliminado_en IS NULL ORDER BY a.fecha, a.hora_inicio`, [f.eventoId],
      );
      return {
        titulo: `Agenda – ${nombreEvento(ctx, f.eventoId)}`, filas, totales: { fecha: 'TOTAL', horas: redondear(filas.filter((r) => r.tipo !== 'Receso').reduce((s, r) => s + r.horas, 0)) },
        columnas: [
          { key: 'fecha', label: 'Fecha' }, { key: 'hora', label: 'Hora' }, { key: 'titulo', label: 'Actividad' }, { key: 'tipo', label: 'Tipo' },
          { key: 'area', label: 'Área' }, { key: 'ponente', label: 'Ponente' }, { key: 'lugar', label: 'Lugar' }, { key: 'horas', label: 'Horas', align: 'right' },
        ],
      };
    },
  },
  {
    id: 'asistencia', nombre: 'Asistencia del evento', filtro: 'evento',
    construir: (ctx, f) => {
      requiereEvento(f);
      const filas = resumenEvento(ctx, Number(f.eventoId)).map((r) => ({
        documento: r.identificacion, nombre: r.nombre, institucion: r.institucion, asistidas: `${r.asistidas} de ${r.actividades}`,
        porcentaje: r.porcentaje == null ? '' : `${r.porcentaje}%`, horas: r.horas, estado: r.aprueba ? 'Cumple' : 'No cumple',
      }));
      return {
        titulo: `Asistencia – ${nombreEvento(ctx, f.eventoId)}`, filas,
        columnas: [
          { key: 'documento', label: 'Documento' }, { key: 'nombre', label: 'Participante' }, { key: 'institucion', label: 'Institución' },
          { key: 'asistidas', label: 'Actividades', align: 'right' }, { key: 'porcentaje', label: '% asistencia', align: 'right' },
          { key: 'horas', label: 'Horas', align: 'right' }, { key: 'estado', label: 'Certificación' },
        ],
      };
    },
  },
  {
    id: 'certificados', nombre: 'Certificados emitidos', filtro: 'evento',
    construir: (ctx, f) => {
      const filas = listarCertificados(ctx, { eventoId: f.eventoId ?? undefined, incluirAnulados: true })
        .map((c) => ({ ...c, estado: c.anulado ? 'Anulado' : 'Vigente', porcentaje: `${c.porcentaje}%` }));
      return {
        titulo: `Certificados emitidos${f.eventoId ? ' – ' + nombreEvento(ctx, f.eventoId) : ''}`, filas,
        columnas: [
          { key: 'codigo', label: 'Código' }, { key: 'fecha_emision', label: 'Emisión' }, { key: 'identificacion', label: 'Documento' },
          { key: 'participante', label: 'Participante' }, { key: 'evento', label: 'Evento' }, { key: 'horas', label: 'Horas', align: 'right' },
          { key: 'porcentaje', label: 'Asistencia', align: 'right' }, { key: 'estado', label: 'Estado' },
        ],
      };
    },
  },
  {
    id: 'ponentes', nombre: 'Ponentes y actividades a cargo', filtro: 'evento',
    construir: (ctx, f) => {
      const filas = ctx.db.all(
        `SELECT p.identificacion, p.nombres || ' ' || p.apellidos AS ponente, p.area, p.telefono, p.correo,
                count(a.id) AS actividades, round(coalesce(sum(${DURACION_SQL}), 0), 2) AS horas
         FROM ponentes p LEFT JOIN actividades a ON a.ponente_id = p.id AND a.eliminado_en IS NULL ${f.eventoId ? 'AND a.evento_id = ?' : ''}
         WHERE p.eliminado_en IS NULL GROUP BY p.id ${f.eventoId ? 'HAVING count(a.id) > 0' : ''} ORDER BY p.apellidos`, f.eventoId ? [f.eventoId] : [],
      );
      return {
        titulo: `Ponentes${f.eventoId ? ' – ' + nombreEvento(ctx, f.eventoId) : ''}`, filas,
        columnas: [
          { key: 'identificacion', label: 'Identificación' }, { key: 'ponente', label: 'Ponente' }, { key: 'area', label: 'Área' },
          { key: 'telefono', label: 'Teléfono' }, { key: 'correo', label: 'Correo' }, { key: 'actividades', label: 'Actividades', align: 'right' },
          { key: 'horas', label: 'Horas', align: 'right' },
        ],
      };
    },
  },
];

export function construir(ctx: Contexto, id: string, f: Filtros): Reporte {
  requerirSesion(ctx);
  const def = REPORTES.find((r) => r.id === id);
  if (!def) throw new ErrorNegocio('Reporte desconocido.');
  return { ...def.construir(ctx, f), subtitulo: `Generado el ${hoy()}` };
}

export async function exportar(ctx: Contexto, r: Reporte, formato: 'pdf' | 'xlsx', destino: string) {
  requerirSesion(ctx);
  const cfg = leerConfig(ctx.db);
  if (formato === 'pdf') await generarReportePdf(destino, r, cfg, rutaImagen(ctx, 'logo'), ctx.sesion!.nombre, cfg.reportes_firmas === '1' ? paraDocumentos(ctx) : []);
  else {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(r.titulo.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
    ws.addRow([cfg.org_nombre]).font = { bold: true, size: 14, color: { argb: 'FF0B2545' } };
    ws.addRow([r.titulo]).font = { bold: true, size: 12 };
    ws.addRow([]);
    const cab = ws.addRow(r.columnas.map((c) => c.label));
    cab.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } }; });
    for (const f of r.filas) ws.addRow(r.columnas.map((c) => f[c.key] ?? null));
    if (r.totales) ws.addRow(r.columnas.map((c) => r.totales![c.key] ?? null)).font = { bold: true };
    r.columnas.forEach((c, i) => { ws.getColumn(i + 1).width = Math.min(50, Math.max(10, c.label.length + 2, ...r.filas.slice(0, 200).map((f) => String(f[c.key] ?? '').length + 2))); });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    await wb.xlsx.writeFile(destino);
  }
  auditar(ctx, `Exportó reporte (${formato})`, r.titulo);
}

/** Indicadores del inicio: del año seleccionado. */
export function panel(ctx: Contexto, anio: number) {
  requerirSesion(ctx);
  const n = (sql: string, p: any[] = []) => Number(ctx.db.valor(sql, p) ?? 0);
  const eventos = ctx.db.all(
    `SELECT e.id, e.nombre, e.tipo, e.fecha_inicio, e.fecha_fin, e.lugar, e.estado,
            (SELECT count(*) FROM inscripciones i WHERE i.evento_id = e.id AND i.estado = 'Inscrito') AS inscritos
     FROM eventos e WHERE e.eliminado_en IS NULL AND e.anio = ? ORDER BY e.fecha_inicio`, [anio],
  );
  return {
    anio,
    kpis: {
      eventos: eventos.length,
      realizados: eventos.filter((e) => e.estado === 'Finalizado').length,
      proximos: eventos.filter((e) => e.fecha_inicio >= hoy() && e.estado !== 'Cancelado').length,
      participantes: n(`SELECT count(DISTINCT i.participante_id) FROM inscripciones i JOIN eventos e ON e.id = i.evento_id WHERE e.anio = ? AND i.estado = 'Inscrito' AND e.eliminado_en IS NULL`, [anio]),
      ponentes: n(`SELECT count(DISTINCT a.ponente_id) FROM actividades a JOIN eventos e ON e.id = a.evento_id WHERE e.anio = ? AND a.eliminado_en IS NULL`, [anio]),
      certificados: n('SELECT count(*) FROM certificados c JOIN eventos e ON e.id = c.evento_id WHERE e.anio = ? AND c.anulado = 0', [anio]),
    },
    eventos,
    proximasActividades: ctx.db.all(
      `SELECT a.id, a.fecha, a.hora_inicio, a.hora_fin, a.titulo, a.lugar, e.nombre AS evento FROM actividades a JOIN eventos e ON e.id = a.evento_id
       WHERE a.eliminado_en IS NULL AND e.eliminado_en IS NULL AND a.fecha >= ? ORDER BY a.fecha, a.hora_inicio LIMIT 6`, [hoy()],
    ),
  };
}
