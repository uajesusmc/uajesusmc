/**
 * Membrete institucional de MEIF – SABANALARGA para todos los documentos PDF.
 *
 *  ┌────────────────────────────────────────────── franja azul + filete dorado ┐
 *  │ [logo]  MEIF – SABANALARGA                         NIT 900.000.000-0       │
 *  │         Matemáticas, Estadística, Informática…     Dirección · Teléfono    │
 *  │         «Lema institucional»                       correo@meif.org         │
 *  ├──────────────────────────────────────────── línea dorada + línea azul ────┤
 *  …contenido…
 *  ├──────────────────────────────────────────────────────── línea gris ───────┤
 *  │ MEIF – SABANALARGA · Dirección · Tel. · Correo            Página 1 de 2   │
 *  └──────────────────────────────────────────────────── franja azul ──────────┘
 */
import type PDFKit from 'pdfkit';
import { dibujarLogo, texto } from './comun';

export const ALTO_MEMBRETE = 96;
export const ALTO_PIE = 46;

const colores = (cfg: Record<string, string>) => ({ P: cfg.cert_color_primario || '#0B2545', S: cfg.cert_color_secundario || '#C9A227' });

/** Dibuja el membrete en la parte superior de la página actual y devuelve la Y donde empieza el contenido. */
export function dibujarMembrete(doc: PDFKit.PDFDocument, cfg: Record<string, string>, logo: string | null, M = 40): number {
  const { P, S } = colores(cfg);
  const W = doc.page.width;
  doc.save();
  doc.rect(0, 0, W, 9).fill(P);
  doc.rect(0, 9, W, 2.2).fill(S);
  dibujarLogo(doc, logo, M + 27, 44, 54, P, S);

  const xT = M + 66;
  const anchoDer = 190;
  const anchoT = W - xT - M - anchoDer - 10;
  doc.fillColor(P).font('Helvetica-Bold').fontSize(15).text(texto(cfg.org_nombre || 'MEIF – SABANALARGA'), xT, 22, { width: anchoT });
  doc.fillColor('#4A5568').font('Helvetica').fontSize(8.5).text(texto(cfg.org_subtitulo), xT, doc.y + 1, { width: anchoT });
  if (cfg.org_lema) doc.fillColor('#8A6D0F').font('Helvetica-Oblique').fontSize(8.5).text(texto(`«${cfg.org_lema}»`), xT, doc.y + 2, { width: anchoT });
  const yIzq = doc.y;

  const contacto = [
    cfg.org_nit && `NIT ${cfg.org_nit}`, cfg.org_direccion, cfg.org_telefono && `Tel. ${cfg.org_telefono}`, cfg.org_correo,
  ].filter(Boolean) as string[];
  doc.font('Helvetica').fontSize(7.8).fillColor('#4A5568');
  let yDer = 24;
  for (const c of contacto) {
    doc.text(texto(c), W - M - anchoDer, yDer, { width: anchoDer, align: 'right', lineBreak: false });
    yDer += 10.5;
  }
  const y = Math.max(yIzq, yDer, 72) + 6;
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(1.4).stroke(S);
  doc.moveTo(M, y + 2.6).lineTo(W - M, y + 2.6).lineWidth(0.5).stroke(P);
  doc.restore();
  return y + 12;
}

/** Pie institucional con datos de contacto, nota opcional y numeración. */
export function dibujarPie(doc: PDFKit.PDFDocument, cfg: Record<string, string>, pagina: number, total: number, nota?: string, M = 40) {
  const { P } = colores(cfg);
  const W = doc.page.width;
  const H = doc.page.height;
  const margen = doc.page.margins.bottom;
  doc.page.margins.bottom = 0; // escribir en el pie no debe crear páginas nuevas
  doc.save();
  doc.moveTo(M, H - 40).lineTo(W - M, H - 40).lineWidth(0.5).stroke('#CBD5E0');
  const linea = [cfg.org_nombre, cfg.org_direccion, cfg.org_telefono && `Tel. ${cfg.org_telefono}`, cfg.org_correo].filter(Boolean).join('  ·  ');
  doc.font('Helvetica').fontSize(7).fillColor('#4A5568').text(texto(linea), M, H - 34, { width: W - 2 * M - 90, lineBreak: false });
  if (nota) doc.fillColor('#718096').text(texto(nota), M, H - 25, { width: W - 2 * M - 90, lineBreak: false });
  doc.fillColor('#4A5568').text(`Página ${pagina} de ${total}`, W - M - 90, H - 34, { width: 90, align: 'right', lineBreak: false });
  doc.rect(0, H - 6, W, 6).fill(P);
  doc.restore();
  doc.page.margins.bottom = margen;
}

/** Aplica el pie a todas las páginas de un documento creado con `bufferPages: true`. */
export function piesEnTodas(doc: PDFKit.PDFDocument, cfg: Record<string, string>, nota?: string, M = 40) {
  const r = doc.bufferedPageRange();
  for (let i = 0; i < r.count; i++) {
    doc.switchToPage(r.start + i);
    dibujarPie(doc, cfg, i + 1, r.count, nota, M);
  }
}
