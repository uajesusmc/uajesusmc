/** Eventos del año y detalle de cada evento (resumen y foto, agenda, inscritos, asistencia y certificados). */
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Award, CalendarHeart, GraduationCap, CalendarPlus, CheckCircle2, ClipboardCheck, Download, Eye, FileSpreadsheet, ImagePlus, MapPin, Pencil,
  Plus, Trash2, Upload, UserPlus, Users, XCircle,
} from 'lucide-react';
import { AREAS, ESTADOS_EVENTO, TIPOS_ACTIVIDAD } from '../../shared/modelos';
import type { Ir } from '../App';
import { api, fmtFecha, fmtNum } from '../api';
import { Formulario } from '../components/comunes';
import { Buscador, CampoTexto, Insignia, Modal, Pestanas, Progreso, Tabla, Tarjeta, Vacio } from '../components/ui';
import { useApp } from '../estado';
import { OrganizacionEvento } from './Organizacion';

// ------------------------------------------------------------------- agenda
function FormularioActividad({ eventoId, actividad, fechaInicial, onCerrar, onGuardado }: { eventoId: number; actividad?: any; fechaInicial: string; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar } = useApp();
  const [ponentes, setPonentes] = useState<any[]>([]);
  const [d, setD] = useState<any>(() => ({ titulo: '', tipo: 'Conferencia', area: '', ponente_id: '', fecha: fechaInicial, hora_inicio: '08:00', hora_fin: '09:00', lugar: '', descripcion: '', ...actividad }));
  const [v, setV] = useState<{ errores: string[]; advertencias: string[] } | null>(null);
  useEffect(() => { api('datos.listar', { modelo: 'ponentes' }).then(setPonentes).catch(() => undefined); }, []);
  const datos = { ...d, evento_id: eventoId, ponente_id: d.ponente_id ? Number(d.ponente_id) : null, id: actividad?.id };
  useEffect(() => {
    const t = setTimeout(() => api('agenda.verificar', datos).then(setV).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [JSON.stringify(datos)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (x: string) => setD({ ...d, [k]: x });
  const guardar = async () => { if (await intentar(() => api('agenda.guardar', datos), 'Actividad guardada en la agenda.') !== undefined) onGuardado(); };
  return (
    <Modal titulo={actividad ? 'Editar actividad' : 'Nueva actividad de la agenda'} icono={<CalendarPlus size={20} />} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" disabled={!v || v.errores.length > 0} onClick={guardar}>Guardar</button></>}>
      <div className="form">
        <CampoTexto label="Título de la actividad" requerido valor={d.titulo} onCambio={set('titulo')} className="ancho" maxLength={200} />
        <div className="campo"><label htmlFor="a-tipo">Tipo<span className="req">*</span></label>
          <select id="a-tipo" value={d.tipo} onChange={(e) => set('tipo')(e.target.value)}>{TIPOS_ACTIVIDAD.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="campo"><label htmlFor="a-area">Área</label>
          <select id="a-area" value={d.area ?? ''} onChange={(e) => set('area')(e.target.value)}><option value="">—</option>{AREAS.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="campo"><label htmlFor="a-ponente">Ponente / docente</label>
          <select id="a-ponente" value={d.ponente_id ?? ''} onChange={(e) => set('ponente_id')(e.target.value)}>
            <option value="">— Sin ponente —</option>{ponentes.map((p) => <option key={p.id} value={p.id}>{p.apellidos}, {p.nombres}</option>)}
          </select></div>
        <CampoTexto label="Lugar (aula, auditorio…)" valor={d.lugar} onCambio={set('lugar')} maxLength={100} />
        <CampoTexto label="Fecha" tipo="date" requerido valor={d.fecha} onCambio={set('fecha')} />
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <CampoTexto label="Hora de inicio" tipo="time" requerido valor={d.hora_inicio} onCambio={set('hora_inicio')} />
          <CampoTexto label="Hora de fin" tipo="time" requerido valor={d.hora_fin} onCambio={set('hora_fin')} />
        </div>
        <CampoTexto label="Descripción" tipo="textarea" valor={d.descripcion} onCambio={set('descripcion')} className="ancho" />
      </div>
      {v && (v.errores.length ? <div className="alerta error mt"><XCircle size={18} /><div><b>No se puede guardar:</b><ul>{v.errores.map((e) => <li key={e}>{e}</li>)}</ul></div></div>
        : <div className="alerta exito mt"><CheckCircle2 size={18} /> Sin cruces de horario.{v.advertencias.length > 0 && ` Aviso: ${v.advertencias.join(' ')}`}</div>)}
    </Modal>
  );
}

function Agenda({ evento, onCambio }: { evento: any; onCambio: () => void }) {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const cargar = useCallback(() => { intentar(() => api('agenda.listar', { eventoId: evento.id })).then((r) => r && setLista(r)); }, [evento.id, intentar]);
  useEffect(cargar, [cargar]);
  const dias = [...new Set(lista.map((a) => a.fecha))];
  const total = lista.filter((a) => a.tipo !== 'Receso').reduce((s, a) => s + a.horas, 0);
  const eliminar = async (a: any) => {
    if (!(await confirmar({ titulo: 'Eliminar actividad', mensaje: `¿Eliminar «${a.titulo}» de la agenda?`, peligro: true, aceptar: 'Eliminar' }))) return;
    if (await intentar(() => api('agenda.eliminar', { id: a.id }), 'Actividad eliminada.') !== undefined) { cargar(); onCambio(); }
  };
  return (
    <>
      <div className="fila mb">
        <span className="suave">{lista.length} actividad(es) · <b>{fmtNum(total)} h</b> académicas (sin recesos)</span>
        <div className="espacio" />
        <button className="btn" onClick={() => intentar(() => api('reportes.exportar', { id: 'agenda', formato: 'pdf', filtros: { eventoId: evento.id } }))}><Download size={15} /> Agenda en PDF</button>
        {puedeEditar && <button className="btn primario" onClick={() => setEditar(null)}><CalendarPlus size={16} /> Agregar actividad</button>}
      </div>
      {!lista.length && <Vacio texto="La agenda está vacía. Agregue la inauguración, conferencias, talleres, competencias…" icono={<CalendarHeart size={36} />} />}
      {dias.map((dia) => (
        <Tarjeta key={dia} className="mb" titulo={new Date(dia + 'T12:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} cuerpo={false}>
          <Tabla filas={lista.filter((a) => a.fecha === dia)} porPagina={200} columnas={[
            { key: 'hora', label: 'Hora', render: (a) => <b>{a.hora_inicio}–{a.hora_fin}</b>, ancho: 110 },
            { key: 'titulo', label: 'Actividad', render: (a) => <>{a.titulo}{a.descripcion && <div className="peq suave">{a.descripcion}</div>}</> },
            { key: 'tipo', label: 'Tipo', render: (a) => <Insignia valor={a.tipo} color={a.tipo === 'Receso' ? '' : 'azul'} /> },
            { key: 'area', label: 'Área' }, { key: 'ponente', label: 'Ponente' }, { key: 'lugar', label: 'Lugar' },
            { key: 'asistencia_registrada', label: 'Asistencia', render: (a) => (a.asistencia_registrada ? <Insignia valor="Registrada" color="verde" /> : '') },
          ]} acciones={puedeEditar ? (a) => <>
            <button className="btn icono fantasma" title="Editar" onClick={() => setEditar(a)}><Pencil size={15} /></button>
            <button className="btn icono fantasma" title="Eliminar" onClick={() => eliminar(a)}><Trash2 size={15} color="var(--rojo)" /></button>
          </> : undefined} />
        </Tarjeta>
      ))}
      {editar !== undefined && <FormularioActividad eventoId={evento.id} actividad={editar} fechaInicial={dias[dias.length - 1] ?? evento.fecha_inicio}
        onCerrar={() => setEditar(undefined)} onGuardado={() => { setEditar(undefined); cargar(); onCambio(); }} />}
    </>
  );
}

// ---------------------------------------------------------------- inscritos
function AgregarParticipantes({ evento, onCerrar }: { evento: any; onCerrar: () => void }) {
  const { intentar, notificar } = useApp();
  const [busqueda, setBusqueda] = useState('');
  const [lista, setLista] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [nuevo, setNuevo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => api('datos.listar', { modelo: 'participantes', filtro: { busqueda } }).then(setLista).catch(() => undefined), 200);
    return () => clearTimeout(t);
  }, [busqueda, nuevo]);
  const inscribir = async (ids: number[]) => {
    const r = await intentar(() => api('inscripciones.inscribir', { eventoId: evento.id, participantes: ids }));
    if (r) { notificar(`${r.inscritos} participante(s) inscrito(s).${r.omitidos.length ? '\n' + r.omitidos.join('\n') : ''}`, r.omitidos.length ? 'aviso' : 'exito'); onCerrar(); }
  };
  return (
    <Modal tam="grande" titulo={`Inscribir participantes – ${evento.nombre}`} icono={<UserPlus size={20} />} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={() => setNuevo(true)}><Plus size={15} /> Registrar participante nuevo</button><div className="espacio" />
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario" disabled={!sel.size} onClick={() => inscribir([...sel])}>Inscribir seleccionados ({sel.size})</button></>}>
      <div className="mb"><Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por documento, nombre o institución…" /></div>
      <Tabla filas={lista} seleccion={sel} onSeleccion={setSel} porPagina={20} vacio="No se encontraron participantes. Regístrelo con el botón de abajo."
        columnas={[{ key: 'identificacion', label: 'Documento' }, { key: 'apellidos', label: 'Apellidos' }, { key: 'nombres', label: 'Nombres' }, { key: 'institucion', label: 'Institución' }, { key: 'grado', label: 'Grado' }]} />
      {nuevo && <Formulario modelo="participantes" onCerrar={() => setNuevo(false)} onGuardado={(id) => { setNuevo(false); inscribir([id]); }} />}
    </Modal>
  );
}

export function ImportarExcel({ evento, onCerrar }: { evento?: any; onCerrar: () => void }) {
  const { intentar, notificar } = useApp();
  const [archivo, setArchivo] = useState<string | null>(null);
  const [vista, setVista] = useState<any>(null);
  const validar = async (a: string) => { const r = await intentar(() => api('importar.ejecutar', { archivo: a, eventoId: evento?.id, simular: true })); if (r) setVista(r); };
  const elegir = async () => { const a = await intentar(() => api<string | null>('importar.elegir')); if (a) { setArchivo(a); validar(a); } };
  const importar = async () => {
    const r = await intentar(() => api('importar.ejecutar', { archivo, eventoId: evento?.id, simular: false }));
    if (r) { notificar(`Importación lista: ${r.creados} participante(s) nuevo(s)${evento ? `, ${r.inscritos} inscrito(s)` : ''}, ${r.errores} con error.`, 'exito'); onCerrar(); }
  };
  const validas = vista ? vista.filas.filter((f: any) => f.estado !== 'error').length : 0;
  return (
    <Modal tam="grande" titulo={evento ? `Importar inscritos desde Excel – ${evento.nombre}` : 'Importar participantes desde Excel'} icono={<FileSpreadsheet size={20} />} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={() => intentar(() => api('importar.plantilla'))}><Download size={15} /> Descargar plantilla</button><div className="espacio" />
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario" disabled={!validas} onClick={importar}><Upload size={15} /> Importar {validas} fila(s)</button></>}>
      <div className="alerta info">Columnas obligatorias: <b>Identificación, Nombres y Apellidos</b>. Los participantes ya registrados no se duplican{evento ? ' (solo se inscriben)' : ''}.</div>
      <div className="zona-archivo" role="button" onClick={elegir}>
        <Upload size={26} color="var(--azul-600)" /><div className="negrita">{archivo ? archivo.split(/[\\/]/).pop() : 'Seleccionar archivo de Excel (.xlsx)'}</div>
      </div>
      {vista && (
        <div className="mt">
          <div className="fila mb">
            <Insignia valor={`${vista.filas.filter((f: any) => f.estado === 'nuevo').length} nuevos`} color="verde" />
            <Insignia valor={`${vista.filas.filter((f: any) => f.estado === 'existente').length} ya registrados`} color="azul" />
            <Insignia valor={`${vista.errores} con error`} color="rojo" />
          </div>
          <Tabla filas={vista.filas.map((f: any) => ({ ...f, id: f.fila }))} porPagina={100} columnas={[
            { key: 'fila', label: 'Fila', num: true }, { key: 'identificacion', label: 'Documento' }, { key: 'nombre', label: 'Nombre' },
            { key: 'estado', label: 'Resultado', render: (f) => <Insignia valor={{ nuevo: 'Nuevo', existente: 'Ya registrado', error: 'Error' }[f.estado as string]} color={{ nuevo: 'verde', existente: 'azul', error: 'rojo' }[f.estado as string]} /> },
            { key: 'mensaje', label: 'Detalle' },
          ]} />
        </div>
      )}
    </Modal>
  );
}

function Inscritos({ evento, onCambio }: { evento: any; onCambio: () => void }) {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [agregar, setAgregar] = useState(false);
  const [importar, setImportar] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const cargar = useCallback(() => { intentar(() => api('inscripciones.listar', { eventoId: evento.id })).then((r) => r && setLista(r)); }, [evento.id, intentar]);
  useEffect(cargar, [cargar]);
  const visibles = lista.filter((i) => !busqueda || `${i.identificacion} ${i.nombre} ${i.institucion ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()));
  const activos = lista.filter((i) => i.estado === 'Inscrito').length;
  const abierto = !['Finalizado', 'Cancelado'].includes(evento.estado);
  return (
    <>
      <div className="fila mb">
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar inscrito…" />
        <span className="suave">{activos} inscrito(s){evento.cupo ? ` de ${evento.cupo} cupos` : ''}</span>
        <div className="espacio" />
        <button className="btn" onClick={() => intentar(() => api('reportes.exportar', { id: 'inscritos', formato: 'pdf', filtros: { eventoId: evento.id } }))}><Download size={15} /> Listado PDF</button>
        <button className="btn" onClick={() => intentar(() => api('reportes.exportar', { id: 'inscritos', formato: 'xlsx', filtros: { eventoId: evento.id } }))}><FileSpreadsheet size={15} /> Excel</button>
        {puedeEditar && abierto && <>
          <button className="btn" onClick={() => setImportar(true)}><Upload size={15} /> Importar Excel</button>
          <button className="btn primario" onClick={() => setAgregar(true)}><UserPlus size={16} /> Inscribir</button>
        </>}
      </div>
      {!abierto && <div className="alerta info">El evento está {evento.estado.toLowerCase()}: no admite nuevas inscripciones.</div>}
      <Tabla filas={visibles} columnas={[
        { key: 'identificacion', label: 'Documento', render: (i) => `${i.tipo_documento} ${i.identificacion}` }, { key: 'nombre', label: 'Participante' },
        { key: 'institucion', label: 'Institución' }, { key: 'grado', label: 'Grado' }, { key: 'telefono', label: 'Teléfono' },
        { key: 'fecha', label: 'Inscripción', render: (i) => fmtFecha(i.fecha) }, { key: 'estado', label: 'Estado', render: (i) => <Insignia valor={i.estado} /> },
      ]} vacio="Aún no hay inscritos." acciones={puedeEditar ? (i) => i.estado === 'Inscrito' && (
        <button className="btn chico peligro" onClick={async () => {
          if (!(await confirmar({ titulo: 'Cancelar inscripción', mensaje: `¿Cancelar la inscripción de ${i.nombre}?`, peligro: true, aceptar: 'Cancelar inscripción' }))) return;
          if (await intentar(() => api('inscripciones.cancelar', { id: i.id }), 'Inscripción cancelada.') !== undefined) { cargar(); onCambio(); }
        }}>Cancelar</button>
      ) : undefined} />
      {agregar && <AgregarParticipantes evento={evento} onCerrar={() => { setAgregar(false); cargar(); onCambio(); }} />}
      {importar && <ImportarExcel evento={evento} onCerrar={() => { setImportar(false); cargar(); onCambio(); }} />}
    </>
  );
}

// --------------------------------------------------------------- asistencia
function Asistencia({ evento }: { evento: any }) {
  const { intentar, puedeEditar } = useApp();
  const [acts, setActs] = useState<any[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [planilla, setPlanilla] = useState<any>(null);
  const [marcas, setMarcas] = useState<Record<number, boolean>>({});
  const [resumen, setResumen] = useState<any[]>([]);
  const cargar = useCallback(() => {
    intentar(() => api('agenda.listar', { eventoId: evento.id })).then((r) => r && setActs(r.filter((a: any) => a.tipo !== 'Receso')));
    intentar(() => api('asistencia.resumen', { eventoId: evento.id })).then((r) => r && setResumen(r));
  }, [evento.id, intentar]);
  useEffect(cargar, [cargar]);
  useEffect(() => {
    if (!sel) return;
    intentar(() => api('asistencia.planilla', { actividadId: sel })).then((r) => {
      if (!r) return;
      setPlanilla(r);
      setMarcas(Object.fromEntries(r.participantes.map((p: any) => [p.participante_id, p.presente === 1])));
    });
  }, [sel, intentar]);
  const hoy = new Date().toISOString().slice(0, 10);
  const guardar = async () => {
    const registros = Object.entries(marcas).map(([k, v]) => ({ participante_id: Number(k), presente: v }));
    if (await intentar(() => api('asistencia.registrar', { actividadId: sel, registros }), `Asistencia guardada: ${registros.filter((r) => r.presente).length} presente(s).`) !== undefined) cargar();
  };
  const futura = planilla && planilla.actividad.fecha > hoy;
  return (
    <div className="rejilla" style={{ gridTemplateColumns: 'minmax(250px, 320px) minmax(0, 1fr)' }}>
      <Tarjeta titulo="Actividades">
        <div className="col-flex" style={{ gap: 6 }}>
          {acts.map((a) => (
            <button key={a.id} className={`btn ${sel === a.id ? 'primario' : ''}`} style={{ justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setSel(a.id)}>
              <span>{fmtFecha(a.fecha)} {a.hora_inicio}<br /><span style={{ fontWeight: 400 }}>{a.titulo}</span></span>{a.asistencia_registrada ? '✔' : ''}
            </button>
          ))}
          {!acts.length && <div className="suave peq">Agregue actividades a la agenda para registrar asistencia.</div>}
        </div>
      </Tarjeta>
      <div className="col-flex">
        {planilla ? (
          <Tarjeta titulo={`${planilla.actividad.titulo} · ${fmtFecha(planilla.actividad.fecha)} ${planilla.actividad.hora_inicio}`}
            acciones={puedeEditar && !futura && <>
              <button className="btn chico" onClick={() => setMarcas(Object.fromEntries(Object.keys(marcas).map((k) => [k, true])))}>Marcar todos</button>
              <button className="btn chico" onClick={() => setMarcas(Object.fromEntries(Object.keys(marcas).map((k) => [k, false])))}>Desmarcar</button>
              <button className="btn chico primario" onClick={guardar}><ClipboardCheck size={14} /> Guardar asistencia</button>
            </>}>
            {futura && <div className="alerta info">La actividad aún no ocurre; la asistencia se registra el día de la actividad.</div>}
            <div className="peq suave mb">{Object.values(marcas).filter(Boolean).length} de {planilla.participantes.length} presentes</div>
            <div className="lista-presentes">
              {planilla.participantes.map((p: any) => (
                <label key={p.participante_id}>
                  <input type="checkbox" disabled={!puedeEditar || futura} checked={!!marcas[p.participante_id]} onChange={(e) => setMarcas({ ...marcas, [p.participante_id]: e.target.checked })} />
                  <b>{p.nombre}</b><span className="suave peq">{p.identificacion}{p.institucion ? ` · ${p.institucion}` : ''}</span>
                </label>
              ))}
              {!planilla.participantes.length && <Vacio texto="No hay inscritos en el evento." />}
            </div>
          </Tarjeta>
        ) : <Vacio texto="Seleccione una actividad para tomar asistencia." icono={<ClipboardCheck size={36} />} />}
        <Tarjeta titulo="Resumen de asistencia por participante" cuerpo={false}>
          <Tabla filas={resumen.map((r) => ({ ...r, id: r.participante_id }))} porPagina={25} columnas={[
            { key: 'nombre', label: 'Participante' }, { key: 'asistidas', label: 'Actividades', render: (r) => `${r.asistidas} de ${r.actividades}` },
            { key: 'porcentaje', label: 'Asistencia', render: (r) => (r.porcentaje == null ? '—' : <Progreso valor={r.porcentaje} />) },
            { key: 'horas', label: 'Horas', num: true }, { key: 'aprueba', label: `Mín. ${evento.asistencia_minima}%`, render: (r) => <Insignia valor={r.aprueba ? 'Cumple' : 'No cumple'} /> },
          ]} vacio="Sin datos." />
        </Tarjeta>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- certificados
export function CertificadosEvento({ evento }: { evento: any }) {
  const { intentar, puedeEditar, esAdmin, config } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [res, setRes] = useState<any>(null);
  const [reemitir, setReemitir] = useState<any>(null);
  const [motivo, setMotivo] = useState('');
  const cargar = useCallback(() => { intentar(() => api('certificados.elegibles', { eventoId: evento.id })).then((r) => r && setLista(r)); }, [evento.id, intentar]);
  useEffect(cargar, [cargar]);
  const pendientes = lista.filter((x) => x.aprueba && !x.certificado);
  const generar = async (ids: number[], autorizacion?: string) => {
    const r = await intentar(() => api('certificados.generar', { eventoId: evento.id, participantes: ids, autorizacion }));
    if (r) { setRes(r); setSel(new Set()); cargar(); }
  };
  return (
    <>
      {!config.director_nombre && <div className="alerta aviso">Configure el nombre del director(a) que firma en Configuración antes de generar certificados.</div>}
      <div className="alerta info">Reciben certificado los inscritos con asistencia de al menos <b>{evento.asistencia_minima}%</b> de las actividades con asistencia registrada.</div>
      {puedeEditar && (
        <div className="fila mb"><div className="espacio" />
          <button className="btn" disabled={!pendientes.length} onClick={() => generar(pendientes.map((p) => p.participante_id))}><Award size={15} /> Generar todos los que cumplen ({pendientes.length})</button>
          <button className="btn dorado" disabled={!sel.size} onClick={() => generar([...sel])}><Award size={15} /> Generar seleccionados ({sel.size})</button>
        </div>
      )}
      <Tabla filas={lista.map((x) => ({ ...x, id: x.participante_id }))} seleccion={puedeEditar ? sel : undefined}
        onSeleccion={(s) => setSel(new Set([...s].filter((id) => pendientes.some((p) => p.participante_id === id))))}
        columnas={[
          { key: 'identificacion', label: 'Documento' }, { key: 'nombre', label: 'Participante' },
          { key: 'porcentaje', label: 'Asistencia', render: (r) => (r.porcentaje == null ? '—' : <Progreso valor={r.porcentaje} dorado={r.aprueba} />) },
          { key: 'horas', label: 'Horas', num: true },
          { key: 'estado', label: 'Estado', render: (r) => (r.certificado ? <Insignia valor="Certificado" /> : r.aprueba ? <Insignia valor="Cumple" /> : <span title={r.motivo}><Insignia valor="No cumple" /></span>) },
          { key: 'codigo', label: 'Código', render: (r) => r.certificado?.codigo ?? <span className="peq suave">{r.motivo}</span> },
        ]} vacio="No hay inscritos." acciones={(r) => r.certificado && <>
          <button className="btn chico" onClick={() => intentar(() => api('certificados.ver', { ids: [r.certificado.id] }))}><Eye size={14} /> Ver / imprimir</button>
          {esAdmin && r.aprueba && <button className="btn chico" onClick={() => { setMotivo(''); setReemitir(r); }}>Reemitir</button>}
        </>} />
      {res && (
        <Modal titulo="Resultado" icono={<Award size={20} />} onCerrar={() => setRes(null)}
          pie={<><button className="btn" onClick={() => setRes(null)}>Cerrar</button>
            {res.generados.length > 0 && <button className="btn" onClick={() => intentar(() => api('certificados.guardar', { ids: res.generados.map((g: any) => g.id) }))}><Download size={15} /> Guardar PDF</button>}
            {res.generados.length > 0 && <button className="btn primario" onClick={() => intentar(() => api('certificados.ver', { ids: res.generados.map((g: any) => g.id), ruta: res.lote }))}><Eye size={15} /> Ver e imprimir</button>}</>}>
          {res.generados.length > 0 && <div className="alerta exito"><div><b>{res.generados.length} certificado(s) generado(s):</b><ul>{res.generados.map((g: any) => <li key={g.id}>{g.nombre} — <code>{g.codigo}</code></li>)}</ul></div></div>}
          {res.omitidos.length > 0 && <div className="alerta aviso"><div><b>Omitidos:</b><ul>{res.omitidos.map((o: any, i: number) => <li key={i}>{o.nombre}: {o.motivo}</li>)}</ul></div></div>}
        </Modal>
      )}
      {reemitir && (
        <Modal tam="chico" titulo="Autorizar reemisión" onCerrar={() => setReemitir(null)}
          pie={<><button className="btn" onClick={() => setReemitir(null)}>Cancelar</button>
            <button className="btn primario" disabled={motivo.trim().length < 5} onClick={() => { const r = reemitir; setReemitir(null); generar([r.participante_id], motivo); }}>Reemitir</button></>}>
          <p>El certificado <code>{reemitir.certificado.codigo}</code> quedará <b>anulado</b> y se emitirá uno nuevo.</p>
          <CampoTexto label="Motivo de la reemisión" tipo="textarea" requerido valor={motivo} onCambio={setMotivo} />
        </Modal>
      )}
    </>
  );
}

// -------------------------------------------------------------- detalle
function Resumen({ evento, onCambio }: { evento: any; onCambio: () => void }) {
  const { intentar, puedeEditar, recargarBanner, banner, confirmar } = useApp();
  const [foto, setFoto] = useState<string | null>(null);
  const [horas, setHoras] = useState(0);
  useEffect(() => {
    api('banner.fotoEvento', { eventoId: evento.id }).then(setFoto).catch(() => setFoto(null));
    api('agenda.horas', { eventoId: evento.id }).then(setHoras).catch(() => undefined);
  }, [evento.id, evento.tiene_foto]);
  const cambiarFoto = async () => { if (await intentar(() => api('banner.cambiarFoto', { eventoId: evento.id }))) { await recargarBanner(); onCambio(); } };
  const esBanner = banner?.id === evento.id;
  return (
    <div className="rejilla c2">
      <Tarjeta titulo="Foto inaugural (banner)" acciones={puedeEditar && <>
        <button className="btn chico primario" onClick={cambiarFoto}><ImagePlus size={14} /> {foto ? 'Cambiar foto' : 'Subir foto inaugural'}</button>
        {foto && !esBanner && <button className="btn chico" onClick={async () => { if (await intentar(() => api('banner.fijar', { eventoId: evento.id }), 'Ahora es el banner de la plataforma.') !== undefined) recargarBanner(); }}>Usar como banner</button>}
        {foto && <button className="btn chico peligro" onClick={async () => {
          if (!(await confirmar({ titulo: 'Quitar foto', mensaje: '¿Quitar la foto inaugural de este evento?', peligro: true, aceptar: 'Quitar' }))) return;
          if (await intentar(() => api('banner.quitarFoto', { eventoId: evento.id }), 'Foto retirada.') !== undefined) { await recargarBanner(); onCambio(); }
        }}><Trash2 size={14} /></button>}
      </>}>
        {foto ? <><img className="foto-evento" src={foto} alt="Foto inaugural del evento" />{esBanner && <div className="mt"><Insignia valor="Mostrándose como banner en Inicio" color="dorado" /></div>}</>
          : <Vacio texto="Aún no hay foto inaugural. Súbala para mostrarla como banner de la plataforma." icono={<ImagePlus size={36} />} />}
      </Tarjeta>
      <Tarjeta titulo="Información del evento">
        <dl className="lista-def">
          <dt>Tipo</dt><dd>{evento.tipo}</dd><dt>Fechas</dt><dd>{fmtFecha(evento.fecha_inicio)} – {fmtFecha(evento.fecha_fin)}</dd>
          <dt>Lugar</dt><dd>{evento.lugar || '—'}</dd><dt>Modalidad</dt><dd>{evento.modalidad}</dd><dt>Estado</dt><dd><Insignia valor={evento.estado} /></dd>
          <dt>Inscritos</dt><dd>{evento.inscritos}{evento.cupo ? ` de ${evento.cupo} cupos` : ''}</dd>
          <dt>Agenda</dt><dd>{evento.actividades} actividad(es), {fmtNum(horas)} h académicas</dd>
          <dt>Asistencia mínima</dt><dd>{evento.asistencia_minima}% para certificar</dd><dt>Certificados</dt><dd>{evento.certificados}</dd>
          {evento.descripcion && <><dt>Descripción</dt><dd style={{ whiteSpace: 'pre-line' }}>{evento.descripcion}</dd></>}
        </dl>
      </Tarjeta>
    </div>
  );
}

function DetalleEvento({ id, onVolver }: { id: number; onVolver: () => void }) {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [ev, setEv] = useState<any>(null);
  const [p, setP] = useState<'resumen' | 'organizacion' | 'agenda' | 'inscritos' | 'asistencia' | 'certificados'>('resumen');
  const [editar, setEditar] = useState(false);
  const cargar = useCallback(() => { intentar(() => api('datos.obtener', { modelo: 'eventos', id })).then((r) => (r ? setEv(r) : onVolver())); }, [id, intentar, onVolver]);
  useEffect(cargar, [cargar]);
  if (!ev) return null;
  const eliminar = async () => {
    if (!(await confirmar({ titulo: 'Eliminar evento', mensaje: `¿Enviar «${ev.nombre}» a la papelera?`, peligro: true, aceptar: 'Eliminar' }))) return;
    if (await intentar(() => api('datos.eliminar', { modelo: 'eventos', id }), 'Evento enviado a la papelera.') !== undefined) onVolver();
  };
  return (
    <>
      <div className="pagina-cab">
        <div><button className="btn chico fantasma" onClick={onVolver}><ArrowLeft size={14} /> Eventos</button>
          <h1>{ev.nombre} <Insignia valor={ev.estado} /></h1>
          <p><CalendarHeart size={14} /> {ev.tipo} · {fmtFecha(ev.fecha_inicio)} – {fmtFecha(ev.fecha_fin)} {ev.lugar && <><MapPin size={14} /> {ev.lugar}</>}</p></div>
        {puedeEditar && <div className="acciones">
          <button className="btn" onClick={() => setEditar(true)}><Pencil size={15} /> Editar evento</button>
          <button className="btn peligro" onClick={eliminar}><Trash2 size={15} /></button>
        </div>}
      </div>
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'resumen', nombre: 'Resumen y foto', icono: <ImagePlus size={16} /> },
        { id: 'organizacion', nombre: 'Organización y horario docente', icono: <GraduationCap size={16} /> }, { id: 'agenda', nombre: `Agenda (${ev.actividades})`, icono: <CalendarPlus size={16} /> },
        { id: 'inscritos', nombre: `Inscritos (${ev.inscritos})`, icono: <Users size={16} /> }, { id: 'asistencia', nombre: 'Asistencia', icono: <ClipboardCheck size={16} /> },
        { id: 'certificados', nombre: `Certificados (${ev.certificados})`, icono: <Award size={16} /> },
      ]} />
      {p === 'resumen' && <Resumen evento={ev} onCambio={cargar} />}
      {p === 'organizacion' && <OrganizacionEvento evento={ev} onCambio={cargar} />}
      {p === 'agenda' && <Agenda evento={ev} onCambio={cargar} />}
      {p === 'inscritos' && <Inscritos evento={ev} onCambio={cargar} />}
      {p === 'asistencia' && <Asistencia evento={ev} />}
      {p === 'certificados' && <CertificadosEvento evento={ev} />}
      {editar && <Formulario modelo="eventos" registro={ev} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); cargar(); }} />}
    </>
  );
}

function TarjetaEvento({ e, onClick }: { e: any; onClick: () => void }) {
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => { if (e.tiene_foto) api('banner.fotoEvento', { eventoId: e.id }).then(setFoto).catch(() => undefined); }, [e.id, e.tiene_foto]);
  return (
    <div className="tarjeta tarjeta-evento" role="button" onClick={onClick} data-evento={e.nombre}>
      <div className="portada">{foto && <img src={foto} alt="" />}<Insignia valor={e.estado} /></div>
      <div className="info">
        <h3>{e.nombre}</h3>
        <div className="peq suave">{e.tipo} · {fmtFecha(e.fecha_inicio)}{e.fecha_fin !== e.fecha_inicio ? ` – ${fmtFecha(e.fecha_fin)}` : ''}</div>
        {e.lugar && <div className="peq suave"><MapPin size={12} /> {e.lugar}</div>}
        <div className="fila mt peq" style={{ gap: 12 }}><span><Users size={13} /> {e.inscritos}</span><span><CalendarPlus size={13} /> {e.actividades}</span><span><Award size={13} /> {e.certificados}</span></div>
      </div>
    </div>
  );
}

export function Eventos({ ir, parametros }: { ir: Ir; parametros?: any }) {
  const { intentar, puedeEditar } = useApp();
  const [detalle, setDetalle] = useState<number | null>(parametros?.eventoId ?? null);
  const [nuevo, setNuevo] = useState(!!parametros?.nuevo);
  const [anio, setAnio] = useState<number | ''>(new Date().getFullYear());
  const [anios, setAnios] = useState<number[]>([]);
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [lista, setLista] = useState<any[]>([]);
  const cargar = useCallback(() => {
    intentar(() => api('datos.listar', { modelo: 'eventos', filtro: { anio: anio || undefined, estado: estado || undefined, busqueda } })).then((r) => r && setLista(r));
    intentar(() => api<number[]>('datos.anios')).then((r) => r && setAnios(r));
  }, [anio, estado, busqueda, intentar]);
  useEffect(cargar, [cargar]);
  void ir;
  if (detalle) return <DetalleEvento id={detalle} onVolver={() => { setDetalle(null); cargar(); }} />;
  const opcionesAnio = [...new Set([new Date().getFullYear(), new Date().getFullYear() + 1, ...anios])].sort((a, b) => b - a);
  return (
    <>
      <div className="pagina-cab"><div><h1>Eventos del año</h1><p>Cree y organice los eventos: agenda, inscritos, asistencia, certificados y foto inaugural.</p></div>
        {puedeEditar && <div className="acciones"><button className="btn primario" onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo evento</button></div>}</div>
      <div className="barra-filtros">
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar evento…" />
        <div className="campo"><label htmlFor="filtro-anio">Año</label>
          <select id="filtro-anio" value={anio} onChange={(e) => setAnio(e.target.value ? Number(e.target.value) : '')}><option value="">Todos</option>{opcionesAnio.map((a) => <option key={a}>{a}</option>)}</select></div>
        <div className="campo"><label htmlFor="filtro-estado">Estado</label>
          <select id="filtro-estado" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option>{ESTADOS_EVENTO.map((e) => <option key={e}>{e}</option>)}</select></div>
      </div>
      {lista.length ? <div className="rejilla eventos">{lista.map((e) => <TarjetaEvento key={e.id} e={e} onClick={() => setDetalle(e.id)} />)}</div>
        : <Vacio texto={`No hay eventos${anio ? ` en ${anio}` : ''}. Cree el primero con «Nuevo evento».`} icono={<CalendarHeart size={36} />} />}
      {nuevo && <Formulario modelo="eventos" onCerrar={() => setNuevo(false)} onGuardado={(id) => { setNuevo(false); setDetalle(id); }} />}
    </>
  );
}
