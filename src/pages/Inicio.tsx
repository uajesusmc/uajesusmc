/** Módulo 1: Panel principal con indicadores, gráficos y calendario de actividades. */
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Award, BookOpen, CalendarCheck, CalendarClock, CalendarRange, ChevronLeft, ChevronRight, Clock, GraduationCap, UserSquare2 } from 'lucide-react';
import type { Modulo } from '../../shared/constantes';
import { api, fmtFecha, fmtNum } from '../api';
import { CalendarioMes, MESES } from '../components/calendario';
import { Insignia, Kpi, Logo, Progreso, Tarjeta, Vacio } from '../components/ui';
import { useApp } from '../estado';

const COLORES_AREA: Record<string, string> = { Matemáticas: '#0B2545', Estadística: '#2E6DB4', Informática: '#8DA9C4', Física: '#C9A227' };

export function Inicio({ ir }: { ir: (m: Modulo, p?: any) => void }) {
  const { sesion, intentar, config } = useApp();
  const [d, setD] = useState<any>(null);
  const [mes, setMes] = useState<string>(() => new Date().toISOString().slice(0, 7));
  useEffect(() => { intentar(() => api('dashboard.indicadores', { mes })).then((r) => r && setD(r)); }, [mes, intentar]);
  if (!d) return null;
  const k = d.kpis;
  const moverMes = (n: number) => {
    const [a, m] = mes.split('-').map(Number);
    const f = new Date(a, m - 1 + n, 1);
    setMes(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`);
  };
  const eventos = [
    ...d.calendario.map((c: any) => ({
      id: c.fecha, fecha: c.fecha, texto: `${c.clases} clase(s)`, clase: c.ejecutadas === c.clases ? 'ejecutada' : '', titulo: c.detalle,
      onClick: () => ir('horarios', { fecha: c.fecha }),
    })),
    ...d.eventosCursillos.flatMap((c: any) => [
      c.fecha_inicio.startsWith(mes) && { id: `i${c.nombre}`, fecha: c.fecha_inicio, texto: `Inicia ${c.nombre}`, clase: 'cursillo' },
      c.fecha_fin.startsWith(mes) && { id: `f${c.nombre}`, fecha: c.fecha_fin, texto: `Finaliza ${c.nombre}`, clase: 'cursillo' },
    ].filter(Boolean)),
  ];
  const pctHoras = k.horas_programadas ? (k.horas_ejecutadas / k.horas_programadas) * 100 : 0;

  return (
    <>
      <div className="tarjeta mb" style={{ padding: '18px 22px', display: 'flex', gap: 18, alignItems: 'center', background: 'linear-gradient(110deg, #fff 55%, var(--azul-50))' }}>
        <Logo tam={68} />
        <div>
          <h1 style={{ fontSize: 26 }}>{config.org_nombre || 'MEIF – SABANALARGA'}</h1>
          <div className="suave">{config.org_subtitulo || 'Matemáticas, Estadística, Informática y Física'}</div>
        </div>
        <div className="espacio" />
        <div style={{ textAlign: 'right' }}>
          <div className="negrita" style={{ color: 'var(--azul-800)' }}>Bienvenido(a), {sesion?.nombre}</div>
          <div className="suave peq">{new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {d.pendientes > 0 && (
        <div className="alerta aviso"><AlertTriangle size={18} />
          <div>Hay <b>{d.pendientes}</b> clase(s) de fechas pasadas que siguen como «Programada». Registre la asistencia o actualice su estado.
            {' '}<button className="btn chico" onClick={() => ir('asistencia')}>Ir a asistencia</button></div>
        </div>
      )}

      <div className="rejilla k4 mb">
        <Kpi icono={<GraduationCap />} valor={fmtNum(k.estudiantes, 0)} etiqueta="Estudiantes registrados" sub={`${k.estudiantes_activos} en cursillos activos`} />
        <Kpi icono={<UserSquare2 />} valor={fmtNum(k.docentes, 0)} etiqueta="Docentes" />
        <Kpi icono={<CalendarRange />} valor={fmtNum(k.cursillos_activos, 0)} etiqueta="Cursillos activos" />
        <Kpi icono={<BookOpen />} valor={fmtNum(k.asignaturas, 0)} etiqueta="Asignaturas disponibles" sub="en cursillos activos" />
        <Kpi icono={<CalendarClock />} valor={`${fmtNum(k.horas_programadas)} h`} etiqueta="Horas académicas programadas" />
        <Kpi icono={<Clock />} valor={`${fmtNum(k.horas_ejecutadas)} h`} etiqueta="Horas académicas ejecutadas" sub={`${fmtNum(pctHoras)}% de lo programado`} />
        <Kpi icono={<Award />} valor={fmtNum(k.certificados, 0)} etiqueta="Certificados generados" />
        <Kpi icono={<CalendarCheck />} valor={fmtNum(d.proximas.length, 0)} etiqueta="Próximas actividades" sub={d.proximas[0] ? `Siguiente: ${fmtFecha(d.proximas[0].fecha)}` : 'Sin clases programadas'} />
      </div>

      <div className="rejilla c3 mb">
        <Tarjeta titulo="Estudiantes por cursillo">
          {d.porCursillo.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={d.porCursillo} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + '…' : v)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="estudiantes" name="Estudiantes" fill="#0B2545" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Vacio texto="Aún no hay cursillos." />}
        </Tarjeta>
        <Tarjeta titulo="Asignaturas por área (cursillos activos)">
          {d.porArea.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={d.porArea} dataKey="asignaturas" nameKey="area" innerRadius={50} outerRadius={80} paddingAngle={2} label={(e: any) => e.asignaturas}>
                  {d.porArea.map((a: any) => <Cell key={a.area} fill={COLORES_AREA[a.area]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <Vacio texto="Sin asignaturas en cursillos activos." />}
        </Tarjeta>
        <Tarjeta titulo="Asistencia promedio por mes">
          {d.asistenciaMensual.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={d.asistenciaMensual} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Line type="monotone" dataKey="porcentaje" name="Asistencia" stroke="#C9A227" strokeWidth={3} dot={{ r: 4, fill: '#0B2545' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Vacio texto="Aún no hay asistencia registrada." />}
        </Tarjeta>
      </div>

      <div className="rejilla c2">
        <Tarjeta titulo={`Calendario de actividades – ${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`}
          acciones={<>
            <button className="btn icono" onClick={() => moverMes(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <button className="btn chico" onClick={() => setMes(new Date().toISOString().slice(0, 7))}>Hoy</button>
            <button className="btn icono" onClick={() => moverMes(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </>}>
          <CalendarioMes mes={mes} eventos={eventos} compacto maxPorDia={2} />
        </Tarjeta>
        <div className="col-flex">
          <Tarjeta titulo="Próximas actividades" acciones={<button className="btn chico" onClick={() => ir('horarios')}>Ver horarios</button>} cuerpo={false}>
            {d.proximas.length ? (
              <table className="tabla"><tbody>
                {d.proximas.map((p: any) => (
                  <tr key={p.id}><td style={{ width: 90 }}><b>{fmtFecha(p.fecha)}</b><div className="peq suave">{p.hora_inicio}–{p.hora_fin}</div></td>
                    <td><b>{p.asignatura}</b><div className="peq suave">{p.grupo} · {p.docente}{p.aula ? ` · ${p.aula}` : ''}</div></td></tr>
                ))}
              </tbody></table>
            ) : <Vacio texto="No hay clases programadas próximamente." />}
          </Tarjeta>
          <Tarjeta titulo="Avance de la planeación (cursillos activos)" cuerpo={false}
            acciones={<button className="btn chico" onClick={() => ir('planeacion')}>Ver planeación</button>}>
            {d.avance.length ? (
              <table className="tabla"><tbody>
                {d.avance.map((a: any) => (
                  <tr key={a.nombre}><td>{a.nombre}<div className="peq suave">{fmtNum(a.ejecutadas)} de {fmtNum(a.programadas)} h</div></td>
                    <td style={{ width: 170 }}><Progreso valor={a.avance} /></td><td style={{ width: 110 }}><Insignia valor={a.estado} /></td></tr>
                ))}
              </tbody></table>
            ) : <Vacio texto="Sin asignaturas activas." />}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
