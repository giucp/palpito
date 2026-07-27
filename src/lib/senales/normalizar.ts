// Cómo se convierte una estadística en un número del 0 al 100.
//
// Esta es la decisión más importante del motor, y la que separa un score honesto
// de uno inventado.
//
// **Se normaliza por posición dentro de la jornada, no con una curva nuestra.**
//
// Si dijéramos "un FIP de 3.20 vale 88 puntos" estaríamos inventando la escala:
// ¿por qué 88 y no 79? No hay forma de defenderlo. En cambio, si decimos "este
// abridor está mejor que el 88% de los que lanzan hoy", el número significa algo
// concreto, se puede comprobar mirando la lista, y no depende de que hayamos
// acertado con una fórmula.
//
// Efecto secundario que hay que tener presente: **los scores son relativos a la
// jornada.** Un 95 en un día flojo no es lo mismo que un 95 en un día con cuatro
// ases lanzando. Por eso el motor guarda también los números crudos: para poder
// comparar entre días cuando haya historial.

/**
 * Dónde cae un valor dentro de un conjunto, de 0 a 100.
 *
 * `mayorEsMejor: false` para las estadísticas donde conviene el número bajo
 * (efectividad, WHIP, FIP).
 *
 * Con menos de tres valores para comparar devuelve `null`: una posición dentro
 * de dos números no dice nada, y es preferible declarar que no se pudo medir.
 */
export function posicion(
  valor: number,
  conjunto: number[],
  mayorEsMejor = true
): number | null {
  const validos = conjunto.filter((v) => Number.isFinite(v));
  if (validos.length < 3) return null;

  const peores = validos.filter((v) => (mayorEsMejor ? v < valor : v > valor)).length;
  const iguales = validos.filter((v) => v === valor).length;
  // Se cuenta la mitad de los empates, que es la forma estándar de no premiar ni
  // castigar por estar empatado.
  const pct = ((peores + iguales / 2) / validos.length) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

/**
 * La ventaja de uno sobre otro, llevada a 0-100 con el 50 en el empate.
 *
 * Sirve para los modelos que comparan a los dos equipos de un partido en vez de
 * medir a uno contra la liga. `escala` es la diferencia que se considera una
 * ventaja clara: a esa distancia el score llega a ~90.
 */
export function ventaja(mio: number, suyo: number, escala: number, mayorEsMejor = true): number {
  const dif = (mayorEsMejor ? mio - suyo : suyo - mio) / escala;
  // Curva suave y acotada: sin saltos y sin que una diferencia enorme se lleve
  // el score a 100 y aplaste al resto de los modelos.
  const s = 50 + 50 * Math.tanh(dif);
  return Math.round(Math.max(0, Math.min(100, s)));
}

/** El promedio de una lista, o null si está vacía. */
export const promedio = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** La mediana, que aguanta mejor un valor disparatado que el promedio. */
export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
