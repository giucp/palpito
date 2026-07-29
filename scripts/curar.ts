// El curado del día, escrito a mano sobre lo que el motor guardó.
//
// La serie curada existe para compararse con la del motor, así que cada fila
// lleva **qué dato se usó**, no una impresión. Donde las dos difieren es donde
// se aprende algo.
//
// **Las decisiones se identifican por equipo + hora**, no solo por equipo: en
// una doble jornada los mismos dos equipos juegan dos veces el mismo día y hay
// dos candidatos con el mismo nombre. Sin la hora, el curado se aplicaría al
// partido equivocado o a los dos.
//
// Uso: node scripts/curar.ts <fecha> [--escribir]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DECISIONES_POR_FECHA } from "./curados/indice.ts";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

const fecha = process.argv[2];
if (!fecha?.match(/^\d{4}-\d{2}-\d{2}$/)) {
  console.log("Uso: node scripts/curar.ts 2026-07-29 [--escribir]");
  process.exit(1);
}
const escribir = process.argv.includes("--escribir");

const decisiones = DECISIONES_POR_FECHA[fecha];
if (!decisiones) {
  console.log(`No hay decisiones escritas para el ${fecha}. Se agregan en scripts/curados/.`);
  process.exit(1);
}

const { data: filas } = await sb
  .from("senales_dia")
  .select("id, mercado, equipo, hora, partido, entra")
  .eq("fecha", fecha)
  .in("mercado", ["ganador", "linea"]);

if (!filas?.length) {
  console.log(`No hay candidatos guardados del ${fecha}`);
  process.exit(1);
}

const hhmm = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(11, 16) : "");

console.log(`Curado del ${fecha} · ${decisiones.length} decisiones sobre ${filas.length} candidatos\n`);

let discrepancias = 0;
let errores = 0;
for (const d of decisiones) {
  const cand = filas.filter(
    (x) => x.mercado === d.mercado && x.equipo === d.equipo && (!d.hora || hhmm(x.hora) === d.hora)
  );

  if (cand.length === 0) {
    console.log(`  ⚠ NO ENCONTRADO: [${d.mercado}] ${d.equipo}${d.hora ? ` (${d.hora})` : ""}`);
    errores++;
    continue;
  }
  // Si hay dos, la decisión es ambigua y NO se escribe: en una doble jornada
  // aplicarla a los dos partidos sería inventar una opinión que no se tomó.
  if (cand.length > 1) {
    console.log(
      `  ⚠ AMBIGUO: [${d.mercado}] ${d.equipo} casa con ${cand.length} candidatos ` +
        `(${cand.map((c) => hhmm(c.hora)).join(", ")}). Agregá \`hora\` a la decisión.`
    );
    errores++;
    continue;
  }

  const f = cand[0];
  const diff = f.entra !== d.tomo;
  if (diff) discrepancias++;
  console.log(
    `  ${d.tomo ? "TOMO " : "paso "} [${d.mercado}] ${d.equipo.padEnd(26)} ${hhmm(f.hora)}  ` +
      `motor: ${f.entra ? "verde" : "descartada"}${diff ? "   ← DISCREPANCIA" : ""}`
  );
  if (escribir) {
    const { error } = await sb
      .from("senales_dia")
      .update({ curado: d.tomo, curado_nota: d.nota, curado_at: new Date().toISOString() })
      .eq("id", f.id);
    if (error) {
      console.log(`      error al guardar: ${error.message}`);
      errores++;
    }
  }
}

console.log(`\n${discrepancias} discrepancias con el motor.`);
if (errores) console.log(`${errores} decisiones NO se pudieron aplicar.`);
console.log(escribir ? "Guardado." : "Nada escrito. Corré con --escribir para guardarlo.");
// Solo se fuerza la salida si algo falló. Con `process.exit(0)` mientras el
// cliente de Supabase sigue abierto, Node tira un "Assertion failed" al cerrar
// handles a medias: ruido feo al final de una corrida que salió bien.
if (errores) process.exit(1);
