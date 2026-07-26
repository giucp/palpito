import { createHash, randomBytes } from "crypto";

// Juego "Despegue": el multiplicador sube y en algún punto el avión se estrella.
// Toda la matemática vive aquí y solo corre en el servidor.

// Velocidad de la curva. Debe coincidir con despegue_k() en la base.
export const K = 0.09;

// Ventaja de la casa. La probabilidad de que la ronda llegue a x es exactamente
// 0.97/x: llegar a 2x pasa el 48,5% de las veces, y a 10x el 9,7%. Con eso el
// retorno es 97% para cualquier multiplicador donde te retires.
//
// Para que la cuenta cierre, la base tiene que estrellar la ronda con `>` y no
// con `>=` (ver la migración 20260726120000). Con `>=` hacía falta un centavo
// más del que uno cree y la ventaja real trepaba al 3,94% en los retiros bajos.
const VENTAJA = 0.03;

export const TOPE = 1000; // techo del multiplicador, por sanidad

export const multiplicadorEn = (segundos: number) =>
  Math.floor(Math.exp(K * segundos) * 100) / 100;

export const segundosHasta = (multiplicador: number) => Math.log(multiplicador) / K;

/**
 * Punto de estrellada a partir de la semilla. Determinista: con la misma
 * semilla siempre sale el mismo resultado, que es lo que permite verificar
 * la ronda después de jugarla.
 */
export function puntoCrash(semilla: string): number {
  const hex = createHash("sha256").update(semilla).digest("hex").slice(0, 13);
  const n = parseInt(hex, 16);
  const max = 2 ** 52;
  const r = n / max; // uniforme en [0, 1)
  const crudo = (1 - VENTAJA) / (1 - r);
  return Math.min(TOPE, Math.max(1, Math.floor(crudo * 100) / 100));
}

export const nuevaSemilla = () => randomBytes(24).toString("hex");
export const hashDe = (semilla: string) => createHash("sha256").update(semilla).digest("hex");
