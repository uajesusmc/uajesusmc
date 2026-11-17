/**
 * Base de datos de DEMOSTRACIÓN.
 *
 * Se crea en un archivo independiente (nunca en la base real) y todos sus registros
 * están marcados con «DEMO». La interfaz muestra un aviso permanente mientras se usa.
 * Sirve para capacitar al personal y probar el sistema sin afectar información real.
 */
import { AREAS } from '../../shared/constantes';
import { registrar } from './asistencia';
import { construirSesion, crearPrimerAdministrador, guardarUsuario } from './auth';
import { generar } from './certificados';
import { fechaISO, type Contexto } from './comun';
import { escribirConfig } from './config';
import { guardar } from './crud';
import { cambiarEstado, crear as crearClases, listar as listarClases } from './horarios';
import { guardarTematica } from './planeacion';

export const CLAVE_DEMO = 'Demo2027';
export const USUARIOS_DEMO = ['admin-demo', 'coordinador-demo', 'docente-demo', 'secretaria-demo'];

const dias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return fechaISO(d); };

/** Generador pseudoaleatorio determinista (los datos demo son reproducibles). */
function aleatorio(semilla: number) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const NOMBRES = ['Valentina', 'Santiago', 'Isabella', 'Sebastián', 'Mariana', 'Mateo', 'Sofía', 'Samuel', 'Daniela', 'Nicolás',
  'Gabriela', 'Alejandro', 'Camila', 'Juan David', 'Luciana', 'Andrés', 'Valeria', 'Emmanuel', 'Sara', 'Tomás', 'Paula', 'Miguel', 'Laura', 'Felipe'];
const APELLIDOS = ['Pérez', 'Gómez', 'Rodríguez', 'Martínez', 'Herrera', 'Charris', 'De la Hoz', 'Barrios', 'Mendoza', 'Orozco', 'Ariza', 'Polo'];

export async function poblarDemo(ctx: Contexto): Promise<void> {
  crearPrimerAdministrador(ctx, { usuario: 'admin-demo', nombre: 'Administrador DEMO', clave: CLAVE_DEMO });
  const rnd = aleatorio(2027);
  const cfg: Record<string, string> = {
    org_nombre: 'MEIF – SABANALARGA', director_nombre: 'Director(a) DEMO', coordinador_nombre: 'Coordinador(a) DEMO',
    lugar_expedicion: 'Sabanalarga, Atlántico',
  };
  for (const [k, v] of Object.entries(cfg)) escribirConfig(ctx.db, k, v);

  const periodo = guardar(ctx, 'periodos', {
    codigo: 'DEMO-2027', nombre: '[DEMO] Periodo académico 2027', fecha_inicio: dias(-150), fecha_fin: dias(150),
    descripcion: 'Periodo de demostración. No contiene información real.',
  });

  const docentes = AREAS.map((area, i) => guardar(ctx, 'docentes', {
    identificacion: `DEMO-D${i + 1}`, nombres: ['Carlos', 'Patricia', 'Jorge', 'Liliana'][i], apellidos: `DEMO ${APELLIDOS[i + 4]}`,
    telefono: `300000000${i}`, correo: `docente${i + 1}.demo@ejemplo.org`, profesion: ['Licenciado en Matemáticas', 'Estadística', 'Ingeniera de Sistemas', 'Físico'][i],
    especialidad: area, disponibilidad: 'Sábados 7:00–12:00; entre semana en la tarde', observaciones: 'Registro de demostración.',
  }));

  for (const [i, u] of [['coordinador-demo', 2], ['docente-demo', 3], ['secretaria-demo', 4]] as const) {
    guardarUsuario(ctx, {
      usuario: i, nombre: `${i.split('-')[0][0].toUpperCase()}${i.split('-')[0].slice(1)} DEMO`, rol_id: u,
      docente_id: i === 'docente-demo' ? docentes[0] : null, clave: CLAVE_DEMO,
    });
  }
  ctx.db.run("UPDATE usuarios SET debe_cambiar_clave = 0 WHERE usuario LIKE '%-demo'");

  // ------------------------------------------------ cursillo finalizado (con certificados)
  const previo = guardar(ctx, 'cursillos', {
    codigo: 'DEMO-S11', nombre: '[DEMO] Preparación Saber 11°', periodo_id: periodo, modalidad: 'Presencial',
    fecha_inicio: dias(-140), fecha_fin: dias(-100), estado: 'Activo', asistencia_minima: 80, descripcion: 'Cursillo finalizado de demostración.',
  });
  const asigPrevio = [
    guardar(ctx, 'asignaturas', { codigo: 'MAT-S11', nombre: 'Razonamiento cuantitativo', area: 'Matemáticas', cursillo_id: previo, docente_id: docentes[0], intensidad_horaria: 10 }),
    guardar(ctx, 'asignaturas', { codigo: 'FIS-S11', nombre: 'Física para Saber 11°', area: 'Física', cursillo_id: previo, docente_id: docentes[3], intensidad_horaria: 10 }),
  ];
  const grupoPrevio = guardar(ctx, 'grupos', { cursillo_id: previo, nombre: 'Único', jornada: 'Sabatina', cupo: 30, aula: 'Aula 101', docente_id: docentes[0] });

  // ------------------------------------------------ cursillo activo
  const cursillo = guardar(ctx, 'cursillos', {
    codigo: 'DEMO-C2027', nombre: '[DEMO] Cursillo 2027', periodo_id: periodo, modalidad: 'Presencial',
    fecha_inicio: dias(-35), fecha_fin: dias(56), estado: 'Activo', asistencia_minima: 80,
    descripcion: 'Cursillo de demostración de Matemáticas, Estadística, Informática y Física.',
  });
  const asig = [
    guardar(ctx, 'asignaturas', { codigo: 'MAT-01', nombre: 'Matemáticas', area: 'Matemáticas', cursillo_id: cursillo, docente_id: docentes[0], intensidad_horaria: 28, descripcion: 'Álgebra, funciones y geometría.' }),
    guardar(ctx, 'asignaturas', { codigo: 'EST-01', nombre: 'Estadística básica', area: 'Estadística', cursillo_id: cursillo, docente_id: docentes[1], intensidad_horaria: 16 }),
    guardar(ctx, 'asignaturas', { codigo: 'INF-01', nombre: 'Informática y pensamiento computacional', area: 'Informática', cursillo_id: cursillo, docente_id: docentes[2], intensidad_horaria: 16 }),
    guardar(ctx, 'asignaturas', { codigo: 'FIS-01', nombre: 'Física mecánica', area: 'Física', cursillo_id: cursillo, docente_id: docentes[3], intensidad_horaria: 24 }),
  ];
  const grupos = [
    guardar(ctx, 'grupos', { cursillo_id: cursillo, nombre: 'Grupo A', jornada: 'Mañana', cupo: 25, aula: 'Aula 101', docente_id: docentes[0] }),
    guardar(ctx, 'grupos', { cursillo_id: cursillo, nombre: 'Grupo B', jornada: 'Tarde', cupo: 25, aula: 'Aula 102', docente_id: docentes[1] }),
  ];

  // Planeación temática (ejemplo del requerimiento para Matemáticas)
  const planes: Record<number, [string, string, number][]> = {
    [asig[0]]: [['Unidad 1', 'Números reales', 4], ['Unidad 2', 'Expresiones algebraicas', 6], ['Unidad 3', 'Funciones', 8], ['Unidad 4', 'Geometría', 6], ['Unidad 5', 'Estadística básica', 4]],
    [asig[1]]: [['Unidad 1', 'Recolección y organización de datos', 4], ['Unidad 2', 'Medidas de tendencia central', 6], ['Unidad 3', 'Probabilidad', 6]],
    [asig[2]]: [['Unidad 1', 'Algoritmos y diagramas de flujo', 6], ['Unidad 2', 'Hoja de cálculo', 6], ['Unidad 3', 'Programación por bloques', 4]],
    [asig[3]]: [['Unidad 1', 'Cinemática', 8], ['Unidad 2', 'Dinámica', 8], ['Unidad 3', 'Trabajo y energía', 8]],
    [asigPrevio[0]]: [['Unidad 1', 'Interpretación de gráficas y tablas', 5], ['Unidad 2', 'Problemas de proporcionalidad', 5]],
    [asigPrevio[1]]: [['Unidad 1', 'Movimiento y fuerzas', 5], ['Unidad 2', 'Energía y ondas', 5]],
  };
  const tematicas: Record<number, number[]> = {};
  for (const [a, filas] of Object.entries(planes)) {
    tematicas[Number(a)] = filas.map(([unidad, tema, horas], i) => guardarTematica(ctx, {
      asignatura_id: Number(a), unidad, tema, horas_asignadas: horas, objetivo: `Comprender y aplicar ${tema.toLowerCase()}.`,
      subtema: i === 0 ? 'Conceptos básicos y ejercicios guiados' : undefined,
    }));
  }

  // Estudiantes
  const estudiantes: number[] = [];
  for (let i = 0; i < 28; i++) {
    estudiantes.push(guardar(ctx, 'estudiantes', {
      tipo_documento: 'TI', identificacion: `DEMO${String(1000 + i)}`, nombres: NOMBRES[i % NOMBRES.length],
      apellidos: `DEMO ${APELLIDOS[i % APELLIDOS.length]} ${APELLIDOS[(i * 5 + 3) % APELLIDOS.length]}`,
      fecha_nacimiento: `20${String(8 + (i % 3)).padStart(2, '0')}-0${1 + (i % 9)}-1${i % 9}`, institucion: `Institución Educativa DEMO ${1 + (i % 3)}`,
      grado: ['10°', '11°', '9°'][i % 3], telefono: `30100000${String(i).padStart(2, '0')}`, direccion: 'Dirección de demostración',
      acudiente: `Acudiente DEMO ${i + 1}`, telefono_acudiente: `31000000${String(i).padStart(2, '0')}`,
    }));
  }
  // 10 estudiantes en el cursillo previo; 24 en el activo (12 por grupo)
  for (let i = 0; i < 10; i++) guardar(ctx, 'matriculas', { estudiante_id: estudiantes[i], cursillo_id: previo, grupo_id: grupoPrevio, fecha_inscripcion: dias(-145), estado: 'Activa' });
  for (let i = 4; i < 28; i++) {
    guardar(ctx, 'matriculas', { estudiante_id: estudiantes[i], cursillo_id: cursillo, grupo_id: grupos[i % 2], fecha_inscripcion: dias(-40), estado: 'Activa' });
  }

  // Horarios: el cursillo previo los sábados; el activo con franjas sin cruces.
  const lotes: [number, number, number, number, number[], string, string, string, number, string, string][] = [
    // cursillo, asignatura, docente, grupo, días, inicio, fin, aula, cursillo, desde, hasta
    [previo, asigPrevio[0], docentes[0], grupoPrevio, [6], '07:00', '09:30', 'Aula 101', 0, dias(-140), dias(-110)],
    [previo, asigPrevio[1], docentes[3], grupoPrevio, [6], '09:30', '12:00', 'Aula 101', 0, dias(-140), dias(-110)],
    [cursillo, asig[0], docentes[0], grupos[0], [6], '07:00', '09:00', 'Aula 101', 0, dias(-35), dias(56)],
    [cursillo, asig[0], docentes[0], grupos[1], [6], '09:00', '11:00', 'Aula 102', 0, dias(-35), dias(56)],
    [cursillo, asig[3], docentes[3], grupos[0], [6], '09:00', '11:00', 'Aula 101', 0, dias(-35), dias(56)],
    [cursillo, asig[3], docentes[3], grupos[1], [6], '07:00', '09:00', 'Aula 102', 0, dias(-35), dias(56)],
    [cursillo, asig[1], docentes[1], grupos[0], [3], '14:00', '16:00', 'Aula 101', 0, dias(-35), dias(56)],
    [cursillo, asig[1], docentes[1], grupos[1], [4], '14:00', '16:00', 'Aula 102', 0, dias(-35), dias(56)],
    [cursillo, asig[2], docentes[2], grupos[0], [5], '14:00', '16:00', 'Sala de informática', 0, dias(-35), dias(56)],
    [cursillo, asig[2], docentes[2], grupos[1], [5], '16:00', '18:00', 'Sala de informática', 0, dias(-35), dias(56)],
  ];
  for (const [cid, aid, did, gid, ds, ini, fin, aula, , desde, hasta] of lotes) {
    crearClases(ctx, { base: { cursillo_id: cid, asignatura_id: aid, docente_id: did, grupo_id: gid, hora_inicio: ini, hora_fin: fin, aula }, dias: ds, desde, hasta });
  }
  // Vincula cada clase a la temática correspondiente según las horas de la planeación.
  for (const aid of [...asig, ...asigPrevio]) {
    const temas = ctx.db.all('SELECT id, horas_asignadas FROM tematicas WHERE planeacion_id = (SELECT id FROM planeaciones WHERE asignatura_id = ?) ORDER BY orden', [aid]);
    const porGrupo: Record<number, any[]> = {};
    for (const c of listarClases(ctx, { asignaturaId: aid })) (porGrupo[c.grupo_id] ??= []).push(c);
    for (const clases of Object.values(porGrupo)) {
      let t = 0; let acumulado = 0;
      for (const c of clases) {
        if (!temas[t]) break;
        ctx.db.run('UPDATE horarios SET tematica_id = ? WHERE id = ?', [temas[t].id, c.id]);
        acumulado += c.horas;
        if (acumulado >= temas[t].horas_asignadas) { t++; acumulado = 0; }
      }
    }
  }
  // Asistencia de las clases pasadas (se marcan ejecutadas automáticamente).
  const hoy = fechaISO(new Date());
  for (const c of listarClases(ctx, { hasta: hoy })) {
    if (c.fecha === hoy) continue;
    const { estudiantes: lista } = (await import('./asistencia')).planilla(ctx, c.id);
    registrar(ctx, c.id, lista.map((e: any) => {
      const r = rnd();
      return { estudiante_id: e.estudiante_id, estado: r < 0.82 ? 'Asistió' : r < 0.9 ? 'Retardo' : r < 0.95 ? 'Excusa' : 'Ausente' } as const;
    }));
  }
  // Algunas clases futuras canceladas como ejemplo
  const futura = listarClases(ctx, { desde: dias(20), cursilloId: cursillo })[0];
  if (futura) cambiarEstado(ctx, futura.id, 'Cancelada');

  // Cierra el cursillo previo y emite certificados.
  const mats = ctx.db.all<{ id: number }>('SELECT id FROM matriculas WHERE cursillo_id = ?', [previo]).map((m) => m.id);
  ctx.db.run("UPDATE matriculas SET estado = 'Finalizada' WHERE cursillo_id = ?", [previo]);
  await generar(ctx, mats);
  ctx.db.run("UPDATE cursillos SET estado = 'Finalizado' WHERE id = ?", [previo]);
  ctx.db.run("UPDATE usuarios SET debe_cambiar_clave = 0 WHERE usuario LIKE '%-demo'");
  ctx.sesion = construirSesion(ctx.db, ctx.sesion!.id);
}
