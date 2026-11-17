/** Diseño del certificado de participación (carta horizontal). */
import type PDFKit from 'pdfkit';
import { dibujarLogo, texto } from './comun';

export interface DatosCertificado {
  codigo: string; nombre: string; tipoDocumento: string; identificacion: string; evento: string; lugar: string;
  fechaInicio: string; fechaFin: string; fechaEmision: string; horas: number; actividades: { titulo: string; area: string; horas: number }[];
  qr: Buffer; anulado?: boolean;
}

const h = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

export interface FirmaDoc { nombre: string; cargo: string; imagen: string | null }

/** Bloque de firma: imagen sobre la línea, nombre y cargo debajo. */
export function dibujarFirma(doc: PDFKit.PDFDocument, f: FirmaDoc, x: number, y: number, ancho: number) {
  if (f.imagen) {
    try { doc.image(f.imagen, x + ancho / 2 - 70, y - 46, { fit: [140, 44], align: 'center', valign: 'bottom' }); } catch { /* imagen inválida */ }
  }
  doc.moveTo(x, y).lineTo(x + ancho, y).lineWidth(0.8).stroke('#2D3748');
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1A202C').text(texto(f.nombre), x, y + 4, { width: ancho, align: 'center' });
  doc.font('Helvetica').fontSize(8.5).fillColor('#4A5568').text(texto(f.cargo), x, doc.y, { width: ancho, align: 'center' });
}

export function dibujarCertificado(doc: PDFKit.PDFDocument, d: DatosCertificado, cfg: Record<string, string>, logo: string | null, firmas: FirmaDoc[]) {
  const P = cfg.cert_color_primario || '#0B2545';
  const S = cfg.cert_color_secundario || '#C9A227';
  const W = doc.page.width;
  const H = doc.page.height;
  const cx = W / 2;
  doc.rect(18, 18, W - 36, H - 36).lineWidth(7).stroke(P);
  doc.rect(31, 31, W - 62, H - 62).lineWidth(1.4).stroke(S);
  doc.save().rect(31, 31, 10, H - 62).fill(P).restore();
  doc.save().rect(W - 41, 31, 10, H - 62).fill(P).restore();
  if (d.anulado) {
    doc.save().rotate(-25, { origin: [cx, H / 2] }).fillColor('#C62828').opacity(0.18).font('Helvetica-Bold').fontSize(110)
      .text('ANULADO', 0, H / 2 - 60, { width: W, align: 'center' }).restore();
  }
  let y = 46;
  dibujarLogo(doc, logo, cx, y + 30, 60, P, S);
  y += 68;
  doc.fillColor(P).font('Helvetica-Bold').fontSize(20).text(texto(cfg.org_nombre), 60, y, { width: W - 120, align: 'center' });
  doc.fillColor('#4A5568').font('Helvetica').fontSize(10).text(texto(cfg.org_subtitulo), { width: W - 120, align: 'center' });
  y = doc.y + 10;
  doc.fillColor(P).font('Helvetica-Bold').fontSize(24).text(texto(cfg.cert_titulo), 60, y, { width: W - 120, align: 'center', characterSpacing: 1.5 });
  y = doc.y + 3;
  doc.moveTo(cx - 140, y).lineTo(cx + 140, y).lineWidth(1.5).stroke(S);
  doc.fillColor('#2D3748').font('Helvetica').fontSize(11).text('Otorga el presente certificado a:', 60, y + 9, { width: W - 120, align: 'center' });
  doc.fillColor(P).font('Times-BoldItalic').fontSize(28).text(texto(d.nombre), 60, doc.y + 5, { width: W - 120, align: 'center' });
  doc.fillColor('#2D3748').font('Helvetica').fontSize(10.5).text(texto(`Identificado(a) con ${d.tipoDocumento} No. ${d.identificacion}`), 60, doc.y + 1, { width: W - 120, align: 'center' });
  const cuerpo = (cfg.cert_texto || '').replace(/\{evento\}/g, d.evento).replace(/\{fecha_inicio\}/g, d.fechaInicio).replace(/\{fecha_fin\}/g, d.fechaFin)
    .replace(/\{lugar\}/g, d.lugar || cfg.lugar_expedicion).replace(/\{horas\}/g, h(d.horas)).replace(/\{nombre\}/g, d.nombre);
  doc.font('Helvetica').fontSize(11).fillColor('#1A202C').text(texto(cuerpo), 95, doc.y + 9, { width: W - 190, align: 'center', lineGap: 2 });
  y = doc.y + 8;
  if (d.actividades.length) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(P).text('ACTIVIDADES EN LAS QUE PARTICIPÓ', 60, y, { width: W - 120, align: 'center' });
    y = doc.y + 3;
    const lista = d.actividades.slice(0, 12);
    const cols = lista.length > 4 ? 2 : 1;
    const ancho = cols === 2 ? 270 : 360;
    const x0 = cx - (ancho * cols + (cols - 1) * 20) / 2;
    const filas = Math.ceil(lista.length / cols);
    lista.forEach((a, i) => {
      const x = x0 + Math.floor(i / filas) * (ancho + 20);
      const yy = y + (i % filas) * 12.5;
      if ((i % filas) % 2 === 0) doc.save().rect(x, yy - 1.5, ancho, 12.5).fill('#F1F4F9').restore();
      doc.font('Helvetica').fontSize(8.5).fillColor('#1A202C').text(texto(`${a.titulo} (${a.area})`), x + 5, yy, { width: ancho - 55, lineBreak: false, ellipsis: true });
      doc.font('Helvetica-Bold').text(`${h(a.horas)} h`, x + ancho - 50, yy, { width: 45, align: 'right', lineBreak: false });
    });
    y += filas * 12.5 + 4;
    if (d.actividades.length > lista.length) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#4A5568').text(`… y ${d.actividades.length - lista.length} actividad(es) más.`, 60, y, { width: W - 120, align: 'center' });
      y = doc.y + 2;
    }
  }
  doc.font('Helvetica').fontSize(10).fillColor('#2D3748').text(texto(`Expedido en ${cfg.lugar_expedicion}, el ${d.fechaEmision}.`), 60, y + 2, { width: W - 120, align: 'center' });

  // Firmas del Presidente y del Secretario (las que estén configuradas)
  const yF = H - 108;
  const anchoF = 185;
  const sep = 45;
  const lista = firmas.length ? firmas : [{ nombre: '______________________', cargo: '', imagen: null }];
  const total = lista.length * anchoF + (lista.length - 1) * sep;
  const x0 = cx - total / 2 - 45; // desplazado a la izquierda para dejar espacio al QR
  lista.forEach((f, i) => dibujarFirma(doc, f, x0 + i * (anchoF + sep), yF, anchoF));

  const q = 74;
  const xq = W - 58 - q;
  const yq = H - 52 - q;
  doc.image(d.qr, xq, yq, { width: q, height: q });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(P).text(d.codigo, xq - 20, yq + q + 2, { width: q + 40, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor('#718096')
    .text(texto(`Código de verificación: ${d.codigo}. Verifique la autenticidad escaneando el código QR en la plataforma MEIF Eventos.`), 58, H - 52, { width: 320 });
}
