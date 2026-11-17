/** Estructura principal: menú lateral con los 14 módulos y contenido. */
import { useEffect, useState, type ComponentType } from 'react';
import {
  BookOpen, CalendarClock, CalendarRange, ClipboardCheck, FileBarChart, FolderOpen, GraduationCap, Home, KeyRound, ListTree, LogOut,
  Loader2, Settings, ShieldCheck, UserSquare2, Users, Award, type LucideIcon,
} from 'lucide-react';
import { MODULOS, type Modulo } from '../shared/constantes';
import { api } from './api';
import { Logo } from './components/ui';
import { useApp } from './estado';
import { Acceso, CambiarClave } from './pages/Acceso';
import { Asignaturas } from './pages/Asignaturas';
import { Asistencia } from './pages/Asistencia';
import { Certificados } from './pages/Certificados';
import { Configuracion } from './pages/Configuracion';
import { Cursillos } from './pages/Cursillos';
import { Docentes } from './pages/Docentes';
import { Estudiantes } from './pages/Estudiantes';
import { Grupos } from './pages/Grupos';
import { Horarios } from './pages/Horarios';
import { Inicio } from './pages/Inicio';
import { Material } from './pages/Material';
import { Planeacion } from './pages/Planeacion';
import { Reportes } from './pages/Reportes';
import { Usuarios } from './pages/Usuarios';

const ICONOS: Record<Modulo, LucideIcon> = {
  inicio: Home, cursillos: CalendarRange, docentes: UserSquare2, estudiantes: GraduationCap, asignaturas: BookOpen, grupos: Users,
  horarios: CalendarClock, planeacion: ListTree, material: FolderOpen, asistencia: ClipboardCheck, certificados: Award,
  reportes: FileBarChart, usuarios: ShieldCheck, configuracion: Settings,
};

const PAGINAS: Record<Modulo, ComponentType<{ ir: (m: Modulo, p?: any) => void; parametros?: any }>> = {
  inicio: Inicio, cursillos: Cursillos, docentes: Docentes, estudiantes: Estudiantes, asignaturas: Asignaturas, grupos: Grupos,
  horarios: Horarios, planeacion: Planeacion, material: Material, asistencia: Asistencia, certificados: Certificados,
  reportes: Reportes, usuarios: Usuarios, configuracion: Configuracion,
};

export default function App() {
  const { info, sesion, puede, recargar, confirmar } = useApp();
  const [modulo, setModulo] = useState<Modulo>('inicio');
  const [parametros, setParametros] = useState<any>(null);
  const [cambiarClave, setCambiarClave] = useState(false);

  useEffect(() => { if (sesion && !puede(modulo)) setModulo('inicio'); }, [sesion, modulo, puede]);

  if (!info) return <div className="cargando"><Loader2 className="girar" size={32} /><div>Cargando MEIF – SABANALARGA…</div></div>;
  if (!sesion) return <Acceso />;

  const ir = (m: Modulo, p?: any) => { setParametros(p ?? null); setModulo(m); };
  const salir = async () => {
    if (await confirmar({ titulo: 'Cerrar sesión', mensaje: '¿Desea cerrar la sesión?', aceptar: 'Cerrar sesión' })) {
      await api('auth.logout');
      await recargar();
    }
  };
  const Pagina = PAGINAS[modulo];
  const visibles = MODULOS.filter((m) => puede(m.id));

  return (
    <div className="app">
      <aside className="menu">
        <div className="menu-marca">
          <Logo tam={46} />
          <div><strong>MEIF – SABANALARGA</strong><span>Matemáticas, Estadística, Informática y Física</span></div>
        </div>
        <nav aria-label="Menú principal">
          {visibles.map((m, i) => {
            const Icono = ICONOS[m.id];
            return (
              <button key={m.id} className={modulo === m.id ? 'activo' : ''} onClick={() => ir(m.id)} data-modulo={m.id}>
                <Icono size={18} />{m.nombre}<span className="num">{MODULOS.findIndex((x) => x.id === m.id) + 1 || i + 1}</span>
              </button>
            );
          })}
        </nav>
        <div className="menu-pie">
          <div className="usuario">
            <div className="avatar">{sesion.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
            <div style={{ minWidth: 0 }}><div style={{ color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sesion.nombre}</div>
              <div style={{ color: 'var(--azul-claro)' }}>{sesion.rolNombre}</div></div>
          </div>
          <div className="acciones">
            <button onClick={() => setCambiarClave(true)} title="Cambiar contraseña"><KeyRound size={13} /> Clave</button>
            <button onClick={salir} title="Cerrar sesión"><LogOut size={13} /> Salir</button>
          </div>
        </div>
      </aside>
      <main className="principal">
        {info.demo && <div className="aviso-demo">MODO DEMOSTRACIÓN — Datos ficticios para capacitación. No corresponden a registros reales.</div>}
        <div className="contenido" key={modulo}>
          <Pagina ir={ir} parametros={parametros} />
        </div>
      </main>
      {(cambiarClave || sesion.debeCambiarClave) && <CambiarClave obligatorio={sesion.debeCambiarClave} onCerrar={() => setCambiarClave(false)} />}
    </div>
  );
}
