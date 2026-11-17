/** Diseño del certificado en PDF (carta horizontal). */
import type PDFKit from 'pdfkit';
import { dibujarLogo, texto } from './comun';

export interface DatosCertificado {
  codigo: string;
  nombre: string;
  tipoDocumento: string;
  identificacion: string;
  cursillo: string;
  fechaInicio: string; // ya formateadas
  fechaFin: string;
  fechaEmision: string;
  horas: number;
  asignaturas: { nombre: string; area: string; horas: number }[];
  qr: Buffer;
  anulado?: boolean;
}

export interface DisenoCertificado {
  config: Record<string, string>;
  logo: string | null;
  firmaDirector: string | null;
  firmaCoordinador: string | null;
}

const fmtHoras = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ','));

export function dibujarCertificado(doc: PDFKit.PDFDocument, d: DatosCertificado, dis: DisenoCertificado): void {
  const c = dis.config;
  const P = c.cert_color_primario || '#0B2545';
  const S = c.cert_color_secundario || '#C9A227';
  const W = doc.page.width;
  const H = doc.page.height;
  const cx = W / 2;

  // Marcos
  doc.rect(18, 18, W - 36, H - 36).lineWidth(7).stroke(P);
  doc.rect(31, 31, W - 62, H - 62).lineWidth(1.4).stroke(S);
  for (const [x, y] of [[31, 31], [W - 31, 31], [31, H - 31], [W - 31, H - 31]]) {
    doc.save().rotate(45, { origin: [x, y] }).rect(x - 5, y - 5, 10, 10).fill(S).restore();
  }
  // Banda lateral decorativa
  doc.save().rect(31, 31, 10, H - 62).fill(P).restore();
  doc.save().rect(W - 41, 31, 10, H - 62).fill(P).restore();

  if (d.anulado) {
    doc.save().rotate(-25, { origin: [cx, H / 2] }).fillColor('#C62828').opacity(0.18).font('Helvetica-Bold').fontSize(110);
    doc.text('ANULADO', 0, H / 2 - 60, { width: W, align: 'center' });
    doc.restore();
  }

  let y = 44;
  dibujarLogo(doc, dis.logo, cx, y + 32, 64, P, S);
  y += 70;
  doc.fillColor(P).font('Helvetica-Bold').fontSize(20).text(texto(c.org_nombre), 60, y, { width: W - 120, align: 'center' });
  y = doc.y + 1;
  doc.fillColor('#4A5568').font('Helvetica').fontSize(10).text(texto(c.org_subtitulo), 60, y, { width: W - 120, align: 'center', characterSpacing: 0.5 });
  if (c.org_nit) doc.fontSize(8.5).text(texto(`NIT ${c.org_nit}`), { width: W - 120, align: 'center' });
  y = doc.y + 10;

  doc.fillColor(P).font('Helvetica-Bold').fontSize(24).text(texto(c.cert_titulo), 60, y, { width: W - 120, align: 'center', characterSpacing: 1.5 });
  y = doc.y + 3;
  doc.moveTo(cx - 140, y).lineTo(cx + 140, y).lineWidth(1.5).stroke(S);
  y += 9;
  doc.fillColor('#2D3748').font('Helvetica').fontSize(11).text('Otorga el presente certificado a:', 60, y, { width: W - 120, align: 'center' });
  y = doc.y + 5;
  doc.fillColor(P).font('Times-BoldItalic').fontSize(28).text(texto(d.nombre), 60, y, { width: W - 120, align: 'center' });
  y = doc.y + 1;
  doc.fillColor('#2D3748').font('Helvetica').fontSize(10.5)
    .text(texto(`Identificado(a) con ${d.tipoDocumento} No. ${d.identificacion}`), 60, y, { width: W - 120, align: 'center' });
  y = doc.y + 8;

  const cuerpo = (c.cert_texto || '')
    .replace(/\{cursillo\}/g, d.cursillo).replace(/\{fecha_inicio\}/g, d.fechaInicio)
    .replace(/\{fecha_fin\}/g, d.fechaFin).replace(/\{horas\}/g, fmtHoras(d.horas))
    .replace(/\{nombre\}/g, d.nombre).replace(/\{identificacion\}/g, d.identificacion);
  doc.font('Helvetica').fontSize(11).fillColor('#1A202C').text(texto(cuerpo), 95, y, { width: W - 190, align: 'center', lineGap: 2 });
  y = doc.y + 8;

  // Asignaturas cursadas
  if (d.asignaturas.length) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(P).text('ASIGNATURAS CURSADAS E INTENSIDAD HORARIA CERTIFICADA', 60, y, { width: W - 120, align: 'center' });
    y = doc.y + 4;
    const cols = d.asignaturas.length > 4 ? 2 : 1;
    const anchoCol = cols === 2 ? 270 : 360;
    const x0 = cx - (anchoCol * cols + (cols - 1) * 20) / 2;
    const filas = Math.ceil(d.asignaturas.length / cols);
    const tamF = filas > 5 ? 8 : 9;
    const alto = tamF + 4.5;
    d.asignaturas.forEach((a, i) => {
      const col = Math.floor(i / filas);
      const fila = i % filas;
      const x = x0 + col * (anchoCol + 20);
      const yy = y + fila * alto;
      if (fila % 2 === 0) doc.save().rect(x, yy - 1.5, anchoCol, alto).fill('#F1F4F9').restore();
      doc.font('Helvetica').fontSize(tamF).fillColor('#1A202C')
        .text(texto(`${a.nombre} (${a.area})`), x + 5, yy, { width: anchoCol - 60, lineBreak: false, ellipsis: true });
      doc.font('Helvetica-Bold').text(`${fmtHoras(a.horas)} h`, x + anchoCol - 55, yy, { width: 50, align: 'right', lineBreak: false });
    });
    y += filas * alto + 2;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(P)
      .text(`Total certificado: ${fmtHoras(d.horas)} horas`, 60, y, { width: W - 120, align: 'center' });
    y = doc.y + 6;
  }

  doc.font('Helvetica').fontSize(10).fillColor('#2D3748')
    .text(texto(`Expedido en ${c.lugar_expedicion}, el ${d.fechaEmision}.`), 60, y, { width: W - 120, align: 'center' });

  // Firmas
  const yFirma = H - 112;
  const firmas: { nombre: string; cargo: string; img: string | null }[] = [
    { nombre: c.director_nombre, cargo: c.director_cargo, img: dis.firmaDirector },
  ];
  if (c.cert_mostrar_coordinador === '1' && c.coordinador_nombre) {
    firmas.push({ nombre: c.coordinador_nombre, cargo: c.coordinador_cargo, img: dis.firmaCoordinador });
  }
  const anchoFirma = 190;
  const espacio = firmas.length === 1 ? 0 : 60;
  const totalF = firmas.length * anchoFirma + (firmas.length - 1) * espacio;
  firmas.forEach((f, i) => {
    const x = cx - totalF / 2 + i * (anchoFirma + espacio) - 40;
    if (f.img) {
      try { doc.image(f.img, x + 35, yFirma - 42, { fit: [120, 40], align: 'center', valign: 'bottom' }); } catch { /* sin firma */ }
    }
    doc.moveTo(x, yFirma).lineTo(x + anchoFirma, yFirma).lineWidth(0.8).stroke('#2D3748');
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1A202C')
      .text(texto(f.nombre || '______________________'), x, yFirma + 4, { width: anchoFirma, align: 'center' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#4A5568').text(texto(f.cargo), x, doc.y, { width: anchoFirma, align: 'center' });
  });

  // QR y código
  const q = 74;
  const xq = W - 58 - q;
  const yq = H - 52 - q;
  doc.image(d.qr, xq, yq, { width: q, height: q });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(P).text(d.codigo, xq - 20, yq + q + 2, { width: q + 40, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor('#718096')
    .text(texto(`Código de verificación: ${d.codigo}. Verifique la autenticidad de este certificado escaneando el código QR en la plataforma ${c.org_nombre}.`),
      58, H - 52, { width: 330, lineGap: 1 });
}
