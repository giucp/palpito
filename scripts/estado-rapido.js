// Solo lectura: mira qué hay realmente en la base de Pálpito.
// Uso: node scripts/estado-rapido.js
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

const TABLAS = [
  "perfiles",
  "movimientos",
  "eventos",
  "desafios",
  "apuestas_abiertas",
  "combos_dia",
  "senales_dia",
];

(async () => {
  console.log("=== TABLAS ===");
  for (const t of TABLAS) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(`${t.padEnd(20)} ${error ? "NO / " + error.message.slice(0, 50) : count + " filas"}`);
  }

  console.log("\n=== SEÑALES POR DÍA Y MERCADO ===");
  const { data: sen, error: e1 } = await sb
    .from("senales_dia")
    .select("fecha, mercado, entra, curado, gano, resuelto_at")
    .order("fecha", { ascending: false })
    .limit(1000);
  if (e1) console.log("error:", e1.message);
  else if (!sen.length) console.log("(vacía)");
  else {
    const por = {};
    for (const s of sen) {
      const k = `${s.fecha} · ${s.mercado || "(sin mercado)"}`;
      por[k] = por[k] || { total: 0, motor: 0, aprobados: 0, quitados: 0, resueltos: 0 };
      por[k].total++;
      if (s.entra) por[k].motor++;
      if (s.curado === true) por[k].aprobados++;
      if (s.curado === false) por[k].quitados++;
      if (s.resuelto_at) por[k].resueltos++;
    }
    for (const [k, v] of Object.entries(por))
      console.log(
        `${k.padEnd(28)} ${String(v.total).padStart(3)} candidatos · motor recomienda ${v.motor} · curado +${v.aprobados}/-${v.quitados} · ${v.resueltos} resueltos`
      );
  }

  console.log("\n=== COMBOS POR DÍA ===");
  const { data: com, error: e2 } = await sb
    .from("combos_dia")
    .select("fecha, acerto, resuelto_at")
    .order("fecha", { ascending: false })
    .limit(100);
  if (e2) console.log("error:", e2.message);
  else if (!com.length) console.log("(vacía)");
  else {
    const por = {};
    for (const c of com) {
      por[c.fecha] = por[c.fecha] || { total: 0, resueltos: 0, pego: 0 };
      por[c.fecha].total++;
      if (c.resuelto_at) por[c.fecha].resueltos++;
      if (c.acerto === true) por[c.fecha].pego++;
    }
    for (const [k, v] of Object.entries(por))
      console.log(`${k}   ${v.total} combos · ${v.resueltos} resueltos · ${v.pego} pegaron`);
  }

  // Se llaman sin argumentos a propósito. Ojo con el mensaje: PostgREST dice
  // "without parameters" cuando la función SÍ existe pero pide argumentos, y
  // "in the schema cache" a secas cuando de verdad no está. Confundir los dos
  // hace que todas las funciones con parámetros se reporten como ausentes.
  console.log("\n=== FUNCIONES CLAVE ===");
  for (const fn of [
    "crear_apuesta_libre",
    "aceptar_apuesta_libre",
    "declarar_apuesta",
    "liquidar_libre",
    "vencer_apuestas_libres",
    "vencer_desafios_de_juego",
    "admin_resumen",
    "admin_usuarios",
    "anular_evento",
  ]) {
    const { error } = await sb.rpc(fn, {});
    const falta = error && !/without parameters/i.test(error.message) &&
      /Could not find the function/i.test(error.message);
    console.log(`${fn.padEnd(28)} ${falta ? "NO EXISTE" : "existe"}`);
  }
})();
