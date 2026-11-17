/** Módulo 14 (y 12, parte 2): Configuración institucional, diseño del certificado, respaldos y papelera. */
import { useCallback, useEffect, useState } from 'react';
import { Archive, Building2, DatabaseBackup, Eye, FlaskConical, FolderOpen, Image as IconoImagen, Info, Palette, RotateCcw, Save, Trash2, Upload, UploadCloud } from 'lucide-react';
import type { Modulo } from '../../shared/constantes';
import { api, fmtBytes, fmtFechaHora } from '../api';
import { CampoTexto, Emblema, Insignia, Pagina, Pestanas, Tabla, Tarjeta } from '../components/ui';
import { useApp } from '../estado';

const TABLAS: Record<string, string> = {
  periodos: 'Periodo', cursillos: 'Cursillo', docentes: 'Docente', asignaturas: 'Asignatura', grupos: 'Grupo', estudiantes: 'Estudiante',
  matriculas: 'Matrícula', horarios: 'Clase', tematicas: 'Temática', materiales: 'Material', usuarios: 'Usuario', planeaciones: 'Planeación',
};

function FormConfig({ claves, children }: { claves: [string, string, string?, string?][]; children?: React.ReactNode }) {
  const { config, intentar, recargarConfig, puede } = useApp();
  const [d, setD] = useState<Record<string, string>>({});
  useEffect(() => setD(Object.fromEntries(claves.map(([k]) => [k, config[k] ?? '']))), [config]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = async () => { if (await intentar(() => api('config.guardar', d), 'Configuración guardada.') !== undefined) recargarConfig(); };
  return (
    <>
      <div className="form">
        {claves.map(([k, label, tipo, ayuda]) => (tipo === 'check'
          ? <div className="campo" key={k}><label>{label}</label><label className="check"><input type="checkbox" checked={d[k] === '1'} onChange={(e) => setD({ ...d, [k]: e.target.checked ? '1' : '0' })} /> Sí</label></div>
          : <CampoTexto key={k} label={label} tipo={tipo ?? 'text'} valor={d[k]} onCambio={(v) => setD({ ...d, [k]: v })} ayuda={ayuda} className={tipo === 'textarea' ? 'ancho' : ''} />))}
      </div>
      <div className="fila mt">{children}<div className="espacio" />{puede('configuracion', 'editar') && <button className="btn primario" onClick={guardar}><Save size={15} /> Guardar</button>}</div>
    </>
  );
}

function Imagenes() {
  const { imagenes, intentar, recargarConfig, puede } = useApp();
  const items: [string, string, string][] = [
    ['logo', 'Logotipo de MEIF', 'Aparece en el menú, la pantalla principal, los reportes y los certificados. Recomendado: PNG cuadrado con fondo transparente.'],
    ['firma_director', 'Firma del director(a)', 'Imagen escaneada de la firma (PNG con fondo transparente).'],
    ['firma_coordinador', 'Firma del coordinador(a)', 'Opcional: segunda firma del certificado.'],
  ];
  return (
    <div className="rejilla c3">
      {items.map(([k, titulo, ayuda]) => (
        <Tarjeta key={k} titulo={titulo}>
          <div className="imagen-config mb">{imagenes[k] ? <img src={imagenes[k]!} alt={titulo} /> : k === 'logo' ? <Emblema tam={80} /> : <span className="suave peq">Sin imagen</span>}</div>
          <p className="peq suave">{ayuda}</p>
          {puede('configuracion', 'editar') && (
            <div className="fila">
              <button className="btn" onClick={async () => { if (await intentar(() => api('config.cargarImagen', { imagen: k }))) { recargarConfig(); } }}><Upload size={15} /> Cargar imagen</button>
              {imagenes[k] && <button className="btn peligro" onClick={async () => { if (await intentar(() => api('config.quitarImagen', { imagen: k }), 'Imagen retirada.') !== undefined) recargarConfig(); }}><Trash2 size={15} /> Quitar</button>}
            </div>
          )}
        </Tarjeta>
      ))}
    </div>
  );
}

function Respaldos() {
  const { intentar, confirmar, sesion, recargar, puede } = useApp();
  const [lista, setLista] = useState<any[]>([]);
  const cargar = useCallback(() => { intentar(() => api('respaldo.listar')).then((r) => r && setLista(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  const restaurar = async (args: any, nombre: string) => {
    const ok = await confirmar({
      titulo: 'Restaurar copia de seguridad', peligro: true, aceptar: 'Restaurar',
      mensaje: <>Se reemplazarán <b>todos los datos actuales</b> por los de «{nombre}». Antes se creará automáticamente una copia del estado actual. Se cerrará la sesión. ¿Continuar?</>,
    });
    if (!ok) return;
    if (await intentar(() => api('respaldo.restaurar', args), 'Copia restaurada correctamente. Inicie sesión de nuevo.')) await recargar();
  };
  const esAdmin = sesion?.rol === 'superadmin';
  return (
    <>
      <div className="rejilla c2 mb">
        <Tarjeta titulo="Copias automáticas">
          <FormConfig claves={[['respaldo_automatico', 'Crear una copia automática diaria (al ingresar y al cerrar)', 'check'], ['respaldos_conservar', 'Número de copias automáticas a conservar', 'number']]} />
        </Tarjeta>
        <Tarjeta titulo="Acciones">
          <p className="suave peq" style={{ marginTop: 0 }}>Cada copia incluye la base de datos, la biblioteca de materiales y las imágenes institucionales. Guarde copias periódicas en una memoria USB o en la nube.</p>
          <div className="fila">
            {puede('configuracion', 'editar') && <button className="btn primario" onClick={async () => { if (await intentar(() => api('respaldo.crear'), 'Copia de seguridad creada.')) cargar(); }}><DatabaseBackup size={15} /> Crear copia ahora</button>}
            {puede('configuracion', 'editar') && <button className="btn" onClick={() => intentar(() => api('respaldo.exportar'), undefined).then((r) => r && cargar())}><UploadCloud size={15} /> Copiar a USB / carpeta…</button>}
            <button className="btn" onClick={() => intentar(() => api('respaldo.abrirCarpeta'))}><FolderOpen size={15} /> Abrir carpeta</button>
          </div>
          {esAdmin && (
            <div className="fila mt">
              <button className="btn peligro" onClick={() => restaurar({ carpeta: true }, 'la carpeta seleccionada')}><RotateCcw size={15} /> Restaurar desde carpeta…</button>
              <button className="btn peligro" onClick={() => restaurar({}, 'el archivo seleccionado')}><RotateCcw size={15} /> Restaurar desde archivo .sqlite…</button>
            </div>
          )}
        </Tarjeta>
      </div>
      <Tabla filas={lista.map((r) => ({ ...r, id: r.nombre }))} columnas={[
        { key: 'fecha', label: 'Fecha', render: (r) => new Date(r.fecha).toLocaleString('es-CO'), valor: (r) => r.fecha },
        { key: 'tipo', label: 'Tipo', render: (r) => <Insignia valor={r.tipo} color={r.tipo === 'manual' ? 'azul' : r.tipo === 'automatico' ? 'verde' : 'naranja'} /> },
        { key: 'nombre', label: 'Nombre' }, { key: 'tamano', label: 'Tamaño', num: true, render: (r) => fmtBytes(r.tamano) },
      ]} acciones={esAdmin ? (r) => <button className="btn chico peligro" onClick={() => restaurar({ ruta: r.ruta }, r.nombre)}><RotateCcw size={14} /> Restaurar</button> : undefined}
        vacio="Aún no hay copias de seguridad." />
    </>
  );
}

function Papelera() {
  const { intentar, confirmar, sesion, puede } = useApp();
  const [filas, setFilas] = useState<any[]>([]);
  const cargar = useCallback(() => { intentar(() => api('papelera.listar')).then((r) => r && setFilas(r)); }, [intentar]);
  useEffect(cargar, [cargar]);
  return (
    <>
      <div className="alerta info">Los registros eliminados se conservan aquí y pueden restaurarse. Solo el superadministrador puede eliminarlos definitivamente.</div>
      <Tabla filas={filas.map((f) => ({ ...f, clave: `${f.tabla}-${f.id}` }))} claveFila="clave" columnas={[
        { key: 'tabla', label: 'Tipo', render: (f) => <Insignia valor={TABLAS[f.tabla] ?? f.tabla} color="azul" /> }, { key: 'descripcion', label: 'Registro' },
        { key: 'eliminado_en', label: 'Eliminado', render: (f) => fmtFechaHora(f.eliminado_en) },
      ]} acciones={(f) => (
        <>
          {puede('configuracion', 'editar') && <button className="btn chico" onClick={async () => { if (await intentar(() => api('papelera.restaurar', { tabla: f.tabla, id: f.id }), 'Registro restaurado.') !== undefined) cargar(); }}><RotateCcw size={14} /> Restaurar</button>}
          {sesion?.rol === 'superadmin' && <button className="btn chico peligro" onClick={async () => {
            if (!(await confirmar({ titulo: 'Eliminar definitivamente', mensaje: 'Esta acción no se puede deshacer. ¿Continuar?', peligro: true, aceptar: 'Eliminar definitivamente' }))) return;
            if (await intentar(() => api('papelera.purgar', { tabla: f.tabla, id: f.id }), 'Registro eliminado definitivamente.') !== undefined) cargar();
          }}><Trash2 size={14} /> Eliminar</button>}
        </>
      )} vacio="La papelera está vacía." />
    </>
  );
}

function Acerca() {
  const { info, intentar, confirmar, recargar } = useApp();
  if (!info) return null;
  return (
    <div className="rejilla c2">
      <Tarjeta titulo="Información del sistema">
        <dl className="lista-def">
          <dt>Aplicación</dt><dd>MEIF – SABANALARGA</dd><dt>Versión</dt><dd>{info.version}</dd>
          <dt>Base de datos</dt><dd>{info.demo ? <Insignia valor="DEMOSTRACIÓN" color="naranja" /> : <Insignia valor="Real" color="verde" />} (esquema v{info.versionBd})</dd>
          <dt>Carpeta de datos</dt><dd className="peq" style={{ wordBreak: 'break-all' }}>{info.datos}</dd>
        </dl>
        <div className="fila mt"><button className="btn" onClick={() => intentar(() => api('app.abrirCarpetaDatos'))}><FolderOpen size={15} /> Abrir carpeta de datos</button></div>
        <p className="peq suave">Los datos se guardan en la carpeta del usuario de Windows y se conservan al actualizar o reinstalar la aplicación.</p>
      </Tarjeta>
      <Tarjeta titulo="Base de demostración">
        <p className="suave" style={{ marginTop: 0 }}>La base de demostración es independiente de la real y contiene datos ficticios marcados con «DEMO» para capacitar al personal.</p>
        <div className="fila">
          {info.demo ? <>
            <button className="btn" onClick={async () => { await intentar(() => api('app.cambiarModo', { modo: 'real' })); await recargar(); }}>Volver a la base real</button>
            <button className="btn peligro" onClick={async () => {
              if (!(await confirmar({ titulo: 'Restablecer demostración', mensaje: 'Se borrará la base de demostración y se volverá a crear con los datos de ejemplo.', aceptar: 'Restablecer', peligro: true }))) return;
              await intentar(() => api('app.restablecerDemo'), 'Base de demostración restablecida.'); await recargar();
            }}><RotateCcw size={15} /> Restablecer demostración</button>
          </> : <button className="btn" onClick={async () => {
            if (!(await confirmar({ titulo: 'Abrir demostración', mensaje: 'Se cerrará la sesión actual y se abrirá la base de demostración.', aceptar: 'Continuar' }))) return;
            await intentar(() => api('app.cambiarModo', { modo: 'demo' })); await recargar();
          }}><FlaskConical size={15} /> Abrir base de demostración</button>}
        </div>
      </Tarjeta>
    </div>
  );
}

export function Configuracion({ parametros }: { ir: (m: Modulo, p?: any) => void; parametros?: any }) {
  const { intentar } = useApp();
  const [p, setP] = useState<string>(parametros?.pestana ?? 'institucion');
  return (
    <Pagina titulo="Configuración" descripcion="Datos institucionales, diseño del certificado, imágenes, copias de seguridad y papelera.">
      <Pestanas valor={p} onCambio={setP} opciones={[
        { id: 'institucion', nombre: 'Institución', icono: <Building2 size={16} /> }, { id: 'certificado', nombre: 'Diseño del certificado', icono: <Palette size={16} /> },
        { id: 'imagenes', nombre: 'Logotipo y firmas', icono: <IconoImagen size={16} /> }, { id: 'respaldos', nombre: 'Copias de seguridad', icono: <DatabaseBackup size={16} /> },
        { id: 'papelera', nombre: 'Papelera', icono: <Archive size={16} /> }, { id: 'acerca', nombre: 'Sistema', icono: <Info size={16} /> },
      ]} />
      {p === 'institucion' && (
        <Tarjeta>
          <FormConfig claves={[
            ['org_nombre', 'Nombre de la organización'], ['org_subtitulo', 'Subtítulo'], ['org_nit', 'NIT (opcional)'], ['org_telefono', 'Teléfono'],
            ['org_direccion', 'Dirección'], ['lugar_expedicion', 'Lugar de expedición de certificados'],
            ['director_nombre', 'Nombre del director(a) que firma'], ['director_cargo', 'Cargo del director(a)'],
            ['coordinador_nombre', 'Nombre del coordinador(a) académico(a)'], ['coordinador_cargo', 'Cargo del coordinador(a)'],
          ]} />
        </Tarjeta>
      )}
      {p === 'certificado' && (
        <Tarjeta>
          <FormConfig claves={[
            ['cert_titulo', 'Título del certificado'],
            ['cert_texto', 'Texto del certificado', 'textarea', 'Variables disponibles: {nombre}, {identificacion}, {cursillo}, {fecha_inicio}, {fecha_fin}, {horas}.'],
            ['cert_color_primario', 'Color principal', 'color'], ['cert_color_secundario', 'Color de detalles', 'color'],
            ['cert_mostrar_coordinador', 'Incluir la firma del coordinador(a)', 'check'],
          ]}>
            <button className="btn" onClick={() => intentar(() => api('config.vistaPreviaCertificado'))}><Eye size={15} /> Vista previa con el último certificado</button>
          </FormConfig>
          <p className="peq suave">El logotipo y las firmas se cargan en la pestaña «Logotipo y firmas». Los cambios de diseño aplican a los certificados que se generen a partir de ahora.</p>
        </Tarjeta>
      )}
      {p === 'imagenes' && <Imagenes />}
      {p === 'respaldos' && <Respaldos />}
      {p === 'papelera' && <Papelera />}
      {p === 'acerca' && <Acerca />}
    </Pagina>
  );
}
