/** Formulario y página genéricos para las entidades de `shared/entidades.ts`. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Eye, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { entidad as defEntidad, type Campo, type NombreEntidad } from '../../shared/entidades';
import type { Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum } from '../api';
import { useApp } from '../estado';
import { BotonesExportar, Buscador, Insignia, Modal, Pagina, Tabla, type Col, type Opcion } from './ui';

export function FormularioEntidad({ entidad, registro, valores, onCerrar, onGuardado, titulo }: {
  entidad: NombreEntidad; registro?: Record<string, any> | null; valores?: Record<string, any>;
  onCerrar: () => void; onGuardado: (id: number) => void; titulo?: string;
}) {
  const def = defEntidad(entidad);
  const { intentar, notificar } = useApp();
  const [datos, setDatos] = useState<Record<string, any>>(() => {
    const d: Record<string, any> = {};
    for (const c of def.campos) {
      const ini = registro?.[c.name] ?? valores?.[c.name];
      d[c.name] = ini ?? (typeof c.default === 'function' ? c.default() : c.default ?? '');
    }
    return d;
  });
  const [opciones, setOpciones] = useState<Record<string, Opcion[]>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const refs = def.campos.filter((c) => c.type === 'ref');
    Promise.all(refs.map((c) => api<Opcion[]>('crud.opciones', { entidad: c.ref }).then((o) => [c.name, o] as const)))
      .then((pares) => setOpciones(Object.fromEntries(pares)))
      .catch((e) => notificar(e.message, 'error'));
  }, [def, notificar]);

  const cambiar = (c: Campo, v: string) => {
    setDatos((d) => {
      const n = { ...d, [c.name]: v };
      // Si cambia el campo del que depende otro (p. ej. cursillo → grupo), se limpia.
      for (const o of def.campos) if (o.filtradoPor === c.name) n[o.name] = '';
      return n;
    });
    setErrores((e) => ({ ...e, [c.name]: '' }));
  };

  const guardar = async () => {
    const errs: Record<string, string> = {};
    for (const c of def.campos) {
      const v = String(datos[c.name] ?? '').trim();
      if (c.required && !v) errs[c.name] = 'Obligatorio';
      else if (c.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[c.name] = 'Correo inválido';
      else if (c.type === 'number' && v && Number.isNaN(Number(v.replace(',', '.')))) errs[c.name] = 'Número inválido';
    }
    setErrores(errs);
    if (Object.keys(errs).length) { setErrorGeneral('Revise los campos marcados.'); return; }
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const id = await api<number>('crud.guardar', { entidad, datos: { ...datos, id: registro?.id } });
      notificar(`${def.singular} ${registro?.id ? 'actualizado(a)' : 'registrado(a)'} correctamente.`, 'exito');
      onGuardado(id);
    } catch (e: any) {
      setErrorGeneral(e.message);
    } finally {
      setGuardando(false);
    }
  };
  void intentar;

  return (
    <Modal titulo={titulo ?? `${registro?.id ? 'Editar' : 'Nuevo(a)'} ${def.singular.toLowerCase()}`} onCerrar={onCerrar}
      pie={<>
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario" onClick={guardar} disabled={guardando}><Save size={15} /> {guardando ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      {errorGeneral && <div className="alerta error">{errorGeneral}</div>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        {def.campos.map((c) => {
          const v = datos[c.name] ?? '';
          let ops = opciones[c.name] ?? [];
          if (c.filtradoPor) ops = ops.filter((o) => String(o[c.filtradoPor!]) === String(datos[c.filtradoPor!]));
          return (
            <div key={c.name} className={`campo ${c.ancho || c.type === 'textarea' ? 'ancho' : ''} ${errores[c.name] ? 'error' : ''}`}>
              <label htmlFor={`f-${c.name}`}>{c.label}{c.required && <span className="req">*</span>}</label>
              {c.type === 'textarea' ? <textarea id={`f-${c.name}`} value={v} maxLength={2000} onChange={(e) => cambiar(c, e.target.value)} />
                : c.type === 'select' ? (
                  <select id={`f-${c.name}`} value={v} onChange={(e) => cambiar(c, e.target.value)}>
                    <option value="">— Seleccione —</option>
                    {c.options!.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : c.type === 'ref' ? (
                  <select id={`f-${c.name}`} value={v} onChange={(e) => cambiar(c, e.target.value)} disabled={!!c.filtradoPor && !datos[c.filtradoPor]}>
                    <option value="">{c.filtradoPor && !datos[c.filtradoPor] ? '— Elija primero el cursillo —' : '— Seleccione —'}</option>
                    {ops.map((o) => <option key={o.id} value={o.id}>{o.label}{o.estado && o.estado !== 'Activo' ? ` (${o.estado})` : ''}</option>)}
                  </select>
                ) : (
                  <input id={`f-${c.name}`} type={c.type === 'number' ? 'number' : c.type} value={v} min={c.min} max={c.max} step={c.type === 'number' ? 'any' : undefined}
                    maxLength={c.maxLength} onChange={(e) => cambiar(c, e.target.value)} />
                )}
              {errores[c.name] ? <div className="msg-error">{errores[c.name]}</div> : c.ayuda && <div className="ayuda">{c.ayuda}</div>}
            </div>
          );
        })}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export interface FiltroCrud { campo: string; label: string; ref?: string; opciones?: readonly string[] }

/** Formatea una columna según su definición. */
export function columnasDe<T extends Record<string, any>>(entidad: NombreEntidad, extra: Partial<Record<string, Partial<Col<T>>>> = {}): Col<T>[] {
  return defEntidad(entidad).columnas.map((c) => ({
    key: c.key, label: c.label, num: c.formato === 'numero',
    render: c.formato === 'fecha' ? (f: T) => fmtFecha(f[c.key]) : c.formato === 'numero' ? (f: T) => fmtNum(f[c.key]) : c.formato === 'estado' ? (f: T) => <Insignia valor={f[c.key]} /> : undefined,
    valor: c.formato === 'fecha' ? (f: T) => fmtFecha(f[c.key]) : undefined,
    ...extra[c.key],
  }));
}

export function CrudPagina({
  entidad, titulo, descripcion, filtros = [], filtrosFijos, acciones, botones, onDetalle, valoresNuevo, columnasExtra, sinPagina, recarga = 0, modulo,
}: {
  entidad: NombreEntidad; titulo?: string; descripcion?: ReactNode; filtros?: FiltroCrud[]; filtrosFijos?: Record<string, any>;
  acciones?: (f: any, recargar: () => void) => ReactNode; botones?: ReactNode; onDetalle?: (f: any) => void;
  valoresNuevo?: Record<string, any>; columnasExtra?: Partial<Record<string, Partial<Col<any>>>>; sinPagina?: boolean; recarga?: number; modulo?: Modulo;
}) {
  const def = defEntidad(entidad);
  const { puede, intentar, confirmar } = useApp();
  const mod = modulo ?? def.modulo;
  const [filas, setFilas] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [valoresFiltro, setValoresFiltro] = useState<Record<string, any>>({});
  const [editando, setEditando] = useState<Record<string, any> | null | undefined>(undefined);
  const [opciones, setOpciones] = useState<Record<string, Opcion[]>>({});
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    for (const f of filtros) if (f.ref) api<Opcion[]>('crud.opciones', { entidad: f.ref }).then((o) => setOpciones((x) => ({ ...x, [f.campo]: o }))).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    const r = await intentar(() => api<any[]>('crud.listar', { entidad, filtro: { busqueda, filtros: { ...valoresFiltro, ...filtrosFijos } } }));
    if (r) setFilas(r);
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidad, busqueda, JSON.stringify(valoresFiltro), JSON.stringify(filtrosFijos), intentar]);

  useEffect(() => {
    const t = setTimeout(recargar, busqueda ? 250 : 0);
    return () => clearTimeout(t);
  }, [recargar, busqueda, recarga]);

  const eliminar = async (f: any) => {
    const ok = await confirmar({
      titulo: `Eliminar ${def.singular.toLowerCase()}`, peligro: true, aceptar: 'Enviar a la papelera',
      mensaje: <>El registro se enviará a la <b>papelera</b> (Configuración › Papelera), desde donde puede restaurarse. ¿Desea continuar?</>,
    });
    if (!ok) return;
    if (await intentar(() => api('crud.eliminar', { entidad, id: f.id }), `${def.singular} enviado(a) a la papelera.`) !== undefined) recargar();
  };

  const columnas = useMemo(() => columnasDe(entidad, columnasExtra), [entidad, columnasExtra]);
  const subtitulo = Object.entries(valoresFiltro).filter(([, v]) => v).map(([k, v]) => {
    const f = filtros.find((x) => x.campo === k);
    const o = opciones[k]?.find((x) => String(x.id) === String(v));
    return `${f?.label}: ${o?.label ?? v}`;
  }).join(' · ');

  const contenido = (
    <>
      <div className="barra-filtros">
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder={`Buscar ${def.plural.toLowerCase()}…`} />
        {filtros.map((f) => (
          <div className="campo" key={f.campo}>
            <label htmlFor={`filtro-${f.campo}`}>{f.label}</label>
            <select id={`filtro-${f.campo}`} value={valoresFiltro[f.campo] ?? ''} onChange={(e) => setValoresFiltro((v) => ({ ...v, [f.campo]: e.target.value }))}>
              <option value="">Todos</option>
              {(f.opciones ?? []).map((o) => <option key={o}>{o}</option>)}
              {(opciones[f.campo] ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        ))}
        <div className="espacio" />
        <BotonesExportar titulo={titulo ?? def.plural} subtitulo={subtitulo} columnas={columnas} filas={filas} />
        {puede(mod, 'editar') && <button className="btn primario" onClick={() => setEditando(null)}><Plus size={16} /> Nuevo</button>}
      </div>
      <Tabla filas={filas} columnas={columnas} onFila={onDetalle} vacio={cargando ? 'Cargando…' : `No hay ${def.plural.toLowerCase()} registrados.`}
        acciones={(f) => (
          <>
            {acciones?.(f, recargar)}
            {onDetalle && <button className="btn icono fantasma" title="Ver detalle" onClick={() => onDetalle(f)}><Eye size={16} /></button>}
            {puede(mod, 'editar') && <button className="btn icono fantasma" title="Editar" onClick={() => setEditando(f)}><Pencil size={16} /></button>}
            {puede(mod, 'eliminar') && <button className="btn icono fantasma" title="Eliminar" onClick={() => eliminar(f)}><Trash2 size={16} color="var(--rojo)" /></button>}
          </>
        )} />
      <div className="peq suave mt">{filas.length} registro(s)</div>
      {editando !== undefined && (
        <FormularioEntidad entidad={entidad} registro={editando} valores={{ ...valoresNuevo, ...filtrosFijos }} onCerrar={() => setEditando(undefined)}
          onGuardado={() => { setEditando(undefined); recargar(); }} />
      )}
    </>
  );
  if (sinPagina) return contenido;
  return <Pagina titulo={titulo ?? def.plural} descripcion={descripcion} acciones={botones}>{contenido}</Pagina>;
}
