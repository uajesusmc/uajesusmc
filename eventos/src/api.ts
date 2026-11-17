/** Cliente de llamadas al proceso principal. */

declare global {
  interface Window {
    meif: { invocar: (canal: string, args?: unknown) => Promise<{ ok: boolean; data?: any; error?: string; detalle?: any }> };
  }
}

export class ErrorApi extends Error {
  constructor(mensaje: string, public detalle?: any) { super(mensaje); }
}

export async function api<T = any>(canal: string, args?: unknown): Promise<T> {
  const r = await window.meif.invocar(canal, args);
  if (!r.ok) throw new ErrorApi(r.error ?? 'Error desconocido', r.detalle);
  return r.data as T;
}

// ------------------------------------------------------------- formatos
export const fmtFecha = (s?: string | null) => {
  if (!s) return '';
  const [a, m, d] = s.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : s;
};
export const fmtFechaHora = (s?: string | null) => (s ? `${fmtFecha(s)} ${s.slice(11, 16)}` : '');
export const fmtNum = (n?: number | null, dec = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: dec });
export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtBytes = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
