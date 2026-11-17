/**
 * Generación y verificación de certificados.
 *
 * Condiciones de aprobación (configurables por cursillo):
 *  - Matrícula activa o finalizada.
 *  - Al menos una clase ejecutada.
 *  - Porcentaje de asistencia ≥ asistencia mínima del cursillo.
 * Horas certificadas = horas efectivamente asistidas por asignatura, sin superar la
 * intensidad horaria de cada asignatura.
 *
 * Autenticidad: cada certificado tiene un código único y una firma HMAC-SHA256
 * (con un secreto propio de la instalación) de sus datos esenciales. El QR contiene
 * el código, la identificación, las horas y la firma; al verificarlo se recalcula la
 * firma y se compara con el registro.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { dibujarCertificado, type DatosCertificado } from '../pdf/certificado';
import { estadisticasMatricula } from './asistencia';
import { auditar, ErrorNegocio, formatoFechaLarga, hoy, limpiar, redondear, requerirPermiso, type Contexto } from './comun';
import { leerConfig, rutaImagen, secretoCertificados } from './config';

const PREFIJO_QR = 'MEIF-SABANALARGA';

export interface Elegible {
  matricula_id: number;
  estudiante_id: number;
  identificacion: string;
  nombre: string;
  grupo: string | null;
  estado_matricula: string;
  clases: number;
  porcentaje: number | null;
  horas_certificables: number;
  aprobado: boolean;
  motivo: string | null;
  certificado: { id: number; codigo: string; fecha_emision: string } | null;
}

function calcular(ctx: Contexto, matriculaId: number, minimo: number) {
  const r = estadisticasMatricula(ctx.db, matriculaId);
  const asignaturas = r.asignaturas
    .map((a) => ({ nombre: a.asignatura, area: a.area, horas: redondear(Math.min(a.horas_asistidas, a.intensidad_horaria)) }))
    .filter((a) => a.horas > 0);
  const horas = redondear(asignaturas.reduce((s, a) => s + a.horas, 0));
  let motivo: string | null = null;
  if (!r.clases) motivo = 'Sin clases ejecutadas en sus asignaturas.';
  else if ((r.porcentaje ?? 0) < minimo) motivo = `Asistencia ${r.porcentaje}% (mínimo ${minimo}%).`;
  else if (horas <= 0) motivo = 'No registra horas asistidas.';
  return { resumen: r, asignaturas, horas, aprobado: motivo === null, motivo };
}

export function elegibles(ctx: Contexto, cursilloId: number): { cursillo: any; estudiantes: Elegible[] } {
  requerirPermiso(ctx, 'certificados', 'ver');
  const cursillo = ctx.db.get('SELECT * FROM cursillos WHERE id = ? AND eliminado_en IS NULL', [cursilloId]);
  if (!cursillo) throw new ErrorNegocio('Cursillo no encontrado.');
  const mats = ctx.db.all(
    `SELECT m.id, m.estudiante_id, m.estado, e.identificacion, e.apellidos || ' ' || e.nombres AS nombre, g.nombre AS grupo
     FROM matriculas m JOIN estudiantes e ON e.id = m.estudiante_id LEFT JOIN grupos g ON g.id = m.grupo_id
     WHERE m.cursillo_id = ? AND m.eliminado_en IS NULL AND e.eliminado_en IS NULL AND m.estado <> 'Anulada'
     ORDER BY e.apellidos, e.nombres`, [cursilloId],
  );
  const estudiantes = mats.map((m): Elegible => {
    const c = calcular(ctx, m.id, cursillo.asistencia_minima);
    const retirado = m.estado === 'Retirada';
    return {
      matricula_id: m.id, estudiante_id: m.estudiante_id, identificacion: m.identificacion, nombre: m.nombre, grupo: m.grupo,
      estado_matricula: m.estado, clases: c.resumen.clases, porcentaje: c.resumen.porcentaje, horas_certificables: c.horas,
      aprobado: c.aprobado && !retirado, motivo: retirado ? 'Matrícula retirada.' : c.motivo,
      certificado: ctx.db.get('SELECT id, codigo, fecha_emision FROM certificados WHERE matricula_id = ? AND anulado = 0', [m.id]) ?? null,
    };
  });
  return { cursillo, estudiantes };
}

function nuevoCodigo(ctx: Contexto): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const bytes = crypto.randomBytes(8);
    const sufijo = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
    const codigo = `MEIF-${new Date().getFullYear()}-${sufijo}`;
    if (!ctx.db.get('SELECT 1 FROM certificados WHERE codigo = ?', [codigo])) return codigo;
  }
}

function firmar(ctx: Contexto, c: { codigo: string; identificacion: string; horas: number; cursillo_id: number; fecha: string }): string {
  return crypto.createHmac('sha256', secretoCertificados(ctx.db))
    .update(`${c.codigo}|${c.identificacion}|${c.horas}|${c.cursillo_id}|${c.fecha}`).digest('hex').slice(0, 20);
}

const contenidoQr = (codigo: string, identificacion: string, horas: number, firma: string) =>
  `${PREFIJO_QR}|${codigo}|${identificacion}|${horas}|${firma}`;

function rutaPdf(ctx: Contexto, codigo: string, fecha: string): string {
  const dir = path.join(ctx.rutas.certificados, fecha.slice(0, 4));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${codigo}.pdf`);
}

async function datosPdf(ctx: Contexto, certId: number): Promise<DatosCertificado> {
  const c = ctx.db.get(
    `SELECT k.*, e.nombres || ' ' || e.apellidos AS nombre, e.tipo_documento, e.identificacion, cu.nombre AS cursillo,
            cu.fecha_inicio, cu.fecha_fin
     FROM certificados k JOIN estudiantes e ON e.id = k.estudiante_id JOIN cursillos cu ON cu.id = k.cursillo_id WHERE k.id = ?`, [certId],
  );
  if (!c) throw new ErrorNegocio('Certificado no encontrado.');
  const detalle = JSON.parse(c.detalle);
  const qr = await QRCode.toBuffer(contenidoQr(c.codigo, detalle.identificacion, c.horas_certificadas, c.firma_hash), {
    errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#0B2545', light: '#FFFFFF' },
  });
  return {
    codigo: c.codigo, nombre: detalle.nombre ?? c.nombre, tipoDocumento: detalle.tipo_documento ?? c.tipo_documento,
    identificacion: detalle.identificacion, cursillo: detalle.cursillo ?? c.cursillo,
    fechaInicio: formatoFechaLarga(detalle.fecha_inicio ?? c.fecha_inicio), fechaFin: formatoFechaLarga(detalle.fecha_fin ?? c.fecha_fin),
    fechaEmision: formatoFechaLarga(c.fecha_emision), horas: c.horas_certificadas, asignaturas: detalle.asignaturas, qr,
    anulado: !!c.anulado,
  };
}

function diseno(ctx: Contexto) {
  return {
    config: leerConfig(ctx.db), logo: rutaImagen(ctx, 'logo'),
    firmaDirector: rutaImagen(ctx, 'firma_director'), firmaCoordinador: rutaImagen(ctx, 'firma_coordinador'),
  };
}

/** Escribe uno o varios certificados en un solo PDF. */
async function escribirPdf(ctx: Contexto, certIds: number[], destino: string): Promise<void> {
  const dis = diseno(ctx);
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0, autoFirstPage: false, info: { Title: 'Certificado', Author: dis.config.org_nombre } });
  const stream = fs.createWriteStream(destino);
  doc.pipe(stream);
  for (const id of certIds) {
    const datos = await datosPdf(ctx, id);
    doc.addPage();
    dibujarCertificado(doc, datos, dis);
  }
  doc.end();
  await new Promise<void>((res, rej) => { stream.on('finish', () => res()); stream.on('error', rej); });
}

export interface ResultadoGeneracion {
  generados: { id: number; codigo: string; nombre: string; archivo: string }[];
  omitidos: { nombre: string; motivo: string }[];
  lote: string | null;
}

/**
 * Genera certificados (individual o masivo). No duplica certificados vigentes del
 * mismo estudiante y cursillo, salvo que se indique una autorización administrativa
 * (motivo), en cuyo caso el anterior queda anulado y se emite uno nuevo.
 */
export async function generar(ctx: Contexto, matriculaIds: number[], opciones: { autorizacion?: string } = {}): Promise<ResultadoGeneracion> {
  const s = requerirPermiso(ctx, 'certificados', 'editar');
  if (!matriculaIds.length) throw new ErrorNegocio('Seleccione al menos un estudiante.');
  const autorizacion = limpiar(opciones.autorizacion);
  if (autorizacion && !['superadmin', 'coordinador'].includes(s.rol)) {
    throw new ErrorNegocio('Solo el superadministrador o el coordinador académico pueden autorizar la reemisión de certificados.');
  }
  const cfg = leerConfig(ctx.db);
  if (!cfg.director_nombre) throw new ErrorNegocio('Configure el nombre del director o coordinador que firma (Configuración > Institución).');

  const res: ResultadoGeneracion = { generados: [], omitidos: [], lote: null };
  const fecha = hoy();
  for (const mid of matriculaIds) {
    const m = ctx.db.get(
      `SELECT m.*, e.nombres || ' ' || e.apellidos AS nombre, e.tipo_documento, e.identificacion, c.nombre AS cursillo,
              c.fecha_inicio, c.fecha_fin, c.asistencia_minima
       FROM matriculas m JOIN estudiantes e ON e.id = m.estudiante_id JOIN cursillos c ON c.id = m.cursillo_id
       WHERE m.id = ? AND m.eliminado_en IS NULL`, [mid],
    );
    if (!m) { res.omitidos.push({ nombre: `Matrícula ${mid}`, motivo: 'No existe.' }); continue; }
    if (!['Activa', 'Finalizada'].includes(m.estado)) { res.omitidos.push({ nombre: m.nombre, motivo: `Matrícula ${m.estado.toLowerCase()}.` }); continue; }
    const calc = calcular(ctx, mid, m.asistencia_minima);
    if (!calc.aprobado) { res.omitidos.push({ nombre: m.nombre, motivo: calc.motivo! }); continue; }
    const previo = ctx.db.get('SELECT * FROM certificados WHERE estudiante_id = ? AND cursillo_id = ? AND anulado = 0', [m.estudiante_id, m.cursillo_id]);
    if (previo && !autorizacion) {
      res.omitidos.push({ nombre: m.nombre, motivo: `Ya tiene certificado vigente (${previo.codigo}). Requiere autorización para reemitir.` });
      continue;
    }
    const codigo = nuevoCodigo(ctx);
    const firma = firmar(ctx, { codigo, identificacion: m.identificacion, horas: calc.horas, cursillo_id: m.cursillo_id, fecha });
    const detalle = {
      nombre: m.nombre, tipo_documento: m.tipo_documento, identificacion: m.identificacion, cursillo: m.cursillo,
      fecha_inicio: m.fecha_inicio, fecha_fin: m.fecha_fin, asignaturas: calc.asignaturas,
    };
    const archivo = rutaPdf(ctx, codigo, fecha);
    const id = ctx.db.tx(() => {
      if (previo) {
        ctx.db.actualizar('certificados', previo.id, { anulado: 1, motivo_anulacion: `Reemitido. Autorización: ${autorizacion}` });
        auditar(ctx, 'Anuló certificado por reemisión', 'certificados', previo.id, autorizacion);
      }
      const nid = ctx.db.insertar('certificados', {
        codigo, matricula_id: mid, estudiante_id: m.estudiante_id, cursillo_id: m.cursillo_id, fecha_emision: fecha,
        horas_certificadas: calc.horas, porcentaje_asistencia: calc.resumen.porcentaje ?? 0, detalle: JSON.stringify(detalle),
        firma_hash: firma, archivo_ruta: path.relative(ctx.rutas.certificados, archivo), emitido_por: s.id,
        autorizacion: previo ? autorizacion : null,
      });
      auditar(ctx, previo ? 'Reemitió certificado' : 'Generó certificado', 'certificados', nid, { codigo, estudiante: m.nombre, horas: calc.horas });
      return nid;
    });
    await escribirPdf(ctx, [id], archivo);
    if (previo) await regenerarPdf(ctx, previo.id).catch(() => undefined);
    res.generados.push({ id, codigo, nombre: m.nombre, archivo });
  }
  if (res.generados.length > 1) {
    const dir = path.join(ctx.rutas.certificados, 'lotes');
    fs.mkdirSync(dir, { recursive: true });
    res.lote = path.join(dir, `lote-${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`);
    await escribirPdf(ctx, res.generados.map((g) => g.id), res.lote);
  }
  return res;
}

/** Vuelve a dibujar el PDF (por ejemplo, tras cambiar el diseño o si el archivo se perdió). */
export async function regenerarPdf(ctx: Contexto, certId: number): Promise<string> {
  requerirPermiso(ctx, 'certificados', 'ver');
  const c = ctx.db.get('SELECT * FROM certificados WHERE id = ?', [certId]);
  if (!c) throw new ErrorNegocio('Certificado no encontrado.');
  const archivo = rutaPdf(ctx, c.codigo, c.fecha_emision);
  await escribirPdf(ctx, [certId], archivo);
  return archivo;
}

/** Ruta del PDF; si no existe se regenera. */
export async function archivo(ctx: Contexto, certId: number): Promise<string> {
  requerirPermiso(ctx, 'certificados', 'ver');
  const c = ctx.db.get('SELECT * FROM certificados WHERE id = ?', [certId]);
  if (!c) throw new ErrorNegocio('Certificado no encontrado.');
  const ruta = path.join(ctx.rutas.certificados, c.archivo_ruta ?? '');
  if (c.archivo_ruta && fs.existsSync(ruta)) return ruta;
  return regenerarPdf(ctx, certId);
}

/** PDF combinado de varios certificados (para imprimir en lote). */
export async function combinar(ctx: Contexto, certIds: number[]): Promise<string> {
  requerirPermiso(ctx, 'certificados', 'ver');
  if (!certIds.length) throw new ErrorNegocio('Seleccione certificados.');
  const dir = path.join(ctx.rutas.certificados, 'lotes');
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `impresion-${Date.now()}.pdf`);
  await escribirPdf(ctx, certIds, destino);
  return destino;
}

export function anular(ctx: Contexto, certId: number, motivo: string): void {
  const s = requerirPermiso(ctx, 'certificados', 'eliminar');
  if (!['superadmin', 'coordinador'].includes(s.rol)) throw new ErrorNegocio('Solo el superadministrador o el coordinador pueden anular certificados.');
  const m = limpiar(motivo);
  if (!m) throw new ErrorNegocio('Indique el motivo de la anulación.');
  const c = ctx.db.get('SELECT * FROM certificados WHERE id = ? AND anulado = 0', [certId]);
  if (!c) throw new ErrorNegocio('El certificado no existe o ya está anulado.');
  ctx.db.actualizar('certificados', certId, { anulado: 1, motivo_anulacion: m });
  auditar(ctx, 'Anuló certificado', 'certificados', certId, { codigo: c.codigo, motivo: m });
}

export function listar(ctx: Contexto, f: { cursilloId?: number; busqueda?: string; desde?: string; hasta?: string; incluirAnulados?: boolean } = {}) {
  requerirPermiso(ctx, 'certificados', 'ver');
  const w = ['1 = 1'];
  const p: any[] = [];
  if (!f.incluirAnulados) w.push('k.anulado = 0');
  if (f.cursilloId) { w.push('k.cursillo_id = ?'); p.push(f.cursilloId); }
  if (f.desde) { w.push('k.fecha_emision >= ?'); p.push(f.desde); }
  if (f.hasta) { w.push('k.fecha_emision <= ?'); p.push(f.hasta); }
  const t = limpiar(f.busqueda);
  if (t) { w.push("(k.codigo LIKE ? OR e.identificacion LIKE ? OR e.nombres || ' ' || e.apellidos LIKE ?)"); p.push(`%${t}%`, `%${t}%`, `%${t}%`); }
  return ctx.db.all(
    `SELECT k.id, k.codigo, k.fecha_emision, k.horas_certificadas, k.porcentaje_asistencia, k.anulado, k.motivo_anulacion,
            k.autorizacion, e.identificacion, e.nombres || ' ' || e.apellidos AS estudiante, c.nombre AS cursillo, u.nombre AS emitido_por
     FROM certificados k JOIN estudiantes e ON e.id = k.estudiante_id JOIN cursillos c ON c.id = k.cursillo_id
     LEFT JOIN usuarios u ON u.id = k.emitido_por
     WHERE ${w.join(' AND ')} ORDER BY k.fecha_emision DESC, k.id DESC`, p,
  );
}

export type ResultadoVerificacion =
  | { estado: 'valido' | 'anulado'; mensaje: string; certificado: any }
  | { estado: 'no_encontrado' | 'alterado' | 'formato'; mensaje: string; certificado?: undefined };

/** Verifica un certificado a partir del contenido del QR o del código impreso. */
export function verificar(ctx: Contexto, entrada: string): ResultadoVerificacion {
  requerirPermiso(ctx, 'certificados', 'ver');
  const t = String(entrada ?? '').trim();
  if (!t) return { estado: 'formato', mensaje: 'Ingrese el código del certificado o escanee el QR.' };
  let codigo = t.toUpperCase();
  let qr: { identificacion: string; horas: number; firma: string } | null = null;
  if (t.includes('|')) {
    const partes = t.split('|');
    if (partes[0] !== PREFIJO_QR || partes.length !== 5) return { estado: 'formato', mensaje: 'El código QR no corresponde a un certificado de MEIF – SABANALARGA.' };
    codigo = partes[1];
    qr = { identificacion: partes[2], horas: Number(partes[3]), firma: partes[4] };
  }
  const c = ctx.db.get(
    `SELECT k.*, c.nombre AS cursillo, e.nombres || ' ' || e.apellidos AS estudiante, e.identificacion
     FROM certificados k JOIN cursillos c ON c.id = k.cursillo_id JOIN estudiantes e ON e.id = k.estudiante_id WHERE k.codigo = ?`, [codigo],
  );
  if (!c) return { estado: 'no_encontrado', mensaje: `No existe ningún certificado con el código ${codigo}.` };
  const det = JSON.parse(c.detalle);
  const esperada = firmar(ctx, { codigo: c.codigo, identificacion: det.identificacion, horas: c.horas_certificadas, cursillo_id: c.cursillo_id, fecha: c.fecha_emision });
  const integro = esperada === c.firma_hash
    && (!qr || (qr.firma === c.firma_hash && qr.identificacion === det.identificacion && qr.horas === c.horas_certificadas));
  auditar(ctx, 'Verificó certificado', 'certificados', c.id, { codigo, resultado: integro ? (c.anulado ? 'anulado' : 'valido') : 'alterado' });
  if (!integro) return { estado: 'alterado', mensaje: 'Los datos del certificado no coinciden con la firma registrada: el documento pudo ser alterado.' };
  const certificado = {
    codigo: c.codigo, estudiante: det.nombre, identificacion: det.identificacion, cursillo: det.cursillo,
    fecha_emision: c.fecha_emision, horas: c.horas_certificadas, asignaturas: det.asignaturas, motivo_anulacion: c.motivo_anulacion,
  };
  if (c.anulado) return { estado: 'anulado', mensaje: `El certificado existe pero fue ANULADO. Motivo: ${c.motivo_anulacion}`, certificado };
  return { estado: 'valido', mensaje: 'Certificado auténtico y vigente.', certificado };
}
