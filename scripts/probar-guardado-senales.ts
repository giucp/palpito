// Ejecuta el camino real de `guardarSenales` sin escribir nada.
//
// Se le pasa un día que YA está guardado: la función calcula la jornada entera
// —que es lo que interesa comprobar— y recién al final descarta las filas
// porque la fecha ya estaba. Así se prueba el cálculo de verdad, el mismo que
// corre en producción, sin ensuciar la tabla ni pisar el curado manual.
//
// Uso: node scripts/probar-guardado-senales.ts [fecha]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] = v as string;

const { guardarSenales } = await import("../src/lib/senales/guardar.ts");

const fecha = process.argv[2]?.match(/^\d{4}-\d{2}-\d{2}$/)
  ? process.argv[2]
  : new Date().toISOString().slice(0, 10);

console.log(`Corriendo el guardado del ${fecha}…`);
const r = await guardarSenales(fecha);
console.log(JSON.stringify(r, null, 2));

if (r.motivo === "ya_estaba") {
  console.log("\n✓ Calculó la jornada entera y no escribió nada: la fecha ya estaba guardada.");
} else if (r.guardados > 0) {
  console.log(`\n⚠ Escribió ${r.guardados} filas. Si era una prueba, la fecha no estaba guardada.`);
}
