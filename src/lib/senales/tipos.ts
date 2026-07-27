// El motor de señales de Pálpito.
//
// La idea, en una frase: **un partido no aparece porque sea favorito, aparece
// porque varias medidas independientes llegaron a la misma conclusión.**
//
// Eso es distinto de lo que hace la sección Análisis hoy. Los combos ordenan por
// el precio que pone el mercado y dicen con qué regla se armaron; acá cada
// partido lo miran varios modelos que no se hablan entre ellos, y solo pasa si
// se ponen de acuerdo.
//
// ## Lo que este motor NO hace
//
// **No inventa probabilidades.** Un score de 91 no quiere decir "gana el 91% de
// las veces". Quiere decir otra cosa, mucho más modesta y comprobable: "en las
// medidas que sabemos calcular, este equipo está en el 91% mejor de la jornada".
// Esa diferencia es todo: la primera afirmación no la podemos sostener con datos
// públicos, la segunda sí, y además se puede comprobar contra los resultados.
//
// Por eso la normalización es siempre **posicional dentro de la jornada** y no
// una curva inventada: el número sale de comparar contra los demás equipos o
// lanzadores de hoy, no de una fórmula que decidimos nosotros.
//
// ## Lo que sí hace
//
// 1. Cada modelo mira una cosa sola y da 0-100, o dice que no tiene datos.
// 2. Se promedia con pesos.
// 3. **Tienen que estar de acuerdo.** Un promedio alto con un modelo gritando lo
//    contrario no vale: eso es un partido incierto, no una recomendación.

/** Lo que devuelve un modelo cuando miró un partido. */
export type Senal = {
  /** 0 a 100. Siempre es una posición dentro de la jornada, nunca una probabilidad. */
  score: number;
  /** Lo que vio, en palabras. Es lo que se le muestra al usuario. */
  motivos: string[];
  /** Los números que lo justifican, para poder auditarlo después. */
  datos: Record<string, number | string | null>;
};

/**
 * Un modelo mira un partido y opina, **o dice que no puede opinar**.
 *
 * Devolver `null` cuando faltan datos es deliberado y es la regla más importante
 * de todo esto: un modelo sin datos NO vale 50. Si el bullpen no se pudo
 * calcular, el partido tiene una medida menos, y eso tiene que notarse en la
 * pantalla y pesar en la decisión. Rellenar con un 50 es exactamente la clase de
 * mentira silenciosa que hace que un score parezca sólido cuando no lo es.
 */
export type Modelo<T> = {
  id: string;
  nombre: string;
  /** Cuánto pesa en el promedio. Los pesos se renormalizan si algún modelo falta. */
  peso: number;
  mirar: (partido: T) => Senal | null;
};

export type Veredicto = {
  /** El promedio ponderado de los modelos que sí tuvieron datos. */
  score: number;
  /** Cuántos modelos opinaron y cuántos hay en total. */
  midieron: number;
  total: number;
  /** Cuántos de los que opinaron están por encima del umbral de acuerdo. */
  acuerdo: number;
  /** Qué modelo contradice al resto, si hay alguno. */
  contradice: { id: string; nombre: string; score: number } | null;
  /** Si entra o no, y por qué no. */
  entra: boolean;
  motivoDescarte: string | null;
  /** El detalle por modelo, que es lo que se dibuja en la tarjeta. */
  detalle: Array<{ id: string; nombre: string; score: number | null; motivos: string[] }>;
};
