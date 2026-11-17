/** Estructura principal: menú lateral y páginas. */
import { useState, type ComponentType } from 'react';
import { Award, CalendarHeart, FileBarChart, Home, KeyRound, Loader2, LogOut, Mic2, Settings, Users, type LucideIcon } from 'lucide-react';
import { api } from './api';
import { Logo } from './components/ui';
import { useApp } from './estado';
import { Acceso, CambiarClave } from './pages/Acceso';
import { Certificados } from './pages/Certificados';
import { Configuracion } from './pages/Configuracion';
import { Eventos } from './pages/Eventos';
import { Inicio } from './pages/Inicio';
import { Participantes, Ponentes } from './pages/Personas';
import { Reportes } from './pages/Reportes';

export type Ir = (pagina: Pagina, parametros?: any) => void;
type Pagina = 'inicio' | 'eventos' | 'participantes' | 'ponentes' | 'certificados' | 'reportes' | 'configuracion';

const MENU: { id: Pagina; nombre: string; icono: LucideIcon; pagina: ComponentType<{ ir: Ir; parametros?: any }> }[] = [
  { id: 'inicio', nombre: 'Inicio', icono: Home, pagina: Inicio },
  { id: 'eventos', nombre: 'Eventos del año', icono: CalendarHeart, pagina: Eventos },
  { id: 'participantes', nombre: 'Participantes', icono: Users, pagina: Participantes },
  { id: 'ponentes', nombre: 'Ponentes y docentes', icono: Mic2, pagina: Ponentes },
  { id: 'certificados', nombre: 'Certificados', icono: Award, pagina: Certificados },
  { id: 'reportes', nombre: 'Reportes', icono: FileBarChart, pagina: Reportes },
  { id: 'configuracion', nombre: 'Configuración', icono: Settings, pagina: Configuracion },
];

export default function App() {
  const { info, sesion, recargar, confirmar } = useApp();
  const [pagina, setPagina] = useState<Pagina>('inicio');
  const [parametros, setParametros] = useState<any>(null);
  const [clave, setClave] = useState(false);
  if (!info) return <div className="cargando"><Loader2 className="girar" size={32} /><div>Cargando MEIF Eventos…</div></div>;
  if (!sesion) return <Acceso />;
  const ir: Ir = (p, x) => { setParametros(x ?? null); setPagina(p); };
  const Actual = MENU.find((m) => m.id === pagina)!.pagina;
  const salir = async () => {
    if (await confirmar({ titulo: 'Cerrar sesión', mensaje: '¿Desea cerrar la sesión?', aceptar: 'Cerrar sesión' })) { await api('auth.logout'); await recargar(); }
  };
  return (
    <div className="app">
      <aside className="menu">
        <div className="menu-marca"><Logo tam={46} /><div><strong>MEIF Eventos</strong><span>Sabanalarga · Matemáticas, Estadística, Informática y Física</span></div></div>
        <nav aria-label="Menú principal">
          {MENU.map((m) => (
            <button key={m.id} data-pagina={m.id} className={pagina === m.id ? 'activo' : ''} onClick={() => ir(m.id)}><m.icono size={18} />{m.nombre}</button>
          ))}
        </nav>
        <div className="menu-pie">
          <div className="usuario">
            <div className="avatar">{sesion.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
            <div style={{ minWidth: 0 }}><div style={{ color: '#fff', fontWeight: 600 }}>{sesion.nombre}</div>
              <div style={{ color: 'var(--azul-claro)' }}>{{ admin: 'Administrador', organizador: 'Organizador', consulta: 'Solo consulta' }[sesion.rol]}</div></div>
          </div>
          <div className="acciones">
            <button onClick={() => setClave(true)}><KeyRound size={13} /> Clave</button>
            <button onClick={salir}><LogOut size={13} /> Salir</button>
          </div>
        </div>
      </aside>
      <main className="principal"><div className="contenido" key={pagina + JSON.stringify(parametros)}><Actual ir={ir} parametros={parametros} /></div></main>
      {(clave || sesion.debeCambiarClave) && <CambiarClave obligatorio={sesion.debeCambiarClave} onCerrar={() => setClave(false)} />}
    </div>
  );
}
