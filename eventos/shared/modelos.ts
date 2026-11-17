/** Definiciones compartidas entre la interfaz y el proceso principal. */

export const AREAS = ['Matemáticas', 'Estadística', 'Informática', 'Física', 'General'] as const;
export const TIPOS_EVENTO = [
  'Cursillo', 'Preparación Saber 11°', 'Olimpiada', 'Feria de la ciencia', 'Seminario', 'Taller', 'Congreso', 'Convocatoria especial', 'Otro',
] as const;
export const ESTADOS_EVENTO = ['Planeado', 'En curso', 'Finalizado', 'Cancelado'] as const;
export const MODALIDADES = ['Presencial', 'Virtual', 'Híbrida'] as const;
export const TIPOS_ACTIVIDAD = ['Ceremonia', 'Conferencia', 'Clase', 'Taller', 'Competencia', 'Exposición', 'Receso', 'Otra'] as const;
export const TIPOS_DOCUMENTO = ['TI', 'CC', 'RC', 'CE', 'PPT', 'Pasaporte'] as const;
export const GRADOS = ['6°', '7°', '8°', '9°', '10°', '11°', 'Egresado', 'Docente', 'Otro'] as const;
export const ROLES = { admin: 'Administrador', organizador: 'Organizador', consulta: 'Solo consulta' } as const;
export type Rol = keyof typeof ROLES;

export type TipoCampo = 'text' | 'textarea' | 'number' | 'date' | 'email' | 'tel' | 'select';
export interface Campo {
  name: string; label: string; type: TipoCampo; required?: boolean; options?: readonly string[];
  min?: number; max?: number; maxLength?: number; ancho?: boolean; ayuda?: string; default?: string | number;
}

export type NombreModelo = 'eventos' | 'ponentes' | 'participantes';

export const MODELOS: Record<NombreModelo, { singular: string; plural: string; campos: Campo[]; unico?: string }> = {
  eventos: {
    singular: 'Evento', plural: 'Eventos',
    campos: [
      { name: 'nombre', label: 'Nombre del evento', type: 'text', required: true, maxLength: 150, ancho: true },
      { name: 'tipo', label: 'Tipo de evento', type: 'select', options: TIPOS_EVENTO, required: true, default: 'Cursillo' },
      { name: 'modalidad', label: 'Modalidad', type: 'select', options: MODALIDADES, required: true, default: 'Presencial' },
      { name: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true },
      { name: 'fecha_fin', label: 'Fecha de finalización', type: 'date', required: true },
      { name: 'lugar', label: 'Lugar', type: 'text', maxLength: 150 },
      { name: 'estado', label: 'Estado', type: 'select', options: ESTADOS_EVENTO, required: true, default: 'Planeado' },
      { name: 'cupo', label: 'Cupo máximo de participantes', type: 'number', min: 1, max: 100000 },
      {
        name: 'asistencia_minima', label: 'Asistencia mínima para certificar (%)', type: 'number', min: 0, max: 100, required: true, default: 80,
        ayuda: 'Porcentaje de actividades a las que debe asistir el participante para recibir certificado.',
      },
      { name: 'descripcion', label: 'Descripción', type: 'textarea', ancho: true },
    ],
  },
  ponentes: {
    singular: 'Ponente', plural: 'Ponentes y docentes', unico: 'identificacion',
    campos: [
      { name: 'identificacion', label: 'Identificación', type: 'text', required: true, maxLength: 20 },
      { name: 'nombres', label: 'Nombres', type: 'text', required: true, maxLength: 80 },
      { name: 'apellidos', label: 'Apellidos', type: 'text', required: true, maxLength: 80 },
      { name: 'area', label: 'Área', type: 'select', options: AREAS },
      { name: 'telefono', label: 'Teléfono', type: 'tel', maxLength: 30 },
      { name: 'correo', label: 'Correo electrónico', type: 'email', maxLength: 120 },
      { name: 'profesion', label: 'Profesión / especialidad', type: 'text', maxLength: 150, ancho: true },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', ancho: true },
    ],
  },
  participantes: {
    singular: 'Participante', plural: 'Participantes', unico: 'identificacion',
    campos: [
      { name: 'tipo_documento', label: 'Tipo de documento', type: 'select', options: TIPOS_DOCUMENTO, required: true, default: 'TI' },
      { name: 'identificacion', label: 'Número de identificación', type: 'text', required: true, maxLength: 20 },
      { name: 'nombres', label: 'Nombres', type: 'text', required: true, maxLength: 80 },
      { name: 'apellidos', label: 'Apellidos', type: 'text', required: true, maxLength: 80 },
      { name: 'institucion', label: 'Institución educativa', type: 'text', maxLength: 150 },
      { name: 'grado', label: 'Grado', type: 'select', options: GRADOS },
      { name: 'telefono', label: 'Teléfono', type: 'tel', maxLength: 30 },
      { name: 'correo', label: 'Correo electrónico', type: 'email', maxLength: 120 },
    ],
  },
};

export const CONFIG_POR_DEFECTO: Record<string, string> = {
  org_nombre: 'MEIF – SABANALARGA',
  org_subtitulo: 'Matemáticas, Estadística, Informática y Física',
  lugar_expedicion: 'Sabanalarga, Atlántico',
  director_nombre: '',
  director_cargo: 'Director(a)',
  cert_titulo: 'CERTIFICADO DE PARTICIPACIÓN',
  cert_texto: 'Por su participación en el evento «{evento}», realizado del {fecha_inicio} al {fecha_fin} en {lugar}, con una intensidad de {horas} horas.',
  cert_color_primario: '#0B2545',
  cert_color_secundario: '#C9A227',
  banner_evento_id: '',
  respaldo_automatico: '1',
};
