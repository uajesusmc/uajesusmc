/** Módulo 2: Periodos académicos y cursillos (con historial). */
import { useEffect, useState } from 'react';
import { CalendarRange, History, Layers } from 'lucide-react';
import { ESTADOS_CURSILLO, type Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum } from '../api';
import { CrudPagina } from '../components/crud';
import { Insignia, PanelLateral, Pestanas, Progreso, Tabla, Tarjeta } from '../components/ui';
import { useApp } from '../estado';

function DetalleCursillo({ cursillo, onCerrar, ir }: { cursillo: any; onCerrar: () => void; ir: (m: Modulo, p?: any) => void }) {
  const { intentar } = useApp();
  const [asig, setAsig] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [plan, setPlan] = useState<any[]>([]);
  useEffect(() => {
    intentar(() => api('crud.listar', { entidad: 'asignaturas', filtro: { filtros: { cursillo_id: cursillo.id } } })).then((r) => r && setAsig(r));
    intentar(() => api('crud.listar', { entidad: 'grupos', filtro: { filtros: { cursillo_id: cursillo.id } } })).then((r) => r && setGrupos(r));
    intentar(() => api('planeacion.resumenGeneral', { cursilloId: cursillo.id })).then((r) => r && setPlan(r));
  }, [cursillo.id, intentar]);
  const prog = plan.reduce((s, p) => s + p.programadas, 0);
  const ejec = plan.reduce((s, p) => s + p.ejecutadas, 0);
  return (
    <PanelLateral titulo={cursillo.nombre} onCerrar={onCerrar}>
      <dl className="lista-def mb">
        <dt>Código</dt><dd>{cursillo.codigo}</dd>
        <dt>Periodo</dt><dd>{cursillo.periodo}</dd>
        <dt>Fechas</dt><dd>{fmtFecha(cursillo.fecha_inicio)} – {fmtFecha(cursillo.fecha_fin)}</dd>
        <dt>Modalidad</dt><dd>{cursillo.modalidad}</dd>
        <dt>Estado</dt><dd><Insignia valor={cursillo.estado} /></dd>
        <dt>Asistencia mínima</dt><dd>{cursillo.asistencia_minima}%</dd>
        <dt>Estudiantes</dt><dd>{cursillo.num_estudiantes}</dd>
        <dt>Avance de la planeación</dt><dd style={{ maxWidth: 260 }}><Progreso valor={prog ? (ejec / prog) * 100 : 0} /></dd>
        {cursillo.descripcion && <><dt>Descripción</dt><dd>{cursillo.descripcion}</dd></>}
      </dl>
      <div className="fila mb">
        <button className="btn" onClick={() => ir('horarios', { cursilloId: cursillo.id })}>Horarios</button>
        <button className="btn" onClick={() => ir('estudiantes', { cursilloId: cursillo.id })}>Estudiantes</button>
        <button className="btn" onClick={() => ir('certificados', { cursilloId: cursillo.id })}>Certificados</button>
        <button className="btn" onClick={() => ir('reportes', { id: 'estudiantes_cursillo', filtros: { cursilloId: cursillo.id } })}>Listado</button>
      </div>
      <Tarjeta titulo={`Asignaturas (${asig.length})`} cuerpo={false} className="mb">
        <Tabla filas={asig} columnas={[
          { key: 'nombre', label: 'Asignatura' }, { key: 'area', label: 'Área' }, { key: 'docente', label: 'Docente' },
          { key: 'intensidad_horaria', label: 'Horas', num: true },
          { key: 'avance', label: 'Avance', render: (a) => <Progreso valor={plan.find((p) => p.id === a.id)?.avance ?? 0} /> },
        ]} vacio="Sin asignaturas: créelas en el módulo Asignaturas." />
      </Tarjeta>
      <Tarjeta titulo={`Grupos (${grupos.length})`} cuerpo={false}>
        <Tabla filas={grupos} columnas={[
          { key: 'nombre', label: 'Grupo' }, { key: 'jornada', label: 'Jornada' }, { key: 'aula', label: 'Aula' },
          { key: 'director', label: 'Director' }, { key: 'num_estudiantes', label: 'Estudiantes', num: true },
        ]} vacio="Sin grupos: créelos en el módulo Grupos." />
      </Tarjeta>
    </PanelLateral>
  );
}

export function Cursillos({ ir }: { ir: (m: Modulo, p?: any) => void }) {
  const [pestana, setPestana] = useState<'cursillos' | 'historial' | 'periodos'>('cursillos');
  const [detalle, setDetalle] = useState<any>(null);
  const columnasExtra = { asistencia_minima: {}, num_estudiantes: { render: (f: any) => fmtNum(f.num_estudiantes, 0) } };
  return (
    <>
      <div className="pagina-cab"><div><h1>Periodos y cursillos</h1>
        <p>Cree convocatorias (Cursillo 2027, Preparación Saber 11°, convocatorias especiales…) y consulte el historial.</p></div></div>
      <Pestanas valor={pestana} onCambio={setPestana} opciones={[
        { id: 'cursillos', nombre: 'Cursillos', icono: <CalendarRange size={16} /> },
        { id: 'historial', nombre: 'Historial (finalizados)', icono: <History size={16} /> },
        { id: 'periodos', nombre: 'Periodos académicos', icono: <Layers size={16} /> },
      ]} />
      {pestana === 'cursillos' && (
        <CrudPagina sinPagina entidad="cursillos" onDetalle={setDetalle} columnasExtra={columnasExtra}
          filtros={[{ campo: 'estado', label: 'Estado', opciones: ESTADOS_CURSILLO }, { campo: 'periodo_id', label: 'Periodo', ref: 'periodos' }]} />
      )}
      {pestana === 'historial' && (
        <CrudPagina sinPagina entidad="cursillos" titulo="Historial de cursillos" onDetalle={setDetalle} filtrosFijos={{ estado: 'Finalizado' }}
          filtros={[{ campo: 'periodo_id', label: 'Periodo', ref: 'periodos' }]} />
      )}
      {pestana === 'periodos' && <CrudPagina sinPagina entidad="periodos" />}
      {detalle && <DetalleCursillo cursillo={detalle} onCerrar={() => setDetalle(null)} ir={ir} />}
    </>
  );
}
