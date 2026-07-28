// El curado del 28/07, escrito a mano sobre lo que el motor guardó.
//
// La serie curada existe para compararse con la del motor, así que cada fila
// lleva **qué dato se usó**, no una impresión. Donde las dos series difieren es
// donde se aprende algo: si mis correcciones aciertan más, hay que mirar qué
// estaba viendo yo y convertirlo en un modelo.
//
// Uso: node scripts/curar-28.ts [--escribir]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

const FECHA = "2026-07-28";
const escribir = process.argv.includes("--escribir");

type Decision = { mercado: string; equipo: string; tomo: boolean; nota: string };

const DECISIONES: Decision[] = [
  // ---------------------------------------------------------------- las tomo
  {
    mercado: "ganador",
    equipo: "Boston Red Sox",
    tomo: true,
    nota:
      "La tomo, y es la más clara del día. Jake Bennett llega con 3.59 en sus últimas cinco; " +
      "enfrente Gage Jump se derrumbó, de 3.87 en la temporada a 6.94 en sus últimas cinco. " +
      "Eso no es una mala tarde, son cinco seguidas. La ofensiva en 34 no me preocupa: contra " +
      "un abridor que está regalando carreras, no hace falta ser una gran ofensiva.",
  },
  {
    mercado: "ganador",
    equipo: "Atlanta Braves",
    tomo: true,
    nota:
      "La tomo. Chris Sale es el mejor abridor de la jornada: 2.30 en sus últimas cinco, y su " +
      "temporada (2.65) dice que no es una racha. Enfrente Christian Scott en 3.48. La ventaja " +
      "es real y el resto de los modelos acompaña sin que ninguno grite.",
  },
  {
    mercado: "ganador",
    equipo: "New York Yankees",
    tomo: true,
    nota:
      "La tomo. Gerrit Cole viene mejor de lo que dice su año (3.60 en sus últimas cinco contra " +
      "3.96 de temporada) y enfrente Anthony Kay está en 5.50, que ya era malo en el año (5.18) " +
      "y va a peor. Contra esa mano en 52 y descanso en 46 son tibios, pero ninguno contradice.",
  },
  {
    mercado: "ganador",
    equipo: "Milwaukee Brewers",
    tomo: true,
    nota:
      "La tomo, con menos convicción que las otras tres. El motor no pudo medirle la forma a " +
      "Logan Henderson porque no llega al mínimo de entradas de temporada, pero sus últimas " +
      "cinco dan 3.47. Enfrente Landen Roupp está cayendo: 3.35 en el año, 4.18 en sus últimas " +
      "cinco. La ventaja existe pero es de medio punto, no de tres.",
  },
  {
    // -------------------------------------------------------------- rescates
    mercado: "ganador",
    equipo: "Los Angeles Dodgers",
    tomo: true,
    nota:
      "RESCATE: el motor la descarta por cobertura (6 de 9 modelos), no porque algo vaya mal. " +
      "Los Dodgers no anunciaron abridor y eso le vacía los tres modelos de pitcheo. Pero el " +
      "dato que sí está es el del rival: Luis Castillo llega en 5.24 contra 4.41 de su " +
      "temporada, o sea peor de lo suyo. Sumado a una ofensiva de 5.15 carreras por juego, un " +
      "bullpen descansado (4.6 entradas en tres días) y el mercado poniéndolos favoritos al " +
      "64%, hay de sobra para decidir sin saber quién abre.",
  },
  {
    mercado: "ganador",
    equipo: "Tampa Bay Rays",
    tomo: true,
    nota:
      "RESCATE, mismo caso que los Dodgers: descartada por cobertura, con Texas sin anunciar " +
      "abridor. Griffin Jax llega mejor que su año (3.82 contra 4.29). Y el dato que más pesa " +
      "acá es el de bajas, que el motor puntúa 99: Texas tiene 12 en la lista de lesionados y " +
      "Tampa 2. Eso es un equipo entero de diferencia.",
  },
  // ---------------------------------------------------------------- las paso
  {
    mercado: "linea",
    equipo: "Los Angeles Dodgers por 2+",
    tomo: false,
    nota:
      "Paso, aunque tomo el ganador del mismo partido. Ganar por dos o más pide margen, y acá " +
      "falta justo el dato que diría si lo hay: los Dodgers no anunciaron abridor. Para " +
      "quedarme con el ganador me alcanza saber que el rival llega mal; para la run line, no.",
  },
  {
    mercado: "linea",
    equipo: "Atlanta Braves por 2+",
    tomo: false,
    nota:
      "Paso. La ventaja del abridor es enorme (Sale), pero el ambiente de carreras está en 35: " +
      "la casa espera un partido cerrado. Un duelo de pitcheo se gana por una carrera tanto " +
      "como por tres, y la run line necesita las tres.",
  },
  {
    mercado: "linea",
    equipo: "New York Yankees por 2+",
    tomo: false,
    nota:
      "Paso. Cole tiene la ventaja al abrir (96), pero la ventaja al batear está en 42, o sea " +
      "ofensivas parejas. Ganar por dos con los bates igualados depende de que el bullpen rival " +
      "se rompa, y eso no es algo que yo sepa medir.",
  },
  {
    mercado: "linea",
    equipo: "Milwaukee Brewers por 2+",
    tomo: false,
    nota:
      "Paso. Mismo motivo que Atlanta: ambiente de carreras en 41 y una ventaja de abridores de " +
      "medio punto. Es el candidato más flojo de los cuatro de run line.",
  },
];

// La hipótesis que hay detrás de pasar en las cuatro run lines, escrita para
// que se pueda comprobar y no quede como manía: **la run line necesita dos
// cosas a la vez —ventaja clara Y un partido de carreras— y el motor las suma
// en vez de exigir las dos.** Si las cuatro aciertan, la hipótesis es falsa y
// hay que decirlo.

(async () => {
  const { data: filas } = await sb
    .from("senales_dia")
    .select("id, mercado, equipo, entra, score")
    .eq("fecha", FECHA)
    .in("mercado", ["ganador", "linea"]);

  if (!filas?.length) {
    console.log("No hay candidatos guardados del " + FECHA);
    return;
  }

  console.log(`Curado del ${FECHA} · ${DECISIONES.length} decisiones sobre ${filas.length} candidatos\n`);

  let discrepancias = 0;
  for (const d of DECISIONES) {
    const f = filas.find((x) => x.mercado === d.mercado && x.equipo === d.equipo);
    if (!f) {
      console.log(`  ⚠ NO ENCONTRADO: [${d.mercado}] ${d.equipo}`);
      continue;
    }
    const diff = f.entra !== d.tomo;
    if (diff) discrepancias++;
    console.log(
      `  ${d.tomo ? "TOMO " : "paso "} [${d.mercado}] ${d.equipo.padEnd(26)} ` +
        `motor: ${f.entra ? "verde" : "descartada"}${diff ? "   ← DISCREPANCIA" : ""}`
    );
    if (escribir) {
      const { error } = await sb
        .from("senales_dia")
        .update({ curado: d.tomo, curado_nota: d.nota, curado_at: new Date().toISOString() })
        .eq("id", f.id);
      if (error) console.log(`      error al guardar: ${error.message}`);
    }
  }

  console.log(`\n${discrepancias} discrepancias con el motor.`);
  console.log(
    escribir
      ? "Guardado."
      : "Nada escrito. Volvé a correrlo con --escribir para guardarlo."
  );
})();
