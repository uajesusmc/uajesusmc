/** Inicio de sesión, configuración inicial y cambio de contraseña. */
import { useState } from 'react';
import { KeyRound, LogIn, UserPlus } from 'lucide-react';
import { api } from '../api';
import { Emblema, Modal } from '../components/ui';
import { useApp } from '../estado';

function Lado() {
  return (
    <div className="lado">
      <Emblema tam={110} />
      <h1>MEIF Eventos</h1>
      <div className="linea-dorada" />
      <p>Plataforma para organizar los eventos del año de MEIF – Sabanalarga (Matemáticas, Estadística, Informática y Física):
        agenda, ponentes, participantes, asistencia y certificados.</p>
      <div className="areas"><span>Matemáticas</span><span>Estadística</span><span>Informática</span><span>Física</span></div>
    </div>
  );
}

export function Acceso() {
  const { info, recargar } = useApp();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [nombre, setNombre] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!info) return null;
  const primerArranque = !info.hayUsuarios;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (primerArranque && clave !== clave2) { setError('Las contraseñas no coinciden.'); return; }
    setOcupado(true);
    try {
      if (primerArranque) await api('auth.primerAdmin', { usuario, nombre, clave });
      else await api('auth.login', { usuario, clave });
      await recargar();
    } catch (er: any) {
      setError(er.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="login">
      <Lado />
      <div className="formulario">
        <div>
          <h2>{primerArranque ? 'Configuración inicial' : 'Iniciar sesión'}</h2>
          <p className="suave">{primerArranque
            ? 'Cree la cuenta del superadministrador. Con ella podrá registrar a los demás usuarios.'
            : 'Ingrese con su usuario y contraseña.'}</p>
          {error && <div className="alerta error">{error}</div>}
          <form onSubmit={enviar}>
            {primerArranque && (
              <div className="campo"><label htmlFor="a-nombre">Nombre completo<span className="req">*</span></label>
                <input id="a-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus /></div>
            )}
            <div className="campo"><label htmlFor="a-usuario">Usuario<span className="req">*</span></label>
              <input id="a-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required autoFocus={!primerArranque} /></div>
            <div className="campo"><label htmlFor="a-clave">Contraseña<span className="req">*</span></label>
              <input id="a-clave" type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete={primerArranque ? 'new-password' : 'current-password'} required />
              {primerArranque && <div className="ayuda">Mínimo 8 caracteres, con letras y números.</div>}</div>
            {primerArranque && (
              <div className="campo"><label htmlFor="a-clave2">Confirmar contraseña<span className="req">*</span></label>
                <input id="a-clave2" type="password" value={clave2} onChange={(e) => setClave2(e.target.value)} autoComplete="new-password" required /></div>
            )}
            <button className="btn primario mt" style={{ width: '100%', justifyContent: 'center', padding: 10 }} disabled={ocupado}>
              {primerArranque ? <><UserPlus size={16} /> Crear superadministrador</> : <><LogIn size={16} /> Ingresar</>}
            </button>
          </form>
          <p className="peq suave centro mt">Versión {info.version}</p>
        </div>
      </div>
    </div>
  );
}

export function CambiarClave({ obligatorio, onCerrar }: { obligatorio?: boolean; onCerrar: () => void }) {
  const { recargar, notificar } = useApp();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [nueva2, setNueva2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    if (nueva !== nueva2) { setError('Las contraseñas nuevas no coinciden.'); return; }
    try {
      await api('auth.cambiarClave', { actual, nueva });
      notificar('Contraseña actualizada.', 'exito');
      await recargar();
      onCerrar();
    } catch (e: any) { setError(e.message); }
  };
  return (
    <Modal tam="chico" titulo="Cambiar contraseña" icono={<KeyRound size={20} />} onCerrar={obligatorio ? () => undefined : onCerrar}
      pie={<>{!obligatorio && <button className="btn" onClick={onCerrar}>Cancelar</button>}<button className="btn primario" onClick={guardar}>Guardar</button></>}>
      {obligatorio && <div className="alerta aviso">Por seguridad debe cambiar la contraseña asignada antes de continuar.</div>}
      {error && <div className="alerta error">{error}</div>}
      <div className="col-flex">
        <div className="campo"><label htmlFor="c-actual">Contraseña actual</label><input id="c-actual" type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></div>
        <div className="campo"><label htmlFor="c-nueva">Nueva contraseña</label><input id="c-nueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <div className="ayuda">Mínimo 8 caracteres, con letras y números.</div></div>
        <div className="campo"><label htmlFor="c-nueva2">Confirmar nueva contraseña</label><input id="c-nueva2" type="password" value={nueva2} onChange={(e) => setNueva2(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
