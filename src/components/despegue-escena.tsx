"use client";

import { useMemo } from "react";

// La escena de Despegue, en SVG y CSS.
//
// Reemplaza al lienzo de pixel art, por lo mismo que en El Muelle: se veía
// escalonado en móviles de mucha densidad, y repintaba un `<canvas>` a 60
// cuadros por segundo aunque no pasara nada.
//
// Se conserva la idea que hacía bueno al juego original: **el cielo cambia por
// capas** a medida que subís. Eso es lo que da sensación de viaje; el número
// solo no alcanza. Pero ahora el cambio es una transición de CSS entre dos
// degradados, que corre en la GPU y no cuesta nada.

export type EstadoDespegue = "listo" | "volando" | "retirada" | "estrellada";

export const CAPAS = [
  { desde: 1, nombre: "PISTA", clase: "pista" },
  { desde: 2, nombre: "NUBES", clase: "nubes" },
  { desde: 5, nombre: "ESTRATOSFERA", clase: "estratosfera" },
  { desde: 15, nombre: "ÓRBITA", clase: "orbita" },
  { desde: 50, nombre: "ESPACIO PROFUNDO", clase: "profundo" },
];

export function capaDe(multiplicador: number): string {
  let nombre = CAPAS[0].nombre;
  for (const c of CAPAS) if (multiplicador >= c.desde) nombre = c.nombre;
  return nombre;
}

function claseDe(multiplicador: number): string {
  let clase = CAPAS[0].clase;
  for (const c of CAPAS) if (multiplicador >= c.desde) clase = c.clase;
  return clase;
}

// Las estrellas se sortean una vez y no se vuelven a tocar: si cambiaran en
// cada cuadro, titilarían como ruido.
function useEstrellas(cantidad: number) {
  return useMemo(
    () =>
      Array.from({ length: cantidad }, (_, i) => {
        // Determinista a partir del índice: mismo cielo en cada partida, y
        // nada de Math.random() en el render.
        const a = Math.sin(i * 12.9898) * 43758.5453;
        const b = Math.sin(i * 78.233) * 12345.6789;
        return {
          x: ((a - Math.floor(a)) * 100).toFixed(2),
          y: ((b - Math.floor(b)) * 100).toFixed(2),
          r: (0.6 + ((a - Math.floor(a)) * 1.1)).toFixed(2),
          demora: ((b - Math.floor(b)) * 4).toFixed(2),
        };
      }),
    [cantidad]
  );
}

/**
 * Qué tan arriba está el cohete, de 0 a 1.
 *
 * Logarítmico a propósito: el multiplicador crece sin techo, así que si la
 * altura fuera proporcional, el cohete se iría de la pantalla a los pocos
 * segundos. Así cada vez cuesta más subir, que además es la sensación correcta.
 */
function altura(multiplicador: number): number {
  return Math.min(1, Math.log(Math.max(1, multiplicador)) / Math.log(60));
}

type Props = {
  estado: EstadoDespegue;
  multiplicador: number;
};

export function DespegueEscena({ estado, multiplicador }: Props) {
  const estrellas = useEstrellas(46);
  const volando = estado === "volando";
  const estrellada = estado === "estrellada";
  const h = altura(multiplicador);

  // 0 abajo, 1 arriba. Se deja un margen para que no toque los bordes.
  const y = 88 - h * 68;

  return (
    <div className={`dsp-escena ${claseDe(multiplicador)} ${estado}`}>
      <div className="dsp-cielo" />

      <svg className="dsp-lienzo" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {estrellas.map((e, i) => (
          <circle
            key={i}
            className="dsp-estrella"
            cx={e.x}
            cy={e.y}
            r={e.r}
            style={{ animationDelay: `${e.demora}s` }}
          />
        ))}
      </svg>

      {/* La estela: crece con la altura, sin repintar nada */}
      <div className="dsp-estela" style={{ height: `${h * 68}%` }} aria-hidden="true" />

      <div
        className={`dsp-cohete ${volando ? "subiendo" : ""} ${estrellada ? "roto" : ""}`}
        style={{ top: `${y}%` }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 44 72">
          <defs>
            <linearGradient id="dsp-casco" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#cfd8e3" />
              <stop offset="45%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#9aa7b8" />
            </linearGradient>
          </defs>
          {/* Aletas */}
          <path className="dsp-aleta" d="M11 48 L2 64 L11 60 Z" />
          <path className="dsp-aleta" d="M33 48 L42 64 L33 60 Z" />
          {/* Casco */}
          <path
            className="dsp-casco"
            d="M22 1 C31 12 35 26 35 40 L35 60 L9 60 L9 40 C9 26 13 12 22 1 Z"
          />
          {/* Ventana */}
          <circle className="dsp-ventana" cx="22" cy="28" r="6.5" />
          <circle className="dsp-brillo" cx="19.6" cy="25.6" r="2.1" />
          {/* Franja */}
          <rect className="dsp-franja" x="9" y="46" width="26" height="6" rx="1.5" />
        </svg>

        {volando && <span className="dsp-fuego" />}
      </div>

      {estrellada && <div className="dsp-estallido" aria-hidden="true" />}
    </div>
  );
}
