/** Módulo 10: Generación automática de certificados en PDF con código QR. */
import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Award, Ban, CheckCircle2, Download, ExternalLink, Eye, FileCheck2, Palette, Printer, QrCode, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import type { Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum } from '../api';
import { BotonesExportar, Buscador, CampoTexto, Insignia, Modal, Pestanas, Progreso, SelectorOpciones, Tabla, Tarjeta, Vacio, useOpciones, type Col } from '../components/ui';
import { useApp } from '../estado';

function Resultado({ r, onCerrar }: { r: any; onCerrar: () => void }) {
  const { intentar } = useApp();
  const ids = r.generados.map((g: any) => g.id);
  return (
    <Modal titulo="Resultado de la generación" icono={<Award size={20} />} onCerrar={onCerrar}
      pie={<>
        <button className="btn" onClick={onCerrar}>Cerrar</button>
        {ids.length > 0 && <button className="btn" onClick={() => intentar(() => api('certificados.guardarComo', { ids }))}><Download size={15} /> Guardar PDF</button>}
        {ids.length > 0 && <button className="btn primario" onClick={() => intentar(() => api('certificados.verLote', { ruta: r.lote, ids }))}><Printer size={15} /> Ver e imprimir</button>}
      </>}>
      {r.generados.length > 0 && <div className="alerta exito"><CheckCircle2 size={18} /><div><b>{r.generados.length} certificado(s) generado(s):</b>
        <ul>{r.generados.map((g: any) => <li key={g.id}>{g.nombre} — <code>{g.codigo}</code></li>)}</ul></div></div>}
      {r.omitidos.length > 0 && <div className="alerta aviso"><ShieldAlert size={18} /><div><b>{r.omitidos.length} omitido(s):</b>
        <ul>{r.omitidos.map((o: any, i: number) => <li key={i}>{o.nombre}: {o.motivo}</li>)}</ul></div></div>}
    </Modal>
  );
}

function Generar({ cursilloInicial }: { cursilloInicial?: number }) {
  const { intentar, puede, sesion, notificar, config } = useApp();
  const cursillos = useOpciones('cursillos');
  const [cursilloId, setCursilloId] = useState<number | ''>(cursilloInicial ?? '');
  const [d, setD] = useState<any>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [resultado, setResultado] = useState<any>(null);
  const [reemitir, setReemitir] = useState<any>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const cargar = useCallback(() => {
    if (!cursilloId) { setD(null); return; }
    intentar(() => api('certificados.elegibles', { cursilloId })).then((r) => { if (r) { setD(r); setSel(new Set()); } });
  }, [cursilloId, intentar]);
  useEffect(cargar, [cargar]);
  const generar = async (matriculas: number[], autorizacion?: string) => {
    setOcupado(true);
    const r = await intentar(() => api('certificados.generar', { matriculas, autorizacion }));
    setOcupado(false);
    if (r) { setResultado(r); cargar(); if (r.generados.length) notificar(`${r.generados.length} certificado(s) generado(s).`, 'exito'); }
  };
  const autoriza = ['superadmin', 'coordinador'].includes(sesion?.rol ?? '');
  const estudiantes = d?.estudiantes ?? [];
  const pendientes = estudiantes.filter((e: any) => e.aprobado && !e.certificado);
  const cols: Col<any>[] = [
    { key: 'identificacion', label: 'Identificación' }, { key: 'nombre', label: 'Estudiante' }, { key: 'grupo', label: 'Grupo' },
    { key: 'clases', label: 'Clases', num: true },
    { key: 'porcentaje', label: 'Asistencia', render: (e) => (e.porcentaje == null ? '—' : <Progreso valor={e.porcentaje} dorado={e.aprobado} />), valor: (e) => e.porcentaje },
    { key: 'horas_certificables', label: 'Horas a certificar', num: true, render: (e) => fmtNum(e.horas_certificables) },
    {
      key: 'estado', label: 'Estado', valor: (e) => (e.certificado ? 'Certificado' : e.aprobado ? 'Aprobado' : 'No cumple'),
      render: (e) => (e.certificado ? <Insignia valor="Certificado" /> : e.aprobado ? <Insignia valor="Aprobado" color="dorado" /> : <span title={e.motivo}><Insignia valor="No cumple" /><div className="peq suave">{e.motivo}</div></span>),
    },
    { key: 'codigo', label: 'Código', render: (e) => e.certificado?.codigo ?? '', valor: (e) => e.certificado?.codigo ?? '' },
  ];
  return (
    <>
      <div className="barra-filtros">
        <div style={{ minWidth: 340 }}><SelectorOpciones label="Cursillo" valor={cursilloId} onCambio={setCursilloId} opciones={cursillos} todos="— Seleccione el cursillo —" /></div>
        <div className="espacio" />
        {d && <BotonesExportar titulo={`Estado de certificación – ${d.cursillo.nombre}`} columnas={cols} filas={estudiantes} />}
        {d && puede('certificados', 'editar') && <>
          <button className="btn" disabled={!pendientes.length || ocupado} onClick={() => generar(pendientes.map((e: any) => e.matricula_id))}><FileCheck2 size={15} /> Generar todos los aprobados ({pendientes.length})</button>
          <button className="btn dorado" disabled={!sel.size || ocupado} onClick={() => generar([...sel])}><Award size={15} /> {ocupado ? 'Generando…' : `Generar seleccionados (${sel.size})`}</button>
        </>}
      </div>
      {!config.director_nombre && <div className="alerta aviso">Configure el nombre del director o coordinador que firma los certificados en Configuración › Institución.</div>}
      {d && (
        <div className="alerta info">
          <div>Condición de aprobación: asistencia mínima de <b>{d.cursillo.asistencia_minima}%</b>. Horas certificadas = horas efectivamente asistidas
            (Asistió o Retardo) en clases ejecutadas, sin superar la intensidad de cada asignatura.
            {d.cursillo.estado === 'Activo' && <> <b>El cursillo sigue activo:</b> se certificarán las horas cumplidas hasta hoy.</>}</div>
        </div>
      )}
      {d ? (
        <Tabla filas={estudiantes.map((e: any) => ({ ...e, id: e.matricula_id }))} columnas={cols}
          seleccion={puede('certificados', 'editar') ? sel : undefined}
          onSeleccion={(s) => setSel(new Set([...s].filter((id) => estudiantes.find((e: any) => e.matricula_id === id && e.aprobado && !e.certificado))))}
          vacio="El cursillo no tiene estudiantes matriculados."
          acciones={(e) => (
            <>
              {e.certificado && <button className="btn chico" onClick={() => intentar(() => api('certificados.ver', { id: e.certificado.id }))}><Eye size={14} /> Ver</button>}
              {!e.certificado && e.aprobado && puede('certificados', 'editar') && <button className="btn chico" disabled={ocupado} onClick={() => generar([e.matricula_id])}><Award size={14} /> Generar</button>}
              {e.certificado && e.aprobado && autoriza && <button className="btn chico" onClick={() => { setMotivo(''); setReemitir(e); }}><RefreshCw size={14} /> Reemitir</button>}
            </>
          )} />
      ) : <Vacio texto="Seleccione un cursillo para ver los estudiantes que cumplen las condiciones de aprobación." icono={<Award size={36} />} />}
      {resultado && <Resultado r={resultado} onCerrar={() => setResultado(null)} />}
      {reemitir && (
        <Modal tam="chico" titulo="Autorizar reemisión" icono={<ShieldAlert size={20} />} onCerrar={() => setReemitir(null)}
          pie={<><button className="btn" onClick={() => setReemitir(null)}>Cancelar</button>
            <button className="btn primario" disabled={motivo.trim().length < 5} onClick={() => { const m = reemitir; setReemitir(null); generar([m.matricula_id], motivo); }}>Autorizar y reemitir</button></>}>
          <p><b>{reemitir.nombre}</b> ya tiene el certificado vigente <code>{reemitir.certificado.codigo}</code>.</p>
          <p className="suave">Al reemitir, el certificado anterior quedará <b>ANULADO</b> y se generará uno nuevo con otro código. Quedará registrado en la auditoría.</p>
          <CampoTexto label="Motivo / número de autorización" tipo="textarea" requerido valor={motivo} onCambio={setMotivo} placeholder="Ej.: Corrección del nombre, acta 05 de coordinación" />
        </Modal>
      )}
    </>
  );
}

function Emitidos() {
  const { intentar, puede, sesion } = useApp();
  const cursillos = useOpciones('cursillos');
  const [f, setF] = useState<any>({ cursilloId: '', busqueda: '', desde: '', hasta: '', incluirAnulados: false });
  const [filas, setFilas] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [anular, setAnular] = useState<any>(null);
  const [motivo, setMotivo] = useState('');
  const cargar = useCallback(() => {
    const t = setTimeout(() => intentar(() => api('certificados.listar', { ...f, cursilloId: f.cursilloId || undefined })).then((r) => r && setFilas(r)), 200);
    return () => clearTimeout(t);
  }, [f, intentar]);
  useEffect(cargar, [cargar]);
  const cols: Col<any>[] = [
    { key: 'codigo', label: 'Código', render: (c) => <code>{c.codigo}</code>, valor: (c) => c.codigo },
    { key: 'fecha_emision', label: 'Emisión', render: (c) => fmtFecha(c.fecha_emision), valor: (c) => fmtFecha(c.fecha_emision) },
    { key: 'identificacion', label: 'Identificación' }, { key: 'estudiante', label: 'Estudiante' }, { key: 'cursillo', label: 'Cursillo' },
    { key: 'horas_certificadas', label: 'Horas', num: true }, { key: 'porcentaje_asistencia', label: 'Asistencia', num: true, render: (c) => `${fmtNum(c.porcentaje_asistencia)}%` },
    { key: 'estado', label: 'Estado', render: (c) => <span title={c.motivo_anulacion ?? ''}><Insignia valor={c.anulado ? 'Anulado' : 'Vigente'} /></span>, valor: (c) => (c.anulado ? 'Anulado' : 'Vigente') },
    { key: 'emitido_por', label: 'Emitido por' },
  ];
  return (
    <>
      <div className="barra-filtros">
        <Buscador valor={f.busqueda} onCambio={(v) => setF({ ...f, busqueda: v })} placeholder="Código, identificación o nombre…" />
        <SelectorOpciones label="Cursillo" valor={f.cursilloId} onCambio={(v) => setF({ ...f, cursilloId: v })} opciones={cursillos} />
        <CampoTexto label="Desde" tipo="date" valor={f.desde} onCambio={(v) => setF({ ...f, desde: v })} />
        <CampoTexto label="Hasta" tipo="date" valor={f.hasta} onCambio={(v) => setF({ ...f, hasta: v })} />
        <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" checked={f.incluirAnulados} onChange={(e) => setF({ ...f, incluirAnulados: e.target.checked })} /> Incluir anulados</label>
        <div className="espacio" />
        <BotonesExportar titulo="Certificados emitidos" columnas={cols} filas={filas} />
        <button className="btn" disabled={!sel.size} onClick={() => intentar(() => api('certificados.guardarComo', { ids: [...sel] }))}><Download size={15} /> Guardar ({sel.size})</button>
        <button className="btn primario" disabled={!sel.size} onClick={() => intentar(() => api('certificados.verLote', { ids: [...sel] }))}><Printer size={15} /> Imprimir ({sel.size})</button>
      </div>
      <Tabla filas={filas} columnas={cols} seleccion={sel} onSeleccion={setSel} vacio="No hay certificados con estos filtros."
        acciones={(c) => (
          <>
            <button className="btn chico" onClick={() => intentar(() => api('certificados.ver', { id: c.id }))} title="Ver e imprimir"><Eye size={14} /> Ver</button>
            <button className="btn icono fantasma" onClick={() => intentar(() => api('certificados.abrirExterno', { id: c.id }))} title="Abrir con el visor de PDF del equipo"><ExternalLink size={15} /></button>
            <button className="btn icono fantasma" onClick={() => intentar(() => api('certificados.guardarComo', { ids: [c.id] }))} title="Guardar como…"><Download size={15} /></button>
            {!c.anulado && puede('certificados', 'eliminar') && ['superadmin', 'coordinador'].includes(sesion?.rol ?? '') &&
              <button className="btn icono fantasma" onClick={() => { setMotivo(''); setAnular(c); }} title="Anular"><Ban size={15} color="var(--rojo)" /></button>}
          </>
        )} />
      {anular && (
        <Modal tam="chico" titulo="Anular certificado" icono={<Ban size={20} color="var(--rojo)" />} onCerrar={() => setAnular(null)}
          pie={<><button className="btn" onClick={() => setAnular(null)}>Cancelar</button>
            <button className="btn peligro lleno" disabled={motivo.trim().length < 5} onClick={async () => {
              if (await intentar(() => api('certificados.anular', { id: anular.id, motivo }), 'Certificado anulado.') !== undefined) { setAnular(null); cargar(); }
            }}>Anular</button></>}>
          <p>El certificado <code>{anular.codigo}</code> de <b>{anular.estudiante}</b> quedará anulado. La verificación por QR indicará que no es válido.</p>
          <CampoTexto label="Motivo de la anulación" tipo="textarea" requerido valor={motivo} onCambio={setMotivo} />
        </Modal>
      )}
    </>
  );
}

function Verificar() {
  const { intentar } = useApp();
  const [texto, setTexto] = useState('');
  const [r, setR] = useState<any>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const verificar = async (t = texto) => { const x = await intentar(() => api('certificados.verificar', { texto: t })); if (x) setR(x); };
  const leerImagen = (f: File) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const datos = ctx.getImageData(0, 0, c.width, c.height);
      const qr = jsQR(datos.data, datos.width, datos.height);
      URL.revokeObjectURL(url);
      if (qr?.data) { setTexto(qr.data); verificar(qr.data); } else setR({ estado: 'formato', mensaje: 'No se encontró un código QR legible en la imagen. Recorte la imagen alrededor del QR e intente de nuevo.' });
    };
    img.src = url;
  };
  const color = r?.estado === 'valido' ? 'exito' : r?.estado === 'anulado' ? 'aviso' : 'error';
  return (
    <div className="rejilla c2">
      <Tarjeta titulo="Verificar autenticidad">
        <p className="suave">Escanee el código QR del certificado con un lector (el texto se escribe en el campo), pegue su contenido, escriba el código impreso o cargue una foto del QR.</p>
        <CampoTexto label="Contenido del QR o código del certificado" valor={texto} onCambio={setTexto} placeholder="MEIF-2027-XXXXXXXX" onKeyDown={(e: any) => e.key === 'Enter' && verificar()} autoFocus />
        <div className="fila mt">
          <button className="btn primario" onClick={() => verificar()} disabled={!texto.trim()}><ShieldCheck size={15} /> Verificar</button>
          <button className="btn" onClick={() => archivo.current?.click()}><QrCode size={15} /> Cargar imagen del QR</button>
          <input ref={archivo} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) leerImagen(f); e.target.value = ''; }} />
        </div>
      </Tarjeta>
      <Tarjeta titulo="Resultado">
        {!r ? <Vacio texto="Aún no se ha verificado ningún certificado." icono={<QrCode size={36} />} /> : (
          <>
            <div className={`alerta ${color}`}>{r.estado === 'valido' ? <ShieldCheck size={20} /> : r.estado === 'anulado' ? <ShieldAlert size={20} /> : <XCircle size={20} />}<div><b>{r.mensaje}</b></div></div>
            {r.certificado && (
              <dl className="lista-def">
                <dt>Código</dt><dd><code>{r.certificado.codigo}</code></dd><dt>Estudiante</dt><dd>{r.certificado.estudiante}</dd>
                <dt>Identificación</dt><dd>{r.certificado.identificacion}</dd><dt>Cursillo</dt><dd>{r.certificado.cursillo}</dd>
                <dt>Fecha de emisión</dt><dd>{fmtFecha(r.certificado.fecha_emision)}</dd><dt>Horas certificadas</dt><dd>{fmtNum(r.certificado.horas)} h</dd>
                <dt>Asignaturas</dt><dd>{r.certificado.asignaturas.map((a: any) => `${a.nombre} (${fmtNum(a.horas)} h)`).join(', ')}</dd>
              </dl>
            )}
          </>
        )}
      </Tarjeta>
    </div>
  );
}

export function Certificados({ ir, parametros }: { ir: (m: Modulo, p?: any) => void; parametros?: any }) {
  const { puede } = useApp();
  const [p, setP] = useState<'generar' | 'emitidos' | 'verificar'>('generar');
  return (
    <>
      <div className="pagina-cab"><div><h1>Certificados</h1><p>Generación individual y masiva en PDF con código único y QR de verificación.</p></div>
        {puede('configuracion', 'editar') && <div className="acciones"><button className="btn" onClick={() => ir('configuracion', { pestana: 'certificado' })}><Palette size={16} /> Personalizar diseño</button></div>}
      </div>
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'generar', nombre: 'Generar', icono: <Award size={16} /> }, { id: 'emitidos', nombre: 'Certificados emitidos', icono: <FileCheck2 size={16} /> },
        { id: 'verificar', nombre: 'Verificar autenticidad', icono: <QrCode size={16} /> },
      ]} />
      {p === 'generar' && <Generar cursilloInicial={parametros?.cursilloId} />}
      {p === 'emitidos' && <Emitidos />}
      {p === 'verificar' && <Verificar />}
    </>
  );
}
