/**
 * Metadatos de las entidades administradas con formularios genéricos.
 * La interfaz los usa para construir formularios y tablas; el proceso principal
 * los usa para validar (campos obligatorios, tipos, longitudes, unicidad).
 */
import {
  AREAS, ESTADOS_CURSILLO, ESTADOS_MATRICULA, GRADOS, JORNADAS, MODALIDADES, TIPOS_DOCUMENTO, type Modulo,
} from './constantes';

export type NombreEntidad = 'periodos' | 'cursillos' | 'docentes' | 'asignaturas' | 'grupos' | 'estudiantes' | 'matriculas';

export type TipoCampo =
  | 'text' | 'textarea' | 'number' | 'date' | 'time' | 'email' | 'tel' | 'select' | 'ref';

export interface Campo {
  name: string;
  label: string;
  type: TipoCampo;
  required?: boolean;
  options?: readonly string[];
  /** Para `ref`: entidad referenciada. */
  ref?: NombreEntidad;
  /** Para `ref`: filtra las opciones por el valor de otro campo del formulario. */
  filtradoPor?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  default?: string | number | (() => string);
  ayuda?: string;
  /** Ocupa el ancho completo del formulario. */
  ancho?: boolean;
}

export interface Columna {
  key: string;
  label: string;
  formato?: 'fecha' | 'numero' | 'estado';
}

export interface Entidad {
  nombre: NombreEntidad;
  tabla: string;
  modulo: Modulo;
  singular: string;
  plural: string;
  campos: Campo[];
  columnas: Columna[];
  /** Columnas en las que busca el cuadro de búsqueda. */
  busqueda: string[];
  /** Restricciones de unicidad (se validan con un mensaje claro antes de guardar). */
  unicos: { campos: string[]; mensaje: string }[];
  /** Registros que dependen de esta entidad: impiden eliminarla. */
  dependientes: { tabla: string; fk: string; etiqueta: string; logico?: boolean }[];
  orden: string;
}

const hoy = () => new Date().toISOString().slice(0, 10);

export const ENTIDADES = {
  periodos: {
    nombre: 'periodos', tabla: 'periodos', modulo: 'cursillos', singular: 'Periodo académico', plural: 'Periodos académicos',
    campos: [
      { name: 'codigo', label: 'Código', type: 'text', required: true, maxLength: 20 },
      { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 120 },
      { name: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true },
      { name: 'fecha_fin', label: 'Fecha de finalización', type: 'date', required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea', ancho: true },
    ],
    columnas: [
      { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Nombre' },
      { key: 'fecha_inicio', label: 'Inicio', formato: 'fecha' }, { key: 'fecha_fin', label: 'Fin', formato: 'fecha' },
      { key: 'num_cursillos', label: 'Cursillos', formato: 'numero' },
    ],
    busqueda: ['t.codigo', 't.nombre'],
    unicos: [{ campos: ['codigo'], mensaje: 'Ya existe un periodo con ese código.' }],
    dependientes: [{ tabla: 'cursillos', fk: 'periodo_id', etiqueta: 'cursillos', logico: true }],
    orden: 't.fecha_inicio DESC',
  },
  cursillos: {
    nombre: 'cursillos', tabla: 'cursillos', modulo: 'cursillos', singular: 'Cursillo', plural: 'Cursillos',
    campos: [
      { name: 'codigo', label: 'Código', type: 'text', required: true, maxLength: 20 },
      { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 150 },
      { name: 'periodo_id', label: 'Periodo académico', type: 'ref', ref: 'periodos', required: true },
      { name: 'modalidad', label: 'Modalidad', type: 'select', options: MODALIDADES, required: true, default: 'Presencial' },
      { name: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true },
      { name: 'fecha_fin', label: 'Fecha de finalización', type: 'date', required: true },
      { name: 'estado', label: 'Estado', type: 'select', options: ESTADOS_CURSILLO, required: true, default: 'Activo' },
      {
        name: 'asistencia_minima', label: 'Asistencia mínima para certificar (%)', type: 'number', min: 0, max: 100,
        required: true, default: 80, ayuda: 'Condición de aprobación usada al generar certificados.',
      },
      { name: 'descripcion', label: 'Descripción', type: 'textarea', ancho: true },
    ],
    columnas: [
      { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Nombre' }, { key: 'periodo', label: 'Periodo' },
      { key: 'modalidad', label: 'Modalidad' }, { key: 'fecha_inicio', label: 'Inicio', formato: 'fecha' },
      { key: 'fecha_fin', label: 'Fin', formato: 'fecha' }, { key: 'estado', label: 'Estado', formato: 'estado' },
      { key: 'num_estudiantes', label: 'Estudiantes', formato: 'numero' },
    ],
    busqueda: ['t.codigo', 't.nombre'],
    unicos: [{ campos: ['codigo'], mensaje: 'Ya existe un cursillo con ese código.' }],
    dependientes: [
      { tabla: 'matriculas', fk: 'cursillo_id', etiqueta: 'matrículas', logico: true },
      { tabla: 'asignaturas', fk: 'cursillo_id', etiqueta: 'asignaturas', logico: true },
      { tabla: 'grupos', fk: 'cursillo_id', etiqueta: 'grupos', logico: true },
    ],
    orden: 't.fecha_inicio DESC',
  },
  docentes: {
    nombre: 'docentes', tabla: 'docentes', modulo: 'docentes', singular: 'Docente', plural: 'Docentes',
    campos: [
      { name: 'identificacion', label: 'Identificación', type: 'text', required: true, maxLength: 20 },
      { name: 'nombres', label: 'Nombres', type: 'text', required: true, maxLength: 80 },
      { name: 'apellidos', label: 'Apellidos', type: 'text', required: true, maxLength: 80 },
      { name: 'telefono', label: 'Teléfono', type: 'tel', maxLength: 30 },
      { name: 'correo', label: 'Correo electrónico', type: 'email', maxLength: 120 },
      { name: 'profesion', label: 'Profesión', type: 'text', maxLength: 120 },
      { name: 'especialidad', label: 'Especialidad', type: 'text', maxLength: 120 },
      { name: 'disponibilidad', label: 'Disponibilidad horaria', type: 'textarea', ancho: true, ayuda: 'Ej.: Sábados 7:00–12:00; martes y jueves en la tarde.' },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', ancho: true },
    ],
    columnas: [
      { key: 'identificacion', label: 'Identificación' }, { key: 'nombre_completo', label: 'Nombre' },
      { key: 'telefono', label: 'Teléfono' }, { key: 'correo', label: 'Correo' },
      { key: 'especialidad', label: 'Especialidad' }, { key: 'asignaturas', label: 'Asignaturas que orienta' },
    ],
    busqueda: ['t.identificacion', 't.nombres', 't.apellidos', 't.especialidad'],
    unicos: [{ campos: ['identificacion'], mensaje: 'Ya existe un docente con esa identificación.' }],
    dependientes: [
      { tabla: 'horarios', fk: 'docente_id', etiqueta: 'clases programadas', logico: true },
      { tabla: 'asignaturas', fk: 'docente_id', etiqueta: 'asignaturas a cargo', logico: true },
      { tabla: 'usuarios', fk: 'docente_id', etiqueta: 'usuarios vinculados', logico: true },
    ],
    orden: 't.apellidos, t.nombres',
  },
  asignaturas: {
    nombre: 'asignaturas', tabla: 'asignaturas', modulo: 'asignaturas', singular: 'Asignatura', plural: 'Asignaturas',
    campos: [
      { name: 'codigo', label: 'Código', type: 'text', required: true, maxLength: 20 },
      { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 120 },
      { name: 'area', label: 'Área', type: 'select', options: AREAS, required: true },
      { name: 'cursillo_id', label: 'Cursillo', type: 'ref', ref: 'cursillos', required: true },
      { name: 'docente_id', label: 'Docente responsable', type: 'ref', ref: 'docentes' },
      { name: 'intensidad_horaria', label: 'Intensidad horaria (horas)', type: 'number', min: 0.5, max: 1000, required: true },
      { name: 'descripcion', label: 'Descripción', type: 'textarea', ancho: true },
    ],
    columnas: [
      { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Asignatura' }, { key: 'area', label: 'Área' },
      { key: 'cursillo', label: 'Cursillo' }, { key: 'docente', label: 'Docente responsable' },
      { key: 'intensidad_horaria', label: 'Intensidad (h)', formato: 'numero' },
    ],
    busqueda: ['t.codigo', 't.nombre', 't.area'],
    unicos: [{ campos: ['cursillo_id', 'codigo'], mensaje: 'Ya existe una asignatura con ese código en el cursillo.' }],
    dependientes: [
      { tabla: 'horarios', fk: 'asignatura_id', etiqueta: 'clases programadas', logico: true },
      { tabla: 'materiales', fk: 'asignatura_id', etiqueta: 'materiales', logico: true },
    ],
    orden: 't.area, t.nombre',
  },
  grupos: {
    nombre: 'grupos', tabla: 'grupos', modulo: 'grupos', singular: 'Grupo', plural: 'Grupos',
    campos: [
      { name: 'cursillo_id', label: 'Cursillo', type: 'ref', ref: 'cursillos', required: true },
      { name: 'nombre', label: 'Nombre del grupo', type: 'text', required: true, maxLength: 60 },
      { name: 'jornada', label: 'Jornada', type: 'select', options: JORNADAS },
      { name: 'cupo', label: 'Cupo máximo', type: 'number', min: 1, max: 1000 },
      { name: 'aula', label: 'Aula o espacio habitual', type: 'text', maxLength: 60 },
      { name: 'docente_id', label: 'Docente director de grupo', type: 'ref', ref: 'docentes' },
    ],
    columnas: [
      { key: 'nombre', label: 'Grupo' }, { key: 'cursillo', label: 'Cursillo' }, { key: 'jornada', label: 'Jornada' },
      { key: 'aula', label: 'Aula' }, { key: 'director', label: 'Director de grupo' },
      { key: 'num_estudiantes', label: 'Estudiantes', formato: 'numero' }, { key: 'cupo', label: 'Cupo', formato: 'numero' },
    ],
    busqueda: ['t.nombre', 't.aula'],
    unicos: [{ campos: ['cursillo_id', 'nombre'], mensaje: 'Ya existe un grupo con ese nombre en el cursillo.' }],
    dependientes: [
      { tabla: 'matriculas', fk: 'grupo_id', etiqueta: 'estudiantes matriculados', logico: true },
      { tabla: 'horarios', fk: 'grupo_id', etiqueta: 'clases programadas', logico: true },
    ],
    orden: 't.nombre',
  },
  estudiantes: {
    nombre: 'estudiantes', tabla: 'estudiantes', modulo: 'estudiantes', singular: 'Estudiante', plural: 'Estudiantes',
    campos: [
      { name: 'tipo_documento', label: 'Tipo de documento', type: 'select', options: TIPOS_DOCUMENTO, required: true, default: 'TI' },
      { name: 'identificacion', label: 'Número de identificación', type: 'text', required: true, maxLength: 20 },
      { name: 'nombres', label: 'Nombres', type: 'text', required: true, maxLength: 80 },
      { name: 'apellidos', label: 'Apellidos', type: 'text', required: true, maxLength: 80 },
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
      { name: 'institucion', label: 'Institución educativa', type: 'text', maxLength: 150 },
      { name: 'grado', label: 'Grado escolar', type: 'select', options: GRADOS },
      { name: 'telefono', label: 'Teléfono', type: 'tel', maxLength: 30 },
      { name: 'correo', label: 'Correo electrónico', type: 'email', maxLength: 120 },
      { name: 'direccion', label: 'Dirección', type: 'text', maxLength: 150 },
      { name: 'acudiente', label: 'Acudiente', type: 'text', maxLength: 120 },
      { name: 'telefono_acudiente', label: 'Teléfono del acudiente', type: 'tel', maxLength: 30 },
    ],
    columnas: [
      { key: 'identificacion', label: 'Identificación' }, { key: 'apellidos', label: 'Apellidos' },
      { key: 'nombres', label: 'Nombres' }, { key: 'institucion', label: 'Institución' }, { key: 'grado', label: 'Grado' },
      { key: 'telefono', label: 'Teléfono' }, { key: 'cursillo', label: 'Cursillo actual' }, { key: 'grupo', label: 'Grupo' },
      { key: 'estado_matricula', label: 'Matrícula', formato: 'estado' },
    ],
    busqueda: ['t.identificacion', 't.nombres', 't.apellidos', "t.nombres || ' ' || t.apellidos"],
    unicos: [{ campos: ['identificacion'], mensaje: 'Ya existe un estudiante con ese número de identificación.' }],
    dependientes: [
      { tabla: 'certificados', fk: 'estudiante_id', etiqueta: 'certificados emitidos' },
    ],
    orden: 't.apellidos, t.nombres',
  },
  matriculas: {
    nombre: 'matriculas', tabla: 'matriculas', modulo: 'estudiantes', singular: 'Matrícula', plural: 'Matrículas',
    campos: [
      { name: 'estudiante_id', label: 'Estudiante', type: 'ref', ref: 'estudiantes', required: true },
      { name: 'cursillo_id', label: 'Cursillo', type: 'ref', ref: 'cursillos', required: true },
      { name: 'grupo_id', label: 'Grupo', type: 'ref', ref: 'grupos', filtradoPor: 'cursillo_id' },
      { name: 'fecha_inscripcion', label: 'Fecha de inscripción', type: 'date', required: true, default: hoy },
      { name: 'estado', label: 'Estado de la matrícula', type: 'select', options: ESTADOS_MATRICULA, required: true, default: 'Activa' },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', ancho: true },
    ],
    columnas: [
      { key: 'estudiante', label: 'Estudiante' }, { key: 'identificacion', label: 'Identificación' },
      { key: 'cursillo', label: 'Cursillo' }, { key: 'grupo', label: 'Grupo' },
      { key: 'fecha_inscripcion', label: 'Inscripción', formato: 'fecha' }, { key: 'estado', label: 'Estado', formato: 'estado' },
    ],
    busqueda: ['e.identificacion', 'e.nombres', 'e.apellidos'],
    unicos: [{ campos: ['estudiante_id', 'cursillo_id'], mensaje: 'El estudiante ya está matriculado en ese cursillo.' }],
    dependientes: [{ tabla: 'certificados', fk: 'matricula_id', etiqueta: 'certificados emitidos' }],
    orden: 'c.fecha_inicio DESC, e.apellidos',
  },
} satisfies Record<NombreEntidad, Entidad>;

export const entidad = (n: NombreEntidad): Entidad => ENTIDADES[n] as Entidad;
