/** Módulo 6: Programación de horarios con detección de conflictos y vistas de calendario. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, List, Pencil, Trash2, XCircle } from 'lucide-react';
import { DIAS, ESTADOS_HORARIO, type Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum, hoyISO, sumarDias } from '../api';
import { CalendarioMes, CalendarioSemana, lunesDe, MESES } from '../components/calendario';
import { BotonesExportar, CampoTexto, Insignia, Modal, Pagina, SelectorOpciones, Tabla, useOpciones, type Col } from '../components/ui';
import { useApp } from '../estado';

interface Verificacion { errores: { tipo: string; mensaje: string; fecha?: string }[]; advertencias: { tipo: string; mensaje: string }[]; fechas: string[] }

function FormularioClase({ clase, inicial, onCerrar, onGuardado }: { clase?: any; inicial?: Record<string, any>; onCerrar: () => void; onGuardado: () => void }) {
  const { intentar, confirmar, notificar } = useApp();
  const cursillos = useOpciones('cursillos');
  const asignaturas = useOpciones('asignaturas');
  const docentes = useOpciones('docentes');
  const grupos = useOpciones('grupos');
  const [d, setD] = useState<Record<string, any>>(() => clase
    ? { ...clase }
    : { cursillo_id: '', asignatura_id: '', docente_id: '', grupo_id: '', tematica_id: '', fecha: hoyISO(), hora_inicio: '08:00', hora_fin: '10:00', aula: '', observaciones: '', ...inicial });
  const [modo, setModo] = useState<'unica' | 'recurrente'>('unica');
  const [dias, setDias] = useState<number[]>([6]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tematicas, setTematicas] = useState<{ id: number; label: string }[]>([]);
  const [v, setV] = useState<Verificacion | null>(null);
  const [omitir, setOmitir] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const cursillo = cursillos.find((c) => c.id === Number(d.cursillo_id));

  useEffect(() => {
    if (cursillo && !desde) { setDesde(cursillo.fecha_inicio > hoyISO() ? cursillo.fecha_inicio : hoyISO()); setHasta(cursillo.fecha_fin); }
  }, [cursillo, desde]);
  useEffect(() => {
    if (!d.asignatura_id) { setTematicas([]); return; }
    api('planeacion.tematicas', { asignaturaId: d.asignatura_id }).then(setTematicas).catch(() => setTematicas([]));
  }, [d.asignatura_id]);

  const set = (k: string, val: any) => setD((x) => {
    const n = { ...x, [k]: val };
    if (k === 'cursillo_id') { n.asignatura_id = ''; n.grupo_id = ''; n.tematica_id = ''; setDesde(''); }
    if (k === 'asignatura_id') {
      n.tematica_id = '';
      const a = asignaturas.find((o) => o.id === Number(val));
      if (a?.docente_id) n.docente_id = a.docente_id;
    }
    if (k === 'grupo_id' && !x.aula) n.aula = grupos.find((g) => g.id === Number(val))?.aula ?? '';
    return n;
  });

  const lote = useMemo(() => {
    const base = { cursillo_id: d.cursillo_id, asignatura_id: d.asignatura_id, docente_id: d.docente_id, grupo_id: d.grupo_id, tematica_id: d.tematica_id || null,
      hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, aula: d.aula, observaciones: d.observaciones };
    return modo === 'unica' || clase ? { base, fechas: [d.fecha], id: clase?.id } : { base, dias, desde, hasta };
  }, [d, modo, dias, desde, hasta, clase]);

  const completo = d.cursillo_id && d.asignatura_id && d.docente_id && d.grupo_id && d.hora_inicio && d.hora_fin && (modo === 'unica' || clase ? d.fecha : desde && hasta && dias.length);
  useEffect(() => {
    if (!completo) { setV(null); return; }
    const t = setTimeout(() => { api<Verificacion>('horarios.verificar', lote).then(setV).catch((e) => setV({ errores: [{ tipo: 'x', mensaje: e.message }], advertencias: [], fechas: [] })); }, 300);
    return () => clearTimeout(t);
  }, [lote, completo]);

  const guardar = async () => {
    if (!v) return;
    if (v.errores.length && !(omitir && modo === 'recurrente')) { notificar('Corrija los conflictos antes de guardar.', 'error'); return; }
    if (v.advertencias.length) {
      const ok = await confirmar({
        titulo: 'Advertencias de programación', aceptar: 'Guardar de todas formas',
        mensaje: <><p>Se detectaron las siguientes advertencias:</p><ul>{v.advertencias.map((a, i) => <li key={i}>{a.mensaje}</li>)}</ul></>,
      });
      if (!ok) return;
    }
    setGuardando(true);
    const r = clase
      ? await intentar(() => api('horarios.actualizar', { ...lote.base, id: clase.id, fecha: d.fecha }), 'Clase actualizada.')
      : await intentar(async () => {
        const x = await api('horarios.crear', { lote, opciones: { omitirConflictivas: omitir } });
        notificar(`${x.creadas} clase(s) programada(s)${x.omitidas.length ? `; ${x.omitidas.length} fecha(s) omitidas por conflicto` : ''}.`, 'exito');
        return x;
      });
    setGuardando(false);
    if (r !== undefined) onGuardado();
  };

  const fechasConError = new Set(v?.errores.map((e) => e.fecha));
  const validas = v ? v.fechas.filter((f) => !fechasConError.has(f)).length : 0;
  return (
    <Modal tam="grande" titulo={clase ? 'Editar clase' : 'Programar clases'} icono={<CalendarPlus size={20} />} onCerrar={onCerrar}
      pie={<>
        <span className="suave peq" style={{ marginRight: 'auto' }}>{v && `${v.fechas.length} clase(s) · ${validas} sin conflicto`}</span>
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario" disabled={!v || guardando || (!!v.errores.length && !(omitir && modo === 'recurrente' && validas > 0))} onClick={guardar}>
          {guardando ? 'Guardando…' : clase ? 'Guardar cambios' : omitir && v?.errores.length ? `Guardar ${validas} clase(s) válidas` : 'Guardar programación'}
        </button>
      </>}>
      <div className="form">
        <SelectorOpciones label="Cursillo" requerido valor={d.cursillo_id} onCambio={(x) => set('cursillo_id', x)} opciones={cursillos.filter((c) => c.estado === 'Activo' || c.id === clase?.cursillo_id)} todos="— Seleccione —" />
        <SelectorOpciones label="Asignatura" requerido valor={d.asignatura_id} onCambio={(x) => set('asignatura_id', x)} opciones={asignaturas.filter((a) => a.cursillo_id === Number(d.cursillo_id))} todos="— Seleccione —" deshabilitado={!d.cursillo_id} />
        <SelectorOpciones label="Docente" requerido valor={d.docente_id} onCambio={(x) => set('docente_id', x)} opciones={docentes} todos="— Seleccione —" />
        <SelectorOpciones label="Grupo" requerido valor={d.grupo_id} onCambio={(x) => set('grupo_id', x)} opciones={grupos.filter((g) => g.cursillo_id === Number(d.cursillo_id))} todos="— Seleccione —" deshabilitado={!d.cursillo_id} />
        <SelectorOpciones label="Temática (planeación)" valor={d.tematica_id} onCambio={(x) => set('tematica_id', x)} opciones={tematicas} todos={tematicas.length ? '— Sin vincular —' : '— La asignatura no tiene planeación —'} />
        <CampoTexto label="Aula o espacio" valor={d.aula} onCambio={(x) => set('aula', x)} maxLength={60} />
        <CampoTexto label="Hora de inicio" tipo="time" requerido valor={d.hora_inicio} onCambio={(x) => set('hora_inicio', x)} />
        <CampoTexto label="Hora de finalización" tipo="time" requerido valor={d.hora_fin} onCambio={(x) => set('hora_fin', x)} />
        {!clase && (
          <div className="campo ancho">
            <label>Programación</label>
            <div className="fila">
              <label className="check"><input type="radio" checked={modo === 'unica'} onChange={() => setModo('unica')} /> Una fecha</label>
              <label className="check"><input type="radio" checked={modo === 'recurrente'} onChange={() => setModo('recurrente')} /> Semanal (varios días en un rango de fechas)</label>
            </div>
          </div>
        )}
        {modo === 'unica' || clase ? (
          <CampoTexto label="Fecha de la clase" tipo="date" requerido valor={d.fecha} onCambio={(x) => set('fecha', x)}
            ayuda={d.fecha ? `Día: ${DIAS[(new Date(d.fecha + 'T12:00').getDay() + 6) % 7]}` : undefined} />
        ) : (
          <>
            <div className="campo ancho"><label>Días de la semana<span className="req">*</span></label>
              <div className="fila">{DIAS.map((n, i) => (
                <label key={n} className="check"><input type="checkbox" checked={dias.includes(i + 1)} onChange={() => setDias((x) => (x.includes(i + 1) ? x.filter((y) => y !== i + 1) : [...x, i + 1]))} />{n}</label>
              ))}</div></div>
            <CampoTexto label="Desde" tipo="date" requerido valor={desde} onCambio={setDesde} />
            <CampoTexto label="Hasta" tipo="date" requerido valor={hasta} onCambio={setHasta} ayuda={cursillo ? `Cursillo: ${fmtFecha(cursillo.fecha_inicio)} – ${fmtFecha(cursillo.fecha_fin)}` : undefined} />
          </>
        )}
        <CampoTexto label="Observaciones" tipo="textarea" valor={d.observaciones} onCambio={(x) => set('observaciones', x)} className="ancho" />
      </div>
      <div className="mt">
        {!completo && <div className="alerta info">Complete los datos para verificar cruces de horario automáticamente.</div>}
        {v && !v.errores.length && <div className="alerta exito"><CheckCircle2 size={18} /> Sin conflictos de horario: {v.fechas.length} clase(s) listas para guardar{v.advertencias.length ? ' (revise las advertencias)' : ''}.</div>}
        {v && v.errores.length > 0 && (
          <div className="alerta error"><XCircle size={18} /><div><b>Conflictos detectados ({v.errores.length}). No se puede guardar así:</b>
            <ul>{v.errores.slice(0, 12).map((e, i) => <li key={i}>{e.mensaje}</li>)}{v.errores.length > 12 && <li>… y {v.errores.length - 12} más.</li>}</ul>
            {modo === 'recurrente' && !clase && validas > 0 && (
              <label className="check mt"><input type="checkbox" checked={omitir} onChange={(e) => setOmitir(e.target.checked)} /> Guardar solo las {validas} fechas sin conflicto y omitir las demás</label>
            )}</div></div>
        )}
        {v && v.advertencias.length > 0 && (
          <div className="alerta aviso"><AlertTriangle size={18} /><div><b>Advertencias:</b><ul>{[...new Set(v.advertencias.map((a) => a.mensaje))].slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}</ul></div></div>
        )}
      </div>
    </Modal>
  );
}

function DetalleClase({ clase, onCerrar, onCambio, ir }: { clase: any; onCerrar: () => void; onCambio: () => void; ir: (m: Modulo, p?: any) => void }) {
  const { intentar, puede, confirmar, sesion } = useApp();
  const [editar, setEditar] = useState(false);
  const propia = sesion?.rol === 'docente' && sesion.docenteId === clase.docente_id;
  const estado = async (e: string) => {
    if (e === 'Cancelada' && !(await confirmar({ titulo: 'Cancelar clase', mensaje: '¿Marcar la clase como cancelada? No contará como hora programada.', peligro: true, aceptar: 'Cancelar clase' }))) return;
    if (await intentar(() => api('horarios.estado', { id: clase.id, estado: e }), `Clase marcada como ${e.toLowerCase()}.`) !== undefined) { onCambio(); onCerrar(); }
  };
  const eliminar = async () => {
    if (!(await confirmar({ titulo: 'Eliminar clase', mensaje: 'La clase se enviará a la papelera.', peligro: true, aceptar: 'Eliminar' }))) return;
    if (await intentar(() => api('horarios.eliminar', { id: clase.id }), 'Clase eliminada.') !== undefined) { onCambio(); onCerrar(); }
  };
  if (editar) return <FormularioClase clase={clase} onCerrar={() => setEditar(false)} onGuardado={() => { onCambio(); onCerrar(); }} />;
  return (
    <Modal titulo={clase.asignatura} onCerrar={onCerrar}
      pie={<>
        {puede('horarios', 'eliminar') && <button className="btn peligro" onClick={eliminar}><Trash2 size={15} /> Eliminar</button>}
        <div className="espacio" />
        {puede('asistencia') && clase.estado !== 'Cancelada' && <button className="btn" onClick={() => ir('asistencia', { horarioId: clase.id })}><ClipboardCheck size={15} /> Asistencia</button>}
        {puede('horarios', 'editar') && <button className="btn" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button>}
        {(puede('horarios', 'editar') || propia) && clase.estado !== 'Ejecutada' && clase.fecha <= hoyISO() && <button className="btn primario" onClick={() => estado('Ejecutada')}>Marcar ejecutada</button>}
      </>}>
      <dl className="lista-def">
        <dt>Fecha</dt><dd>{clase.dia} {fmtFecha(clase.fecha)}, {clase.hora_inicio}–{clase.hora_fin} ({fmtNum(clase.horas)} h)</dd>
        <dt>Estado</dt><dd><Insignia valor={clase.estado} /></dd>
        <dt>Cursillo</dt><dd>{clase.cursillo}</dd><dt>Grupo</dt><dd>{clase.grupo}</dd><dt>Docente</dt><dd>{clase.docente}</dd>
        <dt>Aula</dt><dd>{clase.aula || '—'}</dd><dt>Temática</dt><dd>{clase.tematica || '—'}</dd>
        <dt>Asistencia registrada</dt><dd>{clase.asistencias} estudiante(s)</dd>
        {clase.observaciones && <><dt>Observaciones</dt><dd>{clase.observaciones}</dd></>}
      </dl>
      {(puede('horarios', 'editar') || propia) && (
        <div className="fila mt">
          <span className="suave peq">Cambiar estado:</span>
          {ESTADOS_HORARIO.filter((e) => e !== clase.estado).map((e) => <button key={e} className="btn chico" onClick={() => estado(e)}>{e}</button>)}
        </div>
      )}
    </Modal>
  );
}

export function Horarios({ ir, parametros }: { ir: (m: Modulo, p?: any) => void; parametros?: any }) {
  const { puede, intentar } = useApp();
  const [vista, setVista] = useState<'semana' | 'mes' | 'lista'>('semana');
  const [ref, setRef] = useState<string>(parametros?.fecha ?? hoyISO());
  const [f, setF] = useState<Record<string, any>>({ cursilloId: parametros?.cursilloId ?? '', docenteId: '', grupoId: '', asignaturaId: '', estado: '' });
  const [clases, setClases] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState<Record<string, any> | null>(null);
  const [detalle, setDetalle] = useState<any>(null);
  const cursillos = useOpciones('cursillos');
  const docentes = useOpciones('docentes');
  const grupos = useOpciones('grupos');
  const asignaturas = useOpciones('asignaturas');

  const rango = useMemo(() => {
    if (vista === 'semana') { const l = lunesDe(ref); return { desde: l, hasta: sumarDias(l, 6) }; }
    if (vista === 'mes') { const m = ref.slice(0, 7); const l = lunesDe(`${m}-01`); return { desde: l, hasta: sumarDias(l, 41) }; }
    return { desde: f.desde || '', hasta: f.hasta || '' };
  }, [vista, ref, f.desde, f.hasta]);

  const cargar = useCallback(() => {
    intentar(() => api('horarios.listar', { ...rango, cursilloId: f.cursilloId || null, docenteId: f.docenteId || null, grupoId: f.grupoId || null, asignaturaId: f.asignaturaId || null, estado: f.estado || null }))
      .then((r) => r && setClases(r));
  }, [rango, f, intentar]);
  useEffect(cargar, [cargar]);

  const mover = (n: number) => {
    if (vista === 'semana') setRef(sumarDias(ref, 7 * n));
    else { const [a, m] = ref.split('-').map(Number); const d = new Date(a, m - 1 + n, 1); setRef(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); }
  };
  const titulo = vista === 'semana' ? `Semana del ${fmtFecha(rango.desde)} al ${fmtFecha(rango.hasta)}` : `${MESES[Number(ref.slice(5, 7)) - 1]} ${ref.slice(0, 4)}`;
  const horasProg = clases.filter((c) => c.estado !== 'Cancelada').reduce((s, c) => s + c.horas, 0);
  const horasEjec = clases.filter((c) => c.estado === 'Ejecutada').reduce((s, c) => s + c.horas, 0);
  const columnas: Col<any>[] = [
    { key: 'fecha', label: 'Fecha', render: (c) => fmtFecha(c.fecha), valor: (c) => c.fecha }, { key: 'dia', label: 'Día' },
    { key: 'hora', label: 'Hora', render: (c) => `${c.hora_inicio}–${c.hora_fin}`, valor: (c) => `${c.hora_inicio}–${c.hora_fin}` },
    { key: 'asignatura', label: 'Asignatura' }, { key: 'grupo', label: 'Grupo' }, { key: 'docente', label: 'Docente' }, { key: 'aula', label: 'Aula' },
    { key: 'tematica', label: 'Temática' }, { key: 'horas', label: 'Horas', num: true },
    { key: 'estado', label: 'Estado', render: (c) => <Insignia valor={c.estado} />, valor: (c) => c.estado },
  ];

  return (
    <Pagina titulo="Organización de horarios" descripcion="Programación académica por cursillo con detección automática de cruces de docentes, grupos, duplicados y fechas."
      acciones={puede('horarios', 'editar') && <button className="btn primario" onClick={() => setNuevo({ cursillo_id: f.cursilloId || '', docente_id: f.docenteId || '', grupo_id: f.grupoId || '' })}><CalendarPlus size={16} /> Programar clases</button>}>
      <div className="barra-filtros">
        <SelectorOpciones label="Cursillo" valor={f.cursilloId} onCambio={(v) => setF({ ...f, cursilloId: v, grupoId: '', asignaturaId: '' })} opciones={cursillos} />
        <SelectorOpciones label="Docente" valor={f.docenteId} onCambio={(v) => setF({ ...f, docenteId: v })} opciones={docentes} />
        <SelectorOpciones label="Grupo" valor={f.grupoId} onCambio={(v) => setF({ ...f, grupoId: v })} opciones={f.cursilloId ? grupos.filter((g) => g.cursillo_id === f.cursilloId) : grupos} />
        <SelectorOpciones label="Asignatura" valor={f.asignaturaId} onCambio={(v) => setF({ ...f, asignaturaId: v })} opciones={f.cursilloId ? asignaturas.filter((a) => a.cursillo_id === f.cursilloId) : asignaturas} />
        <div className="campo"><label htmlFor="h-estado">Estado</label><select id="h-estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}><option value="">Todos</option>{ESTADOS_HORARIO.map((e) => <option key={e}>{e}</option>)}</select></div>
      </div>
      <div className="fila mb">
        <div className="pestanas" style={{ margin: 0, border: 0 }}>
          <button className={vista === 'semana' ? 'activa' : ''} onClick={() => setVista('semana')}><CalendarDays size={15} /> Semana</button>
          <button className={vista === 'mes' ? 'activa' : ''} onClick={() => setVista('mes')}><CalendarDays size={15} /> Mes</button>
          <button className={vista === 'lista' ? 'activa' : ''} onClick={() => setVista('lista')}><List size={15} /> Lista</button>
        </div>
        {vista !== 'lista' ? (
          <>
            <button className="btn icono" onClick={() => mover(-1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
            <button className="btn chico" onClick={() => setRef(hoyISO())}>Hoy</button>
            <button className="btn icono" onClick={() => mover(1)} aria-label="Siguiente"><ChevronRight size={16} /></button>
            <b style={{ color: 'var(--azul-800)' }}>{titulo}</b>
          </>
        ) : (
          <>
            <input className="control" style={{ width: 160 }} type="date" value={f.desde ?? ''} onChange={(e) => setF({ ...f, desde: e.target.value })} aria-label="Desde" />
            <input className="control" style={{ width: 160 }} type="date" value={f.hasta ?? ''} onChange={(e) => setF({ ...f, hasta: e.target.value })} aria-label="Hasta" />
          </>
        )}
        <div className="espacio" />
        <span className="peq suave">{clases.length} clase(s) · {fmtNum(horasProg)} h programadas · {fmtNum(horasEjec)} h ejecutadas</span>
        <BotonesExportar titulo="Horarios" subtitulo={vista === 'lista' ? undefined : titulo} columnas={columnas} filas={clases} />
      </div>
      {vista === 'semana' && (
        <CalendarioSemana lunes={rango.desde} bloques={clases.map((c) => ({
          id: c.id, fecha: c.fecha, inicio: c.hora_inicio, fin: c.hora_fin, titulo: c.asignatura, detalle: `${c.grupo} · ${c.docente}${c.aula ? ' · ' + c.aula : ''}`,
          clase: c.estado, onClick: () => setDetalle(c),
        }))} />
      )}
      {vista === 'mes' && (
        <CalendarioMes mes={ref.slice(0, 7)} maxPorDia={4} onDia={(fecha) => puede('horarios', 'editar') && setNuevo({ fecha, cursillo_id: f.cursilloId || '' })}
          eventos={clases.map((c) => ({ id: c.id, fecha: c.fecha, texto: `${c.hora_inicio} ${c.asignatura} (${c.grupo})`, clase: c.estado.toLowerCase(), onClick: () => setDetalle(c) }))} />
      )}
      {vista === 'lista' && <Tabla filas={clases} columnas={columnas} onFila={setDetalle} vacio="No hay clases con estos filtros." />}
      {nuevo && <FormularioClase inicial={nuevo} onCerrar={() => setNuevo(null)} onGuardado={() => { setNuevo(null); cargar(); }} />}
      {detalle && <DetalleClase clase={detalle} ir={ir} onCerrar={() => setDetalle(null)} onCambio={cargar} />}
    </Pagina>
  );
}
