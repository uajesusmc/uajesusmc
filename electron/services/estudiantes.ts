/** Matrículas, asignaturas por estudiante, historial e importación masiva desde Excel. */
import ExcelJS from 'exceljs';
import { ENTIDADES } from '../../shared/entidades';
import { estadisticasMatricula } from './asistencia';
import { auditar, ErrorNegocio, fechaISO, limpiar, requerirPermiso, type Contexto } from './comun';
import { guardar } from './crud';

/** Historial académico completo de un estudiante. */
export function historial(ctx: Contexto, estudianteId: number) {
  requerirPermiso(ctx, 'estudiantes', 'ver');
  const est = ctx.db.get('SELECT * FROM estudiantes WHERE id = ?', [estudianteId]);
  if (!est) throw new ErrorNegocio('Estudiante no encontrado.');
  const matriculas = ctx.db.all(
    `SELECT m.*, c.nombre AS cursillo, c.codigo AS cursillo_codigo, c.fecha_inicio, c.fecha_fin, c.estado AS estado_cursillo,
            c.asistencia_minima, g.nombre AS grupo
     FROM matriculas m JOIN cursillos c ON c.id = m.cursillo_id LEFT JOIN grupos g ON g.id = m.grupo_id
     WHERE m.estudiante_id = ? AND m.eliminado_en IS NULL ORDER BY c.fecha_inicio DESC`, [estudianteId],
  ).map((m) => ({
    ...m,
    asistencia: estadisticasMatricula(ctx.db, m.id),
    certificado: ctx.db.get(
      'SELECT id, codigo, fecha_emision, horas_certificadas FROM certificados WHERE matricula_id = ? AND anulado = 0', [m.id],
    ) ?? null,
  }));
  return { estudiante: est, matriculas };
}

/** Asignaturas del cursillo, marcando las asignadas a la matrícula. */
export function asignaturasMatricula(ctx: Contexto, matriculaId: number) {
  requerirPermiso(ctx, 'estudiantes', 'ver');
  const m = ctx.db.get('SELECT * FROM matriculas WHERE id = ? AND eliminado_en IS NULL', [matriculaId]);
  if (!m) throw new ErrorNegocio('Matrícula no encontrada.');
  return ctx.db.all(
    `SELECT a.id, a.codigo, a.nombre, a.area, a.intensidad_horaria,
            EXISTS (SELECT 1 FROM matricula_asignaturas ma WHERE ma.matricula_id = ? AND ma.asignatura_id = a.id) AS asignada
     FROM asignaturas a WHERE a.cursillo_id = ? AND a.eliminado_en IS NULL ORDER BY a.area, a.nombre`,
    [matriculaId, m.cursillo_id],
  );
}

export function asignarAsignaturas(ctx: Contexto, matriculaId: number, asignaturaIds: number[]): void {
  requerirPermiso(ctx, 'estudiantes', 'editar');
  const m = ctx.db.get('SELECT * FROM matriculas WHERE id = ? AND eliminado_en IS NULL', [matriculaId]);
  if (!m) throw new ErrorNegocio('Matrícula no encontrada.');
  const validas = new Set(
    ctx.db.all<{ id: number }>('SELECT id FROM asignaturas WHERE cursillo_id = ? AND eliminado_en IS NULL', [m.cursillo_id]).map((r) => r.id),
  );
  for (const id of asignaturaIds) if (!validas.has(id)) throw new ErrorNegocio('Una de las asignaturas no pertenece al cursillo.');
  ctx.db.tx(() => {
    ctx.db.run('DELETE FROM matricula_asignaturas WHERE matricula_id = ?', [matriculaId]);
    for (const id of asignaturaIds) ctx.db.run('INSERT INTO matricula_asignaturas (matricula_id, asignatura_id) VALUES (?, ?)', [matriculaId, id]);
    auditar(ctx, 'Asignó asignaturas', 'matriculas', matriculaId, asignaturaIds);
  });
}

// ---------------------------------------------------------- importación Excel

/** Encabezados aceptados (normalizados) → campo. */
const ENCABEZADOS: Record<string, string> = {
  tipodocumento: 'tipo_documento', tipo: 'tipo_documento', tipodoc: 'tipo_documento',
  identificacion: 'identificacion', documento: 'identificacion', numerodeidentificacion: 'identificacion', numerodocumento: 'identificacion', cedula: 'identificacion',
  nombres: 'nombres', nombre: 'nombres',
  apellidos: 'apellidos', apellido: 'apellidos',
  fechadenacimiento: 'fecha_nacimiento', fechanacimiento: 'fecha_nacimiento',
  institucion: 'institucion', institucioneducativa: 'institucion', colegio: 'institucion',
  grado: 'grado', gradoescolar: 'grado',
  telefono: 'telefono', celular: 'telefono',
  correo: 'correo', correoelectronico: 'correo', email: 'correo',
  direccion: 'direccion',
  acudiente: 'acudiente',
  telefonoacudiente: 'telefono_acudiente', telefonodelacudiente: 'telefono_acudiente',
  cursillo: 'cursillo', codigocursillo: 'cursillo',
  grupo: 'grupo',
};

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

function valorCelda(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return fechaISO(new Date(v.getTime() + v.getTimezoneOffset() * 60000));
  if (typeof v === 'object') {
    if ('text' in v) return String((v as any).text);
    if ('result' in v) return valorCelda((v as any).result);
    if ('richText' in v) return (v as any).richText.map((r: any) => r.text).join('');
  }
  return String(v);
}

/** Normaliza fechas escritas como DD/MM/AAAA. */
function normalizarFecha(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s.slice(0, 10);
}

export interface FilaImportacion { fila: number; datos: Record<string, string | null>; estado: 'nuevo' | 'existente' | 'error'; mensaje: string }

async function leerExcel(archivo: string): Promise<{ fila: number; datos: Record<string, string | null> }[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(archivo);
  } catch {
    throw new ErrorNegocio('No se pudo leer el archivo. Use un libro de Excel (.xlsx).');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ErrorNegocio('El libro no tiene hojas.');
  const mapa: Record<number, string> = {};
  ws.getRow(1).eachCell((c, col) => {
    const campo = ENCABEZADOS[normalizar(valorCelda(c.value) ?? '')];
    if (campo) mapa[col] = campo;
  });
  const campos = Object.values(mapa);
  for (const req of ['identificacion', 'nombres', 'apellidos']) {
    if (!campos.includes(req)) throw new ErrorNegocio(`Falta la columna obligatoria «${req}» en la primera fila. Descargue la plantilla.`);
  }
  const filas: { fila: number; datos: Record<string, string | null> }[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const d: Record<string, string | null> = {};
    for (const [col, campo] of Object.entries(mapa)) d[campo] = limpiar(valorCelda(row.getCell(Number(col)).value));
    if (Object.values(d).some((v) => v)) filas.push({ fila: n, datos: d });
  });
  if (filas.length > 5000) throw new ErrorNegocio('Importe máximo 5000 estudiantes por archivo.');
  return filas;
}

/**
 * Importa estudiantes. Con `simular` solo valida y devuelve la vista previa.
 * Los estudiantes ya registrados (misma identificación) no se duplican: se omiten,
 * pero se matriculan en el cursillo indicado si aún no lo están.
 */
export async function importar(
  ctx: Contexto, archivo: string, opciones: { cursilloId?: number | null; grupoId?: number | null; simular: boolean },
): Promise<{ filas: FilaImportacion[]; creados: number; matriculados: number; errores: number }> {
  requerirPermiso(ctx, 'estudiantes', 'editar');
  const filas = await leerExcel(archivo);
  const resultado: FilaImportacion[] = [];
  let creados = 0;
  let matriculados = 0;
  const vistos = new Set<string>();

  const ejecutar = () => {
    for (const { fila, datos } of filas) {
      const ident = (datos.identificacion ?? '').toUpperCase().replace(/\s/g, '');
      try {
        if (!ident) throw new ErrorNegocio('Sin número de identificación.');
        if (vistos.has(ident)) throw new ErrorNegocio('Identificación repetida dentro del archivo.');
        vistos.add(ident);
        datos.fecha_nacimiento = normalizarFecha(datos.fecha_nacimiento ?? null);
        if (datos.tipo_documento) datos.tipo_documento = datos.tipo_documento.toUpperCase();
        else datos.tipo_documento = 'TI';
        const grado = datos.grado;
        if (grado && /^\d{1,2}$/.test(grado)) datos.grado = `${grado}°`;

        let cursilloId = opciones.cursilloId ?? null;
        if (datos.cursillo) {
          cursilloId = ctx.db.valor<number>('SELECT id FROM cursillos WHERE codigo = ? AND eliminado_en IS NULL', [datos.cursillo.toUpperCase()]);
          if (!cursilloId) throw new ErrorNegocio(`Cursillo «${datos.cursillo}» no existe.`);
        }
        let grupoId = opciones.grupoId ?? null;
        if (datos.grupo && cursilloId) {
          grupoId = ctx.db.valor<number>('SELECT id FROM grupos WHERE cursillo_id = ? AND nombre = ? AND eliminado_en IS NULL', [cursilloId, datos.grupo]);
          if (!grupoId) throw new ErrorNegocio(`Grupo «${datos.grupo}» no existe en el cursillo.`);
        }

        const existente = ctx.db.valor<number>('SELECT id FROM estudiantes WHERE identificacion = ? AND eliminado_en IS NULL', [ident]);
        let estId = existente;
        ctx.db.tx(() => {
          if (!existente) {
            const d: Record<string, unknown> = {};
            for (const c of ENTIDADES.estudiantes.campos) d[c.name] = datos[c.name] ?? null;
            d.identificacion = ident;
            estId = guardar(ctx, 'estudiantes', d);
            creados++;
          }
          if (cursilloId) {
            const ya = ctx.db.valor<number>('SELECT id FROM matriculas WHERE estudiante_id = ? AND cursillo_id = ? AND eliminado_en IS NULL', [estId, cursilloId]);
            if (!ya) {
              guardar(ctx, 'matriculas', {
                estudiante_id: estId, cursillo_id: cursilloId, grupo_id: grupoId, fecha_inscripcion: fechaISO(new Date()), estado: 'Activa',
              });
              matriculados++;
            }
          }
        });
        resultado.push({
          fila, datos, estado: existente ? 'existente' : 'nuevo',
          mensaje: existente ? 'Ya registrado: no se duplica' + (cursilloId ? ' (se verifica su matrícula)' : '') : 'Listo para registrar',
        });
      } catch (e: any) {
        if (!(e instanceof ErrorNegocio)) throw e;
        resultado.push({ fila, datos, estado: 'error', mensaje: e.message });
      }
    }
  };

  if (opciones.simular) {
    // Se ejecuta todo dentro de una transacción que se revierte: valida con las mismas reglas.
    const REVERTIR = new Error('simulacion');
    try {
      ctx.db.tx(() => { ejecutar(); throw REVERTIR; });
    } catch (e) {
      if (e !== REVERTIR) throw e;
    }
  } else {
    ejecutar();
    auditar(ctx, 'Importó estudiantes desde Excel', 'estudiantes', null, { creados, matriculados });
  }
  return { filas: resultado, creados, matriculados, errores: resultado.filter((r) => r.estado === 'error').length };
}

/** Genera la plantilla de Excel para la importación masiva. */
export async function plantillaImportacion(destino: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Estudiantes');
  ws.columns = [
    { header: 'Tipo documento', key: 'a', width: 14 }, { header: 'Identificación', key: 'b', width: 16 },
    { header: 'Nombres', key: 'c', width: 22 }, { header: 'Apellidos', key: 'd', width: 22 },
    { header: 'Fecha de nacimiento', key: 'e', width: 18 }, { header: 'Institución educativa', key: 'f', width: 30 },
    { header: 'Grado', key: 'g', width: 10 }, { header: 'Teléfono', key: 'h', width: 14 },
    { header: 'Correo', key: 'i', width: 26 }, { header: 'Dirección', key: 'j', width: 26 },
    { header: 'Acudiente', key: 'k', width: 22 }, { header: 'Teléfono acudiente', key: 'l', width: 16 },
    { header: 'Cursillo', key: 'm', width: 12 }, { header: 'Grupo', key: 'n', width: 12 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } };
  ws.getCell('B1').note = 'Obligatorio. Sin puntos ni espacios.';
  ws.getCell('E1').note = 'Formato DD/MM/AAAA o AAAA-MM-DD.';
  ws.getCell('M1').note = 'Opcional: código del cursillo. Si se deja vacío se usa el cursillo elegido al importar.';
  const info = wb.addWorksheet('Instrucciones');
  [
    'Instrucciones para la importación masiva de estudiantes – MEIF SABANALARGA',
    '1. Diligencie una fila por estudiante en la hoja «Estudiantes» sin modificar los encabezados.',
    '2. Columnas obligatorias: Identificación, Nombres y Apellidos.',
    '3. Tipo documento: TI, CC, RC, CE, PPT o Pasaporte (por defecto TI).',
    '4. Grado: 6°, 7°, 8°, 9°, 10°, 11°, Egresado u Otro (puede escribir solo el número).',
    '5. Los estudiantes cuya identificación ya exista no se duplican.',
  ].forEach((t, i) => { info.getCell(`A${i + 1}`).value = t; });
  info.getColumn(1).width = 110;
  info.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(destino);
}
