/** Reportes tabulares en PDF con encabezado institucional y paginación. */
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { dibujarLogo, texto } from './comun';

export interface ColumnaReporte { key: string; label: string; align?: 'left' | 'right' | 'center'; ancho?: number }
export interface Reporte {
  titulo: string;
  subtitulo?: string;
  columnas: ColumnaReporte[];
  filas: Record<string, any>[];
  totales?: Record<string, any>;
}

const fmt = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  return texto(v);
};

export function generarReportePdf(destino: string, r: Reporte, config: Record<string, string>, logo: string | null, generadoPor: string): Promise<void> {
  const horizontal = r.columnas.length > 6;
  const doc = new PDFDocument({ size: 'LETTER', layout: horizontal ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: r.titulo, Author: config.org_nombre } });
  const stream = fs.createWriteStream(destino);
  doc.pipe(stream);
  const P = config.cert_color_primario || '#0B2545';
  const S = config.cert_color_secundario || '#C9A227';
  const W = doc.page.width;
  const H = doc.page.height;
  const ancho = W - 72;

  // Ancho de columnas: proporcional al contenido (muestra de filas), con mínimo.
  // El mínimo de cada columna es su palabra más larga (encabezado o contenido): nunca se parte una palabra.
  const PAD = 8;
  const muestra = r.filas.slice(0, 300);
  const pesos: number[] = [];
  const minimos: number[] = [];
  for (const c of r.columnas) {
    if (c.ancho) { pesos.push(c.ancho); minimos.push(c.ancho); continue; }
    doc.font('Helvetica-Bold').fontSize(8);
    const palabraCab = Math.max(...texto(c.label).split(/\s+/).map((w) => doc.widthOfString(w))) + PAD;
    doc.font('Helvetica').fontSize(8);
    const valores = muestra.map((f) => fmt(f[c.key]));
    const completo = Math.max(0, ...valores.map((v) => Math.min(doc.widthOfString(v), 220))) + PAD;
    const palabraCont = Math.min(110, Math.max(0, ...valores.flatMap((v) => v.split(/\s+/).map((w) => doc.widthOfString(w)))) + PAD);
    pesos.push(Math.max(completo, palabraCab, 30));
    minimos.push(Math.max(Math.min(completo, 70), palabraCab, palabraCont, 30));
  }
  // Reparte el ancho: cada columna recibe su mínimo y el resto en proporción al contenido.
  const sumaMin = minimos.reduce((a, b) => a + b, 0);
  const extra = pesos.map((p, i) => p - minimos[i]);
  const sumaExtra = extra.reduce((a, b) => a + b, 0) || 1;
  const anchos = sumaMin >= ancho
    ? minimos.map((m) => (m / sumaMin) * ancho)
    : minimos.map((m, i) => m + (extra[i] / sumaExtra) * (ancho - sumaMin));

  const encabezado = () => {
    dibujarLogo(doc, logo, 36 + 20, 36 + 20, 40, P, S);
    doc.fillColor(P).font('Helvetica-Bold').fontSize(13).text(texto(config.org_nombre), 86, 38, { width: ancho - 50 });
    doc.fillColor('#4A5568').font('Helvetica').fontSize(8.5).text(texto(config.org_subtitulo), 86, doc.y, { width: ancho - 50 });
    doc.fillColor('#1A202C').font('Helvetica-Bold').fontSize(11.5).text(texto(r.titulo), 86, doc.y + 3, { width: ancho - 50 });
    if (r.subtitulo) doc.fillColor('#4A5568').font('Helvetica').fontSize(8).text(texto(r.subtitulo), 86, doc.y, { width: ancho - 50 });
    const y = Math.max(doc.y + 6, 82);
    doc.moveTo(36, y).lineTo(W - 36, y).lineWidth(1.5).stroke(S);
    return y + 6;
  };

  const filaEncabezado = (y: number) => {
    doc.font('Helvetica-Bold').fontSize(8);
    const alto = Math.max(...r.columnas.map((c, i) => doc.heightOfString(texto(c.label), { width: anchos[i] - 6 }))) + 8;
    doc.rect(36, y, ancho, alto).fill(P);
    let x = 36;
    r.columnas.forEach((c, i) => {
      doc.fillColor('#FFFFFF').text(texto(c.label), x + 3, y + 4, { width: anchos[i] - 6, align: c.align ?? 'left' });
      x += anchos[i];
    });
    return y + alto;
  };

  let y = filaEncabezado(encabezado());
  const dibujarFila = (f: Record<string, any>, idx: number, negrita = false) => {
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const valores = r.columnas.map((c) => fmt(f[c.key]));
    const alto = Math.max(...valores.map((v, i) => doc.heightOfString(v || ' ', { width: anchos[i] - 6 }))) + 6;
    if (y + alto > H - 50) {
      doc.addPage();
      y = filaEncabezado(encabezado());
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    }
    if (negrita) doc.rect(36, y, ancho, alto).fill('#E9EEF6');
    else if (idx % 2 === 1) doc.rect(36, y, ancho, alto).fill('#F6F8FB');
    let x = 36;
    valores.forEach((v, i) => {
      doc.fillColor('#1A202C').text(v, x + 3, y + 3, { width: anchos[i] - 6, align: r.columnas[i].align ?? 'left' });
      x += anchos[i];
    });
    y += alto;
  };

  if (!r.filas.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#4A5568').text('No hay registros para los filtros seleccionados.', 36, y + 10);
  }
  r.filas.forEach((f, i) => dibujarFila(f, i, !!f._negrita));
  if (r.totales) dibujarFila(r.totales, 0, true);

  // Pie de página con numeración
  const generado = `Generado el ${new Date().toLocaleString('es-CO')} por ${generadoPor} · ${r.filas.length} registro(s)`;
  const rango = doc.bufferedPageRange();
  for (let i = 0; i < rango.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // evita que el pie genere páginas en blanco
    doc.font('Helvetica').fontSize(7).fillColor('#718096');
    doc.text(texto(generado), 36, H - 30, { width: ancho - 80, lineBreak: false });
    doc.text(`Página ${i + 1} de ${rango.count}`, W - 136, H - 30, { width: 100, align: 'right', lineBreak: false });
  }
  doc.end();
  return new Promise((res, rej) => { stream.on('finish', () => res()); stream.on('error', rej); });
}
