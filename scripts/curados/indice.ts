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

export const DECISIONES_POR_FECHA: Record<string, Decision[]> = {
  "2026-07-29": D_2026_07_29,
};
