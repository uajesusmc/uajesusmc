/** Grupos de cada cursillo, con su listado de estudiantes y horario. */
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { Modulo } from '../../shared/constantes';
import { api, hoyISO, sumarDias } from '../api';
import { CalendarioSemana, lunesDe } from '../components/calendario';
import { CrudPagina } from '../components/crud';
import { BotonesExportar, Insignia, PanelLateral, Pestanas, Tabla } from '../components/ui';
import { useApp } from '../estado';

function DetalleGrupo({ grupo, onCerrar }: { grupo: any; onCerrar: () => void }) {
  const { intentar } = useApp();
  const [p, setP] = useState<'estudiantes' | 'horario'>('estudiantes');
  const [est, setEst] = useState<any[]>([]);
  const [clases, setClases] = useState<any[]>([]);
  const [lunes, setLunes] = useState(lunesDe(hoyISO()));
  useEffect(() => {
    intentar(() => api('crud.listar', { entidad: 'matriculas', filtro: { filtros: { grupo_id: grupo.id } } })).then((r) => r && setEst(r));
    intentar(() => api('horarios.listar', { grupoId: grupo.id })).then((r) => {
      if (!r) return;
      setClases(r);
      const prox = r.find((c: any) => c.fecha >= hoyISO()) ?? r[r.length - 1];
      if (prox) setLunes(lunesDe(prox.fecha));
    });
  }, [grupo.id, intentar]);
  const cols = [
    { key: 'identificacion', label: 'Identificación' }, { key: 'estudiante', label: 'Estudiante' },
    { key: 'estado', label: 'Estado', render: (f: any) => <Insignia valor={f.estado} />, valor: (f: any) => f.estado },
  ];
  return (
    <PanelLateral titulo={`${grupo.nombre} – ${grupo.cursillo}`} onCerrar={onCerrar}
      acciones={<button className="btn chico" onClick={() => intentar(() => api('reportes.exportar', { id: 'horarios_grupo', formato: 'pdf', filtros: { grupoId: grupo.id } }))}><FileText size={14} /> Horario PDF</button>}>
      <Pestanas valor={p} onCambio={setP} opciones={[{ id: 'estudiantes', nombre: `Estudiantes (${est.length})` }, { id: 'horario', nombre: 'Horario semanal' }]} />
      {p === 'estudiantes' && (
        <>
          <div className="fila mb"><div className="espacio" /><BotonesExportar titulo={`Estudiantes del grupo ${grupo.nombre}`} subtitulo={grupo.cursillo} columnas={cols} filas={est} /></div>
          <Tabla filas={est} columnas={cols} vacio="El grupo no tiene estudiantes. Asígnelos desde Estudiantes › Matrículas." />
        </>
      )}
      {p === 'horario' && (
        <>
          <div className="fila mb">
            <button className="btn chico" onClick={() => setLunes(sumarDias(lunes, -7))}>◀</button>
            <b>Semana del {lunes.split('-').reverse().join('/')}</b>
            <button className="btn chico" onClick={() => setLunes(sumarDias(lunes, 7))}>▶</button>
          </div>
          <CalendarioSemana lunes={lunes} bloques={clases.map((c) => ({ id: c.id, fecha: c.fecha, inicio: c.hora_inicio, fin: c.hora_fin, titulo: c.asignatura, detalle: c.docente, clase: c.estado }))} />
        </>
      )}
    </PanelLateral>
  );
}

export function Grupos(_: { ir: (m: Modulo, p?: any) => void }) {
  const [detalle, setDetalle] = useState<any>(null);
  return (
    <>
      <CrudPagina entidad="grupos" descripcion="Grupos de estudiantes por cursillo, con jornada, aula, cupo y director de grupo."
        filtros={[{ campo: 'cursillo_id', label: 'Cursillo', ref: 'cursillos' }]} onDetalle={setDetalle} />
      {detalle && <DetalleGrupo grupo={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}
