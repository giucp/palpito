// ¿Los mercados que salen de Polymarket son los del partido?
//
// Este script existe por un candidato inventado: el motor recomendó "menos de
// 14.5 carreras" en un Orioles–Tigers. Un total de 14 carreras no existe en
// MLB. La causa eran tres cosas distintas, y las tres se comprueban acá:
//
//   1. **Precios que no son probabilidades.** En un partido ya jugado, los
//      mercados normales se resuelven a 0 o 1, y los que nadie operó se quedan
//      en 0.5 clavado. Como la línea principal se elegía por cercanía a 0.5, el
//      único mercado sin operar del evento ganaba siempre.
//   2. **Eventos satélite.** Del mismo partido cuelgan "- Player Props" y
//      "- First 5 Innings Winner", con los mismos dos equipos. Casaban con la
//      misma clave y se pisaban, y los props traen O/U de 0.5 y 1.5 que son
//      jonrones de un jugador, no carreras del partido.
//   3. **Apodos que colisionan.** Red Sox y White Sox terminan los dos en
//      "Sox": la clave de un Boston–Chicago daba `sox|sox`.
//
// Uso: node scripts/probar-mercados.ts [fecha]
import { traerPartidosDelDia, clavePartido } from "../src/lib/mercado-mlb.ts";

const fecha = process.argv[2]?.match(/^\d{4}-\d{2}-\d{2}$/)
  ? process.argv[2]
  : new Date().toISOString().slice(0, 10);

console.log(`Mercados del ${fecha}\n`);
const partidos = await traerPartidosDelDia(fecha);
let fallos = 0;

// --- 1. Ninguna línea fuera del rango de un partido de béisbol ---
console.log("Totales que salieron:");
for (const p of partidos) {
  if (!p.over || !p.under) {
    console.log(`   ${p.titulo.padEnd(44)} sin total`);
    continue;
  }
  const mal = p.over.linea < 5.5 || p.over.linea > 13.5;
  if (mal) fallos++;
  console.log(
    `${mal ? " ✗" : " ·"} ${p.titulo.padEnd(44)} O/U ${String(p.over.linea).padStart(5)}` +
      `   menos ${p.under.p.toFixed(3)} · más ${p.over.p.toFixed(3)}`
  );
  // Los dos lados de un total tienen que sumar cerca de 1. Si no, son de
  // mercados distintos y se mezclaron.
  const suma = p.over.p + p.under.p;
  if (suma < 0.9 || suma > 1.15) {
    fallos++;
    console.log(`      ✗ los dos lados suman ${suma.toFixed(3)}: no son del mismo mercado`);
  }
}

// --- 2. Un partido, un id ---
//
// Que dos partidos compartan el par de apodos es legítimo: es una doble
// jornada, los mismos equipos jugando dos veces el mismo día. Lo que NO puede
// pasar es que compartan `gamePk`, porque entonces uno de los dos se está
// llevando la línea y el resultado del otro.
console.log(`\n${"─".repeat(60)}\nUn partido, un id:`);
const porApodo = new Map<string, typeof partidos>();
for (const p of partidos) {
  const k = clavePartido(p.visita, p.local);
  porApodo.set(k, [...(porApodo.get(k) ?? []), p]);
}
for (const [k, ps] of porApodo) {
  if (ps.length > 1) {
    const ids = ps.map((p) => p.juego);
    const repetido = new Set(ids).size !== ids.length || ids.some((x) => !x);
    if (repetido) fallos++;
    console.log(
      `  ${repetido ? "✗" : "·"} ${k}: doble jornada, ${ps.length} partidos → ids ${ids.join(", ")}` +
        `${repetido ? "  ¡REPETIDO O VACÍO!" : "  (distintos, bien)"}`
    );
    for (const p of ps) console.log(`      ${p.hora}  O/U ${p.over?.linea ?? "—"}`);
  }
}
const ids = partidos.map((p) => p.juego).filter(Boolean);
if (new Set(ids).size !== ids.length) {
  fallos++;
  console.log("  ✗ hay gamePk repetidos entre partidos distintos");
}
const satelites = partidos.filter((p) => / - /.test(p.titulo));
if (satelites.length) {
  fallos++;
  console.log(`  ✗ ${satelites.length} eventos satélite se colaron: ${satelites.map((p) => p.titulo).join(", ")}`);
}
console.log(`  ✓ ${ids.length} de ${partidos.length} partidos casados con la cartelera, todos con id único`);

// --- 3. Los dos Sox no son el mismo equipo ---
console.log(`\n${"─".repeat(60)}\nLos apodos que colisionan:`);
const red = clavePartido("Boston Red Sox", "New York Yankees");
const white = clavePartido("Chicago White Sox", "New York Yankees");
const duelo = clavePartido("Boston Red Sox", "Chicago White Sox");
console.log(`  Red Sox   → ${red}`);
console.log(`  White Sox → ${white}`);
console.log(`  Sox v Sox → ${duelo}`);
if (red === white) {
  fallos++;
  console.log("  ✗ Red Sox y White Sox dan la misma clave");
} else if (/^(\w+)\|\1$/.test(duelo)) {
  fallos++;
  console.log("  ✗ Un Red Sox–White Sox da los dos lados iguales");
} else {
  console.log("  ✓ Se distinguen");
}

console.log(`\n${"─".repeat(60)}`);
console.log(fallos === 0 ? "✓ Todo limpio" : `✗ ${fallos} problemas`);
process.exit(fallos === 0 ? 0 : 1);
