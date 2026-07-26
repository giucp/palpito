// Tabla de premios de "El Muelle". No tiene nada secreto —el jugador debe
// poder verla antes de apostar— así que vive aparte de la lógica del servidor
// para poder usarla también en el navegador.

export const DEVOLUCION = 0.97;

/**
 * La escalera de premios, elegida a mano.
 *
 * Va al revés que antes, y ese es el arreglo. Antes se fijaban las
 * probabilidades y el multiplicador salía de dividir: `0.97 / probabilidad`.
 * Como eso casi nunca cae en un número de dos decimales, había que recortarlo
 * (`Math.floor`) y el recorte se lo quedaba la casa. La ventaja real no era el
 * 3% prometido sino entre 3,02% y 3,49% según dónde te bajaras.
 *
 * Ahora se eligen primero los premios —números limpios, que se leen bien— y de
 * ahí se deducen las probabilidades. Así el retorno es 97% exacto en cada
 * escalón, por construcción, y no hay nada que redondear.
 */
export const PREMIOS = [1.12, 1.4, 1.8, 2.4, 3.3, 4.7, 7, 11, 18, 32];

export const TABLAS = PREMIOS.length;

/** Los multiplicadores tal cual: ya son la escalera. */
export const multiplicadores = (): number[] => [...PREMIOS];

/**
 * Probabilidad de superar cada paso. Sale de la escalera: para que pagar
 * `PREMIOS[i]` devuelva el 97%, hay que llegar ahí exactamente `0.97 / PREMIOS[i]`
 * de las veces. Encadenando, la de cada paso es el cociente entre premios.
 */
export const FIRMEZA = PREMIOS.map((premio, i) =>
  i === 0 ? DEVOLUCION / premio : PREMIOS[i - 1] / premio
);

/**
 * Cómo se reparte la firmeza entre las **dos tablas** de cada paso.
 *
 * En cada paso hay dos tablas y elegís una; la otra se rompe igual, para que se
 * vea qué habría pasado. Para que la probabilidad de pasar sea exactamente `f`
 * habiendo una elección de verdad:
 *
 *   · con probabilidad `2f - 1`, las dos están sanas y pasás seguro;
 *   · con el resto, una de las dos está podrida y es 50 y 50 real.
 *
 *   pasar = (2f-1)·1 + 2(1-f)·½ = f   ✔
 *
 * Con la escalera de arriba la firmeza nunca baja de 0,563, así que **nunca**
 * están las dos podridas: siempre hay una salida y elegir importa. (Si alguna
 * vez se usara una firmeza por debajo de 0,5, el caso está contemplado: ahí
 * pasarían a estar las dos podridas parte de las veces.)
 */
export function probabilidadAmbasSanas(firmeza: number): number {
  return Math.max(0, 2 * firmeza - 1);
}

export function probabilidadAmbasPodridas(firmeza: number): number {
  return Math.max(0, 1 - 2 * firmeza);
}
