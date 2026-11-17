/** Miembros de MEIF: junta directiva y directorio con datos básicos (cargo opcional). */
import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Mail, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react';
import { CARGOS_MIEMBRO, CARGOS_UNICOS, ESTADOS_MIEMBRO } from '../../shared/modelos';
import { api, fmtFecha } from '../api';
import { Formulario } from '../components/comunes';
import { Buscador, Insignia, Modal, Pagina, Tabla, Tarjeta } from '../components/ui';
import { useApp } from '../estado';

const iniciales = (m: any) => `${m.nombres?.[0] ?? ''}${m.apellidos?.[0] ?? ''}`.toUpperCase();
const edad = (f?: string | null) => {
  if (!f) return null;
  const n = new Date(f + 'T12:00'); const h = new Date();
  return h.getFullYear() - n.getFullYear() - (h < new Date(h.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
};

function Ficha({ m, onCerrar, onEditar }: { m: any; onCerrar: () => void; onEditar?: () => void }) {
  return (
    <Modal tam="chico" titulo={`${m.nombres} ${m.apellidos}`} icono={<UserRound size={20} />} onCerrar={onCerrar}
      pie={<>{onEditar && <button className="btn" onClick={onEditar}><Pencil size={15} /> Editar</button>}<button className="btn primario" onClick={onCerrar}>Cerrar</button></>}>
      <div className="fila mb">{m.cargo ? <Insignia valor={m.cargo} color="dorado" /> : <Insignia valor="Sin cargo" />}<Insignia valor={m.estado} />{m.area && <Insignia valor={m.area} color="azul" />}</div>
      <dl className="lista-def">
        <dt>Documento</dt><dd>{m.tipo_documento} {m.identificacion}</dd>
        <dt>Profesión / ocupación</dt><dd>{m.profesion || '—'}</dd>
        <dt>Fecha de nacimiento</dt><dd>{m.fecha_nacimiento ? `${fmtFecha(m.fecha_nacimiento)} (${edad(m.fecha_nacimiento)} años)` : '—'}</dd>
        <dt>Teléfono</dt><dd>{m.telefono || '—'}</dd><dt>Correo</dt><dd>{m.correo || '—'}</dd>
        <dt>Dirección</dt><dd>{[m.direccion, m.municipio].filter(Boolean).join(', ') || '—'}</dd>
        <dt>Ingreso a MEIF</dt><dd>{fmtFecha(m.fecha_ingreso) || '—'}</dd>
        {m.observaciones && <><dt>Observaciones</dt><dd style={{ whiteSpace: 'pre-line' }}>{m.observaciones}</dd></>}
      </dl>
    </Modal>
  );
}

export function Miembros() {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const [junta, setJunta] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargo, setCargo] = useState('');
  const [estado, setEstado] = useState('Activo');
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const [ficha, setFicha] = useState<any>(null);
  const cargar = useCallback(() => {
    const t = setTimeout(() => {
      intentar(() => api('datos.listar', { modelo: 'miembros', filtro: { busqueda, cargo: cargo || undefined, estado: estado || undefined } })).then((r) => r && setLista(r));
      intentar(() => api('datos.listar', { modelo: 'miembros', filtro: { estado: 'Activo' } })).then((r) => r && setJunta(r.filter((m: any) => (CARGOS_UNICOS as readonly string[]).includes(m.cargo))));
    }, 200);
    return () => clearTimeout(t);
  }, [busqueda, cargo, estado, intentar]);
  useEffect(cargar, [cargar]);
  const exportar = (formato: 'pdf' | 'xlsx') => intentar(() => api('reportes.exportar', { id: 'miembros', formato, filtros: {} }));
  return (
    <Pagina titulo="Miembros de MEIF" descripcion="Directorio de los miembros con sus datos básicos y su cargo (si lo tienen)."
      acciones={<>
        <button className="btn" onClick={() => exportar('pdf')}><FileText size={15} /> Directorio PDF</button>
        <button className="btn" onClick={() => exportar('xlsx')}><FileSpreadsheet size={15} /> Excel</button>
        {puedeEditar && <button className="btn primario" onClick={() => setEditar(null)}><Plus size={16} /> Nuevo miembro</button>}
      </>}>
      <Tarjeta titulo="Junta directiva" className="mb">
        <div className="rejilla junta">
          {CARGOS_UNICOS.map((c) => {
            const m = junta.find((x) => x.cargo === c);
            return (
              <div key={c} className={`miembro-junta ${m ? '' : 'vacante'}`} role={m ? 'button' : undefined} onClick={() => m && setFicha(m)}>
                <div className="avatar-miembro">{m ? iniciales(m) : '—'}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="cargo-junta">{c}</div>
                  <div className="negrita">{m ? `${m.nombres} ${m.apellidos}` : 'Vacante'}</div>
                  {m?.telefono && <div className="peq suave"><Phone size={11} /> {m.telefono}</div>}
                  {m?.correo && <div className="peq suave" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}><Mail size={11} /> {m.correo}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Tarjeta>
      <div className="barra-filtros">
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Nombre, documento, cargo, profesión…" />
        <div className="campo"><label htmlFor="m-cargo">Cargo</label><select id="m-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)}>
          <option value="">Todos</option><option>Sin cargo</option>{CARGOS_MIEMBRO.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="campo"><label htmlFor="m-estado">Estado</label><select id="m-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option>{ESTADOS_MIEMBRO.map((c) => <option key={c}>{c}</option>)}</select></div>
        <span className="suave">{lista.length} miembro(s)</span>
      </div>
      <Tabla filas={lista} onFila={setFicha} vacio="No hay miembros registrados con estos filtros." columnas={[
        { key: 'nombre', label: 'Miembro', render: (m) => <div className="fila" style={{ flexWrap: 'nowrap', gap: 10 }}><div className="avatar-miembro chico">{iniciales(m)}</div><b>{m.apellidos} {m.nombres}</b></div>, valor: (m) => `${m.apellidos} ${m.nombres}` },
        { key: 'cargo', label: 'Cargo', render: (m) => (m.cargo ? <Insignia valor={m.cargo} color={(CARGOS_UNICOS as readonly string[]).includes(m.cargo) ? 'dorado' : 'azul'} /> : <span className="suave">—</span>) },
        { key: 'identificacion', label: 'Documento', render: (m) => `${m.tipo_documento} ${m.identificacion}` },
        { key: 'area', label: 'Área' }, { key: 'profesion', label: 'Profesión' }, { key: 'telefono', label: 'Teléfono' }, { key: 'correo', label: 'Correo' },
        { key: 'estado', label: 'Estado', render: (m) => <Insignia valor={m.estado} /> },
      ]} acciones={puedeEditar ? (m) => <>
        <button className="btn icono fantasma" title="Editar" onClick={() => setEditar(m)}><Pencil size={15} /></button>
        <button className="btn icono fantasma" title="Eliminar" onClick={async () => {
          if (!(await confirmar({ titulo: 'Eliminar miembro', mensaje: `¿Enviar a ${m.nombres} ${m.apellidos} a la papelera? Si solo dejó de participar, márquelo como Inactivo o Retirado.`, peligro: true, aceptar: 'Eliminar' }))) return;
          if (await intentar(() => api('datos.eliminar', { modelo: 'miembros', id: m.id }), 'Miembro enviado a la papelera.') !== undefined) cargar();
        }}><Trash2 size={15} color="var(--rojo)" /></button>
      </> : undefined} />
      {ficha && <Ficha m={ficha} onCerrar={() => setFicha(null)} onEditar={puedeEditar ? () => { setEditar(ficha); setFicha(null); } : undefined} />}
      {editar !== undefined && <Formulario modelo="miembros" registro={editar} onCerrar={() => setEditar(undefined)} onGuardado={() => { setEditar(undefined); cargar(); }} />}
    </Pagina>
  );
}
