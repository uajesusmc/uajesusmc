/** Organización del evento: cursillos con docente y aula, programación del horario y horario de docentes. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, DoorOpen, FileSpreadsheet, FileText, GraduationCap, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { AREAS } from '../../shared/modelos';
import { api, fmtFecha, fmtNum, sumarDias } from '../api';
import { CampoTexto, Insignia, Modal, Pestanas, Tabla, Vacio } from '../components/ui';
import { useApp } from '../estado';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const lunesDe = (iso: string) => { const d = new Date(iso + 'T12:00').getDay(); return sumarDias(iso, d === 0 ? -6 : 1 - d); };

// -------------------------------------------------------------------- aulas
function FormularioAula({ aula, onCerrar, onGuardado }: { aula?: any; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar } = useApp();
  const [d, setD] = useState<any>({ nombre: '', capacidad: '', ubicacion: '', recursos: '', ...aula });
  return (
    <Modal tam="chico" titulo={aula ? 'Editar aula' : 'Nueva aula'} icono={<DoorOpen size={20} />} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={async () => {
        if (await intentar(() => api('aulas.guardar', { ...d, id: aula?.id }), 'Aula guardada.') !== undefined) onGuardado();
      }}>Guardar</button></>}>
      <div className="col-flex">
        <CampoTexto label="Nombre del aula o espacio" requerido valor={d.nombre} onCambio={(v) => setD({ ...d, nombre: v })} placeholder="Aula 101, Sala de informática, Auditorio…" />
        <CampoTexto label="Capacidad (personas)" tipo="number" min={1} valor={d.capacidad} onCambio={(v) => setD({ ...d, capacidad: v })} />
        <CampoTexto label="Ubicación" valor={d.ubicacion} onCambio={(v) => setD({ ...d, ubicacion: v })} placeholder="Bloque B, segundo piso" />
        <CampoTexto label="Recursos" valor={d.recursos} onCambio={(v) => setD({ ...d, recursos: v })} placeholder="Video beam, tablero, 20 computadores…" />
      </div>
    </Modal>
  );
}

function Aulas() {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const cargar = useCallback(() => { intentar(() => api('aulas.listar')).then((r) => r && setLista(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  return (
    <>
      <div className="fila mb"><span className="suave">Las aulas son comunes a todos los eventos.</span><div className="espacio" />
        {puedeEditar && <button className="btn primario" onClick={() => setEditar(null)}><Plus size={16} /> Nueva aula</button>}</div>
      <Tabla filas={lista} vacio="Registre las aulas y espacios donde se dictan los cursillos." columnas={[
        { key: 'nombre', label: 'Aula', render: (a) => <b>{a.nombre}</b> }, { key: 'capacidad', label: 'Capacidad', num: true },
        { key: 'ubicacion', label: 'Ubicación' }, { key: 'recursos', label: 'Recursos' }, { key: 'cursillos', label: 'Cursillos asignados', num: true },
      ]} acciones={puedeEditar ? (a) => <>
        <button className="btn icono fantasma" title="Editar" onClick={() => setEditar(a)}><Pencil size={15} /></button>
        <button className="btn icono fantasma" title="Eliminar" onClick={async () => {
          if (await confirmar({ titulo: 'Eliminar aula', mensaje: `¿Eliminar «${a.nombre}»?`, peligro: true, aceptar: 'Eliminar' })) {
            if (await intentar(() => api('aulas.eliminar', { id: a.id }), 'Aula eliminada.') !== undefined) cargar();
          }
        }}><Trash2 size={15} color="var(--rojo)" /></button>
      </> : undefined} />
      {editar !== undefined && <FormularioAula aula={editar} onCerrar={() => setEditar(undefined)} onGuardado={() => { setEditar(undefined); cargar(); }} />}
    </>
  );
}

// ---------------------------------------------------------------- cursillos
function FormularioCursillo({ evento, cursillo, onCerrar, onGuardado }: { evento: any; cursillo?: any; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar, notificar } = useApp();
  const [docentes, setDocentes] = useState<any[]>([]);
  const [aulas, setAulas] = useState<any[]>([]);
  const [d, setD] = useState<any>({ nombre: '', area: '', nivel: '', docente_id: '', aula_id: '', cupo: '', descripcion: '', ...cursillo });
  useEffect(() => {
    api('datos.listar', { modelo: 'ponentes' }).then(setDocentes).catch(() => undefined);
    api('aulas.listar').then(setAulas).catch(() => undefined);
  }, []);
  const set = (k: string) => (v: any) => setD({ ...d, [k]: v });
  const aula = aulas.find((a) => a.id === Number(d.aula_id));
  const guardar = async () => {
    const r = await intentar(() => api('cursillos.guardar', { ...d, id: cursillo?.id, evento_id: evento.id }));
    if (r) { notificar('Cursillo guardado.', 'exito'); r.advertencias.forEach((a: string) => notificar(a, 'aviso')); onGuardado(); }
  };
  return (
    <Modal titulo={cursillo ? 'Editar cursillo' : 'Nuevo cursillo'} icono={<GraduationCap size={20} />} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={guardar}>Guardar</button></>}>
      <div className="form">
        <CampoTexto label="Nombre del cursillo" requerido valor={d.nombre} onCambio={set('nombre')} placeholder="Álgebra y funciones" className="ancho" maxLength={150} />
        <div className="campo"><label htmlFor="c-area">Área</label><select id="c-area" value={d.area ?? ''} onChange={(e) => set('area')(e.target.value)}>
          <option value="">—</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></div>
        <CampoTexto label="Nivel o grupo" valor={d.nivel} onCambio={set('nivel')} placeholder="Grado 10°, Grupo A…" maxLength={60} />
        <div className="campo"><label htmlFor="c-docente">Docente que lo dicta</label><select id="c-docente" value={d.docente_id ?? ''} onChange={(e) => set('docente_id')(e.target.value)}>
          <option value="">— Sin asignar —</option>{docentes.map((p) => <option key={p.id} value={p.id}>{p.apellidos}, {p.nombres}{p.area ? ` (${p.area})` : ''}</option>)}</select>
          {!docentes.length && <div className="ayuda">Registre los docentes en «Ponentes y docentes».</div>}</div>
        <div className="campo"><label htmlFor="c-aula">Aula asignada</label><select id="c-aula" value={d.aula_id ?? ''} onChange={(e) => set('aula_id')(e.target.value)}>
          <option value="">— Sin asignar —</option>{aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.capacidad ? ` (${a.capacidad} pers.)` : ''}</option>)}</select>
          {!aulas.length && <div className="ayuda">Registre las aulas en la pestaña «Aulas».</div>}</div>
        <CampoTexto label="Cupo" tipo="number" min={1} valor={d.cupo} onCambio={set('cupo')} ayuda={aula?.capacidad ? `Capacidad del aula: ${aula.capacidad}` : undefined} />
        <CampoTexto label="Descripción / contenidos" tipo="textarea" valor={d.descripcion} onCambio={set('descripcion')} className="ancho" />
      </div>
      {cursillo?.sesiones > 0 && <div className="alerta info mt">Si cambia el docente o el aula, se actualizarán sus {cursillo.sesiones} sesiones programadas (se verifica que no haya cruces).</div>}
    </Modal>
  );
}

function ProgramarHorario({ evento, cursillo, onCerrar, onGuardado }: { evento: any; cursillo: any; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar, notificar } = useApp();
  const [modo, setModo] = useState<'semanal' | 'unica'>('semanal');
  const [dias, setDias] = useState<number[]>([6]);
  const [desde, setDesde] = useState(evento.fecha_inicio);
  const [hasta, setHasta] = useState(evento.fecha_fin);
  const [fecha, setFecha] = useState(evento.fecha_inicio);
  const [inicio, setInicio] = useState('08:00');
  const [fin, setFin] = useState('10:00');
  const [v, setV] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [omitir, setOmitir] = useState(false);
  const p = useMemo(() => ({
    cursillo_id: cursillo.id, hora_inicio: inicio, hora_fin: fin,
    ...(modo === 'unica' ? { fechas: [fecha] } : { dias, desde, hasta }),
  }), [cursillo.id, inicio, fin, modo, fecha, dias, desde, hasta]);
  useEffect(() => {
    const t = setTimeout(() => api('cursillos.verificar', p).then((r) => { setV(r); setError(null); }).catch((e) => { setV(null); setError(e.message); }), 250);
    return () => clearTimeout(t);
  }, [p]);
  const conflictos = v ? v.sesiones.filter((s: any) => s.errores.length) : [];
  const guardar = async () => {
    const r = await intentar(() => api('cursillos.programar', { programacion: p, soloValidas: omitir }));
    if (r) { notificar(`${r.creadas} sesión(es) programada(s)${r.omitidas.length ? `; ${r.omitidas.length} omitida(s) por cruce` : ''}.`, 'exito'); onGuardado(); }
  };
  return (
    <Modal tam="grande" titulo={`Programar horario – ${cursillo.nombre}`} icono={<CalendarClock size={20} />} onCerrar={onCerrar}
      pie={<><span className="suave peq" style={{ marginRight: 'auto' }}>{v && `${v.sesiones.length} sesión(es) · ${v.validas} sin cruce`}</span>
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario" disabled={!v || !v.validas || (conflictos.length > 0 && !omitir)} onClick={guardar}>
          Guardar {v ? (omitir ? v.validas : v.sesiones.length) : ''} sesión(es)</button></>}>
      <div className="fila mb peq">
        <Insignia valor={`Docente: ${cursillo.docente ?? 'sin asignar'}`} color={cursillo.docente ? 'azul' : 'naranja'} />
        <Insignia valor={`Aula: ${cursillo.aula ?? 'sin asignar'}`} color={cursillo.aula ? 'azul' : 'naranja'} />
        <span className="suave">Evento: {fmtFecha(evento.fecha_inicio)} – {fmtFecha(evento.fecha_fin)}</span>
      </div>
      <div className="form">
        <div className="campo ancho"><label>Programación</label><div className="fila">
          <label className="check"><input type="radio" checked={modo === 'semanal'} onChange={() => setModo('semanal')} /> Semanal (días fijos en un rango)</label>
          <label className="check"><input type="radio" checked={modo === 'unica'} onChange={() => setModo('unica')} /> Una sola fecha</label>
        </div></div>
        {modo === 'semanal' ? <>
          <div className="campo ancho"><label>Días de clase</label><div className="fila">{DIAS.map((n, i) => (
            <label key={n} className="check"><input type="checkbox" checked={dias.includes(i + 1)} onChange={() => setDias((x) => (x.includes(i + 1) ? x.filter((y) => y !== i + 1) : [...x, i + 1]))} />{n}</label>
          ))}</div></div>
          <CampoTexto label="Desde" tipo="date" valor={desde} onCambio={setDesde} />
          <CampoTexto label="Hasta" tipo="date" valor={hasta} onCambio={setHasta} />
        </> : <CampoTexto label="Fecha" tipo="date" valor={fecha} onCambio={setFecha} />}
        <CampoTexto label="Hora de inicio" tipo="time" valor={inicio} onCambio={setInicio} />
        <CampoTexto label="Hora de fin" tipo="time" valor={fin} onCambio={setFin} />
      </div>
      <div className="mt">
        {error && <div className="alerta error"><XCircle size={18} /> {error}</div>}
        {v?.advertencias.length > 0 && <div className="alerta aviso"><AlertTriangle size={18} /> {v.advertencias.join(' ')}</div>}
        {v && !conflictos.length && v.sesiones.length > 0 && <div className="alerta exito"><CheckCircle2 size={18} /> Sin cruces: el docente y el aula están libres en las {v.sesiones.length} sesión(es).</div>}
        {conflictos.length > 0 && (
          <div className="alerta error"><XCircle size={18} /><div><b>{conflictos.length} sesión(es) con cruce de horario:</b>
            <ul>{conflictos.slice(0, 8).map((s: any) => <li key={s.fecha}>{fmtFecha(s.fecha)}: {s.errores[0]}</li>)}{conflictos.length > 8 && <li>… y {conflictos.length - 8} más</li>}</ul>
            {v.validas > 0 && <label className="check"><input type="checkbox" checked={omitir} onChange={(e) => setOmitir(e.target.checked)} /> Guardar solo las {v.validas} sesiones sin cruce</label>}</div></div>
        )}
        {v && !v.sesiones.length && <div className="alerta info">No hay fechas con esos días en el rango elegido.</div>}
      </div>
    </Modal>
  );
}

function Cursillos({ evento, onCambio }: { evento: any; onCambio: () => void }) {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const [programar, setProgramar] = useState<any>(null);
  const cargar = useCallback(() => { intentar(() => api('cursillos.listar', { eventoId: evento.id })).then((r) => r && setLista(r)); }, [evento.id, intentar]);
  useEffect(cargar, [cargar]);
  return (
    <>
      <div className="fila mb"><span className="suave">{lista.length} cursillo(s) · {fmtNum(lista.reduce((s, c) => s + c.horas, 0))} h programadas</span><div className="espacio" />
        {puedeEditar && <button className="btn primario" onClick={() => setEditar(null)}><Plus size={16} /> Nuevo cursillo</button>}</div>
      <Tabla filas={lista} vacio="Cree los cursillos del evento y asigne a cada uno su docente y su aula." columnas={[
        { key: 'nombre', label: 'Cursillo', render: (c) => <><b>{c.nombre}</b>{c.nivel && <div className="peq suave">{c.nivel}</div>}</> },
        { key: 'area', label: 'Área' },
        { key: 'docente', label: 'Docente', render: (c) => c.docente ?? <Insignia valor="Sin docente" color="naranja" /> },
        { key: 'aula', label: 'Aula', render: (c) => c.aula ?? <Insignia valor="Sin aula" color="naranja" /> },
        { key: 'cupo', label: 'Cupo', num: true }, { key: 'sesiones', label: 'Sesiones', num: true }, { key: 'horas', label: 'Horas', num: true },
      ]} acciones={puedeEditar ? (c) => <>
        <button className="btn chico primario" onClick={() => setProgramar(c)}><CalendarClock size={14} /> Programar horario</button>
        <button className="btn icono fantasma" title="Editar" onClick={() => setEditar(c)}><Pencil size={15} /></button>
        <button className="btn icono fantasma" title="Eliminar" onClick={async () => {
          if (!(await confirmar({ titulo: 'Eliminar cursillo', mensaje: `¿Eliminar «${c.nombre}» y sus ${c.sesiones} sesión(es) del horario?`, peligro: true, aceptar: 'Eliminar' }))) return;
          if (await intentar(() => api('cursillos.eliminar', { id: c.id }), 'Cursillo eliminado.') !== undefined) { cargar(); onCambio(); }
        }}><Trash2 size={15} color="var(--rojo)" /></button>
      </> : undefined} />
      {editar !== undefined && <FormularioCursillo evento={evento} cursillo={editar} onCerrar={() => setEditar(undefined)} onGuardado={() => { setEditar(undefined); cargar(); onCambio(); }} />}
      {programar && <ProgramarHorario evento={evento} cursillo={programar} onCerrar={() => setProgramar(null)} onGuardado={() => { setProgramar(null); cargar(); onCambio(); }} />}
    </>
  );
}

// ------------------------------------------------------- horario de docentes
function HorarioDocentes({ evento }: { evento: any }) {
  const { intentar } = useApp();
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [docente, setDocente] = useState<number | ''>('');
  const [vista, setVista] = useState<'semana' | 'lista'>('semana');
  const [lunes, setLunes] = useState(() => lunesDe(evento.fecha_inicio > new Date().toISOString().slice(0, 10) ? evento.fecha_inicio : new Date().toISOString().slice(0, 10) > evento.fecha_fin ? evento.fecha_inicio : new Date().toISOString().slice(0, 10)));
  useEffect(() => { intentar(() => api('horario.docentes', { eventoId: evento.id })).then((r) => r && setSesiones(r)); }, [evento.id, intentar]);
  const docentes = [...new Map(sesiones.map((s) => [s.ponente_id, s.docente])).entries()];
  const filtradas = sesiones.filter((s) => !docente || s.ponente_id === docente);
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const exportar = (formato: 'pdf' | 'xlsx') => intentar(() => api('reportes.exportar', { id: 'horario_docentes', formato, filtros: { eventoId: evento.id, ponenteId: docente || null } }));
  const horasDe = (id: number) => sesiones.filter((s) => s.ponente_id === id && s.tipo !== 'Receso').reduce((t, s) => t + s.horas, 0);
  return (
    <>
      <div className="fila mb">
        <div className="campo" style={{ minWidth: 260 }}><label htmlFor="h-docente">Docente</label>
          <select id="h-docente" value={docente} onChange={(e) => setDocente(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos los docentes</option>{docentes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
        <div className="pestanas" style={{ margin: '18px 0 0', border: 0 }}>
          <button className={vista === 'semana' ? 'activa' : ''} onClick={() => setVista('semana')}>Semana</button>
          <button className={vista === 'lista' ? 'activa' : ''} onClick={() => setVista('lista')}>Lista completa</button>
        </div>
        <div className="espacio" />
        <button className="btn" onClick={() => exportar('pdf')}><FileText size={15} /> Horario PDF</button>
        <button className="btn" onClick={() => exportar('xlsx')}><FileSpreadsheet size={15} /> Excel</button>
      </div>
      {!sesiones.length ? <Vacio texto="Aún no hay horario: cree cursillos y use «Programar horario», o asigne docentes en la agenda." icono={<CalendarClock size={36} />} /> : vista === 'semana' ? (
        <>
          <div className="fila mb">
            <button className="btn icono" onClick={() => setLunes(sumarDias(lunes, -7))} aria-label="Semana anterior"><ChevronLeft size={16} /></button>
            <b style={{ color: 'var(--azul-800)' }}>Semana del {fmtFecha(semana[0])} al {fmtFecha(semana[6])}</b>
            <button className="btn icono" onClick={() => setLunes(sumarDias(lunes, 7))} aria-label="Semana siguiente"><ChevronRight size={16} /></button>
          </div>
          <div className="tabla-env">
            <table className="tabla horario-docentes">
              <thead><tr><th>Docente</th>{semana.map((d, i) => <th key={d}>{DIAS[i]}<div style={{ fontWeight: 400, fontSize: 11 }}>{fmtFecha(d)}</div></th>)}</tr></thead>
              <tbody>
                {docentes.filter(([id]) => !docente || id === docente).map(([id, nombre]) => (
                  <tr key={id}>
                    <td><b>{nombre}</b><div className="peq suave">{fmtNum(horasDe(id))} h en el evento</div></td>
                    {semana.map((d) => (
                      <td key={d} style={{ verticalAlign: 'top' }}>
                        {filtradas.filter((s) => s.ponente_id === id && s.fecha === d).map((s) => (
                          <div key={s.id} className="bloque-horario">
                            <b>{s.hora_inicio}–{s.hora_fin}</b><div>{s.cursillo}</div><div className="aula">{s.aula ?? 'Sin aula'}</div>
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Tabla filas={filtradas} porPagina={100} columnas={[
          { key: 'docente', label: 'Docente' }, { key: 'cursillo', label: 'Cursillo a dictar', render: (s) => <>{s.cursillo}{s.nivel && <span className="suave"> · {s.nivel}</span>}</> },
          { key: 'aula', label: 'Aula' }, { key: 'fecha', label: 'Fecha', render: (s) => `${DIAS[(new Date(s.fecha + 'T12:00').getDay() + 6) % 7]} ${fmtFecha(s.fecha)}` },
          { key: 'hora', label: 'Hora', render: (s) => `${s.hora_inicio}–${s.hora_fin}` }, { key: 'horas', label: 'Horas', num: true },
        ]} />
      )}
    </>
  );
}

export function OrganizacionEvento({ evento, onCambio }: { evento: any; onCambio: () => void }) {
  const [p, setP] = useState<'cursillos' | 'horario' | 'aulas'>('cursillos');
  return (
    <>
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'cursillos', nombre: 'Cursillos, docentes y aulas', icono: <GraduationCap size={16} /> },
        { id: 'horario', nombre: 'Horario de docentes', icono: <CalendarClock size={16} /> },
        { id: 'aulas', nombre: 'Aulas', icono: <DoorOpen size={16} /> },
      ]} />
      {p === 'cursillos' && <Cursillos evento={evento} onCambio={onCambio} />}
      {p === 'horario' && <HorarioDocentes evento={evento} />}
      {p === 'aulas' && <Aulas />}
    </>
  );
}

/** Página del menú «Organización del evento»: elegir el evento y organizar cursillos, docentes, aulas y horario. */
export function Organizacion({ parametros }: { parametros?: any }) {
  const { intentar } = useApp();
  const [eventos, setEventos] = useState<any[]>([]);
  const [id, setId] = useState<number | ''>(parametros?.eventoId ?? '');
  const [k, setK] = useState(0);
  useEffect(() => {
    intentar(() => api('datos.listar', { modelo: 'eventos', filtro: {} })).then((r) => {
      if (!r) return;
      setEventos(r);
      // Por defecto: el evento en curso o el próximo; si no, el más reciente.
      if (!id && r.length) {
        const hoy = new Date().toISOString().slice(0, 10);
        const actual = r.find((e: any) => e.estado === 'En curso') ?? [...r].reverse().find((e: any) => e.fecha_fin >= hoy && e.estado !== 'Cancelado') ?? r[0];
        setId(actual.id);
      }
    });
  }, [intentar, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const evento = eventos.find((e) => e.id === id);
  return (
    <>
      <div className="pagina-cab"><div><h1>Organización del evento</h1>
        <p>Cursillos a dictar, docente y aula de cada uno, y el horario de los docentes.</p></div></div>
      <div className="barra-filtros">
        <div className="campo" style={{ minWidth: 380 }}><label htmlFor="o-evento">Evento</label>
          <select id="o-evento" value={id} onChange={(e) => setId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Seleccione el evento —</option>
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.anio} · {e.nombre} ({e.estado})</option>)}
          </select></div>
        {evento && <span className="suave">{fmtFecha(evento.fecha_inicio)} – {fmtFecha(evento.fecha_fin)}{evento.lugar ? ` · ${evento.lugar}` : ''}</span>}
      </div>
      {evento ? <OrganizacionEvento key={evento.id} evento={evento} onCambio={() => setK((x) => x + 1)} />
        : <Vacio texto={eventos.length ? 'Seleccione un evento para organizarlo.' : 'Primero cree un evento en «Eventos del año».'} icono={<GraduationCap size={36} />} />}
    </>
  );
}
