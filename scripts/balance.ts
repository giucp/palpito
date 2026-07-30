// ¿Le va bien al motor? ¿Y al curado?
//
// **La columna que importa no es el acierto de los elegidos, es la diferencia
// contra los descartados.** Un 62% entre los elegidos no dice nada si los
// descartados también ganaron el 62%: querría decir que el motor no está
// eligiendo, está mirando.
//
// Y todo esto se lee con el tamaño de muestra al lado, siempre. Con pocos casos
// una diferencia de diez puntos es ruido, y el error más fácil de cometer acá es
// ajustar el motor contra ruido.
//
// Uso: node scripts/balance.ts
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

type Fila = {
  fecha: string;
  mercado: string;
  equipo: string;
  entra: boolean;
  curado: boolean | null;
  gano: boolean | null;
  score: number;
  detalle: Array<{ id: string; nombre: string; score: number | null }>;
};

const { data } = await sb
  .from("senales_dia")
  .select("fecha, mercado, equipo, entra, curado, gano, score, detalle")
  .not("gano", "is", null)
  .limit(10000);

const filas = (data ?? []) as Fila[];
if (!filas.length) {
  console.log("Todavía no hay nada resuelto.");
  process.exit(0);
}

const pct = (a: number, n: number) => (n ? `${((100 * a) / n).toFixed(0)}%` : "  —");
const dias = [...new Set(filas.map((f) => f.fecha))].sort();

/**
 * El margen de error de un porcentaje, a la gorda (1,96 · error estándar).
 *
 * Va en el informe porque sin él los números invitan a decidir. Con 11 casos,
 * un 55% tiene un margen de ±30 puntos: no se distingue de tirar una moneda, y
 * verlo escrito al lado es lo que frena el ajuste prematuro.
 */
const margen = (a: number, n: number) => {
  if (n < 2) return "";
  const p = a / n;
  return `±${(196 * Math.sqrt((p * (1 - p)) / n)).toFixed(0)}`;
};

const linea = (etiqueta: string, ganados: number, n: number) =>
  `  ${etiqueta.padEnd(22)} ${pct(ganados, n).padStart(4)} ${margen(ganados, n).padStart(5)}   ${String(ganados).padStart(3)} de ${String(n).padEnd(4)}`;

const gan = (fs: Fila[]) => fs.filter((f) => f.gano).length;

console.log(`BALANCE · ${dias.length} días resueltos (${dias[0]} a ${dias[dias.length - 1]})`);
console.log(`${filas.length} candidatos con resultado\n`);

// ---- 1. El motor ----
console.log("EL MOTOR");
const elegidos = filas.filter((f) => f.entra);
const descartados = filas.filter((f) => !f.entra);
console.log(linea("elegidos", gan(elegidos), elegidos.length));
console.log(linea("descartados", gan(descartados), descartados.length));
const dif = elegidos.length && descartados.length
  ? (100 * gan(elegidos)) / elegidos.length - (100 * gan(descartados)) / descartados.length
  : 0;
console.log(`  diferencia: ${dif > 0 ? "+" : ""}${dif.toFixed(0)} puntos a favor de los elegidos`);

for (const m of ["ganador", "linea", "total"]) {
  const e = elegidos.filter((f) => f.mercado === m);
  const d = descartados.filter((f) => f.mercado === m);
  if (!e.length && !d.length) continue;
  console.log(`\n  --- ${m} ---`);
  console.log(linea("  elegidos", gan(e), e.length));
  console.log(linea("  descartados", gan(d), d.length));
}

// ---- 2. El curado ----
const curados = filas.filter((f) => f.curado !== null);
if (curados.length) {
  console.log("\n\nEL CURADO (lo escribe Claude, no el dueño)");
  const tomadas = curados.filter((f) => f.curado === true);
  console.log(linea("las que tomé", gan(tomadas), tomadas.length));

  const disc = curados.filter((f) => f.curado !== f.entra);
  const mias = disc.filter((f) => f.curado === f.gano).length;
  console.log(`\n  discrepancias: ${disc.length}  →  curado ${mias} · motor ${disc.length - mias}`);
  for (const f of disc) {
    console.log(
      `    ${f.fecha}  ${f.curado ? "TOMÉ  " : "pasé  "}${f.equipo.padEnd(26)}` +
        `motor:${(f.entra ? "verde" : "fuera").padEnd(6)} ${f.gano ? "GANÓ  " : "perdió"} ` +
        `${f.curado === f.gano ? "✓" : "✗"}`
    );
  }
}

// ---- 3. Cada modelo, por su cuenta ----
console.log("\n\nCUANDO UN MODELO SE MOJA (score >= 65), ¿ACIERTA?");
const pm: Record<string, { n: number; a: number; nombre: string }> = {};
for (const f of filas) {
  for (const d of f.detalle ?? []) {
    if (d.score === null || d.score < 65) continue;
    const x = (pm[d.id] ??= { n: 0, a: 0, nombre: d.nombre });
    x.n++;
    if (f.gano) x.a++;
  }
}
for (const [id, v] of Object.entries(pm).sort((a, b) => b[1].n - a[1].n)) {
  console.log(linea(id, v.a, v.n) + (v.n < 100 ? "  muestra chica" : ""));
}
console.log(`\n  el azar en esta muestra es ${pct(gan(filas), filas.length)}`);

// ---- 4. El patrón que se está vigilando ----
//
// `lejosParaDescartar` se subió a 2 el 27/07 para que el motor dejara de
// descartar por aritmética. La duda abierta es si con eso entran candidatos que
// un solo modelo estaba señalando bien. Cada caso acá es un verde que la regla
// vieja habría tumbado.
console.log("\n\nEL MODELO SOLITARIO QUE GRITA");
console.log("  (verdes que la regla vieja —1 modelo lejos de la mediana descarta— habría tumbado)");
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
let aFavorDeLaViejaRegla = 0;
let enContra = 0;
for (const f of elegidos) {
  const ss = (f.detalle ?? []).filter((d) => d.score !== null).map((d) => d.score as number);
  if (ss.length < 3) continue;
  const med = mediana(ss);
  const lejos = (f.detalle ?? []).filter((d) => d.score !== null && med - (d.score as number) >= 30);
  if (lejos.length !== 1) continue;
  if (f.gano) enContra++;
  else aFavorDeLaViejaRegla++;
  console.log(
    `    ${f.fecha}  ${f.equipo.padEnd(26)} ${lejos[0].nombre} en ${lejos[0].score} ` +
      `(mediana ${med})  ${f.gano ? "GANÓ  → la regla vieja se lo perdía" : "perdió → la regla vieja acertaba"}`
  );
}
console.log(`\n  la regla vieja habría acertado en ${aFavorDeLaViejaRegla} y fallado en ${enContra}`);
console.log(
  aFavorDeLaViejaRegla >= 3 && aFavorDeLaViejaRegla > enContra * 2
    ? "  >>> YA SON TRES A FAVOR: toca revertir `lejosParaDescartar` a 1"
    : "  todavía no alcanza para revertir"
);
