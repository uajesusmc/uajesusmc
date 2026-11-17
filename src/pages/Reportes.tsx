/** Módulo 11: Reportes y estadísticas en PDF y Excel con filtros. */
import { useEffect, useState } from 'react';
import { Eye, FileBarChart, FileSpreadsheet, FileText } from 'lucide-react';
import type { Modulo } from '../../shared/constantes';
import { api, fmtNum } from '../api';
import { CampoTexto, Pagina, SelectorOpciones, Tabla, Tarjeta, Vacio, useOpciones } from '../components/ui';
import { useApp } from '../estado';

const ETIQUETAS: Record<string, string> = {
  cursilloId: 'Cursillo', docenteId: 'Docente', asignaturaId: 'Asignatura', grupoId: 'Grupo', estudianteId: 'Estudiante', desde: 'Desde', hasta: 'Hasta',
};

export function Reportes({ parametros }: { ir: (m: Modulo, p?: any) => void; parametros?: any }) {
  const { intentar } = useApp();
  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [id, setId] = useState<string>(parametros?.id ?? '');
  const [filtros, setFiltros] = useState<Record<string, any>>(parametros?.filtros ?? {});
  const [vista, setVista] = useState<any>(null);
  const opciones: Record<string, any[]> = {
    cursilloId: useOpciones('cursillos'), docenteId: useOpciones('docentes'), asignaturaId: useOpciones('asignaturas'),
    grupoId: useOpciones('grupos'), estudianteId: useOpciones('estudiantes'),
  };
  useEffect(() => { intentar(() => api('reportes.catalogo')).then((r) => { if (r) { setCatalogo(r); if (!id && r[0]) setId(r[0].id); } }); }, [intentar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVista(null); }, [id, filtros]);
  const def = catalogo.find((r) => r.id === id);
  const limpiar = (f: Record<string, any>) => Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== '' && v != null && def?.filtros.includes(k)));
  const faltan = def?.obligatorios.filter((o: string) => !filtros[o]) ?? [];
  const previsualizar = () => intentar(() => api('reportes.vista', { id, filtros: limpiar(filtros) })).then((r) => r && setVista(r));
  const exportar = (formato: 'pdf' | 'xlsx') => intentar(() => api('reportes.exportar', { id, formato, filtros: limpiar(filtros) }));
  const filtrarOpciones = (k: string) => {
    const o = opciones[k];
    if (filtros.cursilloId && (k === 'grupoId' || k === 'asignaturaId')) return o.filter((x) => x.cursillo_id === filtros.cursilloId);
    return o;
  };

  return (
    <Pagina titulo="Reportes y estadísticas" descripcion="Genere reportes en PDF y Excel filtrando por fechas, cursillo, docente, asignatura, grupo y estudiante.">
      <div className="rejilla" style={{ gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)' }}>
        <Tarjeta titulo="Reportes disponibles" cuerpo={false}>
          <nav style={{ padding: 8 }}>
            {catalogo.map((r) => (
              <button key={r.id} className={`btn ${r.id === id ? 'primario' : 'fantasma'}`} onClick={() => setId(r.id)}
                style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4, whiteSpace: 'normal', textAlign: 'left' }}>
                <FileBarChart size={15} style={{ flexShrink: 0 }} /> {r.nombre}
              </button>
            ))}
          </nav>
        </Tarjeta>
        <div className="col-flex">
          {def && (
            <Tarjeta titulo={def.nombre}>
              <p className="suave" style={{ marginTop: 0 }}>{def.descripcion}</p>
              <div className="form">
                {def.filtros.map((k: string) => (k === 'desde' || k === 'hasta'
                  ? <CampoTexto key={k} label={ETIQUETAS[k]} tipo="date" valor={filtros[k] ?? ''} onCambio={(v) => setFiltros({ ...filtros, [k]: v })} />
                  : <SelectorOpciones key={k} label={ETIQUETAS[k]} requerido={def.obligatorios.includes(k)} valor={filtros[k] ?? ''}
                    onCambio={(v) => setFiltros({ ...filtros, [k]: v, ...(k === 'cursilloId' ? { grupoId: '', asignaturaId: '' } : {}) })}
                    opciones={filtrarOpciones(k)} todos={def.obligatorios.includes(k) ? '— Seleccione —' : 'Todos'} />))}
              </div>
              <div className="fila mt">
                <button className="btn" disabled={faltan.length > 0} onClick={previsualizar}><Eye size={15} /> Vista previa</button>
                <button className="btn primario" disabled={faltan.length > 0} onClick={() => exportar('pdf')}><FileText size={15} /> Exportar PDF</button>
                <button className="btn dorado" disabled={faltan.length > 0} onClick={() => exportar('xlsx')}><FileSpreadsheet size={15} /> Exportar Excel</button>
                {faltan.length > 0 && <span className="peq suave">Complete: {faltan.map((f: string) => ETIQUETAS[f]).join(', ')}</span>}
              </div>
            </Tarjeta>
          )}
          {vista ? (
            <Tarjeta titulo={<>{vista.titulo} <span className="suave peq">· {vista.filas.length} registro(s)</span></>} cuerpo={false}>
              <div className="peq suave" style={{ padding: '8px 16px' }}>{vista.subtitulo}</div>
              <Tabla filas={vista.filas.map((f: any, i: number) => ({ ...f, __id: i }))} claveFila="__id" porPagina={100}
                columnas={vista.columnas.map((c: any) => ({ key: c.key, label: c.label, num: c.align === 'right', render: (f: any) => (typeof f[c.key] === 'number' ? fmtNum(f[c.key], 2) : f[c.key]) }))}
                pie={vista.totales && <tr>{vista.columnas.map((c: any) => <td key={c.key} className={c.align === 'right' ? 'num' : ''}>{typeof vista.totales[c.key] === 'number' ? fmtNum(vista.totales[c.key], 2) : vista.totales[c.key] ?? ''}</td>)}</tr>} />
            </Tarjeta>
          ) : <Vacio texto="Use «Vista previa» para consultar el reporte en pantalla antes de exportarlo." icono={<FileBarChart size={36} />} />}
        </div>
      </div>
    </Pagina>
  );
}
