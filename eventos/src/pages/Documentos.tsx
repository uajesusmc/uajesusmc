/** Documentos institucionales (oficios, constancias, circulares…) sobre el membrete de MEIF, con firmas. */
import { useCallback, useEffect, useState } from 'react';
import { Ban, Download, Eye, FilePlus2, FileText } from 'lucide-react';
import { FIRMANTES, TIPOS_DOCUMENTO_INST } from '../../shared/modelos';
import { api, fmtFecha, hoyISO } from '../api';
import { Buscador, CampoTexto, Insignia, Modal, Pagina, Tabla } from '../components/ui';
import { useApp } from '../estado';

const PLANTILLAS: Record<string, { destinatario: string; asunto: string; cuerpo: string; despedida: string }> = {
  Oficio: { destinatario: 'Señor(a)\n\nCiudad', asunto: '', cuerpo: 'Reciba un cordial saludo.\n\n', despedida: 'Atentamente,' },
  Constancia: { destinatario: '', asunto: 'HACE CONSTAR', cuerpo: 'Que el(la) señor(a) ____________________, identificado(a) con ____ No. __________, ', despedida: 'Se expide a solicitud del interesado(a).' },
  Circular: { destinatario: 'Para: \nDe: Presidencia MEIF – SABANALARGA', asunto: '', cuerpo: '', despedida: 'Cordialmente,' },
  Carta: { destinatario: 'Señor(a)\n\nCiudad', asunto: '', cuerpo: 'Reciba un cordial saludo.\n\n', despedida: 'Cordialmente,' },
  Comunicado: { destinatario: 'A la comunidad educativa', asunto: '', cuerpo: '', despedida: '' },
  Acta: { destinatario: '', asunto: 'Acta de reunión No. ___', cuerpo: 'Fecha y hora: \nLugar: \nAsistentes: \n\nOrden del día:\n1. \n2. \n\nDesarrollo:\n\nCompromisos:\n', despedida: 'Para constancia firman:' },
  Invitación: { destinatario: '', asunto: '', cuerpo: 'MEIF – SABANALARGA tiene el gusto de invitarle a ', despedida: 'Le esperamos.' },
};

function NuevoDocumento({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: (r: any) => void }) {
  const { intentar, config } = useApp();
  const [eventos, setEventos] = useState<any[]>([]);
  const [d, setD] = useState<any>(() => ({ tipo: 'Oficio', fecha: hoyISO(), ciudad: '', evento_id: '', firmantes: ['presidente', 'secretario'], ...PLANTILLAS.Oficio }));
  useEffect(() => { api('datos.listar', { modelo: 'eventos' }).then(setEventos).catch(() => undefined); }, []);
  const set = (k: string) => (v: any) => setD({ ...d, [k]: v });
  const cambiarTipo = (tipo: string) => setD({ ...d, tipo, ...PLANTILLAS[tipo] });
  const firmante = (f: string) => setD({ ...d, firmantes: d.firmantes.includes(f) ? d.firmantes.filter((x: string) => x !== f) : [...d.firmantes, f] });
  const generar = async () => {
    const r = await intentar(() => api('documentos.crear', { ...d, evento_id: d.evento_id || null }), 'Documento generado.');
    if (r) onCreado(r);
  };
  return (
    <Modal tam="grande" titulo="Nuevo documento institucional" icono={<FilePlus2 size={20} />} onCerrar={onCerrar}
      pie={<><span className="peq suave" style={{ marginRight: 'auto' }}>Se imprime sobre el membrete de MEIF con número consecutivo.</span>
        <button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={generar}><FileText size={15} /> Generar PDF</button></>}>
      <div className="form">
        <div className="campo"><label htmlFor="d-tipo">Tipo de documento</label>
          <select id="d-tipo" value={d.tipo} onChange={(e) => cambiarTipo(e.target.value)}>{Object.keys(TIPOS_DOCUMENTO_INST).map((t) => <option key={t}>{t}</option>)}</select></div>
        <CampoTexto label="Fecha" tipo="date" valor={d.fecha} onCambio={set('fecha')} />
        <CampoTexto label="Ciudad" valor={d.ciudad} onCambio={set('ciudad')} placeholder={config.lugar_expedicion} />
        <div className="campo"><label htmlFor="d-evento">Evento relacionado (opcional)</label>
          <select id="d-evento" value={d.evento_id} onChange={(e) => set('evento_id')(e.target.value)}><option value="">—</option>
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.anio} · {e.nombre}</option>)}</select></div>
        <CampoTexto label="Destinatario" tipo="textarea" valor={d.destinatario} onCambio={set('destinatario')} className="ancho" rows={3} />
        <CampoTexto label={['Constancia', 'Circular', 'Comunicado', 'Acta', 'Invitación'].includes(d.tipo) ? 'Título' : 'Asunto'} requerido valor={d.asunto} onCambio={set('asunto')} className="ancho" maxLength={200} />
        <CampoTexto label="Contenido (separe los párrafos con una línea en blanco)" requerido tipo="textarea" valor={d.cuerpo} onCambio={set('cuerpo')} className="ancho" rows={10} />
        <CampoTexto label="Despedida" valor={d.despedida} onCambio={set('despedida')} />
        <div className="campo"><label>Firman</label><div className="fila">
          {Object.entries(FIRMANTES).map(([k, v]) => (
            <label key={k} className="check"><input type="checkbox" checked={d.firmantes.includes(k)} onChange={() => firmante(k)} />
              {v}{config[`${k}_nombre`] ? `: ${config[`${k}_nombre`]}` : ' (sin configurar)'}</label>
          ))}</div></div>
      </div>
    </Modal>
  );
}

export function Documentos() {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [tipo, setTipo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const cargar = useCallback(() => {
    const t = setTimeout(() => intentar(() => api('documentos.listar', { tipo: tipo || undefined, busqueda })).then((r) => r && setLista(r)), 200);
    return () => clearTimeout(t);
  }, [tipo, busqueda, intentar]);
  useEffect(cargar, [cargar]);
  return (
    <Pagina titulo="Documentos institucionales" descripcion="Oficios, constancias, circulares, cartas, comunicados, actas e invitaciones con el membrete de MEIF y las firmas del Presidente y del Secretario."
      acciones={<>
        <button className="btn" onClick={() => intentar(() => api('membrete.vistaPrevia'))}><Eye size={15} /> Ver membrete</button>
        {puedeEditar && <button className="btn primario" onClick={() => setNuevo(true)}><FilePlus2 size={16} /> Nuevo documento</button>}
      </>}>
      <div className="barra-filtros">
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Consecutivo, asunto o destinatario…" />
        <div className="campo"><label htmlFor="d-ftipo">Tipo</label><select id="d-ftipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos</option>{Object.keys(TIPOS_DOCUMENTO_INST).map((t) => <option key={t}>{t}</option>)}</select></div>
      </div>
      <Tabla filas={lista} vacio="Aún no hay documentos. Cree el primero con «Nuevo documento»." columnas={[
        { key: 'consecutivo', label: 'Consecutivo', render: (x) => <code>{x.consecutivo}</code> }, { key: 'tipo', label: 'Tipo', render: (x) => <Insignia valor={x.tipo} color="azul" /> },
        { key: 'fecha', label: 'Fecha', render: (x) => fmtFecha(x.fecha) }, { key: 'asunto', label: 'Asunto' },
        { key: 'destinatario', label: 'Destinatario', render: (x) => <span className="peq">{(x.destinatario ?? '').split('\n').filter(Boolean)[0] ?? ''}</span> },
        { key: 'firmantes', label: 'Firman', render: (x) => (x.firmantes ? x.firmantes.split(',').map((f: string) => FIRMANTES[f as keyof typeof FIRMANTES]).join(' y ') : '—') },
        { key: 'creado_por', label: 'Elaboró' },
      ]} acciones={(x) => <>
        <button className="btn chico" onClick={() => intentar(() => api('documentos.ver', { id: x.id }))}><Eye size={14} /> Ver / imprimir</button>
        <button className="btn icono fantasma" title="Guardar PDF" onClick={() => intentar(() => api('documentos.guardar', { id: x.id }))}><Download size={15} /></button>
        {puedeEditar && <button className="btn icono fantasma" title="Anular" onClick={async () => {
          if (await confirmar({ titulo: 'Anular documento', mensaje: `¿Anular ${x.consecutivo}? El número no se reutiliza.`, peligro: true, aceptar: 'Anular' })) {
            if (await intentar(() => api('documentos.anular', { id: x.id }), 'Documento anulado.') !== undefined) cargar();
          }
        }}><Ban size={15} color="var(--rojo)" /></button>}
      </>} />
      {nuevo && <NuevoDocumento onCerrar={() => setNuevo(false)} onCreado={(r) => { setNuevo(false); cargar(); intentar(() => api('documentos.ver', { id: r.id })); }} />}
    </Pagina>
  );
}
