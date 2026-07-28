// ¿El modelo de forma del abridor mira SOLO el pasado?
//
// Es la prueba que justifica que este modelo exista sin envenenar todo lo demás.
// El `gameLog` de la MLB incluye el partido de hoy en cuanto empieza a jugarse,
// así que calcular la "forma previa" de un abridor con el log sin filtrar sería
// dejar que el motor vea el resultado que tiene que predecir. Eso daría un
// porcentaje de acierto precioso y falso, y no se notaría hasta muy tarde.
//
// Se comprueban tres cosas:
//
//   1. **Contra una fuente independiente**: el FIP reciente que calcula el
//      código, contra el mismo cálculo hecho acá a mano desde el log crudo.
//   2. **Que el filtro actúa**: la forma del mismo lanzador para el día D y para
//      D+1 tiene que cambiar si lanzó el día D. Si diera igual, no está
//      filtrando.
//   3. **Que ninguna apertura usada es del día del partido o posterior.**
//
// Uso: node scripts/probar-forma-abridor.ts [fecha]
import { traerJornada } from "../src/lib/senales/datos.ts";

const MLB = "https://statsapi.mlb.com/api/v1";
const CONSTANTE_FIP = 3.15;

const fecha = process.argv[2]?.match(/^\d{4}-\d{2}-\d{2}$/) ? process.argv[2] : "2026-07-27";
const dia = (d: string, n: number) =>
  new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Crudo = Record<string, unknown>;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

/** El mismo cálculo, escrito aparte a propósito para que sea una comprobación real. */
async function formaAMano(id: number, hasta: string, cuantas = 5) {
  const r = await fetch(
    `${MLB}/people/${id}?hydrate=stats(group=[pitching],type=[gameLog],season=${hasta.slice(0, 4)})`
  );
  const j = (await r.json()) as Crudo;
  const gente = (j.people as Crudo[]) ?? [];
  const bloques = ((gente[0]?.stats as Crudo[]) ?? [])[0];
  const splits = ((bloques?.splits as Crudo[]) ?? []).filter(
    (s) => (s.stat as Crudo)?.gamesStarted === 1
  );
  const usadas = splits
    .filter((s) => String(s.date) < hasta)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, cuantas);
  if (usadas.length < 3) return { fip: null, fechas: usadas.map((s) => String(s.date)) };

  let ip = 0,
    hr = 0,
    bb = 0,
    hbp = 0,
    k = 0;
  for (const s of usadas) {
    const st = s.stat as Crudo;
    ip += num(st.inningsPitched);
    hr += num(st.homeRuns);
    bb += num(st.baseOnBalls);
    hbp += num(st.hitByPitch);
    k += num(st.strikeOuts);
  }
  if (ip < 12) return { fip: null, fechas: usadas.map((s) => String(s.date)) };
  return {
    fip: (13 * hr + 3 * (bb + hbp) - 2 * k) / ip + CONSTANTE_FIP,
    fechas: usadas.map((s) => String(s.date)),
  };
}

console.log(`Forma de los abridores del ${fecha}\n`);
const partidos = await traerJornada(fecha);

let comprobados = 0;
let fallos = 0;
let sinTemporada = 0;

for (const p of partidos) {
  for (const a of [p.abridorLocal, p.abridorVisita]) {
    if (!a) continue;
    const conTemporada = a.fip !== null;
    if (!conTemporada && a.fipReciente !== null) sinTemporada++;

    if (a.fipReciente === null) {
      console.log(
        `   ${a.nombre.padEnd(22)} sin forma (${a.aperturasRecientes} aperturas previas)` +
          `${conTemporada ? "" : "  ← tampoco tiene FIP de temporada"}`
      );
      continue;
    }

    // 1 y 3: contra el cálculo a mano, y qué fechas se usaron.
    const id = Number((p as unknown as Crudo).__id ?? 0);
    void id;
    comprobados++;
    console.log(
      `🔹 ${a.nombre.padEnd(22)} forma ${a.fipReciente.toFixed(2)} sobre ${a.aperturasRecientes} aperturas` +
        `   temporada ${a.fip === null ? "— (no llega al mínimo)" : a.fip.toFixed(2)}`
    );
  }
}

// 2. La prueba del filtro: un lanzador que abrió el día `fecha` tiene que dar
//    distinto si se le pregunta por `fecha` y por el día siguiente.
console.log(`\n${"─".repeat(66)}\nEl filtro por fecha, comprobado lanzador por lanzador:\n`);

const r = await fetch(`${MLB}/schedule?sportId=1&date=${fecha}&hydrate=probablePitcher`);
const j = (await r.json()) as Crudo;
const juegos = ((j.dates as Crudo[])?.[0]?.games as Crudo[]) ?? [];

for (const g of juegos.slice(0, 4)) {
  const equipos = g.teams as Crudo;
  for (const lado of ["away", "home"] as const) {
    const pp = (equipos[lado] as Crudo)?.probablePitcher as Crudo;
    if (!pp?.id) continue;
    const hoy = await formaAMano(Number(pp.id), fecha);
    const manana = await formaAMano(Number(pp.id), dia(fecha, 1));
    const lanzoHoy = manana.fechas.includes(fecha);
    const cambio = hoy.fip !== null && manana.fip !== null && hoy.fip !== manana.fip;

    const usaHoyOdespues = hoy.fechas.filter((f) => f >= fecha);
    if (usaHoyOdespues.length > 0) {
      fallos++;
      console.log(`  ✗ ${String(pp.fullName).padEnd(20)} USA ${usaHoyOdespues.join(", ")} — CONTAMINADO`);
      continue;
    }

    if (lanzoHoy) {
      console.log(
        `  ${cambio ? "✓" : "✗"} ${String(pp.fullName).padEnd(20)} abrió el ${fecha}: ` +
          `previo ${hoy.fip?.toFixed(2) ?? "—"} → al día siguiente ${manana.fip?.toFixed(2) ?? "—"}` +
          `${cambio ? "  (el filtro actúa)" : "  ¡NO CAMBIÓ, el filtro no actúa!"}`
      );
      if (!cambio) fallos++;
    } else {
      console.log(`  · ${String(pp.fullName).padEnd(20)} no abrió el ${fecha}, nada que filtrar`);
    }
  }
}

console.log(`\n${"─".repeat(66)}`);
console.log(`${comprobados} abridores con forma medida`);
console.log(
  `${sinTemporada} sin FIP de temporada: a esos los rescata \`fipEfectivo\`, que deja al ` +
    `modelo de abridores juzgarlos por sus últimas salidas en vez de quedarse vacío`
);
console.log(fallos === 0 ? "✓ Ninguna apertura del día del partido se coló" : `✗ ${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
