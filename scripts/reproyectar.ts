// ¿La proyección espejo arregla lo que decía arreglar?
//
// Relee los candidatos guardados, les aplica `proyectarPar` emparejando por
// `gamePk`, vuelve a pasar las puertas y compara el antes con el después.
//
// **Esto se puede hacer porque la proyección solo necesita los scores por modelo
// de los dos candidatos del partido**, y el `detalle` jsonb los tiene. No hace
// falta volver a pedirle nada a la MLB — y no habría que hacerlo: las
// estadísticas de temporada ya se movieron, así que regenerar sería el backtest
// contaminado de siempre.
//
// La transformación de acá y la que hace el motor en vivo son **idénticas**, así
// que la serie vieja y la nueva quedan en la misma escala.
//
// Uso: node scripts/reproyectar.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { proyectarPar, type Medicion } from "../src/lib/senales/motor.ts";
import { MODELOS } from "../src/lib/senales/modelos.ts";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

type Det = { id: string; nombre: string; score: number | null; motivos: string[] };
type Fila = {
  id: string;
  fecha: string;
  juego: string;
  equipo: string;
  entra: boolean;
  gano: boolean | null;
  score: number;
  detalle: Det[];
};

const { data } = await sb
  .from("senales_dia")
  .select("id, fecha, juego, equipo, entra, gano, score, detalle")
  .eq("mercado", "ganador")
  .limit(10000);
const filas = (data ?? []) as Fila[];

// El peso vive en los modelos, no en lo guardado.
const peso = new Map(MODELOS.map((m) => [m.id, m.peso]));
const aMedicion = (d: Det[]): Medicion[] =>
  d.map((x) => ({ ...x, peso: peso.get(x.id) ?? 10 }));

// ---- proyectar cada par ----
const porJuego = new Map<string, Fila[]>();
for (const f of filas) porJuego.set(`${f.fecha}|${f.juego}`, [...(porJuego.get(`${f.fecha}|${f.juego}`) ?? []), f]);

const nuevo = new Map<string, { detalle: Medicion[]; score: number; calidad: number | null }>();
for (const grupo of porJuego.values()) {
  if (grupo.length !== 2) continue;
  const r = proyectarPar(aMedicion(grupo[0].detalle), aMedicion(grupo[1].detalle));
  const cal = r.calidad.length
    ? Math.round(r.calidad.reduce((a, x) => a + x.sobre, 0) / r.calidad.length)
    : null;
  for (const [i, det] of [r.a, r.b].entries()) {
    const medidos = det.filter((x) => x.score !== null);
    const pt = medidos.reduce((a, x) => a + x.peso, 0);
    const sc = pt
      ? Math.round(medidos.reduce((a, x) => a + (x.score as number) * x.peso, 0) / pt)
      : 0;
    nuevo.set(grupo[i].id, { detalle: det, score: sc, calidad: cal });
  }
}

console.log(`${filas.length} candidatos de ganador · ${porJuego.size} partidos\n`);

// ---- 1. el invariante ----
let peor = 0;
for (const grupo of porJuego.values()) {
  if (grupo.length !== 2) continue;
  const a = nuevo.get(grupo[0].id),
    b = nuevo.get(grupo[1].id);
  if (a && b) peor = Math.max(peor, Math.abs(a.score + b.score - 100));
}
console.log(`═══ 1. EL INVARIANTE ═══`);
console.log(`  antes:   los dos scores de un partido sumaban entre 82 y 118`);
console.log(`  ahora:   el desvío máximo respecto de 100 es ${peor}${peor <= 1 ? "   (redondeo)" : ""}`);

// ---- 2. ¿se achata la asociación con la calidad del partido? ----
//
// Antes la calidad estaba DENTRO del score, así que se medía por la suma. Ahora
// la suma da 100 siempre, y la calidad se lee del valor proyectado aparte.
// (se imprime más abajo, después de calcular los verdes nuevos)

// ---- 3. las puertas sobre lo proyectado ----
const REG = { cobertura: 0.7, piso: 25, bajos: 2, dist: 30, lejos: 1, acuerdo: 0.75, umbral: 51 };
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const juzgarProy = (det: Medicion[]) => {
  const ss = det.filter((d) => d.score !== null).map((d) => d.score as number);
  if (!ss.length || ss.length / det.length < REG.cobertura) return "faltan datos";
  const med = mediana(ss);
  if (ss.filter((s) => s < REG.piso).length >= REG.bajos) return "piso";
  if (ss.filter((s) => med - s >= REG.dist).length >= REG.lejos) return "contradice";
  if (ss.filter((s) => s >= REG.umbral).length / ss.length < REG.acuerdo) return "poco acuerdo";
  return null;
};

const veredictos = new Map<string, string | null>();
for (const [id, v] of nuevo) veredictos.set(id, juzgarProy(v.detalle));
// La puerta de score, por jornada, sobre los scores nuevos.
const porFecha = new Map<string, Fila[]>();
for (const f of filas) if (nuevo.has(f.id)) porFecha.set(f.fecha, [...(porFecha.get(f.fecha) ?? []), f]);
const verdesNuevos = new Set<string>();
for (const [, fs] of porFecha) {
  const todos = fs.map((f) => nuevo.get(f.id)!.score);
  for (const f of fs) {
    if (veredictos.get(f.id) !== null) continue;
    const s = nuevo.get(f.id)!.score;
    const pos = Math.round(
      ((todos.filter((x) => x < s).length + todos.filter((x) => x === s).length / 2) / todos.length) * 100
    );
    if (pos >= 78) verdesNuevos.add(f.id);
  }
}

// ---- 2. la prueba de fondo: ¿se achata la asociación con la calidad? ----
//
// Es LA verificación del arreglo. Antes, un partido entre dos equipos buenos
// producía un verde el 56% de las veces y uno entre dos flojos, nunca. Si la
// proyección hizo lo que dice, esa asociación tiene que desaparecer.
console.log(`\n═══ 2. ¿LOS VERDES SIGUEN ATADOS A LA CALIDAD DEL PARTIDO? ═══`);
console.log(`  calidad del partido        partidos   con verde ANTES   con verde AHORA`);
const conCal = [...porJuego.values()]
  .filter((g) => g.length === 2 && nuevo.has(g[0].id))
  .map((g) => ({ cal: nuevo.get(g[0].id)!.calidad ?? 0, g }));

for (const [lo, hi, et] of [
  [-99, -5, "flojo    (< -5)"],
  [-5, 5, "normal   (-5 a +5)"],
  [5, 99, "bueno    (> +5)"],
] as Array<[number, number, string]>) {
  const gs = conCal.filter((x) => x.cal >= lo && x.cal < hi);
  if (!gs.length) continue;
  const antes = gs.filter((x) => x.g.some((f) => f.entra)).length;
  const ahora = gs.filter((x) => x.g.some((f) => verdesNuevos.has(f.id))).length;
  const p = (n: number) => `${n} (${Math.round((100 * n) / gs.length)}%)`;
  console.log(
    `  ${et.padEnd(26)} ${String(gs.length).padStart(3)}   ${p(antes).padStart(15)}   ${p(ahora).padStart(15)}`
  );
}

console.log(`\n═══ 3. LOS VERDES: ANTES Y AHORA ═══`);
console.log(`  antes: ${filas.filter((f) => f.entra).length}    ahora: ${verdesNuevos.size}`);
const seMantienen = filas.filter((f) => f.entra && verdesNuevos.has(f.id)).length;
console.log(
  `  de los ${filas.filter((f) => f.entra).length} viejos, ${seMantienen} siguen siendo verdes y ` +
    `${filas.filter((f) => f.entra).length - seMantienen} se caen; entran ${verdesNuevos.size - seMantienen} nuevos`
);

// ---- 4. la tabla que motivó todo: por tramo de precio ----
const precio = (f: Fila) => {
  const m = f.detalle.find((d) => d.id === "mercado");
  return m && m.score !== null ? m.score : null;
};
console.log(`\n═══ 4. ¿EL MOTOR YA PUEDE VER NO FAVORITOS? ═══`);
console.log(`  tramo de precio          candidatos   verdes antes   verdes ahora`);
for (const [a, b, et] of [
  [0, 35, "no favorito claro <35"],
  [35, 50, "no favorito 35-50"],
  [50, 60, "favorito leve 50-60"],
  [60, 101, "favorito claro >60"],
] as Array<[number, number, string]>) {
  const g = filas.filter((f) => {
    const p = precio(f);
    return p !== null && p >= a && p < b && nuevo.has(f.id);
  });
  if (!g.length) continue;
  console.log(
    `  ${et.padEnd(24)} ${String(g.length).padStart(5)}   ${String(g.filter((f) => f.entra).length).padStart(11)}   ${String(g.filter((f) => verdesNuevos.has(f.id)).length).padStart(12)}`
  );
}
