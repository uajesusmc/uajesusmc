/**
 * Certificados de participación con código único, firma HMAC y QR de verificación.
 * Se emiten a los inscritos que cumplan la asistencia mínima del evento; no se
 * duplican (un certificado vigente por participante y evento) salvo reemisión
 * autorizada, que anula el anterior.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { dibujarCertificado } from '../pdf/certificado';
import { resumenEvento } from './asistencia';
import { auditar, ErrorNegocio, fechaLarga, hoy, limpiar, requerirAdmin, requerirEdicion, requerirSesion, type Contexto } from './comun';
import { leerConfig, rutaImagen, secreto } from './config';
import { paraDocumentos } from './firmas';

const PREFIJO = 'MEIF-EVENTOS';

export function elegibles(ctx: Contexto, eventoId: number) {
  requerirSesion(ctx);
  return resumenEvento(ctx, eventoId).map((r) => ({
    ...r,
    certificado: ctx.db.get('SELECT id, codigo, fecha_emision FROM certificados WHERE evento_id = ? AND participante_id = ? AND anulado = 0', [eventoId, r.participante_id]) ?? null,
    motivo: r.inscripcion !== 'Inscrito' ? 'Inscripción cancelada.' : !r.actividades ? 'Aún no hay asistencia registrada en el evento.'
      : r.aprueba ? null : `Asistencia ${r.porcentaje}% (mínimo requerido no alcanzado).`,
  }));
}

function firmar(ctx: Contexto, c: { codigo: string; identificacion: string; horas: number; evento_id: number; fecha: string }) {
  return crypto.createHmac('sha256', secreto(ctx.db)).update(`${c.codigo}|${c.identificacion}|${c.horas}|${c.evento_id}|${c.fecha}`).digest('hex').slice(0, 20);
}

function nuevoCodigo(ctx: Contexto) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const c = `EV-${new Date().getFullYear()}-${[...crypto.randomBytes(8)].map((b) => abc[b % abc.length]).join('')}`;
    if (!ctx.db.get('SELECT 1 FROM certificados WHERE codigo = ?', [c])) return c;
  }
}

async function escribirPdf(ctx: Contexto, ids: number[], destino: string) {
  const cfg = leerConfig(ctx.db);
  const logo = rutaImagen(ctx, 'logo');
  const firmas = paraDocumentos(ctx);
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 0, autoFirstPage: false, info: { Title: 'Certificado', Author: cfg.org_nombre } });
  const st = fs.createWriteStream(destino);
  doc.pipe(st);
  for (const id of ids) {
    const c = ctx.db.get('SELECT * FROM certificados WHERE id = ?', [id]);
    const det = JSON.parse(c.detalle);
    const qr = await QRCode.toBuffer(`${PREFIJO}|${c.codigo}|${det.identificacion}|${c.horas}|${c.firma_hash}`, { margin: 1, width: 360, color: { dark: '#0B2545', light: '#FFFFFF' } });
    doc.addPage();
    dibujarCertificado(doc, {
      codigo: c.codigo, nombre: det.nombre, tipoDocumento: det.tipo_documento, identificacion: det.identificacion, evento: det.evento,
      lugar: det.lugar ?? '', fechaInicio: fechaLarga(det.fecha_inicio), fechaFin: fechaLarga(det.fecha_fin), fechaEmision: fechaLarga(c.fecha_emision),
      horas: c.horas, actividades: det.actividades, qr, anulado: !!c.anulado,
    }, cfg, logo, firmas);
  }
  doc.end();
  await new Promise<void>((ok, mal) => { st.on('finish', () => ok()); st.on('error', mal); });
}

const rutaPdf = (ctx: Contexto, codigo: string) => {
  fs.mkdirSync(ctx.rutas.certificados, { recursive: true });
  return path.join(ctx.rutas.certificados, `${codigo}.pdf`);
};

export async function generar(ctx: Contexto, eventoId: number, participanteIds: number[], autorizacion?: string) {
  const s = requerirEdicion(ctx);
  if (!participanteIds.length) throw new ErrorNegocio('Seleccione al menos un participante.');
  const motivoReemision = limpiar(autorizacion);
  if (motivoReemision && s.rol !== 'admin') throw new ErrorNegocio('Solo un administrador puede autorizar la reemisión de certificados.');
  if (!paraDocumentos(ctx).length) throw new ErrorNegocio('Configure al menos la firma del Presidente o del Secretario (Configuración › Firmas).');
  const ev = ctx.db.get('SELECT * FROM eventos WHERE id = ? AND eliminado_en IS NULL', [eventoId]);
  if (!ev) throw new ErrorNegocio('Evento no encontrado.');
  const lista = elegibles(ctx, eventoId);
  const generados: { id: number; codigo: string; nombre: string }[] = [];
  const omitidos: { nombre: string; motivo: string }[] = [];
  const fecha = hoy();
  for (const pid of participanteIds) {
    const r = lista.find((x) => x.participante_id === pid);
    if (!r) { omitidos.push({ nombre: `Participante ${pid}`, motivo: 'No está inscrito en el evento.' }); continue; }
    const nombre = `${r.nombres} ${r.apellidos}`;
    if (!r.aprueba) { omitidos.push({ nombre, motivo: r.motivo ?? 'No cumple las condiciones.' }); continue; }
    if (r.certificado && !motivoReemision) { omitidos.push({ nombre, motivo: `Ya tiene certificado vigente (${r.certificado.codigo}).` }); continue; }
    const actividades = (r.detalle ?? '').split('§').filter(Boolean).map((t: string) => { const [titulo, area, horas] = t.split('|'); return { titulo, area, horas: Number(horas) }; });
    const codigo = nuevoCodigo(ctx);
    const detalle = { nombre, tipo_documento: r.tipo_documento, identificacion: r.identificacion, evento: ev.nombre, lugar: ev.lugar, fecha_inicio: ev.fecha_inicio, fecha_fin: ev.fecha_fin, actividades };
    const id = ctx.db.tx(() => {
      if (r.certificado) ctx.db.run('UPDATE certificados SET anulado = 1, motivo_anulacion = ? WHERE id = ?', [`Reemitido. Autorización: ${motivoReemision}`, r.certificado.id]);
      const nid = ctx.db.insertar('certificados', {
        codigo, evento_id: eventoId, participante_id: pid, fecha_emision: fecha, horas: r.horas, porcentaje: r.porcentaje ?? 0,
        detalle: JSON.stringify(detalle), firma_hash: firmar(ctx, { codigo, identificacion: r.identificacion, horas: r.horas, evento_id: eventoId, fecha }), emitido_por: s.id,
      }, false);
      auditar(ctx, r.certificado ? 'Reemitió certificado' : 'Generó certificado', { codigo, nombre });
      return nid;
    });
    await escribirPdf(ctx, [id], rutaPdf(ctx, codigo));
    if (r.certificado) await escribirPdf(ctx, [r.certificado.id], rutaPdf(ctx, r.certificado.codigo));
    generados.push({ id, codigo, nombre });
  }
  let lote: string | null = null;
  if (generados.length > 1) { lote = rutaPdf(ctx, `lote-${Date.now()}`); await escribirPdf(ctx, generados.map((g) => g.id), lote); }
  return { generados, omitidos, lote };
}

export async function archivo(ctx: Contexto, ids: number[]): Promise<string> {
  requerirSesion(ctx);
  if (!ids.length) throw new ErrorNegocio('Seleccione certificados.');
  if (ids.length === 1) {
    const c = ctx.db.get('SELECT codigo FROM certificados WHERE id = ?', [ids[0]]);
    if (!c) throw new ErrorNegocio('Certificado no encontrado.');
    const p = rutaPdf(ctx, c.codigo);
    if (!fs.existsSync(p)) await escribirPdf(ctx, ids, p);
    return p;
  }
  const p = rutaPdf(ctx, `impresion-${Date.now()}`);
  await escribirPdf(ctx, ids, p);
  return p;
}

export function listar(ctx: Contexto, f: { eventoId?: number; busqueda?: string; incluirAnulados?: boolean } = {}) {
  requerirSesion(ctx);
  const w = [f.incluirAnulados ? '1 = 1' : 'c.anulado = 0'];
  const p: any[] = [];
  if (f.eventoId) { w.push('c.evento_id = ?'); p.push(f.eventoId); }
  const t = limpiar(f.busqueda);
  if (t) { w.push("(c.codigo LIKE ? OR pa.identificacion LIKE ? OR pa.nombres || ' ' || pa.apellidos LIKE ?)"); p.push(`%${t}%`, `%${t}%`, `%${t}%`); }
  return ctx.db.all(
    `SELECT c.id, c.codigo, c.fecha_emision, c.horas, c.porcentaje, c.anulado, c.motivo_anulacion, e.nombre AS evento,
            pa.identificacion, pa.nombres || ' ' || pa.apellidos AS participante
     FROM certificados c JOIN eventos e ON e.id = c.evento_id JOIN participantes pa ON pa.id = c.participante_id
     WHERE ${w.join(' AND ')} ORDER BY c.id DESC`, p,
  );
}

export async function anular(ctx: Contexto, id: number, motivo: string) {
  requerirAdmin(ctx);
  const m = limpiar(motivo);
  if (!m) throw new ErrorNegocio('Indique el motivo de la anulación.');
  const c = ctx.db.get('SELECT * FROM certificados WHERE id = ? AND anulado = 0', [id]);
  if (!c) throw new ErrorNegocio('El certificado no existe o ya está anulado.');
  ctx.db.run('UPDATE certificados SET anulado = 1, motivo_anulacion = ? WHERE id = ?', [m, id]);
  auditar(ctx, 'Anuló certificado', { codigo: c.codigo, motivo: m });
  await escribirPdf(ctx, [id], rutaPdf(ctx, c.codigo));
}

export function verificar(ctx: Contexto, entrada: string) {
  requerirSesion(ctx);
  const t = String(entrada ?? '').trim();
  let codigo = t.toUpperCase();
  let qr: string[] | null = null;
  if (t.includes('|')) {
    qr = t.split('|');
    if (qr[0] !== PREFIJO || qr.length !== 5) return { estado: 'formato', mensaje: 'El código QR no corresponde a un certificado de MEIF Eventos.' };
    codigo = qr[1];
  }
  const c = ctx.db.get('SELECT * FROM certificados WHERE codigo = ?', [codigo]);
  if (!c) return { estado: 'no_encontrado', mensaje: `No existe ningún certificado con el código ${codigo}.` };
  const det = JSON.parse(c.detalle);
  const ok = firmar(ctx, { codigo: c.codigo, identificacion: det.identificacion, horas: c.horas, evento_id: c.evento_id, fecha: c.fecha_emision }) === c.firma_hash
    && (!qr || (qr[4] === c.firma_hash && qr[2] === det.identificacion && Number(qr[3]) === c.horas));
  if (!ok) return { estado: 'alterado', mensaje: 'Los datos no coinciden con la firma registrada: el certificado pudo ser alterado.' };
  const certificado = { codigo: c.codigo, participante: det.nombre, identificacion: det.identificacion, evento: det.evento, fecha_emision: c.fecha_emision, horas: c.horas };
  if (c.anulado) return { estado: 'anulado', mensaje: `El certificado fue ANULADO. Motivo: ${c.motivo_anulacion}`, certificado };
  return { estado: 'valido', mensaje: 'Certificado auténtico y vigente.', certificado };
}
