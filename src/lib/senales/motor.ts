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
  /**
   * Por debajo de esto no se recomienda, y se mide **por posición dentro de la
   * jornada** — ver `puertaDeScore`, que es donde se aplica.
   *
   * 78 quiere decir "entre el 22% mejor de los candidatos de hoy". Antes se
   * comparaba contra el promedio ponderado crudo y eso estaba roto: un promedio
   * de percentiles ya no es un percentil, tiende al centro. El día que se midió,
   * el score máximo alcanzado fue 79 en ganador, **77 en totales y 72 en run
   * line**, así que en dos de las tres familias ningún candidato podía pasar
   * nunca. No era un día flojo: era inalcanzable.
   */
  scoreMinimo: 78,
  /**
   * A partir de acá se cuenta que un modelo "está a favor": que **apunte a este
   * lado**, nada más.
   *
   * Estos scores comparan a los dos equipos del partido, así que el empate está
   * en 50 y cualquier cosa por encima ya es una opinión a favor. Estuvo en 60 y
   * en 55; los dos castigaban al modelo que dice "parejo, con un pelo de
   * ventaja" tratándolo como voto en contra.
   */
  umbralAcuerdo: 51,
  /** Qué parte de los modelos que midieron tiene que estar a favor. */
  acuerdoMinimo: 0.75,
  /** Con menos de esta parte de los modelos midiendo, no se opina. */
  cobertura: 0.7,
  /**
   * Ningún modelo puede estar por debajo de esto... salvo uno solo. Ver
   * `bajosParaDescartar`, que es la parte que importa.
   */
  pisoCritico: 25,
  /**
   * **Cuántos** modelos tienen que estar bajo el piso para tumbar un candidato.
   *
   * Que sea 2 y no 1 no es aflojar la regla: es que con un solo modelo la regla
   * medía aritmética en vez de señal. Los modelos se normalizan con `posicion()`,
   * que devuelve un percentil, así que **por definición el 25% de los candidatos
   * cae por debajo de 25 en cada modelo**. Con cuatro modelos posicionales,
   * salvarse de los cuatro tiene una probabilidad de 0,75⁴ = 32%: el motor
   * descartaba a dos de cada tres candidatos por una propiedad de la escala, no
   * por nada que pasara en el partido.
   *
   * **Se queda en 2, y ahora hay con qué defenderlo.** Medido sobre cuatro días:
   * de los verdes que la regla vieja habría tumbado, **el piso no tumba a
   * ninguno por su cuenta** —cero casos en 17 verdes—. Subirlo fue inocuo, así
   * que volverlo a 1 sería revertir por simetría con la regla de abajo, sin
   * ningún motivo medido.
   */
  bajosParaDescartar: 2,
  /**
   * Cuánto puede alejarse un modelo por debajo de la mediana antes de que se
   * considere que contradice al resto. 30 puntos es mucho: es la diferencia
   * entre "bueno" y "malo", no un matiz.
   *
   * Se probaron 35, 40, 45 y 50 sobre los cuatro días: **la distancia no
   * discrimina**. En todos los umbrales la proporción de acierto es la misma
   * (4-1, 3-1, 2-1, 1-0), solo cambia a cuántos atrapa. Subirla no mejora nada.
   */
  distanciaContradice: 30,
  /**
   * Cuántos modelos tienen que contradecir al resto. **Uno alcanza.**
   *
   * Estuvo en 2 del 27 al 30 de julio, subido junto con `bajosParaDescartar` y
   * con el mismo argumento aritmético. **El argumento solo era bueno para el
   * otro**, y estos cuatro días lo dejaron a la vista: es esta puerta la que
   * hace todo el trabajo —deja entrar 6 de los 17 verdes— y de esos, la mayoría
   * perdió. Contando las tres familias, la regla vieja habría acertado en 4 y
   * fallado en 1.
   *
   * Lo que dice el dato, en una frase: **un modelo solo, treinta puntos por
   * debajo de todos los demás, suele tener razón.** El bullpen en 28 cuando el
   * resto anda por 78 no es ruido de escala, es un aviso.
   *
   * La muestra es chica (5 casos) y el criterio para volver a subirlo está
   * escrito: que aparezcan tres candidatos tumbados por esta puerta que
   * hubieran ganado.
   */
  lejosParaDescartar: 1,
};

/**
 * La banda donde un modelo **se abstiene** en vez de votar en contra.
 *
 * Hace falta en los totales y no en el ganador, y la diferencia es de fondo:
 *
 *   · En el ganador, un modelo en 50 dice "los dos equipos están igualados", y
 *     eso **sí** es un argumento en contra de elegir a uno de los dos.
 *   · En los totales, un 50 dice "esto no empuja ni hacia arriba ni hacia
 *     abajo". Eso no es estar en contra: es no tener opinión.
 *
 * Sin esta banda, un partido con dos abridores horribles, dos ofensivas buenas y
 * calor —tres señales fuertes hacia arriba— se caía porque otros tres modelos
 * estaban en 47 diciendo "yo de esto no sé".
 */
export type Opciones = { neutral?: number };

/** Lo que dijo cada modelo, antes de juzgar nada. */
export type Medicion = {
  id: string;
  nombre: string;
  peso: number;
  score: number | null;
  motivos: string[];
};

/** Pasa un candidato por los modelos y anota lo que dice cada uno. No juzga. */
export function medir<T>(partido: T, modelos: Modelo<T>[]): Medicion[] {
  return modelos.map((m) => {
    const s = m.mirar(partido);
    return {
      id: m.id,
      nombre: m.nombre,
      peso: m.peso,
      score: s ? s.score : null,
      motivos: s ? s.motivos : ["Sin datos suficientes"],
    };
  });
}

/**
 * Deja los scores de un par en escala espejo: `50 + (a − b) / 2`.
 *
 * ## El problema que arregla, que estaba en el suelo de todo el motor
 *
 * Cualquier par de scores de un partido se descompone en dos números:
 *
 * ```
 *   d = (a − b) / 2   →  quién es mejor            (la parte espejo)
 *   m = (a + b) / 2   →  qué tan bueno es el partido (la parte común)
 * ```
 *
 * **Un modelo es espejo si y solo si su `m` vale 50.** Cuatro de los nueve
 * mezclaban `posicion()` (dónde cae en la jornada, absoluto) con `ventaja()`
 * (cuánto le saca al rival, relativo) al 50/50, así que metían calidad del
 * partido dentro de `m` — y **todas las puertas leían `m + d` creyendo que leían
 * `d`**.
 *
 * Lo que se veía: dos abridores idénticos y los dos malos daban 35 y 35. Un
 * empate real aparecía como dos candidatos en contra. Y al revés, entre dos
 * equipos de élite los dos subían a 65, así que el favorito cobraba la calidad
 * del partido como si fuera ventaja propia. Medido sobre 54 partidos: los de
 * "suma alta" producían un verde el 56% de las veces y los de suma baja, nunca.
 *
 * ## Por qué proyectar y no borrar la mitad absoluta de cada modelo
 *
 * Porque `(p_A − p_B)`, la **diferencia** de posiciones en la jornada, es
 * información legítimamente relativa aunque venga de la mitad "absoluta".
 * Borrar `enLaJornada` la tiraría; proyectar la conserva y solo elimina `m`.
 *
 * Y porque así el invariante lo garantiza el motor a la salida, no la buena
 * conducta de cada modelo: **ningún modelo futuro puede volver a romperlo**.
 *
 * ## Lo que se descarta no se pierde: se anota
 *
 * `m − 50` es exactamente "cuánto mejor es este partido que el promedio del
 * día". Se devuelve aparte, para registrarlo junto a cada candidato. La intuición
 * del comentario viejo —"una ventaja grande entre dos malos no es una
 * recomendación"— tiene un núcleo válido, pero es sobre **confianza, no sobre
 * dirección**, y meterla dentro de la dirección fue el error. Queda como
 * hipótesis registrada: si a los 30 picks los verdes de partidos flojos rinden
 * peor, se promueve a puerta con evidencia propia.
 */
export function proyectarPar(a: Medicion[], b: Medicion[]): {
  a: Medicion[];
  b: Medicion[];
  /** `m − 50` por modelo: cuánta calidad de partido se descartó. */
  calidad: Array<{ id: string; sobre: number }>;
} {
  const calidad: Array<{ id: string; sobre: number }> = [];
  const porId = new Map(b.map((x) => [x.id, x]));

  const proyectar = (uno: Medicion[], otro: Map<string, Medicion>, signo: 1 | -1) =>
    uno.map((x) => {
      const y = otro.get(x.id);
      // Un modelo pareado que solo pudo medir un lado no midió: sin el otro no
      // hay diferencia que calcular, y publicar el crudo sería volver a mezclar.
      if (x.score === null || !y || y.score === null) return { ...x, score: null };
      const d = (x.score - y.score) / 2;
      return { ...x, score: Math.max(0, Math.min(100, Math.round(50 + signo * d))) };
    });

  for (const x of a) {
    const y = porId.get(x.id);
    if (x.score !== null && y && y.score !== null) {
      calidad.push({ id: x.id, sobre: Math.round((x.score + y.score) / 2 - 50) });
    }
  }

  return {
    a: proyectar(a, porId, 1),
    b: proyectar(b, new Map(a.map((x) => [x.id, x])), 1),
    calidad,
  };
}

/**
 * Pasa un partido por todos los modelos y decide.
 *
 * Los pesos se **renormalizan** entre los modelos que sí tuvieron datos: si el
 * de clima no pudo medir, su 10% se reparte entre los demás en vez de contarse
 * como un cero, que sería castigar al partido por una falta nuestra.
 *
 * `medicion` permite pasarle scores ya proyectados (ver `proyectarPar`); si no
 * se pasa, mide y juzga sobre el crudo.
 */
export function juzgar<T>(
  partido: T,
  modelos: Modelo<T>[],
  opciones: Opciones = {},
  medicion?: Medicion[]
): Veredicto {
  const anotado = medicion ?? medir(partido, modelos);
  const medidos = anotado
    .filter((x) => x.score !== null)
    .map((x) => ({ m: { id: x.id, nombre: x.nombre, peso: x.peso }, s: { score: x.score as number } }));
  const detalle: Veredicto["detalle"] = anotado.map((x) => ({
    id: x.id,
    nombre: x.nombre,
    score: x.score,
    motivos: x.motivos,
  }));

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
  // Los que se abstienen no cuentan ni de un lado ni del otro: salen del
  // denominador en vez de arrastrar el acuerdo hacia abajo.
  const opinaron = opciones.neutral
    ? scores.filter((s) => s >= REGLAS.umbralAcuerdo || s <= opciones.neutral!).length
    : medidos.length;
  const med = mediana(scores) ?? score;

  // El más bajo, y si está tan lejos del resto como para desautorizarlo.
  const peor = medidos.reduce((a, b) => (a.s.score <= b.s.score ? a : b));
  const contradice =
    med - peor.s.score >= REGLAS.distanciaContradice
      ? { id: peor.m.id, nombre: peor.m.nombre, score: peor.s.score }
      : null;
  const bajos = medidos.filter((x) => x.s.score < REGLAS.pisoCritico);
  const lejos = medidos.filter((x) => med - x.s.score >= REGLAS.distanciaContradice);

  // ---- Las puertas, en orden de lo más importante ----
  //
  // La de score NO está acá: se aplica en `puertaDeScore`, porque para saber si
  // un candidato está entre los mejores del día hace falta ver el día entero, y
  // esta función mira un partido a la vez.
  let motivoDescarte: string | null = null;

  if (medidos.length / modelos.length < REGLAS.cobertura) {
    motivoDescarte = `Faltan datos: solo midieron ${medidos.length} de ${modelos.length} modelos`;
  } else if (bajos.length >= REGLAS.bajosParaDescartar) {
    motivoDescarte = `${bajos.length} modelos por debajo del piso (${bajos
      .map((x) => `${x.m.nombre} ${x.s.score}`)
      .join(", ")})`;
  } else if (lejos.length >= REGLAS.lejosParaDescartar) {
    motivoDescarte = `${lejos.length} modelos contradicen al resto (${lejos
      .map((x) => `${x.m.nombre} ${x.s.score}`)
      .join(", ")})`;
  } else if (opinaron === 0) {
    motivoDescarte = "Ningún modelo se moja: todos neutrales";
  } else if (acuerdo / opinaron < REGLAS.acuerdoMinimo) {
    motivoDescarte = `Solo ${acuerdo} de ${opinaron} modelos con opinión están a favor`;
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

/**
 * La última puerta: estar entre los mejores **del día**.
 *
 * Va aparte de `juzgar` porque es la única que no se puede contestar mirando un
 * partido solo. Se le pasan todos los veredictos de una familia (todos los
 * "quién gana" de hoy, o todos los totales) y devuelve los mismos veredictos con
 * `entra` y `motivoDescarte` ya definitivos.
 *
 * **Por qué posición y no el promedio crudo.** Todo el motor normaliza por
 * posición dentro de la jornada — es su regla fundadora, la que evita inventar
 * una curva. Pero el score global era un promedio ponderado de esas posiciones,
 * y un promedio de percentiles ya no es un percentil: tiende al centro. Cuantos
 * más modelos, más se aplasta contra 50. Por eso el umbral de 78, que se pensó
 * como "el 22% mejor", terminó siendo un número que casi nadie podía alcanzar:
 * el día que se midió, el máximo fue 79 en ganador, 77 en totales y 72 en run
 * line. En dos de las tres familias era imposible pasar, cualquiera fuera el
 * partido.
 *
 * Con la posición, 78 vuelve a querer decir lo que decía.
 *
 * El `score` que se guarda y se muestra **no cambia**: sigue siendo el promedio
 * ponderado. Lo que cambia es contra qué se lo compara.
 */
export function puertaDeScore(veredictos: Veredicto[]): Veredicto[] {
  // Con muy pocos candidatos la posición no significa nada —ser "el mejor de
  // tres" no dice gran cosa— así que se deja pasar lo que ya venía pasando en
  // vez de inventar un orden.
  if (veredictos.length < 5) return veredictos;

  const todos = veredictos.map((v) => v.score);
  return veredictos.map((v) => {
    if (!v.entra) return v;
    const peores = todos.filter((s) => s < v.score).length;
    const iguales = todos.filter((s) => s === v.score).length;
    const posicion = Math.round(((peores + iguales / 2) / todos.length) * 100);
    if (posicion >= REGLAS.scoreMinimo) return v;
    return {
      ...v,
      entra: false,
      motivoDescarte: `Score ${v.score}: puesto ${posicion} de la jornada, por debajo de ${REGLAS.scoreMinimo}`,
    };
  });
}
