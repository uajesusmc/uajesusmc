/** Módulo 12 (parte 1): Usuarios, permisos por rol y registro de actividades. */
import { useCallback, useEffect, useState } from 'react';
import { History, Pencil, Plus, ShieldCheck, Trash2, Users as IconoUsuarios } from 'lucide-react';
import { MODULOS, type Modulo } from '../../shared/constantes';
import { api, fmtFechaHora } from '../api';
import { BotonesExportar, Buscador, CampoTexto, Insignia, Modal, Pagina, Pestanas, SelectorOpciones, Tabla, useOpciones, type Col } from '../components/ui';
import { useApp } from '../estado';

function FormularioUsuario({ usuario, roles, onCerrar, onGuardado }: { usuario?: any; roles: any[]; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar } = useApp();
  const docentes = useOpciones('docentes');
  const [d, setD] = useState<any>(() => ({ usuario: '', nombre: '', rol_id: '', docente_id: '', activo: true, clave: '', ...usuario, ...(usuario ? { activo: !!usuario.activo, clave: '' } : {}) }));
  const rol = roles.find((r) => r.id === Number(d.rol_id));
  const guardar = async () => {
    const r = await intentar(() => api('usuarios.guardar', { ...d, id: usuario?.id, rol_id: Number(d.rol_id), docente_id: d.docente_id || null, clave: d.clave || undefined }),
      usuario ? 'Usuario actualizado.' : 'Usuario creado. Deberá cambiar la contraseña en su primer ingreso.');
    if (r !== undefined) onGuardado();
  };
  return (
    <Modal titulo={usuario ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={guardar}>Guardar</button></>}>
      <div className="form">
        <CampoTexto label="Usuario (para iniciar sesión)" requerido valor={d.usuario} onCambio={(v) => setD({ ...d, usuario: v })} maxLength={30} />
        <CampoTexto label="Nombre completo" requerido valor={d.nombre} onCambio={(v) => setD({ ...d, nombre: v })} maxLength={120} />
        <div className="campo"><label htmlFor="u-rol">Rol<span className="req">*</span></label>
          <select id="u-rol" value={d.rol_id} onChange={(e) => setD({ ...d, rol_id: e.target.value })}><option value="">— Seleccione —</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></div>
        {rol?.codigo === 'docente'
          ? <SelectorOpciones label="Docente vinculado" requerido valor={d.docente_id} onCambio={(v) => setD({ ...d, docente_id: v })} opciones={docentes} todos="— Seleccione —" />
          : <div />}
        <CampoTexto label={usuario ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} requerido={!usuario} tipo="password" valor={d.clave} onCambio={(v) => setD({ ...d, clave: v })}
          ayuda="Mínimo 8 caracteres con letras y números. El usuario deberá cambiarla al ingresar." autoComplete="new-password" />
        <div className="campo"><label>Estado</label><label className="check"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} /> Usuario activo</label></div>
      </div>
    </Modal>
  );
}

function ListaUsuarios() {
  const { intentar, puede, confirmar, sesion } = useApp();
  const [filas, setFilas] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const cargar = useCallback(() => {
    intentar(() => api('usuarios.listar')).then((r) => r && setFilas(r));
    intentar(() => api('usuarios.roles')).then((r) => r && setRoles(r));
  }, [intentar]);
  useEffect(cargar, [cargar]);
  const eliminar = async (u: any) => {
    if (!(await confirmar({ titulo: 'Eliminar usuario', mensaje: `¿Eliminar al usuario «${u.usuario}»? No podrá volver a ingresar.`, peligro: true, aceptar: 'Eliminar' }))) return;
    if (await intentar(() => api('usuarios.eliminar', { id: u.id }), 'Usuario eliminado.') !== undefined) cargar();
  };
  return (
    <>
      <div className="fila mb"><div className="espacio" />{puede('usuarios', 'editar') && <button className="btn primario" onClick={() => setEditar(null)}><Plus size={16} /> Nuevo usuario</button>}</div>
      <Tabla filas={filas} columnas={[
        { key: 'usuario', label: 'Usuario', render: (u) => <b>{u.usuario}</b> }, { key: 'nombre', label: 'Nombre' },
        { key: 'rol', label: 'Rol', render: (u) => <Insignia valor={u.rol} color="azul" /> }, { key: 'docente', label: 'Docente vinculado' },
        { key: 'activo', label: 'Estado', render: (u) => <Insignia valor={u.activo ? 'Activo' : 'Inactivo'} /> },
        { key: 'ultimo_acceso', label: 'Último acceso', render: (u) => fmtFechaHora(u.ultimo_acceso) || 'Nunca' },
      ]} acciones={(u) => (
        <>
          {puede('usuarios', 'editar') && <button className="btn icono fantasma" onClick={() => setEditar(u)} title="Editar"><Pencil size={15} /></button>}
          {puede('usuarios', 'eliminar') && u.id !== sesion?.id && <button className="btn icono fantasma" onClick={() => eliminar(u)} title="Eliminar"><Trash2 size={15} color="var(--rojo)" /></button>}
        </>
      )} />
      {editar !== undefined && <FormularioUsuario usuario={editar} roles={roles} onCerrar={() => setEditar(undefined)} onGuardado={() => { setEditar(undefined); cargar(); }} />}
    </>
  );
}

function Permisos() {
  const { intentar, sesion } = useApp();
  const [m, setM] = useState<any[]>([]);
  const cargar = useCallback(() => { intentar(() => api('usuarios.permisos')).then((r) => r && setM(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  const roles = [...new Map(m.map((x) => [x.rol_id, { id: x.rol_id, nombre: x.rol, codigo: x.codigo }])).values()];
  const editable = sesion?.rol === 'superadmin';
  const cambiar = async (rolId: number, modulo: Modulo, accion: 'ver' | 'editar' | 'eliminar', valor: boolean) => {
    const p = m.find((x) => x.rol_id === rolId && x.modulo === modulo);
    const nuevo = { ver: !!p.ver, editar: !!p.editar, eliminar: !!p.eliminar, [accion]: valor };
    if (accion === 'ver' && !valor) { nuevo.editar = false; nuevo.eliminar = false; }
    if (await intentar(() => api('usuarios.guardarPermiso', { rolId, modulo, permiso: nuevo })) !== undefined) cargar();
  };
  return (
    <>
      <div className="alerta info">Defina qué puede hacer cada rol en cada módulo: <b>V</b> = ver/consultar, <b>E</b> = agregar/editar, <b>X</b> = eliminar.
        Los cambios aplican la próxima vez que el usuario inicie sesión. {!editable && 'Solo el superadministrador puede modificarlos.'}</div>
      <div className="tabla-env">
        <table className="tabla matriz-permisos">
          <thead>
            <tr><th rowSpan={2}>Módulo</th>{roles.map((r) => <th key={r.id} colSpan={3}>{r.nombre}</th>)}</tr>
            <tr>{roles.map((r) => ['V', 'E', 'X'].map((a) => <th key={r.id + a}>{a}</th>))}</tr>
          </thead>
          <tbody>
            {MODULOS.map((mod) => (
              <tr key={mod.id}>
                <td><b>{mod.nombre}</b></td>
                {roles.map((r) => {
                  const p = m.find((x) => x.rol_id === r.id && x.modulo === mod.id) ?? {};
                  return (['ver', 'editar', 'eliminar'] as const).map((a) => (
                    <td key={r.id + a}><input type="checkbox" aria-label={`${r.nombre} ${a} ${mod.nombre}`} checked={!!p[a]} disabled={!editable || r.codigo === 'superadmin'}
                      onChange={(e) => cambiar(r.id, mod.id, a, e.target.checked)} /></td>
                  ));
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Auditoria() {
  const { intentar } = useApp();
  const [f, setF] = useState({ texto: '', desde: '', hasta: '' });
  const [filas, setFilas] = useState<any[]>([]);
  useEffect(() => {
    const t = setTimeout(() => intentar(() => api('usuarios.auditoria', { ...f, limite: 2000 })).then((r) => r && setFilas(r)), 250);
    return () => clearTimeout(t);
  }, [f, intentar]);
  const cols: Col<any>[] = [
    { key: 'fecha', label: 'Fecha y hora', render: (a) => fmtFechaHora(a.fecha), valor: (a) => a.fecha }, { key: 'usuario', label: 'Usuario' },
    { key: 'accion', label: 'Acción' }, { key: 'entidad', label: 'Registro' }, { key: 'entidad_id', label: 'ID', num: true },
    { key: 'detalle', label: 'Detalle', render: (a) => <span className="peq suave" style={{ wordBreak: 'break-word' }}>{a.detalle}</span> },
  ];
  return (
    <>
      <div className="barra-filtros">
        <Buscador valor={f.texto} onCambio={(v) => setF({ ...f, texto: v })} placeholder="Buscar acción, usuario o detalle…" />
        <CampoTexto label="Desde" tipo="date" valor={f.desde} onCambio={(v) => setF({ ...f, desde: v })} />
        <CampoTexto label="Hasta" tipo="date" valor={f.hasta} onCambio={(v) => setF({ ...f, hasta: v })} />
        <div className="espacio" /><BotonesExportar titulo="Registro de actividades" columnas={cols} filas={filas} />
      </div>
      <Tabla filas={filas} columnas={cols} porPagina={100} vacio="Sin actividades registradas." />
    </>
  );
}

export function Usuarios(_: { ir: (m: Modulo, p?: any) => void }) {
  const [p, setP] = useState<'usuarios' | 'permisos' | 'auditoria'>('usuarios');
  return (
    <Pagina titulo="Usuarios y seguridad" descripcion="Cuentas de acceso, roles (Superadministrador, Coordinador académico, Docente, Secretaría), permisos y registro de actividades.">
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'usuarios', nombre: 'Usuarios', icono: <IconoUsuarios size={16} /> }, { id: 'permisos', nombre: 'Permisos por rol', icono: <ShieldCheck size={16} /> },
        { id: 'auditoria', nombre: 'Registro de actividades', icono: <History size={16} /> },
      ]} />
      {p === 'usuarios' && <ListaUsuarios />}
      {p === 'permisos' && <Permisos />}
      {p === 'auditoria' && <Auditoria />}
    </Pagina>
  );
}
