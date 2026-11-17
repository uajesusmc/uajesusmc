/** Módulo 4: Catálogo de asignaturas por área. */
import { ListTree } from 'lucide-react';
import { AREAS, type Modulo } from '../../shared/constantes';
import { CrudPagina } from '../components/crud';
import { Insignia } from '../components/ui';

const COLOR_AREA: Record<string, string> = { Matemáticas: 'azul', Estadística: 'verde', Informática: '', Física: 'dorado' };

export function Asignaturas({ ir }: { ir: (m: Modulo, p?: any) => void }) {
  return (
    <CrudPagina entidad="asignaturas"
      descripcion="Asignaturas organizadas por las áreas Matemáticas, Estadística, Informática y Física."
      filtros={[{ campo: 'area', label: 'Área', opciones: AREAS }, { campo: 'cursillo_id', label: 'Cursillo', ref: 'cursillos' }, { campo: 'docente_id', label: 'Docente', ref: 'docentes' }]}
      columnasExtra={{ area: { render: (f: any) => <Insignia valor={f.area} color={COLOR_AREA[f.area]} /> } }}
      acciones={(f) => (
        <button className="btn chico" title="Planeación temática" onClick={() => ir('planeacion', { asignaturaId: f.id })}><ListTree size={14} /> Planeación</button>
      )} />
  );
}
