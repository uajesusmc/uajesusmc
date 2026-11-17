/** Estado global: sesión, configuración, notificaciones y confirmaciones. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { Accion, Modulo } from '../shared/constantes';
import { api } from './api';

export interface Sesion {
  id: number; usuario: string; nombre: string; rol: string; rolNombre: string; docenteId: number | null;
  debeCambiarClave: boolean; permisos: Record<Modulo, { ver: boolean; editar: boolean; eliminar: boolean }>;
}
export interface InfoApp {
  version: string; modo: 'real' | 'demo'; demo: boolean; hayUsuarios: boolean; usuariosDemo: string[]; claveDemo: string | null;
  sesion: Sesion | null; datos: string; versionBd: number;
}

interface Global {
  info: InfoApp | null;
  sesion: Sesion | null;
  config: Record<string, string>;
  imagenes: Record<string, string | null>;
  recargar: () => Promise<void>;
  recargarConfig: () => Promise<void>;
  puede: (m: Modulo, a?: Accion) => boolean;
  notificar: (msg: string, tipo?: 'exito' | 'error' | 'aviso' | 'info') => void;
  confirmar: (o: { titulo: string; mensaje: ReactNode; aceptar?: string; peligro?: boolean }) => Promise<boolean>;
  /** Ejecuta una acción mostrando el error como notificación. Devuelve undefined si falla. */
  intentar: <T>(fn: () => Promise<T>, exito?: string) => Promise<T | undefined>;
}

const Ctx = createContext<Global>(null as any);
export const useApp = () => useContext(Ctx);

interface Toast { id: number; msg: string; tipo: 'exito' | 'error' | 'aviso' | 'info' }
interface Confirmacion { titulo: string; mensaje: ReactNode; aceptar?: string; peligro?: boolean; resolver: (v: boolean) => void }

export function ProveedorApp({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<InfoApp | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [imagenes, setImagenes] = useState<Record<string, string | null>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [conf, setConf] = useState<Confirmacion | null>(null);
  const idToast = useRef(0);

  const recargarConfig = useCallback(async () => {
    try {
      setConfig(await api('config.leer'));
      setImagenes(await api('config.imagenes'));
    } catch { /* sin sesión */ }
  }, []);

  const recargar = useCallback(async () => {
    const i = await api<InfoApp>('app.info');
    setInfo(i);
    if (i.sesion) await recargarConfig();
  }, [recargarConfig]);

  useEffect(() => { recargar(); }, [recargar]);

  const notificar = useCallback((msg: string, tipo: Toast['tipo'] = 'info') => {
    const id = ++idToast.current;
    setToasts((t) => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'error' ? 7000 : 4000);
  }, []);

  const confirmar = useCallback((o: Omit<Confirmacion, 'resolver'>) => new Promise<boolean>((resolver) => setConf({ ...o, resolver })), []);

  const intentar = useCallback(async <T,>(fn: () => Promise<T>, exito?: string) => {
    try {
      const r = await fn();
      if (exito) notificar(exito, 'exito');
      return r;
    } catch (e: any) {
      notificar(e?.message ?? String(e), 'error');
      return undefined;
    }
  }, [notificar]);

  const sesion = info?.sesion ?? null;
  const puede = useCallback((m: Modulo, a: Accion = 'ver') => !!sesion?.permisos?.[m]?.[a], [sesion]);

  const cerrarConf = (v: boolean) => { conf?.resolver(v); setConf(null); };

  return (
    <Ctx.Provider value={{ info, sesion, config, imagenes, recargar, recargarConfig, puede, notificar, confirmar, intentar }}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            {t.tipo === 'exito' ? <CheckCircle2 size={18} color="var(--verde)" /> : t.tipo === 'error' ? <XCircle size={18} color="var(--rojo)" />
              : t.tipo === 'aviso' ? <AlertTriangle size={18} color="var(--dorado)" /> : <Info size={18} color="var(--azul-600)" />}
            <div style={{ whiteSpace: 'pre-line' }}>{t.msg}</div>
          </div>
        ))}
      </div>
      {conf && (
        <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && cerrarConf(false)}>
          <div className="modal chico" role="dialog" aria-modal="true">
            <div className="m-cab">
              <AlertTriangle size={20} color={conf.peligro ? 'var(--rojo)' : 'var(--dorado)'} />
              <h2>{conf.titulo}</h2>
            </div>
            <div className="m-cuerpo">{conf.mensaje}</div>
            <div className="m-pie">
              <button className="btn" onClick={() => cerrarConf(false)}>Cancelar</button>
              <button autoFocus className={`btn ${conf.peligro ? 'peligro lleno' : 'primario'}`} onClick={() => cerrarConf(true)}>{conf.aceptar ?? 'Aceptar'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
