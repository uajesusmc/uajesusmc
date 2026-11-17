/** Estado global: sesión, configuración, banner, notificaciones y confirmaciones. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { api } from './api';

export interface Sesion { id: number; usuario: string; nombre: string; rol: 'admin' | 'organizador' | 'consulta'; debeCambiarClave: boolean; firmante: 'presidente' | 'secretario' | null }
export interface InfoApp { version: string; hayUsuarios: boolean; sesion: Sesion | null; datos: string }
export interface Banner { id: number; nombre: string; tipo: string; anio: number; fecha_inicio: string; fecha_fin: string; lugar: string | null; imagen: string }

interface Global {
  info: InfoApp | null; sesion: Sesion | null; config: Record<string, string>; imagenes: Record<string, string | null>; banner: Banner | null;
  puedeEditar: boolean; esAdmin: boolean;
  recargar: () => Promise<void>; recargarConfig: () => Promise<void>; recargarBanner: () => Promise<void>;
  notificar: (m: string, t?: 'exito' | 'error' | 'aviso' | 'info') => void;
  confirmar: (o: { titulo: string; mensaje: ReactNode; aceptar?: string; peligro?: boolean }) => Promise<boolean>;
  intentar: <T>(fn: () => Promise<T>, exito?: string) => Promise<T | undefined>;
}

const Ctx = createContext<Global>(null as any);
export const useApp = () => useContext(Ctx);

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<InfoApp | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [imagenes, setImagenes] = useState<Record<string, string | null>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [toasts, setToasts] = useState<{ id: number; m: string; t: string }[]>([]);
  const [conf, setConf] = useState<any>(null);
  const n = useRef(0);

  const recargarBanner = useCallback(async () => { try { setBanner(await api('banner.actual')); } catch { setBanner(null); } }, []);
  const recargarConfig = useCallback(async () => {
    try { setConfig(await api('config.leer')); setImagenes(await api('config.imagenes')); } catch { /* sin sesión */ }
  }, []);
  const recargar = useCallback(async () => {
    const i = await api<InfoApp>('app.info');
    setInfo(i);
    if (i.sesion) await Promise.all([recargarConfig(), recargarBanner()]);
  }, [recargarConfig, recargarBanner]);
  useEffect(() => { recargar(); }, [recargar]);

  const notificar = useCallback((m: string, t: 'exito' | 'error' | 'aviso' | 'info' = 'info') => {
    const id = ++n.current;
    setToasts((x) => [...x, { id, m, t }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t === 'error' ? 7000 : 4000);
  }, []);
  const confirmar = useCallback((o: any) => new Promise<boolean>((resolver) => setConf({ ...o, resolver })), []);
  const intentar = useCallback(async <T,>(fn: () => Promise<T>, exito?: string) => {
    try { const r = await fn(); if (exito) notificar(exito, 'exito'); return r; } catch (e: any) { notificar(e?.message ?? String(e), 'error'); return undefined; }
  }, [notificar]);
  const sesion = info?.sesion ?? null;
  const cerrar = (v: boolean) => { conf?.resolver(v); setConf(null); };

  return (
    <Ctx.Provider value={{
      info, sesion, config, imagenes, banner, puedeEditar: !!sesion && sesion.rol !== 'consulta', esAdmin: sesion?.rol === 'admin',
      recargar, recargarConfig, recargarBanner, notificar, confirmar, intentar,
    }}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.t}`}>
            {t.t === 'exito' ? <CheckCircle2 size={18} color="var(--verde)" /> : t.t === 'error' ? <XCircle size={18} color="var(--rojo)" /> : t.t === 'aviso' ? <AlertTriangle size={18} color="var(--dorado)" /> : <Info size={18} color="var(--azul-600)" />}
            <div style={{ whiteSpace: 'pre-line' }}>{t.m}</div>
          </div>
        ))}
      </div>
      {conf && (
        <div className="velo">
          <div className="modal chico" role="dialog" aria-modal="true">
            <div className="m-cab"><AlertTriangle size={20} color={conf.peligro ? 'var(--rojo)' : 'var(--dorado)'} /><h2>{conf.titulo}</h2></div>
            <div className="m-cuerpo">{conf.mensaje}</div>
            <div className="m-pie">
              <button className="btn" onClick={() => cerrar(false)}>Cancelar</button>
              <button autoFocus className={`btn ${conf.peligro ? 'peligro lleno' : 'primario'}`} onClick={() => cerrar(true)}>{conf.aceptar ?? 'Aceptar'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
