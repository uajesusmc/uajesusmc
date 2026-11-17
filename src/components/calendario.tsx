/** Calendarios mensual y semanal. */
import type { ReactNode } from 'react';
import { DIAS } from '../../shared/constantes';
import { hoyISO, sumarDias } from '../api';

export interface EventoCal { id: string | number; fecha: string; texto: string; clase?: string; titulo?: string; onClick?: () => void }

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Lunes de la semana de una fecha. */
export function lunesDe(iso: string): string {
  const d = new Date(iso + 'T12:00:00').getDay();
  return sumarDias(iso, d === 0 ? -6 : 1 - d);
}

export function CalendarioMes({ mes, eventos, compacto, maxPorDia = 4, onDia }: {
  mes: string; eventos: EventoCal[]; compacto?: boolean; maxPorDia?: number; onDia?: (fecha: string) => void;
}) {
  const inicio = lunesDe(`${mes}-01`);
  const celdas = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  const ultimaFila = celdas.slice(35).every((c) => !c.startsWith(mes)) ? 35 : 42;
  const hoy = hoyISO();
  const porDia = new Map<string, EventoCal[]>();
  for (const e of eventos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  return (
    <div className={`cal-mes ${compacto ? 'compacto' : ''}`}>
      {DIAS.map((d) => <div key={d} className="dia-sem">{compacto ? d.slice(0, 3) : d}</div>)}
      {celdas.slice(0, ultimaFila).map((f) => {
        const ev = porDia.get(f) ?? [];
        return (
          <div key={f} className={`celda ${f.startsWith(mes) ? '' : 'fuera'} ${f === hoy ? 'hoy' : ''}`} onDoubleClick={() => onDia?.(f)}>
            <div className="n">{Number(f.slice(8))}</div>
            {ev.slice(0, maxPorDia).map((e) => (
              <button key={e.id} className={`ev ${e.clase ?? ''}`} title={e.titulo ?? e.texto} onClick={e.onClick}>{e.texto}</button>
            ))}
            {ev.length > maxPorDia && <div className="peq suave">+{ev.length - maxPorDia} más</div>}
          </div>
        );
      })}
    </div>
  );
}

export interface BloqueSemana { id: number; fecha: string; inicio: string; fin: string; titulo: string; detalle?: ReactNode; clase?: string; onClick?: () => void }

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export function CalendarioSemana({ lunes, bloques }: { lunes: string; bloques: BloqueSemana[] }) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const enSemana = bloques.filter((b) => b.fecha >= dias[0] && b.fecha <= dias[6]);
  const desde = Math.min(7, ...enSemana.map((b) => Math.floor(minutos(b.inicio) / 60)));
  const hasta = Math.max(18, ...enSemana.map((b) => Math.ceil(minutos(b.fin) / 60)));
  const horas = Array.from({ length: hasta - desde }, (_, i) => desde + i);
  const ALTO = 44;
  const hoy = hoyISO();
  return (
    <div className="cal-semana">
      <div className="cab-dia" />
      {dias.map((d, i) => <div key={d} className={`cab-dia ${d === hoy ? 'hoy' : ''}`}>{DIAS[i]} {d.slice(8)}/{d.slice(5, 7)}</div>)}
      <div className="horas">{horas.map((h) => <div key={h} className="hora">{String(h).padStart(2, '0')}:00</div>)}</div>
      {dias.map((d) => {
        // Bloques solapados del mismo día se reparten en columnas.
        const del = enSemana.filter((b) => b.fecha === d).sort((a, b) => a.inicio.localeCompare(b.inicio));
        const carriles: string[] = [];
        const pos = del.map((b) => {
          let c = carriles.findIndex((fin) => fin <= b.inicio);
          if (c === -1) { c = carriles.length; carriles.push(b.fin); } else carriles[c] = b.fin;
          return c;
        });
        return (
          <div key={d} className="col">
            {horas.map((h) => <div key={h} className="linea" />)}
            {del.map((b, i) => {
              const top = ((minutos(b.inicio) - desde * 60) / 60) * ALTO;
              const alto = Math.max(22, ((minutos(b.fin) - minutos(b.inicio)) / 60) * ALTO - 2);
              const n = Math.max(1, carriles.length);
              return (
                <button key={b.id} className={`bloque ${b.clase ?? ''}`} onClick={b.onClick} title={b.titulo}
                  style={{ top, height: alto, left: `calc(${(pos[i] / n) * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)`, right: 'auto' }}>
                  <strong>{b.inicio}–{b.fin}</strong>{b.titulo}{b.detalle && <div className="peq">{b.detalle}</div>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
