/** Gestión de las firmas del Presidente y del Secretario (cada uno gestiona la suya). */
import { useCallback, useEffect, useState } from 'react';
import { PenLine, Save, Trash2, Upload } from 'lucide-react';
import { api, fmtFechaHora } from '../api';
import { useApp } from '../estado';
import { CampoTexto, Insignia, Modal, Tarjeta } from './ui';

function TarjetaFirma({ f, onCambio }: { f: any; onCambio: () => void }) {
  const { intentar, confirmar } = useApp();
  const [d, setD] = useState({ nombre: f.nombre, cargo: f.cargo });
  useEffect(() => setD({ nombre: f.nombre, cargo: f.cargo }), [f.nombre, f.cargo]);
  return (
    <Tarjeta titulo={<>Firma del {f.titulo.toLowerCase()} {f.imagen ? <Insignia valor="Cargada" color="verde" /> : <Insignia valor="Sin firma" color="naranja" />}</>}>
      <div className="firma-vista mb">{f.imagen ? <img src={f.imagen} alt={`Firma del ${f.titulo}`} /> : <span className="suave peq">Aún no se ha cargado la firma</span>}</div>
      <div className="peq suave mb">
        {f.usuario ? <>Usuario que la gestiona: <b>{f.usuario.nombre}</b> ({f.usuario.usuario})</> : 'Ningún usuario vinculado: un administrador puede vincularlo en Usuarios › «Firma como».'}
        {f.actualizada_en && <><br />Última actualización: {fmtFechaHora(f.actualizada_en.replace('T', ' '))} por {f.actualizada_por}</>}
      </div>
      {f.puedeEditar ? (
        <>
          <div className="form">
            <CampoTexto label="Nombre como aparece en los documentos" requerido valor={d.nombre} onCambio={(v) => setD({ ...d, nombre: v })} />
            <CampoTexto label="Cargo" valor={d.cargo} onCambio={(v) => setD({ ...d, cargo: v })} />
          </div>
          <div className="fila mt">
            <button className="btn" onClick={async () => { if (await intentar(() => api('firmas.datos', { firmante: f.firmante, ...d }), 'Datos de firma guardados.') !== undefined) onCambio(); }}><Save size={15} /> Guardar nombre y cargo</button>
            <div className="espacio" />
            <button className="btn primario" onClick={async () => { if (await intentar(() => api('firmas.subir', { firmante: f.firmante }))) onCambio(); }}><Upload size={15} /> {f.imagen ? 'Cambiar firma' : 'Subir firma'}</button>
            {f.imagen && <button className="btn peligro" onClick={async () => {
              if (!(await confirmar({ titulo: 'Quitar firma', mensaje: 'Los documentos nuevos saldrán sin la imagen de esta firma.', peligro: true, aceptar: 'Quitar' }))) return;
              if (await intentar(() => api('firmas.quitar', { firmante: f.firmante }), 'Firma retirada.') !== undefined) onCambio();
            }}><Trash2 size={15} /></button>}
          </div>
        </>
      ) : (
        <dl className="lista-def"><dt>Nombre</dt><dd>{f.nombre || '—'}</dd><dt>Cargo</dt><dd>{f.cargo || '—'}</dd></dl>
      )}
    </Tarjeta>
  );
}

/** Panel con las dos firmas (o solo la del usuario, si `soloMia`). */
export function PanelFirmas({ soloMia }: { soloMia?: boolean }) {
  const { intentar, sesion } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const cargar = useCallback(() => { intentar(() => api('firmas.estado')).then((r) => r && setLista(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  const visibles = soloMia ? lista.filter((f) => f.firmante === sesion?.firmante) : lista;
  return (
    <>
      <div className="alerta info"><PenLine size={18} /><div>
        Las firmas se imprimen en los <b>certificados</b> y en los <b>documentos PDF</b>. Use una imagen <b>PNG con fondo transparente</b>{' '}
        (o JPG sobre fondo blanco) de la firma escaneada o fotografiada. Solo cada firmante o un administrador pueden cambiarla.
      </div></div>
      <div className={soloMia ? '' : 'rejilla c2'}>{visibles.map((f) => <TarjetaFirma key={f.firmante} f={f} onCambio={cargar} />)}</div>
    </>
  );
}

export function MiFirma({ onCerrar }: { onCerrar: () => void }) {
  return (
    <Modal titulo="Mi firma" icono={<PenLine size={20} />} onCerrar={onCerrar} pie={<button className="btn" onClick={onCerrar}>Cerrar</button>}>
      <PanelFirmas soloMia />
    </Modal>
  );
}
