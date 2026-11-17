/** Módulo 9: Control de asistencia (registro por clase y consultas individual y grupal). */
import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, ClipboardCheck, Save, User, Users } from 'lucide-react';
import { ESTADOS_ASISTENCIA, type Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum, hoyISO, sumarDias } from '../api';
import { BotonesExportar, CampoTexto, Insignia, Kpi, Pestanas, Progreso, SelectorOpciones, Tabla, Tarjeta, Vacio, useOpciones, type Col } from '../components/ui';
import { useApp } from '../estado';

const ETIQUETA: Record<string, string> = { Asistió: 'Asistió', Ausente: 'Ausente', Retardo: 'Retardo', Excusa: 'Excusa justificada' };

function Planilla({ horarioId, onGuardado }: { horarioId: number; onGuardado: () => void }) {
  const { intentar, puede, sesion } = useApp();
  const [p, setP] = useState<any>(null);
  const [reg, setReg] = useState<Record<number, { estado: string; observacion: string }>>({});
  useEffect(() => {
    intentar(() => api('asistencia.planilla', { horarioId })).then((r) => {
      if (!r) return;
      setP(r);
      setReg(Object.fromEntries(r.estudiantes.map((e: any) => [e.estudiante_id, { estado: e.estado ?? '', observacion: e.observacion ?? '' }])));
    });
  }, [horarioId, intentar]);
  if (!p) return null;
  const c = p.clase;
  const editable = puede('asistencia', 'editar') && (sesion?.rol !== 'docente' || sesion.docenteId === c.docente_id) && c.estado !== 'Cancelada' && c.fecha <= hoyISO();
  const marcar = (id: number, estado: string) => setReg((r) => ({ ...r, [id]: { ...r[id], estado } }));
  const todos = (estado: string) => setReg((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, estado }])));
  const faltan = Object.values(reg).filter((r) => !r.estado).length;
  const guardar = async () => {
    const registros = Object.entries(reg).filter(([, v]) => v.estado).map(([k, v]) => ({ estudiante_id: Number(k), estado: v.estado, observacion: v.observacion }));
    if (await intentar(() => api('asistencia.registrar', { horarioId, registros }), `Asistencia guardada (${registros.length} estudiante(s)).`) !== undefined) onGuardado();
  };
  const conteo = (e: string) => Object.values(reg).filter((r) => r.estado === e).length;
  return (
    <Tarjeta titulo={<>{c.asignatura} · {c.grupo} <Insignia valor={c.estado} /></>}
      acciones={editable && <>
        <button className="btn chico" onClick={() => todos('Asistió')}><CheckCheck size={14} /> Todos asistieron</button>
        <button className="btn chico primario" onClick={guardar} disabled={faltan === p.estudiantes.length}><Save size={14} /> Guardar asistencia</button>
      </>}>
      <div className="fila mb peq">
        <span><b>{fmtFecha(c.fecha)}</b> {c.hora_inicio}–{c.hora_fin} ({fmtNum(c.horas)} h)</span><span>Docente: {c.docente}</span><span>{c.cursillo}</span>
        <div className="espacio" />
        {ESTADOS_ASISTENCIA.map((e) => <Insignia key={e} valor={`${ETIQUETA[e]}: ${conteo(e)}`} color={{ Asistió: 'verde', Ausente: 'rojo', Retardo: 'naranja', Excusa: 'azul' }[e]} />)}
        {faltan > 0 && <Insignia valor={`Sin marcar: ${faltan}`} />}
      </div>
      {!editable && c.fecha > hoyISO() && <div className="alerta info">La clase es futura: la asistencia se podrá registrar el día de la clase.</div>}
      {!editable && c.estado === 'Cancelada' && <div className="alerta aviso">La clase fue cancelada.</div>}
      {editable && c.estado === 'Programada' && <div className="alerta info">Al guardar, la clase quedará marcada como <b>Ejecutada</b> y sus horas contarán en la planeación.</div>}
      {p.estudiantes.length ? (
        <div className="tabla-env">
          <table className="tabla">
            <thead><tr><th>#</th><th>Identificación</th><th>Estudiante</th><th>Asistencia</th><th>Observación</th></tr></thead>
            <tbody>
              {p.estudiantes.map((e: any, i: number) => (
                <tr key={e.estudiante_id}>
                  <td>{i + 1}</td><td>{e.identificacion}</td><td><b>{e.nombre}</b></td>
                  <td>
                    <div className="estado-asistencia" role="radiogroup" aria-label={`Asistencia de ${e.nombre}`}>
                      {ESTADOS_ASISTENCIA.map((s) => (
                        <button key={s} disabled={!editable} role="radio" aria-checked={reg[e.estudiante_id]?.estado === s}
                          className={`${s} ${reg[e.estudiante_id]?.estado === s ? 'on' : ''}`} onClick={() => marcar(e.estudiante_id, s)}>{ETIQUETA[s]}</button>
                      ))}
                    </div>
                  </td>
                  <td><input className="control" disabled={!editable} value={reg[e.estudiante_id]?.observacion ?? ''} maxLength={200}
                    onChange={(ev) => setReg((r) => ({ ...r, [e.estudiante_id]: { ...r[e.estudiante_id], observacion: ev.target.value } }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Vacio texto="No hay estudiantes activos en este grupo que cursen la asignatura." />}
    </Tarjeta>
  );
}

function Registrar({ horarioInicial }: { horarioInicial?: number }) {
  const { intentar, sesion } = useApp();
  const grupos = useOpciones('grupos');
  const [fecha, setFecha] = useState(hoyISO());
  const [grupoId, setGrupoId] = useState<number | ''>('');
  const [clases, setClases] = useState<any[]>([]);
  const [sel, setSel] = useState<number | null>(horarioInicial ?? null);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const cargar = useCallback(() => {
    intentar(() => api('horarios.listar', { desde: fecha, hasta: fecha, grupoId: grupoId || null, docenteId: sesion?.rol === 'docente' ? sesion.docenteId : null }))
      .then((r) => r && setClases(r.filter((c: any) => c.estado !== 'Cancelada')));
    intentar(() => api('horarios.listar', { desde: sumarDias(hoyISO(), -120), hasta: sumarDias(hoyISO(), -1), estado: 'Programada', docenteId: sesion?.rol === 'docente' ? sesion.docenteId : null }))
      .then((r) => r && setPendientes(r));
  }, [fecha, grupoId, intentar, sesion]);
  useEffect(cargar, [cargar]);
  return (
    <div className="rejilla" style={{ gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)' }}>
      <div className="col-flex">
        <Tarjeta titulo="Clases del día">
          <CampoTexto label="Fecha" tipo="date" valor={fecha} onCambio={(v) => { setFecha(v); setSel(null); }} />
          <SelectorOpciones label="Grupo" valor={grupoId} onCambio={setGrupoId} opciones={grupos} />
          <div className="col-flex mt" style={{ gap: 6 }}>
            {clases.map((c) => (
              <button key={c.id} className={`btn ${sel === c.id ? 'primario' : ''}`} style={{ justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setSel(c.id)}>
                <span>{c.hora_inicio} · {c.asignatura}<br /><span className="peq" style={{ fontWeight: 400 }}>{c.grupo} · {c.docente}</span></span>
                <span className="peq">{c.asistencias ? '✔' : ''}</span>
              </button>
            ))}
            {!clases.length && <div className="suave peq">No hay clases programadas en esta fecha.</div>}
          </div>
        </Tarjeta>
        {pendientes.length > 0 && (
          <Tarjeta titulo={`Pendientes de registrar (${pendientes.length})`}>
            <div className="col-flex" style={{ gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {pendientes.slice(0, 40).map((c) => (
                <button key={c.id} className="btn chico" style={{ justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => { setFecha(c.fecha); setSel(c.id); }}>
                  {fmtFecha(c.fecha)} · {c.asignatura} ({c.grupo})
                </button>
              ))}
            </div>
          </Tarjeta>
        )}
      </div>
      <div>{sel ? <Planilla key={sel} horarioId={sel} onGuardado={cargar} /> : <Vacio texto="Seleccione una clase para registrar o consultar la asistencia." icono={<ClipboardCheck size={36} />} />}</div>
    </div>
  );
}

function Individual() {
  const { intentar } = useApp();
  const estudiantes = useOpciones('estudiantes');
  const [id, setId] = useState<number | ''>('');
  const [d, setD] = useState<any>(null);
  useEffect(() => { if (id) intentar(() => api('asistencia.estudiante', { estudianteId: id })).then((r) => r && setD(r)); else setD(null); }, [id, intentar]);
  const cols: Col<any>[] = [
    { key: 'fecha', label: 'Fecha', render: (x) => fmtFecha(x.fecha), valor: (x) => fmtFecha(x.fecha) }, { key: 'hora_inicio', label: 'Hora' },
    { key: 'asignatura', label: 'Asignatura' }, { key: 'estado', label: 'Estado', render: (x) => <Insignia valor={x.estado} />, valor: (x) => x.estado }, { key: 'observacion', label: 'Observación' },
  ];
  const nombre = estudiantes.find((e) => e.id === id)?.label ?? '';
  return (
    <>
      <div className="barra-filtros"><div style={{ minWidth: 380 }}><SelectorOpciones label="Estudiante" valor={id} onCambio={setId} opciones={estudiantes} todos="— Seleccione —" /></div></div>
      {!d ? <Vacio texto="Seleccione un estudiante." icono={<User size={36} />} /> : (
        <>
          {d.matriculas.map((m: any) => (
            <Tarjeta key={m.id} className="mb" titulo={<>{m.cursillo} · {m.grupo ?? 'sin grupo'} <Insignia valor={m.estado} /></>}>
              <div className="rejilla k4 mb">
                <Kpi icono={<ClipboardCheck />} valor={m.resumen.clases} etiqueta="Total de clases" />
                <Kpi icono={<ClipboardCheck />} valor={m.resumen.asistio + m.resumen.retardo} etiqueta="Asistencias (incluye retardos)" sub={`${m.resumen.retardo} retardo(s) · ${m.resumen.excusa} excusa(s)`} />
                <Kpi icono={<ClipboardCheck />} valor={m.resumen.ausente} etiqueta="Ausencias" />
                <Kpi icono={<ClipboardCheck />} valor={m.resumen.porcentaje == null ? '—' : `${fmtNum(m.resumen.porcentaje)}%`} etiqueta="Porcentaje de asistencia" sub={`${fmtNum(m.resumen.horas_asistidas)} h efectivamente asistidas`} />
              </div>
              <Tabla filas={m.resumen.asignaturas.map((a: any) => ({ ...a, id: a.asignatura_id }))} columnas={[
                { key: 'asignatura', label: 'Asignatura' }, { key: 'clases', label: 'Clases', num: true }, { key: 'asistio', label: 'Asistió', num: true },
                { key: 'retardo', label: 'Retardo', num: true }, { key: 'ausente', label: 'Ausente', num: true }, { key: 'excusa', label: 'Excusa', num: true },
                { key: 'horas_asistidas', label: 'Horas asistidas', num: true }, { key: 'porcentaje', label: 'Asistencia', render: (a) => (a.porcentaje == null ? '—' : <Progreso valor={a.porcentaje} />) },
              ]} />
            </Tarjeta>
          ))}
          <Tarjeta titulo="Detalle por clase" acciones={<BotonesExportar titulo={`Asistencia de ${nombre}`} columnas={cols} filas={d.detalle} />} cuerpo={false}>
            <Tabla filas={d.detalle.map((x: any, i: number) => ({ ...x, id: i }))} columnas={cols} porPagina={25} vacio="Sin registros." />
          </Tarjeta>
        </>
      )}
    </>
  );
}

function Grupal() {
  const { intentar } = useApp();
  const grupos = useOpciones('grupos');
  const asignaturas = useOpciones('asignaturas');
  const [g, setG] = useState<number | ''>('');
  const [a, setA] = useState<number | ''>('');
  const [filas, setFilas] = useState<any[]>([]);
  useEffect(() => { if (g) intentar(() => api('asistencia.grupo', { grupoId: g, asignaturaId: a || null })).then((r) => r && setFilas(r)); else setFilas([]); }, [g, a, intentar]);
  const grupo = grupos.find((x) => x.id === g);
  const cols: Col<any>[] = [
    { key: 'identificacion', label: 'Identificación' }, { key: 'nombre', label: 'Estudiante' },
    { key: 'clases', label: 'Clases', num: true }, { key: 'asistio', label: 'Asistió', num: true }, { key: 'retardo', label: 'Retardo', num: true },
    { key: 'ausente', label: 'Ausente', num: true }, { key: 'excusa', label: 'Excusa', num: true }, { key: 'horas_asistidas', label: 'Horas asistidas', num: true },
    { key: 'porcentaje', label: '% asistencia', render: (x) => (x.porcentaje == null ? '—' : <Progreso valor={x.porcentaje} />), valor: (x) => (x.porcentaje == null ? '' : `${x.porcentaje}%`) },
  ];
  const conDatos = filas.filter((f) => f.porcentaje != null);
  const promedio = conDatos.length ? conDatos.reduce((s, f) => s + f.porcentaje, 0) / conDatos.length : null;
  return (
    <>
      <div className="barra-filtros">
        <SelectorOpciones label="Grupo" valor={g} onCambio={(v) => { setG(v); setA(''); }} opciones={grupos} todos="— Seleccione —" />
        <SelectorOpciones label="Asignatura" valor={a} onCambio={setA} opciones={asignaturas.filter((x) => x.cursillo_id === grupo?.cursillo_id)} todos="Todas" deshabilitado={!g} />
        <div className="espacio" />
        {g && <span className="peq">Promedio del grupo: <b>{promedio == null ? '—' : `${fmtNum(promedio)}%`}</b></span>}
        <BotonesExportar titulo={`Asistencia del grupo ${grupo?.label ?? ''}`} columnas={cols} filas={filas} />
      </div>
      {g ? <Tabla filas={filas.map((f) => ({ ...f, id: f.matricula_id }))} columnas={cols} vacio="El grupo no tiene estudiantes." /> : <Vacio texto="Seleccione un grupo." icono={<Users size={36} />} />}
    </>
  );
}

export function Asistencia({ parametros }: { ir: (m: Modulo, p?: any) => void; parametros?: any }) {
  const [p, setP] = useState<'registrar' | 'individual' | 'grupal'>('registrar');
  return (
    <>
      <div className="pagina-cab"><div><h1>Control de asistencia</h1><p>Registro por fecha y clase: Asistió, Ausente, Retardo o Excusa justificada.</p></div></div>
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'registrar', nombre: 'Registrar asistencia', icono: <ClipboardCheck size={16} /> },
        { id: 'individual', nombre: 'Consulta individual', icono: <User size={16} /> },
        { id: 'grupal', nombre: 'Consulta grupal', icono: <Users size={16} /> },
      ]} />
      {p === 'registrar' && <Registrar horarioInicial={parametros?.horarioId} />}
      {p === 'individual' && <Individual />}
      {p === 'grupal' && <Grupal />}
    </>
  );
}
