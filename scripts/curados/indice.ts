// Las decisiones curadas, por día.
//
// Se guardan en el repositorio y no solo en la base **para que se puedan leer
// juntas**. Al mes, lo que enseña no es una nota suelta sino el patrón: si mis
// correcciones caen siempre del mismo lado por la misma razón, eso deja de ser
// curación y pasa a ser un modelo que hay que escribir.
//
// Cada nota dice **qué dato se usó**, no una impresión. Y cuando una decisión
// sale de haber fallado antes, se dice: eso es lo que después permite ver si el
// criterio mejoró o solo cambió.

export type Decision = {
  mercado: "ganador" | "linea";
  equipo: string;
  /** "HH:MM" en UTC. Obligatoria cuando hay doble jornada del mismo equipo. */
  hora?: string;
  tomo: boolean;
  nota: string;
};

const D_2026_07_29: Decision[] = [
  {
    mercado: "ganador",
    equipo: "Milwaukee Brewers",
    tomo: true,
    nota:
      "La tomo, y es la más sólida del día: los nueve modelos a favor, cosa que no pasa casi " +
      "nunca. Shane Drohan llega en 2.81 y Logan Webb viene cayendo fuerte, de 3.54 en la " +
      "temporada a 4.76 en sus últimas cinco. Ofensiva 87 y contra esa mano 91 lo acompañan.",
  },
  {
    mercado: "ganador",
    equipo: "Atlanta Braves",
    hora: "23:10",
    tomo: true,
    nota:
      "La tomo, la del segundo juego. Chris Sale en 2.30 sobre sus últimas cinco, con una " +
      "temporada de 2.65 que dice que no es racha; enfrente Christian Scott en 3.48. Ayer este " +
      "mismo enfrentamiento quedó anulado por suspensión, así que sigue sin haberse jugado.",
  },
  {
    mercado: "ganador",
    equipo: "Atlanta Braves",
    hora: "17:10",
    tomo: false,
    nota:
      "Paso, la del primer juego, y es el mismo Atlanta que sí tomo a las 23:10. La diferencia " +
      "es quién abre: AJ Smith-Shawver no tiene ninguna apertura previa, es un debut. Enfrente " +
      "Sean Manaea viene mal (5.56 contra 4.31 de su año), pero un abridor del que no existe un " +
      "solo dato es exactamente donde no hay que decidir. El motor la puso en verde con siete " +
      "modelos de nueve; para mí la falta de cobertura acá no es un tecnicismo.",
  },
  {
    mercado: "ganador",
    equipo: "Boston Red Sox",
    tomo: false,
    nota:
      "Paso, y ES UN CAMBIO DE CRITERIO RESPECTO DE AYER. Ayer tomé este mismo Boston con la " +
      "ofensiva en 34 y perdió. Hoy repite el patrón casi calcado: ofensiva en 32, ventaja " +
      "grande del abridor (Sandoval 3.07 contra Jacob Lopez 4.63). La hipótesis que quiero " +
      "probar es que una ofensiva en el fondo no se compensa con un buen abridor: un equipo que " +
      "no anota no gana aunque el rival anote poco. Si Boston gana hoy, la hipótesis es falsa.",
  },
  {
    mercado: "linea",
    equipo: "Atlanta Braves por 2+",
    hora: "23:10",
    tomo: false,
    nota:
      "Paso. Mismo motivo que ayer: ambiente de carreras en 34, o sea que la casa espera un " +
      "partido cerrado, y un duelo de pitcheo se gana por una carrera igual que por tres. " +
      "Aviso de honestidad: ayer esta hipótesis fue 2 aciertos y 1 fallo sobre tres run lines " +
      "resueltas, así que está lejos de comprobada.",
  },
];

// El 30 se curó dos veces. **La primera no cuenta**: se hizo por la mañana, sobre
// la escala vieja, y por la tarde se corrigió el motor con la proyección espejo.
// Los scores cambiaron —el bullpen de Pittsburgh pasó de 31 a 44— y una decisión
// tomada mirando otra lista no se reaplica: se rehace. Esto es lo rehecho.
const D_2026_07_30: Decision[] = [
  {
    mercado: "ganador",
    equipo: "Pittsburgh Pirates",
    tomo: false,
    nota:
      "Paso, y es el único verde del día. **Abre Yohan Ramírez, que no tiene NI UNA apertura " +
      "previa en la temporada: es un relevista abriendo.** El motor le pone 65 al modelo de " +
      "abridores usando su FIP de temporada, pero ese número sale de lanzar una entrada cada " +
      "tres días, no seis seguidas — y a un relevista el FIP le queda mejor justamente porque " +
      "lanza poco cada vez.\n\n" +
      "AVISO DE HONESTIDAD: esta decisión la tomé por la mañana con el bullpen en 31, y con la " +
      "escala corregida está en 44. O sea que la mitad de mi argumento —'el bullpen flojo va a " +
      "tener que cubrir seis entradas'— se debilitó: 44 es algo peor que el rival, no una " +
      "alarma. Lo que no cambia es que nadie sabe cómo rinde Ramírez abriendo, y eso es lo que " +
      "sostiene el paso.\n\n" +
      "HIPÓTESIS, para comprobar: el FIP de un relevista no sirve para juzgarlo como abridor, y " +
      "el motor no distingue los dos casos. Si Pittsburgh gana, es falsa.",
  },
  {
    mercado: "ganador",
    equipo: "Tampa Bay Rays",
    tomo: false,
    nota:
      "Paso, coincido con el motor, y lo digo porque estuve tentado. A favor: Texas llega " +
      "destrozado (bajas en 99) y abre Cole Winn, otro sin ninguna apertura previa. En contra: " +
      "el descanso en 17, que es el bullpen de Tampa exigido. Rescatarla contradiría el ajuste " +
      "que le hice al motor hoy mismo —un modelo solo, treinta puntos por debajo del resto, " +
      "suele tener razón— y no tiene sentido cambiar la regla por la mañana y saltármela por la " +
      "tarde.",
  },
  {
    mercado: "ganador",
    equipo: "Boston Red Sox",
    tomo: false,
    nota:
      "Paso, coincido. Sonny Gray llega mejor que su año (3.45 contra 3.74) y enfrente Mason " +
      "Barnett no tiene aperturas previas, así que la ventaja al abrir es real. Pero contra esa " +
      "mano está en 20, que con la escala corregida quiere decir que Boston batea claramente " +
      "peor que los Athletics contra la mano que les toca. Es el mismo patrón de ofensiva floja " +
      "que ya me hizo fallar dos veces con este equipo.",
  },
];

export const DECISIONES_POR_FECHA: Record<string, Decision[]> = {
  "2026-07-29": D_2026_07_29,
  "2026-07-30": D_2026_07_30,
};
