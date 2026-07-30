// ¿Tiene sentido una familia para los no favoritos?
//
// Explora, no decide. Reprocesa lo ya guardado en `senales_dia` sin recalcular
// ningún modelo, así que compara peras con peras y cuesta una tarde en vez de una
// temporada.
//
// **Esto NO es un backtest de los prohibidos.** Los prohibidos usan estadísticas
// de temporada de hoy sobre partidos viejos, y por eso están contaminados: las
// estadísticas ya incluyen el partido que se está "prediciendo". Acá se releen
// señales congeladas, con los números que el motor tenía delante ese día.
//
// **Pero sí es generación de hipótesis, no evidencia.** Cualquier porcentaje que
// salga de acá se encontró mirando resultados, y eso ya nos engañó dos veces (la
// del ambiente en run line iba 3-1 con cuatro casos y murió con cuarenta y dos).
// La familia solo se juzga con lo que recomiende HACIA ADELANTE.
//
// Uso: node scripts/explorar-hembras.ts
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

type Det = { id: string; nombre: string; score: number | null };
type Fila = {
  fecha: string;
  equipo: string;
  partido: string;
  entra: boolean;
  gano: boolean | null;
  score: number;
  detalle: Det[];
};

const { data } = await sb
  .from("senales_dia")
  .select("fecha, equipo, partido, entra, gano, score, detalle")
  .eq("mercado", "ganador")
  .limit(10000);

const filas = (data ?? []) as Fila[];

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const puntos = (f: Fila) => f.detalle.filter((d) => d.score !== null).map((d) => d.score as number);
const precio = (f: Fila) => {
  const m = f.detalle.find((d) => d.id === "mercado");
  return m && m.score !== null ? m.score : null;
};
/** Sin el modelo de mercado: es el eje de la familia, no uno de los votos. */
const sinMercado = (f: Fila) =>
  f.detalle.filter((d) => d.id !== "mercado" && d.score !== null).map((d) => d.score as number);

const conPrecio = filas.filter((f) => precio(f) !== null);
console.log(`GANADOR · ${filas.length} candidatos, ${conPrecio.length} con precio de mercado\n`);

// ---------------------------------------------------------------- 1. las puertas
//
// "37 de 49 caen por piso o contradice" no dice cuántos por cada una. Sin eso no
// se puede decidir qué puerta tocar.
const noFav = conPrecio.filter((f) => precio(f)! < 50);
console.log(`═══ 1. LOS ${noFav.length} NO FAVORITOS: ¿qué puerta los tumba? ═══\n`);

let soloPiso = 0,
  soloContra = 0,
  lasDos = 0,
  ninguna = 0;
for (const f of noFav) {
  const ss = puntos(f);
  if (ss.length < 3) continue;
  const med = mediana(ss);
  const p = ss.filter((s) => s < 25).length >= 2;
  const c = ss.filter((s) => med - s >= 30).length >= 1;
  if (p && c) lasDos++;
  else if (p) soloPiso++;
  else if (c) soloContra++;
  else ninguna++;
}
console.log(`  solo el PISO (2 bajo 25):        ${soloPiso}`);
console.log(`  solo CONTRADICE (1 a 30+):       ${soloContra}`);
console.log(`  las dos:                         ${lasDos}`);
console.log(`  ninguna de las dos:              ${ninguna}`);

// ---------------------------------------------------------- 2. el relevo
//
// Las puertas están en cadena: la lección del 27/07 fue que aflojar una hace que
// tome el relevo la siguiente. Acá se apagan piso y contradice y se mira dónde
// mueren ahora. La apuesta de Fable 5: la puerta de acuerdo.
console.log(`\n═══ 2. SI SE APAGAN PISO Y CONTRADICE, ¿QUÉ TOMA EL RELEVO? ═══\n`);
const relevo: Record<string, number> = {};
for (const f of noFav) {
  const ss = puntos(f);
  if (ss.length < 3) continue;
  let motivo = "ENTRARÍA";
  if (ss.length / f.detalle.length < 0.7) motivo = "cobertura (<70%)";
  else if (ss.filter((s) => s >= 51).length / ss.length < 0.75) motivo = "acuerdo (75% sobre 51)";
  else if (f.score < 78) motivo = "score / percentil de jornada";
  relevo[motivo] = (relevo[motivo] ?? 0) + 1;
}
for (const [k, v] of Object.entries(relevo).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}

// -------------------------------------------- 3. las reglas de la familia nueva
//
// Banda 35-47 · cobertura 70% · mediana sin mercado >= 50 · contradice · tope 2/día.
const BANDA = [35, 47];
const admite = (f: Fila) => {
  const pr = precio(f);
  if (pr === null || pr < BANDA[0] || pr > BANDA[1]) return false;
  const ss = puntos(f);
  if (ss.length / f.detalle.length < 0.7) return false;
  const sm = sinMercado(f);
  if (sm.length < 3) return false;
  if (mediana(sm) < 50) return false;
  // Contradice se conserva, medido sobre los modelos sin el mercado.
  const med = mediana(sm);
  if (sm.filter((s) => med - s >= 30).length >= 1) return false;
  return true;
};

console.log(`\n═══ 3. LA FAMILIA PROPUESTA, SOBRE LO YA GUARDADO ═══\n`);
const porDia = new Map<string, Fila[]>();
for (const f of conPrecio.filter(admite)) {
  porDia.set(f.fecha, [...(porDia.get(f.fecha) ?? []), f]);
}

const elegidas: Fila[] = [];
for (const [fecha, fs] of [...porDia].sort()) {
  // Tope de 2 por día, las de mediana más alta.
  const orden = fs.sort((a, b) => mediana(sinMercado(b)) - mediana(sinMercado(a))).slice(0, 2);
  elegidas.push(...orden);
  for (const f of orden) {
    console.log(
      `  ${fecha}  ${f.equipo.padEnd(24)} precio ${precio(f)}  mediana ${mediana(sinMercado(f))
        .toFixed(0)
        .padStart(2)}  ` +
        `${f.gano === null ? "sin resultado" : f.gano ? "GANÓ  " : "perdió"}` +
        `${f.entra ? "   (el motor ya la recomendaba)" : ""}`
    );
  }
}
if (!elegidas.length) console.log("  ninguna. El diseño falló en su único trabajo.");

// ------------------------------------------------- 4. la vara: victorias vs Σp
//
// La vara no es 50% ni un número fijo: es lo que el propio mercado esperaba de
// estos mismos picks. Es el único lugar donde el precio se usa como probabilidad,
// y es legítimo porque es la probabilidad de él, no una inventada.
const resueltas = elegidas.filter((f) => f.gano !== null);
if (resueltas.length) {
  const sumaP = resueltas.reduce((a, f) => a + precio(f)! / 100, 0);
  const sigma = Math.sqrt(
    resueltas.reduce((a, f) => {
      const p = precio(f)! / 100;
      return a + p * (1 - p);
    }, 0)
  );
  const ganadas = resueltas.filter((f) => f.gano).length;
  console.log(`\n═══ 4. LA VARA: VICTORIAS CONTRA LO QUE EL PRECIO ESPERABA ═══\n`);
  console.log(`  picks resueltos:        ${resueltas.length}`);
  console.log(`  el mercado esperaba:    ${sumaP.toFixed(1)} victorias  (σ ≈ ${sigma.toFixed(1)})`);
  console.log(`  salieron:               ${ganadas}`);
  const z = sigma > 0 ? (ganadas - sumaP) / sigma : 0;
  console.log(`  diferencia:             ${(ganadas - sumaP).toFixed(1)}  (${z.toFixed(1)} σ)`);
  console.log(
    `\n  ${
      Math.abs(z) < 2
        ? "Dentro del ruido, como corresponde con esta cantidad. No dice nada."
        : "Fuera de 2σ, pero OJO: esto se encontró mirando resultados."
    }`
  );

  // Y el control: las de la banda que la familia NO admite.
  const control = conPrecio.filter(
    (f) => precio(f)! >= BANDA[0] && precio(f)! <= BANDA[1] && !admite(f) && f.gano !== null
  );
  if (control.length) {
    const cp = control.reduce((a, f) => a + precio(f)! / 100, 0);
    const cg = control.filter((f) => f.gano).length;
    console.log(
      `\n  CONTROL · las ${control.length} de la misma banda que la familia descarta:` +
        `\n    el mercado esperaba ${cp.toFixed(1)}, salieron ${cg}  (${(cg - cp).toFixed(1)})`
    );
    console.log(
      "    Si el control va igual o mejor, el filtro no separa nada aunque la banda ande bien."
    );
  }
}
