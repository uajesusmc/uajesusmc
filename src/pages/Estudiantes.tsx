/** Módulo 5: Gestión de estudiantes, matrículas, importación masiva e historial académico. */
import { useCallback, useEffect, useState } from 'react';
import { Award, BookCheck, Download, FileSpreadsheet, Pencil, Plus, Upload } from 'lucide-react';
import { ESTADOS_MATRICULA, type Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum } from '../api';
import { CrudPagina, FormularioEntidad } from '../components/crud';
import { Insignia, Modal, PanelLateral, Pestanas, Progreso, SelectorOpciones, Tabla, Tarjeta, useOpciones } from '../components/ui';
import { useApp } from '../estado';

function AsignaturasMatricula({ matricula, onCerrar }: { matricula: any; onCerrar: () => void }) {
  const { intentar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => {
    intentar(() => api<any[]>('estudiantes.asignaturas', { matriculaId: matricula.id })).then((r) => {
      if (!r) return;
      setLista(r);
      setSel(new Set(r.filter((a) => a.asignada).map((a) => a.id)));
    });
  }, [matricula.id, intentar]);
  const guardar = async () => {
    if (await intentar(() => api('estudiantes.asignar', { matriculaId: matricula.id, asignaturas: [...sel] }), 'Asignaturas actualizadas.') !== undefined) onCerrar();
  };
  return (
    <Modal tam="chico" titulo={`Asignaturas – ${matricula.cursillo}`} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={guardar}>Guardar</button></>}>
      <p className="suave">Marque las asignaturas que cursa el estudiante en este cursillo.</p>
      <div className="col-flex">
        {lista.map((a) => (
          <label key={a.id} className="check">
            <input type="checkbox" checked={sel.has(a.id)} onChange={() => { const s = new Set(sel); if (s.has(a.id)) s.delete(a.id); else s.add(a.id); setSel(s); }} />
            {a.nombre} <span className="suave peq">({a.area}, {a.intensidad_horaria} h)</span>
          </label>
        ))}
        {!lista.length && <div className="suave">El cursillo no tiene asignaturas.</div>}
      </div>
    </Modal>
  );
}

function DetalleEstudiante({ estudianteId, onCerrar, ir }: { estudianteId: number; onCerrar: () => void; ir: (m: Modulo, p?: any) => void }) {
  const { intentar, puede } = useApp();
  const [p, setP] = useState<'matriculas' | 'asistencia' | 'datos'>('matriculas');
  const [h, setH] = useState<any>(null);
  const [asis, setAsis] = useState<any>(null);
  const [editMat, setEditMat] = useState<any | null | undefined>(undefined);
  const [asigMat, setAsigMat] = useState<any>(null);
  const cargar = useCallback(() => {
    intentar(() => api('estudiantes.historial', { id: estudianteId })).then((r) => r && setH(r));
    if (puede('asistencia')) intentar(() => api('asistencia.estudiante', { estudianteId })).then((r) => r && setAsis(r));
  }, [estudianteId, intentar, puede]);
  useEffect(cargar, [cargar]);
  if (!h) return null;
  const e = h.estudiante;
  return (
    <PanelLateral titulo={`${e.nombres} ${e.apellidos}`} onCerrar={onCerrar}>
      <div className="fila mb"><Insignia valor={`${e.tipo_documento} ${e.identificacion}`} color="azul" />{e.institucion && <Insignia valor={e.institucion} />}{e.grado && <Insignia valor={`Grado ${e.grado}`} />}</div>
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'matriculas', nombre: 'Matrículas e historial académico' }, ...(puede('asistencia') ? [{ id: 'asistencia' as const, nombre: 'Asistencia' }] : []),
        { id: 'datos', nombre: 'Datos personales' },
      ]} />
      {p === 'matriculas' && (
        <>
          {puede('estudiantes', 'editar') && <div className="fila mb"><button className="btn primario" onClick={() => setEditMat(null)}><Plus size={15} /> Matricular en un cursillo</button></div>}
          {!h.matriculas.length && <div className="alerta info">El estudiante no está matriculado en ningún cursillo.</div>}
          {h.matriculas.map((m: any) => (
            <Tarjeta key={m.id} className="mb" titulo={<>{m.cursillo} <Insignia valor={m.estado} /></>}
              acciones={puede('estudiantes', 'editar') && <>
                <button className="btn chico" onClick={() => setAsigMat(m)}><BookCheck size={14} /> Asignaturas</button>
                <button className="btn chico" onClick={() => setEditMat(m)}><Pencil size={14} /> Editar</button>
              </>}>
              <dl className="lista-def">
                <dt>Grupo</dt><dd>{m.grupo ?? 'Sin grupo'}</dd>
                <dt>Inscripción</dt><dd>{fmtFecha(m.fecha_inscripcion)}</dd>
                <dt>Fechas del cursillo</dt><dd>{fmtFecha(m.fecha_inicio)} – {fmtFecha(m.fecha_fin)} <Insignia valor={m.estado_cursillo} /></dd>
                <dt>Asistencia</dt><dd style={{ maxWidth: 260 }}>{m.asistencia.porcentaje == null ? 'Sin clases dictadas' : <Progreso valor={m.asistencia.porcentaje} />}</dd>
                <dt>Horas asistidas</dt><dd>{fmtNum(m.asistencia.horas_asistidas)} h de {fmtNum(m.asistencia.horas_clase)} h dictadas</dd>
                <dt>Certificado</dt><dd>{m.certificado
                  ? <button className="btn chico" onClick={() => intentar(() => api('certificados.ver', { id: m.certificado.id }))}><Award size={14} /> {m.certificado.codigo} ({fmtNum(m.certificado.horas_certificadas)} h)</button>
                  : <span className="suave">No emitido (mínimo {m.asistencia_minima}% de asistencia)</span>}</dd>
              </dl>
              <Tabla filas={m.asistencia.asignaturas.map((a: any) => ({ ...a, id: a.asignatura_id }))} columnas={[
                { key: 'asignatura', label: 'Asignatura' }, { key: 'clases', label: 'Clases', num: true },
                { key: 'horas_asistidas', label: 'Horas asistidas', num: true, render: (a) => fmtNum(a.horas_asistidas) },
                { key: 'porcentaje', label: 'Asistencia', render: (a) => (a.porcentaje == null ? '—' : <Progreso valor={a.porcentaje} />) },
              ]} vacio="Sin asignaturas asignadas." />
            </Tarjeta>
          ))}
        </>
      )}
      {p === 'asistencia' && asis && (
        <>
          <Tabla filas={asis.detalle.map((d: any, i: number) => ({ ...d, id: i }))} porPagina={30} columnas={[
            { key: 'fecha', label: 'Fecha', render: (d) => fmtFecha(d.fecha) }, { key: 'hora_inicio', label: 'Hora' },
            { key: 'asignatura', label: 'Asignatura' }, { key: 'estado', label: 'Estado', render: (d) => <Insignia valor={d.estado} /> },
            { key: 'observacion', label: 'Observación' },
          ]} vacio="Sin registros de asistencia." />
          <button className="btn mt" onClick={() => ir('reportes', { id: 'asistencia_detalle', filtros: { estudianteId } })}>Reporte de asistencia</button>
        </>
      )}
      {p === 'datos' && (
        <dl className="lista-def">
          <dt>Documento</dt><dd>{e.tipo_documento} {e.identificacion}</dd><dt>Fecha de nacimiento</dt><dd>{fmtFecha(e.fecha_nacimiento) || '—'}</dd>
          <dt>Institución</dt><dd>{e.institucion || '—'}</dd><dt>Grado</dt><dd>{e.grado || '—'}</dd>
          <dt>Teléfono</dt><dd>{e.telefono || '—'}</dd><dt>Correo</dt><dd>{e.correo || '—'}</dd><dt>Dirección</dt><dd>{e.direccion || '—'}</dd>
          <dt>Acudiente</dt><dd>{e.acudiente || '—'} {e.telefono_acudiente && `(${e.telefono_acudiente})`}</dd>
          <dt>Registrado</dt><dd>{e.creado_en}</dd>
        </dl>
      )}
      {editMat !== undefined && (
        <FormularioEntidad entidad="matriculas" registro={editMat} valores={{ estudiante_id: estudianteId }}
          onCerrar={() => setEditMat(undefined)} onGuardado={() => { setEditMat(undefined); cargar(); }} />
      )}
      {asigMat && <AsignaturasMatricula matricula={asigMat} onCerrar={() => { setAsigMat(null); cargar(); }} />}
    </PanelLateral>
  );
}

function Importar({ onCerrar }: { onCerrar: () => void }) {
  const { intentar, notificar } = useApp();
  const cursillos = useOpciones('cursillos');
  const grupos = useOpciones('grupos');
  const [cursilloId, setCursilloId] = useState<number | ''>('');
  const [grupoId, setGrupoId] = useState<number | ''>('');
  const [archivo, setArchivo] = useState<string | null>(null);
  const [vista, setVista] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const previsualizar = async (a = archivo) => {
    if (!a) return;
    setOcupado(true);
    const r = await intentar(() => api('estudiantes.importar', { archivo: a, cursilloId: cursilloId || null, grupoId: grupoId || null, simular: true }));
    setOcupado(false);
    if (r) setVista(r);
  };
  const elegir = async () => {
    const a = await intentar(() => api<string | null>('estudiantes.elegirExcel'));
    if (a) { setArchivo(a); previsualizar(a); }
  };
  const importar = async () => {
    setOcupado(true);
    const r = await intentar(() => api('estudiantes.importar', { archivo, cursilloId: cursilloId || null, grupoId: grupoId || null, simular: false }));
    setOcupado(false);
    if (r) { notificar(`Importación terminada: ${r.creados} estudiante(s) nuevos, ${r.matriculados} matrícula(s), ${r.errores} fila(s) con error.`, 'exito'); onCerrar(); }
  };
  return (
    <Modal tam="grande" titulo="Importación masiva desde Excel" icono={<FileSpreadsheet size={20} />} onCerrar={onCerrar}
      pie={<>
        <button className="btn" onClick={() => intentar(() => api('estudiantes.plantilla'))}><Download size={15} /> Descargar plantilla</button>
        <div className="espacio" />
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario" disabled={!vista || ocupado || vista.filas.every((f: any) => f.estado === 'error')} onClick={importar}>
          <Upload size={15} /> Importar {vista ? `${vista.filas.filter((f: any) => f.estado !== 'error').length} fila(s)` : ''}
        </button>
      </>}>
      <div className="alerta info">Use la plantilla: columnas obligatorias <b>Identificación, Nombres y Apellidos</b>. Los estudiantes ya registrados no se duplican.
        Opcionalmente, matricúlelos en un cursillo y grupo.</div>
      <div className="form mb">
        <SelectorOpciones label="Matricular en el cursillo (opcional)" valor={cursilloId} onCambio={(v) => { setCursilloId(v); setGrupoId(''); setVista(null); }} opciones={cursillos.filter((c) => c.estado === 'Activo')} todos="— No matricular —" />
        <SelectorOpciones label="Grupo (opcional)" valor={grupoId} onCambio={(v) => { setGrupoId(v); setVista(null); }} opciones={grupos.filter((g) => g.cursillo_id === cursilloId)} todos="— Sin grupo —" deshabilitado={!cursilloId} />
      </div>
      <div className="zona-archivo" onClick={elegir} role="button">
        <Upload size={26} color="var(--azul-600)" />
        <div className="negrita">{archivo ? archivo.split(/[\\/]/).pop() : 'Seleccionar archivo de Excel (.xlsx)'}</div>
        <div className="peq suave">Haga clic para elegir el archivo</div>
      </div>
      {archivo && !vista && <button className="btn mt" onClick={() => previsualizar()} disabled={ocupado}>Validar</button>}
      {vista && (
        <div className="mt">
          <div className="fila mb">
            <Insignia valor={`${vista.filas.filter((f: any) => f.estado === 'nuevo').length} nuevos`} color="verde" />
            <Insignia valor={`${vista.filas.filter((f: any) => f.estado === 'existente').length} ya registrados`} color="azul" />
            <Insignia valor={`${vista.errores} con error`} color="rojo" />
          </div>
          <Tabla filas={vista.filas.map((f: any) => ({ ...f, id: f.fila }))} porPagina={100} columnas={[
            { key: 'fila', label: 'Fila', num: true }, { key: 'ident', label: 'Identificación', render: (f) => f.datos.identificacion },
            { key: 'nombre', label: 'Nombre', render: (f) => `${f.datos.nombres ?? ''} ${f.datos.apellidos ?? ''}` },
            { key: 'estado', label: 'Resultado', render: (f) => <Insignia valor={f.estado === 'nuevo' ? 'Nuevo' : f.estado === 'existente' ? 'Ya registrado' : 'Error'} color={f.estado === 'nuevo' ? 'verde' : f.estado === 'existente' ? 'azul' : 'rojo'} /> },
            { key: 'mensaje', label: 'Detalle' },
          ]} />
        </div>
      )}
    </Modal>
  );
}

export function Estudiantes({ ir, parametros }: { ir: (m: Modulo, p?: any) => void; parametros?: any }) {
  const { puede } = useApp();
  const [detalle, setDetalle] = useState<number | null>(null);
  const [importar, setImportar] = useState(false);
  const [recarga, setRecarga] = useState(0);
  return (
    <>
      <CrudPagina entidad="estudiantes" recarga={recarga}
        descripcion="Inscripción, matrícula, importación desde Excel, historial académico y asistencia de los estudiantes."
        filtrosFijos={parametros?.cursilloId ? { cursillo_id: parametros.cursilloId } : undefined}
        filtros={[
          { campo: 'cursillo_id', label: 'Cursillo', ref: 'cursillos' }, { campo: 'grupo_id', label: 'Grupo', ref: 'grupos' },
          { campo: 'estado_matricula', label: 'Estado de matrícula', opciones: ESTADOS_MATRICULA },
        ]}
        onDetalle={(f) => setDetalle(f.id)}
        botones={puede('estudiantes', 'editar') && <>
          <button className="btn" onClick={() => setImportar(true)}><FileSpreadsheet size={16} /> Importar desde Excel</button>
        </>} />
      {detalle && <DetalleEstudiante estudianteId={detalle} ir={ir} onCerrar={() => { setDetalle(null); setRecarga((r) => r + 1); }} />}
      {importar && <Importar onCerrar={() => { setImportar(false); setRecarga((r) => r + 1); }} />}
    </>
  );
}
