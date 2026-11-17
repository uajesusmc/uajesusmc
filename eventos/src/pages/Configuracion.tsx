/** Configuración: institución y certificado, logo y firma, usuarios, copias de seguridad y papelera. */
import { useCallback, useEffect, useState } from 'react';
import { Archive, Building2, DatabaseBackup, Eye, LayoutTemplate, PenLine, Image as Imagen, Pencil, Plus, RotateCcw, Save, Trash2, Upload, Users } from 'lucide-react';
import { FIRMANTES, ROLES } from '../../shared/modelos';
import { api, fmtFechaHora } from '../api';
import { CampoTexto, Emblema, Insignia, Modal, Pagina, Pestanas, Tabla, Tarjeta } from '../components/ui';
import { useApp } from '../estado';
import { PanelFirmas } from '../components/firmas';

function Institucion() {
  const { config, intentar, recargarConfig, puedeEditar } = useApp();
  const claves: [string, string, string?][] = [
    ['lugar_expedicion', 'Lugar de expedición de certificados y documentos'],
    ['cert_titulo', 'Título del certificado'],
    ['cert_texto', 'Texto del certificado (variables: {evento}, {fecha_inicio}, {fecha_fin}, {lugar}, {horas})', 'textarea'],
  ];
  const [d, setD] = useState<Record<string, string>>({});
  useEffect(() => setD({ ...Object.fromEntries(claves.map(([k]) => [k, config[k] ?? ''])), reportes_firmas: config.reportes_firmas ?? '1' }), [config]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Tarjeta>
      <div className="form">{claves.map(([k, l, t]) => <CampoTexto key={k} label={l} tipo={t ?? 'text'} valor={d[k]} onCambio={(v) => setD({ ...d, [k]: v })} className={t === 'textarea' ? 'ancho' : ''} />)}
        <label className="check ancho"><input type="checkbox" checked={d.reportes_firmas === '1'} onChange={(e) => setD({ ...d, reportes_firmas: e.target.checked ? '1' : '0' })} />
          Incluir las firmas del Presidente y del Secretario al final de los documentos PDF (listados, agenda, horario, reportes)</label></div>
      <p className="peq suave">Los nombres, cargos e imágenes de las firmas se gestionan en la pestaña «Firmas».</p>
      {puedeEditar && <div className="fila mt"><div className="espacio" /><button className="btn primario" onClick={async () => { if (await intentar(() => api('config.guardar', d), 'Configuración guardada.') !== undefined) recargarConfig(); }}><Save size={15} /> Guardar</button></div>}
    </Tarjeta>
  );
}

const CLAVES_MEMBRETE: [string, string, string?][] = [
  ['org_nombre', 'Nombre de la organización'], ['org_subtitulo', 'Subtítulo / áreas'], ['org_lema', 'Lema institucional (opcional)'],
  ['org_nit', 'NIT'], ['org_direccion', 'Dirección'], ['org_telefono', 'Teléfono'], ['org_correo', 'Correo electrónico', 'email'],
  ['cert_color_primario', 'Color institucional principal', 'color'], ['cert_color_secundario', 'Color de detalles', 'color'],
];

/** Diseño del encabezado (membrete) y pie de los documentos institucionales, con vista previa en vivo. */
function Membrete() {
  const { config, imagenes, intentar, recargarConfig, puedeEditar } = useApp();
  const [d, setD] = useState<Record<string, string>>({});
  useEffect(() => setD(Object.fromEntries(CLAVES_MEMBRETE.map(([k]) => [k, config[k] ?? '']))), [config]);
  const P = d.cert_color_primario || '#0B2545';
  const S = d.cert_color_secundario || '#C9A227';
  const contacto = [d.org_nit && `NIT ${d.org_nit}`, d.org_direccion, d.org_telefono && `Tel. ${d.org_telefono}`, d.org_correo].filter(Boolean);
  return (
    <div className="rejilla" style={{ gridTemplateColumns: 'minmax(300px, 420px) minmax(0, 1fr)' }}>
      <Tarjeta titulo="Datos del membrete">
        <div className="col-flex">{CLAVES_MEMBRETE.map(([k, l, t]) => <CampoTexto key={k} label={l} tipo={t ?? 'text'} valor={d[k]} onCambio={(v) => setD({ ...d, [k]: v })} />)}</div>
        <p className="peq suave">El logotipo se carga en la pestaña «Logotipo». El membrete se usa en documentos institucionales, reportes, listados y horarios.</p>
        <div className="fila mt">
          <button className="btn" onClick={() => intentar(() => api('membrete.vistaPrevia'))}><Eye size={15} /> Vista previa en PDF</button>
          <div className="espacio" />
          {puedeEditar && <button className="btn primario" onClick={async () => { if (await intentar(() => api('config.guardar', d), 'Membrete guardado.') !== undefined) recargarConfig(); }}><Save size={15} /> Guardar</button>}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Vista previa (se actualiza mientras escribe)">
        <div className="hoja-membrete">
          <div style={{ height: 9, background: P }} /><div style={{ height: 2, background: S }} />
          <div className="mem-cab">
            <div className="mem-logo">{imagenes.logo ? <img src={imagenes.logo} alt="" /> : <Emblema tam={58} />}</div>
            <div className="mem-org">
              <div style={{ color: P }} className="mem-nombre">{d.org_nombre || 'MEIF – SABANALARGA'}</div>
              <div className="mem-sub">{d.org_subtitulo}</div>
              {d.org_lema && <div className="mem-lema">«{d.org_lema}»</div>}
            </div>
            <div className="mem-contacto">{contacto.map((c) => <div key={c}>{c}</div>)}</div>
          </div>
          <div style={{ borderTop: `2px solid ${S}`, margin: '0 22px' }} /><div style={{ borderTop: `1px solid ${P}`, margin: '2px 22px 0' }} />
          <div className="mem-cuerpo">
            <div className="fila" style={{ justifyContent: 'space-between' }}><b>MEIF-OF-2026-001</b><span>{config.lugar_expedicion}, {new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
            <p style={{ marginTop: 18 }}><b>Asunto:</b> …</p>
            {[90, 100, 96, 70].map((w, i) => <div key={i} className="mem-linea" style={{ width: `${w}%` }} />)}
          </div>
          <div className="mem-pie"><span>{[d.org_nombre, d.org_direccion, d.org_telefono && `Tel. ${d.org_telefono}`, d.org_correo].filter(Boolean).join('  ·  ')}</span><span>Página 1 de 1</span></div>
          <div style={{ height: 6, background: P }} />
        </div>
      </Tarjeta>
    </div>
  );
}

function Imagenes() {
  const { imagenes, intentar, recargarConfig, puedeEditar } = useApp();
  return (
    <div className="rejilla c2">
      {([['logo', 'Logotipo', 'Se muestra en el menú, los reportes y los certificados.']] as const).map(([k, t, a]) => (
        <Tarjeta key={k} titulo={t}>
          <div className="imagen-config mb">{imagenes[k] ? <img src={imagenes[k]!} alt={t} /> : k === 'logo' ? <Emblema tam={80} /> : <span className="suave peq">Sin imagen</span>}</div>
          <p className="peq suave">{a}</p>
          {puedeEditar && <div className="fila">
            <button className="btn" onClick={async () => { if (await intentar(() => api('config.cargarImagen', { imagen: k }))) recargarConfig(); }}><Upload size={15} /> Cargar</button>
            {imagenes[k] && <button className="btn peligro" onClick={async () => { await intentar(() => api('config.quitarImagen', { imagen: k })); recargarConfig(); }}><Trash2 size={15} /> Quitar</button>}
          </div>}
        </Tarjeta>
      ))}
    </div>
  );
}

function Usuarios() {
  const { intentar, sesion, confirmar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const [d, setD] = useState<any>({});
  const cargar = useCallback(() => { intentar(() => api('usuarios.listar')).then((r) => r && setLista(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  const abrir = (u: any | null) => { setD(u ? { ...u, activo: !!u.activo, clave: '', firmante: u.firmante ?? '' } : { usuario: '', nombre: '', rol: 'organizador', activo: true, clave: '', firmante: '' }); setEditar(u); };
  return (
    <>
      <div className="fila mb"><span className="suave">Administrador: todo. Organizador: gestiona eventos. Solo consulta: ve información sin modificarla.</span><div className="espacio" />
        <button className="btn primario" onClick={() => abrir(null)}><Plus size={16} /> Nuevo usuario</button></div>
      <Tabla filas={lista} columnas={[
        { key: 'usuario', label: 'Usuario' }, { key: 'nombre', label: 'Nombre' }, { key: 'rol', label: 'Rol', render: (u) => <Insignia valor={ROLES[u.rol as keyof typeof ROLES]} color="azul" /> },
        { key: 'firmante', label: 'Firma como', render: (u) => (u.firmante ? <Insignia valor={FIRMANTES[u.firmante as keyof typeof FIRMANTES]} color="dorado" /> : '') },
        { key: 'activo', label: 'Estado', render: (u) => <Insignia valor={u.activo ? 'Activo' : 'Inactivo'} /> }, { key: 'ultimo_acceso', label: 'Último acceso', render: (u) => fmtFechaHora(u.ultimo_acceso) || 'Nunca' },
      ]} acciones={(u) => <>
        <button className="btn icono fantasma" onClick={() => abrir(u)}><Pencil size={15} /></button>
        {u.id !== sesion?.id && <button className="btn icono fantasma" onClick={async () => {
          if (await confirmar({ titulo: 'Eliminar usuario', mensaje: `¿Eliminar a ${u.usuario}?`, peligro: true, aceptar: 'Eliminar' })) { await intentar(() => api('usuarios.eliminar', { id: u.id }), 'Usuario eliminado.'); cargar(); }
        }}><Trash2 size={15} color="var(--rojo)" /></button>}
      </>} />
      {editar !== undefined && (
        <Modal titulo={editar ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={() => setEditar(undefined)}
          pie={<><button className="btn" onClick={() => setEditar(undefined)}>Cancelar</button><button className="btn primario" onClick={async () => {
            if (await intentar(() => api('usuarios.guardar', { ...d, id: editar?.id, clave: d.clave || undefined }), 'Usuario guardado.') !== undefined) { setEditar(undefined); cargar(); }
          }}>Guardar</button></>}>
          <div className="form">
            <CampoTexto label="Usuario" requerido valor={d.usuario} onCambio={(v) => setD({ ...d, usuario: v })} />
            <CampoTexto label="Nombre completo" requerido valor={d.nombre} onCambio={(v) => setD({ ...d, nombre: v })} />
            <div className="campo"><label htmlFor="u-rol">Rol</label><select id="u-rol" value={d.rol} onChange={(e) => setD({ ...d, rol: e.target.value })}>
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <CampoTexto label={editar ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} tipo="password" valor={d.clave} onCambio={(v) => setD({ ...d, clave: v })} ayuda="Mínimo 8 caracteres con letras y números; se pedirá cambiarla al ingresar." />
            <div className="campo"><label htmlFor="u-firmante">Firma como</label><select id="u-firmante" value={d.firmante ?? ''} onChange={(e) => setD({ ...d, firmante: e.target.value })}>
              <option value="">— No firma documentos —</option>{Object.entries(FIRMANTES).map(([k, v]) => <option key={k} value={k}>{v} de MEIF</option>)}</select>
              <div className="ayuda">Este usuario podrá subir su propia firma desde «Mi firma».</div></div>
            <label className="check"><input type="checkbox" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} /> Activo</label>
          </div>
        </Modal>
      )}
    </>
  );
}

function Respaldos() {
  const { intentar, esAdmin, confirmar, recargar, puedeEditar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const cargar = useCallback(() => { intentar(() => api('respaldo.listar')).then((r) => r && setLista(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  const restaurar = async (ruta?: string) => {
    if (!(await confirmar({ titulo: 'Restaurar copia', mensaje: 'Se reemplazarán todos los datos actuales (antes se guarda una copia del estado actual). Se cerrará la sesión.', peligro: true, aceptar: 'Restaurar' }))) return;
    if (await intentar(() => api('respaldo.restaurar', { ruta }), 'Copia restaurada. Inicie sesión de nuevo.')) recargar();
  };
  return (
    <>
      <div className="alerta info">Se crea una copia automática al día (al ingresar y al cerrar). Incluye la base de datos y las fotos de los eventos. Guarde copias en una USB periódicamente.</div>
      <div className="fila mb">
        {puedeEditar && <button className="btn primario" onClick={async () => { await intentar(() => api('respaldo.crear'), 'Copia creada.'); cargar(); }}><DatabaseBackup size={15} /> Crear copia ahora</button>}
        {puedeEditar && <button className="btn" onClick={async () => { await intentar(() => api('respaldo.exportar'), undefined); }}><Upload size={15} /> Copiar a USB / carpeta…</button>}
        {esAdmin && <button className="btn peligro" onClick={() => restaurar()}><RotateCcw size={15} /> Restaurar desde carpeta…</button>}
      </div>
      <Tabla filas={lista.map((r) => ({ ...r, id: r.nombre }))} columnas={[{ key: 'fecha', label: 'Fecha', render: (r) => new Date(r.fecha).toLocaleString('es-CO') }, { key: 'nombre', label: 'Copia' }]}
        acciones={esAdmin ? (r) => <button className="btn chico peligro" onClick={() => restaurar(r.ruta)}><RotateCcw size={14} /> Restaurar</button> : undefined} vacio="Aún no hay copias." />
    </>
  );
}

function Papelera() {
  const { intentar, puedeEditar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const cargar = useCallback(() => { intentar(() => api('papelera.listar')).then((r) => r && setLista(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  const tipos: Record<string, string> = { eventos: 'Evento', ponentes: 'Ponente', participantes: 'Participante', actividades: 'Actividad' };
  return (
    <Tabla filas={lista.map((r) => ({ ...r, k: `${r.tabla}${r.id}` }))} claveFila="k" vacio="La papelera está vacía." columnas={[
      { key: 'tabla', label: 'Tipo', render: (r) => <Insignia valor={tipos[r.tabla]} color="azul" /> }, { key: 'descripcion', label: 'Registro' },
      { key: 'eliminado_en', label: 'Eliminado', render: (r) => fmtFechaHora(r.eliminado_en) },
    ]} acciones={puedeEditar ? (r) => <button className="btn chico" onClick={async () => { if (await intentar(() => api('papelera.restaurar', r), 'Registro restaurado.') !== undefined) cargar(); }}><RotateCcw size={14} /> Restaurar</button> : undefined} />
  );
}

export function Configuracion() {
  const { esAdmin, info } = useApp();
  const [p, setP] = useState('institucion');
  return (
    <Pagina titulo="Configuración" descripcion={`Datos guardados en: ${info?.datos ?? ''}`}>
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'institucion', nombre: 'Institución y certificado', icono: <Building2 size={16} /> },
        { id: 'membrete', nombre: 'Membrete', icono: <LayoutTemplate size={16} /> }, { id: 'firmas', nombre: 'Firmas', icono: <PenLine size={16} /> }, { id: 'imagenes', nombre: 'Logotipo', icono: <Imagen size={16} /> },
        ...(esAdmin ? [{ id: 'usuarios', nombre: 'Usuarios', icono: <Users size={16} /> }] : []),
        { id: 'respaldos', nombre: 'Copias de seguridad', icono: <DatabaseBackup size={16} /> }, { id: 'papelera', nombre: 'Papelera', icono: <Archive size={16} /> },
      ]} />
      {p === 'institucion' && <Institucion />}
      {p === 'membrete' && <Membrete />}
      {p === 'firmas' && <PanelFirmas />}
      {p === 'imagenes' && <Imagenes />}
      {p === 'usuarios' && esAdmin && <Usuarios />}
      {p === 'respaldos' && <Respaldos />}
      {p === 'papelera' && <Papelera />}
    </Pagina>
  );
}
