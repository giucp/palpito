"use client";

import { useEffect, useState } from "react";
import { Despegue } from "./despegue";
import { Muelle } from "./muelle";
import { Icono } from "./iconos";
import { alternarSonido, sonidoActivo } from "@/lib/sonido";

type Props = {
  usuario: { email: string } | null;
  saldo: number | null;
  onAviso: (msg: string) => void;
  onEntrar: () => void;
};

import { PREMIOS } from "@/lib/muelle-tabla";

type Juego = "muelle" | "despegue";

const CATALOGO: Array<{ id: Juego; nombre: string; resumen: string; tag: string }> = [
  {
    id: "muelle",
    nombre: "El Muelle",
    resumen: "Dos tablas por paso: elegís una y la otra se rompe. Cada paso paga más.",
    // Sale de la escalera, no escrito a mano: si se cambia PREMIOS, esto sigue.
    tag: `hasta ${PREMIOS[PREMIOS.length - 1]}x`,
  },
  {
    id: "despegue",
    nombre: "Despegue",
    resumen: "El cohete sube y el multiplicador con él. Retira antes de que estalle.",
    tag: "sin techo",
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

  if (abierto === "muelle" || abierto === "despegue") {
    return (
      <>
        <div className="jbarra">
          <button className="jvolver" onClick={() => setAbierto(null)}>
            <Icono id="i-back" /> Todos los juegos
          </button>
          {botonSonido}
        </div>
        {abierto === "muelle" ? <Muelle {...props} /> : <Despegue {...props} />}
      </>
    );
  }

  return (
    <>
      <div className="jbarra">
        <span className="jhint">Toca un juego para empezar</span>
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
    </>
  );
}

// Portadas dibujadas en el momento con el mismo lenguaje pixelado de los
// juegos, para que la lista no se sienta un menú de texto.
function PortadaJuego({ id }: { id: Juego }) {
  return (
    <svg viewBox="0 0 100 48" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
      {id === "muelle" ? (
        <>
          <rect width="100" height="48" fill="#12283d" />
          <rect x="0" y="30" width="100" height="18" fill="#0d2233" />
          <rect x="0" y="30" width="100" height="1" fill="#1d4a63" />
          {[6, 26, 46, 66, 86].map((x, i) => (
            <g key={x}>
              <rect x={x} y="26" width="14" height="3" fill={i < 2 ? "#b6ff3d" : "#8a6b45"} />
              <rect x={x + 2} y="29" width="2" height="7" fill="#6b5133" />
              <rect x={x + 10} y="29" width="2" height="7" fill="#6b5133" />
            </g>
          ))}
          <rect x="30" y="20" width="7" height="6" fill="#e8e2d6" />
          <rect x="30" y="18" width="2" height="2" fill="#e8e2d6" />
          <rect x="35" y="18" width="2" height="2" fill="#e8e2d6" />
          <rect x="70" y="8" width="12" height="2" fill="#1c3450" />
          <rect x="18" y="12" width="9" height="2" fill="#1c3450" />
        </>
      ) : (
        <>
          <rect width="100" height="48" fill="#0a1430" />
          {[
            [12, 8],
            [30, 18],
            [58, 6],
            [78, 22],
            [90, 12],
            [44, 30],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="1.5" height="1.5" fill="#e6f0ff" />
          ))}
          <rect x="47" y="10" width="6" height="4" fill="#e8f0f5" />
          <rect x="45" y="14" width="10" height="12" fill="#e8f0f5" />
          <rect x="47" y="17" width="6" height="4" fill="#0b1020" />
          <rect x="42" y="22" width="3" height="6" fill="#ff5a5a" />
          <rect x="55" y="22" width="3" height="6" fill="#ff5a5a" />
          <rect x="47" y="26" width="6" height="4" fill="#ffb03d" />
          <rect x="48" y="30" width="4" height="5" fill="#ff6b2c" />
          <rect x="49" y="35" width="2" height="4" fill="#fff3c4" />
        </>
      )}
    </svg>
  );
}
