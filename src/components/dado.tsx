"use client";

// Un dado, dibujado con formas.
//
// Nada de imágenes ni del carácter ⚀ del sistema: cada teléfono lo pinta a su
// manera y en Android sale feo. Son siete círculos en una caja de 100×100 y se
// encienden los que toquen, así que se ve nítido a cualquier tamaño y pesa nada.

// Las siete posiciones posibles de los puntos.
const PUNTOS = {
  ai: [30, 30], // arriba izquierda
  ad: [70, 30],
  mi: [30, 50], // medio izquierda
  md: [70, 50],
  c: [50, 50], // centro
  bi: [30, 70], // abajo izquierda
  bd: [70, 70],
} as const;

type Punto = keyof typeof PUNTOS;

const CARAS: Record<number, Punto[]> = {
  1: ["c"],
  2: ["ai", "bd"],
  3: ["ai", "c", "bd"],
  4: ["ai", "ad", "bi", "bd"],
  5: ["ai", "ad", "c", "bi", "bd"],
  6: ["ai", "ad", "mi", "md", "bi", "bd"],
};

export function Dado({
  valor,
  rodando = false,
  destacado = null,
}: {
  valor: number | null; // null = todavía no se tiró
  rodando?: boolean;
  destacado?: "gana" | "pierde" | null;
}) {
  // Mientras rueda se muestra una cara cualquiera pero estable, para que el
  // dibujo no parpadee: la animación la hace el CSS, no un cambio de números.
  const cara = valor ?? 5;

  return (
    <div className={`dd ${rodando ? "rueda" : ""} ${valor === null ? "quieto" : ""} ${destacado ?? ""}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="4" y="4" width="92" height="92" rx="20" className="dd-cuerpo" />
        <rect x="4" y="4" width="92" height="92" rx="20" className="dd-borde" />
        {(CARAS[cara] ?? CARAS[1]).map((p) => (
          <circle key={p} cx={PUNTOS[p][0]} cy={PUNTOS[p][1]} r="9" className="dd-punto" />
        ))}
      </svg>
    </div>
  );
}

/** Los dos dados de un jugador, con su suma al lado. */
export function ParDados({
  tirada,
  rodando = false,
  destacado = null,
}: {
  tirada: { dados: [number, number]; suma: number } | null;
  rodando?: boolean;
  destacado?: "gana" | "pierde" | null;
}) {
  return (
    <div className="dd-par">
      <div className="dd-dos">
        <Dado valor={tirada?.dados[0] ?? null} rodando={rodando} destacado={destacado} />
        <Dado valor={tirada?.dados[1] ?? null} rodando={rodando} destacado={destacado} />
      </div>
      <span className={`dd-suma mono ${destacado ?? ""}`}>{tirada ? tirada.suma : "—"}</span>
    </div>
  );
}
