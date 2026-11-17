/**
 * Esquema relacional de MEIF – SABANALARGA.
 *
 * Convenciones (pensadas para una futura sincronización en la nube / multiusuario):
 *  - Toda tabla principal tiene `uuid` (identificador global estable entre equipos),
 *    `creado_en`, `actualizado_en` y `eliminado_en` (eliminación lógica / papelera).
 *  - Las restricciones de unicidad se aplican solo a registros no eliminados
 *    (índices únicos parciales), de modo que un registro en la papelera no bloquea
 *    volver a crearlo.
 *  - Las migraciones son incrementales y versionadas en `MIGRACIONES`; nunca se
 *    modifica una migración ya publicada, solo se agregan nuevas. Así una
 *    actualización de la aplicación conserva los datos existentes.
 */

const AUDIT_COLS = `
  uuid TEXT NOT NULL UNIQUE,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  eliminado_en TEXT`;

export const MIGRACIONES: string[] = [
  // ---------------------------------------------------------------- v1
  `
  CREATE TABLE roles (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL
  );

  CREATE TABLE permisos (
    rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    modulo TEXT NOT NULL,
    ver INTEGER NOT NULL DEFAULT 0,
    editar INTEGER NOT NULL DEFAULT 0,
    eliminar INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (rol_id, modulo)
  );

  CREATE TABLE docentes (
    id INTEGER PRIMARY KEY,
    identificacion TEXT NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    telefono TEXT,
    correo TEXT,
    profesion TEXT,
    especialidad TEXT,
    disponibilidad TEXT,
    observaciones TEXT,
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_docentes_ident ON docentes(identificacion) WHERE eliminado_en IS NULL;

  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    usuario TEXT NOT NULL,
    nombre TEXT NOT NULL,
    clave_hash TEXT NOT NULL,
    rol_id INTEGER NOT NULL REFERENCES roles(id),
    docente_id INTEGER REFERENCES docentes(id),
    activo INTEGER NOT NULL DEFAULT 1,
    debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
    ultimo_acceso TEXT,
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_usuarios_usuario ON usuarios(lower(usuario)) WHERE eliminado_en IS NULL;

  CREATE TABLE periodos (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    descripcion TEXT,
    ${AUDIT_COLS},
    CHECK (fecha_fin >= fecha_inicio)
  );
  CREATE UNIQUE INDEX ux_periodos_codigo ON periodos(codigo) WHERE eliminado_en IS NULL;

  CREATE TABLE cursillos (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    periodo_id INTEGER NOT NULL REFERENCES periodos(id),
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    modalidad TEXT NOT NULL DEFAULT 'Presencial',
    descripcion TEXT,
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Finalizado','Suspendido')),
    asistencia_minima REAL NOT NULL DEFAULT 80 CHECK (asistencia_minima BETWEEN 0 AND 100),
    ${AUDIT_COLS},
    CHECK (fecha_fin >= fecha_inicio)
  );
  CREATE UNIQUE INDEX ux_cursillos_codigo ON cursillos(codigo) WHERE eliminado_en IS NULL;
  CREATE INDEX ix_cursillos_periodo ON cursillos(periodo_id);

  CREATE TABLE asignaturas (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    area TEXT NOT NULL CHECK (area IN ('Matemáticas','Estadística','Informática','Física')),
    descripcion TEXT,
    intensidad_horaria REAL NOT NULL CHECK (intensidad_horaria > 0),
    docente_id INTEGER REFERENCES docentes(id),
    cursillo_id INTEGER NOT NULL REFERENCES cursillos(id),
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_asignaturas_codigo ON asignaturas(cursillo_id, codigo) WHERE eliminado_en IS NULL;
  CREATE INDEX ix_asignaturas_docente ON asignaturas(docente_id);

  CREATE TABLE grupos (
    id INTEGER PRIMARY KEY,
    cursillo_id INTEGER NOT NULL REFERENCES cursillos(id),
    nombre TEXT NOT NULL,
    jornada TEXT,
    cupo INTEGER CHECK (cupo IS NULL OR cupo > 0),
    aula TEXT,
    docente_id INTEGER REFERENCES docentes(id),
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_grupos_nombre ON grupos(cursillo_id, nombre) WHERE eliminado_en IS NULL;

  CREATE TABLE estudiantes (
    id INTEGER PRIMARY KEY,
    identificacion TEXT NOT NULL,
    tipo_documento TEXT NOT NULL DEFAULT 'TI',
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    fecha_nacimiento TEXT,
    institucion TEXT,
    grado TEXT,
    telefono TEXT,
    correo TEXT,
    direccion TEXT,
    acudiente TEXT,
    telefono_acudiente TEXT,
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_estudiantes_ident ON estudiantes(identificacion) WHERE eliminado_en IS NULL;
  CREATE INDEX ix_estudiantes_nombre ON estudiantes(apellidos, nombres);

  CREATE TABLE matriculas (
    id INTEGER PRIMARY KEY,
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id),
    cursillo_id INTEGER NOT NULL REFERENCES cursillos(id),
    grupo_id INTEGER REFERENCES grupos(id),
    fecha_inscripcion TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa','Retirada','Finalizada','Anulada')),
    observaciones TEXT,
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_matriculas ON matriculas(estudiante_id, cursillo_id) WHERE eliminado_en IS NULL;
  CREATE INDEX ix_matriculas_grupo ON matriculas(grupo_id);

  CREATE TABLE matricula_asignaturas (
    matricula_id INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
    asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
    PRIMARY KEY (matricula_id, asignatura_id)
  );

  CREATE TABLE planeaciones (
    id INTEGER PRIMARY KEY,
    asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id),
    docente_id INTEGER REFERENCES docentes(id),
    observaciones TEXT,
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_planeaciones ON planeaciones(asignatura_id) WHERE eliminado_en IS NULL;

  CREATE TABLE tematicas (
    id INTEGER PRIMARY KEY,
    planeacion_id INTEGER NOT NULL REFERENCES planeaciones(id),
    orden INTEGER NOT NULL DEFAULT 0,
    unidad TEXT NOT NULL,
    tema TEXT NOT NULL,
    subtema TEXT,
    objetivo TEXT,
    fecha_programada TEXT,
    horas_asignadas REAL NOT NULL DEFAULT 0 CHECK (horas_asignadas >= 0),
    horas_ejecutadas REAL NOT NULL DEFAULT 0 CHECK (horas_ejecutadas >= 0),
    material TEXT,
    observaciones TEXT,
    ${AUDIT_COLS}
  );
  CREATE INDEX ix_tematicas_plan ON tematicas(planeacion_id, orden);

  CREATE TABLE horarios (
    id INTEGER PRIMARY KEY,
    cursillo_id INTEGER NOT NULL REFERENCES cursillos(id),
    asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id),
    docente_id INTEGER NOT NULL REFERENCES docentes(id),
    grupo_id INTEGER NOT NULL REFERENCES grupos(id),
    tematica_id INTEGER REFERENCES tematicas(id),
    fecha TEXT NOT NULL,
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    aula TEXT,
    estado TEXT NOT NULL DEFAULT 'Programada' CHECK (estado IN ('Programada','Ejecutada','Cancelada')),
    observaciones TEXT,
    ${AUDIT_COLS},
    CHECK (hora_fin > hora_inicio)
  );
  CREATE INDEX ix_horarios_fecha ON horarios(fecha, hora_inicio);
  CREATE INDEX ix_horarios_docente ON horarios(docente_id, fecha);
  CREATE INDEX ix_horarios_grupo ON horarios(grupo_id, fecha);

  CREATE TABLE materiales (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    descripcion TEXT,
    cursillo_id INTEGER REFERENCES cursillos(id),
    asignatura_id INTEGER REFERENCES asignaturas(id),
    tematica_id INTEGER REFERENCES tematicas(id),
    docente_id INTEGER REFERENCES docentes(id),
    fecha_publicacion TEXT NOT NULL,
    archivo_nombre TEXT NOT NULL,
    archivo_ruta TEXT NOT NULL,
    archivo_tamano INTEGER NOT NULL DEFAULT 0,
    ${AUDIT_COLS}
  );
  CREATE INDEX ix_materiales_asig ON materiales(asignatura_id);

  CREATE TABLE asistencias (
    id INTEGER PRIMARY KEY,
    horario_id INTEGER NOT NULL REFERENCES horarios(id) ON DELETE CASCADE,
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id),
    estado TEXT NOT NULL CHECK (estado IN ('Asistió','Ausente','Retardo','Excusa')),
    observacion TEXT,
    registrado_por INTEGER REFERENCES usuarios(id),
    registrado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (horario_id, estudiante_id)
  );
  CREATE INDEX ix_asistencias_est ON asistencias(estudiante_id);

  CREATE TABLE certificados (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    matricula_id INTEGER NOT NULL REFERENCES matriculas(id),
    estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id),
    cursillo_id INTEGER NOT NULL REFERENCES cursillos(id),
    fecha_emision TEXT NOT NULL,
    horas_certificadas REAL NOT NULL,
    porcentaje_asistencia REAL NOT NULL,
    detalle TEXT NOT NULL,
    firma_hash TEXT NOT NULL,
    archivo_ruta TEXT,
    emitido_por INTEGER REFERENCES usuarios(id),
    anulado INTEGER NOT NULL DEFAULT 0,
    motivo_anulacion TEXT,
    autorizacion TEXT,
    ${AUDIT_COLS}
  );
  CREATE UNIQUE INDEX ux_cert_vigente ON certificados(estudiante_id, cursillo_id) WHERE anulado = 0;

  CREATE TABLE auditoria (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    usuario_id INTEGER,
    usuario TEXT,
    accion TEXT NOT NULL,
    entidad TEXT,
    entidad_id INTEGER,
    detalle TEXT
  );
  CREATE INDEX ix_auditoria_fecha ON auditoria(fecha);

  CREATE TABLE configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );
  `,
];

/** Tablas que admiten eliminación lógica (papelera). */
export const TABLAS_PAPELERA = [
  'periodos', 'cursillos', 'docentes', 'asignaturas', 'grupos', 'estudiantes',
  'matriculas', 'horarios', 'tematicas', 'materiales', 'usuarios', 'planeaciones',
] as const;
