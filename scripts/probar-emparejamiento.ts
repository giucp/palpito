// ¿Las fuentes gratuitas emparejan bien con la cartelera de The Odds API?
//
// Acá hay dinero de por medio: un emparejamiento equivocado liquida una apuesta
// con el marcador de otro partido. Por eso este script no se conforma con contar
// cuántos emparejó, sino que **compara el marcador contra el que ya cerró The
// Odds API** en los eventos finalizados. Si alguno discrepa, el emparejador está
// mal y no se puede confiar en él.
//
// Uso: node scripts/probar-emparejamiento.ts

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import {
  buscarResultados,
  parecido,
  LIGAS_ESPN,
  type EventoPendiente,
} from "../src/lib/resultados/index.ts";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

type EventoBase = EventoPendiente & {
  estado: string;
  marcador_a: number | null;
  marcador_b: number | null;
};

const { data, error } = await sb
  .from("eventos")
  .select("id, deporte, liga, equipo_a, equipo_b, comienza_at, estado, marcador_a, marcador_b")
  .order("comienza_at", { ascending: false })
  .limit(500);

if (error) {
  console.error("No se pudo leer la base:", error.message);
  process.exit(1);
}

// Solo las ligas con fuente propia. Las de referencia (UFC, NBA, CS2…) son
// datos sembrados a mano y no existen en ninguna fuente real.
const conFuente = (data as EventoBase[]).filter(
  (e) => e.deporte === "beisbol" || LIGAS_ESPN[e.liga]
);
const descartados = (data as EventoBase[]).length - conFuente.length;

console.log(
  `Eventos en la base: ${data!.length} · con fuente propia: ${conFuente.length}` +
    (descartados > 0 ? ` · descartados por ser de prueba: ${descartados}` : "")
);

const { resueltos, enCurso, cancelados, sinResolver } = await buscarResultados(conFuente);
const porId = new Map(conFuente.map((e) => [e.id, e]));

console.log(
  `\nEmparejados con marcador: ${resueltos.length}` +
    ` · encontrados sin terminar: ${enCurso.length}` +
    ` · postergados o cancelados: ${cancelados.length}` +
    ` · sin encontrar: ${sinResolver.length}`
);

for (const e of cancelados) {
  console.log(`  postergado: ${e.liga} · ${e.equipo_a} vs ${e.equipo_b} · ${e.comienza_at}`);
}

// ---- La comprobación que importa: ¿coincide con lo que ya cerró The Odds API? ----
const yaCerrados = resueltos.filter((r) => {
  const e = porId.get(r.eventoId)!;
  return e.estado === "finalizado" && e.marcador_a !== null && e.marcador_b !== null;
});

let discrepancias = 0;
for (const r of yaCerrados) {
  const e = porId.get(r.eventoId)!;
  const igual = e.marcador_a === r.marcadorA && e.marcador_b === r.marcadorB;
  if (!igual) {
    discrepancias++;
    console.log(
      `  ✗ ${e.liga} · ${e.equipo_a} vs ${e.equipo_b}\n` +
        `      The Odds API: ${e.marcador_a}-${e.marcador_b} · ${r.fuente}: ${r.marcadorA}-${r.marcadorB}`
    );
  }
}
console.log(
  `\nContraste con eventos ya cerrados por The Odds API: ${yaCerrados.length} comparados, ` +
    `${discrepancias} discrepancias`
);

// ---- Lo que no se pudo emparejar, para saber qué falta afinar ----
if (sinResolver.length > 0) {
  console.log("\nSin encontrar en la fuente propia:");
  const porLiga = new Map<string, EventoPendiente[]>();
  for (const e of sinResolver) {
    porLiga.set(e.liga, [...(porLiga.get(e.liga) ?? []), e]);
  }
  for (const [liga, lista] of porLiga) {
    console.log(`  ${liga} (${lista.length})`);
    for (const e of lista.slice(0, 8)) {
      console.log(`     ${e.equipo_a} vs ${e.equipo_b} · ${e.comienza_at}`);
    }
    if (lista.length > 8) console.log(`     … y ${lista.length - 8} más`);
  }
}

// ---- Cobertura de planteles ----
// La prueba de arriba solo mira los partidos que hay hoy en la cartelera. Esta
// compara los planteles enteros, así un alias que falta (tipo LAFC) aparece
// ahora y no dentro de un mes, con una apuesta colgada.
console.log("\n== Cobertura de planteles ==");

const equiposPorLiga = new Map<string, Set<string>>();
for (const e of conFuente) {
  const set = equiposPorLiga.get(e.liga) ?? new Set<string>();
  set.add(e.equipo_a);
  set.add(e.equipo_b);
  equiposPorLiga.set(e.liga, set);
}

let huerfanos = 0;
for (const [liga, equipos] of equiposPorLiga) {
  let ajenos: string[];
  if (LIGAS_ESPN[liga]) {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${LIGAS_ESPN[liga]}/teams`
    );
    const d = await r.json();
    ajenos = (d.sports[0].leagues[0].teams as Array<{ team: { displayName: string } }>).map(
      (t) => t.team.displayName
    );
  } else {
    const r = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1");
    const d = await r.json();
    ajenos = (d.teams as Array<{ name: string }>).map((t) => t.name);
  }

  const sinPar: Array<[string, string, number]> = [];
  for (const nuestro of equipos) {
    let mejor = "";
    let punt = 0;
    for (const ajeno of ajenos) {
      const p = parecido(nuestro, ajeno);
      if (p > punt) {
        punt = p;
        mejor = ajeno;
      }
    }
    if (punt < 0.72) sinPar.push([nuestro, mejor, punt]);
  }

  huerfanos += sinPar.length;
  console.log(
    `  ${liga}: ${equipos.size} equipos · ${sinPar.length === 0 ? "todos emparejan" : `${sinPar.length} sin par`}`
  );
  for (const [nuestro, mejor, punt] of sinPar) {
    console.log(`     "${nuestro}" → lo más cercano: "${mejor}" (${punt.toFixed(2)})`);
  }
}

const listo = discrepancias === 0 && sinResolver.length === 0 && huerfanos === 0;
console.log(
  `\n${listo ? "✓ Emparejamiento limpio." : "⚠ Revisar lo de arriba antes de confiar en esto."}`
);
