/** Inicio: banner con la foto inaugural, indicadores del año y próximos eventos. */
import { useEffect, useState } from 'react';
import { Award, CalendarCheck, CalendarHeart, CheckCircle2, ImagePlus, Mic2, Plus, Users } from 'lucide-react';
import type { Ir } from '../App';
import { api, fmtFecha } from '../api';
import { Banner } from '../components/comunes';
import { Insignia, Kpi, Modal, Tarjeta, Vacio } from '../components/ui';
import { useApp } from '../estado';

/** Diálogo para cambiar el banner: elegir evento y subir (o reutilizar) su foto inaugural. */
export function CambiarBanner({ onCerrar }: { onCerrar: () => void }) {
  const { intentar, recargarBanner, banner } = useApp();
  const [eventos, setEventos] = useState<any[]>([]);
  const [sel, setSel] = useState<number | ''>(banner?.id ?? '');
  useEffect(() => { intentar(() => api('datos.listar', { modelo: 'eventos', filtro: {} })).then((r) => r && setEventos(r)); }, [intentar]);
  const ev = eventos.find((e) => e.id === sel);
  const subir = async () => {
    if (!sel) return;
    if (await intentar(() => api('banner.cambiarFoto', { eventoId: sel }))) { await recargarBanner(); onCerrar(); }
  };
  const usar = async () => {
    if (await intentar(() => api('banner.fijar', { eventoId: sel }), 'Banner actualizado.') !== undefined) { await recargarBanner(); onCerrar(); }
  };
  return (
    <Modal tam="chico" titulo="Cambiar banner de la plataforma" icono={<ImagePlus size={20} />} onCerrar={onCerrar}
      pie={<>
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        {ev?.tiene_foto ? <button className="btn" onClick={usar}>Usar su foto actual</button> : null}
        <button className="btn primario" disabled={!sel} onClick={subir}><ImagePlus size={15} /> {ev?.tiene_foto ? 'Subir otra foto' : 'Subir foto inaugural'}</button>
      </>}>
      <p className="suave" style={{ marginTop: 0 }}>Elija el evento y cargue la foto de su inauguración (JPG o PNG). Se mostrará como banner en la pantalla de inicio.</p>
      {eventos.length ? (
        <div className="campo"><label htmlFor="b-evento">Evento</label>
          <select id="b-evento" value={sel} onChange={(e) => setSel(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— Seleccione el evento —</option>
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.anio} · {e.nombre}{e.tiene_foto ? ' 📷' : ''}</option>)}
          </select></div>
      ) : <div className="alerta info">Primero cree un evento en «Eventos del año».</div>}
    </Modal>
  );
}

export function Inicio({ ir }: { ir: Ir }) {
  const { intentar, banner, puedeEditar, sesion } = useApp();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [anios, setAnios] = useState<number[]>([]);
  const [p, setP] = useState<any>(null);
  const [cambiar, setCambiar] = useState(false);
  useEffect(() => { intentar(() => api('panel', { anio })).then((r) => r && setP(r)); }, [anio, intentar]);
  useEffect(() => { intentar(() => api<number[]>('datos.anios')).then((r) => r && setAnios(r)); }, [intentar]);
  const opcionesAnio = [...new Set([new Date().getFullYear(), new Date().getFullYear() + 1, ...anios])].sort((a, b) => b - a);
  return (
    <>
      <Banner banner={banner} onCambiar={() => setCambiar(true)} />
      <div className="fila mb">
        <h2 style={{ fontSize: 19 }}>Hola, {sesion?.nombre.split(' ')[0]}. Eventos del año</h2>
        <select className="control" style={{ width: 110 }} value={anio} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año">
          {opcionesAnio.map((a) => <option key={a}>{a}</option>)}
        </select>
        <div className="espacio" />
        {puedeEditar && <button className="btn primario" onClick={() => ir('eventos', { nuevo: true })}><Plus size={16} /> Nuevo evento</button>}
      </div>
      {p && (
        <>
          <div className="rejilla k4 mb">
            <Kpi icono={<CalendarHeart />} valor={p.kpis.eventos} etiqueta={`Eventos ${anio}`} />
            <Kpi icono={<CheckCircle2 />} valor={p.kpis.realizados} etiqueta="Eventos realizados" />
            <Kpi icono={<CalendarCheck />} valor={p.kpis.proximos} etiqueta="Próximos eventos" />
            <Kpi icono={<Users />} valor={p.kpis.participantes} etiqueta="Participantes inscritos" />
            <Kpi icono={<Mic2 />} valor={p.kpis.ponentes} etiqueta="Ponentes" />
            <Kpi icono={<Award />} valor={p.kpis.certificados} etiqueta="Certificados emitidos" />
          </div>
          <div className="rejilla c2">
            <Tarjeta titulo={`Calendario de eventos ${anio}`} cuerpo={false}>
              {p.eventos.length ? (
                <table className="tabla"><tbody>
                  {p.eventos.map((e: any) => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => ir('eventos', { eventoId: e.id })}>
                      <td style={{ width: 120 }}><b>{fmtFecha(e.fecha_inicio)}</b>{e.fecha_fin !== e.fecha_inicio && <div className="peq suave">al {fmtFecha(e.fecha_fin)}</div>}</td>
                      <td><b>{e.nombre}</b><div className="peq suave">{e.tipo}{e.lugar ? ` · ${e.lugar}` : ''} · {e.inscritos} inscritos</div></td>
                      <td style={{ width: 100 }}><Insignia valor={e.estado} /></td>
                    </tr>
                  ))}
                </tbody></table>
              ) : <Vacio texto={`No hay eventos registrados en ${anio}.`} icono={<CalendarHeart size={36} />} />}
            </Tarjeta>
            <Tarjeta titulo="Próximas actividades" cuerpo={false}>
              {p.proximasActividades.length ? (
                <table className="tabla"><tbody>
                  {p.proximasActividades.map((a: any) => (
                    <tr key={a.id}><td style={{ width: 100 }}><b>{fmtFecha(a.fecha)}</b><div className="peq suave">{a.hora_inicio}–{a.hora_fin}</div></td>
                      <td><b>{a.titulo}</b><div className="peq suave">{a.evento}{a.lugar ? ` · ${a.lugar}` : ''}</div></td></tr>
                  ))}
                </tbody></table>
              ) : <Vacio texto="No hay actividades próximas en la agenda." />}
            </Tarjeta>
          </div>
        </>
      )}
      {cambiar && <CambiarBanner onCerrar={() => setCambiar(false)} />}
    </>
  );
}
