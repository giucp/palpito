// El motor de señales, contra la jornada de verdad.
//
// Imprime lo que ve cada modelo en cada equipo del día, el score final y —lo más
// importante— **por qué se descarta** cada uno de los que no entran. Eso último
// es lo que permite ajustar los umbrales mirando datos y no a ojo.
//
// Uso: node scripts/probar-senales.ts [fecha] [--todos]
//   --todos  muestra también los descartados con su detalle

import { traerJornada } from "../src/lib/senales/datos.ts";
import { MODELOS, candidatosDe, nombreDe } from "../src/lib/senales/modelos.ts";
import { juzgar, REGLAS } from "../src/lib/senales/motor.ts";
import { mercadoDelDia, balanceSenales } from "../src/lib/senales/guardar.ts";

const fecha = process.argv[2]?.match(/^\d{4}-\d{2}-\d{2}$/)
  ? process.argv[2]
  : new Date().toISOString().slice(0, 10);
const todos = process.argv.includes("--todos");

console.log(`Jornada del ${fecha}\n`);
console.log(
  `Reglas: score ≥ ${REGLAS.scoreMinimo} · ${Math.round(REGLAS.acuerdoMinimo * 100)}% de acuerdo · ` +
    `piso ${REGLAS.pisoCritico} · contradice a ${REGLAS.distanciaContradice} de la mediana\n`
);

const partidos = await traerJornada(fecha, await mercadoDelDia(fecha));
console.log(`${partidos.length} partidos\n`);

const barra = (n: number | null) => {
  if (n === null) return "  —  sin datos";
  const llenos = Math.round(n / 10);
  return `${String(n).padStart(3)}  ${"█".repeat(llenos)}${"·".repeat(10 - llenos)}`;
};

const veredictos = partidos
  .flatMap(candidatosDe)
  .map((c) => ({ c, v: juzgar(c, MODELOS) }))
  .sort((a, b) => b.v.score - a.v.score);

const entran = veredictos.filter((x) => x.v.entra);

for (const { c, v } of veredictos) {
  if (!v.entra && !todos) continue;
  const marca = v.entra ? "🟢" : "  ";
  console.log(`${marca} ${nombreDe({ ...c }).padEnd(24)} ${String(v.score).padStart(3)}/100   ` +
    `${v.acuerdo}/${v.midieron} a favor · midieron ${v.midieron}/${v.total}`);
  console.log(`   ${c.partido.titulo.replace(" vs. ", " · ")}`);
  for (const d of v.detalle) {
    console.log(`      ${d.nombre.padEnd(16)} ${barra(d.score)}`);
    if (d.score !== null) for (const m of d.motivos) console.log(`         ${m}`);
  }
  if (!v.entra) console.log(`   ✗ ${v.motivoDescarte}`);
  console.log();
}

console.log("─".repeat(72));
console.log(`Entran ${entran.length} de ${veredictos.length} candidatos.`);

// El reparto de motivos de descarte dice si los umbrales están donde deben.
// Si todo se cae por "faltan datos", el problema no son las reglas.
const motivos: Record<string, number> = {};
for (const { v } of veredictos) {
  if (v.entra) continue;
  const clave = (v.motivoDescarte ?? "?").replace(/\d+/g, "N").replace(/^[A-ZÁÉÍÓÚ][a-záéíóú ]+ \(N\)/, "Un modelo");
  motivos[clave] = (motivos[clave] ?? 0) + 1;
}
console.log("\nPor qué se descartan:");
for (const [m, n] of Object.entries(motivos).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)} × ${m}`);
}

// Cuánto midió cada modelo: un modelo que casi nunca tiene datos hay que
// arreglarlo o sacarlo, porque su peso se reparte entre los demás y desdibuja
// la idea de "ocho medidas independientes".
console.log("\nCobertura de cada modelo:");
for (const m of MODELOS) {
  const n = veredictos.filter((x) => x.v.detalle.find((d) => d.id === m.id)?.score !== null).length;
  const pct = Math.round((n / veredictos.length) * 100);
  console.log(`  ${m.nombre.padEnd(16)} ${String(pct).padStart(3)}%  (peso ${m.peso})`);
}

// ---- Cómo le va al motor con lo ya guardado ----
//
// La comparación entre elegidos y descartados es LO ÚNICO que dice si el motor
// sirve. Un 62% de acierto entre los elegidos no significa nada si los
// descartados también ganaron el 62%.
try {
  const b = await balanceSenales();
  const pct = (g: { n: number; aciertos: number }) =>
    g.n === 0 ? "—" : `${((g.aciertos / g.n) * 100).toFixed(1)}%`;

  console.log("\n" + "─".repeat(72));
  if (b.elegidos.n + b.descartados.n === 0) {
    console.log("Todavía no hay señales resueltas: la comparación empieza mañana.");
  } else {
    console.log("Historial guardado:");
    console.log(`  elegidos     ${pct(b.elegidos)}  (${b.elegidos.aciertos} de ${b.elegidos.n})`);
    console.log(`  descartados  ${pct(b.descartados)}  (${b.descartados.aciertos} de ${b.descartados.n})`);
    const dif =
      b.elegidos.n && b.descartados.n
        ? (b.elegidos.aciertos / b.elegidos.n - b.descartados.aciertos / b.descartados.n) * 100
        : null;
    if (dif !== null) {
      console.log(
        `  diferencia   ${dif >= 0 ? "+" : ""}${dif.toFixed(1)} puntos` +
          (Math.abs(dif) < 5 ? "  ← todavía no dice nada" : "")
      );
    }
    const modelos = Object.entries(b.porModelo).sort((a, c) => c[1].n - a[1].n);
    if (modelos.length) {
      console.log("\n  Cuánto acierta cada modelo cuando se moja (score ≥ 65):");
      for (const [id, m] of modelos) {
        console.log(`    ${id.padEnd(16)} ${pct(m)}  (${m.aciertos} de ${m.n})`);
      }
    }
  }
} catch {
  console.log("\n(sin historial: falta correr el SQL de senales_dia)");
}
