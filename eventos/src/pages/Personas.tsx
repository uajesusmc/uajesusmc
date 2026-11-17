/** Participantes y ponentes (registro único, sin duplicados por documento). */
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { MODELOS, type NombreModelo } from '../../shared/modelos';
import { api } from '../api';
import { Formulario } from '../components/comunes';
import { Buscador, Pagina, Tabla, type Col } from '../components/ui';
import { useApp } from '../estado';
import { ImportarExcel } from './Eventos';

function Listado({ modelo, columnas, descripcion, extra }: { modelo: NombreModelo; columnas: Col<any>[]; descripcion: string; extra?: React.ReactNode }) {
  const { intentar, puedeEditar, confirmar } = useApp();
  const [busqueda, setBusqueda] = useState('');
  const [lista, setLista] = useState<any[]>([]);
  const [editar, setEditar] = useState<any | null | undefined>(undefined);
  const m = MODELOS[modelo];
  const cargar = useCallback(() => {
    const t = setTimeout(() => intentar(() => api('datos.listar', { modelo, filtro: { busqueda } })).then((r) => r && setLista(r)), 200);
    return () => clearTimeout(t);
  }, [modelo, busqueda, intentar]);
  useEffect(cargar, [cargar]);
  const eliminar = async (r: any) => {
    if (!(await confirmar({ titulo: `Eliminar ${m.singular.toLowerCase()}`, mensaje: `¿Enviar a ${r.nombres} ${r.apellidos} a la papelera?`, peligro: true, aceptar: 'Eliminar' }))) return;
    if (await intentar(() => api('datos.eliminar', { modelo, id: r.id }), 'Enviado a la papelera.') !== undefined) cargar();
  };
  return (
    <Pagina titulo={m.plural} descripcion={descripcion} acciones={puedeEditar && <>{extra}<button className="btn primario" onClick={() => setEditar(null)}><Plus size={16} /> Nuevo</button></>}>
      <div className="barra-filtros"><Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por documento o nombre…" /><span className="suave">{lista.length} registro(s)</span></div>
      <Tabla filas={lista} columnas={columnas} vacio="No hay registros." acciones={puedeEditar ? (r) => <>
        <button className="btn icono fantasma" title="Editar" onClick={() => setEditar(r)}><Pencil size={15} /></button>
        <button className="btn icono fantasma" title="Eliminar" onClick={() => eliminar(r)}><Trash2 size={15} color="var(--rojo)" /></button>
      </> : undefined} />
      {editar !== undefined && <Formulario modelo={modelo} registro={editar} onCerrar={() => setEditar(undefined)} onGuardado={() => { setEditar(undefined); cargar(); }} />}
    </Pagina>
  );
}

export function Participantes() {
  const [importar, setImportar] = useState(false);
  const [k, setK] = useState(0);
  return (
    <>
      <Listado key={k} modelo="participantes" descripcion="Registro único de estudiantes y asistentes. Inscríbalos a cada evento desde «Eventos del año»."
        extra={<button className="btn" onClick={() => setImportar(true)}><Upload size={15} /> Importar Excel</button>}
        columnas={[
          { key: 'identificacion', label: 'Documento', render: (r) => `${r.tipo_documento} ${r.identificacion}` }, { key: 'apellidos', label: 'Apellidos' },
          { key: 'nombres', label: 'Nombres' }, { key: 'institucion', label: 'Institución' }, { key: 'grado', label: 'Grado' },
          { key: 'telefono', label: 'Teléfono' }, { key: 'eventos', label: 'Eventos', num: true },
        ]} />
      {importar && <ImportarExcel onCerrar={() => { setImportar(false); setK(k + 1); }} />}
    </>
  );
}

export function Ponentes() {
  return (
    <Listado modelo="ponentes" descripcion="Docentes, conferencistas y talleristas que se asignan a las actividades de la agenda."
      columnas={[
        { key: 'identificacion', label: 'Identificación' }, { key: 'nombre', label: 'Nombre' }, { key: 'area', label: 'Área' },
        { key: 'profesion', label: 'Profesión' }, { key: 'telefono', label: 'Teléfono' }, { key: 'correo', label: 'Correo' },
        { key: 'actividades', label: 'Actividades', num: true },
      ]} />
  );
}
