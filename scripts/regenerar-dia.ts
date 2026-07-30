// Vuelve a calcular la jornada de un día, con el código de AHORA.
//
// Hace falta cuando se cambia una regla del motor y el día todavía no se jugó:
// las filas guardadas llevan el `entra` de la regla vieja, y curar o validar
// contra eso mide un motor que ya no existe.
//
// **Se niega a tocar un día que tenga curado o resultados.** Regenerar eso sería
// reescribir historia: el pick guardado antes del partido es lo único que hace
// válida la validación, y el curado es trabajo que no se recupera.
//
// Uso: node scripts/regenerar-dia.ts <fecha> [--escribir]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] = v as string;

const { crearClienteAdmin } = await import("../src/lib/supabase/admin.ts");
const { guardarSenales, mercadoDelDia } = await import("../src/lib/senales/guardar.ts");

const fecha = process.argv[2];
if (!fecha?.match(/^\d{4}-\d{2}-\d{2}$/)) {
  console.log("Uso: node scripts/regenerar-dia.ts 2026-07-30 [--escribir]");
  process.exit(1);
}
const escribir = process.argv.includes("--escribir");
const sb = crearClienteAdmin();

const { data: viejas } = await sb
  .from("senales_dia")
  .select("id, entra, curado, gano, resuelto_at")
  .eq("fecha", fecha);

const conCurado = (viejas ?? []).filter((f) => f.curado !== null).length;
const conResultado = (viejas ?? []).filter((f) => f.gano !== null || f.resuelto_at).length;
console.log(`El ${fecha} tiene ${viejas?.length ?? 0} filas: ${conCurado} curadas, ${conResultado} con resultado`);

if (conCurado || conResultado) {
  console.log("\n✗ NO se regenera: hay curado o resultados. Reescribirlo invalidaría la serie.");
  process.exit(1);
}
console.log(`  verdes con la regla vieja: ${(viejas ?? []).filter((f) => f.entra).length}`);

if (!escribir) {
  console.log("\nNada escrito. Corré con --escribir para borrar y regenerar.");
  process.exit(0);
}

const { error } = await sb.from("senales_dia").delete().eq("fecha", fecha);
if (error) {
  console.log("error al borrar:", error.message);
  process.exit(1);
}
console.log("\nborradas. Recalculando…");
const r = await guardarSenales(fecha, () => mercadoDelDia(fecha));
console.log(JSON.stringify(r, null, 2));

const { data: nuevas } = await sb.from("senales_dia").select("entra").eq("fecha", fecha);
console.log(`\nahora: ${nuevas?.length ?? 0} candidatos, ${(nuevas ?? []).filter((f) => f.entra).length} en verde`);
