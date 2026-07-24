import { createHash, randomBytes } from "crypto";
import { FIRMEZA } from "./muelle-tabla";

// Juego "El Muelle": saltas de tabla en tabla sobre el agua. Cada tabla paga
// más que la anterior, pero también aguanta menos. Cobras cuando quieras.
// La tabla de premios (pública) vive en muelle-tabla.ts; aquí solo lo que
// debe quedarse en el servidor.

export { DEVOLUCION, FIRMEZA, TABLAS, multiplicadores } from "./muelle-tabla";

/**
 * Qué tablas están podridas, derivado de la semilla. Determinista: con la
 * misma semilla siempre sale el mismo muelle, que es lo que permite
 * comprobar la partida cuando termina.
 */
export function tablasPodridas(semilla: string): boolean[] {
  return FIRMEZA.map((firmeza, i) => {
    const hex = createHash("sha256").update(`${semilla}:${i}`).digest("hex").slice(0, 13);
    const r = parseInt(hex, 16) / 2 ** 52;
    return r >= firmeza; // por encima de la firmeza, la tabla cede
  });
}

export const nuevaSemilla = () => randomBytes(24).toString("hex");
export const hashDe = (semilla: string) => createHash("sha256").update(semilla).digest("hex");
