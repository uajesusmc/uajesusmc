/** Módulo 3: Gestión de docentes (asignaturas, grupos, horario, horas trabajadas y reportes). */
import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Plus, X } from 'lucide-react';
import type { Modulo } from '../../shared/constantes';
import { api, fmtNum, hoyISO, sumarDias } from '../api';
import { CalendarioSemana, lunesDe } from '../components/calendario';
import { CrudPagina } from '../components/crud';
import { Insignia, PanelLateral, Pestanas, Progreso, Tabla, useOpciones } from '../components/ui';
import { useApp } from '../estado';

/** Cambia un campo de un registro existente conservando el resto. */
export async function reasignar(entidad: string, id: number, cambios: Record<string, any>) {
  const r = await api('crud.obtener', { entidad, id });
  return api('crud.guardar', { entidad, datos: { ...r, ...cambios } });
}

function DetalleDocente({ docente, onCerrar }: { docente: any; onCerrar: () => void }) {
  const { intentar, puede } = useApp();
  const [p, setP] = useState<'info' | 'asignaturas' | 'grupos' | 'horario' | 'horas'>('info');
  const [asig, setAsig] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [clases, setClases] = useState<any[]>([]);
  const [horas, setHoras] = useState<any[]>([]);
  const [plan, setPlan] = useState<any[]>([]);
  const [lunes, setLunes] = useState(lunesDe(hoyISO()));
  const [nuevaAsig, setNuevaAsig] = useState<number | ''>('');
  const [nuevoGrupo, setNuevoGrupo] = useState<number | ''>('');
  const opAsig = useOpciones('asignaturas', [asig.length]);
  const opGrupos = useOpciones('grupos', [grupos.length]);
  const editar = puede('docentes', 'editar') && puede('asignaturas', 'editar');

  const cargar = useCallback(() => {
    intentar(() => api('crud.listar', { entidad: 'asignaturas', filtro: { filtros: { docente_id: docente.id } } })).then((r) => r && setAsig(r));
    intentar(() => api('crud.listar', { entidad: 'grupos', filtro: { filtros: { docente_id: docente.id } } })).then((r) => r && setGrupos(r));
    intentar(() => api('horarios.listar', { docenteId: docente.id })).then((r) => r && setClases(r));
    intentar(() => api('horarios.horasDocente', { docenteId: docente.id })).then((r) => r && setHoras(r));
    intentar(() => api('planeacion.resumenGeneral', { docenteId: docente.id })).then((r) => r && setPlan(r));
  }, [docente.id, intentar]);
  useEffect(cargar, [cargar]);

  const exportar = (id: string, formato: 'pdf' | 'xlsx') => intentar(() => api('reportes.exportar', { id, formato, filtros: { docenteId: docente.id } }));
  const totalEjec = horas.reduce((s, h) => s + h.horas_ejecutadas, 0);
  const totalProg = horas.reduce((s, h) => s + h.horas_programadas, 0);

  return (
    <PanelLateral titulo={`${docente.nombres} ${docente.apellidos}`} onCerrar={onCerrar}
      acciones={<>
        <button className="btn chico" onClick={() => exportar('actividades_docente', 'pdf')}><FileText size={14} /> Reporte de actividades</button>
        <button className="btn chico" onClick={() => exportar('actividades_docente', 'xlsx')}><FileSpreadsheet size={14} /></button>
      </>}>
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'info', nombre: 'Información' }, { id: 'asignaturas', nombre: `Asignaturas (${asig.length})` }, { id: 'grupos', nombre: `Grupos (${grupos.length})` },
        { id: 'horario', nombre: 'Horario' }, { id: 'horas', nombre: 'Horas trabajadas' },
      ]} />
      {p === 'info' && (
        <dl className="lista-def">
          <dt>Identificación</dt><dd>{docente.identificacion}</dd><dt>Teléfono</dt><dd>{docente.telefono || '—'}</dd>
          <dt>Correo</dt><dd>{docente.correo || '—'}</dd><dt>Profesión</dt><dd>{docente.profesion || '—'}</dd>
          <dt>Especialidad</dt><dd>{docente.especialidad || '—'}</dd><dt>Disponibilidad</dt><dd style={{ whiteSpace: 'pre-line' }}>{docente.disponibilidad || '—'}</dd>
          <dt>Observaciones</dt><dd style={{ whiteSpace: 'pre-line' }}>{docente.observaciones || '—'}</dd>
          <dt>Horas ejecutadas</dt><dd>{fmtNum(totalEjec)} h (por dictar: {fmtNum(totalProg)} h)</dd>
        </dl>
      )}
      {p === 'asignaturas' && (
        <>
          {editar && (
            <div className="fila mb">
              <select className="control" style={{ flex: 1 }} value={nuevaAsig} onChange={(e) => setNuevaAsig(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Asignar una asignatura…</option>
                {opAsig.filter((o) => o.docente_id !== docente.id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button className="btn primario" disabled={!nuevaAsig} onClick={async () => {
                if (await intentar(() => reasignar('asignaturas', Number(nuevaAsig), { docente_id: docente.id }), 'Asignatura asignada.') !== undefined) { setNuevaAsig(''); cargar(); }
              }}><Plus size={15} /> Asignar</button>
            </div>
          )}
          <Tabla filas={asig} columnas={[
            { key: 'nombre', label: 'Asignatura' }, { key: 'area', label: 'Área' }, { key: 'cursillo', label: 'Cursillo' },
            { key: 'intensidad_horaria', label: 'Horas', num: true },
            { key: 'avance', label: 'Avance planeación', render: (a) => <Progreso valor={plan.find((x) => x.id === a.id)?.avance ?? 0} /> },
          ]} acciones={editar ? (a) => (
            <button className="btn icono fantasma" title="Quitar asignación" onClick={async () => {
              if (await intentar(() => reasignar('asignaturas', a.id, { docente_id: null }), 'Asignación retirada.') !== undefined) cargar();
            }}><X size={15} /></button>
          ) : undefined} vacio="El docente no tiene asignaturas a cargo." />
        </>
      )}
      {p === 'grupos' && (
        <>
          <p className="suave peq">Grupos de los que el docente es director. Los grupos en los que dicta clase se ven en la pestaña Horario.</p>
          {editar && (
            <div className="fila mb">
              <select className="control" style={{ flex: 1 }} value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Asignar como director de grupo…</option>
                {opGrupos.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <button className="btn primario" disabled={!nuevoGrupo} onClick={async () => {
                if (await intentar(() => reasignar('grupos', Number(nuevoGrupo), { docente_id: docente.id }), 'Grupo asignado.') !== undefined) { setNuevoGrupo(''); cargar(); }
              }}><Plus size={15} /> Asignar</button>
            </div>
          )}
          <Tabla filas={grupos} columnas={[{ key: 'nombre', label: 'Grupo' }, { key: 'cursillo', label: 'Cursillo' }, { key: 'jornada', label: 'Jornada' }, { key: 'num_estudiantes', label: 'Estudiantes', num: true }]}
            vacio="No dirige grupos." />
          <h4 className="mt" style={{ marginBottom: 8 }}>Grupos en los que dicta clase</h4>
          <div className="fila">{[...new Set(clases.map((c) => `${c.grupo} – ${c.asignatura}`))].map((g) => <Insignia key={g} valor={g} color="azul" />)}</div>
        </>
      )}
      {p === 'horario' && (
        <>
          <div className="fila mb">
            <button className="btn chico" onClick={() => setLunes(sumarDias(lunes, -7))}>◀ Semana anterior</button>
            <button className="btn chico" onClick={() => setLunes(lunesDe(hoyISO()))}>Esta semana</button>
            <button className="btn chico" onClick={() => setLunes(sumarDias(lunes, 7))}>Semana siguiente ▶</button>
            <div className="espacio" />
            <button className="btn chico" onClick={() => exportar('horarios_docente', 'pdf')}><FileText size={14} /> Horario PDF</button>
          </div>
          <CalendarioSemana lunes={lunes} bloques={clases.map((c) => ({
            id: c.id, fecha: c.fecha, inicio: c.hora_inicio, fin: c.hora_fin, titulo: c.asignatura, detalle: `${c.grupo}${c.aula ? ' · ' + c.aula : ''}`, clase: c.estado,
          }))} />
        </>
      )}
      {p === 'horas' && (
        <Tabla filas={horas.map((h, i) => ({ ...h, id: i }))} columnas={[
          { key: 'mes', label: 'Mes' }, { key: 'cursillo', label: 'Cursillo' }, { key: 'asignatura', label: 'Asignatura' },
          { key: 'clases_ejecutadas', label: 'Clases dictadas', num: true }, { key: 'clases_canceladas', label: 'Canceladas', num: true },
          { key: 'horas_ejecutadas', label: 'Horas trabajadas', num: true }, { key: 'horas_programadas', label: 'Horas por dictar', num: true },
        ]} pie={<tr><td colSpan={5}>Total</td><td className="num">{fmtNum(totalEjec)}</td><td className="num">{fmtNum(totalProg)}</td></tr>}
          vacio="Sin clases registradas." />
      )}
    </PanelLateral>
  );
}

export function Docentes(_: { ir: (m: Modulo, p?: any) => void }) {
  const [detalle, setDetalle] = useState<any>(null);
  return (
    <>
      <CrudPagina entidad="docentes" descripcion="Registro de docentes, asignaturas que orientan, grupos, horarios y horas trabajadas."
        onDetalle={setDetalle} filtros={[{ campo: 'cursillo_id', label: 'Cursillo', ref: 'cursillos' }]} />
      {detalle && <DetalleDocente docente={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}
