/** Utilidades de dibujo PDF compartidas (pdfkit). */
import type PDFKit from 'pdfkit';

/**
 * Las fuentes estándar de PDF usan la codificación WinAnsi: reemplaza los caracteres
 * fuera de ella para que nunca aparezcan símbolos corruptos.
 */
const PERMITIDOS_EXTRA = new Set('–—‘’“”•…€‚„†‡‰‹›™ŠšŽžŒœŸƒˆ˜'.split(''));
export function texto(s: unknown): string {
  return String(s ?? '')
    .replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[✓✔]/g, 'Sí')
    .split('')
    .map((c) => (c.charCodeAt(0) <= 0xff || PERMITIDOS_EXTRA.has(c) ? c : '?'))
    .join('');
}

/** Emblema institucional vectorial (se usa si no se cargó un logotipo). */
export function dibujarEmblema(doc: PDFKit.PDFDocument, cx: number, cy: number, r: number, primario: string, secundario: string): void {
  doc.save();
  doc.circle(cx, cy, r).fill(primario);
  doc.circle(cx, cy, r * 0.86).lineWidth(Math.max(1, r * 0.06)).stroke(secundario);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(r * 0.52);
  const w = doc.widthOfString('MEIF');
  doc.text('MEIF', cx - w / 2, cy - r * 0.3, { lineBreak: false });
  doc.fillColor(secundario).font('Helvetica').fontSize(r * 0.17);
  const s = 'SABANALARGA';
  doc.text(s, cx - doc.widthOfString(s) / 2, cy + r * 0.28, { lineBreak: false, characterSpacing: 0.3 });
  doc.restore();
}

export function dibujarLogo(
  doc: PDFKit.PDFDocument, logo: string | null, cx: number, cy: number, tam: number, primario: string, secundario: string,
): void {
  if (logo) {
    try {
      doc.image(logo, cx - tam / 2, cy - tam / 2, { fit: [tam, tam], align: 'center', valign: 'center' });
      return;
    } catch {
      /* imagen inválida: se usa el emblema */
    }
  }
  dibujarEmblema(doc, cx, cy, tam / 2, primario, secundario);
}
