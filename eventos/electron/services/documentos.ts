/**
 * Documentos institucionales (oficios, constancias, circulares, cartas, comunicados,
 * actas, invitaciones) impresos sobre el membrete de MEIF, con consecutivo anual por
 * tipo (p. ej. MEIF-OF-2026-001) y las firmas del Presidente y/o del Secretario.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { FIRMANTES, TIPOS_DOCUMENTO_INST, type Firmante, type TipoDocumentoInst } from '../../shared/modelos';
import { dibujarFirma, type FirmaDoc } from '../pdf/certificado';
import { texto } from '../pdf/comun';
import { ALTO_PIE, dibujarMembrete, piesEnTodas } from '../pdf/membrete';
import { auditar, ErrorNegocio, esFecha, fechaLarga, hoy, limpiar, requerirEdicion, requerirSesion, type Contexto } from './comun';
import { leerConfig, rutaImagen } from './config';

export interface DatosDocumento {
  tipo: TipoDocumentoInst; fecha?: string; ciudad?: string; destinatario?: string; asunto: string; cuerpo: string;
  despedida?: string; firmantes: Firmante[]; evento_id?: number | null;
}

function validar(d: DatosDocumento) {
  if (!(d.tipo in TIPOS_DOCUMENTO_INST)) throw new ErrorNegocio('Seleccione el tipo de documento.');
  const asunto = limpiar(d.asunto);
  if (!asunto) throw new ErrorNegocio('Escriba el asunto o título del documento.');
  const cuerpo = String(d.cuerpo ?? '').trim();
  if (!cuerpo) throw new ErrorNegocio('Escriba el contenido del documento.');
  if (cuerpo.length > 20000) throw new ErrorNegocio('El contenido es demasiado largo (máximo 20 000 caracteres).');
  const fecha = limpiar(d.fecha) ?? hoy();
  if (!esFecha(fecha)) throw new ErrorNegocio('Fecha no válida.');
  const firmantes = (d.firmantes ?? []).filter((f) => f in FIRMANTES);
  return { asunto, cuerpo, fecha, firmantes };
}

function firmasDe(ctx: Contexto, lista: Firmante[]): FirmaDoc[] {
  const c = leerConfig(ctx.db);
  return lista.map((f) => {
    if (!c[`${f}_nombre`]) throw new ErrorNegocio(`Falta configurar el nombre del ${FIRMANTES[f].toLowerCase()} (Configuración › Firmas).`);
    return { nombre: c[`${f}_nombre`], cargo: c[`${f}_cargo`] || FIRMANTES[f], imagen: rutaImagen(ctx, `firma_${f}`) };
  });
}

/** Dibuja el documento (también se usa para la vista previa del membrete). */
async function escribirPdf(ctx: Contexto, doc: Record<string, any>, destino: string) {
  const cfg = leerConfig(ctx.db);
  const logo = rutaImagen(ctx, 'logo');
  const firmas = firmasDe(ctx, (doc.firmantes ? String(doc.firmantes).split(',').filter(Boolean) : []) as Firmante[]);
  const pdf = new PDFDocument({ size: 'LETTER', bufferPages: true, margins: { top: 40, bottom: ALTO_PIE + 24, left: 72, right: 72 }, info: { Title: doc.asunto, Author: cfg.org_nombre } });
  const st = fs.createWriteStream(destino);
  pdf.pipe(st);
  const W = pdf.page.width;
  const ancho = W - 144;
  // El membrete se repite en cada página; el texto continúa debajo.
  const membrete = () => { const y = dibujarMembrete(pdf, cfg, logo); pdf.page.margins.top = y + 6; pdf.x = 72; pdf.y = y + 6; };
  pdf.on('pageAdded', membrete);
  membrete();

  pdf.font('Helvetica').fontSize(10.5).fillColor('#1A202C');
  const y0 = pdf.y;
  pdf.font('Helvetica-Bold').text(texto(doc.consecutivo), 72, y0, { width: ancho / 2, lineBreak: false });
  pdf.font('Helvetica').text(texto(`${doc.ciudad || cfg.lugar_expedicion}, ${fechaLarga(doc.fecha)}`), 72, y0, { width: ancho, align: 'right' });
  pdf.moveDown(1.6);

  const titulo = ['Constancia', 'Circular', 'Comunicado', 'Acta', 'Invitación'].includes(doc.tipo);
  if (titulo) {
    pdf.font('Helvetica-Bold').fontSize(14).fillColor(cfg.cert_color_primario || '#0B2545').text(texto(doc.tipo.toUpperCase()), { align: 'center', characterSpacing: 1.5 });
    pdf.moveDown(0.8);
  }
  if (doc.destinatario) {
    pdf.font('Helvetica').fontSize(11).fillColor('#1A202C').text(texto(doc.destinatario), { width: ancho });
    pdf.moveDown(1);
  }
  pdf.font('Helvetica-Bold').fontSize(11).fillColor('#1A202C').text(texto(`${titulo ? '' : 'Asunto: '}${doc.asunto}`), { width: ancho, align: titulo ? 'center' : 'left' });
  pdf.moveDown(1);
  pdf.font('Helvetica').fontSize(11).fillColor('#1A202C');
  for (const parrafo of String(doc.cuerpo).split(/\n\s*\n/)) {
    pdf.text(texto(parrafo.trim()), { width: ancho, align: 'justify', lineGap: 3 });
    pdf.moveDown(0.8);
  }
  if (doc.despedida) { pdf.moveDown(0.4); pdf.text(texto(doc.despedida), { width: ancho }); }

  if (firmas.length) {
    const H = pdf.page.height;
    if (pdf.y + 115 > H - ALTO_PIE - 20) pdf.addPage();
    const yF = pdf.y + 75;
    const anchoF = 190;
    const sep = 40;
    const total = firmas.length * anchoF + (firmas.length - 1) * sep;
    firmas.forEach((f, i) => dibujarFirma(pdf, f, W / 2 - total / 2 + i * (anchoF + sep), yF, anchoF));
  }
  pdf.removeListener('pageAdded', membrete);
  piesEnTodas(pdf, cfg);
  pdf.end();
  await new Promise<void>((ok, mal) => { st.on('finish', () => ok()); st.on('error', mal); });
}

const carpeta = (ctx: Contexto) => { const d = path.join(ctx.rutas.datos, 'documentos'); fs.mkdirSync(d, { recursive: true }); return d; };

export async function crear(ctx: Contexto, d: DatosDocumento) {
  const s = requerirEdicion(ctx);
  const v = validar(d);
  firmasDe(ctx, v.firmantes); // verifica que los firmantes estén configurados
  const anio = Number(v.fecha.slice(0, 4));
  const id = ctx.db.tx(() => {
    const numero = ctx.db.valor<number>('SELECT coalesce(max(numero), 0) + 1 FROM documentos WHERE tipo = ? AND anio = ?', [d.tipo, anio]);
    const consecutivo = `MEIF-${TIPOS_DOCUMENTO_INST[d.tipo]}-${anio}-${String(numero).padStart(3, '0')}`;
    return ctx.db.insertar('documentos', {
      tipo: d.tipo, consecutivo, anio, numero, fecha: v.fecha, ciudad: limpiar(d.ciudad), destinatario: String(d.destinatario ?? '').trim() || null,
      asunto: v.asunto, cuerpo: v.cuerpo, despedida: limpiar(d.despedida), firmantes: v.firmantes.join(','),
      evento_id: d.evento_id || null, creado_por: s.nombre,
    });
  });
  const reg = ctx.db.get('SELECT * FROM documentos WHERE id = ?', [id]);
  const archivo = path.join(carpeta(ctx), `${reg.consecutivo}.pdf`);
  await escribirPdf(ctx, reg, archivo);
  auditar(ctx, 'Generó documento institucional', reg.consecutivo);
  return { id, consecutivo: reg.consecutivo, archivo };
}

export function listar(ctx: Contexto, f: { tipo?: string; busqueda?: string } = {}) {
  requerirSesion(ctx);
  const w = ['eliminado_en IS NULL'];
  const p: any[] = [];
  if (f.tipo) { w.push('tipo = ?'); p.push(f.tipo); }
  const t = limpiar(f.busqueda);
  if (t) { w.push('(consecutivo LIKE ? OR asunto LIKE ? OR destinatario LIKE ?)'); p.push(`%${t}%`, `%${t}%`, `%${t}%`); }
  return ctx.db.all(`SELECT id, tipo, consecutivo, fecha, destinatario, asunto, firmantes, creado_por FROM documentos WHERE ${w.join(' AND ')} ORDER BY id DESC`, p);
}

export function obtener(ctx: Contexto, id: number) {
  requerirSesion(ctx);
  const d = ctx.db.get('SELECT * FROM documentos WHERE id = ? AND eliminado_en IS NULL', [id]);
  if (!d) throw new ErrorNegocio('Documento no encontrado.');
  return d;
}

/** Ruta del PDF; si falta (p. ej. tras restaurar una copia), se vuelve a dibujar. */
export async function archivo(ctx: Contexto, id: number) {
  const d = obtener(ctx, id);
  const ruta = path.join(carpeta(ctx), `${d.consecutivo}.pdf`);
  if (!fs.existsSync(ruta)) await escribirPdf(ctx, d, ruta);
  return ruta;
}

export function anular(ctx: Contexto, id: number) {
  requerirEdicion(ctx);
  ctx.db.run("UPDATE documentos SET eliminado_en = datetime('now','localtime') WHERE id = ?", [id]);
  auditar(ctx, 'Anuló documento institucional', id);
}

/** Documento de muestra para ver cómo queda el membrete (no se guarda ni consume consecutivo). */
export async function vistaPrevia(ctx: Contexto) {
  requerirSesion(ctx);
  const c = leerConfig(ctx.db);
  const firmantes = (Object.keys(FIRMANTES) as Firmante[]).filter((f) => c[`${f}_nombre`]);
  const destino = path.join(carpeta(ctx), 'vista-previa-membrete.pdf');
  await escribirPdf(ctx, {
    tipo: 'Oficio', consecutivo: 'MEIF-OF-0000-000 (muestra)', fecha: hoy(), ciudad: c.lugar_expedicion,
    destinatario: 'Señores\nPadres de familia y estudiantes\nSabanalarga, Atlántico',
    asunto: 'Vista previa del membrete institucional',
    cuerpo: 'Este es un documento de muestra para revisar el diseño del encabezado y del pie de página institucional de MEIF – SABANALARGA.\n\nLos datos del membrete (nombre, lema, NIT, dirección, teléfono y correo) se modifican en Configuración › Membrete. Las firmas se gestionan en Configuración › Firmas.',
    despedida: 'Atentamente,', firmantes: firmantes.join(','),
  }, destino);
  return destino;
}
