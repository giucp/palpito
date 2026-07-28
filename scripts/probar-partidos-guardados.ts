// ¿Cada candidato y cada pata están enganchados al partido que dicen?
//
// Nace de un reporte: "los Dodgers juegan contra Houston, no contra Seattle".
// Resultó que no —Houston juega contra los Angels, y son dos equipos de Los
// Ángeles jugando la misma noche— pero la pregunta de fondo era la correcta:
// **si un candidato apuntara al partido equivocado, no se notaría en pantalla.**
// Se vería un nombre razonable, y al resolverse se mediría contra el marcador de
// otro juego. La estadística saldría mal y nadie lo sabría.
//
// Se comprueba todo contra la cartelera oficial de la MLB, que es una fuente
// independiente de la que arma los candidatos:
//
//   1. El `gamePk` guardado existe de verdad ese día.
//   2. El título guardado nombra a los dos equipos de ESE `gamePk`.
//   3. El equipo del candidato es uno de los dos que juegan.
//   4. El `lado` (local/visita) es el que le toca a ese equipo.
//   5. Ningún partido de la cartelera aparece con dos `gamePk` distintos.
//
// Uso: node scripts/probar-partidos-guardados.ts [fecha]
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

const fecha = process.argv[2]?.match(/^\d{4}-\d{2}-\d{2}$/)
  ? process.argv[2]
  : new Date().toISOString().slice(0, 10);

// ---- La verdad: la cartelera oficial ----
const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${fecha}&hydrate=team`);
const j = (await r.json()) as Record<string, unknown>;
type Juego = { local: string; visita: string; hora: string };
const oficial = new Map<string, Juego>();
for (const g of (((j.dates as Record<string, unknown>[]) ?? [])[0]?.games as Record<string, unknown>[]) ?? []) {
  const eq = g.teams as Record<string, Record<string, Record<string, string>>>;
  oficial.set(String(g.gamePk), {
    visita: eq.away.team.name,
    local: eq.home.team.name,
    hora: String(g.gameDate),
  });
}

console.log(`Cartelera oficial del ${fecha}: ${oficial.size} partidos\n`);
let fallos = 0;
const mal = (m: string) => {
  fallos++;
  console.log(`  ✗ ${m}`);
};

// ---- 1. Las señales ----
const { data: senales } = await sb
  .from("senales_dia")
  .select("mercado, equipo, partido, juego, lado")
  .eq("fecha", fecha);

console.log(`SEÑALES: ${senales?.length ?? 0} candidatos`);
for (const s of senales ?? []) {
  const g = oficial.get(String(s.juego));
  if (!g) {
    mal(`[${s.mercado}] ${s.equipo}: gamePk ${s.juego} no existe en la cartelera del ${fecha}`);
    continue;
  }

  // El título tiene que nombrar a los dos equipos de ese gamePk.
  if (!s.partido.includes(g.visita) || !s.partido.includes(g.local)) {
    mal(`[${s.mercado}] ${s.equipo}: dice "${s.partido}" pero ${s.juego} es ${g.visita} @ ${g.local}`);
    continue;
  }

  // Los totales nombran la línea ("Más de 8.5"), no un equipo: ahí no hay lado
  // que comprobar.
  if (s.mercado === "total") continue;

  // El nombre del candidato lleva sufijos como " por 2+".
  const suyo = String(s.equipo).replace(/ por 2\+$/, "");
  if (suyo !== g.local && suyo !== g.visita) {
    mal(`[${s.mercado}] "${suyo}" no juega en ${s.juego} (${g.visita} @ ${g.local})`);
    continue;
  }
  const ladoReal = suyo === g.local ? "local" : "visita";
  if (s.lado !== ladoReal) {
    mal(`[${s.mercado}] ${suyo}: guardado como "${s.lado}" y es "${ladoReal}" en ${s.juego}`);
  }
}

// ---- 2. Las patas de los combos ----
const { data: combos } = await sb.from("combos_dia").select("nombre, patas").eq("fecha", fecha);
const patas = (combos ?? []).flatMap((c) =>
  ((c.patas ?? []) as Array<Record<string, unknown>>).map((p) => ({ combo: c.nombre as string, p }))
);
console.log(`\nCOMBOS: ${combos?.length ?? 0} combos, ${patas.length} patas`);
for (const { combo, p } of patas) {
  const pk = String(p.juego ?? "");
  const g = oficial.get(pk);
  if (!g) {
    mal(`[${combo}] "${p.pick}": gamePk ${pk || "(vacío)"} no existe en la cartelera`);
    continue;
  }
  const titulo = String(p.partido ?? "");
  if (!titulo.includes(g.visita) || !titulo.includes(g.local)) {
    mal(`[${combo}] dice "${titulo}" pero ${pk} es ${g.visita} @ ${g.local}`);
    continue;
  }
  // Y que el lado apunte al equipo que el texto nombra.
  const ap = p.apuesta as Record<string, string> | undefined;
  if (ap?.lado && ap.equipo) {
    const esperado = ap.lado === "local" ? g.local : g.visita;
    if (ap.equipo !== esperado) {
      mal(`[${combo}] "${p.pick}": lado ${ap.lado} apunta a ${esperado}, pero dice ${ap.equipo}`);
    }
  }
}

// ---- 3. Ningún partido duplicado con distinto id ----
const porEquipos = new Map<string, string[]>();
for (const [pk, g] of oficial) {
  const k = `${g.visita}|${g.local}|${g.hora}`;
  porEquipos.set(k, [...(porEquipos.get(k) ?? []), pk]);
}
for (const [k, pks] of porEquipos) {
  if (pks.length > 1) mal(`La cartelera trae ${pks.length} ids para el mismo partido y hora: ${k} → ${pks.join(", ")}`);
}

console.log(`\n${"─".repeat(64)}`);
console.log(fallos === 0 ? "✓ Todo enganchado al partido correcto" : `✗ ${fallos} problemas`);
process.exit(fallos === 0 ? 0 : 1);
