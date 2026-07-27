import { numeroDe } from "./azar.ts";

// Carta más alta: cada uno saca una carta del mismo mazo y gana la más alta.
//
// Verificable de punta a punta. El mazo se baraja al crear el desafío a partir
// de una semilla secreta, y se publica el hash de esa semilla **antes** de que
// nadie juegue. Al terminar se revela la semilla y cualquiera puede rehacer el
// barajado y comprobar que las cartas estaban decididas desde el principio.
//
// Ojo con algo que importa para la confianza: las dos cartas se sacan del mismo
// mazo barajado, así que **no se puede repetir la misma carta**, y las dos
// posiciones son igual de buenas. Ninguno de los dos tiene ventaja por jugar
// primero ni por jugar segundo.

export const FIGURAS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const PALOS = ["♠", "♥", "♦", "♣"] as const;
export type Palo = (typeof PALOS)[number];

export type Carta = {
  indice: number; // 0..51, posición en el mazo sin barajar
  figura: string;
  palo: Palo;
  valor: number; // 2..14, lo único que decide quién gana
};

export const cartaDe = (indice: number): Carta => ({
  indice,
  figura: FIGURAS[indice % 13],
  palo: PALOS[Math.floor(indice / 13)],
  valor: (indice % 13) + 2,
});

/**
 * Baraja los 52 con Fisher-Yates, usando la semilla como fuente de azar.
 *
 * Fisher-Yates y no "ordenar al azar": ordenar con un comparador aleatorio
 * reparte mal y algunas posiciones salen más que otras. Acá cada permutación
 * del mazo tiene la misma probabilidad, que es lo que hace justo el reparto.
 */
export function barajar(semilla: string): number[] {
  const mazo = Array.from({ length: 52 }, (_, i) => i);
  for (let i = mazo.length - 1; i > 0; i--) {
    // La etiqueta es el índice, igual que siempre: el barajado de las partidas
    // ya jugadas tiene que seguir dando exactamente lo mismo, o dejarían de ser
    // comprobables.
    const j = numeroDe(semilla, String(i), i + 1);
    [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
  }
  return mazo;
}

/** Las dos cartas de la partida: la primera para quien creó, la segunda para el rival. */
export function repartir(semilla: string): { creador: Carta; rival: Carta } {
  const mazo = barajar(semilla);
  return { creador: cartaDe(mazo[0]), rival: cartaDe(mazo[1]) };
}

export { nuevaSemilla, hashDe } from "./azar.ts";
