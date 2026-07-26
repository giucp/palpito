import { createHash, randomBytes } from "crypto";
// Con extensión .ts a propósito, igual que en src/lib/resultados: así los
// scripts de scripts/ pueden comprobar esta misma matemática con node, en vez
// de una copia que se desactualiza.
import {
  FIRMEZA,
  probabilidadAmbasPodridas,
  probabilidadAmbasSanas,
} from "./muelle-tabla.ts";

// Juego "El Muelle": cruzás sobre el agua saltando de paso en paso. En cada uno
// hay **dos tablas** y elegís una; la otra se rompe igual, para que veas qué
// habría pasado. Cada paso paga más que el anterior, pero también es más
// probable que una de las dos esté podrida. Cobrás cuando quieras.
//
// La tabla de premios (pública) vive en muelle-tabla.ts; acá solo lo que debe
// quedarse en el servidor.

export {
  DEVOLUCION,
  FIRMEZA,
  PREMIOS,
  TABLAS,
  multiplicadores,
} from "./muelle-tabla.ts";

/** Cómo está cada paso. Se guarda así en la base y se revela al terminar. */
export const NINGUNA_PODRIDA = 0;
export const IZQUIERDA_PODRIDA = 1;
export const DERECHA_PODRIDA = 2;
export const AMBAS_PODRIDAS = 3;

const azar = (semilla: string, etiqueta: string): number => {
  const hex = createHash("sha256").update(`${semilla}:${etiqueta}`).digest("hex").slice(0, 13);
  return parseInt(hex, 16) / 2 ** 52; // uniforme en [0, 1)
};

/**
 * Qué tablas están podridas en cada paso, derivado de la semilla. Determinista:
 * con la misma semilla sale siempre el mismo muelle, que es lo que permite
 * comprobar la partida cuando termina.
 *
 * Se decide en dos tiradas para que la elección sea honesta: primero **cuántas**
 * tablas ceden en ese paso, y recién después **cuál**. Así, cuando hay una
 * podrida, es 50 y 50 de verdad y no depende de nada que el jugador pueda
 * adivinar.
 */
export function pasosDelMuelle(semilla: string): number[] {
  return FIRMEZA.map((firmeza, i) => {
    const sanas = probabilidadAmbasSanas(firmeza);
    const podridas = probabilidadAmbasPodridas(firmeza);

    const cuantas = azar(semilla, `${i}:cuantas`);
    if (cuantas < sanas) return NINGUNA_PODRIDA;
    if (cuantas < sanas + podridas) return AMBAS_PODRIDAS;

    const cual = azar(semilla, `${i}:cual`);
    return cual < 0.5 ? IZQUIERDA_PODRIDA : DERECHA_PODRIDA;
  });
}

/** ¿Se rompe la tabla que elegí? `lado` es 0 (izquierda) o 1 (derecha). */
export function cede(paso: number, lado: number): boolean {
  if (paso === AMBAS_PODRIDAS) return true;
  if (paso === NINGUNA_PODRIDA) return false;
  return paso === (lado === 0 ? IZQUIERDA_PODRIDA : DERECHA_PODRIDA);
}

export const nuevaSemilla = () => randomBytes(24).toString("hex");
export const hashDe = (semilla: string) => createHash("sha256").update(semilla).digest("hex");
