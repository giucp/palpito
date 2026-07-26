"use client";

import { useEffect, useState } from "react";
import { Icono } from "./iconos";
import { RetoCarta } from "./reto-carta";
import { alternarSonido, sonidoActivo } from "@/lib/sonido";

// Juegos de Pálpito: **siempre contra un amigo, nunca contra la casa**.
//
// Acá solo se elige el juego. Los retos —los que esperan algo tuyo y los ya
// jugados— viven en Apuestas → Retos (palpito_guia.md §6.e): son lo mismo que
// una apuesta con otra persona, así que están todos juntos en un solo lugar.
//
// El Muelle y Despegue contra la casa se retiraron el 2026-07-26. La idea del
// producto es que dos amigos jueguen entre ellos y Pálpito cobre una comisión
// mínima de cada partida. Sin casa del otro lado no hace falta inclinar la
// matemática: los dos tienen la misma probabilidad y el jugador recupera el
// 99,5% de lo que pone, contra el 97% de un juego de casino.

type Props = {
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
  onEntrar: () => void;
};

type Juego = "carta";

const CATALOGO: Array<{ id: Juego; nombre: string; resumen: string; tag: string }> = [
  {
    id: "carta",
    nombre: "Carta más alta",
    resumen: "Cada uno saca una carta. La más alta se lleva el pozo.",
    tag: "contra un amigo",
  },
];

export function Juegos(props: Props) {
  const [abierto, setAbierto] = useState<Juego | null>(null);
  const [suena, setSuena] = useState(true);

  useEffect(() => setSuena(sonidoActivo()), []);

  const botonSonido = (
    <button
      className="jsonido"
      onClick={() => setSuena(alternarSonido())}
      aria-label={suena ? "Silenciar" : "Activar sonido"}
      title={suena ? "Silenciar" : "Activar sonido"}
    >
      <Icono id={suena ? "i-sonido" : "i-mudo"} />
    </button>
  );

  if (abierto === "carta") {
    return (
      <>
        <div className="jbarra">
          <button className="jvolver" onClick={() => setAbierto(null)}>
            <Icono id="i-back" /> Todos los juegos
          </button>
          {botonSonido}
        </div>
        <RetoCarta {...props} />
      </>
    );
  }

  return (
    <>
      <div className="jbarra">
        <span className="jhint">Elegí un juego y retá a un amigo</span>
        {botonSonido}
      </div>

      <div className="jlista">
        {CATALOGO.map((j) => (
          <button key={j.id} className="jcard" onClick={() => setAbierto(j.id)}>
            <div className="jcard-arte">
              <PortadaJuego id={j.id} />
            </div>
            <div className="jcard-txt">
              <b>{j.nombre}</b>
              <span>{j.resumen}</span>
              <span className="tag">{j.tag}</span>
            </div>
          </button>
        ))}
      </div>
      <p className="tb-fuente">
        Acá se juega entre amigos, no contra la casa. Pálpito solo cobra una comisión del 0,5%
        del pozo: recuperás el 99,5% de lo que ponés.
      </p>
    </>
  );
}

// Portada dibujada con formas, sin imágenes: nítida en cualquier pantalla y
// pesa unos pocos kilobytes.
function PortadaJuego({ id }: { id: Juego }) {
  if (id !== "carta") return null;
  return (
    <svg viewBox="0 0 100 48" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="jp-fondo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16342a" />
          <stop offset="100%" stopColor="#0a1712" />
        </linearGradient>
      </defs>
      <rect width="100" height="48" fill="url(#jp-fondo)" />
      {/* Dos cartas cruzadas: una de dorso y una mostrando el as */}
      <g transform="translate(30 25) rotate(-13)">
        <rect x="-11" y="-16" width="22" height="32" rx="3" fill="#b6ff3d" />
        <rect x="-8" y="-13" width="16" height="26" rx="2" fill="none" stroke="#0f1a12" strokeWidth="1" opacity="0.5" />
        <path d="M-6 1h3l1.5-4 2 7.5 2-10 1.5 6.5h3" fill="none" stroke="#0f1a12" strokeWidth="1.3"
          strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(58 24) rotate(11)">
        <rect x="-11" y="-16" width="22" height="32" rx="3" fill="#f7f5ef" />
        <text x="-7.5" y="-7" fontSize="7" fontWeight="700" fill="#1b2230" fontFamily="sans-serif">A</text>
        <path d="M0 -2 C3 2 5.5 3.5 5.5 6.2 A2.6 2.6 0 0 1 0 7.4 A2.6 2.6 0 0 1 -5.5 6.2 C-5.5 3.5 -3 2 0 -2 Z"
          fill="#1b2230" />
      </g>
    </svg>
  );
}
