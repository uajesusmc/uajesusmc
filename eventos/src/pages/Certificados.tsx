/** Certificados emitidos (todos los eventos) y verificación de autenticidad por QR. */
import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Ban, Download, Eye, QrCode, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { api, fmtFecha } from '../api';
import { Buscador, CampoTexto, Insignia, Modal, Pagina, Pestanas, Tabla, Tarjeta, Vacio } from '../components/ui';
import { useApp } from '../estado';

function Emitidos() {
  const { intentar, esAdmin } = useApp();
  const [eventos, setEventos] = useState<any[]>([]);
  const [f, setF] = useState<any>({ eventoId: '', busqueda: '', incluirAnulados: false });
  const [lista, setLista] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [anular, setAnular] = useState<any>(null);
  const [motivo, setMotivo] = useState('');
  useEffect(() => { api('datos.listar', { modelo: 'eventos' }).then(setEventos).catch(() => undefined); }, []);
  const cargar = useCallback(() => {
    const t = setTimeout(() => intentar(() => api('certificados.listar', { ...f, eventoId: f.eventoId || undefined })).then((r) => r && setLista(r)), 200);
    return () => clearTimeout(t);
  }, [f, intentar]);
  useEffect(cargar, [cargar]);
  return (
    <>
      <div className="barra-filtros">
        <Buscador valor={f.busqueda} onCambio={(v) => setF({ ...f, busqueda: v })} placeholder="Código, documento o nombre…" />
        <div className="campo"><label htmlFor="c-ev">Evento</label><select id="c-ev" value={f.eventoId} onChange={(e) => setF({ ...f, eventoId: e.target.value })}>
          <option value="">Todos</option>{eventos.map((e) => <option key={e.id} value={e.id}>{e.anio} · {e.nombre}</option>)}</select></div>
        <label className="check"><input type="checkbox" checked={f.incluirAnulados} onChange={(e) => setF({ ...f, incluirAnulados: e.target.checked })} /> Incluir anulados</label>
        <div className="espacio" />
        <button className="btn" disabled={!sel.size} onClick={() => intentar(() => api('certificados.guardar', { ids: [...sel] }))}><Download size={15} /> Guardar ({sel.size})</button>
        <button className="btn primario" disabled={!sel.size} onClick={() => intentar(() => api('certificados.ver', { ids: [...sel] }))}><Eye size={15} /> Imprimir ({sel.size})</button>
      </div>
      <Tabla filas={lista} seleccion={sel} onSeleccion={setSel} vacio="No hay certificados." columnas={[
        { key: 'codigo', label: 'Código', render: (c) => <code>{c.codigo}</code> }, { key: 'fecha_emision', label: 'Emisión', render: (c) => fmtFecha(c.fecha_emision) },
        { key: 'identificacion', label: 'Documento' }, { key: 'participante', label: 'Participante' }, { key: 'evento', label: 'Evento' },
        { key: 'horas', label: 'Horas', num: true }, { key: 'estado', label: 'Estado', render: (c) => <span title={c.motivo_anulacion ?? ''}><Insignia valor={c.anulado ? 'Anulado' : 'Vigente'} /></span> },
      ]} acciones={(c) => <>
        <button className="btn chico" onClick={() => intentar(() => api('certificados.ver', { ids: [c.id] }))}><Eye size={14} /> Ver</button>
        {esAdmin && !c.anulado && <button className="btn icono fantasma" title="Anular" onClick={() => { setMotivo(''); setAnular(c); }}><Ban size={15} color="var(--rojo)" /></button>}
      </>} />
      {anular && (
        <Modal tam="chico" titulo="Anular certificado" onCerrar={() => setAnular(null)}
          pie={<><button className="btn" onClick={() => setAnular(null)}>Cancelar</button>
            <button className="btn peligro lleno" disabled={motivo.trim().length < 5} onClick={async () => {
              if (await intentar(() => api('certificados.anular', { id: anular.id, motivo }), 'Certificado anulado.') !== undefined) { setAnular(null); cargar(); }
            }}>Anular</button></>}>
          <p>El certificado <code>{anular.codigo}</code> de <b>{anular.participante}</b> quedará anulado.</p>
          <CampoTexto label="Motivo" tipo="textarea" requerido valor={motivo} onCambio={setMotivo} />
        </Modal>
      )}
    </>
  );
}

function Verificar() {
  const { intentar } = useApp();
  const [t, setT] = useState('');
  const [r, setR] = useState<any>(null);
  const input = useRef<HTMLInputElement>(null);
  const verificar = async (x = t) => { const v = await intentar(() => api('certificados.verificar', { texto: x })); if (v) setR(v); };
  const leer = (archivo: File) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
      const q = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      URL.revokeObjectURL(url);
      if (q?.data) { setT(q.data); verificar(q.data); } else setR({ estado: 'formato', mensaje: 'No se encontró un código QR legible en la imagen.' });
    };
    img.src = url;
  };
  return (
    <div className="rejilla c2">
      <Tarjeta titulo="Verificar autenticidad">
        <CampoTexto label="Contenido del QR o código del certificado" valor={t} onCambio={setT} placeholder="EV-2026-XXXXXXXX" onKeyDown={(e: any) => e.key === 'Enter' && verificar()} />
        <div className="fila mt">
          <button className="btn primario" disabled={!t.trim()} onClick={() => verificar()}><ShieldCheck size={15} /> Verificar</button>
          <button className="btn" onClick={() => input.current?.click()}><QrCode size={15} /> Cargar foto del QR</button>
          <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const a = e.target.files?.[0]; if (a) leer(a); e.target.value = ''; }} />
        </div>
      </Tarjeta>
      <Tarjeta titulo="Resultado">
        {!r ? <Vacio texto="Ingrese un código o cargue la foto del QR." icono={<QrCode size={36} />} /> : (
          <>
            <div className={`alerta ${r.estado === 'valido' ? 'exito' : r.estado === 'anulado' ? 'aviso' : 'error'}`}>
              {r.estado === 'valido' ? <ShieldCheck size={20} /> : r.estado === 'anulado' ? <ShieldAlert size={20} /> : <XCircle size={20} />}<b>{r.mensaje}</b></div>
            {r.certificado && <dl className="lista-def">
              <dt>Código</dt><dd><code>{r.certificado.codigo}</code></dd><dt>Participante</dt><dd>{r.certificado.participante}</dd>
              <dt>Documento</dt><dd>{r.certificado.identificacion}</dd><dt>Evento</dt><dd>{r.certificado.evento}</dd>
              <dt>Emisión</dt><dd>{fmtFecha(r.certificado.fecha_emision)}</dd><dt>Horas</dt><dd>{r.certificado.horas}</dd></dl>}
          </>
        )}
      </Tarjeta>
    </div>
  );
}

export function Certificados() {
  const [p, setP] = useState<'emitidos' | 'verificar'>('emitidos');
  return (
    <Pagina titulo="Certificados" descripcion="Los certificados se generan desde cada evento (pestaña Certificados). Aquí se consultan, imprimen y verifican.">
      <Pestanas valor={p} onCambio={setP} opciones={[{ id: 'emitidos', nombre: 'Certificados emitidos' }, { id: 'verificar', nombre: 'Verificar autenticidad' }]} />
      {p === 'emitidos' ? <Emitidos /> : <Verificar />}
    </Pagina>
  );
}
