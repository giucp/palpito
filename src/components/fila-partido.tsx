"use client";

import { Icono } from "./iconos";
import type { Evento, Mercado, Seleccion } from "@/lib/tipos";

type Props = {
  evento: Evento;
  seleccionadas: Set<string>;
  onCuota: (evento: Evento, mercado: Mercado, seleccion: Seleccion) => void;
  onDetalle: (evento: Evento) => void;
};

// Etiqueta clara de cada cuota: el nombre del equipo o "Empate", en vez de 1/X/2.
function etiquetaPick(evento: Evento, seleccion: Seleccion): string {
  if (seleccion.nombre === "Local") return evento.equipoA;
  if (seleccion.nombre === "Visitante") return evento.equipoB;
  return seleccion.nombre; // "Empate", "Más de 2.5", etc.
}

export function FilaPartido({ evento, seleccionadas, onCuota, onDetalle }: Props) {
  const principal = evento.mercados[0];
  const extra = evento.mercados.length - 1;
  const n = principal?.selecciones.length ?? 3;

  return (
    <article className="mt">
      <div className="mt-meta">
        <span className="hh">{evento.hora}</span>
        {principal && <span className="mkt-nombre">{principal.nombre}</span>}
      </div>
      <div className="mt-teams">
        <div className="tm">
          <span className="badge" />
          <span className="nm">{evento.equipoA}</span>
        </div>
        <div className="tm">
          <span className="badge" />
          <span className="nm">{evento.equipoB}</span>
        </div>
      </div>
      {principal && (
        <div className="mt-odds" data-n={n}>
          {principal.selecciones.map((s) => (
            <button
              key={s.id}
              className={`od ${seleccionadas.has(s.id) ? "sel" : ""}`}
              onClick={() => onCuota(evento, principal, s)}
            >
              <span className="lbl">{etiquetaPick(evento, s)}</span>
              <span className="v">{s.cuota.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
      <button className="mt-more" onClick={() => onDetalle(evento)}>
        {extra > 0 ? (
          <>
            <b>+{extra}</b> mercados más
          </>
        ) : (
          "Ver mercados"
        )}
        <Icono id="i-arr" />
      </button>
    </article>
  );
}
