/** Constantes compartidas entre el proceso principal y la interfaz. */

export const ORGANIZACION = 'MEIF – SABANALARGA';
export const ORGANIZACION_LARGA = 'Matemáticas, Estadística, Informática y Física';

export const AREAS = ['Matemáticas', 'Estadística', 'Informática', 'Física'] as const;
export const ESTADOS_CURSILLO = ['Activo', 'Finalizado', 'Suspendido'] as const;
export const MODALIDADES = ['Presencial', 'Virtual', 'Híbrida'] as const;
export const ESTADOS_MATRICULA = ['Activa', 'Retirada', 'Finalizada', 'Anulada'] as const;
export const ESTADOS_HORARIO = ['Programada', 'Ejecutada', 'Cancelada'] as const;
export const ESTADOS_ASISTENCIA = ['Asistió', 'Ausente', 'Retardo', 'Excusa'] as const;
export const TIPOS_DOCUMENTO = ['TI', 'CC', 'RC', 'CE', 'PPT', 'Pasaporte'] as const;
export const JORNADAS = ['Mañana', 'Tarde', 'Noche', 'Sabatina', 'Dominical'] as const;
export const GRADOS = ['6°', '7°', '8°', '9°', '10°', '11°', 'Egresado', 'Otro'] as const;
export const TIPOS_MATERIAL = [
  'Guía', 'Documento', 'Presentación', 'Taller', 'Libro', 'Imagen', 'Material complementario',
] as const;
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

export type EstadoAsistencia = (typeof ESTADOS_ASISTENCIA)[number];

/** Módulos del menú lateral (también son las unidades de permiso). */
export const MODULOS = [
  { id: 'inicio', nombre: 'Inicio' },
  { id: 'cursillos', nombre: 'Periodos y cursillos' },
  { id: 'docentes', nombre: 'Docentes' },
  { id: 'estudiantes', nombre: 'Estudiantes' },
  { id: 'asignaturas', nombre: 'Asignaturas' },
  { id: 'grupos', nombre: 'Grupos' },
  { id: 'horarios', nombre: 'Horarios' },
  { id: 'planeacion', nombre: 'Planeación temática' },
  { id: 'material', nombre: 'Material educativo' },
  { id: 'asistencia', nombre: 'Asistencia' },
  { id: 'certificados', nombre: 'Certificados' },
  { id: 'reportes', nombre: 'Reportes' },
  { id: 'usuarios', nombre: 'Usuarios' },
  { id: 'configuracion', nombre: 'Configuración' },
] as const;
export type Modulo = (typeof MODULOS)[number]['id'];
export type Accion = 'ver' | 'editar' | 'eliminar';

export const ROLES = [
  { codigo: 'superadmin', nombre: 'Superadministrador' },
  { codigo: 'coordinador', nombre: 'Coordinador académico' },
  { codigo: 'docente', nombre: 'Docente' },
  { codigo: 'secretaria', nombre: 'Secretaría' },
] as const;
export type CodigoRol = (typeof ROLES)[number]['codigo'];

type Perm = [ver: 0 | 1, editar: 0 | 1, eliminar: 0 | 1];
const TODO: Perm = [1, 1, 1];
const VER: Perm = [1, 0, 0];
const EDITAR: Perm = [1, 1, 0];
const NADA: Perm = [0, 0, 0];

/** Permisos por defecto de cada rol (editables por el superadministrador). */
export const PERMISOS_POR_DEFECTO: Record<CodigoRol, Record<Modulo, Perm>> = {
  superadmin: Object.fromEntries(MODULOS.map((m) => [m.id, TODO])) as Record<Modulo, Perm>,
  coordinador: {
    inicio: VER, cursillos: TODO, docentes: TODO, estudiantes: TODO, asignaturas: TODO, grupos: TODO,
    horarios: TODO, planeacion: TODO, material: TODO, asistencia: TODO, certificados: TODO,
    reportes: VER, usuarios: NADA, configuracion: EDITAR,
  },
  docente: {
    inicio: VER, cursillos: VER, docentes: VER, estudiantes: VER, asignaturas: VER, grupos: VER,
    horarios: VER, planeacion: EDITAR, material: TODO, asistencia: EDITAR, certificados: NADA,
    reportes: VER, usuarios: NADA, configuracion: NADA,
  },
  secretaria: {
    inicio: VER, cursillos: VER, docentes: VER, estudiantes: TODO, asignaturas: VER, grupos: EDITAR,
    horarios: VER, planeacion: VER, material: VER, asistencia: VER, certificados: EDITAR,
    reportes: VER, usuarios: NADA, configuracion: NADA,
  },
};

/** Claves de configuración y sus valores por defecto. */
export const CONFIG_POR_DEFECTO: Record<string, string> = {
  org_nombre: 'MEIF – SABANALARGA',
  org_subtitulo: 'Matemáticas, Estadística, Informática y Física',
  org_nit: '',
  org_direccion: '',
  org_telefono: '',
  lugar_expedicion: 'Sabanalarga, Atlántico',
  director_nombre: '',
  director_cargo: 'Director(a)',
  coordinador_nombre: '',
  coordinador_cargo: 'Coordinador(a) académico(a)',
  cert_titulo: 'CERTIFICADO DE PARTICIPACIÓN',
  cert_texto:
    'Por haber cursado y aprobado satisfactoriamente el {cursillo}, realizado del {fecha_inicio} al {fecha_fin}, con una intensidad horaria certificada de {horas} horas.',
  cert_color_primario: '#0B2545',
  cert_color_secundario: '#C9A227',
  cert_mostrar_coordinador: '1',
  respaldo_automatico: '1',
  respaldos_conservar: '15',
};
