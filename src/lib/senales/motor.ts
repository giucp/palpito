import { mediana } from "./normalizar.ts";
import type { Modelo, Senal, Veredicto } from "./tipos.ts";

// Juntar lo que dijeron los modelos y decidir si el partido entra.
//
// No alcanza con promediar. Un promedio de 87 puede salir de
// `92, 88, 85, 81, 87` —cinco medidas de acuerdo— o de `95, 94, 42, 90, 89`,
// donde el bullpen está gritando que algo anda mal y las otras cuatro no lo
// escuchan. El primero es una recomendación; el segundo es un partido incierto y
// **no debería aparecer**.
//
// Por eso hay cuatro condiciones, y las cuatro pueden dejar un partido afuera:
//
//   1. Que el promedio llegue.
//   2. Que hayan medido suficientes modelos (los que no tienen datos no cuentan
//      como aprobados: cuentan como que no sabemos).
//   3. Que la mayoría esté de acuerdo, no solo que el promedio dé.
//   4. Que ninguno contradiga al resto.
//
// La cuarta es la que hace que esto valga la pena. Sin ella, esto es un ranking
// más.

export const REGLAS = {
  /** Por debajo de esto no se recomienda, por muy de acuerdo que estén. */
  scoreMinimo: 78,
  /**
   * A partir de acá se cuenta que un modelo "está a favor".
   *
   * 55 y no 60 porque **estos scores comparan a los dos equipos del partido, y
   * el empate está en 50**. Con el umbral en 60, un modelo en 58 —que quiere
   * decir "parejo, con un pelo de ventaja"— contaba como voto en contra, y un
   * equipo mejor en todo lo medible se caía por dos categorías donde estaba
   * igualado.
   */
  umbralAcuerdo: 55,
  /** Qué parte de los modelos que midieron tiene que estar a favor. */
  acuerdoMinimo: 0.75,
  /** Con menos de esta parte de los modelos midiendo, no se opina. */
  cobertura: 0.7,
  /**
   * Ningún modelo puede estar por debajo de esto, pase lo que pase.
   *
   * Por la misma razón que arriba: en una comparación entre dos, un 33 es "algo
   * peor que el rival", no una señal de alarma. La alarma empieza cuando el
   * equipo es **claramente** inferior en algo, y eso es por debajo de 25.
   */
  pisoCritico: 25,
  /**
   * Cuánto puede alejarse un modelo por debajo de la mediana antes de que se
   * considere que contradice al resto. 30 puntos es mucho: es la diferencia
   * entre "bueno" y "malo", no un matiz.
   */
  distanciaContradice: 30,
};

/**
 * Pasa un partido por todos los modelos y decide.
 *
 * Los pesos se **renormalizan** entre los modelos que sí tuvieron datos: si el
 * de clima no pudo medir, su 10% se reparte entre los demás en vez de contarse
 * como un cero, que sería castigar al partido por una falta nuestra.
 */
export function juzgar<T>(partido: T, modelos: Modelo<T>[]): Veredicto {
  const medidos: Array<{ m: Modelo<T>; s: Senal }> = [];
  const detalle: Veredicto["detalle"] = [];

  for (const m of modelos) {
    const s = m.mirar(partido);
    if (s) medidos.push({ m, s });
    detalle.push({
      id: m.id,
      nombre: m.nombre,
      score: s ? s.score : null,
      motivos: s ? s.motivos : ["Sin datos suficientes"],
    });
  }

  if (medidos.length === 0) {
    return {
      score: 0,
      midieron: 0,
      total: modelos.length,
      acuerdo: 0,
      contradice: null,
      entra: false,
      motivoDescarte: "No se pudo medir nada de este partido",
      detalle,
    };
  }

  const pesoTotal = medidos.reduce((a, x) => a + x.m.peso, 0);
  const score = Math.round(
    medidos.reduce((a, x) => a + x.s.score * x.m.peso, 0) / pesoTotal
  );

  const scores = medidos.map((x) => x.s.score);
  const acuerdo = scores.filter((s) => s >= REGLAS.umbralAcuerdo).length;
  const med = mediana(scores) ?? score;

  // El más bajo, y si está tan lejos del resto como para desautorizarlos.
  const peor = medidos.reduce((a, b) => (a.s.score <= b.s.score ? a : b));
  const contradice =
    med - peor.s.score >= REGLAS.distanciaContradice
      ? { id: peor.m.id, nombre: peor.m.nombre, score: peor.s.score }
      : null;

  // ---- Las cuatro puertas, en orden de lo más importante ----
  let motivoDescarte: string | null = null;

  if (medidos.length / modelos.length < REGLAS.cobertura) {
    motivoDescarte = `Faltan datos: solo midieron ${medidos.length} de ${modelos.length} modelos`;
  } else if (peor.s.score < REGLAS.pisoCritico) {
    motivoDescarte = `${peor.m.nombre} está en ${peor.s.score}, por debajo del piso`;
  } else if (contradice) {
    motivoDescarte = `${contradice.nombre} (${contradice.score}) contradice al resto`;
  } else if (acuerdo / medidos.length < REGLAS.acuerdoMinimo) {
    motivoDescarte = `Solo ${acuerdo} de ${medidos.length} modelos a favor`;
  } else if (score < REGLAS.scoreMinimo) {
    motivoDescarte = `Score ${score}, por debajo de ${REGLAS.scoreMinimo}`;
  }

  return {
    score,
    midieron: medidos.length,
    total: modelos.length,
    acuerdo,
    contradice,
    entra: motivoDescarte === null,
    motivoDescarte,
    detalle,
  };
}
