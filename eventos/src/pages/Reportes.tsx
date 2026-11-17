/** Reportes en PDF y Excel por evento o por año. */
import { useEffect, useState } from 'react';
import { Eye, FileBarChart, FileSpreadsheet, FileText } from 'lucide-react';
import { api, fmtNum } from '../api';
import { Pagina, Tabla, Tarjeta, Vacio } from '../components/ui';
import { useApp } from '../estado';

export function Reportes() {
  const { intentar } = useApp();
  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [eventos, setEventos] = useState<any[]>([]);
  const [id, setId] = useState('eventos');
  const [eventoId, setEventoId] = useState<number | ''>('');
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [vista, setVista] = useState<any>(null);
  useEffect(() => {
    intentar(() => api('reportes.catalogo')).then((r) => r && setCatalogo(r));
    api('datos.listar', { modelo: 'eventos' }).then(setEventos).catch(() => undefined);
  }, [intentar]);
  useEffect(() => setVista(null), [id, eventoId, anio]);
  const def = catalogo.find((r) => r.id === id);
  const filtros = def?.filtro === 'anio' ? { anio } : { eventoId: eventoId || null };
  const falta = def?.filtro === 'evento' && !eventoId && !['certificados', 'ponentes'].includes(id);
  return (
    <Pagina titulo="Reportes" descripcion="Listados de inscritos, agenda, asistencia, certificados, ponentes y eventos del año en PDF o Excel.">
      <div className="rejilla" style={{ gridTemplateColumns: 'minmax(230px, 280px) minmax(0, 1fr)' }}>
        <Tarjeta titulo="Reportes" cuerpo={false}>
          <nav style={{ padding: 8 }}>{catalogo.map((r) => (
            <button key={r.id} className={`btn ${r.id === id ? 'primario' : 'fantasma'}`} style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }} onClick={() => setId(r.id)}>
              <FileBarChart size={15} /> {r.nombre}</button>
          ))}</nav>
        </Tarjeta>
        <div className="col-flex">
          <Tarjeta titulo={def?.nombre}>
            <div className="fila">
              {def?.filtro === 'anio' ? (
                <div className="campo"><label htmlFor="r-anio">Año</label><input id="r-anio" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 120 }} /></div>
              ) : (
                <div className="campo" style={{ minWidth: 340 }}><label htmlFor="r-ev">Evento</label>
                  <select id="r-ev" value={eventoId} onChange={(e) => setEventoId(e.target.value ? Number(e.target.value) : '')}>
                    <option value="">{['certificados', 'ponentes'].includes(id) ? 'Todos los eventos' : '— Seleccione el evento —'}</option>
                    {eventos.map((e) => <option key={e.id} value={e.id}>{e.anio} · {e.nombre}</option>)}</select></div>
              )}
            </div>
            <div className="fila mt">
              <button className="btn" disabled={falta} onClick={() => intentar(() => api('reportes.vista', { id, filtros })).then((r) => r && setVista(r))}><Eye size={15} /> Vista previa</button>
              <button className="btn primario" disabled={falta} onClick={() => intentar(() => api('reportes.exportar', { id, formato: 'pdf', filtros }))}><FileText size={15} /> PDF</button>
              <button className="btn dorado" disabled={falta} onClick={() => intentar(() => api('reportes.exportar', { id, formato: 'xlsx', filtros }))}><FileSpreadsheet size={15} /> Excel</button>
            </div>
          </Tarjeta>
          {vista ? (
            <Tarjeta titulo={`${vista.titulo} · ${vista.filas.length} registro(s)`} cuerpo={false}>
              <Tabla filas={vista.filas.map((f: any, i: number) => ({ ...f, __i: i }))} claveFila="__i" porPagina={100}
                columnas={vista.columnas.map((c: any) => ({ key: c.key, label: c.label, num: c.align === 'right', render: (f: any) => (typeof f[c.key] === 'number' ? fmtNum(f[c.key], 2) : f[c.key]) }))} />
            </Tarjeta>
          ) : <Vacio texto="Use «Vista previa» para ver el reporte antes de exportarlo." icono={<FileBarChart size={36} />} />}
        </div>
      </div>
    </Pagina>
  );
}
