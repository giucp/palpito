"use client";

import { useState } from "react";
import { Icono } from "./iconos";
import type { Evento, Mercado, Seleccion } from "@/lib/tipos";

type Props = {
  evento: Evento;
  seleccionadas: Set<string>;
  onCuota: (evento: Evento, mercado: Mercado, seleccion: Seleccion) => void;
  onVolver: () => void;
};

export function DetallePartido({ evento, seleccionadas, onCuota, onVolver }: Props) {
  // Todos los grupos abiertos al entrar; cada uno se puede plegar.
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());

  const alternar = (id: string) => {
    setCerrados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  return (
    <div className="view">
      <button className="dback" onClick={onVolver}>
        <Icono id="i-back" /> Volver a los partidos
      </button>

      <div className="dhero">
        <div className="top">
          <span className="hh mono" style={{ fontSize: 11.5, color: "var(--mist)" }}>
            {evento.hora}
          </span>
          <span style={{ fontSize: 12, color: "var(--mist)" }}>{evento.liga}</span>
        </div>
        <div className="dscore">
          <div className="tn">{evento.equipoA}</div>
          <div className="sc">
            vs<small>{evento.hora}</small>
          </div>
          <div className="tn">{evento.equipoB}</div>
        </div>
      </div>

      {evento.mercados.map((m) => (
        <div key={m.id} className={`mgrp ${cerrados.has(m.id) ? "" : "open"}`}>
          <button className="mgh" onClick={() => alternar(m.id)}>
            {m.nombre}
            <span className="cnt">{m.selecciones.length}</span>
            <Icono id="i-chev" className="chev" />
          </button>
          <div className="mgb">
            {m.selecciones.map((s) => (
              <button
                key={s.id}
                className={`od ${seleccionadas.has(s.id) ? "sel" : ""}`}
                onClick={() => onCuota(evento, m, s)}
              >
                <div className="k">{s.nombre}</div>
                <div className="v">{s.cuota.toFixed(2)}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
