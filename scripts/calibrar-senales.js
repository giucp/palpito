// ¿Por qué el motor no recomienda casi nada?
//
// Solo lectura: relee los candidatos ya guardados en `senales_dia` y vuelve a
// pasarlos por las puertas con distintos parámetros, para ver cuántos pasarían.
// No toca la base ni recalcula ningún modelo: usa el `detalle` jsonb que ya
// quedó guardado, que es exactamente lo que vieron los modelos ese día.
//
// Uso: node scripts/calibrar-senales.js
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** Las cuatro puertas, tal cual `motor.ts`, pero con los umbrales por parámetro. */
function puertas(cand, R, neutral) {
  const medidos = cand.detalle.filter((d) => d.score !== null);
  if (!medidos.length) return "sin datos";
  const scores = medidos.map((d) => d.score);
  const acuerdo = scores.filter((s) => s >= R.umbralAcuerdo).length;
  const opinaron = neutral
    ? scores.filter((s) => s >= R.umbralAcuerdo || s <= neutral).length
    : medidos.length;
  const med = mediana(scores);

  if (medidos.length / cand.detalle.length < R.cobertura) return "faltan datos";
  // `bajosParaDescartar` es la pregunta de fondo: ¿alcanza UN modelo en el
  // fondo para tumbar un candidato? Con normalización posicional, que un modelo
  // dé un valor extremo no es una alarma, es aritmética: `posicion()` devuelve
  // un percentil, así que por definición el 25% de los candidatos cae bajo 25
  // en CADA modelo. Con 4 modelos posicionales, salvarse de los cuatro tiene
  // una probabilidad de 0.75^4 = 32%.
  const nBajos = scores.filter((s) => s < R.pisoCritico).length;
  if (nBajos >= (R.bajosParaDescartar ?? 1)) return "piso critico";
  const nLejos = scores.filter((s) => med - s >= R.distanciaContradice).length;
  if (nLejos >= (R.lejosParaDescartar ?? 1)) return "contradice";
  if (opinaron === 0) return "todos neutrales";
  if (acuerdo / opinaron < R.acuerdoMinimo) return "poco acuerdo";
  if (cand.score < R.scoreMinimo) return "score bajo";
  return null; // entra
}

/**
 * El score global, pero como POSICIÓN dentro de la jornada.
 *
 * Es la corrección de fondo: el motor normaliza cada modelo por posición dentro
 * del día, pero después compara el **promedio** de esas posiciones contra un
 * número fijo. Un promedio de posiciones ya no es una posición — tiende al
 * centro — así que el 78 dejó de significar "top 22% del día".
 */
function conScorePosicional(cands) {
  const todos = cands.map((c) => c.score);
  return cands.map((c) => {
    const peores = todos.filter((v) => v < c.score).length;
    const iguales = todos.filter((v) => v === c.score).length;
    return { ...c, score: Math.round(((peores + iguales / 2) / todos.length) * 100) };
  });
}

const BASE = {
  scoreMinimo: 78,
  umbralAcuerdo: 55,
  acuerdoMinimo: 0.75,
  cobertura: 0.7,
  pisoCritico: 25,
  distanciaContradice: 30,
};

(async () => {
  const { data } = await sb.from("senales_dia").select("fecha,mercado,partido,equipo,score,detalle,entra");

  for (const merc of ["ganador", "total", "linea"]) {
    const cands = data.filter((d) => d.mercado === merc);
    if (!cands.length) continue;
    const neutral = merc === "total" ? 45 : 0;
    console.log(`\n======== ${merc.toUpperCase()} · ${cands.length} candidatos ========`);

    // El acuerdo "por dirección": un modelo cuenta a favor si apunta a este
    // lado (>50), no si supera 55. Con umbral en 50 la banda neutral de los
    // totales pierde sentido —existía porque un 51 contaba en contra, que era
    // la asimetría injusta— así que se prueba con y sin ella.
    const escenarios = [
      ["hoy (acuerdo >=55, 75%)", cands, BASE, neutral],
      ["direccion (>50), con banda neutral", cands, { ...BASE, umbralAcuerdo: 51 }, neutral],
      ["direccion (>50), sin banda neutral", cands, { ...BASE, umbralAcuerdo: 51 }, 0],
      ["direccion + piso 15", cands, { ...BASE, umbralAcuerdo: 51, pisoCritico: 15 }, 0],
      ["direccion + piso 15 + score 70", cands, { ...BASE, umbralAcuerdo: 51, pisoCritico: 15, scoreMinimo: 70 }, 0],
      ["--- y si un solo modelo en el fondo no alcanza para tumbar ---", cands, BASE, neutral],
      ["2 bajos para descartar", cands, { ...BASE, bajosParaDescartar: 2 }, neutral],
      ["2 bajos + 2 lejos", cands, { ...BASE, bajosParaDescartar: 2, lejosParaDescartar: 2 }, neutral],
      ["2 bajos + 2 lejos + direccion", cands, { ...BASE, bajosParaDescartar: 2, lejosParaDescartar: 2, umbralAcuerdo: 51 }, 0],
      ["2 bajos + 2 lejos + direccion + score posicional", conScorePosicional(cands), { ...BASE, bajosParaDescartar: 2, lejosParaDescartar: 2, umbralAcuerdo: 51 }, 0],
      ["--- solo para comparar ---", cands, BASE, neutral],
      ["score posicional (78 = top 22% del dia)", conScorePosicional(cands), BASE, neutral],
      ["solo bajar el piso a 10", cands, { ...BASE, pisoCritico: 10 }, neutral],
      ["solo bajar score a 65", cands, { ...BASE, scoreMinimo: 65 }, neutral],
    ];

    for (const [nombre, cs, R, neu] of escenarios) {
      if (nombre.startsWith("---")) {
        console.log(`  ${nombre}`);
        continue;
      }
      const motivos = {};
      let entran = 0;
      for (const c of cs) {
        const m = puertas(c, R, neu);
        if (m === null) entran++;
        else motivos[m] = (motivos[m] || 0) + 1;
      }
      const detalle = Object.entries(motivos)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ");
      console.log(`  ${String(entran).padStart(2)} entran  ${nombre.padEnd(40)} ${detalle}`);
    }
  }
})();
