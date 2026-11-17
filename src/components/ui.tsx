/** Componentes de interfaz reutilizables. */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Inbox, Search, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../estado';

// ----------------------------------------------------------------- logotipo
export function Emblema({ tam = 44 }: { tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 100 100" aria-label="Logotipo MEIF">
      <circle cx="50" cy="50" r="49" fill="#0B2545" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="#C9A227" strokeWidth="3" />
      <text x="50" y="52" textAnchor="middle" fontFamily="Segoe UI, Arial" fontWeight="800" fontSize="25" fill="#fff">MEIF</text>
      <text x="50" y="68" textAnchor="middle" fontFamily="Segoe UI, Arial" fontSize="7.4" fill="#C9A227" letterSpacing=".6">SABANALARGA</text>
      <text x="50" y="30" textAnchor="middle" fontFamily="Cambria Math, Times New Roman" fontSize="11" fill="#8DA9C4">Σ π ∫ ∞</text>
    </svg>
  );
}

export function Logo({ tam = 44 }: { tam?: number }) {
  const { imagenes } = useApp();
  if (imagenes.logo) return <img src={imagenes.logo} alt="Logotipo" style={{ width: tam, height: tam, objectFit: 'contain', borderRadius: 8, background: '#fff' }} />;
  return <Emblema tam={tam} />;
}

// -------------------------------------------------------------------- modal
export function Modal({ titulo, icono, onCerrar, children, pie, tam }: {
  titulo: ReactNode; icono?: ReactNode; onCerrar: () => void; children: ReactNode; pie?: ReactNode; tam?: 'chico' | 'grande';
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div className="velo">
      <div className={`modal ${tam ?? ''}`} role="dialog" aria-modal="true">
        <div className="m-cab">
          {icono}<h2>{titulo}</h2>
          <button className="btn icono fantasma cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="m-cuerpo">{children}</div>
        {pie && <div className="m-pie">{pie}</div>}
      </div>
    </div>
  );
}

export function PanelLateral({ titulo, onCerrar, children, acciones }: { titulo: ReactNode; onCerrar: () => void; children: ReactNode; acciones?: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <>
      <div className="velo-panel" onMouseDown={onCerrar} />
      <aside className="panel-lateral" role="dialog">
        <div className="m-cab"><h2 style={{ fontSize: 17 }}>{titulo}</h2><div className="espacio" />{acciones}
          <button className="btn icono fantasma" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="m-cuerpo">{children}</div>
      </aside>
    </>
  );
}

// ------------------------------------------------------------------ página
export function Pagina({ titulo, descripcion, acciones, children }: { titulo: string; descripcion?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="pagina-cab">
        <div><h1>{titulo}</h1>{descripcion && <p>{descripcion}</p>}</div>
        {acciones && <div className="acciones">{acciones}</div>}
      </div>
      {children}
    </>
  );
}

export function Tarjeta({ titulo, acciones, children, cuerpo = true, className }: { titulo?: ReactNode; acciones?: ReactNode; children: ReactNode; cuerpo?: boolean; className?: string }) {
  return (
    <section className={`tarjeta ${className ?? ''}`}>
      {(titulo || acciones) && <div className="cab"><h3>{titulo}</h3>{acciones && <div className="acciones">{acciones}</div>}</div>}
      {cuerpo ? <div className="cuerpo">{children}</div> : children}
    </section>
  );
}

export function Pestanas<T extends string>({ valor, opciones, onCambio }: { valor: T; opciones: { id: T; nombre: string; icono?: ReactNode }[]; onCambio: (v: T) => void }) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map((o) => (
        <button key={o.id} role="tab" aria-selected={valor === o.id} className={valor === o.id ? 'activa' : ''} onClick={() => onCambio(o.id)}>{o.icono}{o.nombre}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- insignias
const COLORES: Record<string, string> = {
  Activo: 'verde', Activa: 'verde', Ejecutada: 'verde', Asistió: 'verde', Vigente: 'verde', Completa: 'verde', 'Al día': 'verde', Certificado: 'verde',
  Finalizado: 'azul', Finalizada: 'azul', Programada: 'azul', Excusa: 'azul',
  Suspendido: 'naranja', Retardo: 'naranja', Atrasada: 'naranja', Retirada: 'naranja', 'Sin planeación': 'naranja',
  Cancelada: 'rojo', Anulada: 'rojo', Anulado: 'rojo', Ausente: 'rojo', 'No cumple': 'rojo', Inactivo: 'rojo',
};
export function Insignia({ valor, color }: { valor?: ReactNode; color?: string }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return <span className={`ins ${color ?? COLORES[String(valor)] ?? ''}`}>{valor}</span>;
}

export function Progreso({ valor, dorado }: { valor: number; dorado?: boolean }) {
  return (
    <div className="fila" style={{ gap: 8, flexWrap: 'nowrap' }}>
      <div className={`progreso ${dorado ? 'dorado' : ''}`} style={{ flex: 1 }}><div style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} /></div>
      <span className="peq" style={{ width: 42, textAlign: 'right' }}>{Math.round(valor * 10) / 10}%</span>
    </div>
  );
}

export function Vacio({ texto, icono }: { texto: string; icono?: ReactNode }) {
  return <div className="vacio">{icono ?? <Inbox size={36} />}<div>{texto}</div></div>;
}

export function Kpi({ icono, valor, etiqueta, sub }: { icono: ReactNode; valor: ReactNode; etiqueta: string; sub?: ReactNode }) {
  return (
    <div className="tarjeta kpi">
      <div className="ico">{icono}</div>
      <div><div className="valor">{valor}</div><div className="etiqueta">{etiqueta}</div>{sub && <div className="sub">{sub}</div>}</div>
    </div>
  );
}

export function Buscador({ valor, onCambio, placeholder }: { valor: string; onCambio: (v: string) => void; placeholder?: string }) {
  return (
    <div className="buscador">
      <Search size={16} />
      <input value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder ?? 'Buscar…'} aria-label="Buscar" />
    </div>
  );
}

// -------------------------------------------------------------------- tabla
export interface Col<T> {
  key: string; label: string; num?: boolean; ancho?: number;
  render?: (f: T) => ReactNode;
  /** Valor para ordenar/exportar (por defecto f[key]). */
  valor?: (f: T) => any;
  exportar?: boolean;
}

export function Tabla<T extends Record<string, any>>({
  filas, columnas, acciones, onFila, vacio = 'No hay registros.', porPagina = 50, seleccion, onSeleccion, pie, claveFila = 'id',
}: {
  filas: T[]; columnas: Col<T>[]; acciones?: (f: T) => ReactNode; onFila?: (f: T) => void; vacio?: string; porPagina?: number;
  seleccion?: Set<any>; onSeleccion?: (s: Set<any>) => void; pie?: ReactNode; claveFila?: string;
}) {
  const [orden, setOrden] = useState<{ k: string; asc: boolean } | null>(null);
  const [pagina, setPagina] = useState(0);
  useEffect(() => setPagina(0), [filas]);
  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const col = columnas.find((c) => c.key === orden.k);
    const v = (f: T) => (col?.valor ? col.valor(f) : f[orden.k]);
    return [...filas].sort((a, b) => {
      const x = v(a); const y = v(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true });
      return orden.asc ? r : -r;
    });
  }, [filas, orden, columnas]);
  const paginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const visibles = ordenadas.slice(pagina * porPagina, (pagina + 1) * porPagina);
  const todosSel = seleccion && filas.length > 0 && filas.every((f) => seleccion.has(f[claveFila]));

  return (
    <>
      <div className="tabla-env">
        <table className="tabla">
          <thead>
            <tr>
              {seleccion && (
                <th style={{ width: 32 }}>
                  <input type="checkbox" aria-label="Seleccionar todos" checked={!!todosSel}
                    onChange={() => onSeleccion?.(todosSel ? new Set() : new Set(filas.map((f) => f[claveFila])))} />
                </th>
              )}
              {columnas.map((c) => (
                <th key={c.key} className={`ordenable ${c.num ? 'num' : ''}`} style={{ width: c.ancho }}
                  onClick={() => setOrden((o) => (o?.k === c.key ? { k: c.key, asc: !o.asc } : { k: c.key, asc: true }))}>
                  {c.label}{orden?.k === c.key && (orden.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                </th>
              ))}
              {acciones && <th />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={f[claveFila] ?? i} onClick={onFila ? () => onFila(f) : undefined} style={onFila ? { cursor: 'pointer' } : undefined}
                className={seleccion?.has(f[claveFila]) ? 'sel' : ''}>
                {seleccion && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Seleccionar" checked={seleccion.has(f[claveFila])} onChange={() => {
                      const s = new Set(seleccion);
                      if (s.has(f[claveFila])) s.delete(f[claveFila]); else s.add(f[claveFila]);
                      onSeleccion?.(s);
                    }} />
                  </td>
                )}
                {columnas.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(f) : f[c.key]}</td>)}
                {acciones && <td className="acc" onClick={(e) => e.stopPropagation()}>{acciones(f)}</td>}
              </tr>
            ))}
          </tbody>
          {pie && <tfoot>{pie}</tfoot>}
        </table>
        {!filas.length && <Vacio texto={vacio} />}
      </div>
      {filas.length > porPagina && (
        <div className="paginacion">
          <span>{pagina * porPagina + 1}–{Math.min(filas.length, (pagina + 1) * porPagina)} de {filas.length}</span>
          <button className="btn chico" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} aria-label="Anterior"><ChevronLeft size={14} /></button>
          <button className="btn chico" disabled={pagina >= paginas - 1} onClick={() => setPagina(pagina + 1)} aria-label="Siguiente"><ChevronRight size={14} /></button>
        </div>
      )}
    </>
  );
}

/** Botones para exportar una tabla visible a PDF o Excel. */
export function BotonesExportar<T extends Record<string, any>>({ titulo, subtitulo, columnas, filas }: { titulo: string; subtitulo?: string; columnas: Col<T>[]; filas: T[] }) {
  const { intentar } = useApp();
  const exportar = (formato: 'pdf' | 'xlsx') => intentar(async () => {
    const cols = columnas.filter((c) => c.exportar !== false);
    const tabla = {
      titulo, subtitulo, columnas: cols.map((c) => ({ key: c.key, label: c.label })),
      filas: filas.map((f) => Object.fromEntries(cols.map((c) => [c.key, c.valor ? c.valor(f) : f[c.key]]))),
    };
    const r = await api('reportes.exportarTabla', { tabla, formato });
    return r;
  }).then((r) => r && undefined);
  return (
    <>
      <button className="btn" onClick={() => exportar('pdf')} title="Exportar a PDF"><FileText size={15} /> PDF</button>
      <button className="btn" onClick={() => exportar('xlsx')} title="Exportar a Excel"><FileSpreadsheet size={15} /> Excel</button>
    </>
  );
}

// ------------------------------------------------------- selector de catálogo
export interface Opcion { id: number; label: string; [k: string]: any }

/** Carga opciones de una entidad (cursillos, docentes…) para listas desplegables. */
export function useOpciones(entidad: string, dep: unknown[] = []): Opcion[] {
  const [ops, setOps] = useState<Opcion[]>([]);
  useEffect(() => {
    let vivo = true;
    api<Opcion[]>('crud.opciones', { entidad }).then((o) => vivo && setOps(o)).catch(() => undefined);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad, ...dep]);
  return ops;
}

export function SelectorOpciones({ label, valor, onCambio, opciones, todos = 'Todos', requerido, deshabilitado }: {
  label: string; valor: number | '' | null | undefined; onCambio: (v: number | '') => void; opciones: Opcion[]; todos?: string | null; requerido?: boolean; deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <div className="campo">
      <label htmlFor={id}>{label}{requerido && <span className="req">*</span>}</label>
      <select id={id} value={valor ?? ''} disabled={deshabilitado} onChange={(e) => onCambio(e.target.value ? Number(e.target.value) : '')}>
        {todos !== null && <option value="">{todos}</option>}
        {opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function CampoTexto({ label, valor, onCambio, tipo = 'text', requerido, ayuda, className, ...resto }: {
  label: string; valor: string | number | null | undefined; onCambio: (v: string) => void; tipo?: string; requerido?: boolean; ayuda?: string;
  className?: string; [k: string]: any;
}) {
  const id = useId();
  return (
    <div className={`campo ${className ?? ''}`}>
      <label htmlFor={id}>{label}{requerido && <span className="req">*</span>}</label>
      {tipo === 'textarea'
        ? <textarea id={id} value={valor ?? ''} onChange={(e) => onCambio(e.target.value)} {...resto} />
        : <input id={id} type={tipo} value={valor ?? ''} onChange={(e) => onCambio(e.target.value)} {...resto} />}
      {ayuda && <div className="ayuda">{ayuda}</div>}
    </div>
  );
}
