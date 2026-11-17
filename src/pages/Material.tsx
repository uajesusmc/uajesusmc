/** Módulo 8: Biblioteca digital de material y guías del estudiante. */
import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, FolderOpen, Pencil, Trash2, Upload } from 'lucide-react';
import { TIPOS_MATERIAL, type Modulo } from '../../shared/constantes';
import { api, fmtBytes, fmtFecha, hoyISO } from '../api';
import { BotonesExportar, Buscador, CampoTexto, Insignia, Modal, Pagina, SelectorOpciones, Tabla, useOpciones, type Col } from '../components/ui';
import { useApp } from '../estado';

function FormularioMaterial({ material, onCerrar, onGuardado }: { material?: any; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar, sesion } = useApp();
  const cursillos = useOpciones('cursillos');
  const asignaturas = useOpciones('asignaturas');
  const docentes = useOpciones('docentes');
  const [d, setD] = useState<Record<string, any>>(() => ({
    titulo: '', tipo: 'Guía', descripcion: '', cursillo_id: '', asignatura_id: '', tematica_id: '', docente_id: sesion?.docenteId ?? '', fecha_publicacion: hoyISO(), ...material,
  }));
  const [archivo, setArchivo] = useState<{ ruta: string; nombre: string; tamano: number } | null>(null);
  const [tematicas, setTematicas] = useState<any[]>([]);
  useEffect(() => {
    if (d.asignatura_id) api('planeacion.tematicas', { asignaturaId: d.asignatura_id }).then(setTematicas).catch(() => setTematicas([]));
    else setTematicas([]);
  }, [d.asignatura_id]);
  const set = (k: string) => (v: any) => setD((x) => ({ ...x, [k]: v, ...(k === 'cursillo_id' ? { asignatura_id: '', tematica_id: '' } : {}), ...(k === 'asignatura_id' ? { tematica_id: '' } : {}) }));
  const elegir = async () => {
    const a = await intentar(() => api('material.elegirArchivo'));
    if (a) { setArchivo(a); if (!d.titulo) setD((x) => ({ ...x, titulo: a.nombre.replace(/\.[^.]+$/, '') })); }
  };
  const guardar = async () => {
    const r = material
      ? await intentar(() => api('material.actualizar', { ...d, id: material.id }), 'Material actualizado.')
      : await intentar(() => api('material.subir', { datos: d, archivo: archivo?.ruta }), 'Material cargado a la biblioteca.');
    if (r !== undefined) onGuardado();
  };
  return (
    <Modal titulo={material ? 'Editar material' : 'Cargar material educativo'} icono={<Upload size={20} />} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" disabled={!material && !archivo} onClick={guardar}>Guardar</button></>}>
      {!material && (
        <div className="zona-archivo mb" onClick={elegir} role="button">
          <Upload size={24} color="var(--azul-600)" />
          <div className="negrita">{archivo ? archivo.nombre : 'Seleccionar archivo'}</div>
          <div className="peq suave">{archivo ? fmtBytes(archivo.tamano) : 'PDF, Word, PowerPoint, Excel, imágenes, talleres, libros… (máx. 250 MB)'}</div>
        </div>
      )}
      <div className="form">
        <CampoTexto label="Título" requerido valor={d.titulo} onCambio={set('titulo')} maxLength={200} className="ancho" />
        <div className="campo"><label htmlFor="m-tipo">Tipo de material<span className="req">*</span></label>
          <select id="m-tipo" value={d.tipo} onChange={(e) => set('tipo')(e.target.value)}>{TIPOS_MATERIAL.map((t) => <option key={t}>{t}</option>)}</select></div>
        <CampoTexto label="Fecha de publicación" tipo="date" valor={d.fecha_publicacion} onCambio={set('fecha_publicacion')} />
        <SelectorOpciones label="Cursillo" valor={d.cursillo_id} onCambio={set('cursillo_id')} opciones={cursillos} todos="— General —" />
        <SelectorOpciones label="Asignatura" valor={d.asignatura_id} onCambio={set('asignatura_id')} opciones={asignaturas.filter((a) => !d.cursillo_id || a.cursillo_id === Number(d.cursillo_id))} todos="— Ninguna —" />
        <SelectorOpciones label="Unidad temática" valor={d.tematica_id} onCambio={set('tematica_id')} opciones={tematicas} todos="— Ninguna —" deshabilitado={!d.asignatura_id} />
        {sesion?.rol !== 'docente' && <SelectorOpciones label="Docente" valor={d.docente_id} onCambio={set('docente_id')} opciones={docentes} todos="— Ninguno —" />}
        <CampoTexto label="Descripción" tipo="textarea" valor={d.descripcion} onCambio={set('descripcion')} className="ancho" />
      </div>
    </Modal>
  );
}

export function Material(_: { ir: (m: Modulo, p?: any) => void }) {
  const { intentar, puede, confirmar, sesion } = useApp();
  const cursillos = useOpciones('cursillos');
  const asignaturas = useOpciones('asignaturas');
  const docentes = useOpciones('docentes');
  const [f, setF] = useState<Record<string, any>>({ busqueda: '', cursilloId: '', asignaturaId: '', docenteId: '', tipo: '', desde: '', hasta: '' });
  const [filas, setFilas] = useState<any[]>([]);
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const cargar = useCallback(() => {
    const t = setTimeout(() => intentar(() => api('material.listar', Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')))).then((r) => r && setFilas(r)), 200);
    return () => clearTimeout(t);
  }, [f, intentar]);
  useEffect(cargar, [cargar]);
  const propio = (m: any) => sesion?.rol !== 'docente' || m.docente_id === sesion.docenteId;
  const eliminar = async (m: any) => {
    if (!(await confirmar({ titulo: 'Eliminar material', mensaje: `¿Enviar «${m.titulo}» a la papelera?`, peligro: true, aceptar: 'Eliminar' }))) return;
    if (await intentar(() => api('material.eliminar', { id: m.id }), 'Material eliminado.') !== undefined) cargar();
  };
  const columnas: Col<any>[] = [
    { key: 'titulo', label: 'Título', render: (m) => <><b>{m.titulo}</b>{m.descripcion && <div className="peq suave">{m.descripcion}</div>}</>, valor: (m) => m.titulo },
    { key: 'tipo', label: 'Tipo', render: (m) => <Insignia valor={m.tipo} color="azul" />, valor: (m) => m.tipo },
    { key: 'cursillo', label: 'Cursillo' }, { key: 'asignatura', label: 'Asignatura' }, { key: 'tematica', label: 'Unidad temática' },
    { key: 'docente', label: 'Docente' }, { key: 'fecha_publicacion', label: 'Publicación', render: (m) => fmtFecha(m.fecha_publicacion), valor: (m) => fmtFecha(m.fecha_publicacion) },
    { key: 'archivo_nombre', label: 'Archivo', render: (m) => <span className="peq">{m.archivo_nombre}<br /><span className="suave">{fmtBytes(m.archivo_tamano)}</span></span>, valor: (m) => m.archivo_nombre },
  ];
  return (
    <Pagina titulo="Material educativo" descripcion="Biblioteca digital de guías, talleres, presentaciones, libros y material complementario."
      acciones={puede('material', 'editar') && <button className="btn primario" onClick={() => setEditar(null)}><Upload size={16} /> Cargar material</button>}>
      <div className="barra-filtros">
        <Buscador valor={f.busqueda} onCambio={(v) => setF({ ...f, busqueda: v })} placeholder="Buscar por título o archivo…" />
        <SelectorOpciones label="Cursillo" valor={f.cursilloId} onCambio={(v) => setF({ ...f, cursilloId: v, asignaturaId: '' })} opciones={cursillos} />
        <SelectorOpciones label="Asignatura" valor={f.asignaturaId} onCambio={(v) => setF({ ...f, asignaturaId: v })} opciones={asignaturas.filter((a) => !f.cursilloId || a.cursillo_id === f.cursilloId)} />
        <SelectorOpciones label="Docente" valor={f.docenteId} onCambio={(v) => setF({ ...f, docenteId: v })} opciones={docentes} />
        <div className="campo"><label htmlFor="m-ftipo">Tipo</label><select id="m-ftipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="">Todos</option>{TIPOS_MATERIAL.map((t) => <option key={t}>{t}</option>)}</select></div>
        <CampoTexto label="Publicado desde" tipo="date" valor={f.desde} onCambio={(v) => setF({ ...f, desde: v })} />
        <CampoTexto label="Hasta" tipo="date" valor={f.hasta} onCambio={(v) => setF({ ...f, hasta: v })} />
        <div className="espacio" />
        <BotonesExportar titulo="Material educativo" columnas={columnas} filas={filas} />
      </div>
      <Tabla filas={filas} columnas={columnas} vacio="No hay materiales con estos filtros." acciones={(m) => (
        <>
          <button className="btn chico" onClick={() => intentar(() => api('material.abrir', { id: m.id }))} title="Abrir"><ExternalLink size={14} /> Abrir</button>
          <button className="btn icono fantasma" onClick={() => intentar(() => api('material.descargar', { id: m.id }).then((r) => r && 'ok'), undefined)} title="Descargar"><Download size={15} /></button>
          {puede('material', 'editar') && propio(m) && <button className="btn icono fantasma" onClick={() => setEditar(m)} title="Editar"><Pencil size={15} /></button>}
          {puede('material', 'eliminar') && propio(m) && <button className="btn icono fantasma" onClick={() => eliminar(m)} title="Eliminar"><Trash2 size={15} color="var(--rojo)" /></button>}
        </>
      )} />
      <div className="peq suave mt"><FolderOpen size={13} /> {filas.length} recurso(s)</div>
      {editar !== undefined && <FormularioMaterial material={editar} onCerrar={() => setEditar(undefined)} onGuardado={() => { setEditar(undefined); cargar(); }} />}
    </Pagina>
  );
}
