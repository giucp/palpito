"use client";

import { Icono } from "./iconos";
import type { Evento, Mercado, Seleccion } from "@/lib/tipos";

type Props = {
  evento: Evento;
  seleccionadas: Set<string>;
  onCuota: (evento: Evento, mercado: Mercado, seleccion: Seleccion) => void;
  onDetalle: (evento: Evento) => void;
};

// Etiquetas cortas del mercado principal: 1/X/2 con empate, 1/2 sin él.
function etiqueta(mercado: Mercado, i: number): string {
  if (mercado.selecciones.length === 3) return ["1", "X", "2"][i];
  return ["1", "2"][i];
}

export function FilaPartido({ evento, seleccionadas, onCuota, onDetalle }: Props) {
  const principal = evento.mercados[0];

  return (
    <article className="mt">
      <div className="mrow">
        <div className="minfo">
          <div className="mmeta">
            <span className="hh">{evento.hora}</span>
            <span className="lg">{evento.liga}</span>
          </div>
          <div className="eq">
            <div className="eqr">
              <span className="nm">{evento.equipoA}</span>
            </div>
            <div className="eqr">
              <span className="nm">{evento.equipoB}</span>
            </div>
          </div>
        </div>
        <div className="mkt">
          {principal.selecciones.map((s, i) => (
            <button
              key={s.id}
              className={`od ${seleccionadas.has(s.id) ? "sel" : ""}`}
              onClick={() => onCuota(evento, principal, s)}
            >
              <span className="ar">▲</span>
              <div className="k">{etiqueta(principal, i)}</div>
              <div className="v">{s.cuota.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="mfoot">
        <button className="mas" onClick={() => onDetalle(evento)}>
          Ver <b>{evento.mercados.length}</b> mercados <Icono id="i-arr" />
        </button>
      </div>
    </article>
  );
}
