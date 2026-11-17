/** Formulario genérico (a partir de shared/modelos) y banner con la foto inaugural. */
import { useState } from 'react';
import { CalendarDays, ImagePlus, MapPin, Save } from 'lucide-react';
import { MODELOS, type NombreModelo } from '../../shared/modelos';
import { api, fmtFecha } from '../api';
import { useApp, type Banner as TipoBanner } from '../estado';
import { Emblema, Modal } from './ui';

export function Formulario({ modelo, registro, onCerrar, onGuardado }: {
  modelo: NombreModelo; registro?: Record<string, any> | null; onCerrar: () => void; onGuardado: (id: number) => void;
}) {
  const m = MODELOS[modelo];
  const { notificar } = useApp();
  const [d, setD] = useState<Record<string, any>>(() => Object.fromEntries(m.campos.map((c) => [c.name, registro?.[c.name] ?? c.default ?? ''])));
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const guardar = async () => {
    const falta = m.campos.find((c) => c.required && !String(d[c.name] ?? '').trim());
    if (falta) { setError(`El campo «${falta.label}» es obligatorio.`); return; }
    setOcupado(true);
    try {
      const id = await api<number>('datos.guardar', { modelo, datos: { ...d, id: registro?.id } });
      notificar(`${m.singular} ${registro?.id ? 'actualizado' : 'registrado'} correctamente.`, 'exito');
      onGuardado(id);
    } catch (e: any) { setError(e.message); } finally { setOcupado(false); }
  };
  return (
    <Modal titulo={`${registro?.id ? 'Editar' : 'Nuevo'} ${m.singular.toLowerCase()}`} onCerrar={onCerrar}
      pie={<><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" disabled={ocupado} onClick={guardar}><Save size={15} /> Guardar</button></>}>
      {error && <div className="alerta error">{error}</div>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        {m.campos.map((c) => (
          <div key={c.name} className={`campo ${c.ancho || c.type === 'textarea' ? 'ancho' : ''}`}>
            <label htmlFor={`f-${c.name}`}>{c.label}{c.required && <span className="req">*</span>}</label>
            {c.type === 'textarea' ? <textarea id={`f-${c.name}`} value={d[c.name]} onChange={(e) => setD({ ...d, [c.name]: e.target.value })} />
              : c.type === 'select' ? (
                <select id={`f-${c.name}`} value={d[c.name]} onChange={(e) => setD({ ...d, [c.name]: e.target.value })}>
                  <option value="">— Seleccione —</option>{c.options!.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : <input id={`f-${c.name}`} type={c.type === 'number' ? 'number' : c.type} min={c.min} max={c.max} maxLength={c.maxLength}
                value={d[c.name]} onChange={(e) => setD({ ...d, [c.name]: e.target.value })} />}
            {c.ayuda && <div className="ayuda">{c.ayuda}</div>}
          </div>
        ))}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Banner principal: la foto inaugural del evento elegido. */
export function Banner({ banner, mini, onCambiar }: { banner: TipoBanner | null; mini?: boolean; onCambiar?: () => void }) {
  const { config, puedeEditar } = useApp();
  return (
    <section className={`banner ${mini ? 'mini' : ''}`} aria-label="Banner de la plataforma">
      {banner && <img className="foto" src={banner.imagen} alt={`Foto inaugural: ${banner.nombre}`} />}
      <div className="velo-banner" />
      <div className="contenido-banner">
        {!banner && <Emblema tam={mini ? 60 : 92} />}
        <div>
          {banner ? <>
            <span className="etiqueta-banner">{banner.tipo.toUpperCase()} {banner.anio}</span>
            <h1>{banner.nombre}</h1>
            <div className="datos-banner fila" style={{ gap: 14 }}>
              <span><CalendarDays size={14} /> {fmtFecha(banner.fecha_inicio)} – {fmtFecha(banner.fecha_fin)}</span>
              {banner.lugar && <span><MapPin size={14} /> {banner.lugar}</span>}
            </div>
          </> : <>
            <span className="etiqueta-banner">MEIF EVENTOS</span>
            <h1>{config.org_nombre || 'MEIF – SABANALARGA'}</h1>
            <div className="datos-banner">{config.org_subtitulo}{!mini && puedeEditar && ' · Agregue la foto inaugural de un evento para mostrarla aquí.'}</div>
          </>}
        </div>
        {onCambiar && puedeEditar && (
          <div className="acciones-banner"><button className="btn" onClick={onCambiar}><ImagePlus size={15} /> Cambiar banner</button></div>
        )}
      </div>
    </section>
  );
}
