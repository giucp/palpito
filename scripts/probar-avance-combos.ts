// ¿Se guarda el avance de un combo antes de que termine el último partido?
//
// El fallo que arregla: `resolverCombosPendientes` calculaba el resultado de
// cada pata y, si al combo le faltaba algún partido, se iba con un `continue`
// que tiraba ese trabajo. La tarjeta no marcaba nada hasta que terminaba el
// último partido del combo, aunque uno de sus partidos hubiera terminado horas
// antes.
//
// Uso: node scripts/probar-avance-combos.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] = v as string;

const { resolverCombosPendientes } = await import("../src/lib/combos-resultado.ts");
const { crearClienteAdmin } = await import("../src/lib/supabase/admin.ts");

const sb = crearClienteAdmin();
const HOY = new Date().toISOString().slice(0, 10);

type Pata = { pick: string; juego?: string; acerto?: boolean | null };
type Fila = { nombre: string; patas: Pata[]; resuelto_at: string | null };

async function mirar(momento: string) {
  const { data } = await sb
    .from("combos_dia")
    .select("nombre, patas, resuelto_at")
    .eq("fecha", HOY)
    .order("nombre");
  let marcadas = 0;
  const filas = (data ?? []) as Fila[];
  for (const c of filas) {
    for (const p of c.patas ?? []) if (p.acerto === true || p.acerto === false) marcadas++;
  }
  console.log(`${momento}: ${marcadas} patas marcadas, ${filas.filter((c) => c.resuelto_at).length} combos cerrados`);
  return filas;
}

console.log(`Combos del ${HOY}\n`);
await mirar("ANTES ");
const resumen = await resolverCombosPendientes();
console.log(`\ncorrida: ${JSON.stringify(resumen)}\n`);
const despues = await mirar("DESPUÉS");

console.log("\n--- patas ya decididas ---");
for (const c of despues) {
  for (const p of c.patas ?? []) {
    if (p.acerto === true || p.acerto === false) {
      console.log(`  ${c.nombre.padEnd(22)} ${p.pick.padEnd(34)} ${p.acerto ? "PEGÓ" : "falló"}`);
    }
  }
}

// Lo que no puede pasar: que se cierre un combo al que todavía le faltan
// partidos. El avance se guarda, pero `resuelto_at` se toca solo al final.
const malCerrado = despues.find(
  (c) => c.resuelto_at && (c.patas ?? []).some((p) => p.acerto === null || p.acerto === undefined)
);
console.log(
  malCerrado
    ? `\n⚠ MAL: "${malCerrado.nombre}" quedó cerrado con patas sin decidir`
    : "\n✓ Ningún combo se cerró antes de tiempo"
);
