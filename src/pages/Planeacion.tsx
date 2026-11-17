/** Módulo 7: Planeación temática y distribución del tiempo. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, FileSpreadsheet, FileText, ListTree, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import type { Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum } from '../api';
import { BotonesExportar, CampoTexto, Insignia, Modal, Pestanas, Progreso, SelectorOpciones, Tabla, Tarjeta, Vacio, useOpciones, type Col } from '../components/ui';
import { useApp } from '../estado';

function FormularioTematica({ asignaturaId, tematica, onCerrar, onGuardado }: { asignaturaId: number; tematica?: any; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar } = useApp();
  const [d, setD] = useState<Record<string, any>>(() => ({
    unidad: '', tema: '', subtema: '', objetivo: '', fecha_programada: '', horas_asignadas: '', horas_ejecutadas: 0, material: '', observaciones: '', ...tematica,
  }));
  const set = (k: string) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const guardar = async () => {
    const r = await intentar(() => api('planeacion.guardarTematica', { ...d, id: tematica?.id, asignatura_id: asignaturaId }), tematica ? 'Temática actualizada.' : 'Temática agregada.');
    if (r !== undefined) onGuardado();
  };
  return (
    <Modal titulo={tematica ? 'Editar temática' : 'Nueva temática'} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={guardar}>Guardar</button></>}>
      <div className="form">
        <CampoTexto label="Unidad temática" requerido valor={d.unidad} onCambio={set('unidad')} placeholder="Unidad 1" maxLength={120} />
        <CampoTexto label="Tema" requerido valor={d.tema} onCambio={set('tema')} placeholder="Números reales" maxLength={200} />
        <CampoTexto label="Subtema" valor={d.subtema} onCambio={set('subtema')} maxLength={300} className="ancho" />
        <CampoTexto label="Objetivo de aprendizaje" tipo="textarea" valor={d.objetivo} onCambio={set('objetivo')} className="ancho" />
        <CampoTexto label="Fecha programada" tipo="date" valor={d.fecha_programada} onCambio={set('fecha_programada')} />
        <CampoTexto label="Horas asignadas" tipo="number" requerido min={0} step="0.5" valor={d.horas_asignadas} onCambio={set('horas_asignadas')} />
        <CampoTexto label="Horas ejecutadas (registro manual)" tipo="number" min={0} step="0.5" valor={d.horas_ejecutadas} onCambio={set('horas_ejecutadas')}
          ayuda="Las clases ejecutadas vinculadas a la temática se cuentan solas; use este campo si dictó horas sin clase vinculada." />
        <CampoTexto label="Material de apoyo" valor={d.material} onCambio={set('material')} maxLength={300} />
        <CampoTexto label="Observaciones" tipo="textarea" valor={d.observaciones} onCambio={set('observaciones')} className="ancho" />
      </div>
    </Modal>
  );
}

function PlaneacionAsignatura({ asignaturaId }: { asignaturaId: number }) {
  const { intentar, confirmar } = useApp();
  const [p, setP] = useState<any>(null);
  const [editando, setEditando] = useState<any | null | undefined>(undefined);
  const [redistribuir, setRedistribuir] = useState<Record<number, string> | null>(null);
  const cargar = useCallback(() => { intentar(() => api('planeacion.obtener', { asignaturaId })).then((r) => r && setP(r)); }, [asignaturaId, intentar]);
  useEffect(() => { setRedistribuir(null); cargar(); }, [cargar]);
  if (!p) return null;
  const r = p.resumen;
  const a = p.asignatura;
  const editable = p.puedeEditar;

  const mover = async (i: number, dir: number) => {
    const ids = p.tematicas.map((t: any) => t.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    if (await intentar(() => api('planeacion.reordenar', { asignaturaId, ids })) !== undefined) cargar();
  };
  const eliminar = async (t: any) => {
    if (!(await confirmar({ titulo: 'Eliminar temática', mensaje: `¿Eliminar «${t.unidad}: ${t.tema}»? Se enviará a la papelera.`, peligro: true, aceptar: 'Eliminar' }))) return;
    if (await intentar(() => api('planeacion.eliminarTematica', { asignaturaId, id: t.id }), 'Temática eliminada.') !== undefined) cargar();
  };
  const guardarDistribucion = async (ajustar: boolean) => {
    const horas = p.tematicas.map((t: any) => ({ id: t.id, horas_asignadas: ajustar && !redistribuir ? t.horas_asignadas : Number(redistribuir?.[t.id] ?? t.horas_asignadas) }));
    if (await intentar(() => api('planeacion.redistribuir', { asignaturaId, horas, ajustar }), 'Distribución de horas actualizada.') !== undefined) { setRedistribuir(null); cargar(); }
  };
  const totalRedis = redistribuir ? Object.values(redistribuir).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  const exportar = (formato: 'pdf' | 'xlsx') => intentar(() => api('reportes.exportar', { id: 'planeacion', formato, filtros: { asignaturaId } }));

  return (
    <>
      <Tarjeta className="mb" titulo={<>{a.nombre} <span className="suave peq">({a.codigo})</span></>}
        acciones={<>
          <button className="btn chico" onClick={() => exportar('pdf')}><FileText size={14} /> PDF</button>
          <button className="btn chico" onClick={() => exportar('xlsx')}><FileSpreadsheet size={14} /> Excel</button>
        </>}>
        <div className="fila mb peq">
          <Insignia valor={a.area} color="azul" /><span>Cursillo: <b>{a.cursillo}</b></span><span>Docente responsable: <b>{a.docente ?? 'Sin asignar'}</b></span>
          <span>Fechas: {fmtFecha(a.cursillo_inicio)} – {fmtFecha(a.cursillo_fin)}</span>
        </div>
        <div className="resumen-plan">
          <div className="item"><b>{fmtNum(r.intensidad)} h</b><span>Intensidad horaria</span></div>
          <div className="item"><b>{fmtNum(r.programadas)} h</b><span>Total horas programadas</span></div>
          <div className="item"><b>{fmtNum(r.ejecutadas)} h</b><span>Total horas ejecutadas</span></div>
          <div className="item"><b>{fmtNum(r.pendientes)} h</b><span>Horas pendientes</span></div>
          <div className="item"><b>{fmtNum(r.avance)}%</b><span>Porcentaje de avance</span><Progreso valor={r.avance} /></div>
          <div className="item"><b>{fmtNum(r.cumplimiento)}%</b><span>Cumplimiento a la fecha</span><Insignia valor={r.estado} /></div>
          <div className="item"><b>{fmtNum(r.distribucion)}%</b><span>Distribución vs. intensidad</span></div>
          <div className="item"><b>{fmtNum(r.horas_clase_programadas)} h</b><span>En horario (por grupo); {fmtNum(r.horas_clase_ejecutadas)} h dictadas</span></div>
        </div>
        {p.tematicas.length > 0 && r.distribucion !== 100 && (
          <div className="alerta aviso mt"><AlertTriangle size={18} />
            <div>La planeación suma <b>{fmtNum(r.programadas)} h</b> y la intensidad de la asignatura es <b>{fmtNum(r.intensidad)} h</b>
              ({r.programadas > r.intensidad ? 'excede' : 'faltan'} {fmtNum(Math.abs(r.intensidad - r.programadas))} h).
              {editable && <> <button className="btn chico" onClick={() => guardarDistribucion(true)}><Scale size={13} /> Ajustar proporcionalmente a {fmtNum(r.intensidad)} h</button></>}</div></div>
        )}
        {r.esperadas_a_la_fecha > r.ejecutadas && (
          <div className="alerta info mt">A la fecha se esperaban {fmtNum(r.esperadas_a_la_fecha)} h ejecutadas según las fechas programadas; van {fmtNum(r.ejecutadas)} h.</div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Unidades y temáticas" cuerpo={false}
        acciones={editable && <>
          {redistribuir
            ? <><span className="peq">Total: <b>{fmtNum(totalRedis)} h</b> de {fmtNum(r.intensidad)} h</span>
              <button className="btn chico" onClick={() => setRedistribuir(null)}>Cancelar</button>
              <button className="btn chico primario" onClick={() => guardarDistribucion(false)}>Guardar distribución</button></>
            : <button className="btn chico" disabled={!p.tematicas.length} onClick={() => setRedistribuir(Object.fromEntries(p.tematicas.map((t: any) => [t.id, String(t.horas_asignadas)])))}><Scale size={14} /> Redistribuir horas</button>}
          <button className="btn chico primario" onClick={() => setEditando(null)}><Plus size={14} /> Agregar temática</button>
        </>}>
        {p.tematicas.length ? (
          <div className="tabla-env" style={{ border: 0, borderRadius: 0 }}>
            <table className="tabla">
              <thead><tr>
                <th>#</th><th>Unidad</th><th>Temática</th><th>Objetivo</th><th>Fecha</th><th className="num">Horas</th>
                <th className="num">Ejecutadas</th><th className="num">Pendientes</th><th style={{ width: 150 }}>Avance</th><th>Material</th>{editable && <th />}
              </tr></thead>
              <tbody>
                {p.tematicas.map((t: any, i: number) => {
                  const pend = Math.max(0, t.horas_asignadas - t.horas_efectivas);
                  return (
                    <tr key={t.id}>
                      <td>{i + 1}</td><td><b>{t.unidad}</b></td>
                      <td>{t.tema}{t.subtema && <div className="peq suave">{t.subtema}</div>}</td>
                      <td className="peq" style={{ maxWidth: 240 }}>{t.objetivo}</td>
                      <td>{fmtFecha(t.fecha_programada)}</td>
                      <td className="num">{redistribuir
                        ? <input className="control" style={{ width: 70, textAlign: 'right' }} type="number" min={0} step="0.5" value={redistribuir[t.id]} onChange={(e) => setRedistribuir({ ...redistribuir, [t.id]: e.target.value })} aria-label={`Horas de ${t.tema}`} />
                        : fmtNum(t.horas_asignadas)}</td>
                      <td className="num" title={`Clases dictadas: ${fmtNum(t.horas_dictadas)} h · Registro manual: ${fmtNum(t.horas_ejecutadas)} h`}>{fmtNum(t.horas_efectivas)}</td>
                      <td className="num">{fmtNum(pend)}</td>
                      <td><Progreso valor={t.horas_asignadas ? Math.min(100, (t.horas_efectivas / t.horas_asignadas) * 100) : 0} /></td>
                      <td className="peq">{t.material}{t.materiales > 0 && <div><Insignia valor={`${t.materiales} archivo(s)`} color="dorado" /></div>}</td>
                      {editable && (
                        <td className="acc">
                          <button className="btn icono fantasma" disabled={i === 0} onClick={() => mover(i, -1)} title="Subir"><ArrowUp size={14} /></button>
                          <button className="btn icono fantasma" disabled={i === p.tematicas.length - 1} onClick={() => mover(i, 1)} title="Bajar"><ArrowDown size={14} /></button>
                          <button className="btn icono fantasma" onClick={() => setEditando(t)} title="Editar"><Pencil size={14} /></button>
                          <button className="btn icono fantasma" onClick={() => eliminar(t)} title="Eliminar"><Trash2 size={14} color="var(--rojo)" /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={5}>Total</td><td className="num">{fmtNum(r.programadas)}</td><td className="num">{fmtNum(r.ejecutadas)}</td><td className="num">{fmtNum(r.pendientes)}</td><td><Progreso valor={r.avance} /></td><td colSpan={editable ? 2 : 1} /></tr></tfoot>
            </table>
          </div>
        ) : <Vacio texto={editable ? 'Aún no hay temáticas. Agregue la primera unidad temática.' : 'La asignatura aún no tiene planeación.'} icono={<ListTree size={36} />} />}
      </Tarjeta>
      {editando !== undefined && <FormularioTematica asignaturaId={asignaturaId} tematica={editando} onCerrar={() => setEditando(undefined)} onGuardado={() => { setEditando(undefined); cargar(); }} />}
    </>
  );
}

function ResumenGeneral() {
  const { intentar } = useApp();
  const cursillos = useOpciones('cursillos');
  const docentes = useOpciones('docentes');
  const [f, setF] = useState<{ cursilloId: number | ''; docenteId: number | '' }>({ cursilloId: '', docenteId: '' });
  const [filas, setFilas] = useState<any[]>([]);
  useEffect(() => { intentar(() => api('planeacion.resumenGeneral', { cursilloId: f.cursilloId || null, docenteId: f.docenteId || null })).then((r) => r && setFilas(r)); }, [f, intentar]);
  const cols: Col<any>[] = [
    { key: 'nombre', label: 'Asignatura' }, { key: 'docente', label: 'Docente' }, { key: 'cursillo', label: 'Cursillo' },
    { key: 'intensidad', label: 'Intensidad', num: true }, { key: 'programadas', label: 'Programadas', num: true }, { key: 'ejecutadas', label: 'Ejecutadas', num: true },
    { key: 'pendientes', label: 'Pendientes', num: true },
    { key: 'avance', label: 'Avance', render: (x) => <Progreso valor={x.avance} />, valor: (x) => `${x.avance}%` },
    { key: 'cumplimiento', label: 'Cumplimiento', num: true, render: (x) => `${fmtNum(x.cumplimiento)}%`, valor: (x) => `${x.cumplimiento}%` },
    { key: 'estado', label: 'Estado', render: (x) => <Insignia valor={x.estado} />, valor: (x) => x.estado },
  ];
  return (
    <>
      <div className="barra-filtros">
        <SelectorOpciones label="Cursillo" valor={f.cursilloId} onCambio={(v) => setF({ ...f, cursilloId: v })} opciones={cursillos} />
        <SelectorOpciones label="Docente" valor={f.docenteId} onCambio={(v) => setF({ ...f, docenteId: v })} opciones={docentes} />
        <div className="espacio" />
        <BotonesExportar titulo="Avance de la planeación por asignatura y docente" columnas={cols} filas={filas} />
      </div>
      <Tabla filas={filas} columnas={cols} />
    </>
  );
}

export function Planeacion({ parametros }: { ir: (m: Modulo, p?: any) => void; parametros?: any }) {
  const { sesion } = useApp();
  const [pestana, setPestana] = useState<'asignatura' | 'resumen'>('asignatura');
  const cursillos = useOpciones('cursillos');
  const asignaturas = useOpciones('asignaturas');
  const [cursilloId, setCursilloId] = useState<number | ''>('');
  const [asignaturaId, setAsignaturaId] = useState<number | ''>(parametros?.asignaturaId ?? '');
  useEffect(() => {
    const a = asignaturas.find((x) => x.id === asignaturaId);
    if (a && !cursilloId) setCursilloId(a.cursillo_id);
  }, [asignaturas, asignaturaId, cursilloId]);
  const lista = useMemo(() => {
    const l = asignaturas.filter((a) => !cursilloId || a.cursillo_id === cursilloId);
    // El docente ve primero sus asignaturas.
    return sesion?.docenteId ? [...l.filter((a) => a.docente_id === sesion.docenteId), ...l.filter((a) => a.docente_id !== sesion.docenteId)] : l;
  }, [asignaturas, cursilloId, sesion]);
  return (
    <>
      <div className="pagina-cab"><div><h1>Planeación temática</h1>
        <p>Organice las unidades y temas de cada asignatura, distribuya las horas y controle el avance y cumplimiento.</p></div></div>
      <Pestanas valor={pestana} onCambio={setPestana} opciones={[{ id: 'asignatura', nombre: 'Planeación por asignatura' }, { id: 'resumen', nombre: 'Avance general' }]} />
      {pestana === 'asignatura' && (
        <>
          <div className="barra-filtros">
            <SelectorOpciones label="Cursillo" valor={cursilloId} onCambio={(v) => { setCursilloId(v); setAsignaturaId(''); }} opciones={cursillos} />
            <div className="campo" style={{ minWidth: 340 }}>
              <label htmlFor="p-asignatura">Asignatura</label>
              <select id="p-asignatura" value={asignaturaId} onChange={(e) => setAsignaturaId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Seleccione la asignatura —</option>
                {lista.map((a) => <option key={a.id} value={a.id}>{a.label}{sesion?.docenteId && a.docente_id === sesion.docenteId ? ' ★ (mi asignatura)' : ''}</option>)}
              </select>
            </div>
          </div>
          {asignaturaId ? <PlaneacionAsignatura asignaturaId={Number(asignaturaId)} /> : <Vacio texto="Seleccione una asignatura para ver o editar su planeación temática." icono={<ListTree size={36} />} />}
        </>
      )}
      {pestana === 'resumen' && <ResumenGeneral />}
    </>
  );
}
