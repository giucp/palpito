// ¿Es justo el reparto de Carta más alta?
//
// Acá hay dinero, así que no alcanza con que "parezca" aleatorio. Se comprueban
// tres cosas concretas:
//
//   1. Que ninguna de las dos posiciones sea mejor. Si quien crea el desafío
//      ganara más seguido que quien lo acepta, el juego estaría roto.
//   2. Que el empate ocurra lo que dice la teoría: 3/51 = 5,88%.
//   3. Que el barajado reparta parejo: cada figura debería salir 1/13 de las
//      veces en la primera carta.
//
// Uso: node scripts/probar-carta.ts

import { repartir, nuevaSemilla, FIGURAS } from "../src/lib/carta.ts";

const N = 500_000;

let ganaCreador = 0;
let ganaRival = 0;
let empates = 0;
const porFigura = new Map<string, number>();

for (let i = 0; i < N; i++) {
  const { creador, rival } = repartir(nuevaSemilla());
  if (creador.valor > rival.valor) ganaCreador++;
  else if (creador.valor < rival.valor) ganaRival++;
  else empates++;
  porFigura.set(creador.figura, (porFigura.get(creador.figura) ?? 0) + 1);
}

const pct = (n: number) => ((n / N) * 100).toFixed(3) + "%";
console.log(`${N.toLocaleString("es")} partidas simuladas\n`);
console.log("  gana quien crea :", pct(ganaCreador));
console.log("  gana el rival   :", pct(ganaRival));
console.log("  empate          :", pct(empates), " (teoría 5.882%)");

const sesgo = Math.abs(ganaCreador - ganaRival) / N;
console.log("\n  diferencia entre las dos posiciones:", (sesgo * 100).toFixed(3) + "%");
console.log(sesgo < 0.004 ? "  ✓ ninguna posición es mejor" : "  ✗ hay ventaja para uno de los dos");

console.log("\nReparto de figuras en la primera carta (esperado 7.692% cada una):");
const valores = FIGURAS.map((f) => ((porFigura.get(f) ?? 0) / N) * 100);
const peor = Math.max(...valores.map((v) => Math.abs(v - 100 / 13)));
console.log("  " + FIGURAS.map((f, i) => `${f}:${valores[i].toFixed(2)}`).join("  "));
console.log(
  peor < 0.35
    ? `  ✓ parejo (la que más se desvía lo hace en ${peor.toFixed(2)} puntos)`
    : `  ✗ desparejo: ${peor.toFixed(2)} puntos de desvío`
);

// El retorno del jugador con la comisión del 0,5% del pozo.
const COMISION = 0.005;
const rtp =
  (ganaCreador / N) * (2 - 2 * COMISION) + (empates / N) * (1 - COMISION);
console.log(`\n  Retorno del jugador: ${(rtp * 100).toFixed(3)}%  (comisión 0,5%)`);
