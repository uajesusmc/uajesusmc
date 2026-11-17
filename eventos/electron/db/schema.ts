/**
 * Esquema de MEIF Eventos.
 *
 * - Los eventos se organizan por año. Cada evento puede tener su foto inaugural,
 *   que se usa como banner de la aplicación.
 * - Tablas principales con `uuid`, marcas de tiempo y `eliminado_en` (papelera),
 *   listas para una futura sincronización.
 * - Migraciones versionadas: solo se agregan, nunca se modifican, para que las
 *   actualizaciones conserven los datos.
 */
const COLS = `
  uuid TEXT NOT NULL UNIQUE,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  eliminado_en TEXT`;

export const MIGRACIONES: string[] = [
  `
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    usuario TEXT NOT NULL,
    nombre TEXT NOT NULL,
    clave_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('admin','organizador','consulta')),
    activo INTEGER NOT NULL DEFAULT 1,
    debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
    ultimo_acceso TEXT,
    ${COLS}
  );
  CREATE UNIQUE INDEX ux_usuarios ON usuarios(lower(usuario)) WHERE eliminado_en IS NULL;

  CREATE TABLE eventos (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    anio INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    lugar TEXT,
    modalidad TEXT NOT NULL DEFAULT 'Presencial',
    estado TEXT NOT NULL DEFAULT 'Planeado' CHECK (estado IN ('Planeado','En curso','Finalizado','Cancelado')),
    cupo INTEGER CHECK (cupo IS NULL OR cupo > 0),
    asistencia_minima REAL NOT NULL DEFAULT 80 CHECK (asistencia_minima BETWEEN 0 AND 100),
    descripcion TEXT,
    foto TEXT,
    ${COLS},
    CHECK (fecha_fin >= fecha_inicio)
  );
  CREATE INDEX ix_eventos_anio ON eventos(anio, fecha_inicio);

  CREATE TABLE ponentes (
    id INTEGER PRIMARY KEY,
    identificacion TEXT NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    telefono TEXT,
    correo TEXT,
    profesion TEXT,
    area TEXT,
    observaciones TEXT,
    ${COLS}
  );
  CREATE UNIQUE INDEX ux_ponentes ON ponentes(identificacion) WHERE eliminado_en IS NULL;

  CREATE TABLE participantes (
    id INTEGER PRIMARY KEY,
    tipo_documento TEXT NOT NULL DEFAULT 'TI',
    identificacion TEXT NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    institucion TEXT,
    grado TEXT,
    telefono TEXT,
    correo TEXT,
    ${COLS}
  );
  CREATE UNIQUE INDEX ux_participantes ON participantes(identificacion) WHERE eliminado_en IS NULL;
  CREATE INDEX ix_participantes_nombre ON participantes(apellidos, nombres);

  CREATE TABLE inscripciones (
    id INTEGER PRIMARY KEY,
    evento_id INTEGER NOT NULL REFERENCES eventos(id),
    participante_id INTEGER NOT NULL REFERENCES participantes(id),
    fecha TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Inscrito' CHECK (estado IN ('Inscrito','Cancelado')),
    UNIQUE (evento_id, participante_id)
  );

  CREATE TABLE actividades (
    id INTEGER PRIMARY KEY,
    evento_id INTEGER NOT NULL REFERENCES eventos(id),
    titulo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    area TEXT,
    ponente_id INTEGER REFERENCES ponentes(id),
    fecha TEXT NOT NULL,
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL,
    lugar TEXT,
    descripcion TEXT,
    ${COLS},
    CHECK (hora_fin > hora_inicio)
  );
  CREATE INDEX ix_actividades ON actividades(evento_id, fecha, hora_inicio);

  CREATE TABLE asistencias (
    actividad_id INTEGER NOT NULL REFERENCES actividades(id),
    participante_id INTEGER NOT NULL REFERENCES participantes(id),
    presente INTEGER NOT NULL,
    registrado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (actividad_id, participante_id)
  );

  CREATE TABLE certificados (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    evento_id INTEGER NOT NULL REFERENCES eventos(id),
    participante_id INTEGER NOT NULL REFERENCES participantes(id),
    fecha_emision TEXT NOT NULL,
    horas REAL NOT NULL,
    porcentaje REAL NOT NULL,
    detalle TEXT NOT NULL,
    firma_hash TEXT NOT NULL,
    anulado INTEGER NOT NULL DEFAULT 0,
    motivo_anulacion TEXT,
    emitido_por INTEGER REFERENCES usuarios(id),
    creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE UNIQUE INDEX ux_cert_vigente ON certificados(evento_id, participante_id) WHERE anulado = 0;

  CREATE TABLE auditoria (
    id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    usuario TEXT,
    accion TEXT NOT NULL,
    detalle TEXT
  );

  CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT);
  `,
  // ------------------------------------------------ v2: organización del evento
  `
  CREATE TABLE aulas (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    capacidad INTEGER CHECK (capacidad IS NULL OR capacidad > 0),
    ubicacion TEXT,
    recursos TEXT,
    ${COLS}
  );
  CREATE UNIQUE INDEX ux_aulas ON aulas(lower(nombre)) WHERE eliminado_en IS NULL;

  CREATE TABLE cursillos (
    id INTEGER PRIMARY KEY,
    evento_id INTEGER NOT NULL REFERENCES eventos(id),
    nombre TEXT NOT NULL,
    area TEXT,
    nivel TEXT,
    docente_id INTEGER REFERENCES ponentes(id),
    aula_id INTEGER REFERENCES aulas(id),
    cupo INTEGER CHECK (cupo IS NULL OR cupo > 0),
    descripcion TEXT,
    ${COLS}
  );
  CREATE UNIQUE INDEX ux_cursillos ON cursillos(evento_id, lower(nombre)) WHERE eliminado_en IS NULL;

  ALTER TABLE actividades ADD COLUMN cursillo_id INTEGER REFERENCES cursillos(id);
  ALTER TABLE actividades ADD COLUMN aula_id INTEGER REFERENCES aulas(id);
  CREATE INDEX ix_actividades_cursillo ON actividades(cursillo_id);
  `,
  // ------------------------------------- v3: firmas del Presidente y del Secretario
  `
  ALTER TABLE usuarios ADD COLUMN firmante TEXT CHECK (firmante IS NULL OR firmante IN ('presidente','secretario'));
  CREATE UNIQUE INDEX ux_usuarios_firmante ON usuarios(firmante) WHERE firmante IS NOT NULL AND eliminado_en IS NULL;
  -- El «director» configurado antes pasa a ser el Presidente.
  INSERT OR IGNORE INTO configuracion (clave, valor) SELECT 'presidente_nombre', valor FROM configuracion WHERE clave = 'director_nombre' AND valor <> '';
  INSERT OR IGNORE INTO configuracion (clave, valor) SELECT 'img_firma_presidente', valor FROM configuracion WHERE clave = 'img_firma_director' AND valor <> '';
  `,
  // --------------------------------------------- v4: documentos institucionales
  `
  CREATE TABLE documentos (
    id INTEGER PRIMARY KEY,
    tipo TEXT NOT NULL,
    consecutivo TEXT NOT NULL UNIQUE,
    anio INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    ciudad TEXT,
    destinatario TEXT,
    asunto TEXT NOT NULL,
    cuerpo TEXT NOT NULL,
    despedida TEXT,
    firmantes TEXT NOT NULL DEFAULT '',
    evento_id INTEGER REFERENCES eventos(id),
    creado_por TEXT,
    ${COLS}
  );
  CREATE UNIQUE INDEX ux_documentos_numero ON documentos(tipo, anio, numero);
  `,
  // ------------------------------------------------------------- v5: miembros
  `
  CREATE TABLE miembros (
    id INTEGER PRIMARY KEY,
    tipo_documento TEXT NOT NULL DEFAULT 'CC',
    identificacion TEXT NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    cargo TEXT,
    area TEXT,
    profesion TEXT,
    fecha_nacimiento TEXT,
    telefono TEXT,
    correo TEXT,
    direccion TEXT,
    municipio TEXT,
    fecha_ingreso TEXT,
    estado TEXT NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo','Inactivo','Retirado')),
    observaciones TEXT,
    ${COLS}
  );
  CREATE UNIQUE INDEX ux_miembros ON miembros(identificacion) WHERE eliminado_en IS NULL;
  CREATE INDEX ix_miembros_nombre ON miembros(apellidos, nombres);
  `,
];
